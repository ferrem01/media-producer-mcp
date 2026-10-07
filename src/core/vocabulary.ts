/**
 * THE CREATOR VOCABULARY (SPEC-creator-formats.md): four hard concepts,
 * each a closed list you can print -- grammar (film), recipe and its format
 * (film), setting (scene), proof use (beat) -- plus the frame. One place
 * that gathers the code's own lists for `list target:"vocabulary"`; never a
 * copy of them.
 */

import { loadRecipes } from "./recipes.js";
import { VIRAL_FORMATS } from "./formats.js";
import { PERFORMER_SETTINGS } from "./performer-settings.js";
import { PROOF_USES } from "./proof-placement.js";

/** The ten film grammars, in the director's order, with what carries the
 *  argument in each (FILM_GRAMMARS, src/llm/creative-director.ts -- the
 *  tests hold the two lists equal). */
export const GRAMMAR_NOTES: Array<{ id: string; what: string }> = [
  { id: "launch-film", what: "few long cinematic scenes, one world" },
  { id: "tempo-cut", what: "product-first montage: driving music, bar-quantized cuts, on-screen type is the voice" },
  { id: "hype-cut", what: "story-first hype: one-bar kinetic type interstitials between longer product beats" },
  { id: "editorial", what: "typography-first: huge serif statements alternating with full-bleed proof" },
  { id: "data-story", what: "numbers as protagonist: claim then proof, one live-drawing figure per scene" },
  { id: "canvas-tour", what: "one unbroken shot across a single surface; beats are places" },
  { id: "relay", what: "every beat carried by an object: one becomes the next, or one stays as the through-line" },
  { id: "screencast", what: "the screen carries it: a real recording, a narrator driving the clock" },
  { id: "speaker", what: "a person carries it: full-bleed on camera, graphics over them" },
  { id: "creator-cut", what: "a person explains, the screen proves it: each claim names its proof, cut in and back" },
];

export const FRAMES = ["16x9", "9x16", "4x5", "1x1"];

export interface Vocabulary {
  grammars: Array<{ id: string; what: string; recipes: string[] }>;
  formats: Array<{ id: string; name: string; what: string; default_recipe?: string; recipes: Array<{ id: string; grammar: string; variant?: string; frames: string[] }> }>;
  recipes: Array<{ id: string; name: string; grammar: string; format?: string; variant?: string; frames: string[]; length_s: [number, number]; suits: string[] }>;
  settings: Array<{ id: string; name: string; booth: string; shot: string }>;
  proof_uses: Array<{ id: string; name: string; layout: string; booth?: string }>;
  frames: string[];
  how_they_combine: string;
}

export function vocabulary(): Vocabulary {
  const rs = loadRecipes();
  const byId = new Map(rs.map((r) => [r.id, r]));
  return {
    grammars: GRAMMAR_NOTES.map((g) => ({ ...g, recipes: rs.filter((r) => r.grammar === g.id).map((r) => r.id) })),
    formats: VIRAL_FORMATS.map((f) => {
      const listed = f.recipes.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
      return { id: f.id, name: f.name, what: f.what, ...(listed[0] ? { default_recipe: listed[0].id } : {}),
        recipes: listed.map((r) => ({ id: r.id, grammar: r.grammar, ...(r.variant ? { variant: r.variant } : {}), frames: r.frames_proven })) };
    }),
    recipes: rs.map((r) => ({ id: r.id, name: r.name, grammar: r.grammar, ...(r.format ? { format: r.format } : {}), ...(r.variant ? { variant: r.variant } : {}), frames: r.frames_proven, length_s: r.length_s, suits: r.suits })),
    settings: PERFORMER_SETTINGS.map((s) => ({ ...s })),
    proof_uses: PROOF_USES.map((u) => ({ ...u })),
    frames: FRAMES,
    how_they_combine: "A film picks a grammar, a recipe (its format follows) and a frame on generate (film_grammar, recipe or creator_format, frame). Each scene's performer plan names a setting (update storyboard.scenes[].performer.setting, or a recipe beat sets it). Each proof need names a use (storyboard.scenes[].assets[].use, or a recipe beat sets it). Example: Listicle -- index-reel-host (creator-cut, 9x16), scenes in Car Talk, proofs on a phone.",
  };
}
