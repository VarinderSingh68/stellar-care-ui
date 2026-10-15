// Nodemailer transport setup. The clinic backend can run perfectly well
// with email disabled (e.g. before credentials are configured on the host)
// -- every other feature (patients, appointments, portal, etc.) keeps
// working; only the email-sending endpoints report a clear "email is not
// configured" error instead of the whole process crashing. This is a
// deliberate change from the old email server, which called
// process.exit(1) at startup if credentials were missing, taking down the
// entire API (not just email) when a Render env var was left unset.
//
// Two transports are supported:
//  - Resend (preferred): a real transactional email provider, reached via
//    its SMTP relay so every existing transporter.sendMail(...) call in
//    server.cjs keeps working unchanged. Needs RESEND_API_KEY and a
//    RESEND_FROM_EMAIL at a domain verified in the Resend dashboard --
//    without a verified domain, Resend's sandbox will only actually
//    deliver to the email address the Resend account was signed up with.
//  - Gmail SMTP with an App Password (legacy fallback): works, but mail
//    sent from a personal Gmail account to third-party inboxes routinely
//    gets silently dropped or spam-filtered -- fine for local smoke
//    testing, not reliable for real patient notifications. Prefer Resend.

const nodemailer = require('nodemailer');

function createResendMailer() {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;

  const fromAddress = (process.env.RESEND_FROM_EMAIL || '').trim();
  if (!fromAddress) {
    console.warn('⚠️  RESEND_API_KEY is set but RESEND_FROM_EMAIL is missing. Email sending is disabled.');
    console.warn('   Set RESEND_FROM_EMAIL to an address at a domain verified in your Resend dashboard.');
    return { configured: false, transporter: null, fromAddress: '' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: { user: 'resend', pass: apiKey },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });

  transporter.verify((error) => {
    if (error) {
      console.error('❌ Resend transport verification failed:', error.message);
      console.error('   Check RESEND_API_KEY and that RESEND_FROM_EMAIL is at a domain verified in Resend.');
    } else {
      console.log('✅ Email transport ready via Resend (' + fromAddress + ')');
    }
  });

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
      console.error('   Emails will likely fail to send until this is fixed. Check EMAIL_USER / EMAIL_PASSWORD.');
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
