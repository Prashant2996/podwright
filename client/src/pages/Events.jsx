import { useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function Events({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/events/${namespace}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  if (loading) return <LoadingSkeleton rows={10} />;

  const filtered = typeFilter === 'all' ? events : events.filter(e => e.type === typeFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">Events</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-md text-xs ${typeFilter === 'all' ? 'bg-k8s-blue text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            All ({events.length})
          </button>
          <button
            onClick={() => setTypeFilter('Warning')}
            className={`px-3 py-1 rounded-md text-xs ${typeFilter === 'Warning' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Warnings ({events.filter(e => e.type === 'Warning').length})
          </button>
          <button
            onClick={() => setTypeFilter('Normal')}
            className={`px-3 py-1 rounded-md text-xs ${typeFilter === 'Normal' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Normal ({events.filter(e => e.type === 'Normal').length})
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No events found</div>
        ) : (
          <div className="divide-y divide-gray-700/30">
            {filtered.map((event, i) => (
              <div key={i} className="px-4 py-3 hover:bg-gray-800/30 flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  event.type === 'Normal' ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-white">{event.reason}</span>
                    <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{event.object}</span>
                    {event.count > 1 && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                        x{event.count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 break-all">{event.message}</p>
                </div>
                <span className="text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                  {timeAgo(event.lastTimestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
