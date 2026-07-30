import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// Speaker films through the AUTHORED path: the camera recording is the base
// layer. proj_11bcf413 (a Veo talking head driving speaker-screencast)
// measured the failure modes these guards pin: an opaque world backdrop
// buried the speaker, the board filled 84% of frame instead of docking,
// and -- with speaker_source alone -- nothing was ever transcribed, so the
// storyboard invented dialogue and budgeted 17s for an 8s take.

describe("authored compositions in speaker films", () => {
  it("skip the opaque world backdrop and dock content beside the speaker", async () => {
    const sg = await read("../src/llm/scene-generator.ts");
    expect(sg).toMatch(/speakerBase = !!opts\.hasSpeakerTrack/);
    expect(sg).toMatch(/speakerBase \? \[\] :/);              // no backdrop component
    expect(sg).toMatch(/SPEAKER-VISIBLE LAYOUT/);
    expect(sg).toMatch(/pct\(62, dockRows\[k\]\[0\], 35/);    // right-third dock
    expect(sg).toMatch(/pct\(4, spRows\[k\]\[0\], 54/);       // lower-left captions
  });

  it("treat the camera base like a dark backdrop for ink", async () => {
    const sg = await read("../src/llm/scene-generator.ts");
    expect(sg).toMatch(/overLiveBase = mediaBackdrop \|\| speakerBase/);
  });
});

describe("narration-first for speaker_source", () => {
  it("the pipeline transcribes the recording and pins the storyboard to it", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toMatch(/Narration-first: a provided speaker recording IS the script/);
    expect(p).toMatch(/opts\.speaker_source && format !== "image"/);
    expect(p).toMatch(/RECORDED NARRATION \(the speaker recording -- this IS the soundtrack and the clock\)/);
    expect(p).toMatch(/QUOTE its span of the narration verbatim/);
  });
});
