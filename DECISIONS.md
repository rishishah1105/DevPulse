# DECISIONS.md

## Sessions vs JWT
**Decision:** server-side sessions stored in Postgres.
**Alternatives:** JWT in a cookie or localStorage.
**Why:** the GitHub access token must stay server-side — sessions store everything in Postgres, nothing sensitive reaches the browser. One server means the DB lookup per request is not a concern. Instant logout by deleting the session row — a JWT would remain valid until expiry with no way to revoke it.
**Trade-off:** a DB lookup on every request; would revisit for many independent services where stateless auth matters.

## Raw SQL vs ORM
**Decision:** raw, parameterized SQL with the `pg` driver.
**Alternatives:** Prisma or another ORM.
**Why:** this is a learning project — the goal is to understand and explain every query in an interview. Complex queries like `INSERT ... ON CONFLICT DO UPDATE`, the atomic lock with `RETURNING`, and `percentile_cont` are hard or impossible to express through an ORM's API; you end up writing raw SQL anyway for those parts.
**Trade-off:** an ORM reduces boilerplate for simple CRUD at scale; raw SQL is the right call here.

## One Render service vs Vercel + Render
**Decision:** one Render web service — Express serves both `/api/*` and the built React app.
**Alternatives:** React on Vercel, Express on Render (separate origins).
**Why:** same-origin deployment means cookies work without CORS configuration and sessions just work. Two separate deployments would require `SameSite=None; Secure`, CORS headers, and a more complex OAuth callback setup.
**Trade-off:** a larger app with a separate frontend team might justify the split; for one developer on one app, one service is simpler and has fewer failure points.

## Neon vs Render Postgres
**Decision:** Neon for hosted Postgres.
**Alternatives:** Render's built-in Postgres addon.
**Why:** Render's free Postgres tier deletes the database after 90 days — not viable for a project that needs to persist data beyond that. Neon's free tier has no expiry.
**Trade-off:** two separate services to manage; Neon requires SSL (`rejectUnauthorized: false` in the pool config).

## Join table for repos
**Decision:** `user_repositories` join table linking users to repositories.
**Alternatives:** a `user_id` column directly on the `repositories` table.
**Why:** one user can track many repos; one repo can be tracked by many users — a many-to-many relationship. A public repo is imported once into `repositories` and `github_items` regardless of how many users track it — no duplicate data, no duplicate syncs.
**Trade-off:** every ownership check needs a JOIN; worth it to avoid storing the same 10,000 issues multiple times.

## Atomic UPDATE lock vs advisory lock vs in-memory flag
**Decision:** atomic `UPDATE ... WHERE sync_status <> 'running' RETURNING id`.
**Alternatives:** in-memory flag; Postgres advisory lock.
**Why:** in-memory flag breaks with more than one server process — each has its own memory. Postgres advisory lock requires holding the same DB connection open for the entire sync. The atomic UPDATE locks the row during the query — the first request gets the row back and proceeds, the second gets nothing and returns 409. Works across any number of server processes. The 15-minute stale-lock clause means a crashed server never leaves the sync stuck as `running` forever.
**Trade-off:** slightly more complex query; clearly worth it for correctness.

## Polling vs SSE
**Decision:** UI polls `/sync-status` every 3 seconds with `setInterval`.
**Alternatives:** Server-Sent Events (SSE) — server pushes updates to the browser.
**Why:** polling is a simple regular HTTP request — easy to understand, debug and explain. SSE requires a persistent connection per user, reconnection logic, and more complex server handling. The 3-second interval is fast enough for a progress bar. SSE is listed as a stretch goal for after core works.
**Trade-off:** polling makes unnecessary requests when nothing has changed; SSE would be more efficient at scale.

## Token bucket vs fixed window
**Decision:** token bucket rate limiter keyed by user ID.
**Alternatives:** fixed window; sliding window; leaky bucket.
**Why:** fixed window allows 2N requests across a window boundary (N at 11:59, N at 12:00). Token bucket refills at a steady rate and caps at a maximum — allows short bursts (opening several pages quickly) but caps the sustained rate.
**Trade-off:** slightly more complex to implement than a fixed window counter.

## In-memory limiter vs Redis
**Decision:** token bucket stored in a JS `Map` in memory.
**Alternatives:** Redis with `INCR` + expiry or a Lua script.
**Why:** one server process means the in-memory Map is shared across all requests — counts are correct. Redis is only needed when running multiple instances behind a load balancer, where each instance would have its own Map and a user could bypass the limit by hitting different instances.
**Trade-off:** the Map grows forever if old entries aren't cleaned up; Redis handles expiry automatically. Would add Redis before scaling to multiple instances.

## Incremental sync cursor = sync start time
**Decision:** save `last_sync_cursor` as the time the sync **started**, not finished.
**Alternatives:** save the finish time; save the timestamp of the last item fetched.
**Why:** if we saved the finish time, any issue updated *during* the sync (between start and finish) would fall in the gap — updated after the cursor we saved, but already missed by the sync that just ran. Using the start time means the next sync re-fetches anything that changed during the previous sync — a small overlap, but zero gaps.
**Trade-off:** a few items get re-fetched and re-upserted on every incremental sync; the upsert's `WHERE updated_at_gh < EXCLUDED.updated_at_gh` clause makes this safe and idempotent.

## Median vs average for time-to-close
**Decision:** `percentile_cont(0.5)` (median) for time-to-close metric.
**Alternatives:** arithmetic mean (average).
**Why:** one issue open for 5 years with 99 issues closing in 2 days gives an average of ~20 days — no issue actually took 20 days. The median is 2 days — the value that half the issues beat, half don't. That's the typical experience and a more honest number for skewed data.
**Trade-off:** median is harder to explain to non-technical stakeholders than average, but it's more accurate for this use case.
