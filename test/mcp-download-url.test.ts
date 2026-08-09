import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jobWithPreview, renderStatusFields, MCP_INSTRUCTIONS } from "../src/server.js";

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

// The MCP instructions rides the MCP initialize handshake: every client
// agent receives it before its first tool call. It must stay compact and
// keep carrying the load-bearing lessons (links not SSH, iterate ladder,
// brand kit first, async jobs).
describe("MCP_INSTRUCTIONS (handshake instructions)", () => {
  it("is wired into the McpServer construction", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    expect(src).toMatch(/instructions: MCP_INSTRUCTIONS/);
  });

  it("carries the load-bearing operator knowledge", () => {
    for (const phrase of [
      "download_url",     // delivery is a link...
      "SSH",              // ...never server access
      "studio_url",       // humans review/edit in Studio
      "storyboard",       // iterate ladder starts cheap
      "quality:'preview'",
      "brand kit",        // generate needs a kit
      "job_id",           // async job contract
      "revise",           // surgical edit before regeneration
      "NEVER edit a project while its render job runs",
    ]) {
      expect(MCP_INSTRUCTIONS, `MCP instructions lost: ${phrase}`).toContain(phrase);
    }
  });

  it("stays a tight page (clients hold it in context all session)", () => {
    // Budget raised 4000 -> 5000 when the MCP instructions grew from four grammars to
    // six and gained the REAL MEDIA section (three media sources + the two
    // presenter tools). The prose was tightened 6232 -> ~4600 first; the rest
    // is surface the operator genuinely has to know. Cut content before you
    // raise this again.
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(5000);
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
