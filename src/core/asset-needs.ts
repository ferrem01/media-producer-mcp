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
export const PROOF_SURFACE_RE = /^(quotient-|claude-|slack-|linkedin-|x-post|email-compose|chat-simulator|ui-terminal-agent|browser-|app-|ui-|device-showcase|metric-dashboard|gmail-|calendar-view|code-editor|kanban-board|asset-placeholder|image$|video$)/;
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
    if (use === "card" || use === "cutaway" || use === "split") need.use = use;
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
    // THE SPLIT rides on the component: the tall-frame layout reads it.
    if (need.use === "split") data.use = "split";
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

/**
 * THE MOCK IS THE PLACEHOLDER (SPEC-briefs.md): on a film nobody carries,
 * a scene that stages a product mock as its payoff may list a
 * `screen_recording` / `screenshot` need for the real screen. The film
 * builds on the mock today; when the recording lands, it takes the mock's
 * exact slot and timing. With no mock in the scene the recording is laid
 * full-bleed like any provided proof. Pure: returns the new components.
 */
export function castProvidedScreens(scene: StoryboardScene): { components: Array<Record<string, unknown>>; replaced: number; added: number } {
  const comps: Array<Record<string, unknown>> = Array.isArray(scene.components) ? (scene.components as any[]).map((c) => (c && typeof c === "object" ? { ...c } : c)) : [];
  const taken = new Set<number>();
  let replaced = 0, added = 0;
  for (const need of scene.assets || []) {
    if (!need || (need.type !== "screen_recording" && need.type !== "screenshot") || !need.path || need.status !== "provided") continue;
    const media = assetMedia(need.path);
    if (!media) continue;
    if (comps.some((c) => c && typeof c === "object" && (c as any).data && String((c as any).data.src || "") === need.path)) continue;
    // Its own slate first (the honest stand-in cast while it was open), then
    // the mock the scene staged as its payoff.
    let idx = comps.findIndex((c, i) => !taken.has(i) && isScreenSlate(c) && (c as any).data.need === need.description);
    if (idx < 0) idx = comps.findIndex((c, i) => !taken.has(i) && c && typeof c === "object" && typeof (c as any).type === "string"
      && isProofSurface((c as any).type) && (c as any).type !== "image" && (c as any).type !== "video");
    // A SCREEN IS SHOWN WHOLE: contain on the slot's plate, never cover
    // (measured live, proj_179c8dfa: a 16:10 tab recording on a 16:9 slot
    // lost its sidebar and its right edge to the crop).
    const data: Record<string, unknown> = { src: need.path, object_fit: "contain" };
    if (media === "image") { data.drift = false; data.fit = "contain"; }
    if (idx >= 0) {
      const mock: any = comps[idx];
      comps[idx] = {
        ...(mock.id ? { id: mock.id } : {}),
        type: media, data,
        ...(mock.position ? { position: mock.position } : { position: { x: "0%", y: "0%", width: "100%", height: "100%" } }),
        ...(mock.z_index !== undefined ? { z_index: mock.z_index } : {}),
        ...(mock.enter ? { enter: mock.enter } : {}),
        ...(mock.exit ? { exit: mock.exit } : {}),
      };
      taken.add(idx);
      replaced++;
    } else {
      if (typeof need.at === "number") data.at = need.at;
      if (typeof need.until === "number") data.exit_at = need.until;
      comps.push({ type: media, data, position: { x: "0%", y: "0%", width: "100%", height: "100%" } });
      added++;
    }
  }
  return { components: comps, replaced, added };
}

/** THE SCREEN SLATE (SPEC-briefs.md): the stand-in for a screen recording
 *  or screenshot nobody has uploaded yet -- the library's asset-placeholder,
 *  saying what it waits for, cast exactly where the recording will go. A
 *  product mock is never the stand-in for a real screen: it looks finished
 *  and is not. */
export const SCREEN_SLATE_TYPE = "asset-placeholder";
export function isScreenSlate(c: unknown): boolean {
  return !!c && typeof c === "object" && (c as any).type === SCREEN_SLATE_TYPE && typeof (c as any).data?.need === "string";
}
function isScreenNeed(need: AssetRequirement | undefined | null): need is AssetRequirement {
  return !!need && (need.type === "screen_recording" || need.type === "screenshot");
}
function screenSlate(need: AssetRequirement): Record<string, unknown> {
  return {
    need: need.description,
    text: need.description,
    asset_type: `${NEED_LABELS[need.type] || need.type} needed`,
    hint: "Upload the real one in Studio -- it takes this slot",
  };
}

/**
 * Every open `screen_recording` / `screenshot` need gets a slate: in the
 * slot of the product mock the scene staged as its payoff (same position,
 * layer and cut window -- the mock is removed), else full-bleed, cut in
 * and out on the need's `at` / `until` (a person film's word anchors pass
 * through for the spine to resolve; `anchors: false` keeps seconds only).
 * The slate of a need that has since been provided is cleared. Idempotent:
 * a need that already has its slate casts nothing. Pure.
 */
export function castScreenSlates(scene: StoryboardScene, opts: { anchors?: boolean } = {}): { components: Array<Record<string, unknown>>; cast: Array<Record<string, unknown>>; cleared: number } {
  let comps: Array<Record<string, unknown>> = Array.isArray(scene.components) ? (scene.components as any[]).map((c) => (c && typeof c === "object" ? { ...c } : c)) : [];
  const needs = (scene.assets || []).filter(isScreenNeed);
  const open = needs.filter((n) => n.status === "needed" && !n.path);
  const openDesc = new Set(open.map((n) => n.description));
  // A slate whose need is filled (or gone from the board) leaves.
  const before = comps.length;
  comps = comps.filter((c) => !isScreenSlate(c) || openDesc.has(String((c as any).data.need)));
  const cleared = before - comps.length;
  const cast: Array<Record<string, unknown>> = [];
  const taken = new Set<number>();
  for (const need of open) {
    if (comps.some((c) => isScreenSlate(c) && (c as any).data.need === need.description)) continue;
    const idx = comps.findIndex((c, i) => !taken.has(i) && c && typeof c === "object" && typeof (c as any).type === "string"
      && isProofSurface((c as any).type) && (c as any).type !== "image" && (c as any).type !== "video" && !isScreenSlate(c));
    const data = screenSlate(need);
    if (need.use === "split") data.use = "split";
    let slate: Record<string, unknown>;
    if (idx >= 0) {
      const mock: any = comps[idx];
      slate = {
        ...(mock.id ? { id: mock.id } : {}),
        type: SCREEN_SLATE_TYPE, data,
        ...(mock.position ? { position: mock.position } : { position: { x: "0%", y: "0%", width: "100%", height: "100%" } }),
        ...(mock.z_index !== undefined ? { z_index: mock.z_index } : {}),
        ...(mock.enter ? { enter: mock.enter } : {}),
        ...(mock.exit ? { exit: mock.exit } : {}),
      };
      comps[idx] = slate;
      taken.add(idx);
    } else {
      const keep = (v: unknown) => (typeof v === "number" ? true : (opts.anchors === true && typeof v === "string" && v.trim() !== ""));
      slate = { type: SCREEN_SLATE_TYPE, data, position: { x: "0%", y: "0%", width: "100%", height: "100%" } };
      if (keep(need.at)) slate.enter = { effect: "cut", at: need.at };
      if (keep(need.until)) slate.exit = { effect: "cut", at: need.until };
      comps.push(slate);
    }
    cast.push(slate);
  }
  return { components: comps, cast, cleared };
}

/**
 * THE PICK APPLIES NOW (SPEC-briefs.md, the slot is the need): on a built
 * film a newly provided need takes its slot in the BUILT scene without a
 * rebuild -- Marc: "you select the new video and hit save and nothing
 * changes". A swap replaces the file wherever the old one was cast (the
 * b-roll ground, a drawn still, a cut-in, a provided screen); a first
 * provision takes the slate's or mock's slot (screens), lays the ground
 * (b-roll on a film nobody carries) or cuts in on the need's times. Pure:
 * returns the new components and what happened.
 */
export function recastProvidedNeed(
  scene: { components?: unknown[]; duration_seconds?: number },
  need: AssetRequirement,
  prevPath: string | undefined,
  opts: { personFilm: boolean },
): { components: Array<Record<string, unknown>>; changed: number; how: string } {
  const comps: Array<Record<string, unknown>> = Array.isArray(scene.components) ? (scene.components as any[]).map((c) => (c && typeof c === "object" ? { ...c, data: { ...((c as any).data || {}) } } : c)) : [];
  if (!need.path || need.status !== "provided") return { components: comps, changed: 0, how: "not provided" };
  const media = assetMedia(need.path);
  if (!media) return { components: comps, changed: 0, how: "not an image or clip" };
  let changed = 0;
  // 1. A swap: the old file gives way wherever it was cast.
  if (prevPath && prevPath !== need.path) {
    for (const c of comps) {
      if (c && typeof c === "object" && (c as any).data && String((c as any).data.src || "") === prevPath) {
        (c as any).data.src = need.path;
        if ((c as any).type === "image" || (c as any).type === "video") (c as any).type = media;
        changed++;
      }
    }
    if (changed) return { components: comps, changed, how: "swapped" };
  }
  const already = comps.filter((c) => c && typeof c === "object" && (c as any).data && String((c as any).data.src || "") === need.path) as any[];
  if (already.length) {
    // Providing the same screen again re-applies the fit: a screen is shown
    // whole (the film built before contain was the rule keeps its crop
    // otherwise).
    let refit = 0;
    if (need.type === "screen_recording" || need.type === "screenshot") {
      for (const c of already) {
        if (c.type === "video" && c.data.object_fit !== "contain") { c.data.object_fit = "contain"; refit++; }
        if (c.type === "image" && c.data.fit !== "contain") { c.data.fit = "contain"; refit++; }
      }
    }
    return { components: comps, changed: refit, how: refit ? "refit to show whole" : "already there" };
  }
  // 2. A first provision: the slot the board held for it.
  if (need.type === "screen_recording" || need.type === "screenshot") {
    const r = castProvidedScreens({ components: comps, assets: [need] } as any);
    return { components: r.components, changed: r.replaced + r.added, how: r.replaced ? "took the slate's slot" : "laid full-bleed" };
  }
  if (need.type === "stock_footage" && !opts.personFilm) {
    const full = (c: any) => c && c.position && String(c.position.width) === "100%" && String(c.position.height) === "100%";
    const ground = comps.find((c: any) => c && (c.id === "bg" || full(c)) && (c.type === "video" || c.type === "image"));
    if (ground) { (ground as any).type = media; (ground as any).data.src = need.path; (ground as any).data.object_fit = "cover"; return { components: comps, changed: 1, how: "is the ground" }; }
    comps.unshift({ id: "bg", type: media, z_index: 1, position: { x: 0, y: 0, width: "100%", height: "100%" }, data: { src: need.path, object_fit: "cover" } });
    return { components: comps, changed: 1, how: "laid as the ground" };
  }
  // A drawn object, found footage or a mock on a person film: cut in on its
  // times (seconds; word anchors were the build's to resolve).
  const dur = Number(scene.duration_seconds) || 0;
  const cut: Record<string, unknown> = { type: media, data: { src: need.path, ...(media === "image" ? { drift: false } : {}) }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } };
  if (need.use === "split") (cut.data as any).use = "split";
  (cut.data as any).at = typeof need.at === "number" ? need.at : Math.round(dur * 0.3 * 100) / 100;
  (cut.data as any).exit_at = typeof need.until === "number" ? need.until : Math.round(dur * 0.8 * 100) / 100;
  comps.push(cut);
  return { components: comps, changed: 1, how: "cut in" };
}
