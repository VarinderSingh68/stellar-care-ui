<?php
// Import the Node backend's JSON data folder into the PHP API.
//
//   php backend-php/scripts/import-json-data.php <source-data-dir> [options]
//
// Options:
//   --target=<dir>             Destination data folder (default: DATA_DIR from
//                              config.php, i.e. public_html/data on the server)
//   --admin-username=<name>    Admin username to keep (default: admin)
//   --admin-password=<pass>    New admin password (default: random, printed)
//   --patient-password=<pass>  Temporary password set on every imported
//                              patient portal account (default: random, printed)
//
// Why passwords change: the Node backend hashed passwords with scrypt, which
// PHP has no binding for, so those hashes cannot be verified here. Records are
// imported intact and every portal account is given the temporary password
// below; patients sign in with it and the clinic tells them to re-register if
// they no longer need the old account. Nothing else about a record is altered.

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/config.php';
require_once dirname(__DIR__) . '/lib/auth.php';

$args = array_slice($argv, 1);
if ($args === [] || str_starts_with($args[0], '--')) {
    fwrite(STDERR, "Usage: php import-json-data.php <source-data-dir> [--target=dir] [--admin-username=admin] [--admin-password=pass] [--patient-password=pass]\n");
    exit(1);
}

$sourceDir = rtrim(array_shift($args), '/\\');
if (!is_dir($sourceDir)) {
    fwrite(STDERR, "Source folder not found: {$sourceDir}\n");
    exit(1);
}

$options = [];
foreach ($args as $arg) {
    if (preg_match('/^--([a-z-]+)=(.*)$/', $arg, $matches) === 1) {
        $options[$matches[1]] = $matches[2];
    }
}

$targetDir = rtrim((string) ($options['target'] ?? Config::dataDir()), '/\\');
$adminUsername = (string) ($options['admin-username'] ?? 'admin');
$adminPassword = (string) ($options['admin-password'] ?? bin2hex(random_bytes(6)));
$patientPassword = (string) ($options['patient-password'] ?? bin2hex(random_bytes(6)));

if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true) && !is_dir($targetDir)) {
    fwrite(STDERR, "Could not create target folder: {$targetDir}\n");
    exit(1);
}

/** @return mixed */
function readJson(string $path, $fallback = [])
{
    if (!is_file($path)) {
        return $fallback;
    }
    $raw = (string) file_get_contents($path);
    if (trim($raw) === '') {
        return $fallback;
    }
    $decoded = json_decode($raw, true);
    return $decoded ?? $fallback;
}

function writeJson(string $path, $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Could not encode ' . $path . ': ' . json_last_error_msg());
    }
    file_put_contents($path, $json, LOCK_EX);
}

$collections = require dirname(__DIR__) . '/lib/collections.php';

$copied = [];
$missing = [];

foreach ($collections as $name => $config) {
    $source = $sourceDir . '/' . $config['file'];
    if (!is_file($source)) {
        $missing[] = $config['file'];
        continue;
    }

    $data = readJson($source, $config['default']);
    if ($name === 'portal-patients' && is_array($data)) {
        foreach ($data as $index => $record) {
            $data[$index]['password'] = Auth::hashPassword($patientPassword);
            $data[$index]['importedFromNode'] = true;
        }
    }

    writeJson($targetDir . '/' . $config['file'], $data);
    $copied[] = $config['file'];
}

// Bookings, settings and the admin account live outside the collection registry.
if (is_file($sourceDir . '/bookings.json')) {
    writeJson($targetDir . '/bookings.json', readJson($sourceDir . '/bookings.json', []));
    $copied[] = 'bookings.json';
} else {
    $missing[] = 'bookings.json';
}

if (is_file($sourceDir . '/settings.json')) {
    writeJson($targetDir . '/settings.json', readJson($sourceDir . '/settings.json', []));
    $copied[] = 'settings.json';
} else {
    $missing[] = 'settings.json';
}

writeJson($targetDir . '/admin-credentials.json', [
    'username' => $adminUsername,
    'passwordHash' => Auth::hashPassword($adminPassword),
    'tokenVersion' => 1,
]);
$copied[] = 'admin-credentials.json (re-hashed)';

// Uploaded media: copy the files so /uploads/media/... URLs keep working.
$sourceUploads = $sourceDir . '/uploads/media';
$targetUploads = dirname($targetDir) . '/uploads/media';
$mediaCopied = 0;
if (is_dir($sourceUploads)) {
    if (!is_dir($targetUploads) && !mkdir($targetUploads, 0775, true) && !is_dir($targetUploads)) {
        fwrite(STDERR, "Could not create {$targetUploads}\n");
    } else {
        foreach (scandir($sourceUploads) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            if (is_file($sourceUploads . '/' . $entry) && copy($sourceUploads . '/' . $entry, $targetUploads . '/' . $entry)) {
                $mediaCopied++;
            }
        }
    }
}

echo "Imported into {$targetDir}\n";
foreach ($copied as $file) {
    echo "  - {$file}\n";
}
if ($missing !== []) {
    echo "Not present in the source folder (left as empty defaults):\n";
    foreach (array_unique($missing) as $file) {
        echo "  - {$file}\n";
    }
}
echo 'Media files copied: ' . $mediaCopied . "\n";
echo "\nSign in with:\n";
echo '  username: ' . $adminUsername . "\n";
echo '  password: ' . $adminPassword . "\n";
echo 'Patient portal accounts all use the temporary password: ' . $patientPassword . "\n";
echo "Change the admin password from Admin -> Settings after the first login.\n";
