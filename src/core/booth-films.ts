/**
 * THE BOOTH'S FILM LIST (SPEC-remote-booth.md, "Moving between films
 * without touching the rig").
 *
 * Marc: "Sometimes I have the rig set up and I want to move from one
 * recording to another between films. I have to remove the camera from the
 * stand and then scan the QR for each." The remote booth's control screen
 * and the arm's-length booth's Films sheet both list the tenant's
 * person-carried films (speaker, creator-cut) with their scenes and what
 * each still needs, and a tap moves the booth there -- no QR, no Studio.
 *
 * Pure: projects in, the list out. GET /api/booth-films/{tenant} feeds it
 * the token's own tenant (the HTTP choke point refuses any other), so the
 * list can never hold another tenant's film.
 */

import { personCarries, activeTake, TAKE_NEED_DESCRIPTION, isClipNeed } from "./take-needs.js";
import type { Project } from "./types.js";

export interface BoothFilmScene {
  index: number;
  label: string;
  /** The scene's spoken lines (the prompter's script). */
  lines: string;
  /** needed = a take is still owed; provided = one landed; none = no take asked (no lines, or an opaque card). */
  need: "needed" | "provided" | "none";
  duration?: number;
}

export interface BoothFilm {
  project_id: string;
  name: string;
  grammar: string;
  frame?: string;
  canvas: { width: number; height: number };
  updated_at?: string;
  /** Scenes still owed a take. */
  open: number;
  scenes: BoothFilmScene[];
}

function sceneNeed(p: Project, i: number): BoothFilmScene["need"] {
  const sb = p.storyboard?.scenes?.[i];
  const need = (sb?.assets || []).find((a) => a && a.type === "camera_video" && (a.description === TAKE_NEED_DESCRIPTION || isClipNeed(a)));
  if (need) return need.status === "provided" || activeTake(p, i) ? "provided" : "needed";
  return activeTake(p, i) ? "provided" : "none";
}

/** The person-carried films, the ones still owed a take FIRST (the next
 *  recording is on top), then the most recently touched. */
export function boothFilms(projects: Project[]): BoothFilm[] {
  const out: BoothFilm[] = [];
  for (const p of projects) {
    const grammar = String((p.treatment as any)?.filmGrammar || "");
    if (!personCarries(grammar)) continue;
    const sbScenes = p.storyboard?.scenes || [];
    if (!sbScenes.length) continue;
    const scenes: BoothFilmScene[] = sbScenes.map((s, i) => ({
      index: i,
      label: String(s.label || `Scene ${i + 1}`),
      lines: String(s.voiceover_text || "").trim(),
      need: sceneNeed(p, i),
      duration: Number(s.duration_seconds) || undefined,
    }));
    out.push({
      project_id: p.project_id,
      name: p.name || p.project_id,
      grammar,
      frame: (p.treatment as any)?.frame,
      canvas: { width: Number(p.canvas?.width) || 1080, height: Number(p.canvas?.height) || 1920 },
      updated_at: p.updated_at,
      open: scenes.filter((s) => s.need === "needed").length,
      scenes,
    });
  }
  return out.sort((a, b) => (Number(b.open > 0) - Number(a.open > 0)) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}
