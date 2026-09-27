/**
 * WebSocket server for instant prop updates.
 *
 * Handles two message types:
 * - "update-prop": updates a component's data in a project scene, reassembles
 *   the scene HTML, and pushes it back to the client.
 * - "preview-component": assembles a standalone component preview (used by the
 *   Playground) and pushes the HTML back.
 *
 * And one family, "remote-booth:*" (SPEC-remote-booth.md): the relay between
 * the remote booth's control screen and the phone that is its camera. The
 * socket is authenticated with the SAME tenant token as HTTP (?token= on the
 * /ws URL, or the session cookie), and core/remote-booth.ts keeps every
 * message inside its session's room -- a socket whose token belongs to
 * another tenant cannot join.
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
import { extractToken, isAuthEnabled, validateToken, tenantAllowed } from "./auth/auth.js";
import { RemoteBoothHub, REMOTE_PREFIX, REMOTE_MAX_MESSAGE_BYTES, type RemotePeer, type RemoteTarget, type TargetLoader } from "./core/remote-booth.js";

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

// ── Remote booth (SPEC-remote-booth.md) ──

/** The film a remote session points at, read from the SESSION's tenant:
 *  the canvas (the phone records at its aspect), the name, and the lines. */
export const loadRemoteTarget: TargetLoader = async (tenant, projectId, scene) => {
  const p = await loadProject(tenant, projectId);
  if (!p || (p.tenant_id && p.tenant_id !== tenant)) return null;
  const sb = p.storyboard?.scenes || [];
  if (scene !== "all" && !sb[scene] && !(p.scenes || [])[scene]) return null;
  const lines = scene === "all"
    ? sb.map((s) => String(s.voiceover_text || "").trim()).filter(Boolean).join("\n")
    : String(sb[scene]?.voiceover_text || "").trim();
  const t: RemoteTarget = {
    project: projectId, scene, name: p.name || projectId,
    canvas: p.canvas ? { width: Number(p.canvas.width) || 1920, height: Number(p.canvas.height) || 1080 } : { width: 1920, height: 1080 },
    frame: (p.treatment as any)?.frame, grammar: (p.treatment as any)?.filmGrammar, lines,
  };
  return t;
};

export interface RemoteBoothWsOptions {
  hub?: RemoteBoothHub;
  /** token -> tenant (default: validateToken, the HTTP rule). */
  validate?: (token: string) => string | null;
  authEnabled?: () => boolean;
}

/** One socket's remote-booth messages. The token was read at the upgrade. */
async function handleRemoteBooth(ws: WebSocket, peer: RemotePeer, authed: string | undefined, hub: RemoteBoothHub, authEnabled: boolean, msg: Record<string, unknown>): Promise<void> {
  const type = String(msg.type || "");
  const name = type.slice(REMOTE_PREFIX.length);
  if (name === "ping") { sendJson(ws, { type: REMOTE_PREFIX + "pong" }); return; }
  if (name === "join") {
    const role = msg.role === "camera" ? "camera" : msg.role === "control" ? "control" : null;
    if (!role) { sendJson(ws, { type: REMOTE_PREFIX + "error", code: "bad-request", error: "role must be control or camera" }); return; }
    const r = hub.join(peer, role, typeof msg.session === "string" && msg.session ? msg.session : undefined, typeof msg.tenant === "string" ? msg.tenant : "", authed, authEnabled);
    if (!r.ok) { sendJson(ws, { type: REMOTE_PREFIX + "error", code: r.code, error: r.error }); return; }
    const s = r.session;
    sendJson(ws, { type: REMOTE_PREFIX + "joined", session: s.id, role, tenant: s.tenant, target: s.target, created: r.created,
      peers: { control: !!s.peers.control, camera: !!s.peers.camera } });
    return;
  }
  if (name === "target") {
    const r = await hub.retarget(peer, String(msg.project || ""), msg.scene);
    if (!r.ok) sendJson(ws, { type: REMOTE_PREFIX + "error", code: "target", error: r.error });
    return;
  }
  const why = hub.relay(peer, msg);
  // A refused preview is not worth a reply 4 times a second.
  if (why && name !== "preview") sendJson(ws, { type: REMOTE_PREFIX + "error", code: "relay", error: why });
}

/** Wire a WebSocketServer's remote-booth traffic to a hub. setupWebSocket
 *  uses it; the tests call it on their own server with their own tokens. */
export function attachRemoteBooth(wss: WebSocketServer, opts: RemoteBoothWsOptions = {}): RemoteBoothHub {
  const hub = opts.hub || new RemoteBoothHub({ loadTarget: loadRemoteTarget });
  const validate = opts.validate || validateToken;
  const authOn = opts.authEnabled || isAuthEnabled;
  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const token = extractToken(req);
    const authed = (token && validate(token)) || undefined;
    const peer: RemotePeer = { send: (m) => sendJson(ws, m) };
    (ws as any).__remoteBooth = async (msg: Record<string, unknown>, bytes: number) => {
      if (bytes > REMOTE_MAX_MESSAGE_BYTES) { sendJson(ws, { type: REMOTE_PREFIX + "error", code: "too-big", error: "message too large" }); return; }
      await handleRemoteBooth(ws, peer, authed, hub, authOn(), msg);
    };
    ws.on("close", () => hub.leave(peer));
  });
  // Idle sessions go on their own (a morning's shoot fits in the limit).
  const sweeper = setInterval(() => hub.sweep(), 10 * 60 * 1000);
  sweeper.unref?.();
  wss.on("close", () => clearInterval(sweeper));
  return hub;
}

/** Route one parsed message: remote-booth traffic to its relay. Returns
 *  false when the message is not remote-booth (the caller handles it). */
export async function routeRemoteBooth(ws: WebSocket, msg: Record<string, unknown>, raw: unknown): Promise<boolean> {
  if (typeof msg.type !== "string" || !msg.type.startsWith(REMOTE_PREFIX)) return false;
  const bytes = Array.isArray(raw) ? raw.reduce((a: number, b: Buffer) => a + b.length, 0) : Buffer.isBuffer(raw) ? raw.byteLength : raw instanceof ArrayBuffer ? raw.byteLength : 0;
  await (ws as any).__remoteBooth?.(msg, bytes);
  return true;
}

// ── Setup ──

export function setupWebSocket(server: http.Server, opts: RemoteBoothWsOptions = {}): RemoteBoothHub {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const hub = attachRemoteBooth(wss, opts);

  wss.on("connection", (ws, req) => {
    // update-prop WRITES into a project: the socket's token must be allowed
    // that tenant -- the HTTP rule (found while building the remote booth:
    // it wrote into whatever tenant/project the client named).
    const validate = opts.validate || validateToken;
    const authOn = opts.authEnabled || isAuthEnabled;
    const token = extractToken(req);
    const authed = (token && validate(token)) || undefined;
    ws.on("message", async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: "error", error: "Invalid JSON" });
        return;
      }

      try {
        if (await routeRemoteBooth(ws, msg, raw)) {
          // relayed (or refused) by the remote booth
        } else if (msg.type === "update-prop") {
          if (!tenantAllowed(authed, String(msg.tenantId || ""), authOn())) {
            sendJson(ws, { type: "error", error: "forbidden: this token cannot edit that workspace" });
            return;
          }
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
  return hub;
}
