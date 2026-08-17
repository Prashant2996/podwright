import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import YamlModal from '../components/YamlModal';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function DeploymentDetail({ namespace }) {
  const { name } = useParams();
  const [deployment, setDeployment] = useState(null);
  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showYaml, setShowYaml] = useState(false);
  const [showRollout, setShowRollout] = useState(false);
  const [rolloutHistory, setRolloutHistory] = useState([]);
  const [editingImage, setEditingImage] = useState(null);
  const [newImage, setNewImage] = useState('');
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    if (!namespace || !name) return;
    try {
      const [dep, podData] = await Promise.all([
        fetch(`/api/deployments/${namespace}/${name}`).then(r => r.json()),
        fetch(`/api/pods/${namespace}`).then(r => r.json()),
      ]);
      setDeployment(dep);
      // Filter pods by owner reference
      const depPods = (Array.isArray(podData) ? podData : []).filter(p =>
        p.ownerReferences?.some(ref => ref.kind === 'ReplicaSet') ||
        p.labels?.app === name ||
        p.name?.startsWith(name)
      );
      setPods(depPods);
    } catch (e) {}
    setLoading(false);
  }, [namespace, name]);

  useAutoRefresh(fetchData, [namespace, name]);

  const handleScale = async () => {
    const replicas = prompt('Scale to how many replicas?', deployment?.spec?.replicas || 1);
    if (replicas === null) return;
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/scale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicas: parseInt(replicas) }),
      });
      if (res.ok) {
        addToast(`Scaled to ${replicas} replicas`, 'success');
        fetchData();
      }
    } catch (e) {
      addToast('Scale failed', 'error');
    }
  };

  const handleRestart = async () => {
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/restart`, { method: 'POST' });
      if (res.ok) {
        addToast('Restart initiated', 'success');
        fetchData();
      }
    } catch (e) {
      addToast('Restart failed', 'error');
    }
  };

  const handleRolloutHistory = async () => {
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/rollout-history`);
      const data = await res.json();
      setRolloutHistory(data);
      setShowRollout(true);
    } catch (e) {
      addToast('Failed to fetch rollout history', 'error');
    }
  };

  const handleRollback = async (rsName) => {
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicaSetName: rsName }),
      });
      if (res.ok) {
        addToast('Rollback initiated', 'success');
        setShowRollout(false);
        fetchData();
      }
    } catch (e) {
      addToast('Rollback failed', 'error');
    }
  };

  const handleImageUpdate = async (containerName) => {
    if (!newImage) { setEditingImage(null); return; }
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: containerName, image: newImage }),
      });
      if (res.ok) {
        addToast('Image updated', 'success');
        setEditingImage(null);
        fetchData();
      }
    } catch (e) {
      addToast('Image update failed', 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;
  if (!deployment) return <div className="text-gray-500">Deployment not found</div>;

  const spec = deployment.spec || {};
  const status = deployment.status || {};
  const containers = spec.template?.spec?.containers || [];
  const labels = deployment.metadata?.labels || {};
  const annotations = deployment.metadata?.annotations || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{name}</h2>
          <p className="text-sm text-gray-400">{namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleScale} className="btn-primary btn-sm">Scale</button>
          <button onClick={handleRestart} className="btn-secondary btn-sm">Restart</button>
          <button onClick={handleRolloutHistory} className="btn-secondary btn-sm">Rollout History</button>
          <button onClick={() => setShowYaml(true)} className="btn-secondary btn-sm">View YAML</button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-400">Replicas</p>
          <p className="text-2xl font-bold text-white">{spec.replicas || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400">Ready</p>
          <p className="text-2xl font-bold text-green-400">{status.readyReplicas || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400">Updated</p>
          <p className="text-2xl font-bold text-blue-400">{status.updatedReplicas || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400">Available</p>
          <p className="text-2xl font-bold text-cyan-400">{status.availableReplicas || 0}</p>
        </div>
      </div>

      {/* Containers */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-white mb-4">Containers</h3>
        <div className="space-y-4">
          {containers.map((c, i) => {
            const tag = c.image?.split(':')[1] || 'latest';
            return (
              <div key={i} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{c.name}</span>
                  <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">{tag}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400">Image: </span>
                    {editingImage === c.name ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          value={newImage}
                          onChange={e => setNewImage(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleImageUpdate(c.name); if (e.key === 'Escape') setEditingImage(null); }}
                          className="input btn-sm text-xs w-64"
                          autoFocus
                        />
                        <button onClick={() => handleImageUpdate(c.name)} className="text-green-400 text-xs">Apply</button>
                        <button onClick={() => setEditingImage(null)} className="text-gray-400 text-xs">Cancel</button>
                      </span>
                    ) : (
                      <span className="font-mono text-gray-300">
                        {c.image}
                        <button onClick={() => { setEditingImage(c.name); setNewImage(c.image); }} className="ml-2 text-k8s-blue text-[10px] hover:underline">
                          Edit
                        </button>
                      </span>
                    )}
                  </div>
                  {c.ports?.length > 0 && (
                    <div>
                      <span className="text-gray-400">Ports: </span>
                      <span className="text-gray-300">{c.ports.map(p => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ')}</span>
                    </div>
                  )}
                  {c.resources?.requests && (
                    <div>
                      <span className="text-gray-400">Requests: </span>
                      <span className="text-gray-300">CPU: {c.resources.requests.cpu || '-'}, Mem: {c.resources.requests.memory || '-'}</span>
                    </div>
                  )}
                  {c.resources?.limits && (
                    <div>
                      <span className="text-gray-400">Limits: </span>
                      <span className="text-gray-300">CPU: {c.resources.limits.cpu || '-'}, Mem: {c.resources.limits.memory || '-'}</span>
                    </div>
                  )}
                </div>
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
            {Object.entries(labels).map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-gray-400">{k}:</span> <span className="text-gray-200">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-medium text-white mb-3">Annotations</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {Object.entries(annotations).map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-gray-400">{k}:</span> <span className="text-gray-200 break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pods */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-white mb-4">Pods</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700/50">
              <th className="text-left py-2">Name</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Restarts</th>
              <th className="text-left py-2">IP</th>
              <th className="text-left py-2">Node</th>
              <th className="text-left py-2">Age</th>
            </tr>
          </thead>
          <tbody>
            {pods.map(pod => (
              <tr key={pod.name} className="border-b border-gray-700/30">
                <td className="py-2">
                  <Link to={`/pods/${pod.name}`} className="text-k8s-blue hover:underline font-mono">{pod.name}</Link>
                </td>
                <td className="py-2"><StatusBadge status={pod.status} /></td>
                <td className="py-2 text-gray-300">{pod.restarts}</td>
                <td className="py-2 text-gray-400 font-mono">{pod.ip}</td>
                <td className="py-2 text-gray-400">{pod.node}</td>
                <td className="py-2 text-gray-500">{timeAgo(pod.age)}</td>
              </tr>
            ))}
            {pods.length === 0 && (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">No pods found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* YAML Modal */}
      {showYaml && (
        <YamlModal data={deployment} title={`Deployment: ${name}`} onClose={() => setShowYaml(false)} />
      )}

      {/* Rollout History Modal */}
      {showRollout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRollout(false)} />
          <div className="relative bg-card border border-gray-700/50 rounded-lg shadow-xl w-full max-w-3xl max-h-[70vh] mx-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
              <h3 className="text-lg font-medium text-white">Rollout History</h3>
              <button onClick={() => setShowRollout(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700/50">
                    <th className="text-left py-2">Rev</th>
                    <th className="text-left py-2">Image Tag</th>
                    <th className="text-left py-2">Replicas</th>
                    <th className="text-left py-2">Created</th>
                    <th className="text-left py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rolloutHistory.map((rs, i) => {
                    const tag = rs.image?.split(':')[1] || 'latest';
                    return (
                      <tr key={rs.name} className="border-b border-gray-700/30">
                        <td className="py-2 font-mono">{rs.revision}</td>
                        <td className="py-2">
                          <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">{tag}</span>
                        </td>
                        <td className="py-2 text-gray-300">{rs.replicas}</td>
                        <td className="py-2 text-gray-500">{timeAgo(rs.creationTimestamp)}</td>
                        <td className="py-2">
                          {i === 0 ? (
                            <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-[10px]">Current</span>
                          ) : (
                            <button onClick={() => handleRollback(rs.name)} className="text-k8s-blue hover:underline text-xs">
                              Rollback
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
