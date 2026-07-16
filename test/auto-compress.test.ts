import { describe, it, expect } from "vitest";
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
});
