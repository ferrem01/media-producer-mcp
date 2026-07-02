import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStoryboard } from "../src/llm/storyboard-builder.js";

const BRAND_KIT = {
  name: "Test",
  colors: {
    primary: "#6366f1", secondary: "#8b5cf6", accent: "#10b981",
    background: "#ffffff", surface: "#f1f5f9", text: "#0f172a",
  },
  fonts: [], logos: [],
} as any;
const CANVAS = { width: 1920, height: 1080, fps: 30, background: "#ffffff" } as any;
const CONFIG = { provider: "anthropic" as const, apiKey: "test-key", model: "claude-sonnet-5" };
const CATALOG = [
  { type: "hero-reveal", description: "hero", data: {} },
  { type: "stat-card", description: "stat", data: {} },
] as any;

function baseOpts(overrides?: Record<string, unknown>) {
  return {
    prompt: "a launch film",
    format: "video" as const,
    llmConfig: CONFIG,
    brandKit: BRAND_KIT,
    canvas: CANVAS,
    componentCatalog: CATALOG,
    tenantId: "test-tenant",
    ...overrides,
  };
}

function mockTurns(turns: Array<{ content: any[]; stop_reason: string }>) {
  let i = 0;
  const fetchMock = vi.fn().mockImplementation(async () => {
    const turn = turns[Math.min(i, turns.length - 1)];
    i++;
    return { ok: true, status: 200, json: async () => turn, text: async () => JSON.stringify(turn) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildStoryboard: incremental add_scene tool calls", () => {
  it("assembles scenes added one-per-turn, finishing via finish_storyboard", async () => {
    mockTurns([
      { content: [toolUse("t1", "add_scene", { label: "Scene 1", duration_seconds: 5, purpose: "hero", visual_notes: "a hero scene with lots of visual direction and motion", components: ["hero-reveal"] })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "add_scene", { label: "Scene 2", duration_seconds: 4, purpose: "stats", visual_notes: "a stats scene with cards and numbers rolling up", components: ["stat-card"] })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "finish_storyboard", { name: "My Film" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts());
    expect(result.name).toBe("My Film");
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0].label).toBe("Scene 1");
    expect(result.scenes[1].label).toBe("Scene 2");
  });

  it("assembles scenes added in parallel within a single turn", async () => {
    mockTurns([
      {
        content: [
          toolUse("t1", "add_scene", { label: "Scene 1", duration_seconds: 5, purpose: "p1", visual_notes: "v1", components: [] }),
          toolUse("t2", "add_scene", { label: "Scene 2", duration_seconds: 5, purpose: "p2", visual_notes: "v2", components: [] }),
          toolUse("t3", "add_scene", { label: "Scene 3", duration_seconds: 5, purpose: "p3", visual_notes: "v3", components: [] }),
        ],
        stop_reason: "tool_use",
      },
      { content: [toolUse("t4", "finish_storyboard", { name: "Parallel Film" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts());
    expect(result.scenes.map((s) => s.label)).toEqual(["Scene 1", "Scene 2", "Scene 3"]);
  });

  it("normalizes beats within a single add_scene call (bars -> seconds, rescaled to fill the scene)", async () => {
    mockTurns([
      {
        content: [toolUse("t1", "add_scene", {
          label: "Scene 1", duration_seconds: 8, purpose: "p", visual_notes: "v", components: [],
          beats: [
            { label: "a", duration_seconds: 4, action: "thing one happens" },
            { label: "b", duration_seconds: 4, action: "thing two happens" },
          ],
        })],
        stop_reason: "tool_use",
      },
      { content: [toolUse("t2", "finish_storyboard", { name: "Beats Film" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts());
    expect(result.scenes[0].beats).toHaveLength(2);
    expect(result.scenes[0].beats![0].duration_seconds + result.scenes[0].beats![1].duration_seconds).toBeCloseTo(8, 1);
  });

  it("rejects finish_storyboard before any scene is added, and lets the model recover", async () => {
    mockTurns([
      { content: [toolUse("t1", "finish_storyboard", { name: "Too Early" })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "add_scene", { label: "Scene 1", duration_seconds: 5, purpose: "p", visual_notes: "v", components: [] })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "finish_storyboard", { name: "Now Ready" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts());
    expect(result.name).toBe("Now Ready");
    expect(result.scenes).toHaveLength(1);
  });

  it("enforces an exact scene count and rejects finish_storyboard until it matches", async () => {
    mockTurns([
      { content: [toolUse("t1", "add_scene", { label: "Scene 1", duration_seconds: 5, purpose: "p", visual_notes: "v", components: [] })], stop_reason: "tool_use" },
      // Premature finish with only 1/2 scenes -- must be rejected.
      { content: [toolUse("t2", "finish_storyboard", { name: "Nope" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "add_scene", { label: "Scene 2", duration_seconds: 5, purpose: "p2", visual_notes: "v2", components: [] })], stop_reason: "tool_use" },
      { content: [toolUse("t4", "finish_storyboard", { name: "Exactly Two" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts({ sceneCount: 2 }));
    expect(result.scenes).toHaveLength(2);
  });

  it("drops unknown component types from a scene and reports the correction back to the model", async () => {
    mockTurns([
      { content: [toolUse("t1", "add_scene", { label: "Scene 1", duration_seconds: 5, purpose: "p", visual_notes: "v", components: ["hero-reveal", "not-a-real-component"] })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "finish_storyboard", { name: "Cleaned" })], stop_reason: "tool_use" },
    ]);

    const result = await buildStoryboard(baseOpts());
    expect(result.scenes[0].components).toEqual(["hero-reveal"]);
  });

  it("throws a specific error when a single turn is truncated by max_tokens", async () => {
    mockTurns([
      { content: [{ type: "text", text: "..." }], stop_reason: "max_tokens" },
    ]);
    await expect(buildStoryboard(baseOpts())).rejects.toThrow(/truncated.*max_tokens/i);
  });
});
