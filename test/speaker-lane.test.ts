import { describe, it, expect } from "vitest";
import { laneClips, laneWords, lanePeaks, isPerSceneTrack } from "../src/core/speaker-lane.js";

const project: any = {
  scenes: [{ duration_seconds: 10.87 }, { duration_seconds: 6.62 }, { duration_seconds: 7.92 }],
  speaker_track: { clips: [
    { source: "/a/t0.mp4", start: 0, scene_index: 0, trim_start: 0.11, trim_end: 10.98 },
    { source: "/a/t1.mp4", start: 0, scene_index: 1, trim_start: 1.63, trim_end: 8.25 },
    { source: "/a/t2.mp4", start: 0, scene_index: 2, trim_start: 1.05, trim_end: 8.97 },
  ] },
};

describe("the speaker lane of a per-scene take track (Studio timeline)", () => {
  it("lays each take at its scene's film start with its own window", () => {
    const lane = laneClips(project)!;
    expect(lane.map((c) => [c.scene_index, c.film_start, c.trim_start])).toEqual([[0, 0, 0.11], [1, 10.87, 1.63], [2, 17.49, 1.05]]);
    expect(laneClips({ scenes: project.scenes, speaker_track: { clips: [{ source: "/a/all.mp4", start: 0 }] } } as any)).toBeNull();
    expect(isPerSceneTrack(undefined)).toBe(false);
    expect(laneClips({ scenes: [], speaker_track: project.speaker_track } as any)).toBeNull(); // markers, nothing to lay them on
  });
  it("puts every take's words on the film clock, windowed to the take (measured live: only take one's words showed)", () => {
    const lane = laneClips(project)!;
    const words = laneWords(lane, {
      "/a/t0.mp4": [{ text: "Every", start: 0.2, end: 0.5 }, { text: "week", start: 0.5, end: 0.8 }],
      "/a/t1.mp4": [{ text: "breath", start: 0.4, end: 0.9 }, { text: "Now", start: 1.7, end: 2.0 }, { text: "late", start: 9.0, end: 9.3 }],
      "/a/t2.mp4": [{ text: "One", start: 1.1, end: 1.4 }],
    });
    expect(words.map((w) => w.text)).toEqual(["Every", "week", "Now", "One"]);       // before the trim and after the window are gone
    expect(words.find((w) => w.text === "Now")!.start).toBeCloseTo(10.87 + (1.7 - 1.63), 3);
    expect(words.find((w) => w.text === "One")!.start).toBeCloseTo(17.49 + (1.1 - 1.05), 3);
  });
  it("stitches the waveform from each take's window at its scene, silence between", () => {
    const lane = laneClips(project)!;
    const flat = (v: number, secs: number, bps = 6) => new Array(Math.ceil(secs * bps)).fill(v);
    const peaks = lanePeaks(lane, { "/a/t0.mp4": { peaks: flat(0.2, 12), bucketsPerSecond: 6 }, "/a/t1.mp4": { peaks: flat(0.5, 9), bucketsPerSecond: 6 }, "/a/t2.mp4": null }, 25.41, 6);
    expect(peaks.length).toBe(Math.ceil(25.41 * 6));
    expect(peaks[Math.floor(5 * 6)]).toBe(0.2);
    expect(peaks[Math.floor(13 * 6)]).toBe(0.5);
    expect(peaks[Math.floor(20 * 6)]).toBe(0);                                      // no peaks for take three: silence, not take one's
  });
});
