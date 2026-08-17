import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LoadingCards } from '../components/LoadingSkeleton';
import StatusBadge from '../components/StatusBadge';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function DonutChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className="text-gray-500 text-sm">No pods</div>;

  let cumulativePercent = 0;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative w-40 h-40">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        {data.filter(d => d.value > 0).map((segment, i) => {
          const percent = segment.value / total;
          const offset = cumulativePercent * circumference;
          const dash = percent * circumference;
          cumulativePercent += percent;

          return (
            <circle
              key={i}
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              className="transition-all duration-300"
            >
              <title>{segment.label}: {segment.value} ({Math.round(percent * 100)}%)</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">{total}</span>
      </div>
    </div>
  );
}

function StackedBar({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  return (
    <div className="w-full">
      <div className="h-6 rounded-full overflow-hidden flex">
        {data.filter(d => d.value > 0).map((segment, i) => (
          <div
            key={i}
            className="h-full relative group"
            style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
              {segment.label}: {segment.value} ({Math.round((segment.value / total) * 100)}%)
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 flex-wrap">
        {data.filter(d => d.value > 0).map((segment, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label} ({segment.value})
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WorkloadsOverview({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [pods, setPods] = useState([]);
  const [deployments, setDeployments] = useState([]);

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const [workloads, podData, depData] = await Promise.all([
        fetch(`/api/workloads/${namespace}`).then(r => r.json()),
        fetch(`/api/pods/${namespace}`).then(r => r.json()),
        fetch(`/api/deployments/${namespace}`).then(r => r.json()),
      ]);
      setCounts(workloads);
      setPods(Array.isArray(podData) ? podData : []);
      setDeployments(Array.isArray(depData) ? depData : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  if (loading) return <LoadingCards count={6} />;

  // Pod status distribution
  const podStatusCounts = {};
  pods.forEach(p => {
    podStatusCounts[p.status] = (podStatusCounts[p.status] || 0) + 1;
  });

  const podChartData = [
    { label: 'Running', value: podStatusCounts['Running'] || 0, color: '#22c55e' },
    { label: 'Pending', value: podStatusCounts['Pending'] || 0, color: '#eab308' },
    { label: 'Failed', value: podStatusCounts['Failed'] || 0, color: '#ef4444' },
    { label: 'CrashLoopBackOff', value: podStatusCounts['CrashLoopBackOff'] || 0, color: '#dc2626' },
    { label: 'Succeeded', value: podStatusCounts['Succeeded'] || 0, color: '#3b82f6' },
    { label: 'Terminating', value: podStatusCounts['Terminating'] || 0, color: '#f59e0b' },
  ];

  // Deployment health
  const depStatusCounts = { Available: 0, Partial: 0, Pending: 0, 'Scaled Down': 0 };
  deployments.forEach(d => {
    if (depStatusCounts[d.status] !== undefined) depStatusCounts[d.status]++;
  });

  const depBarData = [
    { label: 'Available', value: depStatusCounts['Available'], color: '#22c55e' },
    { label: 'Partial', value: depStatusCounts['Partial'], color: '#eab308' },
    { label: 'Pending', value: depStatusCounts['Pending'], color: '#ef4444' },
    { label: 'Scaled Down', value: depStatusCounts['Scaled Down'], color: '#6b7280' },
  ];

  // Recent restarts
  const recentRestarts = pods
    .filter(p => p.restarts > 0)
    .sort((a, b) => b.restarts - a.restarts)
    .slice(0, 5);

  const statCards = [
    { label: 'Deployments', value: counts.deployments || 0, path: '/deployments', color: 'text-blue-400' },
    { label: 'Pods', value: counts.pods || 0, path: '/pods', color: 'text-green-400' },
    { label: 'StatefulSets', value: counts.statefulsets || 0, path: '/statefulsets', color: 'text-purple-400' },
    { label: 'DaemonSets', value: counts.daemonsets || 0, path: '/daemonsets', color: 'text-orange-400' },
    { label: 'Jobs', value: counts.jobs || 0, path: '/jobs', color: 'text-cyan-400' },
    { label: 'CronJobs', value: counts.cronjobs || 0, path: '/cronjobs', color: 'text-pink-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(card => (
          <Link key={card.label} to={card.path} className="card p-4 hover:border-gray-600 transition-colors">
            <p className="text-xs text-gray-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </Link>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pod Status Donut */}
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Pod Status Distribution</h3>
          <div className="flex items-center gap-6">
            <DonutChart data={podChartData} />
            <div className="space-y-2">
              {podChartData.filter(d => d.value > 0).map(d => (
                <div key={d.label} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-300">{d.label}</span>
                  <span className="text-gray-500">({d.value})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deployment Health Bar */}
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Deployment Health</h3>
          <StackedBar data={depBarData} />
        </div>
      </div>

      {/* Recent Restarts */}
      {recentRestarts.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Recent Restarts</h3>
          <div className="space-y-2">
            {recentRestarts.map(pod => (
              <div key={pod.name} className="flex items-center gap-3 text-sm">
                <Link to={`/pods/${pod.name}`} className="text-k8s-blue hover:underline font-mono text-xs truncate max-w-[200px]">
                  {pod.name}
                </Link>
                <span className="text-gray-500">{timeAgo(pod.age)} ago</span>
                <span className="text-yellow-400 text-xs font-medium">{pod.restarts} restarts</span>
                <StatusBadge status={pod.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deployments Table */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Deployments</h3>
            {deployments.length > 10 && (
              <Link to="/deployments" className="text-xs text-k8s-blue hover:underline">View all &rarr;</Link>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700/50">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Ready</th>
                <th className="text-left py-2">Tag</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {deployments.slice(0, 10).map(dep => (
                <tr key={dep.name} className="border-b border-gray-700/30">
                  <td className="py-2">
                    <Link to={`/deployments/${dep.name}`} className="text-k8s-blue hover:underline">
                      {dep.name}
                    </Link>
                  </td>
                  <td className="py-2 text-gray-300">{dep.ready}</td>
                  <td className="py-2">
                    <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">
                      {dep.tag}
                    </span>
                  </td>
                  <td className="py-2"><StatusBadge status={dep.status} /></td>
                  <td className="py-2 text-gray-500">{timeAgo(dep.age)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pods Table */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Pods</h3>
            {pods.length > 10 && (
              <Link to="/pods" className="text-xs text-k8s-blue hover:underline">View all &rarr;</Link>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700/50">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Restarts</th>
                <th className="text-left py-2">Node</th>
                <th className="text-left py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {pods.slice(0, 10).map(pod => (
                <tr key={pod.name} className="border-b border-gray-700/30">
                  <td className="py-2">
                    <Link to={`/pods/${pod.name}`} className="text-k8s-blue hover:underline font-mono truncate block max-w-[180px]">
                      {pod.name}
                    </Link>
                  </td>
                  <td className="py-2"><StatusBadge status={pod.status} /></td>
                  <td className="py-2 text-gray-300">{pod.restarts}</td>
                  <td className="py-2 text-gray-500 truncate max-w-[100px]">{pod.node}</td>
                  <td className="py-2 text-gray-500">{timeAgo(pod.age)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
