import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function RepoPage() {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  // filters
  const [type, setType] = useState('');
  const [state, setState] = useState('open');
  const [stale, setStale] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    fetch(`/api/repos`)
      .then(r => r.json())
      .then(repos => setRepo(repos.find(r => String(r.id) === String(id)) ?? null));
    fetch(`/api/repos/${id}/metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(setMetrics);
  }, [id]);

  useEffect(() => {
    loadItems();
  }, [id, type, state, stale, page]);

  async function loadItems() {
    setItems(null);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/repos" className="hover:text-white transition-colors">My repos</Link>
        <span>/</span>
        <span className="text-white">{repo?.full_name ?? id}</span>
      </div>

      {/* Metrics cards */}
      {metrics === null ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Open issues" value={metrics.open_issues} />
          <MetricCard label="Open PRs" value={metrics.open_prs} />
          <MetricCard label="Stale items" value={metrics.stale_items} />
          <MetricCard label="Unassigned issues" value={metrics.unassigned_open_issues} />
          <MetricCard
            label="Median close time"
            value={metrics.median_time_to_close_days != null ? `${metrics.median_time_to_close_days}d` : null}
            empty="No data"
          />
        </div>
      )}

      {metrics?.last_synced_at && (
        <p className="text-xs text-gray-500">
          Data as of {new Date(metrics.last_synced_at).toLocaleString()}
          {metrics.sync_status === 'running' && ' · sync in progress'}
        </p>
      )}
      {!metrics?.last_synced_at && metrics !== null && (
        <p className="text-xs text-yellow-600">Not synced yet — run a sync to see data.</p>
      )}

      {/* Weekly activity chart */}
      {metrics?.weekly_activity?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Opened vs closed per week (last 12 weeks)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.weekly_activity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="week"
                tickFormatter={w => new Date(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6 }}
                labelFormatter={w => new Date(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="opened" name="Opened" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="closed" name="Closed" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          value={type}
          onChange={e => { setType(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 focus:outline-none"
        >
          <option value="">All types</option>
          <option value="issue">Issues</option>
          <option value="pr">Pull requests</option>
        </select>

        <select
          value={state}
          onChange={e => { setState(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 focus:outline-none"
        >
          <option value="">All states</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={stale}
            onChange={e => { setStale(e.target.checked); setPage(1); }}
          />
          Stale (30+ days)
        </label>
      </div>

      {/* Table */}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {items === null && <p className="text-gray-400 text-sm">Loading…</p>}
      {items?.length === 0 && <p className="text-gray-400 text-sm">No items match these filters.</p>}

      {items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-2 pr-4 font-medium">#</th>
                <th className="pb-2 pr-4 font-medium">Title</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">State</th>
                <th className="pb-2 pr-4 font-medium">Author</th>
                <th className="pb-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-4 text-gray-500">{item.number}</td>
                  <td className="py-2 pr-4">
                    <a href={item.html_url} target="_blank" rel="noreferrer" className="hover:text-blue-400 transition-colors">
                      {item.title}
                    </a>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${item.type === 'pr' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300'}`}>
                      {item.type === 'pr' ? 'PR' : 'Issue'}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${item.state === 'open' ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                      {item.state}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{item.author_login}</td>
                  <td className="py-2 text-gray-400">{new Date(item.updated_at_gh).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination  */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:border-gray-500 transition-colors"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages} ({total} total)</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:border-gray-500 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, empty = '—' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-2xl font-semibold">
        {value != null ? value : <span className="text-gray-600 text-base">{empty}</span>}
      </span>
    </div>
  );
}
