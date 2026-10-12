import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// CONCURRENT TAKE EDITS (Oct 12, the pacing pass): head/tail trims on one
// film's scenes, fired in parallel, overwrote each other -- each edit loaded
// the project, worked, and saved the whole file back, so the last save won
// and the other trims vanished. An edit now holds the film's lock from its
// first read to its save: the edits queue, and each starts from the last.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-take-edits-conc-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t", P = "proj_takeconc";

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

describe("take edits fired at once on one film", () => {
  it("keeps every trim, on different scenes and on the same take", async () => {
    const assets = path.join(DATA, T, "projects", P, "assets");
    await fs.mkdir(assets, { recursive: true });
    const A = `/assets/${T}/projects/${P}/assets/`;
    const n = 4;
    for (let i = 0; i < n; i++) {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x284:rate=30:duration=6",
        "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac",
        path.join(assets, `take-${i}.mp4`)]);
    }
    const project = {
      project_id: P, tenant_id: T, name: "Concurrent take edits", format: "video", status: "generated",
      canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-12T00:00:00.000Z", updated_at: "2026-10-12T00:00:00.000Z",
      scenes: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, duration_seconds: 6, components: [] })),
      takes: Array.from({ length: n }, (_, i) => ({ id: `take_${i}`, scene_index: i, source: `${A}take-${i}.mp4`, recorded_at: "", duration: 6 })),
      speaker_track: { clips: Array.from({ length: n }, (_, i) => ({ source: `${A}take-${i}.mp4`, scene_index: i, start: 0 })) },
    };
    await fs.writeFile(path.join(DATA, T, "projects", P, "project.json"), JSON.stringify(project));
    const { editSceneTake } = await import("../src/core/take-edits.js");
    const { loadProject } = await import("../src/persistence/project.js");

    // Every scene's head and tail at once, and a second head trim on scene 0.
    await Promise.all([
      ...Array.from({ length: n }, (_, i) => editSceneTake(T, P, i, { op: "trim", head: 0.25, tail: 0.5 }, DATA)),
      editSceneTake(T, P, 0, { op: "trim", head: 0.25 }, DATA),
    ]);

    const saved = (await loadProject(T, P))!;
    const win = (i: number) => {
      const c: any = saved.speaker_track!.clips.find((x) => x.scene_index === i);
      return [c.trim_start, c.trim_end];
    };
    expect(win(0)).toEqual([0.5, 5.5]);
    for (let i = 1; i < n; i++) expect(win(i)).toEqual([0.25, 5.5]);
    expect(saved.scenes!.map((s) => s.duration_seconds)).toEqual([5, 5.25, 5.25, 5.25]);
  });
});

describe("talk-track edits save under the film's lock", () => {
  it("the Studio routes and the MCP tool cut and restore through the locked save", async () => {
    const read = (f: string) => fs.readFile(path.join(__dirname, "..", "src", f), "utf8");
    const [index, server, edl] = await Promise.all([read("index.ts"), read("server.ts"), read("core/speaker-edl.ts")]);
    for (const src of [index, server]) {
      expect(src).toMatch(/cutSpeakerAndSave\(/);
      expect(src).toMatch(/restoreSpeakerAndSave\(/);
      expect(src).not.toMatch(/applySpeaker(Cut|Restore)\(/);
    }
    expect(edl).toMatch(/withProjectLock\(tenantId, projectId, async \(\) => \{\s*const project = await loadProject/);
  });
});
