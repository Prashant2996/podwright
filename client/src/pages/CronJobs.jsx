import { useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import ResourceTable from '../components/ResourceTable';
import StatusBadge from '../components/StatusBadge';
import YamlModal from '../components/YamlModal';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function CronJobs({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [cronjobs, setCronjobs] = useState([]);
  const [yamlData, setYamlData] = useState(null);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/cronjobs/${namespace}`);
      const data = await res.json();
      setCronjobs(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  const handleTrigger = async (name) => {
    const ok = await confirm({
      title: 'Trigger CronJob',
      message: `This will create a manual Job from CronJob "${name}".`,
      variant: 'default',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cronjobs/${namespace}/${name}/trigger`, { method: 'POST' });
      if (res.ok) {
        addToast(`Triggered ${name}`, 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Trigger failed', 'error');
      }
    } catch (e) {
      addToast('Trigger failed: ' + e.message, 'error');
    }
  };

  const handleSuspend = async (name, suspend) => {
    try {
      const res = await fetch(`/api/cronjobs/${namespace}/${name}/suspend`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend }),
      });
      if (res.ok) {
        addToast(`${suspend ? 'Suspended' : 'Resumed'} ${name}`, 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Operation failed', 'error');
      }
    } catch (e) {
      addToast('Operation failed: ' + e.message, 'error');
    }
  };

  const handleSuspendAll = async () => {
    const ok = await confirm({
      title: 'Suspend All CronJobs',
      message: `This will suspend ALL ${cronjobs.length} CronJobs in ${namespace}.`,
      variant: 'danger',
    });
    if (!ok) return;

    for (const cj of cronjobs) {
      await handleSuspend(cj.name, true);
    }
  };

  const handleResumeAll = async () => {
    const ok = await confirm({
      title: 'Resume All CronJobs',
      message: `This will resume ALL ${cronjobs.length} CronJobs in ${namespace}.`,
      variant: 'default',
    });
    if (!ok) return;

    for (const cj of cronjobs) {
      await handleSuspend(cj.name, false);
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;

  const columns = [
    { header: 'Name', accessor: 'name', render: (row) => <span className="text-white text-xs font-medium">{row.name}</span> },
    { header: 'Schedule', accessor: 'schedule', render: (row) => <span className="font-mono text-xs text-gray-300">{row.schedule}</span> },
    { header: 'Suspend', accessor: 'suspend', render: (row) => (
      <StatusBadge status={row.suspend ? 'Suspended' : 'Active'} />
    )},
    { header: 'Active', accessor: 'active' },
    { header: 'Last Schedule', accessor: 'lastSchedule', render: (row) => <span className="text-gray-500 text-xs">{row.lastSchedule ? timeAgo(row.lastSchedule) : '-'}</span> },
    { header: 'Age', accessor: 'age', render: (row) => <span className="text-gray-500 text-xs">{timeAgo(row.age)}</span> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">CronJobs</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleSuspendAll} className="btn-secondary btn-sm text-xs">Suspend All</button>
          <button onClick={handleResumeAll} className="btn-primary btn-sm text-xs">Resume All</button>
        </div>
      </div>
      <div className="card p-4">
        <ResourceTable
          columns={columns}
          data={cronjobs}
          actions={(row) => (
            <>
              <button onClick={() => handleTrigger(row.name)} className="text-gray-400 hover:text-green-400" title="Trigger">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {row.suspend ? (
                <button onClick={() => handleSuspend(row.name, false)} className="text-gray-400 hover:text-green-400" title="Resume">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                </button>
              ) : (
                <button onClick={() => handleSuspend(row.name, true)} className="text-gray-400 hover:text-yellow-400" title="Suspend">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              <button onClick={() => setYamlData(row)} className="text-gray-400 hover:text-white" title="View YAML">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </button>
            </>
          )}
        />
      </div>
      {yamlData && <YamlModal data={yamlData} title={`CronJob: ${yamlData.name}`} onClose={() => setYamlData(null)} />}
    </div>
  );
}
