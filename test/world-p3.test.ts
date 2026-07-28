import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";
import { deriveWorld } from "../src/llm/world.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SPEC-world.md P3: the film-level cursor performer + micro-beat density.
describe("cursor-performer", () => {
  it("parses, is seek-safe, and documents the handoff contract", async () => {
    const src = await fs.readFile(
      path.resolve(__dirname, "../src/components/props/cursor-performer.component.html"), "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(/requestAnimationFrame|setInterval|performance\.now/);
    const schema = JSON.parse(await fs.readFile(
      path.resolve(__dirname, "../src/components/props/cursor-performer.schema.json"), "utf-8"));
    expect(schema.description).toContain("CONTINUITY CONTRACT");
  });

  it("rides authored compositions as a FULL-STAGE overlay, not a window or corner accent", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const world = deriveWorld({ brandKit: { colors: { background: "#ffffff", primary: "#393bf5" }, fonts: [] } as any, seedSource: "t:f" });
    const result = await generateScene({
      scene: {
        label: "click it", duration_seconds: 3, purpose: "p", visual_notes: "v",
        components: [
          { type: "quotient-campaign", data: { title: "T" } },
          { type: "cursor-performer", data: { path: [{ at: 0.3, x: "50%", y: "50%", click: true }] } },
        ],
      } as any,
      sceneIndex: 2, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any,
      world,
    } as any);
    const byType = Object.fromEntries((result.scene as any).components.map((c: any) => [c.type, c]));
    expect(byType["cursor-performer"].position.width).toBe("100%");
    expect(byType["cursor-performer"].z_index).toBe(45);
    // The mock still gets the single-window inset -- the overlay didn't
    // demote it into a pair split.
    expect(byType["quotient-campaign"].position.width).toBe("84%");
  });

  it("tempo-cut contract carries the hand + micro-beats", async () => {
    const sb = await fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");
    expect(sb).toContain("THE HAND");
    expect(sb).toContain("HANDOFF CONTRACT");
    expect(sb).toContain("MICRO-BEATS");
  });

  it("quantizer allows half-bar micro scenes (source guard)", async () => {
    const p = await fs.readFile(path.resolve(__dirname, "../src/llm/pipeline.ts"), "utf-8");
    expect(p).toContain("barSec / 2");
    expect(p).toContain("Micro-beats (SPEC-world.md P3)");
  });
});
