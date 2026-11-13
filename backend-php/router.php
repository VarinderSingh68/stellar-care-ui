<?php
// Local development router for PHP's built-in web server. NOT deployed.
//
//   php -S 127.0.0.1:5001 backend-php/router.php
//
// It mirrors what Apache does on InfinityFree: requests under /api are handed
// to index.php (with SCRIPT_NAME rewritten so routing matches production), and
// /uploads/media/* is served from the local uploads folder.

declare(strict_types=1);

require_once __DIR__ . '/lib/config.php';

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = is_string($uri) ? $uri : '/';

if (str_starts_with($path, '/uploads/')) {
    $relative = ltrim(substr($path, strlen('/uploads/')), '/');
    // UPLOADS_DIR is .../uploads/media, so the served root is its parent.
    $base = realpath(dirname(Config::uploadsDir()));
    $file = $base === false ? false : realpath($base . '/' . $relative);

    if ($base !== false && $file !== false && str_starts_with($file, $base) && is_file($file)) {
        $mime = function_exists('mime_content_type') ? (mime_content_type($file) ?: 'application/octet-stream') : 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($file));
        readfile($file);
        return true;
    }

    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'File not found.']);
    return true;
}

if (preg_match('#^/api(/|$)#', $path) === 1) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/index.php';
    return true;
}

http_response_code(404);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['success' => false, 'message' => 'Not found.']);
return true;
