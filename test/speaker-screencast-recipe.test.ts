/**
 * Golden regression for the SPEAKER-SCREENCAST recipe -- the "product walkthrough
 * with the presenter's camera as a corner bubble" that took hours to get right by
 * hand. Locks the known-good assembly so it can't silently regress:
 *   - opaque scene (transparent_background:false) => composites OVER the camera as
 *     a full-frame screencast, NOT a transparent overlay
 *   - the real screencast-frame component (frame_style:'none', rounded, inset) --
 *     NOT a hand-rolled browser mock
 *   - the PiP wired to the project speaker track via pip_source:'speaker', resolved
 *     to the actual camera clip at assembly (never a literal "speaker" src, never a
 *     drawn avatar)
 *   - NO camera underlay injected (opaque scenes get the camera from the PiP alone)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assembleScene } from "../src/core/scene-assembler.js";
import { sceneCompositesOverSpeaker } from "../src/core/speaker-mode.js";
import { generateScene } from "../src/llm/scene-generator.js";
import type { BrandKit, Canvas, Scene } from "../src/core/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENCAST_SRC = readFileSync(
  path.join(HERE, "../src/components/media/screencast-frame.component.html"),
  "utf8",
);
const SCREENCAST = { type: "screencast-frame", source: SCREENCAST_SRC };

const brandKit = {
  colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#111", background: "#ffffff", surface: "#eee", text: "#111", text_muted: "#888" },
  fonts: [],
  style: { border_radius: "12px", motion: "minimal" },
} as unknown as BrandKit;

const canvas = { width: 1920, height: 1080, fps: 30, preset: "landscape", background: "#ffffff" } as Canvas;

const CAMERA = "/assets/t/projects/library/assets/camera.mp4";
const SCREEN = "/assets/t/projects/library/assets/screencast2.mp4";

// The recipe exactly as the schema + storyboard prompt now prescribe it.
function recipeScene(): Scene {
  return {
    id: "s_main", label: "Walkthrough", duration_seconds: 12,
    background: "linear-gradient(135deg, #393bf5, #1c82ff)",
    transparent_background: false,
    components: [{
      id: "sc", type: "screencast-frame", z_index: 10,
      data: {
        video_url: SCREEN, frame_style: "none", max_width_pct: 88, corner_radius: 30,
        pip_source: "speaker", pip_shape: "circle", pip_size: 15, pip_position: "bottom-right",
      },
    }],
  } as unknown as Scene;
}

async function build(): Promise<string> {
  return assembleScene({
    scene: recipeScene(), components: [SCREENCAST], brandKit, canvas,
    gsapDir: "/nonexistent-gsap", preview: true, speakerUrl: CAMERA,
  } as any);
}

describe("speaker-screencast recipe assembles to the known-good composite", () => {
  it("is an OPAQUE composite (full-frame screencast over the camera, not a transparent overlay)", () => {
    expect(sceneCompositesOverSpeaker(recipeScene(), true)).toBe(false);
  });

  it("wires the PiP to the real camera clip (pip_source:'speaker' resolved, no literal token left)", async () => {
    const html = await build();
    expect(html).toContain("camera.mp4");
    // the raw renderer token must be resolved away, not shipped to the browser
    expect(html).not.toMatch(/src=["']speaker["']/);
  });

  it("does NOT inject the camera underlay on the opaque scene (no corner bleed)", async () => {
    const html = await build();
    expect(html).not.toContain("__mp_speaker_base");
  });

  it("carries the rounded + inset recipe values through to the component", async () => {
    const html = await build();
    expect(html).toContain("screencast2.mp4");
    // recipe data reaches the component runtime (data-driven, so present in the doc)
    expect(html).toMatch(/corner_radius/);
    expect(html).toMatch(/max_width_pct/);
  });
});

describe("st-speaker-screencast template instantiates the recipe (no codegen)", () => {
  async function instantiate(slots: Record<string, unknown>) {
    const draft = {
      label: "Walkthrough", duration_seconds: 12,
      scene_template: { type: "st-speaker-screencast", data: slots },
    };
    const res = await generateScene({
      scene: draft as any, sceneIndex: 0, totalScenes: 1, prompt: "demo",
      format: "video", llmConfig: {} as any, brandKit, canvas,
      tenantId: "t", projectId: "p", hasSpeakerTrack: true,
    } as any);
    return res.scene as any;
  }

  it("stamps an OPAQUE scene with a frameless, rounded, inset screencast-frame + circular speaker PiP", async () => {
    const scene = await instantiate({ source: SCREEN });
    expect(scene.transparent_background).toBe(false);
    const sc = scene.components.find((c: any) => c.type === "screencast-frame");
    expect(sc).toBeTruthy();
    expect(sc.data.frame_style).toBe("none");
    expect(sc.data.corner_radius).toBe(30);
    expect(sc.data.max_width_pct).toBe(88);
    expect(sc.data.pip_source).toBe("speaker");
    expect(sc.data.pip_shape).toBe("circle");
    expect(sc.data.pip_size).toBe(15);
    // and the shell is present as the background layer
    expect(scene.components.some((c: any) => c.type === "st-speaker-screencast")).toBe(true);
  });

  it("honors slot overrides and hides the PiP when pip_source:'none'", async () => {
    const scene = await instantiate({ source: SCREEN, pip_source: "none", corner_radius: 12, pip_size: 20 });
    const sc = scene.components.find((c: any) => c.type === "screencast-frame");
    expect(sc.data.pip_source).toBeUndefined();
    expect(sc.data.corner_radius).toBe(12);
    expect(sc.data.pip_size).toBe(20);
  });
});
