<?php
// End-to-end smoke test for the PHP API.
//
//   php backend-php/scripts/smoke-test.php
//
// Boots PHP's built-in server against a throwaway data folder with all
// email/WhatsApp credentials blanked out (CLINIC_CONFIG_FILE points at a file
// that does not exist, so a real config.php can never leak live credentials
// into the test). Your real data folder is never touched and no real email or
// WhatsApp message is ever sent.

declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/http.php';

$backendDir = dirname(__DIR__);
$phpBinary = PHP_BINARY;

$tempDir = sys_get_temp_dir() . '/clinic-smoke-' . bin2hex(random_bytes(4));
@mkdir($tempDir, 0775, true);
$logFile = $tempDir . '/server.log';
@touch($logFile);

function freePort(): int
{
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($socket === false) {
        throw new RuntimeException('Could not reserve a free port: ' . $errstr);
    }
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $port = (int) substr((string) $name, strrpos((string) $name, ':') + 1);
    if ($port <= 0) {
        throw new RuntimeException('Could not determine a free port.');
    }
    return $port;
}

$port = freePort();
$base = 'http://127.0.0.1:' . $port;

$environment = getenv();
$environment['DATA_DIR'] = $tempDir . '/data';
$environment['UPLOADS_DIR'] = $tempDir . '/uploads/media';
$environment['CLINIC_CONFIG_FILE'] = $tempDir . '/no-config.php';
$environment['SESSION_SECRET'] = 'smoke-test-secret';
$environment['TEST_MODE'] = '1';
$environment['APP_ENV'] = 'test';

foreach ([
    'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'EMAIL_USER', 'EMAIL_PASSWORD',
    'ADMIN_NOTIFICATION_EMAIL', 'ADMIN_2FA_EMAIL', 'WATI_API_ENDPOINT',
    'WATI_ACCESS_TOKEN', 'PUBLIC_APP_URL', 'ALLOWED_ORIGINS',
] as $key) {
    unset($environment[$key]);
}

$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['file', $logFile, 'a'],
    2 => ['file', $logFile, 'a'],
];

$process = proc_open(
    [$phpBinary, '-S', '127.0.0.1:' . $port, 'router.php'],
    $descriptors,
    $pipes,
    $backendDir,
    $environment,
);

if (!is_resource($process)) {
    fwrite(STDERR, "Could not start the PHP development server.\n");
    exit(1);
}

$passed = 0;
$failed = 0;

function check(string $name, bool $condition, string $detail = ''): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  ok   {$name}\n";
        return;
    }
    $failed++;
    echo "  FAIL {$name}" . ($detail !== '' ? ' -- ' . $detail : '') . "\n";
}

/**
 * @param array{body?:mixed,token?:string,raw?:bool} $options
 * @return array{status:int,json:mixed,text:string,buf:string}
 */
function call(string $method, string $route, array $options = []): array
{
    global $base;

    $headers = ['Accept: application/json'];
    if (isset($options['token'])) {
        $headers[] = 'Authorization: Bearer ' . $options['token'];
    }

    $body = null;
    if (array_key_exists('body', $options)) {
        $headers[] = 'Content-Type: application/json';
        $body = (string) json_encode($options['body']);
    }

    $response = Http::request($method, $base . $route, $headers, $body, 30);
    $text = $response['body'];

    return [
        'status' => $response['status'],
        'json' => json_decode($text, true),
        'text' => $text,
        'buf' => $text,
    ];
}

function waitForServer(): bool
{
    global $base;
    for ($attempt = 0; $attempt < 80; $attempt++) {
        $response = Http::request('GET', $base . '/api/health', [], null, 2);
        if ($response['status'] === 200) {
            return true;
        }
        usleep(250000);
    }
    return false;
}

function cleanup(): void
{
    global $process, $tempDir;

    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }

    $remove = static function (string $path) use (&$remove): void {
        if (!file_exists($path) && !is_link($path)) {
            return;
        }
        if (is_dir($path)) {
            foreach (scandir($path) ?: [] as $entry) {
                if ($entry !== '.' && $entry !== '..') {
                    $remove($path . '/' . $entry);
                }
            }
            @rmdir($path);
            return;
        }
        @unlink($path);
    };
    $remove($tempDir);
}

if (!waitForServer()) {
    echo "Server did not start. Log:\n" . (string) @file_get_contents($logFile) . "\n";
    cleanup();
    exit(1);
}

try {
    $health = call('GET', '/api/health');
    check('GET /api/health', $health['status'] === 200 && ($health['json']['status'] ?? '') === 'ok');

    $settings = call('GET', '/api/settings');
    check('GET /api/settings (public)', $settings['status'] === 200 && ($settings['json']['clinicName'] ?? '') === 'Dr. Rana Dental Clinic');

    $badLogin = call('POST', '/api/admin/login', ['body' => ['username' => 'admin', 'password' => 'wrong']]);
    check('admin login rejects bad password', $badLogin['status'] === 401);

    $login = call('POST', '/api/admin/login', ['body' => ['username' => 'admin', 'password' => 'password123']]);
    check(
        'admin login triggers 2FA challenge',
        $login['status'] === 200 && ($login['json']['require2FA'] ?? false) === true && !empty($login['json']['tempToken']),
        $login['text'],
    );

    $badOtp = call('POST', '/api/admin/verify-2fa', [
        'body' => ['tempToken' => $login['json']['tempToken'] ?? '', 'code' => '000000'],
    ]);
    check('admin verify-2fa rejects wrong code', $badOtp['status'] === 400, $badOtp['text']);

    $verify = call('POST', '/api/admin/verify-2fa', [
        'body' => ['tempToken' => $login['json']['tempToken'] ?? '', 'code' => (string) ($login['json']['testOtpCode'] ?? '')],
    ]);
    $admin = (string) ($verify['json']['token'] ?? '');
    check('admin verify-2fa succeeds with correct code', $verify['status'] === 200 && $admin !== '', $verify['text']);

    $me = call('GET', '/api/admin/me', ['token' => $admin]);
    check('GET /api/admin/me', $me['status'] === 200 && ($me['json']['username'] ?? '') === 'admin');

    $noAuth = call('GET', '/api/bookings');
    check('GET /api/bookings requires admin', $noAuth['status'] === 401);

    $putSettings = call('PUT', '/api/settings', [
        'token' => $admin,
        'body' => array_merge($settings['json'] ?? [], ['phone' => '0000000000']),
    ]);
    check('PUT /api/settings', $putSettings['status'] === 200 && ($putSettings['json']['settings']['phone'] ?? '') === '0000000000', $putSettings['text']);

    $booking = call('POST', '/api/send-booking', [
        'body' => [
            'patientName' => 'Smoke Test',
            'patientEmail' => 'smoke@example.com',
            'patientPhone' => '9876543210',
            'appointmentDate' => '2026-12-01',
            'appointmentTime' => '10:00',
            'reason' => 'Checkup',
        ],
    ]);
    check('POST /api/send-booking (public)', $booking['status'] === 200 && ($booking['json']['success'] ?? false) === true, $booking['text']);

    $badBooking = call('POST', '/api/send-booking', ['body' => ['patientName' => 'x']]);
    check('send-booking validates fields', $badBooking['status'] === 400);

    $bookings = call('GET', '/api/bookings', ['token' => $admin]);
    $found = false;
    foreach ((array) ($bookings['json'] ?? []) as $item) {
        if (($item['patientEmail'] ?? '') === 'smoke@example.com') {
            $found = true;
        }
    }
    check('GET /api/bookings contains new booking', $bookings['status'] === 200 && $found);

    $appointment = call('POST', '/api/appointments', [
        'token' => $admin,
        'body' => ['patientName' => 'Appt', 'appointmentDate' => '2026-12-02', 'appointmentTime' => '11:00', 'reason' => 'Cleaning'],
    ]);
    $appointmentId = (string) ($appointment['json']['appointment']['id'] ?? '');
    check('POST /api/appointments', $appointment['status'] === 200 && $appointmentId !== '', $appointment['text']);

    $appointmentPut = call('PUT', '/api/appointments/' . rawurlencode($appointmentId), [
        'token' => $admin,
        'body' => ['status' => 'completed'],
    ]);
    check('PUT /api/appointments/:id', $appointmentPut['status'] === 200 && ($appointmentPut['json']['appointment']['status'] ?? '') === 'completed', $appointmentPut['text']);

    $registration = call('POST', '/api/patient/register', [
        'body' => [
            'patientName' => 'Pat',
            'patientEmail' => 'pat' . time() . '@example.com',
            'patientPhone' => '9999900000',
            'password' => 'secret12',
        ],
    ]);
    $patientToken = (string) ($registration['json']['token'] ?? '');
    $patientId = (string) ($registration['json']['patient']['id'] ?? '');
    check(
        'POST /api/patient/register',
        $registration['status'] === 200 && $patientToken !== '' && !array_key_exists('password', (array) ($registration['json']['patient'] ?? [])),
        $registration['text'],
    );

    $demoLogin = call('POST', '/api/patient/login', ['body' => ['email' => 'patient@demo.com', 'password' => 'demo123']]);
    check('patient login (demo account)', $demoLogin['status'] === 200 && !empty($demoLogin['json']['token']), $demoLogin['text']);

    $patientMe = call('GET', '/api/patient/me', ['token' => $patientToken]);
    check('GET /api/patient/me', $patientMe['status'] === 200 && ($patientMe['json']['patient']['id'] ?? '') === $patientId);

    $putFollowUps = call('PUT', '/api/data/follow-ups', [
        'token' => $admin,
        'body' => [
            ['id' => 'fu1', 'patientId' => $patientId, 'title' => 'Mine', 'status' => 'pending'],
            ['id' => 'fu2', 'patientId' => 'someone-else', 'title' => 'Not mine', 'status' => 'pending'],
        ],
    ]);
    check('PUT /api/data/follow-ups', $putFollowUps['status'] === 200, $putFollowUps['text']);

    $putConsent = call('PUT', '/api/data/consent-forms', [
        'token' => $admin,
        'body' => [['id' => 'cf1', 'patientId' => $patientId, 'isSigned' => false]],
    ]);
    check('PUT /api/data/consent-forms', $putConsent['status'] === 200, $putConsent['text']);

    $ownFollowUps = call('GET', '/api/data/follow-ups', ['token' => $patientToken]);
    check('patient sees only own follow-ups', $ownFollowUps['status'] === 200 && count((array) $ownFollowUps['json']) === 1);

    $blocked = call('GET', '/api/data/patients', ['token' => $patientToken]);
    check('patient blocked from admin-only collection', $blocked['status'] === 403);

    $portalPatients = call('GET', '/api/data/portal-patients', ['token' => $admin]);
    $noHash = true;
    foreach ((array) ($portalPatients['json'] ?? []) as $entry) {
        if (array_key_exists('password', (array) $entry)) {
            $noHash = false;
        }
    }
    check('portal-patients never exposes password hashes', $portalPatients['status'] === 200 && $noHash);

    $patch = call('PATCH', '/api/patient/follow-ups/fu1', ['token' => $patientToken, 'body' => ['status' => 'completed']]);
    check('PATCH /api/patient/follow-ups/:id', $patch['status'] === 200 && ($patch['json']['followUp']['status'] ?? '') === 'completed', $patch['text']);

    $sign = call('POST', '/api/patient/consent-forms/cf1/sign', ['token' => $patientToken]);
    check('POST /api/patient/consent-forms/:id/sign', $sign['status'] === 200 && ($sign['json']['consentForm']['isSigned'] ?? false) === true, $sign['text']);

    foreach (['patients', 'treatment-plans', 'clinical-notes', 'staff', 'medical-reports', 'insurance-billings'] as $name) {
        $response = call('GET', '/api/data/' . $name, ['token' => $admin]);
        check('GET /api/data/' . $name, $response['status'] === 200 && array_is_list((array) $response['json']));
    }

    $unknown = call('GET', '/api/data/nope', ['token' => $admin]);
    check('unknown collection -> 404', $unknown['status'] === 404);

    $png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    $upload = call('POST', '/api/admin/media-upload', [
        'token' => $admin,
        'body' => ['contentType' => 'image/png', 'dataBase64' => $png],
    ]);
    $mediaUrl = (string) ($upload['json']['url'] ?? '');
    check('POST /api/admin/media-upload', $upload['status'] === 200 && str_starts_with($mediaUrl, '/uploads/media/'), $upload['text']);

    if ($mediaUrl !== '') {
        $file = call('GET', $mediaUrl);
        check('GET uploaded media file', $file['status'] === 200 && strlen($file['buf']) > 0);
    }

    $media = call('GET', '/api/media');
    check('GET /api/media (public)', $media['status'] === 200 && array_is_list((array) $media['json']));

    $backup = call('GET', '/api/admin/backup', ['token' => $admin]);
    check(
        'GET /api/admin/backup returns a ZIP',
        $backup['status'] === 200 && substr($backup['buf'], 0, 2) === 'PK',
        'status ' . $backup['status'],
    );

    $backupNoAuth = call('GET', '/api/admin/backup');
    check('admin backup requires admin', $backupNoAuth['status'] === 401);

    // Email is deliberately unconfigured here: these must still generate a PDF
    // and answer cleanly instead of crashing.
    $prescription = call('POST', '/api/send-prescription', [
        'token' => $admin,
        'body' => [
            'patientName' => 'Rx',
            'patientEmail' => 'rx@example.com',
            'patientPhone' => '9876543210',
            'suffering' => 'Pain',
            'prescription' => "Tab A\nTab B",
            'prescriptionDate' => '2026-12-01',
            'totalFees' => 500,
            'amountPaid' => 500,
            'paymentStatus' => 'paid',
        ],
    ]);
    $prescriptionFile = (string) ($prescription['json']['prescriptionPdf']['filename'] ?? '');
    check('POST /api/send-prescription generates PDF', $prescription['status'] === 200 && $prescriptionFile !== '', $prescription['text']);

    if ($prescriptionFile !== '') {
        $unauthenticated = call('GET', '/api/prescriptions/' . rawurlencode($prescriptionFile));
        check('unauthenticated prescription access blocked (403)', $unauthenticated['status'] === 403);

        $pdf = call('GET', '/api/prescriptions/' . rawurlencode($prescriptionFile), ['token' => $admin]);
        check('GET /api/prescriptions/:file serves a PDF with auth', $pdf['status'] === 200 && substr($pdf['buf'], 0, 5) === '%PDF-');
    }

    $traversal = call('GET', '/api/prescriptions/..%2F.session-secret');
    check('prescription path traversal blocked', in_array($traversal['status'], [400, 404], true), (string) $traversal['status']);

    $followUp = call('POST', '/api/send-followup', [
        'token' => $admin,
        'body' => ['patientName' => 'F', 'patientEmail' => 'f@example.com', 'title' => 'Recall', 'dueDate' => '2026-12-10', 'type' => 'checkup'],
    ]);
    check('POST /api/send-followup responds', $followUp['status'] === 200 && array_key_exists('success', (array) $followUp['json']), $followUp['text']);

    $report = call('POST', '/api/send-report', [
        'token' => $admin,
        'body' => ['patientName' => 'R', 'patientEmail' => 'r@example.com', 'reportType' => 'xray', 'title' => 'OPG', 'date' => '2026-12-01'],
    ]);
    check('POST /api/send-report responds', $report['status'] === 200 && array_key_exists('success', (array) $report['json']), $report['text']);

    $billing = call('POST', '/api/send-billing', [
        'token' => $admin,
        'body' => [
            'patientName' => 'B',
            'patientEmail' => 'b@example.com',
            'claimId' => 'C1',
            'insuranceProvider' => 'Ins',
            'amount' => 1000,
            'submissionDate' => '2026-12-01',
            'status' => 'pending',
        ],
    ]);
    check('POST /api/send-billing responds', $billing['status'] === 200 && array_key_exists('success', (array) $billing['json']), $billing['text']);

    // Last, because it invalidates the current admin token version.
    $changed = call('POST', '/api/admin/change-credentials', ['token' => $admin, 'body' => ['username' => 'admin2', 'password' => 'newpass1']]);
    check('POST /api/admin/change-credentials', $changed['status'] === 200 && ($changed['json']['username'] ?? '') === 'admin2', $changed['text']);

    $staleToken = call('GET', '/api/admin/me', ['token' => $admin]);
    check('old admin token rejected after credential change', $staleToken['status'] === 401);

    $relogin = call('POST', '/api/admin/login', ['body' => ['username' => 'admin2', 'password' => 'newpass1']]);
    check('login with changed credentials triggers 2FA', $relogin['status'] === 200 && ($relogin['json']['require2FA'] ?? false) === true, $relogin['text']);

    $reverify = call('POST', '/api/admin/verify-2fa', [
        'body' => ['tempToken' => $relogin['json']['tempToken'] ?? '', 'code' => (string) ($relogin['json']['testOtpCode'] ?? '')],
    ]);
    check('verify-2fa succeeds for changed credentials', $reverify['status'] === 200 && !empty($reverify['json']['token']), $reverify['text']);

    $api404 = call('GET', '/api/does-not-exist');
    check('unknown /api route -> JSON 404', $api404['status'] === 404 && ($api404['json']['success'] ?? true) === false);
} finally {
    echo "\n{$passed} passed, {$failed} failed\n";
    if ($failed > 0) {
        echo "\nServer log:\n" . (string) @file_get_contents($logFile) . "\n";
    }
    cleanup();
}

exit($failed > 0 ? 1 : 0);
