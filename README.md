# Dr. Rana Dental Clinic

Website, appointment booking, admin console and patient portal for Dr. Rana Dental Clinic (Kharar, Punjab).

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui
- **Production API**: PHP 8 (`backend-php/`) -- static site + API on one free Serv00 account
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
├── backend-php/             PHP API -- deployed to Serv00 as public_html/api
│   ├── index.php            front controller: every production route lives here
│   ├── lib/                 auth, store, mailer, email templates, PDF, WATI, rate limit, zip
│   ├── config.example.php   copy to config.php on the server (secrets live there)
│   ├── router.php           local `php -S` router (not deployed)
│   └── scripts/             smoke-test.php, import-json-data.php
├── backend/                 Node/Express API for local development
│   ├── server.cjs
│   ├── lib/
│   └── scripts/
├── deploy/serv00/           the site's .htaccess (PHP pin, API routing, SPA fallback)
├── .github/workflows/       deploy-serv00.yml (PHP 8.2 checks + build + SFTP upload)
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

That serves `/api/*` on port 5001 and keeps its data in `backend-php/data/` plus uploads in `backend-php/uploads/`.

## Environment variables

Local env files live in `env/`. Only the `*.example` templates are committed; the real `env/backend.env` and `env/frontend.env` are gitignored. They are read by the **Node** backend and by Vite during local development.

Production reads **`backend-php/config.php`** instead (Serv00 has no environment variables). That file is gitignored, exists only on the server, and is never uploaded by the deploy workflow.

| Setting | Used by | Notes |
|---------|---------|-------|
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | both APIs | Recommended. Resend is called over HTTPS, so it never needs an SMTP port. |
| `EMAIL_USER`, `EMAIL_PASSWORD` | both APIs | Gmail App Password fallback over SMTP (port 587 + STARTTLS). |
| `ADMIN_NOTIFICATION_EMAIL` | both APIs | Where booking/prescription copies are sent. |
| `ADMIN_2FA_EMAIL` | PHP API | Where the admin login code goes (falls back to the two settings above). |
| `SESSION_SECRET` | both APIs | Signs admin/patient tokens. Set it explicitly in production. |
| `PUBLIC_APP_URL` | both APIs | Public origin, needed for the prescription PDF link sent to WhatsApp. |
| `WATI_*` | both APIs | Optional WhatsApp automation, see [backend/WATI_SETUP.md](backend/WATI_SETUP.md). |

Without email configured the API still runs: email endpoints report "email is not configured" instead of failing, and the 2FA fallback code is written to the server log whenever `APP_ENV` is not `production` (set it temporarily while setting the deployment up).

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
| `php backend-php/scripts/import-json-data.php <data-dir>` | Imports a JSON data folder from an earlier installation |

## Data storage

Both APIs store everything (bookings, patients, prescriptions, settings, uploaded media, generated PDFs) as JSON files plus uploads:

- **Local (Node)**: `backend/data/`
- **Local (PHP)**: `backend-php/data/` and `backend-php/uploads/`
- **Production**: `public_html/data/` (blocked over HTTP by the site `.htaccess`) and `public_html/uploads/` (public media)

Back this data up: it is the clinic's only copy.

## Deployment (Serv00)

The site and the PHP API are served from the same origin out of `~/domains/<domain>/public_html`, so the frontend calls `/api/...` on its own domain -- no CORS, no separate API URL.

### One-time setup

1. **Panel → WWW websites → Add new website**: enter your domain (or use the free `<login>.serv00.net` subdomain) and set **Website type = PHP**. Serv00 only honours `.htaccess` on PHP-type sites, and the whole app depends on it.
2. **Panel → SSL certificates**: request the free Let's Encrypt certificate, then enable *force SSL* in the website details.
3. **Create a deploy key** on your machine:
   ```bash
   ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/serv00_deploy
   ```
   Paste the **public** half (`~/.ssh/serv00_deploy.pub`) into **Panel → Additional → SSH keys**.
4. **GitHub → Settings → Secrets and variables → Actions**, add:

   | Secret | Value |
   |---|---|
   | `SSH_HOST` | your server, e.g. `s5.serv00.com` (shown in the panel) |
   | `SSH_PORT` | `22` |
   | `SSH_USERNAME` | your Serv00 login |
   | `SSH_PRIVATE_KEY` | contents of `~/.ssh/serv00_deploy` (private key) |
   | `DEPLOY_PATH` | `/usr/home/<login>/domains/<domain>/public_html` |

5. Push to `main` (or run the workflow manually) and open the site over HTTPS.
6. Create `public_html/api/config.php` (next section) before using the admin console.

### How the pipeline works

`.github/workflows/deploy-serv00.yml` runs on every push to `main`:

0. **PHP 8.2 checks** -- `php -l` on every file plus the API smoke test, on the exact PHP version the site is pinned to, so a broken API never ships;
1. installs the frontend dependencies and runs `npm run build`;
2. assembles `deploy-out/` from `frontend/dist`, `backend-php/` (minus `scripts/`, `router.php`, `config.example.php` and any `config.php`) and `deploy/serv00/public_html/.htaccess`;
3. uploads it to `DEPLOY_PATH` over SFTP.

Serv00 has no Git integration of its own, so this workflow is the "deploy from GitHub" path. Deploys only ever write the app files -- `data/`, `uploads/` and `api/config.php` are left alone.

### Server-side configuration

Create `public_html/api/config.php` from `backend-php/config.example.php` (panel File Manager or SFTP) and fill in:

- `SESSION_SECRET` -- `php -r "echo bin2hex(random_bytes(48)), PHP_EOL;"`
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (or `EMAIL_USER` + `EMAIL_PASSWORD`)
- `ADMIN_NOTIFICATION_EMAIL`
- `PUBLIC_APP_URL` -- `https://<your-domain>`
- `WATI_*` if WhatsApp is used

That file is gitignored and is never uploaded or overwritten by a deploy.

`DATA_DIR` defaults to `public_html/data`, which the site `.htaccess` blocks over HTTP, so it works out of the box. To keep records outside the web root instead, point `DATA_DIR` at `__DIR__ . '/../../clinic-data'` and allow that folder in the site's *open_basedir* (panel → WWW → Details).

### PHP version

Serv00's default is 8.3. The site `.htaccess` starts with `AddType application/x-httpd-php82 .php`, which pins the site (including the API) to 8.2 -- the same version CI lints against. If Serv00 ends up reading the `.htaccess` from `~/domains/<domain>/` rather than `public_html/`, copy that file there as well.

### Moving existing data in

1. Collect the JSON files from the old installation (Admin UI, or `GET /api/data/<collection>`, `/api/bookings`, `/api/media`).
2. `php backend-php/scripts/import-json-data.php <folder> --target=./imported --admin-password='…'`
   - Portal passwords are re-hashed with PHP's password API (Node's scrypt hashes cannot be verified in PHP), so every imported patient account gets one temporary password printed by the script.
   - The admin account is recreated with a new password, also printed.
3. Upload the JSON files into `public_html/data/` and any media into `public_html/uploads/media/`.

### Backups

Serv00 keeps **daily backups for 7 days** on its own. On top of that:

- **Admin → Settings → Download backup** streams one ZIP of every JSON collection, the generated PDFs and all uploaded media (`GET /api/admin/backup`, admin session required). The archive is streamed entry by entry, so it works with large media folders.
- Serv00 allows **cron** (`crontab -e` over SSH), so that endpoint can also be fetched on a schedule with a long-lived token if you want automatic archives.

Still do one manual download a week and keep the archive off the server.

### Free-account limits worth knowing

- 3 GB SSD, 512 MB RAM, 15 system processes, 3 PHP interpreters, 180-second PHP execution limit.
- PHP 8.2 through 8.5 available; this site is pinned to 8.2.
- No root access and no custom daemons; `public_html` is the web root.
- Accounts inactive for 90 days are removed -- sign in to the panel occasionally.
- One account per person, and registration needs manual approval (a few hours up to 72 h).

## Node backend status

`backend/` (Express) is no longer deployed anywhere. It is kept because it is the local-development server started by `npm run dev` and the reference implementation the PHP API was ported from. Both must stay behaviour-compatible: the same paths, verbs and JSON shapes.
