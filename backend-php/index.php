<?php
// Dr. Rana Dental Clinic -- PHP API front controller.
//
// Deployed to <public_html>/api/index.php on Serv00, where the site .htaccess
// routes every /api/... path here. It is a faithful port of
// backend/server.cjs: same paths, same verbs, same JSON shapes, so the
// existing React frontend needs no changes beyond pointing at the same origin.
//
// PHP gives every request a fresh process, so state that used to live in
// module-level variables (admin token version, pending 2FA challenges) is read
// from the JSON store instead.

declare(strict_types=1);

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/lib/config.php';
require_once __DIR__ . '/lib/store.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/pdf.php';
require_once __DIR__ . '/lib/emailTemplates.php';
require_once __DIR__ . '/lib/mailer.php';
require_once __DIR__ . '/lib/wati.php';
require_once __DIR__ . '/lib/rateLimit.php';
require_once __DIR__ . '/lib/zip.php';

const ADMIN_DEFAULT_USERNAME = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'password123';
const ADMIN_TOKEN_TTL_SECONDS = 43200;        // 12 hours
const PATIENT_TOKEN_TTL_SECONDS = 2592000;    // 30 days

// Uploads travel base64-encoded inside JSON (~33% inflation) and the account
// has 512 MB of RAM, so each file stays well inside PHP's post_max_size.
const MAX_MEDIA_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 100 * 1024;
const MAX_UPLOAD_BODY_BYTES = 12 * 1024 * 1024;

const DEFAULT_CLINIC_SETTINGS = [
    'clinicName' => 'Dr. Rana Dental Clinic',
    'doctorName' => 'Dr. Rana',
    'phone' => '090414 81946',
    'whatsappNumber' => '',
    'email' => '',
    'address' => 'New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301',
    'openingTime' => '10:00',
    'closingTime' => '19:00',
    'workingDays' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    'prescriptionFooter' => 'Please follow the prescription as advised and contact the clinic for any urgent concern.',
    'reminderLeadHours' => '24',
];

// ---------------------------------------------------------------------------
// Deferred work: PHP has no setImmediate(). Mail that used to be fire-and-forget
// runs after the response has been flushed (under PHP-FPM) or inline (dev).
// ---------------------------------------------------------------------------

$GLOBALS['clinic_after_response'] = [];

function afterResponse(callable $task): void
{
    $GLOBALS['clinic_after_response'][] = $task;
}

register_shutdown_function(static function (): void {
    $tasks = $GLOBALS['clinic_after_response'] ?? [];
    if ($tasks === []) {
        return;
    }

    if (function_exists('fastcgi_finish_request')) {
        ignore_user_abort(true);
        while (ob_get_level() > 0) {
            @ob_end_flush();
        }
        @flush();
        @fastcgi_finish_request();
    }

    foreach ($tasks as $task) {
        try {
            $task();
        } catch (Throwable $error) {
            error_log('Deferred task failed: ' . $error->getMessage());
        }
    }
});

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** @param mixed $data */
function respond(int $status, $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['success' => false, 'message' => $message]);
}

/**
 * Decoded JSON request body.
 *
 * @return array<mixed>
 */
function jsonBody(int $maxBytes = MAX_JSON_BODY_BYTES): array
{
    $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declared > $maxBytes) {
        respond(413, ['success' => false, 'message' => 'Request body too large.']);
    }

    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        fail(400, 'Request body must be valid JSON.');
    }

    return $decoded;
}

function requestPath(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $path = is_string($uri) ? $uri : '/';

    // Strip the directory this script is served from (/api in production, and
    // set explicitly by router.php during local development), so the route
    // table below matches the paths the frontend calls without the prefix.
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
    if ($scriptDir !== '' && $scriptDir !== '/' && str_starts_with($path, $scriptDir)) {
        $path = substr($path, strlen($scriptDir));
    }

    $path = '/' . ltrim($path, '/');
    return $path === '' ? '/' : $path;
}

function isHttps(): bool
{
    $https = $_SERVER['HTTPS'] ?? '';
    if ($https !== '' && strtolower((string) $https) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function siteOrigin(): string
{
    $configured = (string) Config::get('PUBLIC_APP_URL', '');
    if ($configured !== '') {
        return rtrim($configured, '/');
    }
    return (isHttps() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

function dataDir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    $dir = Config::dataDir();
    foreach ([$dir, Config::uploadsDir(), Config::prescriptionsDir()] as $candidate) {
        if (!is_dir($candidate) && !@mkdir($candidate, 0775, true) && !is_dir($candidate)) {
            error_log('Could not create data directory: ' . $candidate);
        }
    }
    return $dir;
}

function settingsStore(): JsonStore
{
    static $store = null;
    $store ??= new JsonStore(dataDir() . '/settings.json', DEFAULT_CLINIC_SETTINGS);
    return $store;
}

function bookingsStore(): JsonStore
{
    static $store = null;
    $store ??= new JsonStore(dataDir() . '/bookings.json', []);
    return $store;
}

function adminCredentialsStore(): JsonStore
{
    static $store = null;
    $store ??= new JsonStore(dataDir() . '/admin-credentials.json', null);
    return $store;
}

function challengesStore(): JsonStore
{
    static $store = null;
    $store ??= new JsonStore(dataDir() . '/2fa-challenges.json', []);
    return $store;
}

/** @return array<string, JsonStore> */
function stores(): array
{
    static $stores = null;
    if ($stores !== null) {
        return $stores;
    }

    /** @var array<string, array<string,mixed>> $collections */
    $collections = collectionConfig();
    $stores = [];
    foreach ($collections as $name => $config) {
        $stores[$name] = new JsonStore(dataDir() . '/' . $config['file'], $config['default']);
    }
    return $stores;
}

/** @return array<string, array<string,mixed>> */
function collectionConfig(): array
{
    static $collections = null;
    $collections ??= require __DIR__ . '/lib/collections.php';
    return $collections;
}

// ---------------------------------------------------------------------------
// Bootstrap: default admin account + demo patient portal account
// ---------------------------------------------------------------------------

function ensureBootstrap(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    try {
        $credentials = adminCredentialsStore()->read();
        if (!is_array($credentials) || empty($credentials['username']) || empty($credentials['passwordHash'])) {
            adminCredentialsStore()->write([
                'username' => ADMIN_DEFAULT_USERNAME,
                'passwordHash' => Auth::hashPassword(ADMIN_DEFAULT_PASSWORD),
                'tokenVersion' => 1,
            ]);
            error_log('Created default admin account (' . ADMIN_DEFAULT_USERNAME . '). Change it from Admin -> Settings once you sign in.');
        }

        $patients = stores()['portal-patients']->read();
        if (!is_array($patients)) {
            $patients = [];
        }
        foreach ($patients as $patient) {
            if (($patient['patientEmail'] ?? '') === 'patient@demo.com') {
                return;
            }
        }

        $patients[] = [
            'id' => 'patient-demo-' . bin2hex(random_bytes(4)),
            'patientName' => 'Demo Patient',
            'patientEmail' => 'patient@demo.com',
            'patientPhone' => '9999999999',
            'password' => Auth::hashPassword('demo123'),
            'age' => '30',
            'gender' => 'other',
            'address' => '',
        ];
        stores()['portal-patients']->write($patients);
        error_log('Seeded demo patient portal account (patient@demo.com / demo123).');
    } catch (Throwable $error) {
        error_log('Bootstrap error: ' . $error->getMessage());
    }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function sessionSecret(): string
{
    static $secret = null;
    $secret ??= Auth::sessionSecret(dataDir());
    return $secret;
}

/** @return array<string,mixed>|null */
function authenticateRequest(): ?array
{
    $token = Auth::bearerToken();
    if ($token === '') {
        return null;
    }
    $payload = Auth::verifyToken($token, sessionSecret());
    if ($payload === null || empty($payload['role'])) {
        return null;
    }
    return $payload;
}

/** @return array<string,mixed> */
function requireAdmin(): array
{
    $auth = authenticateRequest();
    if ($auth === null || ($auth['role'] ?? '') !== 'admin') {
        fail(401, 'Admin authentication required.');
    }

    $credentials = adminCredentialsStore()->read();
    $tokenVersion = is_array($credentials) ? (int) ($credentials['tokenVersion'] ?? 1) : 1;
    if (isset($auth['v']) && (int) $auth['v'] < $tokenVersion) {
        fail(401, 'Session has been invalidated. Please sign in again.');
    }

    return $auth;
}

/** @return array<string,mixed> */
function requirePatient(): array
{
    $auth = authenticateRequest();
    if ($auth === null || ($auth['role'] ?? '') !== 'patient') {
        fail(401, 'Patient authentication required.');
    }
    return $auth;
}

function isValidEmail($value): bool
{
    return is_string($value) && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', trim($value)) === 1;
}

function maskEmail(string $email): string
{
    if ($email === '' || !str_contains($email, '@')) {
        return $email;
    }
    [$local, $domain] = explode('@', $email, 2);
    if (strlen($local) <= 2) {
        return substr($local, 0, 1) . '*@' . $domain;
    }
    return substr($local, 0, 2) . str_repeat('*', max(3, strlen($local) - 3)) . substr($local, -1) . '@' . $domain;
}

/** @param array<string,mixed> $record */
function publicPatient(array $record): array
{
    unset($record['password']);
    return $record;
}

// ---------------------------------------------------------------------------
// Email / WhatsApp helpers
// ---------------------------------------------------------------------------

function mailer(): Mailer
{
    static $mailer = null;
    $mailer ??= Mailer::create();
    return $mailer;
}

function wati(): Wati
{
    static $wati = null;
    $wati ??= new Wati();
    return $wati;
}

function admin2faEmailAddress(): string
{
    foreach (['ADMIN_2FA_EMAIL', 'ADMIN_NOTIFICATION_EMAIL', 'EMAIL_USER'] as $key) {
        $value = (string) Config::get($key, '');
        if ($value !== '') {
            return $value;
        }
    }
    return 'ngw.designer@gmail.com';
}

/**
 * @param array<string,mixed> $message
 * @return array{sent:bool,error?:string}
 */
function sendMailSafe(array $message): array
{
    $transport = mailer();
    if (!$transport->configured) {
        return [
            'sent' => false,
            'error' => 'Email is not configured on the server (set RESEND_API_KEY + RESEND_FROM_EMAIL, or EMAIL_USER + EMAIL_PASSWORD).',
        ];
    }

    try {
        $transport->send($message);
        return ['sent' => true];
    } catch (Throwable $error) {
        error_log('Email send error: ' . $error->getMessage());
        return ['sent' => false, 'error' => $error->getMessage()];
    }
}

/** @return array<string,mixed> */
function clinicInfo(): array
{
    $settings = settingsStore()->read();
    $merged = array_merge(DEFAULT_CLINIC_SETTINGS, is_array($settings) ? $settings : []);
    return [
        'clinicName' => (string) ($merged['clinicName'] ?? ''),
        'doctorName' => (string) ($merged['doctorName'] ?? ''),
        'clinicAddress' => (string) ($merged['address'] ?? ''),
        'clinicPhone' => (string) ($merged['phone'] ?? ''),
        'clinicEmail' => (string) ($merged['email'] ?? ''),
    ];
}

/**
 * Every patient-facing email also goes to the clinic so nothing reaches a
 * patient without the clinic holding its own copy.
 *
 * @param array<string,mixed> $info
 * @return list<string>
 */
function adminRecipients(array $info): array
{
    $recipients = [];
    $fixed = (string) Config::get('ADMIN_NOTIFICATION_EMAIL', '');
    if ($fixed !== '' && isValidEmail($fixed)) {
        $recipients[] = $fixed;
    }
    $settingsEmail = trim((string) ($info['clinicEmail'] ?? ''));
    if ($settingsEmail !== '' && isValidEmail($settingsEmail) && !in_array($settingsEmail, $recipients, true)) {
        $recipients[] = $settingsEmail;
    }
    return $recipients;
}

/**
 * Shared admin copy for follow-up / report / billing notifications.
 *
 * @param array<string,mixed> $args
 */
function notifyAdminOfPatientEmail(array $args): void
{
    $info = $args['clinicInfo'];
    $recipients = adminRecipients($info);
    if ($recipients === []) {
        return;
    }

    $sectionHtml = (string) ($args['sectionHtml'] ?? '');
    $adminHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => (string) ($args['eyebrow'] ?? ''),
        'heading' => (string) ($args['heading'] ?? ''),
        'introHtml' => (string) ($args['introHtml'] ?? ''),
        'bodyHtml' => EmailTpl::detailTable($args['detailRows'] ?? [])
            . ($sectionHtml !== ''
                ? '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">'
                    . EmailTpl::escapeHtml($args['sectionTitle'] ?? '') . '</div>'
                    . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">'
                    . $sectionHtml . '</div>'
                : ''),
    ]);

    $message = [
        'to' => implode(', ', $recipients),
        'subject' => (string) ($args['subject'] ?? ''),
        'html' => $adminHtml,
    ];
    if (!empty($args['attachment'])) {
        $message['attachments'] = [$args['attachment']];
    }

    afterResponse(static function () use ($message): void {
        sendMailSafe($message);
    });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function handleHealth(): void
{
    respond(200, [
        'status' => 'ok',
        'service' => 'dr-rana-dental-clinic-api',
        'runtime' => 'php',
        'emailConfigured' => mailer()->configured,
        'watiConfigured' => wati()->configured,
    ]);
}

function handleSettingsGet(): void
{
    $settings = settingsStore()->read();
    respond(200, array_merge(DEFAULT_CLINIC_SETTINGS, is_array($settings) ? $settings : []));
}

function handleSettingsPut(): void
{
    requireAdmin();
    $body = jsonBody();
    if (array_is_list($body) && $body !== []) {
        fail(400, 'Expected a settings object.');
    }
    $next = array_merge(DEFAULT_CLINIC_SETTINGS, $body);
    settingsStore()->write($next);
    respond(200, ['success' => true, 'settings' => $next]);
}

function cleanupChallenges(array $challenges): array
{
    $nowMs = (int) round(microtime(true) * 1000);
    foreach ($challenges as $id => $challenge) {
        if ((int) ($challenge['expiresAt'] ?? 0) <= $nowMs) {
            unset($challenges[$id]);
        }
    }
    return $challenges;
}

function handleAdminLogin(): void
{
    ensureBootstrap();
    $body = jsonBody();

    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    if ($username === '' || $password === '') {
        fail(400, 'Username and password are required.');
    }

    $credentials = adminCredentialsStore()->read();
    if (!is_array($credentials)
        || $username !== ($credentials['username'] ?? '')
        || !Auth::verifyPassword($password, $credentials['passwordHash'] ?? '')) {
        fail(401, 'Invalid username or password.');
    }

    $code = (string) random_int(100000, 999999);
    $challengeId = Auth::randomHex(24);
    $targetEmail = admin2faEmailAddress();
    $nowMs = (int) round(microtime(true) * 1000);

    challengesStore()->update(static function ($current) use ($challengeId, $code, $credentials, $targetEmail, $nowMs): array {
        $challenges = cleanupChallenges(is_array($current) ? $current : []);
        $challenges[$challengeId] = [
            'code' => $code,
            'username' => (string) ($credentials['username'] ?? ADMIN_DEFAULT_USERNAME),
            'email' => $targetEmail,
            'expiresAt' => $nowMs + (10 * 60 * 1000),
            'attempts' => 0,
            'lastResentAt' => $nowMs,
        ];
        return $challenges;
    });

    $tempToken = Auth::signToken(
        ['role' => 'admin_2fa_pending', 'sub' => (string) ($credentials['username'] ?? ''), 'challengeId' => $challengeId],
        10 * 60,
        sessionSecret(),
    );

    $info = clinicInfo();
    $result = sendMailSafe([
        'to' => $targetEmail,
        'subject' => '🔐 Your Admin Login Code: ' . $code . ' - ' . $info['clinicName'],
        'html' => EmailTpl::admin2FAEmail($info, (string) ($credentials['username'] ?? ''), $code, 10),
    ]);

    if (!$result['sent']) {
        error_log('[2FA] Could not deliver email to ' . $targetEmail . ': ' . ($result['error'] ?? ''));
        if (!Config::isTest()) {
            error_log('[2FA FALLBACK] Admin verification code for ' . ($credentials['username'] ?? '') . ' is: ' . $code);
        }
    } else {
        error_log('[2FA] Verification code sent to ' . $targetEmail);
    }

    respond(200, array_merge([
        'success' => true,
        'require2FA' => true,
        'tempToken' => $tempToken,
        'email' => $targetEmail,
        'maskedEmail' => maskEmail($targetEmail),
        'message' => 'A 6-digit verification code has been sent to ' . $targetEmail . '.',
    ], Config::isTest() ? ['testOtpCode' => $code] : []));
}

function handleAdminVerify2fa(): void
{
    ensureBootstrap();
    $body = jsonBody();

    $tempToken = trim((string) ($body['tempToken'] ?? ''));
    $rawCode = preg_replace('/\D/', '', (string) ($body['code'] ?? '')) ?? '';

    if ($tempToken === '' || $rawCode === '') {
        fail(400, 'Verification session and 6-digit code are required.');
    }
    if (strlen($rawCode) !== 6) {
        fail(400, 'Code must be exactly 6 digits.');
    }

    $payload = Auth::verifyToken($tempToken, sessionSecret());
    if ($payload === null || ($payload['role'] ?? '') !== 'admin_2fa_pending' || empty($payload['challengeId'])) {
        fail(401, 'Verification session has expired or is invalid. Please sign in again.');
    }

    $challengeId = (string) $payload['challengeId'];
    $challenges = cleanupChallenges((array) challengesStore()->read());
    $challenge = $challenges[$challengeId] ?? null;
    if (!is_array($challenge)) {
        fail(401, 'Verification code has expired. Please sign in again.');
    }

    $nowMs = (int) round(microtime(true) * 1000);
    if ((int) ($challenge['expiresAt'] ?? 0) <= $nowMs) {
        challengesStore()->update(static function ($current) use ($challengeId): array {
            $next = is_array($current) ? $current : [];
            unset($next[$challengeId]);
            return $next;
        });
        fail(401, 'Verification code has expired. Please sign in again.');
    }

    if ((int) ($challenge['attempts'] ?? 0) >= 5) {
        challengesStore()->update(static function ($current) use ($challengeId): array {
            $next = is_array($current) ? $current : [];
            unset($next[$challengeId]);
            return $next;
        });
        fail(401, 'Too many incorrect attempts. Session invalidated. Please sign in again.');
    }

    if ((string) ($challenge['code'] ?? '') !== $rawCode) {
        $attempts = (int) ($challenge['attempts'] ?? 0) + 1;
        challengesStore()->update(static function ($current) use ($challengeId, $attempts): array {
            $next = is_array($current) ? $current : [];
            if (isset($next[$challengeId])) {
                if ($attempts >= 5) {
                    unset($next[$challengeId]);
                } else {
                    $next[$challengeId]['attempts'] = $attempts;
                }
            }
            return $next;
        });

        $remaining = 5 - $attempts;
        if ($remaining <= 0) {
            fail(401, 'Too many incorrect attempts. Session invalidated. Please sign in again.');
        }
        fail(400, 'Invalid code. ' . $remaining . ' attempt' . ($remaining === 1 ? '' : 's') . ' remaining.');
    }

    // One-time use: invalidate the challenge immediately.
    challengesStore()->update(static function ($current) use ($challengeId): array {
        $next = is_array($current) ? $current : [];
        unset($next[$challengeId]);
        return $next;
    });

    $credentials = adminCredentialsStore()->read();
    $tokenVersion = is_array($credentials) ? (int) ($credentials['tokenVersion'] ?? 1) : 1;

    respond(200, [
        'success' => true,
        'token' => Auth::signToken(
            ['role' => 'admin', 'sub' => (string) ($challenge['username'] ?? ''), 'v' => $tokenVersion],
            ADMIN_TOKEN_TTL_SECONDS,
            sessionSecret(),
        ),
        'username' => (string) ($challenge['username'] ?? ''),
    ]);
}

function handleAdminResend2fa(): void
{
    $body = jsonBody();
    $tempToken = trim((string) ($body['tempToken'] ?? ''));
    if ($tempToken === '') {
        fail(400, 'Verification session is required.');
    }

    $payload = Auth::verifyToken($tempToken, sessionSecret());
    if ($payload === null || ($payload['role'] ?? '') !== 'admin_2fa_pending' || empty($payload['challengeId'])) {
        fail(401, 'Verification session has expired. Please sign in again.');
    }

    $challengeId = (string) $payload['challengeId'];
    $challenges = cleanupChallenges((array) challengesStore()->read());
    $challenge = $challenges[$challengeId] ?? null;
    if (!is_array($challenge)) {
        fail(401, 'Verification session has expired. Please sign in again.');
    }

    $nowMs = (int) round(microtime(true) * 1000);
    $lastResentAt = (int) ($challenge['lastResentAt'] ?? 0);
    if ($lastResentAt > 0 && ($nowMs - $lastResentAt) < 30000) {
        $waitSeconds = (int) ceil((30000 - ($nowMs - $lastResentAt)) / 1000);
        fail(429, 'Please wait ' . $waitSeconds . 's before requesting a new code.');
    }

    $newCode = (string) random_int(100000, 999999);
    challengesStore()->update(static function ($current) use ($challengeId, $newCode, $nowMs): array {
        $next = is_array($current) ? $current : [];
        if (isset($next[$challengeId])) {
            $next[$challengeId]['code'] = $newCode;
            $next[$challengeId]['expiresAt'] = $nowMs + (10 * 60 * 1000);
            $next[$challengeId]['attempts'] = 0;
            $next[$challengeId]['lastResentAt'] = $nowMs;
        }
        return $next;
    });

    $info = clinicInfo();
    $targetEmail = (string) ($challenge['email'] ?? admin2faEmailAddress());
    $result = sendMailSafe([
        'to' => $targetEmail,
        'subject' => '🔐 Your Admin Login Code: ' . $newCode . ' - ' . $info['clinicName'],
        'html' => EmailTpl::admin2FAEmail($info, (string) ($challenge['username'] ?? ''), $newCode, 10),
    ]);

    if (!$result['sent']) {
        error_log('[2FA] Could not deliver resent email to ' . $targetEmail . ': ' . ($result['error'] ?? ''));
        if (!Config::isTest()) {
            error_log('[2FA FALLBACK] Resent Admin verification code is: ' . $newCode);
        }
    }

    respond(200, array_merge(
        ['success' => true, 'message' => 'A new 6-digit verification code has been sent to ' . $targetEmail . '.'],
        Config::isTest() ? ['testOtpCode' => $newCode] : [],
    ));
}

function handleAdminMe(): void
{
    requireAdmin();
    $credentials = adminCredentialsStore()->read();
    respond(200, [
        'success' => true,
        'username' => is_array($credentials) ? (string) ($credentials['username'] ?? ADMIN_DEFAULT_USERNAME) : ADMIN_DEFAULT_USERNAME,
    ]);
}

function handleAdminChangeCredentials(): void
{
    requireAdmin();
    $body = jsonBody();

    $nextUsername = trim((string) ($body['username'] ?? ''));
    $nextPassword = (string) ($body['password'] ?? '');
    if ($nextUsername === '') {
        fail(400, 'Username cannot be empty.');
    }

    $current = adminCredentialsStore()->read();
    $current = is_array($current) ? $current : ['passwordHash' => Auth::hashPassword(ADMIN_DEFAULT_PASSWORD), 'tokenVersion' => 1];
    $tokenVersion = (int) ($current['tokenVersion'] ?? 1) + 1;

    adminCredentialsStore()->write([
        'username' => $nextUsername,
        'passwordHash' => $nextPassword !== '' ? Auth::hashPassword($nextPassword) : (string) ($current['passwordHash'] ?? ''),
        'tokenVersion' => $tokenVersion,
    ]);

    respond(200, ['success' => true, 'username' => $nextUsername]);
}

function handlePatientRegister(): void
{
    ensureBootstrap();
    $body = jsonBody();

    $name = trim((string) ($body['patientName'] ?? $body['name'] ?? ''));
    $email = strtolower(trim((string) ($body['patientEmail'] ?? $body['email'] ?? '')));
    $phone = trim((string) ($body['patientPhone'] ?? $body['phone'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($name === '' || $email === '' || $phone === '' || $password === '') {
        fail(400, 'Name, email, phone and password are required.');
    }
    if (!isValidEmail($email)) {
        fail(400, 'Please enter a valid email address.');
    }
    if (strlen($password) < 6) {
        fail(400, 'Password must be at least 6 characters.');
    }

    $duplicate = false;
    $created = null;
    stores()['portal-patients']->update(static function ($current) use ($name, $email, $phone, $password, $body, &$duplicate, &$created): array {
        $records = is_array($current) ? $current : [];
        foreach ($records as $record) {
            if (($record['patientEmail'] ?? '') === $email) {
                $duplicate = true;
                return $records;
            }
        }

        $record = [
            'id' => 'patient-' . (int) round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(4)),
            'patientName' => $name,
            'patientEmail' => $email,
            'patientPhone' => $phone,
            'password' => Auth::hashPassword($password),
        ];
        foreach (['age', 'gender', 'address'] as $field) {
            if (isset($body[$field]) && trim((string) $body[$field]) !== '') {
                $record[$field] = trim((string) $body[$field]);
            }
        }

        $records[] = $record;
        $created = $record;
        return $records;
    });

    if ($duplicate || !is_array($created)) {
        fail(409, 'This email is already registered.');
    }

    respond(200, [
        'success' => true,
        'token' => Auth::signToken(['role' => 'patient', 'sub' => $created['id']], PATIENT_TOKEN_TTL_SECONDS, sessionSecret()),
        'patient' => publicPatient($created),
    ]);
}

function handlePatientLogin(): void
{
    $body = jsonBody();
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');
    if ($email === '' || $password === '') {
        fail(400, 'Email and password are required.');
    }

    $records = stores()['portal-patients']->read();
    $patient = null;
    foreach (is_array($records) ? $records : [] as $record) {
        if (($record['patientEmail'] ?? '') === $email) {
            $patient = $record;
            break;
        }
    }

    if (!is_array($patient) || !Auth::verifyPassword($password, $patient['password'] ?? '')) {
        fail(401, 'Invalid email or password.');
    }

    respond(200, [
        'success' => true,
        'token' => Auth::signToken(['role' => 'patient', 'sub' => $patient['id']], PATIENT_TOKEN_TTL_SECONDS, sessionSecret()),
        'patient' => publicPatient($patient),
    ]);
}

function handlePatientMe(): void
{
    $auth = requirePatient();
    $records = stores()['portal-patients']->read();
    foreach (is_array($records) ? $records : [] as $record) {
        if (($record['id'] ?? '') === ($auth['sub'] ?? '')) {
            respond(200, ['success' => true, 'patient' => publicPatient($record)]);
        }
    }
    fail(404, 'Patient not found.');
}

function handlePatientFollowUpPatch(string $id): void
{
    $auth = requirePatient();
    $body = jsonBody();
    $patientId = (string) ($auth['sub'] ?? '');

    $updates = [];
    foreach (['status', 'completedDate'] as $field) {
        if (array_key_exists($field, $body)) {
            $updates[$field] = $body[$field];
        }
    }

    $found = null;
    stores()['follow-ups']->update(static function ($current) use ($id, $patientId, $updates, &$found): array {
        $items = is_array($current) ? $current : [];
        foreach ($items as $index => $item) {
            if (($item['id'] ?? '') === $id && ($item['patientId'] ?? '') === $patientId) {
                $items[$index] = array_merge($item, $updates);
                $found = $items[$index];
                break;
            }
        }
        return $items;
    });

    if (!is_array($found)) {
        fail(404, 'Follow-up not found.');
    }
    respond(200, ['success' => true, 'followUp' => $found]);
}

function handlePatientConsentSign(string $id): void
{
    $auth = requirePatient();
    $patientId = (string) ($auth['sub'] ?? '');

    $found = null;
    stores()['consent-forms']->update(static function ($current) use ($id, $patientId, &$found): array {
        $items = is_array($current) ? $current : [];
        foreach ($items as $index => $item) {
            if (($item['id'] ?? '') === $id && ($item['patientId'] ?? '') === $patientId) {
                $items[$index] = array_merge($item, [
                    'isSigned' => true,
                    'signatureDate' => gmdate('Y-m-d\TH:i:s.v\Z'),
                ]);
                $found = $items[$index];
                break;
            }
        }
        return $items;
    });

    if (!is_array($found)) {
        fail(404, 'Consent form not found.');
    }
    respond(200, ['success' => true, 'consentForm' => $found]);
}

function handleDataGet(string $name): void
{
    $collections = collectionConfig();
    $config = $collections[$name] ?? null;
    if ($config === null || $name === 'media') {
        fail(404, 'Unknown collection.');
    }

    $auth = authenticateRequest();
    if ($auth === null) {
        fail(401, 'Authentication required.');
    }

    if (($auth['role'] ?? '') === 'admin') {
        $data = stores()[$name]->read();
        $data = is_array($data) ? $data : [];
        $stripFields = $config['stripFields'] ?? [];
        if ($stripFields !== []) {
            foreach ($data as $index => $item) {
                foreach ($stripFields as $field) {
                    unset($data[$index][$field]);
                }
            }
        }
        respond(200, array_values($data));
    }

    if (($auth['role'] ?? '') === 'patient'
        && empty($config['adminOnly'])
        && !empty($config['patientFilterField'])) {
        $field = (string) $config['patientFilterField'];
        $data = stores()[$name]->read();
        $filtered = [];
        foreach (is_array($data) ? $data : [] as $item) {
            if (($item[$field] ?? null) === ($auth['sub'] ?? null)) {
                $filtered[] = $item;
            }
        }
        respond(200, $filtered);
    }

    fail(403, 'You do not have access to this collection.');
}

function handleDataPut(string $name): void
{
    requireAdmin();
    $config = collectionConfig()[$name] ?? null;
    if ($config === null) {
        fail(404, 'Unknown collection.');
    }

    $body = jsonBody();
    if (!array_is_list($body)) {
        fail(400, 'Expected an array.');
    }

    stores()[$name]->write($body);
    respond(200, ['success' => true]);
}

function handleMediaGet(): void
{
    $media = stores()['media']->read();
    respond(200, is_array($media) ? array_values($media) : []);
}

/** @param string $buffer */
function verifyMediaSignature(string $buffer, string $contentType): bool
{
    $length = strlen($buffer);
    if ($length < 4) {
        return false;
    }

    switch ($contentType) {
        case 'image/jpeg':
            return ord($buffer[0]) === 0xFF && ord($buffer[1]) === 0xD8 && ord($buffer[2]) === 0xFF;
        case 'image/png':
            return $length >= 8 && substr($buffer, 0, 4) === "\x89PNG";
        case 'image/gif':
            return substr($buffer, 0, 4) === 'GIF8';
        case 'image/webp':
            return $length >= 12 && substr($buffer, 0, 4) === 'RIFF' && substr($buffer, 8, 4) === 'WEBP';
        case 'video/mp4':
        case 'video/quicktime':
            if ($length < 8) {
                return false;
            }
            $box = substr($buffer, 4, 4);
            return $box === 'ftyp' || $box === 'moov';
        case 'video/webm':
            return ord($buffer[0]) === 0x1A && ord($buffer[1]) === 0x45
                && ord($buffer[2]) === 0xDF && ord($buffer[3]) === 0xA3;
        default:
            return false;
    }
}

function handleMediaUpload(): void
{
    requireAdmin();
    $body = jsonBody(MAX_UPLOAD_BODY_BYTES);

    $contentType = (string) ($body['contentType'] ?? '');
    $allowed = [
        'image/jpeg' => '.jpg',
        'image/png' => '.png',
        'image/webp' => '.webp',
        'image/gif' => '.gif',
        'video/mp4' => '.mp4',
        'video/webm' => '.webm',
        'video/quicktime' => '.mov',
    ];
    $extension = $allowed[$contentType] ?? null;
    if ($extension === null) {
        fail(400, 'Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, WebM or MOV.');
    }

    $dataBase64 = $body['dataBase64'] ?? null;
    if (!is_string($dataBase64) || $dataBase64 === '') {
        fail(400, 'Missing file data.');
    }

    $decoded = base64_decode($dataBase64, true);
    if ($decoded === false) {
        fail(400, 'Invalid file data.');
    }

    $size = strlen($decoded);
    if ($size === 0 || $size > MAX_MEDIA_UPLOAD_BYTES) {
        fail(400, 'File must be between 1 byte and ' . intdiv(MAX_MEDIA_UPLOAD_BYTES, 1024 * 1024) . 'MB. For larger videos, paste a hosted URL instead.');
    }

    if (!verifyMediaSignature($decoded, $contentType)) {
        fail(400, 'File signature does not match declared media type.');
    }

    $uploadsDir = Config::uploadsDir();
    if (!is_dir($uploadsDir) && !@mkdir($uploadsDir, 0775, true) && !is_dir($uploadsDir)) {
        fail(500, 'Upload folder is not writable.');
    }

    $filename = (int) round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(8)) . $extension;
    if (@file_put_contents($uploadsDir . '/' . $filename, $decoded, LOCK_EX) === false) {
        fail(500, 'Could not save the uploaded file.');
    }

    respond(200, ['success' => true, 'url' => '/uploads/media/' . $filename]);
}

function handleBookingsGet(): void
{
    requireAdmin();
    $bookings = bookingsStore()->read();
    respond(200, is_array($bookings) ? array_values($bookings) : []);
}

function handleAppointmentCreate(): void
{
    requireAdmin();
    $body = jsonBody();

    foreach (['patientName', 'appointmentDate', 'appointmentTime', 'reason'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing required appointment fields.');
        }
    }

    $appointment = array_merge($body, [
        'id' => (string) ($body['id'] ?? ((int) round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(4)))),
        'durationMinutes' => $body['durationMinutes'] ?? 30,
        'status' => $body['status'] ?? 'scheduled',
        'bookingDate' => $body['bookingDate'] ?? gmdate('Y-m-d\TH:i:s.v\Z'),
    ]);

    $count = 0;
    bookingsStore()->update(static function ($current) use ($appointment, &$count): array {
        $list = is_array($current) ? $current : [];
        $list[] = $appointment;
        $count = count($list);
        return $list;
    });

    respond(200, [
        'success' => true,
        'message' => 'Appointment saved.',
        'appointment' => $appointment,
        'count' => $count,
    ]);
}

function handleAppointmentUpdate(string $id): void
{
    requireAdmin();
    $body = jsonBody();

    $found = null;
    bookingsStore()->update(static function ($current) use ($id, $body, &$found): array {
        $list = is_array($current) ? $current : [];
        foreach ($list as $index => $item) {
            if (($item['id'] ?? '') === $id) {
                $list[$index] = array_merge($item, $body);
                $found = $list[$index];
                break;
            }
        }
        return $list;
    });

    if (!is_array($found)) {
        fail(404, 'Appointment not found.');
    }
    respond(200, ['success' => true, 'message' => 'Appointment updated.', 'appointment' => $found]);
}

function handleSendBooking(): void
{
    $body = jsonBody();

    foreach (['patientName', 'patientEmail', 'patientPhone', 'appointmentDate', 'appointmentTime', 'reason'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing booking fields.');
        }
    }
    $patientEmail = trim((string) $body['patientEmail']);
    if (!isValidEmail($patientEmail)) {
        fail(400, 'Please enter a valid email address.');
    }

    $info = clinicInfo();
    $now = gmdate('Y-m-d\TH:i:s.v\Z');
    $booking = [
        'id' => (int) round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(4)),
        'patientName' => (string) $body['patientName'],
        'patientEmail' => $patientEmail,
        'patientPhone' => (string) $body['patientPhone'],
        'appointmentDate' => (string) $body['appointmentDate'],
        'appointmentTime' => (string) $body['appointmentTime'],
        'reason' => (string) $body['reason'],
        'status' => 'scheduled',
        'bookingDate' => $now,
        'createdAt' => $now,
    ];

    bookingsStore()->update(static function ($current) use ($booking): array {
        $list = is_array($current) ? $current : [];
        $list[] = $booking;
        return $list;
    });

    $reference = strtoupper(explode('-', $booking['id'])[0]);

    $patientHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Reference #' . $reference,
        'heading' => 'Appointment Confirmed',
        'greetingName' => $booking['patientName'],
        'introHtml' => 'Thank you for booking an appointment with <strong>' . EmailTpl::escapeHtml($info['clinicName']) . '</strong>. Here are your appointment details:',
        'bodyHtml' => EmailTpl::highlightBox(
            '<strong>' . EmailTpl::escapeHtml(Pdf::formatDateText($booking['appointmentDate'])) . '</strong> at <strong>'
            . EmailTpl::escapeHtml($booking['appointmentTime']) . '</strong>'
        ) . EmailTpl::detailTable([
            ['Patient Name', $booking['patientName']],
            ['Phone', $booking['patientPhone']],
            ['Reason for Visit', $booking['reason']],
            ['Booking Reference', $reference],
        ]) . '<p style="font-size:14px;color:#1f2937;line-height:1.6;">Our team will contact you at <strong>'
            . EmailTpl::escapeHtml($booking['patientPhone'])
            . '</strong> to confirm this appointment. If anything about the date or time doesn\'t work for you, please call the clinic.</p>',
    ]);

    $adminHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Reference #' . $reference,
        'heading' => 'New Appointment Booking',
        'introHtml' => 'A new appointment was just booked through the website.',
        'bodyHtml' => EmailTpl::detailTable([
            ['Patient Name', $booking['patientName']],
            ['Email', $patientEmail],
            ['Phone', $booking['patientPhone']],
            ['Appointment Date', Pdf::formatDateText($booking['appointmentDate'])],
            ['Appointment Time', $booking['appointmentTime']],
            ['Reason for Visit', $booking['reason']],
            ['Booking Reference', $reference],
        ]),
    ]);

    $recipients = adminRecipients($info);

    $patientName = (string) $booking['patientName'];
    afterResponse(static function () use ($patientEmail, $patientName, $patientHtml, $adminHtml, $recipients, $info): void {
        $result = sendMailSafe([
            'to' => $patientEmail,
            'subject' => $info['clinicName'] . ' - Appointment Confirmation',
            'html' => $patientHtml,
        ]);
        if (!$result['sent']) {
            error_log('Booking confirmation email failed: ' . ($result['error'] ?? ''));
        }
        if ($recipients !== []) {
            sendMailSafe([
                'to' => implode(', ', $recipients),
                'subject' => 'New Appointment Booking - ' . $patientName,
                'html' => $adminHtml,
            ]);
        }
    });

    $whatsapp = wati()->sendBookingWhatsApp(
        (string) $booking['patientName'],
        $booking['patientPhone'],
        Pdf::formatDateText($booking['appointmentDate']),
        (string) $booking['appointmentTime'],
        (string) $info['clinicPhone'],
    );

    respond(200, [
        'success' => true,
        'message' => mailer()->configured
            ? 'Booking received. Confirmation email is being sent.'
            : 'Booking received and saved. Email notifications are disabled on the server right now.',
        'notifications' => ['whatsapp' => $whatsapp],
    ]);
}

function handleSendPrescription(): void
{
    requireAdmin();
    $body = jsonBody();

    foreach (['patientName', 'suffering', 'prescription'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing required prescription fields.');
        }
    }
    $patientEmail = trim((string) ($body['patientEmail'] ?? ''));
    if ($patientEmail === '' || !isValidEmail($patientEmail)) {
        fail(400, 'Valid patient email is required to send the prescription.');
    }

    $info = clinicInfo();
    $pdfData = array_merge($body, ['clinicInfo' => $info, 'patientEmail' => $patientEmail]);
    $pdfBuffer = Pdf::prescriptionPdf($pdfData);

    $filename = (int) round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(8)) . '-prescription.pdf';
    $directory = Config::prescriptionsDir();
    if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
        fail(500, 'Could not create the prescription folder.');
    }
    if (@file_put_contents($directory . '/' . $filename, $pdfBuffer, LOCK_EX) === false) {
        fail(500, 'Could not save the prescription PDF.');
    }

    $downloadToken = Auth::signToken(
        ['role' => 'prescription_download', 'filename' => $filename],
        48 * 3600,
        sessionSecret(),
    );
    $pathname = '/api/prescriptions/' . rawurlencode($filename) . '?token=' . $downloadToken;
    $localUrl = siteOrigin() . $pathname;
    $publicAppUrl = (string) Config::get('PUBLIC_APP_URL', '');
    $publicUrl = $publicAppUrl !== '' ? rtrim($publicAppUrl, '/') . $pathname : $localUrl;

    $settings = settingsStore()->read();
    $footer = is_array($settings) ? (string) ($settings['prescriptionFooter'] ?? '') : '';
    if ($footer === '') {
        $footer = DEFAULT_CLINIC_SETTINGS['prescriptionFooter'];
    }

    $patientHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Prescription',
        'heading' => 'Your ' . $info['clinicName'] . ' Prescription',
        'greetingName' => (string) $body['patientName'],
        'introHtml' => 'Your prescription has been prepared by <strong>' . EmailTpl::escapeHtml($info['doctorName']) . '</strong>. The full prescription is attached as a PDF, and a summary is below.',
        'bodyHtml' => EmailTpl::detailTable([
            ['Diagnosis', $body['suffering'] ?? ''],
            ['Visit Date', Pdf::formatDateText($body['visitDate'] ?? ($body['prescriptionDate'] ?? ''))],
            ['Gender', $body['gender'] ?? ''],
            ['Age', $body['age'] ?? ''],
            ['Phone', $body['patientPhone'] ?? ''],
            ['Address', $body['address'] ?? ''],
        ])
            . '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Prescription</div>'
            . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap;">'
            . EmailTpl::multilineHtml($body['prescription'] ?? '') . '</div>'
            . EmailTpl::detailTable([
                ['Total Fees', Pdf::formatMoneyText($body['totalFees'] ?? '')],
                ['Amount Paid', Pdf::formatMoneyText($body['amountPaid'] ?? '')],
                ['Payment Status', $body['paymentStatus'] ?? ''],
                ['Next Appointment', Pdf::formatDateText($body['nextAppointmentDate'] ?? '')],
                ['Notes', $body['notes'] ?? ''],
            ])
            . '<p style="font-size:14px;color:#1f2937;line-height:1.6;margin-top:20px;">' . EmailTpl::escapeHtml($footer) . '</p>',
    ]);

    $attachment = ['filename' => 'prescription.pdf', 'content' => $pdfBuffer, 'contentType' => 'application/pdf'];

    $emailResult = sendMailSafe([
        'to' => $patientEmail,
        'subject' => $info['clinicName'] . ' - Your Prescription PDF',
        'html' => $patientHtml,
        'attachments' => [$attachment],
    ]);

    $recipients = adminRecipients($info);
    if ($recipients !== [] && $emailResult['sent']) {
        $adminHtml = EmailTpl::emailShell([
            'clinicInfo' => $info,
            'eyebrow' => 'Prescription Sent',
            'heading' => 'Prescription sent to ' . (string) $body['patientName'],
            'introHtml' => 'A copy of the prescription just sent to the patient, for your records.',
            'bodyHtml' => EmailTpl::detailTable([
                ['Patient Name', $body['patientName'] ?? ''],
                ['Email', $patientEmail],
                ['Phone', $body['patientPhone'] ?? ''],
                ['Diagnosis', $body['suffering'] ?? ''],
                ['Visit Date', Pdf::formatDateText($body['visitDate'] ?? ($body['prescriptionDate'] ?? ''))],
            ])
                . '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Prescription</div>'
                . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap;">'
                . EmailTpl::multilineHtml($body['prescription'] ?? '') . '</div>'
                . EmailTpl::detailTable([
                    ['Total Fees', Pdf::formatMoneyText($body['totalFees'] ?? '')],
                    ['Amount Paid', Pdf::formatMoneyText($body['amountPaid'] ?? '')],
                    ['Payment Status', $body['paymentStatus'] ?? ''],
                    ['Next Appointment', Pdf::formatDateText($body['nextAppointmentDate'] ?? '')],
                ]),
        ]);

        $message = [
            'to' => implode(', ', $recipients),
            'subject' => 'Prescription Sent - ' . (string) $body['patientName'],
            'html' => $adminHtml,
            'attachments' => [$attachment],
        ];
        afterResponse(static function () use ($message): void {
            sendMailSafe($message);
        });
    }

    $whatsapp = wati()->sendPrescriptionWhatsApp(
        (string) $body['patientName'],
        $body['patientPhone'] ?? '',
        $publicAppUrl !== '' ? $publicUrl : '',
        (string) $info['clinicPhone'],
    );

    respond(200, [
        'success' => $emailResult['sent'],
        'message' => $emailResult['sent']
            ? 'Prescription email sent successfully.'
            : 'Prescription PDF generated, but the email failed to send: ' . ($emailResult['error'] ?? ''),
        'prescriptionPdf' => ['filename' => $filename, 'localUrl' => $localUrl, 'publicUrl' => $publicUrl],
        'notifications' => ['email' => $emailResult, 'whatsapp' => $whatsapp],
    ]);
}

function handlePrescriptionDownload(string $filename): void
{
    if (preg_match('/^[a-zA-Z0-9._-]+\.pdf$/', $filename) !== 1) {
        fail(400, 'Invalid file name.');
    }

    $directory = Config::prescriptionsDir();
    $filePath = $directory . '/' . $filename;
    if (!is_file($filePath)) {
        fail(404, 'File not found.');
    }

    $auth = authenticateRequest();
    $authorized = $auth !== null && in_array($auth['role'] ?? '', ['admin', 'patient'], true);

    if (!$authorized) {
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($token !== '') {
            $payload = Auth::verifyToken($token, sessionSecret());
            if ($payload !== null
                && ($payload['role'] ?? '') === 'prescription_download'
                && ($payload['filename'] ?? '') === $filename) {
                $authorized = true;
            }
        }
    }

    if (!$authorized) {
        fail(403, 'Access denied. Valid authorization or download token required.');
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="' . $filename . '"');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . (string) filesize($filePath));
    header('Cache-Control: private, no-store');
    readfile($filePath);
    exit;
}

function handleSendFollowUp(): void
{
    requireAdmin();
    $body = jsonBody();

    foreach (['patientName', 'title', 'dueDate', 'type'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing required follow-up fields.');
        }
    }
    $patientEmail = trim((string) ($body['patientEmail'] ?? ''));
    if ($patientEmail === '' || !isValidEmail($patientEmail)) {
        fail(400, 'Valid patient email is required to send the follow-up reminder.');
    }

    $info = clinicInfo();
    $pdfBuffer = Pdf::followUpPdf(array_merge($body, ['clinicInfo' => $info, 'patientEmail' => $patientEmail]));
    $attachment = ['filename' => 'follow-up.pdf', 'content' => $pdfBuffer, 'contentType' => 'application/pdf'];

    $description = (string) ($body['description'] ?? '');
    $patientHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Follow-up Reminder',
        'heading' => (string) $body['title'],
        'greetingName' => (string) $body['patientName'],
        'introHtml' => 'Your care team has created a follow-up task for you. A full copy is attached as a PDF.',
        'bodyHtml' => EmailTpl::highlightBox('Due <strong>' . EmailTpl::escapeHtml(Pdf::formatDateText($body['dueDate'])) . '</strong>')
            . EmailTpl::detailTable([
                ['Task', $body['title']],
                ['Type', $body['type']],
                ['Due Date', Pdf::formatDateText($body['dueDate'])],
            ])
            . ($description !== ''
                ? '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Instructions</div>'
                    . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">'
                    . EmailTpl::multilineHtml($description) . '</div>'
                : ''),
    ]);

    $emailResult = sendMailSafe([
        'to' => $patientEmail,
        'subject' => $info['clinicName'] . ' - Follow-up Reminder',
        'html' => $patientHtml,
        'attachments' => [$attachment],
    ]);

    if ($emailResult['sent']) {
        notifyAdminOfPatientEmail([
            'clinicInfo' => $info,
            'subject' => 'Follow-up Reminder Sent - ' . (string) $body['patientName'],
            'eyebrow' => 'Follow-up Sent',
            'heading' => 'Follow-up sent to ' . (string) $body['patientName'],
            'introHtml' => 'A copy of the follow-up reminder just sent to the patient, for your records.',
            'detailRows' => [
                ['Patient Name', $body['patientName']],
                ['Email', $patientEmail],
                ['Phone', $body['patientPhone'] ?? ''],
                ['Task', $body['title']],
                ['Type', $body['type']],
                ['Due Date', Pdf::formatDateText($body['dueDate'])],
            ],
            'sectionTitle' => 'Instructions',
            'sectionHtml' => $description !== '' ? EmailTpl::multilineHtml($description) : '',
            'attachment' => $attachment,
        ]);
    }

    respond(200, [
        'success' => $emailResult['sent'],
        'message' => $emailResult['sent'] ? 'Follow-up email sent successfully.' : 'Follow-up email failed: ' . ($emailResult['error'] ?? ''),
        'notifications' => ['email' => $emailResult],
    ]);
}

function handleSendReport(): void
{
    requireAdmin();
    $body = jsonBody();

    foreach (['patientName', 'reportType', 'title', 'date'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing required report fields.');
        }
    }
    $patientEmail = trim((string) ($body['patientEmail'] ?? ''));
    if ($patientEmail === '' || !isValidEmail($patientEmail)) {
        fail(400, 'Valid patient email is required to send the report.');
    }

    $info = clinicInfo();
    $pdfBuffer = Pdf::reportPdf(array_merge($body, ['clinicInfo' => $info, 'patientEmail' => $patientEmail]));
    $attachment = ['filename' => 'medical-report.pdf', 'content' => $pdfBuffer, 'contentType' => 'application/pdf'];
    $description = (string) ($body['description'] ?? '');

    $patientHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Medical Report',
        'heading' => (string) $body['title'],
        'greetingName' => (string) $body['patientName'],
        'introHtml' => 'Your medical report is ready. A full copy is attached as a PDF.',
        'bodyHtml' => EmailTpl::detailTable([
            ['Report Type', $body['reportType']],
            ['Title', $body['title']],
            ['Date', Pdf::formatDateText($body['date'])],
        ]) . ($description !== ''
            ? '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Report Summary</div>'
                . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">'
                . EmailTpl::multilineHtml($description) . '</div>'
            : ''),
    ]);

    $emailResult = sendMailSafe([
        'to' => $patientEmail,
        'subject' => $info['clinicName'] . ' - Medical Report',
        'html' => $patientHtml,
        'attachments' => [$attachment],
    ]);

    if ($emailResult['sent']) {
        notifyAdminOfPatientEmail([
            'clinicInfo' => $info,
            'subject' => 'Medical Report Sent - ' . (string) $body['patientName'],
            'eyebrow' => 'Report Sent',
            'heading' => 'Report sent to ' . (string) $body['patientName'],
            'introHtml' => 'A copy of the medical report just sent to the patient, for your records.',
            'detailRows' => [
                ['Patient Name', $body['patientName']],
                ['Email', $patientEmail],
                ['Phone', $body['patientPhone'] ?? ''],
                ['Report Type', $body['reportType']],
                ['Title', $body['title']],
                ['Date', Pdf::formatDateText($body['date'])],
            ],
            'sectionTitle' => 'Report Summary',
            'sectionHtml' => $description !== '' ? EmailTpl::multilineHtml($description) : '',
            'attachment' => $attachment,
        ]);
    }

    respond(200, [
        'success' => $emailResult['sent'],
        'message' => $emailResult['sent'] ? 'Medical report email sent successfully.' : 'Medical report email failed: ' . ($emailResult['error'] ?? ''),
        'notifications' => ['email' => $emailResult],
    ]);
}

function handleSendBilling(): void
{
    requireAdmin();
    $body = jsonBody();

    foreach (['patientName', 'claimId', 'insuranceProvider', 'submissionDate'] as $field) {
        if (trim((string) ($body[$field] ?? '')) === '') {
            fail(400, 'Missing required billing fields.');
        }
    }
    if (!isset($body['amount']) || $body['amount'] === null || $body['amount'] === '') {
        fail(400, 'Missing required billing fields.');
    }
    $patientEmail = trim((string) ($body['patientEmail'] ?? ''));
    if ($patientEmail === '' || !isValidEmail($patientEmail)) {
        fail(400, 'Valid patient email is required to send the billing summary.');
    }

    $info = clinicInfo();
    $pdfBuffer = Pdf::billingPdf(array_merge($body, ['clinicInfo' => $info, 'patientEmail' => $patientEmail]));
    $attachment = ['filename' => 'billing-summary.pdf', 'content' => $pdfBuffer, 'contentType' => 'application/pdf'];
    $notes = (string) ($body['notes'] ?? '');

    $patientHtml = EmailTpl::emailShell([
        'clinicInfo' => $info,
        'eyebrow' => 'Billing Summary',
        'heading' => 'Claim ' . (string) $body['claimId'],
        'greetingName' => (string) $body['patientName'],
        'introHtml' => 'Your billing summary and insurance claim details are ready. A full copy is attached as a PDF.',
        'bodyHtml' => EmailTpl::highlightBox(
            'Amount: <strong>' . EmailTpl::escapeHtml(Pdf::formatMoneyText($body['amount'])) . '</strong> &bull; Status: <strong>'
            . EmailTpl::escapeHtml($body['status'] ?? '') . '</strong>'
        ) . EmailTpl::detailTable([
            ['Claim ID', $body['claimId']],
            ['Insurance Provider', $body['insuranceProvider']],
            ['Policy Number', $body['policyNumber'] ?? ''],
            ['Treatment Date', Pdf::formatDateText($body['treatmentDate'] ?? '')],
            ['Amount', Pdf::formatMoneyText($body['amount'])],
            ['Status', $body['status'] ?? ''],
            ['Submission Date', Pdf::formatDateText($body['submissionDate'])],
        ]) . ($notes !== ''
            ? '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Notes</div>'
                . '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">'
                . EmailTpl::multilineHtml($notes) . '</div>'
            : ''),
    ]);

    $emailResult = sendMailSafe([
        'to' => $patientEmail,
        'subject' => $info['clinicName'] . ' - Billing Summary',
        'html' => $patientHtml,
        'attachments' => [$attachment],
    ]);

    if ($emailResult['sent']) {
        notifyAdminOfPatientEmail([
            'clinicInfo' => $info,
            'subject' => 'Billing Summary Sent - ' . (string) $body['patientName'],
            'eyebrow' => 'Billing Sent',
            'heading' => 'Billing summary sent to ' . (string) $body['patientName'],
            'introHtml' => 'A copy of the billing summary just sent to the patient, for your records.',
            'detailRows' => [
                ['Patient Name', $body['patientName']],
                ['Email', $patientEmail],
                ['Phone', $body['patientPhone'] ?? ''],
                ['Claim ID', $body['claimId']],
                ['Insurance Provider', $body['insuranceProvider']],
                ['Policy Number', $body['policyNumber'] ?? ''],
                ['Treatment Date', Pdf::formatDateText($body['treatmentDate'] ?? '')],
                ['Amount', Pdf::formatMoneyText($body['amount'])],
                ['Status', $body['status'] ?? ''],
                ['Submission Date', Pdf::formatDateText($body['submissionDate'])],
            ],
            'sectionTitle' => 'Notes',
            'sectionHtml' => $notes !== '' ? EmailTpl::multilineHtml($notes) : '',
            'attachment' => $attachment,
        ]);
    }

    respond(200, [
        'success' => $emailResult['sent'],
        'message' => $emailResult['sent'] ? 'Billing email sent successfully.' : 'Billing email failed: ' . ($emailResult['error'] ?? ''),
        'notifications' => ['email' => $emailResult],
    ]);
}

// ---------------------------------------------------------------------------
// Admin backup
// ---------------------------------------------------------------------------

function handleAdminBackup(): void
{
    requireAdmin();

    // Stream straight to the client: nothing is buffered and the archive is
    // never held in memory, so this works for large media folders too.
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    ignore_user_abort(true);
    @set_time_limit(0);

    $handle = fopen('php://output', 'wb');
    if ($handle === false) {
        fail(500, 'Could not open the backup stream.');
    }

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="clinic-backup-' . date('Ymd-His') . '.zip"');
    header('Cache-Control: no-store');

    $zip = new ZipStream($handle);

    foreach (glob(dataDir() . '/*') ?: [] as $path) {
        // Pending 2FA challenges are transient state, not clinic data.
        if (is_file($path) && basename($path) !== '2fa-challenges.json') {
            $zip->addFile('data/' . basename($path), $path);
        }
    }
    foreach (glob(Config::prescriptionsDir() . '/*.pdf') ?: [] as $path) {
        $zip->addFile('data/runtime-prescriptions/' . basename($path), $path);
    }
    foreach (glob(Config::uploadsDir() . '/*') ?: [] as $path) {
        if (is_file($path)) {
            $zip->addFile('uploads/media/' . basename($path), $path);
        }
    }

    $zip->finish();
    fclose($handle);
    exit;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');

$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) Config::get('ALLOWED_ORIGINS', '')),
)));
if ($allowedOrigins !== []) {
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $sameOrigin = $origin !== '' && $origin === siteOrigin();
    if ($origin !== '' && ($sameOrigin || in_array($origin, $allowedOrigins, true))) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
}

$path = requestPath();
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if (in_array($path, ['/admin/login', '/patient/login', '/patient/register'], true)) {
    $limited = (new RateLimiter(dataDir(), 'auth', 15 * 60, 20, 'Too many authentication attempts. Please try again in 15 minutes.'))->check();
    if ($limited !== null) {
        respond(429, $limited);
    }
}
if ($path === '/send-booking') {
    $limited = (new RateLimiter(dataDir(), 'booking', 60 * 60, 30, 'Too many booking requests from this network. Please try again later.'))->check();
    if ($limited !== null) {
        respond(429, $limited);
    }
}

$routes = [
    ['GET', '#^/health$#', 'handleHealth'],

    ['GET', '#^/settings$#', 'handleSettingsGet'],
    ['PUT', '#^/settings$#', 'handleSettingsPut'],

    ['POST', '#^/admin/login$#', 'handleAdminLogin'],
    ['POST', '#^/admin/verify-2fa$#', 'handleAdminVerify2fa'],
    ['POST', '#^/admin/resend-2fa$#', 'handleAdminResend2fa'],
    ['GET', '#^/admin/me$#', 'handleAdminMe'],
    ['POST', '#^/admin/change-credentials$#', 'handleAdminChangeCredentials'],
    ['POST', '#^/admin/media-upload$#', 'handleMediaUpload'],
    ['GET', '#^/admin/backup$#', 'handleAdminBackup'],

    ['POST', '#^/patient/register$#', 'handlePatientRegister'],
    ['POST', '#^/patient/login$#', 'handlePatientLogin'],
    ['GET', '#^/patient/me$#', 'handlePatientMe'],
    ['PATCH', '#^/patient/follow-ups/([^/]+)$#', 'handlePatientFollowUpPatch'],
    ['POST', '#^/patient/consent-forms/([^/]+)/sign$#', 'handlePatientConsentSign'],

    ['GET', '#^/data/([^/]+)$#', 'handleDataGet'],
    ['PUT', '#^/data/([^/]+)$#', 'handleDataPut'],

    ['GET', '#^/media$#', 'handleMediaGet'],

    ['GET', '#^/bookings$#', 'handleBookingsGet'],
    ['POST', '#^/appointments$#', 'handleAppointmentCreate'],
    ['PUT', '#^/appointments/([^/]+)$#', 'handleAppointmentUpdate'],

    ['POST', '#^/send-booking$#', 'handleSendBooking'],
    ['POST', '#^/send-prescription$#', 'handleSendPrescription'],
    ['GET', '#^/prescriptions/([^/]+)$#', 'handlePrescriptionDownload'],
    ['POST', '#^/send-followup$#', 'handleSendFollowUp'],
    ['POST', '#^/send-report$#', 'handleSendReport'],
    ['POST', '#^/send-billing$#', 'handleSendBilling'],
];

try {
    foreach ($routes as [$verb, $pattern, $handler]) {
        if ($verb !== $method) {
            continue;
        }
        if (preg_match($pattern, $path, $matches) === 1) {
            $handler(...array_slice($matches, 1));
            exit;
        }
    }
} catch (Throwable $error) {
    error_log('Unhandled API error on ' . $method . ' ' . $path . ': ' . $error->getMessage());
    fail(500, 'Server error: ' . $error->getMessage());
}

fail(404, 'API route not found.');
