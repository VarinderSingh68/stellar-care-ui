# EmailJS setup (no longer used)

This app has been switched back to Gmail SMTP via Nodemailer (see [EMAIL_SETUP.md](./EMAIL_SETUP.md) for setup and [EMAIL_TROUBLESHOOTING.md](./EMAIL_TROUBLESHOOTING.md) for common issues). EmailJS is no longer part of this codebase.

**Heads up:** Render permanently blocks outbound SMTP traffic (ports 25/465/587) on free web services, so Gmail SMTP cannot actually connect from a free Render web service -- this is the same "Connection timeout" issue that prompted the earlier switch to EmailJS. If this app is deployed to Render's free tier, email sending will not work until you either upgrade the web service to a paid instance type (which allows outbound SMTP) or move to an HTTPS-based provider such as EmailJS, Resend, or Brevo.

This file is safe to delete; it's kept only as a pointer for anyone who finds a stale link to it.
