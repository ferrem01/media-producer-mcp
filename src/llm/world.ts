/**
 * The WORLD (SPEC-world.md): the film's one continuous visual container,
 * derived at the creative-director stage and honored everywhere downstream.
 *
 * A film is not a sequence of scenes -- it is one world, visited by scenes.
 * Before this, the only film-level visual commitments were the brand kit and
 * four sentences of prose (`visualStyle`) each stage was free to reinterpret;
 * the deterministic scene path literally minted a fresh backdrop seed per
 * scene (`5 + sceneIndex * 7`) -- the deck-of-posters bug. The world is the
 * typed contract that deletes that class of drift.
 *
 * Derivation is CODE, not another LLM call: the treatment already carries the
 * creative intent (colorMood), and the brand kit carries the facts (palette,
 * background luminance). Deterministic derivation means the world is stable
 * across regenerations of the same project.
 */

import type { BrandKit } from "../core/types.js";
import type { Treatment } from "./creative-director.js";

export interface WorldSpec {
  /** The continuous backdrop system -- ONE recipe for the whole film. */
  backdrop: {
    component: "mesh-gradient" | "webgl-backdrop" | "paper-ground";
    /** Single seed for the film; scene assembly derives nothing per-scene. */
    seed: number;
    /** Brand-resolved palette anchors (hex), 2-4. */
    palette: string[];
  };
  /** The film's home temperature. Scenes do not choose their own theme. */
  theme: "light" | "dark";
  /** Full-bleed theme-flip beats the storyboard may spend (chapter cards). */
  chapter_slots: number;
  /** Print-world surface params (paper-ground only): the intensity dial spans
   *  clean print (~0.15) to letterpress (~0.85). Carried into the backdrop
   *  component's data by scene assembly. */
  surface?: { tone: string; intensity: number };
}

/** Relative luminance > 0.5 -> light. */
export function hexIsLight(hex?: string): boolean {
  let h = (hex || "#0f172a").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/** Deterministic 31-bit hash (world seed source). */
function hash31(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) | 0) & 0x7fffffff;
  return h || 7;
}

/**
 * Derive the film's world from the brand kit + treatment.
 *
 * - Light brand -> LIGHT world on the mesh-gradient family (airy, editorial;
 *   the look the viral single-file demos ship by default). The dark cinematic
 *   world remains the home for dark brands -- a choice, no longer the default.
 * - Palette anchors come from the brand's primary/secondary/accent, softened
 *   for the light world by the component (the world carries the anchors).
 * - Seed is a stable hash of tenant + film name so a regeneration of the
 *   same film lands in the same world.
 */
export function deriveWorld(opts: {
  brandKit: BrandKit;
  treatment?: Treatment | null;
  /** Stable identity for the seed (e.g. `${tenantId}:${prompt.slice(0,80)}`). */
  seedSource: string;
}): WorldSpec {
  const kit = opts.brandKit || ({ colors: {}, fonts: [] } as any);
  const light = hexIsLight(kit.colors?.background);
  const palette = [kit.colors?.primary, kit.colors?.secondary, kit.colors?.accent]
    .filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c))
    .slice(0, 3);
  if (!palette.length) palette.push(light ? "#6366f1" : "#4f46e5");

  // PAPER WORLD (the print/letterpress aesthetic): chosen when the treatment's
  // creative direction asks for it in words. Deterministic keyword trigger --
  // the creative director says "paper"/"print"/"letterpress"/"editorial warm"
  // and the film lands on a painted sheet instead of a gradient. Always a
  // light world; the ink channel handles the type.
  const styleText = [
    (opts.treatment as any)?.visualStyle?.colorMood,
    (opts.treatment as any)?.visualStyle?.spatialStrategy,
    (opts.treatment as any)?.concept,
  ].filter(Boolean).join(" ").toLowerCase();
  const paper = /\bpaper\b|\bletterpress\b|\bprint(?:ed)?[- ](?:feel|look|world|aesthetic)|\bnewsprint\b|\bzine\b/.test(styleText);
  if (paper) {
    return {
      backdrop: { component: "paper-ground", seed: hash31(opts.seedSource), palette },
      theme: "light",
      chapter_slots: 1,
      surface: {
        tone: "#f2efe7",
        intensity: /\bletterpress\b|\btextured\b/.test(styleText) ? 0.7 : 0.3,
      },
    };
  }

  return {
    backdrop: {
      component: light ? "mesh-gradient" : "webgl-backdrop",
      seed: hash31(opts.seedSource),
      palette,
    },
    theme: light ? "light" : "dark",
    chapter_slots: 1,
  };
}

/** The scene background color the world implies (authored scenes + templates). */
export function worldBackground(world: WorldSpec): string {
  if (world.backdrop.component === "paper-ground") return world.surface?.tone || "#f2efe7";
  return world.theme === "light" ? "#fafaf8" : "#0c0d12";
}

/** One compact prompt block describing the world to the storyboard/codegen. */
export function worldPromptBlock(world: WorldSpec): string {
  return [
    `THE WORLD (film-level, already decided -- scenes happen INSIDE it):`,
    `- Theme: ${world.theme.toUpperCase()}. Every scene renders on the ${world.theme} world; do NOT invert to ${world.theme === "light" ? "dark" : "light"} for mood.`,
    `- The backdrop is CONTINUOUS across the whole film (${world.backdrop.component}, palette ${world.backdrop.palette.join(", ")}). Scenes do not choose backgrounds; content swaps inside the world.`,
    `- You may spend at most ${world.chapter_slots} CHAPTER CARD: a deliberate full-bleed theme-flip beat (a single word or phrase on the opposite theme) used as punctuation on the film's biggest moment. Everything else stays on-theme.`,
  ].join("\n");
}
