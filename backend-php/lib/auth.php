<?php
// Password hashing and stateless signed session tokens.
//
// Tokens keep the exact wire format of lib/auth.cjs -- "<base64url(json)>.
// <base64url(hmac-sha256)>" -- so the same SESSION_SECRET produces the same
// kind of token and the rest of the app (and the existing frontend) does not
// care which runtime minted it.
//
// Passwords use PHP's password_hash()/password_verify(). Node's `scrypt:…`
// hashes cannot be verified here (PHP has no scrypt binding), so imported
// accounts from the Render data folder get a fresh hash -- see
// scripts/import-json-data.php.

declare(strict_types=1);

final class Auth
{
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    public static function verifyPassword(string $password, $stored): bool
    {
        if (!is_string($stored) || $stored === '') {
            return false;
        }
        if (str_starts_with($stored, 'scrypt:')) {
            // Came from the Node backend; needs a reset (see import script).
            return false;
        }
        return password_verify($password, $stored);
    }

    public static function base64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $input): string
    {
        $padded = strtr($input, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder !== 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);
        return $decoded === false ? '' : $decoded;
    }

    /** @param array<string,mixed> $payload */
    public static function signToken(array $payload, int $ttlSeconds, string $secret): string
    {
        $now = time();
        $body = $payload + ['iat' => $now, 'exp' => $now + $ttlSeconds];
        $payloadPart = self::base64UrlEncode((string) json_encode($body, JSON_UNESCAPED_SLASHES));
        $signature = hash_hmac('sha256', $payloadPart, $secret, true);
        return $payloadPart . '.' . self::base64UrlEncode($signature);
    }

    /** @return array<string,mixed>|null */
    public static function verifyToken(string $token, string $secret): ?array
    {
        if ($token === '' || !str_contains($token, '.')) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
            return null;
        }
        [$payloadPart, $sigPart] = $parts;

        $expected = self::base64UrlEncode(hash_hmac('sha256', $payloadPart, $secret, true));
        if (!hash_equals($expected, $sigPart)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($payloadPart), true);
        if (!is_array($payload) || !isset($payload['exp']) || !is_numeric($payload['exp'])) {
            return null;
        }
        if (time() > (int) $payload['exp']) {
            return null;
        }

        return $payload;
    }

    public static function bearerToken(): string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if ($header === '' && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            foreach ($headers as $name => $value) {
                if (strcasecmp($name, 'Authorization') === 0) {
                    $header = $value;
                    break;
                }
            }
        }
        if (preg_match('/^Bearer\s+(.+)$/i', trim((string) $header), $matches) === 1) {
            return trim($matches[1]);
        }
        return '';
    }

    public static function randomHex(int $bytes): string
    {
        return bin2hex(random_bytes($bytes));
    }

    public static function sessionSecret(string $dataDir): string
    {
        $configured = (string) Config::get('SESSION_SECRET', '');
        if ($configured !== '') {
            return $configured;
        }

        $secretPath = $dataDir . '/.session-secret';
        if (is_file($secretPath)) {
            $existing = trim((string) @file_get_contents($secretPath));
            if ($existing !== '') {
                return $existing;
            }
        }

        $generated = self::randomHex(48);
        if (!is_dir($dataDir)) {
            @mkdir($dataDir, 0775, true);
        }
        if (@file_put_contents($secretPath, $generated, LOCK_EX) === false) {
            error_log('Could not persist generated session secret; it will change on every request.');
        } else {
            error_log('Generated a new session secret and saved it to ' . $secretPath);
            error_log('Set SESSION_SECRET in config.php to control this explicitly (recommended).');
        }

        return $generated;
    }
}
