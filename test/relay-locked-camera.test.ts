import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";

// THE LOCKED CAMERA (SPEC-relay.md v2): the continuous take joins scenes on
// identical frames, and every assembled scene used to drift (scale 1.03 plus
// a few px of Ken Burns) over an ambient dot layer -- the end of one scene
// never matched the start of the next, and the dots are the "particles" the
// develop. prompt bans. A locked scene has neither; camera_moves still play.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = (extra: Record<string, unknown>) => assembleScene({
  scene: { id: "s", label: "s", duration_seconds: 2, background: "#efeeea", components: [], ...extra } as any,
  components: [], brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1080, height: 1080 } as any,
  gsapDir: path.resolve(__dirname, "../vendor/gsap"),
} as any);

describe("locked camera", () => {
  it("drops the ambient drift and dot layer only when asked", async () => {
    const free = await build({});
    expect(free).toContain('<div class="mp-ambient"></div>');
    expect(free).toContain("var cameraEl = document.querySelector('.mp-camera');");
    const locked = await build({ locked_camera: true });
    expect(locked).not.toContain('<div class="mp-ambient"></div>');
    expect(locked).toContain("var cameraEl = null;");
  });

  it("is settable on the tools and stamped on every relay scene by the build", async () => {
    const sv = await fs.readFile(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    expect(sv).toMatch(/locked_camera: z\.boolean\(\)\.optional\(\)/);
    expect(sv).toContain("(scene as any).locked_camera = params.locked_camera || undefined");
    const pl = await fs.readFile(path.resolve(__dirname, "../src/llm/pipeline.ts"), "latin1");
    expect(pl).toMatch(/sc\.locked_camera = true;/);
  });
});
