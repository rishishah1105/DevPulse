# BUGS.md

## Batch INSERT fails on empty page

**Symptom:** Sync fails with `syntax error at or near "ON"` on the last page of a repo whose total items are a multiple of 100, or when GitHub returns an empty final page.

**Root cause:** The batch INSERT builds `VALUES ($1,...), ($14,...)` dynamically. An empty `items` array produces `VALUES  ON CONFLICT ...` — no rows between `VALUES` and `ON`, which is invalid SQL.

**Fix:** Added `if (items.length > 0)` guard around the batch INSERT. An empty page is valid — just nothing to insert.

**What I learned:** When building SQL dynamically, always guard against the empty-input case. An empty `VALUES` clause is a syntax error, not just a no-op.

---

## Sync stuck as "running" forever after server restart

**Symptom:** Repos show "Syncing…" in the UI indefinitely after the server is restarted mid-sync. The UI polls `/sync-status` every 3 seconds, gets `running` back, and loops forever because nothing will ever flip it to `succeeded` or `failed`.

**Root cause:** The background sync process was killed when the server restarted. The DB row stayed as `sync_status = 'running'`. The stale-lock expiry (15-minute clause in the lock query) only helps the *next* sync attempt — it doesn't fix the current display.

**Fix:** Added a startup cleanup query in `app.js` that runs once when the server boots: `UPDATE repositories SET sync_status = 'failed' WHERE sync_status = 'running'`. Orphaned syncs immediately show as failed and the user can retry.

**What I learned:** A background process dying silently leaves the DB in an inconsistent state. Always clean up on startup — don't rely on the stale-lock clause alone, which only triggers when someone tries to sync again.

---

## "Failed to load items" persists across filter changes

**Symptom:** If the items fetch fails (e.g. a network error), the error message stays on screen even after the user changes filters and a new successful fetch completes.

**Root cause:** `setError('')` was never called at the start of `loadItems()`. The error state from the previous fetch was never cleared before the new fetch ran.

**Fix:** Added `setError('')` as the first line of `loadItems()` so every new fetch starts with a clean error state.

**What I learned:** When reusing a fetch function across filter changes, always reset derived state (errors, loading flags) at the top of the function — not just when the new result arrives.

---

## Express 5 wildcard route crashes server on startup

**Symptom:** Server exits immediately on Render with `PathError: Missing parameter name at index 1: *`. The React app catch-all route `app.get('*', ...)` causes the crash.

**Root cause:** Express 5 upgraded `path-to-regexp` to v8, which no longer accepts bare `*` as a wildcard. Every wildcard must be a named parameter.

**Fix:** Changed `app.get('*', ...)` to `app.get('/*splat', ...)`. The `splat` name is arbitrary — it just satisfies the requirement that wildcards be named.

**What I learned:** Express 5 breaking changes are subtle. The `*` wildcard worked in Express 4 but silently breaks in v5. Always check the major version changelog when upgrading frameworks, especially for routing.

---

## Null bytes in GitHub data crash the upsert

**Symptom:** Syncing a repo (e.g. vitejs/vite) immediately shows `✗ invalid byte sequence for encoding "UTF8": 0x00` in the UI.

**Root cause:** Some GitHub issues or labels contain null byte characters (`0x00`) in their text fields. PostgreSQL's UTF-8 encoding rejects these — the INSERT throws an error, the transaction rolls back, and `markFailed` is called.

**Fix:** Added a `clean(str)` helper in `sync.js` that strips null bytes with `str.replace(/\0/g, '')`. Applied to all string fields in the upsert params: `title`, `user.login`, `assignee.login`, and each label name.

**What I learned:** External API data can contain characters your database won't accept. Always sanitize at the boundary between external data and your DB — not just for security (SQL injection) but also for encoding safety.
