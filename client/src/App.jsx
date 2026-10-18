import { useState, useEffect, useRef } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [url, setUrl] = useState('');
  const [syncStatuses, setSyncStatuses] = useState({});
  // hold interval IDs so we can clear them
  const intervals = useRef({});

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch('/api/repos')
      .then(r => r.json())
      .then(data => {
        setRepos(data);
        // start polling for any repo already running
        data.forEach(repo => {
          if (repo.sync_status === 'running') startPolling(repo.id);
        });
      });
  }, [user]);

  // clean up all intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervals.current).forEach(clearInterval);
    };
  }, []);

  function startPolling(repoId) {
    if (intervals.current[repoId]) return; // already polling

    const id = setInterval(async () => {
      const res = await fetch(`/api/repos/${repoId}/sync-status`);
      if (!res.ok) return;
      const status = await res.json();

      setSyncStatuses(prev => ({ ...prev, [repoId]: status }));

      if (status.sync_status !== 'running') {
        clearInterval(intervals.current[repoId]);
        delete intervals.current[repoId];
        // refresh repo list so last_synced_at updates in the list
        fetch('/api/repos').then(r => r.json()).then(setRepos);
      }
    }, 3000);

    intervals.current[repoId] = id;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to add repo');
      return;
    }
    setUrl('');
    fetch('/api/repos').then(r => r.json()).then(setRepos);
  }

  async function handleSync(repoId) {
    const res = await fetch(`/api/repos/${repoId}/sync`, { method: 'POST' });
    const data = await res.json();

    if (res.status === 409) return alert('Sync already running');
    if (res.status === 429) return alert(data.error?.message ?? 'Please wait before syncing again');
    if (!res.ok) return alert('Failed to start sync');

    setSyncStatuses(prev => ({ ...prev, [repoId]: { sync_status: 'running', sync_items_done: 0, sync_pages_total: null } }));
    startPolling(repoId);
  }

  if (!user) {
    return (
      <div>
        <h1>DevPulse</h1>
        <a href="/api/auth/github">Sign in with GitHub</a>
      </div>
    );
  }

  return (
    <div>
      <h1>DevPulse</h1>
      <p>Signed in as {user.login}</p>

      <h2>Add a repo</h2>
      <form onSubmit={handleAdd}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
        />
        <button type="submit">Add</button>
      </form>

      <h2>My Repos</h2>
      {repos.length === 0 && <p>No repos yet.</p>}
      <ul>
        {repos.map(repo => {
          const status = syncStatuses[repo.id];
          const isRunning = (status?.sync_status ?? repo.sync_status) === 'running';

          return (
            <li key={repo.id}>
              <strong>{repo.full_name}</strong>
              {' '}
              <button onClick={() => handleSync(repo.id)} disabled={isRunning}>
                {isRunning ? 'Syncing…' : 'Sync'}
              </button>

              {/* progress while running */}
              {isRunning && status && (
                <span>
                  {' '}— {status.sync_items_done} items
                  {status.sync_pages_total ? ` (page ${Math.ceil(status.sync_items_done / 100)} of ${status.sync_pages_total})` : ''}
                </span>
              )}

              {/* last result */}
              {status?.sync_status === 'succeeded' && (
                <span> ✓ Sync complete</span>
              )}
              {status?.sync_status === 'failed' && (
                <span> ✗ {status.sync_error}</span>
              )}

              {/* last synced time from DB */}
              {repo.last_synced_at && !isRunning && (
                <span> · Last synced {new Date(repo.last_synced_at).toLocaleString()}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default App;
