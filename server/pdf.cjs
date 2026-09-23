// Hand-rolled PDF generation (no external PDF library dependency).
//
// Builds a minimal but valid PDF 1.4 byte stream directly. Kept deliberately
// dependency-free so the backend doesn't need a native/binary PDF renderer
// installed on the host. Two document layouts are provided:
//   - generatePrescriptionPdfBuffer: the boxed prescription/Rx layout
//   - generateNotificationPdfBuffer (+ the 3 thin wrappers below): a shared
//     boxed layout used for follow-up reminders, medical reports and
//     insurance billing summaries so all clinic documents look consistent.

function sanitizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatDateText(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? sanitizeText(value) : date.toLocaleDateString();
}

function formatMoneyText(value) {
  if (value === undefined || value === null || value === '') return '';
  const amount = Number(value);
  return Number.isNaN(amount) ? sanitizeText(value) : `Rs. ${amount.toLocaleString('en-IN')}`;
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

function objectsWithTwoFonts(contentStream) {
  return [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];
}

function generatePrescriptionPdfBuffer({
  clinicInfo,
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
  const { clinicName, doctorName, clinicAddress, clinicPhone } = clinicInfo;
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
    pdfText('Prescription', 42, 790, 'F1', 11, [0.92, 0.97, 1]),
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
    const y = 548 - index * 28;
    contentLines.push(pdfText(line, 94, y, 'F1', 12, [0.08, 0.08, 0.08]));
  });

  const contentStream = contentLines.join('\n');
  return buildPdfFromObjects(objectsWithTwoFonts(contentStream));
}

function generateNotificationPdfBuffer({
  clinicInfo,
  patientName,
  patientEmail,
  patientPhone,
  documentTitle,
  sectionTitle,
  sectionLines,
}) {
  const { clinicName, doctorName, clinicAddress, clinicPhone } = clinicInfo;
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

  // Cap how many lines get rendered -- without this, a sufficiently long
  // description/notes field (nothing on the frontend limits their length)
  // would push text below the bottom of the content box (y=110) and off
  // the page entirely, since this hand-rolled layout has no pagination.
  // Mirrors the cap already applied to the prescription's Rx lines above.
  const MAX_SECTION_LINES = 25;
  const visibleLines = sectionLines.slice(0, MAX_SECTION_LINES);
  if (sectionLines.length > MAX_SECTION_LINES) {
    visibleLines[MAX_SECTION_LINES - 1] = '... (truncated, see admin dashboard for full details)';
  }

  visibleLines.forEach((line, index) => {
    const y = 632 - index * 18;
    contentLines.push(pdfText(line, 48, y, 'F1', 10, [0.1, 0.1, 0.1]));
  });

  contentLines.push(
    pdfText(clinicName, 42, 72, 'F2', 12, [0.16, 0.22, 0.35]),
    pdfText(`Address: ${clinicAddress}`, 42, 56, 'F1', 9, [0.25, 0.25, 0.25]),
    pdfText(`Phone: ${clinicPhone}`, 42, 40, 'F1', 9, [0.25, 0.25, 0.25]),
  );

  const contentStream = contentLines.join('\n');
  return buildPdfFromObjects(objectsWithTwoFonts(contentStream));
}

function generateFollowUpPdfBuffer({ clinicInfo, patientName, patientEmail, patientPhone, title, description, dueDate, type }) {
  const sectionLines = [
    `Follow-up: ${sanitizeText(title)}`,
    `Type: ${sanitizeText(type)}`,
    `Due Date: ${formatDateText(dueDate)}`,
    '',
    'Instructions:',
    ...wrapText(sanitizeText(description) || 'No additional details provided.', 66),
  ];

  return generateNotificationPdfBuffer({
    clinicInfo,
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Follow-up Reminder',
    sectionTitle: 'Follow-up Instructions',
    sectionLines,
  });
}

function generateReportPdfBuffer({ clinicInfo, patientName, patientEmail, patientPhone, reportType, title, description, date }) {
  const sectionLines = [
    `Report Type: ${sanitizeText(reportType)}`,
    `Title: ${sanitizeText(title)}`,
    `Date: ${formatDateText(date)}`,
    '',
    'Report Summary:',
    ...wrapText(sanitizeText(description) || 'No description provided.', 66),
  ];

  return generateNotificationPdfBuffer({
    clinicInfo,
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Medical Report',
    sectionTitle: 'Report Summary',
    sectionLines,
  });
}

function generateBillingPdfBuffer({
  clinicInfo,
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
    clinicInfo,
    patientName,
    patientEmail,
    patientPhone,
    documentTitle: 'Insurance Billing Summary',
    sectionTitle: 'Claim Details',
    sectionLines,
  });
}

module.exports = {
  sanitizeText,
  formatDateText,
  formatMoneyText,
  wrapText,
  generatePrescriptionPdfBuffer,
  generateFollowUpPdfBuffer,
  generateReportPdfBuffer,
  generateBillingPdfBuffer,
};
