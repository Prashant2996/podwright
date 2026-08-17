import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const AutoRefreshContext = createContext(null);

export function AutoRefreshProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem('podwright-autorefresh');
    return saved !== null ? saved === 'true' : true;
  });
  const [interval, setIntervalValue] = useState(() => {
    const saved = localStorage.getItem('podwright-autorefresh-interval');
    return saved ? parseInt(saved) : 10;
  });
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    localStorage.setItem('podwright-autorefresh', String(enabled));
  }, [enabled]);

  useEffect(() => {
    localStorage.setItem('podwright-autorefresh-interval', String(interval));
  }, [interval]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      setTick(t => t + 1);
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1000);
    }, interval * 1000);

    return () => window.clearInterval(timer);
  }, [enabled, interval]);

  const value = {
    enabled,
    setEnabled,
    interval,
    setInterval: setIntervalValue,
    tick,
    refreshing,
  };

  return (
    <AutoRefreshContext.Provider value={value}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

export function useAutoRefreshControls() {
  const ctx = useContext(AutoRefreshContext);
  if (!ctx) throw new Error('useAutoRefreshControls must be used within AutoRefreshProvider');
  return ctx;
}

export function useAutoRefresh(fetchFn, deps = []) {
  const ctx = useContext(AutoRefreshContext);
  if (!ctx) throw new Error('useAutoRefresh must be used within AutoRefreshProvider');

  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    fetchRef.current();
  }, [ctx.tick, ...deps]);
}
