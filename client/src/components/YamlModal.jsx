import { useState, useMemo } from 'react';
import CopyButton from './CopyButton';

function jsonToYaml(obj, indent = 0) {
  const prefix = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${prefix}null`;
  if (typeof obj === 'boolean') return `${prefix}${obj}`;
  if (typeof obj === 'number') return `${prefix}${obj}`;
  if (typeof obj === 'string') {
    if (obj.includes('\n')) {
      const lines = obj.split('\n');
      return `${prefix}|\n${lines.map(l => `${prefix}  ${l}`).join('\n')}`;
    }
    if (obj.match(/^[{[\]#|>*&!%@`]/) || obj.includes(': ') || obj === '' || obj === 'true' || obj === 'false' || obj === 'null') {
      return `${prefix}"${obj.replace(/"/g, '\\"')}"`;
    }
    return `${prefix}${obj}`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${prefix}[]`;
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const inner = jsonToYaml(item, indent + 1).trimStart();
        return `${prefix}- ${inner}`;
      }
      const val = jsonToYaml(item, 0).trimStart();
      return `${prefix}- ${val}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return `${prefix}{}`;
    return entries.map(([key, value]) => {
      if (value === null || value === undefined) {
        return `${prefix}${key}: null`;
      }
      if (typeof value === 'object') {
        const inner = jsonToYaml(value, indent + 1);
        return `${prefix}${key}:\n${inner}`;
      }
      const val = jsonToYaml(value, 0).trimStart();
      return `${prefix}${key}: ${val}`;
    }).join('\n');
  }
  return `${prefix}${String(obj)}`;
}

function SyntaxHighlightedYaml({ text }) {
  const lines = text.split('\n');

  return (
    <div className="font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i}>
          {highlightYamlLine(line)}
        </div>
      ))}
    </div>
  );
}

function highlightYamlLine(line) {
  // Block scalar indicators
  if (line.trim() === '|' || line.trim() === '>') {
    return <span className="text-purple-400">{line}</span>;
  }

  // Array dash
  const dashMatch = line.match(/^(\s*)(- )(.*)/);
  if (dashMatch) {
    return (
      <>
        <span>{dashMatch[1]}</span>
        <span className="text-orange-400">{dashMatch[2]}</span>
        <span>{highlightValue(dashMatch[3])}</span>
      </>
    );
  }

  // Key: value pair
  const kvMatch = line.match(/^(\s*)([\w./-]+)(:)(.*)/);
  if (kvMatch) {
    return (
      <>
        <span>{kvMatch[1]}</span>
        <span className="text-sky-400">{kvMatch[2]}</span>
        <span className="text-gray-500">{kvMatch[3]}</span>
        <span>{highlightValue(kvMatch[4])}</span>
      </>
    );
  }

  return <span className="text-gray-300">{line}</span>;
}

function highlightValue(val) {
  const trimmed = val.trim();
  if (!trimmed) return <span>{val}</span>;
  if (trimmed === 'null' || trimmed === '~') return <span className="text-gray-500 italic"> {trimmed}</span>;
  if (trimmed === 'true' || trimmed === 'false') return <span className="text-amber-400"> {trimmed}</span>;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return <span className="text-emerald-400"> {trimmed}</span>;
  if (trimmed === '|' || trimmed === '>') return <span className="text-purple-400"> {trimmed}</span>;
  return <span className="text-green-300"> {trimmed}</span>;
}

function SyntaxHighlightedJson({ text }) {
  const lines = text.split('\n');

  return (
    <div className="font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i}>
          {highlightJsonLine(line)}
        </div>
      ))}
    </div>
  );
}

function highlightJsonLine(line) {
  // Key match
  const parts = [];
  let remaining = line;
  const keyRegex = /("[\w./-]+")\s*:/;
  const keyMatch = remaining.match(keyRegex);

  if (keyMatch) {
    const idx = remaining.indexOf(keyMatch[1]);
    parts.push(<span key="pre">{remaining.substring(0, idx)}</span>);
    parts.push(<span key="key" className="text-sky-400">{keyMatch[1]}</span>);
    remaining = remaining.substring(idx + keyMatch[1].length);
    // Colon
    const colonIdx = remaining.indexOf(':');
    parts.push(<span key="colon" className="text-gray-500">{remaining.substring(0, colonIdx + 1)}</span>);
    remaining = remaining.substring(colonIdx + 1);
    parts.push(<span key="val">{highlightJsonValue(remaining)}</span>);
    return <>{parts}</>;
  }

  return <span>{highlightJsonValue(line)}</span>;
}

function highlightJsonValue(val) {
  const trimmed = val.trim().replace(/,\s*$/, '');
  const hasComa = val.trim().endsWith(',');
  if (trimmed === 'null') return <><span className="text-gray-500 italic">{val.replace(trimmed, trimmed)}</span></>;
  if (trimmed === 'true' || trimmed === 'false') return <span className="text-amber-400">{val}</span>;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return <span className="text-emerald-400">{val}</span>;
  if (trimmed.startsWith('"')) return <span className="text-green-300">{val}</span>;
  return <span className="text-gray-300">{val}</span>;
}

export default function YamlModal({ data, title, onClose }) {
  const [format, setFormat] = useState('yaml');

  const content = useMemo(() => {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    return jsonToYaml(data);
  }, [data, format]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-gray-700/50 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] mx-4 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <h3 className="text-lg font-medium text-white">{title || 'Resource YAML'}</h3>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md overflow-hidden border border-gray-600">
              <button
                onClick={() => setFormat('yaml')}
                className={`px-3 py-1 text-xs ${format === 'yaml' ? 'bg-k8s-blue text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                YAML
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`px-3 py-1 text-xs ${format === 'json' ? 'bg-k8s-blue text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                JSON
              </button>
            </div>
            <CopyButton text={content} />
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-gray-900 rounded-b-lg">
          {format === 'yaml' ? (
            <SyntaxHighlightedYaml text={content} />
          ) : (
            <SyntaxHighlightedJson text={content} />
          )}
        </div>
      </div>
    </div>
  );
}
