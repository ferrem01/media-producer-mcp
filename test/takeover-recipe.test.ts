import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The product-takeover recipe for speaker films. proj_4b4c366c (a fully
// generated presenter with cutaways over the multi-take seams) needed three
// rounds of hand repair: both takeovers were transparent 35%-wide panels,
// both presenter scenes were buried under opaque codegen backdrops, both
// cuts landed AFTER their seams, and shader transitions stuttered the cut.
// Marc's craft note on the result: 1.3s is too fast to read a product screen.

describe("takeover contract (storyboard)", () => {
  it("defines the recipe: opaque, full-frame, >=2.5s, framed on the performing region, hard cut", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/THE TAKEOVER RECIPE/);
    expect(sb).toMatch(/OPAQUE AND FULL-FRAME/);
    expect(sb).toMatch(/HOLD LONG ENOUGH TO READ: >=2\.5s/);
    expect(sb).toMatch(/FRAME THE PERFORMING REGION/);
    expect(sb).toMatch(/HARD CUT IN/);
    expect(sb).toMatch(/NEVER cover her with a codegen backdrop/);
  });

  it("tells the storyboard to start a takeover BEFORE the seam it hides", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/HIDING A MULTI-TAKE SEAM/);
    expect(sb).toMatch(/START ~0\.2s BEFORE the seam/);
  });
});

describe("takeover enforcement (pipeline, deterministic)", () => {
  it("forces opaque + full-frame + minimum hold + hard cut on speaker takeovers", async () => {
    const p = await read("../src/llm/pipeline.ts");
    const block = p.split("Speaker-film TAKEOVERS")[1]?.split("Beat quantization")[0] || "";
    expect(block).toContain("TAKEOVER_MIN = 2.5");
    expect(block).toMatch(/d\.transparent_background = false/);
    expect(block).toMatch(/x: "0%", y: "0%", width: "100%", height: "100%"/);
    expect(block).toMatch(/d\.duration_seconds = TAKEOVER_MIN/);
    expect(block).toMatch(/rescaleBeats\(d\.beats, TAKEOVER_MIN\)/);
    expect(block).toMatch(/type: "none"/);
  });

  it("strips full-bleed backdrops from the speaker's own scenes", async () => {
    const p = await read("../src/llm/pipeline.ts");
    const block = p.split("Speaker-film TAKEOVERS")[1]?.split("Beat quantization")[0] || "";
    expect(block).toMatch(/BACKDROP_RE/);
    expect(block).toMatch(/mesh-gradient\|webgl-backdrop/);
    expect(block).toMatch(/the camera is the background/);
  });
});

describe("seam handoff", () => {
  it("the presenter writes a seam sidecar beside its clip", async () => {
    const vg = await read("../src/media/video-gen.ts");
    expect(vg).toMatch(/Seam sidecar/);
    expect(vg).toMatch(/\.seams\.json/);
  });

  it("the pipeline reads it and briefs takeovers over each seam", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toMatch(/\.seams\.json/);
    expect(p).toMatch(/SEAMS IN THIS RECORDING/);
    expect(p).toMatch(/STARTS ~0\.2s BEFORE the seam/);
  });
});
