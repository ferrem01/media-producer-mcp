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

import { applyTimelapse, removeTimelapse, autoTimelapseForStrain } from "../src/core/speaker-edl.js";

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

  it("a new beat overlapping an existing one replaces it (partial chip-click, then the auto's whole wait)", async () => {
    const p = jammedFilm();
    // Manual chip-click: timelapse only the back half of the wait. The pin
    // window still can't hold the untouched front half at 16x.
    await applyTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 80, src_end: 148, out_seconds: 3 });
    // The auto (or a second click) covers the WHOLE wait.
    await applyTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8, src_end: 148, out_seconds: 6 });
    const sc = p.scenes[1].media_edits.screencast;
    // One beat, not two overlapping constraints.
    expect(sc.timelapses.length).toBe(1);
    expect(sc.timelapses[0]).toEqual({ src_start: 8, src_end: 148, out_seconds: 6 });
    expect(sc.segments.filter((s: any) => s.tl).length).toBe(1);
    expect((sc.pin_status || []).filter((x: any) => x.status !== "ok")).toEqual([]);
    // Total film time = original 60 + (6s beat - 2s original window); the
    // gaps (merged at the same narration spot) fund exactly that.
    expect(p.scenes[1].duration_seconds).toBeCloseTo(64, 0);
    const gapTotal = p.speaker.clips[0].edl.gaps.reduce((a: number, g: any) => a + g.seconds, 0);
    expect(gapTotal).toBeCloseTo(4, 0);
    // And a remove still drains everything.
    await removeTimelapse(p, { scene_id: "screencast", key: "screencast", src_start: 8 });
    expect((p.speaker.clips[0].edl.gaps || []).length).toBe(0);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(60, 0);
  });

  it("auto beat fills a pin window the user already funded with talk (Marc's 'ends at the wow')", async () => {
    // His shape: talk was CUT, not gapped -- but he left ~13s of speech
    // between the pinned words, so the pins already define a 12.8s window.
    // The beat must fill it edge-to-edge (ending at the pinned word), with
    // NO narration gap and NO film growth -- not default to 8s and force
    // the solver to pad the difference.
    const p = jammedFilm();
    const sc = p.scenes[1].media_edits.screencast;
    sc.pins = [{ out: 10, src: 8, word: "start" }, { out: 22.8, src: 240, word: "wow" }];
    sc.rate_regions = [{ src_start: 0, src_end: 200, rate: 1 }];
    sc.pin_status = [
      { out: 10, status: "ok" },
      { out: 22.8, status: "strained", detail: "needs faster playback than the 16x cap allows -- lands 1.7s off" },
    ];
    const res = await autoTimelapseForStrain(p, "screencast", "screencast");
    expect(res).toBeTruthy();
    // The beat fills the full 12.8s window and its span runs to the pinned
    // frame itself -- the striped block ends exactly at the pin.
    expect(res!.out_seconds).toBeCloseTo(12.8, 1);
    expect(res!.src_end).toBeCloseTo(240, 1);
    expect(res!.added_seconds).toBe(0);
    expect((p.speaker.clips[0].edl.gaps || []).length).toBe(0);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(60, 0);
    const tl = sc.segments.filter((s: any) => s.tl);
    expect(tl.length).toBe(1);
    // No sub-1x filler, and no hold parked before "wow": the beat itself
    // ends at the pinned word. (Other windows may legitimately hold.)
    expect(sc.segments.filter((s: any) => !s.tl && !(s.hold > 0) && s.rate < 0.99)).toEqual([]);
    expect(sc.segments.filter((s: any) => s.hold > 0.5 && Math.abs(s.src_start - 240) < 1)).toEqual([]);
    expect((sc.pin_status || []).filter((x: any) => x.status !== "ok")).toEqual([]);
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
