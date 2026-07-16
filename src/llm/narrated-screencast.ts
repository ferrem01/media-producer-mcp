/**
 * Deterministic "narrated screencast" assembly -- the runtime branch behind
 * film_grammar: "speaker-screencast" when the speaker is a recorded NARRATION
 * (audio, no camera) driving a SCREEN RECORDING.
 *
 * This is the fast path: NO LLM storyboard, NO codegen. It stamps out the
 * known-good recipe proven by hand --
 *   [brand intro] -> [screen recording, dead-air time-lapsed & fit to the
 *   narration length] -> [brand outro], with the narration as the soundtrack.
 * The screen recording's boring "agent thinking" stretches are compressed via
 * the same auto-compress the manual `add` path uses; the whole film lands on
 * the narration length so audio and picture stay together with no frozen tail.
 */

import { proposeSceneCompression, probeMediaDuration } from "../core/auto-compress.js";
import type { Project, Scene, BrandAsset } from "../core/types.js";

/** A full-frame video scene (screen recording or a brand bookend clip). */
function videoScene(id: string, label: string, url: string, durationSeconds: number): Scene {
  return {
    id,
    label,
    duration_seconds: Math.max(0.5, Math.round(durationSeconds * 10) / 10),
    components: [{
      id: `${id}_v`,
      type: "screencast-frame",
      z_index: 10,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
      data: { video_url: url, frame_style: "none", corner_radius: 0 },
    }],
  } as unknown as Scene;
}

export interface NarratedScreencastResult {
  project: Project;
  summary: string;
  scene_duration: number;
  narration_duration: number;
}

/**
 * Assemble the narrated-screencast film in place on `project`. Sets
 * project.scenes, project.audio (narration), and status='generated'. The
 * caller persists it.
 */
export async function assembleNarratedScreencast(opts: {
  project: Project;
  screencastSource: string;
  /** The narration that owns the clock (audio, or a camera+voice recording). */
  narrationSource?: string;
  dataDir?: string;
}): Promise<NarratedScreencastResult> {
  const { project, screencastSource } = opts;
  const narrationSource = opts.narrationSource;
  const narrationDur = narrationSource ? await probeMediaDuration(narrationSource, opts.dataDir) : 0;

  // Brand bookends -- only when the tenant kit actually ships intro/outro clips.
  const assets: BrandAsset[] = (project.brand_kit?.assets || []) as BrandAsset[];
  const intro = assets.find((a) => a.type === "intro" && a.url);
  const outro = assets.find((a) => a.type === "outro" && a.url);
  const introDur = intro?.duration || 0;
  const outroDur = outro?.duration || 0;

  const scenes: Scene[] = [];
  if (intro) scenes.push(videoScene("intro", "Branded Intro", intro.url, introDur || 6));

  // The screen recording, compressed and fit to the narration MINUS the
  // bookends so the whole film equals the narration length exactly.
  const screencastScene = videoScene("screencast", "Walkthrough", screencastSource, narrationDur > 0.5 ? narrationDur : 573);
  const fitTarget = narrationDur > 0.5 ? Math.max(5, narrationDur - introDur - outroDur) : undefined;
  const compress = await proposeSceneCompression(screencastScene, { dataDir: opts.dataDir, targetDuration: fitTarget });
  scenes.push(screencastScene);

  if (outro) scenes.push(videoScene("outro", "Branded Outro", outro.url, outroDur || 5));

  project.scenes = scenes;
  if (narrationSource) {
    project.audio = { tracks: [{ id: "narration", type: "voiceover", source: narrationSource, volume: 1 }] } as any;
  }
  project.status = "generated";
  project.updated_at = new Date().toISOString();

  const applied = compress.applied[0];
  const parts = [
    intro ? `intro ${Math.round(introDur)}s` : null,
    applied
      ? `screencast ${applied.source_duration}s->${applied.output_duration}s @${applied.idle_rate}x (${applied.idle_ranges} idle stretches)`
      : `screencast (no compressible idle found)`,
    outro ? `outro ${Math.round(outroDur)}s` : null,
  ].filter(Boolean);
  const summary = `Narrated screencast assembled: ${parts.join(" | ")}${narrationDur > 0.5 ? ` | narration ${Math.round(narrationDur)}s` : " | no narration track"}.`;

  return {
    project,
    summary,
    scene_duration: screencastScene.duration_seconds,
    narration_duration: Math.round(narrationDur * 10) / 10,
  };
}
