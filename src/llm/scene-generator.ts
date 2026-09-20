/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import type { LLMConfig } from "./client.js";
import { generateSceneAgentic, type CodegenSession } from "./agentic-codegen.js";
import { buildComponentCatalog, formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import type { DraftScene } from "./storyboard-builder.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage, Scene, SceneTransition } from "../core/types.js";
import { formatBeatSheet } from "../core/beats.js";
import type { Treatment } from "./creative-director.js";
import { loadAssetIntel } from "../core/asset-intel.js";
import { recoverAssetUrl, resolveVideoPath } from "../core/video-path.js";
import { isProofSurface } from "../core/asset-needs.js";
import { hexIsLight, worldBackground } from "./world.js";

// ── Types ──

export interface SceneGeneratorOpts {
  scene: DraftScene;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;           // original project prompt
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  imageUrl?: string;        // from media enrichment
  tenantId: string;
  projectId: string;
  critiqueFeedback?: string; // feedback from visual critiquer for retry
  /** Project has a speaker track: scenes composite over a live camera base. */
  hasSpeakerTrack?: boolean;
  referenceImages?: ReferenceImage[];
  treatment?: Treatment;
  /** URL of a b-roll stock clip for the agent to place as this scene's background. */
  brollVideoUrl?: string;
  /** The film's world (SPEC-world.md): continuous backdrop + theme contract. */
  world?: import("./world.js").WorldSpec;
}

export interface GeneratedScene {
  scene: Scene;
  customSources?: Map<string, string>;  // compName -> HTML source (multiple custom components per scene)
  /** Live codegen conversation for Write-then-Edit revisions (critique fixes
   *  patch the scene in-session instead of regenerating from scratch). */
  codegenSession?: CodegenSession;
}

/**
 * Instantiate a scene_template (st-*) draft into a Scene: designer-built
 * composition + slot data, deterministic and LLM-free. Extracted from
 * generateScene so out-of-pipeline shooters (storyboard cards) photograph
 * template scenes with the EXACT build-path instantiation. Returns null
 * when the draft carries no template.
 */
export function buildTemplateScene(sceneId: string, draft: any, opts: SceneGeneratorOpts): GeneratedScene | null {

// ── Scene-template instantiation (no codegen) ──
// A storyboard-selected st-* template is a designer-built composition;
// the scene is the template + slot data, deterministic and instant. The
// professional-composition path -- codegen only runs when no template fit.
var st = (draft as any).scene_template;
if (st && typeof st.type === "string" && st.type.startsWith("st-")) {
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (scene template ${st.type})`);
  var stData = (st.data && typeof st.data === "object") ? st.data : {};
  // The WORLD's theme is the template's theme unless the storyboard set one
  // explicitly (SPEC-world.md): a light film must not close on a template
  // that defaults dark -- that temperature jump is the deck-of-posters bug.
  if (opts.world && !(stData as any).theme) (stData as any).theme = opts.world.theme;
  // Default the wordmark slot from the brand kit when the template wants
  // one and the storyboard didn't fill it.
  if (!(stData as any).logo_url && opts.brandKit?.logos?.length) {
    var wmLogo = opts.brandKit.logos.find((l: any) => l.variant === "wordmark" || l.variant === "full") || opts.brandKit.logos[0];
    if (wmLogo) (stData as any).logo_url = wmLogo.url;
  }
  if (!(stData as any).scene_index) (stData as any).scene_index = `${String(opts.sceneIndex + 1).padStart(2, "0")} / ${String(opts.totalScenes).padStart(2, "0")}`;
  // st-photo-close takes the scene's generated hero image as its world;
  // the mapper leaves the slot empty because the image is enriched later.
  if (st.type === "st-photo-close" && !(stData as any).backdrop_image && opts.imageUrl) {
    (stData as any).backdrop_image = opts.imageUrl;
  }
  // Dark template scenes get the WebGL cinematic backdrop (translucent lit
  // ribbons on three.js) as their z0 world; the template's atmosphere then
  // runs baseless as a lighting pass over it.
  // Float defaults to the dark world but honors an explicit light theme
  // (Apple-style white-room float: light atmosphere + grid, no backdrop).
  if (st.type === "st-screencast" && (stData as any).presentation === "float" && !(stData as any).theme) {
    (stData as any).theme = "dark";
  }
  var stDarkDefault = ["st-logo-close", "st-quote", "st-swarm", "st-manifesto", "st-compare", "st-flow", "st-convergence"];
  var stIsDark = (stDarkDefault.indexOf(st.type) !== -1 && (stData as any).theme !== "light")
    || (stData as any).theme === "dark";
  // Speaker templates composite over the live camera (transparent) or cover it
  // with their own footage/panel (screencast). A z0 WebGL backdrop would paint
  // over the camera -- never add one for the speaker family.
  var stSpeakerTemplate = st.type === "st-speaker-screencast"
    || st.type === "st-speaker-lowerthird" || st.type === "st-speaker-split";
  // An explicit backdrop_image is its own world -- it replaces the WebGL
  // ribbons (two competing backdrops read as noise).
  // st-statement paints its own full-bleed editorial canvas (cream/near-black)
  // -- a webgl backdrop underneath is invisible paint, never inject one.
  var stWantsWebgl = stIsDark && !(stData as any).backdrop_image && !stSpeakerTemplate && st.type !== "st-statement";
  if (stWantsWebgl) (stData as any).backdrop_active = true;
  var stComponents: any[] = [{ id: "tpl_0", type: st.type, data: stData, z_index: 10 }];
  if (stWantsWebgl) {
    stComponents.unshift({
      id: "tpl_bg",
      type: "webgl-backdrop",
      z_index: 0,
      // In a world: the film's one backdrop, clock-offset to film time.
      data: opts.world
        ? { seed: opts.world.backdrop.seed, colors: opts.world.backdrop.palette, time_offset: (draft as any).film_start || 0 }
        : { seed: 3 + opts.sceneIndex * 4 },
    });
  }
  // st-artifact is a SHELL: the artifact (a ui-mock or media component
  // that BUILDS on screen) rides in a sibling instance positioned in the
  // non-editorial zone.
  if (st.type === "st-artifact") {
    var art = (stData as any).artifact;
    if (art && typeof art.type === "string") {
      var editorialLeft = (stData as any).editorial_side === "left";
      stComponents.push({
        id: "tpl_artifact",
        type: art.type,
        z_index: 20,
        position: editorialLeft
          ? { x: "42%", y: "10%", width: "55%", height: "80%" }
          : { x: "3%", y: "10%", width: "55%", height: "80%" },
        data: (art.data && typeof art.data === "object") ? art.data : {},
      });
    } else {
      console.warn(`  st-artifact: no artifact slot -- editorial column only`);
    }
  }
  // st-screencast is a SHELL: the footage itself rides in a sibling
  // screencast-frame instance (browser chrome + crop:'auto' ingest-analysis
  // chrome removal). The frame's box leaves the shell's bottom band free
  // for the timed caption chips.
  if (st.type === "st-screencast") {
    var src = (stData as any).source || (draft as any).assets?.find?.((a: string) => /\.(mp4|webm|mov|m4v)/i.test(a));
    if (src) {
      // LLMs shorten asset paths in transit; a source that doesn't resolve
      // on disk ships an empty frame. Recover by basename before wiring.
      var recoveredSrc = recoverAssetUrl(src, opts.tenantId);
      if (recoveredSrc !== src) {
        console.warn(`  st-screencast: source "${src}" not on disk -- recovered to "${recoveredSrc}"`);
        src = recoveredSrc;
        (stData as any).source = recoveredSrc;
      }
      var stFloat = (stData as any).presentation === "float";
      stComponents.push({
        id: "tpl_video",
        type: "screencast-frame",
        z_index: 20,
        position: { x: "0%", y: "4%", width: "100%", height: "82%" },
        data: {
          video_url: src,
          frame_style: stFloat ? "plain" : "macos-browser",
          presentation: stFloat ? "float" : undefined,
          theme: (stData as any).theme,
          callouts: Array.isArray((stData as any).callouts) ? (stData as any).callouts : undefined,
          crop: "auto",
          url_text: (stData as any).url_text || "",
          max_width_pct: Number((stData as any).max_width_pct) || (stFloat ? 72 : 80),
          // Camera PiP pass-through: the template exposes the pip_* slots and
          // forwards them verbatim to the footage frame, which owns the
          // bubble. Only set when the caller provides a camera source.
          pip_source: (stData as any).pip_source || undefined,
          pip_position: (stData as any).pip_position || undefined,
          pip_size: (stData as any).pip_size !== undefined ? Number((stData as any).pip_size) : undefined,
          pip_shape: (stData as any).pip_shape || undefined,
          pip_start_at: (stData as any).pip_start_at !== undefined ? Number((stData as any).pip_start_at) : undefined,
        },
      });
    } else {
      console.warn(`  st-screencast: no footage source in slots or draft assets -- shell only`);
    }
  }
  // st-speaker-screencast is a SHELL too: the recording + camera bubble ride
  // in a sibling screencast-frame stamped with the known-good screencast
  // recipe (frameless, rounded, inset, circular PiP wired to the speaker track).
  // The scene is OPAQUE so it covers the speaker base except the PiP.
  var stSpeakerOpaque = false;
  if (st.type === "st-speaker-screencast") {
    var ssSrc = (stData as any).source || (draft as any).assets?.find?.((a: string) => /\.(mp4|webm|mov|m4v)/i.test(a));
    if (ssSrc) {
      var ssRecovered = recoverAssetUrl(ssSrc, opts.tenantId);
      if (ssRecovered !== ssSrc) {
        console.warn(`  st-speaker-screencast: source "${ssSrc}" not on disk -- recovered to "${ssRecovered}"`);
        ssSrc = ssRecovered;
      }
      // pip_source defaults to the "speaker" token (bind to the speaker track);
      // "none"/null hides the bubble; anything else is a plain camera URL.
      var ssPipRaw = (stData as any).pip_source;
      var ssPip = ssPipRaw === undefined ? "speaker" : ssPipRaw;
      var ssPipSource = (ssPip === "none" || ssPip === null || ssPip === "") ? undefined : ssPip;
      // THE SPLIT on a tall canvas: the recording owns the top of the frame,
      // flush, and the speaker base shows under it -- no bubble, the person
      // is the bottom half (splitScreenHeight). On a wide canvas the
      // recording fills the frame and the camera rides as the corner PiP.
      var ssTall = opts.canvas.height > opts.canvas.width;
      var ssSplitH = ssTall ? splitScreenHeight((draft as any).take_face) : 100;
      stComponents.push({
        id: "tpl_video",
        type: "screencast-frame",
        z_index: 20,
        position: { x: "0%", y: "0%", width: "100%", height: ssSplitH + "%" },
        data: {
          video_url: ssSrc,
          frame_style: "none",
          crop: "auto",
          shadow: false,
          corner_radius: (stData as any).corner_radius !== undefined ? Number((stData as any).corner_radius) : (ssTall ? 0 : 30),
          max_width_pct: (stData as any).max_width_pct !== undefined ? Number((stData as any).max_width_pct) : (ssTall ? 100 : 88),
          pip_source: ssTall ? undefined : ssPipSource,
          pip_shape: "circle",
          pip_size: (stData as any).pip_size !== undefined ? Number((stData as any).pip_size) : 15,
          pip_position: (stData as any).pip_position || "bottom-right",
          pip_start_at: (stData as any).pip_start_at !== undefined ? Number((stData as any).pip_start_at) : undefined,
        },
      });
      stSpeakerOpaque = !ssTall; // a full-frame screencast covers the speaker base; the split leaves the person under it
      if (ssTall) console.log(`  st-speaker-screencast: tall canvas -- the split: recording in the top ${ssSplitH}%, the speaker under it`);
    } else {
      console.warn(`  st-speaker-screencast: no footage source in slots or draft assets -- shell only`);
    }
  }
  // st-speaker-split is TRANSPARENT (camera shows on the clear side); the shell
  // paints the opaque panel on the content side. An optional paired component
  // (chart / stat / mock / motion graphic) rides in the panel's lower zone.
  if (st.type === "st-speaker-split") {
    var ssContent = (stData as any).content;
    var ssHasSlot = ssContent && typeof ssContent.type === "string";
    (stData as any).has_slot = !!ssHasSlot; // shell top-aligns copy above the graphic
    if (ssHasSlot) {
      var splitRight = ((stData as any).side || "right") !== "left"; // content on right by default
      stComponents.push({
        id: "tpl_content",
        type: ssContent.type,
        z_index: 20,
        position: splitRight
          ? { x: "50%", y: "40%", width: "44%", height: "50%" }
          : { x: "6%", y: "40%", width: "44%", height: "50%" },
        data: (ssContent.data && typeof ssContent.data === "object") ? ssContent.data : {},
      });
    }
  }
  return {
    scene: {
      id: sceneId,
      label: draft.label,
      duration_seconds: draft.duration_seconds || 8,
      transition_in: draft.transition_in as any,
      // Opaque so the full-frame screencast composites OVER the speaker base
      // (camera shows only in the PiP), matching sceneCompositesOverSpeaker.
      ...(stSpeakerOpaque ? { transparent_background: false } : {}),
      beats: draft.beats as any,
      camera_moves: (draft as any).camera_moves?.length ? (draft as any).camera_moves : undefined,
      components: stComponents,
      audio_hints: draft.voiceover_text ? { voiceover_text: draft.voiceover_text } : undefined,
    } as any,
  };
}
  return null;
}

/**
 * Generate a single scene with mixed library, custom, or template components.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var draft = opts.scene;
  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;
  // ── Scene-template instantiation (no codegen) ──
  // Extracted to buildTemplateScene (shared with the storyboard-card
  // shooter): a storyboard-selected st-* template is a designer-built
  // composition -- deterministic and instant, codegen never runs.
  var tplScene = buildTemplateScene(sceneId, draft, opts);
  if (tplScene) return tplScene;

  // ── Deterministic authored-composition path (no codegen) ──
  // When the storyboard fully authored the scene's components (data +
  // scripted performances), codegen would only be inventing layout -- the
  // one job it reliably botches (measured: a cowork mock sized 2545px wide
  // inside a 1719px clipping card, content painted off both edges, three
  // revision rounds burned re-inventing the framing). Instantiate the
  // structured scene directly with the standard inset framings instead --
  // the exact shape the hand-built films use, rendered by the same runtime.
  var allDraftComps: any[] = Array.isArray(draft.components) ? (draft.components as any[]) : [];
  var authoredDraftComps = allDraftComps.filter((c) => c && typeof c === "object" && c.data && typeof c.type === "string");
  // A bare STRING entry means the storyboard named a component without
  // authoring its data -- codegen has to fill it in, so the scene can't take
  // the deterministic path. World BACKDROPS are the exception: the world
  // injects its own backdrop and BACKDROP_CAST_TYPES drops the duplicate, so
  // naming one costs nothing. The exemption used to list only
  // "webgl-backdrop", which meant a storyboard that cast ["paper-ground",
  // {typewriter...}] -- exactly what the paper-world contracts ask for --
  // fell to codegen and DISCARDED its authored components (measured on "The
  // Ink Line": 5 of 8 scenes came back as bespoke scene_scene_00N customs
  // instead of paper-ground + typewriter + pen-script).
  var strayPlainComps = allDraftComps.filter((c) => typeof c === "string" && BACKDROP_CAST_TYPES.indexOf(c) === -1);
  if (authoredDraftComps.length > 0 && strayPlainComps.length === 0 && !draft.broll_query) {
    return buildAuthoredCompositionScene(sceneId, draft, authoredDraftComps, opts);
  }

  // ── Unified Codegen Path (always active) ──
  // All scenes go through the agentic codegen generator
  // which can use <component> tags to embed library components.
  var codegenSpec = await buildCodegenSpec(draft, opts.world);
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (unified codegen)`);
  return await generateCodegenScene(opts, draft, codegenSpec, sceneId);
}

/** The house entrance/exit effects wrapperChoreoScript knows how to run. */
const CHOREO_EFFECTS = new Set([
  "slide-left", "slide-right", "slide-up", "slide-down", "rise", "pop", "fade",
  // A HARD cut: on screen at `at`, gone at exit `at`, no motion either side
  // (SPEC-creator-cut.md -- the proof takes the frame for a beat).
  "cut",
]);

/**
 * Accept a storyboard-authored enter/exit in either shape -- the bare string
 * the contract asks for ("slide-left") or the full ComponentAnimation object --
 * and drop anything the choreography layer cannot actually run.
 *
 * Silently keeping an unknown effect would be the worst outcome: OFF has no
 * entry for it, so the element would be posed to nothing and simply appear,
 * which is the "a word that just shows up" defect the grammars call out.
 */
function normalizeAnim(v: unknown): import("../core/types.js").ComponentAnimation | undefined {
  if (!v) return undefined;
  const raw = typeof v === "string" ? { effect: v } : (v as any);
  const effect = String(raw?.effect || "").trim();
  if (!CHOREO_EFFECTS.has(effect)) return undefined;
  const num = (x: any, lo: number, hi: number) =>
    Number.isFinite(Number(x)) ? Math.max(lo, Math.min(hi, Number(x))) : undefined;
  const at = num(raw.at, 0, 60);
  const duration = num(raw.duration, 0.15, 3);
  const stagger = num(raw.stagger, 0, 1);
  return {
    effect,
    ...(at !== undefined ? { at } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(stagger !== undefined ? { stagger } : {}),
    ...(typeof raw.ease === "string" ? { ease: raw.ease } : {}),
  };
}

// ── Authored Composition (deterministic) ──

/**
 * Standard inset framings for authored product-mock compositions -- the
 * recipes the storyboard prompt teaches, identical to the hand-built films.
 * The quotient trio composes (inset shell + center surface + real chat
 * panel); anything without a recipe gets the classic single-window inset.
 */
/** Overlay accents (celebration/delight seasoning): never windows -- they sit
 *  ON the composition in a corner, small, above everything. */
var ACCENT_TYPES = ["lottie-accent", "sticker-prop"];
/** Fixed-pixel type that needs a multiplier on a tall speaker frame. */
// Components that size themselves for the frame already (a font floor, a
// plated caption that fits its lane, the stage overlay) and must NOT be
// zoomed on top of that. Everything else gets the phone zoom on a tall
// speaker frame: a mock, a stamp, a pill set, a composer, a stat.
var PHONE_ZOOM_EXCLUDE = ["kinetic-text", "typewriter", "auto-tagged-link", "reel-caption-lane", "text-list", "cursor-performer", "lower-third", "st-speaker-lowerthird", "narration-track", "chapter-kicker", "logo-band", "video", "image"];
function phoneZoomable(type: string): boolean {
  return PHONE_ZOOM_EXCLUDE.indexOf(type) === -1 && !/^caption-/.test(type);
}
var PHONE_ZOOM = 1.8;
// Desktop app mocks the writer keeps casting on phone reels despite the
// SPEAKER contract (measured: chat-simulator, quotient-chat, browser-frame
// across three boards). A composer (the sentence typing) is the one mock
// with a phone form and is not in this list.
var PHONE_REEL_MOCK_RE = /^(quotient-|claude-|slack-|chat-simulator|browser-frame|metric-dashboard|dashboard-kpi|kanban-board|email-|gmail-reader|calendar-view|code-editor|terminal$|device-|timeline-steps|bento-grid|grid-layout|video-call|form-wizard|canva-editor|x-post-card|linkedin-post-card|reddit-post-card|screencast-frame|product-screenshot|app-store-card|ui-chat-thread|ui-terminal-agent|ui-video-player|st-)/;
/** Smallest pixel font a board may set for type on a tall speaker frame. */
var PHONE_MIN_FONT_PX = 72;
/** Full-stage overlays: performers that cover the whole composition. */
var STAGE_OVERLAY_TYPES = ["cursor-performer"];
/** The least a cutaway stays up (SPEC-creator-cut.md): under this a screen
 *  reads as a glitch, not as proof. */
var CUT_MIN = 1.2;
/** The camera anchors a library component publishes (its [data-anchor]
 *  regions), read once from its source. The build frames a cutaway on one
 *  of these; the storyboard may name them in camera_moves. */
var ANCHOR_CACHE = new Map<string, string[]>();
export function componentAnchors(type: string, libDir: string = config.componentLibDir): string[] {
  var key = libDir + "::" + type;
  if (ANCHOR_CACHE.has(key)) return ANCHOR_CACHE.get(key)!;
  var out: string[] = [];
  try {
    for (var cat of fs.readdirSync(libDir, { withFileTypes: true })) {
      if (!cat.isDirectory()) continue;
      var f = path.join(libDir, cat.name, `${type}.component.html`);
      if (!fs.existsSync(f)) continue;
      var src = fs.readFileSync(f, "utf-8");
      out = Array.from(new Set(Array.from(src.matchAll(/data-anchor="([a-z0-9-]+)"/g)).map((m) => m[1])));
      break;
    }
  } catch { /* no library: no anchors */ }
  ANCHOR_CACHE.set(key, out);
  return out;
}

/** Chrome anchors frame nothing worth reading; the camera goes to the
 *  region that performs. A region the component's script names wins. */
var CHROME_ANCHORS = new Set(["tabs", "nav", "header", "sidebar", "toolbar", "status"]);
/** What a script action performs on, by its name: "move-event" and
 *  "set-event-status" are calendar work, "complete-task" is the tasks
 *  pane, "type-message"/"send-message" the composer. */
var ACTION_REGIONS: Array<[RegExp, string[]]> = [
  [/event|calendar|schedule|activation/i, ["calendar", "activation"]],
  [/task/i, ["tasks"]],
  [/metric|kpi|report/i, ["metrics"]],
  [/deliverable|status/i, ["deliverables", "status"]],
  [/message|type|send|prompt|compose/i, ["composer", "messages", "input", "transcript"]],
  [/post|publish|scroll/i, ["post"]],
  [/brief/i, ["brief"]],
];
function pickAnchor(anchors: string[], data: Record<string, unknown> | undefined): string | null {
  if (!anchors.length) return null;
  var script = Array.isArray((data as any)?.script) ? ((data as any).script as any[]) : [];
  // A region the script names outright.
  for (var step of script) {
    for (var k of ["tab", "target", "region", "anchor"]) {
      var v = String(step?.[k] || "").toLowerCase();
      if (v && anchors.indexOf(v) !== -1) return v;
    }
  }
  // The region the script's actions work on (the LAST action wins: the
  // window ends where the performance ends).
  for (var i = script.length - 1; i >= 0; i--) {
    var action = String(script[i]?.action || "");
    for (var [re, regions] of ACTION_REGIONS) {
      if (!re.test(action)) continue;
      var hit = regions.find((r) => anchors.indexOf(r) !== -1);
      if (hit) return hit;
    }
  }
  // The tab the data opens on.
  var active = String((data as any)?.active_tab || "").toLowerCase();
  if (active && anchors.indexOf(active) !== -1) return active;
  var content = anchors.filter((a) => !CHROME_ANCHORS.has(a));
  return content[0] || anchors[0];
}

export interface CreatorCutCameraOpts {
  grammar?: string;
  /** The film's motion axis: punchy (default) | calm. */
  motion?: string;
  face?: TakeFace;
  duration: number;
  takeover: boolean;
}

/** The region a cutaway mock is framed on (SPEC-creator-cut.md): the one its
 *  script performs in, else the first content region. Null when the
 *  component publishes no anchors (a provided still or clip). */
export function frameAnchorFor(type: string, data: Record<string, unknown> | undefined, anchorsOf: (t: string) => string[] = (t) => componentAnchors(t)): string | null {
  return pickAnchor(anchorsOf(type), data);
}

/**
 * THE CAMERA MOVES ON THE PERSON (SPEC-creator-cut.md), by rule. A claim
 * with no authored moves gets a punch-in on the claim aimed at the face
 * (calm: a slow push); every cutaway gets an anchored zoom on the mock's
 * performing region while it is up (a desktop mock at full frame on a
 * phone fills the top quarter and leaves the rest empty -- measured in
 * the assembler probe) and the camera comes back to the person on its
 * exit; a long punchy claim pulls back on the turn. The storyboard may
 * still author its own moves, which win. Measured live on proj_6b42ee1c:
 * six scenes, none with a move, while the contract asked for them.
 */
export function creatorCutCameraMoves(
  components: Array<{ id?: string; type: string; data?: Record<string, unknown>; enter?: any; exit?: any; position?: any }>,
  o: CreatorCutCameraOpts,
): Array<Record<string, unknown>> | null {
  if (o.grammar !== "creator-cut" || o.takeover) return null;
  var dur = Number(o.duration) || 0;
  if (dur <= 0) return null;
  var punchy = String(o.motion || "") !== "calm";
  var fx = o.face ? Math.round(o.face.cx * 100) : 50, fy = o.face ? Math.round(o.face.cy * 100) : 42;
  var person = (at: number, d: number) => ({ at: Math.round(at * 100) / 100, type: "zoom", x: fx, y: fy, scale: punchy ? 1.22 : 1.1, duration: d });
  var moves: Array<Record<string, unknown>> = [punchy ? person(0.2, 0.45) : person(0.3, Math.max(2, Math.min(4, dur - 0.6)))];
  var cuts = components
    .filter((c) => isCutaway(c as any))
    .map((c) => ({ c, split: isSplitProof(c as any), at: Number(c.enter && typeof c.enter === "object" ? c.enter.at : NaN), until: Number(c.exit && typeof c.exit === "object" ? c.exit.at : NaN) }))
    .filter((x) => Number.isFinite(x.at) && x.at < dur)
    .sort((a, b) => a.at - b.at);
  var lastEnd = 0;
  for (var cut of cuts) {
    // The camera comes to rest on the proof: a mock is framed on its own
    // region by the wrapper (frame_anchor), a provided image or clip is
    // already the picture. The rig zooming as well would compound the two.
    // A SPLIT slides the person under the screen instead (the screen band
    // is pinned to the frame, so the rig moves the person and not it), on
    // the same half-second clock as the band's own entrance.
    if (cut.split) {
      var sl = splitSlide(o.face);
      moves.push({ at: cut.at, type: "slide", dy: sl.dy, scale: sl.scale, duration: 0.55, ease: "power3.out" });
    } else {
      moves.push({ at: cut.at, type: "reset", duration: 0.45 });
    }
    var end = Number.isFinite(cut.until) && cut.until > cut.at ? cut.until : dur;
    if (end < dur - 0.3) moves.push(person(end, 0.45));
    lastEnd = Math.max(lastEnd, end);
  }
  if (punchy && dur >= 3.5 && lastEnd < dur - 1.6) moves.push({ at: Math.round((dur - 1.1) * 10) / 10, type: "reset", duration: 0.5 });
  var seen = new Set<string>();
  return moves
    .filter((m) => { var k = `${m.at}|${m.type}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Number(a.at) - Number(b.at));
}

/** THE SPLIT (SPEC-creator-cut.md, SPEC-format-and-spine.md): on a tall
 *  frame the screen owns the top of the frame, flush, and the person owns
 *  the bottom -- the talking-head-under-the-screen shape every "creator at
 *  a laptop" ad uses, and what a screencast IS on a phone. One rule, two
 *  callers: a creator-cut proof marked use:"split", and the speaker
 *  screencast template on a tall canvas. The screen's bottom edge comes
 *  from the face: it ends above the hairline, never under 34% (too small
 *  to read) nor over 55% (the person is the point). A selfie take with the
 *  face mid-frame gets the top of the head clipped by a few percent, which
 *  reads as a tight crop; an over-the-shoulder shot gets the full half. */
export function splitScreenHeight(face: TakeFace | undefined): number {
  var faceTop = face ? face.cy - face.size / 2 : 0.5;
  var h = Math.max(0.34, Math.min(0.55, faceTop - 0.03));
  return Math.round(h * 1000) / 10;
}
export function isSplitProof(c: { type: string; position?: any; enter?: any; data?: any }): boolean {
  return isCutaway(c) && !!c.data && String((c.data as any).use || "") === "split";
}
/** THE SLICE UNDER THE SCREEN: the take stays full width and the bottom
 *  band shows the slice of it with the face in it. The rig slides the
 *  whole scene so the hairline sits just under the screen's edge (positive
 *  dy = down; a selfie take with the face mid-frame slides down a few
 *  percent, no zoom). A face that would have to move UP would expose the
 *  bottom, so that case zooms in just enough to cover it. Never shrink:
 *  a 9:16 take in a shorter box pillarboxes. */
export function splitSlide(face: TakeFace | undefined): { dy: number; scale: number } {
  var h = splitScreenHeight(face);
  var faceTop = face ? (face.cy - face.size / 2) * 100 : 50;
  var dy = Math.round((h + 3) - faceTop);
  dy = Math.max(-25, Math.min(h, dy));
  var scale = dy < 0 ? Math.round((1 + (2 * -dy) / 100) * 100) / 100 : 1;
  return { dy: dy, scale: scale };
}

/** A CUTAWAY (SPEC-creator-cut.md): the proof taking the frame for a beat.
 *  Either a library mock the storyboard cut in with enter {effect:"cut"}
 *  (the default -- motion graphics performing the claim) or a provided
 *  image/clip laid full-bleed. It rides over the person and every graphic
 *  on them, under the stage overlays; the band layout never re-slots it,
 *  the phone-reel rules never drop it as furniture, and it is not zoomed. */
function isCutaway(c: { type: string; position?: any; enter?: any }): boolean {
  var e = c.enter;
  var eff = typeof e === "string" ? e : (e && typeof e === "object" ? String(e.effect || "") : "");
  if (eff === "cut") return true;
  if (c.type !== "image" && c.type !== "video") return false;
  var p = c.position;
  return !!p && typeof p === "object" && String(p.x) === "0%" && String(p.y) === "0%" && String(p.width) === "100%" && String(p.height) === "100%";
}
/** Ambient full-stage text overlays that ride ABOVE the windows (their own
 *  markup scatters; the box is the whole stage). */
var HIGH_OVERLAY_TYPES = ["floating-pills"];
// Overlays that PLACE THEMSELVES inside the whole frame (safe margins of
// their own): the chapter kicker with its step dots, the logo band.
// ...and the lower third, which anchors itself bottom-left/right with its
// own safe margins: in a 35%-wide side slot it hung off the frame edge
// (measured live, proj_438fa7db: "TEST 01 -- PL", clipped).
var SELF_PLACING_TYPES = ["chapter-kicker", "logo-band", "lower-third"];
/** Ambient full-stage type BEHIND the windows, above the backdrop. */
var GHOST_TYPES = ["ghost-type"];
/** Backdrop-cast components: in a WORLD film these are redundant -- the
 *  world's one backdrop is already injected, and a second per-scene backdrop
 *  is exactly the deck-of-posters bug. Dropped when a world exists. */
var BACKDROP_CAST_TYPES = ["mesh-gradient", "webgl-backdrop", "gradient-background", "liquid-background", "paper-ground"];
/** Editorial text roles: captions/annotations must never be stretched into
 *  84% "windows" stacked on a surface (the scene-6 collision bug). They dock
 *  beside or below the surfaces instead. */
var CAPTION_ROLE_TYPES = ["kinetic-text", "annotation", "typewriter", "animated-gradient-text", "section-header"];
/** Typographic heroes: centerpieces (big number, stat), not windows. */
var HERO_ROLE_TYPES = ["stat-card", "number-counter-row", "headline-carousel", "hero-reveal", "quote-block"];
var ACCENT_SPOTS: Array<Record<string, string | number>> = [
  { x: "71%", y: "7%", width: "21%", height: "36%" },   // top-right
  { x: "7%", y: "56%", width: "19%", height: "34%" },   // bottom-left
];
// A PILE OF PROPS spreads around the frame instead of stacking on the
// second spot (measured live, proj_ab639e73: thirteen task cards popping
// out of a sentence, eleven of them on top of each other bottom-left). A
// ring of spots that keeps the middle band clear for the line they orbit,
// walked in an order that alternates sides so the pile grows evenly.
var ACCENT_RING: Array<Record<string, string | number>> = [
  { x: "6%", y: "6%", width: "21%", height: "13%" },     // top-left
  { x: "74%", y: "58%", width: "21%", height: "13%" },   // right, low
  { x: "38%", y: "4%", width: "22%", height: "13%" },    // top-centre
  { x: "36%", y: "80%", width: "22%", height: "13%" },   // bottom-centre
  { x: "5%", y: "28%", width: "21%", height: "13%" },    // left, upper
  { x: "74%", y: "76%", width: "21%", height: "13%" },   // right, bottom
  { x: "60%", y: "22%", width: "21%", height: "13%" },   // centre-right, upper
  { x: "18%", y: "70%", width: "21%", height: "13%" },   // centre-left, lower
  { x: "74%", y: "40%", width: "21%", height: "13%" },   // right, mid
  { x: "5%", y: "44%", width: "21%", height: "13%" },    // left, mid
  { x: "20%", y: "18%", width: "21%", height: "13%" },   // upper-left inner
  { x: "56%", y: "66%", width: "21%", height: "13%" },   // lower-right inner
];
function accentSpotFor(k: number): Record<string, string | number> {
  if (k < ACCENT_SPOTS.length) return ACCENT_SPOTS[k];
  return ACCENT_RING[(k - ACCENT_SPOTS.length) % ACCENT_RING.length];
}
var FULL_STAGE: Record<string, string | number> = { x: 0, y: 0, width: "100%", height: "100%" };

function isCaptionRole(t: string): boolean {
  return CAPTION_ROLE_TYPES.indexOf(t) !== -1 || t.indexOf("caption-") === 0;
}

type LayoutSlot = { position: Record<string, string | number>; z_index: number } | null;

function pct(x: number, y: number, w: number, h: number): Record<string, string> {
  var r = (n: number) => `${Math.round(n * 10) / 10}%`;
  return { x: r(x), y: r(y), width: r(w), height: r(h) };
}

/** Stack n slots vertically inside a band; returns [y, h] rows. */
function stackRows(n: number, bandY: number, bandH: number, gap: number): Array<[number, number]> {
  var h = (bandH - gap * (n - 1)) / n;
  var rows: Array<[number, number]> = [];
  for (var i = 0; i < n; i++) rows.push([bandY + i * (h + gap), h]);
  return rows;
}

/**
 * Per-INSTANCE layout for authored compositions. Returns an array aligned
 * with `authored` (null = drop the instance, e.g. a redundant backdrop in a
 * world film). Role-aware: surfaces get the window recipes; captions and
 * heroes get editorial placements (docked column / lower third / center
 * stage) instead of stacking into the same 84% inset -- the collision that
 * made films read as sloppy.
 */
/** The measured face of a take, as fractions of the frame (core/face-band.ts). */
type TakeFace = { cx: number; cy: number; size: number };

/**
 * The bands a tall speaker frame may use, built around the person. With no
 * measured face the bands are the chest-up defaults; with one, the lower
 * band starts under the chin (and is dropped when the chin is too low), the
 * top band ends above the hairline, and accent slots sit beside the head
 * only where there is room. Fractions of the frame; y downward.
 */
export function tallSpeakerBands(face: TakeFace | undefined, frameRatio = 16 / 9, punchIn = 1.3): {
  lower: { top: number; bottom: number } | null;
  top: { top: number; bottom: number } | null;
  sides: Array<{ x: number; y: number; width: number; height: number }>;
  /** The left and right edges the punch-in still shows (a corner slot
   *  starts here, never at the frame's edge). */
  edges: { left: number; right: number };
} {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  if (!face) {
    return {
      lower: { top: 0.68, bottom: 0.82 },
      top: { top: 0.13, bottom: 0.30 },
      sides: [{ x: 0.64, y: 0.31, width: 0.31, height: 0.12 }, { x: 0.05, y: 0.31, width: 0.31, height: 0.12 }],
      edges: { left: 0.05, right: 0.95 },
    };
  }
  // THE FRAME UNDER THE PUNCH-IN: the camera rig zooms on the face (1.22
  // punchy, up to ~1.3), and everything riding the rig moves with it -- a
  // slot at the frame's edge leaves the frame (measured live,
  // proj_f10e79cf: the sticker beside the head "half on, half off screen").
  // The bands and the side slots are cut to the window the zoom still
  // shows: 1/punchIn of the frame, centred on the face, clamped to the
  // frame.
  const win = 1 / Math.max(1, punchIn);
  const clampWin = (c: number) => Math.max(0, Math.min(1 - win, c - win / 2));
  const vx0 = clampWin(face.cx), vx1 = vx0 + win;
  const vy0 = clampWin(face.cy), vy1 = vy0 + win;
  const chin = face.cy + face.size * 0.45;
  const hair = face.cy - face.size * 0.5;
  const lowerBottom = r3(Math.min(0.82, vy1 - 0.02));
  const lowerTop = r3(Math.max(0.55, Math.min(0.70, chin + 0.01)));
  const lower = chin <= 0.72 && lowerBottom - lowerTop >= 0.08 ? { top: lowerTop, bottom: lowerBottom } : null;
  const topTop = r3(Math.max(0.13, vy0 + 0.02));
  const topBottom = r3(Math.max(0.20, Math.min(0.32, hair - 0.02)));
  // A band cut by the window may run a little short (7% of the frame is a
  // link or a label at phone scale; measured: 0.245-0.32 on a low face).
  const top = topBottom - topTop >= 0.07 ? { top: topTop, bottom: topBottom } : null;
  // The cascade's square is the face height; in width fractions it is
  // narrower than it looks on a tall frame, and the head is narrower still.
  const halfW = face.size * 0.5 * frameRatio * 0.72;
  const y = r3(Math.max(0.13, Math.min(0.70, face.cy - 0.06)));
  // A stamp at phone scale fits itself to its slot: below ~26% of the width
  // it shrinks past legibility (measured live: "QUOTIENT" at 32px in an
  // 18% slot). A side that narrow is no slot; a second accent stacks under
  // the first on the side that has room instead.
  const MIN_SIDE = 0.22;
  const sides: Array<{ x: number; y: number; width: number; height: number }> = [];
  const edgeR = r3(Math.min(0.95, vx1 - 0.03)), edgeL = r3(Math.max(0.05, vx0 + 0.03));
  const rx = r3(Math.max(0.5, face.cx + halfW - 0.05));
  if (r3(edgeR - rx) >= MIN_SIDE) sides.push({ x: rx, y, width: r3(edgeR - rx), height: 0.12 });
  const lx = r3(Math.min(0.5, face.cx - halfW + 0.05));
  if (r3(lx - edgeL) >= MIN_SIDE) sides.push({ x: edgeL, y, width: r3(lx - edgeL), height: 0.12 });
  // The roomier side first: the first sticker goes where there is width.
  sides.sort((a, b) => b.width - a.width);
  if (sides.length === 1 && y + 0.25 <= 0.82) sides.push({ ...sides[0], y: r3(y + 0.13) });
  return { lower, top, sides, edges: { left: edgeL, right: edgeR } };
}

function authoredLayout(authored: Array<{ type: string }>, hasWorld: boolean, vertical = false, speaker = false, takeover = false, grammar?: string, face?: TakeFace, frameRatio = 16 / 9): LayoutSlot[] {
  // THE FRAME BELONGS TO ONE THING AT A TIME (tempo-cut / hype-cut): in the
  // cut grammars a product surface owns the whole frame and claim type is a
  // lower-third stamp OVER it (or its own interstitial beat) -- never a side
  // column. The docked-window-plus-right-column recipe below is a slide
  // layout, not a film layout; it shrank every proof surface and orphaned
  // the type (operator verdict on proj_b97b2be8: "I don't see a world where
  // that looks good for these videos").
  var cutGrammar = grammar === "tempo-cut" || grammar === "hype-cut";
  var slots: LayoutSlot[] = authored.map(() => null);
  var accentCount = 0;
  var surfaceIdx: number[] = [];
  var captionIdx: number[] = [];
  var heroIdx: number[] = [];
  authored.forEach((c, i) => {
    var t = c.type;
    if (STAGE_OVERLAY_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: { ...FULL_STAGE }, z_index: 45 };
    } else if (isCutaway(c as any)) {
      // The proof at 36; a label or a word cut in WITH the proof rides above
      // it at 39 (measured: "THE BRIEF" cut in with the campaign screen and
      // painted under it -- same layer, later in the DOM). A split proof on
      // a tall frame takes the top of the frame and leaves the person.
      slots[i] = vertical && isSplitProof(c as any)
        ? { position: pct(0, 0, 100, splitScreenHeight(face)), z_index: 36 }
        : { position: { ...FULL_STAGE }, z_index: isProofSurface(t) ? 36 : 39 };
    } else if (ACCENT_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: accentSpotFor(accentCount), z_index: 40 + accentCount };
      accentCount++;
    } else if (SELF_PLACING_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: { ...FULL_STAGE }, z_index: 42 };
    } else if (HIGH_OVERLAY_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: { ...FULL_STAGE }, z_index: 38 };
    } else if (GHOST_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: { ...FULL_STAGE }, z_index: 4 };
    } else if (BACKDROP_CAST_TYPES.indexOf(t) !== -1) {
      // With a world: drop (the film's one backdrop is already injected).
      // Without: honor it as the scene's backdrop wash over the legacy bg.
      slots[i] = hasWorld ? null : { position: { ...FULL_STAGE }, z_index: 2 };
    } else if (isCaptionRole(t)) {
      captionIdx.push(i);
    } else if (HERO_ROLE_TYPES.indexOf(t) !== -1) {
      heroIdx.push(i);
    } else {
      surfaceIdx.push(i);
    }
  });

  // ── SPEAKER-VISIBLE LAYOUT: the camera recording is the base layer and
  // the speaker is the star -- content DOCKS beside her instead of filling
  // the frame (measured live: proj_11bcf413 placed the campaign board at
  // 84% width over an opaque backdrop, and the film's own speaker never
  // appeared in it). Surfaces stack in a right-third dock; captions sit in
  // the lower-left third at chin level; backdrop casts are dropped -- the
  // camera feed IS the backdrop.
  if (speaker) {
    authored.forEach((c, i) => {
      if (BACKDROP_CAST_TYPES.indexOf(c.type) !== -1) slots[i] = null;
    });
    // THE WORDS RIDE OVER EVERYTHING (creator-cut captions, core/captions.ts):
    // the caption lane takes the chest band on a tall frame -- the lower
    // third, centred, on a wide one -- above the proof (36) and a label
    // (39), so it keeps running through the cutaways (Marc: the voice never
    // stops, so the words never stop). It is slotted here, before the dock,
    // so the band it owns is not handed to a label as well.
    var laneLower = false, laneTop = false;
    var laneRest: { top: number; bottom: number } | null = null;
    authored.forEach((c, i) => {
      if (c.type !== "reel-caption-lane") return;
      // THE SCATTER LANE (the Air cut, core/captions.ts): the words land
      // around the person anywhere in the frame, so the lane owns the
      // whole frame and places its own phrases; over a cutaway its CSS
      // reads --mp-cut from the choreography, not cut_top.
      if ((c as any).data && String((c as any).data.mode || "") === "scatter") { slots[i] = { position: pct(0, 0, 100, 100), z_index: 41 }; return; }
      if (vertical && !takeover) {
        // The chest band; with the face low in the frame (no room under
        // the chin) the band above the hairline. The words win the band:
        // whatever else wanted it stacks elsewhere or is dropped. The lane
        // is PINNED to the frame (never rides the rig), so its bands are
        // the frame's own, not the punch-in window's. It takes 12% at the
        // band's top; what is left of the band stays free for a sticker
        // or the pills (measured live, proj_f10e79cf: a close face left
        // no side slot, and the sticker had nowhere to go).
        const lb = tallSpeakerBands(face, frameRatio, 1);
        const band = lb.lower || lb.top || { top: 0.68, bottom: 0.82 };
        const laneH = Math.min(0.12, band.bottom - band.top);
        const q = (n: number) => Math.round(n * 1000) / 10;
        slots[i] = { position: pct(5, q(band.top), 90, q(laneH)), z_index: 41 };
        laneLower = !!lb.lower;
        laneTop = !lb.lower && !!lb.top;
        if (band.bottom - (band.top + laneH) >= 0.06) laneRest = { top: band.top + laneH, bottom: band.bottom };
      } else {
        slots[i] = { position: pct(15, 74, 70, 16), z_index: 41 };
      }
    });
    var dockSurf = surfaceIdx.filter((i) => !slots[i]);
    // ── TALL SPEAKER FRAME (9x16, 4x5): there is no "beside her". The phone
    // selfie puts the face in the upper-middle (about 22%-68% of the height
    // -- measured on both live takes), the platform's UI owns the top 12%
    // and bottom 18%, and a 35%-wide column is a 378px sliver at phone
    // scale. So everything STACKS full-width in two bands that miss the
    // face: the LOWER band over the chest (58%-82%) first, the TOP band
    // under the platform strip (13%-30%) when the lower one is full.
    // Accents take the corners of those bands; floating pills drift in the
    // lower band instead of across the face. (Measured live on
    // proj_234d8a01: the wide dock put the composer, captions and URL in a
    // right-third column with 34px type, and the pills over his eyes.)
    if (vertical && !takeover) {
      // The bands follow the PERSON (core/face-band.ts measures the face at
      // attach): lower band under the chin when the chin leaves room, top
      // band above the hairline, accents beside the head where there is
      // width for them. Without a measured face: the chest-up defaults
      // (measured on the fresh run, proj_7c8380c5).
      const bands = tallSpeakerBands(face, frameRatio);
      const p100 = (n: number) => Math.round(n * 1000) / 10;
      var stack = dockSurf.concat(heroIdx, captionIdx).filter((i) => !slots[i]).sort((a, b) => a - b);
      var placed: number[] = [];
      var usedLower = laneLower, usedTop = laneTop;
      if (bands.lower && stack.length && !laneLower) {
        const idx = stack[0];
        slots[idx] = { position: pct(5, p100(bands.lower.top), 90, p100(bands.lower.bottom - bands.lower.top)), z_index: 10 };
        placed.push(idx); usedLower = true;
      }
      var rest = stack.filter((i) => placed.indexOf(i) === -1);
      if (bands.top && rest.length && !laneTop) {
        const rows = stackRows(Math.min(rest.length, bands.lower ? 2 : 3), p100(bands.top.top), p100(bands.top.bottom - bands.top.top), 2);
        rest.slice(0, rows.length).forEach((idx, k) => { slots[idx] = { position: pct(5, rows[k][0], 90, rows[k][1]), z_index: 20 + k }; placed.push(idx); });
        usedTop = true;
      }
      stack.filter((i) => placed.indexOf(i) === -1).forEach((idx) => {
        console.log(`    ${authored[idx].type}: no band left on the tall speaker frame -- dropped`);
        slots[idx] = null;
      });
      // Accents: beside the head; else the corners of a band no surface
      // uses; else nowhere (an accent on a face or on type is worse than none).
      var accentSpots: Array<Record<string, string | number>> = bands.sides.map((sp) => ({
        x: `${p100(sp.x)}%`, y: `${p100(sp.y)}%`, width: `${p100(sp.width)}%`, height: `${p100(sp.height)}%`,
      }));
      if (!accentSpots.length) {
        const free = bands.top && !usedTop ? bands.top : bands.lower && !usedLower ? bands.lower : laneRest;
        if (free) {
          const cw = Math.min(0.33, (bands.edges.right - bands.edges.left) * 0.45);
          const right = { x: `${p100(bands.edges.right - cw)}%`, y: `${p100(free.top)}%`, width: `${p100(cw)}%`, height: "12%" };
          const left = { x: `${p100(bands.edges.left)}%`, y: `${p100(free.top)}%`, width: `${p100(cw)}%`, height: "12%" };
          // The corner farther from the face first.
          accentSpots = face && face.cx > 0.5 ? [left, right] : [right, left];
        }
      }
      var tallAccent = 0;
      authored.forEach((c, i) => {
        if (ACCENT_TYPES.indexOf(c.type) !== -1) {
          if (accentSpots.length) {
            slots[i] = { position: accentSpots[Math.min(tallAccent, accentSpots.length - 1)], z_index: 40 + tallAccent };
            tallAccent++;
          } else {
            console.log(`    ${c.type}: no room beside the face on this frame -- dropped`);
            slots[i] = null;
          }
        } else if (SELF_PLACING_TYPES.indexOf(c.type) !== -1) {
          slots[i] = { position: { ...FULL_STAGE }, z_index: 42 };
        } else if (HIGH_OVERLAY_TYPES.indexOf(c.type) !== -1) {
          // Pills drift in the band with no surface in it, else under the chin.
          const band = bands.lower && !usedLower ? bands.lower : bands.top && !usedTop ? bands.top : (laneRest || bands.lower || bands.top);
          slots[i] = band ? { position: pct(0, p100(band.top), 100, p100(band.bottom - band.top)), z_index: 38 } : null;
        }
      });
      return slots;
    }
    if (dockSurf.length > 0) {
      // A TAKEOVER replaces her: its surface owns the whole frame. The dock
      // recipe below is for scenes where she stays on screen -- applying it
      // to a takeover silently un-does the takeover (measured live on
      // proj_cec231eb: the pipeline set 0/0/100/100 and this re-slotted it
      // to a 35% panel, so the cutaway covered nothing and both seams
      // stayed exposed).
      if (takeover) {
        dockSurf.forEach((idx, k) => {
          slots[idx] = { position: { ...FULL_STAGE }, z_index: 10 + k };
        });
      } else {
        var dockRows = stackRows(dockSurf.length, 12, 72, 3);
        dockSurf.forEach((idx, k) => {
          slots[idx] = { position: pct(62, dockRows[k][0], 35, dockRows[k][1]), z_index: 10 + k };
        });
      }
    }
    var spEd = heroIdx.concat(captionIdx);
    if (spEd.length > 0) {
      var spRows = stackRows(spEd.length, 72, 16, 2);
      spEd.forEach((idx, k) => {
        slots[idx] = { position: pct(4, spRows[k][0], 54, spRows[k][1]), z_index: 30 + k };
      });
    }
    return slots; // residual nulls = deliberately dropped (the camera is the base)
  }

  // ── VERTICAL (9:16) LAYOUT: the landscape recipes below have no width to
  // live in. The tall-frame composition contract's closed vocabulary, deterministic:
  // TYPE CARD (captions only, middle band), STACK (caption band on top, ONE
  // surface below, full width), or stacked surfaces -- side-by-side never.
  // Desktop-style surfaces render full-width; measured on the maiden flight,
  // anything narrower is an illegible sliver.
  if (vertical) {
    var vTop = 14, vBottom = 88; // middle band: clear of platform UI
    var capBand = captionIdx.length + heroIdx.length > 0;
    var surfTop = capBand ? 34 : vTop + 4;
    var freeSurf = surfaceIdx.filter((i) => !slots[i]);
    if (freeSurf.length > 0) {
      var sh = (vBottom - surfTop - (freeSurf.length - 1) * 3) / freeSurf.length;
      freeSurf.forEach((idx, k) => {
        slots[idx] = { position: pct(0, surfTop + k * (sh + 3), 100, sh), z_index: 10 + k };
      });
    }
    var vEd = heroIdx.concat(captionIdx);
    if (vEd.length > 0) {
      if (freeSurf.length > 0) {
        var capRows = stackRows(vEd.length, vTop + 2, surfTop - vTop - 5, 2);
        vEd.forEach((idx, k) => {
          slots[idx] = { position: pct(6, capRows[k][0], 88, capRows[k][1]), z_index: 30 + k };
        });
      } else {
        var cardRows = stackRows(vEd.length, 30, 42, 4);
        vEd.forEach((idx, k) => {
          slots[idx] = { position: pct(6, cardRows[k][0], 88, cardRows[k][1]), z_index: 30 + k };
        });
      }
    }
    return slots; // residual nulls = deliberately dropped (backdrop casts under a world)
  }

  // ── Surfaces: the window recipes (identical to the hand-built films) ──
  var firstOfType = (t: string) => surfaceIdx.find((i) => authored[i].type === t && !slots[i]);
  var hasSurface = (t: string) => surfaceIdx.some((i) => authored[i].type === t);
  if (hasSurface("quotient-app-shell")) {
    var shellI = firstOfType("quotient-app-shell");
    if (shellI !== undefined) slots[shellI] = { position: { x: "1.2%", y: "2%", width: "97.6%", height: "96%" }, z_index: 5 };
    for (var center of ["quotient-campaign", "quotient-social"]) {
      var ci = firstOfType(center);
      if (ci !== undefined) slots[ci] = { position: { x: "4.7%", y: "8%", width: "61.5%", height: "89%" }, z_index: 10 };
    }
    var chatI = firstOfType("quotient-chat");
    if (chatI !== undefined) slots[chatI] = { position: { x: "67.6%", y: "8%", width: "30.5%", height: "87%" }, z_index: 15 };
  } else if (hasSurface("quotient-chat") && (hasSurface("quotient-campaign") || hasSurface("quotient-social"))) {
    // No shell staged (storyboards sometimes drop it): same split, framed
    // as two floating windows over the world instead of inside the shell.
    for (var pairCenter of ["quotient-campaign", "quotient-social"]) {
      var pi = firstOfType(pairCenter);
      if (pi !== undefined) slots[pi] = { position: { x: "2.5%", y: "6%", width: "62%", height: "88%" }, z_index: 10 };
    }
    var pchatI = firstOfType("quotient-chat");
    if (pchatI !== undefined) slots[pchatI] = { position: { x: "66.5%", y: "6%", width: "31%", height: "88%" }, z_index: 15 };
  }
  var unplacedSurfaces = surfaceIdx.filter((i) => !slots[i]);
  var placedSurfaceCount = surfaceIdx.length - unplacedSurfaces.length;
  var hasEditorial = captionIdx.length + heroIdx.length > 0;
  if (unplacedSurfaces.length === 2 && placedSurfaceCount === 0) {
    slots[unplacedSurfaces[0]] = { position: { x: "2.5%", y: "6%", width: "62%", height: "88%" }, z_index: 10 };
    slots[unplacedSurfaces[1]] = { position: { x: "66.5%", y: "6%", width: "31%", height: "88%" }, z_index: 15 };
  } else if (unplacedSurfaces.length === 1 && placedSurfaceCount === 0) {
    // A lone surface: classic 84% single-window inset -- unless editorial
    // copy rides with it, in which case the window docks left and the copy
    // gets a real right column instead of stacking on top of the window.
    slots[unplacedSurfaces[0]] = (hasEditorial && !cutGrammar)
      ? { position: { x: "3%", y: "8%", width: "58%", height: "84%" }, z_index: 10 }
      : { position: { x: "8%", y: "6.5%", width: "84%", height: "87%" }, z_index: 10 };
  } else if (unplacedSurfaces.length > 0) {
    // 3+ recipe-less surfaces (or extra same-type instances beyond a recipe):
    // an even row, never the old same-slot stack.
    var n = unplacedSurfaces.length;
    var w = (94 - (n - 1) * 2) / n;
    unplacedSurfaces.forEach((idx, k) => {
      slots[idx] = { position: pct(3 + k * (w + 2), 12, w, 76), z_index: 10 + k };
    });
  }

  // ── Editorial copy: docked column / lower third / center stage ──
  var editorialIdx = heroIdx.concat(captionIdx); // heroes first (top of column)
  if (editorialIdx.length > 0) {
    if (surfaceIdx.length === 1 && unplacedSurfaces.length === 1 && !cutGrammar) {
      // One docked window -> right column, stacked. (Non-cut grammars only:
      // tempo-cut/hype-cut fall through to the lower-third stamp.)
      var rows = stackRows(editorialIdx.length, 12, 76, 4);
      editorialIdx.forEach((idx, k) => {
        slots[idx] = { position: pct(64, rows[k][0], 33, rows[k][1]), z_index: 20 + k };
      });
    } else if (surfaceIdx.length > 0) {
      // Recipe/pair/row compositions own the frame -> copy in a lower-third
      // band above the windows.
      var lowRows = stackRows(editorialIdx.length, 70, 24, 2);
      editorialIdx.forEach((idx, k) => {
        slots[idx] = { position: pct(15, lowRows[k][0], 70, lowRows[k][1]), z_index: 30 + k };
      });
    } else {
      // No surfaces: pure editorial scene. Heroes hold center stage;
      // captions take the lower third under them.
      if (heroIdx.length > 0) {
        var hw = (76 - (heroIdx.length - 1) * 4) / heroIdx.length;
        heroIdx.forEach((idx, k) => {
          slots[idx] = {
            position: captionIdx.length > 0
              ? pct(12 + k * (hw + 4), 14, hw, 48)
              : pct(12 + k * (hw + 4), 20, hw, 60),
            z_index: 10 + k,
          };
        });
        if (captionIdx.length > 0) {
          var capRows = stackRows(captionIdx.length, 68, 24, 2);
          captionIdx.forEach((idx, k) => {
            slots[idx] = { position: pct(15, capRows[k][0], 70, capRows[k][1]), z_index: 20 + k };
          });
        }
      } else {
        // Captions only: centered stack.
        var soloRows = stackRows(captionIdx.length, 18, 64, 4);
        captionIdx.forEach((idx, k) => {
          slots[idx] = { position: pct(10, soloRows[k][0], 80, soloRows[k][1]), z_index: 10 + k };
        });
      }
    }
  }

  // Safety net: anything still unslotted (shouldn't happen) gets the inset.
  authored.forEach((_, i) => {
    if (!slots[i] && BACKDROP_CAST_TYPES.indexOf(authored[i].type) === -1) {
      slots[i] = { position: { x: "8%", y: "6.5%", width: "84%", height: "87%" }, z_index: 10 };
    }
  });
  return slots;
}

export function buildAuthoredCompositionScene(
  sceneId: string,
  draft: DraftScene,
  authored: Array<{ type: string; data: Record<string, unknown> }>,
  opts: SceneGeneratorOpts,
): GeneratedScene {
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (authored composition -- deterministic, no codegen)`);
  // A speaker film's camera recording is the base layer: no world backdrop
  // (an opaque full-bleed component paints over the render's transparent
  // page and buries the speaker -- measured live: proj_11bcf413), and the
  // dock layout keeps content beside her.
  var speakerBase = !!opts.hasSpeakerTrack;
  // A takeover scene is one the storyboard/pipeline marked opaque: it
  // REPLACES the speaker rather than sitting beside her.
  var isTakeover = speakerBase && (draft as any).transparent_background === false;
  var tallFrame = opts.canvas.height > opts.canvas.width;
  // PHONE REEL: a person over the camera on a tall frame. Some desktop
  // components have no phone form at all and the board keeps reaching for
  // them (measured live, proj_37d090da: a notification-stack as thin grey
  // lines under the chin, a progress-bar as a tiny percentage rail on
  // every scene). They are rewritten before the layout sees them.
  if (speakerBase && tallFrame && !isTakeover) {
    authored = authored.flatMap((c) => {
      if (c.type === "progress-bar") {
        console.log(`    progress-bar: no phone form on a speaker reel -- dropped`);
        return [];
      }
      if (PHONE_REEL_MOCK_RE.test(c.type) && !isCutaway(c as any)) {
        console.log(`    ${c.type}: an app mock has no phone form on a speaker reel (the person carries it) -- dropped`);
        return [];
      }
      if (c.type === "notification-stack") {
        var notes = Array.isArray((c.data as any).notifications) ? ((c.data as any).notifications as any[]) : [];
        var apps = Array.from(new Set(notes.map((n) => String(n?.app || n?.title || "").trim()).filter(Boolean)));
        if (!apps.length) apps = ["Slack", "Mail", "Sheets"];
        console.log(`    notification-stack: on a phone the apps become floating pills (${apps.join(", ")})`);
        return [{ type: "floating-pills", data: { items: apps.slice(0, 6), ...((c.data as any).at !== undefined ? { at: (c.data as any).at } : {}) }, ...((c as any).anchors ? { anchors: (c as any).anchors } : {}) } as typeof c];
      }
      return [c];
    });
  }
  var types = authored.map((c) => c.type);
  var slots = authoredLayout(authored, !!opts.world, tallFrame, speakerBase, isTakeover,
    (opts as any).filmGrammar || (opts.treatment as any)?.filmGrammar,
    (draft as any).take_face, opts.canvas.height / Math.max(1, opts.canvas.width));
  // The dark cinematic world under every mock window, matching the film's
  // template scenes (and the hand-built originals).
  // The film's ONE world under every scene (SPEC-world.md). The per-scene
  // seed (5 + sceneIndex * 7) was the deck-of-posters bug: a fresh world at
  // every cut. With a world: same component, same seed, clock offset to
  // film time so the drift continues across the cut.
  var w = opts.world;
  // The PLAIN world carries NO backdrop component at all -- the scene body's
  // flat brand background IS the ground (worldBackground handles the color).
  var bgComp: any = null;
  if (!speakerBase) {
    if (w && w.backdrop.component !== "none") {
      bgComp = {
        id: "bg",
        type: w.backdrop.component,
        z_index: 1,
        position: { x: 0, y: 0, width: "100%", height: "100%" },
        data: {
          seed: w.backdrop.seed,
          colors: w.backdrop.palette,
          theme: w.theme,
          time_offset: (draft as any).film_start || 0,
          // Paper world: the surface dial rides into paper-ground (ignored by
          // the gradient backdrops).
          ...(w.surface ? { tone: w.surface.tone, intensity: w.surface.intensity,
            ...(w.surface.texture ? { texture_url: w.surface.texture } : {}) } : {}),
        },
      };
    } else if (!w) {
      bgComp = {
        id: "bg",
        type: "webgl-backdrop",
        z_index: 1,
        position: { x: 0, y: 0, width: "100%", height: "100%" },
        data: { seed: 5 + opts.sceneIndex * 7 },
      };
    }
  }
  var components: any[] = bgComp ? [bgComp] : [];
  // MEDIA BACKDROP: fetched footage/stills must reach the screen in authored
  // compositions too. The codegen path composes provided media itself, but
  // this path is deterministic and previously had NO channel -- measured
  // live (proj_b84a8e84): a golden-hour hero still was generated for the
  // close and orphaned while the film shipped a flat gradient. The clip or
  // still replaces the world backdrop for THIS scene; authored content
  // stacks above it and caption scrims keep the type legible.
  var mediaBackdrop = false;
  if (!speakerBase && (opts.brollVideoUrl || opts.imageUrl)) {
    mediaBackdrop = true;
    components[0] = opts.brollVideoUrl ? {
      id: "bg",
      type: "video",
      z_index: 1,
      position: { x: 0, y: 0, width: "100%", height: "100%" },
      data: { src: opts.brollVideoUrl, object_fit: "cover" },
    } : {
      id: "bg",
      type: "image",
      z_index: 1,
      position: { x: 0, y: 0, width: "100%", height: "100%" },
      // Ken Burns drift is built into the component; the overlay keeps
      // caption-scale type readable over an unpredictable photograph.
      data: { src: opts.imageUrl, overlay_opacity: 0.35, overlay_color: "#0c0d12" },
    };
    console.log(`    media backdrop: ${opts.brollVideoUrl ? "b-roll clip" : "hero still"} replaces the world backdrop for this scene`);
  }
  var seenType: Record<string, number> = {};
  authored.forEach(function(c, ci) {
    var lay = slots[ci];
    if (!lay) {
      console.log(`    dropped redundant ${c.type} (the world's backdrop already runs under this scene)`);
      return;
    }
    var data: Record<string, unknown> = { ...c.data };
    var zoom: number | undefined;
    // PHONE SCALE: components size their type in fixed pixels for a wide
    // frame. On a tall speaker frame the same pixels are unreadable
    // (measured: a 17px pill, a 44px strike at 1080 wide, viewed on a
    // 390px phone). The wrapper is zoomed 1.8x -- every mock, stamp and
    // pill alike -- unless the board set the component's own scale.
    if (speakerBase && tallFrame && !isTakeover) {
      if (phoneZoomable(c.type) && data.scale === undefined && !isCutaway(c as any)) zoom = PHONE_ZOOM;
      // A text-list is a desktop slide block (100px padding, 44px title,
      // unplated). Over a phone selfie its items become ONE plated caption
      // phrase (measured: "Running now / Email Social Web" was tiny dark
      // text on his chin).
      if (c.type === "text-list" && Array.isArray(data.items) && data.items.length) {
        var at = Number(data.at); if (!Number.isFinite(at)) at = Math.round(draft.duration_seconds * 0.5 * 10) / 10;
        var phrase = (data.items as unknown[]).map((it) => `*${String(it).trim()}*`).join(" · ");
        console.log(`    text-list: tall speaker frame -- rendered as a caption phrase "${phrase}" from ${at}s`);
        (c as any).type = "reel-caption-lane";
        data = { phrases: [{ text: phrase, start: at, end: draft.duration_seconds }], scrim: "plate", align: "center" };
      }
      // A pixel font size the board wrote is a desktop number (measured:
      // the URL at 44px on a 1080-wide phone frame). Floor it.
      if (c.type === "auto-tagged-link" || c.type === "kinetic-text") {
        var fsPx = typeof data.font_size === "string" ? parseFloat(data.font_size) : NaN;
        if (data.font_size === undefined || (Number.isFinite(fsPx) && fsPx < PHONE_MIN_FONT_PX)) data.font_size = `${PHONE_MIN_FONT_PX}px`;
      }
      // The URL's ink is text over the camera: dark ink vanishes on a dark
      // room (measured: #17171c on a charcoal wall).
      if (c.type === "auto-tagged-link" && (typeof data.ink !== "string" || !hexIsLight(data.ink as string))) data.ink = "#f5f6fa";
      // Kinetic words over the camera ride on a plate: no ink is safe on
      // its own against a room (measured: "ONE PLACE" in near-black on a
      // dark shirt, the URL in near-black on a cream couch).
      if (c.type === "kinetic-text" && data.plate === undefined) data.plate = true;
    }
    // WORLD INK CLAMP: editorial copy must contrast the world it sits on.
    // Storyboards habitually author dark-era caption colors (#f5f6fa) that
    // vanish on the light world -- and authored comps skip the codegen
    // contrast gates, so nothing downstream catches it. Deterministic fix:
    // in a world, a caption/hero whose ink matches the world's lightness
    // (or that has no ink at all on a LIGHT world, where component defaults
    // are dark-era white) gets the world's ink instead.
    // A media backdrop reads as DARK regardless of world theme: b-roll gets
    // composed under a darkening treatment and hero stills carry the 0.35
    // dark scrim -- dark ink over either lands near-invisible (measured
    // live: proj_cd8a6fb6 scene 7, near-black caption on a scrimmed
    // golden-hour still at 1.39:1).
    var overLiveBase = mediaBackdrop || speakerBase; // unpredictable pixels behind the type -> light ink
    if ((w || overLiveBase) && (isCaptionRole(c.type) || HERO_ROLE_TYPES.indexOf(c.type) !== -1)) {
      var worldIsLight = overLiveBase ? false : w!.theme === "light";
      var ink = typeof data.color === "string" ? (data.color as string) : undefined;
      var inkClash = ink !== undefined && hexIsLight(ink) === worldIsLight;
      if (inkClash || (ink === undefined && worldIsLight) || (ink === undefined && overLiveBase)) {
        data.color = worldIsLight ? (opts.brandKit?.colors?.text || "#17171c") : "#f5f6fa";
        console.log(`    ${c.type}: ink ${ink || "(default)"} would vanish on the ${overLiveBase ? (speakerBase ? "camera base layer" : "media backdrop") : w!.theme + " world"} -- clamped to ${data.color}`);
      }
    }
    // The recipe's show_panel contract: the shell's own agent panel hides
    // when the full-fidelity quotient-chat rides beside it.
    if (c.type === "quotient-app-shell" && types.indexOf("quotient-chat") !== -1 && data.show_panel === undefined) {
      data.show_panel = false;
    }
    // First instance keeps id = type so storyboard-authored camera anchors
    // ("claude-cowork-session" or ".transcript") resolve without translation;
    // repeats get _2, _3... (duplicate DOM ids silently broke seeks).
    var nth = (seenType[c.type] = (seenType[c.type] || 0) + 1);
    var id = nth === 1 ? c.type : `${c.type}_${nth}`;
    // Carry the storyboard's DIRECTED entrance/exit onto the wrapper. The
    // engine has always had this (wrapperChoreoScript: slide-left/-right/-up/
    // -down, rise, pop, fade) and it is the only thing that can make a cut
    // read as continuous -- the camera rig is rebuilt per scene, so camera
    // state cannot cross a boundary. Without this hop the storyboard could
    // describe "it keeps travelling right" in prose and nothing moved.
    // THE BOARD'S POSITION WINS. authoredLayout assigns a slot per component
    // TYPE, which is right when the storyboard only says "put a funnel here"
    // -- but a board that wrote an explicit position said something the type
    // alone cannot express, and the layout has no way to know better.
    // Measured live: a brand outro authored full-bleed (0/0/100%/100%) came
    // back in the generic surface slot (8%/6.5%/84%/87%) -- an inset window
    // drawn around a mastered clip, which then tripped the edge-bleed gate on
    // the border the inset had just created.
    var authoredPos = (c as any).position;
    var hasAuthoredPos = !!authoredPos && typeof authoredPos === "object"
      && authoredPos.x !== undefined && authoredPos.y !== undefined;
    // ...except on a TALL SPEAKER frame, where the board's numbers are
    // desktop guesses and the bands are the only thing keeping content off
    // the face (measured: the board's composer grew to 26% and sat on the
    // list under it). A takeover's full-bleed position still stands.
    // (A split proof's full-bleed cast is the cutaway default; the split slot wins.)
    if (hasAuthoredPos && speakerBase && tallFrame && !isTakeover && lay && STAGE_OVERLAY_TYPES.indexOf(c.type) === -1 && (!isCutaway(c as any) || isSplitProof(c as any))) {
      console.log(`    ${c.type}: tall speaker frame -- the band layout wins over the board's position (${JSON.stringify(authoredPos)})`);
      hasAuthoredPos = false;
    }
    if (hasAuthoredPos && JSON.stringify(authoredPos) !== JSON.stringify(lay.position)) {
      console.log(`    ${c.type}: honoring the board's own position (${JSON.stringify(authoredPos)}) over the ${c.type} layout slot`);
    }
    // A cut window too short to read is held open: the proof stays at
    // least CUT_MIN seconds (measured live, proj_b04fb594: windows of 0.5s
    // and 0.6s where the "until" word came right after the "at" word).
    var enterAnim = normalizeAnim((c as any).enter), exitAnim = normalizeAnim((c as any).exit);
    if (isCutaway(c as any) && enterAnim && enterAnim.effect === "cut" && exitAnim && exitAnim.effect === "cut"
        && typeof exitAnim.at === "number" && exitAnim.at - (enterAnim.at || 0) < CUT_MIN) {
      var held = Math.min(Math.max(0.5, (draft.duration_seconds || 8) - 0.2), (enterAnim.at || 0) + CUT_MIN);
      if (held > exitAnim.at) {
        console.log(`    ${c.type}: cut window ${(exitAnim.at - (enterAnim.at || 0)).toFixed(2)}s is too short to read -- held to ${(held - (enterAnim.at || 0)).toFixed(2)}s`);
        (c as any).exit = { ...exitAnim, at: Math.round(held * 100) / 100 };
      }
    }
    // The captions sit high only because the face is close; over a cutaway
    // there is no face, and high is where the mock's content is (measured
    // live, proj_f10e79cf: "the text is just cracked out over the main part
    // of the screen"). The lane drops to the chest band for every cut
    // window (wrapperChoreoScript reads cut_top).
    if (c.type === "reel-caption-lane" && tallFrame && lay && parseFloat(String(lay.position.y)) < 50 && String(data.mode || "") !== "scatter") data.cut_top = 70;
    // A cutaway on a tall frame is framed on the region it performs in --
    // and so is any desktop surface that owns the width of a tall frame
    // with no person under it (canvas-tour, tempo-cut on 9x16: measured
    // live, proj_91b654b5, a Slack window squeezed to the phone's width,
    // the thread unreadable). The wrapper scales to its performing region;
    // the camera's own moves ride on top.
    var slotW = lay ? parseFloat(String((lay.position as any).width)) : 0;
    var ownsWidth = !speakerBase && Number.isFinite(slotW) && slotW >= 80;
    var frameAnchor = tallFrame && isProofSurface(c.type) && (isCutaway(c as any) || ownsWidth) ? frameAnchorFor(c.type, data) : null;
    if (frameAnchor) console.log(`    ${c.type}: ${isCutaway(c as any) ? "a cutaway" : "a full-width surface"} on a tall frame -- framed on its "${frameAnchor}" region`);
    components.push({
      id, type: c.type, data, position: hasAuthoredPos ? authoredPos : lay.position, z_index: lay.z_index,
      ...(zoom ? { zoom } : {}),
      ...(frameAnchor ? { frame_anchor: frameAnchor } : {}),
      // Word anchors ride along: the numbers in data are their resolved
      // values, and a take arriving later re-resolves them in place.
      ...((c as any).anchors ? { anchors: (c as any).anchors } : {}),
      ...(normalizeAnim((c as any).enter) ? { enter: normalizeAnim((c as any).enter)! } : {}),
      ...(normalizeAnim((c as any).exit) ? { exit: normalizeAnim((c as any).exit)! } : {}),
    });
  });
  var acTransition: SceneTransition | undefined;
  if (draft.transition_in && draft.transition_in.type !== "none") {
    acTransition = {
      type: draft.transition_in.type as SceneTransition["type"],
      duration_seconds: draft.transition_in.duration_seconds || 0.5,
    };
  }
  // The camera: the storyboard's own moves, else creator-cut's rule.
  var cameraMoves: any[] | undefined = (draft as any).camera_moves?.length ? (draft as any).camera_moves : undefined;
  // A list of nothing but resets is a camera that never moved (measured
  // live, proj_b04fb594: four scenes authored "@3.3s reset" and nothing
  // else) -- the rule applies as if none were written.
  if (cameraMoves && cameraMoves.every((m: any) => !m || m.type === "reset")) cameraMoves = undefined;
  if (!cameraMoves && !(draft as any).camera_fixed) {
    var autoCam = creatorCutCameraMoves(components as any, {
      grammar: (opts as any).filmGrammar || (opts.treatment as any)?.filmGrammar,
      motion: (opts.treatment as any)?.visualSystem?.motion,
      face: (draft as any).take_face,
      duration: draft.duration_seconds || 8,
      takeover: isTakeover,
    });
    if (autoCam && autoCam.length) {
      cameraMoves = autoCam;
      console.log(`    camera by rule (creator-cut): ${autoCam.map((m: any) => `${m.type}${m.anchor ? "->" + m.anchor : m.scale ? " x" + m.scale : ""}@${m.at}s`).join(", ")}`);
    }
  }
  var scene: Scene = {
    ...((draft as any).spine ? { spine: (draft as any).spine } : {}),
    id: sceneId,
    label: draft.label,
    duration_seconds: draft.duration_seconds || 8,
    transition_in: acTransition,
    background: w ? worldBackground(w) : "#0c0d12",
    beats: Array.isArray(draft.beats) && draft.beats.length >= 2 ? (draft.beats as any) : undefined,
    camera_moves: cameraMoves,
    components,
    audio_hints: draft.voiceover_text ? { voiceover_text: draft.voiceover_text } : undefined,
  } as any;
  // Speaker films: carry the draft's compositing intent onto the SCENE.
  // Without this the field died at the draft and every structured speaker
  // scene composited over the camera -- a "takeover" the viewer could see
  // straight through (proj_cec231eb). Only the st-speaker-screencast
  // template ever emitted it before.
  if (typeof (draft as any).transparent_background === "boolean") {
    (scene as any).transparent_background = (draft as any).transparent_background;
  }
  // Curated instantiation: the critique loop treats it like a template scene
  // (boot gate only -- there is no codegen source to revise, and a regen
  // would deterministically rebuild the same scene).
  (scene as any).authored_composition = true;
  return { scene };
}

// ── Freeform Scene Generation ──

async function generateCodegenScene(
  opts: SceneGeneratorOpts,
  draft: DraftScene,
  codegenSpec: string,
  sceneId: string,
): Promise<GeneratedScene> {
  var compName = `scene_${sceneId}`;

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (agentic-codegen)`);

  var effectiveSpec = codegenSpec;
  // Provided real footage must be IN the spec text: the dropped-footage
  // enforcement below and the footage-facts injection both key on /assets
  // video URLs appearing in the spec -- a URL that only travels via
  // opts.brollVideoUrl is invisible to both.
  if (opts.brollVideoUrl && /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(opts.brollVideoUrl) && !effectiveSpec.includes(opts.brollVideoUrl)) {
    effectiveSpec += `\n\n## PROVIDED FOOTAGE (REAL -- must appear in the scene)\n${opts.brollVideoUrl}`;
  }
  // ── Source footage facts ──
  // When the spec references real uploaded footage, append what ingest-time
  // analysis learned about it (dimensions, embedded browser/window chrome,
  // letterbox bars, theme). Without these facts the codegen guesses -- and a
  // recording that carries its own browser header inside a mock browser
  // frame ships with two stacked headers.
  try {
    var specVideoUrls: string[] = Array.from(new Set(
      (effectiveSpec.match(/\/assets\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/gi) || []),
    ));
    var factLines: string[] = [];
    for (var svUrl of specVideoUrls) {
      var svIntel = await loadAssetIntel(resolveVideoPath(svUrl));
      if (svIntel) factLines.push(`- ${svUrl.split("/").pop()}: ${svIntel.notes.join(" ")}`);
    }
    if (factLines.length > 0) {
      effectiveSpec += "\n\n## SOURCE FOOTAGE FACTS (measured -- trust these over guesses)\n" + factLines.join("\n");
    }
  } catch { /* facts are best-effort; the spec stands without them */ }
  console.log("  [codegen-spec] Scene \"" + draft.label + "\" has " + (draft.components?.length || 0) + " component hints, spec includes schemas: " + effectiveSpec.includes("Component Schemas"));
  console.log("  [codegen-spec] Full spec length:", effectiveSpec.length, "chars");

  var agenticResult = await generateSceneAgentic({
    sceneSpec: effectiveSpec,
    sceneLabel: draft.label,
    sceneDescription: draft.purpose || draft.visual_notes,
    sceneDuration: draft.duration_seconds || 5,
    sceneIndex: opts.sceneIndex,
    totalScenes: opts.totalScenes,
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    brandKit: opts.brandKit,
    canvas: opts.canvas,
    critiqueFeedback: opts.critiqueFeedback,
    referenceImages: opts.referenceImages,
    treatment: opts.treatment,
    brollVideoUrl: opts.brollVideoUrl,
    heroImageUrl: opts.imageUrl,
    elements: Array.isArray(draft.elements) ? draft.elements : undefined,
  });

  var sceneHtml = stripHtmlFences(agenticResult.html);

  // ── Component-usage enforcement (deterministic) ──
  // The storyboard chose vetted library components and the system prompt says
  // rebuilding them by hand is a bug -- but an instruction without a check
  // ships non-compliance silently (measured: whole projects generated with a
  // 125-entry catalog and ZERO <component> tags). One corrective retry.
  var wantedComps = (Array.isArray(draft.components) ? draft.components : [])
    .map((c: any) => (typeof c === "string" ? c : c?.type))
    .filter((t: any) => typeof t === "string" && t.length > 0 && t !== "video");
  var missingComponents = wantedComps.length > 0 && !sceneHtml.includes("<component ");
  // Storyboard-authored scripted performances are the scene's choreography --
  // a performable surface that ships without its script arrives frozen at an
  // end state (the exact failure that made mock scenes read as screenshots).
  var authoredScriptTypes = (Array.isArray(draft.components) ? draft.components : [])
    .filter((c: any) => c && typeof c === "object" && (c.data as any)?.script)
    .map((c: any) => c.type as string);
  var scriptKeyRe = /['"]script['"]\s*:/;
  var missingScripts = authoredScriptTypes.filter(
    (t) => !(sceneHtml.includes(`type="${t}"`) && scriptKeyRe.test(sceneHtml)),
  );
  // REAL FOOTAGE is even less optional than library components: when the
  // spec names an /assets video, a scene that fabricates a lookalike UI
  // mock instead of embedding the recording is a structural failure
  // (measured: a walkthrough scene shipped with a fake chat UI and zero
  // <video> tags while the real 10-minute recording sat unused).
  var specVideoFiles: string[] = Array.from(new Set(
    (effectiveSpec.match(/\/assets\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/gi) || [])
      .map((u: string) => u.split("/").pop() || "")
      .filter((f: string) => f.length > 0),
  ));
  var missingFootage = specVideoFiles.filter((f) => !sceneHtml.includes(f));
  if (missingComponents || missingFootage.length > 0 || missingScripts.length > 0) {
    var defectLines: string[] = [];
    if (missingComponents) defectLines.push(`the storyboard selected the vetted library components [${wantedComps.join(", ")}] but you embedded NONE of them -- you rebuilt everything as bespoke HTML, which produces flat, low-craft results. You MUST embed each via <component type="..." data='{...}' /> (schemas are in the spec).`);
    if (missingFootage.length > 0) defectLines.push(`the spec names REAL footage (${missingFootage.join(", ")}) and your scene does not reference it -- you fabricated a mock instead of embedding the actual recording. You MUST present each named file, preferably via <component type="screencast-frame" data='{"video_url":"...","frame_style":"macos-browser","crop":"auto"}' /> (or a bare markup <video src muted playsinline> for full-bleed moments), as the spec directs.`);
    if (missingScripts.length > 0) defectLines.push(`the storyboard authored a timed data.script performance for [${missingScripts.join(", ")}] and your scene dropped it -- the surface arrives frozen at an end state instead of PERFORMING. Embed each with the storyboard's data VERBATIM (including the full script array) via <component type="..." data='{...,"script":[...]}' />.`);
    console.warn(`  Scene ${opts.sceneIndex + 1}: structural defect(s) -- ${[missingComponents ? "no <component> tags" : "", missingFootage.length ? "dropped footage " + missingFootage.join(",") : "", missingScripts.length ? "dropped script(s) " + missingScripts.join(",") : ""].filter(Boolean).join(" + ")} -- corrective retry`);
    try {
      var retryResult = await generateSceneAgentic({
        sceneSpec: effectiveSpec,
        sceneLabel: draft.label,
        sceneDescription: draft.purpose || draft.visual_notes,
        sceneDuration: draft.duration_seconds || 5,
        sceneIndex: opts.sceneIndex,
        totalScenes: opts.totalScenes,
        prompt: opts.prompt,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        critiqueFeedback: `${opts.critiqueFeedback ? opts.critiqueFeedback + "\n\n" : ""}STRUCTURAL DEFECT(S) in your previous attempt: ${defectLines.join(" ALSO: ")}`,
        referenceImages: opts.referenceImages,
        treatment: opts.treatment,
        brollVideoUrl: opts.brollVideoUrl,
        heroImageUrl: opts.imageUrl,
        elements: Array.isArray(draft.elements) ? draft.elements : undefined,
      });
      var retryHtml = stripHtmlFences(retryResult.html);
      var retryCompsOk = !missingComponents || retryHtml.includes("<component ");
      var retryFootageOk = missingFootage.every((f) => retryHtml.includes(f));
      var retryScriptsOk = missingScripts.every((t) => retryHtml.includes(`type="${t}"`) && scriptKeyRe.test(retryHtml));
      if (retryCompsOk && retryFootageOk && retryScriptsOk) {
        sceneHtml = retryHtml;
        agenticResult = retryResult;
        console.log(`  Scene ${opts.sceneIndex + 1}: corrective retry fixed the structural defect(s) ✓`);
      } else {
        console.warn(`  Scene ${opts.sceneIndex + 1}: retry still defective (components ok: ${retryCompsOk}, footage ok: ${retryFootageOk}, scripts ok: ${retryScriptsOk}) -- shipping first version`);
      }
    } catch (e: any) {
      console.warn(`  Scene ${opts.sceneIndex + 1}: component-enforcement retry failed (${e?.message || e}) -- shipping first version`);
    }
  }

  var customSources = new Map<string, string>();
  customSources.set(compName, sceneHtml);

  var transition: SceneTransition | undefined;
  if (draft.transition_in && draft.transition_in.type !== "none") {
    transition = {
      type: draft.transition_in.type as SceneTransition["type"],
      duration_seconds: draft.transition_in.duration_seconds || 0.5,
    };
  }

  var scene: Scene = {
    id: sceneId,
    label: draft.label,
    duration_seconds: draft.duration_seconds || 5,
    transition_in: transition,
    beats: Array.isArray(draft.beats) && draft.beats.length >= 2 ? draft.beats : undefined,
    camera_moves: (draft as any).camera_moves?.length ? (draft as any).camera_moves : undefined,
    components: [{
      id: "comp_0",
      type: compName,
      data: {},
      z_index: 10,
    }],
  };

  return { scene, customSources, codegenSession: agenticResult.session };
}

function buildBrandContext(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Kit"];
  if (brandKit.colors) {
    lines.push("Colors (use CSS custom properties var(--mp-color-*) in your CSS):");
    for (var [key, val] of Object.entries(brandKit.colors)) {
      lines.push(`  --mp-color-${key.replace(/_/g, "-")}: ${val}`);
    }
  }
  if (brandKit.fonts?.length) {
    lines.push("Fonts:");
    for (var f of brandKit.fonts) {
      lines.push(`  ${f.family} (weights: ${f.weights?.join(", ") || "400, 700"})`);
    }
  }
  if (brandKit.style) {
    lines.push(`Border radius: ${brandKit.style.border_radius || "12px"}`);
    lines.push(`Motion: ${brandKit.style.motion || "cinematic"}`);
  }
  return lines.join("\n");
}

// ── Unified Codegen Spec Builder ──

/**
 * Build a rich codegen spec from any draft scene type.
 * Converts template, library component, sequence, or custom scene
 * notes into a spec the agentic codegen generator can use
 * with <component> tags.
 */
export async function buildCodegenSpec(draft: any, world?: import("./world.js").WorldSpec): Promise<string> {
  var parts: string[] = [];

  parts.push(`Scene: "${draft.label}"`);
  // What this scene must communicate (its job in the story).
  const purpose = draft.purpose;
  if (purpose) parts.push(`Purpose: ${purpose}`);
  parts.push(`Duration: ${draft.duration_seconds || 5} seconds`);

  // Visual direction from the storyboard -- how this scene should look and move.
  const visualDirection = draft.visual_notes || draft.purpose;
  if (visualDirection) {
    parts.push(`\nVisual Direction:\n${visualDirection}`);
  }

  // Tactical element inventory: the set list. The visual notes carry the
  // mood; this carries the EXACT elements + copy the scene must contain --
  // the antidote to abstract notes getting half-invented as empty skeletons.
  if (Array.isArray(draft.elements) && draft.elements.length > 0) {
    parts.push(`\nElement Inventory -- render EVERY element below, with EXACTLY this content (do not invent different copy, do not leave any as an empty shell):`);
    for (const elm of draft.elements) {
      if (!elm || !elm.content) continue;
      parts.push(`  - [${elm.kind || "element"}] ${elm.name || "unnamed"}: "${elm.content}"${elm.motion ? ` -- motion: ${elm.motion}` : ""}`);
    }
  }

  // Beat sheet: the scene's internal timeline (continuous-take scenes). The
  // visual notes describe the WORLD; the beats are the shot clock of what
  // HAPPENS in it. Rendered as explicit time segments the master timeline
  // must follow (with tl.addLabel at each beat start).
  if (Array.isArray(draft.beats) && draft.beats.length >= 2) {
    parts.push(`\n${formatBeatSheet(draft.beats)}`);
  }

  // Component hints: look up schemas from catalog and include them
  if (draft.components?.length > 0) {
    var componentTypes: string[] = draft.components.map((c: any) => (typeof c === "string" ? c : c.type));
    var authoredComps = (draft.components as any[]).filter((c: any) => c && typeof c === "object" && c.data);
    parts.push(`\nUse these library components via <component> tags:`);
    for (var compType of componentTypes) {
      parts.push(`  - <component type="${compType}" />`);
    }

    // Storyboard-authored component data: the storyboard already wrote the
    // full data payload -- including timed data.script performances on
    // performable surfaces. That data is the scene's choreography; embed it
    // VERBATIM (layout/position is yours; the content and script are not).
    if (authoredComps.length > 0) {
      parts.push(`\n## Storyboard-Authored Component Data (embed VERBATIM)`);
      parts.push(`The storyboard authored these components' full data payloads. Embed each with this exact data (you own position/size/staging around it; do NOT rewrite, trim, or drop the data -- especially "script" arrays, which are the on-screen performance). Apostrophes are pre-escaped as \\u0027 so the JSON survives the single-quoted data attribute -- keep them escaped exactly as given:`);
      for (var ac of authoredComps) {
        // A raw apostrophe inside data='...' ends the HTML attribute early:
        // the component silently binds {} and renders an empty shell. '
        // is attribute-safe and JSON.parse restores the apostrophe.
        parts.push(`<component type="${ac.type}" data='${JSON.stringify(ac.data).replace(/'/g, "\\u0027")}' />`);
      }
    }

    // Look up component schemas from the catalog so the LLM has them upfront
    try {
      var catalog = await buildComponentCatalog(config.componentLibDir);
      var catalogMap = new Map<string, ComponentCatalogEntry>();
      for (var entry of catalog) {
        catalogMap.set(entry.type, entry);
      }

      var schemasFound: string[] = [];
      for (var ct of componentTypes) {
        var catalogEntry = catalogMap.get(ct);
        if (catalogEntry && catalogEntry.data && Object.keys(catalogEntry.data).length > 0) {
          var schemaLines: string[] = [];
          schemaLines.push(`### ${ct}`);
          if (catalogEntry.description) schemaLines.push(catalogEntry.description);
          schemaLines.push(`Embed: <component type="${ct}" data='{...}' />`);
          schemaLines.push("Data fields:");
          for (var [fieldName, field] of Object.entries(catalogEntry.data)) {
            var reqStr = field.required ? " (required)" : " (optional)";
            var typeStr = field.type;
            if (field.items) typeStr += `<${field.items.type}>`;
            var extra = "";
            if ((field as any).placeholder) extra += ` e.g. "${(field as any).placeholder}"`;
            if ((field as any).default !== undefined) extra += ` default: ${JSON.stringify((field as any).default)}`;
            if ((field as any).enum) extra += ` values: ${(field as any).enum.join(", ")}`;
            schemaLines.push(`  - ${fieldName}: ${typeStr}${reqStr}${extra}`);

            // Include nested object properties for array items
            if (field.items && (field.items as any).properties) {
              for (var [propName, prop] of Object.entries((field.items as any).properties)) {
                var p = prop as any;
                var propReq = p.required ? " (required)" : "";
                var propEnum = p.enum ? ` values: ${p.enum.join(", ")}` : "";
                schemaLines.push(`      - ${propName}: ${p.type}${propReq}${propEnum}`);
              }
            }
          }
          // Performable surfaces: the script-action vocabulary is the whole
          // point of these components. Omitting it here is why generated
          // scenes shipped mocks frozen at their end state -- the codegen
          // never saw that the surface could perform.
          var sa = (catalogEntry as any).script_actions as Array<{ action: string; description: string; params?: Record<string, string> }> | undefined;
          if (sa && sa.length > 0) {
            schemaLines.push(`  🎬 PERFORMABLE -- this surface plays a timed script. Its data MUST include script: [{action, at, ...params}] so it performs on screen; staging it with only static end-state data (progress complete, tool calls already green) is a blocking defect. Actions:`);
            for (var act of sa) {
              var paramStr = act.params ? ` params: ${Object.entries(act.params).map(([k, v]) => `${k} (${v})`).join(", ")}` : "";
              schemaLines.push(`    - ${act.action}: ${act.description}${paramStr}`);
            }
          }
          schemasFound.push(schemaLines.join("\n"));
        }
      }

      if (schemasFound.length > 0) {
        parts.push(`\n## Component Schemas\n\n${schemasFound.join("\n\n")}`);
      }
    } catch (e: any) {
      console.warn("  [buildCodegenSpec] Failed to load catalog for schemas:", e.message);
    }
  }

  // Voiceover hint
  if (draft.voiceover_text) {
    parts.push(`\nVoiceover: "${draft.voiceover_text}"`);
    parts.push(`Time the visual reveals to match the narration pacing.`);
  }

  // The film's WORLD (SPEC-world.md): codegen scenes author their own page,
  // so they receive the contract as constraints -- theme is not a choice.
  if (world) {
    const { worldPromptBlock } = await import("./world.js");
    parts.push(`\n${worldPromptBlock(world)}`);
    parts.push(`Your page background MUST be the world's ${world.theme} base (${world.theme === "light" ? "#fafaf8 or the brand background" : "the dark brand base"}); build atmosphere with the world palette, never by inverting the theme.`);
  }

  return parts.join("\n");
}

// ── Helpers ──

function stripHtmlFences(raw: string): string {
  var trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    var firstNewline = trimmed.indexOf('\n');
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf('```');
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }
  return repairTruncatedComponent(trimmed);
}

/**
 * Repair components truncated by LLM max token limits.
 * Detects missing closing tags and appends minimal valid closers.
 */
function repairTruncatedComponent(html: string): string {
  const hasTemplate = /<template[^>]*>/i.test(html);
  const hasTemplateClose = /<\/template>/i.test(html);
  const hasStyle = /<style[^>]*>/i.test(html);
  const hasStyleClose = /<\/style>/i.test(html);
  const hasScript = /<script[^>]*>/i.test(html);
  const hasScriptClose = /<\/script>/i.test(html);

  let repaired = false;

  // If we have opening tags but missing closers, the LLM was truncated
  if (hasStyle && !hasStyleClose) {
    // Truncated in <style> - close it and add remaining sections
    html += "\n}\n</style>";
    repaired = true;
  }

  if (hasScript && !hasScriptClose) {
    // Truncated in <script> - close the function and tag
    // Try to close any open braces
    const openBraces = (html.match(/\{/g) || []).length;
    const closeBraces = (html.match(/\}/g) || []).length;
    const unclosed = openBraces - closeBraces;
    if (unclosed > 0) {
      html += "\n" + "}\n".repeat(unclosed);
    }
    html += "\n</script>";
    repaired = true;
  }

  if (hasTemplate && !hasTemplateClose) {
    // Truncated in <template> - close open divs and template
    const openDivs = (html.match(/<div[^>]*>/gi) || []).length;
    const closeDivs = (html.match(/<\/div>/gi) || []).length;
    const unclosedDivs = openDivs - closeDivs;
    if (unclosedDivs > 0) {
      html += "\n" + "</div>\n".repeat(unclosedDivs);
    }
    html += "\n</template>";
    repaired = true;
  }

  // If missing entire sections, add stubs
  if (!hasTemplate) {
    html = "<template><div class=\"scene\"></div></template>\n" + html;
    repaired = true;
  }
  if (!hasScript) {
    html += "\n<script>\nfunction createTimeline(el, data, ctx) { return gsap.timeline(); }\n</script>";
    repaired = true;
  }

  if (repaired) {
    console.warn("  Warning: repaired truncated component (LLM hit max tokens)");
  }

  return html;
}
