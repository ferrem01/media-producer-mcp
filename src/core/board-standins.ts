/**
 * THE BOARD CARRIES ITS STAND-INS (SPEC-briefs.md): every proof need on the
 * storyboard gets its stand-in cast on the board the moment the board is
 * written or edited, not at build -- so the card, the components band and
 * the film agree. Today that is the screen slate for every open
 * screen_recording / screenshot need, on any grammar. On a person film the
 * slate's word anchors are resolved at speaking pace right away (the take's
 * measured spine re-resolves them when it lands); the build then only swaps
 * files into slots. Idempotent.
 */

import type { Project } from "./types.js";
import { castScreenSlates } from "./asset-needs.js";
import { personCarries, normalizeClipNeeds } from "./take-needs.js";
import { spineForScene, retimeSceneWith } from "./measured-spine.js";

const SCREEN_NEED = new Set(["screen_recording", "screenshot"]);

/** Real pictures the scene's cast already shows: library images, click-stream
 *  stops, image components (anything under /assets or http). */
function showsRealPictures(scene: any): boolean {
  const s = JSON.stringify(scene?.components || []);
  return /"src":"(?:\/assets\/|https?:)[^"]+\.(?:jpe?g|png|webp|gif|mp4|webm)"/i.test(s);
}

/**
 * A screen need that should cast no slate: one the writer itself declined
 * ("not used; real stills only" -- proj_bd43e545 cast a full-frame "Screen
 * recording needed" card over a click-stream of the real emails), or, on a
 * film no person carries, one on a scene that already shows real pictures.
 * A person film's needs are the proof the board asks the team for; only a
 * declined one goes there.
 */
export function needDeclined(a: any, scene: any, personFilm: boolean): boolean {
  if (!a || !SCREEN_NEED.has(String(a.type)) || a.status === "provided") return false;
  const d = String(a.description || "").trim();
  if (!d || /^(?:n\/?a|none|-+)$/i.test(d) || /\bnot (?:used|needed|required)\b|\bno (?:recording|screen) needed\b/i.test(d)) return true;
  return !personFilm && showsRealPictures(scene);
}

export async function castBoardStandIns(project: Project, dataDir?: string): Promise<{ cast: number; cleared: number; scenes: number[] }> {
  const scenes = (project.storyboard?.scenes || []) as any[];
  const personFilm = personCarries((project.treatment as any)?.filmGrammar);
  // A camera ask on a film no person carries is a clip (take-needs.ts).
  const clips = normalizeClipNeeds(project);
  if (clips) console.log(`  Board stand-ins: ${clips} camera ask(s) on a film no person carries read as clips`);
  let cast = 0, cleared = 0;
  const touched: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const d = scenes[i];
    if (!d || !Array.isArray(d.assets) || !d.assets.length) continue;
    const kept = d.assets.filter((a: any) => !needDeclined(a, d, personFilm));
    if (kept.length !== d.assets.length) {
      console.log(`  Board stand-ins: scene ${i + 1} -- ${d.assets.length - kept.length} screen need(s) dropped (declined, or the scene already shows the real pictures)`);
      d.assets = kept;
      // A slate cast for a need that is gone goes with it.
      if (Array.isArray(d.components)) d.components = d.components.filter((c: any) => c?.type !== "asset-placeholder" || kept.some((a: any) => String(a?.description || "") === String(c?.data?.need || "")));
    }
    const r = castScreenSlates(d, { anchors: personFilm });
    if (!r.cast.length && !r.cleared) continue;
    d.components = r.components;
    cast += r.cast.length; cleared += r.cleared; touched.push(i);
    if (personFilm && r.cast.length) {
      // Words to seconds now, so the card and the band can place the cut;
      // the anchors stay on the component for the take's spine later.
      try {
        const spine = await spineForScene(project, i, String(d.voiceover_text || ""), Number(d.duration_seconds) || 0, dataDir);
        retimeSceneWith(project, i, spine);
      } catch (e: any) {
        console.warn(`  Board stand-ins: scene ${i + 1} anchors left as words (${e?.message || e})`);
      }
      // A slate that still has no numeric window (no anchor, or one the
      // script does not carry) takes the creator-cut default.
      const dur = Number(d.duration_seconds) || 0;
      for (const c of r.cast as any[]) {
        if (!c.enter || typeof c.enter !== "object" || typeof c.enter.at !== "number") c.enter = { effect: "cut", at: Math.round(dur * 0.3 * 100) / 100 };
        if (!c.exit || typeof c.exit !== "object" || typeof c.exit.at !== "number") c.exit = { effect: "cut", at: Math.round(dur * 0.8 * 100) / 100 };
      }
    }
  }
  return { cast, cleared, scenes: touched };
}
