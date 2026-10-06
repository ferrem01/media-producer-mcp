import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { posterSourceFor } from "../src/core/take-poster.js";

// THE LANE WEARS WHAT PLAYS (Oct 6): after a HeyGen recast landed, the speaker
// lane (and the board card) still showed the raw recording, and Studio kept
// the words and waveform it had fetched before the takes -- "it updates the
// preview area but the scrubber is not updated".
describe("the take's picture and lanes follow what the scene plays", () => {
  const take = { id: "take_5", scene_index: 5, source: "/data/t/projects/p/assets/take-5.mp4", recorded_at: "", trim_start: 0.2 } as any;
  it("stills the recast copy the clip plays, at the clip's trim", () => {
    const project = { takes: [{ ...take, actors: { "marc-at-his-desk": { file: "/data/t/projects/p/assets/take-5.actor-marc-at-his-desk-heygen.mp4" } } }],
      speaker_track: { clips: [{ scene_index: 5, source: "/data/t/projects/p/assets/take-5.actor-marc-at-his-desk-heygen.mp4", trim_start: 0.017 }] } } as any;
    expect(posterSourceFor(project, project.takes[0])).toEqual({ source: "/data/t/projects/p/assets/take-5.actor-marc-at-his-desk-heygen.mp4", trim: 0.017 });
  });
  it("stills the recording when the scene plays it (or has no clip)", () => {
    expect(posterSourceFor({ takes: [take], speaker_track: { clips: [{ scene_index: 5, source: take.source }] } } as any, take).source).toBe(take.source);
    expect(posterSourceFor({ takes: [take], speaker_track: null } as any, take)).toEqual({ source: take.source, trim: 0.2 });
  });
  it("Studio drops its words and wave when the speaker lane changes outside it, and keys the take still by the playing file", async () => {
    const app = await fs.readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(app).toContain("var laneChanged = speakerLaneKey(state.currentProject) !== speakerLaneKey(project);");
    expect(app).toMatch(/if \(laneChanged\) \{\s*state\._transcript = null; state\._transcriptFor = null;\s*state\._wavePeaks = null; state\._wavePeaksFor = null;/);
    expect(app).toContain("'v=' + encodeURIComponent(String(c.source || '').split('/').pop())");
  });
});
