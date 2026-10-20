import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

export default function ReposPage() {
  const [repos, setRepos] = useState(null);
  const [url, setUrl] = useState('');
  const [addError, setAddError] = useState('');
  const [syncErrors, setSyncErrors] = useState({});
  const [syncStatuses, setSyncStatuses] = useState({});
  const intervals = useRef({});

  const [activeTab, setActiveTab] = useState('tracked');
  const [githubRepos, setGithubRepos] = useState(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [adding, setAdding] = useState(new Set());

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

  async function loadGithubRepos() {
    setGithubLoading(true);
    setDiscoverError('');
    const res = await fetch('/api/repos/github-discover');
    if (!res.ok) {
      setDiscoverError('Failed to load your GitHub repos.');
      setGithubLoading(false);
      return;
    }
    const data = await res.json();
    setGithubRepos(data);
    setGithubLoading(false);
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === 'discover' && githubRepos === null) loadGithubRepos();
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
      setAddError(data.error?.message ?? "That doesn't look like a GitHub repository URL.");
      return;
    }
    setUrl('');
    loadRepos();
  }

  async function handleAddFromDiscover(repo) {
    setAdding(prev => new Set(prev).add(repo.github_repo_id));
    const res = await fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: repo.html_url }),
    });
    setAdding(prev => {
      const next = new Set(prev);
      next.delete(repo.github_repo_id);
      return next;
    });
    if (res.ok) {
      await loadRepos();
      await loadGithubRepos();
    }
  }

  async function handleSync(repoId) {
    setSyncErrors(prev => ({ ...prev, [repoId]: '' }));
    const res = await fetch(`/api/repos/${repoId}/sync`, { method: 'POST' });
    const data = await res.json();
    if (res.status === 409) { setSyncErrors(prev => ({ ...prev, [repoId]: 'A sync is already running.' })); return; }
    if (res.status === 429) { setSyncErrors(prev => ({ ...prev, [repoId]: data.error?.message ?? 'You can sync again shortly.' })); return; }
    if (!res.ok) { setSyncErrors(prev => ({ ...prev, [repoId]: 'Failed to start sync.' })); return; }
    setSyncStatuses(prev => ({ ...prev, [repoId]: { sync_status: 'running', sync_items_done: 0, sync_pages_total: null } }));
    startPolling(repoId);
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Tab pills */}
      <div className="flex gap-2">
        {['tracked', 'discover'].map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer active:scale-95 ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:border-border-strong'
            }`}
          >
            {tab === 'tracked' ? 'Tracked' : 'Yours on GitHub'}
          </button>
        ))}
      </div>

      {/* ── Tracked tab ── */}
      {activeTab === 'tracked' && (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Add repository</h2>
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="github.com/owner/repo"
                className="flex-1 bg-card border border-border-strong rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-subtle-foreground font-mono"
              />
              <button
                type="submit"
                className="px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer active:scale-95"
              >
                Add repo
              </button>
            </form>
            {addError && <p className="text-sm text-state-failed pl-4">{addError}</p>}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My repositories</h2>

            {repos === null && (
              <div className="flex flex-col gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {repos?.length === 0 && (
              <div className="bg-card border border-border rounded-[20px] p-10 flex flex-col items-center gap-3 text-center">
                <p className="text-foreground font-semibold">Add your first repository</p>
                <p className="text-sm text-muted-foreground">
                  Paste any public GitHub URL above, or switch to <strong>Yours on GitHub</strong> to browse your own repos.
                </p>
                <p className="text-xs text-subtle-foreground font-mono">For example: github.com/vercel/next.js</p>
              </div>
            )}

            {repos?.length > 0 && (
              <div className="bg-card border border-border rounded-[20px] divide-y divide-border overflow-hidden">
                {repos.map(repo => {
                  const status = syncStatuses[repo.id];
                  const isRunning = (status?.sync_status ?? repo.sync_status) === 'running';
                  const effectiveStatus = status?.sync_status ?? repo.sync_status;

                  return (
                    <div key={repo.id}>
                      <div className="flex items-center justify-between px-5 py-4 hover:bg-card-raised transition-colors">
                        <div className="flex items-center gap-4 min-w-0">
                          <StatusBadge
                            status={effectiveStatus}
                            lastSynced={repo.last_synced_at}
                            itemsDone={status?.sync_items_done ?? repo.sync_items_done}
                            pagesTotal={status?.sync_pages_total ?? repo.sync_pages_total}
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/repos/${repo.id}`}
                              className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {repo.full_name}
                            </Link>
                            {repo.sync_items_done > 0 && (
                              <p className="text-xs text-subtle-foreground mt-0.5 font-mono">
                                {repo.sync_items_done.toLocaleString()} items
                              </p>
                            )}
                            {!repo.last_synced_at && effectiveStatus !== 'running' && (
                              <p className="text-xs text-subtle-foreground mt-0.5">
                                Not synced yet — click Sync now to import
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleSync(repo.id)}
                          className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-full border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary text-muted-foreground cursor-pointer transition-colors active:scale-95"
                        >
                          {isRunning ? 'Retry sync' : 'Sync now'}
                        </button>
                      </div>
                      {syncErrors[repo.id] && (
                        <p className="px-5 pb-3 text-xs text-state-failed">{syncErrors[repo.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Discover tab ── */}
      {activeTab === 'discover' && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your repositories on GitHub</h2>

          {githubLoading && (
            <div className="flex flex-col gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {discoverError && <p className="text-sm text-state-failed">{discoverError}</p>}

          {!githubLoading && githubRepos?.length === 0 && (
            <div className="bg-card border border-border rounded-[20px] p-10 text-center">
              <p className="text-muted-foreground text-sm">No public repositories found on your GitHub account.</p>
            </div>
          )}

          {!githubLoading && githubRepos?.length > 0 && (
            <div className="bg-card border border-border rounded-[20px] divide-y divide-border overflow-hidden">
              {githubRepos.map(repo => (
                <div
                  key={repo.github_repo_id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-card-raised transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="font-mono text-sm font-medium text-foreground">{repo.full_name}</p>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{repo.description}</p>
                    )}
                    <p className="text-xs text-subtle-foreground mt-0.5 font-mono">
                      {repo.open_issues_count.toLocaleString()} open issues
                    </p>
                  </div>

                  {repo.tracked ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-medium text-state-open bg-state-open/10 px-2.5 py-1 rounded-full">
                        Tracked
                      </span>
                      <Link
                        to={`/repos/${repo.devpulse_id}`}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border hover:border-border-strong transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddFromDiscover(repo)}
                      disabled={adding.has(repo.github_repo_id)}
                      className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-full border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary text-muted-foreground cursor-pointer transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {adding.has(repo.github_repo_id) ? 'Adding…' : 'Add'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ status, lastSynced, itemsDone, pagesTotal }) {
  if (status === 'running') {
    const pct = pagesTotal && itemsDone ? Math.round((Math.ceil(itemsDone / 100) / pagesTotal) * 100) : null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-state-syncing bg-state-syncing/10 px-2.5 py-1 rounded-full shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-state-syncing animate-pulse" />
        {pct !== null ? `Syncing ${pct}%` : 'Syncing…'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-state-failed bg-state-failed/10 px-2.5 py-1 rounded-full shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-state-failed" />
        Sync failed
      </span>
    );
  }
  if (status === 'succeeded' && lastSynced) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-card-raised px-2.5 py-1 rounded-full shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
        {relativeTime(lastSynced)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle-foreground bg-card-raised px-2.5 py-1 rounded-full shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-subtle-foreground/50" />
      Never synced
    </span>
  );
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Synced ${hrs}h ago`;
  return `Synced ${Math.floor(hrs / 24)}d ago`;
}
