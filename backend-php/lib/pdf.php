<?php
// Hand-rolled PDF generation (no external PDF library, no Composer).
//
// Direct port of backend/lib/pdf.cjs. Builds a minimal but valid PDF 1.4 byte
// stream and lays out two documents:
//   - prescriptionPdf: the boxed prescription/Rx layout
//   - notificationPdf: the shared boxed layout used for follow-up reminders,
//     medical reports and insurance billing summaries
//
// Layout coordinates are identical to the Node version so printed documents
// look the same as before the migration.

declare(strict_types=1);

final class Pdf
{
    public static function sanitizeText($value): string
    {
        $text = (string) ($value ?? '');
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';
        return trim($text);
    }

    public static function formatDateText($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        $timestamp = strtotime((string) $value);
        if ($timestamp === false) {
            return self::sanitizeText($value);
        }
        return date('n/j/Y', $timestamp);
    }

    public static function formatMoneyText($value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (!is_numeric($value)) {
            return self::sanitizeText($value);
        }

        $amount = (float) $value;
        $negative = $amount < 0;
        $amount = abs($amount);
        $whole = (int) floor($amount);
        $fraction = $amount - $whole;

        $wholeText = (string) $whole;
        $lastThree = substr($wholeText, -3);
        $rest = substr($wholeText, 0, -3);
        if ($rest !== '') {
            $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest) . ',';
        }
        $formatted = $rest . $lastThree;
        if ($fraction > 0.00001) {
            $formatted .= '.' . rtrim(rtrim(number_format($fraction, 2, '.', ''), '0'), '.');
        }

        return 'Rs. ' . ($negative ? '-' : '') . $formatted;
    }

    /** @return list<string> */
    public static function wrapText($value, int $maxLength): array
    {
        $words = preg_split('/\s+/u', (string) ($value ?? ''), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $next = $current === '' ? $word : $current . ' ' . $word;
            if (strlen($next) > $maxLength) {
                if ($current !== '') {
                    $lines[] = $current;
                }
                $current = $word;
            } else {
                $current = $next;
            }
        }
        if ($current !== '') {
            $lines[] = $current;
        }

        return $lines === [] ? [''] : $lines;
    }

    private static function escapePdfText($value): string
    {
        $text = self::sanitizeText($value);
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }

    /** @param list<float|int> $color */
    private static function text(string $text, float $x, float $y, string $font = 'F1', float $size = 12, array $color = [0, 0, 0]): string
    {
        $rgb = implode(' ', array_map(static fn ($c) => self::num($c), $color));
        $xText = self::num($x);
        $yText = self::num($y);
        $sizeText = self::num($size);
        return $rgb . " rg\nBT /" . $font . ' ' . $sizeText . ' Tf 1 0 0 1 ' . $xText . ' ' . $yText
            . ' Tm (' . self::escapePdfText($text) . ') Tj ET';
    }

    private static function line(float $x1, float $y1, float $x2, float $y2, float $width = 1): string
    {
        return self::num($width) . ' w ' . self::num($x1) . ' ' . self::num($y1) . ' m '
            . self::num($x2) . ' ' . self::num($y2) . ' l S';
    }

    /** @param list<float|int>|null $fillRgb @param list<float|int>|null $strokeRgb */
    private static function rect(float $x, float $y, float $width, float $height, ?array $fillRgb = null, ?array $strokeRgb = null, float $lineWidth = 1): string
    {
        $commands = [];
        if ($fillRgb !== null) {
            $commands[] = implode(' ', array_map(static fn ($c) => self::num($c), $fillRgb)) . ' rg';
        }
        if ($strokeRgb !== null) {
            $commands[] = implode(' ', array_map(static fn ($c) => self::num($c), $strokeRgb)) . ' RG';
        }
        $commands[] = self::num($lineWidth) . ' w';
        $commands[] = self::num($x) . ' ' . self::num($y) . ' ' . self::num($width) . ' ' . self::num($height) . ' re';
        if ($fillRgb !== null && $strokeRgb !== null) {
            $commands[] = 'B';
        } elseif ($fillRgb !== null) {
            $commands[] = 'f';
        } else {
            $commands[] = 'S';
        }
        return implode("\n", $commands);
    }

    private static function num($value): string
    {
        if (is_int($value)) {
            return (string) $value;
        }
        $formatted = rtrim(rtrim(number_format((float) $value, 3, '.', ''), '0'), '.');
        return $formatted === '' || $formatted === '-0' ? '0' : $formatted;
    }

    /**
     * @param list<string> $objects
     */
    private static function buildPdf(array $objects): string
    {
        $pdf = "%PDF-1.4\n";
        $offsets = [0];

        foreach ($objects as $object) {
            $offsets[] = strlen($pdf);
            $pdf .= $object;
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= str_pad((string) $offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        }
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xrefOffset . "\n%%EOF";

        return $pdf;
    }

    /** @return list<string> */
    private static function objectsWithTwoFonts(string $contentStream): array
    {
        return [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
            "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
            "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
            "6 0 obj\n<< /Length " . strlen($contentStream) . " >>\nstream\n" . $contentStream . "\nendstream\nendobj\n",
        ];
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function prescriptionPdf(array $data): string
    {
        $clinicInfo = $data['clinicInfo'];
        $clinicName = (string) ($clinicInfo['clinicName'] ?? '');
        $doctorName = (string) ($clinicInfo['doctorName'] ?? '');
        $clinicAddress = (string) ($clinicInfo['clinicAddress'] ?? '');
        $clinicPhone = (string) ($clinicInfo['clinicPhone'] ?? '');

        $dateText = !empty($data['prescriptionDate'])
            ? date('n/j/Y, g:i:s A', strtotime((string) $data['prescriptionDate']) ?: time())
            : date('n/j/Y, g:i:s A');
        $visitDateText = self::formatDateText($data['visitDate'] ?? '') ?: $dateText;
        $genderAgeText = implode(' / ', array_values(array_filter([
            self::sanitizeText($data['gender'] ?? ''),
            self::sanitizeText($data['age'] ?? ''),
        ], static fn ($v) => $v !== ''))) ?: '-';
        $feesText = self::formatMoneyText($data['totalFees'] ?? '') ?: '-';
        $paidText = self::formatMoneyText($data['amountPaid'] ?? '') ?: '-';
        $statusText = self::sanitizeText($data['paymentStatus'] ?? '') ?: '-';
        $addressLines = array_slice(self::wrapText($clinicAddress, 62), 0, 2);
        $diagnosisLines = array_slice(self::wrapText(self::sanitizeText($data['suffering'] ?? '') ?: '-', 74), 0, 2);

        $rawPrescriptionLines = preg_split('/\r?\n/', (string) ($data['prescription'] ?? '')) ?: [];
        $prescriptionLines = [];
        foreach ($rawPrescriptionLines as $line) {
            foreach (self::wrapText(self::sanitizeText($line), 70) as $wrapped) {
                $prescriptionLines[] = $wrapped;
            }
        }
        $prescriptionLines = array_slice($prescriptionLines, 0, 14);

        $content = [
            self::rect(0, 760, 595, 82, [0.12, 0.35, 0.74]),
            self::rect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
            self::rect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
            self::rect(36, 612, 523, 62, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
            self::rect(36, 110, 523, 485, null, [0.82, 0.87, 0.95], 1),
            self::text($clinicName, 42, 810, 'F2', 22, [1, 1, 1]),
            self::text('Prescription', 42, 790, 'F1', 11, [0.92, 0.97, 1]),
            self::text('Doctor: ' . $doctorName, 410, 810, 'F2', 14, [1, 1, 1]),
            self::text('Phone: ' . $clinicPhone, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
            self::text($addressLines[0] ?? '', 42, 778, 'F1', 9, [0.92, 0.97, 1]),
            self::text($addressLines[1] ?? '', 42, 766, 'F1', 9, [0.92, 0.97, 1]),
            self::text('Patient Details', 48, 730, 'F2', 14, [0.16, 0.22, 0.35]),
            self::text('Name: ' . self::sanitizeText($data['patientName'] ?? ''), 48, 708, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text('Phone: ' . (self::sanitizeText($data['patientPhone'] ?? '') ?: '-'), 300, 708, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text('Email: ' . (self::sanitizeText($data['patientEmail'] ?? '') ?: '-'), 48, 690, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text('Visit: ' . self::sanitizeText($visitDateText), 300, 690, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text('Gender/Age: ' . $genderAgeText, 48, 674, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text('Fees: ' . $feesText . ' | Paid: ' . $paidText, 300, 674, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text('Payment: ' . $statusText, 48, 660, 'F1', 9, [0.28, 0.28, 0.28]),
            self::text('Generated: ' . self::sanitizeText($dateText), 300, 660, 'F1', 9, [0.28, 0.28, 0.28]),
            self::text('Diagnosis', 48, 650, 'F2', 13, [0.16, 0.22, 0.35]),
            self::text($diagnosisLines[0] ?? '-', 48, 632, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text($diagnosisLines[1] ?? '', 48, 616, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text('Rx', 48, 576, 'F2', 24, [0.12, 0.35, 0.74]),
            self::line(42, 598, 553, 598, 1),
        ];

        foreach ([568, 540, 512, 484, 456, 428, 400, 372, 344, 316, 288, 260, 232, 204] as $ruleY) {
            $content[] = self::line(84, $ruleY, 535, $ruleY, 0.7);
        }

        $content[] = self::text('Signature', 430, 128, 'F1', 10, [0.35, 0.35, 0.35]);
        $content[] = self::line(392, 142, 540, 142, 1);
        $content[] = self::text($doctorName, 442, 116, 'F2', 12, [0.16, 0.22, 0.35]);
        $content[] = self::text($clinicName, 42, 72, 'F2', 12, [0.16, 0.22, 0.35]);
        $content[] = self::text('Address: ' . $clinicAddress, 42, 56, 'F1', 9, [0.25, 0.25, 0.25]);
        $content[] = self::text('Phone: ' . $clinicPhone, 42, 40, 'F1', 9, [0.25, 0.25, 0.25]);

        foreach ($prescriptionLines as $index => $line) {
            $content[] = self::text($line, 94, 548 - ($index * 28), 'F1', 12, [0.08, 0.08, 0.08]);
        }

        return self::buildPdf(self::objectsWithTwoFonts(implode("\n", $content)));
    }

    /**
     * @param array<string,mixed> $data
     * @param list<string> $sectionLines
     */
    private static function notificationPdf(array $data, string $documentTitle, string $sectionTitle, array $sectionLines): string
    {
        $clinicInfo = $data['clinicInfo'];
        $clinicName = (string) ($clinicInfo['clinicName'] ?? '');
        $doctorName = (string) ($clinicInfo['doctorName'] ?? '');
        $clinicAddress = (string) ($clinicInfo['clinicAddress'] ?? '');
        $clinicPhone = (string) ($clinicInfo['clinicPhone'] ?? '');
        $dateText = date('n/j/Y, g:i:s A');
        $addressLines = array_slice(self::wrapText($clinicAddress, 62), 0, 2);

        $content = [
            self::rect(0, 760, 595, 82, [0.12, 0.35, 0.74]),
            self::rect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
            self::rect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
            self::rect(36, 606, 523, 58, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
            self::rect(36, 110, 523, 470, null, [0.82, 0.87, 0.95], 1),
            self::text($clinicName, 42, 810, 'F2', 22, [1, 1, 1]),
            self::text($documentTitle, 42, 792, 'F1', 12, [0.92, 0.97, 1]),
            self::text('Doctor: ' . $doctorName, 410, 810, 'F2', 14, [1, 1, 1]),
            self::text('Phone: ' . $clinicPhone, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
            self::text($addressLines[0] ?? '', 42, 778, 'F1', 9, [0.92, 0.97, 1]),
            self::text($addressLines[1] ?? '', 42, 766, 'F1', 9, [0.92, 0.97, 1]),
            self::text('Patient Details', 48, 716, 'F2', 14, [0.16, 0.22, 0.35]),
            self::text('Name: ' . self::sanitizeText($data['patientName'] ?? ''), 48, 694, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text('Phone: ' . (self::sanitizeText($data['patientPhone'] ?? '') ?: '-'), 300, 694, 'F1', 11, [0.1, 0.1, 0.1]),
            self::text('Email: ' . (self::sanitizeText($data['patientEmail'] ?? '') ?: '-'), 48, 678, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text('Generated: ' . self::sanitizeText($dateText), 300, 678, 'F1', 10, [0.2, 0.2, 0.2]),
            self::text($sectionTitle, 48, 652, 'F2', 13, [0.16, 0.22, 0.35]),
        ];

        // No pagination in this hand-rolled layout: cap the lines so a long
        // description cannot push text off the bottom of the page.
        $maxSectionLines = 25;
        $visibleLines = array_slice($sectionLines, 0, $maxSectionLines);
        if (count($sectionLines) > $maxSectionLines) {
            $visibleLines[$maxSectionLines - 1] = '... (truncated, see admin dashboard for full details)';
        }

        foreach ($visibleLines as $index => $line) {
            $content[] = self::text($line, 48, 632 - ($index * 18), 'F1', 10, [0.1, 0.1, 0.1]);
        }

        $content[] = self::text($clinicName, 42, 72, 'F2', 12, [0.16, 0.22, 0.35]);
        $content[] = self::text('Address: ' . $clinicAddress, 42, 56, 'F1', 9, [0.25, 0.25, 0.25]);
        $content[] = self::text('Phone: ' . $clinicPhone, 42, 40, 'F1', 9, [0.25, 0.25, 0.25]);

        return self::buildPdf(self::objectsWithTwoFonts(implode("\n", $content)));
    }

    /** @param array<string,mixed> $data */
    public static function followUpPdf(array $data): string
    {
        $sectionLines = [
            'Follow-up: ' . self::sanitizeText($data['title'] ?? ''),
            'Type: ' . self::sanitizeText($data['type'] ?? ''),
            'Due Date: ' . self::formatDateText($data['dueDate'] ?? ''),
            '',
            'Instructions:',
        ];
        foreach (self::wrapText(self::sanitizeText($data['description'] ?? '') ?: 'No additional details provided.', 66) as $line) {
            $sectionLines[] = $line;
        }

        return self::notificationPdf($data, 'Follow-up Reminder', 'Follow-up Instructions', $sectionLines);
    }

    /** @param array<string,mixed> $data */
    public static function reportPdf(array $data): string
    {
        $sectionLines = [
            'Report Type: ' . self::sanitizeText($data['reportType'] ?? ''),
            'Title: ' . self::sanitizeText($data['title'] ?? ''),
            'Date: ' . self::formatDateText($data['date'] ?? ''),
            '',
            'Report Summary:',
        ];
        foreach (self::wrapText(self::sanitizeText($data['description'] ?? '') ?: 'No description provided.', 66) as $line) {
            $sectionLines[] = $line;
        }

        return self::notificationPdf($data, 'Medical Report', 'Report Summary', $sectionLines);
    }

    /** @param array<string,mixed> $data */
    public static function billingPdf(array $data): string
    {
        $sectionLines = [
            'Claim ID: ' . self::sanitizeText($data['claimId'] ?? ''),
            'Insurance Provider: ' . self::sanitizeText($data['insuranceProvider'] ?? ''),
            'Policy Number: ' . (self::sanitizeText($data['policyNumber'] ?? '') ?: '-'),
            'Treatment Date: ' . self::formatDateText($data['treatmentDate'] ?? ''),
            'Amount: ' . self::formatMoneyText($data['amount'] ?? ''),
            'Status: ' . self::sanitizeText($data['status'] ?? ''),
            'Submission Date: ' . self::formatDateText($data['submissionDate'] ?? ''),
            '',
            'Notes:',
        ];
        foreach (self::wrapText(self::sanitizeText($data['notes'] ?? '') ?: 'No notes provided.', 66) as $line) {
            $sectionLines[] = $line;
        }

        return self::notificationPdf($data, 'Insurance Billing Summary', 'Claim Details', $sectionLines);
    }
}
