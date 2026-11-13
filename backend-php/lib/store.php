<?php
// JSON-file backed data store.
//
// The Node version serialised every read/write through an in-process promise
// queue. That does not exist in PHP: each request is its own process, so the
// queue is replaced by advisory file locking (flock) around a single open file
// handle. Reads take a shared lock, writes take an exclusive lock and truncate
// in place, so two concurrent requests can never interleave and corrupt a
// collection. Writes are flushed and verified before the lock is released.

declare(strict_types=1);

final class JsonStore
{
    private string $filePath;

    /** @var mixed */
    private $defaultValue;

    public function __construct(string $filePath, $defaultValue)
    {
        $this->filePath = $filePath;
        $this->defaultValue = $defaultValue;

        $dir = dirname($filePath);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create data directory: {$dir}");
        }
        if (!is_file($filePath)) {
            $this->write($defaultValue);
        }
    }

    public function read()
    {
        $handle = @fopen($this->filePath, 'rb');
        if ($handle === false) {
            return $this->defaultValue;
        }

        try {
            if (!flock($handle, LOCK_SH)) {
                return $this->defaultValue;
            }
            $raw = stream_get_contents($handle);
            flock($handle, LOCK_UN);
        } finally {
            fclose($handle);
        }

        if ($raw === false || trim($raw) === '') {
            return $this->defaultValue;
        }

        $decoded = json_decode($raw, true);
        if ($decoded === null && strtolower(trim($raw)) !== 'null') {
            error_log("Store read error ({$this->filePath}): invalid JSON");
            return $this->defaultValue;
        }

        return $decoded;
    }

    /** @param mixed $data */
    public function write($data): void
    {
        $handle = @fopen($this->filePath, 'c+b');
        if ($handle === false) {
            throw new RuntimeException("Cannot open store for writing: {$this->filePath}");
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException("Cannot lock store for writing: {$this->filePath}");
            }
            $this->writeLocked($handle, $data);
            flock($handle, LOCK_UN);
        } finally {
            fclose($handle);
        }
    }

    /**
     * Read-modify-write inside one exclusive lock: no other request can read a
     * stale value between the read and the write.
     *
     * @param callable(mixed):mixed $mutator
     * @return mixed the value written
     */
    public function update(callable $mutator)
    {
        $handle = @fopen($this->filePath, 'c+b');
        if ($handle === false) {
            throw new RuntimeException("Cannot open store for writing: {$this->filePath}");
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException("Cannot lock store for writing: {$this->filePath}");
            }

            $raw = stream_get_contents($handle);
            $current = $this->defaultValue;
            if (is_string($raw) && trim($raw) !== '') {
                $decoded = json_decode($raw, true);
                if ($decoded !== null || strtolower(trim($raw)) === 'null') {
                    $current = $decoded;
                }
            }

            $next = $mutator($current);
            $this->writeLocked($handle, $next);
            flock($handle, LOCK_UN);

            return $next;
        } finally {
            fclose($handle);
        }
    }

    /** @param resource $handle @param mixed $data */
    private function writeLocked($handle, $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new RuntimeException('Cannot encode store data as JSON: ' . json_last_error_msg());
        }

        rewind($handle);
        if (!ftruncate($handle, 0)) {
            throw new RuntimeException("Cannot truncate store: {$this->filePath}");
        }
        $written = fwrite($handle, $json);
        if ($written === false || $written !== strlen($json)) {
            throw new RuntimeException("Short write to store: {$this->filePath}");
        }
        fflush($handle);
    }
}
