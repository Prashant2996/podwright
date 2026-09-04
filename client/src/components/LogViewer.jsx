import { useState, useEffect, useRef } from 'react';

export default function LogViewer({ namespace, podName, container }) {
  const [logs, setLogs] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [tailLines, setTailLines] = useState(200);
  const [previous, setPrevious] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const logRef = useRef(null);
  const isFirstFetch = useRef(true);

  useEffect(() => {
    isFirstFetch.current = true;
    setInitialLoading(true);
    setLogs('');
    fetchLogs();

    const timer = setInterval(fetchLogs, 5000);
    return () => clearInterval(timer);
  }, [namespace, podName, container, tailLines, previous]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  async function fetchLogs() {
    try {
      const params = new URLSearchParams();
      if (container) params.set('container', container);
      if (previous) params.set('previous', 'true');
      params.set('tailLines', String(tailLines));

      const res = await fetch(`/api/pods/${namespace}/${podName}/logs?${params}`);
      if (res.ok) {
        const text = await res.text();
        setLogs(text);
        setLastUpdate(new Date());
      }
    } catch (e) {
      // Silent fail on subsequent fetches
    } finally {
      if (isFirstFetch.current) {
        setInitialLoading(false);
        isFirstFetch.current = false;
      }
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (container) params.set('container', container);
      const res = await fetch(`/api/pods/${namespace}/${podName}/logs?${params}`);
      const text = await res.text();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${podName}_${container || 'default'}_${timestamp}.log`;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading logs...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Tail:</label>
          <select
            value={tailLines}
            onChange={e => setTailLines(parseInt(e.target.value))}
            className="input btn-sm text-xs"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={previous}
            onChange={e => setPrevious(e.target.checked)}
            className="rounded border-gray-600"
          />
          Previous
        </label>

        {lastUpdate && (
          <span className="text-xs text-gray-500">
            Updated: {lastUpdate.toLocaleTimeString()}
          </span>
        )}

        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="rounded border-gray-600"
          />
          Auto-scroll
        </label>

        <button onClick={fetchLogs} className="btn-secondary btn-sm text-xs" title="Refresh">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button onClick={handleDownload} disabled={downloading} className="btn-secondary btn-sm text-xs flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>

      <div
        ref={logRef}
        className="log-viewer bg-gray-900 rounded-lg p-4 font-mono text-xs leading-5 text-gray-200 overflow-auto whitespace-pre-wrap min-h-[400px] max-h-[600px]"
      >
        {logs || <span className="text-gray-500 italic">No logs available</span>}
      </div>
    </div>
  );
}
