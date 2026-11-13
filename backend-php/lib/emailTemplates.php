<?php
// Shared HTML email template for every outbound notification (booking,
// prescription, follow-up, report, billing).
//
// Direct port of backend/lib/emailTemplates.cjs. Table-based layout on purpose
// -- modern CSS (flexbox/grid) is unreliable across email clients.

declare(strict_types=1);

final class EmailTpl
{
    private const BRAND_COLOR = '#2563eb';
    private const BRAND_COLOR_DARK = '#1e3a8a';
    private const TEXT_COLOR = '#1f2937';
    private const MUTED_COLOR = '#6b7280';
    private const BORDER_COLOR = '#e5e7eb';
    private const PANEL_BG = '#f8fafc';

    public static function escapeHtml($value): string
    {
        return str_replace(
            ['&', '<', '>', '"'],
            ['&amp;', '&lt;', '&gt;', '&quot;'],
            Pdf::sanitizeText($value),
        );
    }

    /**
     * rows: [[label, value], ...] -- falsy values are skipped so the table never
     * shows an empty row for data that simply wasn't collected.
     *
     * @param array<int, array{0:string,1:mixed}> $rows
     */
    public static function detailTable(array $rows): string
    {
        $visible = [];
        foreach ($rows as $row) {
            $value = $row[1] ?? null;
            if (Pdf::sanitizeText($value) !== '') {
                $visible[] = [$row[0], $value];
            }
        }
        if ($visible === []) {
            return '';
        }

        $muted = self::MUTED_COLOR;
        $text = self::TEXT_COLOR;
        $border = self::BORDER_COLOR;

        $rowsHtml = '';
        foreach ($visible as $index => [$label, $value]) {
            $top = $index === 0 ? '0' : "1px solid {$border}";
            $rowsHtml .= "\n        <tr>\n"
                . '          <td style="padding:10px 16px;font-size:13px;color:' . $muted . ';font-weight:600;white-space:nowrap;vertical-align:top;border-top:' . $top . ';width:38%;">' . self::escapeHtml($label) . "</td>\n"
                . '          <td style="padding:10px 16px;font-size:14px;color:' . $text . ';vertical-align:top;border-top:' . $top . ';">' . self::escapeHtml($value) . "</td>\n"
                . '        </tr>';
        }

        return "\n    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid {$border};border-radius:10px;overflow:hidden;background:#ffffff;margin:20px 0;\">\n      "
            . $rowsHtml . "\n    </table>";
    }

    public static function highlightBox(string $html): string
    {
        $dark = self::BRAND_COLOR_DARK;
        return "\n    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:20px 0;\">\n      <tr>\n"
            . '        <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;font-size:14px;color:' . $dark . ';line-height:1.6;">' . "\n          "
            . $html . "\n        </td>\n      </tr>\n    </table>";
    }

    public static function multilineHtml($value): string
    {
        return str_replace("\n", '<br/>', self::escapeHtml($value));
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function emailShell(array $data): string
    {
        $clinicInfo = $data['clinicInfo'] ?? [];
        $clinicName = (string) ($clinicInfo['clinicName'] ?? '');
        $doctorName = (string) ($clinicInfo['doctorName'] ?? '');
        $clinicAddress = (string) ($clinicInfo['clinicAddress'] ?? '');
        $clinicPhone = (string) ($clinicInfo['clinicPhone'] ?? '');

        $eyebrow = (string) ($data['eyebrow'] ?? '');
        $heading = (string) ($data['heading'] ?? '');
        $greetingName = (string) ($data['greetingName'] ?? '');
        $introHtml = (string) ($data['introHtml'] ?? '');
        $bodyHtml = (string) ($data['bodyHtml'] ?? '');
        $footerNote = (string) ($data['footerNote'] ?? '');

        $year = date('Y');
        $brand = self::BRAND_COLOR;
        $brandDark = self::BRAND_COLOR_DARK;
        $textColor = self::TEXT_COLOR;
        $muted = self::MUTED_COLOR;
        $border = self::BORDER_COLOR;
        $panel = self::PANEL_BG;

        $phoneLine = $clinicPhone !== '' ? ' &bull; ' . self::escapeHtml($clinicPhone) : '';

        return '<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>' . self::escapeHtml($heading) . '</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg, ' . $brandDark . ', ' . $brand . ');padding:28px 32px;">
                <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">' . self::escapeHtml($clinicName) . '</div>
                <div style="font-size:13px;color:#dbeafe;margin-top:4px;">' . self::escapeHtml($doctorName) . $phoneLine . '</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ' . ($eyebrow !== '' ? '<div style="font-size:12px;font-weight:700;color:' . $brand . ';text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">' . self::escapeHtml($eyebrow) . '</div>' : '') . '
                <div style="font-size:20px;font-weight:700;color:' . $textColor . ';margin-bottom:16px;">' . self::escapeHtml($heading) . '</div>
                ' . ($greetingName !== '' ? '<p style="font-size:15px;color:' . $textColor . ';margin:0 0 12px;">Dear ' . self::escapeHtml($greetingName) . ',</p>' : '') . '
                ' . ($introHtml !== '' ? '<div style="font-size:14px;color:' . $textColor . ';line-height:1.6;margin-bottom:4px;">' . $introHtml . '</div>' : '') . '
                ' . $bodyHtml . '
              </td>
            </tr>
            <tr>
              <td style="background:' . $panel . ';padding:24px 32px;border-top:1px solid ' . $border . ';">
                <div style="font-size:14px;font-weight:700;color:' . $textColor . ';">' . self::escapeHtml($clinicName) . '</div>
                ' . ($clinicAddress !== '' ? '<div style="font-size:12.5px;color:' . $muted . ';margin-top:4px;line-height:1.5;">' . self::escapeHtml($clinicAddress) . '</div>' : '') . '
                ' . ($clinicPhone !== '' ? '<div style="font-size:12.5px;color:' . $muted . ';margin-top:4px;">Phone: ' . self::escapeHtml($clinicPhone) . '</div>' : '') . '
                ' . ($footerNote !== '' ? '<div style="font-size:12px;color:' . $muted . ';margin-top:14px;line-height:1.5;">' . $footerNote . '</div>' : '') . '
                <div style="font-size:11px;color:#9ca3af;margin-top:14px;">This is an automated message from ' . self::escapeHtml($clinicName) . '. Please do not reply directly to this email &mdash; call the clinic for any questions. &copy; ' . $year . ' ' . self::escapeHtml($clinicName) . '.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>';
    }

    /** @param array<string,mixed> $clinicInfo */
    public static function admin2FAEmail(array $clinicInfo, string $username, string $code, int $expiresInMinutes = 10): string
    {
        return self::emailShell([
            'clinicInfo' => $clinicInfo,
            'eyebrow' => 'Admin Portal Security',
            'heading' => 'Admin 2FA Verification Code',
            'greetingName' => $username,
            'introHtml' => 'A login attempt was initiated for the administrator account at <strong>' . self::escapeHtml($clinicInfo['clinicName'] ?? '') . '</strong>. Please use the following one-time code to complete your login:',
            'bodyHtml' => '
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td align="center" style="background:#f0fdf4;border:2px dashed #22c55e;border-radius:12px;padding:24px 20px;">
            <div style="font-size:12px;font-weight:700;color:#16a34a;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Your 6-Digit Code</div>
            <div style="font-size:38px;font-weight:800;letter-spacing:10px;color:#15803d;font-family:\'Courier New\',Courier,monospace;line-height:1.2;">
              ' . self::escapeHtml($code) . '
            </div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr>
          <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;font-size:13.5px;color:#1e3a8a;line-height:1.6;">
            &#9201;&#65039; <strong>This code is valid for ' . $expiresInMinutes . ' minutes.</strong><br/>
            &#128274; Never share this code with anyone. Clinic administrators will never ask for your code.
          </td>
        </tr>
      </table>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:16px 0 0;">
        If you did not initiate this login, someone may be attempting to access your clinic admin portal. Please review your account credentials immediately.
      </p>
    ',
            'footerNote' => 'This is an automated 2FA security notification delivered directly to the clinic owner email address.',
        ]);
    }
}
