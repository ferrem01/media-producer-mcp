import { describe, it, expect } from "vitest";
import { keepCastFields } from "../src/server.js";

// A BUILD KEEPS WHO PERFORMS (core/cast-plan.ts): building a board copies the
// writer's board back over the film's; the cast plan, scene plans,
// performances, casting and b-roll are the user's and must survive it
// (measured live, proj_d872a7e4: the build dropped cast_plan).
describe("keepCastFields", () => {
  it("carries the cast plan and each scene's cast fields across a build, by index or by label", () => {
    const before = { cast_plan: { actor: "dana", how: "generate", location: "loft-lounge" }, scenes: [
      { label: "Hook", performer: { location: null }, performance: { actor: "dana", delivery: "[excited] Hi" } },
      { label: "Proof", cast: "dana", actor_clips: [{ at: 0 }] },
    ] };
    const after: any = { scenes: [{ label: "Hook" }, { label: "Proof", cast: "marc" }] };
    keepCastFields(before, after);
    expect(after.cast_plan).toEqual(before.cast_plan);
    expect(after.scenes[0]).toMatchObject({ performer: { location: null }, performance: { delivery: "[excited] Hi" } });
    expect(after.scenes[1]).toMatchObject({ cast: "marc", actor_clips: [{ at: 0 }] });   // the build's own value wins
    const reshaped: any = { scenes: [{ label: "New" }, { label: "Proof" }, { label: "Hook" }] };
    keepCastFields(before, reshaped);
    expect(reshaped.scenes[2].performance.actor).toBe("dana");
    expect(reshaped.scenes[0].performance).toBeUndefined();
  });
});
