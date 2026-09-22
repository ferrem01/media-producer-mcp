import { describe, it, expect } from "vitest";
import { queueJob } from "../src/core/job-queue.js";
import { queueRender, activeRender } from "../src/core/render-queue.js";

// ONE RENDER PER FILM. The job queue is fire-and-forget with no concurrency
// limit, so pressing Render again on a film that is already rendering used to
// start a SECOND full render beside the first. Each render forks a browser per
// scene, so both crawl -- measured on a 12-scene film, a five-minute render
// became twenty, and neither job could be cancelled. The second press must get
// the render already working.

describe("render guard", () => {
  it("hands back the render already in flight instead of starting a second", async () => {
    const tenant = "tenant-render-guard";
    const projectId = "proj_render_guard";

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = queueJob("render", tenant, async (j) => {
      j.projectId = projectId;
      await gate;
    });
    first.projectId = projectId;

    expect(activeRender(tenant, projectId)?.id).toBe(first.id);

    const second = queueRender(tenant, projectId);
    expect(second.id).toBe(first.id);
    expect(second.reused).toBe(true);

    release();
    await gate;
  });

  it("does not confuse one film's render with another's", () => {
    const tenant = "tenant-render-guard-2";
    const first = queueJob("render", tenant, async (j) => {
      j.projectId = "proj_a";
      await new Promise((r) => setTimeout(r, 50));
    });
    first.projectId = "proj_a";

    expect(activeRender(tenant, "proj_a")?.id).toBe(first.id);
    expect(activeRender(tenant, "proj_b")).toBeNull();
    expect(activeRender("another-tenant", "proj_a")).toBeNull();
  });
});
