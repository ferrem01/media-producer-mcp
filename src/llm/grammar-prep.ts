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
import path from "node:path";

export type GrammarMandate = "generate" | "assemble";

export interface GrammarPrep {
  grammar: FilmGrammar;
  /** "generate" = invent visuals (LLM); "assemble" = place given materials. */
  mandate: GrammarMandate;
  /** Music bed selected up front (music-first). */
  music?: MusicTrack | null;
  /** Beat grid of the music bed -- the "bars" timing spine. */
  beatMap?: BeatMap;
  /** Given screen recording to feature (screencast assemble path). */
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
  /** A screen recording to feature (selects the screencast assemble path). */
  screencastSource?: string;
  /** The narration that owns the clock (audio, or camera+voice). */
  narrationSource?: string;
  sceneCount?: number;
  /** THE MUSIC CHOICE (SPEC-briefs.md, the sources): a track the human
   *  chose in the board. Given, the pick is skipped and the beat grid is
   *  read from this file; the film is cut against the bed it will carry. */
  chosenMusic?: MusicTrack | null;
  /** Where the film's own generated bed is written (staged until the
   *  project exists; the build moves it into the film's audio folder). */
  musicDir?: string;
  /** A voice will sit over the bed (it is made sparse to stay out of the way). */
  voiced?: boolean;
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
  // ── screencast with a GIVEN recording -> assemble ──
  // The visuals are provided (the recording); nothing to invent. The mandate
  // routes the shared pipeline to deterministic placement + compress-to-narration.
  if (grammar === "screencast" && ctx.screencastSource) {
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
      if (ctx.chosenMusic) {
        music = ctx.chosenMusic;
        console.log(`  [prep:${grammar}] Music-first: the chosen bed "${music.title}" (${music.source})`);
      } else if (wantsOwnBed(ctx)) {
        // THE FILM'S OWN SONG, before the storyboard (Marc, Oct 18: "I can't
        // stand that song that you keep using"): a voiceless cut sits on its
        // bed's bars, so the bed it carries is the one made here. The library
        // is only the fallback when ElevenLabs fails.
        music = await ownFilmBed(ctx, mood, estDuration).catch((e: any) => {
          console.warn(`  [prep:${grammar}] Music-first: own bed not made (${e?.message || e}) -- picking from the library`);
          return null;
        });
        if (music) console.log(`  [prep:${grammar}] Music-first: the film's own bed made (${music.duration}s, "${mood}")`);
      }
      if (!music) {
        console.log(`  [prep:${grammar}] Music-first: searching for "${mood}" mood...`);
        music = await selectMusic({
          mood,
          brandKit: ctx.brandKit,
          tenantId: ctx.tenantId,
          minDuration: Math.max(30, Math.floor(estDuration * 0.8)),
        });
      }
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

/** A film makes its own bed unless the brand kit carries music (the brand's
 *  own track wins) or ElevenLabs is not set up here. */
function wantsOwnBed(ctx: GrammarPrepCtx): boolean {
  if (!ctx.musicDir || !process.env.ELEVENLABS_API_KEY) return false;
  return !(ctx.brandKit?.assets || []).some((a: any) => a?.type === "music");
}

/** Make the film's bed at its estimated length, with a margin: the board is
 *  cut before its length is final, and a bed that runs out is worse than one
 *  that fades out early. */
export async function ownFilmBed(
  ctx: Pick<GrammarPrepCtx, "musicDir" | "voiced">,
  mood: string,
  estSeconds: number,
  make?: typeof import("../audio/music-generate.js").generateMusic,
): Promise<MusicTrack> {
  const { generateMusic, filmMusicPrompt } = await import("../audio/music-generate.js");
  const seconds = Math.ceil(Math.max(20, estSeconds * 1.25));
  const made = await (make || generateMusic)({
    prompt: filmMusicPrompt({ mood, seconds, voiced: ctx.voiced }),
    seconds,
    name: mood,
    outDir: ctx.musicDir!,
  });
  return {
    id: `generated-${made.song_id || path.basename(made.file, ".mp3")}`,
    title: `Own bed (${mood})`,
    artist: "ElevenLabs music",
    duration: made.seconds || seconds,
    path: made.file,
    source: "generated",
    license: "Generated for this film (ElevenLabs)",
  };
}
