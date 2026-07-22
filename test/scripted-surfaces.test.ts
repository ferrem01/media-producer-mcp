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
