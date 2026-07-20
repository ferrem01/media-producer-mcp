/**
 * applyTimelapse: the beat owns film time funded by a narration gap; the
 * camera freezes; pins after the beat shift; removeTimelapse reverses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/core/idle-silence.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, cutAudioTo: vi.fn(async () => {}), cutAudioToWithGaps: vi.fn(async () => {}) };
});
vi.mock("../src/core/auto-compress.js", () => ({
  probeMediaDuration: vi.fn(async () => 200),
  proposeSceneCompression: vi.fn(),
  proposeChapterPins: vi.fn(),
}));

import { applyTimelapse, removeTimelapse } from "../src/core/speaker-edl.js";

function jammedFilm(): any {
  // Marc's shape: a pin right after a cut seam with 142s of footage jammed
  // into 2s of window (strained at 16x).
  return {
    project_id: "p", tenant_id: "t",
    speaker: { clips: [{ at: 6, source: "/assets/t/projects/p/assets/cam.webm", edl: { cuts: [], segments: [] } }] },
    audio: { tracks: [{ id: "narration", type: "voiceover", source: "bake.m4a", volume: 1, start_time: 6 }] },
    scenes: [
      { id: "intro", duration_seconds: 6, components: [] },
      {
        id: "screencast", duration_seconds: 60,
        components: [{ id: "n", type: "narration-track", data: { captions: [
          { text: "before", start: 1, end: 3 },
          { text: "after", start: 40, end: 44 },
        ], chapters: [] } }],
        media_edits: {
          screencast: {
            segments: [{ src_start: 0, src_end: 200, rate: 1 }],
            cuts: [], rate_regions: [],
            pins: [{ out: 10, src: 8, word: "start" }, { out: 12, src: 150, word: "matters" }],
            pin_status: [],
          },
          'video[src*="cam.webm"]': {
            segments: [{ src_start: 0, src_end: 200, rate: 1 }],
            cuts: [], rate_regions: [], pins: [], pin_status: [],
          },
        },
      },
    ],
  };
}

describe("applyTimelapse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("funds the beat with film time, lands the pin, freezes the camera", async () => {
    const p = jammedFilm();
    const res = await applyTimelapse(p, {
      scene_id: "screencast", key: "screencast",
      src_start: 8, src_end: 148, out_seconds: 4,
    });
    // The 140s span had ~2s (out 10->12); 4s beat adds ~2s of film.
    expect(res.added_seconds).toBeCloseTo(2, 0);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(62, 0);

    const sc = p.scenes[1].media_edits.screencast;
    // Beat segments are tl-marked at ~35x (140s/4s), and the pin lands.
    const tl = sc.segments.filter((s: any) => s.tl);
    expect(tl.length).toBeGreaterThan(0);
    expect(Math.max(...tl.map((s: any) => s.rate))).toBeGreaterThan(16);
    const strained = (sc.pin_status || []).filter((x: any) => x.status !== "ok");
    expect(strained).toEqual([]);
    // The later pin shifted with the film.
    expect(sc.pins.find((x: any) => x.word === "matters").out).toBeCloseTo(14, 1);

    // Narration gap exists; camera froze for the added time.
    const gaps = p.speaker.clips[0].edl.gaps;
    expect(gaps.length).toBe(1);
    expect(gaps[0].seconds).toBeCloseTo(2, 0);
    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    const hold = cam.segments.find((s: any) => s.hold > 0);
    expect(hold).toBeTruthy();
    expect(hold.hold).toBeCloseTo(2, 0);

    // Caption after the beat shifted; caption before did not.
    const caps = p.scenes[1].components[0].data.captions;
    expect(caps[0].start).toBeCloseTo(1, 2);
    expect(caps[1].start).toBeCloseTo(42, 0);
  });

  it("resizing an existing beat adjusts by the difference", async () => {
    const p = jammedFilm();
    await applyTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8, src_end: 148, out_seconds: 4 });
    const durAfter4 = p.scenes[1].duration_seconds;
    await applyTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8, src_end: 148, out_seconds: 8 });
    expect(p.scenes[1].duration_seconds).toBeCloseTo(durAfter4 + 4, 0);
    expect(p.speaker.clips[0].edl.gaps[0].seconds).toBeCloseTo(6, 0);
  });

  it("removeTimelapse shrinks the film back and lifts the gap", async () => {
    const p = jammedFilm();
    await applyTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8, src_end: 148, out_seconds: 6 });
    await removeTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8 });
    expect(p.scenes[1].duration_seconds).toBeCloseTo(60, 0);
    expect((p.speaker.clips[0].edl.gaps || []).length).toBe(0);
    const sc = p.scenes[1].media_edits.screencast;
    expect((sc.timelapses || []).length).toBe(0);
    expect(sc.pins.find((x: any) => x.word === "matters").out).toBeCloseTo(12, 0);
  });
});
