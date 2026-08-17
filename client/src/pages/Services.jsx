import { useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import ResourceTable from '../components/ResourceTable';
import YamlModal from '../components/YamlModal';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function Services({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [yamlData, setYamlData] = useState(null);

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/services/${namespace}`);
      const data = await res.json();
      setServices(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  if (loading) return <LoadingSkeleton rows={8} />;

  const columns = [
    { header: 'Name', accessor: 'name', render: (row) => <span className="text-white text-xs font-medium">{row.name}</span> },
    { header: 'Type', accessor: 'type', render: (row) => (
      <span className={`text-xs px-2 py-0.5 rounded ${
        row.type === 'LoadBalancer' ? 'bg-blue-500/20 text-blue-300' :
        row.type === 'NodePort' ? 'bg-purple-500/20 text-purple-300' :
        'bg-gray-700/50 text-gray-300'
      }`}>{row.type}</span>
    )},
    { header: 'Cluster IP', accessor: 'clusterIP', render: (row) => <span className="font-mono text-xs text-gray-400">{row.clusterIP}</span> },
    { header: 'External IP', accessor: 'externalIP', render: (row) => <span className="font-mono text-xs text-gray-400">{row.externalIP}</span> },
    { header: 'Ports', accessor: 'ports', render: (row) => <span className="text-xs text-gray-300 truncate block max-w-[180px]">{row.ports}</span> },
    { header: 'Age', accessor: 'age', render: (row) => <span className="text-gray-500 text-xs">{timeAgo(row.age)}</span> },
  ];

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-4">Services</h2>
      <div className="card p-4">
        <ResourceTable
          columns={columns}
          data={services}
          actions={(row) => (
            <button onClick={() => setYamlData(row)} className="text-gray-400 hover:text-white" title="View YAML">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
          )}
        />
      </div>
      {yamlData && <YamlModal data={yamlData} title={`Service: ${yamlData.name}`} onClose={() => setYamlData(null)} />}
    </div>
  );
}
