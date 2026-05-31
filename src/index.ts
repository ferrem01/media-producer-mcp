/**
 * media-producer-mcp entry point.
 *
 * Starts the MCP server on stdio transport and an HTTP server with:
 * - Health endpoint
 * - Preview SPA
 * - Preview API routes
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import http from "node:http";
import { createMcpServer } from "./server.js";
import { config } from "./config.js";
import { getPreviewHtml } from "./preview-app/preview-app.js";
import { getPlaygroundHtml } from "./playground-app/playground-app.js";
import { buildComponentCatalog } from "./llm/catalog.js";
import { parseComponent, bindTemplate, scopeCSS } from "./core/component-parser.js";
import { listProjects, loadProject, updateComponent } from "./persistence/project.js";
import { assembleScene, type ComponentSource } from "./core/scene-assembler.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolve all component sources for a scene by reading .component.html files
 * from the component library.
 */
async function resolveComponentSources(
  scene: import("./core/types.js").Scene,
): Promise<ComponentSource[]> {
  const types = new Set(scene.components.map((c) => c.type));
  const sources: ComponentSource[] = [];

  for (const type of types) {
    // Search in component lib subdirectories
    const libDir = config.componentLibDir;
    const found = await findComponentFile(libDir, type);
    if (found) {
      sources.push({ type, source: found });
    } else {
      console.warn(`Component type "${type}" not found in library`);
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

async function main() {
  // Create MCP server
  const server = createMcpServer();

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Pre-generate HTML pages
  const previewHtml = getPreviewHtml();
  const playgroundHtml = getPlaygroundHtml();

  // Start HTTP server
  const httpServer = http.createServer(async (req, res) => {
    const url = req.url || "";
    const method = req.method || "GET";

    // ── CORS preflight ──
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      // ── Health ──
      if (url === "/health" || url === "/") {
        jsonResponse(res, 200, { status: "ok", service: "media-producer-mcp", version: "0.1.0" });
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

        // Resolve component sources
        const components = await resolveComponentSources(scene);

        // Assemble the scene HTML
        const html = await assembleScene({
          scene,
          components,
          brandKit: project.brand_kit,
          canvas: project.canvas,
          gsapDir: config.gsapDir,
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

          // Default brand kit for playground preview
          const defaultBrand = {
            colors: { primary: "#A78BFA", secondary: "#6366f1", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
            fonts: [{ family: "Inter", source: "google" as const, weights: [400, 500, 600, 700] }],
          };

          const html = \`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
:root {
  --mp-color-primary: \${defaultBrand.colors.primary};
  --mp-color-secondary: \${defaultBrand.colors.secondary};
  --mp-color-accent: \${defaultBrand.colors.accent};
  --mp-color-background: \${defaultBrand.colors.background};
  --mp-color-surface: \${defaultBrand.colors.surface};
  --mp-color-text: \${defaultBrand.colors.text};
  --mp-color-text-muted: \${defaultBrand.colors.text_muted};
  --mp-font-family: 'Inter', system-ui, sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0f172a; }
.mp-component { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; }
\${scopedCSS}
</style>
<script>
\${gsapSource}
if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);
if (typeof CustomEase !== 'undefined') gsap.registerPlugin(CustomEase);
</script>
</head>
<body>
<div class="mp-component" data-cid="pg-comp">
  \${boundHtml}
</div>
<script>
(function() {
  var data = \${JSON.stringify(data)};
  var el = document.querySelector('[data-cid="pg-comp"]');
  var ctx = { duration: 5, motion: 'cinematic' };
  \${parsed.script}
  var tl = createTimeline(el, data, ctx);
  var master = gsap.timeline({ paused: true });
  master.add(tl, 0);
  window.__MP_TIMELINE = master;
  window.__MP_DURATION = 5;
  window.__MP_READY = true;
})();
</script>
</body>
</html>\`;

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

      // ── Playground API: Save component ──
      if (url === "/playground/api/components/save" && method === "POST") {
        const body = await parseBody(req);
        const type = body.type as string;
        const category = body.category as string || "custom";
        const source = body.source as string;

        if (!type || !source) {
          jsonResponse(res, 400, { error: "type and source are required" });
          return;
        }

        try {
          // Save to component library
          const catDir = path.join(config.componentLibDir, category);
          await fs.mkdir(catDir, { recursive: true });
          await fs.writeFile(path.join(catDir, `${type}.component.html`), source, "utf-8");

          // Try to extract schema from the component and save a basic schema
          const parsed = parseComponent(source);
          const schema = {
            type,
            category,
            label: type.replace(/-/g, " ").replace(/\\b\\w/g, (c: string) => c.toUpperCase()),
            description: "Custom component",
            data: parsed.schema || {},
          };
          await fs.writeFile(
            path.join(catDir, `${type}.schema.json`),
            JSON.stringify(schema, null, 2),
            "utf-8",
          );

          jsonResponse(res, 200, { ok: true });
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
        // Stub: just acknowledge the render request
        jsonResponse(res, 200, {
          status: "Render queued",
          project_id: projectId,
          tenant_id: tenantId,
        });
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

  httpServer.listen(config.port, () => {
    console.error(`media-producer-mcp HTTP on :${config.port}`);
    console.error(`  Preview SPA: http://localhost:${config.port}/preview`);
    console.error(`  Data directory: ${config.dataDir}`);
    console.error(`  Component library: ${config.componentLibDir}`);
    console.error(`MCP server ready on stdio`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
