import { describe, it, expect, vi } from "vitest";

// The idle scan cached at ingest: a 5.6s clip idle 0-3s and 4-5.6s.
vi.mock("../src/core/asset-intel.js", () => ({
  loadAssetIntel: async (p: string) => (/idle-clip/.test(p)
    ? { idle: { duration: /long/.test(p) ? 30 : 5.6, ranges: /long/.test(p) ? [{ start: 2, end: 28 }] : [{ start: 0, end: 3 }, { start: 4, end: 5.6 }] } }
    : null),
}));
import { findSceneScreencasts, proposeSceneCompression } from "../src/core/auto-compress.js";
import type { Scene } from "../src/core/types.js";

describe("findSceneScreencasts", () => {
  it("finds a screencast-frame video and keys it 'screencast'", () => {
    const scene = {
      id: "s", label: "S", duration_seconds: 10,
      components: [{ id: "sc", type: "screencast-frame", data: { video_url: "/assets/t/projects/library/assets/demo.mp4" } }],
    } as unknown as Scene;
    expect(findSceneScreencasts(scene)).toEqual([{ target: "screencast", src: "/assets/t/projects/library/assets/demo.mp4" }]);
  });

  it("ignores non-video sources, the speaker token, and images", () => {
    const scene = {
      id: "s", label: "S", duration_seconds: 10,
      components: [
        { id: "a", type: "screencast-frame", data: { pip_source: "speaker", video_url: "speaker" } },
        { id: "b", type: "image-card", data: { source: "/assets/t/assets/logo.png" } },
        { id: "c", type: "headline", data: {} },
      ],
    } as unknown as Scene;
    expect(findSceneScreencasts(scene)).toEqual([]);
  });

  it("keys additional clips by a src-substring selector, dedupes repeats", () => {
    const scene = {
      id: "s", label: "S", duration_seconds: 10,
      components: [
        { id: "a", type: "screencast-frame", data: { video_url: "/x/one.mp4" } },
        { id: "b", type: "screencast-frame", data: { source: "/x/two.webm" } },
        { id: "c", type: "screencast-frame", data: { video_url: "/x/one.mp4" } },
      ],
    } as unknown as Scene;
    expect(findSceneScreencasts(scene)).toEqual([
      { target: "screencast", src: "/x/one.mp4" },
      { target: 'video[src*="two.webm"]', src: "/x/two.webm" },
    ]);
  });
});

describe("proposeSceneCompression", () => {
  it("no-ops (no throw, empty result) when the scene has no screencast", async () => {
    const scene = { id: "s", label: "S", duration_seconds: 10, components: [{ id: "h", type: "headline", data: {} }] } as unknown as Scene;
    const res = await proposeSceneCompression(scene);
    expect(res.applied).toEqual([]);
    expect((scene as any).media_edits).toBeUndefined();
  });

  it("swallows detection failure on a missing file and leaves the scene addable", async () => {
    const scene = {
      id: "s", label: "S", duration_seconds: 10,
      components: [{ id: "sc", type: "screencast-frame", data: { video_url: "/assets/t/projects/library/assets/does-not-exist.mp4" } }],
    } as unknown as Scene;
    const res = await proposeSceneCompression(scene, { dataDir: "/nonexistent" });
    expect(res.applied).toEqual([]);
  });

  const clip = (name: string, dur: number) => ({
    id: "s", label: "S", duration_seconds: dur,
    components: [{ id: "sc", type: "screencast-frame", data: { video_url: `/assets/t/projects/p/assets/${name}.mp4` } }],
  } as unknown as Scene);

  it("leaves a recording that fits the board's window as shot (the dark-mode film: 5.6s clip, 5.6s beat)", async () => {
    const scene = clip("idle-clip", 5.6);
    const res = await proposeSceneCompression(scene, { window: 5.6 });
    expect(res.applied).toEqual([]);
    expect(scene.duration_seconds).toBe(5.6);
    expect((scene as any).media_edits?.screencast).toBeUndefined();
  });

  it("compresses a longer recording to land ON the window, not below it", async () => {
    const scene = clip("idle-clip-long", 8);
    const res = await proposeSceneCompression(scene, { window: 8 });
    expect(res.applied).toHaveLength(1);
    expect(res.applied[0].output_duration).toBeCloseTo(8, 0);
    expect(scene.duration_seconds).toBe(8);
  });

  it("without a window keeps the old behaviour: the waiting runs at 8x", async () => {
    const scene = clip("idle-clip", 5.6);
    const res = await proposeSceneCompression(scene);
    expect(res.applied[0].idle_rate).toBe(8);
    expect(scene.duration_seconds).toBeCloseTo(1.6, 1);
  });
});
