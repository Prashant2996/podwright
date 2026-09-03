import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const DeploymentEventsContext = createContext(null);

export function DeploymentEventsProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [watchedDeployments, setWatchedDeployments] = useState(() => {
    const saved = localStorage.getItem('podwright-watched-deployments');
    return saved ? JSON.parse(saved) : [];
  });
  const [browserNotifications, setBrowserNotifications] = useState(() => {
    return localStorage.getItem('podwright-browser-notifications') === 'true';
  });
  const [username, setUsername] = useState('');
  const wsRef = useRef(null);
  const namespaceRef = useRef('');
  const reconnectTimerRef = useRef(null);
  const notificationsRef = useRef(browserNotifications);
  const isMountedRef = useRef(true);

  // Keep a ref of the latest browserNotifications so the WS handler always sees
  // the current value without needing to reconnect the socket.
  useEffect(() => {
    notificationsRef.current = browserNotifications;
  }, [browserNotifications]);

  // Fetch username
  useEffect(() => {
    fetch('/api/whoami')
      .then(r => r.json())
      .then(data => setUsername(data.username))
      .catch(() => {});
  }, []);

  // Save watched deployments
  useEffect(() => {
    localStorage.setItem('podwright-watched-deployments', JSON.stringify(watchedDeployments));
  }, [watchedDeployments]);

  useEffect(() => {
    localStorage.setItem('podwright-browser-notifications', String(browserNotifications));
  }, [browserNotifications]);

  // WebSocket connection (established once, does NOT reconnect on state changes)
  useEffect(() => {
    isMountedRef.current = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      if (!isMountedRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ action: 'subscribe-events', namespace: namespaceRef.current }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'deployment-event') {
            setEvents(prev => [msg.event, ...prev].slice(0, 100));
            setUnreadCount(prev => prev + 1);

            if (notificationsRef.current && Notification.permission === 'granted') {
              new Notification('Podwright', {
                body: msg.event.message,
                icon: '/favicon.svg',
              });
            }
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect only if still mounted
        if (isMountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const toggleWatchDeployment = useCallback((name) => {
    setWatchedDeployments(prev => {
      if (prev.includes(name)) {
        return prev.filter(n => n !== name);
      }
      return [...prev, name];
    });
  }, []);

  const toggleBrowserNotifications = useCallback(async () => {
    if (!browserNotifications) {
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') return;
      } else if (Notification.permission === 'denied') {
        return;
      }
    }
    setBrowserNotifications(prev => !prev);
  }, [browserNotifications]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setUnreadCount(0);
  }, []);

  const setNamespace = useCallback((ns) => {
    namespaceRef.current = ns;
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe-events', namespace: ns }));
    }
  }, []);

  const value = {
    events,
    unreadCount,
    connected,
    watchedDeployments,
    browserNotifications,
    username,
    markAllRead,
    toggleWatchDeployment,
    toggleBrowserNotifications,
    clearEvents,
    setNamespace,
  };

  return (
    <DeploymentEventsContext.Provider value={value}>
      {children}
    </DeploymentEventsContext.Provider>
  );
}

export function useDeploymentEvents() {
  const ctx = useContext(DeploymentEventsContext);
  if (!ctx) throw new Error('useDeploymentEvents must be used within DeploymentEventsProvider');
  return ctx;
}
