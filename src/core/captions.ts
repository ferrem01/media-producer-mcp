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

/** The rule's pick when the writer marked nothing: numbers and the
 *  brand's name. Never more than that -- an unmarked line stays plain. */
export function fallbackEmphasis(words: SpineWord[], brandWords: string[] = []): string[] {
  const brand = new Set(brandWords.map(normalizeToken).filter((t) => t.length > 2));
  const out: string[] = [];
  for (const w of words) {
    const t = normalizeToken(w.text);
    if (!t) continue;
    if (/\p{N}/u.test(t) || brand.has(t)) { if (!out.includes(t)) out.push(t); }
  }
  return out;
}

/** Group the spine's words into caption phrases: a phrase breaks on
 *  end punctuation, on a breath, at MAX_WORDS or MAX_SPAN_S. Each phrase
 *  holds until the next begins (the lane never goes dark mid-claim); the
 *  last holds a beat past its word. Marked words are `*starred*` for the
 *  lane, stars OUTSIDE the token's punctuation so "brief." stays one word. */
export function captionPhrases(spine: Spine, emphasis: string[] = []): CaptionPhrase[] {
  const words = (spine.words || []).filter((w) => normalizeToken(w.text));
  if (!words.length) return [];
  const em = new Set(emphasis.map(normalizeToken).filter(Boolean));
  const groups: SpineWord[][] = [];
  let cur: SpineWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length) {
      const first = cur[0], prev = cur[cur.length - 1];
      const breath = w.start - prev.end > BREATH_GAP_S;
      if (cur.length >= MAX_WORDS || breath || w.end - first.start > MAX_SPAN_S) { groups.push(cur); cur = []; }
    }
    cur.push(w);
    if (END_PUNCT.test(w.text.trim())) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  // A lone trailing word after a break reads as a stutter: fold it back
  // when the group before it has room.
  for (let g = groups.length - 1; g > 0; g--) {
    if (groups[g].length === 1 && groups[g - 1].length < MAX_WORDS && !END_PUNCT.test(groups[g - 1][groups[g - 1].length - 1].text.trim())) {
      groups[g - 1] = groups[g - 1].concat(groups[g]); groups.splice(g, 1);
    }
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
}

/** The caption component for a scene: the lane, its phrases from the
 *  spine, and a word anchor on every phrase edge so a later take re-times
 *  it in place. Null when the scene has no words. */
export function captionLane(spine: Spine, emphasis: string[] = [], opts: CaptionLaneOpts = {}): { id: string; type: "reel-caption-lane"; data: Record<string, unknown>; anchors?: AnchorMap } | null {
  const words = (spine.words || []).filter((w) => normalizeToken(w.text));
  if (!words.length) return null;
  const em = emphasis.length ? emphasis : fallbackEmphasis(words, opts.brandWords || []);
  const phrases = captionPhrases(spine, em);
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
    data: { phrases, scrim: "plate", align: "center", max_font: opts.maxFont || 84, min_font: 40 },
    anchors,
  };
}

function round(n: number): number { return Math.round(n * 100) / 100; }
