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
import { getUploadHtml } from "./upload-page.js";
import { getPlaygroundHtml } from "./playground-app/playground-app.js";
import { buildComponentCatalog } from "./llm/catalog.js";
import { speakerSceneFilmStarts } from "./core/speaker-track.js";
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
import { assembleSceneAuto, loadSharedUtilities, type ComponentSource } from "./core/scene-assembler.js";
import { getSceneThumbnail } from "./core/scene-thumbnail.js";
import { getWaveformPeaks } from "./core/waveform.js";
import { detectIdleRanges, buildCompressedSegments } from "./core/compress-waiting.js";
import { getTranscript, whisperAvailable, snapLeadingWords } from "./core/transcribe.js";
import { resolveVideoPath } from "./core/video-path.js";
import fs from "node:fs/promises";
import { assembleComposite, type CompositeComponentSource } from "./core/composite-assembler.js";
import path from "node:path";
import os from "node:os";
import { setupWebSocket } from "./ws.js";
import { authMiddleware, extractToken, validateToken, isAuthEnabled } from "./auth/auth.js";
import { protectedResourceMetadata, authorizationServerMetadata, registerClient, wwwAuthenticateChallenge } from "./auth/mcp-oauth.js";
import { readTraces, dailyDigest } from "./trace/index.js";
import { generateImage } from "./media/image-gen.js";
import { handleGoogleLogin, handleGoogleCallback, handleTokenExchange, handleGetMe } from "./auth/google-oauth.js";
import { initTenantStoreFromFile } from "./auth/tenant-store.js";
import { normalizeVideoForWeb } from "./core/video-normalize.js";
import { analyzeAndSaveIntel, isAnalyzableVideo, type AssetIntel } from "./core/asset-intel.js";
import { solveMediaEdits, inferIntents } from "./core/media-edl.js";
import { sceneCompositesOverSpeaker } from "./core/speaker-mode.js";
import { repairBrandAssetPath } from "./core/scene-assembler.js";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

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
        // repairBrandAssetPath: codegen sometimes writes a logo's NAME as its
        // filename; serve the closest real file instead of 404ing the logo.
        const fullPath = repairBrandAssetPath(path.join(config.dataDir, brandTenantId, "brand-kit", "assets", brandAssetPath));
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
        jsonResponse(res, 200, {
          status: "ok",
          service: "media-producer-mcp",
          version: SERVICE_VERSION,
          // Set by scripts/deploy.sh -- lets anyone (including a remote
          // debugging session) verify WHICH commit is actually serving.
          commit: process.env.MP_GIT_SHA || "unknown",
        });
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

      // ── Upload page: browser drag-drop uploader (public HTML shell; the
      // upload POST it fires carries the token). Bypasses the AI client's
      // attachment cap -- file goes browser -> server directly. ──
      if (urlPath === "/upload") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
        res.end(getUploadHtml());
        return;
      }

      // ── API: Remote deploy (opt-in via MP_DEPLOY_TOKEN) ──
      // POST /api/deploy {branch?, force?} runs scripts/deploy.sh DETACHED so
      // the server can pm2-reload itself without killing the deploy. Guarded
      // by a dedicated secret on top of normal auth -- tenant/preview tokens
      // (which live in shareable URLs) must never be able to run root-level
      // deploys. Refuses while jobs are in flight unless force:true, because
      // a reload kills running generations/renders.
      if (urlPath === "/api/deploy" && method === "POST") {
        const deploySecret = process.env.MP_DEPLOY_TOKEN;
        if (!deploySecret) {
          jsonResponse(res, 404, { error: "Remote deploy disabled -- set MP_DEPLOY_TOKEN in the server env to enable." });
          return;
        }
        const provided = (req.headers["x-deploy-token"] as string) ||
          new URL(url, "http://localhost").searchParams.get("deploy_token") || "";
        if (provided !== deploySecret) {
          jsonResponse(res, 403, { error: "Invalid deploy token" });
          return;
        }
        let deployBody: any = {};
        try { deployBody = await parseBody(req); } catch { /* empty body is fine */ }
        const activeJobs = listAllJobs().filter((j: any) => j.status === "running" || j.status === "queued");
        if (activeJobs.length > 0 && deployBody.force !== true) {
          jsonResponse(res, 409, {
            error: "Jobs in flight -- the pm2 reload would kill them. Pass {\"force\": true} to deploy anyway.",
            jobs: activeJobs.map((j: any) => ({ id: j.id, type: j.type, status: j.status, progress: j.progress })),
          });
          return;
        }
        const branch = typeof deployBody.branch === "string" && /^[\w./-]+$/.test(deployBody.branch)
          ? deployBody.branch : "master";
        // dist/index.js -> repo root
        const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
        const deployScript = path.join(repoRoot, "scripts", "deploy.sh");
        const logDir = path.join(config.dataDir, "_system");
        await fs.mkdir(logDir, { recursive: true });
        const deployLogPath = path.join(logDir, "deploy.log");
        const logFd = openSync(deployLogPath, "w");
        const child = spawn("bash", [deployScript, branch], {
          cwd: repoRoot,
          detached: true, // own process group: survives this process's pm2 reload
          stdio: ["ignore", logFd, logFd],
          env: { ...process.env },
        });
        child.unref();
        jsonResponse(res, 202, {
          ok: true,
          branch,
          message: "Deploy started detached. Tail it at GET /api/deploy/log; verify with GET /health (commit field).",
        });
        return;
      }

      // GET /api/deploy/log -- tail of the last deploy's output (same secret).
      if (urlPath === "/api/deploy/log" && method === "GET") {
        const deploySecret = process.env.MP_DEPLOY_TOKEN;
        const provided = (req.headers["x-deploy-token"] as string) ||
          new URL(url, "http://localhost").searchParams.get("deploy_token") || "";
        if (!deploySecret || provided !== deploySecret) {
          jsonResponse(res, 403, { error: "Invalid deploy token" });
          return;
        }
        try {
          const log = await fs.readFile(path.join(config.dataDir, "_system", "deploy.log"), "utf-8");
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(log.slice(-16384));
        } catch {
          jsonResponse(res, 404, { error: "No deploy log yet" });
        }
        return;
      }

      // GET /api/server-log -- tail of the pm2 process's stdout/stderr (same
      // secret as deploy): the server-side half of a remote debug session.
      if (urlPath === "/api/server-log" && method === "GET") {
        const deploySecret = process.env.MP_DEPLOY_TOKEN;
        const provided = (req.headers["x-deploy-token"] as string) ||
          new URL(url, "http://localhost").searchParams.get("deploy_token") || "";
        if (!deploySecret || provided !== deploySecret) {
          jsonResponse(res, 403, { error: "Invalid deploy token" });
          return;
        }
        try {
          const logsDir = path.join(os.homedir(), ".pm2", "logs");
          const files = (await fs.readdir(logsDir)).filter((f) => /out|error/.test(f) && f.endsWith(".log"));
          let newest: { file: string; mtime: number } | null = null;
          const parts: string[] = [];
          for (const f of files) {
            const st = await fs.stat(path.join(logsDir, f)).catch(() => null);
            if (!st) continue;
            if (/out/.test(f) && (!newest || st.mtime.getTime() > newest.mtime)) newest = { file: f, mtime: st.mtime.getTime() };
          }
          const wantBytes = Math.min(256 * 1024, Math.max(1024, parseInt(new URL(url, "http://localhost").searchParams.get("bytes") || "32768", 10) || 32768));
          for (const f of files.sort()) {
            const full = path.join(logsDir, f);
            const st = await fs.stat(full).catch(() => null);
            if (!st) continue;
            const fh = await fs.open(full, "r");
            try {
              const start = Math.max(0, st.size - wantBytes);
              const buf = Buffer.alloc(Math.min(wantBytes, st.size));
              await fh.read(buf, 0, buf.length, start);
              parts.push(`===== ${f} (tail ${buf.length} bytes) =====\n${buf.toString()}`);
            } finally { await fh.close(); }
          }
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(parts.join("\n\n") || "no pm2 logs found");
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
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

        // No speakerUrl here: Studio renders one thumbnail iframe PER SCENE on
        // project open, and the camera underlay is a full 1080p <video> -- a
        // 4-scene speaker project would spin up 4 decode pipelines for 200px
        // thumbnails (plus the composite + selected-scene previews), enough to
        // kill the tab. Thumbnails show the scene's own content only.
        // assembleSceneAuto (not assembleScene): codegen scenes embed library
        // components via <component> tags, which only the codegen assembler
        // resolves -- unresolved tags are invisible to the browser.
        const html = await assembleSceneAuto({
          scene,
          components,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
          componentLibDir: config.componentLibDir,
          preview: true,
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(html);
        return;
      }

      // ── API: Scene thumbnail STILL (captured JPEG; videos + camera included) ──
      // A real frame of the scene a few seconds in, cached on disk and
      // invalidated when the scene (or brand/camera/speaker context) changes.
      const thumbImgMatch = urlPath.match(/^\/api\/scene-thumb\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (thumbImgMatch && method === "GET") {
        const [, tenantId, projectId, sceneId] = thumbImgMatch.map(decodeURIComponent);
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
        try {
          const components = await resolveComponentSources(scene, tenantId, projectId);
          const { file, etag } = await getSceneThumbnail({
            project,
            scene,
            tenantId,
            projectId,
            components,
            speakerUrl: getSpeakerUrl(project),
            dataDir: config.dataDir,
            gsapDir: config.gsapDir,
            componentLibDir: config.componentLibDir,
          });
          if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, { ETag: etag });
            res.end();
            return;
          }
          const img = await fs.readFile(file);
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": img.length,
            ETag: etag,
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(img);
        } catch (err) {
          console.error(`Thumbnail capture failed for ${sceneId}:`, err);
          jsonResponse(res, 500, { error: "Thumbnail capture failed" });
        }
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

        // Assemble the scene HTML. For speaker projects, mirror the RENDER's
        // transparency rule (transparent unless explicitly opted out) and seek
        // the preview's camera underlay to this scene's start offset -- so the
        // Studio preview finally looks like the final composite.
        const spUrl = getSpeakerUrl(project);
        const spStarts = speakerSceneFilmStarts(project.scenes);
        const spIdx = project.scenes.findIndex((s) => s.id === scene.id);
        const spOffset = spIdx >= 0 ? spStarts[spIdx] : 0;
        const sceneForPreview = sceneCompositesOverSpeaker(scene, !!spUrl)
          ? { ...scene, transparent_background: true }
          : scene;
        // assembleSceneAuto routes codegen scenes through the codegen
        // assembler so nested <component> tags (screencast video, b-roll,
        // charts) resolve exactly like the render path -- this is why the
        // rendered MP4 played the screencast while Studio showed a blank
        // browser frame.
        const html = await assembleSceneAuto({
          scene: sceneForPreview,
          components,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
          componentLibDir: config.componentLibDir,
          preview: true,
          speakerUrl: spUrl,
          speakerOffset: spOffset,
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
          // Videos must preview in the browser: remux/transcode anything
          // Chrome can't play (HEVC/ProRes .mov -> black rectangle in
          // Studio). Lossless remux for h264-in-mov; full transcode
          // otherwise. May take a while for big ProRes files -- the HTTP
          // client just waits (this is a curl-driven push path).
          let finalPath = upPath;
          let normalized: { action: string; videoCodec: string | null } | undefined;
          try {
            const norm = await normalizeVideoForWeb(upPath);
            finalPath = norm.filePath;
            if (norm.action !== "kept") {
              normalized = { action: norm.action, videoCodec: norm.videoCodec };
              console.log(`  upload-asset: ${upName} ${norm.action} (${norm.videoCodec}) -> ${path.basename(finalPath)}`);
            }
          } catch (normErr: any) {
            console.warn(`  upload-asset: normalization skipped: ${normErr?.message || normErr}`);
          }
          const finalName = path.basename(finalPath);
          const finalSize = (await fs.stat(finalPath)).size;
          // Asset intelligence: understand the footage once, at ingest --
          // dimensions, embedded window chrome, letterboxing, theme -- and
          // persist it as a <file>.intel.json sidecar for codegen/components.
          let intel: AssetIntel | null = null;
          if (isAnalyzableVideo(finalPath)) {
            intel = await analyzeAndSaveIntel(finalPath).catch((e: any) => {
              console.warn(`  upload-asset: intel analysis skipped: ${e?.message || e}`);
              return null;
            });
            if (intel) console.log(`  upload-asset: intel for ${finalName}: ${intel.notes.join(" | ")}`);
          }
          jsonResponse(res, 200, {
            ok: true,
            url: `/assets/${upTenant}/projects/${upProject}/assets/${finalName}`,
            path: finalPath,
            size: finalSize,
            ...(normalized ? { normalized: true, normalize_action: normalized.action, original_codec: normalized.videoCodec, original_name: upName } : {}),
            ...(intel ? { intel } : {}),
          });
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Recorder events sidecar (SPEC-recorder.md) ──
      // POST /api/recorder-events/{tenant}/{project}?name=<assetFile>
      // Ground truth from the Quotient Recorder extension: clicks (with
      // element boxes), navigations, idle spans. Stored next to the asset and
      // immediately converted into motion intel, replacing pixel heuristics.
      const recEventsMatch = urlPath.match(/^\/api\/recorder-events\/([^/]+)\/([^/]+)$/);
      if (recEventsMatch && method === "POST") {
        const [, reTenant, reProject] = recEventsMatch.map(decodeURIComponent);
        const reName = path.basename(new URL(url, "http://localhost").searchParams.get("name") || "");
        if (!reName) { jsonResponse(res, 400, { error: "name query param required" }); return; }
        const videoPath = path.join(config.dataDir, reTenant, "projects", reProject, "assets", reName);
        try {
          await fs.access(videoPath);
        } catch {
          jsonResponse(res, 404, { error: `asset not found: ${reName} (upload the video first)` });
          return;
        }
        try {
          const body = await parseBody(req);
          const { saveRecorderEvents, loadRecorderEvents } = await import("./core/recorder-events.js");
          if (body?.version !== 1 || !body?.recording) {
            jsonResponse(res, 400, { error: "invalid events sidecar (need version:1 + recording)" });
            return;
          }
          await saveRecorderEvents(videoPath, body as any);
          const saved = await loadRecorderEvents(videoPath);
          // Convert to motion intel now (and drop any stale memo) so
          // compression/pins built from this asset use recorder truth.
          const { ensureMotionIntel, invalidateMotionIntel } = await import("./core/asset-intel.js");
          invalidateMotionIntel(videoPath);
          const intel = await ensureMotionIntel(videoPath);
          console.log(
            `  recorder-events: ${reName} -- ${saved?.clicks?.length || 0} clicks, ${saved?.navigations?.length || 0} navigations, ` +
            `${intel.idle?.ranges.length || 0} idle range(s), ${intel.transitions.length} transition(s), ${intel.focus.length} focus event(s)`,
          );
          jsonResponse(res, 200, {
            ok: true,
            applied: {
              idle_ranges: intel.idle?.ranges.length || 0,
              transitions: intel.transitions.length,
              focus_events: intel.focus.length,
            },
          });
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Recorder-triggered generate ──
      // POST /api/recorder-generate/{tenant}  { video_url, narration_url?, prompt? }
      // Fire-and-forget: kicks the speaker-screencast assemble and returns
      // immediately; the extension points the user at Studio for the result.
      const recGenMatch = urlPath.match(/^\/api\/recorder-generate\/([^/]+)$/);
      if (recGenMatch && method === "POST") {
        const [, rgTenant] = recGenMatch.map(decodeURIComponent);
        try {
          const body = await parseBody(req);
          const videoUrl = body?.video_url as string;
          if (!videoUrl) { jsonResponse(res, 400, { error: "video_url required" }); return; }
          const { runGeneratePipeline } = await import("./llm/pipeline.js");
          const { llmConfigFromEnv } = await import("./llm/client.js");
          const { loadBrandKit } = await import("./persistence/brand-kit.js");
          let llmConfig;
          try { llmConfig = llmConfigFromEnv(); } catch (e: any) {
            jsonResponse(res, 500, { error: `LLM not configured: ${e.message}` });
            return;
          }
          const brandKit = await loadBrandKit(rgTenant);
          const prompt = (body?.prompt as string) || "Recorded walkthrough";
          // Async on purpose: assembly takes minutes (whisper on first run).
          void runGeneratePipeline({
            prompt,
            target: "video",
            tenant_id: rgTenant,
            llmConfig,
            brandKit: (brandKit || {}) as any,
            canvas: { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0f172a" } as any,
            film_grammar: "speaker-screencast",
            screencast_source: videoUrl,
            speaker_source: (body?.narration_url as string) || undefined,
          } as any)
            .then((r: any) => console.log(`  recorder-generate: done -> ${r?.project?.project_id || "?"} ("${prompt}")`))
            .catch((e: any) => console.error(`  recorder-generate: FAILED (${e?.message || e})`));
          jsonResponse(res, 202, { ok: true, started: true, note: "Assembling; the project will appear in Studio when done." });
        } catch (e: any) {
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Narration booth take (Mode B, SPEC-recorder.md) ──
      // POST /api/booth-narration/{tenant}/{project}?name=take.webm with the
      // raw audio bytes. The take was performed against the locked cut in the
      // Studio booth, so this only attaches sound + spine on top -- scenes and
      // media edits are never touched. Synchronous: whisper on a booth-length
      // take is seconds, and the booth UI waits to show captions arrived.
      const boothMatch = urlPath.match(/^\/api\/booth-narration\/([^/]+)\/([^/]+)$/);
      if (boothMatch && method === "POST") {
        const [, bnTenant, bnProject] = boothMatch.map(decodeURIComponent);
        const bnQuery = new URL(req.url || "/", "http://localhost").searchParams;
        const bnName = path.basename(bnQuery.get("name") || `narration-${Date.now()}.webm`).replace(/[^a-zA-Z0-9._-]/g, "_");
        try {
          const project = await loadProject(bnTenant, bnProject);
          if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
          const MAX_TAKE = 128 * 1024 * 1024;
          const chunks: Buffer[] = [];
          let received = 0;
          await new Promise<void>((resolve, reject) => {
            req.on("data", (c: Buffer) => {
              received += c.length;
              if (received > MAX_TAKE) { reject(new Error("take exceeds 128MB limit")); req.destroy(); return; }
              chunks.push(c);
            });
            req.on("end", () => resolve());
            req.on("error", reject);
          });
          const takeBuffer = Buffer.concat(chunks);
          if (takeBuffer.length < 1024) { jsonResponse(res, 400, { error: "take is empty" }); return; }
          const bnDir = path.join(config.dataDir, bnTenant, "projects", bnProject, "assets");
          await fs.mkdir(bnDir, { recursive: true });
          await fs.writeFile(path.join(bnDir, bnName), takeBuffer);
          const narrationUrl = `/assets/${bnTenant}/projects/${bnProject}/assets/${bnName}`;

          const { attachBoothNarration } = await import("./llm/narrated-screencast.js");
          let bnLlm;
          try { bnLlm = llmConfigFromEnv(); } catch { bnLlm = undefined; }
          const result = await attachBoothNarration({
            project,
            narrationSource: narrationUrl,
            dataDir: config.dataDir,
            llmConfig: bnLlm,
          });
          await saveProject(project);
          console.log(`  booth-narration: ${bnProject} -- ${result.summary}`);
          jsonResponse(res, 200, { ok: true, url: narrationUrl, ...result });
        } catch (e: any) {
          console.error(`  booth-narration: FAILED (${e?.message || e})`);
          jsonResponse(res, 500, { error: e?.message || String(e) });
        }
        return;
      }

      // ── API: Studio session logs ──
      // POST /api/studio-log/{tenant}?session=sid  -- the Studio client ships
      // its console ring buffer here every few seconds, so a remote debugger
      // can tail a LIVE browser session's [scene]/[chase]/[edl]/error output.
      // GET  /api/studio-log/{tenant}               -- list sessions
      // GET  /api/studio-log/{tenant}?session=sid&lines=N -- tail one session
      const studioLogMatch = urlPath.match(/^\/api\/studio-log\/([^/]+)$/);
      if (studioLogMatch) {
        const slTenant = decodeURIComponent(studioLogMatch[1]);
        const slQuery = new URL(req.url || "/", "http://localhost").searchParams;
        const slDir = path.join(config.dataDir, slTenant, "_studio-logs");
        const sidRaw = slQuery.get("session") || "";
        const sid = sidRaw.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48);
        if (method === "POST") {
          if (!sid) { jsonResponse(res, 400, { error: "session query param required" }); return; }
          try {
            const chunks: Buffer[] = [];
            let recd = 0;
            await new Promise<void>((resolve, reject) => {
              req.on("data", (c: Buffer) => { recd += c.length; if (recd > 512 * 1024) { reject(new Error("too large")); req.destroy(); return; } chunks.push(c); });
              req.on("end", () => resolve());
              req.on("error", reject);
            });
            const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}");
            const lines: any[] = Array.isArray(payload.lines) ? payload.lines.slice(0, 900) : [];
            if (lines.length) {
              await fs.mkdir(slDir, { recursive: true });
              const file = path.join(slDir, `${sid}.jsonl`);
              const st = await fs.stat(file).catch(() => null);
              if (!st || st.size < 5 * 1024 * 1024) { // 5MB cap per session
                const out = lines.map((l) => JSON.stringify({
                  ts: new Date(Number(l.t) || Date.now()).toISOString(),
                  level: String(l.l || "log").slice(0, 5),
                  project: payload.project || undefined,
                  msg: String(l.m || "").slice(0, 600),
                })).join("\n") + "\n";
                await fs.appendFile(file, out);
              }
            }
            jsonResponse(res, 200, { ok: true, received: lines.length });
          } catch (e: any) {
            jsonResponse(res, 400, { error: e?.message || String(e) });
          }
          return;
        }
        if (method === "GET") {
          try {
            if (!sid) {
              const entries = await fs.readdir(slDir).catch(() => [] as string[]);
              const sessions = [];
              for (const f of entries) {
                if (!f.endsWith(".jsonl")) continue;
                const st = await fs.stat(path.join(slDir, f)).catch(() => null);
                if (st) sessions.push({ session: f.replace(/\.jsonl$/, ""), bytes: st.size, updated_at: st.mtime.toISOString() });
              }
              sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
              jsonResponse(res, 200, { sessions: sessions.slice(0, 40) });
              return;
            }
            const nLines = Math.min(2000, Math.max(1, parseInt(slQuery.get("lines") || "200", 10) || 200));
            const raw = await fs.readFile(path.join(slDir, `${sid}.jsonl`), "utf-8");
            const all = raw.trim().split("\n");
            jsonResponse(res, 200, { session: sid, total: all.length, lines: all.slice(-nLines).map((l) => { try { return JSON.parse(l); } catch { return { msg: l }; } }) });
          } catch (e: any) {
            jsonResponse(res, 404, { error: `session log not found: ${e?.message || e}` });
          }
          return;
        }
      }

      // ── API: (Re-)analyze an existing asset ──
      // POST /api/analyze-asset/{tenant}/{project}?name=file.mp4 runs the
      // same asset-intelligence pass the upload path runs, for assets that
      // predate it (or to refresh after editing the file). Writes the
      // <file>.intel.json sidecar and returns the intel.
      const analyzeAssetMatch = urlPath.match(/^\/api\/analyze-asset\/([^/]+)\/([^/]+)$/);
      if (analyzeAssetMatch && method === "POST") {
        const [, anTenant, anProject] = analyzeAssetMatch.map(decodeURIComponent);
        const anQuery = new URL(req.url || "/", "http://localhost").searchParams;
        const anName = path.basename(anQuery.get("name") || "").replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!anName) { jsonResponse(res, 400, { error: "name query param is required" }); return; }
        const anPath = path.join(config.dataDir, anTenant, "projects", anProject, "assets", anName);
        try {
          await fs.access(anPath);
        } catch {
          jsonResponse(res, 404, { error: `asset not found: ${anName}` });
          return;
        }
        if (!isAnalyzableVideo(anPath)) { jsonResponse(res, 400, { error: "not an analyzable video type" }); return; }
        try {
          // Body {trims: {top?, bottom?, left?, right?}} = a HUMAN CORRECTION:
          // merge into the existing sidecar (reason 'manual') instead of
          // re-running detection, so every future crop:"auto" use of this
          // asset inherits the corrected boundary. Detection is a suggestion;
          // the correction is the truth.
          const anBody = await parseBody(req).catch(() => ({} as Record<string, unknown>));
          const manualTrims = anBody && typeof (anBody as any).trims === "object" && (anBody as any).trims
            ? (anBody as any).trims as Record<string, unknown> : null;
          if (manualTrims) {
            const sidecarPath = `${anPath}.intel.json`;
            let intel: any = null;
            try { intel = JSON.parse(await fs.readFile(sidecarPath, "utf-8")); } catch { /* no sidecar yet */ }
            if (!intel) intel = await analyzeAndSaveIntel(anPath);
            if (!intel) { jsonResponse(res, 422, { error: "no sidecar and analysis failed -- cannot apply manual trims" }); return; }
            for (const side of ["top", "bottom", "left", "right"]) {
              const v = Number((manualTrims as any)[side]);
              if (Number.isFinite(v) && v >= 0) intel.trims[side] = { px: Math.round(v), reason: "manual" };
            }
            intel.content_box = {
              x: intel.trims.left.px,
              y: intel.trims.top.px,
              w: Math.max(1, intel.width - intel.trims.left.px - intel.trims.right.px),
              h: Math.max(1, intel.height - intel.trims.top.px - intel.trims.bottom.px),
            };
            intel.notes = [...(intel.notes || []).filter((n: string) => !n.startsWith("manual trims")), `manual trims applied ${new Date().toISOString()}`];
            await fs.writeFile(sidecarPath, JSON.stringify(intel, null, 2));
            console.log(`  analyze-asset: ${anName}: manual trims ${JSON.stringify(manualTrims)}`);
            jsonResponse(res, 200, { ok: true, intel, manual: true });
            return;
          }
          const intel = await analyzeAndSaveIntel(anPath);
          if (!intel) { jsonResponse(res, 422, { error: "analysis produced no result (undecodable or degenerate video)" }); return; }
          console.log(`  analyze-asset: ${anName}: ${intel.notes.join(" | ")}`);
          jsonResponse(res, 200, { ok: true, intel });
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

      // ── API: Save a scene's camera moves (Studio direct manipulation) ──
      const camMovesMatch = urlPath.match(/^\/api\/camera-moves\/([^/]+)\/([^/]+)$/);
      if (camMovesMatch && method === "POST") {
        const [, tenantId, projectId] = camMovesMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        if (!sceneId) { jsonResponse(res, 400, { error: "scene_id is required" }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const scene = project.scenes.find((s: any) => s.id === sceneId);
        if (!scene) { jsonResponse(res, 404, { error: "Scene not found" }); return; }
        const moves = body.camera_moves;
        if (moves === null || (Array.isArray(moves) && moves.length === 0)) delete (scene as any).camera_moves;
        else if (Array.isArray(moves)) (scene as any).camera_moves = moves;
        else { jsonResponse(res, 400, { error: "camera_moves must be an array or null" }); return; }
        project.updated_at = new Date().toISOString();
        await saveProject(project);
        jsonResponse(res, 200, { ok: true, scene_id: sceneId, camera_moves: (scene as any).camera_moves || [] });
        return;
      }

      // ── API: Component data patch (Studio callout authoring etc.) ──
      // Scoped successor to the removed generic prop-editor PATCH: merges
      // the posted data object into ONE component's data and saves.
      const compPatchMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes\/([^/]+)\/components\/([^/]+)$/);
      if (compPatchMatch && method === "PATCH") {
        const [, tenantId, projectId, sceneId, compId] = compPatchMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const hasStage = body.pose !== undefined || body.enter !== undefined || body.exit !== undefined || body.position !== undefined;
        if ((!body.data || typeof body.data !== "object") && !hasStage) { jsonResponse(res, 400, { error: "data object (or pose/enter/exit/position) is required" }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const scene = project.scenes.find((s: any) => s.id === sceneId);
        if (!scene) { jsonResponse(res, 404, { error: "Scene not found" }); return; }
        const comp = (scene.components || []).find((c: any) => c.id === compId);
        if (!comp) { jsonResponse(res, 404, { error: "Component not found" }); return; }
        if (body.data && typeof body.data === "object") {
          (comp as any).data = { ...((comp as any).data || {}), ...(body.data as Record<string, unknown>) };
        }
        // Stage-lane fields (SPEC-motion-architecture L4): pose/enter/exit/
        // position live on the wrapper, not in data. null clears a field.
        for (const k of ["pose", "enter", "exit", "position"]) {
          if (body[k] === null) delete (comp as any)[k];
          else if (body[k] !== undefined) (comp as any)[k] = body[k];
        }
        project.updated_at = new Date().toISOString();
        await saveProject(project);
        jsonResponse(res, 200, { ok: true, component_id: compId, data: (comp as any).data });
        return;
      }

      // ── API: Speaker waveform peaks (timeline strip) ──
      const waveMatch = urlPath.match(/^\/api\/speaker-waveform\/([^/]+)\/([^/]+)$/);
      if (waveMatch && method === "GET") {
        const [, tenantId, projectId] = waveMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        // Speaker recording first; generated voiceover tracks as fallback.
        const spSrc = (project as any).speaker_track?.clips?.[0]?.source as string | undefined;
        const voTrack = (project as any).audio?.tracks?.find((t: any) => t.type === "voiceover" && t.source);
        const audioSrc = spSrc || voTrack?.source;
        if (!audioSrc) { jsonResponse(res, 404, { error: "No speaker or voiceover audio on this project" }); return; }
        try {
          const cacheDir = path.join(config.dataDir, tenantId, "projects", projectId, "thumbs");
          const wf = await getWaveformPeaks(resolveVideoPath(audioSrc), cacheDir);
          jsonResponse(res, 200, { ok: true, buckets_per_second: wf.bucketsPerSecond, peaks: wf.peaks });
        } catch (err: any) {
          jsonResponse(res, 500, { error: `Waveform extraction failed: ${err?.message || err}` });
        }
        return;
      }

      // ── API: Speaker transcript (whisper.cpp; what was ACTUALLY said) ──
      const transcriptMatch = urlPath.match(/^\/api\/speaker-transcript\/([^/]+)\/([^/]+)$/);
      if (transcriptMatch && method === "GET") {
        const [, tenantId, projectId] = transcriptMatch.map(decodeURIComponent);
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        if (!(await whisperAvailable())) {
          jsonResponse(res, 200, { ok: true, available: false, segments: [] });
          return;
        }
        const spSrc2 = (project as any).speaker_track?.clips?.[0]?.source as string | undefined;
        const voTrack2 = (project as any).audio?.tracks?.find((t: any) => t.type === "voiceover" && t.source);
        const audioSrc2 = spSrc2 || voTrack2?.source;
        if (!audioSrc2) { jsonResponse(res, 404, { error: "No speaker or voiceover audio on this project" }); return; }
        try {
          const cacheDir2 = path.join(config.dataDir, tenantId, "projects", projectId, "thumbs");
          const tr = await getTranscript(resolveVideoPath(audioSrc2), cacheDir2);
          // Correct whisper's leading-silence anchor using the waveform onset.
          let segs2 = tr.segments;
          try {
            const wf2 = await getWaveformPeaks(resolveVideoPath(audioSrc2), cacheDir2);
            const onsetIdx = wf2.peaks.findIndex((pk) => pk > 0.08);
            if (onsetIdx > 0) segs2 = snapLeadingWords(segs2, onsetIdx / wf2.bucketsPerSecond);
          } catch { /* waveform optional */ }
          jsonResponse(res, 200, { ok: true, available: true, segments: segs2 });
        } catch (err: any) {
          jsonResponse(res, 500, { error: `Transcription failed: ${err?.message || err}` });
        }
        return;
      }

      // ── API: Compress waiting -- detect idle stretches, timelapse them ──
      const compressMatch = urlPath.match(/^\/api\/compress-waiting\/([^/]+)\/([^/]+)$/);
      if (compressMatch && method === "POST") {
        const [, tenantId, projectId] = compressMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = body.scene_id as string;
        const target = body.target as string;
        const src = body.src as string;
        if (!sceneId || !target || !src) { jsonResponse(res, 400, { error: "scene_id, target and src are required" }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const scene = project.scenes.find((s: any) => s.id === sceneId);
        if (!scene) { jsonResponse(res, 404, { error: "Scene not found" }); return; }
        try {
          const videoPath = resolveVideoPath(src);
          const minIdle = typeof body.min_idle === "number" ? (body.min_idle as number) : 2;
          const idleRate = typeof body.idle_rate === "number" ? (body.idle_rate as number) : 8;
          const hasRange = typeof body.range_start === "number" && typeof body.range_end === "number" && (body.range_end as number) > (body.range_start as number);
          const range = hasRange ? { start: body.range_start as number, end: body.range_end as number } : undefined;
          const det = await detectIdleRanges(videoPath, minIdle, -40, range);
          if (!det.ranges.length) { jsonResponse(res, 200, { ok: true, idle_ranges: 0, media_edits: (scene as any).media_edits || {} }); return; }
          // Compress writes INTENTS: idle stretches become 8x rate regions;
          // pins and cuts survive and the solver re-fits around them (a
          // compress pass used to overwrite the whole map, nuking pins).
          const edits: Record<string, any> = (scene as any).media_edits || {};
          const current = edits[target] || { segments: [] };
          const intents = inferIntents(current, det.duration);
          const scanLo = range ? range.start : 0;
          const scanHi = range ? range.end : det.duration;
          // Replace prior rate preferences inside the scanned window only.
          intents.rate_regions = (intents.rate_regions || []).filter((x) => x.src_end <= scanLo || x.src_start >= scanHi);
          for (const r of det.ranges) intents.rate_regions.push({ src_start: r.start, src_end: r.end, rate: idleRate });
          const solved = solveMediaEdits(intents, det.duration);
          edits[target] = {
            segments: solved.segments,
            pins: intents.pins || [],
            cuts: intents.cuts || [],
            rate_regions: intents.rate_regions,
            pin_status: solved.pin_status,
          };
          (scene as any).media_edits = edits;
          project.updated_at = new Date().toISOString();
          await saveProject(project);
          const outDur = solved.segments.reduce((s2, g) => s2 + (g.src_end - g.src_start) / g.rate, 0);
          const scanned = scanHi - scanLo;
          const idleTotal = det.ranges.reduce((t, r) => t + (r.end - r.start), 0);
          jsonResponse(res, 200, {
            ok: true,
            idle_ranges: det.ranges.length,
            source_duration: range ? scanned : det.duration,
            output_duration: range ? Math.round((scanned - idleTotal + idleTotal / idleRate) * 10) / 10 : Math.round(outDur * 10) / 10,
            media_edits: (scene as any).media_edits,
          });
        } catch (err: any) {
          jsonResponse(res, 500, { error: `Compress failed: ${err?.message || err}` });
        }
        return;
      }

      // ── API: Media source-maps (condensed screencasts) ──
      // Full replace of ONE target's segments on a scene: {scene_id, target,
      // segments|null}. Same grammar as camera moves: "screencast" or a
      // video[src*="file"] selector -- several videos per scene, each with
      // its own edit.
      const mediaEditsMatch = urlPath.match(/^\/api\/media-edits\/([^/]+)\/([^/]+)$/);
      if (mediaEditsMatch && method === "POST") {
        const [, tenantId, projectId] = mediaEditsMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const sceneId = (body.scene_id || body.sceneId) as string;
        const target = body.target as string;
        if (!sceneId) { jsonResponse(res, 400, { error: "scene_id is required" }); return; }
        if (!target) { jsonResponse(res, 400, { error: "target is required" }); return; }
        const project = await loadProject(tenantId, projectId);
        if (!project) { jsonResponse(res, 404, { error: "Project not found" }); return; }
        const scene = project.scenes.find((s: any) => s.id === sceneId);
        if (!scene) { jsonResponse(res, 404, { error: "Scene not found" }); return; }
        // ── Op-based intent edits ──
        // A pin is a constraint, a cut is restorable, a rate is a preference:
        // each op mutates INTENTS and recompiles the playback segments via
        // the solver, so editing one thing never silently breaks another
        // (the reported failure: a cut before a pin un-pinned everything).
        if (typeof body.op === "string") {
          const srcDur = Number(body.src_duration);
          if (!(srcDur > 0)) { jsonResponse(res, 400, { error: "src_duration (seconds) is required for op-based edits" }); return; }
          const editsMap: Record<string, any> = (scene as any).media_edits || {};
          const current = editsMap[target] || { segments: [] };
          const intents = inferIntents(current, srcDur);
          const near = (a: number, b: number, eps = 0.25) => Math.abs(a - b) < eps;
          try {
            switch (body.op) {
              case "add_pin": {
                const p = (body.pin || {}) as { out: number; src: number; word?: string };
                if (!(p.out >= 0) || !(p.src >= 0)) throw new Error("pin {out, src} required");
                intents.pins = (intents.pins || []).filter((x: any) => !near(x.out, p.out));
                intents.pins.push({ out: p.out, src: p.src, ...(p.word ? { word: String(p.word).slice(0, 40) } : {}) });
                break;
              }
              case "remove_pin":
                intents.pins = (intents.pins || []).filter((x: any) => !near(x.out, Number(body.out)));
                break;
              case "add_cut": {
                const c = (body.cut || {}) as { src_start: number; src_end: number };
                if (!(c.src_end > c.src_start)) throw new Error("cut {src_start, src_end} required");
                (intents.cuts = intents.cuts || []).push({ src_start: c.src_start, src_end: c.src_end });
                break;
              }
              case "remove_cut": {
                // Exact match when src_end is given (two cuts can share a
                // start after merges); nearest-start fallback otherwise.
                const rs = Number(body.src_start), re = Number(body.src_end);
                intents.cuts = (intents.cuts || []).filter((x: any) =>
                  isFinite(re) ? !(near(x.src_start, rs, 0.5) && near(x.src_end, re, 0.5)) : !near(x.src_start, rs, 0.5));
                break;
              }
              case "set_rate": {
                const r = (body.region || {}) as { src_start: number; src_end: number; rate?: number };
                if (!(r.src_end > r.src_start)) throw new Error("region {src_start, src_end, rate} required");
                // carve the range out of existing regions, then add the new one (1x = just carve)
                const out: any[] = [];
                for (const x of intents.rate_regions || []) {
                  if (x.src_end <= r.src_start || x.src_start >= r.src_end) { out.push(x); continue; }
                  if (x.src_start < r.src_start) out.push({ ...x, src_end: r.src_start });
                  if (x.src_end > r.src_end) out.push({ ...x, src_start: r.src_end });
                }
                out.push({ src_start: r.src_start, src_end: r.src_end, rate: r.rate || 1 });
                intents.rate_regions = out;
                break;
              }
              case "split": {
                const at = Number(body.src);
                if (!(at > 0)) throw new Error("split {src} required");
                const regions = intents.rate_regions || [];
                const hit = regions.find((x: any) => at > x.src_start + 0.05 && at < x.src_end - 0.05);
                if (hit) {
                  const rest = { ...hit, src_start: at };
                  hit.src_end = at;
                  regions.splice(regions.indexOf(hit) + 1, 0, rest);
                } else {
                  // No region here: create a boundary pair over the enclosing
                  // unregioned span at the ambient rate (1x), so each side is
                  // independently rate-able and visible as its own block.
                  let lo = 0, hi = srcDur;
                  for (const x of regions) { if (x.src_end <= at) lo = Math.max(lo, x.src_end); if (x.src_start >= at) hi = Math.min(hi, x.src_start); }
                  regions.push({ src_start: lo, src_end: at, rate: 1 }, { src_start: at, src_end: hi, rate: 1 });
                }
                intents.rate_regions = regions;
                break;
              }
              case "merge_region": {
                // Dissolve the rate region covering this span and let a
                // touching neighbor absorb it (left wins; right if no left;
                // plain removal restores ambient 1x when isolated). This is
                // the "un-shard" for tiny solver/split leftovers.
                const m = (body.region || {}) as { src_start: number; src_end: number };
                if (!(m.src_end > m.src_start)) throw new Error("region {src_start, src_end} required");
                const rs2 = (intents.rate_regions || []).filter((x: any) => !(x.src_start >= m.src_start - 0.25 && x.src_end <= m.src_end + 0.25));
                const left = rs2.find((x: any) => Math.abs(x.src_end - m.src_start) < 0.25);
                const right = rs2.find((x: any) => Math.abs(x.src_start - m.src_end) < 0.25);
                if (left) left.src_end = m.src_end;
                else if (right) right.src_start = m.src_start;
                intents.rate_regions = rs2;
                break;
              }
              case "set_rate_regions": // bulk replace (compress-waiting)
                intents.rate_regions = Array.isArray(body.rate_regions) ? body.rate_regions : [];
                break;
              case "clear":
                intents.cuts = []; intents.rate_regions = []; intents.pins = [];
                break;
              default:
                throw new Error(`unknown op "${body.op}"`);
            }
          } catch (opErr: any) {
            jsonResponse(res, 400, { error: opErr?.message || String(opErr) });
            return;
          }
          const solved = solveMediaEdits(intents, srcDur);
          const hasAny = (intents.cuts?.length || 0) + (intents.rate_regions?.length || 0) + (intents.pins?.length || 0) > 0;
          if (!hasAny) delete editsMap[target];
          else editsMap[target] = {
            segments: solved.segments,
            pins: intents.pins || [],
            cuts: intents.cuts || [],
            rate_regions: intents.rate_regions || [],
            pin_status: solved.pin_status,
          };
          if (Object.keys(editsMap).length) (scene as any).media_edits = editsMap;
          else delete (scene as any).media_edits;
          project.updated_at = new Date().toISOString();
          await saveProject(project);
          jsonResponse(res, 200, { ok: true, scene_id: sceneId, target, edit: editsMap[target] || null });
          return;
        }

        const segments = body.segments;
        const edits: Record<string, any> = (scene as any).media_edits || {};
        if (segments === null || (Array.isArray(segments) && segments.length === 0)) {
          delete edits[target];
        } else if (Array.isArray(segments)) {
          const bad = segments.some((s: any) =>
            !s || typeof s.src_start !== "number" || typeof s.src_end !== "number" ||
            s.src_end <= s.src_start || typeof s.rate !== "number" || s.rate <= 0);
          if (bad) { jsonResponse(res, 400, { error: "segments must be [{src_start, src_end, rate>0}] with src_end > src_start" }); return; }
          edits[target] = { segments };
          if (Array.isArray(body.pins) && (body.pins as any[]).every((pn: any) => pn && typeof pn.out === "number" && typeof pn.src === "number")) {
            edits[target].pins = body.pins;
          }
        } else {
          jsonResponse(res, 400, { error: "segments must be an array or null" });
          return;
        }
        // Hygiene: the client may ask to drop stale keys in the same save
        // (e.g. a legacy 'screencast' entry now superseded by a file-specific
        // key for the same video -- two keys resolving to one element means
        // the lane shows one map while playback runs another).
        if (Array.isArray(body.delete_targets)) {
          for (const dt of body.delete_targets as any[]) {
            if (typeof dt === "string" && dt !== target) delete edits[dt];
          }
        }
        if (Object.keys(edits).length) (scene as any).media_edits = edits;
        else delete (scene as any).media_edits;
        project.updated_at = new Date().toISOString();
        await saveProject(project);
        jsonResponse(res, 200, { ok: true, scene_id: sceneId, media_edits: (scene as any).media_edits || {} });
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
