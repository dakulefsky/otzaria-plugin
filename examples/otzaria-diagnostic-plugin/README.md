# Diagnostic adapter contract (proposal)

A normal plugin cannot inspect another plugin's isolated WebView. The Otzaria host must explicitly provide a development-only diagnostic interface before live inspection can work.

The proposed adapter may report plugin ID/version, lifecycle state, structured logs, uncaught exceptions, and explicitly registered test hooks. It must not provide arbitrary cross-plugin JavaScript execution, access to secrets, or general user-data access. Do not loosen global network policy or add wildcard CORS.
