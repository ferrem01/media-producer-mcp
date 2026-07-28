import { describe, it, expect } from "vitest";
import { enforceFilmContinuity } from "../src/llm/continuity.js";
import { deriveWorld } from "../src/llm/world.js";

const LIGHT_KIT: any = { colors: { primary: "#393bf5", background: "#ffffff" }, fonts: [] };

async function authoredScene(components: any[], world?: any) {
  const { generateScene } = await import("../src/llm/scene-generator.js");
  const result = await generateScene({
    scene: { label: "s", duration_seconds: 5, purpose: "p", visual_notes: "v", components } as any,
    sceneIndex: 1, totalScenes: 6, prompt: "p",
    llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any,
    world,
  } as any);
  return result.scene as any;
}

const num = (v: any) => parseFloat(String(v));
const rect = (c: any) => ({ x: num(c.position.x), y: num(c.position.y), w: num(c.position.width), h: num(c.position.height) });
const overlaps = (a: any, b: any) => {
  const ra = rect(a), rb = rect(b);
  const ix = Math.max(0, Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x));
  const iy = Math.max(0, Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y));
  return (ix * iy) / Math.min(ra.w * ra.h, rb.w * rb.h);
};

// The scene-6 bug: stat-card + kinetic-text both center-stacked into the same
// 84% inset. Role-aware layout must give every instance its own frame.
describe("authored layout intelligence (roles, not one-size-fits-all)", () => {
  it("surface + caption -> window docks left, caption gets a real right column", async () => {
    const scene = await authoredScene([
      { type: "claude-cowork-session", data: { title: "T" } },
      { type: "kinetic-text", data: { text: "Ship it" } },
    ]);
    const byType = Object.fromEntries(scene.components.map((c: any) => [c.type, c]));
    expect(byType["claude-cowork-session"].position.width).toBe("58%");
    expect(num(byType["kinetic-text"].position.x)).toBeGreaterThanOrEqual(62);
    expect(overlaps(byType["claude-cowork-session"], byType["kinetic-text"])).toBeLessThan(0.05);
  });

  it("hero + caption without a surface -> center stage + lower third (no stack)", async () => {
    const scene = await authoredScene([
      { type: "stat-card", data: { value: "10x" } },
      { type: "kinetic-text", data: { text: "faster" } },
    ]);
    const byType = Object.fromEntries(scene.components.map((c: any) => [c.type, c]));
    expect(overlaps(byType["stat-card"], byType["kinetic-text"])).toBeLessThan(0.05);
    // Hero above, caption in the lower third.
    expect(num(byType["stat-card"].position.y)).toBeLessThan(num(byType["kinetic-text"].position.y));
    expect(num(byType["kinetic-text"].position.y)).toBeGreaterThanOrEqual(60);
  });

  it("same-type instances get unique ids and distinct frames", async () => {
    const scene = await authoredScene([
      { type: "stat-card", data: { value: "10x" } },
      { type: "stat-card", data: { value: "3s" } },
    ]);
    const cards = scene.components.filter((c: any) => c.type === "stat-card");
    expect(cards).toHaveLength(2);
    expect(cards.map((c: any) => c.id)).toEqual(["stat-card", "stat-card_2"]);
    expect(cards[0].position.x).not.toBe(cards[1].position.x);
    expect(overlaps(cards[0], cards[1])).toBeLessThan(0.05);
  });

  it("a lone surface (no editorial copy) keeps the classic 84% inset", async () => {
    const scene = await authoredScene([{ type: "claude-cowork-session", data: { title: "T" } }]);
    const mock = scene.components.find((c: any) => c.type === "claude-cowork-session");
    expect(mock.position).toEqual({ x: "8%", y: "6.5%", width: "84%", height: "87%" });
  });

  it("a storyboard-authored backdrop is dropped in a world film (one world, one backdrop)", async () => {
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:f" });
    const scene = await authoredScene([
      { type: "mesh-gradient", data: {} },
      { type: "claude-cowork-session", data: { title: "T" } },
    ], world);
    const backdrops = scene.components.filter((c: any) => c.type === "mesh-gradient");
    expect(backdrops).toHaveLength(1);       // only the injected world bg
    expect(backdrops[0].id).toBe("bg");
    // And the mock still reads as the lone surface.
    expect(scene.components.find((c: any) => c.type === "claude-cowork-session").position.width).toBe("84%");
  });

  it("ghost-type rides full-stage BEHIND the windows; floating-pills full-stage above", async () => {
    const scene = await authoredScene([
      { type: "ghost-type", data: { text: "AGENT" } },
      { type: "claude-cowork-session", data: { title: "T" } },
      { type: "floating-pills", data: { pills: ["a"] } },
    ]);
    const byType = Object.fromEntries(scene.components.map((c: any) => [c.type, c]));
    expect(byType["ghost-type"].position.width).toBe("100%");
    expect(byType["ghost-type"].z_index).toBeLessThan(byType["claude-cowork-session"].z_index);
    expect(byType["floating-pills"].position.width).toBe("100%");
    expect(byType["floating-pills"].z_index).toBeGreaterThan(byType["claude-cowork-session"].z_index);
  });
});

// ── The deterministic continuity pass ──

function scn(id: string, comps: any[], authored = true): any {
  return { id, label: id, duration_seconds: 4, components: comps, ...(authored ? { authored_composition: true } : {}) };
}
const win = (type: string, pos: any, extra: any = {}) => ({ id: type, type, position: pos, z_index: 10, data: {}, ...extra });
const INSET = { x: "8%", y: "6.5%", width: "84%", height: "87%" };
const DOCKED = { x: "3%", y: "8%", width: "58%", height: "84%" };

describe("enforceFilmContinuity: match-cut pinning", () => {
  it("pins a shared surface to the previous scene's frame and stamps match_cut", () => {
    const scenes = [
      scn("s1", [win("quotient-campaign", DOCKED)]),
      scn("s2", [win("quotient-campaign", INSET)]),
    ];
    const log = enforceFilmContinuity(scenes as any);
    const pinned: any = scenes[1].components[0];
    expect(pinned.position).toEqual(DOCKED);
    expect(pinned.data.match_cut).toBe(true);
    expect(log.some((l) => l.includes("match cut"))).toBe(true);
  });

  it("refuses a pin that would bury a sibling column", () => {
    const scenes = [
      scn("s1", [win("quotient-campaign", INSET)]),
      scn("s2", [
        win("quotient-campaign", { x: "2.5%", y: "6%", width: "62%", height: "88%" }),
        win("quotient-chat", { x: "66.5%", y: "6%", width: "31%", height: "88%" }, { z_index: 15 }),
      ]),
    ];
    enforceFilmContinuity(scenes as any);
    // 84% would overlap the chat column -> campaign keeps its 62% frame.
    expect((scenes[1].components[0] as any).position.width).toBe("62%");
    expect((scenes[1].components[0] as any).data.match_cut).toBeUndefined();
  });

  it("ignores non-authored scenes (codegen/template scenes own their layout)", () => {
    const scenes = [
      scn("s1", [win("quotient-campaign", DOCKED)], false),
      scn("s2", [win("quotient-campaign", INSET)], false),
    ];
    enforceFilmContinuity(scenes as any);
    expect((scenes[1].components[0] as any).position).toEqual(INSET);
  });
});

describe("enforceFilmContinuity: the one hand", () => {
  const cursor = (path: any[]) => ({ id: "cursor-performer", type: "cursor-performer", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 45, data: { path } });

  it("caps the cursor to the first consecutive chain of 4 and removes the rest", () => {
    const scenes = Array.from({ length: 7 }, (_, i) =>
      scn(`s${i + 1}`, [win("browser-frame", INSET), cursor([{ at: 0.2, x: "50%", y: "50%" }])]));
    const log = enforceFilmContinuity(scenes as any);
    const hasCursor = scenes.map((s) => s.components.some((c: any) => c.type === "cursor-performer"));
    expect(hasCursor).toEqual([true, true, true, true, false, false, false]);
    expect(log.filter((l) => l.includes("removed cursor-performer"))).toHaveLength(3);
  });

  it("repairs handoffs: each scene's hand starts where the last one ended", () => {
    const scenes = [
      scn("s1", [cursor([{ at: 0.2, x: "20%", y: "30%" }, { at: 0.8, x: "70%", y: "60%", click: true }])]),
      scn("s2", [cursor([{ at: 0.1, x: "10%", y: "10%" }, { at: 0.9, x: "40%", y: "80%" }])]),
    ];
    const log = enforceFilmContinuity(scenes as any);
    const secondPath = (scenes[1].components[0] as any).data.path;
    expect(secondPath[0].x).toBe("70%");
    expect(secondPath[0].y).toBe("60%");
    expect(secondPath[0].at).toBe(0.1);          // timing preserved
    expect(secondPath[1]).toEqual({ at: 0.9, x: "40%", y: "80%" });
    expect(log.some((l) => l.includes("repaired cursor handoff"))).toBe(true);
  });

  it("removes a cursor with an empty path (nothing to perform)", () => {
    const scenes = [scn("s1", [win("browser-frame", INSET), cursor([])]), scn("s2", [win("browser-frame", INSET)])];
    enforceFilmContinuity(scenes as any);
    expect(scenes[0].components.some((c: any) => c.type === "cursor-performer")).toBe(false);
  });
});

describe("world ink clamp (editorial copy must contrast the world)", () => {
  it("light world: a white caption ink is clamped to the brand's dark text", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:f" });
    const result = await generateScene({
      scene: {
        label: "s", duration_seconds: 5, purpose: "p", visual_notes: "v",
        components: [
          { type: "composer", data: { text: "brief" } },
          { type: "kinetic-text", data: { text: "MEET THE TEAM", color: "#f5f6fa" } },
        ],
      } as any,
      sceneIndex: 0, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: { colors: { text: "#17171c" } } as any,
      canvas: { width: 1920, height: 1080 } as any, world,
    } as any);
    const kt = (result.scene as any).components.find((c: any) => c.type === "kinetic-text");
    expect(kt.data.color).toBe("#17171c");
  });

  it("light world: a caption with NO ink gets the world ink (dark-era defaults are white)", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:f" });
    const result = await generateScene({
      scene: {
        label: "s", duration_seconds: 5, purpose: "p", visual_notes: "v",
        components: [{ type: "kinetic-text", data: { text: "HELLO" } }],
      } as any,
      sceneIndex: 0, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any, world,
    } as any);
    const kt = (result.scene as any).components.find((c: any) => c.type === "kinetic-text");
    expect(kt.data.color).toBe("#17171c");
  });

  it("keeps a contrasting ink untouched; no world -> no clamp", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:f" });
    const withWorld = await generateScene({
      scene: {
        label: "s", duration_seconds: 5, purpose: "p", visual_notes: "v",
        components: [{ type: "kinetic-text", data: { text: "OK", color: "#393bf5" } }],
      } as any,
      sceneIndex: 0, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any, world,
    } as any);
    expect((withWorld.scene as any).components.find((c: any) => c.type === "kinetic-text").data.color).toBe("#393bf5");
    const noWorld = await generateScene({
      scene: {
        label: "s", duration_seconds: 5, purpose: "p", visual_notes: "v",
        components: [{ type: "kinetic-text", data: { text: "OK", color: "#f5f6fa" } }],
      } as any,
      sceneIndex: 0, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any,
    } as any);
    expect((noWorld.scene as any).components.find((c: any) => c.type === "kinetic-text").data.color).toBe("#f5f6fa");
  });
});
