import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { assembleComposite } from "../src/core/composite-assembler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const gsapDir = path.resolve(here, "../vendor/gsap");
const scene = (moves: boolean): any => ({
  id: "s1", label: "beat", duration_seconds: 6, transparent_background: true,
  components: [],
  ...(moves ? { camera_moves: [{ at: 1, type: "zoom", x: 51, y: 44, scale: 1.3, duration: 0.6 }, { at: 4, type: "reset", duration: 0.4 }] } : {}),
});
const base = { components: [], brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1080, height: 1920 } as any, gsapDir };

describe("the camera rides the rig when a scene has camera moves (Marc: 'I should be able to zoom in on myself')", () => {
  it("preview: the camera is a <video> INSIDE .mp-camera, not the fixed underlay", async () => {
    const html = await assembleScene({ ...base, scene: scene(true), preview: true, speakerUrl: "/assets/t/take.mp4", speakerOffset: 1.63 } as any);
    const rig = html.indexOf('class="mp-camera"');
    const cam = html.indexOf('id="__mp_speaker_rig"');
    expect(cam).toBeGreaterThan(rig);
    expect(html).toMatch(/__mp_speaker_rig" src="\/assets\/t\/take\.mp4"[^>]*data-start-at="1\.63"/);
    expect(html).not.toMatch(/id="__mp_speaker_base"/);
  });
  it("render: the same in-rig video carries data-start-at so the capture swaps stills per frame", async () => {
    const html = await assembleScene({ ...base, scene: scene(true), preview: false, speakerUrl: "file:///tmp/speaker_base.mp4", speakerOffset: 10.87 } as any);
    expect(html).toMatch(/__mp_speaker_rig" src="file:\/\/\/tmp\/speaker_base\.mp4"[^>]*data-start-at="10\.87"/);
  });
  it("without moves nothing changes: the preview keeps its fixed underlay, the render carries no camera", async () => {
    const prev = await assembleScene({ ...base, scene: scene(false), preview: true, speakerUrl: "/assets/t/take.mp4", speakerOffset: 0 } as any);
    expect(prev).toMatch(/id="__mp_speaker_base"/);
    expect(prev).not.toMatch(/__mp_speaker_rig/);
    const rend = await assembleScene({ ...base, scene: scene(false), preview: false, speakerUrl: "file:///tmp/speaker_base.mp4", speakerOffset: 0 } as any);
    expect(rend).not.toMatch(/__mp_speaker_rig|__mp_speaker_base/);
  });
  it("composite (Studio): a scene with moves gets its own take inside its wrapper, from the per-scene refs", async () => {
    const html = await assembleComposite({
      scenes: [{ scene: scene(true), components: [] }, { scene: { ...scene(false), id: "s2" }, components: [] }],
      brandKit: base.brandKit, canvas: base.canvas, gsapDir,
      speakerUrl: "/assets/t/take1.mp4",
      speakerRefs: { s1: { url: "/assets/t/take1.mp4", offset: 0.11 }, s2: { url: "/assets/t/take2.mp4", offset: 1.63 } },
    } as any);
    expect(html.match(/__mp_speaker_rig/g)?.length).toBe(1);
    expect(html).toMatch(/data-scene-id="s1"[^>]*>\s*<video id="__mp_speaker_rig" src="\/assets\/t\/take1\.mp4"[^>]*data-start-at="0\.11"/);
  });
});
