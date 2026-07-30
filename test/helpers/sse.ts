/**
 * Test helper: convert a classic non-streaming Anthropic message shape
 * ({ content: [...], stop_reason }) into the SSE streaming Response the
 * (now streaming-under-the-hood) LLM client actually consumes. Lets the
 * agentic-loop tests keep authoring turns in the readable block shape.
 */
export function sseResponseFromMessage(turn: { content: any[]; stop_reason?: string }): Response {
  const events: Array<Record<string, unknown>> = [
    { type: "message_start", message: { id: "msg_test", role: "assistant", content: [] } },
  ];
  (turn.content || []).forEach((block: any, index: number) => {
    if (block.type === "tool_use") {
      events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) } });
    } else if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      if (block.text) events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else {
      events.push({ type: "content_block_start", index, content_block: { ...block } });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: turn.stop_reason ?? "end_turn" }, usage: {} });
  events.push({ type: "message_stop" });

  const payload = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
}
