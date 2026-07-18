/**
 * applySpeakerCut -- the referee (ROADMAP #8 stages 2+4). A speaker cut
 * removes FILM TIME; these tests pin every consequence: bake->source
 * mapping through existing cuts, linked screen/camera EDL updates through
 * their own segment maps, duration ripple, caption/chapter/spine shifts,
 * pin dropping, and the re-derived bake.
 */
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

import { applySpeakerCut, bakeToSourceTime, mergeCut } from "../src/core/speaker-edl.js";
import { cutAudioTo } from "../src/core/idle-silence.js";

describe("bakeToSourceTime", () => {
  it("identity with no cuts", () => {
    expect(bakeToSourceTime([], 12.5)).toBeCloseTo(12.5, 3);
  });
  it("skips over existing cuts", () => {
    const cuts = [{ src_start: 10, src_end: 20 }];
    expect(bakeToSourceTime(cuts, 5)).toBeCloseTo(5, 3);     // before the cut
    expect(bakeToSourceTime(cuts, 10)).toBeCloseTo(20, 3);   // at the seam -> lands after
    expect(bakeToSourceTime(cuts, 15)).toBeCloseTo(25, 3);   // 15 kept seconds = source 25
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

function film(): any {
  // 6.1s intro + 60s walkthrough (1:1 segments, 90s source with an existing
  // 23.55-31.68 assembly cut -> hmm keep simple: source plays 0-60 at 1x) + 5.2s outro.
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

describe("applySpeakerCut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes film time everywhere in one pass", async () => {
    const p = film();
    // Cut film 26.1..32.1 = scene-local 20..26 = bake 20..26 (clip at 6.1).
    const res = await applySpeakerCut(p, 26.1, 32.1, "/nonexistent");

    expect(res.removed_seconds).toBeCloseTo(6, 2);
    // Speaker EDL got the source-clock cut (no prior cuts -> same numbers).
    expect(p.speaker.clips[0].edl.cuts).toEqual([{ src_start: 20, src_end: 26 }]);
    // Screen EDL: same film span mapped through 1:1 segments.
    const me = p.scenes[1].media_edits.screencast;
    expect(me.cuts).toEqual([{ src_start: 20, src_end: 26 }]);
    expect(me.proposed).toBe(false);
    // Solver rebuilt segments around the cut: the removed source span is
    // gone from the map, and the map's output length matches the new scene.
    for (const seg of me.segments) {
      expect(seg.src_end <= 20 || seg.src_start >= 26).toBe(true);
    }
    const outLen = me.segments.reduce((t: number, s: any) => t + (s.src_end - s.src_start) / (s.rate || 1), 0);
    expect(outLen).toBeCloseTo(54, 0);
    // Pin inside the cut dropped; later pin survives.
    expect(me.pins.map((x: any) => x.word)).toEqual(["late"]);
    // Scene shrank; bookends untouched.
    expect(p.scenes[1].duration_seconds).toBeCloseTo(54, 1);
    expect(p.scenes[0].duration_seconds).toBeCloseTo(6.1, 2);
    // Captions: inside dropped, late shifted left 6, early untouched.
    const caps = p.scenes[1].components[1].data.captions;
    expect(caps.map((c: any) => c.text)).toEqual(["early", "late"]);
    expect(caps[1].start).toBeCloseTo(34, 2);
    // Chapter moment shifted.
    expect(p.scenes[1].components[1].data.chapters[0].at).toBeCloseTo(39, 2);
    // Spine (bake clock) mirrors it.
    expect(p.spine.sentences.map((s: any) => s.text)).toEqual(["early", "late"]);
    expect(p.spine.sentences[1].start).toBeCloseTo(34, 2);
    // Bake re-derived from the ORIGINAL through the new cut list.
    expect(cutAudioTo).toHaveBeenCalledTimes(1);
    expect((cutAudioTo as any).mock.calls[0][1]).toEqual([{ from: 0, to: 20 }, { from: 26, to: 91.2 }]);
    expect(p.audio.tracks[0].source).toBe(res.narration_url);
    expect(p.audio.tracks[0].start_time).toBeCloseTo(6.1, 2);
  });

  it("maps through EXISTING speaker cuts (second cut lands after the first)", async () => {
    const p = film();
    p.speaker.clips[0].edl.cuts = [{ src_start: 10, src_end: 20 }]; // bake skips source 10-20
    await applySpeakerCut(p, 26.1, 29.1, "/nonexistent"); // bake 20..23 -> source 30..33
    expect(p.speaker.clips[0].edl.cuts).toEqual([
      { src_start: 10, src_end: 20 },
      { src_start: 30, src_end: 33 },
    ]);
  });

  it("cut through a timelapse region maps to the wider source span", async () => {
    const p = film();
    // Screen: 0-10 at 1x, 10-50 at 8x (5s of film), 50-60 at 1x -> scene 25s… keep scene dur consistent: set segments + duration.
    p.scenes[1].media_edits.screencast.segments = [
      { src_start: 0, src_end: 10, rate: 1 },
      { src_start: 10, src_end: 50, rate: 8 },
      { src_start: 50, src_end: 60, rate: 1 },
    ];
    p.scenes[1].duration_seconds = 25;
    // Cut film 6.1+12 .. 6.1+14 = scene-local 12..14 -> inside the 8x window
    // (local 10..15 covers source 10..50) -> source 26..42.
    const res = await applySpeakerCut(p, 18.1, 20.1, "/nonexistent");
    expect(res.screen_cut).toEqual({ src_start: 26, src_end: 42 });
  });

  it("rejects spans outside the narrated scene", async () => {
    const p = film();
    await expect(applySpeakerCut(p, 2, 8, "/nonexistent")).rejects.toThrow(/single narrated scene/);
  });
});
