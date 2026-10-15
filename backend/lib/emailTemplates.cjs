// Shared HTML email template for every outbound notification (booking,
// prescription, follow-up, report, billing). Table-based layout on purpose
// -- modern CSS (flexbox/grid) is unreliable across email clients (Outlook
// desktop in particular), tables are the one layout primitive every client
// renders consistently.

const { sanitizeText } = require('./pdf.cjs');

const BRAND_COLOR = '#2563eb';
const BRAND_COLOR_DARK = '#1e3a8a';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e5e7eb';
const PANEL_BG = '#f8fafc';

function escapeHtml(value) {
  return sanitizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// rows: [[label, value], ...] -- falsy values are skipped so the table never
// shows an empty/"-" row for data that simply wasn't collected.
function detailTable(rows) {
  const visibleRows = rows.filter(([, value]) => sanitizeText(value));
  if (!visibleRows.length) return '';

  const rowsHtml = visibleRows
    .map(
      ([label, value], index) => `
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};font-weight:600;white-space:nowrap;vertical-align:top;border-top:${index === 0 ? '0' : `1px solid ${BORDER_COLOR}`};width:38%;">${escapeHtml(label)}</td>
          <td style="padding:10px 16px;font-size:14px;color:${TEXT_COLOR};vertical-align:top;border-top:${index === 0 ? '0' : `1px solid ${BORDER_COLOR}`};">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:10px;overflow:hidden;background:#ffffff;margin:20px 0;">
      ${rowsHtml}
    </table>`;
}

// A prominent callout box for the one or two facts that matter most at a
// glance (appointment date/time, amount due, follow-up due date, ...).
function highlightBox(html) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;font-size:14px;color:${BRAND_COLOR_DARK};line-height:1.6;">
          ${html}
        </td>
      </tr>
    </table>`;
}

// Preserves line breaks in freeform text (prescription instructions,
// follow-up notes, report descriptions) instead of collapsing them.
function multilineHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function emailShell({ clinicInfo, eyebrow, heading, greetingName, introHtml, bodyHtml, footerNote }) {
  const { clinicName, doctorName, clinicAddress, clinicPhone } = clinicInfo;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND_COLOR_DARK}, ${BRAND_COLOR});padding:28px 32px;">
                <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${escapeHtml(clinicName)}</div>
                <div style="font-size:13px;color:#dbeafe;margin-top:4px;">${escapeHtml(doctorName)}${clinicPhone ? ` &bull; ${escapeHtml(clinicPhone)}` : ''}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${eyebrow ? `<div style="font-size:12px;font-weight:700;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(eyebrow)}</div>` : ''}
                <div style="font-size:20px;font-weight:700;color:${TEXT_COLOR};margin-bottom:16px;">${escapeHtml(heading)}</div>
                ${greetingName ? `<p style="font-size:15px;color:${TEXT_COLOR};margin:0 0 12px;">Dear ${escapeHtml(greetingName)},</p>` : ''}
                ${introHtml ? `<div style="font-size:14px;color:${TEXT_COLOR};line-height:1.6;margin-bottom:4px;">${introHtml}</div>` : ''}
                ${bodyHtml || ''}
              </td>
            </tr>
            <tr>
              <td style="background:${PANEL_BG};padding:24px 32px;border-top:1px solid ${BORDER_COLOR};">
                <div style="font-size:14px;font-weight:700;color:${TEXT_COLOR};">${escapeHtml(clinicName)}</div>
                ${clinicAddress ? `<div style="font-size:12.5px;color:${MUTED_COLOR};margin-top:4px;line-height:1.5;">${escapeHtml(clinicAddress)}</div>` : ''}
                ${clinicPhone ? `<div style="font-size:12.5px;color:${MUTED_COLOR};margin-top:4px;">Phone: ${escapeHtml(clinicPhone)}</div>` : ''}
                ${footerNote ? `<div style="font-size:12px;color:${MUTED_COLOR};margin-top:14px;line-height:1.5;">${footerNote}</div>` : ''}
                <div style="font-size:11px;color:#9ca3af;margin-top:14px;">This is an automated message from ${escapeHtml(clinicName)}. Please do not reply directly to this email &mdash; call the clinic for any questions. &copy; ${year} ${escapeHtml(clinicName)}.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  escapeHtml,
  detailTable,
  highlightBox,
  multilineHtml,
  emailShell,
};
