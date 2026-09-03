import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Squares2X2Icon,
  CubeIcon,
  CircleStackIcon,
  ServerStackIcon,
  RectangleGroupIcon,
  PlayIcon,
  ArrowPathIcon,
  GlobeAltIcon,
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  KeyIcon,
  CpuChipIcon,
  ServerIcon,
  BoltIcon,
  MagnifyingGlassIcon,
  HeartIcon,
  ArrowsRightLeftIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LinkIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { useAutoRefreshControls } from '../hooks/useAutoRefresh';

const navSections = [
  {
    title: 'Overview',
    items: [
      { path: '/', label: 'Workloads', icon: Squares2X2Icon, countKey: null },
    ],
  },
  {
    title: 'Workloads',
    items: [
      { path: '/deployments', label: 'Deployments', icon: CubeIcon, countKey: 'deployments' },
      { path: '/pods', label: 'Pods', icon: CircleStackIcon, countKey: 'pods' },
      { path: '/statefulsets', label: 'StatefulSets', icon: ServerStackIcon, countKey: 'statefulsets' },
      { path: '/daemonsets', label: 'DaemonSets', icon: RectangleGroupIcon, countKey: 'daemonsets' },
      { path: '/jobs', label: 'Jobs', icon: PlayIcon, countKey: 'jobs' },
      { path: '/cronjobs', label: 'CronJobs', icon: ArrowPathIcon, countKey: 'cronjobs' },
    ],
  },
  {
    title: 'Network',
    items: [
      { path: '/services', label: 'Services', icon: GlobeAltIcon, countKey: null },
      { path: '/ingresses', label: 'Ingresses', icon: ArrowTopRightOnSquareIcon, countKey: null },
    ],
  },
  {
    title: 'Config & Storage',
    items: [
      { path: '/configmaps', label: 'ConfigMaps', icon: DocumentTextIcon, countKey: null },
      { path: '/secrets', label: 'Secrets', icon: KeyIcon, countKey: null },
      { path: '/pvcs', label: 'PVCs', icon: CpuChipIcon, countKey: null },
    ],
  },
  {
    title: 'Cluster',
    items: [
      { path: '/nodes', label: 'Nodes', icon: ServerIcon, countKey: null },
      { path: '/events', label: 'Events', icon: BoltIcon, countKey: null },
    ],
  },
  {
    title: 'Tools',
    items: [
      { path: '/search', label: 'Service Search', icon: MagnifyingGlassIcon, countKey: null },
      { path: '/health', label: 'Health Check', icon: HeartIcon, countKey: null },
      { path: '/troubleshoot', label: 'Troubleshoot', icon: SparklesIcon, countKey: null },
      { path: '/compare', label: 'Compare', icon: ArrowsRightLeftIcon, countKey: null },
      { path: '/port-forward', label: 'Port Forward', icon: LinkIcon, countKey: null },
      { path: '/apply', label: 'Apply YAML', icon: CommandLineIcon, countKey: null },
      { path: '/rbac', label: 'RBAC', icon: ShieldCheckIcon, countKey: null },
      { path: '/cleanup', label: 'NS Cleanup', icon: TrashIcon, countKey: null },
    ],
  },
  {
    title: 'Account',
    items: [
      { path: '/pro', label: 'Podwright Pro', icon: StarIcon, countKey: null },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, namespace }) {
  const location = useLocation();
  const { tick } = useAutoRefreshControls();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!namespace) return;
    fetch(`/api/workloads/${namespace}`)
      .then(r => r.json())
      .then(data => setCounts(data))
      .catch(() => {});
  }, [namespace, tick]);

  return (
    <nav className={`bg-sidebar flex flex-col h-full border-r border-gray-700/50 transition-all duration-300 ${collapsed ? 'w-14' : 'w-56'}`}>
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 flex-shrink-0">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill="#326CE5" stroke="#4a8af4" strokeWidth="2"/>
            <circle cx="32" cy="32" r="8" fill="white"/>
            <line x1="32" y1="10" x2="32" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="32" y1="40" x2="32" y2="54" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="13" y1="21" x2="25" y2="28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="39" y1="36" x2="51" y2="43" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="13" y1="43" x2="25" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="39" y1="28" x2="51" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold text-white">Podwright</h1>
            <p className="text-[10px] text-gray-500">Kubernetes Dashboard</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {navSections.map(section => (
          <div key={section.title} className="mb-3">
            {!collapsed && (
              <p className="px-4 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {section.title}
              </p>
            )}
            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-2' : ''}`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.countKey && counts[item.countKey] !== undefined && (
                        <span className="text-[10px] bg-gray-700/70 text-gray-300 px-1.5 py-0.5 rounded-full">
                          {counts[item.countKey]}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-gray-700/50">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-md hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRightIcon className="w-4 h-4" />
          ) : (
            <ChevronLeftIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </nav>
  );
}
