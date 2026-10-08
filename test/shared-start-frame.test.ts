import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";

// Five Tools (Oct 8): each performed scene drew its own start frame, so Marc
// changed between cuts; three scenes were redrawn from scene 1's by hand.
describe("one start frame for the film", () => {
  it("reuses the earliest frame of the same actor, shot and place; another shot, place or actor draws its own", async () => {
    const { sharedStartFrame } = await import("../src/core/scene-performance.js");
    const perf = (frame: string, o: any = {}) => ({ performance: { actor: "marc", shot: "selfie", frame, ...o } });
    const project = { storyboard: { scenes: [perf("/a/f0.jpg"), { performance: {} }, perf("/a/f2.jpg"), perf("/a/desk.jpg", { location: "desk" }), perf("/a/dana.jpg", { actor: "dana" })] } };
    expect(sharedStartFrame(project, 1, "marc", "selfie", "")).toEqual({ url: "/a/f0.jpg", scene: 0 });
    expect(sharedStartFrame(project, 0, "marc", "selfie", "")).toEqual({ url: "/a/f2.jpg", scene: 2 });
    expect(sharedStartFrame(project, 1, "marc", "selfie", "desk")).toEqual({ url: "/a/desk.jpg", scene: 3, location: "desk" });
    expect(sharedStartFrame(project, 1, "marc", "walk-talk", "")).toBeNull();
    expect(sharedStartFrame(project, 1, "sam", "selfie", "")).toBeNull();
  });

  it("a scene performed with no frame takes the shared one before anything is drawn", async () => {
    const src = await fs.readFile("src/core/scene-performance.ts", "utf8");
    expect(src).toMatch(/if \(!p\.frame && opts\.frame_prompt === undefined\) \{\n\s*const shared = sharedStartFrame\(project, si, actor\.id, shot,/);
  });
});
