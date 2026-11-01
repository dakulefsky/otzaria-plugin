# Otzaria Test Bridge

A local MCP companion for Codex and ChatGPT to inspect and test Otzaria plugins.

**Status: early prototype, not production-ready.** This repository is the home of the Test Bridge project.

## What it does today
- Inspect a plugin manifest and report preliminary issues.
- Scan source for Otzaria RPC/event usage and review-worthy patterns.
- Run a local loopback diagnostics bridge with bearer-token authentication.
- Queue a small allowlisted set of diagnostic commands for a future host adapter.

## Important limitations
Otzaria loads plugins in isolated WebViews. A regular plugin cannot inspect another plugin's private runtime. Real in-app testing requires a reviewed, development-only host adapter or supported desktop automation. This project does not claim otherwise.

## Official validation
Use [Otzaria's official plugin validator](https://github.com/Otzaria/otzaria-plugin-validator) as the authoritative check. The local manifest check is only preliminary. The example workflow in `examples/validate-plugin.yml` runs validation only and explicitly disables publishing.

## Security
The bridge binds to 127.0.0.1, uses a random bearer token, limits request sizes and queue lengths, and does not expose arbitrary shell execution or cross-plugin JavaScript execution. Keep the token private.

## Development
Requires Node.js 20+.

```bash
npm install
npm run build
```

Configure the MCP server in your client to run `node /absolute/path/to/otzaria-plugin/dist/index.js /absolute/path/to/plugin`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the host adapter boundary.
