import { Router } from 'express';
import pool from '../db/pool.js';
import { fetchIssues } from '../services/github.js';
import { startSync } from '../services/sync.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { userOwnsRepo } from '../middleware/userOwnsRepo.js';

const router = Router();

// GET /api/repos — list my tracked repos
router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT r.* FROM repositories r
     JOIN user_repositories ur ON ur.repository_id = r.id
     WHERE ur.user_id = $1
     ORDER BY ur.added_at DESC`,
    [req.session.userId]
  );
  res.json(result.rows);
});

// POST /api/repos — add a repo by URL
router.post('/', requireAuth, async (req, res) => {
  const { url } = req.body;

  // parse owner/repo from URL
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return res.status(400).json({ error: 'invalid GitHub URL' });
  const [, owner, repo] = match;

  // verify repo exists on GitHub and get its metadata
  const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `Bearer ${req.session.accessToken}`,
      'User-Agent': 'devpulse',
    },
  });
  if (!ghRes.ok) return res.status(404).json({ error: 'repo not found on GitHub' });
  const ghRepo = await ghRes.json();

  // upsert into repositories
  const repoResult = await pool.query(
    `INSERT INTO repositories (github_repo_id, owner, name, full_name, html_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (github_repo_id) DO UPDATE
     SET full_name = EXCLUDED.full_name
     RETURNING *`,
    [ghRepo.id, owner, repo, ghRepo.full_name, ghRepo.html_url]
  );
  const savedRepo = repoResult.rows[0];

  // link repo to this user (ignore if already tracking)
  await pool.query(
    `INSERT INTO user_repositories (user_id, repository_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.session.userId, savedRepo.id]
  );

  // fetch first 100 issues and store them
  const items = await fetchIssues(owner, repo, req.session.accessToken);

  for (const item of items) {
    await pool.query(
      `INSERT INTO github_items
         (repository_id, number, github_id, type, title, state,
          author_login, assignee_login, labels, html_url,
          created_at_gh, updated_at_gh, closed_at_gh)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (repository_id, number) DO UPDATE
       SET title = EXCLUDED.title, state = EXCLUDED.state,
           updated_at_gh = EXCLUDED.updated_at_gh`,
      [
        savedRepo.id, item.number, item.id,
        item.pull_request ? 'pr' : 'issue',
        item.title, item.state,
        item.user?.login, item.assignee?.login,
        item.labels.map(l => l.name),
        item.html_url,
        item.created_at, item.updated_at, item.closed_at,
      ]
    );
  }

  res.status(201).json(savedRepo);
});

// DELETE /api/repos/:id — stop tracking (removes join row only, keeps repo data)
router.delete('/:id', requireAuth, async (req, res) => {
  const repoId = parseInt(req.params.id, 10);
  if (!(await userOwnsRepo(req.session.userId, repoId))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'repo not found' } });
  }
  await pool.query(
    'DELETE FROM user_repositories WHERE user_id = $1 AND repository_id = $2',
    [req.session.userId, repoId]
  );
  res.status(204).end();
});

// GET /api/repos/github-discover — user's own public GitHub repos (for discovery tab)
router.get('/github-discover', requireAuth, async (req, res) => {
  const ghRes = await fetch('https://api.github.com/user/repos?type=owner&sort=updated&per_page=30', {
    headers: {
      Authorization: `Bearer ${req.session.accessToken}`,
      'User-Agent': 'devpulse',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!ghRes.ok) {
    return res.status(502).json({ error: { code: 'GITHUB_ERROR', message: 'Failed to fetch repos from GitHub' } });
  }
  const ghRepos = await ghRes.json();

  // Which ones does this user already track in DevPulse?
  const { rows } = await pool.query(
    `SELECT r.github_repo_id, r.id AS devpulse_id
     FROM repositories r
     JOIN user_repositories ur ON ur.repository_id = r.id
     WHERE ur.user_id = $1`,
    [req.session.userId]
  );
  const trackedMap = new Map(rows.map(r => [r.github_repo_id, r.devpulse_id]));

  const result = ghRepos
    .filter(r => !r.private)
    .map(r => ({
      github_repo_id: r.id,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      open_issues_count: r.open_issues_count,
      tracked: trackedMap.has(r.id),
      devpulse_id: trackedMap.get(r.id) ?? null,
    }));

  res.json(result);
});

// POST /api/repos/:id/sync — start a sync (202), or 409 if already running, 429 if cooling down
router.post('/:id/sync', requireAuth, async (req, res) => {
  const repoId = parseInt(req.params.id, 10);

  if (!(await userOwnsRepo(req.session.userId, repoId))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'repo not found' } });
  }

  const { rows } = await pool.query(
    'SELECT sync_status, last_synced_at FROM repositories WHERE id = $1',
    [repoId]
  );
  const repo = rows[0];

  if (repo.sync_status === 'running') {
    return res.status(409).json({ error: { code: 'SYNC_RUNNING', message: 'sync already running' } });
  }

  // 2-minute cooldown between syncs
  if (repo.last_synced_at) {
    const secondsSinceLast = (Date.now() - new Date(repo.last_synced_at).getTime()) / 1000;
    if (secondsSinceLast < 120) {
      const retryAfter = Math.ceil(120 - secondsSinceLast);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: { code: 'COOLDOWN', message: `Wait ${retryAfter}s before syncing again` } });
    }
  }

  // Fire and forget — do NOT await
  startSync(repoId, req.session.accessToken);
  res.status(202).json({ message: 'sync started' });
});

// GET /api/repos/:id/sync-status — polled by the UI to show progress
router.get('/:id/sync-status', requireAuth, async (req, res) => {
  const repoId = parseInt(req.params.id, 10);

  if (!(await userOwnsRepo(req.session.userId, repoId))) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'repo not found' } });
  }

  const { rows } = await pool.query(
    `SELECT sync_status, sync_started_at, last_synced_at,
            sync_items_done, sync_pages_total, sync_error, retry_after
     FROM repositories WHERE id = $1`,
    [repoId]
  );
  res.json(rows[0]);
});

export default router;
