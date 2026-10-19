import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ReposPage from './pages/ReposPage.jsx';
import RepoPage from './pages/RepoPage.jsx';

export default function App() {
  // undefined = loading, null = not logged in, object = logged in
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
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
          <Link to="/repos" className="font-semibold text-white">DevPulse</Link>
          {user && (
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>{user.login}</span>
              <button onClick={handleLogout} className="hover:text-white transition-colors">
                Sign out
              </button>
            </div>
          )}
        </nav>

        <main className="px-6 py-8 max-w-5xl mx-auto">
          <Routes>
            {/* Root: redirect based on auth state */}
            <Route
              path="/"
              element={
                user === undefined ? null :
                user ? <Navigate to="/repos" replace /> :
                <LoginPage />
              }
            />

            {/* Protected pages */}
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

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </MotionConfig>
  );
}

function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6">
      <h1 className="text-3xl font-bold">DevPulse</h1>
      <p className="text-gray-400">GitHub repository health at a glance</p>
      <a
        href="/api/auth/github"
        className="px-5 py-2 bg-white text-gray-900 rounded-md font-medium hover:bg-gray-100 transition-colors"
      >
        Sign in with GitHub
      </a>
    </div>
  );
}
