/**
 * Scene Voiceover Generator
 *
 * Generate voiceover audio for each scene based on scene labels or voiceover text.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { generateTTS } from "./tts.js";

export interface SceneVoiceoverInput {
  label?: string;
  voiceover_text?: string;
  duration_seconds: number;
}

export interface SceneVoiceoverOptions {
  scenes: SceneVoiceoverInput[];
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  model?: "tts-1" | "tts-1-hd";
  outputDir: string;
  apiKey: string;
}

/**
 * Generate voiceover audio for each scene that has voiceover_text or a label.
 * Returns array of audio file paths (empty string for scenes with no text).
 */
export async function generateSceneVoiceovers(
  opts: SceneVoiceoverOptions,
): Promise<string[]> {
  await fs.mkdir(opts.outputDir, { recursive: true });

  const results: string[] = [];

  for (let i = 0; i < opts.scenes.length; i++) {
    const scene = opts.scenes[i];
    const text = scene.voiceover_text || scene.label;

    if (!text) {
      results.push("");
      continue;
    }

    const outputPath = path.join(opts.outputDir, `voiceover_scene_${i}.mp3`);

    await generateTTS({
      text,
      voice: opts.voice,
      model: opts.model,
      outputPath,
      apiKey: opts.apiKey,
    });

    results.push(outputPath);
  }

  console.log(
    `  Scene voiceovers: generated ${results.filter(r => r).length}/${opts.scenes.length} clips`,
  );

  return results;
}
