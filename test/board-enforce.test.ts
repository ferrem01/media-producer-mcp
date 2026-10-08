import { describe, it, expect } from "vitest";
import { enforceBoard, numberedBriefLines, briefTargetSeconds, boardLengthForLine, capSceneSounds } from "../src/llm/board-enforce.js";

// The Six Tabs relay remake (proj_2e79b8e2, Oct 8): six numbered lines in
// Marc's voice, "~22 s" -- the board came back silent, 41 s, fifteen cues.
const BRIEF = `Six Tabs (relay remake) -- a ~22 s vertical ad.

Six beats, one line each:
1. "Still opening six tabs to answer one question?" -- six real app windows slam.
2. "Analytics, email, social, CRM, spreadsheet..." -- the flood contracts.
3. "...and you still can't say which campaign got the registration." -- the chips pile up.`;

const board = () => [0, 1, 2].map((i) => ({
  duration_seconds: 7.5,
  voiceover_text: undefined as string | undefined,
  components: [{ type: "tool-storm", data: { at: 0.2, duration: 4.2, script: [{ at: 6.2, text: "x" }], region: { x: 0, y: 0, w: 1, h: 1 } }, anchors: { at: { word: "six" } } }],
  sfx: [
    { at: 0.2, role: "attention" },
    { at: 3, id: "house-click" },
    { at: 5.2, role: "transition" },
    { at: 6, id: "house-wrong", role: "wrong" },
  ],
}));

describe("the board is enforced, not warned about", () => {
  it("reads the brief's numbered lines and its length", () => {
    expect(numberedBriefLines(BRIEF)).toEqual([
      "Still opening six tabs to answer one question?",
      "Analytics, email, social, CRM, spreadsheet...",
      "...and you still can't say which campaign got the registration.",
    ]);
    expect(numberedBriefLines('1. "One line only" here')).toEqual([]);
    expect(numberedBriefLines('1. "a b c d"\n3. "skipped two"')).toEqual([]);
    expect(briefTargetSeconds(BRIEF)).toBe(22);
    expect(briefTargetSeconds("a 30-second ad")).toBe(30);
    expect(briefTargetSeconds("no length here, 6 tabs")).toBeUndefined();
  });

  it("a voiced board: the lines go on their beats, each scene runs as long as its line, its cast's times scale with it", () => {
    const scenes = board();
    const { log } = enforceBoard(scenes, { brief: BRIEF, voiced: true });
    expect(scenes.map((s) => s.voiceover_text)).toEqual(numberedBriefLines(BRIEF));
    const want = boardLengthForLine(scenes[0].voiceover_text!);
    expect(scenes[0].duration_seconds).toBe(want);
    expect(want).toBeGreaterThan(2.5);
    expect(want).toBeLessThan(4.5);
    const f = want / 7.5;
    const d = scenes[0].components[0].data;
    expect(d.at).toBeCloseTo(0.2 * f, 2);
    expect(d.duration).toBeCloseTo(4.2 * f, 2);
    expect(d.script[0].at).toBeCloseTo(6.2 * f, 2);
    expect(d.region).toEqual({ x: 0, y: 0, w: 1, h: 1 });           // geometry is not time
    expect(scenes[0].components[0].anchors).toEqual({ at: { word: "six" } });
    expect(log.join(" ")).toMatch(/lines put on scene\(s\) 1, 2, 3/);
  });

  it("a board whose scenes are not the beats is not stamped: it is said so", () => {
    // proj_84048b0d: scene 1 held beats 1-2 (merged), the rest were invented
    const scenes = board();
    scenes[0].voiceover_text = "Still opening six tabs to answer one question? Analytics, email, social, CRM, spreadsheet...";
    scenes[1].voiceover_text = "Lock the date: October 20th.";
    const { log, warnings } = enforceBoard(scenes, { brief: BRIEF, voiced: true });
    expect(scenes[1].voiceover_text).toBe("Lock the date: October 20th.");
    expect(log.join(" ")).not.toMatch(/lines put on/);
    expect(warnings[0]).toMatch(/do not follow them one to one/);
    // the writer's own lines that DO read as their beats are stamped exact
    const ok = board();
    ok[0].voiceover_text = "Still opening *six tabs* to answer a question?";
    expect(enforceBoard(ok, { brief: BRIEF, voiced: true }).warnings).toEqual([]);
    expect(ok[0].voiceover_text).toBe("Still opening six tabs to answer one question?");
  });

  it("one quiet cue a scene, no meme stings; the strongest job wins", () => {
    const scenes = board();
    enforceBoard(scenes, { brief: BRIEF, voiced: true });
    for (const s of scenes) {
      expect(s.sfx).toHaveLength(1);
      expect(s.sfx[0].role).toBe("transition");
      expect(s.sfx[0].volume).toBe(0.3);
    }
    const pay = [{ sfx: [{ at: 1, role: "transition" }, { at: 2, role: "payoff", volume: 0.9 }] }];
    capSceneSounds(pay);
    expect(pay[0].sfx).toEqual([{ at: 2, role: "payoff", volume: 0.35 }]);
    // one payoff a film: the last one stays (proj_84048b0d had three)
    const three = [0, 1, 2].map(() => ({ sfx: [{ at: 1, role: "payoff" }] }));
    capSceneSounds(three);
    expect(three.map((s) => s.sfx.length)).toEqual([0, 0, 1]);
    const meme = [{ sfx: [{ at: 0.2, role: "attention" }] }];
    capSceneSounds(meme, { memes: true });
    expect(meme[0].sfx).toHaveLength(1);
  });

  it("unvoiced: scaled to the brief's length; a recipe or a person's take keeps its own seconds", () => {
    const silent = board();
    for (const s of silent) s.duration_seconds = 12;   // 36 s against "~22 s"
    enforceBoard(silent, { brief: BRIEF });
    expect(silent.reduce((a, s) => a + s.duration_seconds, 0)).toBeCloseTo(22, 0);
    expect(silent.every((s) => !s.voiceover_text)).toBe(true);
    const recipe = board();
    enforceBoard(recipe, { brief: BRIEF, voiced: true, recipe: true });
    expect(recipe.every((s) => s.duration_seconds === 7.5)).toBe(true);
    const person = board();
    enforceBoard(person, { brief: BRIEF, personCarries: true });
    expect(person[0].voiceover_text).toBe("Still opening six tabs to answer one question?");
    expect(person.every((s) => s.duration_seconds === 7.5)).toBe(true);
  });

  it("is wired into the pipeline and the writer is told the film has a narrator", async () => {
    const fs = await import("node:fs/promises");
    const pipeline = await fs.readFile("src/llm/pipeline.ts", "utf8");
    expect(pipeline).toMatch(/enforceBoard\(storyboard\.scenes/);
    expect(pipeline).toMatch(/opts\.voiceover === undefined && opts\.audio_system\?\.voice\) opts\.voiceover = true/);
    expect(pipeline).toMatch(/voiced: !!opts\.voiceover \|\| recipeWantsVoice\(recipeObj\)/);
    const builder = await fs.readFile("src/llm/storyboard-builder.ts", "utf8");
    expect(builder).toMatch(/THIS FILM HAS A NARRATOR/);
    expect(builder).toMatch(/\$\{briefBeatsBlock\(opts\.rawPrompt \|\| opts\.prompt\)\}/);
    expect(builder).toMatch(/PEOPLE ARE NAMED BY THE BRIEF/);
    expect(pipeline).toMatch(/warnings\.push\(\.\.\.boardWarnings\);/);
    expect(builder).not.toMatch(/FAHHH/);
  });
});
