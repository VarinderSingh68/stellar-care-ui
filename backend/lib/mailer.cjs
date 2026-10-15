// Nodemailer transport setup. The clinic backend can run perfectly well
// with email disabled (e.g. before credentials are configured on the host)
// -- every other feature (patients, appointments, portal, etc.) keeps
// working; only the email-sending endpoints report a clear "email is not
// configured" error instead of the whole process crashing. This is a
// deliberate change from the old email server, which called
// process.exit(1) at startup if credentials were missing, taking down the
// entire API (not just email) when a Render env var was left unset.
//
// Two transports are supported, both exposing the same
// transporter.sendMail(...) interface so server.cjs doesn't care which:
//  - Resend (preferred): a real transactional email provider, reached over
//    its HTTPS API (port 443). Deliberately NOT Resend's SMTP relay: Render's
//    free web services block outbound SMTP ports (25/465/587), so any SMTP
//    transport -- Resend's or Gmail's -- can never connect from there.
//    Needs RESEND_API_KEY and a RESEND_FROM_EMAIL at a domain verified in
//    the Resend dashboard -- without a verified domain, Resend will only
//    deliver to the email address the Resend account was signed up with.
//  - Gmail SMTP with an App Password (legacy fallback): works locally and on
//    paid Render instances, but not on Render's free plan (SMTP is blocked),
//    and mail sent from a personal Gmail account to third-party inboxes
//    routinely gets dropped or spam-filtered. Prefer Resend.

const nodemailer = require('nodemailer');

const RESEND_API_URL = 'https://api.resend.com';
const RESEND_TIMEOUT_MS = 20000;

function emailDomain(address) {
  const email = (/<([^>]+)>/.exec(address) || [null, address])[1];
  return String(email).split('@')[1]?.trim().toLowerCase() || '';
}

async function resendRequest(apiKey, method, pathname, body) {
  const response = await fetch(`${RESEND_API_URL}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

// Startup check, best effort: confirms the API key works and the sender's
// domain is verified, so a misconfiguration shows up in the boot log rather
// than as a failed patient email later. Sending-only API keys can't list
// domains -- that's fine, it just means the domain can't be checked here.
async function checkResendSetup(apiKey, fromAddress) {
  try {
    const { ok, status, payload } = await resendRequest(apiKey, 'GET', '/domains');
    if (!ok) {
      // 401 restricted_api_key = "restricted to only send emails" (fine);
      // the 403 variant means the key is not active, which is an error.
      if (status === 401 && payload?.name === 'restricted_api_key') {
        console.log(`✅ Email transport ready via Resend API (${fromAddress}) -- sending-only key, domain status not checked.`);
        return;
      }
      console.error(`❌ Resend API key check failed (HTTP ${status}): ${payload?.message || 'unknown error'}`);
      console.error('   Check RESEND_API_KEY in the environment.');
      return;
    }
    const domain = emailDomain(fromAddress);
    const match = (payload?.data || []).find((d) => String(d.name).toLowerCase() === domain);
    if (match && match.status === 'verified') {
      console.log(`✅ Email transport ready via Resend API (${fromAddress})`);
    } else if (match) {
      console.warn(`⚠️  Resend domain "${domain}" is "${match.status}", not verified yet -- emails will be rejected until it is.`);
    } else {
      console.warn(`⚠️  "${domain}" is not a domain in your Resend account. Until you add and verify it, Resend`);
      console.warn('   rejects mail from this address (and resend.dev senders only reach your own inbox).');
    }
  } catch (error) {
    console.error('❌ Could not reach the Resend API:', error.message);
  }
}

function createResendMailer() {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const fromAddress = (process.env.RESEND_FROM_EMAIL || '').trim();
  if (!fromAddress) {
    console.warn('⚠️  RESEND_API_KEY is set but RESEND_FROM_EMAIL is missing. Email sending is disabled.');
    console.warn('   Set RESEND_FROM_EMAIL to an address at a domain verified in your Resend dashboard.');
    return { configured: false, transporter: null, fromAddress: '' };
  }

  // Nodemailer-shaped adapter: accepts the same message objects server.cjs
  // already builds (comma-separated `to`, Buffer attachments).
  const transporter = {
    async sendMail({ from, to, subject, html, text, attachments }) {
      const recipients = (Array.isArray(to) ? to : String(to || '').split(','))
        .map((address) => String(address).trim())
        .filter(Boolean);
      const { ok, status, payload } = await resendRequest(apiKey, 'POST', '/emails', {
        from: from || fromAddress,
        to: recipients,
        subject,
        html,
        text,
        attachments: attachments?.length
          ? attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content).toString('base64'),
            content_type: a.contentType,
          }))
          : undefined,
      });
      if (!ok) {
        throw new Error(`Resend API error (HTTP ${status}): ${payload?.message || 'unknown error'}`);
      }
      return { messageId: payload?.id };
    },
  };

  checkResendSetup(apiKey, fromAddress);
  return { configured: true, transporter, fromAddress };
}

function createGmailMailer() {
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s/g, '');
  if (!emailUser || !emailPassword) return null;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: emailUser, pass: emailPassword },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });

  transporter.verify((error) => {
    if (error) {
      console.error('❌ Email transport verification failed:', error.message);
      // Nodemailer tries every resolved address (IPv4 first, then IPv6) and
      // reports only the last failure, so on a host without IPv6 a blocked
      // SMTP port shows up as an IPv6 "ENETUNREACH" -- the network, not the
      // credentials, is the problem in that case.
      const networkFailure = ['ESOCKET', 'ETIMEDOUT', 'ECONNECTION', 'EDNS'].includes(error.code);
      if (networkFailure && process.env.RENDER) {
        console.error('   Render free instances block outbound SMTP (ports 25/465/587), so Gmail SMTP cannot connect from here.');
        console.error('   Fix: set RESEND_API_KEY + RESEND_FROM_EMAIL (sent over HTTPS), or use a paid Render instance type.');
      } else if (networkFailure) {
        console.error('   Could not reach smtp.gmail.com:465 -- check the network/firewall (outbound SMTP may be blocked).');
      } else {
        console.error('   Emails will fail to send until this is fixed. Check EMAIL_USER / EMAIL_PASSWORD (use a Gmail App Password).');
      }
    } else {
      console.log('✅ Email transport ready via Gmail (' + emailUser + ') -- note: Gmail SMTP from a personal');
      console.log('   account is unreliable for mail to real patient inboxes. Set RESEND_API_KEY + RESEND_FROM_EMAIL to switch to Resend.');
    }
  });

  return { configured: true, transporter, fromAddress: emailUser };
}

function createMailer() {
  const resendMailer = createResendMailer();
  if (resendMailer) return resendMailer;

  const gmailMailer = createGmailMailer();
  if (gmailMailer) return gmailMailer;

  console.warn('⚠️  No email transport configured. Email sending is disabled.');
  console.warn('   Set RESEND_API_KEY + RESEND_FROM_EMAIL (recommended), or EMAIL_USER + EMAIL_PASSWORD, in your environment (see env/backend.env.example).');
  return { configured: false, transporter: null, fromAddress: '' };
}

module.exports = { createMailer };
