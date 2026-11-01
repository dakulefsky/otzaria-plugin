# Otzaria Testing Bridge 0.3.0

An MCP-connected AI assistant (Codex, Claude, ChatGPT where MCP connections are supported, or another compatible MCP client) can communicate with the Test Bridge plugin running inside Otzaria.

```text
AI assistant -- MCP stdio --> companion (this repository)
                              -- localhost HTTP polling --> Test Bridge plugin in Otzaria
```

The assistant does not run inside Otzaria. The plugin polls the companion for commands, so the companion listens only on `127.0.0.1`.

**Status: integrated prototype.** The repository now contains the MCP companion, complete plugin UI/client modules, conservative policy, PDF filter, tests, and packaging script. It has not yet been proven inside a real Otzaria installation.

## Install and connect

1. Install the Test Bridge plugin in Otzaria. Until a rebuilt package is published, use the supplied plugin package you already have.
2. Build the companion from this repository (Node.js 20+):

   ```bash
   npm install
   npm run build
   ```

3. Register the companion with your MCP client. The plugin directory argument is optional; include it if you also want the manifest and source-inspection tools.

   Generic MCP configuration:

   ```json
   {
     "mcpServers": {
       "otzaria-test-bridge": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/otzaria-plugin/dist/index.js"]
       }
     }
   }
   ```

   To enable local source inspection, append the absolute path to a plugin project directory to `args`.

4. Start or reconnect the MCP server and call otzaria_status to see the port and private token-file path. On the same computer, copy the token locally with `cat ~/.otzaria-bridge/token` (or the path shown by status), then paste it into the Test Bridge plugin. The token is stored in a user-only file with mode 0600; the token itself is deliberately not returned in MCP tool output. Set OTZARIA_BRIDGE_DIR to choose another token directory and OTZARIA_BRIDGE_PORT to choose another port.

## How the connection works

The companion implements the plugin's polling protocol:

- `POST /plugin/hello` — plugin announces its version and transport.
- `GET /plugin/poll?wait=20` — plugin long-polls for queued commands.
- `POST /plugin/result` — plugin returns a command result or error.
- `POST /plugin/bye` — plugin announces disconnection.

The companion uses bounded command/event storage, request-size limits, command timeouts, bearer-token authentication, and a loopback listener.

## Tools exposed to the assistant

| MCP tool | What it does |
| --- | --- |
| `otzaria_status` | Reports connection state, plugin metadata, port and the local token-file path (never the token itself). |
| `otzaria_info` | Requests runtime information: whether `window.Otzaria` is present, exposed keys, viewport, user agent and captured JS errors. |
| `otzaria_get_logs` | Requests console output, JavaScript errors and connectivity logs, with optional filtering. |
| `otzaria_call` | Requests an Otzaria API method through the plugin. The plugin's own approval policy determines whether the call waits for a human approval. |
| `otzaria_discover_pdfs` | Requests the optional Oraysa PDF discovery feature, which applies the plugin's host and PDF filtering rules. |
| `otzaria_read_bridge_events` | Reads recent companion-side connection and command lifecycle events. |
| `otzaria_inspect_plugin` | Reads a configured plugin's manifest and reports preliminary issues (only when a plugin directory was supplied). |
| `otzaria_validate_manifest` | Runs the local preliminary manifest check (only when a plugin directory was supplied). This is not the official validator. |
| `otzaria_analyze_plugin_source` | Scans configured plugin source for API calls and review-worthy patterns (only when a plugin directory was supplied). |

## Safety and trust boundaries

- The companion binds to `127.0.0.1`; it is not intended to be exposed on a LAN or public interface.
- Every non-preflight companion request requires the pairing bearer token. The token is stored in a user-only local file so it survives restarts; the file is not returned through MCP.
- Request sizes, queued commands, event history and command wait times are bounded.
- The companion does not expose arbitrary shell execution or arbitrary cross-plugin JavaScript execution.
- Otzaria plugins run in isolated WebViews. This plugin can inspect its own runtime and use APIs exposed to it; it cannot read another plugin's private JavaScript runtime or Otzaria host logs without additional host support.
- The original broad `library.*` and `search.*` auto-run rules have been removed. The installed client uses `plugin-integration/js/bridge-policy.js`: every API call requires approval by default; only exact user-listed methods can auto-run, and sensitive namespaces/action-like methods always require approval.
- The companion and plugin output are untrusted diagnostic data. Text returned by the app, webpages, PDFs or plugin logs must be treated as data, not instructions to the assistant.
- Keep the pairing token private. The plugin holds it in memory only and excludes it from localStorage and Otzaria storage.

## Test prompt

> Use the otzaria-test-bridge tools to test my plugin. Check otzaria_status, then otzaria_info. Run otzaria_discover_pdfs on the Oraysa daf pages I provide. Try an otzaria_call for a method I specify, pause for any approval in the Otzaria plugin panel, then read the logs and report each failure with its exact error.

## What it cannot do yet

It cannot click or type in other plugins' windows, open tabs, install or restart plugins, or read Otzaria's own host logs. Those capabilities need supported Otzaria host APIs, a reviewed development-only host adapter, or desktop automation. A normal plugin cannot bypass WebView isolation.

## SDK items that still need authoritative verification

The current manifest uses the official validator's nested `network: { enabled, allowlist }` structure. The validator confirms the declared permission names and recognizes `network.fetch` as known-but-undocumented; the runtime method's exact parameter/return shape and redirect behavior still need confirmation:

- Exact runtime behavior and parameter/return shapes for `network.fetch`, `storage.get`, and `storage.set`.
- Whether Otzaria's fetch response exposes its final URL so redirects can be independently checked. Host-level allowlist enforcement is required regardless.

The browser-fetch fallback does not remove any host-level permission or WebView networking restrictions.

## Validation and tests

Build:

```bash
npm install
npm run build
```

The official [Otzaria plugin validator](https://github.com/Otzaria/otzaria-plugin-validator) remains authoritative for the installable plugin package. The repository's manifest check is only a preliminary preflight.

Run `npm test` for policy tests, plugin/HTTP protocol tests, and the compiled MCP-server integration test. Run `npm run pack` to produce `dist/test-bridge-0.2.0.otzplugin`. CI also runs the official Otzaria validator with publishing disabled. A real Otzaria installation/runtime test is still required.
