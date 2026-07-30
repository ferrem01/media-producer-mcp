import { describe, it, expect, vi, afterEach } from "vitest";
import { callLLM, callLLMAgentic, type LLMConfig, type LLMTool } from "../src/llm/client.js";
import { sseResponseFromMessage } from "./helpers/sse.js";

const CONFIG: LLMConfig = { provider: "anthropic", apiKey: "test-key", model: "claude-sonnet-5" };

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockImplementation(async () =>
    ok
      ? sseResponseFromMessage(body as { content: any[]; stop_reason?: string })
      : new Response(JSON.stringify(body), { status: 400 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callLLM truncation detection (Anthropic)", () => {
  it("throws a clear, specific error when stop_reason is max_tokens", async () => {
    mockFetchOnce({
      content: [{ type: "text", text: '{"scenes": [{"label": "cut off mid' }],
      stop_reason: "max_tokens",
    });
    await expect(
      callLLM(CONFIG, [{ role: "user", content: "hi" }], { maxTokens: 8192 })
    ).rejects.toThrow(/truncated.*max_tokens.*8192/i);
  });

  it("does not throw when stop_reason is end_turn (normal completion)", async () => {
    mockFetchOnce({
      content: [{ type: "text", text: '{"scenes": []}' }],
      stop_reason: "end_turn",
    });
    await expect(
      callLLM(CONFIG, [{ role: "user", content: "hi" }], { maxTokens: 8192 })
    ).resolves.toBe('{"scenes": []}');
  });
});

describe("callLLMAgentic truncation detection (Anthropic)", () => {
  const TOOLS: LLMTool[] = [{ name: "submit_scene", description: "submit", input_schema: { type: "object", properties: {} } }];

  it("reports stopReason: max_tokens on the response instead of a silently truncated tool call", async () => {
    mockFetchOnce({
      content: [{ type: "tool_use", id: "t1", name: "submit_scene", input: { html: "<template" } }],
      stop_reason: "max_tokens",
    });
    const res = await callLLMAgentic(CONFIG, [{ role: "user", content: "hi" }], TOOLS, { maxTokens: 16384 });
    expect(res.stopReason).toBe("max_tokens");
  });

  it("reports stopReason: tool_use on a clean tool call", async () => {
    mockFetchOnce({
      content: [{ type: "tool_use", id: "t1", name: "submit_scene", input: { html: "<template></template>" } }],
      stop_reason: "tool_use",
    });
    const res = await callLLMAgentic(CONFIG, [{ role: "user", content: "hi" }], TOOLS, { maxTokens: 16384 });
    expect(res.stopReason).toBe("tool_use");
  });
});

describe("callLLMAgentic prompt caching (Anthropic)", () => {
  const TOOLS: LLMTool[] = [
    { name: "write_template", description: "t", input_schema: { type: "object", properties: {} } },
    { name: "finish_scene", description: "f", input_schema: { type: "object", properties: {} } },
  ];

  it("sets cache breakpoints on the last tool, the system prompt, and the last message block", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "tool_use", id: "t1", name: "write_template", input: {} }],
      stop_reason: "tool_use",
    });
    await callLLMAgentic(
      CONFIG,
      [
        { role: "system", content: "big system prompt" },
        { role: "user", content: "write the scene" },
      ],
      TOOLS,
      { maxTokens: 16000 },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // last tool carries the breakpoint; earlier tools do not
    expect(body.tools[1].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[0].cache_control).toBeUndefined();
    // system prompt is a cached block array
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.system[0].text).toBe("big system prompt");
    // last message's last block carries the incremental-conversation breakpoint
    const lastMsg = body.messages[body.messages.length - 1];
    const lastBlock = lastMsg.content[lastMsg.content.length - 1];
    expect(lastBlock.cache_control).toEqual({ type: "ephemeral" });
    expect(lastBlock.text).toBe("write the scene");
  });

  it("puts the breakpoint on the last tool_result block of a multi-part message", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "tool_use", id: "t2", name: "finish_scene", input: {} }],
      stop_reason: "tool_use",
    });
    await callLLMAgentic(
      CONFIG,
      [
        { role: "user", content: "write the scene" },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "write_template", input: {} } as any] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "template saved" } as any] },
      ],
      TOOLS,
      { maxTokens: 16000 },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const lastMsg = body.messages[body.messages.length - 1];
    const lastBlock = lastMsg.content[lastMsg.content.length - 1];
    expect(lastBlock.type).toBe("tool_result");
    expect(lastBlock.cache_control).toEqual({ type: "ephemeral" });
    // only the LAST message gets a conversation breakpoint
    const firstMsg = body.messages[0];
    expect(typeof firstMsg.content === "string" || !firstMsg.content.some((b: any) => b.cache_control)).toBe(true);
  });
});
