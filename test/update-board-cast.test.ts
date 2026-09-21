import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "board-cast-tenant";
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/update-board-cast");

// THE CAST IS SET ON THE BOARD, DETERMINISTICALLY (AMENDMENTS 2026-09-21):
// before this, a storyboard scene's components could only be changed by
// re-authoring the scene through the writer (the update tool's scene edit
// took lines only; Studio Inspect edits built scenes). Setting the ring on
// scene 6 of the naano test board took a paragraph of feedback and an LLM
// call for what is a data edit.
describe("update tool: storyboard scenes[].components sets a board scene's cast", () => {
  let client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  let loadProject: typeof import("../src/persistence/project.js")["loadProject"];
  let projectId: string;

  const callUpdate = async (args: Record<string, unknown>) => {
    const res: any = await client.callTool({ name: "update", arguments: { tenant_id: TENANT, ...args } });
    const text = res?.content?.[0]?.text ?? "";
    let json: any; try { json = JSON.parse(text); } catch { /* err() */ }
    return { isError: !!res?.isError, text, json };
  };

  beforeAll(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_TOKENS;
    config.dataDir = TEST_DATA_DIR;
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    const persistence = await import("../src/persistence/project.js");
    loadProject = persistence.loadProject;
    const { createMcpServer } = await import("../src/server.js");
    const project = await persistence.createProject({ tenant_id: TENANT, name: "Board cast", format: "video" });
    projectId = project.project_id;
    project.storyboard = {
      narrative: "n", estimated_duration: 7, audio: { music_mood: "corporate", voice: "nova", pacing: "moderate" } as any,
      scenes: [
        { label: "HOOK - x", purpose: "p", template: "", duration_seconds: 3.5, assets: [], visual_notes: "v", components: [{ type: "browser-frame", data: { url: "a" } }, { type: "checklist-toggles", data: { items: ["a"] } }] },
        { label: "REVEAL - y", purpose: "p", template: "", duration_seconds: 3.5, assets: [], visual_notes: "v", scene_template: { type: "st-logo-close", data: {} }, components: [] },
      ],
    } as any;
    project.status = "storyboard";
    await persistence.saveProject(project);
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const server = createMcpServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(ct);
  });

  afterAll(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it("replaces the whole cast, keeps positions and data verbatim, and leaves the other fields alone", async () => {
    const ring = { type: "card-fan", position: { x: "8%", y: "20%", width: "84%", height: "76%" }, data: { layout: "ring", turn: 200, collapse_at: 3, cards: [{ label: "Maya Chen" }, { label: "Jon Ortiz" }] }, enter: { effect: "cut" }, pose: { from: { rotate_x: 28, rotate_y: -12 }, duration: 1.2 } };
    const line = { type: "kinetic-text", data: { text: "The people it *already knows*", entrance: "type-on" } };
    const r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 0, components: [line, ring] }] } });
    expect(r.isError, r.text).toBe(false);
    const p = await loadProject(TENANT, projectId);
    const s0: any = p!.storyboard!.scenes[0];
    expect(s0.components.map((c: any) => c.type)).toEqual(["kinetic-text", "card-fan"]);
    expect(s0.components[1].position).toEqual(ring.position);
    expect(s0.components[1].data).toEqual(ring.data);
    expect(s0.components[1].enter).toEqual({ effect: "cut" });
    expect(s0.components[1].pose).toEqual({ from: { rotate_x: 28, rotate_y: -12 }, duration: 1.2 }); // the arrival rides with the cast
    expect(s0.label).toBe("HOOK - x"); expect(s0.duration_seconds).toBe(3.5); expect(s0.visual_notes).toBe("v");
    expect(r.json.storyboard.scenes[0].components.length).toBe(2);
  });

  it("an omitted components keeps the cast; [] clears it", async () => {
    let r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 0, label: "HOOK - renamed" }] } });
    expect(r.isError).toBe(false);
    let s0: any = (await loadProject(TENANT, projectId))!.storyboard!.scenes[0];
    expect(s0.components.length).toBe(2); expect(s0.label).toBe("HOOK - renamed");
    r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 0, components: [] }] } });
    expect(r.isError).toBe(false);
    s0 = (await loadProject(TENANT, projectId))!.storyboard!.scenes[0];
    expect(s0.components).toEqual([]);
  });

  it("a cast set on a templated scene drops the template (it would cover the cast); scene_template null drops it alone; a template can be set", async () => {
    let r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 1, components: [{ type: "kinetic-text", data: { text: "x" } }] }] } });
    expect(r.isError).toBe(false);
    let s1: any = (await loadProject(TENANT, projectId))!.storyboard!.scenes[1];
    expect(s1.scene_template).toBeUndefined(); expect(s1.components.length).toBe(1);
    r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 1, scene_template: { type: "st-logo-close", data: { url: "getquotient.ai" } } }] } });
    expect(r.isError).toBe(false);
    s1 = (await loadProject(TENANT, projectId))!.storyboard!.scenes[1];
    expect(s1.scene_template).toEqual({ type: "st-logo-close", data: { url: "getquotient.ai" } });
    expect(s1.components.length).toBe(1); // untouched
    r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ index: 1, scene_template: null }] } });
    expect(r.isError).toBe(false);
    s1 = (await loadProject(TENANT, projectId))!.storyboard!.scenes[1];
    expect(s1.scene_template).toBeUndefined();
  });

  it("a world pin sent with a board edit lands in the same call", async () => {
    const r = await callUpdate({ project_id: projectId, world: "sky", storyboard: { scenes: [{ index: 0, label: "HOOK - on the sky" }] } });
    expect(r.isError, r.text).toBe(false);
    expect(r.json.world?.backdrop?.component).toBe("sky-backdrop");
    const p: any = await loadProject(TENANT, projectId);
    expect(p.world.backdrop.component).toBe("sky-backdrop");
    expect(p.world.theme).toBe("dark");
    expect(p.storyboard.scenes[0].label).toBe("HOOK - on the sky");
  });

  it("an appended scene takes a cast too", async () => {
    const r = await callUpdate({ project_id: projectId, storyboard: { scenes: [{ label: "CLOSE - z", duration_seconds: 4, components: [{ type: "cursor-performer", data: {} }] }] } });
    expect(r.isError).toBe(false);
    const sc: any = (await loadProject(TENANT, projectId))!.storyboard!.scenes;
    expect(sc.length).toBe(3);
    expect(sc[2].components.map((c: any) => c.type)).toEqual(["cursor-performer"]);
    expect(sc[2].duration_seconds).toBe(4);
  });
});
