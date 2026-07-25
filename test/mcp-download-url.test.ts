import { describe, it, expect } from "vitest";
import { jobWithPreview } from "../src/server.js";

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
