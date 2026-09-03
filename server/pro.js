/**
 * Podwright Pro features.
 *
 * These features require a valid Podwright Pro license key. The license check
 * is an honor-system gate typical of open-core products: it stops casual and
 * unlicensed commercial use, but since the source is open (AGPL-3.0) it is not
 * a hard DRM lock.
 *
 * The flagship Pro feature is the LLM-powered troubleshooter, which sends pod
 * diagnostics to an LLM (OpenAI or Anthropic) using the user's OWN API key
 * (bring-your-own-key) and returns a natural-language root-cause analysis with
 * concrete remediation steps.
 */

const https = require('https');

// --- License validation ---
// A license key is validated in two ways:
//  1. Offline signature check (format + checksum) for fast local gating.
//  2. (Optional) Online verification against the licensing server if configured.
//
// For self-hosters without a key, everything except Pro endpoints keeps working.

const LICENSE_PREFIX = 'PODW-PRO-';

function isValidLicenseFormat(key) {
  if (typeof key !== 'string') return false;
  if (!key.startsWith(LICENSE_PREFIX)) return false;
  const body = key.slice(LICENSE_PREFIX.length);
  // Format: 4 groups of 5 uppercase alphanumerics separated by dashes,
  // last group is a checksum of the first three.
  const parts = body.split('-');
  if (parts.length !== 4) return false;
  if (!parts.every(p => /^[A-Z0-9]{5}$/.test(p))) return false;
  const payload = parts.slice(0, 3).join('');
  const checksum = simpleChecksum(payload);
  return checksum === parts[3];
}

// Deterministic 5-char checksum used to sign/verify keys.
function simpleChecksum(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) + str.charCodeAt(i % str.length);
  }
  return out;
}

// Generate a license key (used by the fulfillment step after a Stripe payment).
function generateLicenseKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rnd = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  const g1 = rnd(5), g2 = rnd(5), g3 = rnd(5);
  const checksum = simpleChecksum(g1 + g2 + g3);
  return `${LICENSE_PREFIX}${g1}-${g2}-${g3}-${checksum}`;
}

// In-memory license state (server holds the active key for this process).
let activeLicense = process.env.PODWRIGHT_LICENSE_KEY || null;

function getLicenseStatus() {
  const valid = activeLicense ? isValidLicenseFormat(activeLicense) : false;
  return {
    licensed: valid,
    tier: valid ? 'pro' : 'free',
    keyMasked: activeLicense ? maskKey(activeLicense) : null,
  };
}

function maskKey(key) {
  if (!key || key.length < 8) return null;
  return key.slice(0, 9) + '...' + key.slice(-5);
}

function setLicense(key) {
  if (!isValidLicenseFormat(key)) {
    return { ok: false, error: 'Invalid license key' };
  }
  activeLicense = key;
  return { ok: true, ...getLicenseStatus() };
}

function requirePro(req, res, next) {
  if (!activeLicense || !isValidLicenseFormat(activeLicense)) {
    return res.status(402).json({
      error: 'Podwright Pro license required',
      upgrade: 'https://podwright.dev/pro',
    });
  }
  next();
}

// --- LLM call (bring-your-own-key) ---
async function callLLM({ provider, apiKey, model, prompt }) {
  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model || 'claude-3-5-sonnet-20241022', prompt);
  }
  return callOpenAI(apiKey, model || 'gpt-4o-mini', prompt);
}

function httpsJson(hostname, path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || `LLM API error ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid response from LLM API'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callOpenAI(apiKey, model, prompt) {
  const res = await httpsJson('api.openai.com', '/v1/chat/completions',
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [
        { role: 'system', content: 'You are a senior Kubernetes SRE. Analyze the diagnostic data and respond with a concise root-cause analysis and concrete, safe remediation steps. Prefer specific kubectl commands or YAML changes. Be direct.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }
  );
  return res.choices?.[0]?.message?.content || 'No response from model.';
}

async function callAnthropic(apiKey, model, prompt) {
  const res = await httpsJson('api.anthropic.com', '/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: 800,
      system: 'You are a senior Kubernetes SRE. Analyze the diagnostic data and respond with a concise root-cause analysis and concrete, safe remediation steps. Prefer specific kubectl commands or YAML changes. Be direct.',
      messages: [{ role: 'user', content: prompt }],
    }
  );
  return res.content?.[0]?.text || 'No response from model.';
}

function buildDiagnosticPrompt(data) {
  return [
    `Analyze this Kubernetes pod and explain what is wrong and how to fix it.`,
    ``,
    `Pod: ${data.pod}`,
    `Namespace: ${data.namespace}`,
    `Phase: ${data.phase}`,
    ``,
    `Container statuses:`,
    JSON.stringify(data.rawData?.containerStatuses || [], null, 2),
    ``,
    `Recent events:`,
    JSON.stringify(data.rawData?.recentEvents || [], null, 2),
    ``,
    `Conditions:`,
    JSON.stringify(data.rawData?.conditions || [], null, 2),
    ``,
    data.logs ? `Recent logs:\n${data.logs}` : '',
    ``,
    `Provide: (1) the most likely root cause, (2) 2-4 concrete remediation steps, (3) any commands or YAML to apply. Keep it under 300 words.`,
  ].join('\n');
}

/**
 * Register Pro routes on the Express app.
 * deps: { getPodDiagnostics: async (namespace, podName) => diagnosticData }
 */
function registerRoutes(app, deps) {
  // License status
  app.get('/api/pro/license', (req, res) => {
    res.json(getLicenseStatus());
  });

  // Activate a license key
  app.post('/api/pro/license', (req, res) => {
    const { key } = req.body || {};
    const result = setLicense((key || '').trim());
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  // LLM-powered troubleshooting (Pro only, bring-your-own-key)
  app.post('/api/pro/troubleshoot/:namespace/:podName', requirePro, async (req, res) => {
    const { namespace, podName } = req.params;
    const { provider, apiKey, model } = req.body || {};

    if (!apiKey) {
      return res.status(400).json({ error: 'An LLM API key is required (bring-your-own-key)' });
    }

    try {
      const diagnostics = await deps.getPodDiagnostics(namespace, podName);
      const prompt = buildDiagnosticPrompt(diagnostics);
      const analysis = await callLLM({ provider, apiKey, model, prompt });
      res.json({ pod: podName, namespace, analysis, model: model || (provider === 'anthropic' ? 'claude-3-5-sonnet' : 'gpt-4o-mini') });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = {
  registerRoutes,
  generateLicenseKey,
  isValidLicenseFormat,
  getLicenseStatus,
};
