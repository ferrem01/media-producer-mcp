/**
 * PIN A HAND-BUILT FILM'S GRAMMAR (and recipe). A generated board gets both
 * from the creative director's treatment; a board written with create +
 * update had no way to say "a person carries this", so the booth and the
 * upload treated every take as a clip (Marc, Oct 12, The First Five
 * Minutes: "How come I don't see the voice-only option?"). A recipe
 * implies its grammar.
 *
 * The board's needs follow the grammar: on a person film the clip needs
 * the take tool added while the film had none are dropped (nothing landed
 * on them), with their slates, and the speaker needs take their place; on
 * any other film a camera ask is a clip.
 */

import type { Project } from "./types.js";
import { FILM_GRAMMARS, type FilmGrammar } from "../llm/creative-director.js";
import { getRecipe } from "./recipes.js";
import { personCarries, ensureSpeakerNeeds, normalizeClipNeeds, isClipNeed, CLIP_NEED_DESCRIPTION } from "./take-needs.js";
import { castScreenSlates } from "./asset-needs.js";

export function pinFilmAxes(project: Project, pin: { film_grammar?: string; recipe?: string }): string | null {
  const recipe = pin.recipe ? getRecipe(pin.recipe) : undefined;
  if (pin.recipe && !recipe) return `Unknown recipe '${pin.recipe}' (list target='vocabulary' shows them)`;
  const grammar = pin.film_grammar || recipe?.grammar;
  if (!grammar) return null;
  if (!(FILM_GRAMMARS as string[]).includes(grammar)) return `Unknown film grammar '${grammar}'`;
  if (recipe && recipe.grammar !== grammar) return `Recipe '${recipe.id}' belongs to the ${recipe.grammar} grammar, not ${grammar}`;
  const t: any = (project as any).treatment || ((project as any).treatment = {});
  t.filmGrammar = grammar as FilmGrammar;
  if (recipe) t.recipe = recipe.id;
  if (personCarries(grammar)) {
    for (const scene of project.storyboard?.scenes || []) {
      if (!Array.isArray(scene.assets)) continue;
      const before = scene.assets.length;
      scene.assets = scene.assets.filter((a) => !(isClipNeed(a) && a.description === CLIP_NEED_DESCRIPTION && a.status !== "provided"));
      // Its "Live-action clip needed" slate on the board goes with it.
      if (scene.assets.length !== before) { const r = castScreenSlates(scene); if (r.cleared) scene.components = r.components as any; }
    }
    ensureSpeakerNeeds(project);
  } else {
    normalizeClipNeeds(project);
  }
  return null;
}
