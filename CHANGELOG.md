# Changelog

All notable changes to Podwright will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
