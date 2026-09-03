import { useState } from 'react';
import { usePro } from '../hooks/usePro';
import { useToast } from '../components/Toast';

export default function ProSettings() {
  const {
    licensed, tier, keyMasked, activateLicense,
    llmProvider, setLlmProvider,
    llmApiKey, setLlmApiKey,
    llmModel, setLlmModel,
  } = usePro();
  const { addToast } = useToast();

  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleActivate = async () => {
    if (!keyInput.trim()) return;
    setActivating(true);
    const result = await activateLicense(keyInput.trim());
    if (result.ok) {
      addToast('Podwright Pro activated. Thank you!', 'success');
      setKeyInput('');
    } else {
      addToast(result.error || 'Activation failed', 'error');
    }
    setActivating(false);
  };

  const defaultModel = llmProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini';

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-medium text-white mb-1">Podwright Pro</h2>
      <p className="text-xs text-gray-500 mb-6">
        Unlock AI-powered troubleshooting and advanced features.
      </p>

      {/* License status */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white">License</h3>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            licensed
              ? 'bg-green-500/20 text-green-400 border-green-500/50'
              : 'bg-gray-500/20 text-gray-400 border-gray-500/50'
          }`}>
            {tier === 'pro' ? 'PRO' : 'FREE'}
          </span>
        </div>

        {licensed ? (
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-white">Pro license active</p>
              <p className="text-xs text-gray-500 font-mono">{keyMasked}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-400 mb-3">
              Enter your license key to unlock Pro features. Don't have one?{' '}
              <a href="https://podwright.dev/pro" target="_blank" rel="noopener noreferrer" className="text-k8s-blue hover:underline">
                Get Podwright Pro
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleActivate(); }}
                placeholder="PODW-PRO-XXXXX-XXXXX-XXXXX-XXXXX"
                className="input flex-1 font-mono text-sm"
              />
              <button onClick={handleActivate} disabled={activating || !keyInput.trim()} className="btn-primary btn-sm disabled:opacity-50">
                {activating ? 'Activating...' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LLM settings */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-white">AI Troubleshooter (LLM)</h3>
          {!licensed && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Pro only</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Podwright uses your own LLM API key (bring-your-own-key). Your key is stored
          locally in your browser and sent only to your chosen provider.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Provider</label>
            <select
              value={llmProvider}
              onChange={e => setLlmProvider(e.target.value)}
              className="input text-sm w-full"
              disabled={!licensed}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              {llmProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API Key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={llmApiKey}
                onChange={e => setLlmApiKey(e.target.value)}
                placeholder={llmProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="input flex-1 font-mono text-sm"
                disabled={!licensed}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="btn-secondary btn-sm"
                disabled={!licensed}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Model (optional)</label>
            <input
              type="text"
              value={llmModel}
              onChange={e => setLlmModel(e.target.value)}
              placeholder={defaultModel}
              className="input text-sm w-full font-mono"
              disabled={!licensed}
            />
            <p className="text-[10px] text-gray-600 mt-1">Leave empty to use the default: {defaultModel}</p>
          </div>
        </div>

        {!licensed && (
          <div className="mt-4 bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-xs text-yellow-300">
              Activate a Pro license above to enable the AI Troubleshooter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
