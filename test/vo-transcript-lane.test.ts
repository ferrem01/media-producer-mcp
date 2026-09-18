import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the word lane on a film with generated narration", () => {
  it("transcribes every per-scene voiceover file and lays its words on the film clock at the track's start", async () => {
    const index = await read("src/index.ts");
    // Measured live (proj_a2d3722f): only the first file was transcribed, so
    // the lane showed scene 1's words and nothing for the rest of the film.
    expect(index).toMatch(/const voTracks2 = \(\(project as any\)\.audio\?\.tracks \|\| \[\]\)\.filter\(\(t: any\) => t\.type === "voiceover" && t\.source\)/);
    expect(index).toMatch(/if \(!spSrc2 && voTracks2\.length > 1\) \{[\s\S]*?const off = Number\(t\.start_time\) \|\| 0;[\s\S]*?segsAll\.push\(\{ \.\.\.sg, start: sg\.start \+ off, end: sg\.end \+ off \}\)/);
    expect(index).toMatch(/"thumbs", "vo", path\.basename\(t\.source\)/); // cached per file, not one transcript.json for all six
    expect(index).toMatch(/segments: segsAll, per_scene: true/);
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/state\._transcriptPerScene = !!r\.per_scene;/);
    expect(desktop).toMatch(/var wOff = \(state\._transcriptPerScene \|\| speakerTrackIsPerScene\(\)\) \? 0 :/);
  });
});
