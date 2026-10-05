import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// A scene's critique report describes its custom graphic (a codegen scene_*
// component): removing that graphic drops the report. proj_d872a7e4 read
// "6 unresolved" on scenes that were then just the person and captions.
const DATA = path.join(os.tmpdir(), `mp-rm-quality-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

describe("removing a scene's custom graphic", () => {
  it("drops the critique that described it; removing a library component keeps it", async () => {
    const dir = path.join(DATA, "t", "projects", "proj_q");
    await fs.mkdir(dir, { recursive: true });
    const quality = { score: -47, attempts: 1, passed: false, unresolved_defects: ["[intent_mismatch] no hands"] };
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({
      project_id: "proj_q", tenant_id: "t", name: "Q", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-05T00:00:00.000Z", updated_at: "2026-10-05T00:00:00.000Z",
      scenes: [
        { id: "a", duration_seconds: 4, quality, components: [{ id: "speaker", type: "video", data: { src: "speaker" } }, { id: "comp_0", type: "scene_scene_002", data: {} }] },
        { id: "b", duration_seconds: 4, quality, components: [{ id: "pill", type: "sticker-prop", data: {} }] },
      ],
    }));
    const { removeComponent, loadProject } = await import("../src/persistence/project.js");
    await removeComponent("t", "proj_q", "a", "comp_0");
    await removeComponent("t", "proj_q", "b", "pill");
    const p: any = await loadProject("t", "proj_q");
    expect(p.scenes[0].quality).toBeUndefined();
    expect(p.scenes[0].components.map((c: any) => c.id)).toEqual(["speaker"]);
    expect(p.scenes[1].quality).toEqual(quality);
  });
});
