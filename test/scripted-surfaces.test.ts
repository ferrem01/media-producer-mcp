import { describe, it, expect } from "vitest";
import { buildCodegenSpec } from "../src/llm/scene-generator.js";

// The scripted-surface pass-through: storyboard-authored component data
// (especially data.script performances on performable surfaces) must reach
// the codegen spec verbatim, and performable schemas must advertise their
// script-action vocabulary. Losing either is how mock scenes shipped frozen
// at their end state (the July regression film).
describe("scripted surface pass-through", () => {
  const script = [
    { action: "type-message", at: 0.5, text: "Launch the roundtable campaign" },
    { action: "send-message", at: 2.0 },
    { action: "tool-call", at: 3.0, connector: "Quotient", tool: "create-campaign" },
  ];

  it("emits storyboard-authored component data verbatim in the codegen spec", async () => {
    const spec = await buildCodegenSpec({
      label: "Claude works",
      purpose: "show the agent doing the work",
      visual_notes: "cowork session performs over a dark world",
      duration_seconds: 12,
      components: [
        "webgl-backdrop",
        { type: "claude-cowork-session", data: { title: "Roundtable", script } },
      ],
    });
    expect(spec).toContain("Storyboard-Authored Component Data");
    expect(spec).toContain('<component type="claude-cowork-session"');
    // The full script array survives, not a summary of it
    expect(spec).toContain('"action":"tool-call"');
    expect(spec).toContain('"tool":"create-campaign"');
    // Mixed string/object hints both resolve to component-tag suggestions
    expect(spec).toContain('<component type="webgl-backdrop" />');
  });

  it("advertises script actions for performable components", async () => {
    const spec = await buildCodegenSpec({
      label: "publish",
      purpose: "the post ships",
      visual_notes: "quotient-social performs the publish beat",
      duration_seconds: 8,
      components: ["quotient-social"],
    });
    // The schema section must carry the performable contract -- the codegen
    // can only script a surface whose action vocabulary it has seen.
    expect(spec).toContain("PERFORMABLE");
    expect(spec).toMatch(/publish-post/);
  });

  it("omits the authored-data section when hints are plain strings", async () => {
    const spec = await buildCodegenSpec({
      label: "plain",
      purpose: "p",
      visual_notes: "v",
      duration_seconds: 5,
      components: ["kinetic-text"],
    });
    expect(spec).not.toContain("Storyboard-Authored Component Data");
  });
});

describe("authored composition (deterministic scene path)", () => {
  it("builds the structured scene directly when all components are authored", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const result = await generateScene({
      scene: {
        label: "The Work",
        duration_seconds: 13.5,
        purpose: "agent does the work",
        visual_notes: "cowork session performs",
        components: [{ type: "claude-cowork-session", data: { title: "Roundtable", script: [{ action: "working", at: 0.5 }] } }],
        camera_moves: [{ at: 0.5, type: "zoom", anchor: "claude-cowork-session", scale: 1.05 }],
        voiceover_text: "Claude opens the connector.",
      } as any,
      sceneIndex: 4,
      totalScenes: 13,
      prompt: "p",
      llmConfig: {} as any,
      brandKit: {} as any,
      canvas: { width: 1920, height: 1080 } as any,
    } as any);
    const scene: any = result.scene;
    expect(scene.authored_composition).toBe(true);
    expect(result.customSources).toBeUndefined();
    const types = scene.components.map((c: any) => c.type);
    expect(types).toContain("webgl-backdrop");
    expect(types).toContain("claude-cowork-session");
    const mock = scene.components.find((c: any) => c.type === "claude-cowork-session");
    expect(mock.data.script).toHaveLength(1);
    expect(mock.position).toEqual({ x: "8%", y: "6.5%", width: "84%", height: "87%" });
    expect(scene.camera_moves).toHaveLength(1);
  });

  it("applies the quotient trio recipe (inset shell + center + chat, show_panel off)", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const result = await generateScene({
      scene: {
        label: "Quotient",
        duration_seconds: 10.8,
        purpose: "p",
        visual_notes: "v",
        components: [
          { type: "quotient-app-shell", data: { breadcrumbs: ["Campaigns"] } },
          { type: "quotient-campaign", data: { title: "Roundtable", script: [{ action: "switch-tab", at: 3, tab: "Tasks" }] } },
          { type: "quotient-chat", data: { history: [] } },
        ],
      } as any,
      sceneIndex: 6,
      totalScenes: 13,
      prompt: "p",
      llmConfig: {} as any,
      brandKit: {} as any,
      canvas: { width: 1920, height: 1080 } as any,
    } as any);
    const scene: any = result.scene;
    const byType = Object.fromEntries(scene.components.map((c: any) => [c.type, c]));
    expect(byType["quotient-app-shell"].data.show_panel).toBe(false);
    expect(byType["quotient-app-shell"].position.x).toBe("1.2%");
    expect(byType["quotient-campaign"].position.width).toBe("61.5%");
    expect(byType["quotient-chat"].position.x).toBe("67.6%");
    expect(byType["quotient-campaign"].data.script).toHaveLength(1);
  });

  it("leaves mixed plain-component scenes to codegen", async () => {
    const { buildCodegenSpec } = await import("../src/llm/scene-generator.js");
    // A scene mixing an authored mock with a plain non-backdrop hint stays on
    // the codegen path -- assert the spec builder still handles it (no throw,
    // authored section present) rather than the deterministic path claiming it.
    const spec = await buildCodegenSpec({
      label: "mixed", purpose: "p", visual_notes: "v", duration_seconds: 8,
      components: ["kinetic-text", { type: "claude-cowork-home", data: { greeting: "Hi" } }],
    });
    expect(spec).toContain("Storyboard-Authored Component Data");
  });
});
