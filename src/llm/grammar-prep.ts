/**
 * Unified per-grammar PREP phase.
 *
 * Every L4 film_grammar contributes the same three things to ONE shared
 * pipeline, produced here BEFORE the storyboard:
 *   1. a MANDATE -- how much the film must be invented:
 *        "generate" -> the LLM invents the visuals (constrained by the spine)
 *        "assemble" -> the materials are GIVEN; place them deterministically
 *   2. a timing SPINE the cut snaps to (music bars / narration sentences), and
 *   3. the given MATERIALS the grammar brings (a music bed / a screen recording).
 *
 * This is the generalization of the music-first model: music-first was already
 * "prep (pick track -> beat grid) -> constrain the shared storyboard". Speaker-
 * screencast is the same shape -- "prep (given recording -> compress) -> place
 * it" -- it just carries its visuals instead of inventing them, so its mandate
 * is "assemble" and the pipeline runs (near-)deterministic. The deterministic-
 * vs-LLM split is an EMERGENT property of the mandate, not a separate pipeline.
 */

import type { FilmGrammar } from "./creative-director.js";
import type { MusicTrack } from "../audio/music.js";
import type { BeatMap } from "../audio/beat-map.js";

export type GrammarMandate = "generate" | "assemble";

export interface GrammarPrep {
  grammar: FilmGrammar;
  /** "generate" = invent visuals (LLM); "assemble" = place given materials. */
  mandate: GrammarMandate;
  /** Music bed selected up front (music-first). */
  music?: MusicTrack | null;
  /** Beat grid of the music bed -- the "bars" timing spine. */
  beatMap?: BeatMap;
  /** Given screen recording to feature (speaker-screencast assemble path). */
  screencast?: { source: string; narrationSource?: string };
}

export interface GrammarPrepCtx {
  prompt: string;
  brandKit: import("../core/types.js").BrandKit;
  tenantId: string;
  format: import("../core/types.js").OutputFormat;
  backgroundMusic?: boolean;
  /** audio_system.music_mood commitment: overrides the prompt-keyword mood. */
  musicMood?: string;
  /** A screen recording to feature (selects the speaker-screencast assemble path). */
  screencastSource?: string;
  /** The narration that owns the clock (audio, or camera+voice). */
  narrationSource?: string;
  sceneCount?: number;
}

/** Mood keyword heuristic for music selection (music-first + legacy fallback). */
export function pickMusicMood(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("exciting") || p.includes("launch") || p.includes("announcement")) return "upbeat";
  if (p.includes("calm") || p.includes("elegant") || p.includes("premium")) return "calm";
  if (p.includes("tech") || p.includes("ai") || p.includes("data")) return "electronic";
  if (p.includes("emotion") || p.includes("story") || p.includes("inspire")) return "inspiring";
  return "corporate";
}

/**
 * Run the prep for the committed grammar. Best-effort: music selection or
 * transcription failures degrade to a plain "generate" mandate rather than
 * failing the whole run.
 */
export async function runGrammarPrep(grammar: FilmGrammar, ctx: GrammarPrepCtx): Promise<GrammarPrep> {
  // ── speaker-screencast with a GIVEN recording -> assemble ──
  // The visuals are provided (the recording); nothing to invent. The mandate
  // routes the shared pipeline to deterministic placement + compress-to-narration.
  if (grammar === "speaker-screencast" && ctx.screencastSource) {
    return {
      grammar,
      mandate: "assemble",
      screencast: { source: ctx.screencastSource, narrationSource: ctx.narrationSource },
    };
  }

  // ── music-first spine (any grammar, when background music is on) ──
  // Pick the track and beat-map it BEFORE the storyboard so the shared
  // storyboard authors durations in bars and cuts land on downbeats.
  let music: MusicTrack | null = null;
  let beatMap: BeatMap | undefined;
  if (ctx.backgroundMusic && (ctx.format === "video" || ctx.format === "slideshow")) {
    try {
      const { selectMusic } = await import("../audio/music.js");
      const mood = ctx.musicMood || pickMusicMood(ctx.prompt);
      const estDuration = (ctx.sceneCount || 6) * 5.5;
      console.log(`  [prep:${grammar}] Music-first: searching for "${mood}" mood...`);
      music = await selectMusic({
        mood,
        brandKit: ctx.brandKit,
        tenantId: ctx.tenantId,
        minDuration: Math.max(30, Math.floor(estDuration * 0.8)),
      });
      if (music) {
        const { analyzeBeats } = await import("../audio/beat-map.js");
        const map = await analyzeBeats(music.path);
        if (map.confidence >= 0.2) {
          beatMap = map;
          console.log(`  [prep:${grammar}] Music-first: "${music.title}" by ${music.artist} -- ${map.bpm} BPM, bar=${map.barSec}s, downbeat@${map.firstDownbeatSec}s (conf ${map.confidence})`);
        } else {
          console.log(`  [prep:${grammar}] Music-first: "${music.title}" beat grid too uncertain (conf ${map.confidence}), cutting unquantized`);
        }
      }
    } catch (e: any) {
      console.warn(`  [prep:${grammar}] Music-first selection failed (non-fatal): ${e.message}`);
      music = null;
      beatMap = undefined;
    }
  }

  return { grammar, mandate: "generate", music, beatMap };
}
