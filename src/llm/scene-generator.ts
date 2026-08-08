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
import type { DraftScene } from "./storyboard-builder.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage, Scene, SceneTransition } from "../core/types.js";
import { formatBeatSheet } from "../core/beats.js";
import type { Treatment } from "./creative-director.js";
import { loadAssetIntel } from "../core/asset-intel.js";
import { recoverAssetUrl, resolveVideoPath } from "../core/video-path.js";
import { hexIsLight } from "./world.js";

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
 * Generate a single scene with mixed library, custom, or template components.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var draft = opts.scene;
  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;

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
    // in a sibling screencast-frame stamped with the known-good speaker-screencast
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
        stComponents.push({
          id: "tpl_video",
          type: "screencast-frame",
          z_index: 20,
          position: { x: "0%", y: "0%", width: "100%", height: "100%" },
          data: {
            video_url: ssSrc,
            frame_style: "none",
            crop: "auto",
            shadow: false,
            corner_radius: (stData as any).corner_radius !== undefined ? Number((stData as any).corner_radius) : 30,
            max_width_pct: (stData as any).max_width_pct !== undefined ? Number((stData as any).max_width_pct) : 88,
            pip_source: ssPipSource,
            pip_shape: "circle",
            pip_size: (stData as any).pip_size !== undefined ? Number((stData as any).pip_size) : 15,
            pip_position: (stData as any).pip_position || "bottom-right",
            pip_start_at: (stData as any).pip_start_at !== undefined ? Number((stData as any).pip_start_at) : undefined,
          },
        });
        stSpeakerOpaque = true; // full-frame screencast covers the speaker base
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
/** Full-stage overlays: performers that cover the whole composition. */
var STAGE_OVERLAY_TYPES = ["cursor-performer"];
/** Ambient full-stage text overlays that ride ABOVE the windows (their own
 *  markup scatters; the box is the whole stage). */
var HIGH_OVERLAY_TYPES = ["floating-pills"];
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
function authoredLayout(authored: Array<{ type: string }>, hasWorld: boolean, vertical = false, speaker = false, takeover = false): LayoutSlot[] {
  var slots: LayoutSlot[] = authored.map(() => null);
  var accentCount = 0;
  var surfaceIdx: number[] = [];
  var captionIdx: number[] = [];
  var heroIdx: number[] = [];
  authored.forEach((c, i) => {
    var t = c.type;
    if (STAGE_OVERLAY_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: { ...FULL_STAGE }, z_index: 45 };
    } else if (ACCENT_TYPES.indexOf(t) !== -1) {
      slots[i] = { position: ACCENT_SPOTS[Math.min(accentCount, ACCENT_SPOTS.length - 1)], z_index: 40 + accentCount };
      accentCount++;
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
    var dockSurf = surfaceIdx.filter((i) => !slots[i]);
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
  // live in. The social-reel contract's closed vocabulary, deterministic:
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
    slots[unplacedSurfaces[0]] = hasEditorial
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
    if (surfaceIdx.length === 1 && unplacedSurfaces.length === 1) {
      // One docked window -> right column, stacked.
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
  var types = authored.map((c) => c.type);
  // A speaker film's camera recording is the base layer: no world backdrop
  // (an opaque full-bleed component paints over the render's transparent
  // page and buries the speaker -- measured live: proj_11bcf413), and the
  // dock layout keeps content beside her.
  var speakerBase = !!opts.hasSpeakerTrack;
  // A takeover scene is one the storyboard/pipeline marked opaque: it
  // REPLACES the speaker rather than sitting beside her.
  var isTakeover = speakerBase && (draft as any).transparent_background === false;
  var slots = authoredLayout(authored, !!opts.world, opts.canvas.height > opts.canvas.width, speakerBase, isTakeover);
  // The dark cinematic world under every mock window, matching the film's
  // template scenes (and the hand-built originals).
  // The film's ONE world under every scene (SPEC-world.md). The per-scene
  // seed (5 + sceneIndex * 7) was the deck-of-posters bug: a fresh world at
  // every cut. With a world: same component, same seed, clock offset to
  // film time so the drift continues across the cut.
  var w = opts.world;
  var components: any[] = speakerBase ? [] : [w ? {
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
  } : {
    id: "bg",
    type: "webgl-backdrop",
    z_index: 1,
    position: { x: 0, y: 0, width: "100%", height: "100%" },
    data: { seed: 5 + opts.sceneIndex * 7 },
  }];
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
    components.push({
      id, type: c.type, data, position: lay.position, z_index: lay.z_index,
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
  var scene: Scene = {
    id: sceneId,
    label: draft.label,
    duration_seconds: draft.duration_seconds || 8,
    transition_in: acTransition,
    background: w ? (w.theme === "light" ? "#fafaf8" : "#0c0d12") : "#0c0d12",
    beats: Array.isArray(draft.beats) && draft.beats.length >= 2 ? (draft.beats as any) : undefined,
    camera_moves: (draft as any).camera_moves?.length ? (draft as any).camera_moves : undefined,
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
