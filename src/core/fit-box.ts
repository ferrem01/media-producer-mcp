/**
 * THE FIT BOX: legacy widgets lay out in a design box, then scale to their slot.
 *
 * The polish audit (every component rendered on real film data, then again
 * inside its full real scene) found the older widget family built like web
 * UI: fixed 12-16px type and layouts in % of whatever box they got. Two
 * failures fall out of that, both measured on Marc's films:
 *
 *   - a BIG box (84% of the frame) shows a small card with web-size type in
 *     the middle of a video frame;
 *   - a NARROW box (the writer's 14%-wide tall panels in a five-up row)
 *     reflows the widget into a strip -- email-compose set its subject line
 *     one letter per line.
 *
 * Both are the same fix: lay the widget out in a DESIGN box whose width is
 * never narrower than the widget needs nor wider than reads well, with the
 * slot's aspect, then scale that box to the slot. A big slot scales the
 * widget UP (type grows with it); a narrow slot keeps a sane layout and
 * scales it down. The component's `el` is the design box, so anything that
 * measures `el.clientWidth` measures design pixels.
 *
 * Opt out per component instance with data.fit === false.
 */

type Pos = { x?: string | number; y?: string | number; width?: string | number; height?: string | number } | undefined;

/**
 * [min, max] design width in px, optional minimum design height (default 600).
 * The widget lays out at the slot width clamped to the range; a wide, short
 * slot would scale the design box so short the content overflows it
 * (measured: bar-chart's title cut off the top in a 94%x76% slot), so the
 * scale also honours the minimum height.
 */
export const FIT_RANGES: Record<string, [number, number, number?]> = {
  // data-viz
  "funnel-chart": [620, 1100], "bar-chart": [640, 1100], "line-chart": [640, 1100], "progress-bar": [520, 900, 360],
  "metric-dashboard": [720, 1200], "flowchart": [720, 1300], "timeline-steps": [720, 1200],
  // layouts
  "comparison-before-after": [720, 1200], "3d-card-flip": [520, 900, 440],
  // cta / proof
  "cta-card": [520, 900, 440], "pricing-card": [480, 800], "testimonial-card": [560, 900], "social-proof": [720, 1200],
  "quote-block": [560, 1000],
  // mockups / ui
  "email-compose": [620, 1100], "email-reader": [640, 1100], "form-wizard": [520, 900], "dashboard-kpi": [360, 1100, 360],
  "calendar-view": [600, 1000], "kanban-board": [720, 1200], "notification-stack": [520, 900, 480],
  "chat-simulator": [760, 1250], "ui-chat-thread": [680, 1150], "ui-terminal-agent": [620, 1100], "ui-video-player": [640, 1100],
  // social
  "app-store-card": [520, 900, 320], "linkedin-post-card": [560, 900], "reddit-post-card": [560, 900], "x-post-card": [560, 900],
  // titles
  "text-list": [520, 1000],
};

function toPx(v: string | number | undefined, total: number, dflt: number): number {
  if (v === undefined || v === null || v === "") return dflt;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?%$/.test(s)) return (parseFloat(s) / 100) * total;
  if (/^-?\d+(\.\d+)?(px)?$/.test(s)) return parseFloat(s);
  return NaN;
}

export interface FitBox { w: number; h: number; s: number }

/** The design box for a component in its slot, or null when it lays out at 1:1. */
export function fitBoxFor(
  comp: { type: string; position?: Pos; data?: Record<string, unknown> },
  canvas: { width: number; height: number },
): FitBox | null {
  const range = FIT_RANGES[comp.type];
  if (!range) return null;
  if (comp.data && (comp.data as { fit?: unknown }).fit === false) return null;
  const pos = comp.position;
  const full = !pos || (pos.x === "center" && pos.y === "center");
  const bw = full ? canvas.width : toPx(pos!.width, canvas.width, canvas.width);
  const bh = full ? canvas.height : toPx(pos!.height, canvas.height, canvas.height);
  if (!isFinite(bw) || !isFinite(bh) || bw <= 0 || bh <= 0) return null;
  const minH = range[2] ?? 600;
  // Scale from the width range, but never so far that the design box drops
  // below its minimum height; a height-limited box just gets wider.
  // The height floor only CAPS the scale-up; it never pushes a widget below
  // 1:1 (measured: short 80%x40% slots shrank cards that fit fine as they were).
  const sW = bw / Math.min(range[1], Math.max(range[0], bw));
  const s = Math.min(sW, Math.max(bh / minH, Math.min(1, sW)));
  if (Math.abs(s - 1) < 0.02) return null;
  return { w: Math.round(bw / s), h: Math.round(bh / s), s: +s.toFixed(4) };
}

/** Wrap a bound template in its design box (inline max-width: the safety clamp would squeeze it). */
export function wrapInFitBox(html: string, fit: FitBox | null): string {
  if (!fit) return html;
  return `<div class="mp-fit" style="position:absolute;left:0;top:0;width:${fit.w}px;height:${fit.h}px;max-width:none;transform:scale(${fit.s});transform-origin:0 0;">${html}</div>`;
}
