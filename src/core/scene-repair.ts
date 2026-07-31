/**
 * Deterministic scene repair.
 *
 * The measurement gates and the LLM critic both produce precise, specific
 * defects on component-assembled scenes -- and until now those scenes could
 * do nothing with them. There is no codegen source to regenerate (a rewrite
 * would destroy the curated composition), so every finding shipped as a
 * badge: `quality.passed: false, attempts: 0`, on every film, in every
 * grammar.
 *
 * But most of those defects have an obvious DATA fix. Measured live, the
 * four repairs that made a social post postable were all one-line component
 * edits: shrink the clipped hook text and give it room, pull the off-canvas
 * logo back inside, pre-roll a dead entrance, fix a placeholder handle. This
 * module encodes that table so the pipeline can apply it, re-measure, and
 * only stamp what actually survives.
 *
 * What it does NOT try to fix (honest boundaries):
 *   - intent_mismatch / empty_skeleton / stray_ui: judgment defects. A data
 *     patch cannot make a scene mean something different; these stay reports.
 *   - contrast INSIDE a component (a mock's own tab labels at 3.5:1): the fix
 *     belongs in the component library, not in scene data.
 */
import type { Scene, SceneComponent } from "./types.js";

export interface SceneDefect {
  /** Gate/critic defect type: illegible, clipped_text, off_canvas_content, dead_frame, ... */
  type: string;
  detail: string;
  /** The offending text run, when the gate identified one. */
  text?: string;
}

export interface RepairResult {
  changed: boolean;
  /** Human-readable log of what was patched (empty when nothing applied). */
  notes: string[];
}

/** Types that carry editorial copy -- the ones whose type size we may shrink. */
const TEXT_ROLE = /^(kinetic-text|caption-|annotation|lower-third|st-|headline|title|quote|hero-reveal|number-counter|stat-card)/;

function pctNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/^(-?\d+(?:\.\d+)?)%?$/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Scale a font-size string ("11vw", "48px", 40) by `factor`, keeping units. */
export function scaleFontSize(value: unknown, factor: number): string | number | null {
  if (typeof value === "number") return Math.round(value * factor);
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d+(?:\.\d+)?)\s*(vw|vh|px|rem|em|%)$/i);
  if (!m) return null;
  const scaled = Math.round(Number(m[1]) * factor * 100) / 100;
  return `${scaled}${m[2]}`;
}

/** Does this component render the given text? (matches data.text and data.lines) */
function componentCarriesText(c: SceneComponent, text: string): boolean {
  const needle = text.trim().toLowerCase().slice(0, 40);
  if (!needle) return false;
  const hay: string[] = [];
  const d = c.data || {};
  if (typeof d.text === "string") hay.push(d.text);
  if (Array.isArray(d.lines)) for (const l of d.lines) if (typeof l === "string") hay.push(l);
  if (typeof d.title === "string") hay.push(d.title);
  if (typeof d.headline === "string") hay.push(d.headline);
  return hay.some((h) => h.toLowerCase().includes(needle) || needle.includes(h.toLowerCase().slice(0, 40)));
}

/**
 * Apply deterministic repairs for `defects` to `scene`, in place.
 * Returns whether anything changed plus a log. Safe to call repeatedly --
 * each patch is bounded, so a defect that survives does not spiral (font
 * sizes floor out, positions clamp to the frame).
 */
export function repairScene(scene: Scene, defects: SceneDefect[]): RepairResult {
  const notes: string[] = [];
  const comps: SceneComponent[] = Array.isArray(scene.components) ? scene.components : [];
  const has = (t: string) => defects.some((d) => d.type === t);

  // ── 1. Clipped / truncated text: shrink the type and give it room ──
  // The hook line on a social post rendered 26% cut off top and bottom; the
  // fix was a smaller font in a taller container.
  for (const d of defects) {
    if (d.type !== "clipped_text" && d.type !== "off_canvas" && d.type !== "illegible_clipped") continue;
    const target = d.text ? comps.find((c) => componentCarriesText(c, d.text!)) : undefined;
    if (!target) continue;
    const shrunk = scaleFontSize((target.data || {}).font_size, 0.8);
    if (shrunk !== null) {
      (target.data as Record<string, unknown>).font_size = shrunk;
      notes.push(`${target.id}: font_size -> ${shrunk}`);
    }
    const h = pctNum(target.position?.height);
    if (h !== null && h < 60) {
      const grown = Math.min(60, Math.round(h * 1.5));
      const y = pctNum(target.position?.y);
      // Grow downward from the same top edge, but keep the block on canvas.
      if (y !== null && y + grown > 96) target.position!.y = `${Math.max(2, 96 - grown)}%`;
      target.position!.height = `${grown}%`;
      notes.push(`${target.id}: height ${h}% -> ${grown}%`);
    }
  }

  // ── 2. Content hanging off the canvas: clamp the box back inside ──
  for (const d of defects) {
    if (d.type !== "off_canvas_content" && d.type !== "edge_bleed") continue;
    for (const c of comps) {
      const x = pctNum(c.position?.x), y = pctNum(c.position?.y);
      const w = pctNum(c.position?.width), h = pctNum(c.position?.height);
      if (x === null || y === null || w === null || h === null) continue;
      if (w >= 99 && h >= 99) continue; // deliberate full-bleed layer
      let nx = x, ny = y;
      if (x + w > 100) nx = Math.max(0, 100 - w);
      if (y + h > 100) ny = Math.max(0, 100 - h);
      if (x < 0) nx = 0;
      if (y < 0) ny = 0;
      if (nx !== x || ny !== y) {
        c.position!.x = `${Math.round(nx * 10) / 10}%`;
        c.position!.y = `${Math.round(ny * 10) / 10}%`;
        notes.push(`${c.id}: pulled on-canvas (${x},${y} -> ${nx},${ny})`);
      }
    }
  }

  // ── 3. Dead entrance: pre-roll so the cut lands on standing content ──
  if (has("dead_entrance") && (scene as { entrance?: string }).entrance !== "settled") {
    (scene as { entrance?: string }).entrance = "settled";
    notes.push("entrance -> settled (content stands when the cut lands)");
  }

  // ── 4. Dead/empty frame: give the primary surface the room it needs ──
  // A surface occupying a fraction of the canvas over a flat backdrop reads
  // as empty; enlarging it is the fix the gate is actually asking for.
  if (has("dead_frame") || has("empty_moment")) {
    let biggest: SceneComponent | undefined;
    let biggestArea = 0;
    for (const c of comps) {
      const w = pctNum(c.position?.width), h = pctNum(c.position?.height);
      if (w === null || h === null) continue;
      if (w >= 99 && h >= 99) continue; // already full-bleed
      const area = w * h;
      if (area > biggestArea) { biggestArea = area; biggest = c; }
    }
    if (biggest && biggestArea < 5600) { // < ~75% x 75% of the frame
      const w = pctNum(biggest.position?.width)!, h = pctNum(biggest.position?.height)!;
      const nw = Math.min(94, Math.round(w * 1.3)), nh = Math.min(80, Math.round(h * 1.3));
      const x = pctNum(biggest.position?.x) ?? 0, y = pctNum(biggest.position?.y) ?? 0;
      biggest.position!.width = `${nw}%`;
      biggest.position!.height = `${nh}%`;
      biggest.position!.x = `${Math.max(0, Math.min(x, 100 - nw))}%`;
      biggest.position!.y = `${Math.max(0, Math.min(y, 100 - nh))}%`;
      notes.push(`${biggest.id}: enlarged ${w}x${h}% -> ${nw}x${nh}% (frame was reading empty)`);
    }
  }

  // ── 5. Ghost panel: a surface that vanishes into the background ──
  // The component owns its fill, but scene data can ask for a visible edge.
  if (has("invisible_surface")) {
    for (const c of comps) {
      const d = c.data as Record<string, unknown>;
      if (d && d.border === undefined && !TEXT_ROLE.test(c.type)) {
        d.border = true;
        d.shadow = d.shadow === undefined ? true : d.shadow;
        notes.push(`${c.id}: border + shadow requested (panel was ghosting)`);
        break; // one surface per pass -- re-measure decides if more is needed
      }
    }
  }

  return { changed: notes.length > 0, notes };
}
