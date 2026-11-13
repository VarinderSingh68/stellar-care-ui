<?php
// Email transports.
//
// Two transports, both exposing the same send() interface so index.php does
// not care which is in use:
//  - Resend (preferred): HTTPS API on port 443. This is the only transport
//    that is guaranteed to work on Serv00, because it is a normal
//    outbound HTTPS request rather than a raw SMTP connection.
//  - Gmail SMTP with an App Password (fallback): Serv00 allows outbound SMTP
//    on port 587 with STARTTLS. Sent with a small hand-written SMTP
//    client so no Composer/PHPMailer dependency is needed.
//
// The clinic API also runs perfectly well with email disabled: every
// email-sending endpoint reports a clear "email is not configured" error
// instead of failing.

declare(strict_types=1);

require_once __DIR__ . '/http.php';

final class Mailer
{
    public bool $configured = false;
    public string $fromAddress = '';
    public string $transport = 'none';

    private string $resendApiKey = '';
    private string $smtpUser = '';
    private string $smtpPassword = '';

    private const RESEND_API_URL = 'https://api.resend.com';
    private const RESEND_TIMEOUT_SECONDS = 20;

    public static function create(): self
    {
        $mailer = new self();

        $apiKey = (string) Config::get('RESEND_API_KEY', '');
        $fromAddress = (string) Config::get('RESEND_FROM_EMAIL', '');

        if ($apiKey !== '') {
            if ($fromAddress === '') {
                error_log('RESEND_API_KEY is set but RESEND_FROM_EMAIL is missing. Email sending is disabled.');
                error_log('Set RESEND_FROM_EMAIL to an address at a domain verified in your Resend dashboard.');
                return $mailer;
            }
            $mailer->resendApiKey = $apiKey;
            $mailer->fromAddress = $fromAddress;
            $mailer->configured = true;
            $mailer->transport = 'resend';
            $mailer->checkResendSetup($apiKey, $fromAddress);
            return $mailer;
        }

        $smtpUser = (string) Config::get('EMAIL_USER', '');
        $smtpPassword = str_replace(' ', '', (string) Config::get('EMAIL_PASSWORD', ''));
        if ($smtpUser !== '' && $smtpPassword !== '') {
            $mailer->smtpUser = $smtpUser;
            $mailer->smtpPassword = $smtpPassword;
            $mailer->fromAddress = $smtpUser;
            $mailer->configured = true;
            $mailer->transport = 'smtp';
            error_log('Email transport ready via Gmail SMTP (' . $smtpUser . ')');
            return $mailer;
        }

        error_log('No email transport configured. Email sending is disabled.');
        error_log('Set RESEND_API_KEY + RESEND_FROM_EMAIL (recommended), or EMAIL_USER + EMAIL_PASSWORD, in config.php.');
        return $mailer;
    }

    /**
     * @param array{to:string|array<int,string>,subject:string,html?:string,text?:string,attachments?:array<int,array{filename:string,content:string,contentType?:string}>} $message
     * @throws RuntimeException
     */
    public function send(array $message): void
    {
        if (!$this->configured) {
            throw new RuntimeException('Email is not configured on the server.');
        }

        $recipients = $this->recipients($message['to'] ?? '');

        if ($this->transport === 'resend') {
            $this->sendWithResend($message, $recipients);
            return;
        }

        $this->sendWithSmtp($message, $recipients);
    }

    /** @return list<string> */
    private function recipients($to): array
    {
        $list = is_array($to) ? $to : explode(',', (string) $to);
        $out = [];
        foreach ($list as $address) {
            $trimmed = trim((string) $address);
            if ($trimmed !== '') {
                $out[] = $trimmed;
            }
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $message
     * @param list<string> $recipients
     */
    private function sendWithResend(array $message, array $recipients): void
    {
        $payload = [
            'from' => $this->fromAddress,
            'to' => $recipients,
            'subject' => (string) ($message['subject'] ?? ''),
            'html' => (string) ($message['html'] ?? ''),
        ];
        if (!empty($message['text'])) {
            $payload['text'] = (string) $message['text'];
        }

        $attachments = [];
        foreach ($message['attachments'] ?? [] as $attachment) {
            $attachments[] = [
                'filename' => (string) ($attachment['filename'] ?? 'attachment'),
                'content' => base64_encode((string) ($attachment['content'] ?? '')),
                'content_type' => (string) ($attachment['contentType'] ?? 'application/octet-stream'),
            ];
        }
        if ($attachments !== []) {
            $payload['attachments'] = $attachments;
        }

        $response = $this->httpPostJson(
            self::RESEND_API_URL . '/emails',
            $payload,
            ['Authorization: Bearer ' . $this->resendApiKey],
        );

        if ($response['status'] < 200 || $response['status'] >= 300) {
            $detail = is_array($response['payload'])
                ? ($response['payload']['message'] ?? 'unknown error')
                : 'unknown error';
            throw new RuntimeException('Resend API error (HTTP ' . $response['status'] . '): ' . $detail);
        }
    }

    /** @param list<string> $recipients */
    private function sendWithSmtp(array $message, array $recipients): void
    {
        $host = 'smtp.gmail.com';
        $port = 587;
        $timeout = 20;

        $context = stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        $socket = @stream_socket_client(
            'tcp://' . $host . ':' . $port,
            $errno,
            $errstr,
            $timeout,
            STREAM_CLIENT_CONNECT,
            $context,
        );
        if ($socket === false) {
            throw new RuntimeException('Could not reach ' . $host . ':' . $port . ' (' . ($errstr !== '' ? $errstr : 'network error') . '). Outbound SMTP may be blocked.');
        }
        stream_set_timeout($socket, $timeout);

        try {
            $this->expect($socket, [220]);
            $this->command($socket, 'EHLO dr-rana-dental-clinic', [250]);
            $this->command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS with the SMTP server.');
            }
            $this->command($socket, 'EHLO dr-rana-dental-clinic', [250]);
            $this->command($socket, 'AUTH LOGIN', [334]);
            $this->command($socket, base64_encode($this->smtpUser), [334]);
            $this->command($socket, base64_encode($this->smtpPassword), [235]);
            $this->command($socket, 'MAIL FROM:<' . $this->fromAddress . '>', [250]);
            foreach ($recipients as $recipient) {
                $this->command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
            }
            $this->command($socket, 'DATA', [354]);

            $data = $this->buildMimeMessage($message) . "\r\n.";
            $this->write($socket, $data);
            $this->expect($socket, [250]);
            $this->command($socket, 'QUIT', [221]);
        } finally {
            @fclose($socket);
        }
    }

    /** @param resource $socket */
    private function command($socket, string $command, array $expected): void
    {
        $this->write($socket, $command);
        $this->expect($socket, $expected);
    }

    /** @param resource $socket */
    private function write($socket, string $data): void
    {
        if (fwrite($socket, $data . "\r\n") === false) {
            throw new RuntimeException('Lost connection to the SMTP server.');
        }
    }

    /** @param resource $socket @param list<int> $expected */
    private function expect($socket, array $expected): string
    {
        $response = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $response .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        if ($response === '') {
            throw new RuntimeException('No response from the SMTP server.');
        }
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expected, true)) {
            throw new RuntimeException('SMTP error: ' . trim($response));
        }
        return $response;
    }

    /** @param array<string,mixed> $message */
    private function buildMimeMessage(array $message): string
    {
        $boundary = 'clinic-' . bin2hex(random_bytes(12));
        $recipients = $this->recipients($message['to'] ?? '');
        $subject = (string) ($message['subject'] ?? '');
        $html = (string) ($message['html'] ?? '');
        $attachments = $message['attachments'] ?? [];

        $headers = [
            'Date: ' . date('r'),
            'From: ' . $this->fromAddress,
            'To: ' . implode(', ', $recipients),
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'MIME-Version: 1.0',
            'Message-ID: <' . bin2hex(random_bytes(10)) . '@dr-rana-dental-clinic>',
        ];

        if ($attachments === []) {
            $headers[] = 'Content-Type: text/html; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: base64';
            return implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n");
        }

        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
        $body = "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html), 76, "\r\n");

        foreach ($attachments as $attachment) {
            $filename = (string) ($attachment['filename'] ?? 'attachment');
            $contentType = (string) ($attachment['contentType'] ?? 'application/octet-stream');
            $body .= "--{$boundary}\r\n"
                . 'Content-Type: ' . $contentType . "; name=\"" . $filename . "\"\r\n"
                . "Content-Transfer-Encoding: base64\r\n"
                . 'Content-Disposition: attachment; filename="' . $filename . "\"\r\n\r\n"
                . chunk_split(base64_encode((string) ($attachment['content'] ?? '')), 76, "\r\n");
        }

        $body .= "--{$boundary}--";

        return implode("\r\n", $headers) . "\r\n\r\n" . $body;
    }

    /**
     * Best-effort startup check so a misconfiguration shows up in the server
     * log instead of as a failed patient email later.
     */
    private function checkResendSetup(string $apiKey, string $fromAddress): void
    {
        $response = Http::request('GET', self::RESEND_API_URL . '/domains', ['Authorization: Bearer ' . $apiKey], null, 8);
        if ($response['error'] !== null) {
            error_log('Could not reach the Resend API to verify the sender domain.');
            return;
        }

        $status = $response['status'];
        $payload = json_decode($response['body'], true);
        if ($status === 401 && is_array($payload) && ($payload['name'] ?? '') === 'restricted_api_key') {
            error_log('Email transport ready via Resend API (' . $fromAddress . ') -- sending-only key, domain status not checked.');
            return;
        }
        if ($status < 200 || $status >= 300) {
            error_log('Resend API key check failed (HTTP ' . $status . '): ' . (is_array($payload) ? ($payload['message'] ?? 'unknown error') : 'unknown error'));
            error_log('Check RESEND_API_KEY in config.php.');
            return;
        }

        $domain = strtolower((string) substr((string) strrchr($fromAddress, '@'), 1));
        foreach ((array) ($payload['data'] ?? []) as $entry) {
            if (strtolower((string) ($entry['name'] ?? '')) === $domain) {
                if (($entry['status'] ?? '') === 'verified') {
                    error_log('Email transport ready via Resend API (' . $fromAddress . ')');
                } else {
                    error_log('Resend domain "' . $domain . '" is "' . ($entry['status'] ?? 'unknown') . '", not verified yet -- emails will be rejected until it is.');
                }
                return;
            }
        }
        error_log('"' . $domain . '" is not a domain in your Resend account. Until you add and verify it, Resend rejects mail from this address.');
    }

    /**
     * @param array<string,mixed> $payload
     * @param list<string> $headers
     * @return array{status:int,payload:mixed}
     */
    private function httpPostJson(string $url, array $payload, array $headers): array
    {
        $response = Http::request(
            'POST',
            $url,
            array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers),
            (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            self::RESEND_TIMEOUT_SECONDS,
        );

        if ($response['error'] !== null) {
            throw new RuntimeException('Resend request failed: ' . $response['error']);
        }

        return ['status' => $response['status'], 'payload' => json_decode($response['body'], true)];
    }
}
