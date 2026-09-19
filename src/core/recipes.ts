/**
 * THE RECIPE (SPEC-recipes.md): the measured cut of one film with the
 * content removed. A film commits to three axes -- grammar (what carries
 * the argument), frame (the size), recipe (the cut). A recipe belongs to
 * one grammar, names the frames it is proven at, and gives the writer a
 * spine of beats with durations and word budgets, the layers' behavior,
 * the motion vocabulary and what it asks the human for. The writer fills
 * slots; timing comes from the recipe; the build's deterministic layers
 * do the rest. Recipes are data in src/recipes/*.recipe.json, measured
 * from films Marc liked.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RecipeShot = "person" | "person+cutaway" | "person+split" | "person+card" | "broll" | "idea_card" | "type_card" | "screen";

export interface RecipeBeat {
  role: string;
  shot: RecipeShot | string;
  /** [min, target, max] seconds. */
  dur: [number, number, number];
  repeat?: [number, number];
  enters?: string[];
  cutaway?: { at: string; hold: number; exit_before?: string; use?: "cutaway" | "split" | "card"; kind?: string };
  note?: string;
}

export interface Recipe {
  id: string;
  name: string;
  grammar: string;
  frames_proven: string[];
  suits: string[];
  length_s: [number, number];
  spine: RecipeBeat[];
  rhythm: { cut_cadence_s: number; max_hold_s: number; wpm: number; first_cut_by_s: number; end_card_s?: number; [k: string]: unknown };
  layers: Record<string, unknown>;
  motion: { elements: Record<string, { in?: string; in_s?: number; out?: string; out_s?: number; per?: string; ease?: string }>; transitions?: Record<string, string>; camera?: Record<string, string>; physics?: string };
  asks: Record<string, unknown>;
  latitude?: { optional?: string[]; fixed?: string[]; may_double?: string[] };
  source: { film: string; length_s: number; frame?: string; cuts_s?: number[]; measured: string };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** src/core -> src/recipes (and dist/core -> dist/recipes after the build's copy). */
const RECIPE_DIRS = [path.resolve(HERE, "..", "recipes"), path.resolve(HERE, "..", "..", "src", "recipes")];

let cache: Recipe[] | null = null;

export function validateRecipe(r: any): string[] {
  const errs: string[] = [];
  if (!r || typeof r !== "object") return ["not an object"];
  for (const k of ["id", "name", "grammar", "spine", "rhythm", "layers", "motion", "asks", "source"]) if (r[k] === undefined) errs.push(`missing ${k}`);
  if (!Array.isArray(r.spine) || !r.spine.length) errs.push("spine must be a non-empty list of beats");
  else r.spine.forEach((b: any, i: number) => {
    if (!b.role) errs.push(`beat ${i + 1}: no role`);
    if (!Array.isArray(b.dur) || b.dur.length !== 3 || !(b.dur[0] <= b.dur[1] && b.dur[1] <= b.dur[2])) errs.push(`beat ${i + 1} (${b.role}): dur must be [min, target, max]`);
    if (b.repeat && !(Array.isArray(b.repeat) && b.repeat.length === 2 && b.repeat[0] >= 1 && b.repeat[0] <= b.repeat[1])) errs.push(`beat ${i + 1} (${b.role}): repeat must be [min, max]`);
  });
  if (!Array.isArray(r.length_s) || r.length_s.length !== 2) errs.push("length_s must be [min, max]");
  if (!r.rhythm || typeof r.rhythm.wpm !== "number") errs.push("rhythm.wpm is required");
  return errs;
}

export function loadRecipes(): Recipe[] {
  if (cache) return cache;
  const out: Recipe[] = [];
  const dir = RECIPE_DIRS.find((d) => fs.existsSync(d));
  if (dir) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".recipe.json")).sort()) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        const errs = validateRecipe(r);
        if (errs.length) { console.warn(`  Recipes: ${f} skipped (${errs.join("; ")})`); continue; }
        out.push(r as Recipe);
      } catch (e: any) { console.warn(`  Recipes: ${f} unreadable (${e?.message || e})`); }
    }
  }
  cache = out;
  return out;
}
export function resetRecipeCache(): void { cache = null; }
export function getRecipe(id: string | undefined | null): Recipe | undefined {
  if (!id) return undefined;
  return loadRecipes().find((r) => r.id === id);
}
export function recipesForGrammar(grammar: string | undefined): Recipe[] {
  return loadRecipes().filter((r) => !grammar || r.grammar === grammar);
}

/** Words a beat can carry at the recipe's pace. */
export function wordBudget(seconds: number, wpm: number): number { return Math.max(3, Math.round((seconds * wpm) / 60)); }

/** The recipe as the director sees it: one line each, to pick from. */
export function recipeMenu(): string {
  const rs = loadRecipes();
  if (!rs.length) return "";
  return rs.map((r) => `- "${r.id}" (${r.grammar}, proven ${r.frames_proven.join("/")}, ${r.length_s[0]}-${r.length_s[1]}s): ${r.name}. Suits: ${r.suits.join("; ")}.`).join("\n");
}

/** The recipe as the writer must fill it: the spine, beat by beat, with the
 *  numbers; the layers; what it asks for; the writer's latitude. */
export function recipeBlock(r: Recipe, frame?: string): string {
  const wpm = r.rhythm.wpm;
  const beats = r.spine.map((b, i) => {
    const rep = b.repeat ? ` -- REPEAT ${b.repeat[0]}-${b.repeat[1]} times, one scene each` : "";
    const cut = b.cutaway ? ` Cutaway (${b.cutaway.use || "cutaway"}${b.cutaway.kind ? `, ${b.cutaway.kind}` : ""}): enters at ${b.cutaway.at}, holds ${Math.round(b.cutaway.hold * 100)}% of the beat${b.cutaway.exit_before ? `, out before ${b.cutaway.exit_before}` : ""}.` : "";
    const ent = b.enters && b.enters.length ? ` Enters: ${b.enters.join(", ")}.` : "";
    return `${i + 1}. ${b.role.toUpperCase()} -- ${b.shot}, ${b.dur[1]}s (${b.dur[0]}-${b.dur[2]}s), about ${wordBudget(b.dur[1], wpm)} words (never more than ${wordBudget(b.dur[2], wpm)})${rep}.${ent}${cut}${b.note ? ` ${b.note}` : ""}`;
  }).join("\n");
  const lat = r.latitude || {};
  const proven = frame && !r.frames_proven.includes(frame) ? ` (proven at ${r.frames_proven.join("/")}; this film ships ${frame} -- keep the spine, let the frame laws place things)` : "";
  return `## THE RECIPE: ${r.name} ("${r.id}") -- MANDATORY
This film follows a measured cut${proven}. Fill its beats in order with THIS brief's words and proof; do not invent the structure. One scene per beat (a repeated beat is that many scenes). Total ${r.length_s[0]}-${r.length_s[1]}s. Speaking pace ${wpm} words a minute: a beat's words must fit its seconds -- cut words, not the recipe.

BEATS
${beats}

RHYTHM: a visual change every ~${r.rhythm.cut_cadence_s}s; nothing holds unchanged longer than ${r.rhythm.max_hold_s}s; the first cut lands by ${r.rhythm.first_cut_by_s}s.
LAYERS: ${JSON.stringify(r.layers)}.
ASKS FROM THE HUMAN: ${JSON.stringify(r.asks)} -- list them as the scenes' needs (assets) with the words they enter and leave on.
LATITUDE: ${lat.optional?.length ? `you may drop: ${lat.optional.join(", ")}. ` : ""}${lat.may_double?.length ? `you may repeat within the range: ${lat.may_double.join(", ")}. ` : ""}${lat.fixed?.length ? `never drop or reorder: ${lat.fixed.join(", ")}.` : ""}
Name each scene "<Role> - <what it says>" so the beat is legible on the board.`;
}

/** The recipe's expected scene count range. */
export function recipeSceneBand(r: Recipe): { min: number; max: number } {
  let min = 0, max = 0;
  const optional = new Set(r.latitude?.optional || []);
  for (const b of r.spine) {
    const lo = b.repeat ? b.repeat[0] : 1, hi = b.repeat ? b.repeat[1] : 1;
    min += optional.has(b.role) ? 0 : lo; max += hi;
  }
  return { min: Math.max(1, min), max: Math.max(min, max) };
}

/** What the board got wrong against the recipe, in plain lines (warnings,
 *  the way the brief locks are reported). */
export function checkBoardAgainstRecipe(board: { scenes: Array<{ label?: string; duration_seconds?: number; voiceover_text?: string }> }, r: Recipe): string[] {
  const out: string[] = [];
  const scenes = board.scenes || [];
  const band = recipeSceneBand(r);
  if (scenes.length < band.min || scenes.length > band.max) out.push(`The recipe "${r.id}" wants ${band.min}-${band.max} scenes; the board has ${scenes.length}.`);
  const total = scenes.reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);
  if (total < r.length_s[0] - 3 || total > r.length_s[1] + 3) out.push(`The recipe runs ${r.length_s[0]}-${r.length_s[1]}s; the board runs ${Math.round(total)}s.`);
  // Walk the spine against the scenes in order, expanding repeats greedily.
  const maxHold = Math.max(...r.spine.map((b) => b.dur[2]));
  scenes.forEach((s, i) => {
    const dur = Number(s.duration_seconds) || 0;
    if (dur > maxHold + 1) out.push(`Scene ${i + 1} runs ${dur}s; no beat in the recipe runs past ${maxHold}s.`);
    // A scene named for its beat is held to THAT beat's range (measured
    // live, proj_421b06e9: the one-second audience gags written at 2.5s).
    const role = roleOfLabel(s.label, r);
    const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
    if (beat && dur > 0 && dur > beat.dur[2] + 0.5) out.push(`Scene ${i + 1} (${beat.role}) runs ${dur}s; that beat runs ${beat.dur[0]}-${beat.dur[2]}s.`);
    else if (beat && dur > 0 && dur < beat.dur[0] - 0.5) out.push(`Scene ${i + 1} (${beat.role}) runs ${dur}s; that beat needs at least ${beat.dur[0]}s.`);
    const words = String(s.voiceover_text || "").trim().split(/\s+/).filter(Boolean).length;
    if (dur > 0 && words > wordBudget(dur, r.rhythm.wpm) * 1.25) out.push(`Scene ${i + 1} carries ${words} words in ${dur}s; at ${r.rhythm.wpm} wpm that is more than the beat can say.`);
  });
  return out;
}

const ASSEMBLER_EFFECTS = new Set(["slide-left", "slide-right", "slide-up", "slide-down", "rise", "pop", "fade", "cut"]);
function fx(spec: { in?: string; in_s?: number; out?: string; out_s?: number } | undefined, which: "in" | "out"): { effect: string; duration?: number } | null {
  if (!spec) return null;
  const name = which === "in" ? spec.in : spec.out;
  if (!name || !ASSEMBLER_EFFECTS.has(name)) return null;
  const d = which === "in" ? spec.in_s : spec.out_s;
  return name === "cut" ? { effect: "cut" } : { effect: name, ...(typeof d === "number" ? { duration: d } : {}) };
}

/** The recipe's motion on a scene's cast, deterministically: stamps and
 *  pills (sticker-prop), lower-thirds and provided cutaways take the
 *  recipe's enter/exit unless the writer set one; a fixed camera marks the
 *  scene so no punch-in is invented. Returns how many components changed. */
export function applyRecipeMotion(scene: { components?: any[]; camera_fixed?: boolean; camera_moves?: unknown[] }, r: Recipe, role?: string): number {
  let n = 0;
  const el = r.motion?.elements || {};
  for (const c of (scene.components || []) as any[]) {
    if (!c || typeof c !== "object") continue;
    let spec: any = null;
    if (c.type === "sticker-prop") spec = String(c.data?.kind || "") === "stamp" ? el.stamp : (el.button || el.stamp);
    else if (c.type === "lower-third") spec = el.lower_third;
    else if (c.type === "kinetic-text" && el.keyword) spec = el.keyword;
    if (!spec) continue;
    const eIn = fx(spec, "in"), eOut = fx(spec, "out");
    if (eIn && c.enter === undefined) { c.enter = eIn; n++; }
    if (eOut && c.exit === undefined && eOut.effect !== "cut") { c.exit = eOut; n++; }
  }
  const cam = r.motion?.camera || {};
  const roleCam = role ? cam[role] : undefined;
  const fixed = roleCam ? roleCam === "fixed" : r.layers?.camera === "fixed";
  if (fixed) {
    scene.camera_fixed = true;
    // The recipe's camera wins over the writer's: a fixed beat carries no
    // move at all (measured live, proj_179c8dfa: a zoom authored on the
    // Zoom beat of a fixed-camera recipe).
    if (Array.isArray((scene as any).camera_moves) && (scene as any).camera_moves.length) { (scene as any).camera_moves = []; n++; }
  }
  return n;
}

/** The beat role a scene label carries ("Proof - Memory" -> "proof"). */
/** A person beat's footage is the TAKE: a b-roll ask on a beat whose shot
 *  is "person" with no cutaway is the writer sourcing the place as stock
 *  footage (measured live, proj_421b06e9 and proj_f20bd5da: "handheld
 *  shot of a man walking ... talking to camera" on every beat). Dropped;
 *  the gag clips on broll beats and every other need stay. Returns what
 *  was dropped. */
export function pruneNeedsByRecipe(scene: { label?: unknown; assets?: any[] }, r: Recipe): number {
  const role = roleOfLabel(scene.label, r);
  const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
  if (!beat || !Array.isArray(scene.assets)) return 0;
  // A beat carries b-roll only when the recipe says its footage is found:
  // a broll shot, or a cutaway of kind stock_footage. A feature beat's
  // cutaway is the screen; its "location" b-roll ask is the same misread.
  const findsFootage = beat.shot === "broll" || (beat.cutaway && String(beat.cutaway.kind || "") === "stock_footage");
  if (findsFootage) return 0;
  const before = scene.assets.length;
  scene.assets = scene.assets.filter((a) => !(a && typeof a === "object" && a.type === "stock_footage"));
  return before - scene.assets.length;
}

/** A person beat is the PERSON: a scene template the writer reached for
 *  (st-photo-close on the big picture, st-logo-close on the CTA -- measured
 *  live, proj_8147620f) would cover the take with a card. Dropped on any
 *  beat whose shot starts with "person"; the words are the captions and
 *  the recipe's stamps carry the URL. Returns the template type dropped. */
export function holdShotToRecipe(scene: { label?: unknown; scene_template?: unknown; template?: unknown }, r: Recipe): string | undefined {
  const role = roleOfLabel(scene.label, r);
  const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
  if (!beat || !String(beat.shot).startsWith("person")) return undefined;
  const st = scene.scene_template as any;
  const type = st && typeof st === "object" ? String(st.type || "") : (typeof scene.template === "string" && scene.template ? scene.template : "");
  if (!type) return undefined;
  delete scene.scene_template;
  if (typeof scene.template === "string" && scene.template) scene.template = "";
  return type;
}

export function roleOfLabel(label: unknown, r: Recipe): string | undefined {
  const s = String(label || "").toLowerCase();
  const roles = r.spine.map((b) => b.role.toLowerCase());
  return roles.find((role) => new RegExp(`(^|[^a-z])${role}([^a-z]|$)`).test(s));
}
