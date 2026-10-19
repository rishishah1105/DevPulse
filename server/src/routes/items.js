import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';

async function userOwnsRepo(userId, repoId) {
  const result = await pool.query(
    'SELECT 1 FROM user_repositories WHERE user_id = $1 AND repository_id = $2',
    [userId, repoId]
  );
  return result.rows.length > 0;
}

const router = Router({ mergeParams: true });

// GET /api/repos/:id/items
router.get('/', requireAuth, async (req, res) => {
  const repoId = parseInt(req.params.id, 10);

  if (!(await userOwnsRepo(req.session.userId, repoId))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'repo not found' } });
  }

  const { type, state, assignee, stale, page = '1', limit = '25' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  // Build WHERE conditions dynamically — values always go in params, never in the string
  const conditions = ['repository_id = $1'];
  const params = [repoId];

  if (type === 'issue' || type === 'pr') {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }

  if (state === 'open' || state === 'closed') {
    params.push(state);
    conditions.push(`state = $${params.length}`);
  }

  if (assignee) {
    params.push(assignee);
    conditions.push(`assignee_login = $${params.length}`);
  }

  if (stale === 'true') {
    conditions.push(`(state = 'open' AND updated_at_gh < now() - interval '30 days')`);
  }

  const where = conditions.join(' AND ');

  // Run both queries in parallel: the page of rows and the total count
  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM github_items WHERE ${where}
       ORDER BY updated_at_gh DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM github_items WHERE ${where}`,
      params
    ),
  ]);

  res.json({ items: itemsResult.rows, total: countResult.rows[0].total });
});

export default router;
