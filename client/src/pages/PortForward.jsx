import { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function PortForward({ namespace }) {
  const [forwards, setForwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    resource: 'pod',
    resourceName: '',
    localPort: '',
    remotePort: '',
  });
  const [creating, setCreating] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const fetchForwards = useCallback(async () => {
    try {
      const res = await fetch('/api/port-forwards');
      const data = await res.json();
      setForwards(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, []);

  useAutoRefresh(fetchForwards, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.resourceName || !form.localPort || !form.remotePort) {
      addToast('All fields are required', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/port-forwards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          resource: form.resource,
          resourceName: form.resourceName,
          localPort: form.localPort,
          remotePort: form.remotePort,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`Port forward started: localhost:${form.localPort} -> ${form.resourceName}:${form.remotePort}`, 'success');
        setShowForm(false);
        setForm({ resource: 'pod', resourceName: '', localPort: '', remotePort: '' });
        fetchForwards();
      } else {
        addToast(data.error || 'Failed to create port forward', 'error');
      }
    } catch (e) {
      addToast('Failed: ' + e.message, 'error');
    }
    setCreating(false);
  };

  const handleStop = async (id, name) => {
    const ok = await confirm({
      title: 'Stop Port Forward',
      message: `Stop port forwarding to ${name}?`,
      variant: 'default',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/port-forwards/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Port forward stopped', 'success');
        fetchForwards();
      }
    } catch (e) {
      addToast('Failed to stop', 'error');
    }
  };

  const statusMap = {
    active: 'Running',
    starting: 'Pending',
    stopped: 'Succeeded',
    error: 'Failed',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-white">Port Forwarding</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
          {showForm ? 'Cancel' : 'New Port Forward'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card p-4 mb-6">
          <form onSubmit={handleCreate} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Resource Type</label>
              <select
                value={form.resource}
                onChange={e => setForm({ ...form, resource: e.target.value })}
                className="input text-sm"
              >
                <option value="pod">Pod</option>
                <option value="svc">Service</option>
                <option value="deployment">Deployment</option>
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-400 mb-1">Resource Name</label>
              <input
                type="text"
                value={form.resourceName}
                onChange={e => setForm({ ...form, resourceName: e.target.value })}
                placeholder="e.g. my-service"
                className="input w-full text-sm"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-gray-400 mb-1">Local Port</label>
              <input
                type="number"
                value={form.localPort}
                onChange={e => setForm({ ...form, localPort: e.target.value })}
                placeholder="8080"
                className="input w-full text-sm"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-gray-400 mb-1">Remote Port</label>
              <input
                type="number"
                value={form.remotePort}
                onChange={e => setForm({ ...form, remotePort: e.target.value })}
                placeholder="80"
                className="input w-full text-sm"
              />
            </div>
            <button type="submit" disabled={creating} className="btn-primary btn-sm">
              {creating ? 'Starting...' : 'Start'}
            </button>
          </form>
        </div>
      )}

      {/* Active Forwards */}
      {forwards.length === 0 && !loading ? (
        <div className="card p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <p className="text-gray-500 mb-1">No active port forwards</p>
          <p className="text-xs text-gray-600">Click "New Port Forward" to forward a local port to a Kubernetes resource</p>
        </div>
      ) : (
        <div className="space-y-2">
          {forwards.map(pf => (
            <div key={pf.id} className="card p-4 flex items-center gap-4">
              <div className="flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${
                  pf.status === 'active' ? 'bg-green-400 animate-pulse' :
                  pf.status === 'starting' ? 'bg-yellow-400 animate-pulse' :
                  pf.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white">
                    localhost:{pf.localPort}
                  </span>
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="text-sm text-gray-300">
                    {pf.resource}/{pf.resourceName}:{pf.remotePort}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{pf.namespace}</span>
                  <span>Started {timeAgo(pf.startedAt)} ago</span>
                </div>
              </div>
              <StatusBadge status={statusMap[pf.status] || 'Unknown'} />
              {(pf.status === 'active' || pf.status === 'starting') && (
                <button
                  onClick={() => handleStop(pf.id, pf.resourceName)}
                  className="btn-danger btn-sm text-xs"
                >
                  Stop
                </button>
              )}
              {pf.status === 'active' && (
                <a
                  href={`http://localhost:${pf.localPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-k8s-blue hover:underline text-xs"
                >
                  Open
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
