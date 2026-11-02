# Secure remote connection from ChatGPT to Otzaria

This guide describes the supported remote path for the Dell running Otzaria and a separate computer running ChatGPT.

## Important account and organization prerequisites

Secure MCP Tunnel is transport, not an entitlement. OpenAI's current ChatGPT documentation says custom MCP server connections are available on ChatGPT Business and Enterprise/Edu. Pro supports custom MCP servers with read/fetch permissions only. Free accounts cannot currently create this custom MCP connection. The Test Bridge includes actions that may modify application state, so read/fetch-only access is not sufficient for its full test workflow.

Before installing anything, confirm that the ChatGPT workspace/account can create a custom MCP app and that the associated Platform organization grants:
- Tunnels Read + Manage to the person creating the tunnel.
- Tunnels Read + Use to the runtime key principal and the person selecting the tunnel in ChatGPT.
- A Platform runtime API key for the long-running tunnel client. Do not use an admin key as the daemon's runtime key.

Official setup pages:
- ChatGPT custom MCP: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- Platform tunnel management: https://platform.openai.com/settings/organization/tunnels
- Runtime API keys: https://platform.openai.com/settings/organization/api-keys
- Official tunnel-client releases: https://github.com/openai/tunnel-client/releases/latest

## Architecture

```text
ChatGPT on Mac
  -> OpenAI-hosted Secure MCP Tunnel
  <- outbound HTTPS polling from Dell
tunnel-client on Dell
  -> launches the local Otzaria MCP companion over stdio
companion on Dell
  -> HTTP loopback only (127.0.0.1)
Test Bridge plugin inside Otzaria on Dell
```

No inbound router/firewall port is opened. The companion continues listening only on 127.0.0.1. The plugin continues to use its local pairing token. The OpenAI tunnel client and MCP companion must run on the Dell, where they can reach the Otzaria WebView.

## Manual proof-of-concept (Windows)

This is an operator procedure, not yet a one-click installer.

1. Install Node.js 20 or newer on the Dell.
2. Download this repository on the Dell and build the companion:
   ```powershell
   npm install
   npm run build
   ``
3. Download the official Windows x64 (or matching Windows ARM64) `tunnel-client` release from the official release page. Verify its archive against the release's `SHA256SUMS.txt` before running it.
4. In Platform Tunnels, create a tunnel associated with the intended ChatGPT workspace and Platform organization. Keep the complete returned `tunnel_id`.
5. Create a Platform **runtime** API key with Tunnels Read + Use for that tunnel. Keep it private.
6. Create a named stdio profile. The command must start the built companion using the Dell's local Node executable and absolute path to `dist/index.js`. The supported CLI pattern is:
   ```text
   tunnel-client init --sample sample_mcp_stdio_local --profile otzaria-dell --tunnel-id <TUNNEL_ID> --mcp-command "<COMMAND THAT STARTS THE LOCAL COMPANION>"
   ```
7. Set `CONTROL_PLANE_API_KEY` in the process environment (do not put the key in the command line, profile file, repository, or a shared script).
8. Run `tunnel-client doctor --profile otzaria-dell --explain`, then `tunnel-client run --profile otzaria-dell`. Keep it running while using the ChatGPT app.
9. In ChatGPT web, open Plugins, add a custom MCP server, choose **Tunnel**, select/paste the tunnel ID, review the risk warning, and create the app. Install it and test `otzaria_status`.
10. In Otzaria on the Dell, open Test Bridge, paste the local pairing token from the companion's token file, and press Connect.

The exact Windows stdio command string depends on the actual installation paths and Windows quoting. Do not copy a guessed command blindly; the planned installer should generate it from detected paths.

## Security requirements for the installer

A Windows installer/wizard must:
- Download only official OpenAI tunnel-client release assets and verify the published SHA-256 checksum before extraction.
- Install or locate a supported Node.js runtime and verify its version.
- Build or install a pinned, CI-verified version of this companion.
- Store the runtime API key in Windows Credential Manager or another OS-protected secret store; never write it into a profile, batch file, logs, or command arguments.
- Keep the companion HTTP listener on 127.0.0.1 only.
- Keep the pairing token in the companion's private local token file; never print it in logs.
- Generate the tunnel-client profile with a stdio command that launches the companion on the Dell.
- Provide visible Start, Stop, Health, and Logs actions, with secrets redacted.
- Never disable antivirus, bypass application-control policy, or ask the user to weaken Windows security settings.
- Clearly report that a tunnel can be running even when ChatGPT account permissions prevent adding the custom MCP app.

## Current limitations

- This repository's companion and plugin have passed CI and the official Otzaria manifest validator, but a real Otzaria runtime test is still required.
- Otzaria plugins run in isolated WebViews. The bridge cannot inspect another plugin's private JavaScript runtime or host logs without host-level support.
- The Test Bridge plugin currently uses a manually pasted local pairing token. The tunnel carries MCP traffic; it does not replace local plugin-to-companion pairing.
- This guide is not a claim that a Windows installer has been built or tested. The installer should be developed and validated separately before distribution.
