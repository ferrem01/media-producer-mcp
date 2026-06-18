/**
 * Editorial vision review — a cross-scene VISUAL pass over the rendered output.
 *
 * The metadata editorial critique (Pass 3) judges pacing/variety/coherence from
 * scene labels, durations, transitions and component *types* -- it never sees a
 * rendered pixel, so it's blind to cross-scene visual defects (a logo present in
 * some scenes but missing in others, one scene that's a broken mess while the
 * rest are clean, two scenes that look near-identical, jarring jumps).
 *
 * This builds a storyboard -- ONE frame per scene from the per-scene scene.mp4
 * files already produced by the renderer -- and feeds it to the vision-capable
 * critiqueEditorial so the whole video gets looked at, not just its structure.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { critiqueEditorial, type EditorialCritiqueResult } from "./multi-pass-critiquer.js";
import type { LLMConfig } from "./client.js";
import type { Project } from "../core/types.js";

const exec = promisify(execFile);

async function probeDuration(mp4: string): Promise<number> {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", mp4]);
    return parseFloat(stdout) || 0;
  } catch { return 0; }
}

/**
 * One representative frame per scene (from workDir/scene_N/scene.mp4), tiled into
 * a grid. Naturally de-duplicated -- one beat per scene. Returns base64 PNG, or
 * null if no per-scene clips are available.
 */
export async function buildSceneStoryboard(workDir: string, sceneCount: number): Promise<{ base64: string; tiles: number } | null> {
  const tmp = path.join(os.tmpdir(), `storyboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tmp, { recursive: true });
  try {
    const framePaths: string[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const mp4 = path.join(workDir, `scene_${i}`, "scene.mp4");
      try { await fs.access(mp4); } catch { continue; }
      const dur = await probeDuration(mp4);
      const at = dur > 0 ? dur * 0.5 : 0.1;
      const fp = path.join(tmp, `s${i}.png`);
      try {
        await exec("ffmpeg", ["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", fp], { timeout: 20000 });
        framePaths.push(fp);
      } catch { /* skip unreadable scene */ }
    }
    if (framePaths.length === 0) return null;

    const cols = Math.min(3, framePaths.length);
    const rows = Math.ceil(framePaths.length / cols);
    const tw = 360, th = 203; // 16:9 thumbnail
    const inputs: string[] = [];
    const scaleParts: string[] = [];
    const stackInputs: string[] = [];
    const layout: string[] = [];
    for (let i = 0; i < framePaths.length; i++) {
      inputs.push("-i", framePaths[i]);
      scaleParts.push(`[${i}]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black[s${i}]`);
      stackInputs.push(`[s${i}]`);
      const c = i % cols, r = Math.floor(i / cols);
      layout.push(`${c * tw}_${r * th}`);
    }
    const out = path.join(tmp, "storyboard.png");
    if (framePaths.length === 1) {
      await exec("ffmpeg", ["-y", ...inputs, "-vf", `scale=${tw}:${th}`, out], { timeout: 20000 });
    } else {
      const filter = scaleParts.join(";") + ";" + stackInputs.join("") + `xstack=inputs=${framePaths.length}:layout=${layout.join("|")}:fill=black[out]`;
      await exec("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", out], { timeout: 30000 });
    }
    const base64 = (await fs.readFile(out)).toString("base64");
    void rows;
    return { base64, tiles: framePaths.length };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Run the cross-scene visual editorial review on a rendered project.
 * Non-fatal: returns null if there are no per-scene clips to look at.
 */
export async function editorialVisionReview(opts: {
  project: Project;
  workDir: string;
  prompt: string;
  llmConfig: LLMConfig;
}): Promise<{ result: EditorialCritiqueResult; tiles: number } | null> {
  const scenes = opts.project.scenes || [];
  if (scenes.length === 0) return null;

  const storyboard = await buildSceneStoryboard(opts.workDir, scenes.length);
  if (!storyboard) return null;

  const sceneMeta = scenes.map((s: any) => ({
    label: s.label || "",
    duration_seconds: s.duration_seconds,
    transition_in: s.transition_in,
    component_types: (s.components || []).map((c: any) => c.type),
    word_count: s.audio_hints?.voiceover_text ? String(s.audio_hints.voiceover_text).trim().split(/\s+/).length : 0,
  }));

  const result = await critiqueEditorial({
    scenes: sceneMeta,
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    format: opts.project.format || "video",
    storyboardBase64: storyboard.base64,
  });
  return { result, tiles: storyboard.tiles };
}
