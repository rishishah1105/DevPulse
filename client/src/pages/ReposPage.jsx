import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function ReposPage() {
  const [repos, setRepos] = useState(null); // null = loading
  const [url, setUrl] = useState('');
  const [addError, setAddError] = useState('');
  const [syncStatuses, setSyncStatuses] = useState({});
  const intervals = useRef({});

  useEffect(() => {
    loadRepos();
    return () => Object.values(intervals.current).forEach(clearInterval);
  }, []);

  async function loadRepos() {
    const res = await fetch('/api/repos');
    const data = await res.json();
    setRepos(data);
    data.forEach(repo => {
      if (repo.sync_status === 'running') startPolling(repo.id);
    });
  }

  function startPolling(repoId) {
    if (intervals.current[repoId]) return;

    const id = setInterval(async () => {
      const res = await fetch(`/api/repos/${repoId}/sync-status`);
      if (!res.ok) return;
      const status = await res.json();
      setSyncStatuses(prev => ({ ...prev, [repoId]: status }));

      if (status.sync_status !== 'running') {
        clearInterval(intervals.current[repoId]);
        delete intervals.current[repoId];
        loadRepos();
      }
    }, 3000);

    intervals.current[repoId] = id;
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error?.message ?? data.error ?? 'Failed to add repo');
      return;
    }
    setUrl('');
    loadRepos();
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

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Add a repository</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Add
          </button>
        </form>
        {addError && <p className="mt-2 text-sm text-red-400">{addError}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">My repositories</h2>

        {repos === null && <p className="text-gray-400 text-sm">Loading…</p>}
        {repos?.length === 0 && <p className="text-gray-400 text-sm">No repositories yet. Add one above.</p>}

        {repos?.length > 0 && (
          <div className="flex flex-col gap-2">
            {repos.map(repo => {
              const status = syncStatuses[repo.id];
              const isRunning = (status?.sync_status ?? repo.sync_status) === 'running';

              return (
                <div key={repo.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <Link to={`/repos/${repo.id}`} className="font-medium hover:text-blue-400 transition-colors">
                      {repo.full_name}
                    </Link>
                    <span className="text-xs text-gray-500">
                      {isRunning && status
                        ? `Syncing… ${status.sync_items_done} items${status.sync_pages_total ? ` (page ${Math.ceil(status.sync_items_done / 100)} of ${status.sync_pages_total})` : ''}`
                        : repo.last_synced_at
                        ? `Last synced ${new Date(repo.last_synced_at).toLocaleString()}`
                        : 'Never synced'}
                    </span>
                    {status?.sync_status === 'failed' && (
                      <span className="text-xs text-red-400">{status.sync_error}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSync(repo.id)}
                    disabled={isRunning}
                    className="px-3 py-1.5 text-xs rounded border border-gray-700 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRunning ? 'Syncing…' : 'Sync'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
