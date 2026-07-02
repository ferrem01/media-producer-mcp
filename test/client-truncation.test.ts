import { describe, it, expect, vi, afterEach } from "vitest";
import { callLLM, callLLMAgentic, type LLMConfig, type LLMTool } from "../src/llm/client.js";

const CONFIG: LLMConfig = { provider: "anthropic", apiKey: "test-key", model: "claude-sonnet-5" };

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
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
