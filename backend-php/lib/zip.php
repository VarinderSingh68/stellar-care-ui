<?php
// Minimal streaming ZIP writer used by the admin backup download.
//
// Deliberately dependency-free: the zip extension is not guaranteed to be
// enabled on free hosting, and building an archive in memory would blow the
// PHP memory limit as soon as the clinic uploads a few videos. Files are
// stored with the STORE method (no compression) and streamed straight to the
// response, so peak memory stays at one 64 KB chunk.

declare(strict_types=1);

final class ZipStream
{
    /** @var list<array{name:string,offset:int,size:int,crc:int,time:int,date:int}> */
    private array $entries = [];

    private int $offset = 0;

    /** @param resource $handle */
    public function __construct(private $handle)
    {
    }

    public function addFile(string $archiveName, string $filePath): void
    {
        $size = @filesize($filePath);
        $crcHex = @hash_file('crc32b', $filePath);
        if ($size === false || $crcHex === false) {
            return;
        }

        $name = ltrim(str_replace('\\', '/', $archiveName), '/');
        $modified = @filemtime($filePath) ?: time();
        $crc = (int) hexdec($crcHex);
        $time = self::dosTime($modified);
        $date = self::dosDate($modified);

        // The offset must point at the local header, so record it first.
        $offset = $this->offset;

        $this->write(pack(
            'VvvvvvVVVvv',
            0x04034b50,
            20,
            0,
            0,
            $time,
            $date,
            $crc,
            $size,
            $size,
            strlen($name),
            0,
        ) . $name);

        $this->writeFile($filePath, $size);

        $this->entries[] = [
            'name' => $name,
            'offset' => $offset,
            'size' => $size,
            'crc' => $crc,
            'time' => $time,
            'date' => $date,
        ];
    }

    public function finish(): void
    {
        $directoryOffset = $this->offset;
        $directory = '';

        foreach ($this->entries as $entry) {
            $directory .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20,
                20,
                0,
                0,
                $entry['time'],
                $entry['date'],
                $entry['crc'],
                $entry['size'],
                $entry['size'],
                strlen($entry['name']),
                0,
                0,
                0,
                0,
                0,
                $entry['offset'],
            ) . $entry['name'];
        }

        $this->write($directory);
        $this->write(pack(
            'VvvvvVVv',
            0x06054b50,
            0,
            0,
            count($this->entries),
            count($this->entries),
            strlen($directory),
            $directoryOffset,
            0,
        ));
    }

    private function write(string $data): void
    {
        fwrite($this->handle, $data);
        $this->offset += strlen($data);
    }

    private function writeFile(string $filePath, int $expectedSize): void
    {
        $handle = @fopen($filePath, 'rb');
        if ($handle === false) {
            return;
        }

        $written = 0;
        while (!feof($handle)) {
            $chunk = fread($handle, 65536);
            if ($chunk === false || $chunk === '') {
                break;
            }
            $this->write($chunk);
            $written += strlen($chunk);
        }
        fclose($handle);

        // Keep the archive valid even if a file changed size mid-read.
        if ($written < $expectedSize) {
            $this->write(str_repeat("\0", $expectedSize - $written));
        }
    }

    private static function dosTime(int $timestamp): int
    {
        $hour = (int) date('G', $timestamp);
        $minute = (int) date('i', $timestamp);
        $second = (int) date('s', $timestamp);
        return ($hour << 11) | ($minute << 5) | intdiv($second, 2);
    }

    private static function dosDate(int $timestamp): int
    {
        $year = (int) date('Y', $timestamp) - 1980;
        $month = (int) date('n', $timestamp);
        $day = (int) date('j', $timestamp);
        return (max(0, $year) << 9) | ($month << 5) | $day;
    }
}
