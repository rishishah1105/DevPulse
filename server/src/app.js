import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from './db/pool.js';
import authRouter from './routes/auth.js';
import reposRouter from './routes/repos.js';
import itemsRouter from './routes/items.js';
import metricsRouter from './routes/metrics.js';
import { requireAuth } from './middleware/requireAuth.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const app = express();
app.set('trust proxy', 1);
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

app.use('/api/auth', authRouter);
app.use('/api/repos', rateLimiter, reposRouter);
app.use('/api/repos/:id/items', rateLimiter, itemsRouter);
app.use('/api/repos/:id/metrics', rateLimiter, metricsRouter);

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, login: req.session.login });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
