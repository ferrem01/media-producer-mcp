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

// BEHAVIORAL tests first. The source-regex guards below did NOT catch that
// the recipe was thrown away at scene build (proj_cec231eb: the pipeline set
// 0/0/100/100 + opaque, then authoredLayout's speaker dock re-slotted the
// surface to 35% width and buildAuthoredCompositionScene dropped
// transparent_background entirely). Assert on the BUILT SCENE.

describe("takeover as BUILT (behavioral)", () => {
  const speakerDraft = (transparent: boolean | undefined) => ({
    label: "Takeover",
    duration_seconds: 3,
    purpose: "p",
    visual_notes: "v",
    ...(transparent === undefined ? {} : { transparent_background: transparent }),
    components: [{ type: "quotient-campaign", data: { title: "Free Trial Launch" } }],
  });
  const buildOpts = (draft: any) => ({
    scene: draft,
    sceneIndex: 1,
    totalScenes: 4,
    prompt: "p",
    llmConfig: {} as any,
    brandKit: {} as any,
    canvas: { width: 1920, height: 1080 } as any,
    hasSpeakerTrack: true,
  });

  it("a takeover surface fills the frame and the scene is opaque", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const { scene } = await generateScene(buildOpts(speakerDraft(false)) as any);
    const surface = (scene as any).components.find((c: any) => c.type === "quotient-campaign");
    expect(surface).toBeTruthy();
    // Full-frame (the engine's FULL_STAGE uses numeric 0 origins).
    expect(String(surface.position.x).replace("%", "")).toBe("0");
    expect(String(surface.position.y).replace("%", "")).toBe("0");
    expect(surface.position.width).toBe("100%");
    expect(surface.position.height).toBe("100%");
    // Must reach the SCENE -- the renderer reads this, not the draft.
    expect((scene as any).transparent_background).toBe(false);
  });

  it("a non-takeover speaker scene still docks beside her and stays transparent", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const { scene } = await generateScene(buildOpts(speakerDraft(undefined)) as any);
    const surface = (scene as any).components.find((c: any) => c.type === "quotient-campaign");
    expect(surface.position.width).toBe("35%");        // the dock, not the frame
    expect(surface.position.x).toBe("62%");
    expect((scene as any).transparent_background).toBeUndefined(); // defaults transparent
  });

  it("no full-bleed backdrop is injected into any speaker scene", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    for (const t of [false, undefined]) {
      const { scene } = await generateScene(buildOpts(speakerDraft(t as any)) as any);
      const bg = (scene as any).components.find((c: any) => /mesh-gradient|webgl-backdrop/.test(c.type));
      expect(bg).toBeUndefined();
    }
  });
});

describe("the takeover flag must be AUTHORABLE and DETECTABLE", () => {
  // proj_61516d44: the recipe never fired. Two reasons, both invisible to
  // the tests above -- which hand-built a draft with transparent_background
  // already set, a state the real pipeline could not produce.
  it("the scene tool schema accepts transparent_background", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    const schema = sb.split("SCENE_TOOL_SCHEMA")[1]?.split("name: \"add_beat\"")[0] || sb;
    expect(schema).toMatch(/transparent_background: \{ type: "boolean"/);
    expect(schema).toMatch(/TAKEOVER/);
  });

  it("a companion prop does not demote a takeover", async () => {
    // The storyboard staged quotient-campaign + cursor-performer; the old
    // objects.length === surfaces.length test failed and both takeovers
    // silently became 35% docks.
    const p = await read("../src/llm/pipeline.ts");
    const block = p.split("Speaker-film TAKEOVERS")[1]?.split("Beat quantization")[0] || "";
    expect(block).not.toMatch(/objects\.length === surfaces\.length/);
    expect(block).toMatch(/FURNITURE_RE/);
    expect(block).toMatch(/!hasFurniture/);
  });

  it("the empty-canvas gate is skipped when the camera is the background", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toMatch(/cameraIsBackground = sceneCompositesOverSpeaker/);
  });

  it("the limiter cannot re-normalize the peak back to 0 dBFS", async () => {
    const vg = await read("../src/media/video-gen.ts");
    expect(vg).toMatch(/level=disabled/);
  });
});

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
