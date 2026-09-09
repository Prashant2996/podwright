import { useState, useCallback, useEffect } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import ResourceTable from '../components/ResourceTable';
import ResourceViewModal from '../components/ResourceViewModal';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function CustomResources({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [crds, setCrds] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // the chosen CRD object
  const [instances, setInstances] = useState([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instancesError, setInstancesError] = useState('');
  const [viewInstance, setViewInstance] = useState(null);

  const fetchCrds = useCallback(async () => {
    try {
      const res = await fetch('/api/crds');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load CRDs');
        setCrds([]);
      } else {
        setError('');
        setCrds(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useAutoRefresh(fetchCrds, []);

  const fetchInstances = useCallback(async (crd) => {
    if (!crd) return;
    setInstancesLoading(true);
    setInstancesError('');
    try {
      // Namespaced CRDs are scoped to the current namespace; cluster-scoped list all.
      const nsQuery = crd.scope === 'Namespaced' && namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
      const res = await fetch(`/api/custom-resources/${encodeURIComponent(crd.selector)}${nsQuery}`);
      const data = await res.json();
      if (!res.ok) {
        setInstancesError(data.error || 'Failed to load instances');
        setInstances([]);
      } else {
        setInstances(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setInstancesError(e.message);
    }
    setInstancesLoading(false);
  }, [namespace]);

  // Reload instances when the selected CRD or namespace changes.
  useEffect(() => {
    if (selected) fetchInstances(selected);
  }, [selected, namespace, fetchInstances]);

  if (loading) return <LoadingSkeleton rows={8} />;

  const crdColumns = [
    { header: 'Kind', accessor: 'kind', render: (row) => <span className="text-white text-xs font-medium">{row.kind}</span> },
    { header: 'Group', accessor: 'group', render: (row) => <span className="font-mono text-[11px] text-gray-400">{row.group}</span> },
    { header: 'Version', accessor: 'version', render: (row) => <span className="text-xs text-gray-300">{row.version}</span> },
    { header: 'Scope', accessor: 'scope', render: (row) => (
      <span className={`text-xs px-2 py-0.5 rounded ${row.scope === 'Namespaced' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
        {row.scope}
      </span>
    )},
    { header: 'Age', accessor: 'age', render: (row) => <span className="text-gray-500 text-xs">{timeAgo(row.age)}</span> },
  ];

  const instanceColumns = [
    { header: 'Name', accessor: 'name', render: (row) => <span className="text-white text-xs font-medium">{row.name}</span> },
    ...(selected?.scope === 'Namespaced'
      ? [{ header: 'Namespace', accessor: 'namespace', render: (row) => <span className="text-xs text-gray-400">{row.namespace || '-'}</span> }]
      : []),
    { header: 'Age', accessor: 'age', render: (row) => <span className="text-gray-500 text-xs">{timeAgo(row.age)}</span> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">Custom Resources</h2>
        {selected && (
          <button onClick={() => { setSelected(null); setInstances([]); }} className="btn-secondary btn-sm">
            &larr; All CRDs
          </button>
        )}
      </div>

      {!selected ? (
        <div className="card p-4">
          {error ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : crds.length === 0 ? (
            <div className="text-gray-500 text-sm py-8 text-center">
              No CustomResourceDefinitions found in this cluster.
            </div>
          ) : (
            <ResourceTable
              columns={crdColumns}
              data={crds}
              onRowClick={(row) => setSelected(row)}
            />
          )}
        </div>
      ) : (
        <div className="card p-4">
          <div className="mb-3">
            <p className="text-sm text-white font-medium">{selected.kind} <span className="text-gray-500 font-mono text-xs">({selected.selector})</span></p>
            <p className="text-xs text-gray-500">
              {selected.scope === 'Namespaced' ? `Namespace: ${namespace || 'all'}` : 'Cluster-scoped'}
            </p>
          </div>
          {instancesLoading ? (
            <LoadingSkeleton rows={4} />
          ) : instancesError ? (
            <div className="text-red-400 text-sm">{instancesError}</div>
          ) : (
            <ResourceTable
              columns={instanceColumns}
              data={instances}
              actions={(row) => (
                <button onClick={() => setViewInstance(row)} className="text-gray-400 hover:text-white" title="View YAML / Describe">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </button>
              )}
            />
          )}
        </div>
      )}

      {viewInstance && selected && (
        <ResourceViewModal
          kind={selected.selector}
          name={viewInstance.name}
          namespace={selected.scope === 'Namespaced' ? (viewInstance.namespace || namespace) : undefined}
          title={`${selected.kind}: ${viewInstance.name}`}
          onClose={() => setViewInstance(null)}
          onDeleted={() => fetchInstances(selected)}
        />
      )}
    </div>
  );
}
