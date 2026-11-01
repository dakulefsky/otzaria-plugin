# Test Bridge plugin integration 0.2.0

The uploaded Test Bridge plugin expects `POST /plugin/hello`, `GET /plugin/poll?wait=20`, `POST /plugin/result`, and `POST /plugin/bye`. The companion in `src/bridge.ts` now implements that protocol and queues `{ id, type, params }` commands.

Plugin command names are `info`, `logs`, `call`, and `discover`. MCP tools in `src/index.ts` dispatch those commands and wait for the plugin result.

Security follow-ups for the Otzaria-side source:

- Unknown API methods must require approval. Do not treat broad `library.*` or `search.*` prefixes as automatically safe. Populate an exact allowlist only from the official SDK specification.
- The plugin keeps the bearer token in memory only. It persists only non-secret preferences and requires token entry after each plugin reload.
- Keep Oraysa PDF discovery isolated as an optional site-specific feature.

The complete client source is now in this directory: `manifest.json`, `index.html`, `main.js`, and `js/bridge-{core,policy}.js` plus `js/pdf-filter.js`. Build the installer with `npm run pack`. The manifest permissions and network keys remain provisional until checked against the current Otzaria SDK and official validator.

A normal plugin can inspect its own WebView but cannot inspect another plugin's private runtime. Cross-plugin tests need a reviewed development-only host adapter or desktop automation.