# CLAUDE.md: DevPulse

@DevPulse.md

## 0. How these two files work together

- **This file** = how to work with me. **DevPulse.md** (imported above, so it loads every session) = what we're building: scope, stack, schema, API, OAuth, sync design, metrics, deployment, the 5-day plan and the interview question bank. **DevPulse.md is the source of truth for product decisions.**
- Before implementing a feature, re-read the matching DevPulse.md section (e.g. section 8 before OAuth, section 9 before sync, section 11 before metrics) and follow it.
- If a request, an idea or an existing piece of code conflicts with DevPulse.md, **say so and ask**. Never silently change scope. When we agree a change, update DevPulse.md (and `DECISIONS.md`) in the same step.

## 1. Why this project exists

I'm a beginner building DevPulse to learn React, Vite, Node, Express and PostgreSQL well enough to **explain and defend every part of it in interviews**. Don't assume I know a term, command, pattern or error message.

**A smaller project I can explain beats a bigger one I can't.** If we fall behind, propose cuts from DevPulse.md section 13 ("the lighter version"), in that order. Never cut anything on its "never cut" list.

## 2. Stack (decided; ask before changing anything here)

- **Plain JavaScript (ES modules) everywhere. No TypeScript.**
- Frontend: React + Vite + React Router; Tailwind CSS + shadcn/ui (JavaScript setup, `tsx: false`); charts via shadcn charts (Recharts underneath); Motion (`motion` package, imported from `motion/react`) for transitions (rules in section 9).
- Backend: Node + Express 5; `pg` with raw, parameterized SQL; express-session + connect-pg-simple; native `fetch` for GitHub.
- Database: PostgreSQL on Neon (separate dev and prod databases).
- Hosting: one Render web service; Express serves `/api/*` and the built `client/dist`.
- Development: Vite `server.proxy` forwards `/api` to Express, so there's no CORS in dev either.
- Tests: Vitest, for pure functions only (Link-header parsing, issue-vs-PR detection, metric calculations).

**Out of scope unless I ask:** TypeScript, Redis, MongoDB, Prisma or any ORM, GitHub webhooks, private repos / the `repo` permission, email-password login, Kokonut UI, CI pipelines, SSE and scheduled sync (stretch only, after core works). Don't suggest these mid-task.

Before adding **any** dependency not listed above: say what it does and why it's needed, then ask.

## 3. How we build each feature

1. **Goal:** what we're building and why, in 2–4 sentences.
2. **Concept:** explain anything new in plain language, with a small example.
3. **Plan:** the files to create or change and what each one does.
4. **Predict:** ask me one question about how I think it should work before showing code. If I say "skip", move on.
5. **Implement:** the smallest coherent piece. Never a whole feature in one go.
6. **Trace:** walk one request through: UI → route → middleware → SQL → response → UI.
7. **Verify:** run it and report exactly what ran and the actual result. Never claim something works or passes without running it. If you can't run it, say why and give me the exact command.
8. **Break it:** suggest one deliberate break (remove the lock, drop `ON CONFLICT`, skip the state check) and what I should observe.
9. **Interview:** 2–4 likely questions. Let me answer first, then correct or complete my answer.
10. **Git checkpoint:** if this is a natural commit point (section 8).

Skip this flow for trivial questions and one-line fixes. If I ask to learn or discuss something, **don't edit files** unless I ask you to implement.

## 4. Code I type myself

**Do not write these four for me:**
1. The OAuth callback handler
2. The items upsert query (`INSERT ... ON CONFLICT DO UPDATE`)
3. The sync lock query
4. The rate-limiter middleware

For these: explain the concept, give me the structure and steps, give hints when I'm stuck, and review what I write. When there's a bug, ask a leading question before pointing at it. Show a full solution **only** if I explicitly say "show me the solution".

## 5. Learning records (keep these updated)

- **`DECISIONS.md`:** whenever a real choice is made, append an entry: Decision / Alternatives / Why / Trade-off. The expected entries are listed in DevPulse.md section 15.
- **`BUGS.md`:** every non-trivial bug, once fixed: symptom, root cause, fix, what I learned. Add it without me asking, and tell me you did.
- **End of day:** when I say "end of day", before anything else:
  1. Quiz me with 5–8 questions on today's work, **one at a time**, waiting for my answer each time.
  2. List my weak spots.
  3. Summarize what's done against the DevPulse.md section 13 plan and what tomorrow starts with.

## 6. Correctness rules

- Parameterized SQL only; never build SQL strings from input.
- Every `/api/repos/:id/...` route checks the logged-in user tracks that repo. Never trust IDs from the client.
- **Sync follows DevPulse.md section 9 exactly:** pagination via the `Link` header; issue vs PR via the `pull_request` field; upserts on `(repository_id, number)`; the atomic lock with stale-lock expiry; `202` plus a background run that **always** ends as `succeeded` or `failed`; rate-limit headers → stop cleanly and save `retry_after` (**no automatic retry loops**); incremental `since` cursor = the sync's **start** time.
- **Metrics** use the definitions in DevPulse.md section 11 exactly. Always show data freshness. Distinguish **zero** from **not synced / unavailable**.
- **History:** trends derived from GitHub's own timestamps (`created_at`, `closed_at`, e.g. opened vs closed per week) are valid. **Past states** (e.g. how many issues were open on a given date, with which labels or assignees) would need stored snapshots. That's out of scope, so never fake it.
- No fake or hard-coded metrics. Any sample data used during development is clearly labelled.

## 7. Security

- Secrets (GitHub client secret, access tokens, `DATABASE_URL`, `SESSION_SECRET`) never appear in frontend code, logs, error responses, commits or screenshots. **The GitHub token lives only in the server-side session.**
- `.env` is git-ignored; `.env.example` has blank values only.
- Sessions: cookie `httpOnly`, `secure` in production, `sameSite: 'lax'`; `app.set('trust proxy', 1)` on Render; regenerate the session on login; validate OAuth `state`.
- Request **no** GitHub permissions (no `scope`).
- Never ask me to paste a token or password into chat. If credentials are needed, tell me where to put them.

## 8. Git

- Commit at coherent, **working** milestones: scaffold runs, an endpoint works, a migration plus the code that uses it, OAuth works, a sync milestone, a verified bug fix, finished docs. No artificial, empty or knowingly broken commits; no daily quota.
- Before a commit: run `git status`, review the diff, summarize what changed, propose a conventional message (`feat:`, `fix:`, `docs:`, `chore:`), and **ask me**.
- **Ask before pushing.** Never force-push, amend or rewrite history, change remotes or change repo visibility without my explicit permission.
- Never commit `.env`, `node_modules`, `dist`, credentials or local data. Check `.gitignore` first.
- Don't say code is on GitHub until the push has succeeded.

## 9. UI

- **Visual design lives in `STYLING.md`** (plus the reference image in the repo). Read it before any UI work and follow it; it takes priority over the general look described below.
- A clean developer-tool look: readable tables, clear hierarchy, restrained colour, no decorative clutter.
- Every data view has **loading, empty and error** states.
- Works at common desktop and mobile widths; keyboard accessible.
- Add shadcn components when a task needs them, not all at once.
- Charts only where they make a defined metric clearer, with labels and honest empty states.
- **Functionality before polish:** no visual polish until the day's core feature works.

### Motion (smooth transitions)
- Use it where movement explains a change: page/route transitions, dialogs and dropdowns opening, filter results updating, a sync status changing state, the progress bar filling, toasts appearing.
- Keep it subtle and fast (roughly 150–300 ms). Never delay content from appearing, and never animate every card, table row or number on every render.
- Prefer plain CSS/Tailwind transitions for simple hover and focus effects; use Motion for enter/exit (`AnimatePresence`), layout changes (`layout`) and shared transitions.
- Respect reduced-motion preferences: wrap the app in `<MotionConfig reducedMotion="user">`.
- Add Motion when a screen's functionality is done, not before. When you add an animation, explain in one or two lines what it does and why it helps.

## 10. Honesty

- If the plan is slipping, say so early, with a concrete cut proposal from section 13.
- If you're unsure how a GitHub API or library behaves, check the docs or test it. Don't guess.
- When debugging, explain the root cause and why the fix works.
- Never call the project production-ready.

## 11. MVP done checklist

- [ ] GitHub sign-in works on the **deployed** site; failures are handled safely
- [ ] A public repo with thousands of items imports fully
- [ ] Re-sync creates zero duplicates and is fast (incremental)
- [ ] Double-clicking sync returns `409`; a crashed sync doesn't stay locked
- [ ] Rate limits stop the sync cleanly with a retry time
- [ ] Own API returns `429` with `Retry-After` when limits are hit
- [ ] Users can't access repos they don't track
- [ ] Metrics match their section 11 definitions; freshness is shown
- [ ] Loading, empty and error states everywhere
- [ ] No secrets in git or in the frontend bundle
- [ ] Unit tests for pure functions pass (actually run)
- [ ] README, `DECISIONS.md` and `BUGS.md` are complete; known limitations documented
- [ ] I can answer the DevPulse.md section 16 questions without notes
