/**
 * Word anchors (SPEC-take-flow.md).
 *
 * A component time may be authored as a WORD in the scene's script instead
 * of a number: `{ "word": "dashboard" }` (or the shorthand "@dashboard"),
 * with optional `occurrence` (1-based, for repeated words), `edge`
 * ("start" default | "end") and `offset` seconds. The anchor is kept on the
 * component (`anchors[<data path>]`) and the numeric field always holds the
 * RESOLVED value, so every renderer stays numeric and dumb.
 *
 * One resolver, two spines: ASSERTED (the script's words spread over the
 * scene's estimated duration, at build time) and MEASURED (the take's
 * transcript, at attach). Re-timing a film to what was actually said is
 * "resolve again with the other spine".
 */

import { scriptLines, scriptWords } from "./script-lines.js";

export interface WordAnchor {
  word: string;
  /** 1-based; which occurrence of the word in the script. Default 1. */
  occurrence?: number;
  /** Anchor to the word's start (default) or end. */
  edge?: "start" | "end";
  /** Seconds added after the word time (negative = before). */
  offset?: number;
}

export interface SpineWord { text: string; start: number; end: number }

export interface Spine {
  source: "asserted" | "measured";
  /** Scene-local seconds. */
  words: SpineWord[];
  duration: number;
}

/** Lowercase, letters and digits only -- "Dashboard." and "dashboard" agree. */
export function normalizeToken(t: string): string {
  return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The script's words spread over `duration` by character weight (longer
 *  words take longer to say), with a short lead-in. */
export function assertedSpine(script: string, duration: number): Spine {
  const dur = Math.max(0, Number(duration) || 0);
  const lines = scriptLines(script);
  const raw = lines.filter((l) => !l.pause).flatMap((l) => l.text.split(/\s+/).filter((w) => normalizeToken(w)));
  if (!raw.length || dur <= 0) return { source: "asserted", words: [], duration: dur };
  // Speech does not start on frame 0 nor end on the last: keep 4% each side.
  const lead = dur * 0.04, usable = dur * 0.92;
  // Authored silences (a breath at each line end, a beat for "(pause)")
  // come out of the usable span first; the words share what is left. When
  // the script is over-paused for the scene, the silences shrink together.
  const authoredGaps = lines.reduce((s, l) => s + l.gapAfter, 0);
  const gapScale = authoredGaps > usable * 0.5 ? (usable * 0.5) / authoredGaps : 1;
  const speech = usable - authoredGaps * gapScale;
  const weights = raw.map((w) => normalizeToken(w).length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const words: SpineWord[] = [];
  let t = lead, wi = 0;
  for (const line of lines) {
    if (!line.pause) {
      for (const w of line.text.split(/\s+/)) {
        if (!normalizeToken(w)) continue;
        const d = (weights[wi++] / total) * speech;
        words.push({ text: w, start: round(t), end: round(t + d) });
        t += d;
      }
    }
    t += line.gapAfter * gapScale;
  }
  return { source: "asserted", words, duration: dur };
}

/** A measured spine from transcript segments (one word per segment, as
 *  whisper -ml 1 emits), already in scene-local seconds. */
export function measuredSpine(segments: Array<{ text: string; start: number; end: number }>, duration: number): Spine {
  const words = segments
    .flatMap((s) => {
      const parts = String(s.text || "").trim().split(/\s+/).filter((p) => normalizeToken(p));
      if (parts.length <= 1) return parts.length ? [{ text: parts[0], start: s.start, end: s.end }] : [];
      // A multi-word segment: split its span by character weight.
      const wts = parts.map((p) => normalizeToken(p).length + 1);
      const tot = wts.reduce((a, b) => a + b, 0);
      let t = s.start;
      return parts.map((p, i) => { const d = ((s.end - s.start) * wts[i]) / tot; const w = { text: p, start: round(t), end: round(t + d) }; t += d; return w; });
    })
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
  return { source: "measured", words, duration: Math.max(0, Number(duration) || 0) };
}

/** Time of an anchor against a spine, or null when the word is not there. */
export function resolveAnchor(spine: Spine, a: WordAnchor): number | null {
  const target = String(a.word || "").split(/\s+/).map(normalizeToken).filter(Boolean);
  if (!target.length) return null;
  const toks = spine.words.map((w) => normalizeToken(w.text));
  const want = Math.max(1, Math.round(a.occurrence || 1));
  let seen = 0;
  for (let i = 0; i + target.length <= toks.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length; j++) if (toks[i + j] !== target[j]) { ok = false; break; }
    if (!ok) continue;
    seen++;
    if (seen < want) continue;
    const first = spine.words[i], last = spine.words[i + target.length - 1];
    const t = (a.edge === "end" ? last.end : first.start) + (Number(a.offset) || 0);
    return round(Math.max(0, t));
  }
  return null;
}

// ── Anchors on a component ──

export type AnchorMap = Record<string, WordAnchor>;

function isAnchorObject(v: unknown): v is WordAnchor {
  return !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).word === "string"
    && Object.keys(v as object).every((k) => ["word", "occurrence", "edge", "offset"].includes(k));
}

/** "@dashboard", "@dashboard+0.3", "@dashboard-0.2", "@dashboard#2" (2nd occurrence), "@dashboard$" (end). */
function parseShorthand(s: string): WordAnchor | null {
  const m = String(s).match(/^@([^\s#$+-][^#$+-]*?)(#(\d+))?(\$)?([+-]\d+(?:\.\d+)?)?$/);
  if (!m) return null;
  const a: WordAnchor = { word: m[1].trim() };
  if (m[3]) a.occurrence = Number(m[3]);
  if (m[4]) a.edge = "end";
  if (m[5]) a.offset = Number(m[5]);
  return a;
}

/**
 * Pull every anchor-shaped value out of a component's data into
 * `component.anchors` (keyed by data path, e.g. "at", "phrases[1].start",
 * "script[3].at"), leaving 0 in its place until resolved. Returns how many
 * anchors the component now carries.
 */
/** The wrapper's enter/exit belong BESIDE data, not inside it. The writer
 *  puts them in data anyway (measured live, proj_55464519: every cut-in
 *  arrived as data.enter, its anchors extracted from there, the wrapper
 *  never cut). Lifted here, deterministically, wherever anchors are read. */
export function liftWrapperAnims(component: { data?: Record<string, unknown>; enter?: unknown; exit?: unknown }): number {
  let moved = 0;
  const data = component.data;
  if (!data || typeof data !== "object") return 0;
  for (const k of ["enter", "exit"] as const) {
    const v = (data as any)[k];
    if (v === undefined) continue;
    if ((component as any)[k] === undefined && (typeof v === "string" || (v && typeof v === "object"))) { (component as any)[k] = v; moved++; }
    delete (data as any)[k];
  }
  return moved;
}

export function extractAnchors(component: { data?: Record<string, unknown>; anchors?: AnchorMap; enter?: unknown; exit?: unknown }): number {
  liftWrapperAnims(component);
  const anchors: AnchorMap = { ...(component.anchors || {}) };
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) { node.forEach((v, i) => visit(node, i, `${path}[${i}]`)); return; }
    if (node && typeof node === "object") { for (const k of Object.keys(node)) visit(node as any, k, path ? `${path}.${k}` : k); }
  };
  const visit = (parent: any, key: string | number, path: string): void => {
    const v = parent[key];
    if (isAnchorObject(v)) { anchors[path] = { ...v }; parent[key] = 0; return; }
    if (typeof v === "string") { const a = parseShorthand(v); if (a) { anchors[path] = a; parent[key] = 0; } return; }
    walk(v, path);
  };
  walk(component.data || {}, "");
  // The wrapper's own clock: a directed entrance/exit lands on a word too
  // (a cut-in on "plugins", a cut-out on "next"). Kept at the component
  // root under an "enter."/"exit." path so resolve writes it back there.
  for (const k of ["enter", "exit"] as const) {
    const anim = (component as any)[k];
    if (anim && typeof anim === "object") visit(anim, "at", `${k}.at`);
  }
  if (Object.keys(anchors).length) component.anchors = anchors; else delete component.anchors;
  return Object.keys(anchors).length;
}

function setPath(root: any, path: string, value: unknown): boolean {
  const parts = path.match(/[^.[\]]+/g) || [];
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node == null || typeof node !== "object") return false;
    node = node[parts[i]];
  }
  if (node == null || typeof node !== "object") return false;
  node[parts[parts.length - 1]] = value;
  return true;
}

export interface ResolveReport {
  resolved: number;
  unresolved: Array<{ component: string; path: string; word: string }>;
}

/** Write every anchor's time into the component's data. */
export function resolveComponent(component: { id?: string; type?: string; data?: Record<string, unknown>; anchors?: AnchorMap }, spine: Spine): ResolveReport {
  const report: ResolveReport = { resolved: 0, unresolved: [] };
  for (const [path, a] of Object.entries(component.anchors || {})) {
    const t = resolveAnchor(spine, a);
    if (t === null) { report.unresolved.push({ component: component.id || component.type || "?", path, word: a.word }); continue; }
    const root = /^(enter|exit)\./.test(path) ? component : (component.data || (component.data = {}));
    if (setPath(root, path, t)) report.resolved++;
  }
  return report;
}

/** Extract + resolve every component of a scene against a spine. */
export function applySpine(scene: { components?: any[]; spine?: Spine }, spine: Spine): ResolveReport {
  const report: ResolveReport = { resolved: 0, unresolved: [] };
  for (const c of scene.components || []) {
    if (!c || typeof c !== "object") continue;
    extractAnchors(c);
    const r = resolveComponent(c, spine);
    report.resolved += r.resolved; report.unresolved.push(...r.unresolved);
  }
  scene.spine = spine;
  return report;
}

/** A hand edit that sets a data field by number wins: drop the anchors it
 *  overrides (the key itself and anything under it). */
export function clearAnchorsFor(component: { anchors?: AnchorMap }, dataKeys: string[]): number {
  if (!component.anchors) return 0;
  let n = 0;
  for (const path of Object.keys(component.anchors)) {
    if (dataKeys.some((k) => path === k || path.startsWith(`${k}.`) || path.startsWith(`${k}[`))) { delete component.anchors[path]; n++; }
  }
  if (!Object.keys(component.anchors).length) delete component.anchors;
  return n;
}

/**
 * "Record all": one recording covers several scenes. Cut it where each
 * scene's script begins -- the first words of scene i, found in the
 * transcript after the previous cut. A scene whose opening words are not
 * found gets a proportional share of what is left. Returns one
 * [start, end) window per script, in source seconds.
 */
export function splitByScripts(scripts: string[], words: SpineWord[], total: number): Array<{ start: number; end: number }> {
  const n = scripts.length;
  if (!n) return [];
  const toks = words.map((w) => normalizeToken(w.text));
  const cuts: number[] = [0];
  let cursor = 0;
  for (let i = 1; i < n; i++) {
    const head = scriptWords(scripts[i]).map(normalizeToken).filter(Boolean).slice(0, 3);
    let at: number | null = null;
    if (head.length) {
      for (let k = cursor; k < toks.length; k++) {
        if (toks[k] !== head[0]) continue;
        // Confirm with the next word when the script has one and the
        // transcript still has one (a single common word is a weak match).
        if (head.length > 1 && k + 1 < toks.length && toks[k + 1] !== head[1]) continue;
        at = Math.max(cuts[cuts.length - 1], round(words[k].start - 0.1));
        cursor = k;
        break;
      }
    }
    if (at === null) {
      // Proportional fallback for the rest of the scripts from here.
      const prev = cuts[cuts.length - 1];
      const weights = scripts.slice(i - 1).map((sc) => Math.max(1, scriptWords(sc).length));
      const wsum = weights.reduce((a, b) => a + b, 0);
      at = round(prev + ((total - prev) * weights[0]) / wsum);
      // Move the cursor past the words that fall into the previous window.
      while (cursor < words.length && words[cursor].start < at) cursor++;
    }
    cuts.push(at);
  }
  return cuts.map((c, i) => ({ start: c, end: i + 1 < cuts.length ? cuts[i + 1] : round(total) }));
}

function round(n: number): number { return Math.round(n * 1000) / 1000; }
