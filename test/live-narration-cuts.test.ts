/**
 * Mode A regression: the sidecar's idle ranges are {start,end}; the cut
 * intersector consumes {from,to}. A shape mismatch here silently produced
 * ZERO cuts on every live-narrated film (bug found on the first real take
 * with genuine dead air). This exercises assembleLiveNarration far enough
 * to assert the intersection actually yields cuts from real-shaped intel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/core/auto-compress.js", () => ({
  probeMediaDuration: vi.fn(async () => 91.2),
  proposeSceneCompression: vi.fn(),
  proposeChapterPins: vi.fn(),
}));
vi.mock("../src/core/asset-intel.js", () => ({
  ensureMotionIntel: vi.fn(async () => ({
    // Real recorder-events shape: {start, end} seconds.
    idle: { ranges: [{ start: 23.2, end: 32.7 }, { start: 40.1, end: 43.7 }], duration: 91.2 },
    transitions: [],
    focus: [],
    duration: 91.2,
  })),
}));
vi.mock("../src/core/idle-silence.js", async (importOriginal) => {
  const actual: any = await importOriginal(); // real range math -- that's what we're testing
  return {
    ...actual,
    detectSilence: vi.fn(async () => [{ from: 23.17, to: 32.03 }, { from: 37.49, to: 43.27 }]),
    cutAudioTo: vi.fn(async () => {}),
  };
});
vi.mock("../src/core/sentence-spine.js", () => ({ getSentenceSpine: vi.fn(async () => null) }));
vi.mock("../src/core/recorder-events.js", () => ({ loadRecorderEvents: vi.fn(async () => null) }));
vi.mock("../src/core/video-normalize.js", () => ({
  probeVideo: vi.fn(async () => ({ videoCodec: null, audioCodec: "aac" })), // narration m4a: no bubble from attach
  remuxMediaRecorderFile: vi.fn(async () => false),
}));

import { assembleLiveNarration } from "../src/llm/narrated-screencast.js";
import { cutAudioTo, detectSilence } from "../src/core/idle-silence.js";

describe("assembleLiveNarration cuts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("intersects {start,end} idle with silence into real EDL cuts", async () => {
    const project: any = { project_id: "p", tenant_id: "t", scenes: [], brand_kit: {} };
    const res = await assembleLiveNarration({ project, source: "/assets/t/projects/p/assets/r.webm", music: false });

    const scene = project.scenes.find((s: any) => s.id === "screencast");
    const me = scene.media_edits?.screencast;
    expect(me).toBeTruthy();
    // idle 23.2-32.7 ∩ silence 23.17-32.03 = 23.2-32.03, shrunk 0.35 -> ~8.1s cut.
    expect(me.cuts).toHaveLength(1);
    expect(me.cuts[0].src_start).toBeCloseTo(23.55, 1);
    expect(me.cuts[0].src_end).toBeCloseTo(31.68, 1);
    // The 40.1-43.27 overlap shrinks under the 2.5s floor and is rightly dropped.
    expect(res.summary).toContain("1 idle+silent cut(s)");
    expect(scene.duration_seconds).toBeCloseTo(91.2 - (31.68 - 23.55), 0);
  });

  it("camera mode: voice + PiP from the speaker file, same cuts on both video targets", async () => {
    const project: any = { project_id: "p", tenant_id: "t", scenes: [], brand_kit: {} };
    await assembleLiveNarration({
      project,
      source: "/assets/t/projects/p/assets/rec.webm",
      speakerSource: "/assets/t/projects/p/assets/camera-1.webm",
      music: false,
    });

    // Silence measured on -- and narration audio sliced from -- the camera file.
    expect((detectSilence as any).mock.calls[0][0]).toContain("camera-1.webm");
    expect((cutAudioTo as any).mock.calls[0][0]).toContain("camera-1.webm");

    const scene = project.scenes.find((s: any) => s.id === "screencast");
    const pip = scene.components.find((c: any) => c.id === "camera_pip");
    expect(pip).toBeTruthy();
    expect(pip.data.video_url).toContain("camera-1.webm");
    // The bubble's EDL target carries the SAME cut as the screencast.
    const camKey = Object.keys(scene.media_edits).find((k) => k.includes("camera-1.webm"))!;
    expect(scene.media_edits[camKey].cuts).toEqual(scene.media_edits.screencast.cuts);
  });
});
