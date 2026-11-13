<?php
// File-based per-IP rate limiting.
//
// express-rate-limit kept its counters in memory; each PHP request is a fresh
// process, so counters live in small JSON files under data/ratelimit/. There is
// no cron on InfinityFree, so expired buckets are pruned opportunistically
// when they are touched instead of on a timer.

declare(strict_types=1);

final class RateLimiter
{
    private string $dir;

    public function __construct(
        string $dataDir,
        private string $name,
        private int $windowSeconds,
        private int $max,
        private string $message,
    ) {
        $this->dir = $dataDir . '/ratelimit';
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0775, true);
        }
    }

    /** @return array{success:false,message:string}|null null when the request is allowed. */
    public function check(): ?array
    {
        if (Config::isTest()) {
            return null;
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $key = hash('sha256', $this->name . '|' . $ip);
        $path = $this->dir . '/' . $key . '.json';
        $now = time();

        $handle = @fopen($path, 'c+b');
        if ($handle === false) {
            // Never take the API down because the limiter cannot write.
            return null;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                return null;
            }

            $raw = stream_get_contents($handle);
            $bucket = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
            if (!is_array($bucket) || !isset($bucket['start'], $bucket['count'])
                || ($now - (int) $bucket['start']) >= $this->windowSeconds) {
                $bucket = ['start' => $now, 'count' => 0];
            }

            $bucket['count'] = (int) $bucket['count'] + 1;
            $blocked = $bucket['count'] > $this->max;

            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, (string) json_encode($bucket));
            fflush($handle);
            flock($handle, LOCK_UN);
        } finally {
            fclose($handle);
        }

        $this->pruneOccasionally($now);

        return $blocked ? ['success' => false, 'message' => $this->message] : null;
    }

    private function pruneOccasionally(int $now): void
    {
        if (random_int(1, 250) !== 1) {
            return;
        }
        $files = glob($this->dir . '/*.json') ?: [];
        foreach ($files as $file) {
            $mtime = @filemtime($file);
            if ($mtime !== false && ($now - $mtime) > ($this->windowSeconds * 2)) {
                @unlink($file);
            }
        }
    }
}
