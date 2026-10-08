import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { queueTakeGrade } from "../src/core/take-grade.js";
import { withProjectLock } from "../src/core/project-lock.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

const run = promisify(execFile);

// Marc, Oct 8 (proj_3bd9cad6): "I tried to unclick [the soft look] and it
// claims to have removed it ... when I open the inspector again it is
// checked again." The look saved only when its grade landed, and two grades
// on one film each saved the whole file -- the later one undid the earlier.
describe("the soft look sticks", () => {
  it("locked writers on one film run one after another", async () => {
    let stored: any = { a: 0, b: 0 };
    const slowly = (k: "a" | "b") => withProjectLock("t", "p", async () => {
      const p = { ...stored };
      await new Promise((r) => setTimeout(r, 30));
      p[k] = 1;
      stored = p;
    });
    await Promise.all([slowly("a"), slowly("b")]);
    expect(stored).toEqual({ a: 1, b: 1 });
  });

  it("two scenes' grades at once both land, and each clears its asked-for look", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-look-"));
    const files: Record<string, string> = {};
    for (const n of ["one", "two"]) {
      files[n] = path.join(dir, `${n}.mp4`);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", files[n]]);
    }
    const url = (n: string) => `/assets/t1/projects/p1/assets/${n}.mp4`;
    let stored: any = {
      tenant_id: "t1", project_id: "p1", storyboard: { scenes: [{}, {}] }, scenes: [], speaker_track: { clips: [] },
      takes: [
        { id: "take_0", scene_index: 0, source: url("one"), recorded_at: "x", look: "soft", soft_strength: 0.5, look_pending: { look: "natural" } },
        { id: "take_1", scene_index: 1, source: url("two"), recorded_at: "y", look: "soft", soft_strength: 0.5, look_pending: { look: "natural" } },
      ],
    };
    let saves = 0;
    const job = (n: string) => ({
      tenantId: "t1", projectId: "p1", rawUrl: url(n), look: "natural" as const, dataDir: dir,
      resolvePath: () => files[n],
      loadProject: async () => JSON.parse(JSON.stringify(stored)),
      saveProject: async (p: any) => { await new Promise((r) => setTimeout(r, 20)); stored = p; saves++; },
    });
    queueTakeGrade(job("one"));
    queueTakeGrade(job("two"));
    for (let i = 0; i < 300 && saves < 2; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    for (const t of stored.takes) {
      expect(t.look).toBe("natural");
      expect(t.soft_strength).toBeUndefined();
      expect(t.look_pending).toBeUndefined();
    }
  }, 60000);

  it("Studio shows the asked-for look while it applies, and says a recast is not graded", () => {
    const html = getPreviewHtml();
    expect(html).toContain("var lookOn = (lookPend ? lookPend.look : lookTake.look) === 'soft';");
    expect(html).toContain("applying…");
    expect(html).toMatch(/var lookRecast = !!\(lookTake && lookClip && \/\\\.actor-\/\.test/);
    expect(html).toContain("This scene plays a recast");
    expect(html).toContain("tkL.look_pending = on ?");
  });
});
