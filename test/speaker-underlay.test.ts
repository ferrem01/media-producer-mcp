/**
 * Regression: the PREVIEW-only camera underlay (#__mp_speaker_base) must be
 * injected ONLY for speaker scenes that composite OVER the camera (transparent
 * -- full-frame / half-frame). An OPAQUE scene (screencast + PiP) must NOT get
 * the underlay: a z-index:-10 fixed video paints over the body background, so on
 * an opaque scene the camera would bleed through the gutters/corners (the black
 * corner bug). The camera in that mode comes from the PiP alone.
 */

import { describe, it, expect } from "vitest";
import { assembleScene } from "../src/core/scene-assembler.js";
import type { BrandKit, Canvas, Scene } from "../src/core/types.js";

const MINI = {
  type: "mini-box",
  source:
    `<template><div class="mini">hi</div></template>` +
    `<style scoped>.mini{color:red}</style>` +
    `<script>function createTimeline(el, data, ctx){ return null; }</script>`,
};

const brandKit = {
  colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#111", background: "#ffffff", surface: "#eee", text: "#111", text_muted: "#888" },
  fonts: [],
  style: { border_radius: "12px", motion: "minimal" },
} as unknown as BrandKit;

const canvas = { width: 1920, height: 1080, fps: 30, preset: "landscape", background: "#ffffff" } as Canvas;

function scene(transparent: boolean | undefined): Scene {
  return {
    id: "s", label: "s", duration_seconds: 5, background: "#ffffff",
    transparent_background: transparent,
    components: [{ id: "c", type: "mini-box", data: {}, z_index: 10 }],
  } as Scene;
}

const SPEAKER = "/assets/t/projects/library/assets/camera.mp4";

async function build(transparent: boolean | undefined): Promise<string> {
  return assembleScene({
    scene: scene(transparent), components: [MINI], brandKit, canvas,
    gsapDir: "/nonexistent-gsap", preview: true, speakerUrl: SPEAKER,
  } as any);
}

describe("preview speaker underlay is gated on transparency", () => {
  it("TRANSPARENT speaker scene (full/half-frame) DOES get the camera underlay", async () => {
    const html = await build(true);
    expect(html).toContain("__mp_speaker_base");
  });

  it("OPAQUE speaker scene (screencast + PiP) does NOT get the underlay (no camera bleed)", async () => {
    const html = await build(false);
    expect(html).not.toContain("__mp_speaker_base");
  });

  it("underlay is preview-only: never injected when preview is false", async () => {
    const html = await assembleScene({
      scene: scene(true), components: [MINI], brandKit, canvas,
      gsapDir: "/nonexistent-gsap", preview: false, speakerUrl: SPEAKER,
    } as any);
    expect(html).not.toContain("__mp_speaker_base");
  });
});
