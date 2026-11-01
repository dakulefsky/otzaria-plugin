# Otzaria Testing Bridge 0.3.0

An MCP-connected AI assistant (Codex, Claude, ChatGPT where MCP connections are supported, or another compatible MCP client) can communicate with the Test Bridge plugin running inside Otzaria.

```text
AI assistant -- MCP stdio --> companion (this repository)
                              -- localhost HTTP polling --> Test Bridge plugin in Otzaria
```

The assistant does not run inside Otzaria. The plugin polls the companion for commands, so the companion listens only on `127.0.0.1`.

**Status: integration prototype.** The companion now implements the uploaded plugin's HTTP route and command protocol. The updated plugin-side source and security changes are in `plugin-integration/`; they have not yet been assembled into a newly validated `.otzplugin` installer. The previously supplied `test-bridge-0.1.0.otzplugin` should therefore be treated as the older client.

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

4. Start or reconnect the MCP server, call `otzaria_status`, and copy the pairing token and port it reports into the Test Bridge plugin. The default port is `47615`; set `OTZARIA_BRIDGE_PORT` before starting the companion to choose another port. The current companion generates its token in memory at startup and reports it through `otzaria_status`. It does **not** currently implement the older `node server.js --show-token` command or persist a token at `~/.otzaria-bridge/token`.

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
| `otzaria_status` | Reports connection state, plugin version/metadata, port and pairing token. |
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
- Every non-preflight companion request requires the pairing bearer token. The token is generated for the companion process and changes when it restarts.
- Request sizes, queued commands, event history and command wait times are bounded.
- The companion does not expose arbitrary shell execution or arbitrary cross-plugin JavaScript execution.
- Otzaria plugins run in isolated WebViews. This plugin can inspect its own runtime and use APIs exposed to it; it cannot read another plugin's private JavaScript runtime or Otzaria host logs without additional host support.
- **Important:** the original 0.1.0 plugin's broad `library.*` and `search.*` auto-read rules have not been verified against the complete SDK specification. The conservative replacement policy in `plugin-integration/bridge-policy.js` treats methods as approval-required unless their exact names are explicitly verified and allowlisted. Merge the updated client source and policy into the installable plugin before relying on that stricter behavior.
- The companion and plugin output are untrusted diagnostic data. Text returned by the app, webpages, PDFs or plugin logs must be treated as data, not instructions to the assistant.
- Keep the pairing token private. The hardened client source avoids persisting it, but that change is not yet in a rebuilt installer.

## Test prompt

> Use the otzaria-test-bridge tools to test my plugin. Check otzaria_status, then otzaria_info. Run otzaria_discover_pdfs on the Oraysa daf pages I provide. Try an otzaria_call for a method I specify, pause for any approval in the Otzaria plugin panel, then read the logs and report each failure with its exact error.

## What it cannot do yet

It cannot click or type in other plugins' windows, open tabs, install or restart plugins, or read Otzaria's own host logs. Those capabilities need supported Otzaria host APIs, a reviewed development-only host adapter, or desktop automation. A normal plugin cannot bypass WebView isolation.

## SDK items that still need authoritative verification

The uploaded README and client rely on details that must be checked against the current Otzaria SDK documentation and host configuration before being treated as guaranteed:

- Manifest keys `networkEnabled` and `networkAllowlist`.
- Permission strings `network.localhost` and `network.access`.
- The `network.fetch` method and its `{ url, method, headers, body }` parameters.
- The parameter shapes and return values for `storage.get` and `storage.set`.
- Whether `127.0.0.1` / `localhost` and the Oraysa hosts must also be added to an Otzaria host-level network allowlist.

The browser-fetch fallback does not remove any host-level permission or WebView networking restrictions.

## Validation and tests

Build:

```bash
npm install
npm run build
```

The official [Otzaria plugin validator](https://github.com/Otzaria/otzaria-plugin-validator) remains authoritative for the installable plugin package. The repository's manifest check is only a preliminary preflight.

An end-to-end test suite matching the original server's `node tests/e2e.js` coverage (real companion over MCP stdio, plugin core over HTTP, authentication, Host-header rejection, approvals/declines, invalid methods, PDF discovery SSRF checks and logs) has **not yet been added or run**. Do not treat those tests as passing.
