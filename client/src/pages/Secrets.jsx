import { useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import CopyButton from '../components/CopyButton';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function Secrets({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [revealed, setRevealed] = useState({});

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/secrets/${namespace}`);
      const data = await res.json();
      setSecrets(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  const toggleExpand = (name) => {
    setExpanded(expanded === name ? null : name);
    setRevealed({});
  };

  const toggleReveal = (secretName, key) => {
    setRevealed(prev => ({
      ...prev,
      [`${secretName}/${key}`]: !prev[`${secretName}/${key}`],
    }));
  };

  const decodeBase64 = (value) => {
    try {
      return atob(value);
    } catch {
      return value;
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-4">Secrets</h2>
      <div className="space-y-2">
        {secrets.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">No secrets found</div>
        ) : (
          secrets.map(secret => (
            <div key={secret.name} className="card overflow-hidden">
              <button
                onClick={() => toggleExpand(secret.name)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === secret.name ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-medium text-white">{secret.name}</span>
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{secret.type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{secret.dataKeys?.length || 0} keys</span>
                  <span className="text-xs text-gray-500">{timeAgo(secret.age)}</span>
                </div>
              </button>

              {expanded === secret.name && (
                <div className="border-t border-gray-700/50 p-4 space-y-2">
                  {Object.entries(secret.data || {}).map(([key, value]) => {
                    const revealKey = `${secret.name}/${key}`;
                    const isRevealed = revealed[revealKey];
                    const decoded = decodeBase64(value);

                    return (
                      <div key={key} className="flex items-center gap-3 bg-gray-800/50 rounded-md p-2.5">
                        <span className="text-xs text-gray-400 font-medium min-w-[120px]">{key}</span>
                        <span className="flex-1 font-mono text-xs text-gray-300 truncate">
                          {isRevealed ? decoded : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </span>
                        <button
                          onClick={() => toggleReveal(secret.name, key)}
                          className="text-gray-400 hover:text-white p-1"
                          title={isRevealed ? 'Hide' : 'Reveal'}
                        >
                          {isRevealed ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                        <CopyButton text={decoded} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
