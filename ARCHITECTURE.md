# Architecture

1. The MCP server runs locally and is independent of Otzaria.
2. Static checks and live testing are separate capabilities. Live mode remains unavailable until a verified host adapter exists.
3. No arbitrary shell commands or plugin JavaScript execution are exposed.
4. Host integration must be development-mode only, opt-in, and limited to plugin metadata, lifecycle, structured logs, exceptions, and explicitly registered test hooks.
5. Never bypass plugin permissions or expose unrestricted cross-plugin runtime access.

## Why a host adapter is required

Otzaria plugins run in isolated WebViews. A normal plugin cannot inspect another plugin's private runtime. A future host-side adapter must be reviewed upstream and must not expose secrets, arbitrary JavaScript evaluation, or general user-data access.
