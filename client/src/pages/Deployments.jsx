import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import StatusBadge from '../components/StatusBadge';
import CopyButton from '../components/CopyButton';
import ResourceTable from '../components/ResourceTable';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function Deployments({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [deployments, setDeployments] = useState([]);
  const [editingTag, setEditingTag] = useState(null);
  const [newTag, setNewTag] = useState('');
  const { addToast } = useToast();
  const confirm = useConfirm();

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/deployments/${namespace}`);
      const data = await res.json();
      setDeployments(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  const handleScale = async (name, currentReplicas) => {
    const replicas = prompt('Scale to how many replicas?', currentReplicas);
    if (replicas === null) return;
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/scale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicas: parseInt(replicas) }),
      });
      if (res.ok) {
        addToast(`Scaled ${name} to ${replicas} replicas`, 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Scale failed', 'error');
      }
    } catch (e) {
      addToast('Scale failed: ' + e.message, 'error');
    }
  };

  const handleRestart = async (name) => {
    try {
      const res = await fetch(`/api/deployments/${namespace}/${name}/restart`, { method: 'POST' });
      if (res.ok) {
        addToast(`Restarted ${name}`, 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Restart failed', 'error');
      }
    } catch (e) {
      addToast('Restart failed: ' + e.message, 'error');
    }
  };

  const handleScaleAll = async (replicas) => {
    const ok = await confirm({
      title: replicas === 0 ? 'Scale All to Zero' : `Scale All to ${replicas}`,
      message: replicas === 0
        ? `This will scale ALL ${deployments.length} deployments in ${namespace} to 0 replicas. This is destructive.`
        : `This will scale ALL ${deployments.length} deployments in ${namespace} to ${replicas} replicas.`,
      variant: replicas === 0 ? 'danger' : 'default',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/deployments/${namespace}/scale-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicas }),
      });
      if (res.ok) {
        addToast(`Scaled all deployments to ${replicas}`, 'success');
        fetchData();
      }
    } catch (e) {
      addToast('Scale all failed: ' + e.message, 'error');
    }
  };

  const handleRestartAll = async () => {
    const ok = await confirm({
      title: 'Restart All Deployments',
      message: `This will restart ALL ${deployments.length} deployments in ${namespace}.`,
      variant: 'default',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/deployments/${namespace}/restart-all`, { method: 'POST' });
      if (res.ok) {
        addToast('Restarted all deployments', 'success');
        fetchData();
      }
    } catch (e) {
      addToast('Restart all failed: ' + e.message, 'error');
    }
  };

  const handleTagEdit = (dep) => {
    setEditingTag(dep.name);
    setNewTag(dep.tag);
  };

  const handleTagSave = async (dep) => {
    if (!newTag || newTag === dep.tag) {
      setEditingTag(null);
      return;
    }
    const image = dep.image.split(':')[0] + ':' + newTag;
    try {
      const res = await fetch(`/api/deployments/${namespace}/${dep.name}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      if (res.ok) {
        addToast(`Updated ${dep.name} to tag ${newTag}`, 'success');
        setEditingTag(null);
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Update failed', 'error');
      }
    } catch (e) {
      addToast('Update failed: ' + e.message, 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={8} />;

  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link to={`/deployments/${row.name}`} className="text-k8s-blue hover:underline text-xs">
            {row.name}
          </Link>
          <CopyButton text={row.name} />
        </div>
      ),
    },
    { header: 'Ready', accessor: 'ready' },
    {
      header: 'Version/Tag',
      accessor: 'tag',
      render: (row) => {
        if (editingTag === row.name) {
          return (
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleTagSave(row);
                if (e.key === 'Escape') setEditingTag(null);
              }}
              onBlur={() => setEditingTag(null)}
              className="bg-transparent border border-purple-500 rounded px-1.5 py-0.5 text-xs text-purple-300 w-28 focus:outline-none"
              autoFocus
            />
          );
        }
        return (
          <button onClick={() => handleTagEdit(row)} className="inline-flex items-center gap-1 group">
            <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">{row.tag}</span>
            <svg className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        );
      },
    },
    { header: 'Up to Date', accessor: 'updatedReplicas' },
    { header: 'Available', accessor: 'availableReplicas' },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Age',
      accessor: 'age',
      render: (row) => <span className="text-gray-500">{timeAgo(row.age)}</span>,
    },
    {
      header: 'Image',
      accessor: 'image',
      render: (row) => (
        <span className="font-mono text-[10px] text-gray-500 truncate block max-w-[160px]" title={row.image}>
          {row.image}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">Deployments</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => handleScaleAll(0)} className="btn-danger btn-sm flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Scale All to 0
          </button>
          <button onClick={() => {
            const count = prompt('Scale all to how many replicas?', '1');
            if (count) handleScaleAll(parseInt(count));
          }} className="btn-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-md text-xs flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            Scale All Up
          </button>
          <button onClick={handleRestartAll} className="btn-sm bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-md text-xs flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restart All
          </button>
        </div>
      </div>

      <div className="card p-4">
        <ResourceTable
          columns={columns}
          data={deployments}
          onRowClick={null}
          actions={(row) => (
            <>
              <button onClick={() => handleScale(row.name, row.replicas)} className="text-xs text-gray-400 hover:text-white" title="Scale">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              <button onClick={() => handleRestart(row.name)} className="text-xs text-gray-400 hover:text-white" title="Restart">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </>
          )}
        />
      </div>
    </div>
  );
}
