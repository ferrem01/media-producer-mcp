/**
 * Needs and takes (SPEC-take-flow.md).
 *
 * A speaker film DECLARES what it needs from the human: one camera take per
 * scene that has spoken lines. The storyboard already had the concept
 * (`assets[]` with `needed | provided`); this module makes a speaker board
 * emit those needs deterministically, lets a take fulfil one per scene, and
 * gives an agent something to wait on (a `take` job that completes on
 * arrival).
 */

import type { Project, Take, SpeakerTrackClip, StoryboardScene } from "./types.js";

/** Marker on the auto-emitted need so it can be found and updated. */
export const TAKE_NEED_DESCRIPTION = "Camera take of this scene's spoken lines";

/** The grammars where a PERSON carries the film: the camera is the base of
 *  every scene, the voice is the clock, and the board asks for takes. Every
 *  gate that used to read `=== "speaker"` reads this instead, so a grammar
 *  added here inherits the whole take flow (needs, the booth, the spine,
 *  the face-aware layout, the takeover recipe, the cards) at once. */
export const PERSON_GRAMMARS = ["speaker", "creator-cut"] as const;
export function personCarries(grammar: unknown): boolean {
  return typeof grammar === "string" && (PERSON_GRAMMARS as readonly string[]).includes(grammar);
}

/**
 * Make sure every speaker-board scene with spoken lines carries a
 * `camera_video` need, and that its status reflects the takes on file.
 * Idempotent. Returns true when anything changed.
 */
export function ensureSpeakerNeeds(project: Project): boolean {
  if (!personCarries((project.treatment as any)?.filmGrammar)) return false;
  const scenes = project.storyboard?.scenes || [];
  let changed = false;
  scenes.forEach((scene: StoryboardScene, i: number) => {
    const script = String(scene.voiceover_text || "").trim();
    if (!script) return;
    if (!Array.isArray(scene.assets)) { scene.assets = []; changed = true; }
    let need = scene.assets.find((a) => a.type === "camera_video" && a.description === TAKE_NEED_DESCRIPTION);
    const active = activeTake(project, i);
    if (!need) {
      need = {
        description: TAKE_NEED_DESCRIPTION,
        type: "camera_video",
        status: "needed",
        priority: "critical",
        fallback: "A slate base: the scene builds over a plain card until the take arrives.",
        recording_instructions: script,
      };
      scene.assets.push(need);
      changed = true;
    } else if (need.recording_instructions !== script) {
      need.recording_instructions = script;
      changed = true;
    }
    const status = active ? "provided" : "needed";
    if (need.status !== status) { need.status = status; changed = true; }
    if (active && need.path !== active.source) { need.path = active.source; changed = true; }
    if (!active && need.path) { delete need.path; changed = true; }
  });
  return changed;
}

/** The take speaker_track currently carries for a scene, if any. */
export function activeTake(project: Project, sceneIndex: number): Take | undefined {
  const clip = (project.speaker_track?.clips || []).find((c) => c.scene_index === sceneIndex);
  if (!clip) return undefined;
  // Newest record wins when the same source was attached more than once.
  return [...(project.takes || [])].reverse().find((t) => t.source === clip.source && t.scene_index === sceneIndex);
}

/** Scenes (0-based) whose take need is still open. */
export function openTakeNeeds(project: Project): number[] {
  const out: number[] = [];
  (project.storyboard?.scenes || []).forEach((scene, i) => {
    const need = (scene.assets || []).find((a) => a.type === "camera_video" && a.description === TAKE_NEED_DESCRIPTION);
    if (need && need.status === "needed") out.push(i);
  });
  return out;
}

/**
 * Attach a take as the base for one scene. The scene's previous clip (if
 * any) is replaced; clips stay in scene order; the take is recorded in
 * `takes[]`; the scene's need flips to provided.
 */
export function attachTake(project: Project, take: Omit<Take, "id">): Take {
  const id = `take_${(project.takes || []).length}`;
  const lines = String(project.storyboard?.scenes?.[take.scene_index]?.voiceover_text || "").trim();
  const rec: Take = { id, ...take, ...(lines && take.lines == null ? { lines } : {}) };
  project.takes = [...(project.takes || []), rec];
  const clip: SpeakerTrackClip = {
    source: rec.source, start: 0, scene_index: rec.scene_index,
    ...(rec.trim_start != null ? { trim_start: rec.trim_start } : {}),
    ...(rec.trim_end != null ? { trim_end: rec.trim_end } : {}),
  };
  const others = (project.speaker_track?.clips || []).filter((c) => c.scene_index !== rec.scene_index && c.scene_index !== undefined);
  const clips = [...others, clip].sort((a, b) => (a.scene_index ?? 0) - (b.scene_index ?? 0));
  project.speaker_track = { clips };
  ensureSpeakerNeeds(project);
  return rec;
}

// ── Take waiters: the `take` job blocks here until the take arrives ──

type Waiter = { sceneIndex?: number; resolve: (take: Take) => void };
const waiters = new Map<string, Waiter[]>();
const key = (tenantId: string, projectId: string) => `${tenantId}/${projectId}`;

/** Resolves with the take when one attaches to the project (any scene, or
 *  the given scene). */
export function waitForTake(tenantId: string, projectId: string, sceneIndex?: number): Promise<Take> {
  return new Promise((resolve) => {
    const k = key(tenantId, projectId);
    waiters.set(k, [...(waiters.get(k) || []), { sceneIndex, resolve }]);
  });
}

/** Called by the attach path. Returns how many waiters were released. */
export function resolveTakeWaiters(tenantId: string, projectId: string, take: Take): number {
  const k = key(tenantId, projectId);
  const list = waiters.get(k) || [];
  const hit = list.filter((w) => w.sceneIndex === undefined || w.sceneIndex === take.scene_index);
  const rest = list.filter((w) => !hit.includes(w));
  if (rest.length) waiters.set(k, rest); else waiters.delete(k);
  hit.forEach((w) => w.resolve(take));
  return hit.length;
}

/** How many `take` jobs are waiting on a project right now. */
export function pendingTakeWaiters(tenantId: string, projectId: string): number {
  return (waiters.get(key(tenantId, projectId)) || []).length;
}
