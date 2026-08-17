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

export default function Pods({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [pods, setPods] = useState([]);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/pods/${namespace}`);
      const data = await res.json();
      setPods(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  const handleDelete = async (podName) => {
    const ok = await confirm({
      title: 'Delete Pod',
      message: `Are you sure you want to delete pod "${podName}"? It will be recreated by its controller.`,
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/pods/${namespace}/${podName}`, { method: 'DELETE' });
      if (res.ok) {
        addToast(`Deleted pod ${podName}`, 'success');
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Delete failed', 'error');
      }
    } catch (e) {
      addToast('Delete failed: ' + e.message, 'error');
    }
  };

  const handleDownloadLogs = async (podName) => {
    try {
      const podRes = await fetch(`/api/pods/${namespace}/${podName}`);
      const podData = await podRes.json();
      const containers = podData.spec?.containers || [];

      let allLogs = '';
      for (const c of containers) {
        const logRes = await fetch(`/api/pods/${namespace}/${podName}/logs?container=${c.name}`);
        const logText = await logRes.text();
        allLogs += `${'='.repeat(60)}\nContainer: ${c.name}\n${'='.repeat(60)}\n${logText}\n\n`;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([allLogs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${podName}_all-containers_${timestamp}.log`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Logs downloaded', 'success');
    } catch (e) {
      addToast('Download failed: ' + e.message, 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={8} />;

  const columns = [
    {
      header: 'Name',
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link to={`/pods/${row.name}`} className="text-k8s-blue hover:underline font-mono text-xs truncate max-w-[220px]">
            {row.name}
          </Link>
          <CopyButton text={row.name} />
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    { header: 'Restarts', accessor: 'restarts' },
    { header: 'Containers', accessor: 'containers' },
    {
      header: 'IP',
      accessor: 'ip',
      render: (row) => <span className="font-mono text-xs text-gray-400">{row.ip}</span>,
    },
    {
      header: 'Node',
      accessor: 'node',
      render: (row) => <span className="text-gray-400 text-xs truncate block max-w-[120px]">{row.node}</span>,
    },
    {
      header: 'Age',
      accessor: 'age',
      render: (row) => <span className="text-gray-500">{timeAgo(row.age)}</span>,
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-4">Pods</h2>
      <div className="card p-4">
        <ResourceTable
          columns={columns}
          data={pods}
          actions={(row) => (
            <>
              <Link to={`/pods/${row.name}?tab=logs`} className="text-gray-400 hover:text-white" title="Logs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </Link>
              <button onClick={() => handleDownloadLogs(row.name)} className="text-gray-400 hover:text-white" title="Download Logs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button onClick={() => handleDelete(row.name)} className="text-gray-400 hover:text-red-400" title="Delete">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        />
      </div>
    </div>
  );
}
