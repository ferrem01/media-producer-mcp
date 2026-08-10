import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SURGICAL storyboard ops -- "pass in the scene and regenerate with the
// prompts". The board-level revision re-drafts everything (the first live
// use asked for one new opening scene and got all four scenes
// re-interpreted); the surgical path hands the LLM ONE scene's JSON plus
// read-only board context and SPLICES the result, so the other scenes stay
// byte-identical by construction, not by instruction.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock("../src/llm/client.js", () => ({
  callLLM: vi.fn(async () =>
    "```json\n" + JSON.stringify({
      label: "The New Panel", purpose: "authored surgically", duration_seconds: 6,
      visual_notes: "a fresh panel", beats: [{ label: "beat", duration_seconds: 6, action: "acts" }],
      components: [{ type: "typewriter", data: { text: "hi", at: 0.5 } }],
    }) + "\n```"),
  llmConfigFromEnv: vi.fn(() => ({ provider: "anthropic", apiKey: "x", model: "m" })),
}));

const { reviseDraftSceneSurgical } = await import("../src/llm/storyboard-surgical.js");

function board(): any {
  return {
    project_id: "p", tenant_id: "t", name: "Film", status: "storyboard",
    storyboard: {
      narrative: "Film", estimated_duration: 30,
      scenes: [
        { label: "One", purpose: "a", duration_seconds: 10, beats: [], components: [] },
        { label: "Two", purpose: "b", duration_seconds: 10, beats: [], components: [] },
        { label: "Three", purpose: "c", duration_seconds: 10, beats: [], components: [] },
      ],
    },
  };
}

describe("surgical scene ops splice, never re-draft", () => {
  it("revise replaces exactly one scene; the others stay the same objects", async () => {
    const p = board();
    const before0 = p.storyboard.scenes[0];
    const before2 = p.storyboard.scenes[2];
    const scene = await reviseDraftSceneSurgical(p, { scene_index: 1, feedback: "punch it up" }, {} as any);
    expect(scene.label).toBe("The New Panel");
    expect(p.storyboard.scenes).toHaveLength(3);
    expect(p.storyboard.scenes[0]).toBe(before0);
    expect(p.storyboard.scenes[2]).toBe(before2);
    expect(p.storyboard.scenes[1].label).toBe("The New Panel");
    expect(p.storyboard.estimated_duration).toBe(26);
  });

  it("insert_at 0 pins the new panel at the front and shifts the rest intact", async () => {
    const p = board();
    const before = [...p.storyboard.scenes];
    await reviseDraftSceneSurgical(p, { insert_at: 0, feedback: "cold-open hook" }, {} as any);
    expect(p.storyboard.scenes).toHaveLength(4);
    expect(p.storyboard.scenes[0].label).toBe("The New Panel");
    expect(p.storyboard.scenes.slice(1)).toEqual(before.map((s: any) => expect.objectContaining({ label: s.label })));
    expect(p.storyboard.scenes[1]).toBe(before[0]);
    expect(p.storyboard.estimated_duration).toBe(36);
  });

  it("rejects an out-of-range scene_index instead of guessing", async () => {
    await expect(reviseDraftSceneSurgical(board(), { scene_index: 7, feedback: "x" }, {} as any))
      .rejects.toThrow(/out of range/);
  });

  it("delete splices the scene out without any LLM call, and keeps the last scene safe", async () => {
    const { callLLM } = await import("../src/llm/client.js");
    (callLLM as any).mockClear();
    const p = board();
    const before0 = p.storyboard.scenes[0];
    const removed = await reviseDraftSceneSurgical(p, { delete_index: 1, feedback: "" }, null as any);
    expect(removed.label).toBe("Two");
    expect(p.storyboard.scenes).toHaveLength(2);
    expect(p.storyboard.scenes[0]).toBe(before0);
    expect(p.storyboard.estimated_duration).toBe(20);
    expect(callLLM).not.toHaveBeenCalled();
    // a one-scene board cannot be emptied
    const solo: any = board();
    solo.storyboard.scenes = [solo.storyboard.scenes[0]];
    await expect(reviseDraftSceneSurgical(solo, { delete_index: 0, feedback: "" }, null as any))
      .rejects.toThrow(/last scene/);
  });

  it("the Studio endpoint routes scene_index/insert_at to the surgical queue", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/index.ts"), "utf-8");
    const at = src.indexOf("/api\\/storyboard-revise");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 2400);
    expect(body).toMatch(/scene_index !== undefined \|\| srBody\.insert_at !== undefined/);
    expect(body).toMatch(/queueSurgicalSceneOp/);
    expect(body, "whole-board path must survive as the no-index default").toMatch(/queueStoryboardGeneration/);
  });
});
