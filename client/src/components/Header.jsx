import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';
import { useAutoRefreshControls } from '../hooks/useAutoRefresh';
import { useSearchHistory } from '../hooks/useSearchHistory';
import NotificationBell from './NotificationBell';
import Breadcrumb from './Breadcrumb';

export default function Header({ namespace, setNamespace, namespaces }) {
  const { theme, toggle } = useTheme();
  const { enabled, setEnabled, interval, setInterval, refreshing, refreshNow } = useAutoRefreshControls();
  const { addSearch, getTopPredictions } = useSearchHistory();
  const navigate = useNavigate();
  const location = useLocation();

  // Namespace dropdown
  const [nsOpen, setNsOpen] = useState(false);
  const [nsFilter, setNsFilter] = useState('');
  const [nsHighlight, setNsHighlight] = useState(0);
  const nsRef = useRef(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(-1);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  // Context info
  const [context, setContext] = useState('');
  const [contexts, setContexts] = useState([]);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ctxRef = useRef(null);

  useEffect(() => {
    fetchContexts();
  }, []);

  async function fetchContexts() {
    try {
      const res = await fetch('/api/contexts');
      const data = await res.json();
      setContext(data.current || '');
      setContexts(data.contexts || []);
    } catch (e) {}
  }

  async function switchContext(name) {
    setSwitching(true);
    try {
      const res = await fetch('/api/contexts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: name }),
      });
      if (res.ok) {
        const data = await res.json();
        setContext(data.current);
        setCtxOpen(false);
        window.location.reload(); // Reload to refresh all data with new context
      }
    } catch (e) {}
    setSwitching(false);
  }

  // Close context dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) {
        setCtxOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Clear search when navigating away from /search
  useEffect(() => {
    if (!location.pathname.startsWith('/search')) {
      setSearchQuery('');
      setSuggestions([]);
      setSearchOpen(false);
    }
  }, [location.pathname]);

  // Close namespace dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (nsRef.current && !nsRef.current.contains(e.target)) {
        setNsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close search on outside click
  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredNs = namespaces.filter(ns => ns.toLowerCase().includes(nsFilter.toLowerCase()));

  const handleNsKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNsHighlight(h => Math.min(h + 1, filteredNs.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNsHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredNs[nsHighlight]) {
        setNamespace(filteredNs[nsHighlight]);
        setNsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setNsOpen(false);
    }
  };

  // Debounced search
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    setSearchOpen(true);

    // Show predictions immediately
    const preds = getTopPredictions(value);
    setPredictions(preds);

    // Debounce API call
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.length >= 2 && namespace) {
      searchTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/autocomplete/${namespace}?q=${encodeURIComponent(value)}`);
          const data = await res.json();
          setSuggestions(data);
        } catch (e) {
          setSuggestions([]);
        }
      }, 200);
    } else {
      setSuggestions([]);
    }
  }, [namespace, getTopPredictions]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      addSearch(searchQuery.trim());
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  const handleSuggestionClick = (item) => {
    addSearch(item.name);
    navigate(`/search?q=${encodeURIComponent(item.name)}`);
    setSearchOpen(false);
    setSearchQuery(item.name);
  };

  const handleSearchKeyDown = (e) => {
    const allItems = [...predictions.map(p => ({ name: p, type: 'history' })), ...suggestions];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchHighlight(h => Math.min(h + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchHighlight(h => Math.max(h - 1, -1));
    } else if (e.key === 'Enter' && searchHighlight >= 0) {
      e.preventDefault();
      handleSuggestionClick(allItems[searchHighlight]);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const typeColors = {
    deployment: 'text-blue-400',
    service: 'text-green-400',
    configmap: 'text-purple-400',
    history: 'text-gray-500',
  };

  return (
    <header className="bg-card border-b border-gray-700/50 px-6 py-3">
      <div className="flex items-center gap-4">
        {/* Context switcher */}
        <div className="relative" ref={ctxRef}>
          <button
            onClick={() => setCtxOpen(!ctxOpen)}
            className="bg-k8s-blue/20 text-k8s-blue px-3 py-1 rounded-full text-xs font-medium border border-k8s-blue/30 truncate max-w-[180px] hover:bg-k8s-blue/30 transition-colors flex items-center gap-1.5"
            title={context}
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
            <span className="truncate">{context || 'loading...'}</span>
            {contexts.length > 1 && (
              <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${ctxOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {ctxOpen && contexts.length > 1 && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-gray-700/50 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-700/50">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Switch Cluster Context</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {contexts.map(ctx => (
                  <button
                    key={ctx.name}
                    onClick={() => switchContext(ctx.name)}
                    disabled={switching}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800/50 flex items-center gap-2 ${
                      ctx.name === context ? 'text-k8s-blue font-medium' : 'text-gray-300'
                    }`}
                  >
                    {ctx.name === context && (
                      <svg className="w-3 h-3 text-k8s-blue flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className={ctx.name !== context ? 'ml-5' : ''}>{ctx.name}</span>
                    <span className="text-[10px] text-gray-500 ml-auto truncate max-w-[80px]">{ctx.cluster}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Namespace selector */}
        <div className="relative" ref={nsRef}>
          <button
            onClick={() => { setNsOpen(!nsOpen); setNsFilter(''); setNsHighlight(0); }}
            className="input flex items-center gap-2 w-52"
          >
            <span className="flex-1 truncate text-left">{namespace || 'Select namespace'}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${nsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {nsOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-gray-700/50 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-700/50">
                <input
                  type="text"
                  value={nsFilter}
                  onChange={e => { setNsFilter(e.target.value); setNsHighlight(0); }}
                  onKeyDown={handleNsKeyDown}
                  placeholder="Filter namespaces..."
                  className="input w-full text-xs"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredNs.map((ns, i) => (
                  <button
                    key={ns}
                    onClick={() => { setNamespace(ns); setNsOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800/50 ${
                      ns === namespace ? 'text-k8s-blue font-medium' : 'text-gray-300'
                    } ${i === nsHighlight ? 'bg-gray-800/50' : ''}`}
                  >
                    {ns}
                  </button>
                ))}
                {filteredNs.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">No matches</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md" ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery && setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search services, deployments..."
              className="input w-full pl-9 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSuggestions([]); setSearchOpen(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </form>

          {searchOpen && (predictions.length > 0 || suggestions.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-gray-700/50 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
              {predictions.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase">Recent</div>
              )}
              {predictions.map((p, i) => (
                <button
                  key={`pred-${i}`}
                  onClick={() => handleSuggestionClick({ name: p, type: 'history' })}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800/50 flex items-center gap-2 ${
                    searchHighlight === i ? 'bg-gray-800/50' : ''
                  }`}
                >
                  <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-gray-400">{p}</span>
                </button>
              ))}
              {suggestions.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase border-t border-gray-700/50">Results</div>
              )}
              {suggestions.map((item, i) => {
                const idx = predictions.length + i;
                return (
                  <button
                    key={`sug-${i}`}
                    onClick={() => handleSuggestionClick(item)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800/50 flex items-center gap-2 ${
                      searchHighlight === idx ? 'bg-gray-800/50' : ''
                    }`}
                  >
                    <span className={`text-[10px] font-medium ${typeColors[item.type] || 'text-gray-400'}`}>
                      {item.type}
                    </span>
                    <span className="text-gray-200">{item.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Auto-refresh controls */}
        <div className="flex items-center gap-2">
          {/* Manual refresh button */}
          <button
            onClick={refreshNow}
            title="Refresh now"
            className="p-1.5 rounded-md hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin text-k8s-blue' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {enabled && !refreshing && (
            <span className="w-2 h-2 bg-green-400 rounded-full" title="Auto-refresh on" />
          )}
          <label className="relative inline-flex items-center cursor-pointer" title="Toggle auto-refresh">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:bg-k8s-blue/50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full" />
          </label>
          <select
            value={interval}
            onChange={e => setInterval(parseInt(e.target.value))}
            className="input btn-sm text-[10px] w-14"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>
        </div>

        {/* Notification bell */}
        <NotificationBell />

        {/* Theme toggle */}
        <button onClick={toggle} className="p-2 rounded-md hover:bg-gray-800 transition-colors" title="Toggle theme">
          {theme === 'dark' ? (
            <SunIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <MoonIcon className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="mt-2">
        <Breadcrumb />
      </div>
    </header>
  );
}
