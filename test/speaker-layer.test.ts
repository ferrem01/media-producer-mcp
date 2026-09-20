import { describe, it, expect } from "vitest";
import fsp from "node:fs/promises";
import fs from "node:fs";
import { SPEAKER_SRC, SPEAKER_ALPHA_SRC, groundOf, castSpeakerLayer, setSpeakerBackground, speakerLayerOf, speakerLayersOf, isSpeakerLayer, sceneSpeakerBackground, speakerRendersInside, speakerUsesBase, bindSpeakerLayerData, takeCopies, takeOwns, syncSpeakerClips, missingSpeakerCopies, asSpeakerBackground } from "../src/core/speaker-layer.js";
import { sceneCompositesOverSpeaker } from "../src/core/speaker-mode.js";
import { speakerClipForScene } from "../src/core/speaker-track.js";
import { activeTake } from "../src/core/take-needs.js";
import { matteAlphaGraph, alphaCopyName, isAlphaVideoSrc, ALPHA_ENCODE_ARGS } from "../src/core/take-matte.js";

// THE SPEAKER IS A COMPONENT (Marc, 2026-09-20): every speaker scene
// carries one video component on the "speaker" token with a background
// setting -- room (the raw take as the base), blur (the blurred copy as
// the base), alpha (the person cut out, played INSIDE the scene over
// whatever lies under the component). The copies are made once per take
// by the matte, on request; the raw take is always kept.
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

describe("casting the speaker component", () => {
  it("over a ground: right above it, under everything else, background alpha, once", () => {
    const scene: any = { duration_seconds: 8, components: [lower(), ground(), { id: "cap", type: "reel-caption-lane", z_index: 2, position: full, data: {} }] };
    expect(castSpeakerLayer(scene)).toBe(true);
    expect(scene.components.map((c: any) => c.id)).toEqual(["lt", "bg", "speaker", "cap"]);
    const layer = speakerLayerOf(scene)!;
    expect(layer.type).toBe("video");
    expect(layer.data).toEqual({ src: SPEAKER_SRC, object_fit: "cover", background: "alpha" });
    expect(layer.position).toEqual(full);
    expect(scene.components[1].z_index).toBe(1);
    expect(layer.z_index).toBe(2);
    expect(scene.components[0].z_index).toBe(10);
    expect(scene.components[3].z_index).toBe(5); // stood at 2: raised above the speaker
    expect(castSpeakerLayer(scene)).toBe(false);
    expect(scene.components.filter((c: any) => c.id === "speaker")).toHaveLength(1);
    expect(sceneSpeakerBackground(scene)).toBe("alpha");
  });
  it("with no ground: at the bottom of the stack, background room (the camera stays the base)", () => {
    const scene: any = { duration_seconds: 8, components: [lower()] };
    expect(castSpeakerLayer(scene)).toBe(true);
    expect(scene.components.map((c: any) => c.id)).toEqual(["speaker", "lt"]);
    expect(speakerLayerOf(scene)!.z_index).toBe(1);
    expect(sceneSpeakerBackground(scene)).toBe("room");
    expect(castSpeakerLayer(null)).toBe(false);
    expect(castSpeakerLayer({ duration_seconds: 8 })).toBe(false);
  });
  it("the setting is written on the component; a scene without one reads as room; the older alpha token reads as alpha", () => {
    const scene: any = { duration_seconds: 8, components: [lower()] };
    expect(setSpeakerBackground(scene, "blur")!.data!.background).toBe("blur");
    expect(sceneSpeakerBackground(scene)).toBe("blur");
    setSpeakerBackground(scene, "alpha");
    expect(sceneSpeakerBackground(scene)).toBe("alpha");
    expect(scene.components.filter((c: any) => c.id === "speaker")).toHaveLength(1);
    expect(sceneSpeakerBackground({ components: [lower()] })).toBe("room");
    const older: any = { duration_seconds: 8, components: [{ id: "speaker", type: "video", position: full, data: { src: SPEAKER_ALPHA_SRC } }] };
    expect(sceneSpeakerBackground(older)).toBe("alpha");
    setSpeakerBackground(older, "room");
    expect(older.components[0].data).toEqual({ src: SPEAKER_SRC, background: "room" });
    // The first cut's marker still reads as the speaker, and is dropped on the next write.
    const marked: any = { duration_seconds: 8, components: [{ id: "speaker", type: "video", position: full, data: { src: SPEAKER_SRC, speaker_layer: true, background: "blur" } }] };
    expect(isSpeakerLayer(marked.components[0])).toBe(true);
    setSpeakerBackground(marked, "alpha");
    expect(marked.components[0].data).toEqual({ src: SPEAKER_SRC, background: "alpha" });
    // Only a VIDEO on the token is the person: a screencast frame's pip_source keeps its own path.
    expect(isSpeakerLayer({ type: "screencast-frame", data: { pip_source: "speaker" } })).toBe(false);
    expect(isSpeakerLayer({ type: "video", data: { src: "/assets/t/broll.mp4" } })).toBe(false);
    expect(isSpeakerLayer({ type: "video", data: { src: SPEAKER_SRC } })).toBe(true);
    expect(asSpeakerBackground("none")).toBe("room");
    expect(asSpeakerBackground("blur")).toBe("blur");
    expect(asSpeakerBackground("x")).toBeNull();
  });
  it("the base is an optimisation: one full-frame speaker on room or blur with nothing under it; anything else draws inside", () => {
    const bare: any = { duration_seconds: 8, components: [lower()] };
    castSpeakerLayer(bare);
    expect(speakerUsesBase(bare)).toBe(true);
    expect(speakerRendersInside(bare)).toBe(false);
    // a corner bubble
    const corner: any = { duration_seconds: 8, components: [{ id: "spk", type: "video", z_index: 20, position: { x: "76%", y: "60%", width: "20%", height: "35.6%" }, data: { src: SPEAKER_SRC, background: "room", shape: "circle" } }, lower()] };
    expect(speakerUsesBase(corner)).toBe(false);
    expect(speakerRendersInside(corner)).toBe(true);
    // a circle, even full-frame
    const circle: any = { duration_seconds: 8, components: [{ id: "spk", type: "video", z_index: 1, position: full, data: { src: SPEAKER_SRC, shape: "circle" } }] };
    expect(speakerUsesBase(circle)).toBe(false);
    // something under it in the stack
    const under: any = { duration_seconds: 8, components: [{ id: "bg", type: "mesh-gradient", z_index: 0, position: full, data: {} }, { id: "spk", type: "video", z_index: 1, position: full, data: { src: SPEAKER_SRC } }] };
    expect(speakerUsesBase(under)).toBe(false);
    // two of them
    const two: any = { duration_seconds: 8, components: [{ id: "a", type: "video", z_index: 1, position: full, data: { src: SPEAKER_SRC } }, { id: "b", type: "video", z_index: 2, position: { x: "76%", y: "60%", width: "20%", height: "35.6%" }, data: { src: SPEAKER_SRC } }] };
    expect(speakerLayersOf(two)).toHaveLength(2);
    expect(speakerUsesBase(two)).toBe(false);
    expect(speakerUsesBase({ duration_seconds: 8, components: [lower()] })).toBe(false);
    expect(speakerRendersInside({ duration_seconds: 8, components: [lower()] })).toBe(false);
  });
  it("only an alpha scene plays the person INSIDE it and renders opaque over the camera base", () => {
    const scene: any = { duration_seconds: 8, components: [ground(), lower()] };
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(true);
    castSpeakerLayer(scene);
    expect(speakerRendersInside(scene)).toBe(true);
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(false);
    // Blur over a ground still plays inside (what is stacked is what shows: the base would be buried under the ground).
    setSpeakerBackground(scene, "blur");
    expect(speakerRendersInside(scene)).toBe(true);
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(false);
    const bare: any = { duration_seconds: 8, components: [lower()] };
    setSpeakerBackground(bare, "blur");
    expect(speakerRendersInside(bare)).toBe(false);
    expect(sceneCompositesOverSpeaker(bare, true)).toBe(true);
    expect(scene.transparent_background).toBeUndefined(); // the board's flag is untouched: the take need stays
    // The rule is read BEFORE assembly binds the token (the render no longer rewrites the data);
    // once bound, the component is a plain video and the rule no longer sees a speaker.
    setSpeakerBackground(scene, "alpha");
    const layer = speakerLayerOf(scene)!;
    expect(sceneCompositesOverSpeaker(scene, true)).toBe(false);
    layer.data = bindSpeakerLayerData(layer.data!, { alphaUrl: "file:///t/take-alpha.webm", offset: 0 })!;
    expect(speakerLayersOf(scene)).toHaveLength(0);
  });
});

describe("binding the component at assembly (alpha)", () => {
  const spk = { src: SPEAKER_SRC, object_fit: "cover", background: "alpha" };
  it("the token becomes the alpha copy at the take's trim (the clip's own, when the base runs on the film clock)", () => {
    expect(bindSpeakerLayerData(spk, { alphaUrl: "/assets/t/take-alpha.webm", url: "/assets/t/take.mp4", offset: 0.78 }))
      .toEqual({ src: "/assets/t/take-alpha.webm", object_fit: "cover", start_at: 0.78, background: "alpha", alpha: true });
    expect(bindSpeakerLayerData(spk, { alphaUrl: "file:///t/take-alpha.webm", alphaOffset: 0.2, url: "file:///t/base.mp4", offset: 12.5 }))
      .toMatchObject({ src: "file:///t/take-alpha.webm", start_at: 0.2 });
    expect(bindSpeakerLayerData({ ...spk, speaker_layer: true }, { alphaUrl: "/a.webm", offset: 0 })).not.toHaveProperty("speaker_layer");
    // The wrap paints nothing under an alpha clip (its black box buried the ground, measured here).
    expect(fs.readFileSync("src/components/media/video.component.html", "utf8")).toMatch(/if \(data\.alpha\) container\.style\.background = 'transparent';/);
  });
  it("falls back to the plain take while no alpha copy exists, and drops the component with no take at all", () => {
    expect(bindSpeakerLayerData(spk, { url: "/assets/t/take.mp4", offset: 0 }))
      .toEqual({ src: "/assets/t/take.mp4", object_fit: "cover", start_at: 0, background: "alpha", speaker_opaque: true });
    // Room or blur drawn inside (a ground, a corner): the clip the base plays, at the base's clock, never the alpha copy.
    expect(bindSpeakerLayerData({ ...spk, background: "blur" }, { alphaUrl: "/assets/t/take-alpha.webm", alphaOffset: 0.2, url: "/assets/t/take-blur.mp4", offset: 12.5 }))
      .toEqual({ src: "/assets/t/take-blur.mp4", object_fit: "cover", start_at: 12.5, background: "blur" });
    expect(bindSpeakerLayerData(spk, undefined)).toBeNull();
    expect(bindSpeakerLayerData({ src: SPEAKER_ALPHA_SRC }, { alphaUrl: undefined, url: undefined })).toBeNull();
  });
  it("leaves every other component's data alone, and a speaker component already bound to a file", () => {
    const d = { src: "/assets/t/broll.mp4" };
    expect(bindSpeakerLayerData(d, { url: "/assets/t/take.mp4" })).toBe(d);
    // The render binds before the worker assembles; binding twice swapped the alpha copy for the opaque base.
    const bound = { src: "file:///t/take-alpha.webm", background: "alpha", alpha: true, start_at: 0 };
    expect(bindSpeakerLayerData(bound, { url: "file:///t/base.mp4", offset: 3 })).toBe(bound);
  });
  it("the assemblers draw the component only when the scene plays it inside; the render leaves the token to the worker and hands it the alpha copy", async () => {
    for (const f of ["src/core/scene-assembler.ts", "src/core/composite-assembler.ts"]) {
      const src = await fsp.readFile(f, "utf8");
      expect(src).toMatch(/if \(isSpeakerLayer\(comp\) && !speakerRendersInside\(scene\)\) continue;/);
    }
    expect(await fsp.readFile("src/core/scene-assembler.ts", "utf8")).toMatch(/alphaUrl: options\.speakerAlphaUrl, alphaOffset: options\.speakerAlphaOffset, url: speakerUrl, offset: options\.speakerOffset/);
    const render = await fsp.readFile("src/core/render.ts", "utf8");
    expect(render).toMatch(/for \(const comp of scene\.components\) \{\s*if \(isSpeakerLayer\(comp as any\)\) continue;/);
    expect(render).toMatch(/speakerAlphaUrl: `file:\/\/\$\{path\.resolve\(resolveVideoPath\(ownRef\.alpha\)\)\}`, speakerAlphaOffset: ownRef\.offset/);
    const worker = await fsp.readFile("src/core/scene-worker.ts", "utf8");
    expect(worker).toMatch(/speakerAlphaUrl: args\.speakerAlphaUrl,\s*speakerAlphaOffset: args\.speakerAlphaOffset,/);
    const video = await fsp.readFile("src/components/media/video.component.html", "utf8");
    expect(video).toMatch(/if \(data\.shape === 'circle'\) \{ container\.style\.borderRadius = '50%'; container\.style\.overflow = 'hidden'; \}/);
  });
  it("the scene's clip lookup carries the alpha copy", () => {
    const scenes = [{ duration_seconds: 5 }, { duration_seconds: 5 }];
    const clips = [{ source: "/a/t0.mp4", scene_index: 0, trim_start: 0.2, alpha: "/a/t0-alpha.webm" }, { source: "/a/t1.mp4", scene_index: 1 }];
    expect(speakerClipForScene(clips, scenes, 0)).toEqual({ source: "/a/t0.mp4", offset: 0.2, alpha: "/a/t0-alpha.webm" });
    expect(speakerClipForScene(clips, scenes, 1)).toEqual({ source: "/a/t1.mp4", offset: 0 });
  });
});

describe("the take's copies and the speaker track", () => {
  const raw = "/assets/t/projects/p/assets/take.mp4", blur = "/assets/t/projects/p/assets/take-blur.mp4", alpha = "/assets/t/projects/p/assets/take-alpha.webm";
  it("reads the raw take and its copies, in the new shape and the older one (the blurred copy AS the source)", () => {
    expect(takeCopies({ source: raw })).toEqual({ raw });
    expect(takeCopies({ source: raw, blur, alpha })).toEqual({ raw, blur, alpha });
    expect(takeCopies({ source: blur, background: { mode: "blur", source_raw: raw } })).toEqual({ raw, blur });
    expect(takeOwns({ source: raw, blur }, blur)).toBe(true);
    expect(takeOwns({ source: raw }, blur)).toBe(false);
  });
  it("points each clip at the copy its scene's setting wants; a missing copy leaves the raw take", () => {
    const project: any = {
      scenes: [{ duration_seconds: 5, components: [] }, { duration_seconds: 5, components: [] }, { duration_seconds: 5, components: [] }],
      takes: [{ id: "take_0", scene_index: 0, source: raw, blur, alpha }, { id: "take_1", scene_index: 1, source: "/a/t1.mp4" }, { id: "take_2", scene_index: 2, source: "/a/t2.mp4", alpha: "/a/t2-alpha.webm" }],
      speaker_track: { clips: [{ source: raw, scene_index: 0 }, { source: "/a/t1.mp4", scene_index: 1 }, { source: "/a/t2.mp4", scene_index: 2, alpha: "/a/t2-alpha.webm" }] },
    };
    setSpeakerBackground(project.scenes[0], "blur");
    setSpeakerBackground(project.scenes[1], "blur");
    setSpeakerBackground(project.scenes[2], "room");
    expect(syncSpeakerClips(project)).toBe(2);
    expect(project.speaker_track.clips[0]).toEqual({ source: blur, scene_index: 0, alpha });
    expect(project.speaker_track.clips[1]).toEqual({ source: "/a/t1.mp4", scene_index: 1 }); // no blurred copy yet: the raw take
    expect(project.speaker_track.clips[2]).toEqual({ source: "/a/t2.mp4", scene_index: 2, alpha: "/a/t2-alpha.webm" });
    // The take behind a clip is found through any of its files.
    expect(activeTake(project, 0)?.id).toBe("take_0");
    setSpeakerBackground(project.scenes[0], "room");
    expect(syncSpeakerClips(project)).toBe(1);
    expect(project.speaker_track.clips[0].source).toBe(raw);
    expect(syncSpeakerClips(project)).toBe(0);
  });
  it("knows which copies the matte still has to make for the scenes a take covers", () => {
    const project: any = {
      scenes: [{ duration_seconds: 5, components: [] }],
      takes: [{ id: "take_0", scene_index: 0, source: raw }],
      speaker_track: { clips: [{ source: raw, scene_index: 0 }] },
    };
    expect(missingSpeakerCopies(project, project.takes[0])).toEqual({ blur: false, alpha: false });
    setSpeakerBackground(project.scenes[0], "alpha");
    expect(missingSpeakerCopies(project, project.takes[0])).toEqual({ blur: false, alpha: true });
    project.takes[0].alpha = alpha;
    expect(missingSpeakerCopies(project, project.takes[0])).toEqual({ blur: false, alpha: false });
    setSpeakerBackground(project.scenes[0], "blur");
    expect(missingSpeakerCopies(project, project.takes[0])).toEqual({ blur: true, alpha: false });
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
    expect(ALPHA_ENCODE_ARGS).toEqual(expect.arrayContaining(["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", "24", "-an"]));
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
});

describe("the choice, wherever it is made", () => {
  it("the booth offers room, blur and alpha, defaulting to the scene's setting; the attach writes it on the scene and mattes what is missing", async () => {
    const take = await fsp.readFile("src/take-page.ts", "utf8");
    expect(take).toMatch(/<input type="radio" name="bg" value="room" checked> Room/);
    expect(take).toMatch(/<input type="radio" name="bg" value="blur"> Blur/);
    expect(take).toMatch(/<input type="radio" name="bg" value="alpha"> Alpha/);
    expect(take).toMatch(/background: \(document\.querySelector\('input\[name="bg"\]:checked'\) \|\| \{\}\)\.value \|\| 'room',/);
    expect(take).toMatch(/var mode = spk \? \(spk\.data\.background \|\| \(spk\.data\.src === 'speaker-alpha' \? 'alpha' : 'room'\)\) : 'room';/);
    expect(take).toMatch(/c0\.type === 'video' && c0\.data && \(c0\.data\.src === 'speaker' \|\| c0\.data\.src === 'speaker-alpha' \|\| c0\.data\.speaker_layer === true\)/);
    const index = await fsp.readFile("src/index.ts", "utf8");
    expect(index).toMatch(/const tkBackground = asSpeakerBackground\(tkBody\.background\);/);
    expect(index).toMatch(/if \(tkBackground\) setSpeakerBackground\(built, tkBackground\);\s*else castSpeakerLayer\(built\);/);
    expect(index).toMatch(/syncSpeakerClips\(tkProjectObj\);\s*ensureSpeakerNeeds\(tkProjectObj\);/);
    expect(index).toMatch(/if \(tkMissing\.blur \|\| tkMissing\.alpha\) \{\s*queueTakeMatte\(\{/);
    expect(index).not.toMatch(/await matteTake\(/);
  });
  it("Studio flips it per scene through one route that re-points the clips and mattes a missing copy in the background", async () => {
    const index = await fsp.readFile("src/index.ts", "utf8");
    expect(index).toMatch(/urlPath\.match\(\/\^\\\/api\\\/speaker-background\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\/\)/);
    expect(index).toMatch(/if \(!setSpeakerBackground\(sbScene as any, sbMode\)\)/);
    expect(index).toMatch(/const sbMissing = sbTake \? missingSpeakerCopies\(sbProj, sbTake\) : \{ blur: false, alpha: false \};/);
    expect(index).toMatch(/rawUrl: takeCopies\(sbTake\)\.raw/);
    const studio = await fsp.readFile("src/preview-app/preview-app.ts", "utf8");
    // The take dialog: one header, one row of tabs (record here / phone / upload), the recorder open;
    // the background is chosen in the recorder or in Inspect, not on the card (Marc: "why is there these buttons and radio buttons?").
    expect(studio).not.toMatch(/data-np-bg=/);
    expect(studio).toMatch(/<div class="np-tabs">/);
    expect(studio).toMatch(/Camera take \\u00b7 Scene ' \+ \(si \+ 1\)/);
    expect(studio).toMatch(/npOpenPanel\(project, cardC, 'booth', si, ai\);/);
    expect(studio).toMatch(/api\('POST', '\/speaker-background\/'/); // Inspect's background choice
    // The Inspect card: the speaker's internals stay hidden, background is a Room/Blur/Alpha choice on the same route.
    expect(studio).toMatch(/var isSpk = comp\.type === 'video' && !!\(data\.src === 'speaker' \|\| data\.src === 'speaker-alpha' \|\| data\.speaker_layer === true\);/);
    // The component is a video and says so; src stays, with the take it stands for previewed (Marc: "it should say video").
    expect(studio).toMatch(/keys = keys\.filter\(function\(k\) \{ return k !== 'speaker_layer' && k !== 'alpha'/);
    expect(studio).toMatch(/\} else if \(isSpk && key === 'src'\) \{/);
    expect(studio).toMatch(/speakerClipUrlOf\(\(data\.background === 'alpha' && own\.alpha\) \? own\.alpha : own\.source\)/);
    expect(studio).not.toMatch(/\? 'speaker' : c\.type\)/);
    expect(studio).toMatch(/\(isSpk && key === 'shape'\) \? \['rectangle', 'rounded', 'circle'\]/);
    expect(studio).toMatch(/\['full', 'bottom-right', 'bottom-left', 'top-right', 'top-left'\]/);
    expect(studio).toMatch(/\{ position: pos, data: \{ shape: comp\.data\.shape \|\| 'rectangle' \} \}/);
    expect(studio).toMatch(/var enumOpts = \(isSpk && key === 'background'\) \? \['room', 'blur', 'alpha'\] : /);
    expect(studio).toMatch(/if \(isSpk && sel\.dataset\.key === 'background'\) \{/);
    expect(studio).toMatch(/var alp = clips\[i\]\.alpha \? speakerClipUrlOf\(clips\[i\]\.alpha\) : null;/);
    const video = await fsp.readFile("src/components/media/video.component.html", "utf8");
    expect(video).toMatch(/var startAt = Number\(data\.start_at\);/);
    const pipeline = await fsp.readFile("src/llm/pipeline.ts", "utf8");
    expect(pipeline).toMatch(/if \(\(sc as any\)\.transparent_background === false\) continue;\s*if \(castSpeakerLayer\(sc as any\)\)/);
  });
  it("the matte records the copies on the take and re-points the clips; the raw take stays the source", async () => {
    const matte = await fsp.readFile("src/core/take-matte.ts", "utf8");
    expect(matte).toMatch(/if \(blurUrl\) t\.blur = blurUrl;\s*if \(alphaUrl\) t\.alpha = alphaUrl;/);
    expect(matte).toMatch(/const synced = syncSpeakerClips\(project\);\s*ensureSpeakerNeeds\(project\);/);
    expect(matte).not.toMatch(/t\.source = blurUrl/);
    expect(matte).toMatch(/if \(again\.blur \|\| again\.alpha\) queueTakeMatte\(\{ \.\.\.opts, \.\.\.again \}\);/);
  });
});
