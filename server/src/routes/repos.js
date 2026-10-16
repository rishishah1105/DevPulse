import { Router } from 'express';
import pool from '../db/pool.js';
import { fetchIssues } from '../services/github.js';

const router = Router();

// GET /api/repos — list my tracked repos
router.get('/', async (req, res) => {
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
router.post('/', async (req, res) => {
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

export default router;
