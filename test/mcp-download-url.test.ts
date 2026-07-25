import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jobWithPreview, renderStatusFields } from "../src/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Agents relay what tool results give them. A completed render that only
// carries a server-local outputPath reads as "the file lives on the box" --
// which is how a user got told to SSH in for their film. The contract:
// completed render jobs expose a public download_url, never the fs path.
describe("jobWithPreview (MCP job responses)", () => {
  const base = {
    id: "job_x",
    type: "render",
    tenantId: "t1",
    projectId: "p1",
    status: "completed",
    outputPath: "/data/media-producer/t1/projects/p1/output/output.mp4",
  };

  it("completed render: public download_url replaces the server path", () => {
    const out = jobWithPreview({ ...base });
    expect(out.download_url).toMatch(/^https?:\/\/.+\/output\/t1\/projects\/p1\/output\.mp4$/);
    expect(out.outputPath, "server-local path must not reach the agent").toBeUndefined();
    expect(String(out.message)).toContain("download_url");
    expect(String(out.preview_url)).toContain("/studio?");
  });

  it("still-running render: no download_url yet, path also withheld from nothing (job unchanged)", () => {
    const out = jobWithPreview({ ...base, status: "running", outputPath: undefined });
    expect(out.download_url).toBeUndefined();
    expect(String(out.preview_url)).toContain("/studio?");
  });

  it("generate jobs only gain preview_url", () => {
    const out = jobWithPreview({ ...base, type: "generate", outputPath: undefined });
    expect(out.download_url).toBeUndefined();
    expect(String(out.preview_url)).toContain("/studio?");
  });

  it("jobs without tenant/project pass through untouched", () => {
    const out = jobWithPreview({ id: "job_y", type: "render", status: "completed" });
    expect(out.preview_url).toBeUndefined();
    expect(out.download_url).toBeUndefined();
  });
});

// The durable path: get(project) / list must answer "what's the download
// link?" at any time, not just in the render job's completion response.
describe("renderStatusFields (project-level latest render)", () => {
  it("no output.mp4 -> rendered:false, nothing else", async () => {
    const out = await renderStatusFields({ tenant_id: "no-such-tenant", project_id: "proj_none" });
    expect(out).toEqual({ rendered: false });
  });

  it("output.mp4 present -> download_url + freshness; edits after render flip stale", async () => {
    const { config } = await import("../src/config.js");
    const prev = config.dataDir;
    config.dataDir = path.resolve(__dirname, "../test-output/render-status");
    const outDir = path.join(config.dataDir, "t1", "projects", "p1", "output");
    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "output.mp4"), "fake-mp4");
      const mtime = (await fs.stat(path.join(outDir, "output.mp4"))).mtime.getTime();

      const fresh = await renderStatusFields({
        tenant_id: "t1", project_id: "p1",
        updated_at: new Date(mtime - 60_000).toISOString(), // edited BEFORE the render
      });
      expect(fresh.rendered).toBe(true);
      expect(String(fresh.download_url)).toMatch(/^https?:\/\/.+\/output\/t1\/projects\/p1\/output\.mp4$/);
      expect(fresh.render_stale).toBe(false);
      expect(fresh.render_hint).toBeUndefined();

      const stale = await renderStatusFields({
        tenant_id: "t1", project_id: "p1",
        updated_at: new Date(mtime + 60_000).toISOString(), // edited AFTER the render
      });
      expect(stale.render_stale).toBe(true);
      expect(String(stale.render_hint)).toContain("render again");
    } finally {
      await fs.rm(path.resolve(__dirname, "../test-output/render-status"), { recursive: true, force: true });
      config.dataDir = prev;
    }
  });
});
