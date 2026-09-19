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
import { personCarries } from "./take-needs.js";
import { spineForScene, retimeSceneWith } from "./measured-spine.js";

export async function castBoardStandIns(project: Project, dataDir?: string): Promise<{ cast: number; cleared: number; scenes: number[] }> {
  const scenes = (project.storyboard?.scenes || []) as any[];
  const personFilm = personCarries((project.treatment as any)?.filmGrammar);
  let cast = 0, cleared = 0;
  const touched: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const d = scenes[i];
    if (!d || !Array.isArray(d.assets) || !d.assets.length) continue;
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
