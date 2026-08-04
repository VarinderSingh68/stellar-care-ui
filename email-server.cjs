const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' })); // Increased limit for potential large PDF data
app.use(cors()); // Enable CORS for all routes

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'email-server' });
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Email Server Status</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            color: #fff;
            font-family: Inter, system-ui, sans-serif;
          }
          .card {
            width: min(720px, calc(100% - 32px));
            padding: 32px;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 24px;
            background: rgba(15, 23, 42, 0.96);
            box-shadow: 0 35px 60px rgba(0, 0, 0, 0.35);
          }
          .title {
            margin: 0 0 16px;
            font-size: 1.75rem;
            letter-spacing: -0.03em;
          }
          .status {
            display: inline-flex;
            gap: 0.75rem;
            align-items: center;
            margin-bottom: 24px;
          }
          .dot {
            width: 14px;
            height: 14px;
            border-radius: 9999px;
            background: #f59e0b;
            box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18);
          }
          .info {
            font-size: 0.95rem;
            color: #cbd5e1;
            line-height: 1.8;
          }
          .info strong { color: #fff; }
          .pre {
            margin: 24px 0 0;
            padding: 18px;
            border-radius: 16px;
            background: rgba(255,255,255,0.04);
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="title">Email Server Status</h1>
          <div class="status">
            <span class="dot" id="status-dot"></span>
            <span id="status-label">Checking email server...</span>
          </div>
          <div class="info" id="status-message">Connecting to backend health endpoint.</div>
          <pre class="pre" id="status-details"></pre>
        </div>
        <script>
          const statusDot = document.getElementById('status-dot');
          const statusLabel = document.getElementById('status-label');
          const statusMessage = document.getElementById('status-message');
          const statusDetails = document.getElementById('status-details');

          fetch('/health', { cache: 'no-store' })
            .then(async (response) => {
              const json = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error('HTTP ' + response.status);
              }
              statusDot.style.background = '#22c55e';
              statusDot.style.boxShadow = '0 0 0 4px rgba(34,197,94,0.18)';
              statusLabel.textContent = 'Email server online';
              statusMessage.textContent = 'The email server is running and ready to accept API calls.';
              statusDetails.textContent = JSON.stringify(json, null, 2);
            })
            .catch((error) => {
              statusDot.style.background = '#f97316';
              statusDot.style.boxShadow = '0 0 0 4px rgba(249,115,22,0.18)';
              statusLabel.textContent = 'Email server offline';
              statusMessage.textContent = 'Unable to reach the backend health endpoint.';
              statusDetails.textContent = error?.message || 'Unknown error';
            });
        </script>
      </body>
    </html>
  `);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found.' });
  }
  res.redirect('/');
});

const BOOKINGS_FILE = 'bookings.json';

// Create bookings.json if it doesn't exist
if (!fs.existsSync(BOOKINGS_FILE)) {
  fs.writeFileSync(BOOKINGS_FILE, '[]', 'utf8');
}

// Email configuration
const emailUser = process.env.EMAIL_USER;
const emailPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s/g, '');

if (!emailUser || !emailPassword) {
  console.error("FATAL ERROR: EMAIL_USER or EMAIL_PASSWORD is not defined in the environment.");
  console.error("Please create a .env file in the root of the project and add these variables.");
  process.exit(1); // Exit with an error code
}

console.log('Setting up email with:', emailUser);

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDateText(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? sanitizeText(value) : date.toLocaleDateString();
}

function wrapText(value, maxLength) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
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
  return lines;
}

function buildBasicPdfBuffer(lines) {
  const contentLines = [
    'BT',
    '/F1 12 Tf',
    '1 0 0 1 40 800 Tm',
  ];
  lines.forEach((line, index) => {
    const y = 800 - index * 18;
    contentLines.push(`(${escapePdfText(line)}) Tj`, 'T*');
  });
  contentLines.push('ET');
  const contentStream = contentLines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];
  return buildPdfFromObjects(objects);
}

function buildPdfFromObjects(objects) {
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

// Professional PDF generation functions
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

function formatMoneyText(value) {
  if (!value) return '';
  const amount = Number(value);
  return Number.isNaN(amount) ? sanitizeText(value) : `INR ${amount.toLocaleString('en-IN')}`;
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
  const diagnosisLines = wrapText(sanitizeText(suffering) || '-', 74).slice(0, 2);
  const prescriptionLines = String(prescription || '')
    .split(/\r?\n/)
    .flatMap((line) => wrapText(sanitizeText(line), 70))
    .slice(0, 14);

  const contentLines = [
    // Header with blue background
    pdfRect(0, 770, 595, 72, [0.12, 0.35, 0.74]),
    // Border
    pdfRect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
    // Patient details box
    pdfRect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
    // Diagnosis box
    pdfRect(36, 612, 523, 62, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
    // Prescription area
    pdfRect(36, 110, 523, 485, null, [0.82, 0.87, 0.95], 1),
    
    // Clinic header
    pdfText('CardioVita Medical Center', 42, 810, 'F2', 22, [1, 1, 1]),
    pdfText('Medical Prescription', 42, 790, 'F1', 11, [0.92, 0.97, 1]),
    
    // Doctor info
    pdfText(`Doctor: Dr. Rana`, 410, 810, 'F2', 14, [1, 1, 1]),
    pdfText(`Phone: 6283968189`, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
    pdfText('New Mata Gujri Enclave, Janta Nagar, Kharar', 42, 774, 'F1', 9, [0.92, 0.97, 1]),
    pdfText('Punjab 140301', 42, 761, 'F1', 9, [0.92, 0.97, 1]),
    
    // Patient Details section
    pdfText('Patient Details', 48, 730, 'F2', 14, [0.16, 0.22, 0.35]),
    pdfText(`Name: ${sanitizeText(patientName)}`, 48, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Phone: ${sanitizeText(patientPhone) || '-'}`, 300, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Email: ${sanitizeText(patientEmail) || '-'}`, 48, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Visit: ${sanitizeText(visitDateText)}`, 300, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Gender/Age: ${genderAgeText}`, 48, 674, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Fees: ${feesText} | Paid: ${paidText}`, 300, 674, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Payment: ${statusText}`, 48, 660, 'F1', 9, [0.28, 0.28, 0.28]),
    pdfText(`Generated: ${sanitizeText(dateText)}`, 300, 660, 'F1', 9, [0.28, 0.28, 0.28]),
    
    // Diagnosis section
    pdfText('Diagnosis', 48, 650, 'F2', 13, [0.16, 0.22, 0.35]),
    pdfText(diagnosisLines[0] || '-', 48, 632, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(diagnosisLines[1] || '', 48, 616, 'F1', 11, [0.1, 0.1, 0.1]),
    
    // Rx symbol (large, blue)
    pdfText('Rx', 48, 576, 'F2', 24, [0.12, 0.35, 0.74]),
    
    // Prescription lines
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
    
    // Signature area
    pdfText('Signature', 430, 128, 'F1', 10, [0.35, 0.35, 0.35]),
    pdfLine(392, 142, 540, 142, 1),
    pdfText('Dr. Rana', 442, 116, 'F2', 12, [0.16, 0.22, 0.35]),
    
    // Footer
    pdfText('CardioVita Medical Center', 42, 72, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText('Address: New Mata Gujri Enclave, Janta Nagar, Kharar, Punjab 140301', 42, 56, 'F1', 9, [0.25, 0.25, 0.25]),
    pdfText('Phone: 6283968189', 42, 40, 'F1', 9, [0.25, 0.25, 0.25]),
  ];

  // Add prescription lines
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

  return buildPdfFromObjects(objects);
}

function generateFollowUpPdfBuffer({ patientName, patientEmail, patientPhone, title, description, dueDate, type, clinicName, doctorName, clinicAddress, clinicPhone }) {
  const dateText = new Date().toLocaleString();
  const dueDateText = formatDateText(dueDate);
  const descriptionLines = wrapText(sanitizeText(description) || 'No additional details provided.', 70);

  const contentLines = [
    // Header with blue background
    pdfRect(0, 770, 595, 72, [0.12, 0.35, 0.74]),
    // Border
    pdfRect(24, 24, 547, 794, null, [0.86, 0.9, 0.95], 1.2),
    // Patient details box
    pdfRect(36, 670, 523, 84, [0.95, 0.97, 1], [0.82, 0.87, 0.95], 1),
    // Task details box
    pdfRect(36, 580, 523, 72, [0.98, 0.99, 1], [0.86, 0.9, 0.95], 1),
    // Instructions area
    pdfRect(36, 110, 523, 455, null, [0.82, 0.87, 0.95], 1),

    // Clinic header
    pdfText(clinicName, 42, 810, 'F2', 22, [1, 1, 1]),
    pdfText('Follow-up Reminder', 42, 790, 'F1', 11, [0.92, 0.97, 1]),

    // Doctor info
    pdfText(`Doctor: Dr. Rana`, 410, 810, 'F2', 14, [1, 1, 1]),
    pdfText(`Phone: 6283968189`, 410, 790, 'F1', 11, [0.92, 0.97, 1]),
    pdfText('New Mata Gujri Enclave, Janta Nagar, Kharar', 42, 774, 'F1', 9, [0.92, 0.97, 1]),
    pdfText('Punjab 140301', 42, 761, 'F1', 9, [0.92, 0.97, 1]),
    
    // Patient Details section
    pdfText('Patient Details', 48, 730, 'F2', 14, [0.16, 0.22, 0.35]),
    pdfText(`Name: ${sanitizeText(patientName)}`, 48, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Phone: ${sanitizeText(patientPhone) || '-'}`, 300, 708, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Email: ${sanitizeText(patientEmail) || '-'}`, 48, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Generated: ${sanitizeText(dateText)}`, 300, 690, 'F1', 10, [0.2, 0.2, 0.2]),
    
    // Task Details section
    pdfText('Task Details', 48, 640, 'F2', 14, [0.16, 0.22, 0.35]),
    pdfText(`Task: ${sanitizeText(title)}`, 48, 620, 'F1', 11, [0.1, 0.1, 0.1]),
    pdfText(`Type: ${sanitizeText(type)}`, 48, 604, 'F1', 10, [0.2, 0.2, 0.2]),
    pdfText(`Due Date: ${dueDateText}`, 300, 604, 'F1', 10, [0.2, 0.2, 0.2]),
    
    // Instructions header (large, blue)
    pdfText('Instructions', 48, 560, 'F2', 18, [0.12, 0.35, 0.74]),

    // Instructions lines
    pdfLine(42, 548, 553, 548, 1),
    pdfLine(84, 520, 535, 520, 0.7),
    pdfLine(84, 492, 535, 492, 0.7),
    pdfLine(84, 464, 535, 464, 0.7),
    pdfLine(84, 436, 535, 436, 0.7),
    pdfLine(84, 408, 535, 408, 0.7),
    pdfLine(84, 380, 535, 380, 0.7),
    pdfLine(84, 352, 535, 352, 0.7),
    pdfLine(84, 324, 535, 324, 0.7),
    pdfLine(84, 296, 535, 296, 0.7),
    pdfLine(84, 268, 535, 268, 0.7),
    pdfLine(84, 240, 535, 240, 0.7),
    pdfLine(84, 212, 535, 212, 0.7),
    pdfLine(84, 184, 535, 184, 0.7),
    pdfLine(84, 156, 535, 156, 0.7),

    // Footer
    pdfText('CardioVita Medical Center', 42, 72, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText('Address: New Mata Gujri Enclave, Janta Nagar, Kharar, Punjab 140301', 42, 56, 'F1', 9, [0.25, 0.25, 0.25]),
    pdfText('Phone: 6283968189', 42, 40, 'F1', 9, [0.25, 0.25, 0.25]),
  ];

  // Add description lines
  descriptionLines.forEach((line, index) => {
    const y = 520 - (index * 28);
    contentLines.push(pdfText(`• ${line}`, 94, y, 'F1', 12, [0.08, 0.08, 0.08]));
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

  return buildPdfFromObjects(objects);
}

function generateReportPdfBuffer({ patientName, patientEmail, patientPhone, reportType, title, description, date, clinicName, doctorName, clinicAddress, clinicPhone }) {
  const lines = [
    'Medical Report',
    '---------------',
    `Patient: ${sanitizeText(patientName)}`,
    `Email: ${sanitizeText(patientEmail)}`,
    `Phone: ${sanitizeText(patientPhone) || 'N/A'}`,
    `Report Type: ${sanitizeText(reportType)}`,
    `Title: ${sanitizeText(title)}`,
    `Date: ${formatDateText(date)}`,
    '',
    'Summary:',
    ...wrapText(sanitizeText(description) || 'No description provided.', 70),
  ];
  return buildBasicPdfBuffer(lines);
}

function generateBillingPdfBuffer({ patientName, patientEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate, clinicName, doctorName, clinicAddress, clinicPhone }) {
  const lines = [
    'Insurance Billing Summary',
    '-------------------------',
    `Patient: ${sanitizeText(patientName)}`,
    `Email: ${sanitizeText(patientEmail)}`,
    `Phone: ${sanitizeText(patientPhone) || 'N/A'}`,
    `Claim ID: ${sanitizeText(claimId)}`,
    `Insurance: ${sanitizeText(insuranceProvider)}`,
    `Policy #: ${sanitizeText(policyNumber) || 'N/A'}`,
    `Treatment Date: ${formatDateText(treatmentDate)}`,
    `Amount: ₹${sanitizeText(String(amount))}`,
    `Status: ${sanitizeText(status)}`,
    `Submission Date: ${formatDateText(submissionDate)}`,
    '',
    'Notes:',
    ...wrapText(sanitizeText(notes) || 'No notes provided.', 70),
  ];
  return buildBasicPdfBuffer(lines);
}

// Create Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPassword,
  },
});

// Test email connection
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email server error:', error.message);
  } else {
    console.log('✅ Email server ready to send');
  }
});

// --- Removed custom SMTP client functions (waitForResponse, smtpCommand, sendMail) ---
// The Nodemailer 'transporter' will be used directly for sending emails.
// ---

// Get all bookings
app.get('/api/bookings', (req, res) => {
  fs.readFile(BOOKINGS_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Error reading bookings file:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to read bookings.' });
    }
    res.json(JSON.parse(data));
  });
});

async function sendBookingEmails({ patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason }) {
  try {
    console.log('📧 Sending booking emails for:', patientName);

    const patientMailOptions = {
      from: emailUser,
      to: patientEmail,
      subject: 'CardioVita - Appointment Confirmation',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Appointment Confirmation</h2>
          <p>Dear ${patientName},</p>
          <p>Thank you for booking an appointment with CardioVita. Your appointment details are:</p>
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p><strong>📅 Date:</strong> ${appointmentDate}</p>
            <p><strong>⏰ Time:</strong> ${appointmentTime}</p>
            <p><strong>📋 Reason:</strong> ${reason}</p>
          </div>
          <p>We will contact you at <strong>${patientPhone}</strong> to confirm your appointment.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">
            If you have any questions, please reply to this email.
          </p>
          <p style="margin-top: 20px;">Best regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
    };

    const adminMailOptions = {
      from: emailUser,
      to: 'ngw.designer@gmail.com',
      subject: `New Appointment Booking - ${patientName}`,
      html: `
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
      `,
    };

    const patientResult = await transporter.sendMail(patientMailOptions);
    const adminResult = await transporter.sendMail(adminMailOptions);

    console.log('✅ Emails sent successfully');
    console.log('   Patient email:', patientResult.response);
    console.log('   Admin email:', adminResult.response);
  } catch (error) {
    console.error('❌ Booking email error:', error?.message || error);
  }
}

// Send booking confirmation email
app.post('/api/send-booking', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason } = req.body;

    if (!patientName || !patientEmail || !patientPhone || !appointmentDate || !appointmentTime || !reason) {
      return res.status(400).json({ success: false, message: 'Missing booking fields.' });
    }

    const newBooking = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      patientName,
      patientEmail,
      patientPhone,
      appointmentDate,
      appointmentTime,
      reason,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    try {
      const data = await fs.promises.readFile(BOOKINGS_FILE, 'utf8');
      const bookings = JSON.parse(data);
      bookings.push(newBooking);
      await fs.promises.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf8');
      console.log('✅ Booking saved to file.');
    } catch (fileError) {
      if (fileError.code === 'ENOENT') {
        await fs.promises.writeFile(BOOKINGS_FILE, JSON.stringify([newBooking], null, 2), 'utf8');
        console.log('✅ Booking file created and saved.');
      } else {
        console.error('❌ Booking file save error:', fileError.message);
      }
    }

    res.json({ success: true, message: 'Booking received. Email notification is being processed.' });

    sendBookingEmails({ patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason });
  } catch (error) {
    console.error('❌ Booking endpoint error:', error?.message || error);
    res.status(500).json({ success: false, message: 'Failed to process booking.' });
  }
});

// Send prescription email
app.post('/api/send-prescription', async (req, res) => {
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
    } = req.body;

    const trimmedEmail = String(patientEmail || '').trim();

    // Validate required fields
    if (!patientName || !suffering || !prescription) {
      return res.status(400).json({ success: false, message: 'Missing required prescription fields.' });
    }

    // Validate email
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Valid patient email is required to send the prescription.' });
    }

    console.log('📧 Sending prescription email for:', patientName);

    // Generate PDF buffer
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
    
    // Nodemailer expects content as a Buffer, not base64 string
    const attachmentContent = pdfBuffer;

    // Store the PDF locally and get public/local URLs
    const prescriptionFilename = `prescription-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`;

    // Build patient email HTML
    const patientDetailRows = [
      ['Visit Date', formatDateText(visitDate || prescriptionDate)],
      ['Gender', gender],
      ['Age', age],
      ['Phone', patientPhone],
      ['Address', address],
      ['Total Fees', totalFees ? `₹${totalFees}` : ''],
      ['Amount Paid', amountPaid ? `₹${amountPaid}` : ''],
      ['Payment Status', paymentStatus],
      ['Next Appointment', formatDateText(nextAppointmentDate)],
      ['Notes', notes],
    ].filter(([, value]) => sanitizeText(value));

    const detailListHtml = patientDetailRows
      .map(([label, value]) => `<p><strong>${label}:</strong> ${sanitizeText(value)}</p>`)
      .join('');

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Your CardioVita Prescription</h2>
        <p>Dear ${patientName},</p>
        <p>Your prescription has been prepared. Please find your prescription PDF attached to this email.</p>
        <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Diagnosis:</strong> ${suffering}</p>
          ${detailListHtml}
        </div>
        <p>Please follow the prescription as advised and contact us for any urgent concern.</p>
        <p style="margin-top: 20px;">Best regards,<br><strong>CardioVita Medical Team</strong></p>
      </div>
    `;

    // Email to patient with PDF attachment
    const patientMailOptions = {
      from: emailUser,
      to: trimmedEmail,
      subject: 'CardioVita - Your Prescription PDF',
      html: patientHtml,
      attachments: [
        {
          filename: prescriptionFilename,
          content: attachmentContent, // Use Buffer directly
          contentType: 'application/pdf',
        },
      ],
    };

    // Email to admin
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Prescription Sent - ${patientName}</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
          <p><strong>Patient Name:</strong> ${patientName}</p>
          <p><strong>Email:</strong> <a href="mailto:${trimmedEmail}">${trimmedEmail}</a></p>
          <p><strong>Phone:</strong> ${sanitizeText(patientPhone) || 'N/A'}</p>
          <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>Diagnosis:</strong> ${suffering}</p>
          <p><strong>Prescription Date:</strong> ${formatDateText(prescriptionDate)}</p>
          <p><strong>Visit Date:</strong> ${formatDateText(visitDate)}</p>
        </div>
      </div>
    `;

    const adminMailOptions = {
      from: emailUser,
      to: 'ngw.designer@gmail.com',
      subject: `Prescription Sent - ${patientName}`,
      html: adminHtml,
    };

    // Send emails
    await transporter.sendMail(patientMailOptions); // Use Nodemailer transporter
    await transporter.sendMail(adminMailOptions);     // Use Nodemailer transporter

    console.log('✅ Prescription emails sent successfully');
    console.log('   Patient email:', trimmedEmail);
    console.log('   Admin notification sent');

    res.json({
      success: true,
      message: 'Prescription email sent successfully. PDF attached.',
    });
  } catch (error) {
    console.error('❌ Prescription email error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send prescription email: ' + error.message,
    });
  }
});

app.post('/api/send-followup', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, title, description, dueDate, type } = req.body;
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !trimmedEmail || !title || !dueDate || !type) {
      return res.status(400).json({ success: false, message: 'Missing required follow-up fields.' });
    }
    const pdfBuffer = generateFollowUpPdfBuffer({ patientName, patientEmail: trimmedEmail, patientPhone, title, description, dueDate, type });
    const followupFilename = `followup-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`;

    const patientMailOptions = {
      from: emailUser,
      to: trimmedEmail,
      subject: 'CardioVita - Follow-up Reminder',
      html: `
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
          <p>Regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
      attachments: [{ filename: followupFilename, content: pdfBuffer, contentType: 'application/pdf' }],
    };

    const adminMailOptions = {
      from: emailUser,
      to: 'ngw.designer@gmail.com',
      subject: `New Follow-up Task Created - ${patientName}`,
      html: `
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
      `,
    };

    await transporter.sendMail(patientMailOptions);
    await transporter.sendMail(adminMailOptions);

    res.json({ success: true, message: 'Follow-up email sent with attached PDF.' });
  } catch (error) {
    console.error('❌ Follow-up email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send follow-up email: ' + error.message });
  }
});

app.post('/api/send-report', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, reportType, title, description, date } = req.body;
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !trimmedEmail || !reportType || !title || !date) {
      return res.status(400).json({ success: false, message: 'Missing required report fields.' });
    }
    const pdfBuffer = generateReportPdfBuffer({ patientName, patientEmail: trimmedEmail, patientPhone, reportType, title, description, date });
    const reportFilename = `report-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`;

    const patientMailOptions = {
      from: emailUser,
      to: trimmedEmail,
      subject: 'CardioVita - Medical Report',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Medical Report</h2>
          <p>Dear ${patientName},</p>
          <p>Your medical report is ready. Please review the attached PDF for details.</p>
          <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
            <p><strong>Report Type:</strong> ${sanitizeText(reportType)}</p>
            <p><strong>Title:</strong> ${sanitizeText(title)}</p>
            <p><strong>Date:</strong> ${formatDateText(date)}</p>
          </div>
          <p>If you have any questions, please contact our team.</p>
          <p>Regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
      attachments: [{ filename: reportFilename, content: pdfBuffer, contentType: 'application/pdf' }],
    };

    const adminMailOptions = {
      from: emailUser,
      to: 'ngw.designer@gmail.com',
      subject: `Medical Report Ready - ${patientName}`,
      html: `
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
      `,
    };

    await transporter.sendMail(patientMailOptions);
    await transporter.sendMail(adminMailOptions);

    res.json({ success: true, message: 'Medical report email sent with attached PDF.' });
  } catch (error) {
    console.error('❌ Medical report email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send medical report email: ' + error.message });
  }
});

app.post('/api/send-billing', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate } = req.body;
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !trimmedEmail || !claimId || !insuranceProvider || amount == null || !submissionDate) {
      return res.status(400).json({ success: false, message: 'Missing required billing fields.' });
    }
    const pdfBuffer = generateBillingPdfBuffer({ patientName, patientEmail: trimmedEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate });
    const billingFilename = `billing-${sanitizeText(patientName).replace(/\s+/g, '-').toLowerCase() || 'patient'}.pdf`;

    const patientMailOptions = {
      from: emailUser,
      to: trimmedEmail,
      subject: 'CardioVita - Billing Summary',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Billing Summary</h2>
          <p>Dear ${patientName},</p>
          <p>Your billing summary and insurance claim details are attached as a PDF.</p>
          <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
            <p><strong>Claim ID:</strong> ${sanitizeText(claimId)}</p>
            <p><strong>Insurance Provider:</strong> ${sanitizeText(insuranceProvider)}</p>
            <p><strong>Amount:</strong> ₹${sanitizeText(String(amount))}</p>
            <p><strong>Status:</strong> ${sanitizeText(status)}</p>
          </div>
          <p>If you have questions about this claim, please contact our billing team.</p>
          <p>Regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
      attachments: [{ filename: billingFilename, content: pdfBuffer, contentType: 'application/pdf' }],
    };

    const adminMailOptions = {
      from: emailUser,
      to: 'ngw.designer@gmail.com',
      subject: `Billing Summary Created - ${patientName}`,
      html: `
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
            <p><strong>Amount:</strong> ₹${sanitizeText(String(amount))}</p>
            <p><strong>Status:</strong> ${sanitizeText(status)}</p>
            <p><strong>Notes:</strong> ${sanitizeText(notes)}</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(patientMailOptions);
    await transporter.sendMail(adminMailOptions);

    res.json({ success: true, message: 'Billing email sent with attached PDF.' });
  } catch (error) {
    console.error('❌ Billing email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send billing email: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(indexPath);
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(indexPath);
});

const PORT = Number(process.env.PORT) || 5004;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Email server running on http://0.0.0.0:${PORT}`);
  console.log('   Sending emails to: ngw.designer@gmail.com\n');
});
