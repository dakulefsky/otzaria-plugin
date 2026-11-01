# Otzaria Test Bridge

A local MCP companion for Codex and ChatGPT to inspect and test Otzaria plugins.

**Status: early prototype, not production-ready.** This repository is the home of the Test Bridge project.

## What it does today
- Inspect a plugin manifest and report preliminary issues.
- Scan source for Otzaria RPC/event usage and review-worthy patterns.
- Run the uploaded Test Bridge plugin's localhost polling protocol (`/plugin/hello`, `/plugin/poll`, `/plugin/result`, `/plugin/bye`).
- Dispatch `info`, `logs`, `call`, and optional Oraysa PDF discovery commands and wait for their results.
- Keep bounded event history and pending-command queues with timeouts.
- Inspect a configured plugin manifest and source when a plugin directory is supplied.

## Important limitations
Otzaria loads plugins in isolated WebViews. A regular plugin cannot inspect another plugin's private runtime. Real in-app testing requires a reviewed, development-only host adapter or supported desktop automation. This project does not claim otherwise.

## Official validation
Use [Otzaria's official plugin validator](https://github.com/Otzaria/otzaria-plugin-validator) as the authoritative check. The local manifest check is only preliminary. The example workflow in `examples/validate-plugin.yml` runs validation only and explicitly disables publishing.

## Security
The bridge binds to 127.0.0.1, uses a random 128-bit bearer token, compares tokens in constant time, limits request sizes, queue lengths and event history, and times out pending commands. It does not expose arbitrary shell execution or cross-plugin JavaScript execution. Keep the token private. Plugin-side hardening patches are in `plugin-integration/`; merge them into the installable plugin source and rebuild before distributing.

## Development
Requires Node.js 20+.

```bash
npm install
npm run build
```

Configure the MCP server in your client to run `node /absolute/path/to/otzaria-plugin/dist/index.js /absolute/path/to/plugin`. The plugin directory argument is optional; without it, source-inspection tools are disabled while the runtime bridge remains available.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the host adapter boundary and [plugin-integration/README.md](plugin-integration/README.md) for integration details.
