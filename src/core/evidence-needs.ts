/**
 * Evidence needs (SPEC-creator-cut.md).
 *
 * A creator-cut board declares, per claim, the PROOF the screen should show
 * while the claim is said: a screenshot, a screen recording, b-roll, or a
 * product mock. The writer emits `evidence[]` on the scene; this module
 * turns each entry into a need on `assets[]` (the same record the take flow
 * uses, so the board lists them together with Upload), lets a provided
 * file fill one, and hands the build a full-bleed cutaway for every file
 * that arrived.
 */

import type { Project, StoryboardScene, AssetRequirement, SceneEvidence, SceneEvidenceKind } from "./types.js";

export const EVIDENCE_KINDS: SceneEvidenceKind[] = ["screenshot", "screen_recording", "stock_footage", "mockup"];

/** What each kind is called on the board. */
export const EVIDENCE_LABELS: Record<SceneEvidenceKind, string> = {
  screenshot: "Screenshot",
  screen_recording: "Screen recording",
  stock_footage: "B-roll",
  mockup: "Product mock",
};

/** The kinds only a human can supply; the others the build will one day
 *  make itself (b-roll from the description, a mock the library performs). */
const HUMAN_KINDS = new Set<SceneEvidenceKind>(["screenshot", "screen_recording"]);

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** The writer's `evidence` as it should be stored: known kinds, a real
 *  description, times left as the writer wrote them (a word anchor or
 *  seconds -- the build resolves them). Anything else is dropped. */
export function normalizeEvidence(raw: unknown): SceneEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneEvidence[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const kind = String((e as any).kind || (e as any).type || "").trim().toLowerCase().replace(/[\s-]+/g, "_") as SceneEvidenceKind;
    const description = String((e as any).description || (e as any).what || "").trim();
    if (!EVIDENCE_KINDS.includes(kind) || !description) continue;
    const ev: SceneEvidence = { kind, description };
    const use = String((e as any).use || "").trim().toLowerCase();
    if (use === "card" || use === "cutaway") ev.use = use;
    for (const k of ["at", "until"] as const) {
      const v = (e as any)[k];
      if (typeof v === "number" && Number.isFinite(v)) ev[k] = v;
      else if (typeof v === "string" && v.trim()) ev[k] = v.trim();
    }
    const focus = String((e as any).focus || (e as any).annotation || "").trim();
    if (focus) ev.focus = focus;
    out.push(ev);
  }
  return out;
}

function needTitle(ev: SceneEvidence): string {
  return `${EVIDENCE_LABELS[ev.kind]}: ${ev.description}`;
}

/** The need on `assets[]` that carries evidence i, if the board has emitted it. */
export function evidenceNeedOf(scene: StoryboardScene, evidenceIndex: number): AssetRequirement | undefined {
  return (scene.assets || []).find((a) => a && a.evidence === evidenceIndex);
}

/**
 * Make sure every declared piece of evidence has a need on the scene, with
 * its description current and its status following the file on it.
 * Idempotent. Returns true when anything changed.
 */
export function ensureEvidenceNeeds(project: Project): boolean {
  let changed = false;
  for (const scene of project.storyboard?.scenes || []) {
    const evidence = Array.isArray(scene.evidence) ? scene.evidence : [];
    if (!evidence.length && !(scene.assets || []).some((a) => a && a.evidence !== undefined)) continue;
    if (!Array.isArray(scene.assets)) { scene.assets = []; changed = true; }
    // Needs whose evidence no longer exists (the board was rewritten).
    const before = scene.assets.length;
    scene.assets = scene.assets.filter((a) => a.evidence === undefined || (a.evidence >= 0 && a.evidence < evidence.length));
    if (scene.assets.length !== before) changed = true;
    evidence.forEach((ev, i) => {
      const type = ev.kind;
      let need = evidenceNeedOf(scene, i);
      const description = needTitle(ev);
      const human = HUMAN_KINDS.has(ev.kind);
      if (!need) {
        need = {
          description,
          type,
          status: "needed",
          priority: human ? "recommended" : "nice_to_have",
          fallback: human
            ? "The claim runs on the person alone until the file arrives."
            : "Upload a clip, or the claim runs on the person alone (in-house generation comes later).",
          evidence: i,
          ...(ev.kind === "stock_footage" || ev.kind === "mockup" ? { generation_prompt: ev.description } : {}),
        };
        scene.assets.push(need);
        changed = true;
      } else {
        if (need.description !== description) { need.description = description; changed = true; }
        if (need.type !== type) { need.type = type; changed = true; }
      }
      const status = need.path ? "provided" : "needed";
      if (need.status !== status) { need.status = status; changed = true; }
    });
  }
  return changed;
}

export interface OpenEvidenceNeed { scene_index: number; evidence_index: number; kind: SceneEvidenceKind; description: string }

/** Every evidence need still waiting for a file. */
export function openEvidenceNeeds(project: Project): OpenEvidenceNeed[] {
  const out: OpenEvidenceNeed[] = [];
  (project.storyboard?.scenes || []).forEach((scene, si) => {
    (scene.evidence || []).forEach((ev, ei) => {
      const need = evidenceNeedOf(scene, ei);
      if (!need || need.status === "needed") out.push({ scene_index: si, evidence_index: ei, kind: ev.kind, description: ev.description });
    });
  });
  return out;
}

/** A file fills one piece of evidence: the need flips to provided and
 *  carries the file. Throws on an index that is not on the board. */
export function provideEvidence(project: Project, sceneIndex: number, evidenceIndex: number, url: string): AssetRequirement {
  const scene = project.storyboard?.scenes?.[sceneIndex];
  if (!scene) throw new Error(`Storyboard scene ${sceneIndex + 1} not found`);
  const ev = (scene.evidence || [])[evidenceIndex];
  if (!ev) throw new Error(`Scene ${sceneIndex + 1} declares no evidence ${evidenceIndex + 1}`);
  ensureEvidenceNeeds(project);
  const need = evidenceNeedOf(scene, evidenceIndex)!;
  need.path = url;
  need.status = "provided";
  return need;
}

/** What the provided file is, from its name. */
export function evidenceMedia(url: string): "image" | "video" | null {
  if (IMAGE_RE.test(url)) return "image";
  if (VIDEO_RE.test(url)) return "video";
  return null;
}

/**
 * The build's side: every provided piece of evidence becomes a `cutaway`
 * component -- full-bleed over the person, hard cut in on its word and
 * out on the next (or at the claim's end). Times are left as the writer
 * wrote them; the pipeline's spine pass resolves word anchors like any
 * other component's. Evidence the writer marked `use: "card"` is not yet
 * built (phase 2) and is skipped here so it is never mis-cast as a cover.
 */
export function evidenceComponents(scene: StoryboardScene): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  (scene.evidence || []).forEach((ev, i) => {
    const need = evidenceNeedOf(scene, i);
    if (!need?.path || need.status !== "provided") return;
    if (ev.use === "card") return;
    const media = evidenceMedia(need.path);
    if (!media) return;
    const data: Record<string, unknown> = { src: need.path, media, evidence: i };
    if (ev.at !== undefined) data.at = ev.at;
    if (ev.until !== undefined) data.exit_at = ev.until;
    if (ev.focus) data.focus = ev.focus;
    out.push({
      type: "cutaway",
      data,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
    });
  });
  return out;
}

/** Does the scene already carry a cutaway for evidence i? (A rebuild must
 *  not stack a second one.) */
export function hasCutawayFor(components: unknown[], evidenceIndex: number): boolean {
  return (components || []).some((c: any) => c && typeof c === "object" && c.type === "cutaway" && c.data?.evidence === evidenceIndex);
}
