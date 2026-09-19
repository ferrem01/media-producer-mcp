import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the board carries its stand-ins: the screen slate is cast when the board is written", () => {
  it("casts a slate per open screen need on the board, resolves a person film's anchors at speaking pace, and is idempotent", async () => {
    const { castBoardStandIns } = await import("../src/core/board-standins.js");
    const project: any = {
      treatment: { filmGrammar: "creator-cut" },
      storyboard: { scenes: [
        { label: "Zoom", duration_seconds: 10, voiceover_text: "Three. Zoom. Create the webinar from Quotient, sync who registered and who showed up, and run the follow-up campaign to each group.",
          components: [{ type: "reel-caption-lane", data: {} }],
          assets: [{ type: "screen_recording", description: "the Zoom integration", status: "needed", at: "@Zoom", until: "@group" }, { type: "camera_video", description: "take", status: "needed" }] },
        { label: "Close", duration_seconds: 6, voiceover_text: "Keep telling us.", components: [], assets: [{ type: "camera_video", description: "take", status: "needed" }] },
      ] },
    };
    const r = await castBoardStandIns(project);
    expect(r.cast).toBe(1); expect(r.scenes).toEqual([0]);
    const slate: any = project.storyboard.scenes[0].components.find((c: any) => c.type === "asset-placeholder");
    expect(slate).toBeTruthy();
    expect(slate.data.need).toBe("the Zoom integration");
    // words became seconds (speaking pace), in order, inside the scene; the anchors stay for the take's spine
    expect(typeof slate.enter.at).toBe("number"); expect(typeof slate.exit.at).toBe("number");
    expect(slate.enter.at).toBeGreaterThan(0); expect(slate.exit.at).toBeGreaterThan(slate.enter.at); expect(slate.exit.at).toBeLessThanOrEqual(10);
    expect(slate.anchors && slate.anchors["enter.at"]).toBeTruthy();
    // again: nothing more
    const r2 = await castBoardStandIns(project);
    expect(r2.cast).toBe(0);
    expect(project.storyboard.scenes[0].components.filter((c: any) => c.type === "asset-placeholder").length).toBe(1);
    // a film nobody carries: the slate takes the mock's slot, seconds only
    const p2: any = { treatment: { filmGrammar: "launch-film" }, storyboard: { scenes: [{ duration_seconds: 6, components: [{ id: "m", type: "quotient-home", data: {}, position: { x: "0%", y: "20%", width: "100%", height: "60%" } }], assets: [{ type: "screen_recording", description: "home", status: "needed" }] }] } };
    const r3 = await castBoardStandIns(p2);
    expect(r3.cast).toBe(1);
    expect(p2.storyboard.scenes[0].components[0]).toMatchObject({ id: "m", type: "asset-placeholder", position: { y: "20%" } });
  });
  it("is called wherever a board is saved, and the card photographs a cut-in inside its window", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/const st = await castBoardStandIns\(project, config\.dataDir\);/);
    const server = await read("src/server.ts");
    expect((server.match(/await castBoardStandIns\(project, config\.dataDir\)/g) || []).length).toBe(2);
    const { settledMoment } = await import("../src/core/storyboard-cards.js");
    const t = settledMoment({ duration_seconds: 10, components: [{ type: "asset-placeholder", data: {}, enter: { effect: "cut", at: 4 }, exit: { effect: "cut", at: 8 } } as any] });
    expect(t).toBeGreaterThanOrEqual(4.8); expect(t).toBeLessThanOrEqual(8.5);
  });
});
