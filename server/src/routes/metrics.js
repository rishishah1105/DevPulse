import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { userOwnsRepo } from '../middleware/userOwnsRepo.js';

const router = Router({ mergeParams: true });

// GET /api/repos/:id/metrics
router.get('/', requireAuth, async (req, res) => {
  const repoId = parseInt(req.params.id, 10);

  if (!(await userOwnsRepo(req.session.userId, repoId))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'repo not found' } });
  }

  const [countsResult, medianResult, repoResult, openedResult, closedResult] = await Promise.all([
    // All counts in one query using FILTER — one DB round-trip
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE type = 'issue' AND state = 'open')                                      AS open_issues,
        COUNT(*) FILTER (WHERE type = 'pr'    AND state = 'open')                                      AS open_prs,
        COUNT(*) FILTER (WHERE state = 'open' AND updated_at_gh < now() - interval '30 days')          AS stale_items,
        COUNT(*) FILTER (WHERE type = 'issue' AND state = 'open' AND assignee_login IS NULL)           AS unassigned_open_issues
       FROM github_items
       WHERE repository_id = $1`,
      [repoId]
    ),

    // Median time to close — only issues closed in the last 90 days
    pool.query(
      `SELECT EXTRACT(epoch FROM
          percentile_cont(0.5) WITHIN GROUP (ORDER BY closed_at_gh - created_at_gh)
        ) / 86400 AS median_days
       FROM github_items
       WHERE repository_id = $1
         AND type = 'issue'
         AND state = 'closed'
         AND closed_at_gh > now() - interval '90 days'`,
      [repoId]
    ),

    // last_synced_at for freshness
    pool.query(
      'SELECT last_synced_at, sync_status FROM repositories WHERE id = $1',
      [repoId]
    ),

    // Issues opened per week for last 12 weeks
    pool.query(
      `SELECT date_trunc('week', created_at_gh) AS week, COUNT(*)::int AS count
       FROM github_items
       WHERE repository_id = $1
         AND type = 'issue'
         AND created_at_gh > now() - interval '12 weeks'
       GROUP BY week
       ORDER BY week`,
      [repoId]
    ),

    // Issues closed per week for last 12 weeks
    pool.query(
      `SELECT date_trunc('week', closed_at_gh) AS week, COUNT(*)::int AS count
       FROM github_items
       WHERE repository_id = $1
         AND type = 'issue'
         AND state = 'closed'
         AND closed_at_gh > now() - interval '12 weeks'
       GROUP BY week
       ORDER BY week`,
      [repoId]
    ),
  ]);

  const counts = countsResult.rows[0];
  const medianDays = medianResult.rows[0]?.median_days;
  const { last_synced_at, sync_status } = repoResult.rows[0];

  // Merge opened and closed rows by week into one array
  const weekMap = new Map();
  for (const row of openedResult.rows) {
    const key = row.week.toISOString();
    weekMap.set(key, { week: key, opened: row.count, closed: 0 });
  }
  for (const row of closedResult.rows) {
    const key = row.week.toISOString();
    const existing = weekMap.get(key);
    if (existing) existing.closed = row.count;
    else weekMap.set(key, { week: key, opened: 0, closed: row.count });
  }
  const weekly_activity = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));

  res.json({
    open_issues:            parseInt(counts.open_issues, 10),
    open_prs:               parseInt(counts.open_prs, 10),
    stale_items:            parseInt(counts.stale_items, 10),
    unassigned_open_issues: parseInt(counts.unassigned_open_issues, 10),
    median_time_to_close_days: medianDays != null ? parseFloat(parseFloat(medianDays).toFixed(1)) : null,
    last_synced_at,
    sync_status,
    weekly_activity,
  });
});

export default router;
