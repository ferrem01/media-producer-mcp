import { describe, it, expect } from "vitest";
import { migrateProject } from "../src/persistence/project.js";

// Retired cast shapes (Oct 6, "no extra garbage") are upgraded on load: one
// place a plan lives (the scene), one list of cutaways, no dead fields.
describe("legacy cast shapes are upgraded on load", () => {
  it("moves the film plan onto the scenes, the single cutaway into the list, and drops the retired performance fields", () => {
    const p: any = migrateProject({ storyboard: { cast_plan: { actor: "dana", how: "generate" }, scenes: [
      { actor_clip: { at: 1, status: "done" }, performance: { actor: "dana", voice_track: "converted", voice_offset: 0.1, seedance_url: "/s.mp4", room_url: "/r.jpg", voice_url: "/v.mp3" } },
      { actor_clip: { at: 2 }, actor_clips: [{ at: 0 }, { at: 2 }], performer: { how: "record" } },
    ] } });
    const [a, b] = p.storyboard.scenes;
    expect(p.storyboard.cast_plan).toBeUndefined();
    expect(a.performer).toEqual({ actor: "dana", how: "generate" });
    expect(b.performer).toEqual({ actor: "dana", how: "record" });           // the scene's own field wins
    expect(a.actor_clips).toEqual([{ at: 1, status: "done" }]);
    expect(b.actor_clips).toEqual([{ at: 0 }, { at: 2 }]);                  // the list already there is kept
    expect(a.actor_clip).toBeUndefined(); expect(b.actor_clip).toBeUndefined();
    expect(a.performance).toEqual({ actor: "dana", voice_url: "/v.mp3" });
  });
});
