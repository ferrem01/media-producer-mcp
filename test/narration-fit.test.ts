import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

// Six Tabs re-voiced at 1.2x held dead air: the build only ever LENGTHENED a
// scene to its line (Marc, Oct 8: "make them compelling and viral"). The
// narration is the clock now -- both ways -- and its words are the spine.
describe("the narration is the clock", () => {
  it("a scene runs its line plus a breath, shorter or longer -- never rounded up to a bar", async () => {
    const { sceneLengthForLine, NARRATION_TAIL_S, NARRATION_MIN_S } = await import("../src/core/narration-fit.js");
    expect(sceneLengthForLine(3.2)).toBe(Math.round((3.2 + NARRATION_TAIL_S) * 100) / 100);
    expect(sceneLengthForLine(0.4)).toBe(NARRATION_MIN_S);
  });

  it("fits every narrated scene, re-times anchored words, places the lines, trims the music", async () => {
    const { fitScenesToNarration } = await import("../src/core/narration-fit.js");
    const project: any = {
      scenes: [
        { id: "s1", duration_seconds: 6, components: [{ id: "c", type: "x", data: { at: 1 }, anchors: { at: { word: "six" } } }] },
        { id: "s2", duration_seconds: 7, components: [] },
        { id: "s3", duration_seconds: 4, components: [] },
      ],
      storyboard: { scenes: [{ duration_seconds: 5, sfx: [{ at: 1.16, id: "whoosh", anchor: { word: "six" } }], spine: { source: "asserted", words: [{ text: "six", start: 1.16, end: 1.4 }], duration: 5 } }] },
      audio: { tracks: [
        { id: "vo_scene_0", type: "voiceover", source: "a.mp3", start_time: 0 },
        { id: "vo_scene_1", type: "voiceover", source: "b.mp3", start_time: 6 },
        { id: "music_bed", type: "music", source: "m.mp3", duration: 30 },
      ] },
    };
    const spine = { source: "measured" as const, words: [{ text: "Still", start: 0.1, end: 0.4 }, { text: "six", start: 0.9, end: 1.2 }, { text: "tabs", start: 1.2, end: 1.6 }], duration: 2.1 };
    const changes = fitScenesToNarration(project, [{ duration: 2.1, spine }, { duration: 4 }]);
    expect(changes).toEqual([{ scene: 0, from: 6, to: 2.55 }, { scene: 1, from: 7, to: 4.45 }]);
    expect(project.scenes[2].duration_seconds).toBe(4);                 // no line: kept
    expect(project.scenes[0].components[0].data.at).toBe(0.9);           // re-timed onto "six"
    expect(project.scenes[0].spine.duration).toBe(2.55);
    expect(project.audio.tracks[1].start_time).toBe(2.55);               // line 2 at scene 2's start
    expect(project.audio.tracks[2].duration).toBe(11);                    // the music trimmed to the film
    expect(project.storyboard.scenes[0].spine.source).toBe("measured");  // the board on the same clock
    expect(project.storyboard.scenes[0].duration_seconds).toBe(2.55);
    expect(project.storyboard.scenes[0].sfx[0].at).toBe(0.9);
  });

  it("the build and the audio tool share it; the build no longer only lengthens", async () => {
    const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toContain("fitScenesToNarration(project, lines");
    expect(pipeline).not.toContain("Extend scene duration if voiceover is longer");
    const server = await read("src/server.ts");
    expect(server).toMatch(/if \(params\.action === "fit_voiceover"\) \{[\s\S]*?fitScenesToNarration\(project, lines\)/);
  });
});
