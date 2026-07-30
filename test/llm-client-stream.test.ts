import { describe, it, expect, afterEach, vi } from "vitest";
import { callLLM, callLLMAgentic, type LLMConfig } from "../src/llm/client.js";

// The LLM client streams under the hood (idle-timeout guard instead of a
// wall-clock that aborted legitimately slow generations). These tests replay
// real Anthropic SSE event sequences through a mocked fetch and assert the
// reassembled response matches the classic non-streaming shape callers expect.

const config: LLMConfig = { provider: "anthropic", apiKey: "test-key", model: "claude-sonnet-4-6" };

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

/** Build a Response whose body delivers `payload` in the given byte-length chunks. */
function streamResponse(payload: string, chunkSizes?: number[]): Response {
  const bytes = new TextEncoder().encode(payload);
  const chunks: Uint8Array[] = [];
  if (chunkSizes) {
    let off = 0;
    for (const size of chunkSizes) {
      chunks.push(bytes.slice(off, off + size));
      off += size;
    }
    if (off < bytes.length) chunks.push(bytes.slice(off));
  } else {
    chunks.push(bytes);
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const TEXT_EVENTS = [
  { type: "message_start", message: { id: "msg_1", role: "assistant", content: [] } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } },
  { type: "message_stop" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("llm client streaming", () => {
  it("requests a stream and reassembles text deltas", async () => {
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return streamResponse(sse(TEXT_EVENTS));
    }));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result).toBe("Hello world");
    expect(sentBody.stream).toBe(true);
  });

  it("survives SSE events split across arbitrary chunk boundaries", async () => {
    const payload = sse(TEXT_EVENTS);
    // 7-byte chunks guarantee events are split mid-line and mid-JSON.
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(payload, Array(Math.ceil(payload.length / 7)).fill(7))));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result).toBe("Hello world");
  });

  it("reassembles tool_use input from input_json_delta chunks", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_2", role: "assistant", content: [] } },
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "add_scene", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"purpose": "the ho' } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'ok", "duration": 2}' } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
      { type: "message_stop" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(sse(events))));

    const result = await callLLMAgentic(config, [{ role: "user", content: "go" }], [
      { name: "add_scene", description: "adds", input_schema: { type: "object" } },
    ]);
    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toEqual([
      { id: "toolu_1", name: "add_scene", input: { purpose: "the hook", duration: 2 } },
    ]);
  });

  it("ignores thinking blocks and returns only text", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_3", role: "assistant", content: [] } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "pondering..." } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "answer" } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
      { type: "message_stop" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(sse(events))));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result).toBe("answer");
  });

  it("retries a mid-stream connection drop and succeeds on the next attempt", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (call++ === 0) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse(TEXT_EVENTS.slice(0, 3))));
            controller.error(new Error("socket hang up"));
          },
        });
        return new Response(body, { status: 200 });
      }
      return streamResponse(sse(TEXT_EVENTS));
    }));

    const result = await callLLM(config, [{ role: "user", content: "hi" }]);
    expect(result).toBe("Hello world");
    expect(call).toBe(2);
  }, 15000);

  it("surfaces non-transient HTTP errors with the API's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid model" } }), { status: 404 }),
    ));

    await expect(callLLM(config, [{ role: "user", content: "hi" }])).rejects.toThrow(/404.*invalid model/s);
  });
});
