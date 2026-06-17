const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Email configuration
const emailUser = process.env.EMAIL_USER || 'ngw.designer@gmail.com';
const emailPassword = (process.env.EMAIL_PASSWORD || 'xvqe hegc yscu sszt').replace(/\s/g, '');

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

function escapePdfText(value) {
  return sanitizeText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfText(text, x, y, size = 12) {
  return `${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
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

function generateFollowUpPdfBuffer({ patientName, patientEmail, patientPhone, title, description, dueDate, type }) {
  const lines = [
    'Follow-up Reminder',
    '-------------------',
    `Patient: ${sanitizeText(patientName)}`,
    `Email: ${sanitizeText(patientEmail)}`,
    `Phone: ${sanitizeText(patientPhone) || 'N/A'}`,
    `Type: ${sanitizeText(type)}`,
    `Due Date: ${formatDateText(dueDate)}`,
    '',
    'Instructions:',
    ...wrapText(sanitizeText(description) || 'No details provided.', 70),
  ];
  return buildBasicPdfBuffer(lines);
}

function generateReportPdfBuffer({ patientName, patientEmail, patientPhone, reportType, title, description, date }) {
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

function generateBillingPdfBuffer({ patientName, patientEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate }) {
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

// Create transporter
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

// Send booking confirmation email
app.post('/api/send-booking', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason } = req.body;

    console.log('📧 Sending booking emails for:', patientName);

    // Email to patient
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

    // Email to admin
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

    // Send emails
    const patientResult = await transporter.sendMail(patientMailOptions);
    const adminResult = await transporter.sendMail(adminMailOptions);

    console.log('✅ Emails sent successfully');
    console.log('   Patient email:', patientResult.response);
    console.log('   Admin email:', adminResult.response);

    res.json({ success: true, message: 'Emails sent to patient and admin.' });
  } catch (error) {
    console.error('❌ Email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send email: ' + error.message });
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
  res.json({ status: '✅ CardioVita Email Server Running', port: process.env.PORT || 5000 });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Email server running on http://localhost:${PORT}`);
  console.log('   Sending emails to: ngw.designer@gmail.com\n');
});
