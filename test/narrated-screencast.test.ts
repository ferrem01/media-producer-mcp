import { describe, it, expect } from "vitest";
import { assembleNarratedScreencast } from "../src/llm/narrated-screencast.js";
import type { Project } from "../src/core/types.js";

function shell(assets: any[] = []): Project {
  return {
    project_id: "p", tenant_id: "t", name: "N", format: "video", status: "draft",
    canvas: { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#000" },
    brand_kit: { colors: {}, fonts: [], assets } as any,
    scenes: [],
  } as unknown as Project;
}

const SCREEN = "/assets/t/projects/library/assets/missing-demo.mp4"; // no real file -> compress no-ops
const NARR = "/assets/t/projects/library/assets/missing-narration.m4a";

describe("assembleNarratedScreencast", () => {
  it("with brand intro+outro assets, lays out intro -> screencast -> outro and wires the narration track", async () => {
    const project = shell([
      { name: "i", url: "/assets/t/brand-kit/intro/i.mp4", type: "intro", duration: 6 },
      { name: "o", url: "/assets/t/brand-kit/outro/o.mp4", type: "outro", duration: 5 },
    ]);
    const res = await assembleNarratedScreencast({ project, screencastSource: SCREEN, narrationSource: NARR, dataDir: "/nonexistent" });
    const ids = res.project.scenes.map((s) => s.id);
    expect(ids).toEqual(["intro", "screencast", "outro"]);
    // each scene is a full-frame screencast-frame video
    for (const s of res.project.scenes) {
      const c = (s.components || [])[0] as any;
      expect(c.type).toBe("screencast-frame");
      expect(c.data.frame_style).toBe("none");
      expect(c.position.width).toBe("100%");
    }
    // the middle scene carries the screen recording
    expect(((res.project.scenes[1].components[0] as any).data.video_url)).toBe(SCREEN);
    // narration wired as the soundtrack
    expect((res.project.audio as any).tracks[0]).toMatchObject({ type: "voiceover", source: NARR });
    expect(res.project.status).toBe("generated");
  });

  it("with no brand bookends, produces a single screencast scene", async () => {
    const project = shell([]);
    const res = await assembleNarratedScreencast({ project, screencastSource: SCREEN, narrationSource: NARR, dataDir: "/nonexistent" });
    expect(res.project.scenes.map((s) => s.id)).toEqual(["screencast"]);
  });

  it("works with no narration (no audio track set)", async () => {
    const project = shell([]);
    const res = await assembleNarratedScreencast({ project, screencastSource: SCREEN, dataDir: "/nonexistent" });
    expect(res.project.scenes.map((s) => s.id)).toEqual(["screencast"]);
    expect(res.project.audio).toBeUndefined();
    expect(res.narration_duration).toBe(0);
  });
});
