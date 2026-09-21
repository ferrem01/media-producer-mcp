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

/** HOW A BEAT IS MADE (Marc: "when it should be motion graphics vs a
 *  screencast"): take -- the person's own camera; recording -- a REAL screen
 *  recording the human provides, a slate stands in; motion -- MOTION
 *  GRAPHICS, library mocks and components perform it, nothing is asked of
 *  the human; broll -- found footage; illustration -- a drawn image; type --
 *  type alone. Inferred from the shot when absent (madeOf). */
export type RecipeMade = "take" | "recording" | "motion" | "broll" | "illustration" | "type";
export const RECIPE_MADE = new Set<string>(["take", "recording", "motion", "broll", "illustration", "type"]);

export interface RecipeBeat {
  role: string;
  shot: RecipeShot | string;
  made?: RecipeMade;
  /** A found-footage GROUND may lie under this beat when the brief asks
   *  for one (the sheet row: "real office + kinetic task cards"): a
   *  stock_footage need is kept on it, the surface or the cards ride over
   *  the clip. Absent: a beat that is not made of found footage carries no
   *  b-roll ask. */
  ground?: "broll";
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
    if (b.made !== undefined && !RECIPE_MADE.has(String(b.made))) errs.push(`beat ${i + 1} (${b.role}): made must be one of ${[...RECIPE_MADE].join("|")}`);
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

/** How the beat is made: the recipe's word, else inferred from the shot. */
export function madeOf(b: RecipeBeat): RecipeMade {
  if (b.made) return b.made;
  const kind = String(b.cutaway?.kind || "");
  if (kind === "screen_recording" || kind === "screenshot") return "recording";
  if (kind === "stock_footage" || b.shot === "broll") return "broll";
  if (kind === "illustration" || b.shot === "idea_card") return "illustration";
  if (kind === "mockup") return "motion";
  if (b.shot === "type_card") return "type";
  if (b.shot === "screen") return "motion";
  return "take";
}

const MADE_TEXT: Record<RecipeMade, string> = {
  take: "the person's own take (a camera_video need)",
  recording: "a REAL screen recording the human provides -- list a screen_recording need with the words it enters and leaves on; a slate stands in until it lands; never a library mock as the proof",
  motion: "MOTION GRAPHICS -- library mocks and components perform it, scripted; ask the human for NOTHING on this beat (no screen_recording, no stock_footage)",
  broll: "found footage -- a stock_footage need",
  illustration: "a drawn image -- an illustration need",
  type: "type alone on the world",
};

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
    const made = ` MADE AS: ${MADE_TEXT[madeOf(b)]}.${b.ground === "broll" ? " A found-footage GROUND may lie under it when the brief asks for one (a stock_footage need; the surface and the cards ride over the clip, and on a person beat the person rides over it too -- the take as a layer)." : ""}`;
    return `${i + 1}. ${b.role.toUpperCase()} -- ${b.shot}, ${b.dur[1]}s (${b.dur[0]}-${b.dur[2]}s), about ${wordBudget(b.dur[1], wpm)} words (never more than ${wordBudget(b.dur[2], wpm)})${rep}.${made}${ent}${cut}${b.note ? ` ${b.note}` : ""}`;
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
 *  pills (sticker-prop), lower-thirds, the checklist and card-fan props
 *  and provided cutaways take the
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
    else if (c.type === "kinetic-text" && el.keyword) {
      spec = el.keyword;
      // The type's own entrances (type-on, assemble) and the smear-up exit
      // are the component's, not the assembler's: they land on its data.
      const kin = String(el.keyword.in || ""), kout = String(el.keyword.out || "");
      const d = (c.data && typeof c.data === "object") ? c.data : (c.data = {});
      if ((kin === "type-on" || kin === "assemble") && d.entrance === undefined) { d.entrance = kin; n++; }
      if (kout === "smear-up" && d.exit === undefined) { d.exit = kout; n++; }
    }
    else if (c.type === "chapter-kicker") spec = el.kicker;
    else if (c.type === "logo-band") spec = el.logo_band;
    else if (c.type === "checklist-toggles") spec = el.checklist;
    else if (c.type === "card-fan") spec = el.cards;
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
  const findsFootage = beat.shot === "broll" || (beat.cutaway && String(beat.cutaway.kind || "") === "stock_footage") || beat.ground === "broll";
  if (findsFootage) return 0;
  const before = scene.assets.length;
  scene.assets = scene.assets.filter((a) => !(a && typeof a === "object" && a.type === "stock_footage"));
  return before - scene.assets.length;
}

/** The beat is made the way the recipe says (madeOf): a MOTION beat asks
 *  the human for nothing, so its screen needs and the slates cast for them
 *  are dropped (the library performs it); a RECORDING beat must ask, so a
 *  scene that forgot gets a screen_recording need from its purpose (the
 *  slate follows at cast time). Returns what changed, in plain lines. */
export function holdMadeToRecipe(scene: { label?: unknown; purpose?: unknown; assets?: any[]; components?: any[] }, r: Recipe): string[] {
  const role = roleOfLabel(scene.label, r);
  const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
  if (!beat) return [];
  const made = madeOf(beat);
  const out: string[] = [];
  const isScreenNeed = (a: any) => a && typeof a === "object" && (a.type === "screen_recording" || a.type === "screenshot");
  // No person on this beat (a screen, a type card, b-roll, an idea card):
  // a camera take asked for it is the writer's reflex, not the recipe's
  // (measured live, proj_2384e533: every chapter asked for a take).
  if (!String(beat.shot).startsWith("person") && Array.isArray(scene.assets)) {
    const takes = scene.assets.filter((a) => a && typeof a === "object" && a.type === "camera_video" && a.status !== "provided");
    if (takes.length) { scene.assets = scene.assets.filter((a) => !takes.includes(a)); out.push("the camera take ask dropped: no person on this beat"); }
  }
  // A beat made as motion graphics, as the person's take, or as type asks
  // for no screen: its screen needs and the slates cast for them go
  // (measured live, proj_7b306f5b: tool-window mocks the writer put on the
  // hook became a screen_recording ask with a slate over the person).
  const why = made === "motion" ? "the beat is motion graphics" : made === "take" ? "the beat is the person's take" : made === "type" ? "the beat is type alone" : "";
  if (why) {
    if (Array.isArray(scene.assets)) {
      const drop = scene.assets.filter((a) => isScreenNeed(a) && a.status !== "provided");
      if (drop.length) { scene.assets = scene.assets.filter((a) => !drop.includes(a)); out.push(`${drop.length} screen need(s) dropped: ${why}`); }
    }
    if (Array.isArray(scene.components)) {
      const before = scene.components.length;
      scene.components = scene.components.filter((c) => !(c && typeof c === "object" && c.type === "asset-placeholder"));
      if (scene.components.length !== before) out.push(`the slate dropped: ${why}`);
    }
  } else if (made === "recording") {
    const assets = Array.isArray(scene.assets) ? scene.assets : (scene.assets = []);
    if (!assets.some(isScreenNeed)) {
      assets.push({ type: "screen_recording", description: String(scene.purpose || scene.label || "the screen this beat proves"), status: "needed", priority: "recommended", use: "cutaway", fallback: "A slate stands in the screen's slot until the recording lands." });
      out.push("a screen_recording need added: the beat is a real recording");
    }
  }
  return out;
}

/** THE CHAPTER KICKER IS CAST BY THE BUILD: a beat whose `enters` names
 *  chapter-kicker gets one when the writer left it out (measured live,
 *  proj_2384e533: three chapters, no kicker). Its data is derivable --
 *  the chapter's name from the label, its number from its place among
 *  the chapter scenes, the count from how many there are -- so it needs
 *  no writer. Returns how many were cast. */
export function castChapterKickers(board: { scenes: Array<{ label?: unknown; components?: any[] }> }, r: Recipe): number {
  const chapterRoles = new Set(r.spine.filter((b) => (b.enters || []).some((e) => /^chapter-kicker/.test(e))).map((b) => b.role.toLowerCase()));
  if (!chapterRoles.size) return 0;
  const chapters = board.scenes.filter((s) => { const role = roleOfLabel(s.label, r); return !!role && chapterRoles.has(role); });
  let n = 0;
  chapters.forEach((s, i) => {
    if (!Array.isArray(s.components)) s.components = [];
    if (s.components.some((c) => c && typeof c === "object" && c.type === "chapter-kicker")) return;
    const text = String(s.label || "").replace(/^[^-\u2013\u2014:]*[-\u2013\u2014:]\s*/, "").trim() || `Step ${i + 1}`;
    s.components.push({ type: "chapter-kicker", data: { text, step: i + 1, steps: chapters.length, at: 0.3 } });
    n++;
  });
  return n;
}

/** NO PERSON ON THE BEAT MEANS NO TAKE UNDER IT: a chapter on white, a
 *  type card, b-roll, an idea card are OPAQUE scenes. Without this the
 *  build composites them over the camera (measured live, proj_2384e533:
 *  chapter 3's flowchart and the wordmark reveal drawn over the person).
 *  Returns true when the ground was set. */
export function holdGroundToRecipe(scene: { label?: unknown; transparent_background?: boolean }, r: Recipe): boolean {
  const role = roleOfLabel(scene.label, r);
  const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
  if (!beat || String(beat.shot).startsWith("person")) return false;
  if (scene.transparent_background === false) return false;
  scene.transparent_background = false;
  return true;
}

/** THE WORDMARK CARD IS CAST BY THE BUILD: a type_card beat whose `enters`
 *  names stamp:wordmark (the reveal, the close) is the logo-close template
 *  -- the wordmark from the brand kit, the URL when the beat also names
 *  stamp:url and the lines say one -- unless the writer cast a logo
 *  already. A ring the writer put there instead is dropped (measured
 *  live, proj_2384e533: a green ring over the person for "the wordmark").
 *  Returns how many were cast. */
export function castWordmarkCards(board: { scenes: Array<{ label?: unknown; voiceover_text?: unknown; scene_template?: unknown; components?: any[] }> }, r: Recipe): number {
  let n = 0;
  const allText = board.scenes.map((s) => String(s.voiceover_text || "")).join(" ");
  for (const s of board.scenes) {
    const role = roleOfLabel(s.label, r);
    const beat = role ? r.spine.find((b) => b.role.toLowerCase() === role) : undefined;
    if (!beat || beat.shot !== "type_card") continue;
    const enters = beat.enters || [];
    if (!enters.some((e) => /^stamp:wordmark/.test(e))) continue;
    const comps = Array.isArray(s.components) ? s.components : [];
    const hasLogo = !!s.scene_template || comps.some((c) => c && typeof c === "object" && (c.type === "st-logo-close" || (c.type === "sticker-prop" && String(c.data?.kind || "") === "image")));
    if (hasLogo) continue;
    const wantsUrl = enters.some((e) => /^stamp:url/.test(e));
    const own = String(s.voiceover_text || "");
    const m = (own.match(/\b[a-z0-9-]+\.(?:ai|com|io|co|app|dev)(?:\/[\w-]+)?/i) || allText.match(/\b[a-z0-9-]+\.(?:ai|com|io|co|app|dev)(?:\/[\w-]+)?/i));
    s.scene_template = { type: "st-logo-close", data: { tagline: "", cta: "", url: wantsUrl && m ? m[0] : "" } };
    s.components = comps.filter((c) => !(c && typeof c === "object" && c.type === "sticker-prop" && String(c.data?.kind || "") === "ring"));
    n++;
  }
  return n;
}

/** A LOGO BAND CARRIES ONLY CUSTOMERS THE BRIEF NAMES: a text logo that
 *  does not appear in the brief is invented (measured live, twice: Framer,
 *  Linear, Nestle; then Fable, Brightline, Acme, Nova). Image logos from
 *  the tenant's assets are trusted. A band left with nothing is dropped.
 *  Returns what changed, in plain lines. */
export function holdLogoBandToBrief(scene: { components?: any[] }, brief: string): string[] {
  if (!Array.isArray(scene.components)) return [];
  const text = String(brief || "").toLowerCase();
  const out: string[] = [];
  scene.components = scene.components.filter((c) => {
    if (!c || typeof c !== "object" || c.type !== "logo-band") return true;
    const logos = Array.isArray(c.data?.logos) ? c.data.logos : [];
    const kept = logos.filter((l: any) => l && ((typeof l.src === "string" && l.src.startsWith("/assets/")) || (typeof l.text === "string" && l.text.trim() && text.includes(l.text.trim().toLowerCase()))));
    const dropped = logos.length - kept.length;
    if (dropped) out.push(`${dropped} invented logo(s) dropped from the band (not in the brief)`);
    if (!kept.length) { out.push("the logo band dropped: the brief names no customers"); return false; }
    c.data.logos = kept;
    return true;
  });
  return out;
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
  // The label is "<Role> - <what it says>": the role at its head wins over
  // one mentioned later ("BREATHER - kept outtake after the promise" is
  // the breather, not the promise -- measured live, proj_25b2858c).
  const head = roles.find((role) => new RegExp(`^\\s*${role}([^a-z]|$)`).test(s));
  if (head) return head;
  return roles.find((role) => new RegExp(`(^|[^a-z])${role}([^a-z]|$)`).test(s));
}

/** AN EMPTY SURFACE IS DROPPED: a browser-frame (or any windowed mock)
 *  whose content is a blank div, and a number row with no figures, are
 *  the writer sketching a "window" it never filled (measured live,
 *  proj_ff9e68e4: an empty white browser-frame under scenes 5-9 and a
 *  number-counter-row with no data on the proof). They ship as a white
 *  rectangle and an empty slot. Dropped when the scene keeps something
 *  else; a scene with nothing else keeps it (the gates will say so).
 *  Returns what was dropped, in plain lines. */
export function holdEmptySurfaces(scene: { components?: any[] }): string[] {
  if (!Array.isArray(scene.components)) return [];
  const out: string[] = [];
  const isEmptyFrame = (c: any) => {
    if (!c || typeof c !== "object" || c.type !== "browser-frame") return false;
    const html = String(c.data?.content_html ?? c.data?.html ?? "");
    const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return !text && !/<(img|video|svg|iframe)\b/i.test(html) && !c.data?.screenshot_url && !c.data?.src;
  };
  const isEmptyRow = (c: any) => {
    if (!c || typeof c !== "object") return false;
    if (c.type === "number-counter-row") return !Array.isArray(c.data?.stats) || !c.data.stats.length;
    if (c.type === "dashboard-kpi") return !Array.isArray(c.data?.metrics) || !c.data.metrics.length;
    return false;
  };
  const keep = scene.components.filter((c) => !isEmptyFrame(c) && !isEmptyRow(c));
  if (keep.length === scene.components.length || !keep.length) return out;
  for (const c of scene.components) {
    if (isEmptyFrame(c)) out.push("an empty browser-frame dropped (a blank window is a white rectangle)");
    else if (isEmptyRow(c)) out.push(`an empty ${c.type} dropped (no figures)`);
  }
  scene.components = keep;
  return out;
}

