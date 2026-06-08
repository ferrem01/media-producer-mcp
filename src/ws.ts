/**
 * WebSocket server for instant prop updates.
 *
 * Handles two message types:
 * - "update-prop": updates a component's data in a project scene, reassembles
 *   the scene HTML, and pushes it back to the client.
 * - "preview-component": assembles a standalone component preview (used by the
 *   Playground) and pushes the HTML back.
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { loadProject, updateComponent } from "./persistence/project.js";
import { assembleScene, loadSharedUtilities, type ComponentSource } from "./core/scene-assembler.js";
import { parseComponent, bindTemplate, scopeCSS } from "./core/component-parser.js";
import { buildPlaygroundPreview } from "./playground-app/preview-builder.js";
import { config } from "./config.js";

// ── Helpers ──

async function findComponentFile(dir: string, type: string): Promise<string | null> {
  const filename = `${type}.component.html`;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fs.readFile(fullPath, "utf-8");
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

async function resolveComponentSourcesForScene(
  scene: { components: Array<{ type: string }> },
): Promise<ComponentSource[]> {
  const types = new Set(scene.components.map((c) => c.type));
  const sources: ComponentSource[] = [];
  for (const type of types) {
    const source = await findComponentFile(config.componentLibDir, type);
    if (source) {
      sources.push({ type, source });
    }
  }
  return sources;
}

async function loadGsapSource(): Promise<string> {
  let gsapSource = "";
  const gsapFiles = ["gsap.min.js", "SplitText.min.js", "CustomEase.min.js"];
  for (const file of gsapFiles) {
    try {
      const content = await fs.readFile(path.join(config.gsapDir, file), "utf-8");
      gsapSource += content + "\n";
    } catch {
      // skip missing
    }
  }
  return gsapSource;
}

function sendJson(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Message handlers ──

async function handleUpdateProp(ws: WebSocket, msg: {
  tenantId: string;
  projectId: string;
  sceneId: string;
  componentId: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, projectId, sceneId, componentId, data } = msg;

  // 1. Update the component data in the project file
  const updated = await updateComponent(tenantId, projectId, sceneId, componentId, { data });
  if (!updated) {
    sendJson(ws, { type: "error", error: "Component not found" });
    return;
  }

  // 2. Re-load the project to get the updated state
  const project = await loadProject(tenantId, projectId);
  if (!project) {
    sendJson(ws, { type: "error", error: "Project not found" });
    return;
  }

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    sendJson(ws, { type: "error", error: "Scene not found" });
    return;
  }

  // 3. Resolve component sources and reassemble the scene
  const components = await resolveComponentSourcesForScene(scene);
  const html = await assembleScene({
    scene,
    components,
    brandKit: project.brand_kit,
    canvas: project.canvas,
    gsapDir: config.gsapDir,
  });

  // 4. Push the assembled HTML back to the client
  sendJson(ws, { type: "scene-html", html, sceneId });
}

async function handlePreviewComponent(ws: WebSocket, msg: {
  source: string;
  data: Record<string, unknown>;
  brandKit?: unknown;
}): Promise<void> {
  const { source, data } = msg;

  if (!source) {
    sendJson(ws, { type: "error", error: "source is required" });
    return;
  }

  try {
    const parsed = parseComponent(source);
    const boundHtml = bindTemplate(parsed.template, data || {});
    const scopedCSS = parsed.style ? scopeCSS(parsed.style, "pg-comp") : "";
    const gsapSource = await loadGsapSource();

    let sharedSource = "";
    try { sharedSource = await loadSharedUtilities(); } catch { /* non-fatal */ }

    const html = buildPlaygroundPreview({
      boundHtml,
      scopedCSS,
      gsapSource,
      sharedSource,
      script: parsed.script,
      data: data || {},
    });

    sendJson(ws, { type: "scene-html", html });
  } catch (err) {
    sendJson(ws, { type: "error", error: (err as Error).message });
  }
}

// ── Setup ──

export function setupWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: "error", error: "Invalid JSON" });
        return;
      }

      try {
        if (msg.type === "update-prop") {
          await handleUpdateProp(ws, msg as any);
        } else if (msg.type === "preview-component") {
          await handlePreviewComponent(ws, msg as any);
        } else {
          sendJson(ws, { type: "error", error: `Unknown message type: ${msg.type}` });
        }
      } catch (err) {
        console.error("WebSocket handler error:", err);
        sendJson(ws, { type: "error", error: (err as Error).message });
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket client error:", err);
    });
  });

  console.error("WebSocket server on /ws");
}
