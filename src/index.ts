#!/usr/bin/env node
import path from "node:path";
import { realpath } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readManifest, validateManifest } from "./manifest.js";
import { analyzeSource } from "./analyze.js";
import { LocalBridge } from "./bridge.js";

const rootArg = process.env.OTZARIA_PLUGIN_ROOT ?? process.argv[2];
if (!rootArg) { process.stderr.write("Pass a plugin project directory or set OTZARIA_PLUGIN_ROOT.\n"); process.exit(2); }
const root = await realpath(path.resolve(rootArg));
const bridge = new LocalBridge();
const bridgeInfo = await bridge.start(Number(process.env.OTZARIA_BRIDGE_PORT ?? 0));
const server = new McpServer({ name: "otzaria-test-bridge", version: "0.2.0" });

server.tool("otzaria_inspect_plugin", "Read a plugin manifest and report preliminary issues.", {}, async () => {
  try {
    const manifest = await readManifest(root);
    return { content: [{ type: "text", text: JSON.stringify({ root, manifest, manifestErrors: validateManifest(manifest) }, null, 2) }] };
  } catch (error) { return { isError: true, content: [{ type: "text", text: String(error) }] }; }
});
server.tool("otzaria_validate_manifest", "Run a quick manifest preflight; this is not the official validator.", {}, async () => {
  try {
    const errors = validateManifest(await readManifest(root));
    return { content: [{ type: "text", text: JSON.stringify({ valid: errors.length === 0, errors,
      note: "Preliminary check only; use Otzaria/otzaria-plugin-validator for authoritative validation." }, null, 2) }] };
  } catch (error) { return { isError: true, content: [{ type: "text", text: String(error) }] }; }
});
server.tool("otzaria_analyze_plugin_source", "Scan source for Otzaria RPC usage and review-worthy patterns.", {}, async () => {
  try { return { content: [{ type: "text", text: JSON.stringify(await analyzeSource(root), null, 2) }] }; }
  catch (error) { return { isError: true, content: [{ type: "text", text: String(error) }] }; }
});
server.tool("otzaria_bridge_status", "Check whether an authorized local diagnostic adapter has connected.", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify({ ...bridge.status(), endpoint: `http://${bridgeInfo.host}:${bridgeInfo.port}`,
    token: bridgeInfo.token, security: "Loopback-only; bearer token required. Keep token private." }, null, 2) }],
}));
server.tool("otzaria_read_diagnostic_events", "Read and clear events received from an authorized adapter.", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(bridge.drainEvents(), null, 2) }],
}));
server.tool("otzaria_queue_test_command", "Queue a limited command for a future adapter; does not bypass Otzaria permissions.", {
  action: z.enum(["ping", "capture_state", "run_named_test"]), payload: z.record(z.unknown()).default({}),
}, async ({ action, payload }) => ({
  content: [{ type: "text", text: JSON.stringify(bridge.enqueue(action, payload), null, 2) }],
}));
await server.connect(new StdioServerTransport());
process.stderr.write(`Otzaria Test Bridge ready on 127.0.0.1:${bridgeInfo.port}\n`);
