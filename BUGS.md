# BUGS.md

## Batch INSERT fails on empty page

**Symptom:** Sync fails with `syntax error at or near "ON"` on the last page of a repo whose total items are a multiple of 100, or when GitHub returns an empty final page.

**Root cause:** The batch INSERT builds `VALUES ($1,...), ($14,...)` dynamically. An empty `items` array produces `VALUES  ON CONFLICT ...` — no rows between `VALUES` and `ON`, which is invalid SQL.

**Fix:** Added `if (items.length > 0)` guard around the batch INSERT. An empty page is valid — just nothing to insert.

**What I learned:** When building SQL dynamically, always guard against the empty-input case. An empty `VALUES` clause is a syntax error, not just a no-op.

---

## Null bytes in GitHub data crash the upsert

**Symptom:** Syncing a repo (e.g. vitejs/vite) immediately shows `✗ invalid byte sequence for encoding "UTF8": 0x00` in the UI.

**Root cause:** Some GitHub issues or labels contain null byte characters (`0x00`) in their text fields. PostgreSQL's UTF-8 encoding rejects these — the INSERT throws an error, the transaction rolls back, and `markFailed` is called.

**Fix:** Added a `clean(str)` helper in `sync.js` that strips null bytes with `str.replace(/\0/g, '')`. Applied to all string fields in the upsert params: `title`, `user.login`, `assignee.login`, and each label name.

**What I learned:** External API data can contain characters your database won't accept. Always sanitize at the boundary between external data and your DB — not just for security (SQL injection) but also for encoding safety.
