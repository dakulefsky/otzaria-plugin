# Otzaria Bridge for Windows (portable package)

This is a portable Windows x64 package for the Otzaria Test Bridge and OpenAI Secure MCP Tunnel. It includes:
- The Windows manager (self-contained .NET 8 app)
- Node.js 22 LTS x64, downloaded from nodejs.org and verified against the publisher's SHA-256 manifest
- OpenAI tunnel-client v0.0.19 x64, verified against the SHA-256 digest published with the official GitHub release
- The bundled MCP companion entry point (no npm install or terminal required on the Dell)

## Setup

1. Create an OpenAI Platform tunnel and a runtime API key. The key needs Tunnels Read + Use. Do not send the key through chat or commit it to a repository.
2. Extract the ZIP on the Windows PC that runs Otzaria.
3. Open `OtzariaBridgeManager.exe`.
4. Enter the tunnel ID and runtime API key, then choose **Save & Start**. The key is protected with Windows DPAPI for the current Windows account.
5. Wait for the pairing token to appear. Copy it in the manager and paste it into the Test Bridge plugin's settings in Otzaria. Connect the plugin.
6. Keep the manager open while using the bridge. Closing it stops the tunnel and companion process.

The manager generates the profile using the official tunnel-client `init --sample sample_mcp_stdio_local` flow. The companion's local HTTP listener remains bound to 127.0.0.1; no inbound firewall or router port is opened.

## Important limitations

- This is a portable app package, not a Windows service or auto-start installer. The manager must remain open.
- The Platform tunnel and runtime key must be created by the user; this package does not create organization resources or keys.
- Live testing against an actual Otzaria installation and a connected ChatGPT MCP client is still required.
- ChatGPT custom MCP availability depends on plan/workspace entitlements. Free does not support custom MCP servers; Pro supports read/fetch only, while this bridge's full workflow needs Business or Enterprise/Edu.
- The manager is intended for the same Windows account that runs Otzaria, because the pairing token and DPAPI-protected key are user-scoped.

## Build

The Windows GitHub Actions workflow builds the companion, publishes the manager, downloads and verifies the official runtimes, and packages the portable ZIP.
