// Nodemailer transport setup. The clinic backend can run perfectly well
// with email disabled (e.g. before EMAIL_USER/EMAIL_PASSWORD are configured
// on the host) -- every other feature (patients, appointments, portal,
// etc.) keeps working; only the email-sending endpoints report a clear
// "email is not configured" error instead of the whole process crashing.
// This is a deliberate change from the old email-server.cjs, which called
// process.exit(1) at startup if credentials were missing, taking down the
// entire API (not just email) when a Render env var was left unset.

const nodemailer = require('nodemailer');

function createMailer() {
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s/g, '');

  if (!emailUser || !emailPassword) {
    console.warn('⚠️  EMAIL_USER / EMAIL_PASSWORD are not set. Email sending is disabled.');
    console.warn('   Set both in your environment (see .env.example) to enable booking, prescription, follow-up, report and billing emails.');
    return { configured: false, transporter: null, fromAddress: '' };
  }

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
      console.log('✅ Email transport ready (' + emailUser + ')');
    }
  });

  return { configured: true, transporter, fromAddress: emailUser };
}

module.exports = { createMailer };
