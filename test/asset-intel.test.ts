import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  loadAssetIntel,
  resolveAutoCropData,
  resolveScreencastAutoCrops,
  isAnalyzableVideo,
  type AssetIntel,
} from "../src/core/asset-intel.js";
import { changedGeoChecks, extractGeoDecls } from "../src/llm/scene-revise.js";

const INTEL: AssetIntel = {
  version: 1, kind: "video", width: 3420, height: 2014, duration: 646,
  trims: {
    top: { px: 108, reason: "static-chrome" },
    bottom: { px: 18, reason: "letterbox" },
    left: { px: 6, reason: null },
    right: { px: 6, reason: null },
  },
  content_box: { x: 6, y: 108, w: 3408, h: 1888 },
  has_own_chrome: true,
  theme: "light",
  notes: ["3420x2014, 646.0s, light theme"],
  analyzed_at: "2026-01-01T00:00:00.000Z",
};

let dir: string;
let videoPath: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "intel-test-"));
  videoPath = path.join(dir, "rec.mp4");
  await fs.writeFile(videoPath, "not-a-real-video");
  await fs.writeFile(videoPath + ".intel.json", JSON.stringify(INTEL));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("asset intel sidecar", () => {
  it("loads a sidecar by asset path", async () => {
    const intel = await loadAssetIntel(videoPath);
    expect(intel?.has_own_chrome).toBe(true);
    expect(intel?.trims.top.px).toBe(108);
  });

  it("returns null when no sidecar exists", async () => {
    expect(await loadAssetIntel(path.join(dir, "missing.mp4"))).toBeNull();
  });

  it("classifies analyzable extensions", () => {
    expect(isAnalyzableVideo("/x/a.mp4")).toBe(true);
    expect(isAnalyzableVideo("/x/a.MOV")).toBe(true);
    expect(isAnalyzableVideo("/x/a.png")).toBe(false);
    expect(isAnalyzableVideo("/x/a.m4a")).toBe(false);
  });
});

describe("crop:auto resolution", () => {
  it("resolves crop:auto from the sidecar (absolute path video_url)", async () => {
    const data = await resolveAutoCropData({ video_url: videoPath, crop: "auto" });
    expect(data.crop).toEqual({ top: 108, bottom: 18, left: 6, right: 6 });
  });

  it("leaves crop:auto in place when no sidecar exists", async () => {
    const data = await resolveAutoCropData({ video_url: path.join(dir, "missing.mp4"), crop: "auto" });
    expect(data.crop).toBe("auto");
  });

  it("does not touch explicit crop objects", async () => {
    const crop = { top: 1, bottom: 2, left: 3, right: 4 };
    const data = await resolveAutoCropData({ video_url: videoPath, crop });
    expect(data.crop).toBe(crop);
  });

  it("rewrites crop:auto inside screencast-frame component tags", async () => {
    const html = `<div><component type="screencast-frame" data='{"video_url":"${videoPath}","frame_style":"macos-browser","crop":"auto"}' /></div>`;
    const out = await resolveScreencastAutoCrops(html);
    expect(out).not.toContain('"crop":"auto"');
    expect(out).toContain('"top":108');
    // other component types untouched
    const other = `<component type="video" data='{"src":"x.mp4","crop":"auto"}' />`;
    expect(await resolveScreencastAutoCrops(other)).toBe(other);
  });
});

describe("revise geometry diff (post-apply verification input)", () => {
  const OLD = `<template><div class="a"/></template>
<style scoped>
.bg-video { width: 100%; top: 0; }
.frame { border-radius: 0px; }
</style>
<script>function createTimeline(){}</script>`;
  const NEW = `<template><div class="a"/></template>
<style scoped>
.bg-video { width: 100.352%; top: -5.721%; }
.frame { border-radius: 16px; }
.gone { left: 4px; }
</style>
<script>function createTimeline(){}</script>`;

  it("extracts geometry declarations per selector", () => {
    const decls = extractGeoDecls(NEW);
    expect(decls.get(".bg-video")).toEqual({ width: "100.352%", top: "-5.721%" });
    expect(decls.get(".frame")).toEqual({ "border-radius": "16px" });
  });

  it("diffs only what the patch changed", () => {
    const checks = changedGeoChecks(OLD, NEW);
    const keys = checks.map((c) => `${c.selector}|${c.prop}|${c.value}`).sort();
    expect(keys).toEqual([
      ".bg-video|top|-5.721%",
      ".bg-video|width|100.352%",
      ".frame|border-radius|16px",
      ".gone|left|4px",
    ]);
  });

  it("skips unverifiable values and pseudo selectors", () => {
    const checks = changedGeoChecks(OLD, `<style>
.bg-video { width: calc(100% + 6px); height: auto; }
.x:hover { width: 50%; }
</style>`);
    expect(checks).toEqual([]);
  });
});
