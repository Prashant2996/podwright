import { useState } from 'react';
import { useToast } from '../components/Toast';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export default function Compare({ namespaces }) {
  const [ns1, setNs1] = useState('');
  const [ns2, setNs2] = useState('');
  const [resourceType, setResourceType] = useState('deployments');
  const [results, setResults] = useState(null);
  const [cmDetail, setCmDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleCompare = async () => {
    if (!ns1 || !ns2) {
      addToast('Select both namespaces', 'error');
      return;
    }
    setLoading(true);
    setCmDetail(null);
    try {
      const res = await fetch(`/api/compare/${resourceType}?ns1=${ns1}&ns2=${ns2}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      addToast('Compare failed: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const handleClone = async (name, direction) => {
    const source = direction === 'right' ? ns1 : ns2;
    const target = direction === 'right' ? ns2 : ns1;
    
    if (!window.confirm(`Clone "${name}" from ${source} to ${target}? This only works for stateless services.`)) return;

    try {
      const res = await fetch('/api/clone-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNamespace: source, targetNamespace: target, deploymentName: name }),
      });
      if (res.ok) {
        addToast(`Cloned ${name} to ${target}`, 'success');
        handleCompare();
      } else {
        const err = await res.json();
        addToast(err.error || 'Clone failed', 'error');
      }
    } catch (e) {
      addToast('Clone failed: ' + e.message, 'error');
    }
  };

  const handleCmDiff = async (name) => {
    try {
      const res = await fetch(`/api/compare/configmap-detail?ns1=${ns1}&ns2=${ns2}&name=${name}`);
      const data = await res.json();
      setCmDetail(data);
    } catch (e) {
      addToast('Failed to load diff', 'error');
    }
  };

  const statusColors = {
    same: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Same' },
    different: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Different' },
    'only-left': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Only Left' },
    'only-right': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Only Right' },
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-6">Compare Namespaces</h2>

      {/* Controls */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={ns1} onChange={e => setNs1(e.target.value)} className="input w-48">
            <option value="">Left namespace</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>

          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>

          <select value={ns2} onChange={e => setNs2(e.target.value)} className="input w-48">
            <option value="">Right namespace</option>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>

          <select value={resourceType} onChange={e => setResourceType(e.target.value)} className="input w-40">
            <option value="deployments">Deployments</option>
            <option value="configmaps">ConfigMaps</option>
          </select>

          <button onClick={handleCompare} disabled={loading} className="btn-primary">
            Compare
          </button>
        </div>
      </div>

      {loading && <LoadingSkeleton rows={8} />}

      {/* Deployment comparison */}
      {!loading && results && resourceType === 'deployments' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Deployment</th>
                <th className="text-left px-4 py-3 text-blue-400 font-medium">Left Tag</th>
                <th className="text-left px-4 py-3 text-blue-400 font-medium">Left Ready</th>
                <th className="text-left px-4 py-3 text-purple-400 font-medium">Right Tag</th>
                <th className="text-left px-4 py-3 text-purple-400 font-medium">Right Ready</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Diff</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const status = statusColors[r.status] || statusColors.same;
                return (
                  <tr key={r.name} className="border-b border-gray-700/30">
                    <td className="px-4 py-3 text-white text-xs font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      {r.leftTag !== '-' ? (
                        <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px]">{r.leftTag}</span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{r.leftReady}</td>
                    <td className="px-4 py-3">
                      {r.rightTag !== '-' ? (
                        <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">{r.rightTag}</span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{r.rightReady}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${status.bg} ${status.text}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'only-left' && (
                        <button onClick={() => handleClone(r.name, 'right')} className="text-xs text-k8s-blue hover:underline">
                          Clone &rarr;
                        </button>
                      )}
                      {r.status === 'only-right' && (
                        <button onClick={() => handleClone(r.name, 'left')} className="text-xs text-k8s-blue hover:underline">
                          &larr; Clone
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Legend */}
          <div className="px-4 py-3 border-t border-gray-700/50 flex gap-4 flex-wrap">
            {Object.entries(statusColors).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px]">
                <span className={`w-2.5 h-2.5 rounded-full ${val.bg} border ${val.text}`} />
                <span className="text-gray-400">{val.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ConfigMap comparison */}
      {!loading && results && resourceType === 'configmaps' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">ConfigMap</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Left Keys</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Right Keys</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => {
                  const status = statusColors[r.status] || statusColors.same;
                  return (
                    <tr key={r.name} className="border-b border-gray-700/30">
                      <td className="px-4 py-3 text-white text-xs font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{r.leftKeys}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{r.rightKeys}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${status.bg} ${status.text}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'different' && (
                          <button onClick={() => handleCmDiff(r.name)} className="text-xs text-k8s-blue hover:underline">
                            Diff
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ConfigMap Detail Diff */}
          {cmDetail && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white">Diff: {cmDetail.name}</h3>
                <button onClick={() => setCmDetail(null)} className="text-gray-400 hover:text-white">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3">
                {cmDetail.keys?.map(k => {
                  const keyStatus = statusColors[k.status] || statusColors.same;
                  return (
                    <div key={k.key} className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${keyStatus.bg}`} />
                        <span className="text-xs font-medium text-white">{k.key}</span>
                        <span className={`text-[10px] ${keyStatus.text}`}>{keyStatus.label}</span>
                      </div>
                      {k.status === 'different' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-900 rounded p-2">
                            <p className="text-[10px] text-blue-400 mb-1">Left</p>
                            <pre className="text-[10px] text-gray-300 whitespace-pre-wrap break-all max-h-32 overflow-auto">{k.leftValue}</pre>
                          </div>
                          <div className="bg-gray-900 rounded p-2">
                            <p className="text-[10px] text-purple-400 mb-1">Right</p>
                            <pre className="text-[10px] text-gray-300 whitespace-pre-wrap break-all max-h-32 overflow-auto">{k.rightValue}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
