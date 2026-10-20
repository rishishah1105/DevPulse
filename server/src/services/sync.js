import pool from '../db/pool.js';
import { parseLinkHeader, extractPageNumber } from './linkHeader.js';
import { syncEmitter } from './syncEmitter.js';

const RATE_LIMIT_SAFETY = 50; // stop syncing if fewer than this many requests remain

// Postgres UTF-8 rejects null bytes (0x00) that occasionally appear in GitHub data
function clean(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\0/g, '');
}

export async function startSync(repoId, accessToken) {
  // --- 1. Acquire the lock -------------------------------------------------
  const lockResult = await pool.query(
    `UPDATE repositories
     SET sync_status = 'running',
         sync_started_at = now(),
         sync_items_done = 0,
         sync_error = NULL
     WHERE id = $1
       AND (sync_status <> 'running' OR sync_started_at < now() - interval '15 minutes')
     RETURNING id`,
    [repoId]
  );
  if (!lockResult.rows[0]) return;

  // Insert a sync_runs row so we have a history entry for this run
  const runResult = await pool.query(
    `INSERT INTO sync_runs (repository_id, status) VALUES ($1, 'running') RETURNING id`,
    [repoId]
  );
  const runId = runResult.rows[0].id;

  // Record the cursor now, before we fetch anything (see DevPulse.md §9.6)
  const syncStartedAt = new Date();
  let totalItemsSynced = 0;

  try {
    // --- 2. Load repo info from DB -----------------------------------------
    const repoRes = await pool.query(
      'SELECT last_sync_cursor, owner, name FROM repositories WHERE id = $1',
      [repoId]
    );
    const { last_sync_cursor, owner, name } = repoRes.rows[0];

    // --- 3. Build the first page URL (full or incremental) -----------------
    let url =
      `https://api.github.com/repos/${owner}/${name}/issues` +
      `?state=all&per_page=100&sort=updated&direction=asc` +
      (last_sync_cursor ? `&since=${last_sync_cursor.toISOString()}` : '');

    let pagesDone = 0;
    let pagesTotal = null;

    // --- 4. Paginate until there is no next page ---------------------------
    while (url) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'devpulse',
        },
      });

      // --- 4a. Handle non-OK HTTP responses --------------------------------
      if (!res.ok) {
        const retryAfter = res.headers.get('Retry-After');
        if (res.status === 403 || res.status === 429) {
          const retryTime = retryAfter
            ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000)
            : null;
          await markFailed(repoId, runId, 'Rate limited by GitHub', retryTime);
          return;
        }
        if (res.status === 404) {
          await markFailed(repoId, runId, 'Repository not found or made private');
          return;
        }
        await markFailed(repoId, runId, `GitHub API error: ${res.status}`);
        return;
      }

      // --- 4b. Check rate limit headers ------------------------------------
      const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') ?? '999', 10);
      const resetAt   = parseInt(res.headers.get('X-RateLimit-Reset') ?? '0', 10);

      if (remaining < RATE_LIMIT_SAFETY) {
        await markFailed(
          repoId, runId,
          'Paused: GitHub rate limit low — retry after reset',
          new Date(resetAt * 1000)
        );
        return;
      }

      // --- 4c. Parse Link header to get next URL and total pages -----------
      const links = parseLinkHeader(res.headers.get('Link'));
      if (pagesTotal === null && links.last) {
        pagesTotal = extractPageNumber(links.last);
        await pool.query(
          'UPDATE repositories SET sync_pages_total = $1 WHERE id = $2',
          [pagesTotal, repoId]
        );
      }

      // --- 4d. Upsert this page's items in one transaction -----------------
      const items = await res.json();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Build one INSERT for all items on this page (100 DB round-trips → 1)
        const COLS = 13;
        const valuePlaceholders = items.map((_, i) => {
          const o = i * COLS;
          return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12},$${o+13})`;
        }).join(',');

        const params = items.flatMap(item => [
          repoId, item.number, item.id,
          item.pull_request ? 'pr' : 'issue',
          clean(item.title), item.state,
          clean(item.user?.login), clean(item.assignee?.login),
          item.labels.map(l => clean(l.name)),
          item.html_url,
          item.created_at, item.updated_at, item.closed_at,
        ]);

        if (items.length > 0) await client.query(
          `INSERT INTO github_items
             (repository_id, number, github_id, type, title, state,
              author_login, assignee_login, labels, html_url,
              created_at_gh, updated_at_gh, closed_at_gh)
           VALUES ${valuePlaceholders}
           ON CONFLICT (repository_id, number) DO UPDATE SET
             title = EXCLUDED.title,
             state = EXCLUDED.state,
             assignee_login = EXCLUDED.assignee_login,
             labels = EXCLUDED.labels,
             html_url = EXCLUDED.html_url,
             updated_at_gh = EXCLUDED.updated_at_gh,
             closed_at_gh = EXCLUDED.closed_at_gh
           WHERE github_items.updated_at_gh < EXCLUDED.updated_at_gh`,
          params
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // --- 4e. Update progress counter -------------------------------------
      pagesDone++;
      totalItemsSynced += items.length;
      await pool.query(
        'UPDATE repositories SET sync_items_done = sync_items_done + $1 WHERE id = $2',
        [items.length, repoId]
      );
      syncEmitter.emit(`sync:${repoId}`, {
        sync_status: 'running',
        sync_items_done: totalItemsSynced,
        sync_pages_total: pagesTotal,
      });

      // Advance to the next page, or exit loop
      url = links.next ?? null;
    }

    // --- 5. Sync complete — save cursor, mark succeeded, log run ----------
    await Promise.all([
      pool.query(
        `UPDATE repositories
         SET sync_status = 'succeeded',
             last_synced_at = now(),
             last_sync_cursor = $1,
             sync_error = NULL,
             retry_after = NULL
         WHERE id = $2`,
        [syncStartedAt.toISOString(), repoId]
      ),
      pool.query(
        `UPDATE sync_runs SET status = 'succeeded', finished_at = now(), items_synced = $1 WHERE id = $2`,
        [totalItemsSynced, runId]
      ),
    ]);
    syncEmitter.emit(`sync:${repoId}`, { sync_status: 'succeeded', sync_items_done: totalItemsSynced });
  } catch (err) {
    await markFailed(repoId, runId, err.message);
  }
}

async function markFailed(repoId, runId, message, retryAfter = null) {
  await Promise.all([
    pool.query(
      `UPDATE repositories
       SET sync_status = 'failed',
           sync_error = $1,
           retry_after = $2
       WHERE id = $3`,
      [message, retryAfter, repoId]
    ),
    pool.query(
      `UPDATE sync_runs SET status = 'failed', finished_at = now(), error = $1 WHERE id = $2`,
      [message, runId]
    ),
  ]);
  syncEmitter.emit(`sync:${repoId}`, { sync_status: 'failed', sync_error: message });
}
