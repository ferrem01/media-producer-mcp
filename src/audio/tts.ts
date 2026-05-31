/**
 * TTS Client - Generate voiceover audio using OpenAI's TTS API.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface TTSOptions {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  model?: "tts-1" | "tts-1-hd";
  speed?: number; // 0.25 to 4.0
  outputPath: string;
  apiKey?: string;
}

/**
 * Generate speech audio from text using OpenAI TTS API.
 * Returns the output file path.
 */
export async function generateTTS(opts: TTSOptions): Promise<string> {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for TTS generation");
  }

  const voice = opts.voice || "nova";
  const model = opts.model || "tts-1";
  const speed = opts.speed || 1.0;

  console.log(`  TTS: generating "${opts.text.substring(0, 60)}..." voice=${voice} model=${model}`);

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: opts.text,
      speed,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI TTS API error ${response.status}: ${errorBody}`);
  }

  // Ensure output directory exists
  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });

  // Stream response body to file
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(opts.outputPath, Buffer.from(arrayBuffer));

  console.log(`  TTS: wrote ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB to ${opts.outputPath}`);

  return opts.outputPath;
}
