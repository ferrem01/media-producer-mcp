/**
 * THE VIRAL FORMATS (SPEC-creator-formats.md): the ten named devices a
 * creator video runs on. A format is not a fifth axis: it is the family a
 * RECIPE belongs to (`recipe.format`). `generate format:"listicle"` picks the
 * format's default recipe (the first in `recipes`) when no recipe is pinned.
 */

export interface ViralFormat {
  id: string;
  name: string;
  what: string;
  /** The recipes of this format, the default first. Checked against the
   *  library by the tests (every id must exist and name this format). */
  recipes: string[];
}

export const VIRAL_FORMATS: ViralFormat[] = [
  { id: "talking-head", name: "Talking Head", what: "a person to camera, graphics over them", recipes: ["speaker-kinetic-claims", "speaker-one-take-cards", "founder-selfie-punch-cards", "presenter-location-hop", "founder-bookends-chapters", "founder-launch"] },
  { id: "screen-share", name: "Screen Share", what: "the screen carries it (the screencast grammar with a real recording is the deep version)", recipes: ["ask-work-result"] },
  { id: "listicle", name: "Listicle", what: "N things, counted", recipes: ["presenter-n-things", "index-reel-host", "index-reel-page"] },
  { id: "ranking", name: "Ranking", what: "items placed on a tier list, one by one", recipes: ["ranking-tier-list"] },
  { id: "reaction", name: "Reaction", what: "a source clip on top, the person reacting under it", recipes: ["reaction-split"] },
  { id: "clone", name: "Clone", what: "the same person playing two roles in one frame", recipes: ["clone-dialogue"] },
  { id: "split-screen", name: "Split Screen", what: "a screen in the top half, the person under it", recipes: ["presenter-split-tour"] },
  { id: "green-screen", name: "Green Screen", what: "the person cut out over the proof", recipes: ["green-screen-explainer"] },
  { id: "voiceover-broll", name: "Voiceover B-roll", what: "a voice over footage, no face", recipes: ["voiceover-broll-story", "founder-story-broll"] },
  { id: "yap", name: "Yap", what: "one unscripted take, big captions, almost no graphics", recipes: ["yap-one-take"] },
];

export const FORMAT_IDS = VIRAL_FORMATS.map((f) => f.id);

export function getFormat(id: unknown): ViralFormat | undefined {
  if (typeof id !== "string" || !id) return undefined;
  const k = id.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-b-roll$/, "-broll");
  return VIRAL_FORMATS.find((f) => f.id === k || f.name.toLowerCase().replace(/\s+/g, "-") === k);
}
