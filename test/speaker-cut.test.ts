/**
 * The referee under the RE-FIT model (agreed 2026-07-19): a speaker cut
 * removes TIME, never screen content. Screens re-solve through tagged
 * anchors (sync frozen up to the seam, remaining footage compressed to
 * fit); the camera FOLLOWER mirrors the cut so lips match the voice; and
 * applySpeakerRestore reverses all of it.
 */
import fsSync from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/core/idle-silence.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, cutAudioTo: vi.fn(async () => {}) };
});
vi.mock("../src/core/auto-compress.js", () => ({
  probeMediaDuration: vi.fn(async () => 91.2),
  proposeSceneCompression: vi.fn(),
  proposeChapterPins: vi.fn(),
}));

// A REAL scratch dir. The old DATA_DIR sentinel claimed these tests
// never touch disk -- but ensureSpeakerDerived mkdirs its assets dir, and
// only the root sandbox could create /nonexistent. CI (non-root) caught it
// on the first run: EACCES.
const DATA_DIR = fsSync.mkdtempSync(nodePath.join(os.tmpdir(), "spk-test-"));

import { applySpeakerCut, applySpeakerRestore, bakeToSourceTime, mergeCut } from "../src/core/speaker-edl.js";
import { cutAudioTo } from "../src/core/idle-silence.js";

describe("bakeToSourceTime", () => {
  it("identity with no cuts", () => {
    expect(bakeToSourceTime([], 12.5)).toBeCloseTo(12.5, 3);
  });
  it("skips over existing cuts", () => {
    const cuts = [{ src_start: 10, src_end: 20 }];
    expect(bakeToSourceTime(cuts, 5)).toBeCloseTo(5, 3);
    expect(bakeToSourceTime(cuts, 10)).toBeCloseTo(20, 3);
    expect(bakeToSourceTime(cuts, 15)).toBeCloseTo(25, 3);
  });
});

describe("mergeCut", () => {
  it("merges overlapping and keeps disjoint sorted", () => {
    expect(mergeCut([{ src_start: 5, src_end: 10 }], { src_start: 8, src_end: 14 }))
      .toEqual([{ src_start: 5, src_end: 14 }]);
    expect(mergeCut([{ src_start: 20, src_end: 25 }], { src_start: 5, src_end: 10 }))
      .toEqual([{ src_start: 5, src_end: 10 }, { src_start: 20, src_end: 25 }]);
  });
});

function outLen(segs: any[]): number {
  return segs.reduce((t, s) => t + (typeof s.hold === "number" && s.hold > 0 ? s.hold : (s.src_end - s.src_start) / (s.rate || 1)), 0);
}

function srcCovered(segs: any[], t: number): boolean {
  return segs.some((s) => t >= s.src_start - 0.01 && t <= s.src_end + 0.01);
}

function film(): any {
  // 6.1s intro + 60s walkthrough (screen 1:1) + 5.2s outro. The camera
  // follower shares the speaker's clock (cam.webm IS the voice take).
  return {
    project_id: "p", tenant_id: "t",
    speaker: { clips: [{ at: 6.1, source: "/assets/t/projects/p/assets/cam.webm", edl: { cuts: [], segments: [] } }] },
    audio: { tracks: [{ id: "narration", type: "voiceover", source: "bake.m4a", volume: 1, start_time: 6.1 }] },
    scenes: [
      { id: "intro", duration_seconds: 6.1, components: [{ id: "i", type: "screencast-frame", data: { video_url: "/assets/t/brand-kit/intro/i.mp4" } }] },
      {
        id: "screencast", duration_seconds: 60,
        components: [
          { id: "screencast_v", type: "screencast-frame", data: { video_url: "/assets/t/projects/p/assets/rec.webm" } },
          { id: "narration_overlay", type: "narration-track", data: {
            captions: [
              { text: "early", start: 2, end: 5 },
              { text: "inside", start: 21, end: 24 },
              { text: "late", start: 40, end: 44 },
            ],
            chapters: [{ title: "Later", at: 45 }],
          } },
        ],
        media_edits: {
          screencast: {
            segments: [{ src_start: 0, src_end: 60, rate: 1 }],
            cuts: [], rate_regions: [],
            pins: [{ out: 22, src: 22, word: "mid" }, { out: 50, src: 50, word: "late" }],
            pin_status: [],
          },
          'video[src*="cam.webm"]': {
            segments: [{ src_start: 0, src_end: 91.2, rate: 1 }],
            cuts: [], rate_regions: [], pins: [], pin_status: [],
          },
        },
      },
      { id: "outro", duration_seconds: 5.2, components: [{ id: "o", type: "screencast-frame", data: { video_url: "/assets/t/brand-kit/outro/o.mp4" } }] },
    ],
    spine: {
      sentences: [
        { text: "early", start: 2, end: 5 },
        { text: "inside", start: 21, end: 24 },
        { text: "late", start: 40, end: 44 },
      ],
      chapters: [{ title: "All", start: 0, end: 50, firstSentence: 0, lastSentence: 2 }],
    },
  };
}

describe("applySpeakerCut (re-fit)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes time from voice + follower; the screen keeps every frame and re-fits", async () => {
    const p = film();
    // Cut film 26.1..32.1 = bake/scene-local 20..26 = source 20..26.
    const res = await applySpeakerCut(p, 26.1, 32.1, DATA_DIR);

    expect(res.removed_seconds).toBeCloseTo(6, 2);
    expect(p.speaker.clips[0].edl.cuts).toEqual([{ src_start: 20, src_end: 26 }]);

    // SCREEN: no cut injected -- content preserved end to end.
    const sc = p.scenes[1].media_edits.screencast;
    expect(sc.cuts).toEqual([]);
    for (const t of [10, 23, 45, 59]) expect(srcCovered(sc.segments, t)).toBe(true);
    // The map re-fits into the shorter scene.
    expect(outLen(sc.segments)).toBeCloseTo(54, 0);
    // Sync frozen up to the seam: the pre-seam span still plays 1:1.
    expect(sc.segments[0].src_start).toBe(0);
    expect(sc.segments[0].rate).toBeCloseTo(1, 2);
    // Pin inside the removed span dropped; later pin rides its word left.
    const words = sc.pins.map((x: any) => x.word);
    expect(words).not.toContain("mid");
    expect(sc.pins.find((x: any) => x.word === "late").out).toBeCloseTo(44, 1);
    // Tagged anchors present: seam + terminal.
    expect(sc.pins.some((x: any) => x.auto === "refit-20.00")).toBe(true);
    const term = sc.pins.find((x: any) => x.auto === "refit-end");
    expect(term.out).toBeCloseTo(54, 1);

    // FOLLOWER: mirrors the voice cut on the shared source clock.
    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    expect(cam.cuts).toEqual([{ src_start: 20, src_end: 26 }]);
    expect(res.screen_cut).toEqual({ src_start: 20, src_end: 26 });

    // Ripples identical to before: duration, captions, spine, bake.
    expect(p.scenes[1].duration_seconds).toBeCloseTo(54, 1);
    const caps = p.scenes[1].components[1].data.captions;
    expect(caps.map((c: any) => c.text)).toEqual(["early", "late"]);
    expect(caps[1].start).toBeCloseTo(34, 2);
    expect(p.spine.sentences.map((s: any) => s.text)).toEqual(["early", "late"]);
    expect(cutAudioTo).toHaveBeenCalledTimes(1);
    expect((cutAudioTo as any).mock.calls[0][1]).toEqual([{ from: 0, to: 20 }, { from: 26, to: 91.2 }]);
    expect(p.audio.tracks[0].source).toBe(res.narration_url);
  });

  it("cut through a screen timelapse window: still no screen cut, seam anchor lands in source terms", async () => {
    const p = film();
    p.scenes[1].media_edits.screencast.segments = [
      { src_start: 0, src_end: 10, rate: 1 },
      { src_start: 10, src_end: 50, rate: 8 },
      { src_start: 50, src_end: 60, rate: 1 },
    ];
    p.scenes[1].media_edits.screencast.pins = [];
    p.scenes[1].duration_seconds = 25;
    // Film 18.1..20.1 = scene-local 12..14 -> inside the 8x window; the
    // seam is at source 26.
    await applySpeakerCut(p, 18.1, 20.1, DATA_DIR);
    const sc = p.scenes[1].media_edits.screencast;
    expect(sc.cuts).toEqual([]);
    expect(sc.pins.find((x: any) => x.auto === "refit-12.00").src).toBeCloseTo(26, 1);
    expect(outLen(sc.segments)).toBeCloseTo(23, 0);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(23, 1);
  });

  it("maps through EXISTING speaker cuts (second cut lands after the first)", async () => {
    const p = film();
    p.speaker.clips[0].edl.cuts = [{ src_start: 10, src_end: 20 }];
    await applySpeakerCut(p, 26.1, 29.1, DATA_DIR); // bake 20..23 -> source 30..33
    expect(p.speaker.clips[0].edl.cuts).toEqual([
      { src_start: 10, src_end: 20 },
      { src_start: 30, src_end: 33 },
    ]);
  });

  it("rejects spans outside the narrated scene", async () => {
    const p = film();
    await expect(applySpeakerCut(p, 2, 8, DATA_DIR)).rejects.toThrow(/single narrated scene/);
  });
});

describe("applySpeakerRestore (reverse referee)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("round-trip: cut then restore returns duration, follower, anchors and caption times", async () => {
    const p = film();
    await applySpeakerCut(p, 26.1, 32.1, DATA_DIR);
    const res = await applySpeakerRestore(p, 20, 26, DATA_DIR);

    expect(res.restored_seconds).toBeCloseTo(6, 2);
    expect(p.speaker.clips[0].edl.cuts).toEqual([]);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(60, 1);

    const sc = p.scenes[1].media_edits.screencast;
    expect(sc.cuts).toEqual([]);
    expect(sc.pins.some((x: any) => x.auto === "refit-20.00")).toBe(false);
    expect(sc.pins.find((x: any) => x.word === "late").out).toBeCloseTo(50, 1);
    expect(sc.pins.find((x: any) => x.auto === "refit-end").out).toBeCloseTo(60, 1);
    expect(outLen(sc.segments)).toBeCloseTo(60, 0);
    // The relaxed map plays 1:1 again everywhere.
    for (const seg of sc.segments) expect(Math.abs((seg.rate || 1) - 1)).toBeLessThan(0.05);

    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    expect(cam.cuts).toEqual([]);

    // Surviving captions back at their original times ("inside" is gone for good).
    const caps = p.scenes[1].components[1].data.captions;
    expect(caps.map((c: any) => c.text)).toEqual(["early", "late"]);
    expect(caps[1].start).toBeCloseTo(40, 2);
    expect(p.scenes[1].components[1].data.chapters[0].at).toBeCloseTo(45, 2);
    expect(p.spine.sentences[1].start).toBeCloseTo(40, 2);

    // Zero cuts remain -> no bake: the ORIGINAL take is the rendering and
    // the narration track points straight at it.
    expect(res.narration_url).toBe("/assets/t/projects/p/assets/cam.webm");
    expect(p.audio.tracks[0].source).toBe(res.narration_url);
  });

  it("throws when no matching cut exists", async () => {
    const p = film();
    await expect(applySpeakerRestore(p, 1, 2, DATA_DIR)).rejects.toThrow(/no matching/);
  });
});

describe("applySpeakerCut on a film with NO media-edits entries (seeding)", () => {
  beforeEach(() => vi.clearAllMocks());

  function bareFilm(): any {
    // Same film, but assembly made no idle-silence cuts, so the scene has
    // no media_edits at all -- the common case for a clean recording. The
    // camera bubble still exists as a component (assembly always adds it
    // when a camera track was recorded).
    const p = film();
    delete p.scenes[1].media_edits;
    p.scenes[1].components.push({
      id: "camera_pip", type: "screencast-frame",
      data: { video_url: "/assets/t/projects/p/assets/cam.webm", frame_style: "none" },
    });
    return p;
  }

  it("seeds screen + follower entries so the cut re-fits instead of truncating", async () => {
    const p = bareFilm();
    const res = await applySpeakerCut(p, 26.1, 32.1, DATA_DIR); // scene-local 20..26
    expect(res.removed_seconds).toBeCloseTo(6, 2);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(54, 1);

    // SCREEN: entry created; all previously-visible footage still mapped.
    const sc = p.scenes[1].media_edits.screencast;
    expect(sc).toBeTruthy();
    expect(sc.cuts).toEqual([]);
    expect(sc.pins.some((x: any) => x.auto === "refit-20.00")).toBe(true);
    expect(sc.pins.find((x: any) => x.auto === "refit-end").out).toBeCloseTo(54, 1);
    expect(outLen(sc.segments)).toBeCloseTo(54, 0);
    expect(srcCovered(sc.segments, 58)).toBe(true); // the tail survives

    // FOLLOWER: entry created carrying the mirrored cut (lips match).
    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    expect(cam).toBeTruthy();
    expect(cam.cuts).toEqual([{ src_start: 20, src_end: 26 }]);
    expect(p.speaker.clips[0].edl.cuts).toEqual([{ src_start: 20, src_end: 26 }]);
  });

  it("follower seed carries EXISTING speaker cuts, then mirrors the new one", async () => {
    const p = bareFilm();
    p.speaker.clips[0].edl.cuts = [{ src_start: 10, src_end: 20 }];
    await applySpeakerCut(p, 26.1, 29.1, DATA_DIR); // bake 20..23 -> source 30..33
    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    expect(cam.cuts).toEqual([
      { src_start: 10, src_end: 20 },
      { src_start: 30, src_end: 33 },
    ]);
  });

  it("round-trips: restore after a seeded cut returns the full scene", async () => {
    const p = bareFilm();
    await applySpeakerCut(p, 26.1, 32.1, DATA_DIR);
    const res = await applySpeakerRestore(p, 20, 26, DATA_DIR);
    expect(res.restored_seconds).toBeCloseTo(6, 2);
    expect(p.scenes[1].duration_seconds).toBeCloseTo(60, 1);
    const sc = p.scenes[1].media_edits.screencast;
    expect(sc.pins.some((x: any) => x.auto && x.auto !== "refit-end")).toBe(false);
    expect(outLen(sc.segments)).toBeCloseTo(60, 0);
    const cam = p.scenes[1].media_edits['video[src*="cam.webm"]'];
    expect(cam.cuts).toEqual([]);
  });
});
