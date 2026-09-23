// Dr. Rana Dental Clinic -- unified backend API.
//
// This is the single backend entry point for the whole app (kept as
// `email-server.cjs` so render.yaml / Procfile / package.json scripts do
// not need to change). It replaces the previous three overlapping servers
// (server.ts, email-server.cjs, simple-email-server.cjs) with one Express
// app that provides:
//   - Server-side, file-backed storage for every collection the admin
//     console and patient portal use (patients, appointments, treatment
//     plans, clinical notes, staff, settings, follow-ups, consent forms,
//     medical reports, insurance billing, media, portal patient accounts)
//     instead of browser localStorage, so data is shared across devices
//     and visible to every visitor, not just the admin's own browser.
//   - Admin and patient-portal authentication (hashed passwords, signed
//     session tokens) instead of the old plaintext/no-auth checks.
//   - Email (Gmail SMTP via Nodemailer) and optional WhatsApp (WATI)
//     notifications, with correct "Dr. Rana Dental Clinic" branding.
//   - Hand-rolled PDF generation for prescriptions, follow-ups, reports
//     and billing summaries.
//
// See server/store.cjs for a note on data persistence on hosts with an
// ephemeral filesystem (e.g. Render web services without a Disk).

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

dotenv.config();

const { JsonStore } = require('./server/store.cjs');
const { getOrCreateSessionSecret, hashPassword, verifyPassword, createTokenFactory, getBearerToken } = require('./server/auth.cjs');
const { createMailer } = require('./server/mailer.cjs');
const { createWatiClient } = require('./server/wati.cjs');
const { COLLECTIONS } = require('./server/collections.cjs');
const pdf = require('./server/pdf.cjs');

// ---------------------------------------------------------------------------
// Data directory + migration of the legacy root-level bookings.json
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'media');
const PRESCRIPTIONS_DIR = path.join(DATA_DIR, 'runtime-prescriptions');
[UPLOADS_DIR, PRESCRIPTIONS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const legacyBookingsPath = path.resolve(__dirname, 'bookings.json');
const newBookingsPath = path.join(DATA_DIR, 'bookings.json');
if (!fs.existsSync(newBookingsPath) && fs.existsSync(legacyBookingsPath)) {
  try {
    fs.copyFileSync(legacyBookingsPath, newBookingsPath);
    console.log('ℹ️  Migrated existing bookings.json into', newBookingsPath);
  } catch (error) {
    console.error('⚠️  Could not migrate legacy bookings.json:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const bookingsStore = new JsonStore(newBookingsPath, []);

const DEFAULT_CLINIC_SETTINGS = {
  clinicName: 'Dr. Rana Dental Clinic',
  doctorName: 'Dr. Rana',
  phone: process.env.CLINIC_PHONE || '090414 81946',
  whatsappNumber: '',
  email: '',
  address: 'New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301',
  openingTime: '10:00',
  closingTime: '19:00',
  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  prescriptionFooter: 'Please follow the prescription as advised and contact the clinic for any urgent concern.',
  reminderLeadHours: '24',
};

const settingsStore = new JsonStore(path.join(DATA_DIR, 'settings.json'), DEFAULT_CLINIC_SETTINGS);
const adminCredentialsStore = new JsonStore(path.join(DATA_DIR, 'admin-credentials.json'), null);

const stores = {};
Object.entries(COLLECTIONS).forEach(([name, config]) => {
  stores[name] = new JsonStore(path.join(DATA_DIR, config.file), config.default);
});

// ---------------------------------------------------------------------------
// Bootstrap: default admin account + demo patient portal account
// ---------------------------------------------------------------------------

const ADMIN_DEFAULT_USERNAME = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'password123';

async function bootstrapAdminCredentials() {
  const existing = await adminCredentialsStore.read();
  if (existing && existing.username && existing.passwordHash) return;
  await adminCredentialsStore.write({
    username: ADMIN_DEFAULT_USERNAME,
    passwordHash: hashPassword(ADMIN_DEFAULT_PASSWORD),
  });
  console.log(`ℹ️  Created default admin account (${ADMIN_DEFAULT_USERNAME} / ${ADMIN_DEFAULT_PASSWORD}).`);
  console.log('   Change this immediately from Admin Dashboard -> Settings once you log in.');
}

async function bootstrapDemoPatient() {
  const patients = await stores['portal-patients'].read();
  if (patients.some((p) => p.patientEmail === 'patient@demo.com')) return;
  const demoPatient = {
    id: `patient-demo-${crypto.randomBytes(4).toString('hex')}`,
    patientName: 'Demo Patient',
    patientEmail: 'patient@demo.com',
    patientPhone: '9999999999',
    password: hashPassword('demo123'),
    age: '30',
    gender: 'other',
    address: '',
  };
  await stores['portal-patients'].write([...patients, demoPatient]);
  console.log('ℹ️  Seeded demo patient portal account (patient@demo.com / demo123).');
}

const bootstrapPromise = Promise.all([bootstrapAdminCredentials(), bootstrapDemoPatient()]).catch((error) => {
  console.error('❌ Bootstrap error:', error.message);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const SESSION_SECRET = getOrCreateSessionSecret(DATA_DIR);
const { signToken, verifyToken } = createTokenFactory(SESSION_SECRET);

const ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const PATIENT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function authenticateRequest(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !payload.role) return null;
  return payload; // { role: 'admin' } or { role: 'patient', sub: patientId }
}

function requireAdmin(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth || auth.role !== 'admin') {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }
  req.auth = auth;
  next();
}

function requirePatient(req, res, next) {
  const auth = authenticateRequest(req);
  if (!auth || auth.role !== 'patient') {
    return res.status(401).json({ success: false, message: 'Patient authentication required.' });
  }
  req.auth = auth;
  next();
}

// ---------------------------------------------------------------------------
// Mailer / WATI
// ---------------------------------------------------------------------------

const mailer = createMailer();
const wati = createWatiClient();
const ADMIN_NOTIFICATION_EMAIL = (process.env.ADMIN_NOTIFICATION_EMAIL || '').trim() || null;

async function sendMailSafe(options) {
  if (!mailer.configured) {
    return { sent: false, error: 'Email is not configured on the server (EMAIL_USER / EMAIL_PASSWORD missing).' };
  }
  try {
    await mailer.transporter.sendMail({ from: mailer.fromAddress, ...options });
    return { sent: true };
  } catch (error) {
    console.error('❌ Email send error:', error?.message || error);
    return { sent: false, error: error?.message || String(error) };
  }
}

async function getClinicInfo() {
  const settings = await settingsStore.read();
  const merged = { ...DEFAULT_CLINIC_SETTINGS, ...settings };
  return {
    clinicName: merged.clinicName,
    doctorName: merged.doctorName,
    clinicAddress: merged.address,
    clinicPhone: merged.phone,
  };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dr-rana-dental-clinic-api',
    emailConfigured: mailer.configured,
    watiConfigured: wati.configured,
  });
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dr. Rana Dental Clinic - API Status</title>
        <style>
          body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #000; color: #fff; font-family: Inter, system-ui, sans-serif; }
          .card { width: min(720px, calc(100% - 32px)); padding: 32px; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; background: rgba(15, 23, 42, 0.96); box-shadow: 0 35px 60px rgba(0, 0, 0, 0.35); }
          .title { margin: 0 0 16px; font-size: 1.75rem; letter-spacing: -0.03em; }
          .status { display: inline-flex; gap: 0.75rem; align-items: center; margin-bottom: 24px; }
          .dot { width: 14px; height: 14px; border-radius: 9999px; background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,0.18); }
          .info { font-size: 0.95rem; color: #cbd5e1; line-height: 1.8; }
          .info strong { color: #fff; }
          .pre { margin: 24px 0 0; padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.04); color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="title">Dr. Rana Dental Clinic -- API</h1>
          <div class="status"><span class="dot"></span><span>API online</span></div>
          <div class="info">This is the backend API for the clinic website and admin console.</div>
          <pre class="pre" id="details">Loading status...</pre>
        </div>
        <script>
          fetch('/health').then((r) => r.json()).then((j) => {
            document.getElementById('details').textContent = JSON.stringify(j, null, 2);
          }).catch(() => {});
        </script>
      </body>
    </html>
  `);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

app.get('/api/settings', async (req, res) => {
  const settings = await settingsStore.read();
  res.json({ ...DEFAULT_CLINIC_SETTINGS, ...settings });
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ success: false, message: 'Expected a settings object.' });
  }
  const next = { ...DEFAULT_CLINIC_SETTINGS, ...req.body };
  await settingsStore.write(next);
  res.json({ success: true, settings: next });
});

// ---------------------------------------------------------------------------
// Admin auth
// ---------------------------------------------------------------------------

app.post('/api/admin/login', async (req, res) => {
  await bootstrapPromise;
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  const credentials = await adminCredentialsStore.read();
  if (!credentials || username !== credentials.username || !verifyPassword(password, credentials.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  const token = signToken({ role: 'admin', sub: 'admin' }, ADMIN_TOKEN_TTL_SECONDS);
  res.json({ success: true, token, username: credentials.username });
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  const credentials = await adminCredentialsStore.read();
  res.json({ success: true, username: credentials?.username || ADMIN_DEFAULT_USERNAME });
});

app.post('/api/admin/change-credentials', requireAdmin, async (req, res) => {
  const nextUsername = String(req.body?.username || '').trim();
  const nextPassword = String(req.body?.password || '');
  if (!nextUsername) {
    return res.status(400).json({ success: false, message: 'Username cannot be empty.' });
  }

  const current = await adminCredentialsStore.read();
  const updated = {
    username: nextUsername,
    passwordHash: nextPassword ? hashPassword(nextPassword) : current.passwordHash,
  };
  await adminCredentialsStore.write(updated);
  res.json({ success: true, username: updated.username });
});

// ---------------------------------------------------------------------------
// Patient portal auth
// ---------------------------------------------------------------------------

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function publicPatient(record) {
  if (!record) return record;
  const { password, ...rest } = record;
  return rest;
}

app.post('/api/patient/register', async (req, res) => {
  const name = String(req.body?.patientName || req.body?.name || '').trim();
  const email = String(req.body?.patientEmail || req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.patientPhone || req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const age = req.body?.age !== undefined ? String(req.body.age).trim() : undefined;
  const gender = req.body?.gender ? String(req.body.gender).trim() : undefined;
  const address = req.body?.address ? String(req.body.address).trim() : undefined;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, phone and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  const result = await stores['portal-patients'].update((records) => {
    if (records.some((p) => p.patientEmail === email)) {
      throw Object.assign(new Error('Email already registered'), { code: 'DUPLICATE' });
    }
    const record = {
      id: `patient-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      patientName: name,
      patientEmail: email,
      patientPhone: phone,
      password: hashPassword(password),
      age,
      gender,
      address,
    };
    return [...records, record];
  }).catch((error) => {
    if (error.code === 'DUPLICATE') return null;
    throw error;
  });

  if (!result) {
    return res.status(409).json({ success: false, message: 'This email is already registered.' });
  }

  const created = result[result.length - 1];
  const token = signToken({ role: 'patient', sub: created.id }, PATIENT_TOKEN_TTL_SECONDS);
  res.json({ success: true, token, patient: publicPatient(created) });
});

app.post('/api/patient/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const records = await stores['portal-patients'].read();
  const patient = records.find((p) => p.patientEmail === email);
  if (!patient || !verifyPassword(password, patient.password)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const token = signToken({ role: 'patient', sub: patient.id }, PATIENT_TOKEN_TTL_SECONDS);
  res.json({ success: true, token, patient: publicPatient(patient) });
});

app.get('/api/patient/me', requirePatient, async (req, res) => {
  const records = await stores['portal-patients'].read();
  const patient = records.find((p) => p.id === req.auth.sub);
  if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });
  res.json({ success: true, patient: publicPatient(patient) });
});

app.patch('/api/patient/follow-ups/:id', requirePatient, async (req, res) => {
  const allowedFields = ['status', 'completedDate'];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body && req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const updated = await stores['follow-ups'].update((items) => {
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1 || items[index].patientId !== req.auth.sub) return items;
    const next = [...items];
    next[index] = { ...next[index], ...updates };
    return next;
  });

  const item = updated.find((entry) => entry.id === req.params.id);
  if (!item || item.patientId !== req.auth.sub) {
    return res.status(404).json({ success: false, message: 'Follow-up not found.' });
  }
  res.json({ success: true, followUp: item });
});

app.post('/api/patient/consent-forms/:id/sign', requirePatient, async (req, res) => {
  const updated = await stores['consent-forms'].update((items) => {
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1 || items[index].patientId !== req.auth.sub) return items;
    const next = [...items];
    next[index] = { ...next[index], isSigned: true, signatureDate: new Date().toISOString() };
    return next;
  });

  const item = updated.find((entry) => entry.id === req.params.id);
  if (!item || item.patientId !== req.auth.sub) {
    return res.status(404).json({ success: false, message: 'Consent form not found.' });
  }
  res.json({ success: true, consentForm: item });
});

// ---------------------------------------------------------------------------
// Generic collection data API (admin full access; a handful of patient-care
// collections are also readable -- filtered to the caller's own records --
// with a patient token). See server/collections.cjs for the access rules.
// ---------------------------------------------------------------------------

app.get('/api/data/:name', async (req, res) => {
  const config = COLLECTIONS[req.params.name];
  if (!config || req.params.name === 'media') {
    return res.status(404).json({ success: false, message: 'Unknown collection.' });
  }

  const auth = authenticateRequest(req);
  if (!auth) return res.status(401).json({ success: false, message: 'Authentication required.' });

  if (auth.role === 'admin') {
    let data = await stores[req.params.name].read();
    if (config.stripFields) {
      data = data.map((item) => {
        const copy = { ...item };
        config.stripFields.forEach((field) => delete copy[field]);
        return copy;
      });
    }
    return res.json(data);
  }

  if (auth.role === 'patient' && !config.adminOnly && config.patientFilterField) {
    const data = await stores[req.params.name].read();
    const filtered = data.filter((item) => item[config.patientFilterField] === auth.sub);
    return res.json(filtered);
  }

  return res.status(403).json({ success: false, message: 'You do not have access to this collection.' });
});

app.put('/api/data/:name', requireAdmin, async (req, res) => {
  const config = COLLECTIONS[req.params.name];
  if (!config) return res.status(404).json({ success: false, message: 'Unknown collection.' });
  if (!Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Expected an array.' });

  await stores[req.params.name].write(req.body);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Media (public read so every visitor sees published testimonials media;
// admin-only publish/upload/delete via the generic PUT above + upload route)
// ---------------------------------------------------------------------------

app.get('/api/media', async (req, res) => {
  const media = await stores.media.read();
  res.json(media);
});

const ALLOWED_MEDIA_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
const MAX_MEDIA_UPLOAD_BYTES = 15 * 1024 * 1024;

app.post('/api/admin/media-upload', requireAdmin, async (req, res) => {
  const { contentType, dataBase64 } = req.body || {};
  const extension = ALLOWED_MEDIA_TYPES[contentType];
  if (!extension) {
    return res.status(400).json({ success: false, message: 'Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, WebM or MOV.' });
  }
  if (!dataBase64 || typeof dataBase64 !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing file data.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid file data.' });
  }

  if (buffer.length === 0 || buffer.length > MAX_MEDIA_UPLOAD_BYTES) {
    return res.status(400).json({ success: false, message: `File must be between 1 byte and ${MAX_MEDIA_UPLOAD_BYTES / (1024 * 1024)}MB. For larger videos, paste a hosted URL instead.` });
  }

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  res.json({ success: true, url: `/uploads/media/${filename}` });
});

// ---------------------------------------------------------------------------
// Bookings / appointments
// ---------------------------------------------------------------------------

app.get('/api/bookings', requireAdmin, async (req, res) => {
  const bookings = await bookingsStore.read();
  res.json(bookings);
});

app.post('/api/appointments', requireAdmin, async (req, res) => {
  const { patientName, appointmentDate, appointmentTime, reason } = req.body || {};
  if (!patientName || !appointmentDate || !appointmentTime || !reason) {
    return res.status(400).json({ success: false, message: 'Missing required appointment fields.' });
  }

  const appointment = {
    id: req.body.id || `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    patientId: req.body.patientId,
    patientName,
    patientEmail: req.body.patientEmail,
    patientPhone: req.body.patientPhone,
    appointmentDate,
    appointmentTime,
    durationMinutes: req.body.durationMinutes || 30,
    reason,
    status: req.body.status || 'scheduled',
    notes: req.body.notes,
    bookingDate: req.body.bookingDate || new Date().toISOString(),
  };

  const bookings = await bookingsStore.update((list) => [...list, appointment]);
  res.json({ success: true, message: 'Appointment saved.', appointment, count: bookings.length });
});

app.put('/api/appointments/:id', requireAdmin, async (req, res) => {
  let found = null;
  const updated = await bookingsStore.update((list) => {
    const index = list.findIndex((item) => item.id === req.params.id);
    if (index === -1) return list;
    const next = [...list];
    next[index] = { ...next[index], ...req.body };
    found = next[index];
    return next;
  });

  if (!found) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  res.json({ success: true, message: 'Appointment updated.', appointment: found });
});

// ---------------------------------------------------------------------------
// Public booking + notification endpoints
// ---------------------------------------------------------------------------

app.post('/api/send-booking', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, appointmentDate, appointmentTime, reason } = req.body || {};
    if (!patientName || !patientEmail || !patientPhone || !appointmentDate || !appointmentTime || !reason) {
      return res.status(400).json({ success: false, message: 'Missing booking fields.' });
    }
    if (!isValidEmail(patientEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const clinicInfo = await getClinicInfo();
    const newBooking = {
      id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      patientName,
      patientEmail,
      patientPhone,
      appointmentDate,
      appointmentTime,
      reason,
      status: 'scheduled',
      bookingDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await bookingsStore.update((list) => [...list, newBooking]);

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Appointment Confirmation</h2>
        <p>Dear ${patientName},</p>
        <p>Thank you for booking an appointment with ${clinicInfo.clinicName}. Your appointment details are:</p>
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p><strong>Date:</strong> ${pdf.formatDateText(appointmentDate)}</p>
          <p><strong>Time:</strong> ${appointmentTime}</p>
          <p><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>We will contact you at <strong>${patientPhone}</strong> to confirm your appointment.</p>
        <p style="margin-top: 20px;">Best regards,<br><strong>${clinicInfo.clinicName}</strong><br>${clinicInfo.clinicAddress}<br>Phone: ${clinicInfo.clinicPhone}</p>
      </div>`;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">New Appointment Booking</h2>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
          <p><strong>Patient Name:</strong> ${patientName}</p>
          <p><strong>Email:</strong> ${patientEmail}</p>
          <p><strong>Phone:</strong> ${patientPhone}</p>
          <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>Appointment Date:</strong> ${pdf.formatDateText(appointmentDate)}</p>
          <p><strong>Appointment Time:</strong> ${appointmentTime}</p>
          <p><strong>Reason for Visit:</strong> ${reason}</p>
        </div>
      </div>`;

    const emailResults = { sent: false };
    setImmediate(async () => {
      const patientResult = await sendMailSafe({ to: patientEmail, subject: `${clinicInfo.clinicName} - Appointment Confirmation`, html: patientHtml });
      if (ADMIN_NOTIFICATION_EMAIL) {
        await sendMailSafe({ to: ADMIN_NOTIFICATION_EMAIL, subject: `New Appointment Booking - ${patientName}`, html: adminHtml });
      }
      if (!patientResult.sent) {
        console.error('❌ Booking confirmation email failed:', patientResult.error);
      }
    });

    const whatsapp = await wati.sendBookingWhatsApp({
      patientName,
      patientPhone,
      appointmentDate: pdf.formatDateText(appointmentDate),
      appointmentTime,
      clinicPhone: clinicInfo.clinicPhone,
    });

    res.json({
      success: true,
      message: mailer.configured
        ? 'Booking received. Confirmation email is being sent.'
        : 'Booking received and saved. Email notifications are disabled on the server right now.',
      notifications: { whatsapp },
    });
  } catch (error) {
    console.error('❌ Booking endpoint error:', error?.message || error);
    res.status(500).json({ success: false, message: 'Failed to process booking.' });
  }
});

app.post('/api/send-prescription', requireAdmin, async (req, res) => {
  try {
    const {
      patientName, patientEmail, patientPhone, gender, age, address,
      suffering, prescription, prescriptionDate, visitDate,
      totalFees, amountPaid, paymentStatus, nextAppointmentDate, notes,
    } = req.body || {};

    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !suffering || !prescription) {
      return res.status(400).json({ success: false, message: 'Missing required prescription fields.' });
    }
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Valid patient email is required to send the prescription.' });
    }

    const clinicInfo = await getClinicInfo();
    const pdfBuffer = pdf.generatePrescriptionPdfBuffer({
      clinicInfo, patientName, patientEmail: trimmedEmail, patientPhone, gender, age,
      suffering, prescription, prescriptionDate, visitDate, totalFees, amountPaid, paymentStatus,
    });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-prescription.pdf`;
    fs.writeFileSync(path.join(PRESCRIPTIONS_DIR, filename), pdfBuffer);
    const publicAppUrl = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    const pathname = `/api/prescriptions/${encodeURIComponent(filename)}`;
    const localUrl = `${req.protocol}://${req.get('host')}${pathname}`;
    const publicUrl = publicAppUrl ? `${publicAppUrl}${pathname}` : localUrl;

    const patientDetailRows = [
      ['Visit Date', pdf.formatDateText(visitDate || prescriptionDate)],
      ['Gender', gender], ['Age', age], ['Phone', patientPhone], ['Address', address],
      ['Total Fees', pdf.formatMoneyText(totalFees)], ['Amount Paid', pdf.formatMoneyText(amountPaid)],
      ['Payment Status', paymentStatus], ['Next Appointment', pdf.formatDateText(nextAppointmentDate)], ['Notes', notes],
    ].filter(([, value]) => pdf.sanitizeText(value));
    const detailListHtml = patientDetailRows.map(([label, value]) => `<p><strong>${label}:</strong> ${pdf.sanitizeText(value)}</p>`).join('');

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Your ${clinicInfo.clinicName} Prescription</h2>
        <p>Dear ${patientName},</p>
        <p>Your prescription has been prepared by ${clinicInfo.doctorName}. Please find your prescription PDF attached to this email.</p>
        <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Diagnosis:</strong> ${suffering}</p>
          ${detailListHtml}
        </div>
        <p>${(await settingsStore.read()).prescriptionFooter || DEFAULT_CLINIC_SETTINGS.prescriptionFooter}</p>
        <p style="margin-top: 20px;">Best regards,<br><strong>${clinicInfo.clinicName}</strong><br>${clinicInfo.clinicAddress}<br>Phone: ${clinicInfo.clinicPhone}</p>
      </div>`;

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Your Prescription PDF`,
      html: patientHtml,
      attachments: [{ filename: 'prescription.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    if (ADMIN_NOTIFICATION_EMAIL && emailResult.sent) {
      sendMailSafe({
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `Prescription Sent - ${patientName}`,
        html: `<p><strong>${patientName}</strong> (${trimmedEmail}) was sent a prescription.</p>`,
      }).catch(() => {});
    }

    const whatsapp = await wati.sendPrescriptionWhatsApp({
      patientName, patientPhone, pdfUrl: publicAppUrl ? publicUrl : '', clinicPhone: clinicInfo.clinicPhone,
    });

    res.json({
      success: emailResult.sent,
      message: emailResult.sent
        ? 'Prescription email sent successfully.'
        : `Prescription PDF generated, but the email failed to send: ${emailResult.error}`,
      prescriptionPdf: { filename, localUrl, publicUrl },
      notifications: { email: emailResult, whatsapp },
    });
  } catch (error) {
    console.error('❌ Prescription email error:', error?.message || error);
    res.status(500).json({ success: false, message: `Failed to send prescription email: ${error.message}` });
  }
});

app.get('/api/prescriptions/:filename', (req, res) => {
  const rawFilename = req.params.filename;
  if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(rawFilename)) {
    return res.status(400).json({ success: false, message: 'Invalid file name.' });
  }
  const filePath = path.resolve(PRESCRIPTIONS_DIR, rawFilename);
  if (!filePath.startsWith(`${PRESCRIPTIONS_DIR}${path.sep}`) || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${rawFilename}"`);
  fs.createReadStream(filePath).pipe(res);
});

app.post('/api/send-followup', requireAdmin, async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, title, description, dueDate, type } = req.body || {};
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !title || !dueDate || !type) {
      return res.status(400).json({ success: false, message: 'Missing required follow-up fields.' });
    }
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Valid patient email is required to send the follow-up reminder.' });
    }

    const clinicInfo = await getClinicInfo();
    const pdfBuffer = pdf.generateFollowUpPdfBuffer({ clinicInfo, patientName, patientEmail: trimmedEmail, patientPhone, title, description, dueDate, type });

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Follow-up Reminder</h2>
        <p>Dear ${patientName},</p>
        <p>Your care team has created a follow-up task for you. Please find the details attached.</p>
        <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Task:</strong> ${pdf.sanitizeText(title)}</p>
          <p><strong>Type:</strong> ${pdf.sanitizeText(type)}</p>
          <p><strong>Due Date:</strong> ${pdf.formatDateText(dueDate)}</p>
        </div>
        <p>Regards,<br><strong>${clinicInfo.clinicName}</strong><br>${clinicInfo.clinicAddress}<br>Phone: ${clinicInfo.clinicPhone}</p>
      </div>`;

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Follow-up Reminder`,
      html: patientHtml,
      attachments: [{ filename: 'follow-up.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    res.json({
      success: emailResult.sent,
      message: emailResult.sent ? 'Follow-up email sent successfully.' : `Follow-up email failed: ${emailResult.error}`,
      notifications: { email: emailResult },
    });
  } catch (error) {
    console.error('❌ Follow-up email error:', error?.message || error);
    res.status(500).json({ success: false, message: `Failed to send follow-up email: ${error.message}` });
  }
});

app.post('/api/send-report', requireAdmin, async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, reportType, title, description, date } = req.body || {};
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !reportType || !title || !date) {
      return res.status(400).json({ success: false, message: 'Missing required report fields.' });
    }
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Valid patient email is required to send the report.' });
    }

    const clinicInfo = await getClinicInfo();
    const pdfBuffer = pdf.generateReportPdfBuffer({ clinicInfo, patientName, patientEmail: trimmedEmail, patientPhone, reportType, title, description, date });

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Medical Report</h2>
        <p>Dear ${patientName},</p>
        <p>Your medical report is ready. Please find it attached.</p>
        <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Report Type:</strong> ${pdf.sanitizeText(reportType)}</p>
          <p><strong>Title:</strong> ${pdf.sanitizeText(title)}</p>
          <p><strong>Date:</strong> ${pdf.formatDateText(date)}</p>
        </div>
        <p>Regards,<br><strong>${clinicInfo.clinicName}</strong><br>${clinicInfo.clinicAddress}<br>Phone: ${clinicInfo.clinicPhone}</p>
      </div>`;

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Medical Report`,
      html: patientHtml,
      attachments: [{ filename: 'medical-report.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    res.json({
      success: emailResult.sent,
      message: emailResult.sent ? 'Medical report email sent successfully.' : `Medical report email failed: ${emailResult.error}`,
      notifications: { email: emailResult },
    });
  } catch (error) {
    console.error('❌ Medical report email error:', error?.message || error);
    res.status(500).json({ success: false, message: `Failed to send medical report email: ${error.message}` });
  }
});

app.post('/api/send-billing', requireAdmin, async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate } = req.body || {};
    const trimmedEmail = String(patientEmail || '').trim();
    if (!patientName || !claimId || !insuranceProvider || amount === undefined || amount === null || !submissionDate) {
      return res.status(400).json({ success: false, message: 'Missing required billing fields.' });
    }
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Valid patient email is required to send the billing summary.' });
    }

    const clinicInfo = await getClinicInfo();
    const pdfBuffer = pdf.generateBillingPdfBuffer({ clinicInfo, patientName, patientEmail: trimmedEmail, patientPhone, claimId, insuranceProvider, policyNumber, treatmentDate, amount, status, notes, submissionDate });

    const patientHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Billing Summary</h2>
        <p>Dear ${patientName},</p>
        <p>Your billing summary and insurance claim details are ready. Please find it attached.</p>
        <div style="background-color: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2563eb;">
          <p><strong>Claim ID:</strong> ${pdf.sanitizeText(claimId)}</p>
          <p><strong>Insurance Provider:</strong> ${pdf.sanitizeText(insuranceProvider)}</p>
          <p><strong>Amount:</strong> ${pdf.formatMoneyText(amount)}</p>
          <p><strong>Status:</strong> ${pdf.sanitizeText(status)}</p>
        </div>
        <p>Regards,<br><strong>${clinicInfo.clinicName}</strong><br>${clinicInfo.clinicAddress}<br>Phone: ${clinicInfo.clinicPhone}</p>
      </div>`;

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Billing Summary`,
      html: patientHtml,
      attachments: [{ filename: 'billing-summary.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    res.json({
      success: emailResult.sent,
      message: emailResult.sent ? 'Billing email sent successfully.' : `Billing email failed: ${emailResult.error}`,
      notifications: { email: emailResult },
    });
  } catch (error) {
    console.error('❌ Billing email error:', error?.message || error);
    res.status(500).json({ success: false, message: `Failed to send billing email: ${error.message}` });
  }
});

// ---------------------------------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found.' });
  }
  res.redirect('/');
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Dr. Rana Dental Clinic API running on http://0.0.0.0:${PORT}`);
  console.log(`   Data directory: ${DATA_DIR}`);
  console.log(`   Email configured: ${mailer.configured ? 'yes' : 'no'}`);
  console.log(`   WATI configured: ${wati.configured ? 'yes' : 'no'}\n`);
});
