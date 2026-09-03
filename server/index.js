const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { exec, execSync, execFile, spawn } = require('child_process');
const https = require('https');
const os = require('os');
const k8s = require('@kubernetes/client-node');
const path = require('path');
const deploymentEvents = require('./deploymentEvents');
const pro = require('./pro');

const app = express();
const PORT = process.env.PORT || 7070;

app.use(cors());
app.use(express.json());

// --- Kubernetes Client Setup ---
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

let k8sApi = kc.makeApiClient(k8s.CoreV1Api);
let appsApi = kc.makeApiClient(k8s.AppsV1Api);
let batchApi = kc.makeApiClient(k8s.BatchV1Api);
let networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
let authApi = kc.makeApiClient(k8s.AuthorizationV1Api);
let autoscalingApi = kc.makeApiClient(k8s.AutoscalingV1Api);
let log = new k8s.Log(kc);

function reloadClients() {
  k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  appsApi = kc.makeApiClient(k8s.AppsV1Api);
  batchApi = kc.makeApiClient(k8s.BatchV1Api);
  networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
  authApi = kc.makeApiClient(k8s.AuthorizationV1Api);
  autoscalingApi = kc.makeApiClient(k8s.AutoscalingV1Api);
  log = new k8s.Log(kc);
  // Clear cache on context switch
  cache.clear();
}

// --- In-Memory Cache (5s TTL) ---
const cache = new Map();
const CACHE_TTL = 5000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

function invalidateNamespace(ns) {
  for (const key of cache.keys()) {
    if (key.includes(ns)) {
      cache.delete(key);
    }
  }
}

// Periodic sweep to evict expired entries (prevents unbounded memory growth)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.time >= CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 30000).unref();

// --- Input Validation (prevents command injection) ---
// Kubernetes names follow RFC 1123: lowercase alphanumeric, '-', '.', max 253 chars
const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

function isValidK8sName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 253 && K8S_NAME_RE.test(name);
}

function validateNames(...names) {
  for (const n of names) {
    if (!isValidK8sName(n)) {
      throw new Error(`Invalid Kubernetes name: "${n}"`);
    }
  }
}

// Safe command execution using execFile (no shell = no injection)
function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      // For cleanup we tolerate non-zero exit (resource may not exist)
      resolve((stdout || '') + (stderr || ''));
    });
  });
}

// --- k8sPatch: Raw PATCH using native fetch with exec-based token ---
async function k8sPatch(resourcePath, body, patchType = 'strategic-merge-patch') {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error('No active cluster');

  const url = `${cluster.server}${resourcePath}`;
  const user = kc.getCurrentUser();
  let token = '';

  // Try exec-based auth
  if (user.exec) {
    try {
      const execEnv = { ...process.env };
      if (user.exec.env) {
        user.exec.env.forEach(e => { execEnv[e.name] = e.value; });
      }
      const cmd = [user.exec.command, ...(user.exec.args || [])].join(' ');
      const result = execSync(cmd, { env: execEnv, timeout: 10000, encoding: 'utf-8' });
      const parsed = JSON.parse(result);
      token = parsed.status?.token || '';
    } catch (e) {
      console.error('exec auth failed:', e.message);
    }
  } else if (user.token) {
    token = user.token;
  }

  const contentTypeMap = {
    'strategic-merge-patch': 'application/strategic-merge-patch+json',
    'json-patch': 'application/json-patch+json',
    'merge-patch': 'application/merge-patch+json',
  };

  const headers = {
    'Content-Type': contentTypeMap[patchType] || contentTypeMap['strategic-merge-patch'],
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Build a per-request HTTPS agent for TLS handling (never mutate global TLS state)
  const agentOptions = {};
  if (cluster.skipTLSVerify) {
    agentOptions.rejectUnauthorized = false;
  }
  if (cluster.caData) {
    agentOptions.ca = Buffer.from(cluster.caData, 'base64');
  } else if (cluster.caFile) {
    try {
      agentOptions.ca = require('fs').readFileSync(cluster.caFile);
    } catch (e) { /* fall back to system CAs */ }
  }
  const agent = new https.Agent(agentOptions);

  const fetchOptions = {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
    // Node's fetch uses the `dispatcher` option; but for broad compat we use a
    // Node https request wrapper when a custom agent is required.
  };

  const response = await httpsPatch(url, fetchOptions, agent);
  if (!response.ok) {
    // Do not leak raw upstream error bodies to the client
    throw new Error(`PATCH failed with status ${response.status}`);
  }
  return response.data;
}

// Minimal HTTPS PATCH using Node's https module with a custom agent (per-request TLS)
function httpsPatch(url, options, agent) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'PATCH',
      headers: options.headers,
      agent,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        let parsed = {};
        try { parsed = data ? JSON.parse(data) : {}; } catch (e) { parsed = {}; }
        resolve({ ok, status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    req.write(options.body);
    req.end();
  });
}

// --- Cleanup Jobs (in-memory, non-blocking) ---
const cleanupJobs = new Map();

function createCleanupJob(namespace, actions) {
  validateNames(namespace);
  const jobId = `cleanup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const job = {
    id: jobId,
    namespace,
    status: 'running',
    steps: [],
    completed: 0,
    total: actions.length,
    startTime: Date.now(),
  };
  cleanupJobs.set(jobId, job);

  // Auto-cleanup after 5 minutes
  setTimeout(() => cleanupJobs.delete(jobId), 5 * 60 * 1000);

  // Execute actions asynchronously
  executeCleanupActions(job, actions);
  return jobId;
}

// Server-side cleanup action registry. The client sends an action TYPE + params,
// never a raw command. Each handler builds args safely via execFile.
// namespace is validated before any handler runs.
const CLEANUP_ACTIONS = {
  'delete-completed-pods': async (ns) => {
    await execFileAsync('kubectl', ['delete', 'pods', '--field-selector=status.phase==Succeeded', '-n', ns]);
    await execFileAsync('kubectl', ['delete', 'pods', '--field-selector=status.phase==Failed', '-n', ns]);
    return 'Deleted completed and failed pods';
  },
  'delete-kafka-topics': async (ns) => {
    const out = await execFileAsync('kubectl', ['delete', 'kafkatopics', '--all', '-n', ns]);
    return out.trim() || 'Deleted Kafka topics';
  },
  'scale-down-all': async (ns) => {
    const out = await execFileAsync('kubectl', ['scale', 'deployment', '--all', '--replicas=0', '-n', ns]);
    return out.trim() || 'Scaled all deployments to 0';
  },
  'helm-uninstall': async (ns, params) => {
    validateNames(params.release);
    const out = await execFileAsync('helm', ['uninstall', params.release, '-n', ns]);
    return out.trim() || `Uninstalled ${params.release}`;
  },
};

async function executeCleanupActions(job, actions) {
  for (const action of actions) {
    const handler = CLEANUP_ACTIONS[action.type];
    const step = { name: action.name || action.type, status: 'running', message: '' };
    job.steps.push(step);

    try {
      if (!handler) {
        throw new Error(`Unknown cleanup action: ${action.type}`);
      }
      step.message = await handler(job.namespace, action.params || {});
      step.status = 'completed';
      step.message = String(step.message).substring(0, 500);
    } catch (e) {
      step.status = 'error';
      step.message = e.message.substring(0, 500);
    }
    job.completed++;
    broadcastCleanupUpdate(job);
  }
  job.status = 'completed';
  broadcastCleanupUpdate(job);
}

// --- Identity Detection ---
let currentIdentity = null;

async function detectIdentity() {
  try {
    const authClient = kc.makeApiClient(k8s.AuthenticationV1Api);
    const review = {
      apiVersion: 'authentication.k8s.io/v1',
      kind: 'SelfSubjectReview',
      metadata: {},
      status: {},
    };
    const result = await authClient.createSelfSubjectReview(review);
    currentIdentity = {
      username: result?.status?.userInfo?.username || os.userInfo().username,
      groups: result?.status?.userInfo?.groups || [],
    };
  } catch (e) {
    currentIdentity = {
      username: os.userInfo().username,
      groups: [],
    };
  }
}

// --- HTTP Server + WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
const wsClients = new Set();

// Max buffered bytes before we drop messages to a slow client (backpressure)
const WS_MAX_BUFFER = 5 * 1024 * 1024; // 5MB

function safeSend(ws, payload) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > WS_MAX_BUFFER) return; // drop instead of buffering unbounded
  try { ws.send(payload); } catch (e) { /* client gone */ }
}

wss.on('connection', (ws) => {
  wsClients.add(ws);
  const streams = new Map();
  const execProcesses = new Map();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleWsMessage(ws, msg, streams, execProcesses);
    } catch (e) {
      ws.send(JSON.stringify({ error: e.message }));
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    // Cleanup streams
    for (const stream of streams.values()) {
      try { stream.destroy(); } catch (e) {}
    }
    // Cleanup exec processes
    for (const proc of execProcesses.values()) {
      try { proc.kill(); } catch (e) {}
    }
  });
});

function handleWsMessage(ws, msg, streams, execProcesses) {
  switch (msg.action) {
    case 'start-logs': {
      const { namespace, podName, container, tailLines } = msg;
      const streamKey = `${namespace}/${podName}/${container}`;
      
      // Stop existing stream
      if (streams.has(streamKey)) {
        try { streams.get(streamKey).destroy(); } catch (e) {}
      }

      const logStream = new k8s.LogStream();
      log.log(namespace, podName, container, logStream, {
        follow: true,
        tailLines: tailLines || 100,
        pretty: false,
      }).catch(e => {
        ws.send(JSON.stringify({ type: 'log-error', error: e.message }));
      });

      logStream.on('data', (chunk) => {
        safeSend(ws, JSON.stringify({ type: 'log-data', data: chunk.toString() }));
      });

      logStream.on('error', (e) => {
        ws.send(JSON.stringify({ type: 'log-error', error: e.message }));
      });

      streams.set(streamKey, logStream);
      break;
    }

    case 'stop-logs': {
      const { namespace, podName, container } = msg;
      const key = `${namespace}/${podName}/${container}`;
      if (streams.has(key)) {
        try { streams.get(key).destroy(); } catch (e) {}
        streams.delete(key);
      }
      break;
    }

    case 'start-exec': {
      const { namespace, podName, container, shell } = msg;
      const execKey = `${namespace}/${podName}/${container}`;
      
      // Kill existing process
      if (execProcesses.has(execKey)) {
        try { execProcesses.get(execKey).kill(); } catch (e) {}
      }

      const shellCmd = shell || '/bin/sh';
      const proc = spawn('kubectl', [
        'exec', '-i', '-n', namespace, podName, '-c', container, '--', shellCmd
      ], { env: process.env });

      proc.stdout.on('data', (data) => {
        safeSend(ws, JSON.stringify({ type: 'exec-output', data: data.toString() }));
      });

      proc.stderr.on('data', (data) => {
        safeSend(ws, JSON.stringify({ type: 'exec-output', data: data.toString() }));
      });

      proc.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'exec-exit', code }));
        execProcesses.delete(execKey);
      });

      execProcesses.set(execKey, proc);
      ws.send(JSON.stringify({ type: 'exec-connected' }));
      break;
    }

    case 'exec-input': {
      const { namespace, podName, container, data } = msg;
      const key = `${namespace}/${podName}/${container}`;
      const proc = execProcesses.get(key);
      if (proc && proc.stdin.writable) {
        proc.stdin.write(data);
      }
      break;
    }

    case 'stop-exec': {
      const { namespace, podName, container } = msg;
      const key = `${namespace}/${podName}/${container}`;
      if (execProcesses.has(key)) {
        try { execProcesses.get(key).kill(); } catch (e) {}
        execProcesses.delete(key);
      }
      break;
    }

    case 'subscribe-events': {
      // Client subscribes to deployment event broadcasts
      ws.subscribedToEvents = true;
      if (msg.namespace) {
        ws.eventNamespace = msg.namespace;
      }
      break;
    }
  }
}

function broadcastCleanupUpdate(job) {
  const msg = JSON.stringify({ type: 'cleanup-update', job });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// --- API Routes ---

// Identity
app.get('/api/whoami', (req, res) => {
  res.json(currentIdentity || { username: os.userInfo().username, groups: [] });
});

app.get('/api/contexts', (req, res) => {
  try {
    const contexts = kc.getContexts().map(c => ({
      name: c.name,
      cluster: c.cluster,
      user: c.user,
    }));
    const current = kc.getCurrentContext();
    res.json({ contexts, current, user: currentIdentity?.username || os.userInfo().username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Switch context
app.post('/api/contexts/switch', async (req, res) => {
  const { context } = req.body;
  if (!context) return res.status(400).json({ error: 'context name required' });

  try {
    const available = kc.getContexts().map(c => c.name);
    if (!available.includes(context)) {
      return res.status(400).json({ error: `Context "${context}" not found. Available: ${available.join(', ')}` });
    }

    kc.setCurrentContext(context);
    reloadClients();
    await detectIdentity();

    res.json({
      success: true,
      current: context,
      user: currentIdentity?.username || os.userInfo().username,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Namespaces
app.get('/api/namespaces', async (req, res) => {
  try {
    const cached = getCached('namespaces');
    if (cached) return res.json(cached);

    const result = await k8sApi.listNamespace();
    const namespaces = result.items.map(ns => ns.metadata.name).sort();
    setCache('namespaces', namespaces);
    res.json(namespaces);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Workloads (combined)
app.get('/api/workloads/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `workloads-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [deployments, statefulsets, daemonsets, jobs, cronjobs, pods] = await Promise.all([
      appsApi.listNamespacedDeployment({namespace}).then(r => r.items),
      appsApi.listNamespacedStatefulSet({namespace}).then(r => r.items),
      appsApi.listNamespacedDaemonSet({namespace}).then(r => r.items),
      batchApi.listNamespacedJob({namespace}).then(r => r.items),
      batchApi.listNamespacedCronJob({namespace}).then(r => r.items),
      k8sApi.listNamespacedPod({namespace}).then(r => r.items),
    ]);

    const data = {
      deployments: deployments.length,
      statefulsets: statefulsets.length,
      daemonsets: daemonsets.length,
      jobs: jobs.length,
      cronjobs: cronjobs.length,
      pods: pods.length,
    };
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deployments
app.get('/api/deployments/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `deployments-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await appsApi.listNamespacedDeployment({namespace});
    const data = result.items.map(d => formatDeployment(d));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/deployments/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const result = await appsApi.readNamespacedDeployment({name, namespace});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scale deployment
app.put('/api/deployments/:namespace/:name/scale', async (req, res) => {
  const { namespace, name } = req.params;
  const { replicas } = req.body;
  const count = parseInt(replicas);
  if (isNaN(count) || count < 0 || count > 1000) {
    return res.status(400).json({ error: 'replicas must be a number between 0 and 1000' });
  }
  try {
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}/scale`,
      { spec: { replicas: count } },
      'merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update deployment image
app.put('/api/deployments/:namespace/:name/image', async (req, res) => {
  const { namespace, name } = req.params;
  const { container, image } = req.body;
  try {
    const deployment = await appsApi.readNamespacedDeployment({name, namespace});
    const containers = deployment.spec.template.spec.containers;
    const containerIndex = containers.findIndex(c => c.name === (container || containers[0].name));
    if (containerIndex === -1) {
      return res.status(400).json({ error: 'Container not found' });
    }

    const patch = [
      { op: 'replace', path: `/spec/template/spec/containers/${containerIndex}/image`, value: image }
    ];
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      patch,
      'json-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update deployment env
app.put('/api/deployments/:namespace/:name/env', async (req, res) => {
  const { namespace, name } = req.params;
  const { container, env } = req.body;
  try {
    const deployment = await appsApi.readNamespacedDeployment({name, namespace});
    const containers = deployment.spec.template.spec.containers;
    const containerIndex = containers.findIndex(c => c.name === (container || containers[0].name));
    if (containerIndex === -1) {
      return res.status(400).json({ error: 'Container not found' });
    }

    const patch = [
      { op: 'replace', path: `/spec/template/spec/containers/${containerIndex}/env`, value: env }
    ];
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      patch,
      'json-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update deployment YAML (strategic merge patch)
app.put('/api/deployments/:namespace/:name/yaml', async (req, res) => {
  const { namespace, name } = req.params;
  const { spec } = req.body;
  try {
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      { spec },
      'strategic-merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart deployment
app.post('/api/deployments/:namespace/:name/restart', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      {
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
              }
            }
          }
        }
      },
      'strategic-merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claim deployment
app.post('/api/deployments/:namespace/:name/claim', async (req, res) => {
  const { namespace, name } = req.params;
  const { duration } = req.body; // minutes
  const username = currentIdentity?.username || os.userInfo().username;
  const expiry = new Date(Date.now() + (duration || 15) * 60 * 1000).toISOString();

  try {
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      {
        metadata: {
          annotations: {
            'podwright.io/claimed-by': username,
            'podwright.io/claim-expires': expiry,
          }
        }
      },
      'strategic-merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true, claimedBy: username, expires: expiry });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unclaim deployment
app.post('/api/deployments/:namespace/:name/unclaim', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const patch = [
      { op: 'remove', path: '/metadata/annotations/podwright.io~1claimed-by' },
      { op: 'remove', path: '/metadata/annotations/podwright.io~1claim-expires' },
    ];
    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      patch,
      'json-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rollout history
app.get('/api/deployments/:namespace/:name/rollout-history', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const deployment = await appsApi.readNamespacedDeployment({name, namespace});
    const uid = deployment.metadata.uid;
    const rsResult = await appsApi.listNamespacedReplicaSet({namespace});
    const replicaSets = rsResult.items
      .filter(rs => rs.metadata.ownerReferences?.some(ref => ref.uid === uid))
      .map(rs => ({
        name: rs.metadata.name,
        revision: rs.metadata.annotations?.['deployment.kubernetes.io/revision'] || '0',
        image: rs.spec.template.spec.containers[0]?.image || '',
        replicas: rs.status.replicas || 0,
        readyReplicas: rs.status.readyReplicas || 0,
        creationTimestamp: rs.metadata.creationTimestamp,
      }))
      .sort((a, b) => parseInt(b.revision) - parseInt(a.revision));

    res.json(replicaSets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rollback deployment
app.post('/api/deployments/:namespace/:name/rollback', async (req, res) => {
  const { namespace, name } = req.params;
  const { replicaSetName } = req.body;
  try {
    const rs = await appsApi.readNamespacedReplicaSet({name: replicaSetName, namespace});
    const template = rs.spec.template;
    delete template.metadata.labels['pod-template-hash'];

    await k8sPatch(
      `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
      { spec: { template } },
      'strategic-merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scale all deployments
app.post('/api/deployments/:namespace/scale-all', async (req, res) => {
  const { namespace } = req.params;
  const { replicas } = req.body;
  try {
    const result = await appsApi.listNamespacedDeployment({namespace});
    const promises = result.items.map(d =>
      k8sPatch(
        `/apis/apps/v1/namespaces/${namespace}/deployments/${d.metadata.name}/scale`,
        { spec: { replicas: parseInt(replicas) } },
        'merge-patch'
      ).catch(e => ({ error: e.message, name: d.metadata.name }))
    );
    const results = await Promise.all(promises);
    invalidateNamespace(namespace);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart all deployments
app.post('/api/deployments/:namespace/restart-all', async (req, res) => {
  const { namespace } = req.params;
  try {
    const result = await appsApi.listNamespacedDeployment({namespace});
    const promises = result.items.map(d =>
      k8sPatch(
        `/apis/apps/v1/namespaces/${namespace}/deployments/${d.metadata.name}`,
        {
          spec: {
            template: {
              metadata: {
                annotations: {
                  'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
                }
              }
            }
          }
        },
        'strategic-merge-patch'
      ).catch(e => ({ error: e.message, name: d.metadata.name }))
    );
    await Promise.all(promises);
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pods
app.get('/api/pods/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `pods-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedPod({namespace});
    const data = result.items.map(p => formatPod(p));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pods/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const result = await k8sApi.readNamespacedPod({name, namespace});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/pods/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    await k8sApi.deleteNamespacedPod({name, namespace});
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pod logs
app.get('/api/pods/:namespace/:name/logs', async (req, res) => {
  const { namespace, name } = req.params;
  const { container, previous, tailLines } = req.query;
  try {
    const options = { pretty: false };
    if (container) options.container = container;
    if (previous === 'true') options.previous = true;
    if (tailLines) options.tailLines = parseInt(tailLines);

    const result = await k8sApi.readNamespacedPodLog({name, namespace, container: container || undefined, previous: previous === 'true', tailLines: tailLines ? parseInt(tailLines) : undefined});
    res.type('text/plain').send(result || '');
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pod events
app.get('/api/pods/:namespace/:name/events', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const result = await k8sApi.listNamespacedEvent({namespace, fieldSelector: `involvedObject.name=${name},involvedObject.kind=Pod`});
    const events = result.items.map(e => ({
      type: e.type,
      reason: e.reason,
      message: e.message,
      count: e.count || 1,
      firstTimestamp: e.firstTimestamp,
      lastTimestamp: e.lastTimestamp,
      source: e.source?.component,
    }));
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pod health
app.get('/api/pods/:namespace/:name/health', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const pod = await k8sApi.readNamespacedPod({name, namespace});
    const conditions = pod.status?.conditions || [];
    const ready = conditions.find(c => c.type === 'Ready');
    const status = ready?.status === 'True' ? 'UP' : 'DOWN';
    
    res.json({
      status,
      message: ready?.message || (status === 'UP' ? 'Pod is healthy' : 'Pod is not ready'),
      conditions: conditions.map(c => ({
        type: c.type,
        status: c.status,
        reason: c.reason,
        lastTransitionTime: c.lastTransitionTime,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check (all pods in namespace)
app.get('/api/health-check/:namespace', async (req, res) => {
  const { namespace } = req.params;
  try {
    const result = await k8sApi.listNamespacedPod({namespace});
    const checks = result.items
      .filter(p => p.status.phase === 'Running' || p.status.phase === 'Pending')
      .map(p => {
        const conditions = p.status?.conditions || [];
        const ready = conditions.find(c => c.type === 'Ready');
        const containerStatuses = p.status?.containerStatuses || [];
        const totalRestarts = containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0);
        const crashLoop = containerStatuses.some(c => c.state?.waiting?.reason === 'CrashLoopBackOff');
        
        let status = 'UP';
        if (crashLoop) status = 'CRASH';
        else if (ready?.status !== 'True') status = 'DOWN';

        return {
          name: p.metadata.name,
          appName: p.metadata.labels?.app || p.metadata.labels?.['app.kubernetes.io/name'] || p.metadata.name,
          status,
          restarts: totalRestarts,
          lastRestart: containerStatuses[0]?.lastState?.terminated?.finishedAt || null,
          reason: containerStatuses[0]?.lastState?.terminated?.reason || null,
        };
      });
    res.json(checks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Services
app.get('/api/services/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `services-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedService({namespace});
    const data = result.items.map(s => ({
      name: s.metadata.name,
      type: s.spec.type,
      clusterIP: s.spec.clusterIP,
      externalIP: s.status?.loadBalancer?.ingress?.[0]?.ip || s.status?.loadBalancer?.ingress?.[0]?.hostname || '-',
      ports: s.spec.ports?.map(p => `${p.port}${p.targetPort ? ':' + p.targetPort : ''}/${p.protocol}`).join(', ') || '-',
      selector: s.spec.selector || {},
      age: s.metadata.creationTimestamp,
      labels: s.metadata.labels || {},
      annotations: s.metadata.annotations || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ConfigMaps
app.get('/api/configmaps/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `configmaps-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedConfigMap({namespace});
    const data = result.items.map(cm => ({
      name: cm.metadata.name,
      dataKeys: Object.keys(cm.data || {}),
      age: cm.metadata.creationTimestamp,
      labels: cm.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/configmaps/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    const result = await k8sApi.readNamespacedConfigMap({name, namespace});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/configmaps/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params;
  const { data } = req.body;
  try {
    await k8sPatch(
      `/api/v1/namespaces/${namespace}/configmaps/${name}`,
      { data },
      'merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Secrets
app.get('/api/secrets/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `secrets-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedSecret({namespace});
    const data = result.items.map(s => ({
      name: s.metadata.name,
      type: s.type,
      dataKeys: Object.keys(s.data || {}),
      data: s.data || {},
      age: s.metadata.creationTimestamp,
      labels: s.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ingresses
app.get('/api/ingresses/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `ingresses-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await networkingApi.listNamespacedIngress({namespace});
    const data = result.items.map(i => ({
      name: i.metadata.name,
      hosts: i.spec.rules?.map(r => r.host).filter(Boolean) || [],
      paths: i.spec.rules?.flatMap(r => r.http?.paths?.map(p => p.path) || []) || [],
      tls: i.spec.tls?.length > 0,
      className: i.spec.ingressClassName || '-',
      age: i.metadata.creationTimestamp,
      labels: i.metadata.labels || {},
      annotations: i.metadata.annotations || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// StatefulSets
app.get('/api/statefulsets/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `statefulsets-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await appsApi.listNamespacedStatefulSet({namespace});
    const data = result.items.map(ss => ({
      name: ss.metadata.name,
      ready: `${ss.status.readyReplicas || 0}/${ss.spec.replicas || 0}`,
      replicas: ss.spec.replicas || 0,
      readyReplicas: ss.status.readyReplicas || 0,
      image: ss.spec.template.spec.containers[0]?.image || '-',
      age: ss.metadata.creationTimestamp,
      labels: ss.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DaemonSets
app.get('/api/daemonsets/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `daemonsets-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await appsApi.listNamespacedDaemonSet({namespace});
    const data = result.items.map(ds => ({
      name: ds.metadata.name,
      desired: ds.status.desiredNumberScheduled || 0,
      current: ds.status.currentNumberScheduled || 0,
      ready: ds.status.numberReady || 0,
      available: ds.status.numberAvailable || 0,
      image: ds.spec.template.spec.containers[0]?.image || '-',
      age: ds.metadata.creationTimestamp,
      labels: ds.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Jobs
app.get('/api/jobs/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `jobs-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await batchApi.listNamespacedJob({namespace});
    const data = result.items.map(j => ({
      name: j.metadata.name,
      completions: `${j.status.succeeded || 0}/${j.spec.completions || 1}`,
      duration: j.status.completionTime && j.status.startTime
        ? Math.round((new Date(j.status.completionTime) - new Date(j.status.startTime)) / 1000) + 's'
        : '-',
      status: j.status.succeeded ? 'Complete' : j.status.failed ? 'Failed' : 'Running',
      age: j.metadata.creationTimestamp,
      labels: j.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CronJobs
app.get('/api/cronjobs/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `cronjobs-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await batchApi.listNamespacedCronJob({namespace});
    const data = result.items.map(cj => ({
      name: cj.metadata.name,
      schedule: cj.spec.schedule,
      suspend: cj.spec.suspend || false,
      active: cj.status.active?.length || 0,
      lastSchedule: cj.status.lastScheduleTime,
      image: cj.spec.jobTemplate.spec.template.spec.containers[0]?.image || '-',
      age: cj.metadata.creationTimestamp,
      labels: cj.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Suspend/Resume CronJob
app.put('/api/cronjobs/:namespace/:name/suspend', async (req, res) => {
  const { namespace, name } = req.params;
  const { suspend } = req.body;
  try {
    await k8sPatch(
      `/apis/batch/v1/namespaces/${namespace}/cronjobs/${name}`,
      { spec: { suspend: !!suspend } },
      'merge-patch'
    );
    invalidateNamespace(namespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Trigger CronJob
app.post('/api/cronjobs/:namespace/:name/trigger', async (req, res) => {
  const { namespace, name } = req.params;
  try {
    validateNames(namespace, name);
    const jobName = `${name}-manual-${Date.now()}`;
    const result = await execFileAsync('kubectl', ['create', 'job', jobName, `--from=cronjob/${name}`, '-n', namespace]);
    invalidateNamespace(namespace);
    res.json({ success: true, jobName, output: result.trim() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// HPAs
app.get('/api/hpa/:namespace', async (req, res) => {
  const { namespace } = req.params;
  try {
    const result = await autoscalingApi.listNamespacedHorizontalPodAutoscaler({namespace});
    const data = result.items.map(h => ({
      name: h.metadata.name,
      reference: `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}`,
      minReplicas: h.spec.minReplicas,
      maxReplicas: h.spec.maxReplicas,
      currentReplicas: h.status.currentReplicas,
      targetCPU: h.spec.targetCPUUtilizationPercentage,
      currentCPU: h.status.currentCPUUtilizationPercentage,
    }));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PVCs
app.get('/api/pvcs/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `pvcs-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedPersistentVolumeClaim({namespace});
    const data = result.items.map(pvc => ({
      name: pvc.metadata.name,
      status: pvc.status.phase,
      volume: pvc.spec.volumeName || '-',
      capacity: pvc.status.capacity?.storage || pvc.spec.resources?.requests?.storage || '-',
      accessModes: pvc.spec.accessModes || [],
      storageClass: pvc.spec.storageClassName || '-',
      age: pvc.metadata.creationTimestamp,
      labels: pvc.metadata.labels || {},
    }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nodes
app.get('/api/nodes', async (req, res) => {
  const cacheKey = 'nodes';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNode();
    const data = result.items.map(n => {
      const conditions = n.status?.conditions || [];
      const ready = conditions.find(c => c.type === 'Ready');
      return {
        name: n.metadata.name,
        status: ready?.status === 'True' ? 'Ready' : 'NotReady',
        roles: Object.keys(n.metadata.labels || {})
          .filter(l => l.startsWith('node-role.kubernetes.io/'))
          .map(l => l.replace('node-role.kubernetes.io/', ''))
          .join(', ') || 'worker',
        version: n.status.nodeInfo?.kubeletVersion || '-',
        os: n.status.nodeInfo?.osImage || '-',
        cpu: n.status.capacity?.cpu || '-',
        memory: n.status.capacity?.memory || '-',
        age: n.metadata.creationTimestamp,
        conditions,
      };
    });
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Events
app.get('/api/events/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const cacheKey = `events-${namespace}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await k8sApi.listNamespacedEvent({namespace});
    const data = result.items
      .sort((a, b) => new Date(b.lastTimestamp || b.metadata.creationTimestamp) - new Date(a.lastTimestamp || a.metadata.creationTimestamp))
      .slice(0, 200)
      .map(e => ({
        type: e.type,
        reason: e.reason,
        message: e.message,
        object: `${e.involvedObject.kind}/${e.involvedObject.name}`,
        count: e.count || 1,
        firstTimestamp: e.firstTimestamp,
        lastTimestamp: e.lastTimestamp,
        source: e.source?.component,
      }));
    setCache(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search & Autocomplete
app.get('/api/autocomplete/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const { q } = req.query;
  const cacheKey = `autocomplete-${namespace}`;
  let items = getCached(cacheKey);

  if (!items) {
    try {
      const [deps, svcs, cms] = await Promise.all([
        appsApi.listNamespacedDeployment({namespace}).then(r => r.items.map(d => ({ name: d.metadata.name, type: 'deployment' }))),
        k8sApi.listNamespacedService({namespace}).then(r => r.items.map(s => ({ name: s.metadata.name, type: 'service' }))),
        k8sApi.listNamespacedConfigMap({namespace}).then(r => r.items.map(c => ({ name: c.metadata.name, type: 'configmap' }))),
      ]);
      items = [...deps, ...svcs, ...cms];
      setCache(cacheKey, items);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (q) {
    const query = q.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(query));
  }
  res.json(items.slice(0, 20));
});

app.get('/api/search/:namespace', async (req, res) => {
  const { namespace } = req.params;
  const { q } = req.query;
  if (!q) return res.json([]);

  const query = q.toLowerCase();
  try {
    const [deps, pods, svcs, cms, secrets] = await Promise.all([
      appsApi.listNamespacedDeployment({namespace}).then(r => r.items),
      k8sApi.listNamespacedPod({namespace}).then(r => r.items),
      k8sApi.listNamespacedService({namespace}).then(r => r.items),
      k8sApi.listNamespacedConfigMap({namespace}).then(r => r.items),
      k8sApi.listNamespacedSecret({namespace}).then(r => r.items),
    ]);

    const results = [];
    const matchName = (item) => item.metadata.name.toLowerCase().includes(query);
    const matchLabels = (item) => Object.values(item.metadata.labels || {}).some(v => v.toLowerCase().includes(query));

    deps.filter(i => matchName(i) || matchLabels(i)).forEach(i => results.push({ name: i.metadata.name, type: 'deployment' }));
    pods.filter(i => matchName(i) || matchLabels(i)).forEach(i => results.push({ name: i.metadata.name, type: 'pod' }));
    svcs.filter(i => matchName(i) || matchLabels(i)).forEach(i => results.push({ name: i.metadata.name, type: 'service' }));
    cms.filter(i => matchName(i) || matchLabels(i)).forEach(i => results.push({ name: i.metadata.name, type: 'configmap' }));
    secrets.filter(i => matchName(i) || matchLabels(i)).forEach(i => results.push({ name: i.metadata.name, type: 'secret' }));

    res.json(results.slice(0, 50));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Compare
app.get('/api/compare/deployments', async (req, res) => {
  const { ns1, ns2 } = req.query;
  if (!ns1 || !ns2) return res.status(400).json({ error: 'ns1 and ns2 required' });

  try {
    const [left, right] = await Promise.all([
      appsApi.listNamespacedDeployment({ namespace: ns1 }).then(r => r.items),
      appsApi.listNamespacedDeployment({ namespace: ns2 }).then(r => r.items),
    ]);

    const leftMap = new Map(left.map(d => [d.metadata.name, d]));
    const rightMap = new Map(right.map(d => [d.metadata.name, d]));
    const allNames = new Set([...leftMap.keys(), ...rightMap.keys()]);

    const comparison = [];
    for (const name of allNames) {
      const l = leftMap.get(name);
      const r = rightMap.get(name);
      const leftTag = l?.spec.template.spec.containers[0]?.image?.split(':')[1] || '-';
      const rightTag = r?.spec.template.spec.containers[0]?.image?.split(':')[1] || '-';
      const leftReady = l ? `${l.status?.readyReplicas || 0}/${l.spec.replicas || 0}` : '-';
      const rightReady = r ? `${r.status?.readyReplicas || 0}/${r.spec.replicas || 0}` : '-';

      let status = 'same';
      if (!l) status = 'only-right';
      else if (!r) status = 'only-left';
      else if (leftTag !== rightTag) status = 'different';

      comparison.push({ name, leftTag, rightTag, leftReady, rightReady, status });
    }

    res.json(comparison);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/compare/configmaps', async (req, res) => {
  const { ns1, ns2 } = req.query;
  if (!ns1 || !ns2) return res.status(400).json({ error: 'ns1 and ns2 required' });

  try {
    const [left, right] = await Promise.all([
      k8sApi.listNamespacedConfigMap({ namespace: ns1 }).then(r => r.items),
      k8sApi.listNamespacedConfigMap({ namespace: ns2 }).then(r => r.items),
    ]);

    const leftMap = new Map(left.map(c => [c.metadata.name, c]));
    const rightMap = new Map(right.map(c => [c.metadata.name, c]));
    const allNames = new Set([...leftMap.keys(), ...rightMap.keys()]);

    const comparison = [];
    for (const name of allNames) {
      const l = leftMap.get(name);
      const r = rightMap.get(name);
      const leftKeys = Object.keys(l?.data || {});
      const rightKeys = Object.keys(r?.data || {});

      let status = 'same';
      if (!l) status = 'only-right';
      else if (!r) status = 'only-left';
      else if (JSON.stringify(l.data) !== JSON.stringify(r.data)) status = 'different';

      comparison.push({ name, leftKeys: leftKeys.length, rightKeys: rightKeys.length, status });
    }

    res.json(comparison);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/compare/configmap-detail', async (req, res) => {
  const { ns1, ns2, name } = req.query;
  if (!ns1 || !ns2 || !name) return res.status(400).json({ error: 'ns1, ns2, and name required' });

  try {
    const [left, right] = await Promise.all([
      k8sApi.readNamespacedConfigMap({ name, namespace: ns1 }).then(r => r).catch(() => null),
      k8sApi.readNamespacedConfigMap({ name, namespace: ns2 }).then(r => r).catch(() => null),
    ]);

    const leftData = left?.data || {};
    const rightData = right?.data || {};
    const allKeys = new Set([...Object.keys(leftData), ...Object.keys(rightData)]);

    const keys = [];
    for (const key of allKeys) {
      let status = 'same';
      if (!(key in leftData)) status = 'only-right';
      else if (!(key in rightData)) status = 'only-left';
      else if (leftData[key] !== rightData[key]) status = 'different';

      keys.push({
        key,
        status,
        leftValue: leftData[key] || null,
        rightValue: rightData[key] || null,
      });
    }

    res.json({ name, keys });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clone service
app.post('/api/clone-service', async (req, res) => {
  const { sourceNamespace, targetNamespace, deploymentName } = req.body;
  if (!sourceNamespace || !targetNamespace || !deploymentName) {
    return res.status(400).json({ error: 'sourceNamespace, targetNamespace, and deploymentName required' });
  }

  try {
    // Get source deployment
    const depResult = await appsApi.readNamespacedDeployment({name: deploymentName, namespace: sourceNamespace});
    const deployment = depResult;
    
    // Clone deployment
    const newDep = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deployment.metadata.name,
        namespace: targetNamespace,
        labels: deployment.metadata.labels,
      },
      spec: deployment.spec,
    };
    delete newDep.spec.template.metadata.labels['pod-template-hash'];
    
    await appsApi.createNamespacedDeployment({namespace: targetNamespace, body: newDep}).catch(async () => {
      // Already exists, patch instead
      await k8sPatch(
        `/apis/apps/v1/namespaces/${targetNamespace}/deployments/${deploymentName}`,
        { spec: deployment.spec },
        'strategic-merge-patch'
      );
    });

    // Try to clone service
    try {
      const svcResult = await k8sApi.readNamespacedService({name: deploymentName, namespace: sourceNamespace});
      const service = svcResult;
      const newSvc = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: service.metadata.name,
          namespace: targetNamespace,
          labels: service.metadata.labels,
        },
        spec: {
          selector: service.spec.selector,
          ports: service.spec.ports,
          type: service.spec.type,
        },
      };
      await k8sApi.createNamespacedService({namespace: targetNamespace, body: newSvc}).catch(() => {});
    } catch (e) {
      // Service might not exist, that's ok
    }

    // Try to clone configmaps with matching labels
    try {
      const appLabel = deployment.metadata.labels?.app || deployment.metadata.name;
      const cmResult = await k8sApi.listNamespacedConfigMap({namespace: sourceNamespace, labelSelector: `app=${appLabel}`});
      for (const cm of cmResult.items) {
        const newCm = {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: cm.metadata.name,
            namespace: targetNamespace,
            labels: cm.metadata.labels,
          },
          data: cm.data,
        };
        await k8sApi.createNamespacedConfigMap({namespace: targetNamespace, body: newCm}).catch(() => {});
      }
    } catch (e) {
      // ConfigMaps clone is best-effort
    }

    invalidateNamespace(targetNamespace);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cleanup
app.get('/api/cleanup/:namespace/preview', async (req, res) => {
  const { namespace } = req.params;
  try {
    validateNames(namespace);
    const [helmReleases, pods, jobs] = await Promise.all([
      execFileAsync('helm', ['list', '-n', namespace, '--short']).then(r => r.trim().split('\n').filter(Boolean)),
      k8sApi.listNamespacedPod({namespace}).then(r =>
        r.items.filter(p => p.status.phase === 'Succeeded' || p.status.phase === 'Failed')
      ),
      batchApi.listNamespacedJob({namespace}).then(r =>
        r.items.filter(j => j.status.succeeded || j.status.failed)
      ),
    ]);

    let kafkaTopics = [];
    try {
      const kt = await execFileAsync('kubectl', ['get', 'kafkatopics', '-n', namespace, '-o', 'jsonpath={.items[*].metadata.name}']);
      kafkaTopics = kt.trim().split(' ').filter(Boolean);
    } catch (e) {}

    res.json({
      helmReleases,
      completedPods: pods.length,
      completedJobs: jobs.length,
      kafkaTopics: kafkaTopics.length,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/cleanup/:namespace/execute', async (req, res) => {
  const { namespace } = req.params;
  const { actions } = req.body;
  if (!actions || !actions.length) {
    return res.status(400).json({ error: 'actions array required' });
  }
  try {
    validateNames(namespace);
    // Reject any action that isn't a known safe type
    for (const a of actions) {
      if (!a.type || !CLEANUP_ACTIONS[a.type]) {
        return res.status(400).json({ error: `Unknown or missing action type: ${a.type}` });
      }
    }
    const jobId = createCleanupJob(namespace, actions);
    res.json({ jobId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/cleanup/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = cleanupJobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// --- AI Kubernetes Troubleshooter ---

// Shared diagnostic gatherer used by both the free (rule-based) endpoint and
// the Pro (LLM-powered) endpoint. Returns pod info, rule-based diagnosis,
// raw data, and collected logs.
async function getPodDiagnostics(namespace, podName) {
  validateNames(namespace, podName);

  const [pod, events] = await Promise.all([
    k8sApi.readNamespacedPod({ name: podName, namespace }),
    k8sApi.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.name=${podName},involvedObject.kind=Pod` }),
  ]);

  const containerStatuses = pod.status?.containerStatuses || [];
  const conditions = pod.status?.conditions || [];
  const containers = pod.spec?.containers || [];
  const eventList = (events.items || []).sort((a, b) =>
    new Date(b.lastTimestamp || b.metadata.creationTimestamp) - new Date(a.lastTimestamp || a.metadata.creationTimestamp)
  );

  // Collect logs from crashing containers (last 50 lines)
  const containerLogs = {};
  let combinedLogs = '';
  for (const cs of containerStatuses) {
    if (cs.restartCount > 0 || cs.state?.waiting || cs.state?.terminated) {
      try {
        const prev = await k8sApi.readNamespacedPodLog({ name: podName, namespace, container: cs.name, previous: true, tailLines: 50 });
        containerLogs[cs.name] = { previous: prev || '' };
        if (prev) combinedLogs += `[${cs.name} previous]\n${prev}\n`;
      } catch (e) {
        containerLogs[cs.name] = { previous: '' };
      }
      try {
        const cur = await k8sApi.readNamespacedPodLog({ name: podName, namespace, container: cs.name, tailLines: 50 });
        containerLogs[cs.name] = { ...containerLogs[cs.name], current: cur || '' };
        if (cur) combinedLogs += `[${cs.name} current]\n${cur}\n`;
      } catch (e) {
        containerLogs[cs.name] = { ...containerLogs[cs.name], current: '' };
      }
    }
  }

  const diagnosis = analyzePod(pod, containerStatuses, containers, eventList, containerLogs, conditions);

  return {
    pod: podName,
    namespace,
    phase: pod.status?.phase,
    diagnosis,
    logs: combinedLogs.slice(0, 6000), // cap for LLM token budget
    rawData: {
      containerStatuses: containerStatuses.map(cs => ({
        name: cs.name,
        ready: cs.ready,
        restartCount: cs.restartCount,
        state: cs.state,
        lastState: cs.lastState,
      })),
      recentEvents: eventList.slice(0, 10).map(e => ({
        type: e.type,
        reason: e.reason,
        message: e.message,
        count: e.count,
        lastTimestamp: e.lastTimestamp,
      })),
      conditions,
    },
  };
}

app.get('/api/troubleshoot/:namespace/:podName', async (req, res) => {
  const { namespace, podName } = req.params;
  try {
    const result = await getPodDiagnostics(namespace, podName);
    // Free endpoint omits the raw combined logs from the response payload
    const { logs, ...rest } = result;
    res.json(rest);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Namespace-wide troubleshoot scan
app.get('/api/troubleshoot/:namespace', async (req, res) => {
  const { namespace } = req.params;

  try {
    const pods = await k8sApi.listNamespacedPod({namespace});
    const problems = [];

    for (const pod of (pods.items || [])) {
      const containerStatuses = pod.status?.containerStatuses || [];
      const hasIssue = containerStatuses.some(cs => 
        cs.restartCount > 2 ||
        cs.state?.waiting?.reason === 'CrashLoopBackOff' ||
        cs.state?.waiting?.reason === 'ImagePullBackOff' ||
        cs.state?.waiting?.reason === 'ErrImagePull' ||
        cs.state?.terminated?.reason === 'OOMKilled' ||
        cs.state?.terminated?.reason === 'Error'
      ) || pod.status?.phase === 'Failed';

      if (hasIssue) {
        const primaryIssue = getPrimaryIssue(containerStatuses, pod);
        problems.push({
          name: pod.metadata.name,
          phase: pod.status?.phase,
          issue: primaryIssue.issue,
          severity: primaryIssue.severity,
          container: primaryIssue.container,
          restarts: containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0),
          message: primaryIssue.message,
        });
      }
    }

    problems.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    });

    res.json({ namespace, problems, scannedPods: pods.items?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getPrimaryIssue(containerStatuses, pod) {
  for (const cs of containerStatuses) {
    if (cs.state?.waiting?.reason === 'CrashLoopBackOff') {
      return { issue: 'CrashLoopBackOff', severity: 'critical', container: cs.name, message: 'Container keeps crashing and restarting' };
    }
    if (cs.state?.waiting?.reason === 'ImagePullBackOff' || cs.state?.waiting?.reason === 'ErrImagePull') {
      return { issue: 'ImagePullError', severity: 'high', container: cs.name, message: cs.state.waiting.message || 'Failed to pull container image' };
    }
    if (cs.lastState?.terminated?.reason === 'OOMKilled') {
      return { issue: 'OOMKilled', severity: 'critical', container: cs.name, message: 'Container killed due to memory limit exceeded' };
    }
    if (cs.state?.terminated?.reason === 'Error') {
      return { issue: 'ContainerError', severity: 'high', container: cs.name, message: `Container exited with error (code ${cs.state.terminated.exitCode})` };
    }
    if (cs.restartCount > 5) {
      return { issue: 'FrequentRestarts', severity: 'medium', container: cs.name, message: `${cs.restartCount} restarts` };
    }
  }
  if (pod.status?.phase === 'Failed') {
    return { issue: 'PodFailed', severity: 'high', container: '-', message: pod.status?.reason || 'Pod in Failed state' };
  }
  return { issue: 'Unknown', severity: 'low', container: '-', message: 'Unidentified issue' };
}

function analyzePod(pod, containerStatuses, containers, events, logs, conditions) {
  const issues = [];
  const suggestions = [];
  const rootCauses = [];

  for (const cs of containerStatuses) {
    const container = containers.find(c => c.name === cs.name);
    const containerLog = logs[cs.name] || {};

    // CrashLoopBackOff analysis
    if (cs.state?.waiting?.reason === 'CrashLoopBackOff') {
      issues.push({
        severity: 'critical',
        container: cs.name,
        issue: 'CrashLoopBackOff',
        detail: `Container "${cs.name}" has restarted ${cs.restartCount} times and is in CrashLoopBackOff.`,
      });

      // Check OOMKilled
      if (cs.lastState?.terminated?.reason === 'OOMKilled') {
        rootCauses.push(`Container "${cs.name}" was OOMKilled (Out of Memory). Current memory limit: ${container?.resources?.limits?.memory || 'none set'}.`);
        suggestions.push({
          title: 'Increase memory limit',
          description: `The container is being killed because it exceeds its memory limit. Increase spec.containers[].resources.limits.memory.`,
          fix: container?.resources?.limits?.memory
            ? `Increase from ${container.resources.limits.memory} to at least ${suggestMemoryIncrease(container.resources.limits.memory)}`
            : 'Set a memory limit (e.g., 512Mi or 1Gi) and a request (e.g., 256Mi)',
          priority: 'high',
        });
      }
      // Check exit code
      else if (cs.lastState?.terminated?.exitCode === 1) {
        rootCauses.push(`Container "${cs.name}" exited with code 1 (application error).`);
        if (containerLog.previous) {
          const errorLines = extractErrorLines(containerLog.previous);
          if (errorLines.length > 0) {
            rootCauses.push(`Last error from logs: ${errorLines[0]}`);
          }
        }
        suggestions.push({
          title: 'Check application logs',
          description: 'The container is crashing due to an application error. Check the previous logs for stack traces or configuration issues.',
          fix: 'Review the "previous" logs in the Logs tab. Common causes: missing env vars, bad config, missing dependencies.',
          priority: 'high',
        });
      }
      else if (cs.lastState?.terminated?.exitCode === 137) {
        rootCauses.push(`Container "${cs.name}" received SIGKILL (exit code 137). Likely OOMKilled or terminated by the system.`);
        suggestions.push({
          title: 'Increase memory or check liveness probe',
          description: 'Exit code 137 means the process was killed. This is usually OOMKill or a failing liveness probe.',
          fix: 'Check if memory usage approaches the limit. Also verify liveness probe is not too aggressive.',
          priority: 'high',
        });
      }
      else if (cs.lastState?.terminated?.exitCode === 0) {
        rootCauses.push(`Container "${cs.name}" exited successfully (code 0) but Kubernetes keeps restarting it. The container may not have a long-running process.`);
        suggestions.push({
          title: 'Ensure container runs a long-lived process',
          description: 'The container exits cleanly but Kubernetes restarts it because restartPolicy=Always. The entrypoint should not exit.',
          fix: 'Check that the CMD/ENTRYPOINT in the Dockerfile runs a blocking process (e.g., a server, not a script that completes).',
          priority: 'medium',
        });
      }
    }

    // ImagePullBackOff
    if (cs.state?.waiting?.reason === 'ImagePullBackOff' || cs.state?.waiting?.reason === 'ErrImagePull') {
      issues.push({
        severity: 'high',
        container: cs.name,
        issue: 'ImagePullError',
        detail: `Cannot pull image "${container?.image}": ${cs.state.waiting.message || 'pull failed'}`,
      });
      rootCauses.push(`Image "${container?.image}" cannot be pulled. Common reasons: image doesn't exist, tag is wrong, or registry credentials are missing.`);
      suggestions.push({
        title: 'Verify image name and tag',
        description: 'Check that the image exists in the registry and the tag is correct.',
        fix: `Verify: docker pull ${container?.image}. If private registry, ensure imagePullSecrets is configured.`,
        priority: 'high',
      });
    }

    // OOMKilled (not in CrashLoop yet)
    if (cs.lastState?.terminated?.reason === 'OOMKilled' && cs.state?.running) {
      issues.push({
        severity: 'high',
        container: cs.name,
        issue: 'OOMKilled (recovered)',
        detail: `Container "${cs.name}" was previously OOMKilled but is currently running. ${cs.restartCount} total restarts.`,
      });
      suggestions.push({
        title: 'Increase memory limit to prevent future OOMKills',
        description: `Current limit: ${container?.resources?.limits?.memory || 'none'}. The container has been OOMKilled before.`,
        fix: `Increase memory limit to ${suggestMemoryIncrease(container?.resources?.limits?.memory || '256Mi')}`,
        priority: 'medium',
      });
    }
  }

  // Check events for scheduling issues
  const scheduleEvents = events.filter(e => e.reason === 'FailedScheduling');
  if (scheduleEvents.length > 0) {
    issues.push({
      severity: 'high',
      container: '-',
      issue: 'SchedulingFailed',
      detail: scheduleEvents[0].message,
    });
    rootCauses.push(`Pod cannot be scheduled: ${scheduleEvents[0].message}`);
    if (scheduleEvents[0].message?.includes('Insufficient')) {
      suggestions.push({
        title: 'Reduce resource requests or add nodes',
        description: 'The cluster does not have enough resources to schedule this pod.',
        fix: 'Reduce CPU/memory requests, or scale up the cluster.',
        priority: 'high',
      });
    }
  }

  // Check readiness
  const readyCondition = conditions.find(c => c.type === 'Ready');
  if (readyCondition?.status === 'False' && issues.length === 0) {
    issues.push({
      severity: 'medium',
      container: '-',
      issue: 'NotReady',
      detail: `Pod is not ready: ${readyCondition.reason || readyCondition.message || 'unknown reason'}`,
    });
    suggestions.push({
      title: 'Check readiness probe',
      description: 'The pod is running but not passing its readiness check.',
      fix: 'Verify the readiness probe endpoint is responding. Check if the application needs more startup time (increase initialDelaySeconds).',
      priority: 'medium',
    });
  }

  // Overall health score
  const healthScore = issues.length === 0 ? 100 :
    issues.some(i => i.severity === 'critical') ? 10 :
    issues.some(i => i.severity === 'high') ? 30 :
    issues.some(i => i.severity === 'medium') ? 60 : 80;

  return {
    healthScore,
    status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
    issues,
    rootCauses,
    suggestions,
    summary: issues.length === 0
      ? 'Pod appears healthy. No issues detected.'
      : `Found ${issues.length} issue(s). ${rootCauses[0] || ''}`,
  };
}

function extractErrorLines(logText) {
  const lines = logText.split('\n');
  return lines.filter(l =>
    /error|exception|fatal|panic|traceback|failed/i.test(l)
  ).slice(0, 3);
}

function suggestMemoryIncrease(currentLimit) {
  if (!currentLimit) return '512Mi';
  const match = currentLimit.match(/^(\d+)(Mi|Gi|M|G)$/);
  if (!match) return '512Mi';
  const value = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'Mi' || unit === 'M') {
    return value < 512 ? '512Mi' : `${Math.ceil(value * 1.5)}Mi`;
  }
  if (unit === 'Gi' || unit === 'G') {
    return `${Math.ceil(value * 1.5)}Gi`;
  }
  return '512Mi';
}

// --- RBAC Awareness (can-i checks) ---
app.get('/api/rbac/can-i', async (req, res) => {
  const { verb, resource, namespace, name } = req.query;
  if (!verb || !resource) {
    return res.status(400).json({ error: 'verb and resource query params required' });
  }

  try {
    const review = {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          verb,
          resource,
          namespace: namespace || undefined,
          name: name || undefined,
        },
      },
    };

    const authClient = kc.makeApiClient(k8s.AuthorizationV1Api);
    const result = await authClient.createSelfSubjectAccessReview(review);
    const allowed = result?.status?.allowed || false;

    res.json({
      allowed,
      verb,
      resource,
      namespace: namespace || '*',
      reason: result?.status?.reason || '',
    });
  } catch (e) {
    // Fail closed: if we can't verify the permission, deny it
    res.json({ allowed: false, verb, resource, namespace: namespace || '*', reason: 'RBAC check failed' });
  }
});

// Bulk permission check
app.post('/api/rbac/can-i-bulk', async (req, res) => {
  const { checks } = req.body;
  if (!checks || !Array.isArray(checks)) {
    return res.status(400).json({ error: 'checks array required' });
  }

  try {
    const authClient = kc.makeApiClient(k8s.AuthorizationV1Api);
    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          const review = {
            apiVersion: 'authorization.k8s.io/v1',
            kind: 'SelfSubjectAccessReview',
            spec: {
              resourceAttributes: {
                verb: check.verb,
                resource: check.resource,
                namespace: check.namespace || undefined,
              },
            },
          };
          const result = await authClient.createSelfSubjectAccessReview(review);
          return {
            ...check,
            allowed: result?.status?.allowed || false,
          };
        } catch (e) {
          return { ...check, allowed: false }; // fail closed
        }
      })
    );
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get permissions summary for current user in a namespace
app.get('/api/rbac/permissions/:namespace', async (req, res) => {
  const { namespace } = req.params;

  const resources = ['pods', 'deployments', 'services', 'configmaps', 'secrets', 'jobs', 'cronjobs', 'statefulsets', 'daemonsets', 'ingresses', 'persistentvolumeclaims'];
  const verbs = ['get', 'list', 'create', 'update', 'delete'];

  try {
    const authClient = kc.makeApiClient(k8s.AuthorizationV1Api);
    const permissions = {};

    await Promise.all(
      resources.map(async (resource) => {
        permissions[resource] = {};
        await Promise.all(
          verbs.map(async (verb) => {
            try {
              const review = {
                apiVersion: 'authorization.k8s.io/v1',
                kind: 'SelfSubjectAccessReview',
                spec: {
                  resourceAttributes: { verb, resource, namespace },
                },
              };
              const result = await authClient.createSelfSubjectAccessReview(review);
              permissions[resource][verb] = result?.status?.allowed || false;
            } catch (e) {
              permissions[resource][verb] = false; // fail closed
            }
          })
        );
      })
    );

    res.json({ namespace, permissions, user: currentIdentity?.username || os.userInfo().username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Apply YAML (Resource Creation/Update) ---
app.post('/api/apply', async (req, res) => {
  const { yaml: yamlContent, namespace } = req.body;
  if (!yamlContent) {
    return res.status(400).json({ error: 'yaml content required' });
  }

  try {
    // Use kubectl apply via stdin for maximum compatibility with all resource types
    if (namespace) validateNames(namespace);
    const proc = spawn('kubectl', ['apply', ...(namespace ? ['-n', namespace] : []), '-f', '-'], {
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.stdin.write(yamlContent);
    proc.stdin.end();

    await new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `kubectl apply exited with code ${code}`));
      });
      proc.on('error', reject);
    });

    // Invalidate cache for the namespace
    if (namespace) invalidateNamespace(namespace);

    res.json({
      success: true,
      message: stdout.trim(),
      resources: stdout.trim().split('\n').filter(Boolean),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Dry-run validation
app.post('/api/apply/validate', async (req, res) => {
  const { yaml: yamlContent, namespace } = req.body;
  if (!yamlContent) {
    return res.status(400).json({ error: 'yaml content required' });
  }

  try {
    const proc = spawn('kubectl', ['apply', ...(namespace ? ['-n', namespace] : []), '--dry-run=server', '-f', '-'], {
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.stdin.write(yamlContent);
    proc.stdin.end();

    await new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Validation failed with code ${code}`));
      });
      proc.on('error', reject);
    });

    res.json({ valid: true, message: stdout.trim() });
  } catch (e) {
    res.status(400).json({ valid: false, error: e.message });
  }
});

// --- Port Forwarding ---
const portForwards = new Map(); // id -> { process, namespace, resource, resourceName, localPort, remotePort, status }

app.get('/api/port-forwards', (req, res) => {
  const forwards = [];
  for (const [id, pf] of portForwards) {
    forwards.push({
      id,
      namespace: pf.namespace,
      resource: pf.resource,
      resourceName: pf.resourceName,
      localPort: pf.localPort,
      remotePort: pf.remotePort,
      status: pf.status,
      startedAt: pf.startedAt,
    });
  }
  res.json(forwards);
});

app.post('/api/port-forwards', (req, res) => {
  const { namespace, resource, resourceName, localPort, remotePort } = req.body;
  if (!namespace || !resource || !resourceName || !localPort || !remotePort) {
    return res.status(400).json({ error: 'namespace, resource, resourceName, localPort, and remotePort required' });
  }

  const id = `pf-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const target = `${resource}/${resourceName}`;
  const portMapping = `${localPort}:${remotePort}`;

  const proc = spawn('kubectl', ['port-forward', '-n', namespace, target, portMapping], {
    env: process.env,
  });

  const pf = {
    process: proc,
    namespace,
    resource,
    resourceName,
    localPort: parseInt(localPort),
    remotePort: parseInt(remotePort),
    status: 'starting',
    startedAt: new Date().toISOString(),
    output: '',
  };

  portForwards.set(id, pf);

  proc.stdout.on('data', (data) => {
    const msg = data.toString();
    pf.output += msg;
    if (msg.includes('Forwarding from')) {
      pf.status = 'active';
    }
  });

  proc.stderr.on('data', (data) => {
    pf.output += data.toString();
    if (pf.status === 'starting') {
      pf.status = 'error';
    }
  });

  proc.on('close', (code) => {
    pf.status = code === 0 ? 'stopped' : 'error';
    // Auto-cleanup after 30 seconds of being stopped
    setTimeout(() => portForwards.delete(id), 30000);
  });

  // Give it a moment to start, then respond
  setTimeout(() => {
    res.json({ id, localPort: pf.localPort, remotePort: pf.remotePort, status: pf.status });
  }, 500);
});

app.delete('/api/port-forwards/:id', (req, res) => {
  const { id } = req.params;
  const pf = portForwards.get(id);
  if (!pf) return res.status(404).json({ error: 'Port forward not found' });

  try {
    pf.process.kill();
    pf.status = 'stopped';
  } catch (e) {}

  portForwards.delete(id);
  res.json({ success: true });
});

// --- Helper Functions ---
function formatDeployment(d) {
  const replicas = d.spec.replicas || 0;
  const readyReplicas = d.status?.readyReplicas || 0;
  const updatedReplicas = d.status?.updatedReplicas || 0;
  const availableReplicas = d.status?.availableReplicas || 0;

  let status = 'Pending';
  if (replicas === 0) status = 'Scaled Down';
  else if (readyReplicas === replicas) status = 'Available';
  else if (readyReplicas > 0) status = 'Partial';

  const image = d.spec.template.spec.containers[0]?.image || '';
  const tag = image.split(':')[1] || 'latest';

  return {
    name: d.metadata.name,
    namespace: d.metadata.namespace,
    replicas,
    readyReplicas,
    updatedReplicas,
    availableReplicas,
    status,
    image,
    tag,
    ready: `${readyReplicas}/${replicas}`,
    age: d.metadata.creationTimestamp,
    labels: d.metadata.labels || {},
    annotations: d.metadata.annotations || {},
    claimedBy: d.metadata.annotations?.['podwright.io/claimed-by'] || null,
    claimExpires: d.metadata.annotations?.['podwright.io/claim-expires'] || null,
    containers: d.spec.template.spec.containers.map(c => ({
      name: c.name,
      image: c.image,
      ports: c.ports || [],
      resources: c.resources || {},
      env: c.env || [],
    })),
  };
}

function formatPod(p) {
  const containerStatuses = p.status?.containerStatuses || [];
  const totalRestarts = containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0);
  
  let status = p.status?.phase || 'Unknown';
  if (p.metadata.deletionTimestamp) status = 'Terminating';
  else if (containerStatuses.some(c => c.state?.waiting?.reason === 'CrashLoopBackOff')) status = 'CrashLoopBackOff';
  else if (containerStatuses.some(c => c.state?.waiting)) status = 'Pending';

  return {
    name: p.metadata.name,
    namespace: p.metadata.namespace,
    status,
    restarts: totalRestarts,
    containers: containerStatuses.length || p.spec.containers?.length || 0,
    ip: p.status?.podIP || '-',
    node: p.spec.nodeName || '-',
    age: p.metadata.creationTimestamp,
    labels: p.metadata.labels || {},
    ownerReferences: p.metadata.ownerReferences || [],
  };
}

// --- Register modular routes (must be before the production catch-all) ---
deploymentEvents.init({ wss, appsApi, coreApi: k8sApi, k8sPatch });
deploymentEvents.registerRoutes(app);
pro.registerRoutes(app, { getPodDiagnostics });

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// --- Initialize and Start ---
async function start() {
  await detectIdentity();

  server.listen(PORT, () => {
    console.log(`Podwright server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`User: ${currentIdentity?.username || 'unknown'}`);
  });
}

start().catch(e => {
  console.error('Failed to start Podwright:', e.message);
  process.exit(1);
});
