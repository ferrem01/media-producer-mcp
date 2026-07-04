/**
 * media-producer-mcp entry point.
 *
 * Starts the MCP server on stdio transport and an HTTP server with:
 * - Health endpoint
 * - Preview SPA
 * - Preview API routes
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createMcpServer } from "./server.js";
import { config } from "./config.js";
import { getPreviewHtml } from "./preview-app/preview-app.js";
import { getPlaygroundHtml } from "./playground-app/playground-app.js";
import { buildComponentCatalog } from "./llm/catalog.js";
import { generateComponent, saveGeneratedComponent } from "./core/component-generator.js";
import { writeComponentSchema } from "./core/component-schema.js";
import { callLLM, llmConfigFromEnv, type LLMConfig } from "./llm/client.js";
import { reviseScene, undoScene } from "./llm/scene-revise.js";
import { normalizeBeats } from "./core/beats.js";
import { runGeneratePipeline } from "./llm/pipeline.js";
import { componentSystemPrompt } from "./llm/prompts.js";
import { loadBrandKit } from "./persistence/brand-kit.js";
import { parseComponent, bindTemplate, scopeCSS } from "./core/component-parser.js";
import { buildPlaygroundPreview } from "./playground-app/preview-builder.js";
import { generateDefaultsFromSchema } from "./playground-app/schema-defaults.js";
import { listProjects, loadProject, saveProject, addScene, removeScene, reorderScenes, ensureStoryboardScene } from "./persistence/project.js";
import { queueRender, getJobStatus, listJobs } from "./core/render-queue.js";
import { getJob, listAllJobs, queueJob } from "./core/job-queue.js";
import { assembleScene, loadSharedUtilities, type ComponentSource } from "./core/scene-assembler.js";
import fs from "node:fs/promises";
import { assembleComposite, type CompositeComponentSource } from "./core/composite-assembler.js";
import path from "node:path";
import { setupWebSocket } from "./ws.js";
import { authMiddleware, extractToken, validateToken, isAuthEnabled } from "./auth/auth.js";
import { protectedResourceMetadata, authorizationServerMetadata, registerClient, wwwAuthenticateChallenge } from "./auth/mcp-oauth.js";
import { readTraces, dailyDigest } from "./trace/index.js";
import { generateImage } from "./media/image-gen.js";
import { handleGoogleLogin, handleGoogleCallback, handleTokenExchange, handleGetMe } from "./auth/google-oauth.js";
import { initTenantStoreFromFile } from "./auth/tenant-store.js";

/**
 * Resolve all component sources for a scene by reading .component.html files
 * from the component library.
 */
async function resolveComponentSources(
  scene: import("./core/types.js").Scene,
  tenantId?: string,
  projectId?: string,
): Promise<ComponentSource[]> {
  const types = new Set(scene.components.map((c) => c.type));
  const sources: ComponentSource[] = [];

  for (const type of types) {
    let found: string | null = null;

    // 1. Search in project components dir first (custom generated components)
    if (tenantId && projectId) {
      const projCompDir = path.join(config.dataDir, tenantId, "projects", projectId, "components");
      found = await findComponentFile(projCompDir, type);
    }

    // 2. Search in tenant custom components dir
    if (!found && tenantId) {
      const tenantCompDir = path.join(config.dataDir, tenantId, "components");
      found = await findComponentFile(tenantCompDir, type);
    }

    // 3. Search in the global component library
    if (!found) {
      found = await findComponentFile(config.componentLibDir, type);
    }

    if (found) {
      sources.push({ type, source: found });
    } else {
      console.warn("Component type " + type + " not found");
    }
  }

  return sources;
}

async function findComponentFile(dir: string, type: string): Promise<string | null> {
  const filename = `${type}.component.html`;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return await fs.readFile(fullPath, "utf-8");
      }
      if (entry.isDirectory()) {
        const result = await findComponentFile(fullPath, type);
        if (result) return result;
      }
    }
  } catch {
    // directory doesn't exist
  }
  return null;
}

/**
 * Parse JSON body from an incoming request.
 */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

/**
 * Resolve the server's public origin for OAuth discovery + the WWW-Authenticate
 * challenge. Prefer the reverse proxy's forwarded headers (so the docs match the
 * exact HTTPS host the request arrived on), then an explicit MP_PUBLIC_URL, then
 * the Host header. This keeps the connector working behind any TLS terminator
 * without having to hand-set MP_PUBLIC_URL.
 */
function publicOrigin(req: http.IncomingMessage): string {
  const first = (h?: string | string[]) => (Array.isArray(h) ? h[0] : h || "").split(",")[0].trim();
  const fwdHost = first(req.headers["x-forwarded-host"]);
  const fwdProto = first(req.headers["x-forwarded-proto"]);
  if (fwdHost) return `${fwdProto || "https"}://${fwdHost}`;
  if (process.env.MP_PUBLIC_URL) return process.env.MP_PUBLIC_URL.replace(/\/+$/, "");
  const host = first(req.headers["host"]);
  if (host) return `${fwdProto || "http"}://${host}`;
  return config.publicUrl;
}

/**
 * Send JSON response.
 */
function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

/** Apply Studio-editable storyboard fields from a request body onto a StoryboardScene
 *  (in place). `script` maps to voiceover_text; components accepts an array or a
 *  comma-separated string. Only provided fields are touched. */
function applyStoryboardFields(ps: any, body: any): void {
  if (typeof body?.purpose === "string") ps.purpose = body.purpose;
  if (typeof body?.script === "string") ps.voiceover_text = body.script;
  if (typeof body?.visual_notes === "string") ps.visual_notes = body.visual_notes;
  if (typeof body?.broll_query === "string") ps.broll_query = body.broll_query.trim() || undefined;
  if (typeof body?.hero_image === "string") ps.hero_image = body.hero_image.trim() || undefined;
  if (body?.duration_seconds != null && !isNaN(Number(body.duration_seconds))) {
    ps.duration_seconds = Math.max(1, Number(body.duration_seconds));
  }
  if (Array.isArray(body?.components)) {
    ps.components = body.components.filter((c: any) => typeof c === "string" && c.trim()).map((c: string) => c.trim());
  } else if (typeof body?.components === "string") {
    ps.components = body.components.split(",").map((c: string) => c.trim()).filter(Boolean);
  }
  // Beats: accept an array of {label, duration_seconds, action, voiceover_text}
  // and normalize it against the scene's (possibly just-updated) duration.
  // An empty array explicitly clears the beat timeline.
  if (Array.isArray(body?.beats)) {
    ps.beats = normalizeBeats(body.beats, ps.duration_seconds || 5);
  }
}

const SERVICE_VERSION = "0.1.0";

function escHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Root landing page served at `/`. Surfaces the MCP endpoint URL, live health,
 * and the list of registered tools -- generated DYNAMICALLY from the live MCP
 * server (`_registeredTools`) so it can never go stale as tools are added/removed.
 */
function renderMcpLanding(server: unknown): string {
  let tools: Array<{ name: string; description: string }> = [];
  try {
    const reg = (server as { _registeredTools?: Record<string, { description?: string; enabled?: boolean }> })._registeredTools || {};
    tools = Object.entries(reg)
      .filter(([, t]) => t.enabled !== false)
      .map(([name, t]) => ({ name, description: (t.description || "").trim() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { /* fall back to empty list */ }

  const mcpUrl = `${config.publicUrl}/mcp`;
  const rows = tools.map((t) =>
    `<tr><td><code>${escHtml(t.name)}</code></td><td>${escHtml(t.description) || "<span class=muted>—</span>"}</td></tr>`
  ).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Media Producer MCP</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; background: #0b0b14; color: #e7e7ef; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; }
  header { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  h1 { font-size: 26px; margin: 0; letter-spacing: -0.01em; }
  .status { color: #34d399; font-weight: 600; font-size: 14px; }
  .ver { color: #8f8f9f; font-size: 13px; }
  .endpoint { margin: 22px 0; padding: 14px 16px; background: #15151f; border: 1px solid #262633; border-radius: 12px; }
  .endpoint .label { color: #8f8f9f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #1e1e2b; padding: 2px 7px; border-radius: 6px; font-size: 13.5px; }
  .endpoint code { font-size: 15px; }
  nav { margin: 8px 0 28px; display: flex; gap: 8px; flex-wrap: wrap; }
  nav a { color: #a78bfa; text-decoration: none; font-size: 14px; padding: 6px 12px; border: 1px solid #262633; border-radius: 8px; }
  nav a:hover { background: #15151f; }
  h2 { font-size: 16px; margin: 28px 0 12px; color: #c4c4d4; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid #1e1e2b; vertical-align: top; }
  th { color: #8f8f9f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  td:first-child { white-space: nowrap; }
  .muted { color: #6b6b7b; }
</style></head>
<body><div class="wrap">
  <header><h1>Media Producer MCP</h1><span class="status">● healthy</span><span class="ver">v${SERVICE_VERSION}</span></header>
  <p class="muted">AI-powered video &amp; image production server — prompt in, on-brand rendered media out.</p>
  <div class="endpoint"><div class="label">MCP endpoint</div><code>${escHtml(mcpUrl)}</code></div>
  <nav>
    <a href="/architecture">Architecture &amp; docs</a>
    <a href="/studio">Studio</a>
    <a href="/playground">Playground</a>
    <a href="/health">Health (JSON)</a>
  </nav>
  <h2>Tools <span class="muted">(${tools.length})</span></h2>
  <table><thead><tr><th>Tool</th><th>Description</th></tr></thead><tbody>
${rows}
  </tbody></table>
</div></body></html>`;
}



// ── MCP HTTP transport session map ──
const mcpTransports: Record<string, StreamableHTTPServerTransport> = {};

function isInitializeRequestBody(body: unknown): boolean {
  const single = (x: unknown) =>
    typeof x === "object" && x !== null && (x as { method?: string }).method === "initialize";
  if (Array.isArray(body)) return body.some(single);
  return single(body);
}

/**
 * Parse JSON body from an incoming request (returns unknown for MCP).
 */
function parseMcpBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}


/**
 * Compute the HTTP URL for the first speaker track clip (for preview mode).
 */
function getSpeakerUrl(project: any): string | undefined {
  const clips = project.speaker_track?.clips;
  if (!clips || clips.length === 0) return undefined;
  const source = clips[0].source;
  if (!source) return undefined;
  const dataDir = config.dataDir;
  if (source.startsWith(dataDir)) {
    const rel = source.slice(dataDir.length + 1);
    return `/assets/${rel}`;
  }
  if (source.startsWith("/assets/")) {
    return source;
  }
  return source;
}

async function main() {
  // Initialize tenant store
  initTenantStoreFromFile("/data/media-producer/_system/tenants.json");

  // Create MCP server
  const server = createMcpServer();

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Pre-generate HTML pages
  const previewHtml = getPreviewHtml();
  const playgroundHtml = getPlaygroundHtml();

  // Start HTTP server

/**
 * Stream a file with Range request support for video/audio playback.
 * Browsers require HTTP 206 Partial Content for video seeking.
 */
async function streamFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string): Promise<void> {
  const { createReadStream } = await import("node:fs");
  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
    ".wav": "audio/wav", ".ogg": "audio/ogg", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2",
    ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    });
    createReadStream(filePath).pipe(res);
  }
}

  const httpServer = http.createServer(async (req, res) => {
    const url = req.url || "";
    const method = req.method || "GET";

    // ── CORS preflight ──
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    try {
      const urlPath = url.split("?")[0];

      // ── MCP Streamable HTTP transport ──
      if (urlPath === "/mcp") {
        // Validate auth. An unauthenticated /mcp MUST be a 401 carrying a
        // WWW-Authenticate challenge that points at the protected-resource
        // metadata — Claude ignores the challenge on a 200, so it has to be 401.
        if (isAuthEnabled()) {
          const token = extractToken(req);
          if (!token || !validateToken(token)) {
            res.writeHead(401, {
              "Content-Type": "application/json",
              "WWW-Authenticate": wwwAuthenticateChallenge(publicOrigin(req)),
            });
            res.end(JSON.stringify({ error: "Authentication required" }));
            return;
          }
        }

        if (method === "POST") {
          let body: unknown;
          try {
            body = await parseMcpBody(req);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
            return;
          }
          (req as any).body = body;

          const sessionId = req.headers["mcp-session-id"] as string | undefined;

          // Existing session
          if (sessionId && mcpTransports[sessionId]) {
            await mcpTransports[sessionId].handleRequest(req, res, body);
            return;
          }

          // New session (initialize)
          if (!sessionId && isInitializeRequestBody(body)) {
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid) => {
                mcpTransports[sid] = transport;
              },
            });
            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && mcpTransports[sid]) delete mcpTransports[sid];
            };
            const mcpServer = createMcpServer();
            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
          }

          // A session id we don't recognize (e.g. the in-memory map was cleared
          // by a restart) MUST be a 404 so the client re-initializes -- otherwise
          // the conversation wedges with "Connected" but no working tools.
          if (sessionId && !mcpTransports[sessionId]) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32001, message: "Session not found" },
              id: null,
            }));
            return;
          }

          // No session id and not an initialize.
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            id: null,
          }));
          return;
        }

        if (method === "GET") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          // Unknown session -> 404 so the client re-initializes (restart recovery).
          if (sessionId && !mcpTransports[sessionId]) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
            return;
          }
          // No session -> there is no SSE stream to open. 405 (never 404).
          if (!sessionId) {
            res.writeHead(405, { "Content-Type": "text/plain", "Allow": "POST, DELETE" });
            res.end("Method Not Allowed: open a session via initialize first");
            return;
          }
          // Valid session: long-lived SSE stream -- don't let the idle socket
          // timeout kill it.
          req.socket.setTimeout(0);
          await mcpTransports[sessionId].handleRequest(req, res);
          return;
        }

        if (method === "DELETE") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (sessionId && !mcpTransports[sessionId]) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
            return;
          }
          if (!sessionId) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Missing session ID");
            return;
          }
          await mcpTransports[sessionId].handleRequest(req, res);
          return;
        }

        res.writeHead(405, { "Content-Type": "text/plain", "Allow": "GET, POST, DELETE, OPTIONS" });
        res.end("Method not allowed");
        return;
      }

      // ── Static asset serving for project/tenant assets ──
      // Serve project media (images/b-roll under assets/, TTS under voiceover/,
      // mixed audio under audio/). The browser loads these via <audio>/<img>/<video>
      // which can't send an auth header, so this stays on the unauthenticated asset
      // path -- restricted to the media subdirs (never project.json / _work).
      const assetMatch = urlPath.match(/^\/assets\/([^/]+)\/projects\/([^/]+)\/((?:assets|voiceover|audio)\/.+)$/);
      if (assetMatch && (method === "GET" || method === "HEAD")) {
        const [, assetTenantId, assetProjectId, assetSubPath] = assetMatch.map(decodeURIComponent);
        if (assetSubPath.includes("..")) { res.writeHead(403); res.end("Forbidden"); return; }
        const fullPath = path.join(config.dataDir, assetTenantId, "projects", assetProjectId, assetSubPath);
        try {
          await streamFile(req, res, fullPath);
        } catch {
          res.writeHead(404);
          res.end("Asset not found");
        }
        return;
      }

      // Serve system-cached media (e.g. royalty-free background music under
      // _system/cache/). Same unauthenticated rationale as project media above.
      const systemAssetMatch = urlPath.match(/^\/assets\/_system\/(.+)$/);
      if (systemAssetMatch && (method === "GET" || method === "HEAD")) {
        const sysPath = decodeURIComponent(systemAssetMatch[1]);
        if (sysPath.includes("..")) { res.writeHead(403); res.end("Forbidden"); return; }
        const fullPath = path.join(config.dataDir, "_system", sysPath);
        try {
          await streamFile(req, res, fullPath);
        } catch {
          res.writeHead(404);
          res.end("Asset not found");
        }
        return;
      }


      // ── Static asset serving for tenant-level assets ──
      const tenantAssetMatch = urlPath.match(/^\/assets\/([^/]+)\/assets\/(.+)$/);
      if (tenantAssetMatch && (method === "GET" || method === "HEAD")) {
        const [, taTenantId, taAssetPath] = tenantAssetMatch.map(decodeURIComponent);
        const fullPath = path.join(config.dataDir, taTenantId, "assets", taAssetPath);
        try {
          await streamFile(req, res, fullPath);
        } catch {
          res.writeHead(404);
          res.end("Asset not found");
        }
        return;
      }

      // ── Static asset serving for _work directory files (preview only) ──
      const workMatch = urlPath.match(/^\/work\/([^/]+)\/projects\/([^/]+)\/(.+)$/);
      if (workMatch && (method === "GET" || method === "HEAD")) {
        const [, workTenantId, workProjectId, workPath] = workMatch.map(decodeURIComponent);
        const fullPath = path.join(config.dataDir, workTenantId, "projects", workProjectId, "_work", workPath);
        try {
          await streamFile(req, res, fullPath);
        } catch {
          res.writeHead(404);
          res.end("Work file not found");
        }
        return;
      }

      // ── Static asset serving for brand-kit assets ──
      const brandAssetMatch = urlPath.match(/^\/assets\/([^/]+)\/brand-kit\/(.+)$/);
      if (brandAssetMatch && (method === "GET" || method === "HEAD")) {
        const [, brandTenantId, brandAssetPath] = brandAssetMatch.map(decodeURIComponent);
        const fullPath = path.join(config.dataDir, brandTenantId, "brand-kit", "assets", brandAssetPath);
        try {
          await streamFile(req, res, fullPath);
        } catch {
          res.writeHead(404);
          res.end("Brand asset not found");
        }
        return;
      }

      // ── Serve rendered output files ──
      const outputMatch = urlPath.match(/^\/output\/([^/]+)\/projects\/([^/]+)\/(.+)$/);
      if (outputMatch && (method === "GET" || method === "HEAD")) {
        const [, outTenantId, outProjectId, outPath] = outputMatch.map(decodeURIComponent);
        const fullPath = path.join(config.dataDir, outTenantId, "projects", outProjectId, "output", outPath);
        try {
          const data = await fs.readFile(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const contentType = ext === ".mp4" ? "video/mp4" : ext === ".webm" ? "video/webm" : ext === ".mp3" ? "audio/mpeg" : ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".gif" ? "image/gif" : ext === ".pdf" ? "application/pdf" : "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": data.length,
            "Content-Disposition": "inline",
            "Cache-Control": "no-cache",
          });
          res.end(data);
        } catch {
          res.writeHead(404);
          res.end("Output not found");
        }
        return;
      }

      // ── Health ──
      if (urlPath === "/health") {
        jsonResponse(res, 200, { status: "ok", service: "media-producer-mcp", version: SERVICE_VERSION });
        return;
      }
      if (urlPath === "/" || url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(renderMcpLanding(server));
        return;
      }

      // ── Architecture docs (unauthenticated) ──
      if (urlPath === "/architecture" && method === "GET") {
        const archPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "preview-app", "architecture.html");
        try {
          const archHtml = await fs.readFile(archPath, "utf-8");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(archHtml);
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
        return;
      }

      // ── OAuth discovery + DCR for MCP connectors (unauthenticated) ──

      // RFC 9728 protected-resource metadata (Claude follows the 401's WWW-Authenticate here).
      if (urlPath === "/.well-known/oauth-protected-resource" && method === "GET") {
        jsonResponse(res, 200, protectedResourceMetadata(publicOrigin(req)));
        return;
      }
      // RFC 8414 authorization-server metadata (+ openid-configuration alias some clients probe).
      if ((urlPath === "/.well-known/oauth-authorization-server" || urlPath === "/.well-known/openid-configuration") && method === "GET") {
        jsonResponse(res, 200, authorizationServerMetadata(publicOrigin(req)));
        return;
      }
      // RFC 7591 Dynamic Client Registration.
      if (urlPath === "/register" && method === "POST") {
        let regBody: any = {};
        try { regBody = await parseBody(req); } catch { /* empty/invalid -> defaults */ }
        jsonResponse(res, 201, registerClient(regBody));
        return;
      }

      // ── OAuth routes (unauthenticated) ──
      // Standard endpoint names (what the discovery doc advertises) + the
      // existing /auth/* paths kept as aliases.
      if ((urlPath === "/authorize" || urlPath === "/auth/google/login") && method === "GET") {
        await handleGoogleLogin(req, res);
        return;
      }
      if (urlPath === "/auth/google/callback" && method === "GET") {
        await handleGoogleCallback(req, res);
        return;
      }
      if ((urlPath === "/token" || urlPath === "/auth/token") && method === "POST") {
        await handleTokenExchange(req, res);
        return;
      }

      // ── Auth for all non-health routes ──
      const authPassed = await new Promise<boolean>((resolve) => {
        authMiddleware(req, res, () => resolve(true));
        // If middleware already sent a response, resolve false
        if (res.writableEnded) resolve(false);
      });
      // Give the middleware a tick to finish writing if it rejected
      if (!authPassed && !res.writableEnded) {
        await new Promise((r) => setTimeout(r, 10));
      }
      if (res.writableEnded) return;

      // ── Auth: Get current user (requires auth) ──
      if (urlPath === "/auth/me" && method === "GET") {
        await handleGetMe(req, res);
        return;
      }

      // ── Studio SPA (formerly "preview"; /preview kept as an alias) ──
      if (urlPath.startsWith("/studio") || urlPath.startsWith("/preview")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
        res.end(previewHtml);
        return;
      }

      // ── API: List projects ──
      const listMatch = urlPath.match(/^\/api\/projects\/([^/]+)$/);
      if (listMatch && method === "GET") {
        const tenantId = decodeURIComponent(listMatch[1]);
        const projects = await listProjects(tenantId);
        jsonResponse(res, 200, projects);
        return;
      }

      // ── API: Get project ──
      const getMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/([^/]+)$/);
      if (getMatch && method === "GET") {
        const [, tenantId, projectId] = getMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        jsonResponse(res, 200, project);
        return;
      }

      // (Removed: PATCH /scenes/{id}/components/{id} — the data-driven component
      //  property editor. Scenes are codegen now; edits go through /api/revise.)

      // ── API: Add scene ──
      const addSceneMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes$/);
      if (addSceneMatch && method === "POST") {
        const [, tenantId, projectId] = addSceneMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const scene = body.scene as import("./core/types.js").Scene;
        if (!scene || !scene.id) {
          jsonResponse(res, 400, { error: "scene with id is required" });
          return;
        }
        const updated = await addScene(tenantId, projectId, scene, body.position as number | undefined);
        if (!updated) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        jsonResponse(res, 200, updated);
        return;
      }

      // ── API: Delete scene ──
      const deleteSceneMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes\/([^/]+)$/);
      if (deleteSceneMatch && method === "DELETE") {
        const [, tenantId, projectId, sceneId] = deleteSceneMatch.map(decodeURIComponent);
        const updated = await removeScene(tenantId, projectId, sceneId);
        if (!updated) {
          jsonResponse(res, 404, { error: "Scene not found" });
          return;
        }
        jsonResponse(res, 200, updated);
        return;
      }

      // ── API: Reorder scenes ──
      const reorderMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/reorder$/);
      if (reorderMatch && method === "PATCH") {
        const [, tenantId, projectId] = reorderMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneIds = body.scene_ids as string[];
        if (!Array.isArray(sceneIds)) {
          jsonResponse(res, 400, { error: "scene_ids array is required" });
          return;
        }
        const updated = await reorderScenes(tenantId, projectId, sceneIds);
        if (!updated) {
          jsonResponse(res, 404, { error: "Project not found or invalid scene_ids" });
          return;
        }
        jsonResponse(res, 200, updated);
        return;
      }

      // ── API: Scene thumbnail ──
      const thumbMatch = urlPath.match(/^\/api\/scene-thumbnail\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (thumbMatch && method === "GET") {
        const [, tenantId, projectId, sceneId] = thumbMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        const scene = project.scenes.find((s) => s.id === sceneId);
        if (!scene) {
          jsonResponse(res, 404, { error: "Scene not found" });
          return;
        }
        // Return the assembled scene HTML at a small size for thumbnail capture
        const components = await resolveComponentSources(scene, tenantId, projectId);

        const html = await assembleScene({
          scene,
          components,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
          preview: true,
          speakerUrl: getSpeakerUrl(project),
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(html);
        return;
      }

      // ── API: Preview scene (assembled HTML) ──
      const sceneMatch = urlPath.match(/^\/api\/preview-scene\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (sceneMatch && method === "GET") {
        const [, tenantId, projectId, sceneId] = sceneMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        const scene = project.scenes.find((s) => s.id === sceneId);
        if (!scene) {
          jsonResponse(res, 404, { error: "Scene not found" });
          return;
        }

        // Resolve component sources (search project, tenant, and library dirs)
        const components = await resolveComponentSources(scene, tenantId, projectId);

        // Assemble the scene HTML
        const html = await assembleScene({
          scene,
          components,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
          preview: true,
          speakerUrl: getSpeakerUrl(project),
        });

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(html);
        return;
      }


      // ── API: Preview composite (all scenes in one HTML document) ──
      const compositeMatch = urlPath.match(/^\/api\/preview-composite\/([^/]+)\/([^/]+)$/);
      if (compositeMatch && method === "GET") {
        const [, tenantId, projectId] = compositeMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        if (!project.scenes || project.scenes.length === 0) {
          jsonResponse(res, 400, { error: "Project has no scenes" });
          return;
        }

        // Resolve all scene component sources
        const sceneInputs = [];
        for (const scene of project.scenes) {
          const components = await resolveComponentSources(scene, tenantId, projectId);
          sceneInputs.push({ scene, components });
        }

        const html = await assembleComposite({
          scenes: sceneInputs,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
          speakerUrl: getSpeakerUrl(project),
        });

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(html);
        return;
      }
      // ── Playground SPA ──

      if (urlPath === "/playground" || urlPath === "/playground/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
        res.end(playgroundHtml);
        return;
      }

      // ── Playground API: Component catalog ──
      if (urlPath === "/playground/api/components/catalog" && method === "GET") {
        const catalog = await buildComponentCatalog(config.componentLibDir);
        jsonResponse(res, 200, catalog);
        return;
      }

      // ── Playground API: Component source ──
      const sourceMatch = urlPath.match(/^\/playground\/api\/components\/([^/]+)\/([^/]+)\/source$/);
      if (sourceMatch && method === "GET") {
        const [, category, type] = sourceMatch.map(decodeURIComponent);
        const filePath = path.join(config.componentLibDir, category, `${type}.component.html`);
        try {
          const source = await fs.readFile(filePath, "utf-8");
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(source);
        } catch {
          jsonResponse(res, 404, { error: "Component source not found" });
        }
        return;
      }

      // ── Playground API: Component schema ──
      const schemaMatch = urlPath.match(/^\/playground\/api\/components\/([^/]+)\/([^/]+)\/schema$/);
      if (schemaMatch && method === "GET") {
        const [, category, type] = schemaMatch.map(decodeURIComponent);
        const filePath = path.join(config.componentLibDir, category, `${type}.schema.json`);
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const schema = JSON.parse(raw);
          jsonResponse(res, 200, schema);
        } catch {
          jsonResponse(res, 404, { error: "Schema not found" });
        }
        return;
      }

      // ── Playground API: Component defaults (generate sample data from schema) ──
      const defaultsMatch = urlPath.match(/^\/playground\/api\/components\/([^/]+)\/([^/]+)\/defaults$/);
      if (defaultsMatch && method === "GET") {
        const [, dCategory, dType] = defaultsMatch.map(decodeURIComponent);
        const schemaPath = path.join(config.componentLibDir, dCategory, dType + ".schema.json");
        try {
          const raw = await fs.readFile(schemaPath, "utf-8");
          const schema = JSON.parse(raw);
          const defaults = generateDefaultsFromSchema(schema);
          jsonResponse(res, 200, defaults);
        } catch {
          jsonResponse(res, 404, { error: "Schema not found" });
        }
        return;
      }

      // ── Playground API: Preview component ──
      if (urlPath === "/playground/api/components/preview" && method === "POST") {
        const body = await parseBody(req);
        const source = body.source as string;
        const data = (body.data || {}) as Record<string, unknown>;

        if (!source) {
          jsonResponse(res, 400, { error: "source is required" });
          return;
        }

        try {
          const parsed = parseComponent(source);
          const boundHtml = bindTemplate(parsed.template, data);
          const scopedCSS = parsed.style ? scopeCSS(parsed.style, "pg-comp") : "";

          // Load GSAP
          let gsapSource = "";
          try {
            const gsapFiles = ["gsap.min.js", "SplitText.min.js", "CustomEase.min.js"];
            for (const file of gsapFiles) {
              try {
                const content = await fs.readFile(path.join(config.gsapDir, file), "utf-8");
                gsapSource += content + "\n";
              } catch { /* skip missing */ }
            }
          } catch { /* no GSAP */ }

          // Load shared utilities (cursor, typing, camera, script-runner)
          let sharedSource = "";
          try {
            sharedSource = await loadSharedUtilities();
          } catch { /* non-fatal */ }

          const html = buildPlaygroundPreview({
            boundHtml,
            scopedCSS,
            gsapSource,
            sharedSource,
            script: parsed.script,
            data,
          });

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(html);
        } catch (err) {
          jsonResponse(res, 400, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: Save component (supports tenant-scoped save) ──
      if (urlPath === "/playground/api/components/save" && method === "POST") {
        const body = await parseBody(req);
        const type = body.type as string;
        const saveTenantId = body.tenant_id as string;
        const category = body.category as string || "custom";
        const source = body.source as string;

        if (!type || !source) {
          jsonResponse(res, 400, { error: "type and source are required" });
          return;
        }

        try {
          // If tenant_id provided, save to tenant's custom components dir
          let saveDir: string;
          if (saveTenantId) {
            saveDir = path.join(config.dataDir, saveTenantId, "components", category);
          } else {
            saveDir = path.join(config.componentLibDir, category);
          }

          await fs.mkdir(saveDir, { recursive: true });
          await fs.writeFile(path.join(saveDir, `${type}.component.html`), source, "utf-8");

          // Pair it with a schema so the storyboard builder can see + select it.
          await writeComponentSchema(saveDir, type, category, source);

          jsonResponse(res, 200, { ok: true });
        } catch (err) {
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: Generate component from prompt ──
      if (urlPath === "/playground/api/generate" && method === "POST") {
        const body = await parseBody(req);
        const prompt = body.prompt as string;
        const tenantId = body.tenant_id as string;

        if (!prompt) {
          jsonResponse(res, 400, { error: "prompt is required" });
          return;
        }

        try {
          const llmConfig = llmConfigFromEnv();
          const brandKit = tenantId ? await loadBrandKit(tenantId) : undefined;

          const result = await generateComponent({
            prompt,
            tenant_id: tenantId || "default",
            brand_kit: brandKit || undefined,
            format: (body.format as string) || "video",
            duration: (body.duration as number) || 4,
            llmGenerate: async (systemPrompt: string, userPrompt: string) => {
              return callLLM(llmConfig, [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ], { maxTokens: 8000 });
            },
          });

          jsonResponse(res, 200, {
            source: result.source,
            type: result.type,
            preview_path: result.preview_path,
          });
        } catch (err) {
          console.error("[playground] generate error:", err);
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: Iterate on component ──
      if (urlPath === "/playground/api/iterate" && method === "POST") {
        const body = await parseBody(req);
        const currentSource = body.source as string;
        const instruction = body.instruction as string;
        const tenantId = body.tenant_id as string;

        if (!currentSource || !instruction) {
          jsonResponse(res, 400, { error: "source and instruction are required" });
          return;
        }

        try {
          const llmConfig = llmConfigFromEnv();
          const systemPrompt = componentSystemPrompt((body.format as string) || "video");

          const userPrompt = `Here is an existing component:

\`\`\`html
${currentSource}
\`\`\`

Please modify this component according to the following instruction:
${instruction}

Return the COMPLETE updated .component.html file. Keep all existing functionality unless the instruction specifically asks to change it. Make only the requested changes.`;

          const raw = await callLLM(llmConfig, [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ], { maxTokens: 8000 });

          // Extract source (strip markdown fences)
          let source = raw.trim();
          const fenceMatch = source.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
          if (fenceMatch) source = fenceMatch[1].trim();

          jsonResponse(res, 200, { source });
        } catch (err) {
          console.error("[playground] iterate error:", err);
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: Get tenant brand kit ──
      const brandKitMatch = urlPath.match(/^\/playground\/api\/brand-kit\/([^/]+)$/);
      if (brandKitMatch && method === "GET") {
        const tid = decodeURIComponent(brandKitMatch[1]);
        try {
          const bk = await loadBrandKit(tid);
          jsonResponse(res, 200, bk || {});
        } catch {
          jsonResponse(res, 200, {});
        }
        return;
      }

      // ── Playground API: Get tenant component source ──
      const tenantSourceMatch = urlPath.match(/^\/playground\/api\/tenant-components\/([^/]+)\/([^/]+)\/source$/);
      if (tenantSourceMatch && method === "GET") {
        const [, tid, compType] = tenantSourceMatch.map(decodeURIComponent);
        // Search all category subdirs
        const tenantCompDir = path.join(config.dataDir, tid, "components");
        try {
          const cats = await fs.readdir(tenantCompDir, { withFileTypes: true });
          for (const cat of cats) {
            if (!cat.isDirectory()) continue;
            const filePath = path.join(tenantCompDir, cat.name, `${compType}.component.html`);
            try {
              const source = await fs.readFile(filePath, "utf-8");
              res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
              res.end(source);
              return;
            } catch { continue; }
          }
          jsonResponse(res, 404, { error: "Component not found" });
        } catch {
          jsonResponse(res, 404, { error: "Component not found" });
        }
        return;
      }

      // ── Playground API: Delete tenant component ──
      const tenantDeleteMatch = urlPath.match(/^\/playground\/api\/tenant-components\/([^/]+)\/([^/]+)$/);
      if (tenantDeleteMatch && method === "DELETE") {
        const [, tid, compType] = tenantDeleteMatch.map(decodeURIComponent);
        const tenantCompDir = path.join(config.dataDir, tid, "components");
        try {
          const cats = await fs.readdir(tenantCompDir, { withFileTypes: true });
          for (const cat of cats) {
            if (!cat.isDirectory()) continue;
            const filePath = path.join(tenantCompDir, cat.name, `${compType}.component.html`);
            try {
              await fs.unlink(filePath);
              // Also delete schema if exists
              try { await fs.unlink(filePath.replace(".component.html", ".schema.json")); } catch {}
              jsonResponse(res, 200, { ok: true, deleted: compType });
              return;
            } catch { continue; }
          }
          jsonResponse(res, 404, { error: "Component not found" });
        } catch {
          jsonResponse(res, 404, { error: "Component not found" });
        }
        return;
      }

            // ── Playground API: List tenant custom components ──
      const tenantCompMatch = urlPath.match(/^\/playground\/api\/tenant-components\/([^/]+)$/);
      if (tenantCompMatch && method === "GET") {
        const tid = decodeURIComponent(tenantCompMatch[1]);
        const tenantCompDir = path.join(config.dataDir, tid, "components");
        const components: Array<{ type: string; category: string; label: string }> = [];

        try {
          const cats = await fs.readdir(tenantCompDir, { withFileTypes: true });
          for (const cat of cats) {
            if (!cat.isDirectory()) continue;
            const catPath = path.join(tenantCompDir, cat.name);
            const files = await fs.readdir(catPath);
            for (const f of files) {
              if (!f.endsWith(".component.html")) continue;
              const t = f.replace(".component.html", "");
              components.push({
                type: t,
                category: cat.name,
                label: t.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
              });
            }
          }
        } catch {
          // No custom components yet
        }

        jsonResponse(res, 200, components);
        return;
      }

      // ── Playground API: Get tenant component source ──
      const tenantCompSrcMatch = urlPath.match(/^\/playground\/api\/tenant-components\/([^/]+)\/([^/]+)\/source$/);
      if (tenantCompSrcMatch && method === "GET") {
        const [, tid, compType] = tenantCompSrcMatch.map(decodeURIComponent);
        const tenantCompDir = path.join(config.dataDir, tid, "components");

        // Search all categories
        let found = false;
        try {
          const cats = await fs.readdir(tenantCompDir, { withFileTypes: true });
          for (const cat of cats) {
            if (!cat.isDirectory()) continue;
            const fp = path.join(tenantCompDir, cat.name, `${compType}.component.html`);
            try {
              const source = await fs.readFile(fp, "utf-8");
              res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
              res.end(source);
              found = true;
              break;
            } catch { /* not in this cat */ }
          }
        } catch { /* no dir */ }

        if (!found) {
          jsonResponse(res, 404, { error: "Component source not found" });
        }
        return;
      }

      // ── Playground API: Generate component via LLM ──
      if (urlPath === "/playground/api/generate" && method === "POST") {
        const body = await parseBody(req);
        const prompt = body.prompt as string;
        const tid = body.tenant_id as string;

        if (!prompt) {
          jsonResponse(res, 400, { error: "prompt is required" });
          return;
        }

        try {
          let llmCfg;
          try {
            llmCfg = llmConfigFromEnv();
          } catch (e: any) {
            jsonResponse(res, 500, { error: `LLM not configured: ${e.message}` });
            return;
          }

          const brandKit = tid ? await loadBrandKit(tid) : undefined;
          const result = await generateComponent({
            prompt,
            tenant_id: tid,
            brand_kit: brandKit || undefined,
            llmGenerate: (systemPrompt, userPrompt) =>
              callLLM(llmCfg, [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ]),
          });

          jsonResponse(res, 200, {
            source: result.source,
            type: result.type,
            data: {},
          });
        } catch (err) {
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: Revise component via LLM ──
      if (urlPath === "/playground/api/revise" && method === "POST") {
        const body = await parseBody(req);
        const prompt = body.prompt as string;
        const source = body.source as string;
        const tid = body.tenant_id as string;

        if (!prompt || !source) {
          jsonResponse(res, 400, { error: "prompt and source are required" });
          return;
        }

        try {
          let llmCfg;
          try {
            llmCfg = llmConfigFromEnv();
          } catch (e: any) {
            jsonResponse(res, 500, { error: `LLM not configured: ${e.message}` });
            return;
          }

          const brandKit = tid ? await loadBrandKit(tid) : undefined;
          const result = await generateComponent({
            prompt: `Revise this existing component based on this instruction: ${prompt}\n\nExisting component source:\n${source}`,
            tenant_id: tid,
            brand_kit: brandKit || undefined,
            llmGenerate: (systemPrompt, userPrompt) =>
              callLLM(llmCfg, [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ]),
          });

          jsonResponse(res, 200, {
            source: result.source,
            type: result.type,
            data: {},
          });
        } catch (err) {
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── API: Trigger render ──
      const renderMatch = urlPath.match(/^\/api\/render\/([^/]+)\/([^/]+)$/);
      if (renderMatch && method === "POST") {
        const [, tenantId, projectId] = renderMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) {
          jsonResponse(res, 404, { error: "Project not found" });
          return;
        }
        const job = queueRender(tenantId, projectId);
        jsonResponse(res, 200, {
          status: "queued",
          job_id: job.id,
          project_id: projectId,
          tenant_id: tenantId,
        });
        return;
      }

      // ── API: Direct binary asset upload ──
      // POST /api/upload-asset/{tenant}/{project}?name=camera.mp4 with the raw
      // file bytes as the request body. The MCP upload tool only ingests via a
      // fetchable URL; this is the push path for local files (a speaker camera
      // clip, a screencast recording) from Studio or a remote client. The
      // project directory is created if needed, so a pseudo-project like
      // "library" works for assets that predate any generated project.
      const uploadAssetMatch = urlPath.match(/^\/api\/upload-asset\/([^/]+)\/([^/]+)$/);
      if (uploadAssetMatch && method === "POST") {
        const [, upTenant, upProject] = uploadAssetMatch.map(decodeURIComponent);
        const upQuery = new URL(req.url || "/", "http://localhost").searchParams;
        const upName = path.basename(upQuery.get("name") || `asset_${Date.now()}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_");
        try {
          const MAX_UPLOAD = 512 * 1024 * 1024;
          const chunks: Buffer[] = [];
          let received = 0;
          await new Promise<void>((resolve, reject) => {
            req.on("data", (c: Buffer) => {
              received += c.length;
              if (received > MAX_UPLOAD) { reject(new Error("file exceeds 512MB limit")); req.destroy(); return; }
              chunks.push(c);
            });
            req.on("end", () => resolve());
            req.on("error", reject);
          });
          const fileBuffer = Buffer.concat(chunks);
          if (fileBuffer.length === 0) { jsonResponse(res, 400, { error: "empty request body" }); return; }
          const upDir = path.join(config.dataDir, upTenant, "projects", upProject, "assets");
          await fs.mkdir(upDir, { recursive: true });
          const upPath = path.join(upDir, upName);
          await fs.writeFile(upPath, fileBuffer);
          jsonResponse(res, 200, {
            ok: true,
            url: `/assets/${upTenant}/projects/${upProject}/assets/${upName}`,
            path: upPath,
            size: fileBuffer.length,
          });
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Undo last revise on a scene ──
      const undoMatch = urlPath.match(/^\/api\/revise\/undo\/([^/]+)\/([^/]+)$/);
      if (undoMatch && method === "POST") {
        const [, tenantId, projectId] = undoMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        if (!sceneId) { jsonResponse(res, 400, { error: "scene_id is required" }); return; }
        try {
          const result = await undoScene({ tenantId, projectId, sceneId });
          jsonResponse(res, result.ok ? 200 : 400, result);
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Revise a scene (Studio direct-manipulation revise) ──
      const reviseMatch = urlPath.match(/^\/api\/revise\/([^/]+)\/([^/]+)$/);
      if (reviseMatch && method === "POST") {
        const [, tenantId, projectId] = reviseMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        const instruction = (body.instruction || body.prompt) as string;
        const element = body.element as any;
        if (!sceneId || !instruction) {
          jsonResponse(res, 400, { error: "scene_id and instruction are required" });
          return;
        }
        let llmCfg;
        try { llmCfg = llmConfigFromEnv(); }
        catch (e: any) { jsonResponse(res, 500, { error: `LLM not configured: ${e.message}` }); return; }
        try {
          const result = await reviseScene({
            tenantId, projectId, sceneId, instruction, element,
            llmConfig: llmCfg, skipGates: body.skip_gates === true,
          });
          jsonResponse(res, result.ok ? 200 : 400, result);
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Regenerate a scene (heavy storyboard builder+generate+critique rebuild) ──
      // Unlike /api/revise (a surgical SEARCH/REPLACE patch on the existing
      // source), this rebuilds the scene from scratch via runSceneRevisionPipeline.
      // It's slow (storyboard builder → generate → critique, ~minutes), so it runs as an
      // async job; the client polls /api/jobs/{id} and reloads when it completes.
      const regenMatch = urlPath.match(/^\/api\/regenerate\/([^/]+)\/([^/]+)$/);
      if (regenMatch && method === "POST") {
        const [, tenantId, projectId] = regenMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        const instruction = ((body.instruction || body.prompt || "") as string).trim();
        if (!sceneId) { jsonResponse(res, 400, { error: "scene_id is required" }); return; }
        let llmCfg;
        try { llmCfg = llmConfigFromEnv(); }
        catch (e: any) { jsonResponse(res, 500, { error: `LLM not configured: ${e.message}` }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const regenIdx = project.scenes.findIndex((s: any) => s.id === sceneId);
        if (regenIdx === -1) { jsonResponse(res, 404, { error: `Scene ${sceneId} not found` }); return; }
        // Persist any edited storyboard fields onto the storyboard BEFORE queueing, so the
        // pipeline (which reloads the project from disk) rebuilds against the new storyboard.
        const regenStoryboardScene = ensureStoryboardScene(project, regenIdx);
        applyStoryboardFields(regenStoryboardScene, body);
        project.updated_at = new Date().toISOString();
        await saveProject(project);
        const brandKit = await loadBrandKit(tenantId);
        const prompt = instruction
          || "Rebuild this scene from scratch so it is visually complete and on-brand: "
            + "every element must be visible and populated (no empty placeholders or blank panels), "
            + "with clear visual hierarchy and legible text that animates in. "
            + "Keep the scene's original intent and duration.";
        const job = queueJob("generate", tenantId, async (j) => {
          j.projectId = projectId;
          j.progress = { step: "starting", percent: 5, detail: "Starting" };
          const result = await runGeneratePipeline({
            prompt,
            target: "scene",
            tenant_id: tenantId,
            project_id: projectId,
            sceneId,
            llmConfig: llmCfg,
            brandKit: brandKit || project.brand_kit,
            canvas: project.canvas,
            onProgress: (p) => {
              const clamped = Math.max(0, Math.min(100, p.percent));
              const eta = p.etaSeconds && p.etaSeconds > 0
                ? (p.etaSeconds < 60 ? `~${p.etaSeconds}s left` : `~${Math.round(p.etaSeconds / 60)}m left`)
                : "";
              j.progress = {
                step: p.step,
                percent: Math.round(5 + (clamped / 100) * 90),
                detail: [p.detail, eta].filter(Boolean).join(" · ") || undefined,
                etaSeconds: p.etaSeconds,
              };
            },
          });
          if (result.status !== "completed") {
            throw new Error(result.error || "Scene regeneration failed");
          }
          return { ok: true, scene_id: sceneId };
        });
        jsonResponse(res, 202, { ok: true, job_id: job.id });
        return;
      }

      // ── API: Save a scene's storyboard entry (Studio storyboard panel) ──
      const storyboardSceneMatch = urlPath.match(/^\/api\/storyboard-scene\/([^/]+)\/([^/]+)$/);
      if (storyboardSceneMatch && method === "POST") {
        const [, tenantId, projectId] = storyboardSceneMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        if (!sceneId) { jsonResponse(res, 400, { error: "scene_id is required" }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const idx = project.scenes.findIndex((s: any) => s.id === sceneId);
        if (idx === -1) { jsonResponse(res, 404, { error: `Scene ${sceneId} not found` }); return; }
        const storyboardScene = ensureStoryboardScene(project, idx);
        applyStoryboardFields(storyboardScene, body);
        project.updated_at = new Date().toISOString();
        await saveProject(project);
        jsonResponse(res, 200, { ok: true, scene: storyboardScene });
        return;
      }

      // ── API: Get job status ──
      // ── API: List jobs ──
      const jobsListMatch = urlPath.match(/^\/api\/jobs\/?$/);
      if (jobsListMatch && method === "GET") {
        const jobParams = new URL(url, "http://localhost").searchParams;
        const typeFilter = jobParams.get("type") as "render" | "generate" | undefined;
        const tenantFilter = jobParams.get("tenant_id") || undefined;
        const jobs = listAllJobs(tenantFilter, typeFilter || undefined);
        // Strip large result payloads from list view
        const summary = jobs.map((j: any) => ({
          id: j.id, type: j.type, tenantId: j.tenantId, projectId: j.projectId,
          status: j.status, progress: j.progress,
          startedAt: j.startedAt, completedAt: j.completedAt,
          error: j.error, outputPath: j.outputPath, format: j.format,
          durationMs: j.durationMs, frameCount: j.frameCount,
        }));
        jsonResponse(res, 200, summary);
        return;
      }

      const jobMatch = urlPath.match(/^\/api\/jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        const jobId = decodeURIComponent(jobMatch[1]);
        const job = getJob(jobId);
        if (!job) {
          jsonResponse(res, 404, { error: "Job not found" });
          return;
        }
        jsonResponse(res, 200, job);
        return;
      }

      // ── API: Wait for job completion (long-poll) ──
      const jobWaitMatch = urlPath.match(/^\/api\/jobs\/([^/]+)\/wait/);
      if (jobWaitMatch && method === "GET") {
        const jobId = decodeURIComponent(jobWaitMatch[1]);
        const urlParams = new URL(url, "http://localhost").searchParams;
        const timeoutSec = Math.min(Number(urlParams.get("timeout") || "120"), 300);
        const timeoutMs = timeoutSec * 1000;
        const start = Date.now();

        const poll = async (): Promise<void> => {
          while (Date.now() - start < timeoutMs) {
            const job = getJob(jobId);
            if (!job) {
              jsonResponse(res, 404, { error: "Job not found" });
              return;
            }
            if (job.status === "completed" || job.status === "failed") {
              jsonResponse(res, 200, job);
              return;
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          // Timeout
          const job = getJob(jobId);
          if (!job) {
            jsonResponse(res, 404, { error: "Job not found" });
            return;
          }
          jsonResponse(res, 200, {
            ...job,
            _timeout: true,
            message: "Wait timed out. Job is still " + (job.status || "unknown"),
          });
        };
        await poll();
        return;
      }

      // ── API: List jobs for tenant ──
      const jobsMatch = urlPath.match(/^\/api\/jobs\/?$/);
      if (jobsMatch && method === "GET") {
        const jobParams = new URL(url, `http://localhost`).searchParams;
        const tenantFilter = jobParams.get('tenant_id') || undefined;
        const typeFilter = jobParams.get('type') as "render" | "generate" | undefined;
        jsonResponse(res, 200, listAllJobs(tenantFilter, typeFilter || undefined));
        return;
      }

      // ── API: Get traces for tenant ──
      const tracesMatch = urlPath.match(/^\/api\/traces\/([^/]+)$/);
      if (tracesMatch && method === "GET") {
        authMiddleware(req, res, () => {
          const tenantId = decodeURIComponent(tracesMatch[1]);
          const params = new URL(url, "http://localhost").searchParams;
          const since = params.get("since") || undefined;
          const operation = params.get("operation") as any || undefined;
          const limit = params.get("limit") ? Number(params.get("limit")) : 100;

          const traces = readTraces({ tenantId, since, operation, limit });
          jsonResponse(res, 200, traces);
        });
        return;
      }

      // ── API: Get trace digest for tenant ──
      const digestMatch = urlPath.match(/^\/api\/traces\/([^/]+)\/digest$/);
      if (digestMatch && method === "GET") {
        authMiddleware(req, res, () => {
          const params = new URL(url, "http://localhost").searchParams;
          const hoursBack = params.get("hours") ? Number(params.get("hours")) : 24;

          const digest = dailyDigest(hoursBack);
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(digest);
        });
        return;
      }


      // ── API: Generate AI Image ──
      const genImageMatch = urlPath.match(/^\/api\/generate-image\/([^/]+)$/);
      if (genImageMatch && method === "POST") {
        const tenantId = decodeURIComponent(genImageMatch[1]);
        const body = await parseBody(req);
        const prompt = body.prompt as string;
        if (!prompt) {
          jsonResponse(res, 400, { error: "prompt is required" });
          return;
        }

        try {
          const timestamp = Date.now();
          const assetsDir = path.join(config.dataDir, tenantId, "assets", "generated");
          const outputPath = path.join(assetsDir, `img_${timestamp}.png`);

          const result = await generateImage({
            prompt,
            model: (body.model as any) || "gpt-image-1",
            size: (body.size as any) || "1536x1024",
            quality: (body.quality as any) || "high",
            outputPath,
          });

          // If project_id provided, copy to project assets and register in project.json
          const projectId = body.project_id as string;
          let assetId: string | undefined;
          if (projectId) {
            const projAssetsDir = path.join(config.dataDir, tenantId, "projects", projectId, "assets");
            const projPath = path.join(projAssetsDir, `img_${timestamp}.png`);
            await fs.mkdir(projAssetsDir, { recursive: true });
            await fs.copyFile(outputPath, projPath);

            // Register in project.json
            const project = await loadProject(tenantId, projectId);
            if (project) {
              assetId = `asset_${timestamp}`;
              if (!project.assets) project.assets = [];
              project.assets.push({
                id: assetId,
                type: "ai_image",
                path: projPath,
                name: `AI Image: ${prompt.substring(0, 50)}`,
                prompt,
                width: result.width,
                height: result.height,
                model: (body.model as string) || "gpt-image-1",
                created_at: new Date().toISOString(),
              });
              await saveProject(project);
            }
          }

          jsonResponse(res, 200, {
            status: "completed",
            type: "ai_image",
            asset_id: assetId,
            path: result.path,
            width: result.width,
            height: result.height,
            revised_prompt: result.revised_prompt,
          });
        } catch (e: any) {
          jsonResponse(res, 500, { error: `Image generation failed: ${e.message}` });
        }
        return;
      }

      // ── 404 ──
      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      console.error("HTTP error:", err);
      jsonResponse(res, 500, { error: "Internal server error" });
    }
  });

  setupWebSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.error(`media-producer-mcp HTTP on :${config.port}`);
    console.error(`  Preview SPA: http://localhost:${config.port}/preview`);
    console.error(`  Data directory: ${config.dataDir}`);
    console.error(`  Component library: ${config.componentLibDir}`);
    console.error(`MCP server ready on stdio`);
    console.error(`  MCP HTTP endpoint: http://localhost:${config.port}/mcp`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
