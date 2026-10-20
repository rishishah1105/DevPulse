# DevPulse

A GitHub repository health dashboard. Sign in with GitHub, add any public repo, and get a clear view of what's open, what's stale, what's unassigned, and how fast issues get closed — on one screen.

**Live:** https://devpulse-gqp8.onrender.com

> Built as a learning project to understand React, Node, Express and PostgreSQL well enough to explain every part in an interview.

---

## What it does

- **Import any public repo** by URL — fetches all issues and pull requests via the GitHub REST API
- **Incremental sync** — first sync of vitejs/vite (18,223 items) took ~4 min 44 sec; re-sync under 1 second
- **Health metrics** — open issues, open PRs, stale items (30+ days inactive), unassigned issues, median time-to-close
- **Filters** — by type (issue / PR), state (open / closed), staleness; server-side pagination
- **Weekly activity chart** — opened vs closed per week, last 12 weeks

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + React Router |
| Styling | Tailwind CSS + shadcn/ui |
| Animations | Motion (`motion/react`) |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL (Neon) |
| Auth | GitHub OAuth — sessions via express-session + connect-pg-simple |
| HTTP client | Native `fetch` |
| Hosting | Render (one web service) |
| Tests | Vitest (pure functions) |

---

## Architecture

```
Browser (React, built by Vite, served by Express)
  │  fetch /api/...  (same origin — no CORS)
  ▼
Express
  ├─ session middleware    who is this?
  ├─ requireAuth           logged in?
  ├─ rateLimiter           token bucket, 429 if over limit
  ├─ routes                auth, repos, items, metrics
  ├─ services/sync         paginates GitHub, writes to DB
  └─ error handler         consistent { error: { code, message } } shape

PostgreSQL (Neon)      GitHub REST API
```

In development, Vite's `server.proxy` forwards `/api` to Express so both run on different ports with no CORS configuration.

---

## Key design decisions

**Sync lock** — an atomic `UPDATE ... WHERE sync_status <> 'running' RETURNING id` prevents two syncs running at once. Safe across multiple server processes. A 15-minute stale-lock clause lets a new sync take over if the server crashes mid-run.

**Idempotent upserts** — `INSERT ... ON CONFLICT (repository_id, number) DO UPDATE` means running the same sync twice produces the same result. Each page of 100 items is written in one transaction.

**Incremental sync** — after a successful sync, the cursor is saved as the sync *start* time (not end time). The next sync adds `&since=<cursor>` so nothing falls through the gap.

**Sessions over JWT** — the GitHub token must stay server-side. Sessions store everything in Postgres; the browser only holds a cookie. Instant logout by deleting the session row.

**Raw SQL** — no ORM. Every query is written and parameterized by hand, especially the upsert and the lock.

**Token bucket rate limiter** — hand-written Express middleware, keyed by user ID. In-memory `Map`; correct for one server, Redis would be needed for multiple instances.

---

## Running locally

**Prerequisites:** Node 18+, a Neon (or local) PostgreSQL database, a GitHub OAuth App.

```bash
# 1. Clone
git clone https://github.com/rishishah1105/DevPulse.git
cd DevPulse

# 2. Install
cd server && npm install
cd ../client && npm install

# 3. Environment
cp server/.env.example server/.env
# fill in DATABASE_URL, SESSION_SECRET, GITHUB_CLIENT_ID,
# GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL

# 4. Migrate
cd server && npm run migrate

# 5. Run (two terminals)
npm run dev          # from server/  — Express on :3001
npm run dev          # from client/  — Vite on :5173
```

GitHub OAuth App callback URL for local dev: `http://localhost:3001/api/auth/github/callback`

---

## Database schema

| Table | Purpose |
|---|---|
| `users` | GitHub user id, login, avatar |
| `repositories` | Repo metadata + sync state (status, cursor, progress, error) |
| `user_repositories` | Join table — many users can track the same repo |
| `github_items` | Issues and PRs; UNIQUE on `(repository_id, number)` |
| `session` | Server-side sessions (connect-pg-simple) |

---

## API

```
GET    /api/me
GET    /api/auth/github
GET    /api/auth/github/callback
POST   /api/auth/logout

GET    /api/repos
POST   /api/repos                     { url }
DELETE /api/repos/:id
POST   /api/repos/:id/sync            → 202, 409, 429
GET    /api/repos/:id/sync-status
GET    /api/repos/github-discover

GET    /api/repos/:id/items?type=&state=&stale=&page=&limit=
GET    /api/repos/:id/metrics
```

Every `/api/repos/:id/...` route verifies the logged-in user tracks that repo before returning data.

---

## Known limitations

- **Free tier sleep** — Render spins down after 15 minutes idle; first request after sleep takes ~60 seconds
- **No private repos** — requires the `repo` OAuth scope; kept out intentionally to minimise permissions
- **In-memory rate limiter** — correct for one server process; would need Redis for horizontal scaling
- **No webhooks** — incremental sync covers most freshness needs with far less complexity
- **No TypeScript** — deliberate trade-off for a 5-day build; natural next step
