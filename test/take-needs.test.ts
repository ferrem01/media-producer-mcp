import { describe, it, expect } from "vitest";
import {
  ensureSpeakerNeeds, openTakeNeeds, activeTake, attachTake, waitForTake, resolveTakeWaiters, pendingTakeWaiters,
  TAKE_NEED_DESCRIPTION,
} from "../src/core/take-needs.js";
import { migrateProject } from "../src/persistence/project.js";

function speakerProject(lines: Array<string | undefined>): any {
  return {
    project_id: "proj_t", tenant_id: "t", status: "storyboard",
    canvas: { width: 1080, height: 1920, frame: "9x16", fps: 30, background: "#000" },
    treatment: { filmGrammar: "speaker" },
    storyboard: { narrative: "n", scenes: lines.map((v, i) => ({ label: `S${i + 1}`, voiceover_text: v, duration_seconds: 5, assets: [] })) },
    scenes: [],
  };
}

describe("speaker needs", () => {
  it("a speaker board declares one camera take per scene with spoken lines, carrying the script", () => {
    const p = speakerProject(["Hook line.", undefined, "Close line."]);
    expect(ensureSpeakerNeeds(p)).toBe(true);
    const needs = p.storyboard.scenes.map((s: any) => s.assets.find((a: any) => a.type === "camera_video"));
    expect(needs[0]).toMatchObject({ description: TAKE_NEED_DESCRIPTION, status: "needed", priority: "critical", recording_instructions: "Hook line." });
    expect(needs[1]).toBeUndefined();               // no lines, nothing to record
    expect(needs[2].recording_instructions).toBe("Close line.");
    expect(openTakeNeeds(p)).toEqual([0, 2]);
    expect(ensureSpeakerNeeds(p)).toBe(false);      // idempotent
  });

  it("is only for speaker films", () => {
    const p = speakerProject(["Hook line."]); p.treatment.filmGrammar = "hype-cut";
    expect(ensureSpeakerNeeds(p)).toBe(false);
    expect(p.storyboard.scenes[0].assets).toEqual([]);
  });

  it("follows the script when the board is revised", () => {
    const p = speakerProject(["Hook line."]); ensureSpeakerNeeds(p);
    p.storyboard.scenes[0].voiceover_text = "Better hook.";
    expect(ensureSpeakerNeeds(p)).toBe(true);
    expect(p.storyboard.scenes[0].assets[0].recording_instructions).toBe("Better hook.");
  });
});

describe("attaching takes", () => {
  it("fills the scene's need, becomes that scene's clip in scene order, and is recorded", () => {
    const p = speakerProject(["A", "B"]); ensureSpeakerNeeds(p);
    const t2 = attachTake(p, { scene_index: 1, source: "/assets/t/projects/proj_t/assets/b.mp4", recorded_at: "now", capture: "canvas" });
    const t1 = attachTake(p, { scene_index: 0, source: "/assets/t/projects/proj_t/assets/a.mp4", recorded_at: "now", capture: "canvas" });
    expect(p.speaker_track.clips.map((c: any) => [c.scene_index, c.source])).toEqual([[0, t1.source], [1, t2.source]]);
    expect(openTakeNeeds(p)).toEqual([]);
    expect(p.storyboard.scenes[0].assets[0]).toMatchObject({ status: "provided", path: t1.source });
    expect(p.takes.map((t: any) => t.id)).toEqual(["take_0", "take_1"]);
    expect(activeTake(p, 1)).toBe(p.takes[0]);
  });

  it("a new take for the same scene replaces its clip and keeps the older record", () => {
    const p = speakerProject(["A"]); ensureSpeakerNeeds(p);
    attachTake(p, { scene_index: 0, source: "/x/first.mp4", recorded_at: "1", capture: "raw" });
    const again = attachTake(p, { scene_index: 0, source: "/x/second.mp4", recorded_at: "2", capture: "canvas" });
    expect(p.speaker_track.clips).toHaveLength(1);
    expect(p.speaker_track.clips[0].source).toBe("/x/second.mp4");
    expect(p.takes).toHaveLength(2);
    expect(activeTake(p, 0)).toBe(again);
    expect(p.storyboard.scenes[0].assets[0].path).toBe("/x/second.mp4");
  });

  it("a take remembers the lines it was recorded against, so a later edit can be flagged", () => {
    const p = speakerProject(["Your campaign is live.\n(pause)\nNow what?"]); ensureSpeakerNeeds(p);
    const t = attachTake(p, { scene_index: 0, source: "/x/t.mp4", recorded_at: "1", capture: "canvas" });
    expect(t.lines).toBe("Your campaign is live.\n(pause)\nNow what?");
    p.storyboard.scenes[0].voiceover_text = "Your campaign is live.\nNow what?";
    expect(activeTake(p, 0)!.lines).not.toBe(p.storyboard.scenes[0].voiceover_text);
  });

  it("the single `take` record of older projects migrates to takes[] for scene 0", () => {
    const p = migrateProject({
      project_id: "old", canvas: { width: 1080, height: 1920, frame: "9x16" },
      take: { source: "/x/t.mp4", recorded_at: "then", duration: 17 },
      speaker_track: { clips: [{ source: "/x/t.mp4", start: 0 }] },
    }) as any;
    expect(p.take).toBeUndefined();
    expect(p.takes).toEqual([{ id: "take_0", scene_index: 0, capture: "raw", source: "/x/t.mp4", recorded_at: "then", duration: 17 }]);
    // ...and the clip it points at is stamped as scene 0's, so the need
    // reads provided (measured live: proj_c210e5e1 showed "Needs a take"
    // with a take attached).
    expect(p.speaker_track.clips[0].scene_index).toBe(0);
    expect(activeTake(p, 0)).toBe(p.takes[0]);
  });

  it("stamps legacy clips without a take one per scene, in order", () => {
    const p = migrateProject({ project_id: "old", canvas: { width: 1920, height: 1080, frame: "16x9" },
      speaker_track: { clips: [{ source: "/x/a.mp4" }, { source: "/x/b.mp4" }] } }) as any;
    expect(p.speaker_track.clips.map((c: any) => c.scene_index)).toEqual([0, 1]);
  });
});

describe("the take job's waiter", () => {
  it("resolves when a take attaches to the project, or to the scene it waits on", async () => {
    const any = waitForTake("t", "p");
    const s1 = waitForTake("t", "p", 1);
    expect(pendingTakeWaiters("t", "p")).toBe(2);
    const t0 = { id: "take_0", scene_index: 0, source: "/x/0.mp4", recorded_at: "now" };
    expect(resolveTakeWaiters("t", "p", t0)).toBe(1);         // the any-scene waiter only
    expect(await any).toBe(t0);
    expect(pendingTakeWaiters("t", "p")).toBe(1);
    const t1 = { id: "take_1", scene_index: 1, source: "/x/1.mp4", recorded_at: "now" };
    expect(resolveTakeWaiters("t", "p", t1)).toBe(1);
    expect(await s1).toBe(t1);
    expect(pendingTakeWaiters("t", "p")).toBe(0);
    expect(resolveTakeWaiters("t", "other", t1)).toBe(0);     // other projects untouched
  });
});

describe("a waiting take job", () => {
  it("never blocks a deploy (it is a wait, not work)", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\(j\.status === "running" \|\| j\.status === "queued"\) && j\.type !== "take"\)/);
  });
});
