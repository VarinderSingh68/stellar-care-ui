# Dr. Rana Dental Clinic

Website, appointment booking, admin console and patient portal for Dr. Rana Dental Clinic (Kharar, Punjab).

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui
- **Production API**: PHP 8 (`backend-php/`) -- static site + API on one InfinityFree account
- **Local-development API**: Node.js + Express (`backend/`) -- kept as the reference implementation and what `npm run dev` starts

Everything is JSON-file backed, so there is no database to provision on either runtime.

## Project structure

```
.
├── frontend/                React website + admin console + patient portal
│   ├── src/                 pages, components, lib (API client in src/lib/api.ts)
│   ├── public/
│   ├── index.html
│   └── vite.config.ts
├── backend-php/             PHP API -- deployed to InfinityFree as htdocs/api
│   ├── index.php            front controller: every production route lives here
│   ├── lib/                 auth, store, mailer, email templates, PDF, WATI, rate limit
│   ├── config.example.php   copy to config.php on the server (secrets live there)
│   ├── router.php           local `php -S` router (not deployed)
│   └── scripts/             smoke-test.php, import-json-data.php
├── backend/                 Node/Express API for local development
│   ├── server.cjs
│   ├── lib/
│   └── scripts/
├── deploy/infinityfree/     .htaccess files for the site root, data/ and uploads/
├── .github/workflows/       deploy-infinityfree.yml (build + FTP to InfinityFree)
├── env/                     environment files for local development
├── package.json             runs frontend + Node backend together
└── start.cmd                Windows double-click launcher
```

## Getting started (local)

Requires Node.js 20 or newer.

```bash
# 1. Install dependencies for root, backend and frontend
npm run setup

# 2. Create your local backend config and fill it in (email, WhatsApp, etc.)
cp env/backend.env.example env/backend.env

# 3. Start the backend and frontend together
npm run dev
```

On Windows you can also just double-click **`start.cmd`**. It installs dependencies on first run, then starts both servers.

| What | URL |
|------|-----|
| Website | http://localhost:8080 |
| Admin console | http://localhost:8080/admin |
| Patient portal | http://localhost:8080/patient-portal |
| API (status page) | http://localhost:5000 |

### Default logins

Created automatically the first time either backend starts with an empty data folder:

| Account | Username / email | Password |
|---------|------------------|----------|
| Admin | `admin` | `password123` (change it in Admin → Settings) |
| Demo patient | `patient@demo.com` | `demo123` |

### Running the PHP API locally

If PHP 8 is installed, the production API can be run directly (no config file needed -- it falls back to empty email/WhatsApp settings):

```bash
php -S 127.0.0.1:5001 backend-php/router.php
```

That serves `/api/*` on port 5001 and holds its data in `backend-php/data/` plus uploads in `backend-php/uploads/`.

## Environment variables

Local env files live in `env/`. Only the `*.example` templates are committed; the real `env/backend.env` and `env/frontend.env` are gitignored. They are read by the **Node** backend and by Vite during local development.

On the server there are no environment variables (InfinityFree does not provide them): everything comes from **`backend-php/config.php`**, which is gitignored, exists only on the host, and is never uploaded by the deploy workflow.

| Setting | Used by | Notes |
|---------|---------|-------|
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | both APIs | Recommended. Resend is called over HTTPS, so it works on InfinityFree (which blocks PHP `mail()`). |
| `EMAIL_USER`, `EMAIL_PASSWORD` | both APIs | Gmail App Password fallback over SMTP. Works on InfinityFree (port 587 + STARTTLS). |
| `ADMIN_NOTIFICATION_EMAIL` | both APIs | Where booking/prescription copies are sent. |
| `ADMIN_2FA_EMAIL` | PHP API | Where the admin login code goes (falls back to the two settings above). |
| `SESSION_SECRET` | both APIs | Signs admin/patient tokens. Set it explicitly in production. |
| `PUBLIC_APP_URL` | both APIs | Public origin, needed for the prescription PDF link sent to WhatsApp. |
| `WATI_*` | both APIs | Optional WhatsApp automation, see [backend/WATI_SETUP.md](backend/WATI_SETUP.md). |

Without email configured the API still runs: email endpoints report "email is not configured" instead of failing, and the admin 2FA script writes the fallback code to the server log whenever `APP_ENV` is not `production` (set it temporarily while setting the deployment up).

## Scripts

From the project root:

| Command | What it does |
|---------|--------------|
| `npm run setup` | Install dependencies in root, `backend/` and `frontend/` |
| `npm run dev` | Start the Node backend (auto-restart) and frontend dev server together |
| `npm run build` | Production build of the frontend into `frontend/dist` |
| `npm start` | Start the Node backend in production mode |
| `npm test` | Node API smoke test + frontend unit tests |
| `npm run lint` | Lint the frontend |

PHP API:

| Command | What it does |
|---------|--------------|
| `php backend-php/scripts/smoke-test.php` | Boots the PHP API on a free port against a throwaway data folder and exercises every route (48 checks) |
| `php backend-php/scripts/import-json-data.php <data-dir>` | Imports a JSON data folder exported from the previous host |

## Data storage

Both APIs store everything (bookings, patients, prescriptions, settings, uploaded media, generated PDFs) as JSON files and uploads:

- **Local (Node)**: `backend/data/`
- **Local (PHP)**: `backend-php/data/` and `backend-php/uploads/`
- **Production**: `htdocs/data/` (blocked from HTTP by its own `.htaccess`) and `htdocs/uploads/` (public media)

Back this data up: it is the clinic's only copy.

## Deployment (InfinityFree)

Production is one InfinityFree account serving both the static site and the PHP API from the same origin, so the frontend calls `/api/...` on its own domain (no CORS, no separate API URL).

### How the pipeline works

`.github/workflows/deploy-infinityfree.yml` runs on every push to `main`:

0. first runs the `PHP 8.2 checks` job: `php -l` on every file and the API smoke test on the exact PHP version InfinityFree runs, so a broken API never ships,
1. installs the frontend dependencies and runs `npm run build`,
2. assembles `deploy-out/` from `frontend/dist`, `backend-php/` (minus `scripts/`, `router.php`, `config.example.php` and any `config.php`) and the `deploy/infinityfree/htdocs` `.htaccess` files,
3. uploads `deploy-out/` to `/htdocs/` over FTP.

InfinityFree has no Git integration of its own, so this workflow is the "deploy from GitHub" path. `dangerous-clean-slate` is off: server-side `data/` and `uploads/` are never deleted.

### One-time setup

1. Create the InfinityFree account and add the domain (or use the free subdomain). Point the domain's nameservers at InfinityFree if you want their free SSL.
2. In the control panel, enable **free SSL** for the domain and wait for it to be issued.
3. In GitHub → **Settings → Secrets and variables → Actions**, add:
   - `FTP_SERVER` = `ftpupload.net`
   - `FTP_USERNAME` = your InfinityFree FTP username (`if0_xxxxxxxx`)
   - `FTP_PASSWORD` = your InfinityFree FTP password
4. Push to `main` (or run the workflow manually) and confirm the files land in `htdocs/`.
5. Create `htdocs/api/config.php` from `backend-php/config.example.php` with the File Manager, and fill in:
   - `SESSION_SECRET` -- generate with `php -r "echo bin2hex(random_bytes(48)), PHP_EOL;"`
   - `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (or `EMAIL_USER` + `EMAIL_PASSWORD`)
   - `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_APP_URL` (e.g. `https://your-site.infinityfreeapp.com`)
   - `WATI_*` if WhatsApp is used
6. Open the site, sign in to `/admin` with `admin` / `password123` (the code is in the server log until email is configured), and change the password in Admin → Settings.

### Moving data off the old host first

`htdocs/data` and `htdocs/uploads` are created on first boot, but the clinic's real records have to be copied over before the old host is shut down:

1. Download the JSON files from the old host (admin session: `GET /api/data/<collection>`, `/api/bookings`, `/api/media`) or grab the data folder directly.
2. Run `php backend-php/scripts/import-json-data.php <downloaded-data-dir> --target=htdocs/data`.
   - Portal passwords are re-hashed with PHP's password API (Node's scrypt hashes cannot be verified in PHP), so every imported patient account gets one temporary password printed by the script.
   - The admin account is recreated with a new password, also printed.
3. Copy `backend/data/uploads/media/*` into `htdocs/uploads/media/` if the script was not pointed at the folder.

### Backups (no cron on InfinityFree)

InfinityFree prohibits cron jobs and scheduled requests, so backups are manual:

- **Admin → Settings → Download backup** streams one ZIP containing every JSON collection, the generated prescription PDFs and all uploaded media (`GET /api/admin/backup`, admin session required). The archive is streamed entry by entry, so it works with large media folders.
- For a belt-and-braces copy, also download the `htdocs/data` and `htdocs/uploads` folders over FTP (FileZilla: right-click → Download).

Do this weekly and keep the archive off the server: losing `htdocs/data` loses the clinic's records.

### Free-plan limits worth knowing

- PHP 8.2 only -- no Node.js, no Python, no SSH, no `php.ini`.
- No cron jobs, no WebSockets, no PHP `mail()` (external SMTP/HTTPS APIs are fine).
- 10 MB per file; uploads are therefore capped at 6 MB in the API.
- Daily hit/CPU limits -- the account is suspended if they are exceeded, and there are no backups on the host.
- One MySQL database. This project does not need it: data is JSON files under `htdocs/data`.

## Node backend status

`backend/` (Express) is no longer deployed anywhere. It is kept because it is the local-development server started by `npm run dev` and the reference implementation the PHP API was ported from. Both must stay behaviour-compatible: the same paths, verbs and JSON shapes.

## Removed deployment

The project used to be deployed on Render (`render.yaml`, `dr-rana-dental-api` + `dr-rana-dental-ui`). That configuration has been deleted; the only deployment path now is the InfinityFree workflow above.
