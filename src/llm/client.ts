/**
 * LLM API Client
 *
 * Thin wrapper for calling LLMs. Supports Anthropic (Claude) as primary
 * and OpenAI as secondary provider. Uses native fetch -- no SDK dependency.
 */

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

/** POST to the Anthropic messages API. If the model rejects `temperature` as
 *  deprecated (Claude 5 family and beyond), retry once without it -- so a new
 *  model id set via MP_LLM_MODEL can never brick the pipeline on this param. */
async function postAnthropic(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  for (var attempt = 0; attempt < 2; attempt++) {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    var errorText = await response.text();
    if (attempt === 0 && response.status === 400 && body.temperature !== undefined
        && /temperature.*deprecated/i.test(errorText)) {
      delete body.temperature;
      continue;
    }
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }
  throw new Error("Anthropic API error: retry loop exhausted");
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

  var body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens || 8192,
    messages: apiMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
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
    throw new Error("Anthropic returned empty response");
  }

  // A response cut off by the token budget is NOT a usable partial result for
  // JSON-shaped callers (a storyboard truncated mid-scene is invalid JSON,
  // full stop) -- fail loudly and specifically here rather than let it surface
  // hundreds of characters downstream as a mystifying "Invalid JSON" error
  // that has to be reverse-engineered from where the text happens to stop.
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      `Anthropic response truncated: hit max_tokens (${body.max_tokens}) before finishing. ` +
      `Raise maxTokens for this call. (${result.length} chars returned)`
    );
  }

  return result;
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

  var body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens || 16384,
    messages: apiMessages,
    tools: tools,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
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
