import { useState, useEffect } from 'react';
import CopyButton from './CopyButton';
import { useConfirm } from './ConfirmModal';
import { useToast } from './Toast';

// Highlight a single line of YAML text (server-provided real kubectl YAML).
function highlightYamlLine(line) {
  if (line.trim() === '|' || line.trim() === '>') {
    return <span className="text-purple-400">{line}</span>;
  }
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
  return <span className="text-green-300"> {trimmed}</span>;
}

function TextBlock({ text, highlight }) {
  const lines = text.split('\n');
  return (
    <div className="log-viewer font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i}>{highlight ? highlightYamlLine(line) : <span className="text-gray-300">{line}</span>}</div>
      ))}
    </div>
  );
}

/**
 * Universal resource viewer. Fetches real YAML + `kubectl describe` output for
 * ANY resource kind (built-in or CRD) from the generic backend endpoints.
 *
 * Props:
 *  - kind: kubectl resource selector (e.g. "deployments", "services", "certificates.cert-manager.io")
 *  - name: resource name
 *  - namespace: optional (omit for cluster-scoped resources)
 *  - title: optional heading override
 *  - onClose: () => void
 *  - onDeleted: optional () => void called after a successful delete (e.g. to refresh the list)
 */
export default function ResourceViewModal({ kind, name, namespace, title, onClose, onDeleted }) {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [tab, setTab] = useState('yaml');
  const [yaml, setYaml] = useState('');
  const [describe, setDescribe] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const nsQuery = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const url =
          tab === 'yaml'
            ? `/api/resource/${encodeURIComponent(kind)}/${encodeURIComponent(name)}/yaml${nsQuery}`
            : `/api/resource/${encodeURIComponent(kind)}/${encodeURIComponent(name)}/describe${nsQuery}`;
        // Only fetch if we don't already have it cached in state.
        if (tab === 'yaml' && yaml) { setLoading(false); return; }
        if (tab === 'describe' && describe) { setLoading(false); return; }
        const res = await fetch(url);
        const text = await res.text();
        if (cancelled) return;
        if (!res.ok) {
          let msg = text;
          try { msg = JSON.parse(text).error || text; } catch { /* plain text */ }
          setError(msg);
        } else if (tab === 'yaml') {
          setYaml(text);
        } else {
          setDescribe(text);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kind, name, namespace]);

  const activeText = tab === 'yaml' ? yaml : describe;

  function startEdit() {
    setDraft(yaml);
    setEditing(true);
    setSaveError('');
    setSaveMsg('');
  }

  function cancelEdit() {
    setEditing(false);
    setDraft('');
    setSaveError('');
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError('');
    setSaveMsg('');
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: draft, namespace: namespace || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Apply failed');
      } else {
        setSaveMsg(data.message || 'Applied successfully');
        // Refresh the stored YAML with what the server now has.
        setYaml(draft);
        setEditing(false);
      }
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${kind}`,
      message: `Permanently delete "${name}"${namespace ? ` in ${namespace}` : ''}? This cannot be undone.`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const url = `/api/resource/${encodeURIComponent(kind)}/${encodeURIComponent(name)}${nsQuery}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Delete failed', 'error');
      } else {
        addToast(data.message || `${name} deleted`, 'success');
        if (onDeleted) onDeleted();
        onClose();
      }
    } catch (e) {
      addToast('Delete failed: ' + e.message, 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-gray-700/50 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] mx-4 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
          <div>
            <h3 className="text-lg font-medium text-white">{title || name}</h3>
            <p className="text-xs text-gray-500">{kind}{namespace ? ` · ${namespace}` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md overflow-hidden border border-gray-600">
              <button
                onClick={() => { setTab('yaml'); }}
                className={`px-3 py-1 text-xs ${tab === 'yaml' ? 'bg-k8s-blue text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                YAML
              </button>
              <button
                onClick={() => { if (editing) return; setTab('describe'); }}
                disabled={editing}
                className={`px-3 py-1 text-xs ${tab === 'describe' ? 'bg-k8s-blue text-white' : 'bg-gray-800 text-gray-400'} ${editing ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Describe
              </button>
            </div>
            {tab === 'yaml' && !editing && yaml && !error && (
              <button onClick={startEdit} className="btn-secondary btn-sm" title="Edit YAML and apply">
                Edit
              </button>
            )}
            {editing && (
              <>
                <button onClick={saveEdit} disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
                  {saving ? 'Applying…' : 'Apply'}
                </button>
                <button onClick={cancelEdit} disabled={saving} className="btn-secondary btn-sm disabled:opacity-50">
                  Cancel
                </button>
              </>
            )}
            {!editing && !error && (
              <button onClick={handleDelete} className="btn-danger btn-sm" title={`Delete this ${kind}`}>
                Delete
              </button>
            )}
            {activeText && !error && !editing && <CopyButton text={activeText} />}
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {(saveError || saveMsg) && (
          <div className={`px-4 py-2 text-xs whitespace-pre-wrap ${saveError ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10'}`}>
            {saveError || saveMsg}
          </div>
        )}
        <div className="flex-1 overflow-auto p-4 log-viewer rounded-b-lg">
          {editing ? (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              spellCheck={false}
              className="w-full h-[55vh] bg-transparent font-mono text-xs leading-5 resize-none outline-none"
            />
          ) : loading ? (
            <div className="text-gray-500 text-sm">Loading…</div>
          ) : error ? (
            <div className="text-red-400 text-sm whitespace-pre-wrap">{error}</div>
          ) : (
            <TextBlock text={activeText} highlight={tab === 'yaml'} />
          )}
        </div>
      </div>
    </div>
  );
}
