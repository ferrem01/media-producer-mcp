/** Booth script drafter: cue sanitizing + film-brief construction (pure). */
import { describe, it, expect } from "vitest";
import { sanitizeCues, describeFilmForScript } from "../src/llm/booth-script.js";

describe("sanitizeCues", () => {
  it("orders, clamps, trims and drops junk", () => {
    const cues = sanitizeCues([
      { at: 12.34, text: "  second   line " },
      { at: -3, text: "clamped to zero" },
      { at: 5, text: "" },
      { at: 200, text: "past the film end" },
      { text: "no time -> t=0" },
    ], 38.2);
    expect(cues).toEqual([
      { at: 0, text: "clamped to zero" },
      { at: 0, text: "no time -> t=0" },
      { at: 12.3, text: "second line" },
    ]);
  });

  it("empty on garbage input", () => {
    expect(sanitizeCues("nope", 30)).toEqual([]);
    expect(sanitizeCues(null, 30)).toEqual([]);
  });
});

describe("describeFilmForScript", () => {
  const project: any = {
    scenes: [
      { id: "intro", duration_seconds: 6, components: [] },
      {
        id: "screencast", duration_seconds: 20, components: [],
        media_edits: { screencast: { segments: [
          { src_start: 0, src_end: 10, rate: 1 },     // 10s real
          { src_start: 10, src_end: 90, rate: 8 },     // 10s timelapse
        ] } },
      },
      { id: "outro", duration_seconds: 5, components: [] },
    ],
  };

  it("lays out bookends, real-time and timelapse spans on the film clock", () => {
    const { brief, filmDur } = describeFilmForScript(project, null);
    expect(filmDur).toBe(31);
    expect(brief).toContain("0.0s-6.0s: branded logo intro");
    expect(brief).toContain("6.0s-16.0s: REAL-TIME");
    expect(brief).toContain("16.0s-26.0s: TIMELAPSE 8x");
    expect(brief).toContain("26.0s-31.0s: branded outro");
  });

  it("maps sidecar events through the EDL to film time and drops cut ones", () => {
    const { brief } = describeFilmForScript(project, {
      navigations: [{ t: 4000, title: "Chat History" }],   // src 4s -> film 6+4=10
      clicks: [{ t: 50_000, label: "Publish" }],           // src 50s in timelapse -> film 6+10+(50-10)/8=21
      chapters: [],
    });
    expect(brief).toContain('at 10.0s: page becomes "Chat History"');
    expect(brief).toContain('at 21.0s: user clicks "Publish"');
  });
});
