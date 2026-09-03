import { Link, useLocation } from 'react-router-dom';

const routeLabels = {
  deployments: 'Deployments',
  pods: 'Pods',
  services: 'Services',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  ingresses: 'Ingresses',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  pvcs: 'PVCs',
  nodes: 'Nodes',
  events: 'Events',
  search: 'Search',
  health: 'Health Check',
  troubleshoot: 'AI Troubleshooter',
  compare: 'Compare',
  'port-forward': 'Port Forward',
  apply: 'Apply YAML',
  rbac: 'RBAC Permissions',
  cleanup: 'Namespace Cleanup',
  pro: 'Podwright Pro',
};

export default function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav className="flex items-center gap-2 text-sm mb-4">
      <Link to="/" className="text-gray-400 hover:text-white transition-colors">
        Home
      </Link>
      {segments.map((segment, index) => {
        const path = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = routeLabels[segment] || decodeURIComponent(segment);

        return (
          <span key={path} className="flex items-center gap-2">
            <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isLast ? (
              <span className="text-white font-medium">{label}</span>
            ) : (
              <Link to={path} className="text-gray-400 hover:text-white transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
