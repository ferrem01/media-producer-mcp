/**
 * Captions from the take's words (SPEC-creator-cut.md, "the words are on
 * screen the whole time").
 *
 * All four reference films carry the SPOKEN WORDS as their text layer: two
 * to four at a time, keyed to the voice, one word tinted for emphasis. The
 * chapter label ("THE BRIEF") was our first default and reads corporate
 * next to them (Marc: "I don't like chapter labels as a default").
 *
 * Nothing new: the lane is the EXISTING `reel-caption-lane` (timed
 * phrases, `*starred*` words in the brand primary), the words are the
 * scene's EXISTING spine (asserted from the script before the take,
 * measured from the recording after), and each phrase carries the same
 * word anchors every other timed field does, so a take that lands later
 * re-times the captions with everything else.
 *
 * The emphasis is the WRITER's: one word per line wrapped in *stars* in
 * voiceover_text ("One *brief*. Every surface."). `emphasisFromLines`
 * lifts the marks off the line at normalize time, so the prompter, the
 * needs and the spine all read the clean sentence. With no mark, the
 * fallback tints numbers and the brand's name -- editable in Studio.
 */

import { normalizeToken, type Spine, type SpineWord, type AnchorMap } from "./word-anchors.js";

export interface CaptionPhrase { text: string; start: number; end: number }

/** Words per phrase and how long a phrase may run before it breaks. */
const MAX_WORDS = 4;
/** The scatter lane lands shorter phrases: one to three words per spot. */
const SCATTER_MAX_WORDS = 3;
const MAX_SPAN_S = 1.8;
/** A silence this long between two words is a breath: the phrase breaks. */
const BREATH_GAP_S = 0.6;
/** The last phrase holds this long past its last word. */
const TAIL_HOLD_S = 0.35;

const END_PUNCT = /[.!?,;:—–]["')\]]*$/;

/** Lift the writer's emphasis marks off a script: `*word*` -> the clean
 *  script and the marked tokens (normalized). Unbalanced stars are left
 *  alone (a star is then just a star). */
export function emphasisFromLines(script: string): { text: string; emphasis: string[] } {
  const src = String(script || "");
  const stars = (src.match(/\*/g) || []).length;
  if (!stars || stars % 2 !== 0) return { text: src, emphasis: [] };
  const emphasis: string[] = [];
  const text = src.replace(/\*([^*\n]+)\*/g, (_m, inner: string) => {
    for (const w of inner.split(/\s+/)) { const t = normalizeToken(w); if (t && !emphasis.includes(t)) emphasis.push(t); }
    return inner;
  });
  return { text, emphasis };
}

/** The rule's pick when the writer marked nothing: ONE word per sentence,
 *  the way the references tint one word per line -- a number first, then
 *  a name (a capitalized word that does not open the sentence: the
 *  product, a platform), then the brand's name anywhere, then the longest
 *  word of six letters or more. A sentence with none of those stays plain.
 *  (Measured live, proj_9e650f1a: a board written before the marks
 *  existed rendered every caption plain.) */
export function fallbackEmphasis(words: SpineWord[], brandWords: string[] = []): string[] {
  const brand = new Set(brandWords.map(normalizeToken).filter((t) => t.length > 2));
  const out: string[] = [];
  const add = (t: string) => { if (t && !out.includes(t)) out.push(t); };
  // Sentences: split on end punctuation.
  const sentences: SpineWord[][] = [];
  let cur: SpineWord[] = [];
  for (const w of words) {
    if (!normalizeToken(w.text)) continue;
    cur.push(w);
    if (/[.!?]["')\]]*$/.test(w.text.trim())) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  for (const sent of sentences) {
    const toks = sent.map((w) => ({ raw: w.text.trim(), t: normalizeToken(w.text) }));
    const num = toks.find((x) => /\p{N}/u.test(x.t));
    if (num) { add(num.t); continue; }
    const name = toks.find((x, i) => i > 0 && /^[\p{Lu}]/u.test(x.raw) && x.t.length > 1 && x.t !== "i");
    if (name) { add(name.t); continue; }
    const br = toks.find((x) => brand.has(x.t));
    if (br) { add(br.t); continue; }
    const long = toks.filter((x) => x.t.length >= 6).sort((a, b) => b.t.length - a.t.length)[0];
    if (long) add(long.t);
  }
  return out;
}

/** Group the spine's words into caption phrases: a phrase breaks on
 *  end punctuation, on a breath, at MAX_WORDS or MAX_SPAN_S. Each phrase
 *  holds until the next begins (the lane never goes dark mid-claim); the
 *  last holds a beat past its word. Marked words are `*starred*` for the
 *  lane, stars OUTSIDE the token's punctuation so "brief." stays one word. */
export function captionPhrases(spine: Spine, emphasis: string[] = [], opts: { maxWords?: number } = {}): CaptionPhrase[] {
  const words = (spine.words || []).filter((w) => normalizeToken(w.text));
  if (!words.length) return [];
  const maxWords = opts.maxWords || MAX_WORDS;
  const em = new Set(emphasis.map(normalizeToken).filter(Boolean));
  const groups: SpineWord[][] = [];
  let cur: SpineWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length) {
      const first = cur[0], prev = cur[cur.length - 1];
      const breath = w.start - prev.end > BREATH_GAP_S;
      if (cur.length >= maxWords || breath || w.end - first.start > MAX_SPAN_S) { groups.push(cur); cur = []; }
    }
    cur.push(w);
    if (END_PUNCT.test(w.text.trim())) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  // A lone trailing word after a break reads as a stutter ("without you
  // even touching" / "it."): fold it back when the group before it has
  // room, else rebalance so the pair reads 3 + 2 instead of 4 + 1. A group
  // that ends on punctuation is a phrase of its own and is left alone.
  for (let g = groups.length - 1; g > 0; g--) {
    const prev = groups[g - 1];
    if (groups[g].length !== 1 || END_PUNCT.test(prev[prev.length - 1].text.trim())) continue;
    if (prev.length < maxWords) { groups[g - 1] = prev.concat(groups[g]); groups.splice(g, 1); }
    else if (prev.length >= 3) { groups[g] = [prev[prev.length - 1]].concat(groups[g]); groups[g - 1] = prev.slice(0, -1); }
  }
  return groups.map((g, gi) => {
    const text = g.map((w) => (em.has(normalizeToken(w.text)) ? `*${w.text.trim()}*` : w.text.trim())).join(" ");
    const start = round(g[0].start);
    const next = groups[gi + 1];
    const end = round(next ? next[0].start : g[g.length - 1].end + TAIL_HOLD_S);
    return { text, start, end: Math.max(end, start + 0.2) };
  });
}

export interface CaptionLaneOpts {
  /** Words the rule tints when the writer marked none (the brand's name). */
  brandWords?: string[];
  /** Starting font size before the lane auto-fits (phone-scale default). */
  maxFont?: number;
  /** The recipe's caption style (layers.captions.style). "scatter" (the Air
   *  cut): each phrase lands at its own spot around the person and STAYS
   *  until the cut, three words at most, no plate; over a cutaway the
   *  running phrase sits in the bottom band. Anything else: the plated
   *  chest-band lane, phrases replacing each other. */
  style?: string;
}

/** The caption component for a scene: the lane, its phrases from the
 *  spine, and a word anchor on every phrase edge so a later take re-times
 *  it in place. Null when the scene has no words. */
export function captionLane(spine: Spine, emphasis: string[] = [], opts: CaptionLaneOpts = {}): { id: string; type: "reel-caption-lane"; data: Record<string, unknown>; anchors?: AnchorMap } | null {
  const words = (spine.words || []).filter((w) => normalizeToken(w.text));
  if (!words.length) return null;
  const em = emphasis.length ? emphasis : fallbackEmphasis(words, opts.brandWords || []);
  const scatter = opts.style === "scatter";
  const phrases = captionPhrases(spine, em, { maxWords: scatter ? SCATTER_MAX_WORDS : MAX_WORDS });
  if (!phrases.length) return null;
  // Anchors: phrase i starts on its first word and ends where phrase i+1
  // starts (the same word), the last on its own last word's end plus the
  // hold. Occurrences count the token's earlier appearances in the scene.
  const anchors: AnchorMap = {};
  const occ = new Map<string, number>();
  const occurrenceOf: number[] = words.map((w) => { const t = normalizeToken(w.text); const n = (occ.get(t) || 0) + 1; occ.set(t, n); return n; });
  let wi = 0;
  const starts: Array<{ word: string; occurrence: number }> = [];
  const ends: Array<{ word: string; occurrence: number }> = [];
  for (const p of phrases) {
    const n = p.text.split(/\s+/).filter(Boolean).length;
    const first = words[wi], last = words[Math.min(words.length - 1, wi + n - 1)];
    starts.push({ word: first.text, occurrence: occurrenceOf[wi] });
    ends.push({ word: last.text, occurrence: occurrenceOf[Math.min(words.length - 1, wi + n - 1)] });
    wi += n;
  }
  phrases.forEach((_p, i) => {
    anchors[`phrases[${i}].start`] = { word: starts[i].word, occurrence: starts[i].occurrence };
    anchors[`phrases[${i}].end`] = i + 1 < phrases.length
      ? { word: starts[i + 1].word, occurrence: starts[i + 1].occurrence }
      : { word: ends[i].word, occurrence: ends[i].occurrence, edge: "end", offset: TAIL_HOLD_S };
  });
  return {
    id: "captions",
    type: "reel-caption-lane",
    data: scatter
      ? { phrases, mode: "scatter", scrim: "shadow", align: "left", max_font: opts.maxFont || 72, min_font: 34 }
      : { phrases, scrim: "plate", align: "center", max_font: opts.maxFont || 84, min_font: 40 },
    anchors,
  };
}

function round(n: number): number { return Math.round(n * 100) / 100; }

/** The words a caption lane shows, as tokens (stars and punctuation off). */
function laneTokens(lane: { data?: Record<string, unknown> }): string[] {
  const phrases = Array.isArray(lane?.data?.phrases) ? (lane.data!.phrases as unknown[]) : [];
  return phrases
    .map((p) => (typeof p === "string" ? p : (p && typeof p === "object" ? String((p as any).text || "") : "")))
    .join(" ").split(/\s+/).map(normalizeToken).filter(Boolean);
}

/** True when a lane's star marks are broken: a starred token must be
 *  exactly `*word*` (trailing punctuation allowed inside or out). A lane cut
 *  from lines that still carried the writer's stars came out as `*Quotient`,
 *  `*Analytics*.*`, `**automatically*,*` -- same words, so the token check
 *  alone never recast it (measured live, proj_86591051 scene 3). */
export function laneMarksBroken(lane: { data?: Record<string, unknown> }): boolean {
  const phrases = Array.isArray(lane?.data?.phrases) ? (lane.data!.phrases as unknown[]) : [];
  return phrases.some((p) => {
    const text = typeof p === "string" ? p : (p && typeof p === "object" ? String((p as any).text || "") : "");
    return text.split(/\s+/).some((t) => t.includes("*") && !/^\*[^*\s]+\*[^\p{L}\p{N}*]*$/u.test(t));
  });
}

/**
 * THE CAPTIONS FOLLOW THE LINES. A scene's caption lane is cast once, from
 * the words of its lines; an edit to the lines left the old words on screen
 * (measured live, proj_de974ad1: three beats trimmed, their captions still
 * read the original sentences -- the render would have shown words the take
 * never says). Called on every re-time: when the lane's words no longer
 * match the spine's, its phrases and anchors are recast from the spine,
 * keeping the lane's own look (scatter or plated, scrim, fonts, position).
 * A lane that still matches is left alone. Returns how many lanes changed.
 */
export function recaptionIfStale(
  scene: { components?: any[]; voiceover_text?: string; emphasis?: string[]; audio_hints?: { voiceover_text?: string } },
  spine: Spine,
): number {
  const want = (spine.words || []).map((w) => normalizeToken(w.text)).filter(Boolean);
  if (!want.length) return 0;
  let changed = 0;
  for (const lane of scene.components || []) {
    if (!lane || typeof lane !== "object" || lane.type !== "reel-caption-lane") continue;
    const have = laneTokens(lane);
    if (have.length === want.length && have.every((t, i) => t === want[i]) && !laneMarksBroken(lane)) continue;
    const lines = String(scene.voiceover_text || scene.audio_hints?.voiceover_text || "");
    const marked = emphasisFromLines(lines).emphasis;
    const kept = (Array.isArray(scene.emphasis) ? scene.emphasis.map(String) : []).filter((e) => want.includes(normalizeToken(e)));
    const fresh = captionLane(spine, marked.length ? marked : kept, {
      style: String(lane.data?.mode || "") === "scatter" ? "scatter" : "",
      maxFont: typeof lane.data?.max_font === "number" ? lane.data.max_font : undefined,
    });
    if (!fresh) continue;
    lane.data = { ...(lane.data || {}), phrases: fresh.data.phrases };
    lane.anchors = fresh.anchors;
    changed++;
  }
  return changed;
}
