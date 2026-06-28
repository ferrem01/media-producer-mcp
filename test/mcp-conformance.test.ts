/**
 * MCP connector conformance (HTTP) — spawns the BUILT server (dist/index.js) and
 * checks the transport + OAuth contract Claude depends on:
 *  - unauthenticated /mcp -> 401 WITH a WWW-Authenticate resource_metadata challenge
 *  - .well-known discovery docs (RFC 9728 / 8414) advertise the right bits
 *  - a present-but-unknown session id -> 404 (so the client re-initializes after a restart)
 *  - GET /mcp with no session -> 405 (never 404)
 *  - initialize -> Mcp-Session-Id response header
 *
 * Requires `npm run build` first (it runs the compiled server). Skips if dist is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(path_dirname(), "..");
function path_dirname() { return join(fileURLToPath(import.meta.url), ".."); }

const DIST = join(ROOT, "dist", "index.js");
const PORT = 39517;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "conformance-test-secret";
const HAVE_DIST = existsSync(DIST);

let server: ChildProcess | undefined;
let token = "";

function req(method: string, pathname: string, opts: { headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.request(`${BASE}${pathname}`, { method, headers: opts.headers }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await req("GET", "/health"); if (r.status === 200) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

beforeAll(async () => {
  if (!HAVE_DIST) return;
  process.env.SESSION_SECRET = SECRET;
  const { signToken } = await import("../src/auth/jwt.js");
  token = signToken({ email: "t@test", tenant_id: "tconf" });

  server = spawn("node", [DIST], {
    env: { ...process.env, MP_PORT: String(PORT), MP_PUBLIC_URL: BASE, SESSION_SECRET: SECRET, MP_DATA_DIR: mkdtempSync(join(tmpdir(), "mcp-conf-")) },
    stdio: "ignore",
  });
  const up = await waitForHealth(15000);
  if (!up) throw new Error("server did not start");
}, 20000);

afterAll(() => { server?.kill("SIGKILL"); });

describe.skipIf(!HAVE_DIST)("MCP OAuth discovery (HTTP)", () => {
  it("unauthenticated /mcp -> 401 with WWW-Authenticate resource_metadata", async () => {
    const r = await req("POST", "/mcp", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
    });
    expect(r.status).toBe(401);
    expect(String(r.headers["www-authenticate"] || "")).toContain("resource_metadata=");
  });

  it("protected-resource metadata is served", async () => {
    const r = await req("GET", "/.well-known/oauth-protected-resource");
    expect(r.status).toBe(200);
    const m = JSON.parse(r.body);
    expect(m.authorization_servers).toContain(BASE);
  });

  it("authorization-server metadata advertises S256 + refresh_token + offline_access", async () => {
    const r = await req("GET", "/.well-known/oauth-authorization-server");
    expect(r.status).toBe(200);
    const m = JSON.parse(r.body);
    expect(m.code_challenge_methods_supported).toContain("S256");
    expect(m.grant_types_supported).toContain("refresh_token");
    expect(m.scopes_supported).toContain("offline_access");
  });

  it("DCR /register issues a client_id", async () => {
    const r = await req("POST", "/register", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }),
    });
    expect(r.status).toBe(201);
    expect(JSON.parse(r.body).client_id).toMatch(/^mcp_/);
  });
});

describe.skipIf(!HAVE_DIST)("MCP transport session contract (HTTP)", () => {
  const auth = () => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });

  it("initialize returns an Mcp-Session-Id header", async () => {
    const r = await req("POST", "/mcp", {
      headers: { ...auth(), Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
    });
    expect(r.status).toBe(200);
    expect(r.headers["mcp-session-id"]).toBeTruthy();
  });

  it("a present-but-unknown session id -> 404 (restart recovery)", async () => {
    const r = await req("POST", "/mcp", {
      headers: { ...auth(), "mcp-session-id": "does-not-exist-after-restart" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(r.status).toBe(404);
  });

  it("GET /mcp with no session -> 405 (never 404)", async () => {
    const r = await req("GET", "/mcp", { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" } });
    expect(r.status).toBe(405);
  });
});
