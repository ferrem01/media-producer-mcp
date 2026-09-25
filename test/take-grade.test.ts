import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { queueTakeGrade } from "../src/core/take-grade.js";
import { ungradedPathOf } from "../src/core/take-sanitize.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

const run = promisify(execFile);

// Studio's smoothing dial (POST /api/take-look): the take re-grades in the
// background from its kept original; every scene cut from the same
// recording follows; copies cut from the old grade are dropped; the last
// slider position wins when several arrive while one grade runs.
describe("the take grade queue", () => {
  it("re-grades one recording for every scene cut from it, and the last request wins", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-grade-"));
    const file = path.join(dir, "take-1.mp4");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", file]);
    const url = "/assets/t1/projects/p1/assets/take-1.mp4";
    let stored: any = {
      tenant_id: "t1", project_id: "p1",
      storyboard: { scenes: [{ label: "a" }, { label: "b" }] },
      scenes: [],
      takes: [
        { id: "take_0", scene_index: 0, source: url, recorded_at: "x", look: "natural", trim_start: 0, trim_end: 1, blur: "/assets/t1/projects/p1/assets/take-1-blur.mp4" },
        { id: "take_1", scene_index: 1, source: url, recorded_at: "x", look: "natural", trim_start: 1, trim_end: 2 },
        { id: "take_2", scene_index: 1, source: "/assets/t1/projects/p1/assets/other.mp4", recorded_at: "y", look: "natural" },
      ],
      speaker_track: { clips: [] },
    };
    const saves: any[] = [];
    const job = (strength: number) => ({
      tenantId: "t1", projectId: "p1", rawUrl: url, look: "soft" as const, strength, dataDir: dir,
      resolvePath: () => file,
      loadProject: async () => JSON.parse(JSON.stringify(stored)),
      saveProject: async (p: any) => { stored = p; saves.push(JSON.parse(JSON.stringify(p))); },
    });
    queueTakeGrade(job(0.2));
    queueTakeGrade(job(0.4)); // waits
    queueTakeGrade(job(0.9)); // replaces the waiting one
    for (let i = 0; i < 300 && saves.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    expect(saves.map((p) => p.takes[0].soft_strength)).toEqual([0.2, 0.9]);
    const [a, b, other] = stored.takes;
    for (const t of [a, b]) {
      expect(t.look).toBe("soft");
      expect(t.soft_strength).toBe(0.9);
      expect(t.ungraded).toBe("/assets/t1/projects/p1/assets/.take-1.ungraded.mp4");
      expect(t.graded_at).toBeTruthy();
    }
    expect(a.blur).toBeUndefined(); // cut from the old grade: dropped
    expect(other.look).toBe("natural"); // another recording is untouched
    await expect(fs.stat(ungradedPathOf(file))).resolves.toBeTruthy();
  }, 60000);

  it("Studio's speaker panel carries the dial and reloads the take when a grade lands", () => {
    const html = getPreviewHtml();
    expect(html).toContain("'/take-look/'");
    expect(html).toMatch(/class="prop-soft-on"/);
    expect(html).toMatch(/type="range" class="prop-soft" min="0" max="1" step="0\.05"/);
    expect(html).toContain("var regraded = gradeKey(state.currentProject) !== gradeKey(project);");
  });
});
