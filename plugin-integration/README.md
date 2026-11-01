# Uploaded plugin integration

The uploaded Test Bridge plugin expects `POST /plugin/hello`, `GET /plugin/poll?wait=20`, `POST /plugin/result`, and `POST /plugin/bye`. The companion in `src/bridge.ts` now implements that protocol and queues `{ id, type, params }` commands.

Plugin command names are `info`, `logs`, `call`, and `discover`. MCP tools in `src/index.ts` dispatch those commands and wait for the plugin result.

Security follow-ups for the Otzaria-side source:

- Unknown API methods must require approval. Do not treat broad `library.*` or `search.*` prefixes as automatically safe. Populate an exact allowlist only from the official SDK specification.
- Do not persist the bearer token in localStorage or plugin storage. Persist only non-secret preferences and require pairing-token entry for each session.
- Keep Oraysa PDF discovery isolated as an optional site-specific feature.

The uploaded `.otzplugin` is the current installable artifact. Rebuild and run the official Otzaria validator before distributing an updated package.

A normal plugin can inspect its own WebView but cannot inspect another plugin's private runtime. Cross-plugin tests need a reviewed development-only host adapter or desktop automation.