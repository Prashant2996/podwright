# Contributing to Podwright

Thanks for your interest in contributing to Podwright! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm run install:all
   ```
3. Start the development servers:
   ```bash
   npm run dev
   ```
4. Open http://localhost:7071 in your browser

## Prerequisites

- Node.js 20+
- kubectl configured with cluster access
- A valid kubeconfig at `~/.kube/config`

For local development without a real cluster, use kind:
```bash
brew install colima kind kubectl docker
colima start
kind create cluster
```

## Project Structure

```
podwright/
├── server/          # Express backend (Node.js)
│   ├── index.js     # All API routes, WebSocket, K8s client
│   └── deploymentEvents.js  # Real-time change detection
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/  # Shared UI components
│       ├── hooks/       # React hooks (auto-refresh, theme, etc.)
│       └── pages/       # Page components (one per route)
├── package.json     # Root: server deps + scripts
└── Dockerfile       # Production Docker image
```

## Development Workflow

### Backend Changes

The server is a single `server/index.js` file. After changes, the running `npm run dev` process will need a restart (Ctrl+C and re-run).

### Frontend Changes

Vite provides hot module replacement. Changes to files in `client/src/` are reflected immediately in the browser.

### Adding a New Page

1. Create `client/src/pages/YourPage.jsx`
2. Add a route in `client/src/App.jsx`
3. Add a sidebar entry in `client/src/components/Sidebar.jsx` (with an icon from `@heroicons/react/24/outline`)
4. Add a breadcrumb label in `client/src/components/Breadcrumb.jsx`

### Adding a New API Endpoint

1. Add the route handler in `server/index.js`
2. Use `getCached(key)` / `setCache(key, data)` for read endpoints
3. Call `invalidateNamespace(ns)` after mutations
4. Return errors as `{ error: "message" }` with appropriate HTTP status

## Code Style

- No emojis in code or UI (all icons are SVG from heroicons)
- Use `@heroicons/react/24/outline` icons only
- Components use TailwindCSS utility classes
- Keep components in their own files
- Use `useAutoRefresh(fetchFn, deps)` for data that should auto-refresh
- Use `useToast()` for success/error notifications
- Use `useConfirm()` for destructive action confirmations

## Commit Messages

Use conventional commits:
```
feat: add port forwarding page
fix: resolve namespace caching issue
docs: update README with Docker instructions
refactor: extract shared timeAgo utility
```

## Pull Requests

- Keep PRs focused on a single feature or fix
- Include a description of what changed and why
- Ensure the client builds without errors: `cd client && npm run build`
- Ensure the server has no syntax errors: `node -c server/index.js`

## Reporting Issues

When reporting bugs, please include:
- Browser and OS
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)
- Kubernetes cluster type (kind, EKS, GKE, etc.)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
