import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { matteSize, matteBlurRadius, matteFilterGraph, MATTE_MODEL_SHA256, MATTE_MODEL_URL } from "../src/core/take-matte.js";

// BACKGROUND BLUR AT ATTACH: person matting (Robust Video Matting, ONNX,
// CPU) gives the alpha; ffmpeg blurs the room and lays the sharp person
// back. The raw take is kept; the blur is a copy. The model itself is not
// run here (15 MB, fetched once on the server) -- these pin the geometry,
// the graph and the plumbing.
describe("background blur at attach", () => {
  it("shows the model the frame at a 288px short side, both sides multiples of 32, aspect kept", () => {
    expect(matteSize(1080, 1920)).toEqual({ width: 288, height: 512 });
    expect(matteSize(1920, 1080)).toEqual({ width: 512, height: 288 });
    expect(matteSize(1080, 1080)).toEqual({ width: 288, height: 288 });
    expect(matteSize(1080, 1350)).toEqual({ width: 288, height: 352 });
    for (const [w, h] of [[720, 1280], [1280, 720], [640, 480]]) { const s = matteSize(w, h); expect(s.width % 32).toBe(0); expect(s.height % 32).toBe(0); }
  });

  it("blurs the room 8-32 px at 1080 wide by strength, scaled with the frame", () => {
    expect(matteBlurRadius(1080, 0)).toBe(8);
    expect(matteBlurRadius(1080, 1)).toBe(32);
    expect(matteBlurRadius(1080)).toBe(22);
    expect(matteBlurRadius(1920, 0.6)).toBe(40);
  });

  it("the graph: the frame split into the blurred room and the person under the upscaled soft alpha, the person over the room", () => {
    const g = matteFilterGraph(1080, 1920, 0.6);
    expect(g).toContain("[0:v]split=2[base][fgsrc]");
    expect(g).toContain("[base]boxblur=lr=22:lp=3[bg]");
    expect(g).toContain("[1:v]scale=1080:1920:flags=bicubic,format=gray,gblur=sigma=1.5[m]");
    expect(g).toContain("[fgc][m]alphamerge[fg]");
    expect(g).toContain("[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[out]");
  });

  it("mattes at most 30 frames a second: a canvas take's 120 fps timebase must not quadruple the work", async () => {
    const { MATTE_MAX_FPS } = await import("../src/core/take-matte.js");
    expect(MATTE_MAX_FPS).toBe(30);
    const src = await fs.readFile("src/core/take-matte.ts", "utf8");
    expect(src).toMatch(/const fps = Math\.min\(MATTE_MAX_FPS, probe\.fps > 0 \? probe\.fps : MATTE_MAX_FPS\);/);
    expect(src).toMatch(/`fps=\$\{fps\},scale=\$\{mw\}:\$\{mh\}:flags=area`/);
    expect(src).toMatch(/"-framerate", String\(fps\), "-i", alphaRaw/);
  });

  it("the model is pinned by URL and hash", () => {
    expect(MATTE_MODEL_URL).toMatch(/^https:\/\/github\.com\/PeterL1n\/RobustVideoMatting\/releases\/download\/v1\.0\.0\/rvm_mobilenetv3_fp32\.onnx$/);
    expect(MATTE_MODEL_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is a per-take option: the booth offers it, the attach route runs it on a copy and never lets it block the take", async () => {
    const take = await fs.readFile("src/take-page.ts", "utf8");
    expect(take).toMatch(/<input type="checkbox" id="blurBg"> Blur the background/);
    expect(take).toMatch(/background: \(\$\('blurBg'\) && \$\('blurBg'\)\.checked\) \? 'blur' : 'none',/);
    const index = await fs.readFile("src/index.ts", "utf8");
    // The attach lands at once; the matte runs after it and swaps the take (the request dropped at 300s when it ran inline).
    expect(index).toMatch(/const tkWantBlur = tkBody\.background === "blur";/);
    expect(index).toMatch(/reshootStoryboardCardsSoon\(tkTenant, tkProject\);\s*if \(tkWantBlur \|\| tkWantAlpha\) \{\s*queueTakeMatte\(\{/);
    expect(index).not.toMatch(/await matteTake\(/);
    const matte = await fs.readFile("src/core/take-matte.ts", "utf8");
    expect(matte).toMatch(/if \(blurUrl\) \{ t\.source = blurUrl; t\.background = \{ mode: "blur", source_raw: opts\.rawUrl/);
    expect(matte).toMatch(/if \(alphaUrl\) \{ t\.alpha = alphaUrl; layered\+\+; \}/);
    expect(matte).toMatch(/if \(alphaUrl\) c\.alpha = alphaUrl;\s*if \(blurUrl\) c\.source = blurUrl;/);
    const types = await fs.readFile("src/core/types.ts", "utf8");
    expect(types).toMatch(/background\?: \{ mode: "blur"; source_raw: string; strength\?: number; ms\?: number \};/);
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    expect(pkg.dependencies["onnxruntime-node"]).toBeTruthy();
  });
});
