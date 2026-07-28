/**
 * Film continuity pass (deterministic, post-assembly).
 *
 * Two jobs, both fixing "a bunch of separate scenes" syndrome:
 *
 * 1. MATCH-CUT PINNING -- when consecutive authored scenes stage the same
 *    surface type in different frames, the cut reads as a teleport. Pin the
 *    later instance to the earlier scene's frame (when it fits without
 *    colliding with its siblings) and stamp data.match_cut so the surface
 *    can suppress its own entrance and hold the frame across the cut.
 *
 * 2. THE ONE HAND -- cursor-performer is a film-level device: ONE hand that
 *    appears for a consecutive run of scenes and leaves. Storyboards
 *    over-cast it (7/8 scenes) and break the handoff contract (scene N's
 *    first path point must equal scene N-1's last). Cap the cursor to the
 *    first consecutive chain (max 4 scenes) and repair the handoffs
 *    deterministically.
 */

import type { Scene } from "../core/types.js";

/** Overlays / accents / ambient layers / backdrops: neither match-cut
 *  surfaces nor collision obstacles (they float above or wash below). */
const NON_SURFACE_TYPES = new Set([
  "lottie-accent", "sticker-prop", "cursor-performer", "floating-pills",
  "ghost-type", "mesh-gradient", "webgl-backdrop", "gradient-background",
  "liquid-background", "grain-overlay", "narration-track",
]);
/** Editorial copy: never pinned across cuts (its frame is role-driven), but
 *  it IS an obstacle -- a pinned window must not bury a caption column. */
const EDITORIAL_TYPES = new Set([
  "kinetic-text", "annotation", "typewriter", "animated-gradient-text",
  "section-header", "stat-card", "number-counter-row", "headline-carousel",
  "hero-reveal", "quote-block",
]);

const MAX_CURSOR_SCENES = 4;

interface Rect { x: number; y: number; w: number; h: number }

function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rectOf(pos: any): Rect | null {
  if (!pos) return null;
  const x = toNum(pos.x), y = toNum(pos.y), w = toNum(pos.width), h = toNum(pos.height);
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

/** True when a and b overlap by more than a sliver (>10% of the smaller). */
function collides(a: Rect, b: Rect): boolean {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea > 0 && inter / minArea > 0.1;
}

function isAuthored(scene: Scene): boolean {
  return (scene as any)?.authored_composition === true;
}

/** Everything that occupies real frame space: window surfaces + editorial copy. */
function obstaclesOf(scene: Scene): any[] {
  return (scene.components || []).filter((c: any) =>
    c && typeof c.type === "string"
    && !NON_SURFACE_TYPES.has(c.type)
    && c.id !== "bg",
  );
}

/** Match-cut candidates: window surfaces only. */
function surfacesOf(scene: Scene): any[] {
  return obstaclesOf(scene).filter((c: any) =>
    !EDITORIAL_TYPES.has(c.type) && c.type.indexOf("caption-") !== 0,
  );
}

/**
 * Mutates `scenes` in place; returns human-readable log lines describing
 * every change (empty = the film was already continuous).
 */
export function enforceFilmContinuity(scenes: Scene[]): string[] {
  const log: string[] = [];
  if (!Array.isArray(scenes) || scenes.length < 2) return log;

  // ── 1. Match-cut pinning across consecutive authored scenes ──
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1], cur = scenes[i];
    if (!isAuthored(prev) || !isAuthored(cur)) continue;
    const prevByType = new Map<string, any>();
    for (const c of surfacesOf(prev)) if (!prevByType.has(c.type)) prevByType.set(c.type, c);
    const curSurfaces = surfacesOf(cur);
    const curObstacles = obstaclesOf(cur);
    for (const c of curSurfaces) {
      const p = prevByType.get(c.type);
      if (!p || !p.position || !c.position) continue;
      if (JSON.stringify(p.position) === JSON.stringify(c.position)) continue;
      const target = rectOf(p.position);
      if (!target) continue;
      // Only pin when the inherited frame doesn't collide with this scene's
      // OTHER occupants (pinning an 84% window onto a scene that also stages
      // a chat or caption column would bury the column).
      const clash = curObstacles.some((s) => {
        if (s === c) return false;
        const r = rectOf(s.position);
        return r ? collides(target, r) : false;
      });
      if (clash) {
        log.push(`scene ${i + 1}: left ${c.type} in its own frame (match-cut pin would collide with a sibling)`);
        continue;
      }
      c.position = { ...p.position };
      c.data = { ...(c.data || {}), match_cut: true };
      log.push(`scene ${i + 1}: pinned ${c.type} to scene ${i}'s frame (match cut)`);
    }
  }

  // ── 2. The one hand: cap the cursor chain + repair handoffs ──
  const cursorAt: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    if ((scenes[i].components || []).some((c: any) => c?.type === "cursor-performer")) cursorAt.push(i);
  }
  if (cursorAt.length > 0) {
    // First consecutive chain, truncated to MAX_CURSOR_SCENES.
    const chain: number[] = [cursorAt[0]];
    for (let k = 1; k < cursorAt.length && chain.length < MAX_CURSOR_SCENES; k++) {
      if (cursorAt[k] === chain[chain.length - 1] + 1) chain.push(cursorAt[k]);
      else break;
    }
    const keep = new Set(chain);
    for (const i of cursorAt) {
      const comps: any[] = scenes[i].components as any[];
      const cursor = comps.find((c: any) => c?.type === "cursor-performer");
      const path = cursor?.data?.path;
      const emptyPath = !Array.isArray(path) || path.length === 0;
      if (!keep.has(i) || emptyPath) {
        scenes[i].components = comps.filter((c: any) => c?.type !== "cursor-performer") as any;
        log.push(`scene ${i + 1}: removed cursor-performer (${emptyPath ? "empty path" : "one hand, one visit: the cursor plays scenes " + (chain[0] + 1) + "-" + (chain[chain.length - 1] + 1) + " only"})`);
      }
    }
    // Handoff repair inside the kept chain: each scene's hand STARTS where
    // the previous scene's hand ended.
    for (let k = 1; k < chain.length; k++) {
      if (!keep.has(chain[k])) continue;
      const prevCursor = (scenes[chain[k - 1]].components as any[]).find((c: any) => c?.type === "cursor-performer");
      const curCursor = (scenes[chain[k]].components as any[]).find((c: any) => c?.type === "cursor-performer");
      const prevPath = prevCursor?.data?.path;
      const curPath = curCursor?.data?.path;
      if (!Array.isArray(prevPath) || prevPath.length === 0 || !Array.isArray(curPath) || curPath.length === 0) continue;
      const last = prevPath[prevPath.length - 1];
      const first = curPath[0];
      if (first.x !== last.x || first.y !== last.y) {
        curPath[0] = { ...first, x: last.x, y: last.y };
        log.push(`scene ${chain[k] + 1}: repaired cursor handoff (hand now enters at ${last.x},${last.y} where scene ${chain[k]} left it)`);
      }
    }
  }

  return log;
}
