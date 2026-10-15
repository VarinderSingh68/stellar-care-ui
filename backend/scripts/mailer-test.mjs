// Unit test for lib/mailer.cjs: `npm test` in backend/ runs it after the
// smoke test. No network and no real email: `fetch` (Resend's HTTPS API) and
// nodemailer.createTransport (Gmail SMTP) are replaced with stubs, so this
// checks exactly what would be sent and what the boot log would say.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

let pass = 0;
let fail = 0;
const check = (name, condition, detail = '') => {
  if (condition) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

// Capture console output during `fn` (startup checks log asynchronously).
async function captureLogs(fn) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of Object.keys(original)) console[level] = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    await new Promise((r) => setTimeout(r, 20));
    return { result, logs: lines.join('\n') };
  } finally {
    Object.assign(console, original);
  }
}

function freshMailer(env) {
  for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'EMAIL_USER', 'EMAIL_PASSWORD', 'RENDER']) delete process.env[key];
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../lib/mailer.cjs')];
  return require('../lib/mailer.cjs').createMailer();
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// --- Resend: request shape --------------------------------------------------
const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  if (String(url).endsWith('/domains')) return jsonResponse(200, { data: [{ name: 'clinic.example', status: 'verified' }] });
  return jsonResponse(200, { id: 'email-123' });
};

const { result: resend, logs: resendBoot } = await captureLogs(() => freshMailer({ RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'Dr. Rana <noreply@clinic.example>' }));
check('Resend transport is configured', resend.configured === true);
check('boot log confirms verified domain', resendBoot.includes('ready via Resend API'), resendBoot);

const pdf = Buffer.from('%PDF-1.4 test');
const info = await resend.transporter.sendMail({
  from: resend.fromAddress,
  to: 'patient@example.com, doctor@example.com',
  subject: 'Your Prescription',
  html: '<p>Hello</p>',
  attachments: [{ filename: 'prescription.pdf', content: pdf, contentType: 'application/pdf' }],
});
const send = requests.find((r) => r.url.endsWith('/emails'));
const body = JSON.parse(send.init.body);
check('POSTs to https://api.resend.com/emails', send.url === 'https://api.resend.com/emails' && send.init.method === 'POST');
check('sends the API key as a Bearer token', send.init.headers.Authorization === 'Bearer re_test');
check('splits a comma-separated "to" into an array', JSON.stringify(body.to) === '["patient@example.com","doctor@example.com"]');
check('keeps from/subject/html', body.from === 'Dr. Rana <noreply@clinic.example>' && body.subject === 'Your Prescription' && body.html === '<p>Hello</p>');
check('attachment is base64 with filename + content_type',
  body.attachments?.[0]?.filename === 'prescription.pdf'
  && Buffer.from(body.attachments[0].content, 'base64').equals(pdf)
  && body.attachments[0].content_type === 'application/pdf');
check('returns the Resend message id', info.messageId === 'email-123');

// --- Resend: API errors surface as thrown errors (sendMailSafe logs them) ---
globalThis.fetch = async () => jsonResponse(403, { statusCode: 403, name: 'validation_error', message: 'The clinic.example domain is not verified.' });
let thrown = null;
try { await resend.transporter.sendMail({ to: 'a@b.com', subject: 's', html: 'h' }); } catch (error) { thrown = error; }
check('API error is thrown with Resend\'s message', thrown?.message === 'Resend API error (HTTP 403): The clinic.example domain is not verified.', thrown?.message);

// --- Resend: startup check messages ------------------------------------------
const bootWith = async (domainsResponse) => {
  globalThis.fetch = async () => domainsResponse();
  return (await captureLogs(() => freshMailer({ RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'noreply@clinic.example' }))).logs;
};
check('warns when the domain is not verified',
  (await bootWith(() => jsonResponse(200, { data: [{ name: 'clinic.example', status: 'pending' }] }))).includes('"pending", not verified'));
check('warns when the domain is not in the account',
  (await bootWith(() => jsonResponse(200, { data: [] }))).includes('is not a domain in your Resend account'));
check('accepts a sending-only key',
  (await bootWith(() => jsonResponse(401, { name: 'restricted_api_key', message: 'This API key is restricted to only send emails.' }))).includes('sending-only key'));
check('reports an inactive key (403 restricted_api_key) as an error',
  (await bootWith(() => jsonResponse(403, { name: 'restricted_api_key', message: 'API key is not active' }))).includes('Resend API key check failed (HTTP 403): API key is not active'));
check('reports an invalid key',
  (await bootWith(() => jsonResponse(400, { name: 'validation_error', message: 'API key is invalid' }))).includes('Resend API key check failed (HTTP 400): API key is invalid'));
check('reports an unreachable API',
  (await bootWith(() => { throw new TypeError('fetch failed'); })).includes('Could not reach the Resend API'));

// --- Resend wins over Gmail when both are set --------------------------------
globalThis.fetch = async () => jsonResponse(200, { data: [] });
const both = (await captureLogs(() => freshMailer({ RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'a@clinic.example', EMAIL_USER: 'x@gmail.com', EMAIL_PASSWORD: 'pw' }))).result;
check('Resend takes priority over Gmail', both.fromAddress === 'a@clinic.example');

// --- Gmail SMTP: verify() failure hints --------------------------------------
const realCreateTransport = nodemailer.createTransport;
const gmailBoot = async (error, env = {}) => {
  nodemailer.createTransport = () => ({ verify: (cb) => cb(error), sendMail: async () => ({}) });
  try {
    return (await captureLogs(() => freshMailer({ EMAIL_USER: 'clinic@gmail.com', EMAIL_PASSWORD: 'abcd efgh ijkl mnop', ...env }))).logs;
  } finally {
    nodemailer.createTransport = realCreateTransport;
  }
};
const netError = Object.assign(new Error('connect ENETUNREACH 2607:f8b0:400e:c0d::6c:465 - Local (:::0)'), { code: 'ESOCKET' });
const onRender = await gmailBoot(netError, { RENDER: 'true' });
check('on Render, a network failure explains the SMTP block', onRender.includes('Render free instances block outbound SMTP') && !onRender.includes('Check EMAIL_USER'), onRender);
const offRender = await gmailBoot(netError);
check('off Render, a network failure points at the network', offRender.includes('Could not reach smtp.gmail.com:465') && !offRender.includes('Check EMAIL_USER'), offRender);
const authError = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), { code: 'EAUTH' });
check('an auth failure points at the credentials', (await gmailBoot(authError, { RENDER: 'true' })).includes('Check EMAIL_USER / EMAIL_PASSWORD'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
