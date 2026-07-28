import { describe, it, expect } from "vitest";
import { deriveWorld, worldBackground, worldPromptBlock, hexIsLight } from "../src/llm/world.js";

// SPEC-world.md: one world per film, derived deterministically, honored
// everywhere. These tests pin the derivation and the authored-path handoff.
const LIGHT_KIT: any = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff" }, fonts: [] };
const DARK_KIT: any = { colors: { primary: "#6366f1", background: "#0f172a" }, fonts: [] };

describe("deriveWorld", () => {
  it("light brand -> LIGHT mesh-gradient world (the airy default, not an inversion)", () => {
    const w = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:concept" });
    expect(w.theme).toBe("light");
    expect(w.backdrop.component).toBe("mesh-gradient");
    expect(w.backdrop.palette).toContain("#393bf5");
  });

  it("dark brand -> dark webgl world (a choice, still available)", () => {
    const w = deriveWorld({ brandKit: DARK_KIT, seedSource: "t:concept" });
    expect(w.theme).toBe("dark");
    expect(w.backdrop.component).toBe("webgl-backdrop");
  });

  it("seed is stable for the same film and differs across films", () => {
    const a = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "tenant:film-one" });
    const b = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "tenant:film-one" });
    const c = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "tenant:another-film" });
    expect(a.backdrop.seed).toBe(b.backdrop.seed);
    expect(a.backdrop.seed).not.toBe(c.backdrop.seed);
  });

  it("background + prompt block follow the theme", () => {
    const w = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "x" });
    expect(worldBackground(w)).toBe("#fafaf8");
    expect(worldPromptBlock(w)).toContain("Theme: LIGHT");
    expect(worldPromptBlock(w)).toContain("CHAPTER CARD");
  });

  it("hexIsLight handles short hex and defaults dark", () => {
    expect(hexIsLight("#fff")).toBe(true);
    expect(hexIsLight(undefined)).toBe(false);
  });
});

describe("authored composition in a world", () => {
  it("backdrop is the WORLD's (one seed, film-time offset), not per-scene", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "tenant:film" });
    const result = await generateScene({
      scene: {
        label: "The Work", duration_seconds: 8, purpose: "p", visual_notes: "v",
        film_start: 12.5,
        components: [{ type: "claude-cowork-session", data: { title: "T" } }],
      } as any,
      sceneIndex: 3, totalScenes: 8, prompt: "p",
      llmConfig: {} as any, brandKit: LIGHT_KIT, canvas: { width: 1920, height: 1080 } as any,
      world,
    } as any);
    const scene: any = result.scene;
    const bg = scene.components.find((c: any) => c.id === "bg");
    expect(bg.type).toBe("mesh-gradient");
    expect(bg.data.seed).toBe(world.backdrop.seed);
    expect(bg.data.theme).toBe("light");
    expect(bg.data.time_offset).toBe(12.5);
    expect(scene.background).toBe("#fafaf8");
  });

  it("no world -> legacy per-scene webgl backdrop (back-compat)", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const result = await generateScene({
      scene: {
        label: "L", duration_seconds: 8, purpose: "p", visual_notes: "v",
        components: [{ type: "claude-cowork-session", data: { title: "T" } }],
      } as any,
      sceneIndex: 2, totalScenes: 8, prompt: "p",
      llmConfig: {} as any, brandKit: DARK_KIT, canvas: { width: 1920, height: 1080 } as any,
    } as any);
    const bg = (result.scene as any).components.find((c: any) => c.id === "bg");
    expect(bg.type).toBe("webgl-backdrop");
    expect(bg.data.seed).toBe(5 + 2 * 7);
  });

  it("template scenes inherit the world theme (no dark close on a light film)", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "tenant:film" });
    const result = await generateScene({
      scene: {
        label: "Close", duration_seconds: 3, purpose: "p", visual_notes: "v",
        scene_template: { type: "st-logo-close", data: {} },
        components: [],
      } as any,
      sceneIndex: 6, totalScenes: 7, prompt: "p",
      llmConfig: {} as any, brandKit: LIGHT_KIT, canvas: { width: 1920, height: 1080 } as any,
      world,
    } as any);
    const comps: any[] = (result.scene as any).components;
    const tpl = comps.find((c) => c.id === "tpl_0");
    expect(tpl.data.theme).toBe("light");                 // world theme inherited
    expect(comps.find((c) => c.id === "tpl_bg")).toBeUndefined(); // no dark webgl bg
  });

  it("codegen spec carries the world contract", async () => {
    const { buildCodegenSpec } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:f" });
    const spec = await buildCodegenSpec(
      { label: "s", purpose: "p", visual_notes: "v", duration_seconds: 5, components: ["kinetic-text"] },
      world,
    );
    expect(spec).toContain("THE WORLD");
    expect(spec).toContain("Theme: LIGHT");
  });
});
