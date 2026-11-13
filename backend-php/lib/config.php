<?php
// Configuration loader.
//
// Production (InfinityFree) has no environment variables, so config.php is the
// single source of truth there. Locally the same keys can be supplied through
// the environment instead, which is what the smoke test does to get a
// throwaway DATA_DIR and blanked email/WhatsApp credentials.

declare(strict_types=1);

final class Config
{
    /** Keys that may be overridden from the environment (tests / local dev). */
    private const ENV_KEYS = [
        'DATA_DIR', 'UPLOADS_DIR', 'SESSION_SECRET',
        'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'EMAIL_USER', 'EMAIL_PASSWORD',
        'ADMIN_NOTIFICATION_EMAIL', 'ADMIN_2FA_EMAIL', 'PUBLIC_APP_URL',
        'ALLOWED_ORIGINS', 'CLINIC_PHONE',
        'WATI_API_ENDPOINT', 'WATI_ACCESS_TOKEN', 'WATI_CHANNEL_NUMBER',
        'WATI_DEFAULT_COUNTRY_CODE', 'WATI_APPOINTMENT_TEMPLATE_NAME',
        'WATI_PRESCRIPTION_TEMPLATE_NAME', 'WATI_APPOINTMENT_BROADCAST_NAME',
        'WATI_PRESCRIPTION_BROADCAST_NAME', 'WATI_PRESCRIPTION_PDF_PARAM_NAME',
        'APP_ENV', 'TEST_MODE',
    ];

    private static ?array $values = null;

    public static function all(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        $baseDir = dirname(__DIR__);
        $values = [];

        // CLINIC_CONFIG_FILE lets the smoke test ignore a real config.php so it
        // can never pick up live email/WhatsApp credentials.
        $override = getenv('CLINIC_CONFIG_FILE');
        $configFile = $override !== false ? (string) $override : $baseDir . '/config.php';
        if (is_file($configFile)) {
            $loaded = require $configFile;
            if (is_array($loaded)) {
                $values = $loaded;
            }
        }

        foreach (self::ENV_KEYS as $key) {
            $fromEnv = getenv($key);
            if ($fromEnv !== false && $fromEnv !== '') {
                $values[$key] = $fromEnv;
            }
        }

        $values += [
            'DATA_DIR' => $baseDir . '/data',
            'UPLOADS_DIR' => $baseDir . '/uploads/media',
            'SESSION_SECRET' => '',
            'RESEND_API_KEY' => '',
            'RESEND_FROM_EMAIL' => '',
            'EMAIL_USER' => '',
            'EMAIL_PASSWORD' => '',
            'ADMIN_NOTIFICATION_EMAIL' => '',
            'ADMIN_2FA_EMAIL' => '',
            'PUBLIC_APP_URL' => '',
            'ALLOWED_ORIGINS' => '',
            'CLINIC_PHONE' => '090414 81946',
            'WATI_API_ENDPOINT' => '',
            'WATI_ACCESS_TOKEN' => '',
            'WATI_CHANNEL_NUMBER' => '',
            'WATI_DEFAULT_COUNTRY_CODE' => '91',
            'WATI_APPOINTMENT_TEMPLATE_NAME' => 'appointment_confirmation',
            'WATI_PRESCRIPTION_TEMPLATE_NAME' => 'prescription_pdf',
            'WATI_APPOINTMENT_BROADCAST_NAME' => 'appointment_confirmation',
            'WATI_PRESCRIPTION_BROADCAST_NAME' => 'prescription_pdf',
            'WATI_PRESCRIPTION_PDF_PARAM_NAME' => 'pdfLink',
            'APP_ENV' => 'production',
        ];

        $values['DATA_DIR'] = rtrim((string) $values['DATA_DIR'], '/\\');
        $values['UPLOADS_DIR'] = rtrim((string) $values['UPLOADS_DIR'], '/\\');

        self::$values = $values;
        return $values;
    }

    public static function get(string $key, $default = null)
    {
        $values = self::all();
        $value = $values[$key] ?? $default;
        return is_string($value) ? trim($value) : $value;
    }

    public static function isTest(): bool
    {
        $testMode = self::get('TEST_MODE', '');
        if ($testMode === '1' || $testMode === 'true') {
            return true;
        }
        return strtolower((string) self::get('APP_ENV', 'production')) === 'test';
    }

    public static function dataDir(): string
    {
        return (string) self::get('DATA_DIR', sys_get_temp_dir() . '/clinic-data');
    }

    public static function uploadsDir(): string
    {
        return (string) self::get('UPLOADS_DIR', self::dataDir() . '/uploads');
    }

    public static function prescriptionsDir(): string
    {
        return self::dataDir() . '/runtime-prescriptions';
    }

}
