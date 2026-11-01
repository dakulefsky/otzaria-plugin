import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

type Command = { id: string; type: string; params: Record<string, unknown> };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type PluginHello = { version: string; userAgent: string; transport: string; at: string };
type EventRecord = { at: string; type: string; payload: unknown };

const MAX_BODY = 2 *  1024 * 1024;
const MAX_QUEUE = 100;
const MAX_EVENTS = 500;
const POLL_MAX_MS = 25_000;
const CONNECTED_MS = 45_000;

export class LocalBridge {
  private server?: http.Server;
  private readonly token = randomBytes(16).toString("hex");
  private port = 0;
  private hello: PluginHello | null = null;
  private lastPollAt = 0;
  private queue: Command[] = [];
  private pending = new Map<string, Pending>();
  private events: EventRecord[] = [];
  private waiter: { res: http.ServerResponse; timer: NodeJS.Timeout } | null = null;
  private httpError: string | null = null;

  async start(requestedPort = Number(process.env.OTZARIA_BRIDGE_PORT ?? 47615)) {
    this.server = http.createServer((req, res) => { void this.handle(req, res); });
    this.server.on("error", error => { this.httpError = error.message; });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(requestedPort, "127.0.0.1", resolve);
    });
    this.port = (this.server.address() as { port: number }).port;
    return { host: "127.0.0.1", port: this.port, token: this.token };
  }

  private send(res: http.ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "600",
    });
    res.end(JSON.stringify(value));
  }

  private hostAllowed(req: http.IncomingMessage) {
    const host = String(req.headers.host ?? "");
    return host === `127.0.0.1:${this.port}` || host === `localhost:${this.port}` || host === `[::1]:${this.port}`;
  }

  private authorized(value?: string) {
    if (!value?.startsWith("Bearer ")) return false;
    const supplied = Buffer.from(value.slice(7));
    const expected = Buffer.from(this.token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  private async readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.from(chunk);
      size += part.length;
      if (size > MAX_BODY) throw new Error("request body too large");
      chunks.push(part);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object");
    return parsed as Record<string, unknown>;
  }

  private record(type: string, payload: unknown) {
    this.events.push({ at: new Date().toISOString(), type, payload });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  private connected() {
    return !!this.hello && Date.now() - this.lastPollAt < CONNECTED_MS;
  }

  private flushWaiter() {
    if (!this.waiter || !this.queue.length) return;
    const current = this.waiter;
    this.waiter = null;
    clearTimeout(current.timer);
    current.res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
    current.res.end(JSON.stringify({ commands: this.queue.splice(0) }));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.hostAllowed(req)) { this.send(res, 403, { error: "bad host header" }); return; }
    // Browser/WebView CORS preflight does not carry the bearer token.
    if (req.method === "OPTIONS") { this.send(res, 204, {}); return; }
    if (!this.authorized(req.headers.authorization)) { this.send(res, 401, { error: "bad token" }); return; }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    try {
      if (req.method === "POST" && url.pathname === "/plugin/hello") {
        const body = await this.readBody(req);
        this.hello = {
          version: String(body.version ?? "").slice(0, 80),
          userAgent: String(body.userAgent ?? "").slice(0, 300),
          transport: String(body.transport ?? "").slice(0, 80),
          at: new Date().toISOString(),
        };
        this.lastPollAt = Date.now();
        this.record("plugin.connected", this.hello);
        this.send(res, 200, { ok: true, companion: "0.3.0" });
        return;
      }
      if (req.method === "GET" && url.pathname === "/plugin/poll") {
        this.lastPollAt = Date.now();
        if (this.waiter) {
          clearTimeout(this.waiter.timer);
          this.waiter.res.end(JSON.stringify({ commands: [] }));
          this.waiter = null;
        }
        if (this.queue.length) {
          this.send(res, 200, { commands: this.queue.splice(0) });
          return;
        }
        const requested = Number(url.searchParams.get("wait") ?? 20);
        const waitMs = Math.min(Math.max(Number.isFinite(requested) ? requested : 20, 1), 25) * 1000;
        const timer = setTimeout(() => {
          if (this.waiter?.res === res) this.waiter = null;
          this.lastPollAt = Date.now();
          this.send(res, 200, { commands: [] });
        }, waitMs);
        this.waiter = { res, timer };
        req.on("close", () => {
          if (this.waiter?.res === res) { clearTimeout(timer); this.waiter = null; }
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/plugin/result") {
        const body = await this.readBody(req);
        const id = String(body.id ?? "");
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          clearTimeout(pending.timer);
          this.record("command.result", { id, ok: body.ok === true });
          if (body.ok === true) pending.resolve(body.result);
          else pending.reject(new Error(String(body.error ?? "plugin reported an error").slice(0, 1000)));
        }
        this.send(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/plugin/bye") {
        this.hello = null;
        this.lastPollAt = 0;
        this.record("plugin.disconnected", {});
        this.send(res, 200, { ok: true });
        return;
      }
      this.send(res, 404, { error: "not found" });
    } catch (error) {
      this.send(res, 400, { error: error instanceof Error ? error.message : "bad request" });
    }
  }

  dispatch(type: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    if (!this.connected()) return Promise.reject(new Error("Otzaria Test Bridge plugin is not connected. Open it in Otzaria, enter the companion port and token, and press Connect."));
    if (this.queue.length >= MAX_QUEUE) return Promise.reject(new Error("command queue is full"));
    const id = randomBytes(8).toString("hex");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s. If this call needed approval, approve it in the Test Bridge panel in Otzaria.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.queue.push({ id, type, params });
      this.flushWaiter();
    });
  }

  status() {
    return {
      running: !!this.server && !this.httpError,
      httpError: this.httpError,
      host: "127.0.0.1",
      port: this.port,
      connected: this.connected(),
      plugin: this.hello,
      lastPollMsAgo: this.lastPollAt ? Date.now() - this.lastPollAt : null,
      queuedCommands: this.queue.length,
      pendingCommands: this.pending.size,
      recentEvents: this.events.slice(-50),
    };
  }

  readEvents(limit = 100) {
    const count = Math.max(1, Math.min(500, Math.floor(limit)));
    return this.events.slice(-count);
  }

  async stop() {
    if (this.waiter) { clearTimeout(this.waiter.timer); this.waiter.res.end(); this.waiter = null; }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("bridge stopped"));
      this.pending.delete(id);
    }
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    this.server = undefined;
    this.hello = null;
  }
}
