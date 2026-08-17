import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import StatusBadge from '../components/StatusBadge';

export default function HealthCheck({ namespace }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const runHealthCheck = async () => {
    if (!namespace) {
      addToast('Select a namespace first', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/health-check/${namespace}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      addToast('Health check failed: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const summary = results ? {
    total: results.length,
    healthy: results.filter(r => r.status === 'UP').length,
    down: results.filter(r => r.status === 'DOWN' || r.status === 'CRASH').length,
    restarts: results.reduce((sum, r) => sum + r.restarts, 0),
  } : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-white">Health Check</h2>
        <button onClick={runHealthCheck} disabled={loading} className="btn-primary">
          {loading ? 'Running...' : 'Run Health Check'}
        </button>
      </div>

      {loading && <LoadingSkeleton rows={6} />}

      {!loading && !results && (
        <div className="card p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-gray-500 mb-2">Check pod readiness and health across the namespace</p>
          <p className="text-xs text-gray-600">Uses pod readiness status to determine health</p>
        </div>
      )}

      {!loading && results && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-2xl font-bold text-white">{summary.total}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Healthy</p>
              <p className="text-2xl font-bold text-green-400">{summary.healthy}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Down / Crash</p>
              <p className="text-2xl font-bold text-red-400">{summary.down}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Total Restarts</p>
              <p className="text-2xl font-bold text-yellow-400">{summary.restarts}</p>
            </div>
          </div>

          {/* Results Table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">App</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Pod</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Restarts</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Restart</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-700/30">
                    <td className="px-4 py-3 text-white text-xs font-medium">{r.appName}</td>
                    <td className="px-4 py-3">
                      <Link to={`/pods/${r.name}`} className="text-k8s-blue hover:underline font-mono text-xs">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status === 'UP' ? 'Running' : r.status === 'CRASH' ? 'CrashLoopBackOff' : 'Failed'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-300">{r.restarts}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.lastRestart ? new Date(r.lastRestart).toLocaleString() : '-'}
                      {r.reason && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                          r.reason === 'OOMKilled' || r.reason === 'Error' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>{r.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
