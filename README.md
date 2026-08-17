# Podwright

Lightweight Kubernetes management dashboard. A fast, locally-run alternative to Lens and Headlamp, focused on daily developer workflows.

## Features

- Real-time workload monitoring with auto-refresh
- Deployment management (scale, restart, rollback, image updates)
- Pod logs streaming and terminal exec
- ConfigMap editing with syntax highlighting
- Namespace comparison and cloning
- Namespace cleanup automation
- Deployment change event tracking
- Dark/Light theme support
- Service search with history predictions

## Prerequisites

- Node.js 20+
- kubectl configured with cluster access
- Valid kubeconfig at ~/.kube/config

## Quick Start

```bash
npm run install:all
npm run dev
```

This starts:
- Backend API server on http://localhost:3001
- Frontend dev server on http://localhost:5173

## Auth Support

Podwright uses your local kubeconfig automatically:
- exec-based auth (EKS/OIDC via kubelogin or aws-iam-authenticator)
- Static token auth
- Certificate auth

## Tech Stack

- **Backend:** Node.js, Express, @kubernetes/client-node, WebSocket
- **Frontend:** React 18, React Router 6, TailwindCSS, Vite
- **No database, no Redis, no external services**

## Docker

```bash
docker build -t podwright .
docker run -p 3001:3001 -v ~/.kube:/root/.kube:ro podwright
```

## License

MIT
