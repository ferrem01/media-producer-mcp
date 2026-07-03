import { describe, it, expect, vi, afterEach } from "vitest";
import { generateSceneAgentic, reviseSceneInSession, findRawTextColors } from "../src/llm/agentic-codegen.js";

const BRAND_KIT = {
  name: "Test",
  colors: {
    primary: "#6366f1", secondary: "#8b5cf6", accent: "#10b981",
    background: "#0f172a", text: "#e2e8f0",
  },
  fonts: [], logos: [],
} as any;
const CANVAS = { width: 1920, height: 1080, fps: 30, background: "#0f172a" } as any;
const CONFIG = { provider: "anthropic" as const, apiKey: "test-key", model: "claude-sonnet-5" };

function baseOpts(overrides?: Partial<Parameters<typeof generateSceneAgentic>[0]>) {
  return {
    sceneSpec: "A hero scene with a headline.",
    sceneLabel: "Scene 1",
    sceneDescription: "Hero reveal",
    sceneDuration: 6,
    sceneIndex: 0,
    totalScenes: 1,
    prompt: "test project",
    llmConfig: CONFIG,
    brandKit: BRAND_KIT,
    canvas: CANVAS,
    ...overrides,
  };
}

/** Queue of turns; each call to fetch pops the next scripted Anthropic response. */
function mockTurns(turns: Array<{ content: any[]; stop_reason: string }>) {
  let i = 0;
  const fetchMock = vi.fn().mockImplementation(async () => {
    const turn = turns[Math.min(i, turns.length - 1)];
    i++;
    return {
      ok: true,
      status: 200,
      json: async () => turn,
      text: async () => JSON.stringify(turn),
    };
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

describe("generateSceneAgentic: incremental chunked submission", () => {
  it("assembles template + style + script (single write_script) across turns via finish_scene", async () => {
    mockTurns([
      {
        content: [
          toolUse("t1", "write_template", { html: "<div class=\"hero\">Hi</div>" }),
          toolUse("t2", "write_style", { css: ".hero { color: var(--mp-color-text); }" }),
          toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){return gsap.timeline();}" }),
        ],
        stop_reason: "tool_use",
      },
      { content: [toolUse("t4", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const { html } = await generateSceneAgentic(baseOpts());
    expect(html).toContain("<template>");
    expect(html).toContain('<div class="hero">Hi</div>');
    expect(html).toContain("<style scoped>");
    expect(html).toContain(".hero { color: var(--mp-color-text); }");
    expect(html).toContain("<script>");
    expect(html).toContain("function createTimeline");
  });

  it("builds a long script across multiple append_script calls (one per beat), never truncating", async () => {
    mockTurns([
      { content: [toolUse("t1", "write_template", { html: "<div id=\"s\"></div>" })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "write_style", { css: "#s{}" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){var tl=gsap.timeline();" })], stop_reason: "tool_use" },
      { content: [toolUse("t4", "append_script", { js: "tl.addLabel('beat_1',0);" })], stop_reason: "tool_use" },
      { content: [toolUse("t5", "append_script", { js: "tl.addLabel('beat_2',4);" })], stop_reason: "tool_use" },
      { content: [toolUse("t6", "append_script", { js: "return tl;}" })], stop_reason: "tool_use" },
      { content: [toolUse("t7", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const { html } = await generateSceneAgentic(baseOpts());
    // The full script is the concatenation of write_script + every append_script, in order.
    expect(html).toContain("function createTimeline(el,data,ctx){var tl=gsap.timeline();tl.addLabel('beat_1',0);tl.addLabel('beat_2',4);return tl;}");
  });

  it("rejects finish_scene when template or script is missing, and lets the model recover", async () => {
    mockTurns([
      // First finish_scene attempt is premature (no template/script yet) -- must be rejected, not silently accepted.
      { content: [toolUse("t1", "finish_scene", {})], stop_reason: "tool_use" },
      { content: [toolUse("t2", "write_template", { html: "<div></div>" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){return gsap.timeline();}" })], stop_reason: "tool_use" },
      { content: [toolUse("t4", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const { html } = await generateSceneAgentic(baseOpts());
    expect(html).toContain("<template>");
    expect(html).toContain("<script>");
  });

  it("recovers from a truncated turn: discards it, keeps banked sections, and finishes on the retry", async () => {
    mockTurns([
      // Template banks fine, then a turn blows the token cap (its calls must be discarded).
      { content: [toolUse("t1", "write_template", { html: "<div id=\"s\"></div>" })], stop_reason: "tool_use" },
      { content: [toolUse("tX", "write_script", { js: "function createTimeline(el,data,ctx){ // cut off mid" }), { type: "text", text: "partial" }], stop_reason: "max_tokens" },
      // Model retries with smaller chunks and completes.
      { content: [toolUse("t2", "write_style", { css: "#s{}" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){return gsap.timeline();}" })], stop_reason: "tool_use" },
      { content: [toolUse("t4", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const { html } = await generateSceneAgentic(baseOpts());
    // The banked template survived the truncated turn; the truncated write_script did NOT land.
    expect(html).toContain('<div id="s"></div>');
    expect(html).not.toContain("cut off mid");
    expect(html).toContain("return gsap.timeline();");
  });

  it("aborts with a specific error after repeated truncation (model refuses to chunk)", async () => {
    mockTurns([
      { content: [{ type: "text", text: "way too long" }], stop_reason: "max_tokens" },
      { content: [{ type: "text", text: "way too long again" }], stop_reason: "max_tokens" },
      { content: [{ type: "text", text: "still too long" }], stop_reason: "max_tokens" },
    ]);
    await expect(generateSceneAgentic(baseOpts())).rejects.toThrow(/truncated 3 times.*max_tokens/i);
  });
});

describe("reviseSceneInSession: Write-then-Edit revisions", () => {
  /** Build a completed session via a mocked initial generation. */
  async function buildSession() {
    mockTurns([
      { content: [toolUse("t1", "write_template", { html: '<h1 class="title">Hello</h1>' })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "write_style", { css: ".title { color: var(--mp-color-text-muted); }" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){var t=el.querySelector('.title');t.textContent;return gsap.timeline();}" })], stop_reason: "tool_use" },
      { content: [toolUse("t4", "finish_scene", {})], stop_reason: "tool_use" },
    ]);
    const result = await generateSceneAgentic(baseOpts());
    vi.unstubAllGlobals();
    return result;
  }

  it("applies a minimal edit_style patch in-session and re-validates via finish_scene", async () => {
    const { session } = await buildSession();
    mockTurns([
      { content: [toolUse("e1", "edit_style", { search: "color: var(--mp-color-text-muted);", replace: "color: var(--mp-color-text);" })], stop_reason: "tool_use" },
      { content: [toolUse("e2", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const revised = await reviseSceneInSession(session, 'Text "Hello" is unreadable: contrast 2.1:1', baseOpts());
    expect(revised.html).toContain("color: var(--mp-color-text);");
    expect(revised.html).not.toContain("color: var(--mp-color-text-muted);");
    // Everything not flagged is untouched.
    expect(revised.html).toContain('<h1 class="title">Hello</h1>');
    expect(revised.html).toContain("function createTimeline");
  });

  it("rejects a non-matching edit search with a corrective tool_result, and the model recovers", async () => {
    const { session } = await buildSession();
    const fetchMock = mockTurns([
      // Wrong search text -- must be rejected, not silently ignored.
      { content: [toolUse("e1", "edit_script", { search: "t.textContent!!!", replace: "if (t) t.textContent;" })], stop_reason: "tool_use" },
      // Model retries with the exact text.
      { content: [toolUse("e2", "edit_script", { search: "t.textContent;", replace: "if (t) t.textContent;" })], stop_reason: "tool_use" },
      { content: [toolUse("e3", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const revised = await reviseSceneInSession(session, "runtime error: t is null", baseOpts());
    expect(revised.html).toContain("if (t) t.textContent;");
    // The corrective feedback for the failed edit went back to the model.
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const lastMsg = secondCallBody.messages[secondCallBody.messages.length - 1];
    const resultBlock = lastMsg.content.find((b: any) => b.type === "tool_result");
    expect(String(resultBlock.content)).toMatch(/not found/i);
  });

  it("refuses to revise a session with nothing banked", async () => {
    await expect(
      reviseSceneInSession({ messages: [], parts: { template: "", style: "", script: "" } }, "fix it", baseOpts())
    ).rejects.toThrow(/no banked/i);
  });

  it("salvages the edited sections when the model polishes to budget exhaustion without finish_scene", async () => {
    const { session } = await buildSession();
    // The model only ever edits and never files -- the mock repeats the last
    // turn (a no-op non-matching edit), so the loop runs to its iteration cap
    // with no finish_scene call.
    mockTurns([
      { content: [toolUse("e1", "edit_style", { search: "color: var(--mp-color-text-muted);", replace: "color: var(--mp-color-text); font-weight: 600;" })], stop_reason: "tool_use" },
      { content: [toolUse("e2", "edit_style", { search: "no-such-text", replace: "still polishing" })], stop_reason: "tool_use" },
    ]);

    const revised = await reviseSceneInSession(session, "make the title readable", baseOpts());
    // The banked edit shipped even though finish_scene was never called.
    expect(revised.html).toContain("font-weight: 600;");
    expect(revised.html).toContain('<h1 class="title">Hello</h1>');
  });
});

describe("color discipline: text colors are tokens-only", () => {
  it("flags raw literals in color declarations, allows tokens and gradient-text values", () => {
    const violations = findRawTextColors({
      template: '<div style="color: #888888">hi</div><span style="color: var(--mp-color-text)">ok</span>',
      style: `
        .title { color: var(--mp-color-text); }
        .muted { color: rgba(120,120,120,0.8); }
        .grad { background-clip: text; -webkit-text-fill-color: transparent; }
        .btn { color: white; background-color: #6366f1; border-color: #eee; }
      `,
    });
    // background-color / border-color are NOT text props and must not be flagged.
    expect(violations).toHaveLength(3);
    expect(violations.join("\n")).toMatch(/rgba\(120/);
    expect(violations.join("\n")).toMatch(/color: white/);
    expect(violations.join("\n")).toMatch(/#888888/);
  });

  it("finish_scene rejects raw text colors, and the model fixes them with an edit and finishes", async () => {
    mockTurns([
      { content: [toolUse("t1", "write_template", { html: "<h1>Hello</h1>" })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "write_style", { css: "h1 { color: #999999; font-size: 96px; }" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "write_script", { js: "function createTimeline(el,data,ctx){return gsap.timeline();}" })], stop_reason: "tool_use" },
      // Rejected: raw literal in color:
      { content: [toolUse("t4", "finish_scene", {})], stop_reason: "tool_use" },
      { content: [toolUse("t5", "edit_style", { search: "color: #999999;", replace: "color: var(--mp-color-text);" })], stop_reason: "tool_use" },
      { content: [toolUse("t6", "finish_scene", {})], stop_reason: "tool_use" },
    ]);

    const { html } = await generateSceneAgentic(baseOpts());
    expect(html).toContain("color: var(--mp-color-text);");
    expect(html).not.toContain("#999999");
  });
});
