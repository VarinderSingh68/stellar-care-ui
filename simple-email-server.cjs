/**
 * DEPRECATED -- do not run this file.
 *
 * This was one of three competing backend servers in this project
 * (server.ts, email-server.cjs, simple-email-server.cjs). As part of the
 * "fix everything" cleanup, all backend logic was consolidated into a
 * single server: `email-server.cjs` (see that file's header comment for
 * the full route list, auth model, and data storage). That is now the ONLY
 * backend entry point -- it's what `npm start`, the Procfile, and
 * render.yaml all run.
 *
 * This file has been emptied out (rather than deleted) because this tool
 * cannot delete files on your machine. It is safe -- and recommended -- to
 * delete simple-email-server.cjs from your project entirely. Nothing in
 * this codebase imports or runs it anymore.
 *
 * IMPORTANT SECURITY NOTE: an earlier version of this file contained a
 * hardcoded Gmail app password as a source-code fallback, which is exactly
 * the kind of exposed-credential problem flagged in the original system
 * analysis. email-server.cjs never has a hardcoded credential fallback --
 * it reads EMAIL_USER / EMAIL_PASSWORD from the environment only, and
 * degrades gracefully (email sending reports "not configured") if they're
 * missing, instead of crashing or falling back to a baked-in secret.
 * If that old Gmail app password is still active, rotate/revoke it in your
 * Google Account security settings -- it should be treated as compromised
 * since it lived in source control.
 *
 * If you need to run the backend: `npm start` (or `node email-server.cjs`).
 */

module.exports = {};
