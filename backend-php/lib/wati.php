<?php
// Optional WATI (WhatsApp Business API) integration.
//
// Direct port of backend/lib/wati.cjs. Every function degrades gracefully
// ("skipped", never thrown) when WATI isn't configured, so WhatsApp remains a
// bonus on top of email rather than a requirement.
//
// InfinityFree allows outbound HTTPS to WATI's API, so this works unchanged.

declare(strict_types=1);

require_once __DIR__ . '/http.php';

final class Wati
{
    public bool $configured;

    private string $endpoint;
    private string $token;
    private string $channelNumber;
    private string $appointmentTemplate;
    private string $prescriptionTemplate;
    private string $appointmentBroadcast;
    private string $prescriptionBroadcast;
    private string $defaultCountryCode;
    private string $pdfParamName;

    public function __construct()
    {
        $this->endpoint = (string) Config::get('WATI_API_ENDPOINT', '');
        $this->token = preg_replace('/^Bearer\s+/i', '', (string) Config::get('WATI_ACCESS_TOKEN', '')) ?? '';
        $this->channelNumber = (string) Config::get('WATI_CHANNEL_NUMBER', '');
        $this->appointmentTemplate = (string) Config::get('WATI_APPOINTMENT_TEMPLATE_NAME', '');
        $this->prescriptionTemplate = (string) Config::get('WATI_PRESCRIPTION_TEMPLATE_NAME', '');
        $this->appointmentBroadcast = (string) Config::get('WATI_APPOINTMENT_BROADCAST_NAME', 'appointment_confirmation');
        $this->prescriptionBroadcast = (string) Config::get('WATI_PRESCRIPTION_BROADCAST_NAME', 'prescription_pdf');
        $this->defaultCountryCode = preg_replace('/\D/', '', (string) Config::get('WATI_DEFAULT_COUNTRY_CODE', '91')) ?: '91';
        $this->pdfParamName = (string) Config::get('WATI_PRESCRIPTION_PDF_PARAM_NAME', 'pdfLink');

        $this->configured = $this->endpoint !== '' && $this->token !== '';
    }

    public function normalizeWhatsAppNumber($value): string
    {
        $digits = preg_replace('/\D/', '', (string) ($value ?? '')) ?? '';
        if ($digits === '') {
            return '';
        }
        if (strlen($digits) === 10) {
            return $this->defaultCountryCode . $digits;
        }
        if ($digits[0] === '0' && strlen($digits) === 11) {
            return $this->defaultCountryCode . substr($digits, 1);
        }
        return $digits;
    }

    /** @return array<string,mixed> */
    private function skipped(string $reason): array
    {
        return ['attempted' => false, 'sent' => false, 'skipped' => true, 'reason' => $reason];
    }

    private function param(string $name, $value): array
    {
        $text = Pdf::sanitizeText($value);
        return ['name' => $name, 'value' => $text !== '' ? $text : '-'];
    }

    /**
     * @param array<string,mixed> $queryParams
     * @param array<string,mixed> $body
     * @return array<string,mixed>
     */
    private function postJson(string $pathname, array $queryParams, array $body): array
    {
        $base = rtrim($this->endpoint, '/');
        $url = $base . $pathname;
        $query = http_build_query(array_filter($queryParams, static fn ($v) => $v !== null && $v !== ''));

        $response = Http::request(
            'POST',
            $url . ($query !== '' ? '?' . $query : ''),
            [
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            (string) json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            20,
        );

        if ($response['error'] !== null) {
            throw new RuntimeException('WATI request failed: ' . $response['error']);
        }

        $status = $response['status'];
        $raw = $response['body'];
        $payload = json_decode($raw, true);
        if ($status < 200 || $status >= 300 || (is_array($payload) && isset($payload['result']) && $payload['result'] === false)) {
            $detail = is_array($payload) ? ($payload['message'] ?? $payload['error'] ?? '') : '';
            if ($detail === '') {
                $detail = (string) $raw !== '' ? (string) $raw : 'HTTP ' . $status;
            }
            throw new RuntimeException('WATI request failed: ' . $detail);
        }

        return is_array($payload) ? $payload : ['ok' => true];
    }

    /**
     * @param list<array{name:string,value:string}> $parameters
     * @return array<string,mixed>
     */
    private function sendTemplate(string $whatsappNumber, string $templateName, string $broadcastName, array $parameters): array
    {
        $number = $this->normalizeWhatsAppNumber($whatsappNumber);
        if ($number === '') {
            return $this->skipped('Patient WhatsApp number is missing.');
        }
        if (!$this->configured) {
            return $this->skipped('WATI API endpoint or access token is not configured.');
        }
        if ($templateName === '') {
            return $this->skipped('WATI template name is not configured.');
        }

        $body = [
            'template_name' => $templateName,
            'broadcast_name' => $broadcastName !== '' ? $broadcastName : $templateName,
            'parameters' => $parameters,
        ];
        $channel = $this->normalizeWhatsAppNumber($this->channelNumber);
        if ($channel !== '') {
            $body['channel_number'] = $channel;
        }

        $payload = $this->postJson('/api/v2/sendTemplateMessage', ['whatsappNumber' => $number], $body);
        return ['attempted' => true, 'sent' => true, 'skipped' => false, 'payload' => $payload];
    }

    /** @return array<string,mixed> */
    public function sendBookingWhatsApp(string $patientName, $patientPhone, string $appointmentDate, string $appointmentTime, string $clinicPhone): array
    {
        try {
            return $this->sendTemplate(
                (string) $patientPhone,
                $this->appointmentTemplate,
                $this->appointmentBroadcast,
                [
                    $this->param('name', $patientName),
                    $this->param('date', $appointmentDate),
                    $this->param('time', $appointmentTime),
                    $this->param('clinic_phone', $clinicPhone),
                ],
            );
        } catch (Throwable $error) {
            error_log('WATI appointment error: ' . $error->getMessage());
            return ['attempted' => true, 'sent' => false, 'skipped' => false, 'reason' => $error->getMessage()];
        }
    }

    /** @return array<string,mixed> */
    public function sendPrescriptionWhatsApp(string $patientName, $patientPhone, string $pdfUrl, string $clinicPhone): array
    {
        if ($this->normalizeWhatsAppNumber($patientPhone) === '') {
            return $this->skipped('Patient WhatsApp number is missing.');
        }
        if ($pdfUrl === '') {
            return $this->skipped('PUBLIC_APP_URL is not configured, so WATI cannot fetch the prescription PDF.');
        }

        try {
            return $this->sendTemplate(
                (string) $patientPhone,
                $this->prescriptionTemplate,
                $this->prescriptionBroadcast,
                [
                    $this->param('name', $patientName),
                    $this->param('clinic_phone', $clinicPhone),
                    ['name' => $this->pdfParamName, 'value' => $pdfUrl],
                ],
            );
        } catch (Throwable $error) {
            error_log('WATI prescription error: ' . $error->getMessage());
            return ['attempted' => true, 'sent' => false, 'skipped' => false, 'reason' => $error->getMessage()];
        }
    }
}
