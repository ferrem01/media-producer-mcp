import { describe, it, expect } from "vitest";
import { retimeScene } from "../src/core/measured-spine.js";
import { measuredSpine, alignToScript, extractAnchors, applySpine } from "../src/core/word-anchors.js";
import { captionLane } from "../src/core/captions.js";

// A NARRATED FILM KEEPS ITS MEASURED CLOCK (Oct 13, proj_7d4e0c84): a board
// sfx edit on a TTS-narrated film (no takes) re-timed each scene against an
// estimate spread over the BOARD's duration (3.5 s for an 8.37 s line). The
// "@execute" cue landed at 2.16 s, not 4.9 s, and every caption drifted.

const SCRIPT = "It only takes you halfway. But it doesn't execute your marketing.";
const TIMES = [0.02, 0.12, 0.42, 0.6, 0.88, 3.98, 4.22, 4.42, 4.9, 5.16, 5.48];

function narratedProject() {
  const words = SCRIPT.split(" ").map((w, i) => ({ text: w, start: TIMES[i], end: TIMES[i] + 0.25 }));
  const spine = alignToScript(measuredSpine(words, 8.37), SCRIPT);
  const lane: any = { id: "captions", type: "reel-caption-lane", ...captionLane(spine, [])! };
  const built: any = { id: "scene_002", duration_seconds: 8.37, components: [lane], audio_hints: { voiceover_text: SCRIPT } };
  for (const c of built.components) extractAnchors(c);
  applySpine(built, spine);
  const board: any = { voiceover_text: SCRIPT, duration_seconds: 3.5, spine: JSON.parse(JSON.stringify(spine)),
    sfx: [{ at: 0, anchor: { word: "execute" }, role: "transition", id: "house-camera-flash" }] };
  built.sfx = JSON.parse(JSON.stringify(board.sfx));
  return { project: { tenant_id: "t", project_id: "p", scenes: [built], storyboard: { scenes: [board] } } as any, lane };
}

describe("retimeScene on a narrated film (no take)", () => {
  it("keeps the measured spine and resolves cues against it", async () => {
    const { project } = narratedProject();
    const phrasesBefore = JSON.stringify(project.scenes[0].components[0].data.phrases);
    await retimeScene(project, 0);
    const built = project.scenes[0];
    expect(built.spine.source).toBe("measured");
    expect(built.duration_seconds).toBe(8.37);
    expect(built.sfx[0].at).toBeCloseTo(4.9, 2);
    expect(project.storyboard.scenes[0].sfx[0].at).toBeCloseTo(4.9, 2);
    expect(JSON.stringify(built.components[0].data.phrases)).toBe(phrasesBefore);
  });

  it("estimates only when the line changed and no measured words fit it", async () => {
    const { project } = narratedProject();
    const edited = "A completely different line now.";
    project.storyboard.scenes[0].voiceover_text = edited;
    project.scenes[0].audio_hints.voiceover_text = edited;
    await retimeScene(project, 0);
    expect(project.scenes[0].spine.source).toBe("asserted");
  });
});
