<?php
// Dr. Rana Dental Clinic -- PHP API configuration.
//
// Copy this file to config.php (same folder) and fill in the real values.
// config.php is gitignored and must never be committed: it holds the Resend
// API key and the session signing secret.
//
// InfinityFree has no environment-variable support, so this file IS the
// production configuration. Locally you can either create config.php too, or
// set the matching environment variables (they override this file).

return [
    // Where the JSON collections, generated PDFs and the session secret live.
    // Deployed this resolves to htdocs/data (protected by its own .htaccess).
    // Locally it resolves to backend-php/data.
    'DATA_DIR' => __DIR__ . '/../data',

    // Uploaded media. Must be a *public* folder so <img src="/uploads/media/…">
    // works exactly like it did on Render. Deployed: htdocs/uploads/media.
    // Locally: backend-php/uploads/media.
    'UPLOADS_DIR' => __DIR__ . '/../uploads/media',

    // Secret used to sign admin/patient session tokens (HMAC-SHA256).
    // Generate one with:  php -r "echo bin2hex(random_bytes(48)), PHP_EOL;"
    'SESSION_SECRET' => '',

    // --- Email: Resend (recommended; sent over HTTPS on port 443) ----------
    // Works on InfinityFree because it is a normal HTTPS request, not SMTP.
    'RESEND_API_KEY' => '',
    'RESEND_FROM_EMAIL' => '',

    // --- Email: Gmail SMTP fallback (only used when Resend is not set) -----
    // Use a Gmail App Password, not the account password. Port 587 + STARTTLS.
    'EMAIL_USER' => '',
    'EMAIL_PASSWORD' => '',

    // Where booking/prescription notifications are CC'd, and where the admin
    // 2FA login code is delivered. ADMIN_2FA_EMAIL wins if set.
    'ADMIN_NOTIFICATION_EMAIL' => '',
    'ADMIN_2FA_EMAIL' => '',

    // Public origin of the deployed site, e.g. https://your-site.infinityfreeapp.com
    // Required for the prescription PDF links sent to WhatsApp.
    'PUBLIC_APP_URL' => '',

    // Optional comma-separated list of extra origins allowed to call the API.
    // Leave blank: the site and API share one origin on InfinityFree.
    'ALLOWED_ORIGINS' => '',

    'CLINIC_PHONE' => '',

    // --- WATI WhatsApp automation (optional; leave blank to disable) -------
    'WATI_API_ENDPOINT' => '',
    'WATI_ACCESS_TOKEN' => '',
    'WATI_CHANNEL_NUMBER' => '',
    'WATI_DEFAULT_COUNTRY_CODE' => '91',
    'WATI_APPOINTMENT_TEMPLATE_NAME' => 'appointment_confirmation',
    'WATI_PRESCRIPTION_TEMPLATE_NAME' => 'prescription_pdf',
    'WATI_APPOINTMENT_BROADCAST_NAME' => 'appointment_confirmation',
    'WATI_PRESCRIPTION_BROADCAST_NAME' => 'prescription_pdf',
    'WATI_PRESCRIPTION_PDF_PARAM_NAME' => 'pdfLink',

    // 'production' hides the 2FA fallback code from the log output.
    'APP_ENV' => 'production',
];
