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

  it("sky world: the pin or the prose keyword; the brand primary is the sky; a dark-theme world with the materials block naming white cards", () => {
    const w = deriveWorld({ brandKit: LIGHT_KIT, visualSystem: { world: "sky" }, seedSource: "t:sky" });
    expect(w.backdrop.component).toBe("sky-backdrop");
    expect(w.theme).toBe("dark"); // white type on the color
    expect(w.surface).toEqual({ tone: "#393bf5", intensity: 0.35 });
    expect(worldBackground(w)).toBe("#393bf5");
    const block = worldPromptBlock(w);
    expect(block).toMatch(/ONE SKY across the whole film/);
    expect(block).toMatch(/WHITE CARDS inside the sky/);
    expect(block).toMatch(/THE SKY IS THE GROUND/);
    // Prose: a treatment that says clouds lands in the sky without a pin.
    const prose = deriveWorld({ brandKit: LIGHT_KIT, treatment: { concept: "words floating among clouds on a bright blue sky", visualStyle: { colorMood: "overcast noon" } } as any, seedSource: "t:sky2" });
    expect(prose.backdrop.component).toBe("sky-backdrop");
    expect(prose.surface?.intensity).toBe(0.6);
    // A pin to another world wins over the prose.
    const pinned = deriveWorld({ brandKit: LIGHT_KIT, treatment: { concept: "clouds" } as any, visualSystem: { world: "light" }, seedSource: "t:sky3" });
    expect(pinned.backdrop.component).toBe("mesh-gradient");
    // Cloud cutouts in the kit become the sky's sprites (the photographic upgrade).
    const kitWithClouds: any = { ...LIGHT_KIT, assets: [{ type: "image", url: "/assets/t/brand-kit/images/cloud-1-cutout.png" }, { type: "image", url: "/assets/t/brand-kit/images/logo.png" }, { type: "video", url: "/assets/t/brand-kit/video/cloud-1.mp4" }] };
    const sprited = deriveWorld({ brandKit: kitWithClouds, visualSystem: { world: "sky" }, seedSource: "t:sky4" });
    expect(sprited.surface?.sprites).toEqual(["/assets/t/brand-kit/images/cloud-1-cutout.png"]);
    // A light world stays light and a plain stays plain: the sky is never inferred from nothing.
    expect(deriveWorld({ brandKit: LIGHT_KIT, seedSource: "t:x" }).backdrop.component).toBe("mesh-gradient");
  });

  it("cream world: pin only; st-statement's cream under every scene, light theme, never inferred", () => {
    const w = deriveWorld({ brandKit: DARK_KIT, visualSystem: { world: "cream" }, seedSource: "t:cream" });
    expect(w.backdrop.component).toBe("cream-ground");
    expect(w.theme).toBe("light");
    expect(worldBackground(w)).toBe("#f4efe1");
    expect(deriveWorld({ brandKit: LIGHT_KIT, treatment: { concept: "warm cream editorial" } as any, seedSource: "t:c2" }).backdrop.component).toBe("mesh-gradient");
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

describe("tempo-cut is music-first (source guards)", () => {
  it("the pipeline defaults the music bed ON for tempo-cut and warns on a silent run", async () => {
    const fsm = await import("node:fs/promises");
    const src = await fsm.readFile(new URL("../src/llm/pipeline.ts", import.meta.url), "utf-8");
    expect(src).toContain('filmGrammar === "tempo-cut"');
    expect(src).toContain("TEMPO-CUT WITHOUT A MUSIC BED");
    expect(src).toContain("produced NO beat grid");
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

describe("cream world: template scenes sit on the cream too", () => {
  it("a light template gets the cream ground at z0; st-statement and a dark-pinned template do not", async () => {
    const { buildTemplateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: LIGHT_KIT, visualSystem: { world: "cream" }, seedSource: "t:cream" });
    const opts: any = { sceneIndex: 0, totalScenes: 1, canvas: { width: 1920, height: 1080 }, tenantId: "t", brandKit: LIGHT_KIT, world };
    const types = (tpl: any) => (buildTemplateScene("s1", { label: "x", duration_seconds: 3, scene_template: tpl }, opts)!.scene as any).components.map((c: any) => c.type);
    expect(types({ type: "st-logo-close", data: { tagline: "Live now." } })[0]).toBe("cream-ground");
    expect(types({ type: "st-statement", data: { text: "Hi." } })).not.toContain("cream-ground");
    expect(types({ type: "st-logo-close", data: { theme: "dark" } })[0]).toBe("webgl-backdrop");
  });
});
