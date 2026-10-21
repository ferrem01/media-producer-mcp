/**
 * The MCP `update` tool keeps a film's tags whatever else the call edits.
 * A storyboard edit sent with tags returned early from the storyboard branch,
 * dropped the tags and still answered "updated" (Marc, Oct 21: six HubSpot
 * ads tagged with their opener lines came back untagged). We drive the real
 * tool handler in-process: tags alone, tags with a storyboard edit, tags with
 * a project edit, add/remove alongside a storyboard edit.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/update-tags");
const TENANT = "tags-tenant";

describe("update tool -- tags with any other edit", () => {
  let loadProject: typeof import("../src/persistence/project.js")["loadProject"];
  let client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  let projectId: string;

  const update = async (args: Record<string, unknown>) => {
    const res: any = await client.callTool({ name: "update", arguments: { tenant_id: TENANT, project_id: projectId, ...args } });
    return { isError: !!res?.isError, text: res?.content?.[0]?.text ?? "" };
  };
  const tagsNow = async () => (await loadProject(TENANT, projectId) as any)?.tags;

  beforeAll(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_TOKENS;
    config.dataDir = TEST_DATA_DIR;
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    const persistence = await import("../src/persistence/project.js");
    loadProject = persistence.loadProject;
    const { createMcpServer } = await import("../src/server.js");
    const project = await persistence.createProject({ tenant_id: TENANT, name: "Tagged Ad", format: "video" });
    projectId = project.project_id;
    const p: any = await loadProject(TENANT, projectId);
    p.storyboard = { narrative: "", scenes: [{ label: "Opener", purpose: "hook", visual_notes: "", voiceover_text: "Old line.", duration_seconds: 4, components: [] }], audio: { music_mood: "corporate", pacing: "moderate" } };
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

  it("tags alone are kept", async () => {
    expect((await update({ tags: ["ads", "inbound"] })).isError).toBe(false);
    expect(await tagsNow()).toEqual(["ads", "inbound"]);
  });

  it("tags sent with a storyboard edit are kept, and the edit lands too (the regression)", async () => {
    const r = await update({ tags: ["ads", "hubspot"], storyboard: { scenes: [{ index: 0, voiceover_text: "New line." }] } });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text).tags).toEqual(["ads", "hubspot"]);
    const p: any = await loadProject(TENANT, projectId);
    expect(p.tags).toEqual(["ads", "hubspot"]);
    expect(p.storyboard.scenes[0].voiceover_text).toBe("New line.");
  });

  it("add_tags / remove_tags work alongside a storyboard edit", async () => {
    await update({ add_tags: ["q4"], remove_tags: ["ads"], storyboard: { scenes: [{ index: 0, label: "Hook" }] } });
    expect(await tagsNow()).toEqual(["hubspot", "q4"]);
  });

  it("tags sent with a project edit are kept", async () => {
    await update({ tags: ["ads", "hubspot"], name: "HubSpot master" });
    const p: any = await loadProject(TENANT, projectId);
    expect(p.tags).toEqual(["ads", "hubspot"]);
    expect(p.name).toBe("HubSpot master");
  });

  it("a storyboard edit without tags leaves the tags alone", async () => {
    await update({ storyboard: { scenes: [{ index: 0, voiceover_text: "Another line." }] } });
    expect(await tagsNow()).toEqual(["ads", "hubspot"]);
  });
});
