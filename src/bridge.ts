import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

type BridgeEvent = { id: string; at: string; type: string; payload: unknown };
type BridgeCommand = { id: string; at: string; action: string; payload: unknown };

export class LocalBridge {
  private server?: http.Server;
  private events: BridgeEvent[] = [];
  private commands: BridgeCommand[] = [];
  private readonly token = randomBytes(32).toString("hex");
  private port = 0;
  private connected = false;

  async start(requestedPort = 0) {
    this.server = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (!this.authorized(req.headers.authorization)) { res.writeHead(401).end(JSON.stringify({ error: "unauthorized" })); return; }
      if (req.method === "GET" && req.url === "/v1/health") {
        res.writeHead(200).end(JSON.stringify({ ok: true, connected: this.connected })); return;
      }
      if (req.method === "POST" && req.url === "/v1/events") {
        try {
          const body = await this.readBody(req);
          const event = JSON.parse(body.toString()) as Omit<BridgeEvent, "id" | "at">;
          if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("invalid event shape");
          this.events.push({ ...event, id: randomBytes(8).toString("hex"), at: new Date().toISOString() });
          this.events = this.events.slice(-500); this.connected = true;
          res.writeHead(202).end(JSON.stringify({ accepted: true }));
        } catch { res.writeHead(400).end(JSON.stringify({ error: "bad_request" })); }
        return;
      }
      if (req.method === "GET" && req.url === "/v1/commands/next") {
        res.writeHead(200).end(JSON.stringify(this.commands.shift() ?? null)); return;
      }
      res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject); this.server!.listen(requestedPort, "127.0.0.1", resolve);
    });
    this.port = (this.server.address() as { port: number }).port;
    return { host: "127.0.0.1", port: this.port, token: this.token };
  }

  private authorized(value?: string) {
    if (!value?.startsWith("Bearer ")) return false;
    const supplied = Buffer.from(value.slice(7)); const expected = Buffer.from(this.token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  private async readBody(req: http.IncomingMessage) {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length; if (size > 64 * 1024) throw new Error("request body too large");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  enqueue(action: string, payload: unknown) {
    if (this.commands.length >= 100) throw new Error("command queue is full");
    const command = { id: randomBytes(8).toString("hex"), at: new Date().toISOString(), action, payload };
    this.commands.push(command); return command;
  }

  status() {
    return { running: !!this.server, host: "127.0.0.1", port: this.port, connected: this.connected,
      queuedCommands: this.commands.length, recentEvents: this.events.slice(-50) };
  }

  drainEvents() { const result = this.events; this.events = []; return result; }
  async stop() {
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    this.server = undefined; this.connected = false;
  }
}
