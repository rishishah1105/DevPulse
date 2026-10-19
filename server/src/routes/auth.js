import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Step 1: redirect to GitHub
router.get('/github', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: GitHub redirects back here — YOU will write this
router.get('/github/callback', async (req, res) => {
  const {code, state} = req.query;

  if(state !== req.session.oauthState){
    return res.status(400).json({ error: 'invalid state'});
  }
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'devpulse',
    },
  });

  const githubUser = await userRes.json();

  const result = await pool.query(
    `INSERT INTO users (github_user_id, login, avatar_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_user_id)
     DO UPDATE SET login = EXCLUDED.login, avatar_url = EXCLUDED.avatar_url
     RETURNING id`,
    [githubUser.id, githubUser.login, githubUser.avatar_url]
  );

  const userId = result.rows[0].id;

  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  req.session.userId = userId;
  req.session.login = githubUser.login;
  req.session.accessToken = accessToken;

  res.redirect('/repos');
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
