const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const PORT = process.env.PORT || 5000;
const emailUser = process.env.EMAIL_USER || 'ngw.designer@gmail.com';
const emailPassword = (process.env.EMAIL_PASSWORD || 'xvqe hegc yscu sszt').replace(/\s/g, '');
const smtpHost = 'smtp.gmail.com';
const smtpPort = 465;
const adminEmail = 'ngw.designer@gmail.com';
const clinicName = 'Dr. Rana Dental Clinic';
const doctorName = 'Dr. Rana';
const clinicAddress = 'New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301';
const clinicPhone = process.env.CLINIC_PHONE || '090414 81946';
const watiApiEndpoint = (process.env.WATI_API_ENDPOINT || '').trim();
const watiAccessToken = (process.env.WATI_ACCESS_TOKEN || '').trim();
const watiChannelNumber = (process.env.WATI_CHANNEL_NUMBER || '').trim();
const watiAppointmentTemplateName = (process.env.WATI_APPOINTMENT_TEMPLATE_NAME || '').trim();
const watiPrescriptionTemplateName = (process.env.WATI_PRESCRIPTION_TEMPLATE_NAME || '').trim();
const watiAppointmentBroadcastName = (process.env.WATI_APPOINTMENT_BROADCAST_NAME || 'appointment_confirmation').trim();
const watiPrescriptionBroadcastName = (process.env.WATI_PRESCRIPTION_BROADCAST_NAME || 'prescription_pdf').trim();
const watiDefaultCountryCode = String(process.env.WATI_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') || '91';
const watiPrescriptionPdfParamName = (process.env.WATI_PRESCRIPTION_PDF_PARAM_NAME || 'pdfLink').trim();
const publicAppUrl = (process.env.PUBLIC_APP_URL || '').trim();
const prescriptionStorageDir = path.resolve(__dirname, 'runtime-prescriptions');

function encodeBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function base64Lines(input) {
  return input.match(/.{1,76}/g)?.join('\r\n') || input;
}

function buildMessage({ from, to, subject, html, text, attachments = [] }) {
  const mixedBoundary = `----=_DrRanaDental_Mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `----=_DrRanaDental_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = attachments.length > 0;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    hasAttachments
      ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
      : `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}-${Math.random().toString(36).slice(2)}@${smtpHost}>`,
    '',
  ];

  const altBody = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${altBoundary}--`,
    '',
  ];

  if (!hasAttachments) {
    return headers.concat(altBody).join('\r\n');
  }

  const mixedBody = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    ...altBody,
  ];

  attachments.forEach((attachment) => {
    mixedBody.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      '',
      base64Lines(attachment.contentBase64),
      '',
    );
  });

  mixedBody.push(`--${mixedBoundary}--`, '');
  return headers.concat(mixedBody).join('\r\n');
}

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function formatDateText(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? sanitizeText(value) : date.toLocaleDateString();
}

function formatMoneyText(value) {
  if (!value) return '';
  const amount = Number(value);
  return Number.isNaN(amount) ? sanitizeText(value) : `INR ${amount.toLocaleString('en-IN')}`;
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${watiDefaultCountryCode}${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `${watiDefaultCountryCode}${digits.slice(1)}`;
  return digits;
}

function watiSkipped(reason) {
  return { attempted: false, sent: false, skipped: true, reason };
}

function buildWatiParam(name, value) {
  return {
    name,
    value: sanitizeText(value) || '-',
  };
}

function getWatiBaseConfig(templateName) {
  if (!watiApiEndpoint || !getWatiAccessToken()) {
    return { ready: false, reason: 'WATI API endpoint or access token is not configured.' };
  }

  if (!templateName) {
    return { ready: false, reason: 'WATI template name is not configured.' };
  }

  return { ready: true };
}

function getWatiAccessToken() {
  return watiAccessToken.replace(/^Bearer\s+/i, '').trim();
}

function getWatiAuthorizationHeader() {
  return `Bearer ${getWatiAccessToken()}`;
}

function safePrescriptionFilename(patientName) {
  const safeName = sanitizeText(patientName)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'patient';
  return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}-${safeName}.pdf`;
}

function buildPublicUrl(pathname) {
  const base = normalizeBaseUrl(publicAppUrl);
  return base ? `${base}${pathname}` : '';
}

function savePrescriptionPdf(pdfBuffer, patientName) {
  if (!fs.existsSync(prescriptionStorageDir)) {
    fs.mkdirSync(prescriptionStorageDir, { recursive: true });
  }

  const filename = safePrescriptionFilename(patientName);
  const filePath = path.join(prescriptionStorageDir, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  const pathname = `/api/prescriptions/${encodeURIComponent(filename)}`;
  return {
    filename,
    filePath,
    localUrl: `http://localhost:${PORT}${pathname}`,
    publicUrl: buildPublicUrl(pathname),
  };
}

function safeNotificationFilename(patientName, prefix) {
  const safeName = sanitizeText(patientName)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'patient';
  return `${prefix || 'notification'}-${Date.now()}-${crypto.randomBytes(12).toString('hex')}-${safeName}.pdf`;
}

function saveNotificationPdf(pdfBuffer, patientName, prefix) {
  if (!fs.existsSync(prescriptionStorageDir)) {
    fs.mkdirSync(prescriptionStorageDir, { recursive: true });
  }

  const filename = safeNotificationFilename(patientName, prefix);
  const filePath = path.join(prescriptionStorageDir, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  const pathname = `/api/prescriptions/${encodeURIComponent(filename)}`;
  return {
    filename,
    filePath,
    localUrl: `http://localhost:${PORT}${pathname}`,
    publicUrl: buildPublicUrl(pathname),
  };
}

function generateNotificationPdfBuffer({
  patientName,
  patientEmail,
  patientPhone,
  documentTitle,
  sectionTitle,
  sectionLines,
}) {
  const dateText = new Date().toLocaleString();
  const addressLines = wrapText(clinicAddress, 62).slice(0, 2);

  const contentLines = [
    pdfRect(0, 770, 595, 72, [0.12, 0.35, 0.74]),
    pdfRect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
    pdfRect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
    pdfRect(36, 606, 523, 58, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
    pdfRect(36, 110, 523, 470, null, [0.82, 0.87, 0.95], 1),
    pdfText(clinicName, 42, 810, 'F2', 22, [1, 1, 1]),
    pdfText(documentTitle, 42, 792, 'F1', 12, [0.92, 0.97, 1]),
    pdfText(`Doctor: ${doctorName}`, 410, 810, 'F2', 14, [1, 1, 1]),
    pdfText(`Phone: ${clinicPhone}`, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
    pdfText(addressLines[0] || '', 42, 774, 'F1', 9, [0.92, 0.97, 1]),
    pdfText(addressLines[1] || '', 42, 761, 'F1', 9, [0.92, 0.97, 1]),
    pdfText('Patient Details', 48, 716, 'F2', 14, [0.16, 0.22, 0.35]),
    pdfText(`Name: ${sanitizeText(patientName)}`, 48, 694, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Phone: ${sanitizeText(patientPhone) || '-'}`, 300, 694, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Email: ${sanitizeText(patientEmail) || '-'}`, 48, 678, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Generated: ${sanitizeText(dateText)}`, 300, 678, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(sectionTitle, 48, 652, 'F2', 13, [0.16, 0.22, 0.35]),
  ];

  sectionLines.forEach((line, index) => {
    const y = 632 - index * 18;
    contentLines.push(pdfText(line, 48, y, 'F1', 10, [0.1, 0.1, 0.1]));
  });

  contentLines.push(
    pdfText(clinicName, 42, 72, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText(`Address: ${clinicAddress}`, 42, 56, 'F1', 9, [0.25, 0.25, 0.25]),
    pdfText(`Phone: ${clinicPhone}`, 42, 40, 'F1', 9, [0.25, 0.25, 0.25]),
  );

  const contentStream = contentLines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function generateFollowUpPdfBuffer({
  patientName,
  patientEmail,
  patientPhone,
  title,
  description,
  dueDate,
  type,
}) {
  const sectionLines = [
    `Follow-up: ${sanitizeText(title)}`,
    `Type: ${sanitizeText(type)}`,
    `Due Date: ${formatDateText(dueDate)}`,
    '',
    'Instructions:',
    ...wrapText(sanitizeText(description) || 'No additional details provided.', 66),
  ];

  return generateNotificationPdfBuffer({
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Follow-up Reminder',
    sectionTitle: 'Follow-up Instructions',
    sectionLines,
  });
}

function generateReportPdfBuffer({
  patientName,
  patientEmail,
  patientPhone,
  reportType,
  title,
  description,
  date,
}) {
  const sectionLines = [
    `Report Type: ${sanitizeText(reportType)}`,
    `Title: ${sanitizeText(title)}`,
    `Date: ${formatDateText(date)}`,
    '',
    'Report Summary:',
    ...wrapText(sanitizeText(description) || 'No description provided.', 66),
  ];

  return generateNotificationPdfBuffer({
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Medical Report',
    sectionTitle: 'Report Summary',
    sectionLines,
  });
}

function generateBillingPdfBuffer({
  patientName,
  patientEmail,
  patientPhone,
  claimId,
  insuranceProvider,
  policyNumber,
  treatmentDate,
  amount,
  status,
  notes,
  submissionDate,
}) {
  const sectionLines = [
    `Claim ID: ${sanitizeText(claimId)}`,
    `Insurance Provider: ${sanitizeText(insuranceProvider)}`,
    `Policy Number: ${sanitizeText(policyNumber) || '-'}`,
    `Treatment Date: ${formatDateText(treatmentDate)}`,
    `Amount: ${formatMoneyText(amount)}`,
    `Status: ${sanitizeText(status)}`,
    `Submission Date: ${formatDateText(submissionDate)}`,
    '',
    'Notes:',
    ...wrapText(sanitizeText(notes) || 'No notes provided.', 66),
  ];

  return generateNotificationPdfBuffer({
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Insurance Billing Summary',
    sectionTitle: 'Claim Details',
    sectionLines,
  });
}

async function postWatiJson(pathname, queryParams, body) {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js 18 or newer is required for WATI requests.');
  }

  const base = normalizeBaseUrl(watiApiEndpoint);
  const url = new URL(`${base}${pathname}`);

  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getWatiAuthorizationHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.result === false) {
    const detail = payload?.message || payload?.error || rawText || `HTTP ${response.status}`;
    throw new Error(`WATI request failed: ${detail}`);
  }

  return payload || { ok: true };
}

async function sendWatiTemplate({ whatsappNumber, templateName, broadcastName, parameters }) {
  const number = normalizeWhatsAppNumber(whatsappNumber);
  if (!number) {
    return watiSkipped('Patient WhatsApp number is missing.');
  }

  const config = getWatiBaseConfig(templateName);
  if (!config.ready) {
    return watiSkipped(config.reason);
  }

  const body = {
    template_name: templateName,
    broadcast_name: broadcastName || templateName,
    parameters,
  };

  const normalizedChannelNumber = normalizeWhatsAppNumber(watiChannelNumber);
  if (normalizedChannelNumber) {
    body.channel_number = normalizedChannelNumber;
  }

  const payload = await postWatiJson(
    '/api/v2/sendTemplateMessage',
    { whatsappNumber: number },
    body,
  );

  return {
    attempted: true,
    sent: true,
    skipped: false,
    payload,
  };
}

async function sendBookingWhatsApp({ patientName, patientPhone, appointmentDate, appointmentTime }) {
  try {
    return await sendWatiTemplate({
      whatsappNumber: patientPhone,
      templateName: watiAppointmentTemplateName,
      broadcastName: watiAppointmentBroadcastName,
      parameters: [
        buildWatiParam('name', patientName),
        buildWatiParam('date', appointmentDate),
        buildWatiParam('time', appointmentTime),
        buildWatiParam('clinic_phone', clinicPhone),
      ],
    });
  } catch (error) {
    console.error('❌ WATI appointment error:', error.message || error);
    return {
      attempted: true,
      sent: false,
      skipped: false,
      reason: error.message || String(error),
    };
  }
}

async function sendPrescriptionWhatsApp({ patientName, patientPhone, pdfUrl }) {
  if (!normalizeWhatsAppNumber(patientPhone)) {
    return watiSkipped('Patient WhatsApp number is missing.');
  }

  const config = getWatiBaseConfig(watiPrescriptionTemplateName);
  if (!config.ready) {
    return watiSkipped(config.reason);
  }

  if (!pdfUrl) {
    return watiSkipped('PUBLIC_APP_URL is not configured, so WATI cannot fetch the prescription PDF.');
  }

  try {
    return await sendWatiTemplate({
      whatsappNumber: patientPhone,
      templateName: watiPrescriptionTemplateName,
      broadcastName: watiPrescriptionBroadcastName,
      parameters: [
        buildWatiParam('name', patientName),
        buildWatiParam('clinic_phone', clinicPhone),
        {
          name: watiPrescriptionPdfParamName,
          value: pdfUrl,
        },
      ],
    });
  } catch (error) {
    console.error('❌ WATI prescription error:', error.message || error);
    return {
      attempted: true,
      sent: false,
      skipped: false,
      reason: error.message || String(error),
    };
  }
}

function buildNotificationMessage(primaryAction, emailStatus, whatsappResult) {
  const parts = [];

  if (emailStatus?.sent) {
    parts.push(`${primaryAction} email sent`);
  } else if (emailStatus?.skipped) {
    parts.push('email skipped');
  } else if (emailStatus?.error) {
    parts.push(`email failed: ${emailStatus.error}`);
  }

  if (whatsappResult?.sent) {
    parts.push('WhatsApp message sent');
  } else if (whatsappResult?.skipped) {
    parts.push(`WhatsApp skipped: ${whatsappResult.reason}`);
  } else if (whatsappResult?.attempted) {
    parts.push(`WhatsApp failed: ${whatsappResult.reason || 'unknown error'}`);
  }

  return parts.length ? `${parts.join('. ')}.` : 'No notification was sent.';
}

function wrapText(text, maxLength) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function escapePdfText(value) {
  return sanitizeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfText(text, x, y, font = 'F1', size = 12, color = [0, 0, 0]) {
  return `${color.join(' ')} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
}

function pdfLine(x1, y1, x2, y2, width = 1) {
  return `${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function pdfRect(x, y, width, height, fillRgb = null, strokeRgb = null, lineWidth = 1) {
  const commands = [];
  if (fillRgb) commands.push(`${fillRgb.join(' ')} rg`);
  if (strokeRgb) commands.push(`${strokeRgb.join(' ')} RG`);
  commands.push(`${lineWidth} w`);
  commands.push(`${x} ${y} ${width} ${height} re`);
  if (fillRgb && strokeRgb) commands.push('B');
  else if (fillRgb) commands.push('f');
  else commands.push('S');
  return commands.join('\n');
}

function generatePrescriptionPdfBuffer({
  patientName,
  patientEmail,
  patientPhone,
  gender,
  age,
  suffering,
  prescription,
  prescriptionDate,
  visitDate,
  totalFees,
  amountPaid,
  paymentStatus,
}) {
  const dateText = prescriptionDate ? new Date(prescriptionDate).toLocaleString() : new Date().toLocaleString();
  const visitDateText = formatDateText(visitDate) || dateText;
  const genderAgeText = [sanitizeText(gender), sanitizeText(age)].filter(Boolean).join(' / ') || '-';
  const feesText = formatMoneyText(totalFees) || '-';
  const paidText = formatMoneyText(amountPaid) || '-';
  const statusText = sanitizeText(paymentStatus) || '-';
  const addressLines = wrapText(clinicAddress, 62).slice(0, 2);
  const diagnosisLines = wrapText(sanitizeText(suffering) || '-', 74).slice(0, 2);
  const prescriptionLines = String(prescription || '')
    .split(/\r?\n/)
    .flatMap((line) => wrapText(sanitizeText(line), 70))
    .slice(0, 14);

  const contentLines = [
    pdfRect(0, 770, 595, 72, [0.12, 0.35, 0.74]),
    pdfRect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
    pdfRect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
    pdfRect(36, 612, 523, 62, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
    pdfRect(36, 110, 523, 485, null, [0.82, 0.87, 0.95], 1),
    pdfText(clinicName, 42, 810, 'F2', 22, [1, 1, 1]),
    pdfText('Dental Prescription', 42, 790, 'F1', 11, [0.92, 0.97, 1]),
    pdfText(`Doctor: ${doctorName}`, 410, 810, 'F2', 14, [1, 1, 1]),
    pdfText(`Phone: ${clinicPhone}`, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
    pdfText(addressLines[0] || '', 42, 774, 'F1', 9, [0.92, 0.97, 1]),
    pdfText(addressLines[1] || '', 42, 761, 'F1', 9, [0.92, 0.97, 1]),
    pdfText('Patient Details', 48, 730, 'F2', 14, [0.16, 0.22, 0.35]),
    pdfText(`Name: ${sanitizeText(patientName)}`, 48, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Phone: ${sanitizeText(patientPhone) || '-'}`, 300, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Email: ${sanitizeText(patientEmail) || '-'}`, 48, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Visit: ${sanitizeText(visitDateText)}`, 300, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Gender/Age: ${genderAgeText}`, 48, 674, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Fees: ${feesText} | Paid: ${paidText}`, 300, 674, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Payment: ${statusText}`, 48, 660, 'F1', 9, [0.28, 0.28, 0.28]),
    pdfText(`Generated: ${sanitizeText(dateText)}`, 300, 660, 'F1', 9, [0.28, 0.28, 0.28]),
    pdfText('Diagnosis', 48, 650, 'F2', 13, [0.16, 0.22, 0.35]),
    pdfText(diagnosisLines[0] || '-', 48, 632, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(diagnosisLines[1] || '', 48, 616, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText('Rx', 48, 576, 'F2', 24, [0.12, 0.35, 0.74]),
    pdfLine(42, 598, 553, 598, 1),
    pdfLine(84, 568, 535, 568, 0.7),
    pdfLine(84, 540, 535, 540, 0.7),
    pdfLine(84, 512, 535, 512, 0.7),
    pdfLine(84, 484, 535, 484, 0.7),
    pdfLine(84, 456, 535, 456, 0.7),
    pdfLine(84, 428, 535, 428, 0.7),
    pdfLine(84, 400, 535, 400, 0.7),
    pdfLine(84, 372, 535, 372, 0.7),
    pdfLine(84, 344, 535, 344, 0.7),
    pdfLine(84, 316, 535, 316, 0.7),
    pdfLine(84, 288, 535, 288, 0.7),
    pdfLine(84, 260, 535, 260, 0.7),
    pdfLine(84, 232, 535, 232, 0.7),
    pdfLine(84, 204, 535, 204, 0.7),
    pdfText('Signature', 430, 128, 'F1', 10, [0.35, 0.35, 0.35]),
    pdfLine(392, 142, 540, 142, 1),
    pdfText(doctorName, 442, 116, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText(clinicName, 42, 72, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText(`Address: ${clinicAddress}`, 42, 56, 'F1', 9, [0.25, 0.25, 0.25]),
    pdfText(`Phone: ${clinicPhone}`, 42, 40, 'F1', 9, [0.25, 0.25, 0.25]),
  ];

  prescriptionLines.forEach((line, index) => {
    const y = 548 - (index * 28);
    contentLines.push(pdfText(line, 94, y, 'F1', 12, [0.08, 0.08, 0.08]));
  });

  const contentStream = contentLines.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function waitForResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (!lastLine) return;
      if (/^[0-9]{3} /.test(lastLine)) {
        socket.removeListener('data', onData);
        resolve(buffer);
      }
    };

    const onError = err => {
      socket.removeListener('data', onData);
      reject(err);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', () => {
      socket.removeListener('data', onData);
      reject(new Error('SMTP connection closed unexpectedly'));
    });
  });
}

async function smtpCommand(socket, command, expectedCodes) {
  if (command) {
    socket.write(`${command}\r\n`);
  }

  const response = await waitForResponse(socket);
  const lines = response.trim().split(/\r\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  const code = parseInt(lastLine.slice(0, 3), 10);

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP error ${code}: ${response}`);
  }

  return response;
}

async function sendMail({ to, subject, html, text, attachments = [] }) {
  return new Promise(async (resolve, reject) => {
    const socket = tls.connect({ host: smtpHost, port: smtpPort, servername: smtpHost });
    socket.setMaxListeners(20);

    socket.once('error', reject);
    socket.once('secureConnect', async () => {
      try {
        await smtpCommand(socket, null, [220]);
        await smtpCommand(socket, `EHLO ${smtpHost}`, [250]);
        await smtpCommand(socket, 'AUTH LOGIN', [334]);
        await smtpCommand(socket, encodeBase64(emailUser), [334]);
        await smtpCommand(socket, encodeBase64(emailPassword), [235]);
        await smtpCommand(socket, `MAIL FROM:<${emailUser}>`, [250]);
        await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
        await smtpCommand(socket, 'DATA', [354]);

        const data = buildMessage({ from: emailUser, to, subject, html, text, attachments });
        socket.write(`${data}\r\n.\r\n`);
        await smtpCommand(socket, null, [250]);
        await smtpCommand(socket, 'QUIT', [221]);
        socket.end();
        resolve(true);
      } catch (error) {
        socket.end();
        reject(error);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const requestPath = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && requestPath === '/') {
    sendJson(res, 200, {
      status: '✅ Dr. Rana Dental Clinic Notification Server Running',
      port: PORT,
      whatsappConfigured: Boolean(watiApiEndpoint && watiAccessToken),
      appointmentTemplateConfigured: Boolean(watiAppointmentTemplateName),
      prescriptionTemplateConfigured: Boolean(watiPrescriptionTemplateName),
    });
    return;
  }

  if (req.method === 'GET' && requestPath.startsWith('/api/prescriptions/')) {
    const rawFilename = decodeURIComponent(requestPath.slice('/api/prescriptions/'.length));

    if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(rawFilename)) {
      sendJson(res, 400, { success: false, message: 'Invalid prescription file.' });
      return;
    }

    const filePath = path.resolve(prescriptionStorageDir, rawFilename);
    if (!filePath.startsWith(`${prescriptionStorageDir}${path.sep}`) || !fs.existsSync(filePath)) {
      sendJson(res, 404, { success: false, message: 'Prescription PDF not found.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rawFilename}"`,
      'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (req.method === 'POST' && requestPath === '/api/send-booking') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason } = JSON.parse(body);

        if (!patientName || !patientEmail || !patientPhone || !appointmentDate || !appointmentTime || !reason) {
          sendJson(res, 400, { success: false, message: 'Missing required booking fields.' });
          return;
        }

        if (!isValidEmail(patientEmail)) {
          sendJson(res, 400, { success: false, message: 'Invalid patient email address.' });
          return;
        }

        console.log('📧 Sending booking emails for:', patientName);

        const patientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Appointment Confirmation</h2>
            <p>Dear ${patientName},</p>
            <p>Thank you for booking an appointment with Dr. Rana Dental Clinic. Your appointment details are:</p>
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p><strong>📅 Date:</strong> ${appointmentDate}</p>
              <p><strong>⏰ Time:</strong> ${appointmentTime}</p>
              <p><strong>📋 Reason:</strong> ${reason}</p>
            </div>
            <p>We will contact you at <strong>${patientPhone}</strong> to confirm your appointment.</p>
            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              If you have any questions, please reply to this email.
            </p>
            <p style="margin-top: 20px;">Best regards,<br><strong>Dr. Rana Dental Clinic</strong><br>New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301<br>Phone: 090414 81946</p>
          </div>
        `;

        const patientText = `Appointment Confirmation\n\nDear ${patientName},\n\nThank you for booking an appointment with Dr. Rana Dental Clinic. Your appointment details are:\n\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nReason: ${reason}\n\nWe will contact you at ${patientPhone} to confirm your appointment.\n\nBest regards,\nDr. Rana Dental Clinic\nNew Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301\nPhone: 090414 81946`;

        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">New Appointment Booking</h2>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
              <p><strong>Patient Name:</strong> ${patientName}</p>
              <p><strong>Email:</strong> <a href="mailto:${patientEmail}">${patientEmail}</a></p>
              <p><strong>Phone:</strong> <a href="tel:${patientPhone}">${patientPhone}</a></p>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
              <p><strong>Appointment Date:</strong> ${appointmentDate}</p>
              <p><strong>Appointment Time:</strong> ${appointmentTime}</p>
              <p><strong>Reason for Visit:</strong> ${reason}</p>
            </div>
            <p style="margin-top: 20px; color: #666; font-size: 12px;">
              Please contact the patient to confirm this appointment.
            </p>
          </div>
        `;

        const adminText = `New Appointment Booking\n\nPatient Name: ${patientName}\nEmail: ${patientEmail}\nPhone: ${patientPhone}\nAppointment Date: ${appointmentDate}\nAppointment Time: ${appointmentTime}\nReason: ${reason}`;

        let emailStatus = { sent: false };
        try {
          await sendMail({
            to: patientEmail,
            subject: 'Dr. Rana Dental Clinic - Appointment Confirmation',
            html: patientHtml,
            text: patientText,
          });

          await sendMail({
            to: adminEmail,
            subject: `New Appointment Booking - ${patientName}`,
            html: adminHtml,
            text: adminText,
          });
          emailStatus = { sent: true };
        } catch (emailError) {
          console.error('❌ Booking email error:', emailError.message || emailError);
          emailStatus = { sent: false, error: emailError.message || String(emailError) };
        }

        const whatsapp = await sendBookingWhatsApp({
          patientName,
          patientPhone,
          appointmentDate,
          appointmentTime,
        });

        const delivered = Boolean(emailStatus.sent || whatsapp.sent);
        sendJson(res, delivered ? 200 : 500, {
          success: delivered,
          message: buildNotificationMessage('Appointment', emailStatus, whatsapp),
          notifications: {
            email: emailStatus,
            whatsapp,
          },
        });
      } catch (error) {
        console.error('❌ Booking notification error:', error.message || error);
        sendJson(res, 500, { success: false, message: 'Failed to send booking notification: ' + (error.message || error) });
      }
    });

    return;
  }

  if (req.method === 'POST' && requestPath === '/api/send-prescription') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const {
          patientName,
          patientEmail,
          patientPhone,
          gender,
          age,
          address,
          suffering,
          prescription,
          prescriptionDate,
          visitDate,
          totalFees,
          amountPaid,
          paymentStatus,
          nextAppointmentDate,
          notes,
        } = JSON.parse(body);
        const trimmedEmail = String(patientEmail || '').trim();
        const hasEmail = Boolean(trimmedEmail);

        if (!patientName || !suffering || !prescription) {
          sendJson(res, 400, { success: false, message: 'Missing required prescription fields.' });
          return;
        }

        if (!hasEmail) {
          sendJson(res, 400, { success: false, message: 'Add patient email to send the prescription.' });
          return;
        }

        if (hasEmail && !isValidEmail(trimmedEmail)) {
          sendJson(res, 400, { success: false, message: 'Invalid patient email address.' });
          return;
        }

        const pdfBuffer = generatePrescriptionPdfBuffer({
          patientName,
          patientEmail: trimmedEmail,
          patientPhone,
          gender,
          age,
          suffering,
          prescription,
          prescriptionDate,
          visitDate,
          totalFees,
          amountPaid,
          paymentStatus,
        });
        const storedPrescription = savePrescriptionPdf(pdfBuffer, patientName);

        const patientDetailRows = [
          ['Visit Date', formatDateText(visitDate || prescriptionDate)],
          ['Gender', gender],
          ['Age', age],
          ['Phone', patientPhone],
          ['Address', address],
          ['Total Fees', formatMoneyText(totalFees)],
          ['Amount Paid', formatMoneyText(amountPaid)],
          ['Payment Status', paymentStatus],
          ['Next Appointment', formatDateText(nextAppointmentDate)],
          ['Notes', notes],
        ].filter(([, value]) => sanitizeText(value));

        const detailListHtml = patientDetailRows
          .map(([label, value]) => `<p><strong>${label}:</strong> ${sanitizeText(value)}</p>`)
          .join('');

        const detailListText = patientDetailRows
          .map(([label, value]) => `${label}: ${sanitizeText(value)}`)
          .join('\n');

        const patientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Your Dr. Rana Dental Clinic Prescription</h2>
            <p>Dear ${patientName},</p>
            <p>Your prescription has been prepared by ${doctorName} at ${clinicName}.</p>
            <p>Please find your prescription PDF attached to this email.</p>
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
              <p><strong>Diagnosis:</strong> ${suffering}</p>
              ${detailListHtml}
            </div>
            <p>Regards,<br><strong>Dr. Rana Dental Clinic</strong><br>New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301<br>Phone: 090414 81946</p>
          </div>
        `;

        const patientText = `Dear ${patientName},\n\nYour prescription from ${doctorName} at ${clinicName} is attached as a PDF.\nDiagnosis: ${suffering}${detailListText ? `\n${detailListText}` : ''}\n\nRegards,\n${clinicName}\n${clinicAddress}\nPhone: ${clinicPhone}`;

        let emailStatus = { sent: false };
        try {
          await sendMail({
            to: trimmedEmail,
            subject: 'Dr. Rana Dental Clinic - Your Prescription PDF',
            html: patientHtml,
            text: patientText,
            attachments: [
              {
                filename: `prescription-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`,
                contentType: 'application/pdf',
                contentBase64: pdfBuffer.toString('base64'),
              },
            ],
          });
          emailStatus = { sent: true };
        } catch (emailError) {
          console.error('❌ Prescription email error:', emailError.message || emailError);
          emailStatus = { sent: false, error: emailError.message || String(emailError) };
        }

        sendJson(res, emailStatus.sent ? 200 : 500, {
          success: emailStatus.sent,
          message: emailStatus.sent
            ? 'Prescription email sent. PDF is ready for manual WhatsApp sharing.'
            : `Prescription email failed: ${emailStatus.error || 'unknown error'}`,
          notifications: {
            email: emailStatus,
            whatsapp: {
              attempted: false,
              sent: false,
              manual: Boolean(normalizeWhatsAppNumber(patientPhone)),
              reason: 'Manual WhatsApp sharing is handled in the browser.',
            },
          },
          prescriptionPdf: {
            filename: storedPrescription.filename,
            localUrl: storedPrescription.localUrl,
            publicUrl: storedPrescription.publicUrl,
          },
        });
      } catch (error) {
        console.error('❌ Prescription notification error:', error.message || error);
        sendJson(res, 500, { success: false, message: 'Failed to send prescription notification: ' + (error.message || error) });
      }
    });

    return;
  }

  if (req.method === 'POST' && requestPath === '/api/send-followup') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { patientName, patientEmail, patientPhone, title, description, dueDate, type } = JSON.parse(body);
        const trimmedEmail = String(patientEmail || '').trim();
        if (!patientName || !title || !dueDate || !type) {
          sendJson(res, 400, { success: false, message: 'Missing required follow-up fields.' });
          return;
        }

        if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
          sendJson(res, 400, { success: false, message: 'Valid patient email is required to send the follow-up reminder.' });
          return;
        }

        const pdfBuffer = generateFollowUpPdfBuffer({
          patientName,
          patientEmail: trimmedEmail,
          patientPhone,
          title,
          description,
          dueDate,
          type,
        });
        const storedFollowUp = saveNotificationPdf(pdfBuffer, patientName, 'followup');

        const patientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Follow-up Reminder</h2>
            <p>Dear ${patientName},</p>
            <p>Your care team has created a follow-up task for you. Please review the attached PDF for details.</p>
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
              <p><strong>Task:</strong> ${sanitizeText(title)}</p>
              <p><strong>Type:</strong> ${sanitizeText(type)}</p>
              <p><strong>Due Date:</strong> ${formatDateText(dueDate)}</p>
            </div>
            <p>If you have any questions, please contact us.</p>
            <p>Regards,<br><strong>Dr. Rana Dental Clinic</strong><br>${clinicAddress}<br>Phone: ${clinicPhone}</p>
          </div>
        `;

        const patientText = `Dear ${patientName},\n\nYour care team has created a follow-up task for you. See the attached PDF for details.\n\nTask: ${sanitizeText(title)}\nType: ${sanitizeText(type)}\nDue Date: ${formatDateText(dueDate)}\n\nRegards,\n${clinicName}\n${clinicAddress}\nPhone: ${clinicPhone}`;

        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">New Follow-up Task Created</h2>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
              <p><strong>Patient Name:</strong> ${patientName}</p>
              <p><strong>Email:</strong> <a href="mailto:${trimmedEmail}">${trimmedEmail}</a></p>
              <p><strong>Phone:</strong> ${sanitizeText(patientPhone) || 'N/A'}</p>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;" />
              <p><strong>Task:</strong> ${sanitizeText(title)}</p>
              <p><strong>Type:</strong> ${sanitizeText(type)}</p>
              <p><strong>Due Date:</strong> ${formatDateText(dueDate)}</p>
              <p><strong>Description:</strong> ${sanitizeText(description)}</p>
            </div>
          </div>
        `;

        const adminText = `New Follow-up Task Created\n\nPatient Name: ${patientName}\nEmail: ${trimmedEmail}\nPhone: ${sanitizeText(patientPhone) || 'N/A'}\nTask: ${sanitizeText(title)}\nType: ${sanitizeText(type)}\nDue Date: ${formatDateText(dueDate)}\nDescription: ${sanitizeText(description)}`;

        let emailStatus = { sent: false };
        try {
          await sendMail({
            to: trimmedEmail,
            subject: 'Dr. Rana Dental Clinic - Follow-up Reminder',
            html: patientHtml,
            text: patientText,
            attachments: [
              {
                filename: `followup-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`,
                contentType: 'application/pdf',
                contentBase64: pdfBuffer.toString('base64'),
              },
            ],
          });

          await sendMail({
            to: adminEmail,
            subject: `Follow-up Task Created - ${patientName}`,
            html: adminHtml,
            text: adminText,
          });
          emailStatus = { sent: true };
        } catch (emailError) {
          console.error('❌ Follow-up email error:', emailError.message || emailError);
          emailStatus = { sent: false, error: emailError.message || String(emailError) };
        }

        sendJson(res, emailStatus.sent ? 200 : 500, {
          success: emailStatus.sent,
          message: emailStatus.sent
            ? 'Follow-up email sent with attached PDF.'
            : `Follow-up email failed: ${emailStatus.error || 'unknown error'}`,
          followUpPdf: {
            filename: storedFollowUp.filename,
            localUrl: storedFollowUp.localUrl,
            publicUrl: storedFollowUp.publicUrl,
          },
        });
      } catch (error) {
        console.error('❌ Follow-up notification error:', error.message || error);
        sendJson(res, 500, { success: false, message: 'Failed to send follow-up notification: ' + (error.message || error) });
      }
    });

    return;
  }

  if (req.method === 'POST' && requestPath === '/api/send-report') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { patientName, patientEmail, patientPhone, reportType, title, description, date } = JSON.parse(body);
        const trimmedEmail = String(patientEmail || '').trim();
        if (!patientName || !reportType || !title || !date) {
          sendJson(res, 400, { success: false, message: 'Missing required report fields.' });
          return;
        }

        if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
          sendJson(res, 400, { success: false, message: 'Valid patient email is required to send the report.' });
          return;
        }

        const pdfBuffer = generateReportPdfBuffer({
          patientName,
          patientEmail: trimmedEmail,
          patientPhone,
          reportType,
          title,
          description,
          date,
        });
        const storedReport = saveNotificationPdf(pdfBuffer, patientName, 'report');

        const patientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Medical Report</h2>
            <p>Dear ${patientName},</p>
            <p>Your medical report is ready. Please review the attached PDF for details.</p>
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
              <p><strong>Report Type:</strong> ${sanitizeText(reportType)}</p>
              <p><strong>Title:</strong> ${sanitizeText(title)}</p>
              <p><strong>Date:</strong> ${formatDateText(date)}</p>
            </div>
            <p>If you have any questions, please contact our clinic.</p>
            <p>Regards,<br><strong>Dr. Rana Dental Clinic</strong><br>${clinicAddress}<br>Phone: ${clinicPhone}</p>
          </div>
        `;

        const patientText = `Dear ${patientName},\n\nYour medical report is ready. Please see the attached PDF for details.\n\nReport Type: ${sanitizeText(reportType)}\nTitle: ${sanitizeText(title)}\nDate: ${formatDateText(date)}\n\nRegards,\n${clinicName}\n${clinicAddress}\nPhone: ${clinicPhone}`;

        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">New Medical Report Added</h2>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
              <p><strong>Patient Name:</strong> ${patientName}</p>
              <p><strong>Email:</strong> <a href="mailto:${trimmedEmail}">${trimmedEmail}</a></p>
              <p><strong>Phone:</strong> ${sanitizeText(patientPhone) || 'N/A'}</p>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;" />
              <p><strong>Report Type:</strong> ${sanitizeText(reportType)}</p>
              <p><strong>Title:</strong> ${sanitizeText(title)}</p>
              <p><strong>Date:</strong> ${formatDateText(date)}</p>
              <p><strong>Description:</strong> ${sanitizeText(description)}</p>
            </div>
          </div>
        `;

        const adminText = `New Medical Report Added\n\nPatient Name: ${patientName}\nEmail: ${trimmedEmail}\nPhone: ${sanitizeText(patientPhone) || 'N/A'}\nReport Type: ${sanitizeText(reportType)}\nTitle: ${sanitizeText(title)}\nDate: ${formatDateText(date)}\nDescription: ${sanitizeText(description)}`;

        let emailStatus = { sent: false };
        try {
          await sendMail({
            to: trimmedEmail,
            subject: 'Dr. Rana Dental Clinic - Your Medical Report',
            html: patientHtml,
            text: patientText,
            attachments: [
              {
                filename: `report-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`,
                contentType: 'application/pdf',
                contentBase64: pdfBuffer.toString('base64'),
              },
            ],
          });

          await sendMail({
            to: adminEmail,
            subject: `Medical Report Ready - ${patientName}`,
            html: adminHtml,
            text: adminText,
          });
          emailStatus = { sent: true };
        } catch (emailError) {
          console.error('❌ Medical report email error:', emailError.message || emailError);
          emailStatus = { sent: false, error: emailError.message || String(emailError) };
        }

        sendJson(res, emailStatus.sent ? 200 : 500, {
          success: emailStatus.sent,
          message: emailStatus.sent
            ? 'Medical report email sent with attached PDF.'
            : `Medical report email failed: ${emailStatus.error || 'unknown error'}`,
          reportPdf: {
            filename: storedReport.filename,
            localUrl: storedReport.localUrl,
            publicUrl: storedReport.publicUrl,
          },
        });
      } catch (error) {
        console.error('❌ Medical report notification error:', error.message || error);
        sendJson(res, 500, { success: false, message: 'Failed to send medical report notification: ' + (error.message || error) });
      }
    });

    return;
  }

  if (req.method === 'POST' && requestPath === '/api/send-billing') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const {
          patientName,
          patientEmail,
          patientPhone,
          claimId,
          insuranceProvider,
          policyNumber,
          treatmentDate,
          amount,
          status,
          notes,
          submissionDate,
        } = JSON.parse(body);
        const trimmedEmail = String(patientEmail || '').trim();
        if (!patientName || !claimId || !insuranceProvider || amount === undefined || amount === null || !submissionDate) {
          sendJson(res, 400, { success: false, message: 'Missing required billing fields.' });
          return;
        }

        if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
          sendJson(res, 400, { success: false, message: 'Valid patient email is required to send the billing summary.' });
          return;
        }

        const pdfBuffer = generateBillingPdfBuffer({
          patientName,
          patientEmail: trimmedEmail,
          patientPhone,
          claimId,
          insuranceProvider,
          policyNumber,
          treatmentDate,
          amount,
          status,
          notes,
          submissionDate,
        });
        const storedBilling = saveNotificationPdf(pdfBuffer, patientName, 'billing');

        const patientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Billing Summary</h2>
            <p>Dear ${patientName},</p>
            <p>Your insurance claim summary and invoice details are attached as a PDF.</p>
            <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
              <p><strong>Claim ID:</strong> ${sanitizeText(claimId)}</p>
              <p><strong>Insurance Provider:</strong> ${sanitizeText(insuranceProvider)}</p>
              <p><strong>Amount:</strong> ${formatMoneyText(amount)}</p>
              <p><strong>Status:</strong> ${sanitizeText(status)}</p>
            </div>
            <p>If you have questions about this claim, please contact our billing office.</p>
            <p>Regards,<br><strong>Dr. Rana Dental Clinic</strong><br>${clinicAddress}<br>Phone: ${clinicPhone}</p>
          </div>
        `;

        const patientText = `Dear ${patientName},\n\nYour insurance claim summary and billing details are attached as a PDF.\n\nClaim ID: ${sanitizeText(claimId)}\nInsurance Provider: ${sanitizeText(insuranceProvider)}\nPolicy Number: ${sanitizeText(policyNumber) || 'N/A'}\nTreatment Date: ${formatDateText(treatmentDate)}\nAmount: ${formatMoneyText(amount)}\nStatus: ${sanitizeText(status)}\n\nRegards,\n${clinicName}\n${clinicAddress}\nPhone: ${clinicPhone}`;

        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">New Billing Summary Created</h2>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
              <p><strong>Patient Name:</strong> ${patientName}</p>
              <p><strong>Email:</strong> <a href="mailto:${trimmedEmail}">${trimmedEmail}</a></p>
              <p><strong>Phone:</strong> ${sanitizeText(patientPhone) || 'N/A'}</p>
              <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;" />
              <p><strong>Claim ID:</strong> ${sanitizeText(claimId)}</p>
              <p><strong>Insurance Provider:</strong> ${sanitizeText(insuranceProvider)}</p>
              <p><strong>Policy Number:</strong> ${sanitizeText(policyNumber) || 'N/A'}</p>
              <p><strong>Treatment Date:</strong> ${formatDateText(treatmentDate)}</p>
              <p><strong>Amount:</strong> ${formatMoneyText(amount)}</p>
              <p><strong>Status:</strong> ${sanitizeText(status)}</p>
              <p><strong>Notes:</strong> ${sanitizeText(notes)}</p>
            </div>
          </div>
        `;

        const adminText = `New Billing Summary Created\n\nPatient Name: ${patientName}\nEmail: ${trimmedEmail}\nPhone: ${sanitizeText(patientPhone) || 'N/A'}\nClaim ID: ${sanitizeText(claimId)}\nInsurance Provider: ${sanitizeText(insuranceProvider)}\nPolicy Number: ${sanitizeText(policyNumber) || 'N/A'}\nTreatment Date: ${formatDateText(treatmentDate)}\nAmount: ${formatMoneyText(amount)}\nStatus: ${sanitizeText(status)}\nNotes: ${sanitizeText(notes)}`;

        let emailStatus = { sent: false };
        try {
          await sendMail({
            to: trimmedEmail,
            subject: 'Dr. Rana Dental Clinic - Billing Summary',
            html: patientHtml,
            text: patientText,
            attachments: [
              {
                filename: `billing-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`,
                contentType: 'application/pdf',
                contentBase64: pdfBuffer.toString('base64'),
              },
            ],
          });

          await sendMail({
            to: adminEmail,
            subject: `Billing Summary Created - ${patientName}`,
            html: adminHtml,
            text: adminText,
          });
          emailStatus = { sent: true };
        } catch (emailError) {
          console.error('❌ Billing email error:', emailError.message || emailError);
          emailStatus = { sent: false, error: emailError.message || String(emailError) };
        }

        sendJson(res, emailStatus.sent ? 200 : 500, {
          success: emailStatus.sent,
          message: emailStatus.sent
            ? 'Billing email sent with attached PDF.'
            : `Billing email failed: ${emailStatus.error || 'unknown error'}`,
          billingPdf: {
            filename: storedBilling.filename,
            localUrl: storedBilling.localUrl,
            publicUrl: storedBilling.publicUrl,
          },
        });
      } catch (error) {
        console.error('❌ Billing notification error:', error.message || error);
        sendJson(res, 500, { success: false, message: 'Failed to send billing notification: ' + (error.message || error) });
      }
    });

    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Notification server running on http://localhost:${PORT}`);
  console.log(`   Sending emails from: ${emailUser}`);
  console.log(`   WATI configured: ${watiApiEndpoint && watiAccessToken ? 'yes' : 'no'}`);
});
