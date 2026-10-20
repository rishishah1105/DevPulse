import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ReposPage from './pages/ReposPage.jsx';
import RepoPage from './pages/RepoPage.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground">
        <nav className="border-b border-border h-14 px-8 flex items-center justify-between shrink-0">
          <Link to="/repos" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm leading-none">D</span>
            </div>
            <span className="font-semibold text-foreground tracking-tight">DevPulse</span>
          </Link>

          {user && (
            <div className="flex items-center gap-3">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="w-7 h-7 rounded-full border border-border"
                />
              )}
              <span className="text-sm text-muted-foreground font-medium">{user.login}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border hover:border-border-strong transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </nav>

        <main className="px-8 py-8 max-w-6xl mx-auto">
          <Routes>
            <Route
              path="/"
              element={
                user === undefined ? null :
                user ? <Navigate to="/repos" replace /> :
                <LoginPage />
              }
            />
            <Route
              path="/repos"
              element={
                <ProtectedRoute user={user}>
                  <ReposPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/repos/:id"
              element={
                <ProtectedRoute user={user}>
                  <RepoPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </MotionConfig>
  );
}

function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="bg-card border border-border rounded-[20px] p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl leading-none">D</span>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">DevPulse</h1>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            See what's stuck in any public GitHub repository.
          </p>
        </div>

        <a
          href="/api/auth/github"
          className="w-full flex items-center justify-center gap-2.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <GitHubMark />
          Sign in with GitHub
        </a>

        <p className="text-xs text-subtle-foreground text-center leading-relaxed">
          DevPulse only reads public data and never asks for access to private repositories.
        </p>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
