<?php
// Small HTTP client used for the Resend API, WATI and the smoke test.
//
// cURL is enabled on InfinityFree and is used when available. The stream
// fallback matters for local development on PHP builds without ext-curl, and
// keeps the API working instead of failing every email with a fatal error.

declare(strict_types=1);

final class Http
{
    /**
     * @param list<string> $headers
     * @return array{status:int,body:string,error:?string}
     */
    public static function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeout = 20,
    ): array {
        if (function_exists('curl_init')) {
            return self::withCurl($method, $url, $headers, $body, $timeout);
        }
        return self::withStreams($method, $url, $headers, $body, $timeout);
    }

    /**
     * @param list<string> $headers
     * @return array{status:int,body:string,error:?string}
     */
    private static function withCurl(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            return ['status' => 0, 'body' => '', 'error' => 'Could not initialise the HTTP request.'];
        }

        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_HTTPHEADER => $headers,
        ];
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $options);

        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            return ['status' => 0, 'body' => '', 'error' => $error !== '' ? $error : 'network error'];
        }

        return ['status' => $status, 'body' => (string) $raw, 'error' => null];
    }

    /**
     * @param list<string> $headers
     * @return array{status:int,body:string,error:?string}
     */
    private static function withStreams(string $method, string $url, array $headers, ?string $body, int $timeout): array
    {
        $options = [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'timeout' => $timeout,
            'ignore_errors' => true,
        ];
        if ($body !== null) {
            $options['content'] = $body;
        }

        $context = stream_context_create(['http' => $options]);
        $raw = @file_get_contents($url, false, $context);

        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $matches) === 1) {
                $status = (int) $matches[1];
            }
        }

        if ($raw === false) {
            $lastError = error_get_last();
            return [
                'status' => $status,
                'body' => '',
                'error' => $lastError['message'] ?? 'network error',
            ];
        }

        return ['status' => $status, 'body' => (string) $raw, 'error' => null];
    }
}
