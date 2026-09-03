# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Podwright, please report it
privately. **Do not open a public GitHub issue for security problems.**

Email: prashant.gupta9296@gmail.com

Please include:
- A description of the vulnerability
- Steps to reproduce
- Affected version / commit
- Potential impact

You can expect an acknowledgement within a few days.

## Security Model

Podwright is a **local-first** tool. It is designed to run on a developer's
own machine and bind to `localhost` only. It uses the operator's existing
kubeconfig and therefore acts with that user's Kubernetes permissions.

### Important deployment guidance

- **Do NOT expose Podwright's server (port 7070) to the public internet.**
  It has no built-in authentication and would grant anyone who can reach it
  the same cluster access as your kubeconfig.
- If you need remote/shared access, put it behind an authenticating reverse
  proxy (OAuth2 proxy, VPN, or SSO gateway) and restrict network access.
- Treat the machine running Podwright as trusted — it can exec into pods and
  apply resources.

### What Podwright does to stay safe

- **No command injection:** All shell-outs to `kubectl`/`helm` use argument
  arrays (`execFile`/`spawn`), never string interpolation. Kubernetes resource
  names are validated against RFC 1123 before use.
- **TLS:** Cluster API calls use a per-request HTTPS agent honoring your
  kubeconfig's CA data; it never disables TLS verification globally.
- **RBAC-aware:** Permission checks fail closed (deny on error).
- **No secret leakage:** Upstream Kubernetes API error bodies are not
  forwarded to clients.
- **Bring-your-own-key:** LLM API keys (Pro) are stored locally in the
  browser and sent only to your chosen LLM provider.
- **No telemetry:** Podwright does not phone home or collect usage data.

## Dependency Security

- Dependencies are monitored automatically via GitHub Dependabot (weekly).
- CI does not currently fail on `npm audit`; run `npm audit` locally before
  releases.
- Supported Node.js versions: 20 and 22.

## Supported Versions

Only the latest release receives security updates.
