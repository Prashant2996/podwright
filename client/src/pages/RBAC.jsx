import { useState } from 'react';
import { useToast } from '../components/Toast';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export default function RBAC({ namespace }) {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState('');
  const { addToast } = useToast();

  const fetchPermissions = async () => {
    if (!namespace) {
      addToast('Select a namespace first', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/rbac/permissions/${namespace}`);
      const data = await res.json();
      setPermissions(data.permissions);
      setUser(data.user);
    } catch (e) {
      addToast('Failed to check permissions: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const verbs = ['get', 'list', 'create', 'update', 'delete'];

  const resourceLabels = {
    pods: 'Pods',
    deployments: 'Deployments',
    services: 'Services',
    configmaps: 'ConfigMaps',
    secrets: 'Secrets',
    jobs: 'Jobs',
    cronjobs: 'CronJobs',
    statefulsets: 'StatefulSets',
    daemonsets: 'DaemonSets',
    ingresses: 'Ingresses',
    persistentvolumeclaims: 'PVCs',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-white">RBAC Permissions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Check what your user can do in namespace <span className="text-white font-medium">{namespace}</span>
          </p>
        </div>
        <button onClick={fetchPermissions} disabled={loading} className="btn-primary">
          {loading ? 'Checking...' : 'Check Permissions'}
        </button>
      </div>

      {loading && <LoadingSkeleton rows={8} />}

      {!loading && !permissions && (
        <div className="card p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-gray-500 mb-1">Check your RBAC permissions in this namespace</p>
          <p className="text-xs text-gray-600">Uses SelfSubjectAccessReview to determine what actions you can perform</p>
        </div>
      )}

      {!loading && permissions && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="card p-4">
            <div className="flex items-center gap-3 mb-1">
              <svg className="w-4 h-4 text-k8s-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm text-white font-medium">{user}</span>
              <span className="text-xs text-gray-500">in</span>
              <span className="text-sm text-k8s-blue font-medium">{namespace}</span>
            </div>
            {(() => {
              const total = Object.keys(permissions).length * verbs.length;
              const allowed = Object.values(permissions).reduce(
                (sum, verbs_obj) => sum + Object.values(verbs_obj).filter(v => v).length, 0
              );
              const pct = Math.round((allowed / total) * 100);
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-400">{allowed}/{total} permissions allowed</span>
                    <span className={`font-medium ${pct === 100 ? 'text-green-400' : pct > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Permissions Matrix */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Resource</th>
                  {verbs.map(v => (
                    <th key={v} className="text-center px-3 py-3 text-gray-400 font-medium capitalize text-xs">{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissions).map(([resource, resourceVerbs]) => (
                  <tr key={resource} className="border-b border-gray-700/30">
                    <td className="px-4 py-2.5 text-white text-xs font-medium">
                      {resourceLabels[resource] || resource}
                    </td>
                    {verbs.map(verb => (
                      <td key={verb} className="text-center px-3 py-2.5">
                        {resourceVerbs[verb] ? (
                          <svg className="w-4 h-4 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Allowed
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Denied
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
