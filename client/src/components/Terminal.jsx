import { useState, useEffect, useRef } from 'react';

export default function Terminal({ namespace, podName, container, onClose }) {
  const [connected, setConnected] = useState(false);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [shell, setShell] = useState('/bin/sh');
  const wsRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    return () => disconnect();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: 'start-exec',
        namespace,
        podName,
        container,
        shell,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'exec-connected') {
          setConnected(true);
          setOutput(prev => prev + `Connected to ${podName}/${container} (${shell})\n`);
        } else if (msg.type === 'exec-output') {
          setOutput(prev => prev + msg.data);
        } else if (msg.type === 'exec-exit') {
          setOutput(prev => prev + `\nProcess exited with code ${msg.code}\n`);
          setConnected(false);
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function disconnect() {
    if (wsRef.current) {
      if (connected) {
        wsRef.current.send(JSON.stringify({
          action: 'stop-exec',
          namespace,
          podName,
          container,
        }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!connected || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      action: 'exec-input',
      namespace,
      podName,
      container,
      data: input + '\n',
    }));
    setOutput(prev => prev + `$ ${input}\n`);
    setInput('');
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <select
          value={shell}
          onChange={e => setShell(e.target.value)}
          disabled={connected}
          className="input btn-sm text-xs"
        >
          <option value="/bin/sh">sh</option>
          <option value="/bin/bash">bash</option>
        </select>

        {!connected ? (
          <button onClick={connect} className="btn-primary btn-sm text-xs">
            Connect
          </button>
        ) : (
          <button onClick={disconnect} className="btn-danger btn-sm text-xs">
            Disconnect
          </button>
        )}

        {onClose && (
          <button onClick={onClose} className="btn-secondary btn-sm text-xs ml-auto">
            Close
          </button>
        )}
      </div>

      <div
        ref={outputRef}
        className="bg-black rounded-lg p-4 font-mono text-xs text-green-200 overflow-auto min-h-[300px] max-h-[500px] whitespace-pre-wrap"
      >
        {output || <span className="text-gray-600">Terminal output will appear here...</span>}
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
        <span className="text-green-400 font-mono text-sm">$</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!connected}
          placeholder={connected ? 'Type command...' : 'Connect first'}
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 font-mono text-sm text-gray-200 focus:outline-none focus:border-green-500"
        />
      </form>
    </div>
  );
}
