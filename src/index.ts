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
import { createMcpServer } from "./server.js";
import { config } from "./config.js";
import { getPreviewHtml } from "./preview-app/preview-app.js";
import { getPlaygroundHtml } from "./playground-app/playground-app.js";
import { buildComponentCatalog } from "./llm/catalog.js";
import { generateComponent } from "./core/component-generator.js";
import { callLLM, llmConfigFromEnv } from "./llm/client.js";
import { loadBrandKit } from "./persistence/brand-kit.js";
import { parseComponent, bindTemplate, scopeCSS } from "./core/component-parser.js";
import { buildPlaygroundPreview } from "./playground-app/preview-builder.js";
import { listProjects, loadProject, saveProject, updateComponent, addScene, removeScene, reorderScenes } from "./persistence/project.js";
import { queueRender, getJobStatus, listJobs } from "./core/render-queue.js";
import { getJob, listAllJobs } from "./core/job-queue.js";
import { assembleScene, type ComponentSource } from "./core/scene-assembler.js";
import fs from "node:fs/promises";
import path from "node:path";
import { setupWebSocket } from "./ws.js";
import { authMiddleware, extractToken, validateToken, isAuthEnabled } from "./auth/auth.js";
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
 * Send JSON response.
 */
function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
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
    return `http://localhost:${config.port}/assets/${rel}`;
  }
  if (source.startsWith("/assets/")) {
    return `http://localhost:${config.port}${source}`;
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
        // Validate auth
        if (isAuthEnabled()) {
          const token = extractToken(req);
          if (!token || !validateToken(token)) {
            res.writeHead(401, { "Content-Type": "application/json" });
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

          // Bad request
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
          if (!sessionId || !mcpTransports[sessionId]) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Invalid or missing session ID");
            return;
          }
          await mcpTransports[sessionId].handleRequest(req, res);
          return;
        }

        if (method === "DELETE") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!sessionId || !mcpTransports[sessionId]) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Invalid or missing session ID");
            return;
          }
          await mcpTransports[sessionId].handleRequest(req, res);
          return;
        }

        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method not allowed");
        return;
      }

      // ── Static asset serving for project/tenant assets ──
      const assetMatch = urlPath.match(/^\/assets\/([^/]+)\/projects\/([^/]+)\/assets\/(.+)$/);
      if (assetMatch && (method === "GET" || method === "HEAD")) {
        const [, assetTenantId, assetProjectId, assetPath] = assetMatch.map(decodeURIComponent);
        const fullPath = path.join(config.dataDir, assetTenantId, "projects", assetProjectId, "assets", assetPath);
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
      if (url === "/health" || url === "/") {
        jsonResponse(res, 200, { status: "ok", service: "media-producer-mcp", version: "0.1.0" });
        return;
      }

      // ── OAuth routes (unauthenticated) ──

      if (urlPath === "/auth/google/login" && method === "GET") {
        await handleGoogleLogin(req, res);
        return;
      }
      if (urlPath === "/auth/google/callback" && method === "GET") {
        await handleGoogleCallback(req, res);
        return;
      }
      if (urlPath === "/auth/token" && method === "POST") {
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

      // ── Preview SPA ──
      if (url.startsWith("/preview")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(previewHtml);
        return;
      }

      // ── API: List projects ──
      const listMatch = url.match(/^\/api\/projects\/([^/]+)$/);
      if (listMatch && method === "GET") {
        const tenantId = decodeURIComponent(listMatch[1]);
        const projects = await listProjects(tenantId);
        jsonResponse(res, 200, projects);
        return;
      }

      // ── API: Get project ──
      const getMatch = url.match(/^\/api\/projects\/([^/]+)\/([^/]+)$/);
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

      // ── API: Update component props ──
      const compMatch = url.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes\/([^/]+)\/components\/([^/]+)$/);
      if (compMatch && method === "PATCH") {
        const [, tenantId, projectId, sceneId, componentId] = compMatch.map(decodeURIComponent);
        const body = await parseBody(req);
        const updated = await updateComponent(
          tenantId,
          projectId,
          sceneId,
          componentId,
          { data: body.data as Record<string, unknown> },
        );
        if (!updated) {
          jsonResponse(res, 404, { error: "Component not found" });
          return;
        }
        jsonResponse(res, 200, updated);
        return;
      }

      // ── API: Add scene ──
      const addSceneMatch = url.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes$/);
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
      const deleteSceneMatch = url.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/scenes\/([^/]+)$/);
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
      const reorderMatch = url.match(/^\/api\/projects\/([^/]+)\/([^/]+)\/reorder$/);
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
      const thumbMatch = url.match(/^\/api\/scene-thumbnail\/([^/]+)\/([^/]+)\/([^/]+)$/);
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
      const sceneMatch = url.match(/^\/api\/preview-scene\/([^/]+)\/([^/]+)\/([^/]+)$/);
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

      // ── Playground SPA ──
      if (url === "/playground" || url === "/playground/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(playgroundHtml);
        return;
      }

      // ── Playground API: Component catalog ──
      if (url === "/playground/api/components/catalog" && method === "GET") {
        const catalog = await buildComponentCatalog(config.componentLibDir);
        jsonResponse(res, 200, catalog);
        return;
      }

      // ── Playground API: Component source ──
      const sourceMatch = url.match(/^\/playground\/api\/components\/([^/]+)\/([^/]+)\/source$/);
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
      const schemaMatch = url.match(/^\/playground\/api\/components\/([^/]+)\/([^/]+)\/schema$/);
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

      // ── Playground API: Preview component ──
      if (url === "/playground/api/components/preview" && method === "POST") {
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

          const html = buildPlaygroundPreview({
            boundHtml,
            scopedCSS,
            gsapSource,
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
      if (url === "/playground/api/components/save" && method === "POST") {
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

          // Try to extract schema from the component and save a basic schema
          const parsed = parseComponent(source);
          const schema = {
            type,
            category,
            label: type.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            description: "Custom component",
            data: parsed.schema || {},
          };
          await fs.writeFile(
            path.join(saveDir, `${type}.schema.json`),
            JSON.stringify(schema, null, 2),
            "utf-8",
          );

          jsonResponse(res, 200, { ok: true });
        } catch (err) {
          jsonResponse(res, 500, { error: (err as Error).message });
        }
        return;
      }

      // ── Playground API: List tenant custom components ──
      const tenantCompMatch = url.match(/^\/playground\/api\/tenant-components\/([^/]+)$/);
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
      const tenantCompSrcMatch = url.match(/^\/playground\/api\/tenant-components\/([^/]+)\/([^/]+)\/source$/);
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
      if (url === "/playground/api/generate" && method === "POST") {
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
      if (url === "/playground/api/revise" && method === "POST") {
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
      const renderMatch = url.match(/^\/api\/render\/([^/]+)\/([^/]+)$/);
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

      // ── API: Get job status ──
      // ── API: List jobs ──
      const jobsListMatch = url.match(/^\/api\/jobs\/?$/);
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

      const jobMatch = url.match(/^\/api\/jobs\/([^/]+)$/);
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
      const jobWaitMatch = url.match(/^\/api\/jobs\/([^/]+)\/wait/);
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
      const jobsMatch = url.match(/^\/api\/jobs\/?$/);
      if (jobsMatch && method === "GET") {
        const jobParams = new URL(url, `http://localhost`).searchParams;
        const tenantFilter = jobParams.get('tenant_id') || undefined;
        const typeFilter = jobParams.get('type') as "render" | "generate" | undefined;
        jsonResponse(res, 200, listAllJobs(tenantFilter, typeFilter || undefined));
        return;
      }

      // ── API: Get traces for tenant ──
      const tracesMatch = url.match(/^\/api\/traces\/([^/]+)$/);
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
      const digestMatch = url.match(/^\/api\/traces\/([^/]+)\/digest$/);
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
      const genImageMatch = url.match(/^\/api\/generate-image\/([^/]+)$/);
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
