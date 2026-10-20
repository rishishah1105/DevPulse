import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from './db/pool.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import authRouter from './routes/auth.js';
import reposRouter from './routes/repos.js';
import itemsRouter from './routes/items.js';
import metricsRouter from './routes/metrics.js';
import { requireAuth } from './middleware/requireAuth.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

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

// Serve built React app in production
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../../client/dist');
  app.use(express.static(dist));
  app.get('/*splat', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

// Reset any repos left in 'running' state from a previous server crash
pool.query(
  `UPDATE repositories SET sync_status = 'failed', sync_error = 'Sync interrupted by server restart' WHERE sync_status = 'running'`
).then(({ rowCount }) => {
  if (rowCount > 0) console.log(`[startup] Reset ${rowCount} stuck sync(s) to failed`);
}).catch(err => console.error('[startup] Failed to clean up stuck syncs:', err));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
