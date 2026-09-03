/**
 * Deployment Events Module
 * Real-time deployment change detection and broadcast via WebSocket.
 * Polls deployments every 30s, detects tag changes and pod crash spikes.
 */

const MAX_EVENTS = 500;
const POLL_INTERVAL = 30000; // 30 seconds
const CRASH_THRESHOLD = 3; // restarts in 5 minutes

let wss = null;
let appsApi = null;
let coreApi = null;
let k8sPatchFn = null;

// State
const events = [];
const lastKnownImages = new Map(); // key: "ns/name" -> image string
const watchedNamespaces = new Set();
let pollTimer = null;

function init(deps) {
  wss = deps.wss;
  appsApi = deps.appsApi;
  coreApi = deps.coreApi;
  k8sPatchFn = deps.k8sPatch;

  // Start polling if any namespaces are watched
  startPolling();
}

function registerRoutes(app) {
  // Get events for namespace
  app.get('/api/deployment-events/:namespace', (req, res) => {
    const { namespace } = req.params;
    const filtered = events.filter(e => e.namespace === namespace);
    res.json(filtered);
  });

  // Watch a namespace
  app.post('/api/deployment-events/watch/:namespace', (req, res) => {
    const { namespace } = req.params;
    watchedNamespaces.add(namespace);
    if (!pollTimer) startPolling();
    res.json({ success: true, watching: Array.from(watchedNamespaces) });
  });

  // Unwatch a namespace
  app.post('/api/deployment-events/unwatch/:namespace', (req, res) => {
    const { namespace } = req.params;
    watchedNamespaces.delete(namespace);
    // Clean up lastKnownImages for this namespace
    for (const key of lastKnownImages.keys()) {
      if (key.startsWith(`${namespace}/`)) {
        lastKnownImages.delete(key);
      }
    }
    if (watchedNamespaces.size === 0) stopPolling();
    res.json({ success: true, watching: Array.from(watchedNamespaces) });
  });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollDeployments, POLL_INTERVAL);
  // Initial poll
  pollDeployments();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollDeployments() {
  for (const namespace of watchedNamespaces) {
    try {
      await checkNamespace(namespace);
    } catch (e) {
      console.error(`[DeploymentEvents] Error polling ${namespace}:`, e.message);
    }
  }
}

async function checkNamespace(namespace) {
  if (!appsApi || !coreApi) return;

  try {
    // Check deployment image changes
    const depResult = await appsApi.listNamespacedDeployment({ namespace });
    for (const dep of depResult.items) {
      const name = dep.metadata.name;
      const key = `${namespace}/${name}`;
      const currentImage = dep.spec.template.spec.containers[0]?.image || '';

      const previousImage = lastKnownImages.get(key);
      if (previousImage && previousImage !== currentImage) {
        const previousTag = previousImage.split(':')[1] || 'latest';
        const currentTag = currentImage.split(':')[1] || 'latest';
        
        addDeploymentEvent({
          type: 'tag-change',
          namespace,
          deployment: name,
          previousTag,
          currentTag,
          previousImage,
          currentImage,
          timestamp: new Date().toISOString(),
          message: `${name}: ${previousTag} -> ${currentTag}`,
        });
      }
      lastKnownImages.set(key, currentImage);
    }

    // Check for pod crash spikes
    const podResult = await coreApi.listNamespacedPod({ namespace });
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const pod of podResult.items) {
      const containerStatuses = pod.status?.containerStatuses || [];
      for (const cs of containerStatuses) {
        if (cs.restartCount >= CRASH_THRESHOLD) {
          const lastTerminated = cs.lastState?.terminated;
          if (lastTerminated?.finishedAt && new Date(lastTerminated.finishedAt) > fiveMinutesAgo) {
            const deploymentName = getDeploymentNameFromPod(pod);
            if (deploymentName) {
              // Only emit if we haven't recently emitted for this pod
              const eventKey = `crash-${pod.metadata.name}-${cs.restartCount}`;
              const recentCrashEvent = events.find(e => 
                e.eventKey === eventKey && 
                new Date(e.timestamp) > fiveMinutesAgo
              );

              if (!recentCrashEvent) {
                addDeploymentEvent({
                  type: 'pod-crash',
                  namespace,
                  deployment: deploymentName,
                  podName: pod.metadata.name,
                  container: cs.name,
                  restartCount: cs.restartCount,
                  reason: lastTerminated.reason || 'Unknown',
                  timestamp: new Date().toISOString(),
                  message: `${pod.metadata.name} crashed (${cs.restartCount} restarts, reason: ${lastTerminated.reason || 'Unknown'})`,
                  eventKey,
                });
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`[DeploymentEvents] checkNamespace(${namespace}) error:`, e.message);
  }
}

function getDeploymentNameFromPod(pod) {
  const ownerRefs = pod.metadata?.ownerReferences || [];
  const rsOwner = ownerRefs.find(ref => ref.kind === 'ReplicaSet');
  if (rsOwner) {
    // ReplicaSet name is typically "deployment-name-hash"
    const parts = rsOwner.name.split('-');
    parts.pop(); // Remove the hash
    return parts.join('-');
  }
  return null;
}

function addDeploymentEvent(event) {
  event.id = `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  events.unshift(event);

  // Trim to max size (ring buffer)
  while (events.length > MAX_EVENTS) {
    events.pop();
  }

  // Broadcast to WebSocket clients
  broadcast(event);
}

function broadcast(event) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'deployment-event',
    event,
  });

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      // Only send if client is subscribed to events
      if (client.subscribedToEvents) {
        if (!client.eventNamespace || client.eventNamespace === event.namespace) {
          client.send(message);
        }
      }
    }
  });
}

module.exports = {
  init,
  registerRoutes,
  addDeploymentEvent,
  lastKnownImages,
};
