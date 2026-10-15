# Dr. Rana Dental Clinic

Website, appointment booking, admin console and patient portal for Dr. Rana Dental Clinic (Kharar, Punjab).

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js + Express API with JSON-file storage, signed session tokens, email (Resend or Gmail SMTP), optional WhatsApp (WATI), and PDF generation for prescriptions, follow-ups, reports and billing

## Project structure

```
.
├── frontend/              React website + admin console + patient portal
│   ├── src/               pages, components, lib (API client in src/lib/api.ts)
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── backend/               Express API
│   ├── server.cjs         entry point: every route lives here
│   ├── lib/               auth, storage, mailer, email templates, PDF, WATI
│   ├── scripts/           smoke-test.mjs (npm test)
│   ├── data/              runtime data, created on first start (gitignored)
│   ├── WATI_SETUP.md      WhatsApp setup guide
│   └── package.json
├── env/                   environment files for local development
│   ├── backend.env.example
│   └── frontend.env.example
├── package.json           runs frontend + backend together
├── render.yaml            Render deployment (API + static site)
└── start.cmd              Windows double-click launcher
```

`frontend/` and `backend/` are independent npm packages, each with its own `package.json` and `node_modules`. Each can be built and deployed by itself.

## Getting started

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

These are created automatically the first time the backend starts with an empty data folder:

| Account | Username / email | Password |
|---------|------------------|----------|
| Admin | `admin` | `password123` (change it in Admin → Settings) |
| Demo patient | `patient@demo.com` | `demo123` |

## Environment variables

All local env files live in `env/`. Only the `*.example` templates are committed. The real `env/backend.env` and `env/frontend.env` are gitignored.

| File | Used by | Notes |
|------|---------|-------|
| `env/backend.env` | `backend/server.cjs` | Email, WhatsApp, session secret, data folder. Every variable is documented in `env/backend.env.example`. |
| `env/frontend.env` | `frontend/vite.config.ts` | Optional. `VITE_API_URL` defaults to `http://localhost:5000` in development. |

The backend runs without email or WhatsApp configured. Those features report "not configured" instead of crashing.

**Email**: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (recommended; needs a domain verified in Resend). Otherwise the fallback is `EMAIL_USER` + `EMAIL_PASSWORD` (a Gmail App Password), which is fine for testing but unreliable for real patient inboxes.

**WhatsApp**: see [backend/WATI_SETUP.md](backend/WATI_SETUP.md).

## Scripts

From the project root:

| Command | What it does |
|---------|--------------|
| `npm run setup` | Install dependencies in root, `backend/` and `frontend/` |
| `npm run dev` | Start backend (auto-restarts on change) and frontend dev server together |
| `npm run build` | Production build of the frontend into `frontend/dist` |
| `npm start` | Start the backend in production mode |
| `npm test` | Backend API smoke test + frontend unit tests |
| `npm run lint` | Lint the frontend |

Inside `backend/`: `npm start`, `npm run dev`, `npm test`.
Inside `frontend/`: `npm run dev`, `npm run build`, `npm run preview`, `npm test`, `npm run lint`.

`npm test` in `backend/` boots a separate copy of the API on a free port with a temporary data folder and email/WhatsApp turned off. It then checks every route. It never touches `backend/data` and never sends real messages.

## Data storage

The backend stores everything (bookings, patients, prescriptions, settings, uploaded media, generated PDFs) as JSON files and uploads under `backend/data/`. Set `DATA_DIR` to put it somewhere else. Back this folder up: it is the clinic's only copy of the data.

## Deployment (Render)

`render.yaml` defines two services:

- **`dr-rana-dental-api`**: web service with `rootDir: backend`, runs `node server.cjs`. It stores data on a persistent disk mounted at `/var/data` (`DATA_DIR`). Persistent disks need a paid instance type. On the free plan, all data is wiped on every deploy or restart.
- **`dr-rana-dental-ui`**: static site with `rootDir: frontend`, built with `npm run build` and published from `frontend/dist`. `VITE_API_URL` points it at the API.

Render only makes each service's `rootDir` available, so `env/` is **not** deployed. Set secrets (email, WATI, etc.) in each service's **Environment** settings on Render.
