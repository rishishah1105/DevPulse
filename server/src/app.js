import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from './db/pool.js';

const app = express();
const PORT = process.env.PORT || 3001;

const PgSession = connectPgSimple(session);

app.use(express.json());

app.use(session({
  store: new PgSession({ pool }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

import authRouter from './routes/auth.js';

app.use('/api/auth', authRouter);

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  res.json({ userId: req.session.userId, login: req.session.login });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
