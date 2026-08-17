import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useToast } from '../components/Toast';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function ConfigMaps({ namespace }) {
  const [loading, setLoading] = useState(true);
  const [configmaps, setConfigmaps] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    if (!namespace) return;
    try {
      const res = await fetch(`/api/configmaps/${namespace}`);
      const data = await res.json();
      setConfigmaps(Array.isArray(data) ? data : []);
    } catch (e) {}
    setLoading(false);
  }, [namespace]);

  useAutoRefresh(fetchData, [namespace]);

  // Auto-open from URL param
  useEffect(() => {
    const editName = searchParams.get('edit');
    if (editName) {
      openEditor(editName);
    }
  }, [searchParams, namespace]);

  // Reset editor when navigating (sidebar click)
  useEffect(() => {
    setEditing(null);
    setEditorContent('');
    setOriginalContent('');
    setShowPreview(false);
  }, [location.key]);

  async function openEditor(name) {
    try {
      const res = await fetch(`/api/configmaps/${namespace}/${name}`);
      const data = await res.json();
      const cmData = data.data || {};
      const keys = Object.keys(cmData);

      let content;
      if (keys.length === 1) {
        content = cmData[keys[0]];
      } else {
        content = keys.map(key =>
          `# \u2500\u2500\u2500 Key: ${key} \u2500\u2500\u2500\n${cmData[key]}`
        ).join('\n\u2550\u2550\u2550\u2550\u2550\u2550\n');
      }

      setEditing({ name, data: cmData, keys });
      setEditorContent(content);
      setOriginalContent(content);
    } catch (e) {
      addToast('Failed to load configmap', 'error');
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);

    try {
      let newData;
      if (editing.keys.length === 1) {
        newData = { [editing.keys[0]]: editorContent };
      } else {
        // Parse multi-key content
        newData = {};
        const sections = editorContent.split(/\u2550{6,}/);
        sections.forEach(section => {
          const keyMatch = section.match(/# \u2500{3,} Key: (.+?) \u2500{3,}/);
          if (keyMatch) {
            const key = keyMatch[1];
            const value = section.replace(/# \u2500{3,} Key: .+? \u2500{3,}\n/, '').trim();
            newData[key] = value;
          }
        });
        // Fallback: if parsing failed, use original keys
        if (Object.keys(newData).length === 0) {
          newData = { [editing.keys[0]]: editorContent };
        }
      }

      const res = await fetch(`/api/configmaps/${namespace}/${editing.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: newData }),
      });

      if (res.ok) {
        addToast(`Saved ${editing.name}`, 'success');
        setOriginalContent(editorContent);
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Save failed', 'error');
      }
    } catch (e) {
      addToast('Save failed: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = editorContent !== originalContent;

  if (loading) return <LoadingSkeleton rows={8} />;

  // Editor view
  if (editing) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-medium text-white">{editing.name}</h2>
            {hasChanges && (
              <span className="bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded text-xs border border-yellow-500/50">
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="btn-secondary btn-sm"
            >
              {showPreview ? 'Editor' : 'Preview'}
            </button>
            <button
              onClick={() => setEditorContent(originalContent)}
              disabled={!hasChanges}
              className="btn-secondary btn-sm disabled:opacity-50"
            >
              Reset
            </button>
            <button onClick={() => setEditing(null)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSave} disabled={!hasChanges || saving} className="btn-primary btn-sm disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {showPreview ? (
          <div className="flex-1 bg-[#0d1117] rounded-lg p-4 overflow-auto font-mono text-sm leading-6">
            <SyntaxHighlight content={editorContent} />
          </div>
        ) : (
          <textarea
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            className="flex-1 w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm leading-6 p-4 rounded-lg border border-gray-700 focus:outline-none focus:border-k8s-blue resize-none min-h-[500px]"
            spellCheck={false}
          />
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <h2 className="text-lg font-medium text-white mb-4">ConfigMaps</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700/50">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Keys</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Age</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {configmaps.map(cm => (
              <tr key={cm.name} className="border-b border-gray-700/30 hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white text-xs font-medium">{cm.name}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{cm.dataKeys?.length || 0} keys</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{timeAgo(cm.age)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => openEditor(cm.name)}
                    className="text-k8s-blue hover:underline text-xs"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {configmaps.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No configmaps found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyntaxHighlight({ content }) {
  const lines = content.split('\n');
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i}>{highlightLine(line)}</div>
      ))}
    </div>
  );
}

function highlightLine(line) {
  // Comment
  if (line.trim().startsWith('#')) {
    return <span className="text-gray-500 italic">{line}</span>;
  }
  // Separator
  if (line.match(/^[=\u2550]+$/)) {
    return <span className="text-gray-600">{line}</span>;
  }
  // Try YAML key: value
  const yamlMatch = line.match(/^(\s*)([\w./-]+)(:)(.*)/);
  if (yamlMatch) {
    const value = yamlMatch[4].trim();
    let valueClass = 'text-green-300';
    if (value === 'true' || value === 'false') valueClass = 'text-amber-400';
    else if (/^-?\d+(\.\d+)?$/.test(value)) valueClass = 'text-emerald-400';
    else if (value === 'null' || value === '~') valueClass = 'text-gray-500 italic';
    else if (value.match(/^https?:\/\//)) valueClass = 'text-cyan-300';
    else if (value.startsWith('/')) valueClass = 'text-purple-300';

    return (
      <>
        <span>{yamlMatch[1]}</span>
        <span className="text-sky-400">{yamlMatch[2]}</span>
        <span className="text-gray-500">{yamlMatch[3]}</span>
        <span className={valueClass}>{yamlMatch[4]}</span>
      </>
    );
  }
  // JSON key
  const jsonMatch = line.match(/^(\s*)("[\w./-]+")\s*(:)(.*)/);
  if (jsonMatch) {
    return (
      <>
        <span>{jsonMatch[1]}</span>
        <span className="text-sky-400">{jsonMatch[2]}</span>
        <span className="text-gray-500">{jsonMatch[3]}</span>
        <span className="text-green-300">{jsonMatch[4]}</span>
      </>
    );
  }
  return <span className="text-[#e6edf3]">{line}</span>;
}
