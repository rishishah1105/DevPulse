import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CircleDot, CircleCheck, GitPullRequest, GitPullRequestClosed, Clock, ExternalLink, RefreshCw } from 'lucide-react';

export default function RepoPage() {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const [type, setType] = useState('');
  const [state, setState] = useState('open');
  const [stale, setStale] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [liveSync, setLiveSync] = useState(null);
  const [syncMsg, setSyncMsg] = useState('');
  const syncEs = useRef(null);

  function openSyncStream() {
    if (syncEs.current) syncEs.current.close();
    const es = new EventSource(`/api/repos/${id}/sync-stream`);
    syncEs.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setLiveSync(data);
      if (data.sync_status !== 'running') {
        es.close();
        syncEs.current = null;
        setLiveSync(null);
        fetch(`/api/repos/${id}/metrics`).then(r => r.ok ? r.json() : null).then(setMetrics);
        fetch(`/api/repos/${id}/sync-history`).then(r => r.ok ? r.json() : []).then(setSyncHistory);
      }
    };

    es.onerror = () => {
      es.close();
      syncEs.current = null;
      setLiveSync(null);
    };
  }

  async function handleSync() {
    setSyncMsg('');
    const res = await fetch(`/api/repos/${id}/sync`, { method: 'POST' });
    const data = await res.json();
    if (res.status === 409) { setSyncMsg('A sync is already running for this repository.'); return; }
    if (res.status === 429) { setSyncMsg(data.error?.message ?? 'You can sync again shortly.'); return; }
    if (!res.ok) { setSyncMsg('Failed to start sync.'); return; }
    openSyncStream();
  }

  useEffect(() => () => { if (syncEs.current) syncEs.current.close(); }, []);

  useEffect(() => {
    fetch('/api/repos')
      .then(r => r.json())
      .then(repos => setRepo(repos.find(r => String(r.id) === String(id)) ?? null));
    fetch(`/api/repos/${id}/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setMetrics(data);
        if (data?.sync_status === 'running') openSyncStream();
      });
    fetch(`/api/repos/${id}/sync-history`)
      .then(r => r.ok ? r.json() : [])
      .then(setSyncHistory);
  }, [id]);

  useEffect(() => {
    loadItems();
  }, [id, type, state, stale, page]);

  async function loadItems() {
    setItems(null);
    setError('');
    const params = new URLSearchParams({ page, limit });
    if (type) params.set('type', type);
    if (state) params.set('state', state);
    if (stale) params.set('stale', 'true');
    const res = await fetch(`/api/repos/${id}/items?${params}`);
    if (!res.ok) { setError('Failed to load items'); return; }
    const data = await res.json();
    setItems(data.items);
    setTotal(data.total);
  }

  const totalPages = Math.ceil(total / limit);
  const [owner, repoName] = (repo?.full_name ?? '/').split('/');
  const effectiveStatus = liveSync?.sync_status ?? metrics?.sync_status;

  // derive opened-this-week / last-week from weekly_activity
  const activity = metrics?.weekly_activity ?? [];
  const thisWeek = activity[activity.length - 1];
  const lastWeek = activity[activity.length - 2];
  const openedThisWeek = thisWeek?.opened ?? null;
  const openedLastWeek = lastWeek?.opened ?? null;

  return (
    <motion.div
      className="flex flex-col gap-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-subtle-foreground">
        <Link to="/repos" className="hover:text-foreground transition-colors">Repos</Link>
        <span>/</span>
        <span className="text-muted-foreground font-mono">{repo?.full_name ?? id}</span>
      </div>

      {/* Hero */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-muted-foreground font-mono text-lg">{owner}/</span>
            <span className="font-semibold text-3xl text-foreground tracking-tight">{repoName}</span>
          </div>
          {(metrics !== null || liveSync !== null) && (
            <SyncBadge
              status={effectiveStatus}
              lastSynced={metrics?.last_synced_at}
              itemsDone={liveSync?.sync_items_done}
            />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSync}
            disabled={effectiveStatus === 'running'}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity active:scale-95"
          >
            <RefreshCw size={13} className={effectiveStatus === 'running' ? 'animate-spin' : ''} />
            {effectiveStatus === 'running' ? 'Syncing…' : 'Sync now'}
          </button>
          {repo && (
            <a
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border-strong rounded-full px-4 py-2 transition-colors active:scale-95"
            >
              <ExternalLink size={14} />
              Open on GitHub
            </a>
          )}
        </div>
      </div>
      {syncMsg && (
        <p className="text-sm text-state-failed -mt-4">{syncMsg}</p>
      )}

      {/* Stat cards */}
      {metrics === null ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[20px] p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {[
            { label: 'Open issues', value: metrics.open_issues, sub: openedThisWeek != null ? `${openedThisWeek} opened this week` : null },
            { label: 'Open PRs', value: metrics.open_prs, sub: metrics.unassigned_open_issues != null ? `${metrics.unassigned_open_issues} unassigned` : null },
            { label: 'Opened this week', value: openedThisWeek, sub: openedLastWeek != null ? `${openedLastWeek} last week` : null, highlight: true },
            { label: 'Stale items', value: metrics.stale_items, sub: 'not updated in 30+ days' },
            { label: 'Median close time', value: metrics.median_time_to_close_days != null ? `${metrics.median_time_to_close_days}d` : null, sub: 'issues closed, last 90 days', empty: 'No data yet' },
          ].map(card => (
            <motion.div
              key={card.label}
              className="h-full"
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } } }}
            >
              <StatCard {...card} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {!metrics?.last_synced_at && metrics !== null && (
        <p className="text-sm text-state-stale">Not synced yet — run a sync from the repos page to see data.</p>
      )}

      {/* Weekly chart */}
      {activity.length > 0 && (
        <motion.div
          className="bg-card border border-border rounded-[20px] p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-5">Opened vs closed per week</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={2}>
              <XAxis
                dataKey="week"
                tickFormatter={w => new Date(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 11, fill: 'var(--subtle-foreground)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--subtle-foreground)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--foreground)',
                }}
                labelFormatter={w => new Date(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                cursor={{ fill: 'var(--card-raised)', opacity: 0.5 }}
              />
              <Bar dataKey="opened" name="Opened" fill="var(--state-open)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="closed" name="Closed" fill="var(--state-closed)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-3">
            <Legend color="var(--state-open)" label="Opened" />
            <Legend color="var(--state-closed)" label="Closed" />
          </div>
        </motion.div>
      )}

      {/* Sync history */}
      {syncHistory.length > 0 && (
        <div className="bg-card border border-border rounded-[20px] overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Sync history</h3>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {syncHistory.map(run => (
                <tr key={run.id} className="border-b border-border last:border-0 hover:bg-card-raised transition-colors">
                  <td className="px-5 py-3 w-6">
                    {run.status === 'succeeded' && <span className="text-state-open">✓</span>}
                    {run.status === 'failed'    && <span className="text-state-failed">✗</span>}
                    {run.status === 'running'   && <span className="text-state-syncing">↻</span>}
                  </td>
                  <td className="px-3 py-3 font-medium text-foreground w-24">{run.status}</td>
                  <td className="px-3 py-3 text-muted-foreground">{relativeTime(run.started_at)}</td>
                  <td className="px-3 py-3 text-subtle-foreground font-mono">
                    {run.items_synced > 0 ? `${run.items_synced.toLocaleString()} items` : '—'}
                  </td>
                  <td className="px-3 py-3 text-state-failed truncate max-w-xs">
                    {run.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPills
          options={[
            { label: 'All types', value: '' },
            { label: 'Issues', value: 'issue' },
            { label: 'Pull requests', value: 'pr' },
          ]}
          value={type}
          onChange={v => { setType(v); setPage(1); }}
        />
        <div className="w-px h-5 bg-border mx-1" />
        <FilterPills
          options={[
            { label: 'All states', value: '' },
            { label: 'Open', value: 'open' },
            { label: 'Closed', value: 'closed' },
          ]}
          value={state}
          onChange={v => { setState(v); setPage(1); }}
        />
        <div className="w-px h-5 bg-border mx-1" />
        <button
          onClick={() => { setStale(s => !s); setPage(1); }}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-95 ${
            stale
              ? 'bg-state-stale/15 text-state-stale border border-state-stale/30'
              : 'bg-card-raised text-muted-foreground border border-transparent hover:border-border'
          }`}
        >
          Stale only
        </button>
        {total > 0 && (
          <span className="ml-auto text-sm text-subtle-foreground">{total.toLocaleString()} results</span>
        )}
      </div>

      {/* Table — crossfades when filters change */}
      {error && <p className="text-state-failed text-sm">{error}</p>}

      <AnimatePresence mode="wait">
      <motion.div
        key={`${type}-${state}-${stale}-${page}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex flex-col gap-4"
      >

      {items === null && (
        <div className="bg-card border border-border rounded-[20px] divide-y divide-border overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-card" />
          ))}
        </div>
      )}

      {items?.length === 0 && (
        <div className="bg-card border border-border rounded-[20px] p-10 text-center">
          <p className="text-muted-foreground text-sm">No items match these filters.</p>
        </div>
      )}

      {items?.length > 0 && (
        <div className="bg-card border border-border rounded-[20px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle-foreground uppercase tracking-wider w-8" />
                <th className="text-left px-5 py-3 text-xs font-semibold text-subtle-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-subtle-foreground uppercase tracking-wider hidden md:table-cell">Author</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-subtle-foreground uppercase tracking-wider hidden lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isStale = (Date.now() - new Date(item.updated_at_gh).getTime()) > 30 * 24 * 60 * 60 * 1000;
                const ageDays = Math.floor((Date.now() - new Date(item.updated_at_gh).getTime()) / (24 * 60 * 60 * 1000));
                return (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-card-raised transition-colors">
                    <td className="px-5 py-3.5 w-8">
                      <StateIcon type={item.type} state={item.state} />
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={item.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground hover:text-primary transition-colors font-medium"
                      >
                        {item.title}
                      </a>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-subtle-foreground">#{item.number}</span>
                        {item.assignee_login && (
                          <span className="text-xs text-subtle-foreground">{item.assignee_login}</span>
                        )}
                        {!item.assignee_login && (
                          <span className="text-xs text-subtle-foreground italic">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
                      {item.author_login}
                    </td>
                    <td className="px-3 py-3.5 hidden lg:table-cell">
                      {isStale ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-state-stale">
                          <Clock size={11} />
                          {ageDays}d
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.updated_at_gh).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="px-4 py-2 rounded-full border border-border hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
          >
            Previous
          </button>
          <span className="text-xs text-subtle-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-full border border-border hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
          >
            Next
          </button>
        </div>
      )}
      </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function StatCard({ label, value, sub, highlight = false, empty = '—' }) {
  if (highlight) {
    return (
      <div className="bg-primary rounded-[20px] p-5 flex flex-col gap-2 h-full">
        <span className="text-xs font-semibold text-primary-foreground/70">{label}</span>
        <span className="text-4xl font-semibold text-primary-foreground font-mono tabular-nums leading-none">
          {value != null ? value : <span className="text-2xl opacity-50">{empty}</span>}
        </span>
        <span className="text-xs text-primary-foreground/60 mt-auto">{sub ?? ' '}</span>
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-[20px] p-5 flex flex-col gap-2 h-full">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-4xl font-semibold text-foreground font-mono tabular-nums leading-none">
        {value != null ? value : <span className="text-2xl text-subtle-foreground">{empty}</span>}
      </span>
      <span className="text-xs text-subtle-foreground mt-auto">{sub ?? ' '}</span>
    </div>
  );
}

function StateIcon({ type, state }) {
  if (type === 'pr') {
    return state === 'open'
      ? <GitPullRequest size={16} className="text-state-open" />
      : <GitPullRequestClosed size={16} className="text-state-closed" />;
  }
  return state === 'open'
    ? <CircleDot size={16} className="text-state-open" />
    : <CircleCheck size={16} className="text-state-closed" />;
}

function SyncBadge({ status, lastSynced, itemsDone }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-state-syncing">
        <span className="w-1.5 h-1.5 rounded-full bg-state-syncing animate-pulse" />
        {itemsDone != null && itemsDone > 0
          ? `Syncing… ${itemsDone.toLocaleString()} items`
          : 'Sync in progress'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-state-failed">
        <span className="w-1.5 h-1.5 rounded-full bg-state-failed" />
        Sync failed
      </span>
    );
  }
  if (lastSynced) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
        {relativeTime(lastSynced)}
      </span>
    );
  }
  return null;
}

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-95 ${
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card-raised text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-xs text-subtle-foreground">{label}</span>
    </div>
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
