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

import path from "node:path";
import { proposeSceneCompression, probeMediaDuration, proposeChapterPins } from "../core/auto-compress.js";
import { getSentenceSpine, type SentenceSpine } from "../core/sentence-spine.js";
import { resolveVideoPath } from "../core/video-path.js";
import { callLLM, type LLMConfig } from "./client.js";
import { parseLlmJson } from "./json-repair.js";
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

/** One short title per chapter via a single small LLM call. Returns titles
 *  aligned to `spine.chapters`; empty strings on failure (callers then skip
 *  the chapter cards -- a walkthrough without section titles beats one with
 *  "Part 3" filler). */
export async function titleChapters(
  spine: SentenceSpine,
  llmConfig: LLMConfig,
): Promise<string[]> {
  const blocks = spine.chapters.map((ch, i) => {
    const text = spine.sentences
      .slice(ch.firstSentence, ch.lastSentence + 1)
      .map((s) => s.text)
      .join(" ")
      .slice(0, 700);
    return `Chapter ${i + 1} (${Math.round(ch.start)}s-${Math.round(ch.end)}s): ${text}`;
  });
  try {
    const raw = await callLLM(
      llmConfig,
      [{
        role: "user",
        content:
          `These are the chapters of a narrated product walkthrough video. ` +
          `Give each a short section title: 2-4 words, Title Case, no punctuation, ` +
          `concrete (name the thing being done, not "Introduction"/"Overview" filler).\n\n` +
          blocks.join("\n\n") +
          `\n\nReply with ONLY a JSON array of ${spine.chapters.length} strings, in order.`,
      }],
      { maxTokens: 400, temperature: 0.4 },
    );
    const arr = parseLlmJson(raw, "chapter-titles");
    if (Array.isArray(arr)) {
      return spine.chapters.map((_, i) =>
        typeof arr[i] === "string" ? arr[i].trim().slice(0, 48) : "",
      );
    }
  } catch (e: any) {
    console.warn(`  Spine: chapter titling failed (${e?.message || e}) -- skipping chapter cards`);
  }
  return spine.chapters.map(() => "");
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
  /** Enables the one small chapter-titling call. Captions themselves are
   *  deterministic (whisper on the box) and don't need this. */
  llmConfig?: LLMConfig;
  /** Soft ducked music bed under the narration (default ON for this grammar;
   *  pass false to opt out). */
  music?: boolean;
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

  // ── Sentence spine: captions + chapter cards timed to the narration ──
  // The narration owns the film clock, so spine times ARE film times; the
  // walkthrough scene starts after the intro, so its overlay gets scene-local
  // times (film minus introDur). Degrades to the caption-less assembly when
  // whisper isn't installed or the take transcribes to nothing.
  let spine: SentenceSpine | null = null;
  let pinResult: { pinned: number; dropped: number } | null = null;
  let calloutCount = 0;
  if (narrationSource && narrationDur > 0.5) {
    const cacheDir = path.join(
      opts.dataDir || process.env.MP_DATA_DIR || "/data/media-producer",
      project.tenant_id, "projects", project.project_id, "thumbs",
    );
    spine = await getSentenceSpine(resolveVideoPath(narrationSource, opts.dataDir), cacheDir);
  }
  if (spine) {
    const offset = intro ? introDur : 0;
    const sceneDur = screencastScene.duration_seconds;
    const captions = spine.sentences
      .map((s) => ({
        text: s.text,
        start: Math.max(0, Math.round((s.start - offset) * 100) / 100),
        end: Math.round((s.end - offset) * 100) / 100,
      }))
      .filter((c) => c.end > 0.3 && c.start < sceneDur - 0.5);

    let titles: string[] = spine.chapters.map(() => "");
    if (opts.llmConfig && spine.chapters.length > 1) {
      titles = await titleChapters(spine, opts.llmConfig);
    }
    const chapterMoments = spine.chapters
      .map((ch, i) => ({ title: titles[i], at: Math.max(1.0, Math.round((ch.start - offset) * 100) / 100) }))
      .filter((c) => c.title && c.at < sceneDur - 4);

    screencastScene.components.push({
      id: "narration_overlay",
      type: "narration-track",
      z_index: 50,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
      data: { captions, chapters: chapterMoments },
    } as any);

    // Chapter pins: snap the footage to the narration's chapter boundaries
    // wherever the screencast has a hard visual transition nearby, so the
    // sync is semantic (right screen while it's being talked about), not just
    // durational. Pins land in the media lane -- visible, draggable, human-
    // owned. Conservative: boundaries with no confident visual seam stay
    // unpinned, and strained pins are dropped.
    pinResult = await proposeChapterPins(
      screencastScene,
      spine.chapters.map((ch, i) => ({
        out: ch.start - offset,
        label: titles[i] || `Chapter ${i + 1}`,
      })),
      { dataDir: opts.dataDir },
    );

    // Auto-callouts: when an action-cue sentence ("now click Broadcasts...")
    // coincides with CONCENTRATED on-screen activity, glow/lift that region.
    // Mapped through the PINNED media map (so they stay honest after the pin
    // solve), proposed conservatively, editable as plain component data.
    try {
      const { planCallouts } = await import("../core/callout-plan.js");
      const { ensureMotionIntel } = await import("../core/asset-intel.js");
      const edit = (screencastScene as any).media_edits?.screencast;
      const intel = await ensureMotionIntel(resolveVideoPath(screencastSource, opts.dataDir));
      if (edit?.segments?.length && intel.focus.length) {
        const callouts = planCallouts(
          captions, chapterMoments, edit.segments, intel.focus,
          screencastScene.duration_seconds,
        );
        if (callouts.length) {
          const scfComp = (screencastScene.components as any[]).find((c) => c.type === "screencast-frame");
          if (scfComp) {
            scfComp.data = { ...(scfComp.data || {}), callouts };
            calloutCount = callouts.length;
            console.log(
              `  Callouts: ${callouts.length} proposed at ${callouts.map((c) => `${c.at.toFixed(0)}s`).join(", ")}`,
            );
          }
        } else {
          console.log(`  Callouts: no confident matches (${intel.focus.length} focus events available)`);
        }
      }
    } catch (e: any) {
      console.warn(`  Callouts: proposal failed (${e?.message || e}) -- skipping`);
    }

    project.spine = {
      sentences: spine.sentences,
      chapters: spine.chapters.map((ch, i) => ({ ...ch, title: titles[i] || ch.title })),
    };
  }

  project.scenes = scenes;
  let musicTitle: string | null = null;
  if (narrationSource) {
    project.audio = { tracks: [{ id: "narration", type: "voiceover", source: narrationSource, volume: 1 }] } as any;

    // Soft music bed under the narration, ducked while the narrator speaks
    // and swelling in the gaps + bookends. Part of the grammar's known-good
    // recipe (opt out with music:false); the film still ships if selection
    // comes up empty.
    if (opts.music !== false) {
      try {
        const { selectMusic } = await import("../audio/music.js");
        const bed = await selectMusic({
          mood: "calm",
          brandKit: project.brand_kit,
          tenantId: project.tenant_id,
          minDuration: Math.min(narrationDur, 180),
          instrumental: true, // lyrics fight the narrator
        });
        if (bed) {
          (project.audio as any).tracks.push({
            id: "music_bed", type: "music", source: bed.path,
            volume: 0.18, loop: true, fade_in: 0.8, fade_out: 2.5,
          });
          (project.audio as any).ducking = {
            enabled: true, duck_track: "music_bed", trigger_track: "narration",
            ducked_volume: 0.35, attack: 0.4, release: 0.9,
          };
          musicTitle = bed.title;
          console.log(`  Music bed: "${bed.title}" by ${bed.artist} (${bed.source}) -- ducked under narration`);
        }
      } catch (e: any) {
        console.warn(`  Music bed: selection failed (${e?.message || e}) -- continuing without`);
      }
    }
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
    spine ? `spine ${spine.sentences.length} sentences / ${spine.chapters.length} chapters` : `no spine (whisper unavailable)`,
    pinResult
      ? pinResult.pinned
        ? `${pinResult.pinned} chapter pin(s) snapped to visual transitions${pinResult.dropped ? ` (${pinResult.dropped} dropped as strained)` : ""}`
        : `no chapter pins (no confident visual seams${pinResult.dropped ? `; ${pinResult.dropped} strained` : ""})`
      : null,
    calloutCount ? `${calloutCount} auto-callout(s)` : null,
    musicTitle ? `music bed "${musicTitle}" ducked under narration` : null,
  ].filter(Boolean);
  const summary = `Narrated screencast assembled: ${parts.join(" | ")}${narrationDur > 0.5 ? ` | narration ${Math.round(narrationDur)}s` : " | no narration track"}.`;

  return {
    project,
    summary,
    scene_duration: screencastScene.duration_seconds,
    narration_duration: Math.round(narrationDur * 10) / 10,
  };
}
