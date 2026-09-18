/**
 * The sheet-row test (SPEC-briefs.md): a marketing brief's hook, storyline,
 * must-say lines and end line survive a feedback redraft; real footage is a
 * need on any grammar; a framed mock's crop is not off-canvas content.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBriefLocks, briefLockBlock, missingLocks, previousBoardBlock } from "../src/llm/brief-locks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFile(path.join(__dirname, "..", f), "utf-8");

const BRIEF = `HERO BRAND FILM for Quotient, 25-30 seconds.

OPENING HOOK: a marketer types: "Launch our product update next Tuesday."

STORYLINE (follow this beat for beat): one sentence appears on screen. It bursts into copy, audience, email and social tasks until the marketer is visually buried. Hard cut: Quotient collapses the chaos back into one instruction.

CTA / END LINE, verbatim: "You set the direction. Quotient gets the work done."

Avoid futuristic AI visuals: no "glowing" things.`;

describe("what a brief locks", () => {
  const locks = extractBriefLocks(BRIEF);
  it("keeps the quoted hook and end line, not a one-word quote", () => {
    expect(locks.quotes).toEqual(["Launch our product update next Tuesday.", "You set the direction. Quotient gets the work done."]);
  });
  it("keeps the named sections with their bodies", () => {
    const names = locks.sections.map((s) => s.name);
    expect(names).toContain("opening hook");
    expect(names).toContain("storyline");
    expect(names).toContain("cta / end line");
    expect(locks.sections.find((s) => s.name === "storyline")!.text).toMatch(/Hard cut: Quotient collapses the chaos/);
  });
  it("renders a lock block for the redraft prompt, and nothing for a brief that locks nothing", () => {
    expect(briefLockBlock(locks)).toMatch(/LOCKED BY THE BRIEF[\s\S]*- "Launch our product update next Tuesday\."[\s\S]*STORYLINE:/);
    expect(briefLockBlock(extractBriefLocks("make a nice video"))).toBe("");
  });
  it("finds the locked lines a board dropped, ignoring case, quotes and spacing", () => {
    const board = { scenes: [{ voiceover_text: "launch our product update next tuesday." }, { scene_template: { data: { text: "You set the direction.\nQuotient gets the work done." } } }] };
    expect(missingLocks(board, locks)).toEqual([]);
    expect(missingLocks({ scenes: [{ voiceover_text: "Launch our Q3 product hunt campaign" }] }, locks)).toEqual(locks.quotes);
  });
  it("summarises the previous board scene by scene for the redraft", () => {
    const b = previousBoardBlock({ scenes: [{ label: "The Ask", duration_seconds: 6, voiceover_text: "It starts with one sentence.", components: [{ type: "composer" }], broll_query: "hands typing" }, { label: "Close", scene_template: { type: "st-logo-close" } }] });
    expect(b).toMatch(/1\. The Ask \[6s\] -- components composer -- broll: hands typing/);
    expect(b).toMatch(/2\. Close \[\?s\] -- template st-logo-close/);
    expect(previousBoardBlock(null)).toBe("");
  });
});

describe("the wiring", () => {
  it("a redraft is the brief + its locks + the previous board + the feedback, and the brief is persisted once", async () => {
    const server = await read("src/server.ts");
    expect(server).toMatch(/const brief = String\(params\.prompt \|\| existingProject\.brief \|\|/);
    expect(server).toMatch(/const lockBlock = briefLockBlock\(locks\);/);
    expect(server).toMatch(/const prev = previousBoardBlock\(existingProject\.storyboard\);/);
    expect(server).toMatch(/brief: redraftBrief,/);
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/project\.brief = opts\.brief \|\| project\.brief \|\| opts\.prompt;/);
    expect(pipeline).toMatch(/const missing = missingLocks\(project\.storyboard, locks\);/);
    const types = await read("src/core/types.ts");
    expect(types).toMatch(/  brief\?: string;/);
  });
  it("real footage is a need on any grammar: fetched for every film, laid as the ground on a film nobody carries", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(\(personFilm && \(canDraw \|\| canFetchStock\)\) \|\| canFetchStock\) \{/);
    expect(pipeline).toMatch(/if \(!personFilm\) needFootage\.set\(i, need\.path\);/);
    expect(pipeline).toMatch(/var brollUrlMap = new Map<number, string>\(needFootage\);/);
    const sb = await read("src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/ANY FILM for stock_footage/);
    expect(sb).toMatch(/REAL FOOTAGE -- when the brief's visual direction asks for real footage/);
  });
  it("a framed mock's crop is not off-canvas content", async () => {
    const capture = await read("src/core/capture.ts");
    expect(capture).toMatch(/const framedHere = !!\(el\.closest && el\.closest\("\[data-mp-frame\]"\)\);/);
    expect(capture).toMatch(/if \(\(kind === "button" \|\| kind === "media"\) && !framedHere\) \{/);
    expect(capture).toMatch(/if \(kindHere && !fullBleedIsh && !inFramed && r\.width \* r\.height >= 1500\) \{/);
  });
});
