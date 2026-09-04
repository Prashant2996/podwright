import { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';

const STORAGE_KEY = 'podwright-cleanup-allowed-namespaces';
const RBAC_MODE_KEY = 'podwright-cleanup-use-rbac';

function getAllowedNamespaces() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveAllowedNamespaces(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function getUseRbac() {
  return localStorage.getItem(RBAC_MODE_KEY) === 'true';
}

function saveUseRbac(val) {
  localStorage.setItem(RBAC_MODE_KEY, String(val));
}

export default function NamespaceCleanup({ namespace, namespaces }) {
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [allowedList, setAllowedList] = useState(getAllowedNamespaces);
  const [useRbac, setUseRbac] = useState(getUseRbac);
  const [hasDeleteAccess, setHasDeleteAccess] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const pollRef = useRef(null);
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Check RBAC if rbac mode is on
  useEffect(() => {
    if (!namespace || !useRbac) return;
    checkPermissions();
  }, [namespace, useRbac]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function checkPermissions() {
    setCheckingAccess(true);
    try {
      const res = await fetch(`/api/rbac/can-i?verb=delete&resource=pods&namespace=${namespace}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Backend not reachable' : text);
      }
      const data = await res.json();
      setHasDeleteAccess(data.allowed);
    } catch (e) {
      setHasDeleteAccess(false);
    }
    setCheckingAccess(false);
  }

  // Access logic:
  // - If allowed list has entries: namespace must be in the list
  // - If allowed list is empty AND useRbac is on: use RBAC delete permission
  // - If allowed list is empty AND useRbac is off: show setup prompt
  const isInAllowedList = allowedList.includes(namespace);
  const isAllowed = allowedList.length > 0
    ? isInAllowedList
    : useRbac ? hasDeleteAccess : false;

  const handleAddNamespace = (ns) => {
    if (!ns || allowedList.includes(ns)) return;
    const updated = [...allowedList, ns];
    setAllowedList(updated);
    saveAllowedNamespaces(updated);
  };

  const handleRemoveNamespace = (ns) => {
    const updated = allowedList.filter(n => n !== ns);
    setAllowedList(updated);
    saveAllowedNamespaces(updated);
  };

  const handleToggleRbac = (val) => {
    setUseRbac(val);
    saveUseRbac(val);
    if (val && namespace) checkPermissions();
  };

  const handleScan = async () => {
    if (!namespace) return;
    setScanning(true);
    try {
      const res = await fetch(`/api/cleanup/${namespace}/preview`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Backend not reachable - restart the server' : text);
      }
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      addToast('Scan failed: ' + e.message, 'error');
    }
    setScanning(false);
  };

  const executeCleanup = async (actions, description) => {
    const ok = await confirm({
      title: 'Confirm Cleanup',
      message: `${description}\n\nThis will execute in namespace "${namespace}". This action cannot be undone.`,
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cleanup/${namespace}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.startsWith('<') ? 'Backend not reachable' : text);
      }
      const data = await res.json();
      if (data.jobId) {
        setActiveJob({ id: data.jobId, status: 'running', steps: [], completed: 0, total: actions.length });
        startPolling(data.jobId);
      }
    } catch (e) {
      addToast('Execute failed: ' + e.message, 'error');
    }
  };

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/cleanup/job/${jobId}`);
        if (!res.ok) throw new Error('poll failed');
        const data = await res.json();
        setActiveJob(data);
        if (data.status === 'completed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          addToast('Cleanup completed', 'success');
        }
      } catch (e) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 1000);
  };

  // Not allowed screen
  if (!isAllowed && !checkingAccess) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">Namespace Cleanup</h2>
          <button onClick={() => setShowSettings(true)} className="btn-secondary btn-sm text-xs">
            Manage Allowed Namespaces
          </button>
        </div>
        <div className="card p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-yellow-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-gray-400 mb-2">Cleanup not available for "{namespace}"</p>
          <p className="text-xs text-gray-500 mb-4">
            Add this namespace to your allowed list to enable cleanup.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => { handleAddNamespace(namespace); }}
              className="btn-primary btn-sm"
            >
              Allow "{namespace}"
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="btn-secondary btn-sm"
            >
              Open Settings
            </button>
          </div>
        </div>

        {showSettings && (
          <SettingsModal
            namespaces={namespaces}
            allowedList={allowedList}
            useRbac={useRbac}
            onAdd={handleAddNamespace}
            onRemove={handleRemoveNamespace}
            onToggleRbac={handleToggleRbac}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-white">Namespace Cleanup</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isInAllowedList ? (
              <span className="text-green-400">Access granted (in allowed list)</span>
            ) : useRbac ? (
              <span className="text-blue-400">Access granted via RBAC (delete permission)</span>
            ) : (
              <span className="text-green-400">Access granted</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(true)} className="btn-secondary btn-sm text-xs">
            Settings
          </button>
          <button onClick={handleScan} disabled={scanning} className="btn-primary">
            {scanning ? 'Scanning...' : 'Scan Namespace'}
          </button>
        </div>
      </div>

      {!preview && !scanning && (
        <div className="card p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <p className="text-gray-500">Click "Scan Namespace" to preview cleanup actions</p>
        </div>
      )}

      {preview && (
        <div className="space-y-6">
          {/* Resource Cleanup Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CleanupCard
              title="Completed Pods & Jobs"
              count={preview.completedPods + (preview.completedJobs || 0)}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              onExecute={() => executeCleanup(
                [{ name: 'Delete completed pods and jobs', type: 'delete-completed-pods' }],
                `Delete ${preview.completedPods} completed/failed pods in ${namespace}`
              )}
            />
            <CleanupCard
              title="Kafka Topics"
              count={preview.kafkaTopics}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
              onExecute={() => executeCleanup(
                [{ name: 'Delete kafka topics', type: 'delete-kafka-topics' }],
                `Delete all ${preview.kafkaTopics} Kafka topics in ${namespace}`
              )}
            />
            <CleanupCard
              title="Helm Releases"
              count={preview.helmReleases?.length || 0}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              }
              onExecute={() => executeCleanup(
                (preview.helmReleases || []).map(r => ({ name: `Uninstall ${r}`, type: 'helm-uninstall', params: { release: r } })),
                `Uninstall all ${preview.helmReleases?.length || 0} Helm releases in ${namespace}`
              )}
            />
            <CleanupCard
              title="Scale Down All"
              count="All deployments"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              }
              onExecute={() => executeCleanup(
                [{ name: 'Scale down all deployments', type: 'scale-down-all' }],
                `Scale ALL deployments to 0 replicas in ${namespace}`
              )}
              variant="danger"
            />
          </div>

          {/* Helm Releases List */}
          {preview.helmReleases?.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-medium text-white mb-3">Helm Releases ({preview.helmReleases.length})</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {preview.helmReleases.map(release => (
                  <div key={release} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/50">
                    <span className="text-xs font-mono text-gray-300">{release}</span>
                    <button
                      onClick={() => executeCleanup(
                        [{ name: `Uninstall ${release}`, type: 'helm-uninstall', params: { release } }],
                        `Uninstall Helm release "${release}" in ${namespace}`
                      )}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Uninstall
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single-service cleanup */}
          <div className="card p-4 border-orange-500/30 bg-orange-500/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-orange-400">Clean Up a Single Service</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Delete everything tied to one service: its deployment, service, ingress, HPA,
                  configmaps, secrets, PVCs, and any Helm release. Matches by name and by the
                  <code className="mx-1 px-1 rounded bg-gray-800 text-gray-300">app=&lt;name&gt;</code>
                  label. This is destructive and cannot be undone.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="text"
                    value={serviceName}
                    onChange={e => setServiceName(e.target.value)}
                    placeholder="service name (e.g. checkout-api)"
                    className="input text-sm flex-1 max-w-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && serviceName.trim()) {
                        executeCleanup(
                          [{ name: `Clean up service "${serviceName.trim()}"`, type: 'cleanup-service', params: { service: serviceName.trim() } }],
                          `Delete ALL resources for service "${serviceName.trim()}" in ${namespace} (deployment, service, ingress, HPA, configmaps, secrets, PVCs, Helm release)`
                        );
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const svc = serviceName.trim();
                      if (!svc) return;
                      executeCleanup(
                        [{ name: `Clean up service "${svc}"`, type: 'cleanup-service', params: { service: svc } }],
                        `Delete ALL resources for service "${svc}" in ${namespace} (deployment, service, ingress, HPA, configmaps, secrets, PVCs, Helm release)`
                      );
                    }}
                    disabled={!serviceName.trim()}
                    className="btn-danger btn-sm disabled:opacity-50"
                  >
                    Clean Service
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full Cleanup */}
          <div className="card p-4 border-red-500/30 bg-red-500/5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-red-400">Full Cleanup</h3>
                <p className="text-xs text-gray-500 mt-1">Run all cleanup steps combined. This is destructive.</p>
              </div>
              <button
                onClick={() => executeCleanup(
                  [
                    { name: 'Delete completed & failed pods', type: 'delete-completed-pods' },
                    ...(preview.helmReleases || []).map(r => ({ name: `Uninstall ${r}`, type: 'helm-uninstall', params: { release: r } })),
                    { name: 'Delete kafka topics', type: 'delete-kafka-topics' },
                    { name: 'Scale down all', type: 'scale-down-all' },
                  ],
                  `Run FULL cleanup on ${namespace}: delete pods, uninstall all Helm releases, delete Kafka topics, scale down all deployments`
                )}
                className="btn-danger btn-sm"
              >
                Run Full Cleanup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Panel */}
      {activeJob && (
        <div className="fixed bottom-4 right-4 w-80 bg-card border border-gray-700/50 rounded-lg shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
            <div className="flex items-center gap-2">
              {activeJob.status === 'running' ? (
                <svg className="w-4 h-4 text-k8s-blue animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className="text-xs font-medium text-white">
                Cleanup {activeJob.status === 'running' ? 'Running' : 'Complete'}
              </span>
            </div>
            {activeJob.status === 'completed' && (
              <button onClick={() => setActiveJob(null)} className="text-gray-400 hover:text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto p-3 space-y-1.5">
            {activeJob.steps?.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                {step.status === 'completed' ? (
                  <span className="text-green-400">+</span>
                ) : step.status === 'error' ? (
                  <span className="text-red-400">x</span>
                ) : (
                  <span className="text-blue-400">~</span>
                )}
                <span className={
                  step.status === 'completed' ? 'text-green-400' :
                  step.status === 'error' ? 'text-red-400' :
                  'text-blue-400'
                }>{step.name}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-700/50 text-[10px] text-gray-500">
            {activeJob.completed}/{activeJob.total} steps
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          namespaces={namespaces}
          allowedList={allowedList}
          useRbac={useRbac}
          onAdd={handleAddNamespace}
          onRemove={handleRemoveNamespace}
          onToggleRbac={handleToggleRbac}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({ namespaces, allowedList, useRbac, onAdd, onRemove, onToggleRbac, onClose }) {
  const [addInput, setAddInput] = useState('');

  const availableToAdd = namespaces.filter(ns => !allowedList.includes(ns));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-gray-700/50 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <div>
            <h3 className="text-lg font-medium text-white">Cleanup Settings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Control which namespaces can be cleaned up
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Access mode */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-white font-medium">Use RBAC fallback</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled and the allowed list is empty, access is granted based on K8s delete permissions
                </p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={useRbac}
                  onChange={e => onToggleRbac(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:bg-k8s-blue/50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </div>
            </label>
          </div>

          {/* Add namespace */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Add namespace to allowed list</label>
            <div className="flex gap-2">
              <select
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                className="input flex-1 text-sm"
              >
                <option value="">Select namespace...</option>
                {availableToAdd.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </select>
              <button
                onClick={() => { onAdd(addInput); setAddInput(''); }}
                disabled={!addInput}
                className="btn-primary btn-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Current list */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              Allowed namespaces ({allowedList.length})
            </label>
            {allowedList.length === 0 ? (
              <p className="text-xs text-gray-600 italic">
                No namespaces in allowed list. {useRbac ? 'Using RBAC permission check as fallback.' : 'Add namespaces to enable cleanup.'}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {allowedList.map(ns => (
                  <div key={ns} className="flex items-center justify-between bg-gray-800/50 rounded-md px-3 py-2">
                    <span className="text-sm text-gray-200">{ns}</span>
                    <button
                      onClick={() => onRemove(ns)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-300">
              <span className="font-medium">How access works:</span>
            </p>
            <ul className="text-xs text-blue-300/80 mt-1 space-y-0.5 ml-4 list-disc">
              <li>If the allowed list has entries: only listed namespaces can be cleaned</li>
              <li>If the list is empty + RBAC fallback is on: uses K8s delete permission check</li>
              <li>If the list is empty + RBAC fallback is off: cleanup is disabled until you add namespaces</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-gray-700/50">
          <button onClick={onClose} className="btn-primary btn-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

function CleanupCard({ title, count, icon, onExecute, variant }) {
  return (
    <div className={`card p-4 ${variant === 'danger' ? 'border-red-500/30' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="text-gray-400">{icon}</div>
        <div>
          <h4 className="text-xs font-medium text-white">{title}</h4>
          <p className="text-lg font-bold text-gray-300">{count}</p>
        </div>
      </div>
      <button
        onClick={onExecute}
        className={`w-full text-xs ${variant === 'danger' ? 'btn-danger' : 'btn-secondary'} btn-sm`}
      >
        Clean
      </button>
    </div>
  );
}
