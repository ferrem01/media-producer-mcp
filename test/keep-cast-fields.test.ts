import { describe, it, expect } from "vitest";
import { keepCastFields } from "../src/server.js";

// A BUILD KEEPS WHO PERFORMS (core/cast-plan.ts): building a board copies the
// writer's board back over the film's; each scene's plan, performance,
// casting and b-roll are the user's and must survive it (measured live,
// proj_d872a7e4: the build dropped the plan).
describe("keepCastFields", () => {
  it("carries each scene's cast fields across a build, by index or by label", () => {
    const before = { scenes: [
      { label: "Hook", performer: { actor: "dana", how: "generate", location: null }, performance: { actor: "dana", delivery: "[excited] Hi" } },
      { label: "Proof", cast: "dana", actor_clips: [{ at: 0 }] },
    ] };
    const after: any = { scenes: [{ label: "Hook" }, { label: "Proof", cast: "marc" }] };
    keepCastFields(before, after);
    expect(after.cast_plan).toBeUndefined();                                  // no film-level plan
    expect(after.scenes[0]).toMatchObject({ performer: { actor: "dana", location: null }, performance: { delivery: "[excited] Hi" } });
    expect(after.scenes[1]).toMatchObject({ cast: "marc", actor_clips: [{ at: 0 }] });   // the build's own value wins
    const reshaped: any = { scenes: [{ label: "New" }, { label: "Proof" }, { label: "Hook" }] };
    keepCastFields(before, reshaped);
    expect(reshaped.scenes[2].performance.actor).toBe("dana");
    expect(reshaped.scenes[0].performance).toBeUndefined();
  });
});
