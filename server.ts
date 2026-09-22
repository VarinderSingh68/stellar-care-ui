/**
 * DEPRECATED -- do not run this file.
 *
 * This was one of three competing backend servers in this project
 * (server.ts, email-server.cjs, simple-email-server.cjs). As part of the
 * "fix everything" cleanup, all backend logic was consolidated into a
 * single server: `email-server.cjs` (see that file's header comment for
 * the full route list). That is now the ONLY backend entry point -- it's
 * what `npm start`, the Procfile, and render.yaml all run.
 *
 * This file has been emptied out (rather than deleted) because this tool
 * cannot delete files on your machine. It is safe -- and recommended -- to
 * delete server.ts from your project entirely. Nothing in this codebase
 * imports or runs it anymore.
 *
 * Why it was retired:
 *  - It duplicated routes already in email-server.cjs with slightly
 *    different (and in places inconsistent) behavior, which is exactly the
 *    kind of "three servers, pick one at random" bug the original system
 *    analysis flagged.
 *  - It stored bookings/patients only in a flat bookings.json with no auth,
 *    no admin/patient separation, and no session-token model.
 *
 * If you need to run the backend: `npm start` (or `node email-server.cjs`).
 */

export {};
