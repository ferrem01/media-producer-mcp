import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// A render's work dir (<project>/_work/<job_id>) holds every scene's PNG
// frames. Left behind after each render they filled the droplet's disk (90 GB
// on Oct 28) and renders and takes failed on a full disk. A job now removes
// its own dir when it ends, and the server sweeps old ones at startup.

const DATA = path.join(os.tmpdir(), `mp-render-work-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t";

// The render itself is stubbed: it writes a frame into its work dir the way
// the scene workers do, then succeeds or fails.
const seen: string[] = [];
vi.mock("../src/core/render.js", () => ({
  renderProject: async (opts: { workDir: string; project: { name: string } }) => {
    await fs.mkdir(path.join(opts.workDir, "scene_0", "frames"), { recursive: true });
    await fs.writeFile(path.join(opts.workDir, "scene_0", "frames", "frame_00001.png"), "png");
    seen.push(opts.workDir);
    if (opts.project.name === "fails") throw new Error("encode failed");
    return { format: "mp4", durationMs: 1, frameCount: 1 };
  },
}));

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

async function film(id: string, name: string) {
  const { saveProject } = await import("../src/persistence/project.js");
  await saveProject({
    project_id: id, tenant_id: T, name, format: "video", status: "generated",
    canvas: { width: 1080, height: 1920, fps: 30 },
    scenes: [{ id: "scene_1", duration_seconds: 2, components: [] }],
  } as any);
}

async function settle(jobId: string) {
  const { getJobStatus } = await import("../src/core/render-queue.js");
  for (let i = 0; i < 200; i++) {
    const s = getJobStatus(jobId);
    if (s && (s.status === "completed" || s.status === "failed")) return s;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("render job never finished");
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

describe("render work dirs", () => {
  it("a finished render removes its own work dir", async () => {
    await film("proj_ok", "works");
    const { queueRender } = await import("../src/core/render-queue.js");
    const job = queueRender(T, "proj_ok");
    expect((await settle(job.id)).status).toBe("completed");
    const dir = seen.at(-1)!;
    expect(dir).toBe(path.join(DATA, T, "projects", "proj_ok", "_work", job.id));
    expect(await exists(dir)).toBe(false);
  });

  it("a failed render removes it too", async () => {
    await film("proj_bad", "fails");
    const { queueRender } = await import("../src/core/render-queue.js");
    const job = queueRender(T, "proj_bad");
    expect((await settle(job.id)).status).toBe("failed");
    expect(await exists(seen.at(-1)!)).toBe(false);
  });

  it("the startup sweep clears old job dirs and keeps recent ones and other caches", async () => {
    const work = path.join(DATA, T, "projects", "proj_sweep", "_work");
    const old = path.join(work, "job_old00001");
    const recent = path.join(work, "job_new00001");
    const perform = path.join(work, "perform-s1");
    for (const d of [old, recent, perform]) {
      await fs.mkdir(path.join(d, "frames"), { recursive: true });
      await fs.writeFile(path.join(d, "frames", "f.png"), "png");
    }
    const hoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await fs.utimes(old, hoursAgo, hoursAgo);
    await fs.utimes(perform, hoursAgo, hoursAgo);

    const { sweepRenderWorkDirs } = await import("../src/core/render-queue.js");
    expect(await sweepRenderWorkDirs(DATA, 60 * 60 * 1000)).toBe(1);
    expect(await exists(old)).toBe(false);
    expect(await exists(recent)).toBe(true);
    expect(await exists(perform)).toBe(true);
  });
});
