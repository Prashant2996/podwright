# Changelog

All notable changes to Podwright will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deferred (breaking dependency upgrades - not adopted yet)
These major upgrades were reviewed and intentionally deferred; Dependabot is
configured to ignore them until a planned migration:
- `@kubernetes/client-node` 2.x — removes `LogStream` (breaks WebSocket log
  streaming) and switches to undici; needs code changes
- `express` 5.x — breaking middleware/routing changes
- `react` / `react-dom` 19.x — needs full UI regression testing
- `tailwindcss` 4.x — new config system (full rewrite)
- `vite` 8.x + `@vitejs/plugin-react` 6.x — recently moved to vite 7

### Added
- **Podwright Pro** tier with LLM-powered troubleshooter (OpenAI / Anthropic,
  bring-your-own-key). Gated behind a license key.
- License key system (`server/pro.js`) with activation UI (`/pro` page).
- Standalone Stripe fulfillment service (`fulfillment/`) that issues license
  keys on payment and emails them to customers.
- Marketing landing page (`website/`) with pricing.
- Configurable ports (backend 7070, frontend 7071) to avoid conflicts with
  common dev-server ports.

### Security
- Removed command-injection surface in namespace cleanup: the client now sends
  typed actions instead of raw shell commands; the server executes a fixed
  registry of commands via execFile with argument arrays and validates all
  Kubernetes names (RFC 1123).
- Cronjob trigger and cleanup preview now use execFile (no shell interpolation).
- TLS verification for raw PATCH calls now uses a per-request HTTPS agent
  instead of mutating the global NODE_TLS_REJECT_UNAUTHORIZED flag.
- Upstream Kubernetes API error bodies are no longer leaked to clients.
- RBAC permission checks now fail closed (deny on error) instead of fail open.

### Fixed
- Deployment change event tracking now works (was using wrong response shape).
- Compare, clone, and troubleshoot endpoints now use the correct
  @kubernetes/client-node v1.x object-argument API form.
- Deploy scale endpoint validates replica count (0-1000).

### Changed
- License changed from MIT to AGPL-3.0-or-later to protect against
  closed-source commercial forks while keeping the project open source.
- Dockerfile is now multi-stage and installs kubectl and helm (required by
  cleanup, apply, exec, port-forward, and cronjob features).

### Performance / Reliability
- In-memory cache now periodically evicts expired entries.
- WebSocket log/exec streams apply backpressure (drop on slow clients).
- Client WebSocket no longer reconnects on notification-toggle and clears
  reconnect timers on unmount.

## [0.1.0] - 2026-08-17

### Added

#### Core Dashboard
- Workloads overview with interactive donut chart (pod status) and stacked bar (deployment health)
- Deployments management: scale, restart, rollback, inline image tag editing, bulk actions
- Pods with 6-tab detail view: Info, Logs, Terminal, Events, Health, Conditions
- Services, Ingresses, ConfigMaps, Secrets, StatefulSets, DaemonSets, Jobs, CronJobs, PVCs
- Nodes overview with status, roles, version, resources
- Events timeline with type filtering (Warning/Normal)

#### Advanced Features
- Multi-cluster context switching (kubeconfig contexts)
- Port forwarding management (start/stop/open)
- Apply YAML (create/update resources with dry-run validation)
- RBAC permissions matrix (SelfSubjectAccessReview)
- AI Troubleshooter (CrashLoopBackOff, OOMKilled, ImagePull, scheduling analysis)
- Namespace comparison with deployment diff and ConfigMap diff
- Namespace cleanup automation (Helm releases, completed pods, Kafka topics)
- Deployment change event tracking (real-time via WebSocket)

#### UI/UX
- Collapsible sidebar with resource count badges
- Global search with autocomplete and history predictions
- Auto-refresh with configurable interval (5-60s)
- Dark/Light theme with full CSS theming
- Toast notifications, confirmation modals
- YAML/JSON viewer with syntax highlighting
- Breadcrumb navigation
- Searchable namespace dropdown with keyboard navigation

#### Architecture
- Express backend with in-memory 5s TTL cache
- WebSocket server for log streaming, terminal exec, deployment events
- Native fetch-based k8sPatch for proper K8s PATCH operations
- Supports exec-based auth (EKS/OIDC), token, and certificate auth
- No database, no Redis, no external services
- Starts in under 3 seconds
