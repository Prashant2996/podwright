import { useState, useRef, useEffect } from 'react';
import { useDeploymentEvents } from '../hooks/useDeploymentEvents';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const {
    events,
    unreadCount,
    connected,
    browserNotifications,
    markAllRead,
    toggleBrowserNotifications,
    clearEvents,
  } = useDeploymentEvents();

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    setOpen(!open);
    if (!open) markAllRead();
  };

  const typeIcons = {
    'tag-change': (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    'pod-crash': (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  };

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={handleOpen} className="relative p-2 rounded-md hover:bg-gray-800 transition-colors">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-gray-700/50 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-700/50 flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Deployment Events</h4>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} title={connected ? 'Connected' : 'Disconnected'} />
              <button onClick={clearEvents} className="text-xs text-gray-400 hover:text-white">
                Clear
              </button>
            </div>
          </div>

          <div className="p-2 border-b border-gray-700/50">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={browserNotifications}
                onChange={toggleBrowserNotifications}
                className="rounded border-gray-600"
              />
              Browser notifications
            </label>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No events yet
              </div>
            ) : (
              events.slice(0, 20).map((event) => (
                <div key={event.id} className="px-3 py-2 border-b border-gray-700/30 hover:bg-gray-800/50">
                  <div className="flex items-start gap-2">
                    {typeIcons[event.type] || typeIcons['tag-change']}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-200 truncate">{event.message}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {event.deployment} - {new Date(event.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
