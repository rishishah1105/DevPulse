# DevPulse: Master Project Doc

> **What this project is for:** learning React, Vite, Node, Express and PostgreSQL well enough to **explain and defend every part of it in an interview**.
>
> **The rule above all other rules:** a smaller project you can fully explain beats a bigger one you can't. If time runs short, cut scope (section 13). Never keep code you can't explain.

---

## 1. The product in one paragraph

DevPulse imports the issues and pull requests of any public GitHub repository into its own database and turns them into a clear health dashboard: what's open, what's stale, what nobody owns, and how fast things get closed. You sign in with GitHub, paste a repo URL, watch it import, and explore the data with filters and metrics. GitHub stays the source of truth. DevPulse adds the overview GitHub doesn't give you on one screen.

**Demo story:** sign in → paste a medium-sized open-source repo (a few thousand issues) → watch the import progress → open the dashboard → filter stale, unassigned issues → click through to GitHub → click "Sync" again and it finishes in seconds, because only changes are fetched.

---

## 2. What this project teaches you

| Concept | Where it lives in DevPulse |
|---|---|
| HTTP, REST, status codes | Every API route |
| Express middleware | Auth check, rate limiter, error handler |
| Relational database design | Users, repositories, a join table, imported items |
| Constraints and indexes | Unique keys that make imports duplicate-proof; indexes for filters |
| Upserts / idempotency | `INSERT ... ON CONFLICT DO UPDATE` during sync |
| Concurrency / race conditions | The sync lock: two clicks must not start two syncs |
| OAuth | "Sign in with GitHub", written by hand |
| Sessions and cookies | Staying logged in after OAuth |
| Third-party API integration | Pagination, rate-limit headers, error handling |
| Rate limiting (your own API) | Hand-written limiter returning `429` |
| Incremental sync | Only fetching what changed since the last sync |
| SQL aggregation | Metrics: counts, median time-to-close, weekly trends |
| React fundamentals | Components, state, props, effects, routing |
| Server-side pagination and filtering | The issues table |
| Deployment | Render + Neon, environment variables, production cookies |

---

## 3. Scope

### Core (the 5-day build)
- Sign in with GitHub (OAuth, no extra permissions), sessions, logout
- Add a public repo by URL; list "my repos"
- Full sync: pagination, issues vs PRs, duplicate-safe upserts
- Sync lock (atomic, with stale-lock expiry) and sync cooldown
- Sync status and progress stored in the DB; UI polls it
- Rate-limit handling for GitHub's API (read headers, stop cleanly)
- Incremental sync with GitHub's `since` parameter
- Your own API rate limiter (hand-written, returns `429`)
- Repo page: issues/PR table with filters (type, state, label, assignee, stale) and server-side pagination
- Dashboard metrics with precise definitions; one or two simple charts
- Unit tests (Vitest) for pure functions only: Link-header parsing, issue-vs-PR detection, metric calculations
- Deployed on Render + Neon; README; `DECISIONS.md`; `BUGS.md`

### Stretch (only after core works and you can explain it)
1. Live sync progress over Server-Sent Events (replacing polling)
2. Scheduled background sync
3. A `sync_runs` history table

### Deliberately out (and what to say if asked)

| Left out | Why (your interview answer) |
|---|---|
| Redis | One server, so in-memory limiter counts are correct. I'd add Redis to share counts once there are multiple instances. |
| MongoDB | The data is relational (users ↔ repos ↔ items). Postgres covers it; JSONB would cover any loose data. |
| Prisma / ORM | I wanted to write and understand the SQL myself, especially the upsert and the lock. |
| Email/password login | GitHub OAuth is both login and GitHub access, so one auth flow instead of two. |
| Private repos | Would need the `repo` permission. I kept permissions minimal on purpose. |
| Webhooks | Need a public endpoint, signature verification and handling for out-of-order events. Incremental sync gives most of the freshness for far less complexity. |
| PR review metrics | Need extra API data per PR. I only show metrics my data can actually prove. |
| Internal task manager | It's a todo app; it doesn't serve the product. |
| TypeScript | A deliberate trade-off for a 5-day build while learning the stack; a natural next step afterwards. |
| Kokonut UI | shadcn already covers the components needed; adding a second component library adds inconsistency. |

---

## 4. Tech stack and why

| Piece | Role | Why |
|---|---|---|
| React | UI | Component model; industry standard |
| Vite | Dev server and bundler for React | Fast; its dev proxy removes CORS in development |
| React Router | Pages, protected routes | Standard routing for React |
| Plain JavaScript (ES modules) | Language everywhere | No TypeScript, to keep the 5-day learning load manageable |
| Tailwind CSS + shadcn/ui | Styling and UI components (JS setup) | Clean, consistent UI quickly; components are copied into the repo, so they're readable |
| Node.js | Server runtime | Same language front and back; good at I/O-heavy work like API calls |
| Express | API framework | Minimal, so you see what's happening; middleware model |
| PostgreSQL | Database | Constraints, transactions, upserts, strong aggregation |
| `pg` | Postgres driver | Raw, parameterized SQL |
| express-session + connect-pg-simple | Sessions stored in Postgres | Sessions survive restarts; no extra service |
| Native `fetch` | Calls to GitHub | Built into Node; no extra library |
| Motion (`motion/react`) | Smooth transitions: page changes, dialogs, filter updates, sync status | Declarative React animations (enter/exit, layout); used sparingly, respects reduced-motion settings |
| Recharts (via shadcn charts) | 1–2 charts | Simple React charts that match the shadcn styling |
| Vitest | Unit tests for pure functions | Fast; works naturally with Vite |
| Render | Hosting (one web service) | Express serves API + built React app from one URL |
| Neon | Hosted Postgres | Free tier without Render's 30-day DB expiry |

---

## 5. Architecture

```
Browser ── React app (built by Vite, served by Express)
   │  fetch /api/...  (same origin → cookies just work, no CORS)
   ▼
Express server
   ├─ session middleware      → who is this?
   ├─ requireAuth             → logged in?
   ├─ rateLimiter             → too many requests? → 429
   ├─ routes                  → auth, repos, items, metrics
   ├─ services/sync           → talks to GitHub, writes to DB
   └─ error handler           → one consistent error shape
   │                     │
   ▼                     ▼
PostgreSQL (Neon)     GitHub REST API
```

**In development:** Vite runs on one port and Express on another. Vite's `server.proxy` forwards `/api` to Express, so the browser still sees one origin.

**Folder structure (keep it this simple):**
```
devpulse/
├── client/              React + Vite
│   └── src/ (pages/, components/, api.js, App.jsx)
├── server/
│   └── src/
│       ├── routes/      auth.js, repos.js, items.js, metrics.js
│       ├── middleware/  requireAuth.js, rateLimiter.js, errorHandler.js
│       ├── services/    github.js, sync.js
│       ├── db/          pool.js, migrations/*.sql
│       └── app.js
├── CLAUDE.md            how Claude Code works with me (imports this file)
├── DevPulse.md          this file
├── DECISIONS.md
├── BUGS.md
└── README.md
```

---

## 6. Data model

| Table | Key columns | Rules that matter |
|---|---|---|
| `users` | id, github_user_id, login, avatar_url, created_at | `github_user_id` UNIQUE (logins can change; IDs can't) |
| `repositories` | id, github_repo_id, owner, name, full_name, html_url, sync_status, sync_started_at, last_synced_at, last_sync_cursor, sync_items_done, sync_pages_total, sync_error, retry_after | `github_repo_id` UNIQUE; `sync_status` ∈ idle / running / succeeded / failed |
| `user_repositories` | user_id, repository_id, added_at | PRIMARY KEY (user_id, repository_id). Many users can track the same public repo, but it's imported once. |
| `github_items` | id, repository_id, number, github_id, type, title, state, author_login, assignee_login, labels (text[]), html_url, created_at_gh, updated_at_gh, closed_at_gh | UNIQUE (repository_id, number) is what makes upserts work; `type` ∈ issue / pr |
| `session` | (created by connect-pg-simple) | Holds login sessions and the GitHub token, server-side only |

**Indexes to add, and be ready to justify:**
- `github_items (repository_id, state, type)`: almost every filter starts here
- `github_items (repository_id, updated_at_gh)`: stale-item queries

**Design questions you must be able to answer:**
- Why a `user_repositories` join table? (many-to-many; no duplicate imports of the same repo)
- Why store `github_id` and `number`? (`number` is unique only within a repo; it's what URLs and humans use)
- Why `_gh` timestamps separate from our own? (GitHub's time vs. when we stored it are different facts)

---

## 7. API

```
GET    /api/auth/github            → redirect to GitHub
GET    /api/auth/github/callback   → finish OAuth, create session
POST   /api/auth/logout
GET    /api/me                     → current user (or 401)

GET    /api/repos                  → my tracked repos
POST   /api/repos                  → { url } add a public repo
DELETE /api/repos/:id              → stop tracking (removes the join row only)
POST   /api/repos/:id/sync         → start a sync (202 Accepted, or 409 if running, 429 if cooling down)
GET    /api/repos/:id/sync-status  → status + progress (polled by the UI)

GET    /api/repos/:id/items?type=&state=&label=&assignee=&stale=&page=&limit=
GET    /api/repos/:id/metrics
```

**Conventions**
- Error shape everywhere: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`
- Status codes: `200` OK, `201` created, `202` accepted (sync started in background), `400` bad input, `401` not logged in, `403` not yours, `404` not found, `409` conflict (sync already running), `429` too many requests.
- **Every** `/api/repos/:id/...` route checks the user actually tracks that repo. Never trust an ID from the client. (Without that check, anyone could read other users' repos by changing the ID in the URL, a bug called an IDOR.)

---

## 8. GitHub OAuth: how it works

1. User clicks "Sign in with GitHub" → `GET /api/auth/github`.
2. Server generates a random `state`, saves it in the session, and redirects to `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&state=...`. **No `scope`**, so you get public read access only.
3. User approves on GitHub → GitHub redirects to your callback with `?code=...&state=...`.
4. Server checks `state` matches the session. If not, reject. (This stops attackers from tricking someone into logging in through a flow the attacker started.)
5. Server POSTs `code` + `client_id` + `client_secret` to `https://github.com/login/oauth/access_token` → gets an **access token**.
6. Server calls `GET https://api.github.com/user` with the token → gets the user's GitHub id and login → upserts into `users`.
7. Server stores `userId` and the token **in the session** (server-side), regenerates the session ID, and redirects to the dashboard.
8. The browser only ever holds a session cookie. **The token and client secret never reach the browser.**

**Cookie settings:** `httpOnly: true` (JS can't read it), `secure: true` in production (HTTPS only), `sameSite: 'lax'` (sent on the top-level redirect back from GitHub, not on cross-site sub-requests).

**Why the token matters:** with a token you get about **5,000 GitHub requests/hour**; without one, only 60.

**Gotchas:**
- A GitHub OAuth App has one callback URL. Make **two OAuth apps**: one for localhost, one for production.
- On Render you're behind a proxy, so set `app.set('trust proxy', 1)` or secure cookies won't be set.
- Test the **deployed** login on Day 1, not Day 5.

---

## 9. The sync engine (the heart of the project)

### 9.1 Getting the lock (concurrency)
One atomic statement decides who gets to sync:

```sql
UPDATE repositories
SET sync_status = 'running', sync_started_at = now(), sync_items_done = 0, sync_error = NULL
WHERE id = $1
  AND (sync_status <> 'running' OR sync_started_at < now() - interval '15 minutes')
RETURNING id;
```
- A row comes back → you hold the lock. No row → someone else is syncing → `409 Conflict`.
- It's safe under concurrency because Postgres locks the row during the UPDATE. A second identical UPDATE waits, then sees `running` and matches nothing.
- **Stale-lock expiry:** if the server crashes mid-sync, the status would say `running` forever. The 15-minute clause lets a new sync take over.
- Why not an in-memory flag? It breaks with more than one server process. Why not a Postgres advisory lock? It's tied to one DB connection, which you'd have to hold for the whole sync.

### 9.2 Respond immediately, work in the background
`POST /sync` takes the lock, starts the sync **without awaiting it**, and returns `202 Accepted`. The UI then polls `/sync-status`. Make sure the background function catches every error and marks the sync `failed`. An unhandled error must never leave it stuck as `running`.

### 9.3 Fetching with pagination
- Endpoint: `GET /repos/{owner}/{repo}/issues?state=all&per_page=100&sort=updated&direction=asc`
- Follow the `Link` response header's `rel="next"` URL until there isn't one.
- The `rel="last"` link tells you the total page count → store as `sync_pages_total` → progress = pages done / total.

### 9.4 Issues vs pull requests
GitHub's issues endpoint returns **both**. An item is a PR if it has a `pull_request` field. Store `type` accordingly, otherwise every metric is wrong.

### 9.5 Duplicate-safe upserts (idempotency)
```sql
INSERT INTO github_items (repository_id, number, github_id, type, title, state, ...)
VALUES ($1, $2, ...)
ON CONFLICT (repository_id, number)
DO UPDATE SET title = EXCLUDED.title, state = EXCLUDED.state, ..., updated_at_gh = EXCLUDED.updated_at_gh
WHERE github_items.updated_at_gh < EXCLUDED.updated_at_gh;
```
- Running the same sync twice gives the same result: **idempotent**.
- The `WHERE` clause means older data never overwrites newer data.
- Write each page of 100 in **one transaction**, so a page is all-or-nothing.

### 9.6 Incremental sync
- After a **successful** sync, save `last_sync_cursor` = the time that sync **started** (not finished). Anything updated mid-sync gets picked up next time.
- Next sync adds `&since=<cursor>` → GitHub only returns items updated after it.
- Result: the first import takes minutes; later syncs take seconds.

### 9.7 Respecting GitHub's rate limit
- After every response read `X-RateLimit-Remaining` and `X-RateLimit-Reset`.
- If remaining drops below a safety margin (e.g. 50): stop, mark `failed`, save `retry_after` = reset time, show "Paused by GitHub's rate limit, retry after HH:MM".
- On `403`/`429` responses, respect `Retry-After` if present.
- Pages already written are kept, and the next sync continues incrementally. No automatic pause-and-resume needed.

### 9.8 Other failures to handle
Repo not found / renamed / made private (`404`), network timeout, token revoked (`401` → ask the user to sign in again). Each one ends with a clear `sync_error` message, never a silent "succeeded".

---

## 10. Your own rate limiter

**Two layers:**
1. **Sync cooldown:** a repo can't start a new sync within 2 minutes of the last one → `429` with `Retry-After`. Protects your GitHub quota.
2. **General API limiter:** hand-written Express middleware, **token bucket**, keyed by user ID (IP for logged-out routes).

**Token bucket in one breath:** each user has a bucket holding up to N tokens that refills at R tokens/second; each request takes one token; an empty bucket means `429 Too Many Requests` with a `Retry-After` header. It allows short bursts but caps the average rate.

**Know the alternatives:**
- **Fixed window** (N requests per minute, counter resets each minute): simplest, but allows 2N requests across a window boundary.
- **Sliding window:** smooths that boundary problem; costs more memory or computation.
- **Leaky bucket:** processes requests at a constant rate; smooths output rather than allowing bursts.

**Limits of your version (say this before they ask):** counts live in a JS `Map` in memory. That's correct for one server. With several servers each has its own count, so you'd move to Redis (`INCR` + expiry, or a Lua script for token bucket). Also clean up old entries periodically so the Map doesn't grow forever.

---

## 11. Metrics (each one precisely defined)

| Metric | Definition |
|---|---|
| Open issues | `type = 'issue' AND state = 'open'` (PRs excluded) |
| Open PRs | `type = 'pr' AND state = 'open'` |
| Stale items | Open items with `updated_at_gh` older than 30 days |
| Unassigned open issues | Open issues with no assignee |
| Median time to close | Median of `closed_at_gh - created_at_gh` for issues closed in the last 90 days (`percentile_cont(0.5)`) |
| Opened vs closed per week | Last 12 weeks, `date_trunc('week', ...)`, the chart |
| Data freshness | Time since `last_synced_at`, always shown on screen |

**Why median, not average?** One issue open for two years would distort an average; the median shows the typical case.

**What these metrics are not:** they describe a repository's workflow, not individual developer productivity.

**What history we can and can't show:** trends built from GitHub's own timestamps (`created_at`, `closed_at`, such as opened vs closed per week) are valid. Past *states*, such as how many issues were open on a given date or what labels and assignees they had then, would need stored snapshots. That's out of scope, so never show it.

---

## 12. Deployment

- **One Render web service.** Build: install both folders and run `vite build`. Start: Express serves `/api/*` plus the files in `client/dist`, with a fallback to `index.html` for React routes.
- **Neon Postgres.** Connection string in `DATABASE_URL` (SSL required).
- **Environment variables:** `DATABASE_URL`, `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `NODE_ENV`. Commit a `.env.example` with blank values; the real `.env` goes in `.gitignore`.
- **Render free tier:** sleeps after 15 minutes idle and takes about a minute to wake. Open it before any demo.
- **Migrations:** plain numbered `.sql` files plus a tiny script that runs them in order. Know what a migration is and why you don't edit old ones.

---

## 13. 5-day plan (about 7 hours/day)

| Day | Build | Done when |
|---|---|---|
| **1** | Repo setup, Express, Postgres + first migrations, GitHub OAuth, sessions, **deploy**, then the **thin path**: paste repo URL → fetch first 100 issues → store → plain React list | On the *deployed* site you can log in, add a repo and see real issues |
| **2** | Full sync: pagination, issue vs PR, upserts in per-page transactions, lock, background run + status/progress, GitHub rate-limit handling, incremental `since` | A repo with thousands of items imports fully; re-sync creates zero duplicates and is fast; double-clicking sync gives 409 |
| **3** | Real UI: dashboard, my repos, repo page, filters, server-side pagination, progress via polling; your rate limiter + sync cooldown | You can use the whole app end to end without touching the database |
| **4** | Metrics queries + dashboard cards + 1–2 charts; indexes; `DECISIONS.md` filled in | Every number on screen matches its definition in section 11 |
| **5** | Fix bugs, re-test deployed login and sync, README, **full mock interview** | You can walk through the system and answer section 16 without notes |

**Last 45–60 minutes of every day:** a quiz on that day's work. Gaps get fixed before moving on.

### The lighter version: cut in this order if behind
1. Charts → plain number cards
2. General API rate limiter → keep only the sync cooldown (still a `429` story)
3. Incremental sync → full re-sync every time (upserts keep it correct, just slower)
4. Label/assignee filters → keep type, state and stale only

**Never cut:** OAuth login, pagination + upserts, the sync lock, deployment, and understanding what you built.

---

## 14. How to build it so you can explain it

For every feature:
1. **Plan:** what are we building, which files change, why this approach.
2. **Predict:** before seeing the code, say what you think it should do.
3. **Implement:** small pieces, never a whole feature in one go.
4. **Trace:** walk through one request: browser → route → middleware → SQL → response.
5. **Break it:** remove the lock, delete the `ON CONFLICT`, skip the state check. See what goes wrong.
6. **Explain back** in your own words without reading the explanation.
7. **Change one thing yourself** (a new filter, a new column, a different limit).

**Type these yourself, with guidance (they get grilled most):**
- The OAuth callback handler
- The upsert query
- The lock query
- The rate-limiter middleware

If you can't explain something yet, don't build on top of it.

---

## 15. DECISIONS.md

One entry per real choice. Format:

```
## Sessions instead of JWT
Decision: server-side sessions stored in Postgres.
Alternatives: JWT in a cookie or localStorage.
Why: one web app on one server; instant logout/revocation; the GitHub token must stay server-side anyway.
Trade-off: a DB lookup per request; would revisit for many independent services.
```

**Entries to write:** sessions vs JWT · raw SQL vs ORM · one Render service vs Vercel + Render · Neon vs Render Postgres · join table for repos · atomic UPDATE lock vs advisory lock vs in-memory flag · polling vs SSE · token bucket vs fixed window · in-memory limiter vs Redis · incremental sync cursor = sync start time · median vs average · no `repo` permission.

---

## 16. Interview question bank

**Node & Express**
- What is the event loop, and why is Node good at I/O-heavy work like calling GitHub? *(one thread; waits on I/O without blocking; callbacks/promises resume later)*
- What is middleware? Name the ones you wrote. *(functions in the request pipeline: auth, limiter, error handler)*
- How do errors reach your error handler? *(errors thrown in routes are passed on to the error-handling middleware; Express 5 does this for async handlers too)*
- Why does `/sync` return `202` instead of `200`? *(accepted, work continues in the background)*

**PostgreSQL**
- Walk me through your schema. Why the join table?
- What does `ON CONFLICT DO UPDATE` do? What's the conflict target? Why is it idempotent?
- How does your lock work under two simultaneous requests? What if the server crashes mid-sync?
- What is a transaction? Why per page and not per whole sync? *(a failure loses one page, not all progress; shorter locks)*
- Why these indexes? How did you check they're used? *(`EXPLAIN ANALYZE`)*
- What's a parameterized query and what does it prevent? *(SQL injection)*

**Auth**
- Explain OAuth step by step. What is `state` for? Why exchange the code on the server?
- Authentication vs authorization? Where does each happen in your code?
- Sessions vs JWT: which and why? What do `httpOnly`, `secure` and `sameSite` do?
- How do you stop a user reading another user's repo by changing the ID?

**Integration & sync**
- How does GitHub pagination work? How do you know the total?
- How do you tell issues from PRs?
- What happens when you hit GitHub's rate limit?
- How does incremental sync work, and why is the cursor the sync *start* time?

**Rate limiting**
- What is rate limiting and why? Explain token bucket vs fixed window.
- What do `429` and `Retry-After` mean?
- What breaks if you run two servers? How would Redis fix it?

**React & Vite**
- State vs props? When does a component re-render?
- How does the sync-status polling work, and how do you stop it when the page closes? *(clear the interval in the `useEffect` cleanup)*
- Why does `useEffect` run twice in development? *(StrictMode)*
- What does Vite do, and what does its dev proxy solve? *(fast dev server + production bundler; proxy avoids CORS in dev)*

**System-level**
- Walk me through what happens from clicking "Sync" to seeing the numbers update.
- What would you change to support 10,000 users? *(Redis limiter, a job queue for syncs, webhooks, more servers behind a load balancer)*
- What was the hardest bug? *(keep a running note of real bugs as you build; these are your best answers)*

---

## 17. Resume bullets (keep only what's true when you finish)

**DevPulse: GitHub Repository Health Dashboard** | React, Node.js, Express, PostgreSQL
- Built and deployed a full-stack app that imports a public repository's issues and pull requests via the GitHub REST API and turns them into health metrics (stale work, unassigned issues, median time-to-close).
- Designed an idempotent sync pipeline with paginated fetching, `ON CONFLICT` upserts, incremental `since`-based updates and GitHub rate-limit handling; re-syncs take seconds instead of minutes.
- Prevented concurrent syncs with an atomic PostgreSQL lock with stale-lock expiry, and protected the API with a hand-written token-bucket rate limiter.
- Implemented GitHub OAuth login with server-side sessions, minimal permissions and per-resource authorization checks.

Add real numbers (items imported, sync time before/after incremental) only after you've measured them.

---

## 18. After the deadline (upgrades, in order)
1. SSE for live progress
2. Scheduled background sync (on an always-on host)
3. Redis: shared rate-limit counts + caching dashboard queries
4. GitHub webhooks with signature verification
5. Teams / shared dashboards
6. Full test suite (API + integration) + CI
7. TypeScript migration
