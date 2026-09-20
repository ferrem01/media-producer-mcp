import { describe, it, expect } from "vitest";
import fsp from "node:fs/promises";
import fs from "node:fs";
import { SPEAKER_ALPHA_SRC, groundOf, castSpeakerLayer, speakerLayerOf, bindSpeakerLayerData, sceneCarriesSpeakerLayer } from "../src/core/speaker-layer.js";
import { sceneCompositesOverSpeaker } from "../src/core/speaker-mode.js";
import { speakerClipForScene } from "../src/core/speaker-track.js";
import { matteAlphaGraph, alphaCopyName, isAlphaVideoSrc, ALPHA_ENCODE_ARGS } from "../src/core/take-matte.js";

// THE TAKE AS A LAYER (Marc, 2026-09-20): a speaker scene with a ground
// under the person carries the take INSIDE the scene -- a video component
// on the "speaker-alpha" token, cast over the ground and under the
// graphics -- and renders opaque; the token resolves to the take's alpha
// copy (the person on a transparent frame), so whatever lies under the
// speaker becomes the room behind them.
const full = { x: 0, y: 0, width: "100%", height: "100%" };
const ground = (over: Record<string, any> = {}) => ({ id: "bg", type: "video", z_index: 30, position: full, data: { src: "/assets/t/projects/p/assets/broll.mp4", ...over } });
const lower = () => ({ id: "lt", type: "lower-third", z_index: 10, position: { x: "54%", y: "12%", width: "46%", height: "80%" }, data: { name: "Marc" } });

describe("the ground under the person", () => {
  it("is a full-stage clip or still that holds the whole beat", () => {
    expect(groundOf({ duration_seconds: 8, components: [ground(), lower()] })?.id).toBe("bg");
    expect(groundOf({ duration_seconds: 8, components: [{ ...ground(), type: "image" }] })?.id).toBe("bg");
    expect(groundOf({ duration_seconds: 8, components: [ground({ at: 0, exit_at: 8 })] })?.id).toBe("bg");
  });
  it("is not a cutaway (a clip cut in mid-beat), a panel, a speaker reference, or a component that opts out", () => {
    expect(groundOf({ duration_seconds: 8, components: [ground({ at: 2.4, exit_at: 6 })] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [ground({ exit_at: 5 })] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [{ ...ground(), enter: { effect: "cut", at: 3 } }] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [{ ...ground(), position: { x: "54%", y: "12%", width: "46%", height: "80%" } }] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [ground({ src: "speaker" })] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [ground({ ground: false })] })).toBeUndefined();
    expect(groundOf({ duration_seconds: 8, components: [lower()] })).toBeUndefined();
  });
});

describe("casting the take as a layer", () => {
  it("puts the layer right over the ground, under everything else, once", () => {
    const scene: any = { duration_seconds: 8, components: [lower(), ground(), { id: "cap", type: "reel-caption-lane", z_index: 2, position: full, data: {} }] };
    expect(castSpeakerLayer(scene)).toBe(true);
    expect(scene.components.map((c: any) => c.id)).toEqual(["lt", "bg", "speaker", "cap"]);
    const layer = speakerLayerOf(scene)!;
    expect(layer.type).toBe("video");
    expect(layer.data!.src).toBe(SPEAKER_ALPHA_SRC);
    expect(layer.data!.speaker_layer).toBe(true);
    expect(layer.position).toEqual(full);
    expect(scene.components[1].z_index).toBe(1);
    expect(layer.z_index).toBe(2);
    expect(scene.components[0].z_index).toBe(10);
    expect(scene.components[3].z_index).toBe(5); // stood at 2: raised above the layer
    expect(castSpeakerLayer(scene)).toBe(false);
    expect(scene.components.filter((c: any) => c.id === "speaker")).toHaveLength(1);
    expect(sceneCarriesSpeakerLayer(scene)).toBe(true);
  });
  it("casts nothing without a ground", () => {
    const scene: any = { duration_seconds: 8, components: [lower()] };
    expect(castSpeakerLayer(scene)).toBe(false);
    expect(scene.components).toHaveLength(1);
    expect(castSpeakerLayer(null)).toBe(false);
  });
  it("a scene carrying the layer renders OPAQUE over the camera base (the base under it would double the person)", () => {
    const scene: any = { duration_seconds: 8, components: [ground(), lower()] };
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(true);
    castSpeakerLayer(scene);
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(false);
    // ...and still after the render resolved the token to a file (the marker survives the binding).
    const layer = speakerLayerOf(scene)!;
    layer.data = bindSpeakerLayerData(layer.data!, { alphaUrl: "file:///t/take-alpha.webm", offset: 0 })!;
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(false);
    expect(scene.transparent_background).toBeUndefined(); // the board's flag is untouched: the take need stays
  });
});

describe("binding the layer at assembly", () => {
  it("the token becomes the alpha copy at the take's trim", () => {
    expect(bindSpeakerLayerData({ src: SPEAKER_ALPHA_SRC, object_fit: "cover" }, { alphaUrl: "/assets/t/take-alpha.webm", url: "/assets/t/take.mp4", offset: 0.78 }))
      .toEqual({ src: "/assets/t/take-alpha.webm", object_fit: "cover", start_at: 0.78, speaker_layer: true, alpha: true });
    // The wrap paints nothing under an alpha clip (its black box buried the ground, measured here).
    expect(fs.readFileSync("src/components/media/video.component.html", "utf8")).toMatch(/if \(data\.alpha\) container\.style\.background = 'transparent';/);
  });
  it("falls back to the plain take while no alpha copy exists, and drops the layer with no take at all", () => {
    expect(bindSpeakerLayerData({ src: SPEAKER_ALPHA_SRC }, { url: "/assets/t/take.mp4", offset: 0 }))
      .toEqual({ src: "/assets/t/take.mp4", start_at: 0, speaker_layer: true, speaker_opaque: true });
    expect(bindSpeakerLayerData({ src: SPEAKER_ALPHA_SRC }, undefined)).toBeNull();
    expect(bindSpeakerLayerData({ src: SPEAKER_ALPHA_SRC }, { alphaUrl: undefined, url: undefined })).toBeNull();
  });
  it("leaves every other component's data alone", () => {
    const d = { src: "/assets/t/broll.mp4" };
    expect(bindSpeakerLayerData(d, { url: "/assets/t/take.mp4" })).toBe(d);
  });
  it("the scene's clip lookup carries the alpha copy", () => {
    const scenes = [{ duration_seconds: 5 }, { duration_seconds: 5 }];
    const clips = [{ source: "/a/t0.mp4", scene_index: 0, trim_start: 0.2, alpha: "/a/t0-alpha.webm" }, { source: "/a/t1.mp4", scene_index: 1 }];
    expect(speakerClipForScene(clips, scenes, 0)).toEqual({ source: "/a/t0.mp4", offset: 0.2, alpha: "/a/t0-alpha.webm" });
    expect(speakerClipForScene(clips, scenes, 1)).toEqual({ source: "/a/t1.mp4", offset: 0 });
  });
});

describe("the alpha copy", () => {
  it("is named beside the take and recognised by its suffix", () => {
    expect(alphaCopyName("/data/t/take-2026.mp4")).toBe("/data/t/take-2026-alpha.webm");
    expect(alphaCopyName("/data/t/take.webm")).toBe("/data/t/take-alpha.webm");
    expect(isAlphaVideoSrc("/assets/t/take-alpha.webm")).toBe(true);
    expect(isAlphaVideoSrc("/assets/t/take-alpha.webm?v=3")).toBe(true);
    expect(isAlphaVideoSrc("/assets/t/take-blur.mp4")).toBe(false);
  });
  it("the graph: the frame at the matte's rate under the upscaled alpha, the edge eroded a pixel and softened, out as yuva420p", () => {
    const g = matteAlphaGraph(1080, 1920, 30);
    expect(g).toContain("[1:v]scale=1080:1920:flags=bicubic,format=gray,erosion,gblur=sigma=1.2[m]");
    expect(g).toContain("[0:v]fps=30,format=rgba[fgc]");
    expect(g).toContain("[fgc][m]alphamerge,format=yuva420p[out]");
  });
  it("is VP9 with alpha in WebM (what Chromium plays), no alt-ref frames, muted", () => {
    expect(ALPHA_ENCODE_ARGS).toEqual(expect.arrayContaining(["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-an"]));
  });
  it("the render workers keep its alpha: WebM frames come out as WebP through the libvpx decoder", async () => {
    for (const f of ["src/core/scene-worker.ts", "src/core/capture-worker.ts"]) {
      const src = await fsp.readFile(f, "utf8");
      expect(src).toMatch(/\.\.\.\(alpha \? \["-c:v", "libvpx-vp9"\] : \[\]\),/);
      expect(src).toMatch(/\$\{alpha \? ",format=rgba" : ""\}/);
      expect(src).toMatch(/\["-c:v", "libwebp", "-lossless", "0", "-q:v", "88", "-compression_level", "1"\]/);
      expect(src).toMatch(/\|\$\{ext\}`\)\.digest/); // the cache key carries the format
    }
    const sw = await fsp.readFile("src/core/scene-worker.ts", "utf8");
    expect(sw).toMatch(/data:image\/\$\{extracted\.ext === "webp" \? "webp" : "jpeg"\};base64,/);
    // The single-frame capture (thumbnails, critique stills) too: a PNG through libvpx as RGBA.
    const cap = await fsp.readFile("src/core/capture.ts", "utf8");
    expect(cap).toMatch(/const alpha = \/\\\.webm\(\\\?\|#\|\$\)\/i\.test\(videoPath\);\s*await execFileAsync\("ffmpeg", \[\s*"-ss", String\(time\),\s*\.\.\.\(alpha \? \["-c:v", "libvpx-vp9"\] : \[\]\),/);
    expect(cap).toMatch(/\.\.\.\(alpha \? \["-pix_fmt", "rgba"\] : \[\]\),/);
  });
  it("the render resolves the token to this scene's alpha copy at its trim; the take route casts the layer and asks for the copy; Studio treats the copy as the speaker", async () => {
    const render = await fsp.readFile("src/core/render.ts", "utf8");
    expect(render).toMatch(/if \(isSpeakerLayer\(comp as any\) && \(comp\.data as any\)\.src === SPEAKER_ALPHA_SRC\) \{/);
    expect(render).toMatch(/alphaUrl: layerRef\.alpha \? asFile\(layerRef\.alpha\) : undefined, url: asFile\(layerRef\.source\), offset: layerRef\.offset/);
    const index = await fsp.readFile("src/index.ts", "utf8");
    expect(index).toMatch(/if \(built && castSpeakerLayer\(built\)\)/);
    expect(index).toMatch(/if \(sceneCarriesSpeakerLayer\(built\)\) tkWantAlpha = true;/);
    expect(index).toMatch(/if \(tkWantBlur \|\| tkWantAlpha\) \{\s*queueTakeMatte\(\{/);
    expect(index).toMatch(/blur: tkWantBlur, alpha: tkWantAlpha,/);
    expect(index).toMatch(/speakerAlphaUrl: spRef\?\.alpha \? speakerUrlFromSource\(spRef\.alpha\) : undefined,/);
    const studio = await fsp.readFile("src/preview-app/preview-app.ts", "utf8");
    expect(studio).toMatch(/var alp = clips\[i\]\.alpha \? speakerClipUrlOf\(clips\[i\]\.alpha\) : null;/);
    const video = await fsp.readFile("src/components/media/video.component.html", "utf8");
    expect(video).toMatch(/var startAt = Number\(data\.start_at\);/);
    const pipeline = await fsp.readFile("src/llm/pipeline.ts", "utf8");
    expect(pipeline).toMatch(/for \(const sc of project\.scenes\) if \(castSpeakerLayer\(sc as any\)\) layered\+\+;/);
  });
});
