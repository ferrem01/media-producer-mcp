import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// "The tool storm just flashes for like a second ... it claims that it's
// visible the entire time. But it ain't" (Marc, 2026-10-08): added without a
// z it sat at 0 under the speaker at 1, drawn under the person in Studio. An
// overlay added to a scene with a speaker goes over the person.

const DATA = path.join(os.tmpdir(), `mp-overlay-z-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

describe("an overlay added to a speaker scene goes over the person", () => {
  it("one over the highest speaker layer; its own z, a backdrop, a speaker or no speaker keep theirs", async () => {
    const { zOverSpeaker } = await import("../src/core/speaker-layer.js");
    const scene = { components: [{ id: "speaker", type: "video", z_index: 1, data: { src: "speaker" } }] };
    expect(zOverSpeaker(scene, { id: "t", type: "tool-storm" })).toBe(2);
    expect(zOverSpeaker(scene, { id: "t", type: "tool-storm", z_index: 0 })).toBeNull();
    expect(zOverSpeaker(scene, { id: "s2", type: "video", data: { src: "speaker" } })).toBeNull();
    expect(zOverSpeaker(scene, { id: "m", type: "mesh-gradient" }, (t) => t === "mesh-gradient")).toBeNull();
    expect(zOverSpeaker({ components: [] }, { id: "t", type: "tool-storm" })).toBeNull();
    expect(zOverSpeaker({ components: [{ id: "speaker", type: "video", data: { src: "speaker" } }] }, { id: "t", type: "x" })).toBe(1);
  });

  it("the add path stamps it", async () => {
    const { createProject, addScene, addComponent } = await import("../src/persistence/project.js");
    const p = await createProject({ tenant_id: "t", name: "z", format: "video", frame: "9x16" } as any);
    await addScene("t", p.project_id, { id: "s1", label: "s1", duration_seconds: 4, components: [{ id: "speaker", type: "video", z_index: 1, position: { x: 0, y: 0, width: "100%", height: "100%" }, data: { src: "speaker" } }] } as any);
    const out = await addComponent("t", p.project_id, "s1", { id: "tools", type: "tool-storm", data: {} } as any);
    expect(out!.scenes[0].components.find((c: any) => c.id === "tools")!.z_index).toBe(2);
  });
});
