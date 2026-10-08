/**
 * Scene Voiceover Generator
 *
 * Read each scene's voiceover_text in the film's ElevenLabs voice (audio/tts.ts).
 */

import path from "node:path";
import { speak } from "./tts.js";

export interface SceneVoiceoverInput {
  label?: string;
  voiceover_text?: string;
  duration_seconds: number;
}

export interface SceneVoiceoverOptions {
  scenes: SceneVoiceoverInput[];
  /** A stock name, a cast actor id or an ElevenLabs voice id (tts.ts). */
  voice?: string;
  /** 0.8-1.25; tempo with the pitch kept. */
  speed?: number;
  outputDir: string;
  tenant?: string;
}

/**
 * Generate voiceover audio for each scene that has voiceover_text.
 * Returns array of audio file paths (empty string for scenes with no text).
 */
export async function generateSceneVoiceovers(
  opts: SceneVoiceoverOptions,
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < opts.scenes.length; i++) {
    // Narrate ONLY explicit script text. Never fall back to the scene label --
    // a label is an editorial name ("Visual Pause", "Scene 5 — Logo + CTA"),
    // not narration, and an auto-inserted pause scene has no script by design.
    const text = opts.scenes[i].voiceover_text;
    if (!text || !text.trim()) {
      results.push("");
      continue;
    }
    const out = path.join(opts.outputDir, `voiceover_scene_${i}.mp3`);
    await speak({ text, out, voice: opts.voice, speed: opts.speed, tenant: opts.tenant });
    results.push(out);
  }

  console.log(`  Scene voiceovers: generated ${results.filter(r => r).length}/${opts.scenes.length} clips`);
  return results;
}
