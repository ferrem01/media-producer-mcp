/**
 * SOUND CUES: a sound effect is an EFFECT, not a track.
 *
 * A ding when a notification lands, a thud when a stamp slams: they belong to
 * a moment on screen, the way a zoom does. They used to exist only as
 * film-level audio tracks placed at an absolute film time from Studio's
 * picker -- so they drifted whenever a scene was re-timed (a take landing, a
 * trim) and the storyboard could not plan them. Marc: "these do not feel like
 * they should be on the music track, these feel like effects."
 *
 * So a scene carries `sfx: SceneSoundCue[]` beside `camera_moves`:
 *  - `at` is scene seconds, or a word ("@emails" / {word, edge, offset}) held
 *    in `anchor` and resolved by the same spine as every component time
 *    (core/word-anchors.ts applySpine), so a take re-times the sounds too;
 *  - `id` is a sound from the library (audio/sfx.ts): "house-thud", or the
 *    short house name ("thud") the writer reaches for;
 *  - `src` is the file, copied into the project once (ensureSoundFiles).
 * At render each cue becomes an audio track at the scene's start + `at`
 * (sceneSfxTracks), next to clipAudioTracks. Beds (room tone, a riser under
 * a montage) stay on the audio lane: this is for point sounds.
 */
import type { Project } from "./types.js";
import { isAnchorObject, parseShorthand, type WordAnchor } from "./word-anchors.js";
import { FOLEY_SET } from "../audio/foley.js";

export interface SceneSoundCue {
  /** Scene seconds (the resolved value when `anchor` is set). */
  at: number;
  /** A library sound: "house-<id>" or "freesound-<n>". */
  id: string;
  /** 0-1 (default 0.8). */
  volume?: number;
  /** The word this lands on; `at` holds its resolved time. */
  anchor?: WordAnchor;
  /** The sound's file in the project (/assets/... URL), resolved once. */
  src?: string;
  label?: string;
  /** Seconds, when known. */
  duration?: number;
}

const HOUSE_IDS = new Set(FOLEY_SET.map((f) => f.id));
export const DEFAULT_SFX_VOLUME = 0.8;

/** "thud" -> "house-thud"; a full id passes through; unknown -> null. */
export function normalizeSoundId(id: unknown): string | null {
  const s = String(id || "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("freesound-")) return /^freesound-\d+$/.test(s) ? s : null;
  const bare = s.startsWith("house-") ? s.slice(6) : s;
  return HOUSE_IDS.has(bare) ? `house-${bare}` : null;
}

/** Clean a list of cues from any writer (the storyboard LLM, the update tool,
 *  Studio): ids normalized, word times lifted into `anchor`, volumes
 *  clamped, junk dropped. Returns the clean list (possibly empty). */
export function normalizeSoundCues(raw: unknown): SceneSoundCue[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneSoundCue[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const c: any = r;
    const id = normalizeSoundId(c.id ?? c.sound ?? c.sfx);
    if (!id) continue;
    const cue: SceneSoundCue = { at: 0, id };
    if (isAnchorObject(c.anchor)) cue.anchor = { ...c.anchor };
    if (isAnchorObject(c.at)) cue.anchor = { ...c.at };
    else if (typeof c.at === "string") {
      const a = parseShorthand(c.at);
      if (a) cue.anchor = a; else if (Number.isFinite(Number(c.at))) cue.at = Math.max(0, Number(c.at));
    } else if (Number.isFinite(Number(c.at))) cue.at = Math.max(0, Number(c.at));
    if (c.volume != null && Number.isFinite(Number(c.volume))) cue.volume = Math.max(0, Math.min(1, Number(c.volume)));
    if (typeof c.src === "string" && c.src.startsWith("/assets/") && !c.src.includes("..")) cue.src = c.src;
    if (typeof c.label === "string") cue.label = c.label;
    if (Number.isFinite(Number(c.duration))) cue.duration = Number(c.duration);
    out.push(cue);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Copy every cue's sound into the project (once) and record where it went.
 * `resolve` is audio/sfx.ts resolveSfxChoice (injected so this module stays
 * free of the server's config). Board and built scenes both. Returns how
 * many cues were given a file.
 */
export async function ensureSoundFiles(
  project: Project,
  resolve: (id: string) => Promise<{ url: string; title: string; duration: number }>,
): Promise<number> {
  const seen = new Map<string, { url: string; title: string; duration: number }>();
  let n = 0;
  const lists: any[][] = [];
  for (const s of (project.storyboard?.scenes || []) as any[]) if (Array.isArray(s.sfx)) lists.push(s.sfx);
  for (const s of (project.scenes || []) as any[]) if (Array.isArray(s.sfx)) lists.push(s.sfx);
  for (const list of lists) {
    for (const cue of list) {
      if (!cue || cue.src) continue;
      let got = seen.get(cue.id);
      if (!got) {
        try { got = await resolve(cue.id); seen.set(cue.id, got); } catch (e: any) { console.warn(`  sound cue ${cue.id}: ${e?.message || e}`); continue; }
      }
      cue.src = got.url; cue.label = cue.label || got.title; if (got.duration) cue.duration = got.duration;
      n++;
    }
  }
  return n;
}

export interface SfxTrack {
  path: string;
  type: "sfx";
  volume: number;
  startTime: number;
}

/** Every built scene's cues as audio tracks on the film clock. `startOf(i)`
 *  is scene i's start (the render's own clock, transitions included);
 *  `pathOf` maps an /assets URL to a file. A cue with no file is skipped. */
export function sceneSfxTracks(project: Pick<Project, "scenes">, startOf: (sceneIndex: number) => number, pathOf: (src: string) => string): SfxTrack[] {
  const out: SfxTrack[] = [];
  (project.scenes || []).forEach((scene: any, i) => {
    for (const cue of (scene.sfx || []) as SceneSoundCue[]) {
      if (!cue || !cue.src) continue;
      const at = Math.max(0, Math.min(Number(scene.duration_seconds) || 0, Number(cue.at) || 0));
      out.push({ path: pathOf(cue.src), type: "sfx", volume: cue.volume ?? DEFAULT_SFX_VOLUME, startTime: Math.round((startOf(i) + at) * 1000) / 1000 });
    }
  });
  return out;
}

/** A short label for the Plan: "ding ×3, thud". */
export function soundSummary(cues: SceneSoundCue[] | undefined): string {
  const counts = new Map<string, number>();
  for (const c of cues || []) {
    const name = String(c.id || "").replace(/^house-/, "").replace(/^freesound-/, "sound ");
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(", ");
}
