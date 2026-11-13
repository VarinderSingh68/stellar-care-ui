// Dr. Rana Dental Clinic -- unified backend API.
//
// This is the Node backend entry point (`npm start` in backend/, used for local
// development). Production runs the PHP port in backend-php/ instead; both
// expose the same routes. It is one Express app that provides:
//   - Server-side, file-backed storage for every collection the admin
//     console and patient portal use (patients, appointments, treatment
//     plans, clinical notes, staff, settings, follow-ups, consent forms,
//     medical reports, insurance billing, media, portal patient accounts)
//     instead of browser localStorage, so data is shared across devices
//     and visible to every visitor, not just the admin's own browser.
//   - Admin and patient-portal authentication (hashed passwords, signed
//     session tokens) instead of the old plaintext/no-auth checks.
//   - Email (Resend HTTPS API, or Gmail SMTP via Nodemailer) and optional WhatsApp (WATI)
//     notifications, with correct "Dr. Rana Dental Clinic" branding.
//   - Hand-rolled PDF generation for prescriptions, follow-ups, reports
//     and billing summaries.
//
// See lib/store.cjs for a note on data persistence on hosts with an
// ephemeral filesystem (e.g. Render web services without a Disk).

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Local development reads secrets from env/backend.env at the repo root. In
// production (Render) that file doesn't exist and the host's environment
// variables are used instead; dotenv never overrides variables already set.
dotenv.config({ path: path.resolve(__dirname, '..', 'env', 'backend.env') });

const { JsonStore } = require('./lib/store.cjs');
const { getOrCreateSessionSecret, hashPassword, verifyPassword, createTokenFactory, getBearerToken } = require('./lib/auth.cjs');
const { createMailer } = require('./lib/mailer.cjs');
const { createWatiClient } = require('./lib/wati.cjs');
const { COLLECTIONS } = require('./lib/collections.cjs');
const pdf = require('./lib/pdf.cjs');
const emailTpl = require('./lib/emailTemplates.cjs');

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'media');
const PRESCRIPTIONS_DIR = path.join(DATA_DIR, 'runtime-prescriptions');
[UPLOADS_DIR, PRESCRIPTIONS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const bookingsStore = new JsonStore(path.join(DATA_DIR, 'bookings.json'), []);

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

let currentAdminTokenVersion = 1;

async function bootstrapAdminCredentials() {
  const existing = await adminCredentialsStore.read();
  if (existing && existing.username && existing.passwordHash) {
    currentAdminTokenVersion = existing.tokenVersion || 1;
    return;
  }
  await adminCredentialsStore.write({
    username: ADMIN_DEFAULT_USERNAME,
    passwordHash: hashPassword(ADMIN_DEFAULT_PASSWORD),
    tokenVersion: 1,
  });
  currentAdminTokenVersion = 1;
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
  if (auth.v && auth.v < currentAdminTokenVersion) {
    return res.status(401).json({ success: false, message: 'Session has been invalidated. Please sign in again.' });
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
const ADMIN_2FA_EMAIL = (
  process.env.ADMIN_2FA_EMAIL ||
  process.env.ADMIN_NOTIFICATION_EMAIL ||
  process.env.EMAIL_USER ||
  'ngw.designer@gmail.com'
).trim();

// Two-factor authentication (2FA) in-memory state:
// Map<challengeId, { code, username, email, expiresAt, attempts, lastResentAt }>
const admin2FAChallenges = new Map();

function cleanupExpired2FAChallenges() {
  const now = Date.now();
  for (const [id, challenge] of admin2FAChallenges.entries()) {
    if (challenge.expiresAt <= now) {
      admin2FAChallenges.delete(id);
    }
  }
}

const cleanup2FAInterval = setInterval(cleanupExpired2FAChallenges, 5 * 60 * 1000);
if (cleanup2FAInterval.unref) cleanup2FAInterval.unref();

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  const first = local.slice(0, 2);
  const last = local.slice(-1);
  return `${first}${'*'.repeat(Math.max(3, local.length - 3))}${last}@${domain}`;
}

async function sendMailSafe(options) {
  if (!mailer.configured) {
    return { sent: false, error: 'Email is not configured on the server (set RESEND_API_KEY + RESEND_FROM_EMAIL, or EMAIL_USER + EMAIL_PASSWORD).' };
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
    clinicEmail: merged.email,
  };
}

// Every patient-facing email (booking, prescription, follow-up, report,
// billing) also goes to the clinic/doctor, so nothing sent to a patient
// happens without the clinic having its own copy. Recipients come from two
// places -- the ADMIN_NOTIFICATION_EMAIL env var (a fixed ops inbox) and the
// clinic's own "Email" field in Admin Dashboard -> Settings (so the doctor
// can point this at their own inbox without touching server config) -- and
// are deduplicated since they'll often be the same address.
function getAdminRecipients(clinicInfo) {
  const recipients = new Set();
  if (ADMIN_NOTIFICATION_EMAIL) recipients.add(ADMIN_NOTIFICATION_EMAIL);
  const settingsEmail = String(clinicInfo?.clinicEmail || '').trim();
  if (settingsEmail && isValidEmail(settingsEmail)) recipients.add(settingsEmail);
  return Array.from(recipients);
}

// Shared shape for the follow-up/report/billing admin copies: a branded
// notification with the same detail table shown to the patient, sent
// fire-and-forget so a failure here never affects the patient-facing
// response. (Booking and prescription build their own admin email inline
// since their layout differs enough not to share this shape.)
function notifyAdminOfPatientEmail({ clinicInfo, subject, heading, eyebrow, introHtml, detailRows, sectionTitle, sectionHtml, attachment }) {
  const adminRecipients = getAdminRecipients(clinicInfo);
  if (!adminRecipients.length) return;

  const adminHtml = emailTpl.emailShell({
    clinicInfo,
    eyebrow,
    heading,
    introHtml,
    bodyHtml: `
      ${emailTpl.detailTable(detailRows)}
      ${sectionHtml ? `
        <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">${emailTpl.escapeHtml(sectionTitle || '')}</div>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">${sectionHtml}</div>` : ''}`,
  });

  sendMailSafe({
    to: adminRecipients.join(', '),
    subject,
    html: adminHtml,
    attachments: attachment ? [attachment] : undefined,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Security headers via Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS policy
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      process.env.NODE_ENV !== 'production' ||
      ALLOWED_ORIGINS.length === 0 ||
      ALLOWED_ORIGINS.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy.'));
    }
  },
  credentials: true,
}));

// Global body parser with tight 100KB limit (large 20MB is scoped specifically to media upload)
app.use(express.json({ limit: '100kb' }));

// Rate limiters (skipped during automated tests)
const isTestEnv = process.env.NODE_ENV === 'test';
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

const bookingRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many booking requests from this network. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

app.use('/api/admin/login', authRateLimiter);
app.use('/api/patient/login', authRateLimiter);
app.use('/api/patient/register', authRateLimiter);
app.use('/api/send-booking', bookingRateLimiter);

// Static uploads with nosniff protection
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(DATA_DIR, 'uploads')));

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
// Admin auth (with 2-Factor Authentication via Email)
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

  cleanupExpired2FAChallenges();

  // Generate 6-digit random verification code
  const code = String(crypto.randomInt(100000, 1000000));
  const challengeId = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes validity

  const targetEmail = ADMIN_2FA_EMAIL;

  admin2FAChallenges.set(challengeId, {
    code,
    username: credentials.username,
    email: targetEmail,
    expiresAt,
    attempts: 0,
    lastResentAt: Date.now(),
  });

  const tempToken = signToken(
    { role: 'admin_2fa_pending', sub: credentials.username, challengeId },
    10 * 60
  );

  const clinicInfo = await getClinicInfo();
  const emailHtml = emailTpl.admin2FAEmail({
    clinicInfo,
    username: credentials.username,
    code,
    expiresInMinutes: 10,
  });

  const mailResult = await sendMailSafe({
    to: targetEmail,
    subject: `🔐 Your Admin Login Code: ${code} - ${clinicInfo.clinicName}`,
    html: emailHtml,
  });

  if (!mailResult.sent) {
    console.warn(`⚠️  [2FA] Could not deliver email to ${targetEmail}: ${mailResult.error}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 [2FA FALLBACK] Admin verification code for ${credentials.username} is: ${code}`);
    }
  } else {
    console.log(`✅ [2FA] Verification code sent to ${targetEmail} for admin ${credentials.username}`);
  }

  res.json({
    success: true,
    require2FA: true,
    tempToken,
    email: targetEmail,
    maskedEmail: maskEmail(targetEmail),
    message: `A 6-digit verification code has been sent to ${targetEmail}.`,
    ...(process.env.NODE_ENV === 'test' ? { testOtpCode: code } : {}),
  });
});

app.post('/api/admin/verify-2fa', async (req, res) => {
  await bootstrapPromise;
  const tempToken = String(req.body?.tempToken || '').trim();
  const rawCode = String(req.body?.code || '').trim().replace(/\D/g, '');

  if (!tempToken || !rawCode) {
    return res.status(400).json({ success: false, message: 'Verification session and 6-digit code are required.' });
  }

  if (rawCode.length !== 6) {
    return res.status(400).json({ success: false, message: 'Code must be exactly 6 digits.' });
  }

  const payload = verifyToken(tempToken);
  if (!payload || payload.role !== 'admin_2fa_pending' || !payload.challengeId) {
    return res.status(401).json({ success: false, message: 'Verification session has expired or is invalid. Please sign in again.' });
  }

  cleanupExpired2FAChallenges();
  const challenge = admin2FAChallenges.get(payload.challengeId);
  if (!challenge) {
    return res.status(401).json({ success: false, message: 'Verification code has expired. Please sign in again.' });
  }

  if (challenge.expiresAt <= Date.now()) {
    admin2FAChallenges.delete(payload.challengeId);
    return res.status(401).json({ success: false, message: 'Verification code has expired. Please sign in again.' });
  }

  if (challenge.attempts >= 5) {
    admin2FAChallenges.delete(payload.challengeId);
    return res.status(401).json({ success: false, message: 'Too many incorrect attempts. Session invalidated. Please sign in again.' });
  }

  if (challenge.code !== rawCode) {
    challenge.attempts += 1;
    const remaining = 5 - challenge.attempts;
    if (remaining <= 0) {
      admin2FAChallenges.delete(payload.challengeId);
      return res.status(401).json({ success: false, message: 'Too many incorrect attempts. Session invalidated. Please sign in again.' });
    }
    return res.status(400).json({
      success: false,
      message: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    });
  }

  // Code verified! Invalidate challenge immediately (one-time use)
  admin2FAChallenges.delete(payload.challengeId);

  const token = signToken({ role: 'admin', sub: challenge.username, v: currentAdminTokenVersion }, ADMIN_TOKEN_TTL_SECONDS);
  res.json({ success: true, token, username: challenge.username });
});

app.post('/api/admin/resend-2fa', async (req, res) => {
  await bootstrapPromise;
  const tempToken = String(req.body?.tempToken || '').trim();
  if (!tempToken) {
    return res.status(400).json({ success: false, message: 'Verification session is required.' });
  }

  const payload = verifyToken(tempToken);
  if (!payload || payload.role !== 'admin_2fa_pending' || !payload.challengeId) {
    return res.status(401).json({ success: false, message: 'Verification session has expired. Please sign in again.' });
  }

  cleanupExpired2FAChallenges();
  const challenge = admin2FAChallenges.get(payload.challengeId);
  if (!challenge) {
    return res.status(401).json({ success: false, message: 'Verification session has expired. Please sign in again.' });
  }

  const now = Date.now();
  if (challenge.lastResentAt && (now - challenge.lastResentAt) < 30000) {
    const waitSeconds = Math.ceil((30000 - (now - challenge.lastResentAt)) / 1000);
    return res.status(429).json({ success: false, message: `Please wait ${waitSeconds}s before requesting a new code.` });
  }

  const newCode = String(crypto.randomInt(100000, 1000000));
  challenge.code = newCode;
  challenge.expiresAt = now + 10 * 60 * 1000;
  challenge.attempts = 0;
  challenge.lastResentAt = now;

  const clinicInfo = await getClinicInfo();
  const emailHtml = emailTpl.admin2FAEmail({
    clinicInfo,
    username: challenge.username,
    code: newCode,
    expiresInMinutes: 10,
  });

  const mailResult = await sendMailSafe({
    to: challenge.email,
    subject: `🔐 Your Admin Login Code: ${newCode} - ${clinicInfo.clinicName}`,
    html: emailHtml,
  });

  if (!mailResult.sent) {
    console.warn(`⚠️  [2FA] Could not deliver resent email to ${challenge.email}: ${mailResult.error}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 [2FA FALLBACK] Resent Admin verification code for ${challenge.username} is: ${newCode}`);
    }
  } else {
    console.log(`✅ [2FA] New verification code sent to ${challenge.email} for admin ${challenge.username}`);
  }

  res.json({
    success: true,
    message: `A new 6-digit verification code has been sent to ${challenge.email}.`,
    ...(process.env.NODE_ENV === 'test' ? { testOtpCode: newCode } : {}),
  });
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
  currentAdminTokenVersion += 1;
  const updated = {
    username: nextUsername,
    passwordHash: nextPassword ? hashPassword(nextPassword) : current.passwordHash,
    tokenVersion: currentAdminTokenVersion,
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
// with a patient token). See lib/collections.cjs for the access rules.
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

function verifyMediaFileSignature(buffer, contentType) {
  if (!buffer || buffer.length < 4) return false;
  if (contentType === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  if (contentType === 'image/gif') {
    return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType === 'video/mp4' || contentType === 'video/quicktime') {
    if (buffer.length < 8) return false;
    const box = buffer.subarray(4, 8).toString('ascii');
    return box === 'ftyp' || box === 'moov';
  }
  if (contentType === 'video/webm') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }
  return false;
}

app.post('/api/admin/media-upload', requireAdmin, express.json({ limit: '20mb' }), async (req, res) => {
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

  // Security: Verify magic bytes against declared MIME type to prevent script/executable spoofing
  if (!verifyMediaFileSignature(buffer, contentType)) {
    return res.status(400).json({ success: false, message: 'File signature does not match declared media type.' });
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

    const bookingReference = newBooking.id.split('-')[0].toUpperCase();

    const patientHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: `Reference #${bookingReference}`,
      heading: 'Appointment Confirmed',
      greetingName: patientName,
      introHtml: `Thank you for booking an appointment with <strong>${emailTpl.escapeHtml(clinicInfo.clinicName)}</strong>. Here are your appointment details:`,
      bodyHtml: `
        ${emailTpl.highlightBox(`<strong>${emailTpl.escapeHtml(pdf.formatDateText(appointmentDate))}</strong> at <strong>${emailTpl.escapeHtml(appointmentTime)}</strong>`)}
        ${emailTpl.detailTable([
          ['Patient Name', patientName],
          ['Phone', patientPhone],
          ['Reason for Visit', reason],
          ['Booking Reference', bookingReference],
        ])}
        <p style="font-size:14px;color:#1f2937;line-height:1.6;">Our team will contact you at <strong>${emailTpl.escapeHtml(patientPhone)}</strong> to confirm this appointment. If anything about the date or time doesn't work for you, please call the clinic.</p>`,
    });

    const adminHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: `Reference #${bookingReference}`,
      heading: 'New Appointment Booking',
      introHtml: 'A new appointment was just booked through the website.',
      bodyHtml: emailTpl.detailTable([
        ['Patient Name', patientName],
        ['Email', patientEmail],
        ['Phone', patientPhone],
        ['Appointment Date', pdf.formatDateText(appointmentDate)],
        ['Appointment Time', appointmentTime],
        ['Reason for Visit', reason],
        ['Booking Reference', bookingReference],
      ]),
    });

    const adminRecipients = getAdminRecipients(clinicInfo);

    const emailResults = { sent: false };
    setImmediate(async () => {
      const patientResult = await sendMailSafe({ to: patientEmail, subject: `${clinicInfo.clinicName} - Appointment Confirmation`, html: patientHtml });
      if (adminRecipients.length) {
        await sendMailSafe({ to: adminRecipients.join(', '), subject: `New Appointment Booking - ${patientName}`, html: adminHtml });
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
    const downloadToken = signToken({ role: 'prescription_download', filename }, 48 * 3600);
    const pathname = `/api/prescriptions/${encodeURIComponent(filename)}?token=${downloadToken}`;
    const localUrl = `${req.protocol}://${req.get('host')}${pathname}`;
    const publicUrl = publicAppUrl ? `${publicAppUrl}${pathname}` : localUrl;

    const patientHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: 'Prescription',
      heading: `Your ${clinicInfo.clinicName} Prescription`,
      greetingName: patientName,
      introHtml: `Your prescription has been prepared by <strong>${emailTpl.escapeHtml(clinicInfo.doctorName)}</strong>. The full prescription is attached as a PDF, and a summary is below.`,
      bodyHtml: `
        ${emailTpl.detailTable([
          ['Diagnosis', suffering],
          ['Visit Date', pdf.formatDateText(visitDate || prescriptionDate)],
          ['Gender', gender],
          ['Age', age],
          ['Phone', patientPhone],
          ['Address', address],
        ])}
        <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Prescription</div>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap;">${emailTpl.multilineHtml(prescription)}</div>
        ${emailTpl.detailTable([
          ['Total Fees', pdf.formatMoneyText(totalFees)],
          ['Amount Paid', pdf.formatMoneyText(amountPaid)],
          ['Payment Status', paymentStatus],
          ['Next Appointment', pdf.formatDateText(nextAppointmentDate)],
          ['Notes', notes],
        ])}
        <p style="font-size:14px;color:#1f2937;line-height:1.6;margin-top:20px;">${emailTpl.escapeHtml((await settingsStore.read()).prescriptionFooter || DEFAULT_CLINIC_SETTINGS.prescriptionFooter)}</p>`,
    });

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Your Prescription PDF`,
      html: patientHtml,
      attachments: [{ filename: 'prescription.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    const adminRecipients = getAdminRecipients(clinicInfo);
    if (adminRecipients.length && emailResult.sent) {
      const adminHtml = emailTpl.emailShell({
        clinicInfo,
        eyebrow: 'Prescription Sent',
        heading: `Prescription sent to ${patientName}`,
        introHtml: 'A copy of the prescription just sent to the patient, for your records.',
        bodyHtml: `
          ${emailTpl.detailTable([
            ['Patient Name', patientName],
            ['Email', trimmedEmail],
            ['Phone', patientPhone],
            ['Diagnosis', suffering],
            ['Visit Date', pdf.formatDateText(visitDate || prescriptionDate)],
          ])}
          <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Prescription</div>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap;">${emailTpl.multilineHtml(prescription)}</div>
          ${emailTpl.detailTable([
            ['Total Fees', pdf.formatMoneyText(totalFees)],
            ['Amount Paid', pdf.formatMoneyText(amountPaid)],
            ['Payment Status', paymentStatus],
            ['Next Appointment', pdf.formatDateText(nextAppointmentDate)],
          ])}`,
      });
      sendMailSafe({
        to: adminRecipients.join(', '),
        subject: `Prescription Sent - ${patientName}`,
        html: adminHtml,
        attachments: [{ filename: 'prescription.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
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

  // Authorization check (Admin session, Patient session, or signed download token)
  const auth = authenticateRequest(req);
  const downloadToken = String(req.query?.token || '').trim();
  let authorized = false;

  if (auth && (auth.role === 'admin' || auth.role === 'patient')) {
    authorized = true;
  } else if (downloadToken) {
    const payload = verifyToken(downloadToken);
    if (payload && payload.role === 'prescription_download' && payload.filename === rawFilename) {
      authorized = true;
    }
  }

  if (!authorized) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Valid authorization or download token required.',
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${rawFilename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
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

    const patientHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: 'Follow-up Reminder',
      heading: title,
      greetingName: patientName,
      introHtml: 'Your care team has created a follow-up task for you. A full copy is attached as a PDF.',
      bodyHtml: `
        ${emailTpl.highlightBox(`Due <strong>${emailTpl.escapeHtml(pdf.formatDateText(dueDate))}</strong>`)}
        ${emailTpl.detailTable([
          ['Task', title],
          ['Type', type],
          ['Due Date', pdf.formatDateText(dueDate)],
        ])}
        ${description ? `
          <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Instructions</div>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">${emailTpl.multilineHtml(description)}</div>` : ''}`,
    });

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Follow-up Reminder`,
      html: patientHtml,
      attachments: [{ filename: 'follow-up.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    if (emailResult.sent) {
      notifyAdminOfPatientEmail({
        clinicInfo,
        subject: `Follow-up Reminder Sent - ${patientName}`,
        eyebrow: 'Follow-up Sent',
        heading: `Follow-up sent to ${patientName}`,
        introHtml: 'A copy of the follow-up reminder just sent to the patient, for your records.',
        detailRows: [
          ['Patient Name', patientName],
          ['Email', trimmedEmail],
          ['Phone', patientPhone],
          ['Task', title],
          ['Type', type],
          ['Due Date', pdf.formatDateText(dueDate)],
        ],
        sectionTitle: 'Instructions',
        sectionHtml: description ? emailTpl.multilineHtml(description) : '',
        attachment: { filename: 'follow-up.pdf', content: pdfBuffer, contentType: 'application/pdf' },
      });
    }

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

    const patientHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: 'Medical Report',
      heading: title,
      greetingName: patientName,
      introHtml: 'Your medical report is ready. A full copy is attached as a PDF.',
      bodyHtml: `
        ${emailTpl.detailTable([
          ['Report Type', reportType],
          ['Title', title],
          ['Date', pdf.formatDateText(date)],
        ])}
        ${description ? `
          <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Report Summary</div>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">${emailTpl.multilineHtml(description)}</div>` : ''}`,
    });

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Medical Report`,
      html: patientHtml,
      attachments: [{ filename: 'medical-report.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    if (emailResult.sent) {
      notifyAdminOfPatientEmail({
        clinicInfo,
        subject: `Medical Report Sent - ${patientName}`,
        eyebrow: 'Report Sent',
        heading: `Report sent to ${patientName}`,
        introHtml: 'A copy of the medical report just sent to the patient, for your records.',
        detailRows: [
          ['Patient Name', patientName],
          ['Email', trimmedEmail],
          ['Phone', patientPhone],
          ['Report Type', reportType],
          ['Title', title],
          ['Date', pdf.formatDateText(date)],
        ],
        sectionTitle: 'Report Summary',
        sectionHtml: description ? emailTpl.multilineHtml(description) : '',
        attachment: { filename: 'medical-report.pdf', content: pdfBuffer, contentType: 'application/pdf' },
      });
    }

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

    const patientHtml = emailTpl.emailShell({
      clinicInfo,
      eyebrow: 'Billing Summary',
      heading: `Claim ${claimId}`,
      greetingName: patientName,
      introHtml: 'Your billing summary and insurance claim details are ready. A full copy is attached as a PDF.',
      bodyHtml: `
        ${emailTpl.highlightBox(`Amount: <strong>${emailTpl.escapeHtml(pdf.formatMoneyText(amount))}</strong> &bull; Status: <strong>${emailTpl.escapeHtml(status)}</strong>`)}
        ${emailTpl.detailTable([
          ['Claim ID', claimId],
          ['Insurance Provider', insuranceProvider],
          ['Policy Number', policyNumber],
          ['Treatment Date', pdf.formatDateText(treatmentDate)],
          ['Amount', pdf.formatMoneyText(amount)],
          ['Status', status],
          ['Submission Date', pdf.formatDateText(submissionDate)],
        ])}
        ${notes ? `
          <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 8px;">Notes</div>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-size:14px;color:#1f2937;line-height:1.7;">${emailTpl.multilineHtml(notes)}</div>` : ''}`,
    });

    const emailResult = await sendMailSafe({
      to: trimmedEmail,
      subject: `${clinicInfo.clinicName} - Billing Summary`,
      html: patientHtml,
      attachments: [{ filename: 'billing-summary.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });

    if (emailResult.sent) {
      notifyAdminOfPatientEmail({
        clinicInfo,
        subject: `Billing Summary Sent - ${patientName}`,
        eyebrow: 'Billing Sent',
        heading: `Billing summary sent to ${patientName}`,
        introHtml: 'A copy of the billing summary just sent to the patient, for your records.',
        detailRows: [
          ['Patient Name', patientName],
          ['Email', trimmedEmail],
          ['Phone', patientPhone],
          ['Claim ID', claimId],
          ['Insurance Provider', insuranceProvider],
          ['Policy Number', policyNumber],
          ['Treatment Date', pdf.formatDateText(treatmentDate)],
          ['Amount', pdf.formatMoneyText(amount)],
          ['Status', status],
          ['Submission Date', pdf.formatDateText(submissionDate)],
        ],
        sectionTitle: 'Notes',
        sectionHtml: notes ? emailTpl.multilineHtml(notes) : '',
        attachment: { filename: 'billing-summary.pdf', content: pdfBuffer, contentType: 'application/pdf' },
      });
    }

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
  console.log(`\n🚀 Dr. Rana Dental Clinic API running on http://localhost:${PORT}`);
  console.log(`   Data directory: ${DATA_DIR}`);
  console.log(`   Email configured: ${mailer.configured ? 'yes' : 'no'}`);
  console.log(`   WATI configured: ${wati.configured ? 'yes' : 'no'}\n`);
});
