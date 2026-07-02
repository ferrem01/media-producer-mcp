import { describe, it, expect } from "vitest";
import {
  normalizeBeats,
  rescaleBeats,
  beatTimeline,
  beatMidpoints,
  formatBeatSheet,
  beatsVoiceover,
} from "../src/core/beats.js";
import type { SceneBeat } from "../src/core/types.js";

const sum = (beats: SceneBeat[]) => beats.reduce((s, b) => s + b.duration_seconds, 0);

describe("normalizeBeats", () => {
  it("converts duration_bars to seconds via the bar grid and fills the scene exactly", () => {
    const beats = normalizeBeats(
      [
        { label: "a", duration_bars: 2, action: "cursor glides in" },
        { label: "b", duration_bars: 2, action: "card blooms open" },
      ],
      8, // scene: 8s; 2+2 bars at 2s/bar = 8s
      2,
    )!;
    expect(beats).toHaveLength(2);
    expect(beats[0].duration_seconds).toBe(4);
    expect(sum(beats)).toBeCloseTo(8, 2);
  });

  it("rescales stated seconds proportionally to fill the scene", () => {
    const beats = normalizeBeats(
      [
        { label: "a", duration_seconds: 2, action: "x" },
        { label: "b", duration_seconds: 2, action: "y" },
      ],
      10,
    )!;
    expect(beats[0].duration_seconds).toBeCloseTo(5, 1);
    expect(sum(beats)).toBeCloseTo(10, 2);
  });

  it("shares the scene equally when no durations are stated", () => {
    const beats = normalizeBeats(
      [{ label: "a", action: "x" }, { label: "b", action: "y" }, { label: "c", action: "z" }],
      9,
    )!;
    expect(beats.map((b) => b.duration_seconds)).toEqual([3, 3, 3]);
  });

  it("drops beats without an action and returns undefined below 2 usable beats", () => {
    expect(normalizeBeats([{ label: "a", action: "x" }, { label: "b" }], 10)).toBeUndefined();
    expect(normalizeBeats([], 10)).toBeUndefined();
    expect(normalizeBeats("nope", 10)).toBeUndefined();
    expect(normalizeBeats(undefined, 10)).toBeUndefined();
  });

  it("accepts 'description' as an alias for action and defaults labels", () => {
    const beats = normalizeBeats(
      [{ description: "the reveal happens" }, { description: "the settle" }],
      6,
    )!;
    expect(beats[0].action).toBe("the reveal happens");
    expect(beats[0].label).toBe("beat 1");
  });
});

describe("rescaleBeats", () => {
  it("preserves the exact sum after quantization changes the scene duration", () => {
    const beats: SceneBeat[] = [
      { label: "a", duration_seconds: 4, action: "x" },
      { label: "b", duration_seconds: 4, action: "y" },
      { label: "c", duration_seconds: 8, action: "z" },
    ];
    rescaleBeats(beats, 17.14); // bar-quantized scene length
    expect(sum(beats)).toBeCloseTo(17.14, 2);
    // proportions roughly kept: c stays ~2x a
    expect(beats[2].duration_seconds / beats[0].duration_seconds).toBeGreaterThan(1.8);
  });
});

describe("beatTimeline / beatMidpoints", () => {
  const beats: SceneBeat[] = [
    { label: "a", duration_seconds: 4, action: "x" },
    { label: "b", duration_seconds: 6, action: "y" },
  ];

  it("resolves cumulative start/end positions", () => {
    const timed = beatTimeline(beats);
    expect(timed[0]).toMatchObject({ start_seconds: 0, end_seconds: 4 });
    expect(timed[1]).toMatchObject({ start_seconds: 4, end_seconds: 10 });
  });

  it("midpoints land at the center of each beat", () => {
    expect(beatMidpoints(beats)).toEqual([2, 7]);
  });
});

describe("formatBeatSheet", () => {
  it("renders each beat as a timed segment with its action and VO", () => {
    const sheet = formatBeatSheet([
      { label: "the pile-up", duration_seconds: 4, action: "notifications stack", voiceover_text: "Too many tools." },
      { label: "the reveal", duration_seconds: 6, action: "one panel remains" },
    ]);
    expect(sheet).toContain('BEAT 1 "the pile-up" (0.0s -> 4.0s): notifications stack [VO: "Too many tools."]');
    expect(sheet).toContain('BEAT 2 "the reveal" (4.0s -> 10.0s): one panel remains');
    expect(sheet).toContain("tl.addLabel");
  });
});

describe("beatsVoiceover", () => {
  it("concatenates per-beat narration in order", () => {
    expect(beatsVoiceover([
      { label: "a", duration_seconds: 2, action: "x", voiceover_text: "One." },
      { label: "b", duration_seconds: 2, action: "y" },
      { label: "c", duration_seconds: 2, action: "z", voiceover_text: "Two." },
    ])).toBe("One. Two.");
    expect(beatsVoiceover([{ label: "a", duration_seconds: 2, action: "x" }])).toBeUndefined();
  });
});
