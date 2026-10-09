/**
 * CAPTIONS STEP ASIDE FOR A FULL-SCREEN COVER.
 *
 * The caption lane is pinned to the frame, so it draws over everything --
 * including a webinar cover standing full-frame on its own sheet (the opener
 * and close of a speaker film). Marc, Oct 9 (Dana, proj_d37c96fe): "the
 * caption sort of is like covering up the details of the webinar". While
 * such a cover is on screen, the lane's phrases are trimmed out of its
 * window: a phrase inside it is dropped, one that straddles an edge is cut
 * at that edge. The saved data is untouched; the assembler plays the copy.
 */
import type { Scene } from "./types.js";

type Win = [number, number];

/** When a full-screen cover is on screen in this scene, as [from, to] s. */
export function coverWindows(scene: Scene): Win[] {
  const dur = Number(scene.duration_seconds) || 0;
  const out: Win[] = [];
  for (const c of (scene.components || []) as any[]) {
    if (c?.type !== "webinar-cover") continue;
    const d = c.data || {};
    if (d.ground !== "cream" && d.ground !== "waves") continue;
    const p = c.position || {};
    const full = (v: unknown) => v === undefined || v === "100%" || Number(v) >= 100 || String(v).endsWith("100%");
    if (!full(p.width) || !full(p.height)) continue;
    const from = c.enter && isFinite(Number(c.enter.at)) ? Number(c.enter.at) : 0;
    const to = c.exit && isFinite(Number(c.exit.at)) ? Number(c.exit.at) + (Number(c.exit.duration) || 0.5) : dur || Infinity;
    if (to > from) out.push([from, to]);
  }
  return out;
}

export function captionsYieldToCover<S extends Scene>(scene: S): S {
  const wins = coverWindows(scene);
  if (!wins.length) return scene;
  let changed = false;
  const components = (scene.components || []).map((c: any) => {
    if (c?.type !== "reel-caption-lane" || !Array.isArray(c.data?.phrases)) return c;
    let phrases = c.data.phrases as any[];
    for (const [a, b] of wins) {
      phrases = phrases.flatMap((ph) => {
        const s = Number(ph.start), e = Number(ph.end);
        if (!isFinite(s) || !isFinite(e)) return [ph];
        if (e <= a || s >= b) return [ph];          // clear of the cover
        if (s >= a && e <= b) return [];            // wholly under it
        if (s < a) return [{ ...ph, end: a }];      // runs into it
        return [{ ...ph, start: b }];               // comes out of it
      });
    }
    if (phrases.length === c.data.phrases.length && phrases.every((p, i) => p === c.data.phrases[i])) return c;
    changed = true;
    return { ...c, data: { ...c.data, phrases } };
  });
  return changed ? { ...scene, components } : scene;
}
