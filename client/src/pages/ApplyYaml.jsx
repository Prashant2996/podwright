import { useState } from 'react';
import { useToast } from '../components/Toast';

const SAMPLE_YAML = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value
`;

export default function ApplyYaml({ namespace }) {
  const [yaml, setYaml] = useState('');
  const [useNamespace, setUseNamespace] = useState(true);
  const [applying, setApplying] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const { addToast } = useToast();

  const handleValidate = async () => {
    if (!yaml.trim()) {
      addToast('Enter YAML content first', 'error');
      return;
    }
    setValidating(true);
    setResult(null);
    try {
      const res = await fetch('/api/apply/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yaml: yaml,
          namespace: useNamespace ? namespace : undefined,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setResult({ type: 'success', message: `Validation passed: ${data.message}` });
      } else {
        setResult({ type: 'error', message: data.error });
      }
    } catch (e) {
      setResult({ type: 'error', message: e.message });
    }
    setValidating(false);
  };

  const handleApply = async () => {
    if (!yaml.trim()) {
      addToast('Enter YAML content first', 'error');
      return;
    }
    setApplying(true);
    setResult(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yaml: yaml,
          namespace: useNamespace ? namespace : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({
          type: 'success',
          message: 'Applied successfully',
          resources: data.resources,
        });
        addToast('Resources applied successfully', 'success');
      } else {
        setResult({ type: 'error', message: data.error });
        addToast('Apply failed', 'error');
      }
    } catch (e) {
      setResult({ type: 'error', message: e.message });
    }
    setApplying(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setYaml(evt.target.result);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-white">Apply YAML</h2>
          <p className="text-xs text-gray-500 mt-0.5">Create or update Kubernetes resources from YAML</p>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useNamespace}
                onChange={e => setUseNamespace(e.target.checked)}
                className="rounded border-gray-600"
              />
              Apply to namespace: <span className="text-white font-medium">{namespace}</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="btn-secondary btn-sm text-xs cursor-pointer">
              <input type="file" accept=".yaml,.yml,.json" onChange={handleFileUpload} className="hidden" />
              Upload File
            </label>
            <button
              onClick={() => setYaml(SAMPLE_YAML)}
              className="btn-secondary btn-sm text-xs"
            >
              Sample
            </button>
            <button
              onClick={() => { setYaml(''); setResult(null); }}
              className="btn-secondary btn-sm text-xs"
              disabled={!yaml}
            >
              Clear
            </button>
          </div>
        </div>

        <textarea
          value={yaml}
          onChange={e => setYaml(e.target.value)}
          placeholder="Paste your YAML/JSON resource definition here..."
          className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm leading-6 p-4 rounded-lg border border-gray-700 focus:outline-none focus:border-k8s-blue resize-none min-h-[350px]"
          spellCheck={false}
        />

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-gray-500">
            {yaml ? `${yaml.split('\n').length} lines` : 'No content'}
            {yaml.includes('---') && ` | Multi-document YAML detected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={validating || !yaml.trim()}
              className="btn-secondary btn-sm text-xs disabled:opacity-50"
            >
              {validating ? 'Validating...' : 'Validate (Dry Run)'}
            </button>
            <button
              onClick={handleApply}
              disabled={applying || !yaml.trim()}
              className="btn-primary btn-sm disabled:opacity-50"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`card p-4 border ${
          result.type === 'success' ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'
        }`}>
          <div className="flex items-start gap-3">
            {result.type === 'success' ? (
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${result.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {result.message}
              </p>
              {result.resources && (
                <div className="mt-2 space-y-1">
                  {result.resources.map((r, i) => (
                    <p key={i} className="text-xs text-gray-300 font-mono">{r}</p>
                  ))}
                </div>
              )}
              {result.type === 'error' && (
                <pre className="mt-2 text-xs text-red-300 font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                  {result.message}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
