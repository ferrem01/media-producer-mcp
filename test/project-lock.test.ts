/**
 * ONE WRITER AT A TIME PER FILM (core/project-lock.ts). Marc, Oct 24: four
 * email ads lost their new graphics. The storyboard `update` calls ran past
 * the client's 60 s timeout, kept running on the server, and saved the film
 * they had loaded -- after a burst of component adds and deletes had landed
 * -- so the adds and deletes were gone. Every writer now holds the film from
 * its load to its save: the MCP edit tools, the persistence helpers,
 * Studio's edit routes, the jobs that write a film.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { withProjectLock, studioEditFilm } from "../src/core/project-lock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/project-lock");
const TENANT = "lock-tenant";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the lock", () => {
  it("is re-entrant: a writer holding a film runs an inner locked step straight through", async () => {
    const out = await withProjectLock("t", "p", () => withProjectLock("t", "p", async () => "inner"));
    expect(out).toBe("inner");
  });

  it("a job started inside a lock and still running after it waits like anyone", async () => {
    const order: string[] = [];
    let later!: Promise<void>;
    await withProjectLock("t", "q", async () => {
      later = (async () => { await sleep(20); await withProjectLock("t", "q", async () => { order.push("job"); }); })();
    });
    const other = withProjectLock("t", "q", async () => { await sleep(60); order.push("other"); });
    await Promise.all([later, other]);
    expect(order).toEqual(["other", "job"]);
  });

  it("other films are not held up", async () => {
    let freed = false;
    const hold = withProjectLock("t", "a", async () => { await sleep(80); freed = true; });
    await withProjectLock("t", "b", async () => { expect(freed).toBe(false); });
    await hold;
  });
});

describe("Studio's edit routes", () => {
  it("name the film they change", () => {
    expect(studioEditFilm("PATCH", "/api/projects/t1/proj_1/scenes/scene_001/components/title")).toEqual({ tenant: "t1", project: "proj_1" });
    expect(studioEditFilm("DELETE", "/api/projects/t1/proj_1/scenes/scene_001")).toEqual({ tenant: "t1", project: "proj_1" });
    expect(studioEditFilm("PATCH", "/api/storyboard/t1/proj_1/scenes/2")).toEqual({ tenant: "t1", project: "proj_1" });
    expect(studioEditFilm("POST", "/api/camera-moves/t1/proj_1")).toEqual({ tenant: "t1", project: "proj_1" });
  });
  it("reads, and routes that start a job, hold nothing", () => {
    expect(studioEditFilm("GET", "/api/projects/t1/proj_1")).toBeNull();
    expect(studioEditFilm("POST", "/api/render/t1/proj_1")).toBeNull();
    expect(studioEditFilm("POST", "/api/projects/t1/proj_1/duplicate")).toBeNull();
  });
});

describe("a slow edit and the edits made meanwhile (the regression)", () => {
  let persistence: typeof import("../src/persistence/project.js");
  let client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  let projectId: string;

  const call = async (name: string, args: Record<string, unknown>) => {
    const res: any = await client.callTool({ name, arguments: { tenant_id: TENANT, project_id: projectId, ...args } });
    return { isError: !!res?.isError, text: res?.content?.[0]?.text ?? "" };
  };
  const comps = async () => ((await persistence.loadProject(TENANT, projectId))!.scenes[0].components || []).map((c) => c.id);

  beforeAll(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_TOKENS;
    config.dataDir = TEST_DATA_DIR;
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    persistence = await import("../src/persistence/project.js");
    const { createMcpServer } = await import("../src/server.js");
    const project = await persistence.createProject({ tenant_id: TENANT, name: "Email ad", format: "video" });
    projectId = project.project_id;
    const p: any = await persistence.loadProject(TENANT, projectId);
    p.storyboard = { narrative: "Old.", scenes: [{ label: "Hook", purpose: "hook", visual_notes: "", voiceover_text: "Old line.", duration_seconds: 4, components: [] }], audio: { music_mood: "corporate", pacing: "moderate" } };
    p.scenes = [{ id: "scene_001", label: "Hook", duration_seconds: 4, components: [{ id: "old", type: "kinetic-text", data: { text: "Old" } }] }];
    await persistence.saveProject(p);

    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it("a writer that loaded the film before an add and saves after it keeps the add", async () => {
    // The slow writer: loads, works for a while, saves (the storyboard update
    // that ran 60 s+). The add and delete arrive while it works.
    const slow = withProjectLock(TENANT, projectId, async () => {
      const p: any = await persistence.loadProject(TENANT, projectId);
      await sleep(150);
      p.storyboard.narrative = "New.";
      await persistence.saveProject(p);
    });
    await sleep(20);
    const add = call("add", { scene_id: "scene_001", component: { id: "logo-badge", type: "image", data: { src: "/x.png" } } });
    const del = call("delete", { scene_id: "scene_001", component_id: "old" });
    await Promise.all([slow, add, del]);
    const p: any = await persistence.loadProject(TENANT, projectId);
    expect(p.storyboard.narrative).toBe("New.");
    expect(await comps()).toEqual(["logo-badge"]);
  });

  it("the MCP edit tools wait for a film another writer holds", async () => {
    let added = false;
    let addedWhileHeld: boolean | null = null;
    const hold = withProjectLock(TENANT, projectId, async () => { await sleep(150); addedWhileHeld = added; });
    await sleep(20);
    await Promise.all([hold, call("add", { scene_id: "scene_001", component: { id: "title", type: "kinetic-text", data: { text: "Hi" } } }).then(() => { added = true; })]);
    expect(addedWhileHeld).toBe(false);
    expect(added).toBe(true);
    expect(await comps()).toContain("title");
  });

  it("a storyboard update and component edits sent together all land", async () => {
    await Promise.all([
      call("update", { storyboard: { scenes: [{ index: 0, voiceover_text: "Newest line." }] } }),
      call("add", { scene_id: "scene_001", component: { id: "proof", type: "checklist-toggles", data: { items: [] } } }),
      call("update", { scene_id: "scene_001", component_id: "title", data: { text: "Hello" } }),
    ]);
    const p: any = await persistence.loadProject(TENANT, projectId);
    expect(p.storyboard.scenes[0].voiceover_text).toBe("Newest line.");
    expect(await comps()).toEqual(expect.arrayContaining(["logo-badge", "title", "proof"]));
    expect(p.scenes[0].components.find((c: any) => c.id === "title").data.text).toBe("Hello");
  });
});
