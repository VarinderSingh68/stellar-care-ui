// End-to-end smoke test for the clinic API: `npm test` in backend/.
//
// Boots server.cjs on a free port against a throwaway DATA_DIR, with every
// email/WhatsApp credential blanked out (dotenv never overrides variables
// that are already set, so env/backend.env can't leak real credentials in),
// then exercises every route the frontend uses. Your real data/ folder is
// never touched and no real email or WhatsApp message is ever sent.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer();
  srv.unref();
  srv.on('error', reject);
  srv.listen(0, () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(path.join(tmpdir(), 'clinic-smoke-'));

const blanked = Object.fromEntries([
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'EMAIL_USER', 'EMAIL_PASSWORD', 'ADMIN_NOTIFICATION_EMAIL',
  'WATI_API_ENDPOINT', 'WATI_ACCESS_TOKEN', 'PUBLIC_APP_URL', 'SESSION_SECRET',
].map((key) => [key, '']));

const server = spawn(process.execPath, ['server.cjs'], {
  cwd: backendDir,
  env: { ...process.env, ...blanked, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

function cleanup() {
  server.kill();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

let pass = 0;
let fail = 0;
const check = (name, condition, detail = '') => {
  if (condition) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

async function call(method, route, { body, token, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

try {
  if (!(await waitForServer())) {
    console.error('Server did not start. Output:\n' + serverLog);
    process.exitCode = 1;
  } else {
    await run();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) {
      console.log('\nServer output:\n' + serverLog);
      process.exitCode = 1;
    }
  }
} finally {
  cleanup();
}

async function run() {
  const health = await call('GET', '/health');
  check('GET /health', health.status === 200 && health.json?.status === 'ok');

  const statusPage = await call('GET', '/');
  check('GET / status page', statusPage.status === 200 && statusPage.text.includes('API online'));

  const settings = await call('GET', '/api/settings');
  check('GET /api/settings (public)', settings.status === 200 && settings.json?.clinicName === 'Dr. Rana Dental Clinic');

  // --- Admin auth
  const badLogin = await call('POST', '/api/admin/login', { body: { username: 'admin', password: 'wrong' } });
  check('admin login rejects bad password', badLogin.status === 401);

  const login = await call('POST', '/api/admin/login', { body: { username: 'admin', password: 'password123' } });
  const admin = login.json?.token;
  check('admin login (default account)', login.status === 200 && Boolean(admin));

  const me = await call('GET', '/api/admin/me', { token: admin });
  check('GET /api/admin/me', me.status === 200 && me.json?.username === 'admin');

  const noAuth = await call('GET', '/api/bookings');
  check('GET /api/bookings requires admin', noAuth.status === 401);

  const putSettings = await call('PUT', '/api/settings', { token: admin, body: { ...settings.json, phone: '0000000000' } });
  check('PUT /api/settings', putSettings.status === 200 && putSettings.json?.settings?.phone === '0000000000');

  // --- Bookings / appointments
  const booking = await call('POST', '/api/send-booking', {
    body: { patientName: 'Smoke Test', patientEmail: 'smoke@example.com', patientPhone: '9876543210', appointmentDate: '2026-12-01', appointmentTime: '10:00', reason: 'Checkup' },
  });
  check('POST /api/send-booking (public)', booking.status === 200 && booking.json?.success === true, booking.text);

  const badBooking = await call('POST', '/api/send-booking', { body: { patientName: 'x' } });
  check('send-booking validates fields', badBooking.status === 400);

  const bookings = await call('GET', '/api/bookings', { token: admin });
  check('GET /api/bookings contains new booking', bookings.status === 200 && (bookings.json || []).some((b) => b.patientEmail === 'smoke@example.com'));

  const appt = await call('POST', '/api/appointments', { token: admin, body: { patientName: 'Appt', appointmentDate: '2026-12-02', appointmentTime: '11:00', reason: 'Cleaning' } });
  const apptId = appt.json?.appointment?.id;
  check('POST /api/appointments', appt.status === 200 && Boolean(apptId));

  const apptPut = await call('PUT', `/api/appointments/${apptId}`, { token: admin, body: { status: 'completed' } });
  check('PUT /api/appointments/:id', apptPut.status === 200 && apptPut.json?.appointment?.status === 'completed');

  // --- Patient portal
  const reg = await call('POST', '/api/patient/register', {
    body: { patientName: 'Pat', patientEmail: `pat${Date.now()}@example.com`, patientPhone: '9999900000', password: 'secret12' },
  });
  const patient = reg.json?.token;
  const patientId = reg.json?.patient?.id;
  check('POST /api/patient/register', reg.status === 200 && Boolean(patient) && !('password' in (reg.json?.patient || {})));

  const demoLogin = await call('POST', '/api/patient/login', { body: { email: 'patient@demo.com', password: 'demo123' } });
  check('patient login (demo account)', demoLogin.status === 200 && Boolean(demoLogin.json?.token));

  const patientMe = await call('GET', '/api/patient/me', { token: patient });
  check('GET /api/patient/me', patientMe.status === 200 && patientMe.json?.patient?.id === patientId);

  // --- Generic collections + access rules
  const putFollowUps = await call('PUT', '/api/data/follow-ups', {
    token: admin, body: [{ id: 'fu1', patientId, title: 'Mine', status: 'pending' }, { id: 'fu2', patientId: 'someone-else', title: 'Not mine' }],
  });
  check('PUT /api/data/follow-ups', putFollowUps.status === 200);

  const putConsent = await call('PUT', '/api/data/consent-forms', { token: admin, body: [{ id: 'cf1', patientId, isSigned: false }] });
  check('PUT /api/data/consent-forms', putConsent.status === 200);

  const ownFollowUps = await call('GET', '/api/data/follow-ups', { token: patient });
  check('patient sees only own follow-ups', ownFollowUps.status === 200 && ownFollowUps.json?.length === 1);

  const blocked = await call('GET', '/api/data/patients', { token: patient });
  check('patient blocked from admin-only collection', blocked.status === 403);

  const portalPatients = await call('GET', '/api/data/portal-patients', { token: admin });
  check('portal-patients never exposes password hashes', portalPatients.status === 200 && portalPatients.json.every((p) => !('password' in p)));

  const patch = await call('PATCH', '/api/patient/follow-ups/fu1', { token: patient, body: { status: 'completed' } });
  check('PATCH /api/patient/follow-ups/:id', patch.status === 200 && patch.json?.followUp?.status === 'completed');

  const sign = await call('POST', '/api/patient/consent-forms/cf1/sign', { token: patient });
  check('POST /api/patient/consent-forms/:id/sign', sign.status === 200 && sign.json?.consentForm?.isSigned === true);

  for (const name of ['patients', 'treatment-plans', 'clinical-notes', 'staff', 'medical-reports', 'insurance-billings']) {
    const res = await call('GET', `/api/data/${name}`, { token: admin });
    check(`GET /api/data/${name}`, res.status === 200 && Array.isArray(res.json));
  }

  const unknown = await call('GET', '/api/data/nope', { token: admin });
  check('unknown collection -> 404', unknown.status === 404);

  // --- Media
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const upload = await call('POST', '/api/admin/media-upload', { token: admin, body: { contentType: 'image/png', dataBase64: png } });
  check('POST /api/admin/media-upload', upload.status === 200 && upload.json?.url?.startsWith('/uploads/media/'));
  if (upload.json?.url) {
    const file = await call('GET', upload.json.url, { raw: true });
    check('GET uploaded media file', file.status === 200 && file.buf.length > 0);
  }

  const media = await call('GET', '/api/media');
  check('GET /api/media (public)', media.status === 200 && Array.isArray(media.json));

  // --- Email + PDF endpoints. Email is deliberately unconfigured here, so
  // these must still generate the PDF and answer cleanly instead of crashing.
  const rx = await call('POST', '/api/send-prescription', {
    token: admin,
    body: { patientName: 'Rx', patientEmail: 'rx@example.com', patientPhone: '9876543210', suffering: 'Pain', prescription: 'Tab A\nTab B', prescriptionDate: '2026-12-01', totalFees: 500, amountPaid: 500, paymentStatus: 'paid' },
  });
  const rxFile = rx.json?.prescriptionPdf?.filename;
  check('POST /api/send-prescription generates PDF', rx.status === 200 && Boolean(rxFile), rx.text.slice(0, 200));
  if (rxFile) {
    const pdf = await call('GET', `/api/prescriptions/${rxFile}`, { raw: true });
    check('GET /api/prescriptions/:file serves a PDF', pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === '%PDF-');
  }

  const traversal = await call('GET', '/api/prescriptions/..%2F.session-secret');
  check('prescription path traversal blocked', traversal.status === 400 || traversal.status === 404);

  const followUp = await call('POST', '/api/send-followup', { token: admin, body: { patientName: 'F', patientEmail: 'f@example.com', title: 'Recall', dueDate: '2026-12-10', type: 'checkup' } });
  check('POST /api/send-followup responds', followUp.status === 200 && 'success' in (followUp.json || {}), followUp.text.slice(0, 200));

  const report = await call('POST', '/api/send-report', { token: admin, body: { patientName: 'R', patientEmail: 'r@example.com', reportType: 'xray', title: 'OPG', date: '2026-12-01' } });
  check('POST /api/send-report responds', report.status === 200 && 'success' in (report.json || {}), report.text.slice(0, 200));

  const billing = await call('POST', '/api/send-billing', {
    token: admin, body: { patientName: 'B', patientEmail: 'b@example.com', claimId: 'C1', insuranceProvider: 'Ins', amount: 1000, submissionDate: '2026-12-01', status: 'pending' },
  });
  check('POST /api/send-billing responds', billing.status === 200 && 'success' in (billing.json || {}), billing.text.slice(0, 200));

  // --- Credential change (last, since it invalidates the default login)
  const changed = await call('POST', '/api/admin/change-credentials', { token: admin, body: { username: 'admin2', password: 'newpass1' } });
  check('POST /api/admin/change-credentials', changed.status === 200 && changed.json?.username === 'admin2');

  const relogin = await call('POST', '/api/admin/login', { body: { username: 'admin2', password: 'newpass1' } });
  check('login with changed credentials', relogin.status === 200);

  const api404 = await call('GET', '/api/does-not-exist');
  check('unknown /api route -> JSON 404', api404.status === 404 && api404.json?.success === false);
}
