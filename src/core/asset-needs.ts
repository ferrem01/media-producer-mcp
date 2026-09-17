/**
 * Proof on the storyboard (SPEC-creator-cut.md).
 *
 * A creator-cut board declares, per claim, the PROOF the screen should show
 * while the claim is said: a screenshot, a screen recording, b-roll, or a
 * product mock. It is written on the scene's existing `assets[]` needs --
 * the same record the take flow uses, so Studio lists it beside the
 * take with Upload -- with the four fields a proof adds to a plain need:
 * how it is used (cutaway or card), the words it enters and leaves on, and
 * where the eye should go. A provided file becomes a full-bleed `image` or
 * `video` cut in on its word.
 */

import type { Project, StoryboardScene, AssetRequirement, AssetRequirementType } from "./types.js";

/** A PROOF SURFACE: a product mock the library performs, or a provided
 *  still or clip. Cut in on a claim it is the cutaway -- laid under the
 *  labels, plated so nothing shows through its own window's margins,
 *  framed on its region on a tall frame. One definition, used by the
 *  pipeline (defaults), the generator (layout) and the assembler (plate). */
export const PROOF_SURFACE_RE = /^(quotient-|claude-|slack-|linkedin-|x-post|email-compose|chat-simulator|ui-terminal-agent|browser-|app-|ui-|device-showcase|metric-dashboard|gmail-|calendar-view|code-editor|kanban-board|image$|video$)/;
export function isProofSurface(type: unknown): boolean { return typeof type === "string" && PROOF_SURFACE_RE.test(type); }

/** The kinds of proof a writer may ask for. */
/** `illustration` is the IDEA BEAT (SPEC-creator-cut.md): a claim no screen
 *  can prove asks for a drawn object -- the build draws it in-house from the
 *  description and cuts it in on the claim's words like any other proof. */
export const PROOF_TYPES: AssetRequirementType[] = ["screenshot", "screen_recording", "stock_footage", "mockup", "illustration"];

/** What each kind is called in Studio. */
export const NEED_LABELS: Partial<Record<AssetRequirementType, string>> = {
  screenshot: "Screenshot",
  screen_recording: "Screen recording",
  stock_footage: "B-roll",
  mockup: "Product mock",
  illustration: "Illustration (the build draws it)",
  camera_video: "Camera take",
};

/** The kinds only a human can supply; the others the build will one day
 *  make itself (b-roll from the description, a mock the library performs). */
const HUMAN_TYPES = new Set<AssetRequirementType>(["screenshot", "screen_recording"]);

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** The writer's `assets` as they should be stored: known types, a real
 *  description, a full need record, times left as the writer wrote them (a
 *  word anchor or seconds -- the build resolves them). Anything else is
 *  dropped. Entries that already are full needs (a hydrated board) pass
 *  through with their status and file intact. */
export function normalizeAssetNeeds(raw: unknown): AssetRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out: AssetRequirement[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const type = String((e as any).type || (e as any).kind || "").trim().toLowerCase().replace(/[\s-]+/g, "_") as AssetRequirementType;
    const description = String((e as any).description || "").trim();
    if (!description) continue;
    if (!PROOF_TYPES.includes(type) && type !== "camera_video") continue;
    const human = HUMAN_TYPES.has(type) || type === "camera_video";
    const need: AssetRequirement = {
      description,
      type,
      status: (e as any).status === "provided" && (e as any).path ? "provided" : "needed",
      priority: (e as any).priority || (type === "camera_video" ? "critical" : human ? "recommended" : "nice_to_have"),
      fallback: String((e as any).fallback || "").trim() || (human
        ? "The claim runs on the person alone until the file arrives."
        : "Upload a clip, or the claim runs on the person alone (in-house generation comes later)."),
    };
    if ((e as any).path) need.path = String((e as any).path);
    if ((e as any).recording_instructions) need.recording_instructions = String((e as any).recording_instructions);
    const gen = String((e as any).generation_prompt || "").trim();
    if (gen) need.generation_prompt = gen;
    else if (type === "stock_footage" || type === "mockup") need.generation_prompt = description;
    const use = String((e as any).use || "").trim().toLowerCase();
    if (use === "card" || use === "cutaway") need.use = use;
    for (const k of ["at", "until"] as const) {
      const v = (e as any)[k];
      if (typeof v === "number" && Number.isFinite(v)) need[k] = v;
      else if (typeof v === "string" && v.trim()) need[k] = v.trim();
    }
    const focus = String((e as any).focus || "").trim();
    if (focus) need.focus = focus;
    out.push(need);
  }
  return out;
}

export interface OpenAssetNeed { scene_index: number; asset_index: number; type: AssetRequirementType; description: string }

/** Every proof need still waiting for a file (camera takes have their own
 *  list, `openTakeNeeds`). */
export function openAssetNeeds(project: Project): OpenAssetNeed[] {
  const out: OpenAssetNeed[] = [];
  (project.storyboard?.scenes || []).forEach((scene, si) => {
    (scene.assets || []).forEach((a, ai) => {
      if (a && a.type !== "camera_video" && a.status === "needed") out.push({ scene_index: si, asset_index: ai, type: a.type, description: a.description });
    });
  });
  return out;
}

/** A file fills one need: it flips to provided and carries the file.
 *  Throws on an index that is not on the storyboard. */
export function provideAsset(project: Project, sceneIndex: number, assetIndex: number, url: string): AssetRequirement {
  const scene = project.storyboard?.scenes?.[sceneIndex];
  if (!scene) throw new Error(`Storyboard scene ${sceneIndex + 1} not found`);
  const need = (scene.assets || [])[assetIndex];
  if (!need) throw new Error(`Scene ${sceneIndex + 1} has no need ${assetIndex + 1}`);
  need.path = url;
  need.status = "provided";
  return need;
}

/** What the provided file is, from its name. */
export function assetMedia(url: string): "image" | "video" | null {
  if (IMAGE_RE.test(url)) return "image";
  if (VIDEO_RE.test(url)) return "video";
  return null;
}

/**
 * The build's side: every provided proof becomes a full-bleed `image` or
 * `video` over the person, cut in on its word and out on the next (or at
 * the claim's end) -- `at`/`exit_at` on those components are a HARD cut.
 * Times are left as the writer wrote them; the pipeline's spine pass
 * resolves word anchors like any other component's. A proof marked
 * `use: "card"` is not built yet (phase 2) and is skipped here so it is
 * never mis-cast as a cover.
 */
export function proofComponents(scene: StoryboardScene): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const need of scene.assets || []) {
    if (!need || need.type === "camera_video" || !need.path || need.status !== "provided") continue;
    if (need.use === "card") continue;
    const media = assetMedia(need.path);
    if (!media) continue;
    const data: Record<string, unknown> = { src: need.path };
    if (need.at !== undefined) data.at = need.at;
    if (need.until !== undefined) data.exit_at = need.until;
    if (media === "image") data.drift = false;
    out.push({
      type: media,
      data,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
    });
  }
  return out;
}

function anchorWord(v: unknown): string | null {
  if (typeof v === "string") { const m = v.trim().match(/^@(\S+)/); return m ? m[1].toLowerCase() : null; }
  if (v && typeof v === "object" && typeof (v as any).word === "string") return String((v as any).word).toLowerCase();
  return null;
}

/** The mock the storyboard cut in on the same word as a provided proof
 *  (the default proof, motion graphics performing the claim) gives way to
 *  the real screen: returns the components with that cut window removed.
 *  A proof with no word replaces nothing -- it is added on top. */
export function replaceCutWindow(components: unknown[], at: unknown): unknown[] {
  const word = anchorWord(at);
  if (!word) return components;
  return (components || []).filter((c: any) => {
    if (!c || typeof c !== "object") return true;
    const e = c.enter;
    const eff = typeof e === "string" ? e : (e && typeof e === "object" ? e.effect : "");
    if (eff !== "cut") return true;
    const w = anchorWord(e && typeof e === "object" ? e.at : undefined) || anchorWord(c.anchors?.["enter.at"]);
    return w !== word;
  });
}

/** Does the scene already show this file? (A rebuild must not stack a
 *  second copy.) */
export function hasProofFor(components: unknown[], src: string): boolean {
  return (components || []).some((c: any) => c && typeof c === "object" && (c.type === "image" || c.type === "video") && c.data?.src === src);
}
