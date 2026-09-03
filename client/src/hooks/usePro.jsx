import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ProContext = createContext(null);

export function ProProvider({ children }) {
  const [licensed, setLicensed] = useState(false);
  const [tier, setTier] = useState('free');
  const [keyMasked, setKeyMasked] = useState(null);
  const [loading, setLoading] = useState(true);

  // LLM settings (stored locally, bring-your-own-key)
  const [llmProvider, setLlmProvider] = useState(() => localStorage.getItem('podwright-llm-provider') || 'openai');
  const [llmApiKey, setLlmApiKey] = useState(() => localStorage.getItem('podwright-llm-key') || '');
  const [llmModel, setLlmModel] = useState(() => localStorage.getItem('podwright-llm-model') || '');

  useEffect(() => {
    fetchLicense();
  }, []);

  useEffect(() => { localStorage.setItem('podwright-llm-provider', llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem('podwright-llm-key', llmApiKey); }, [llmApiKey]);
  useEffect(() => { localStorage.setItem('podwright-llm-model', llmModel); }, [llmModel]);

  async function fetchLicense() {
    try {
      const res = await fetch('/api/pro/license');
      const data = await res.json();
      setLicensed(!!data.licensed);
      setTier(data.tier || 'free');
      setKeyMasked(data.keyMasked || null);
    } catch (e) {
      setLicensed(false);
      setTier('free');
    }
    setLoading(false);
  }

  const activateLicense = useCallback(async (key) => {
    try {
      const res = await fetch('/api/pro/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (res.ok && data.licensed) {
        setLicensed(true);
        setTier('pro');
        setKeyMasked(data.keyMasked);
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Invalid license key' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const value = {
    licensed,
    tier,
    keyMasked,
    loading,
    activateLicense,
    refreshLicense: fetchLicense,
    // LLM config
    llmProvider, setLlmProvider,
    llmApiKey, setLlmApiKey,
    llmModel, setLlmModel,
    hasLlmKey: !!llmApiKey,
  };

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error('usePro must be used within ProProvider');
  return ctx;
}
