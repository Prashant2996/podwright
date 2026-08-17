import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import StatusBadge from '../components/StatusBadge';
import LogViewer from '../components/LogViewer';
import Terminal from '../components/Terminal';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function PodDetail({ namespace }) {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const [pod, setPod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'info');
  const [selectedContainer, setSelectedContainer] = useState('');
  const [events, setEvents] = useState([]);
  const [health, setHealth] = useState(null);

  const fetchData = useCallback(async () => {
    if (!namespace || !name) return;
    try {
      const res = await fetch(`/api/pods/${namespace}/${name}`);
      const data = await res.json();
      setPod(data);
      // Set default container
      if (!selectedContainer && data.spec?.containers?.length > 0) {
        setSelectedContainer(data.spec.containers[0].name);
      }
    } catch (e) {}
    setLoading(false);
  }, [namespace, name]);

  useAutoRefresh(fetchData, [namespace, name]);

  useEffect(() => {
    if (activeTab === 'events') fetchEvents();
    if (activeTab === 'health') fetchHealth();
  }, [activeTab, namespace, name]);

  async function fetchEvents() {
    try {
      const res = await fetch(`/api/pods/${namespace}/${name}/events`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {}
  }

  async function fetchHealth() {
    try {
      const res = await fetch(`/api/pods/${namespace}/${name}/health`);
      const data = await res.json();
      setHealth(data);
    } catch (e) {}
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!pod) return <div className="text-gray-500">Pod not found</div>;

  const containers = pod.spec?.containers || [];
  const initContainers = pod.spec?.initContainers || [];
  const containerStatuses = pod.status?.containerStatuses || [];
  const initContainerStatuses = pod.status?.initContainerStatuses || [];
  const conditions = pod.status?.conditions || [];

  // Build container list for log switcher (including init containers)
  const allContainers = [
    ...containers.map(c => ({ name: c.name, type: 'container' })),
    ...initContainers.map(c => {
      const status = initContainerStatuses.find(s => s.name === c.name);
      const isSidecar = status?.state?.running;
      return { name: c.name, type: isSidecar ? 'sidecar' : 'init' };
    }),
  ];

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'logs', label: 'Logs' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'events', label: 'Events' },
    { id: 'health', label: 'Health' },
    { id: 'conditions', label: 'Conditions' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white font-mono">{name}</h2>
        <p className="text-sm text-gray-400">{namespace}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700/50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === tab.id
                ? 'bg-card text-white border-b-2 border-k8s-blue'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-400">Phase</p>
              <p className="text-lg font-bold"><StatusBadge status={pod.status?.phase || 'Unknown'} /></p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Pod IP</p>
              <p className="text-lg font-bold text-white font-mono">{pod.status?.podIP || '-'}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Node</p>
              <p className="text-sm font-medium text-white truncate">{pod.spec?.nodeName || '-'}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400">Restarts</p>
              <p className="text-lg font-bold text-yellow-400">
                {containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0)}
              </p>
            </div>
          </div>

          {/* Containers */}
          <div className="card p-6">
            <h3 className="text-sm font-medium text-white mb-4">Containers</h3>
            <div className="space-y-3">
              {containerStatuses.map(cs => {
                const state = cs.state?.running ? 'Running' : cs.state?.waiting ? (cs.state.waiting.reason || 'Waiting') : cs.state?.terminated ? 'Terminated' : 'Unknown';
                return (
                  <div key={cs.name} className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white font-medium">{cs.name}</span>
                      <p className="text-xs text-gray-400 font-mono">{cs.image}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">Restarts: {cs.restartCount || 0}</span>
                      <StatusBadge status={state} />
                    </div>
                  </div>
                );
              })}
              {initContainerStatuses.map(cs => {
                const state = cs.state?.running ? 'Running' : cs.state?.terminated ? 'Terminated' : 'Waiting';
                return (
                  <div key={cs.name} className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{cs.name}</span>
                      <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                        {cs.state?.running ? 'sidecar' : 'init'}
                      </span>
                    </div>
                    <StatusBadge status={state} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Labels & Annotations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="text-sm font-medium text-white mb-3">Labels</h3>
              <div className="space-y-1">
                {Object.entries(pod.metadata?.labels || {}).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="text-gray-400">{k}:</span> <span className="text-gray-200">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-6">
              <h3 className="text-sm font-medium text-white mb-3">Annotations</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Object.entries(pod.metadata?.annotations || {}).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="text-gray-400">{k}:</span> <span className="text-gray-200 break-all">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Container switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {allContainers.map(c => (
              <button
                key={c.name}
                onClick={() => setSelectedContainer(c.name)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedContainer === c.name
                    ? 'bg-k8s-blue text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {c.name}
                {c.type !== 'container' && (
                  <span className="ml-1.5 text-[9px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded">
                    {c.type}
                  </span>
                )}
              </button>
            ))}
          </div>
          <LogViewer namespace={namespace} podName={name} container={selectedContainer} />
        </div>
      )}

      {activeTab === 'terminal' && (
        <Terminal namespace={namespace} podName={name} container={selectedContainer || containers[0]?.name} />
      )}

      {activeTab === 'events' && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Pod Events</h3>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No events found</p>
          ) : (
            <div className="space-y-3">
              {events.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    event.type === 'Normal' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-white">{event.reason}</span>
                      {event.count > 1 && (
                        <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                          x{event.count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 break-all">{event.message}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {event.lastTimestamp ? timeAgo(event.lastTimestamp) + ' ago' : ''}
                      {event.source ? ` - ${event.source}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Pod Health</h3>
          {health ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  health.status === 'UP' ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}>
                  <div className={`w-4 h-4 rounded-full ${
                    health.status === 'UP' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{health.status}</p>
                  <p className="text-xs text-gray-400">{health.message}</p>
                </div>
              </div>
              {health.conditions?.length > 0 && (
                <table className="w-full text-xs mt-4">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700/50">
                      <th className="text-left py-2">Component</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.conditions.map((c, i) => (
                      <tr key={i} className="border-b border-gray-700/30">
                        <td className="py-2 text-gray-200">{c.type}</td>
                        <td className="py-2"><StatusBadge status={c.status === 'True' ? 'Ready' : 'Pending'} /></td>
                        <td className="py-2 text-gray-400 truncate max-w-[200px]">{c.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Loading health data...</p>
          )}
        </div>
      )}

      {activeTab === 'conditions' && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-4">Conditions</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700/50">
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Reason</th>
                <th className="text-left py-2">Last Transition</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((c, i) => (
                <tr key={i} className="border-b border-gray-700/30">
                  <td className="py-2 text-gray-200">{c.type}</td>
                  <td className="py-2">
                    <StatusBadge status={c.status === 'True' ? 'Ready' : 'Pending'} />
                  </td>
                  <td className="py-2 text-gray-400">{c.reason || '-'}</td>
                  <td className="py-2 text-gray-500">{c.lastTransitionTime ? timeAgo(c.lastTransitionTime) + ' ago' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
