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
  surface?: { tone: string; intensity: number; texture?: string };
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

  // The treatment's TYPED world commitment (visual_system.world -- a caller
  // pin passed through, or the director's own typed choice) wins outright.
  const pinned = (opts.treatment as any)?.visualSystem?.world as ("light" | "dark" | "paper" | undefined);

  // PAPER WORLD (the print/letterpress aesthetic): the typed pin, or the
  // prose keyword trigger ("paper"/"letterpress"/"newsprint"/"zine") for
  // treatments that say it in words. Always a light world; the ink channel
  // handles the type.
  const styleText = [
    (opts.treatment as any)?.visualStyle?.colorMood,
    (opts.treatment as any)?.visualStyle?.spatialStrategy,
    (opts.treatment as any)?.concept,
  ].filter(Boolean).join(" ").toLowerCase();
  const paper = pinned === "paper"
    || (!pinned && /\bpaper\b|\bletterpress\b|\bprint(?:ed)?[- ](?:feel|look|world|aesthetic)|\bnewsprint\b|\bzine\b/.test(styleText));
  if (paper) {
    // PHOTOGRAPHIC TOOTH: a texture tile minted into the brand kit by
    // generate_clip mode='texture' (saved as *-texture.png) is what turns
    // procedural noise into real paper relief -- the learning that closed
    // the gap in the Behind-the-Craft prototype. Resolved from the kit, so
    // minting one is all a tenant has to do.
    const toothAsset = (kit.assets || []).find(
      (a: any) => a?.type === "image" && /-texture\.png$/i.test(String(a?.url || "")));
    return {
      backdrop: { component: "paper-ground", seed: hash31(opts.seedSource), palette },
      theme: "light",
      chapter_slots: 1,
      surface: {
        tone: "#f2efe7",
        intensity: /\bletterpress\b|\btextured\b/.test(styleText) ? 0.7 : 0.3,
        ...(toothAsset ? { texture: String(toothAsset.url) } : {}),
      },
    };
  }

  // Explicit light/dark pin overrides the brand-luminance default.
  const wantLight = pinned === "light" ? true : pinned === "dark" ? false : light;
  return {
    backdrop: {
      component: wantLight ? "mesh-gradient" : "webgl-backdrop",
      seed: hash31(opts.seedSource),
      palette,
    },
    theme: wantLight ? "light" : "dark",
    chapter_slots: 1,
  };
}

/** The scene background color the world implies (authored scenes + templates). */
export function worldBackground(world: WorldSpec): string {
  if (world.backdrop.component === "paper-ground") return world.surface?.tone || "#f2efe7";
  return world.theme === "light" ? "#fafaf8" : "#0c0d12";
}

/** One compact prompt block describing the world to the storyboard/codegen. */
/** The MATERIALS a world is made of -- which components can credibly sit on it.
 *
 *  This belongs to the world, not to any film grammar. The two axes are
 *  independent: a paper film can be tempo-cut or editorial, and a canvas-tour
 *  can run on a dark or light world. Stating a world's vocabulary inside a
 *  grammar's contract would bake a LOOK into a RHYTHM, and the grammar would
 *  then be wrong every time it ran on a different world.
 *
 *  It exists because the catalog is not filtered per film: all ~177 components
 *  reach every storyboard call, and the long universal casting paragraph sells
 *  the screen mocks hard. On a paper world that pull is actively wrong, and
 *  with nothing naming the paper materials the model cast almost nothing at all
 *  (measured on proj_efd519c0: scenes carrying paper-ground and one line of
 *  type, one carrying only the backdrop). */
function worldMaterials(world: WorldSpec): string | null {
  if (world.backdrop.component !== "paper-ground") return null;
  return [
    `- THE MATERIALS OF THIS WORLD: things printed, written, stamped or struck onto the sheet -- pen-script for a human's own hand (1-6 words), typewriter style:"print" for anything the system produced (style:"cli" for a commanded line), para-edit when the beat is copy getting better (a bloated paragraph, a typed command, the fluff receding into the page while the keepers stay full-ink), sticker-prop kind:"stamp" for an artifact LANDING (the letterpress thump -- "BLOG POST", "MON -- BLOG"), kind:"ring" to circle a detail, kind:"image" for an illustrated cutout, and prop-strike for a struck-through gag.`,
    `- NOT IN THIS WORLD: product-UI mocks (quotient-*, browser-frame, device-*, chat and terminal simulators). A dark app panel dropped on a cream sheet is exactly the theme whiplash the continuity rules exist to prevent -- if a beat needs a blog, it is a stamp and a struck headline ON the paper, not a browser window floating above it.`,
  ].join("\n");
}

export function worldPromptBlock(world: WorldSpec): string {
  const materials = worldMaterials(world);
  return [
    `THE WORLD (film-level, already decided -- scenes happen INSIDE it):`,
    `- Theme: ${world.theme.toUpperCase()}. Every scene renders on the ${world.theme} world; do NOT invert to ${world.theme === "light" ? "dark" : "light"} for mood.`,
    `- The backdrop is CONTINUOUS across the whole film (${world.backdrop.component}, palette ${world.backdrop.palette.join(", ")}). Scenes do not choose backgrounds; content swaps inside the world.`,
    `- You may spend at most ${world.chapter_slots} CHAPTER CARD: a deliberate full-bleed theme-flip beat (a single word or phrase on the opposite theme) used as punctuation on the film's biggest moment. Everything else stays on-theme.`,
    ...(materials ? [materials] : []),
  ].join("\n");
}
