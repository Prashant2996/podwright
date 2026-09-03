import { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';
import WorkloadsOverview from './pages/WorkloadsOverview';
import Deployments from './pages/Deployments';
import DeploymentDetail from './pages/DeploymentDetail';
import Pods from './pages/Pods';
import PodDetail from './pages/PodDetail';
import Services from './pages/Services';
import ConfigMaps from './pages/ConfigMaps';
import Secrets from './pages/Secrets';
import Ingresses from './pages/Ingresses';
import StatefulSets from './pages/StatefulSets';
import DaemonSets from './pages/DaemonSets';
import Jobs from './pages/Jobs';
import CronJobs from './pages/CronJobs';
import PVCs from './pages/PVCs';
import Nodes from './pages/Nodes';
import Events from './pages/Events';
import Search from './pages/Search';
import HealthCheck from './pages/HealthCheck';
import Compare from './pages/Compare';
import NamespaceCleanup from './pages/NamespaceCleanup';
import PortForward from './pages/PortForward';
import ApplyYaml from './pages/ApplyYaml';
import RBAC from './pages/RBAC';
import Troubleshoot from './pages/Troubleshoot';
import ProSettings from './pages/ProSettings';

function BackendDown({ onRetry, error }) {
  const isClusterError = error && !error.includes('Failed to fetch') && !error.includes('NetworkError');
  return (
    <div className="min-h-screen flex items-center justify-center bg-k8s-dark">
      <div className="card p-8 max-w-md text-center">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${isClusterError ? 'bg-yellow-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
          <svg className={`w-8 h-8 ${isClusterError ? 'text-yellow-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {isClusterError ? 'Cluster Connection Failed' : 'Backend Not Running'}
        </h2>
        <p className="text-gray-400 mb-4">
          {isClusterError
            ? 'The backend is running but cannot connect to a Kubernetes cluster.'
            : 'The Podwright API server is not reachable.'}
        </p>
        {error && (
          <div className="bg-gray-800 rounded-md p-3 mb-4 text-left">
            <code className="text-xs text-red-300 break-all">{error}</code>
          </div>
        )}
        {!isClusterError && (
          <div className="bg-gray-800 rounded-md p-3 mb-4 text-left">
            <code className="text-sm text-green-400">
              cd podwright<br />
              npm run dev
            </code>
          </div>
        )}
        {isClusterError && (
          <div className="bg-gray-800 rounded-md p-3 mb-4 text-left text-xs text-gray-300 space-y-1">
            <p>Ensure you have a valid kubeconfig:</p>
            <p className="text-green-400 font-mono">~/.kube/config</p>
            <p className="mt-2">Options: minikube, kind, Docker Desktop K8s, or a remote cluster (EKS/GKE/AKS).</p>
          </div>
        )}
        <button onClick={onRetry} className="btn-primary w-full">
          Retry Connection
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [namespace, setNamespace] = useState(() => localStorage.getItem('podwright-namespace') || '');
  const [namespaces, setNamespaces] = useState([]);
  const [backendDown, setBackendDown] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetchNamespaces();
  }, []);

  useEffect(() => {
    if (namespace) {
      localStorage.setItem('podwright-namespace', namespace);
    }
  }, [namespace]);

  async function fetchNamespaces() {
    try {
      const res = await fetch('/api/namespaces');
      const data = await res.json();
      if (!res.ok) {
        setBackendDown(true);
        setBackendError(data.error || `Server returned ${res.status}`);
        return;
      }
      setNamespaces(data);
      setBackendDown(false);
      setBackendError('');
      if (!namespace && data.length > 0) {
        setNamespace(data[0]);
      }
    } catch (e) {
      setBackendDown(true);
      setBackendError(e.message || 'Cannot reach backend');
    }
  }

  if (backendDown) {
    return <BackendDown onRetry={() => window.location.reload()} error={backendError} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} namespace={namespace} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          namespace={namespace}
          setNamespace={setNamespace}
          namespaces={namespaces}
        />
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<WorkloadsOverview namespace={namespace} />} />
              <Route path="/deployments" element={<Deployments namespace={namespace} />} />
              <Route path="/deployments/:name" element={<DeploymentDetail namespace={namespace} />} />
              <Route path="/pods" element={<Pods namespace={namespace} />} />
              <Route path="/pods/:name" element={<PodDetail namespace={namespace} />} />
              <Route path="/services" element={<Services namespace={namespace} />} />
              <Route path="/configmaps" element={<ConfigMaps namespace={namespace} />} />
              <Route path="/secrets" element={<Secrets namespace={namespace} />} />
              <Route path="/ingresses" element={<Ingresses namespace={namespace} />} />
              <Route path="/statefulsets" element={<StatefulSets namespace={namespace} />} />
              <Route path="/daemonsets" element={<DaemonSets namespace={namespace} />} />
              <Route path="/jobs" element={<Jobs namespace={namespace} />} />
              <Route path="/cronjobs" element={<CronJobs namespace={namespace} />} />
              <Route path="/pvcs" element={<PVCs namespace={namespace} />} />
              <Route path="/nodes" element={<Nodes />} />
              <Route path="/events" element={<Events namespace={namespace} />} />
              <Route path="/search" element={<Search namespace={namespace} />} />
              <Route path="/health" element={<HealthCheck namespace={namespace} />} />
              <Route path="/compare" element={<Compare namespaces={namespaces} />} />
              <Route path="/cleanup" element={<NamespaceCleanup namespace={namespace} namespaces={namespaces} />} />
              <Route path="/port-forward" element={<PortForward namespace={namespace} />} />
              <Route path="/apply" element={<ApplyYaml namespace={namespace} />} />
              <Route path="/rbac" element={<RBAC namespace={namespace} />} />
              <Route path="/troubleshoot" element={<Troubleshoot namespace={namespace} />} />
              <Route path="/pro" element={<ProSettings />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
