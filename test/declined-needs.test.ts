import { describe, it, expect } from "vitest";

// proj_bd43e545 (Oct 8): the writer listed a screen_recording need described
// "not used; real stills only" on a click-stream of the real emails, and the
// board cast a full-frame "Screen recording needed" slate over it.
describe("a screen need that casts no slate", () => {
  it("a declined need, or one on a scene already showing real pictures (no person film), casts nothing", async () => {
    const { needDeclined } = await import("../src/core/board-standins.js");
    const stills = { components: [{ type: "click-stream", data: { stops: [{ src: "/assets/t/projects/p/assets/c01.jpg" }] } }] };
    const bare = { components: [{ type: "quotient-home", data: {} }] };
    const need = (description: string) => ({ type: "screen_recording", description, status: "needed" });
    expect(needDeclined(need("not used; real stills only"), bare, false)).toBe(true);
    expect(needDeclined(need("N/A"), bare, true)).toBe(true);
    expect(needDeclined(need("The Quotient dashboard building the report"), stills, false)).toBe(true);
    expect(needDeclined(need("The Quotient dashboard building the report"), bare, false)).toBe(false);
    expect(needDeclined(need("The Quotient dashboard building the report"), stills, true)).toBe(false);   // a person film asks for its proof
    expect(needDeclined({ type: "camera_video", description: "not used" }, bare, false)).toBe(false);
  });

  it("the board drops it and the slate it cast", async () => {
    const { castBoardStandIns } = await import("../src/core/board-standins.js");
    const project: any = { treatment: { filmGrammar: "relay" }, storyboard: { scenes: [{
      assets: [{ type: "screen_recording", description: "not used; real stills only", status: "needed" }],
      components: [{ type: "click-stream", data: { stops: [{ src: "/assets/t/projects/p/assets/c01.jpg" }] } }, { type: "asset-placeholder", data: { need: "not used; real stills only" } }],
    }] } };
    await castBoardStandIns(project);
    const sc = project.storyboard.scenes[0];
    expect(sc.assets).toEqual([]);
    expect(sc.components.map((c: any) => c.type)).toEqual(["click-stream"]);
  });
});
