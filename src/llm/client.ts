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
  | { type: "image_url"; image_url: { url: string } };

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

/**
 * Build an LLMConfig from environment variables.
 */
export function llmConfigFromEnv(): LLMConfig {
  var provider = (process.env.MP_LLM_PROVIDER || "anthropic") as "anthropic" | "openai";
  var model = process.env.MP_LLM_MODEL || (provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o");

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

// ── Anthropic ──

async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[],
  options?: LLMCallOptions,
): Promise<string> {
  // Anthropic expects system prompt separate from messages
  var systemPrompt = options?.systemPrompt || "";
  var apiMessages: Array<{ role: string; content: unknown }> = [];

  for (var msg of messages) {
    if (msg.role === "system") {
      // Anthropic only supports one system prompt; concatenate if multiple
      if (typeof msg.content === "string") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      }
      continue;
    }

    if (typeof msg.content === "string") {
      apiMessages.push({ role: msg.role, content: msg.content });
    } else {
      // Convert content parts to Anthropic format
      var blocks: Array<unknown> = [];
      for (var part of msg.content) {
        if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        } else if (part.type === "image_url") {
          // Anthropic uses base64 image blocks
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
            // URL-based image -- Anthropic supports URL source
            blocks.push({
              type: "image",
              source: { type: "url", url },
            });
          }
        }
      }
      apiMessages.push({ role: msg.role, content: blocks });
    }
  }

  var body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options?.maxTokens || 8192,
    messages: apiMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  if (options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    var errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  var data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  // Extract text from response content blocks
  var result = data.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");

  if (!result) {
    throw new Error("Anthropic returned empty response");
  }

  return result;
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
      // OpenAI content parts format
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
