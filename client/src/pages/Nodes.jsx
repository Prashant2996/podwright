import { useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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

export default function Nodes() {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [yamlData, setYamlData] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      const data = await res.json();
      setNodes(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, []);

  useAutoRefresh(fetchData, []);

  if (loading) return <LoadingSkeleton rows={6} />;

  const columns = [
    { header: 'Name', accessor: 'name', render: (row) => <span className="text-white text-xs font-medium">{row.name}</span> },
    { header: 'Status', accessor: 'status', render: (row) => <StatusBadge status={row.status} /> },
    { header: 'Roles', accessor: 'roles' },
    { header: 'Version', accessor: 'version', render: (row) => <span className="font-mono text-xs text-gray-400">{row.version}</span> },
    { header: 'CPU', accessor: 'cpu' },
    { header: 'Memory', accessor: 'memory' },
    { header: 'OS', accessor: 'os', render: (row) => <span className="text-xs text-gray-400 truncate block max-w-[150px]">{row.os}</span> },
    { header: 'Age', accessor: 'age', render: (row) => <span className="text-gray-500 text-xs">{timeAgo(row.age)}</span> },
  ];

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-4">Nodes</h2>
      <div className="card p-4">
        <ResourceTable
          columns={columns}
          data={nodes}
          actions={(row) => (
            <button onClick={() => setYamlData(row)} className="text-gray-400 hover:text-white" title="View Details">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
          )}
        />
      </div>
      {yamlData && <YamlModal data={yamlData} title={`Node: ${yamlData.name}`} onClose={() => setYamlData(null)} />}
    </div>
  );
}
