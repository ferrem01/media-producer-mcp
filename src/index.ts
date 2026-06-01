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
import { generateComponent } from "./core/component-generator.js";
import { callLLM, llmConfigFromEnv } from "./llm/client.js";
import { loadBrandKit } from "./persistence/brand-kit.js";
import { parseComponent, bindTemplate, scopeCSS } from "./core/component-parser.js";
import { buildPlaygroundPreview } from "./playground-app/preview-builder.js";
import { listProjects, loadProject, updateComponent, addScene, removeScene, reorderScenes } from "./persistence/project.js";
import { queueRender, getJobStatus, listJobs } from "./core/render-queue.js";
import { assembleScene, type ComponentSource } from "./core/scene-assembler.js";
import fs from "node:fs/promises";
import path from "node:path";
import { setupWebSocket } from "./ws.js";
import { authMiddleware } from "./auth/auth.js";

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
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
        const components = await resolveComponentSources(scene);
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
        const renderBody = await parseBody(req).catch(() => ({}));
        const renderOptions: { critique?: boolean; maxRevisions?: number; originalPrompt?: string } = {};
        if (renderBody && typeof renderBody === "object") {
          if ((renderBody as any).critique) renderOptions.critique = true;
          if ((renderBody as any).maxRevisions) renderOptions.maxRevisions = Number((renderBody as any).maxRevisions);
          if ((renderBody as any).originalPrompt) renderOptions.originalPrompt = String((renderBody as any).originalPrompt);
        }
        const job = queueRender(tenantId, projectId, renderOptions);
        jsonResponse(res, 200, {
          status: "queued",
          job_id: job.id,
          project_id: projectId,
          tenant_id: tenantId,
        });
        return;
      }

      // ── API: Get job status ──
      const jobMatch = url.match(/^\/api\/jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        const jobId = decodeURIComponent(jobMatch[1]);
        const job = getJobStatus(jobId);
        if (!job) {
          jsonResponse(res, 404, { error: "Job not found" });
          return;
        }
        jsonResponse(res, 200, job);
        return;
      }

      // ── API: List jobs for tenant ──
      const jobsMatch = url.match(/^\/api\/jobs\/?$/);
      if (jobsMatch && method === "GET") {
        const jobParams = new URL(url, `http://localhost`).searchParams;
        const tenantFilter = jobParams.get('tenant_id') || undefined;
        jsonResponse(res, 200, listJobs(tenantFilter));
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
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
