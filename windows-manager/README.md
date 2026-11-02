# Windows Manager (early preview)

A no-terminal WinForms manager for the local Test Bridge companion and OpenAI Secure MCP Tunnel.

It stores the runtime API key with Windows DPAPI (CurrentUser), writes a profile containing only an environment-variable secret reference, starts/stops tunnel-client, checks its loopback health endpoint, and launches the companion as a local stdio child. It does not open inbound firewall ports.

This is a manager prototype, not yet a complete installer. It currently expects the official OpenAI tunnel-client.exe, Node.js 20 or newer, and a built companion dist/index.js. It does not yet download or verify dependencies, install Node, create the Platform tunnel, or install itself as a Windows service.

The user must create a tunnel and runtime key in Platform first. The runtime key needs Tunnels Read + Use. Never send the key through chat or commit it to a repository.

Build on Windows: dotnet publish windows-manager/OtzariaBridgeManager.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
