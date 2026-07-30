/**
 * LLM API Client
 *
 * Thin wrapper for calling LLMs. Supports Anthropic (Claude) as primary
 * and OpenAI as secondary provider. Uses native fetch -- no SDK dependency.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface LLMConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
}

export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentPart[];
}

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  /** System prompt (alternative to including a system role message) */
  systemPrompt?: string;
}

// ── Tool Use Types ──

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMAgenticResponse {
  text: string | null;
  toolCalls: LLMToolCall[];
  stopReason: string;
}

/**
 * Build an LLMConfig from environment variables.
 */
export function llmConfigFromEnv(): LLMConfig {
  var provider = (process.env.MP_LLM_PROVIDER || "anthropic") as "anthropic" | "openai";
  var model = process.env.MP_LLM_MODEL || (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");

  var apiKey: string;
  if (provider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY || "";
  } else {
    apiKey = process.env.OPENAI_API_KEY || "";
  }

  if (!apiKey) {
    throw new Error(`Missing API key for LLM provider "${provider}". Set ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}.`);
  }

  return { provider, apiKey, model };
}

/**
 * Call an LLM with a list of messages. Returns the text response.
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: LLMCallOptions,
): Promise<string> {
  if (config.provider === "anthropic") {
    return callAnthropic(config, messages, options);
  } else {
    return callOpenAI(config, messages, options);
  }
}

/**
 * Call an LLM with tool-use support. Returns text, tool calls, and stop reason.
 * Supports multi-turn agentic loops where the LLM can call tools.
 */
export async function callLLMAgentic(
  config: LLMConfig,
  messages: LLMMessage[],
  tools: LLMTool[],
  options?: LLMCallOptions,
): Promise<LLMAgenticResponse> {
  if (config.provider === "anthropic") {
    return callAnthropicAgentic(config, messages, tools, options);
  } else {
    throw new Error("Agentic tool use is only supported for Anthropic provider currently");
  }
}

// ── Anthropic ──

function buildAnthropicMessages(
  messages: LLMMessage[],
): { systemPrompt: string; apiMessages: Array<{ role: string; content: unknown }> } {
  var systemPrompt = "";
  var apiMessages: Array<{ role: string; content: unknown }> = [];

  for (var msg of messages) {
    if (msg.role === "system") {
      if (typeof msg.content === "string") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      }
      continue;
    }

    if (typeof msg.content === "string") {
      apiMessages.push({ role: msg.role, content: msg.content });
    } else {
      var blocks: Array<unknown> = [];
      for (var part of msg.content) {
        if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "image_url") {
          var url = part.image_url.url;
          if (url.startsWith("data:")) {
            var match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (match) {
              blocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: match[1],
                  data: match[2],
                },
              });
            }
          } else {
            blocks.push({
              type: "image",
              source: { type: "url", url },
            });
          }
        } else if (part.type === "tool_result") {
          blocks.push({
            type: "tool_result",
            tool_use_id: part.tool_use_id,
            content: part.content,
          });
        } else if (part.type === "tool_use") {
          // Pass through tool_use blocks in assistant messages
          blocks.push({
            type: "tool_use",
            id: part.id,
            name: part.name,
            input: part.input,
          });
        }
      }
      apiMessages.push({ role: msg.role, content: blocks });
    }
  }

  return { systemPrompt, apiMessages };
}

/** The Claude 5 family (sonnet/opus/haiku-5, fable, mythos) deprecates the
 *  `temperature` param -- sending it is a hard 400. (claude-haiku-4-5 is the
 *  4.5 model and still accepts it, hence the anchored family-then-5 match.) */
function modelAcceptsTemperature(model: string): boolean {
  return !/^claude-(sonnet|opus|haiku|fable|mythos)-5/.test(model);
}

/** Timeouts. The original guard here was a single 240s wall clock on a
 *  NON-streaming fetch -- added because a black-holed connection otherwise
 *  froze generate jobs forever. But a wall clock can't tell a dead socket
 *  from a legitimately slow generation: a thinking-heavy model writing a
 *  16k-budget treatment can honestly run past 240s, and then the timeout
 *  aborts *working* requests over and over (measured live as generate jobs
 *  stuck ~13 min at "Designing the creative direction" -- 3 aborted good
 *  attempts + backoffs before one squeaked under the wire).
 *
 *  Now the request STREAMS, and the guard is an IDLE timeout: abort only
 *  when no bytes arrive for a while. A live generation emits deltas
 *  continuously, so slow-but-healthy calls finish on attempt one; a dead
 *  socket goes quiet and still surfaces fast. The wall clock survives only
 *  as a generous absolute backstop. */
const LLM_STREAM_IDLE_TIMEOUT_MS = Number(process.env.MP_LLM_IDLE_TIMEOUT_MS) || 90_000;
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.MP_LLM_TIMEOUT_MS) || 900_000;

/** Scoped LLM-retry notifications: a pipeline run can wrap itself in
 *  `llmRetryScope.run(cb, ...)` and every transient retry inside that async
 *  scope reports to cb -- letting job progress say "retrying the model call
 *  (2/4)" instead of sitting silent. AsyncLocalStorage keeps concurrent jobs
 *  from seeing each other's retries. */
export interface LlmRetryInfo {
  reason: string;
  attempt: number;
  maxAttempts: number;
  waitMs: number;
}
export const llmRetryScope = new AsyncLocalStorage<(info: LlmRetryInfo) => void>();

interface AnthropicMessageShape {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason?: string;
}

type StreamOutcome =
  | { ok: true; message: AnthropicMessageShape }
  | { ok: false; status: number; errorText: string };

/** One streaming POST to the messages API, reassembled into the classic
 *  non-streaming response shape so callers stay unchanged. Throws on
 *  network failure, idle timeout, or mid-stream error events; returns
 *  {ok:false} for HTTP error statuses (which arrive as plain JSON). */
async function streamAnthropicOnce(apiKey: string, body: Record<string, unknown>): Promise<StreamOutcome> {
  var controller = new AbortController();
  var wallTimer = setTimeout(
    () => controller.abort(Object.assign(new Error(`request exceeded the ${LLM_REQUEST_TIMEOUT_MS / 1000}s absolute cap`), { name: "TimeoutError" })),
    LLM_REQUEST_TIMEOUT_MS,
  );
  var idleTimer: NodeJS.Timeout | undefined;
  var armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => controller.abort(Object.assign(new Error(`stream went silent for ${LLM_STREAM_IDLE_TIMEOUT_MS / 1000}s (dead connection)`), { name: "TimeoutError" })),
      LLM_STREAM_IDLE_TIMEOUT_MS,
    );
  };

  try {
    armIdle();
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status, errorText: await response.text() };
    }
    if (!response.body) throw new Error("Anthropic response had no body stream");

    // Parse the SSE event stream back into content blocks + stop_reason.
    var content: Array<Record<string, unknown>> = [];
    var toolJson: Record<number, string> = {};
    var stopReason: string | undefined;
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buf = "";

    for (;;) {
      armIdle();
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });

      var sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        var rawEvent = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        var data = rawEvent
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (!data) continue;
        var evt = JSON.parse(data) as Record<string, any>;
        switch (evt.type) {
          case "content_block_start": {
            var block = { ...evt.content_block } as Record<string, unknown>;
            content[evt.index] = block;
            if (block.type === "tool_use") toolJson[evt.index] = "";
            break;
          }
          case "content_block_delta": {
            var target = content[evt.index];
            if (!target) break;
            if (evt.delta.type === "text_delta") {
              target.text = ((target.text as string) || "") + evt.delta.text;
            } else if (evt.delta.type === "input_json_delta") {
              toolJson[evt.index] = (toolJson[evt.index] || "") + evt.delta.partial_json;
            } else if (evt.delta.type === "thinking_delta") {
              target.thinking = ((target.thinking as string) || "") + evt.delta.thinking;
            } else if (evt.delta.type === "signature_delta") {
              target.signature = ((target.signature as string) || "") + evt.delta.signature;
            }
            break;
          }
          case "content_block_stop": {
            if (toolJson[evt.index] !== undefined && content[evt.index]) {
              content[evt.index].input = toolJson[evt.index] ? JSON.parse(toolJson[evt.index]) : {};
              delete toolJson[evt.index];
            }
            break;
          }
          case "message_delta": {
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
            break;
          }
          case "error":
            throw new Error(`Anthropic stream error: ${evt.error?.message || JSON.stringify(evt.error)}`);
        }
      }
    }

    return { ok: true, message: { content: content.filter(Boolean) as AnthropicMessageShape["content"], stop_reason: stopReason } };
  } finally {
    clearTimeout(wallTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}

/** POST to the Anthropic messages API (streamed under the hood).
 *  - If the model rejects `temperature` as deprecated (Claude 5 family and
 *    beyond), retry once without it -- so a new model id set via MP_LLM_MODEL
 *    can never brick the pipeline on this param.
 *  - Transient failures (idle timeout, network error, mid-stream drop,
 *    429/5xx/overloaded) retry with backoff instead of hanging or failing
 *    the whole generate job on one bad socket. Each retry is reported to
 *    the ambient llmRetryScope so job progress can show it. */
async function postAnthropic(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  var TRANSIENT_BACKOFF_MS = [2000, 8000, 20000];
  var transientAttempt = 0;
  var temperatureRetried = false;
  for (;;) {
    var outcome: StreamOutcome;
    try {
      outcome = await streamAnthropicOnce(apiKey, body);
    } catch (netErr: any) {
      // Idle timeout, connection failure, or mid-stream drop: retry with
      // backoff, then surface. (An aborted read rejects with the abort
      // reason we passed, so the message names which guard fired.)
      var reason = netErr?.message || String(netErr);
      if (transientAttempt < TRANSIENT_BACKOFF_MS.length) {
        var waitMs = TRANSIENT_BACKOFF_MS[transientAttempt++];
        console.warn(`  [llm] request failed (${reason}) -- retry ${transientAttempt}/${TRANSIENT_BACKOFF_MS.length} in ${waitMs / 1000}s`);
        llmRetryScope.getStore()?.({ reason, attempt: transientAttempt, maxAttempts: TRANSIENT_BACKOFF_MS.length + 1, waitMs });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Anthropic API unreachable after ${TRANSIENT_BACKOFF_MS.length + 1} attempts: ${reason}`);
    }
    if (outcome.ok) return outcome.message;
    var errorText = outcome.errorText;
    if (!temperatureRetried && outcome.status === 400 && body.temperature !== undefined
        && /temperature.*deprecated/i.test(errorText)) {
      temperatureRetried = true;
      delete body.temperature;
      continue;
    }
    var transientStatus = outcome.status === 429 || outcome.status >= 500 || /overloaded/i.test(errorText);
    if (transientStatus && transientAttempt < TRANSIENT_BACKOFF_MS.length) {
      var backoffMs = TRANSIENT_BACKOFF_MS[transientAttempt++];
      console.warn(`  [llm] API ${outcome.status} (transient) -- retry ${transientAttempt}/${TRANSIENT_BACKOFF_MS.length} in ${backoffMs / 1000}s`);
      llmRetryScope.getStore()?.({ reason: `API ${outcome.status}`, attempt: transientAttempt, maxAttempts: TRANSIENT_BACKOFF_MS.length + 1, waitMs: backoffMs });
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`Anthropic API error ${outcome.status}: ${errorText}`);
  }
}

async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: LLMCallOptions,
): Promise<string> {
  var { systemPrompt, apiMessages } = buildAnthropicMessages(messages);

  if (options?.systemPrompt) {
    systemPrompt = options.systemPrompt + (systemPrompt ? "\n\n" + systemPrompt : "");
  }

  // Thinking-by-default models spend an UNPREDICTABLE share of max_tokens on
  // thinking before any text -- a budget that comfortably fits the answer can
  // still come back empty when the model thinks long (seen live: 6000 tokens,
  // all thinking, zero script). Self-heal: on an all-thinking empty response,
  // retry once with 4x the budget instead of failing the user's click.
  var maxTokens = options?.maxTokens || 8192;
  for (var attempt = 0; ; attempt++) {
    var body: Record<string, unknown> = {
      model: config.model,
      max_tokens: maxTokens,
      messages: apiMessages,
    };

    if (systemPrompt) {
      // Cache the system prompt: the per-scene callers (codegen, critique)
      // reuse the same large system prompt across every scene running in
      // parallel and across every critique regen, so turns after the first
      // read it from cache instead of reprocessing it.
      body.system = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
    }

    if (options?.temperature !== undefined && modelAcceptsTemperature(config.model)) {
      body.temperature = options.temperature;
    }

    var data = await postAnthropic(config.apiKey, body) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string;
    };

    var result = data.content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text!)
      .join("");

    if (!result) {
      if (data.stop_reason === "max_tokens" && attempt === 0) {
        var grown = Math.min(32768, maxTokens * 4);
        console.warn(`  [llm] empty response: thinking consumed the whole ${maxTokens}-token budget -- retrying once with ${grown}`);
        maxTokens = grown;
        continue;
      }
      // Name the shape: on thinking-by-default models (Claude 5 family) a tight
      // max_tokens can be consumed entirely by the thinking block, leaving no
      // text -- the bare "empty response" error sent us chasing ghosts.
      var blockTypes = data.content.map((b) => b.type).join(",") || "none";
      throw new Error(
        `Anthropic returned empty response (stop_reason: ${data.stop_reason || "?"}; blocks: ${blockTypes})` +
        (data.stop_reason === "max_tokens"
          ? ` -- the model's thinking consumed the whole max_tokens budget (${maxTokens}) even after the automatic retry`
          : ""),
      );
    }

    // A response cut off by the token budget is NOT a usable partial result for
    // JSON-shaped callers (a storyboard truncated mid-scene is invalid JSON,
    // full stop) -- fail loudly and specifically here rather than let it surface
    // hundreds of characters downstream as a mystifying "Invalid JSON" error
    // that has to be reverse-engineered from where the text happens to stop.
    if (data.stop_reason === "max_tokens") {
      throw new Error(
        `Anthropic response truncated: hit max_tokens (${maxTokens}) before finishing. ` +
        `Raise maxTokens for this call. (${result.length} chars returned)`
      );
    }

    return result;
  }
}

async function callAnthropicAgentic(
  config: LLMConfig,
  messages: LLMMessage[],
  tools: LLMTool[],
  options?: LLMCallOptions,
): Promise<LLMAgenticResponse> {
  var { systemPrompt, apiMessages } = buildAnthropicMessages(messages);

  if (options?.systemPrompt) {
    systemPrompt = options.systemPrompt + (systemPrompt ? "\n\n" + systemPrompt : "");
  }

  // Prompt caching: the agentic loops (codegen's chunked write_* calls, the
  // storyboard's add_scene/add_beat calls) hit this in a tight multi-turn
  // loop where every request repeats a large static prefix -- the tools, the
  // system prompt, and the whole conversation so far. Three cache breakpoints
  // (last tool, system, last message block) let turns 2..N read that prefix
  // from cache instead of reprocessing it from scratch, which is the dominant
  // per-turn latency cost of small-call-per-turn agentic generation.
  var cachedTools = tools.map((t, idx) =>
    idx === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t
  );

  var body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens || 16384,
    messages: apiMessages,
    tools: cachedTools,
  };

  if (systemPrompt) {
    body.system = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
  }

  var lastMsg = apiMessages[apiMessages.length - 1];
  if (lastMsg) {
    if (typeof lastMsg.content === "string" && lastMsg.content.length > 0) {
      lastMsg.content = [{ type: "text", text: lastMsg.content, cache_control: { type: "ephemeral" } }];
    } else if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
      var lastBlock = lastMsg.content[lastMsg.content.length - 1] as Record<string, unknown>;
      lastMsg.content[lastMsg.content.length - 1] = { ...lastBlock, cache_control: { type: "ephemeral" } };
    }
  }

  if (options?.temperature !== undefined && modelAcceptsTemperature(config.model)) {
    body.temperature = options.temperature;
  }

  var data = await postAnthropic(config.apiKey, body) as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason: string;
  };

  var text: string | null = null;
  var toolCalls: LLMToolCall[] = [];

  for (var block of data.content) {
    if (block.type === "text" && block.text) {
      text = (text || "") + block.text;
    } else if (block.type === "tool_use" && block.id && block.name && block.input) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }

  return {
    text,
    toolCalls,
    stopReason: data.stop_reason || "end_turn",
  };
}

// ── OpenAI ──

async function callOpenAI(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: LLMCallOptions,
): Promise<string> {
  var apiMessages: Array<{ role: string; content: unknown }> = [];

  for (var msg of messages) {
    if (typeof msg.content === "string") {
      apiMessages.push({ role: msg.role, content: msg.content });
    } else {
      var parts: Array<unknown> = [];
      for (var part of msg.content) {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image_url") {
          parts.push({ type: "image_url", image_url: { url: part.image_url.url } });
        }
      }
      apiMessages.push({ role: msg.role, content: parts });
    }
  }

  var body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens || 8192,
    messages: apiMessages,
  };

  if (options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  var response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    // Same stuck-socket guard as the Anthropic path: no signal = a dead
    // connection stalls the generate job forever with no error.
    signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  var data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  var result = data.choices?.[0]?.message?.content;
  if (!result) {
    throw new Error("OpenAI returned empty response");
  }

  return result;
}
