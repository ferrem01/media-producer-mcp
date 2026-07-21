/**
 * Scene Assembler
 *
 * Takes a Scene definition and its resolved components, and produces
 * a self-contained HTML document ready for Playwright capture.
 *
 * The assembled HTML includes:
 * - Brand kit as CSS custom properties
 * - All component HTML (positioned, layered by z-index)
 * - All component styles (scoped per instance)
 * - GSAP loaded from local file
 * - All component scripts assembled into a master timeline
 * - window.__MP_TIMELINE and window.__MP_READY for the capture loop
 */

import { normalizeHtmlUrls } from "./normalize-urls.js";
import { resolveComponentTags, buildComponentTimelineScript, buildLogoDevUrl } from "./component-tags.js";
import { parseComponent, bindTemplate, scopeCSS, type ParsedComponent } from "./component-parser.js";
import type { Scene, SceneBeat, SceneComponent, BrandKit, Canvas } from "./types.js";
import { beatTimeline } from "./beats.js";
import { resolveAutoCropData, resolveScreencastAutoCrops } from "./asset-intel.js";
import { resolveBrandKitFonts } from "./font-resolve.js";
import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

/** Bake the logo.dev URL for a DIRECT logo component (scene.components[]).
 *  The codegen <component> path bakes __logoUrl in resolveComponentTags;
 *  the direct path skipped it, so hand-authored/template-sibling logo
 *  components rendered an img with no src -- an invisible logo. */
export function bakeDirectLogoData(comp: { type: string; data: Record<string, unknown> }): Record<string, unknown> {
  if (comp.type !== "logo") return comp.data;
  const ld: Record<string, any> = { ...(comp.data || {}) };
  const isProminent = ld.prominent === true || ld.prominent === "true";
  ld.size = Number(ld.size) || 128;
  if (isProminent) ld.size = Math.max(ld.size, 480);
  ld.__logoUrl = buildLogoDevUrl(ld, config.logoDevToken);
  ld.__prominentClass = isProminent ? "prominent" : "";
  return ld;
}

/** Component types that are scene BACKDROPS: they stay outside the camera
 *  rig (the camera moves the subject, not the world) and are skipped by
 *  wrapper choreography defaults. */
export const BACKDROP_TYPES = new Set([
  "webgl-backdrop", "gradient-background", "mesh-gradient", "liquid-background",
  "depth-blur", "particle-field",
]);

export interface ComponentSource {
  /** Component type name */
  type: string;
  /** Raw .component.html source */
  source: string;
}

export interface AssembleOptions {
  scene: Scene;
  components: ComponentSource[];
  brandKit: BrandKit;
  canvas: Canvas;
  /** Path to GSAP files directory */
  gsapDir: string;
  /** Path to the three.js vendor bundle dir (defaults to config.threeDir) */
  threeDir?: string;
  /** When true, keep /assets/ HTTP paths instead of converting to file:// (for preview SPA) */
  preview?: boolean;
  /** HTTP URL for the speaker video (used in preview to resolve "speaker" references) */
  speakerUrl?: string;
  /** Seconds into the speaker video where this scene starts (preview underlay sync). */
  speakerOffset?: number;
}

/** Component type prefixes that indicate an LLM-generated (codegen) scene. */
const CODEGEN_TYPE_PREFIXES = ["scene_", "freeform_", "custom_", "template_"];

export interface AssembleSceneAutoOptions extends AssembleOptions {
  /** Component library dir, used to resolve <component> tags in codegen scenes. */
  componentLibDir: string;
}

/**
 * Load every library component (.component.html) so <component> tags inside a
 * codegen scene can be resolved. Skips the shared/ utilities dir.
 */
export async function loadLibraryComponentSources(componentLibDir: string): Promise<ComponentSource[]> {
  const out: ComponentSource[] = [];
  try {
    const cats = await fs.readdir(componentLibDir, { withFileTypes: true });
    for (const cat of cats) {
      if (!cat.isDirectory() || cat.name === "shared") continue;
      const files = await fs.readdir(path.join(componentLibDir, cat.name));
      for (const file of files) {
        if (!file.endsWith(".component.html")) continue;
        const type = file.replace(".component.html", "");
        const source = await fs.readFile(path.join(componentLibDir, cat.name, file), "utf-8");
        out.push({ type, source });
      }
    }
  } catch (e: any) {
    console.warn(`Failed to load library components from ${componentLibDir}: ${e.message}`);
  }
  return out;
}

/**
 * Single entry point for assembling a scene to HTML.
 *
 * Detects whether the scene is an LLM-generated codegen scene -- a
 * scene_/freeform_/custom_/template_ component whose source embeds <component>
 * tags -- and, if so, loads the full component library and routes through
 * assembleCodegenScene so nested library components resolve. Otherwise it uses
 * the standard assembleScene path.
 *
 * This replaces three near-identical copies of this routing (render.ts,
 * scene-worker.ts, pipeline.ts) that had drifted: the image/deck/gif/social
 * path did not load the library, so nested library components were silently
 * dropped from those formats.
 */
export async function assembleSceneAuto(options: AssembleSceneAutoOptions): Promise<string> {
  const { scene, components, brandKit, canvas, gsapDir, componentLibDir, preview, speakerUrl } = options;

  const codegenComp = (scene.components || []).find((c) =>
    CODEGEN_TYPE_PREFIXES.some((p) => c.type.startsWith(p)),
  );
  const codegenSource = codegenComp
    ? components.find((cs) => cs.type === codegenComp.type)
    : undefined;

  if (codegenComp && codegenSource && codegenSource.source.includes("<component ")) {
    const libSources = await loadLibraryComponentSources(componentLibDir);
    return assembleCodegenScene({
      sceneSource: codegenSource.source,
      componentSources: [...libSources, ...components.filter((cs) => cs.type !== codegenComp.type)],
      brandKit,
      canvas,
      duration: scene.duration_seconds || 5,
      sceneId: scene.id,
      beats: scene.beats,
      gsapDir,
      background: scene.background,
      transparentBackground: scene.transparent_background,
      preview,
      speakerUrl,
      speakerOffset: options.speakerOffset,
      cameraMoves: scene.camera_moves,
      mediaEdits: scene.media_edits,
    });
  }

  return assembleScene({ scene, components, brandKit, canvas, gsapDir: options.gsapDir, preview, speakerUrl, speakerOffset: options.speakerOffset });
}

/**
 * Assemble a scene into a self-contained HTML document.
 */
export async function assembleScene(options: AssembleOptions): Promise<string> {
  const { scene, components, canvas, preview, speakerUrl } = options;
  // Resolve brand fonts FIRST so the font links and --mp-font-family agree
  // on a family that actually exists (see font-resolve.ts).
  const brandKit = await resolveBrandKitFonts(options.brandKit);

  // Build a lookup of component sources by type
  const sourceMap = new Map<string, ParsedComponent>();
  for (const cs of components) {
    sourceMap.set(cs.type, parseComponent(cs.source));
  }

  // Generate brand kit CSS variables
  const { css: brandCSS, theme: sceneTheme, hasBgImage } = generateBrandCSS(brandKit, scene.background, preview);

  // Determine if scene should use transparent background (for full-behind speaker overlay)
  const isTransparent = scene.transparent_background === true;

  // Process each scene component
  const componentBlocks: string[] = [];
  const componentStyles: string[] = [];
  const componentScripts: string[] = [];

  for (const comp of scene.components) {
    const parsed = sourceMap.get(comp.type);
    if (!parsed) {
      console.warn(`Component type "${comp.type}" not found, skipping`);
      continue;
    }

    // Bind data to template
    // Resolve relative asset URLs to absolute for file:// protocol
    const preData0 = comp.type === "screencast-frame" ? await resolveAutoCropData(comp.data) : bakeDirectLogoData(comp);
    // Option-A backstop: a PiP pointing at the speaker clip by URL becomes the
    // "speaker" token regardless of how it was authored (generate, hand-edit,
    // or a client that skipped the update-tool guardrail) -- so preview dedups
    // and render sync-binds it. Keyed on speakerUrl (the resolved speaker clip).
    const preData = speakerUrl ? normalizeSpeakerPipRefs(preData0, speakerUrl).data : preData0;
    const resolvedData = resolveAssetUrls(preData, preview, speakerUrl);
    let boundHtml = bindTemplate(parsed.template, resolvedData);

    // Codegen scenes without <component> tags route through here -- resolve
    // any raw <video src="speaker"> tags the model wrote (PiP contract).
    if (speakerUrl) {
      boundHtml = resolveSpeakerVideoTags(boundHtml, speakerUrl, options.speakerOffset || 0);
    }

    // Position the component
    const posStyle = buildPositionStyle(comp);

    // Wrap in container div. Backdrop components are stamped so the camera
    // rig leaves them OUTSIDE: backgrounds do not ride the camera -- zooming
    // must not drag the world and expose the canvas edge (SPEC-motion).
    const isBackdrop = BACKDROP_TYPES.has(comp.type);
    componentBlocks.push(
      `  <!-- Component: ${comp.type} (${comp.id}) -->\n` +
      `  <div class="mp-component" data-cid="${comp.id}"${isBackdrop ? ' data-mp-backdrop="1"' : ""} style="${posStyle}">\n` +
      `    ${boundHtml}\n` +
      `  </div>`
    );

    // Scope and collect styles
    if (parsed.style) {
      componentStyles.push(
        `/* ${comp.type} (${comp.id}) */\n${scopeCSS(parsed.style, comp.id)}`
      );
    }

    // Collect scripts for master timeline assembly
    componentScripts.push(buildComponentScript({ ...comp, data: resolvedData }, parsed.script, scene.duration_seconds, canvas, {
      motion: brandKit.style?.motion || "cinematic",
    }));
  }

  // Read GSAP source (bundled locally)
  const gsapSource = await loadGsapSource(options.gsapDir);

  // three.js is heavy (~660KB) -- only inline it when a component actually uses
  // it (references the global THREE).
  const usesThree = componentScripts.some((s) => s.includes("THREE"));
  const threeSource = usesThree ? await loadThreeSource(options.threeDir || config.threeDir) : "";

  // Read shared script utilities
  const sharedSource = await loadSharedUtilities();

  // Assemble final HTML
  const html = `<!DOCTYPE html>
<html data-theme="${sceneTheme}">
<head>
<meta charset="utf-8">
${generateFontLinks(brandKit)}
<style>
/* ── Brand Kit ── */
${brandCSS}

${hasBgImage ? `
/* ── Brand background image: reduce gradient overlay opacity ── */
.bg-gradient {
  opacity: 0.65 !important;
}
` : ''}

/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${canvas.width}px;
  height: ${canvas.height}px;
  overflow: hidden;
  clip-path: inset(0);
  background: ${isTransparent ? 'transparent' : `var(--mp-color-background, ${scene.background || canvas.background || "#000000"})`};
}

/* ── Component containers ── */
.mp-component {
  position: absolute;
  overflow: hidden;
}

/* ── Ambient visual layer (continuous flow between scenes) ── */
.mp-ambient {
  position: absolute;
  inset: -50px;
  width: calc(100% + 100px);
  height: calc(100% + 100px);
  z-index: 1;
  pointer-events: none;
  opacity: 0.12;
  background:
    radial-gradient(2px 2px at 20% 30%, var(--mp-color-primary, #6366f1), transparent),
    radial-gradient(2px 2px at 40% 70%, var(--mp-color-accent, #10b981), transparent),
    radial-gradient(1.5px 1.5px at 60% 20%, var(--mp-color-primary, #6366f1), transparent),
    radial-gradient(1.5px 1.5px at 80% 60%, var(--mp-color-accent, #10b981), transparent),
    radial-gradient(1px 1px at 10% 80%, var(--mp-color-secondary, #8b5cf6), transparent),
    radial-gradient(1px 1px at 90% 40%, var(--mp-color-secondary, #8b5cf6), transparent),
    radial-gradient(2.5px 2.5px at 50% 50%, var(--mp-color-primary, #6366f1), transparent);
  background-size: 100% 100%;
  animation: mp-ambient-drift 8s ease-in-out infinite alternate;
}
@keyframes mp-ambient-drift {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-15px, 10px) scale(1.02); }
  100% { transform: translate(10px, -15px) scale(1.01); }
}

/* ── Safety defaults ── */
.mp-component * {
  max-width: 100%;
  box-sizing: border-box;
}

img, video {
  max-width: 100%;
  height: auto;
}

/* ── Component Styles ── */
${componentStyles.join("\n\n")}
</style>
${threeSource ? `<!-- three.js (bundled: three + addons, global THREE). MUST be its own\n     <script>: the bundle opens with "use strict", and concatenating it with the\n     GSAP block below would make that block strict too -- a GSAP plugin's UMD\n     shim assigns the getter-only window.window (a silent no-op in sloppy mode),\n     which throws in strict mode and would abort gsap + the whole scene. -->\n<script>\n${threeSource}\n</script>\n` : ""}<script>
${gsapSource}

${sharedSource}

// Register GSAP plugins
if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);
if (typeof CustomEase !== 'undefined') gsap.registerPlugin(CustomEase);
if (typeof CustomBounce !== 'undefined') gsap.registerPlugin(CustomBounce);
if (typeof CustomWiggle !== 'undefined') gsap.registerPlugin(CustomWiggle);
if (typeof ExpoScaleEase !== 'undefined') gsap.registerPlugin(ExpoScaleEase);
if (typeof RoughEase !== 'undefined') gsap.registerPlugin(RoughEase);
if (typeof SlowMo !== 'undefined') gsap.registerPlugin(SlowMo);
if (typeof MorphSVGPlugin !== 'undefined') gsap.registerPlugin(MorphSVGPlugin);
if (typeof DrawSVGPlugin !== 'undefined') gsap.registerPlugin(DrawSVGPlugin);
if (typeof ScrambleTextPlugin !== 'undefined') gsap.registerPlugin(ScrambleTextPlugin);
</script>
</head>
<body>
${preview && speakerUrl && isTransparent ? speakerUnderlayHtml(speakerUrl, options.speakerOffset || 0) : ""}${(scene.media_edits && Object.keys(scene.media_edits).length ? `<script>${mediaEdlScript(scene.media_edits, "document.body")}</script><script>${timelapseClockScript(scene.media_edits, canvas, "document.body", "window.__MP_TIMELINE", scene.duration_seconds)}</script>` : "")}${(scene.camera_moves && scene.camera_moves.length ? `<script>${cameraMovesScript(scene.camera_moves, canvas, "document.body", "window.__MP_TIMELINE")}</script>` : "")}
<div class="mp-camera" style="position:absolute;inset:-20px;width:calc(100% + 40px);height:calc(100% + 40px);will-change:transform;">
${isTransparent ? '' : '<div class="mp-ambient"></div>'}
${isTransparent ? '' : hasBgImage ? '<div class="mp-page-bg" style="position:absolute;inset:0;z-index:0;background:var(--mp-bg-image,none);background-size:cover;background-position:center;"></div>' : ''}
${buildContentRegionWrapper(scene, componentBlocks)}
</div>

<script>
(function() {
  const master = gsap.timeline({ paused: true });
  window.__MP_LOGODEV_TOKEN = ${JSON.stringify(config.logoDevToken)};

  // ── Camera motion: subtle Ken Burns zoom + drift ──
  var cameraEl = document.querySelector('.mp-camera');
  if (cameraEl) {
    var camDur = ${scene.duration_seconds};
    // Seed drift direction from scene id for per-scene variety
    var seed = '${scene.id || "s"}'.split('').reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
    var driftX = (seed % 2 === 0 ? 1 : -1) * (4 + (seed % 6));
    var driftY = (seed % 3 === 0 ? 1 : -1) * (3 + (seed % 5));
    master.to(cameraEl, {
      scale: 1.03,
      x: driftX,
      y: driftY,
      duration: camDur,
      ease: 'none',
    }, 0);
  }

${componentScripts.join("\n\n")}
${wrapperChoreoScript(scene.components, scene.duration_seconds)}
  // Fold any orphan animations the components created (loose gsap.to/from not
  // added to the master) ONTO the master, so the renderer -- which seeks the
  // master deterministically -- captures them frame-accurately instead of
  // letting them free-run and jitter between frames. (The Studio preview is
  // unaffected: it plays the composite document, not this per-scene one.)
  try {
    gsap.globalTimeline.getChildren(false, true, true).forEach(function (a) {
      if (a !== master && a.parent === gsap.globalTimeline) {
        master.add(a, a.startTime());
      }
    });
  } catch (e) {}

  // Expose for Playwright capture
  window.__MP_TIMELINE = master;
  window.__MP_DURATION = ${scene.duration_seconds};
  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  const resolved = resolveHtmlAssetUrls(normalizeHtmlUrls(html), preview);
  // Preview surfaces must not eagerly decode scene videos (mobile tab-kill).
  return preview ? stripEagerVideoLoading(resolved) : resolved;
}

/**
 * Preview media discipline: strip `autoplay` and force `preload="metadata"`
 * on every scene <video> so opening Studio decodes NOTHING until the user
 * presses Play (syncMedia drives play/pause/seek for composite videos).
 * A 4-scene speaker film otherwise spins up 5+ eager 1080p decoders on
 * load -- survivable on desktop, a tab-kill on mobile. The camera underlay
 * (#__mp_speaker_base) is exempt: it is the lone camera in single-scene
 * previews and manages its own playback.
 */
export function stripEagerVideoLoading(html: string): string {
  return html.replace(/<video\b[^>]*>/gi, (tag) => {
    if (tag.includes("__mp_speaker_base")) return tag;
    let out = tag.replace(/\s(?:autoplay)(?:\s*=\s*["'][^"']*["'])?(?=[\s>])/gi, "");
    if (/\bpreload\s*=/i.test(out)) out = out.replace(/\bpreload\s*=\s*["'][^"']*["']/i, 'preload="metadata"');
    else out = out.replace(/^<video\b/i, '<video preload="metadata"');
    // Scene videos never own the audio (the speaker/voiceover track does) and
    // an UNMUTED video inside the preview iframe is refused play() by the
    // autoplay policy -- user activation on the parent page does not extend
    // into the frame. Force muted + playsinline so playback always starts.
    if (!/\bmuted\b/i.test(out)) out = out.replace(/^<video\b/i, "<video muted");
    if (!/\bplaysinline\b/i.test(out)) out = out.replace(/^<video\b/i, "<video playsinline");
    return out;
  });
}


/**
 * Generate the runtime JS that applies a scene's camera_moves: wraps the
 * container's content in a transform rig and adds tweens to the scene
 * timeline. Pure data -> deterministic GSAP; fixed center origin with
 * computed translate (origin jumps mid-tween cause visible pops).
 * The focal-point math: with origin at center, scaling by s maps a point at
 * offset d from center to d*s; translating by (0.5 - p) * size * s brings
 * point p to frame center.
 */
/**
 * Stamp each edited media element with its source-map as a data-mp-edl
 * attribute, resolved at runtime with the SAME target grammar as camera
 * rigs ("screencast" = largest non-speaker video; anything else = a CSS
 * selector, typically video[src*="file.mp4"]). Every consumer -- the
 * render/capture frame swappers and the Studio preview's sync loop --
 * reads the attribute, so target resolution happens exactly once.
 */
export function mediaEdlScript(
  mediaEdits: Record<string, import("./types.js").MediaEdit>,
  containerExpr: string,
): string {
  const editsJson = JSON.stringify(mediaEdits);
  return `
(function() {
  var edits = ${editsJson};
  var keys = Object.keys(edits || {});
  if (!keys.length) return;
  function largestVideo(root) {
    var best = null, bestA = 0;
    Array.prototype.slice.call(root.querySelectorAll('video')).forEach(function(v) {
      if (v.id === '__mp_speaker_base') return;
      if (/speaker/i.test(v.currentSrc || v.src || '')) return;
      var r = v.getBoundingClientRect();
      if (r.width * r.height > bestA) { bestA = r.width * r.height; best = v; }
    });
    return best;
  }
  var exact = keys.filter(function(k) { return k !== 'screencast'; });
  var tries = 0;
  (function tick() {
    // Keep retrying until every key found its element: this script can run
    // before the video tags are even parsed (single-scene documents inject
    // it early; the composite runs it at the end).
    var root = ${containerExpr};
    var missing = false;
    if (!root) {
      missing = true;
    } else {
      // File-specific selector keys stamp first and always win. The legacy
      // semantic 'screencast' key only fills a video no exact key claimed --
      // a stale 'screencast' entry must never shadow an edit saved for a
      // specific file (the lane shows one map, playback runs another).
      exact.forEach(function(k) {
        var edit = edits[k];
        if (!edit || !edit.segments || !edit.segments.length) return;
        var v = null;
        try { v = root.querySelector(k); } catch (e) {}
        if (v) v.setAttribute('data-mp-edl', JSON.stringify(edit.segments));
        else missing = true;
      });
      var legacy = edits['screencast'];
      if (legacy && legacy.segments && legacy.segments.length) {
        var lv = largestVideo(root);
        if (!lv) missing = true;
        else if (!lv.hasAttribute('data-mp-edl')) lv.setAttribute('data-mp-edl', JSON.stringify(legacy.segments));
      }
    }
    if (missing && tries++ < 300) requestAnimationFrame(tick);
    else if (missing) { try { console.warn('[edl] media-edit target(s) never matched an element:', keys.join(', ')); } catch (e2) {} }
  })();
})();
`;
}

/**
 * Elapsed-time clock for timelapse beats: while playback sits inside a tl
 * segment past the 8x sampling threshold, a small pill ("⏱ +2:47 · ⏩14×")
 * says how much real time is flying by -- the honest-storytelling half of
 * the timelapse effect. Driven by a zero-ease proxy tween ON THE SCENE
 * TIMELINE (not rAF wall-clock), so it renders identically under the
 * capture loop's .time(t) seeks and the Studio preview's playback.
 */
export function timelapseClockScript(
  mediaEdits: Record<string, import("./types.js").MediaEdit>,
  canvas: { width: number; height: number },
  containerExpr: string,
  timelineExpr: string,
  sceneDuration: number,
): string {
  const windows: { a: number; b: number; r: number }[] = [];
  for (const key of Object.keys(mediaEdits || {})) {
    const segs = (mediaEdits[key]?.segments || []) as any[];
    let acc = 0;
    for (const s of segs) {
      const holdS = typeof s.hold === "number" && s.hold > 0 ? s.hold : 0;
      let rate = Math.max(0.1, s.rate || 1);
      if (!s.tl) rate = Math.min(16, rate);
      const outDur = holdS || (s.src_end - s.src_start) / rate;
      if (s.tl && !holdS && rate > 8 && outDur > 0.2 &&
          !windows.some((w) => Math.abs(w.a - acc) < 0.2)) {
        windows.push({
          a: Math.round(acc * 1000) / 1000,
          b: Math.round((acc + outDur) * 1000) / 1000,
          r: Math.round(rate * 10) / 10,
        });
      }
      acc += outDur;
    }
  }
  if (!windows.length) return "";
  const fs = Math.max(14, Math.round(canvas.height * 0.024));
  const top = Math.round(canvas.height * 0.037);
  const right = Math.round(canvas.width * 0.03);
  return `
(function() {
  var W = ${JSON.stringify(windows)};
  var DUR = ${sceneDuration};
  var chip = null, lastTxt = '';
  function ensureChip(root) {
    if (chip && chip.parentNode) return chip;
    chip = document.createElement('div');
    chip.setAttribute('data-mp-tl-clock', '1');
    chip.style.cssText = 'position:absolute;top:${top}px;right:${right}px;z-index:9500;display:none;' +
      'background:rgba(15,23,42,0.78);color:#f8fafc;border:1px solid rgba(248,250,252,0.18);' +
      'border-radius:999px;padding:${Math.round(fs * 0.45)}px ${Math.round(fs * 0.85)}px;' +
      'font:600 ${fs}px/1.3 ui-monospace,"SF Mono",Menlo,Consolas,monospace;' +
      'font-variant-numeric:tabular-nums;letter-spacing:0.02em;pointer-events:none;' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';
    root.appendChild(chip);
    return chip;
  }
  var tries = 0;
  (function tick() {
    var root = ${containerExpr};
    var tl = ${timelineExpr};
    if (!root || !tl || !tl.to) {
      if (tries++ < 300) requestAnimationFrame(tick);
      return;
    }
    ensureChip(root);
    tl.to({ t: 0 }, { t: DUR, duration: DUR, ease: 'none',
      onUpdate: function() {
        var t = this.progress() * DUR;
        var w = null;
        for (var i = 0; i < W.length; i++) { if (t >= W[i].a && t < W[i].b) { w = W[i]; break; } }
        if (!w) { if (chip.style.display !== 'none') chip.style.display = 'none'; return; }
        // Elapsed SOURCE time, quantized to the same 0.45s flipbook step the
        // playback samples on -- the clock ticks exactly when the frame does.
        var elapsed = Math.floor((t - w.a) / 0.45) * 0.45 * w.r;
        var m = Math.floor(elapsed / 60), s = Math.floor(elapsed - m * 60);
        var txt = '\\u23F1 +' + m + ':' + (s < 10 ? '0' : '') + s + ' \\u00B7 \\u23E9' +
          (w.r === Math.round(w.r) ? Math.round(w.r) : w.r) + '\\u00D7';
        if (txt !== lastTxt) { chip.textContent = txt; lastTxt = txt; }
        if (chip.style.display === 'none') chip.style.display = 'block';
      } }, 0);
  })();
})();
`;
}

/**
 * Stage-level wrapper choreography: pose (standing 3D tilt), enter, and exit
 * on .mp-component wrappers. This is the L4 lane from
 * SPEC-motion-architecture -- the stage places and moves component WRAPPERS;
 * it never reaches inside a component's DOM. Emitted into the master-timeline
 * IIFE right after the component timelines are wired, so entrances/exits are
 * captured deterministically like everything else.
 */
export function wrapperChoreoScript(
  components: import("./types.js").SceneComponent[],
  sceneDuration: number,
  /** Composite namespaces wrapper ids ("sceneId__compId"); pass the prefix. */
  cidPrefix = "",
): string {
  const moves = components
    .filter((c) => c.pose || c.enter || c.exit)
    .map((c) => ({
      cid: `${cidPrefix}${c.id}`,
      pose: c.pose || null,
      enter: c.enter || null,
      exit: c.exit || null,
    }));
  if (!moves.length) return "";
  return `
  // ── Stage wrapper choreography (pose / enter / exit) ──
  (function() {
    var CHOREO = ${JSON.stringify(moves)};
    var DUR = ${sceneDuration};
    var OFF = { 'slide-left': { x: '-115%' }, 'slide-right': { x: '115%' },
                'slide-up': { y: '-115%' }, 'slide-down': { y: '115%' },
                'rise': { y: 60, autoAlpha: 0 }, 'pop': { scale: 0.72, autoAlpha: 0 },
                'fade': { autoAlpha: 0 } };
    CHOREO.forEach(function(c) {
      var el = document.querySelector('.mp-component[data-cid="' + c.cid + '"]');
      if (!el) return;
      if (c.pose) {
        gsap.set(el, {
          rotationY: c.pose.rotate_y || 0,
          rotationX: c.pose.rotate_x || 0,
          transformPerspective: 1100,
        });
      }
      if (c.enter) {
        var eFrom = OFF[c.enter.effect] || OFF['fade'];
        var eAt = c.enter.at || 0;
        var eDur = c.enter.duration || 0.8;
        master.fromTo(el, eFrom,
          { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: eDur,
            ease: c.enter.ease || 'power3.out', immediateRender: true }, eAt);
      }
      if (c.exit) {
        var xTo = OFF[c.exit.effect] || OFF['fade'];
        var xDur = c.exit.duration || 0.8;
        var xAt = c.exit.at != null ? c.exit.at : Math.max(0, DUR - xDur - 0.1);
        master.to(el, Object.assign({ duration: xDur, ease: c.exit.ease || 'power3.in' }, xTo), xAt);
      }
    });
  })();
`;
}

export function cameraMovesScript(
  moves: import("./types.js").CameraMove[],
  canvas: { width: number; height: number },
  containerExpr: string,
  timelineExpr: string,
): string {
  const movesJson = JSON.stringify(moves);
  return `
(function() {
  var moves = ${movesJson};
  if (!moves.length) return;
  var CW = ${canvas.width}, CH = ${canvas.height};
  var riggedMedia = [];
  function buildRig(root, target) {
    // Returns { el, box() } or null. box() is the clipping container's rect --
    // the coordinate space the focal point is expressed in.
    if (!target) {
      var cam = document.createElement('div');
      cam.className = '__mp_camera_rig';
      // z-index 2: will-change makes the rig a stacking context (unit z 0/auto),
      // so backdrops left OUTSIDE the rig (z 1) would paint OVER the whole rig.
      // Bit the Studio composite: every camera_moves scene showed backdrop only.
      cam.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;will-change:transform;transform-origin:50% 50%;z-index:2;';
      Array.prototype.slice.call(root.childNodes).forEach(function(n) {
        if (n.nodeType === 1) {
          var t = n.tagName;
          if (t === 'SCRIPT' || t === 'STYLE') return;
          if (n.id === '__mp_speaker_base') return;
          // Backdrops stay OUTSIDE the rig: the camera moves the subject,
          // not the world -- dragging the backdrop exposes the canvas edge.
          if (n.hasAttribute && n.hasAttribute('data-mp-backdrop')) return;
          if (n.classList && n.classList.contains('mp-page-bg')) return;
          if (n.querySelector && n.children.length === 1 && n.firstElementChild && n.firstElementChild.hasAttribute && n.firstElementChild.hasAttribute('data-mp-backdrop')) return;
        }
        cam.appendChild(n);
      });
      root.appendChild(cam);
      return { el: cam, box: function() { return { width: CW, height: CH, left: 0, top: 0 }; } };
    }
    var media = null;
    if (target !== 'screencast') {
      // Element target: any selector, typically a src-filename match
      // ('video[src*="demo.mp4"]') stamped by Studio's "zoom inside".
      try { media = root.querySelector(target); } catch (e) { media = null; }
    }
    if (!media) {
      // 'screencast' semantic -- or a stale selector after a scene rewrite:
      // fall back to the largest video that is NOT the speaker. The PiP and
      // the live camera are excluded by src and by size.
      var best = 0;
      Array.prototype.slice.call(root.querySelectorAll('video')).forEach(function(v) {
        if (v.id === '__mp_speaker_base') return;
        if (/speaker/i.test(v.currentSrc || v.src || '')) return;
        var r = v.getBoundingClientRect();
        var area = r.width * r.height;
        if (area > best) { best = area; media = v; }
      });
    }
    if (!media) return null;
    if (!media.parentElement) return null;
    // One rig per media element, even if several target keys resolve to it
    // (e.g. legacy "screencast" plus an explicit selector) -- double-wrapping
    // would compose transforms.
    for (var ri = 0; ri < riggedMedia.length; ri++) {
      if (riggedMedia[ri].media === media) return riggedMedia[ri].rig;
    }
    // A video inside a screencast-frame viewport: the viewport IS the crop
    // window (overflow hidden, correct box, geometry managed by the
    // component). Rig ITS children instead of re-deriving the video's
    // geometry -- copying it breaks the overscan crop (measured: zoom-inside
    // shrank the footage to a thumbnail on frame-hosted screencasts).
    var scfHost = media.closest ? media.closest('.scf-viewport') : null;
    if (scfHost) {
      var wrapS = document.createElement('div');
      wrapS.className = '__mp_camera_rig __mp_camera_rig--content';
      wrapS.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform;transform-origin:50% 50%;';
      while (scfHost.firstChild) wrapS.appendChild(scfHost.firstChild);
      scfHost.appendChild(wrapS);
      var rigS = { el: wrapS, box: function() { return scfHost.getBoundingClientRect(); } };
      riggedMedia.push({ media: media, rig: rigS });
      return rigS;
    }
    // The clip box takes over the video's OWN layout slot (self-positioned
    // inline geometry copied verbatim; flow videos get pinned dimensions), so
    // flex/grid siblings -- side-by-side demos -- keep their positions. An
    // absolute-fill wrapper inside the PARENT (the old approach) ripped the
    // video out of flow and collapsed multi-video layouts.
    var mcs = getComputedStyle(media);
    var mr = media.getBoundingClientRect();
    var clip = document.createElement('div');
    clip.className = '__mp_camera_clip';
    if (media.style.position) {
      clip.style.cssText = media.style.cssText;
    } else {
      clip.style.position = 'relative';
      clip.style.width = mr.width + 'px';
      clip.style.height = mr.height + 'px';
      clip.style.flex = '0 0 auto';
      clip.style.margin = mcs.margin;
    }
    clip.style.overflow = 'hidden';
    if (mcs.borderRadius && mcs.borderRadius !== '0px') clip.style.borderRadius = mcs.borderRadius;
    var wrap = document.createElement('div');
    wrap.className = '__mp_camera_rig __mp_camera_rig--content';
    wrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform;transform-origin:50% 50%;';
    media.parentElement.insertBefore(clip, media);
    clip.appendChild(wrap);
    wrap.appendChild(media);
    media.style.position = 'absolute';
    media.style.left = '0';
    media.style.top = '0';
    media.style.right = '';
    media.style.bottom = '';
    media.style.width = '100%';
    media.style.height = '100%';
    media.style.margin = '0';
    var rig = { el: wrap, box: function() { return clip.getBoundingClientRect(); } };
    riggedMedia.push({ media: media, rig: rig });
    return rig;
  }
  function anchorBox(root, rigEl, spec) {
    // "componentId.anchorName" -> the [data-anchor] element inside that
    // component's wrapper (composite ids are namespaced "sceneId__compId",
    // so match by exact or "__<id>" suffix). Bare name searches the scene.
    var parts = String(spec).split('.');
    var name = parts.pop();
    var comp = parts.join('.');
    // Match by component id (exact or composite "__id" suffix), by component
    // TYPE (storyboards naturally write "slack-workspace.composer"), or fall
    // back to the bare anchor name anywhere in the scene.
    var sel = comp
      ? '.mp-component[data-cid="' + comp + '"] [data-anchor="' + name + '"], ' +
        '.mp-component[data-cid$="__' + comp + '"] [data-anchor="' + name + '"], ' +
        '[data-comp-type="' + comp + '"] [data-anchor="' + name + '"]'
      : '[data-anchor="' + name + '"]';
    var el = null;
    try { el = root.querySelector(sel); } catch (e) {}
    if (!el && comp) { try { el = root.querySelector('[data-anchor="' + name + '"]'); } catch (e1) {} }
    if (!el) { try { console.warn('[camera] anchor not found: ' + spec); } catch (e2) {} return null; }
    var r = el.getBoundingClientRect();
    var rr = root.getBoundingClientRect();
    if (!rr.width || !rr.height || !r.width) return null;
    var sx = CW / rr.width, sy = CH / rr.height;
    // Viewport px -> canvas px (the root may be display-scaled in Studio).
    var cx = (r.left + r.width / 2 - rr.left) * sx;
    var cy = (r.top + r.height / 2 - rr.top) * sy;
    var w = r.width * sx, h = r.height * sy;
    // Compensate the rig's CURRENT transform so chained moves measure true
    // scene coordinates, not the already-zoomed view. Translate+scale about
    // center is exact; rotation is not compensated -- reset before rotating.
    try {
      var gs = parseFloat(gsap.getProperty(rigEl, 'scaleX')) || 1;
      var gx = parseFloat(gsap.getProperty(rigEl, 'x')) || 0;
      var gy = parseFloat(gsap.getProperty(rigEl, 'y')) || 0;
      cx = (cx - CW / 2 - gx) / gs + CW / 2;
      cy = (cy - CH / 2 - gy) / gs + CH / 2;
      w = w / gs; h = h / gs;
    } catch (e3) {}
    return { cx: cx, cy: cy, w: w, h: h };
  }
  function apply() {
    var root = ${containerExpr};
    var tl = ${timelineExpr};
    if (!root || !tl || !tl.to) return false;
    var groups = {};
    moves.forEach(function(m) {
      // Anchored moves always ride the whole-scene camera rig.
      var k = m.anchor ? '' : (m.target || '');
      (groups[k] = groups[k] || []).push(m);
    });
    Object.keys(groups).forEach(function(k) {
      var rig = buildRig(root, k || null);
      if (!rig) return;
      var st = { scale: 1, x: 0, y: 0, rotation: 0 };
      groups[k].slice().sort(function(a, b) { return a.at - b.at; }).forEach(function(m) {
        if (m.anchor && !k) {
          // Anchored move: resolve at the tween's FIRST RENDER (function-based
          // values) so it frames the anchor where it actually is at that
          // moment -- mid-entrance, posed, drifting -- not where it was when
          // the timeline was built.
          var aDur = m.duration || 1;
          var aEase = m.ease || 'power2.inOut';
          var computeA = function() {
            var a = anchorBox(root, rig.el, m.anchor);
            if (!a) return { scale: 1, x: 0, y: 0 };
            var sc = m.scale;
            if (!sc) sc = Math.max(1.05, Math.min(5, Math.min(CW / (a.w * 1.5), CH / (a.h * 1.5))));
            // Cover-clamp: the camera never frames outside the canvas. An
            // edge-hugging anchor (a sidebar, a top-aligned transcript) would
            // otherwise drag the rig past the frame, cropping content and
            // exposing the backdrop.
            var mx = (sc - 1) * CW / 2, my = (sc - 1) * CH / 2;
            return { scale: sc,
              x: Math.max(-mx, Math.min(mx, (0.5 - a.cx / CW) * CW * sc)),
              y: Math.max(-my, Math.min(my, (0.5 - a.cy / CH) * CH * sc)) };
          };
          if (m.type === 'reset') {
            tl.to(rig.el, { scale: 1, x: 0, y: 0, rotation: 0, duration: aDur, ease: aEase }, m.at);
            st = { scale: 1, x: 0, y: 0, rotation: 0 };
          } else {
            tl.to(rig.el, {
              scale: function() { return computeA().scale; },
              x: function() { return computeA().x; },
              y: function() { return computeA().y; },
              duration: aDur, ease: aEase,
            }, m.at);
            st = { scale: m.scale || 2, x: 0, y: 0, rotation: 0 };
            if (m['return']) {
              tl.to(rig.el, { scale: 1, x: 0, y: 0, rotation: 0, duration: aDur, ease: aEase }, m.at + aDur + (m.hold || 0));
              st = { scale: 1, x: 0, y: 0, rotation: 0 };
            }
          }
          return;
        }
        var b = rig.box();
        var W = b.width || CW, H = b.height || CH;
        // Focal point arrives as canvas %, convert to this rig's box %.
        var fx = ((m.x != null ? m.x : 50) / 100) * CW;
        var fy = ((m.y != null ? m.y : 50) / 100) * CH;
        var px = k ? Math.max(0, Math.min(1, (fx - b.left) / W)) : fx / CW;
        var py = k ? Math.max(0, Math.min(1, (fy - b.top) / H)) : fy / CH;
        var to;
        if (m.type === 'reset') to = { scale: 1, x: 0, y: 0, rotation: 0, rotationX: 0, rotationY: 0 };
        else {
          var sc;
          if (m.type === 'zoom' && m.w && m.h) {
            // Drawn box: zoom so the outlined region just fills the rig frame.
            var bw = (m.w / 100) * CW, bh = (m.h / 100) * CH;
            sc = Math.max(1.05, Math.min(5, Math.min(W / bw, H / bh)));
          } else {
            // Pan/rotate keep the camera's current zoom unless the move
            // carries its own scale (a hand-authored pan from wide sets one:
            // a 1x pan is invisible).
            sc = m.type === 'zoom' ? (m.scale || 2) : (m.scale || st.scale);
          }
          to = {
            scale: sc,
            x: (0.5 - px) * W * sc,
            y: (0.5 - py) * H * sc,
            rotation: m.type === 'rotate' ? (m.angle || 0) : st.rotation,
          };
          if (m.type === 'rotate' && (m.axis === 'y' || m.axis === 'x')) {
            // 3D rotate: a perspective turn, not a flat spin. Focal-centering
            // and the cover-clamp don't apply (scale may drop below 1 to keep
            // the tilted frame inside the canvas); the optional signed shift
            // clears space beside/above the frame.
            // ASSERTIVE defaults: a 3D turn exists to get the frame OUT OF
            // THE WAY, so untouched knobs mean a real tilt (-26), a real
            // slide (18% away from the receding edge) and a step back
            // (0.86). All three neutral values (angle 0, shift 0, scale 1)
            // read as "untouched" and upgrade -- nobody consciously asks a
            // 3D turn to stay flat, centered and full-size.
            var ang3 = (m.angle != null && m.angle !== 0) ? m.angle : -26;
            var sh3 = (m.shift != null && m.shift !== 0) ? m.shift : (ang3 <= 0 ? 18 : -18);
            to = { scale: (m.scale != null && m.scale !== 1) ? m.scale : 0.86, x: 0, y: 0, rotation: 0 };
            to[m.axis === 'y' ? 'rotationY' : 'rotationX'] = ang3;
            to.transformPerspective = 1600;
            if (sh3) {
              if (m.axis === 'y') to.x = (sh3 / 100) * CW;
              else to.y = (sh3 / 100) * CH;
            }
          } else if (!k) {
            // Whole-scene rig: same cover-clamp as anchored moves.
            var mx2 = (sc - 1) * CW / 2, my2 = (sc - 1) * CH / 2;
            to.x = Math.max(-mx2, Math.min(mx2, to.x));
            to.y = Math.max(-my2, Math.min(my2, to.y));
          }
        }
        var dur = m.duration || 1;
        var ease = m.ease || 'power2.inOut';
        var tw = { scale: to.scale, x: to.x, y: to.y, rotation: to.rotation, duration: dur, ease: ease };
        if (to.rotationY != null) { tw.rotationY = to.rotationY; tw.transformPerspective = to.transformPerspective; delete tw.rotation; }
        if (to.rotationX != null) { tw.rotationX = to.rotationX; tw.transformPerspective = to.transformPerspective; delete tw.rotation; }
        tl.to(rig.el, tw, m.at);
        st = to;
        if (m['return']) {
          tl.to(rig.el, { scale: 1, x: 0, y: 0, rotation: 0, rotationX: 0, rotationY: 0, duration: dur, ease: ease }, m.at + dur + (m.hold || 0));
          st = { scale: 1, x: 0, y: 0, rotation: 0 };
        }
      });
    });
    return true;
  }
  var tries = 0;
  (function tick() {
    var root = ${containerExpr};
    var tl = ${timelineExpr};
    if ((root && tl && tl.to && apply()) || tries++ > 300) return;
    requestAnimationFrame(tick);
  })();
})();
`;
}

/**
 * Rewrite codegen-authored `<video src="speaker">` tags to the resolved
 * camera URL. The "speaker" src is the renderer's magic token for "the live
 * camera, time-synced" -- the codegen prompt directs the model to write it
 * for PiP bubbles in screencast scenes. Adds data-start-at (seconds into the
 * speaker track at this scene's start) unless the author set one, and forces
 * muted so the PiP never doubles the speaker's audio.
 */
export function resolveSpeakerVideoTags(template: string, speakerUrl: string, offsetSeconds: number): string {
  return template.replace(/<video\b[^>]*\bsrc\s*=\s*["']speaker["'][^>]*>/gi, (tag) => {
    let out = tag.replace(/\bsrc\s*=\s*["']speaker["']/i, `src="${speakerUrl}"`);
    if (!/\bdata-start-at\s*=/i.test(out)) {
      out = out.replace(/^<video\b/i, `<video data-start-at="${offsetSeconds}"`);
    }
    if (!/\bmuted\b/i.test(out)) {
      out = out.replace(/^<video\b/i, "<video muted");
    }
    return out;
  });
}

/**
 * Assemble a codegen scene (.scene.html with <component> tags).
 *
 * This is the unified codegen path: the LLM generates a .scene.html file
 * that can embed library components via <component> tags alongside custom
 * HTML/CSS/GSAP. This function resolves those tags, merges styles and
 * timelines, and produces a self-contained HTML document for Playwright capture.
 */
export async function assembleCodegenScene(options: {
  /** Raw .scene.html source (the codegen output) */
  sceneSource: string;
  /** Available component sources for <component> tag resolution */
  componentSources: ComponentSource[];
  /** Brand kit for CSS variables */
  brandKit: BrandKit;
  /** Canvas dimensions */
  canvas: Canvas;
  /** Scene duration in seconds */
  duration: number;
  /** Scene id for camera drift seed */
  sceneId?: string;
  /** Beat timeline (continuous-take scenes) -- exposed on ctx.beats so scene
   *  and component timelines can sync their phases to the beat structure. */
  beats?: SceneBeat[];
  /** Path to GSAP files directory */
  gsapDir: string;
  /** Scene background color */
  background?: string;
  /** When true, use transparent background */
  transparentBackground?: boolean;
  speakerOffset?: number;
  /** Keep HTTP paths for preview */
  preview?: boolean;
  /** Speaker URL for resolving "speaker" references */
  speakerUrl?: string;
  /** Direct-manipulation camera moves applied as a deterministic rig. */
  cameraMoves?: import("./types.js").CameraMove[];
  mediaEdits?: Record<string, import("./types.js").MediaEdit>;
}): Promise<string> {
  const {
    sceneSource, componentSources, canvas, duration,
    sceneId, beats, gsapDir, background, transparentBackground,
    preview, speakerUrl,
  } = options;
  // Resolve brand fonts FIRST so the font links and --mp-font-family agree
  // on a family that actually exists (see font-resolve.ts).
  const brandKit = await resolveBrandKitFonts(options.brandKit);

  // Beat timeline for ctx.beats: resolved (start, end) segments so scene and
  // component timelines can anchor phases to beats instead of guessing.
  const ctxBeatsJson = beats && beats.length >= 2
    ? JSON.stringify(beatTimeline(beats).map((b) => ({
        label: b.label, start: b.start_seconds, end: b.end_seconds,
      })))
    : "[]";

  // 1. Parse the scene source
  const { parseComponent } = await import("./component-parser.js");
  const sceneParsed = parseComponent(sceneSource);

  // Resolve raw <video src="speaker"> tags authored directly in codegen HTML.
  // The literal "speaker" token means nothing to the browser -- swap in the
  // resolved camera URL and stamp data-start-at so capture (scene-worker) and
  // preview (preview-app) seek the PiP in sync with the film timeline.
  // (Component DATA carrying "speaker" is resolved separately: render.ts
  // step 2b for renders, resolveAssetUrls below for previews.)
  if (speakerUrl) {
    sceneParsed.template = resolveSpeakerVideoTags(sceneParsed.template, speakerUrl, options.speakerOffset || 0);
  }

  // Resolve crop:"auto" on screencast-frame tags from the footage's ingest
  // analysis (asset-intel sidecar) before tag binding -- the browser gets
  // concrete per-edge trims, not a sentinel.
  sceneParsed.template = await resolveScreencastAutoCrops(sceneParsed.template);

  // 2. Build component source map for tag resolution
  const rawSourceMap = new Map<string, string>();
  for (const cs of componentSources) {
    rawSourceMap.set(cs.type, cs.source);
  }

  // 3. Resolve <component> tags in the scene template
  const tagResult = resolveComponentTags(
    sceneParsed.template,
    rawSourceMap,
    (data) => resolveAssetUrls(data, preview, speakerUrl),
  );

  // 4. Collect all CSS: scene CSS + resolved component CSS
  const allStyles: string[] = [];
  if (sceneParsed.style) {
    allStyles.push(`/* ── Scene Styles ── */\n${sceneParsed.style}`);
  }
  for (const comp of tagResult.components) {
    if (comp.scopedCss) {
      allStyles.push(`/* ${comp.type} (${comp.id}) */\n${comp.scopedCss}`);
    }
  }

  // 5. Build component timeline registration script
  const componentTimelineScript = buildComponentTimelineScript(
    tagResult.components,
    duration,
    canvas,
    beats && beats.length >= 2
      ? beatTimeline(beats).map((b) => ({ label: b.label, start: b.start_seconds, end: b.end_seconds }))
      : undefined,
  );

  // 6. Generate brand CSS
  const { css: brandCSS, theme: sceneTheme, hasBgImage } = generateBrandCSS(
    brandKit, background, preview,
  );

  // 7. Load GSAP and shared utilities
  const gsapSource = await loadGsapSource(gsapDir);
  const sharedSource = await loadSharedUtilities();

  // Inline three.js only when the codegen scene or a used component references it.
  const usesThree = sceneSource.includes("THREE") || componentSources.some((c) => c.source.includes("THREE"));
  const threeSource = usesThree ? await loadThreeSource(config.threeDir) : "";

  const isTransparent = transparentBackground === true;

  // 8. Assemble final HTML
  const html = `<!DOCTYPE html>
<html data-theme="${sceneTheme}">
<head>
<meta charset="utf-8">
${generateFontLinks(brandKit)}
<style>
/* ── Brand Kit ── */
${brandCSS}

${hasBgImage ? `
.bg-gradient { opacity: 0.65 !important; }
` : ""}

/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${canvas.width}px;
  height: ${canvas.height}px;
  overflow: hidden;
  clip-path: inset(0);
  background: ${isTransparent ? "transparent" : `var(--mp-color-background, ${background || canvas.background || "#000000"})`};
}

/* ── Component instance containers ── */
.component-instance {
  position: relative;
  width: 100%;
  height: 100%;
}

/* ── Safety defaults ── */
.component-instance * {
  max-width: 100%;
  box-sizing: border-box;
}

img, video {
  max-width: 100%;
  height: auto;
}

/* ── Scene + Component Styles ── */
${allStyles.join("\n\n")}
</style>
${threeSource ? `<!-- three.js (bundled: three + addons, global THREE). MUST be its own\n     <script>: the bundle opens with "use strict", and concatenating it with the\n     GSAP block below would make that block strict too -- a GSAP plugin's UMD\n     shim assigns the getter-only window.window (a silent no-op in sloppy mode),\n     which throws in strict mode and would abort gsap + the whole scene. -->\n<script>\n${threeSource}\n</script>\n` : ""}<script>
${gsapSource}

${sharedSource}

// Register GSAP plugins
if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);
if (typeof CustomEase !== 'undefined') gsap.registerPlugin(CustomEase);
if (typeof CustomBounce !== 'undefined') gsap.registerPlugin(CustomBounce);
if (typeof CustomWiggle !== 'undefined') gsap.registerPlugin(CustomWiggle);
if (typeof ExpoScaleEase !== 'undefined') gsap.registerPlugin(ExpoScaleEase);
if (typeof RoughEase !== 'undefined') gsap.registerPlugin(RoughEase);
if (typeof SlowMo !== 'undefined') gsap.registerPlugin(SlowMo);
if (typeof MorphSVGPlugin !== 'undefined') gsap.registerPlugin(MorphSVGPlugin);
if (typeof DrawSVGPlugin !== 'undefined') gsap.registerPlugin(DrawSVGPlugin);
if (typeof ScrambleTextPlugin !== 'undefined') gsap.registerPlugin(ScrambleTextPlugin);
</script>
</head>
<body>
${preview && speakerUrl && isTransparent ? speakerUnderlayHtml(speakerUrl, options.speakerOffset || 0) : ""}${(options.mediaEdits && Object.keys(options.mediaEdits).length ? `<script>${mediaEdlScript(options.mediaEdits, "document.body")}</script><script>${timelapseClockScript(options.mediaEdits, canvas, "document.body", "window.__MP_TIMELINE", duration)}</script>` : "")}${(options.cameraMoves && options.cameraMoves.length ? `<script>${cameraMovesScript(options.cameraMoves, canvas, "document.body", "window.__MP_TIMELINE")}</script>` : "")}
<div class="mp-camera" style="position:absolute;inset:-20px;width:calc(100% + 40px);height:calc(100% + 40px);will-change:transform;">
${isTransparent ? "" : '<div class="mp-ambient"></div>'}
${isTransparent ? "" : hasBgImage ? '<div class="mp-page-bg" style="position:absolute;inset:0;z-index:0;background:var(--mp-bg-image,none);background-size:cover;background-position:center;"></div>' : ""}
<div class="mp-scene-content" style="position:absolute;top:20px;left:20px;width:${canvas.width}px;height:${canvas.height}px;z-index:2;">
${tagResult.html}
</div>
</div>

<script>
(function() {
  const master = gsap.timeline({ paused: true });
  window.__MP_LOGODEV_TOKEN = ${JSON.stringify(config.logoDevToken)};

  // ── Camera motion ──
  var cameraEl = document.querySelector('.mp-camera');
  if (cameraEl) {
    var camDur = ${duration};
    var seed = '${sceneId || "s"}'.split('').reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
    var driftX = (seed % 2 === 0 ? 1 : -1) * (4 + (seed % 6));
    var driftY = (seed % 3 === 0 ? 1 : -1) * (3 + (seed % 5));
    master.to(cameraEl, { scale: 1.03, x: driftX, y: driftY, duration: camDur, ease: 'none' }, 0);
  }

  // ── Component timelines ──
  ${componentTimelineScript}

  // ── Scene timeline (from codegen) ──
  var sceneCtx = {
    duration: ${duration},
    fps: 30,
    canvas: { width: ${canvas.width}, height: ${canvas.height} },
    // Beat timeline: [{label, start, end}] -- the scene's internal shot clock.
    beats: ${ctxBeatsJson},
    getComponentTimeline: (typeof __getComponentTimeline !== 'undefined'
      ? __getComponentTimeline
      : function(id) { return gsap.timeline(); }),
  };

  // Scene's own createTimeline
  ${sceneParsed.script}

  var sceneEl = document.querySelector('.mp-scene-content');
  var sceneTl = createTimeline(sceneEl, {}, sceneCtx);
  if (sceneTl) master.add(sceneTl, 0);

  // ── Auto-wire dropped component timelines ──
  // The scene's createTimeline is supposed to add each embedded <component>'s
  // timeline via ctx.getComponentTimeline(id). When it forgets (common), the
  // block renders but its motion -- including ambient background loops -- never
  // plays. Add any registered-but-unconsumed component timeline at t=0 so every
  // embedded block animates regardless of whether the codegen wired it.
  if (typeof __componentTimelines !== 'undefined') {
    for (var __cid in __componentTimelines) {
      if (__consumedComponentTimelines[__cid]) continue;
      try {
        var __autoTl = __componentTimelines[__cid]();
        if (__autoTl) master.add(__autoTl, 0);
      } catch (e) { console.warn("Auto-wire failed for " + __cid + ": " + e.message); }
    }
  }

  // Fold any orphan animations the components created (loose gsap.to/from not
  // added to the master) ONTO the master, so the renderer -- which seeks the
  // master deterministically -- captures them frame-accurately instead of
  // letting them free-run and jitter between frames. (The Studio preview is
  // unaffected: it plays the composite document, not this per-scene one.)
  try {
    gsap.globalTimeline.getChildren(false, true, true).forEach(function (a) {
      if (a !== master && a.parent === gsap.globalTimeline) {
        master.add(a, a.startTime());
      }
    });
  } catch (e) {}

  // Expose for Playwright capture
  window.__MP_TIMELINE = master;
  window.__MP_DURATION = ${duration};
  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  const resolved = resolveHtmlAssetUrls(normalizeHtmlUrls(html), preview);
  // Preview surfaces must not eagerly decode scene videos (mobile tab-kill).
  return preview ? stripEagerVideoLoading(resolved) : resolved;
}

/**
 * Generate Google Fonts link tags from the brand kit.
 */
export function generateFontLinks(brand: BrandKit): string {
  const links: string[] = [];
  for (const font of brand.fonts || []) {
    if (font.source === "google") {
      const weights = font.weights?.join(";") || "400;700";
      const family = font.family.replace(/\s+/g, "+");
      links.push(
        `<link rel="preconnect" href="https://fonts.googleapis.com">` +
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
        `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap">`
      );
    }
  }
  return links.join("\n");
}

/**
 * Convert every /assets/... URL in the final assembled HTML to a resolvable URL
 * (file:// for render, kept as-is for preview). resolveAssetUrls only handles
 * component DATA, so raw codegen-written tags like <img src="/assets/.../logo.svg">
 * would otherwise stay /assets/... and fail to load under the file:// page.
 */
export function resolveHtmlAssetUrls(html: string, preview?: boolean): string {
  if (preview) return html; // preview SPA serves /assets/ over HTTP
  // Only match RELATIVE /assets/ URLs. The negative lookbehind skips /assets/
  // substrings that are already part of an absolute URL (e.g. the inner
  // /assets/ of a file:///data/.../brand-kit/assets/... path that resolveAssetUrls
  // already produced for component data). Without this guard, re-resolving that
  // inner segment hits resolveAssetPath's http fallback and concatenates an http
  // URL onto the file:// prefix, corrupting the path and hanging the render.
  // Relative URLs are always preceded by a delimiter ("/'/(/=/space) or start.
  return html.replace(/(?<![A-Za-z0-9_\-./%:])\/assets\/[A-Za-z0-9_\-./%]+/g, (m) => resolveAssetPath(m, false));
}

/** Codegen sometimes writes a brand asset's NAME as its filename (e.g.
 *  logo/extracted-icon-any-2.png for the real extracted-2.png) -- the model
 *  conflates the two fields. When the requested file doesn't exist, repair
 *  deterministically: same trailing number wins, else any image in the dir.
 *  Broken-image logos shipped in RENDERS through this. */
export function repairBrandAssetPath(abs: string): string {
  try {
    if (existsSync(abs)) return abs;
    const dir = path.dirname(abs);
    const want = path.basename(abs).toLowerCase();
    const wantNum = (want.match(/\d+/g) || []).pop();
    const files = readdirSync(dir).filter((f) => /\.(png|svg|jpe?g|webp)$/i.test(f));
    const pick = files.find((f) => wantNum && ((f.match(/\d+/g) || []).pop() === wantNum)) || files[0];
    if (pick) {
      console.warn(`  [brand-asset] repaired missing ${want} -> ${pick}`);
      return path.join(dir, pick);
    }
  } catch { /* keep original */ }
  return abs;
}

/**
 * Resolve relative /assets/ URLs in component data to absolute URLs so they
 * work when loaded via file:// protocol in Playwright.
 */
/**
 * Preview-only speaker underlay: in the Studio, transparent speaker scenes
 * were previewed over a blank page -- nothing like the final composite. This
 * injects the camera as a fixed base layer behind the scene content, seeked
 * to the scene's offset in the film and loosely drift-corrected against the
 * master timeline when one is exposed. Render-path assembly (preview=false)
 * never includes it: the real composite handles the camera there.
 */
export function speakerUnderlayHtml(speakerUrl: string, offsetSeconds: number): string {
  return `
<video id="__mp_speaker_base" src="${speakerUrl}" muted playsinline preload="auto" data-start-at="${Math.max(0, offsetSeconds)}"
  style="position:fixed; inset:0; width:100%; height:100%; object-fit:cover; z-index:-10; pointer-events:none;"></video>
<script>
(function(){
  var v = document.getElementById('__mp_speaker_base');
  var offset = ${Math.max(0, offsetSeconds)};
  if (!v) return;
  v.addEventListener('loadedmetadata', function(){
    try { v.currentTime = isFinite(v.duration) && v.duration > 0 ? (offset % v.duration) : offset; } catch(e){}
    v.play && v.play().catch(function(){});
  });
  // Loose drift correction against the scene master timeline, when present.
  function tick(){
    try {
      var tl = window.__MP_TIMELINE;
      if (tl && typeof tl.time === 'function') {
        var want = offset + tl.time();
        if (isFinite(v.duration) && v.duration > 0) want = want % v.duration;
        if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
      }
    } catch(e){}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</scr` + `ipt>
`;
}

/**
 * Component-data key that carries the camera PiP reference. Deliberately scoped
 * to `pip_source` only: `source`/`src` are a component's MAIN media (e.g. the
 * screencast footage in st-screencast), and rewriting those would be wrong. A
 * PiP, by definition, is the camera bubble -- if it points at the speaker clip
 * it should be the "speaker" token.
 */
const SPEAKER_PIP_KEYS = ["pip_source"] as const;

/** Last path segment of an /assets/ url or file path (for basename compare). */
function assetBasename(v: string): string {
  const noQuery = v.split(/[?#]/)[0];
  const seg = noQuery.split("/").filter(Boolean).pop() || noQuery;
  return seg.toLowerCase();
}

/**
 * Option-A guardrail (single source of truth for the camera).
 *
 * When a screencast/PiP component references the SAME clip that is already the
 * project's speaker_track -- but does so by a plain URL instead of the literal
 * "speaker" token -- that is the redundant, drift-prone anti-pattern: two
 * independent references to one camera (Studio shows a duplicate media file,
 * and the PiP is not sync-bound to the speaker track at render time). This
 * rewrites any such plain-URL PiP reference to "speaker" so there is exactly
 * one reference, muted + auto-synced. Returns the (possibly new) data object
 * and the list of keys it corrected, so callers can surface a warning.
 *
 * `speakerSource` is the raw stored speaker clip source (e.g.
 * "/assets/<tenant>/.../camera.mp4"); matching is by exact value OR basename so
 * it holds across the /assets vs file:// vs http url forms of the same file.
 */
export function normalizeSpeakerPipRefs(
  data: Record<string, any>,
  speakerSource: string | undefined | null,
): { data: Record<string, any>; corrected: string[] } {
  if (!data || !speakerSource || typeof speakerSource !== "string") {
    return { data, corrected: [] };
  }
  const targetBase = assetBasename(speakerSource);
  const corrected: string[] = [];
  let out: Record<string, any> | null = null;
  for (const key of SPEAKER_PIP_KEYS) {
    const val = data[key];
    if (typeof val !== "string" || val === "speaker" || val.length === 0) continue;
    if (val === speakerSource || assetBasename(val) === targetBase) {
      if (!out) out = { ...data };
      out[key] = "speaker";
      corrected.push(key);
    }
  }
  return { data: out || data, corrected };
}

export function resolveAssetUrls(data: Record<string, any>, preview?: boolean, speakerUrl?: string): Record<string, any> {
  const baseUrl = `http://localhost:${config.port}`;
  const resolved = { ...data };
  for (const [key, val] of Object.entries(resolved)) {
    // In preview mode, resolve "speaker" to the speaker clip HTTP URL
    if (preview && speakerUrl && typeof val === "string" && val === "speaker") {
      resolved[key] = speakerUrl;
      continue;
    }
    if (typeof val === "string" && val.startsWith("/assets/")) {
      resolved[key] = resolveAssetPath(val, preview);
    } else if (typeof val === "string" && val.startsWith("/api/")) {
      resolved[key] = preview ? val : `${baseUrl}${val}`;
    } else if (preview && typeof val === "string" && val.startsWith("file://")) {
      // In preview mode, convert file:// paths back to HTTP-servable paths.
      // file://{dataDir}/{tenant}/... -> /assets/{tenant}/...
      resolved[key] = fileUrlToHttpUrl(val);
    } else if (Array.isArray(val)) {
      resolved[key] = val.map((v: any) =>
        typeof v === "string" && v.startsWith("/assets/")
          ? resolveAssetPath(v, preview)
          : typeof v === "string" && v.startsWith("/api/")
          ? (preview ? v : `${baseUrl}${v}`)
          : preview && typeof v === "string" && v.startsWith("file://")
          ? fileUrlToHttpUrl(v)
          : v
      );
    }
  }
  return resolved;
}

/**
 * Convert a file:// URL back to an HTTP /assets/ URL for preview mode.
 * Handles paths under the data dir for both project assets and brand-kit assets.
 * Falls back to /work/ route for _work directory files (e.g. speaker_base).
 */
function fileUrlToHttpUrl(fileUrl: string): string {
  const filePath = fileUrl.replace("file://", "");
  const dataDir = config.dataDir;

  // {dataDir}/{tenant}/projects/{projectId}/assets/{rest} -> /assets/{tenant}/projects/{projectId}/assets/{rest}
  const projMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/projects/([^/]+)/assets/(.+)$`));
  if (projMatch) {
    return `/assets/${projMatch[1]}/projects/${projMatch[2]}/assets/${projMatch[3]}`;
  }

  // {dataDir}/{tenant}/brand-kit/assets/{rest} -> /assets/{tenant}/brand-kit/{rest}
  const brandMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/brand-kit/assets/(.+)$`));
  if (brandMatch) {
    return `/assets/${brandMatch[1]}/brand-kit/${brandMatch[2]}`;
  }

  // {dataDir}/{tenant}/projects/{projectId}/_work/{rest} -> /work/{tenant}/projects/{projectId}/{rest}
  const workMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/projects/([^/]+)/_work/(.+)$`));
  if (workMatch) {
    return `/work/${workMatch[1]}/projects/${workMatch[2]}/${workMatch[3]}`;
  }

  // {dataDir}/{tenant}/assets/{rest} -> /assets/{tenant}/assets/{rest}  (tenant-level assets)
  const tenantMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/assets/(.+)$`));
  if (tenantMatch) {
    return `/assets/${tenantMatch[1]}/assets/${tenantMatch[2]}`;
  }

  // Can't convert -- return as-is (will fail in browser but at least won't crash)
  return fileUrl;
}

/**
 * Resolve /assets/ URL paths to file:// URIs pointing at the actual filesystem path.
 * This allows Playwright to load and seek videos properly (HTTP video seeking fails
 * in headless Chromium). Falls back to http://localhost for unrecognized patterns.
 */
function resolveAssetPath(urlPath: string, preview?: boolean): string {
  // In preview mode, keep HTTP paths so the browser can load them
  if (preview) {
    return urlPath;
  }
  // /assets/{tenant}/brand-kit/{rest} -> {dataDir}/{tenant}/brand-kit/assets/{rest}
  const brandMatch = urlPath.match(/^\/assets\/([^/]+)\/brand-kit\/(.+)$/);
  if (brandMatch) {
    const abs = path.resolve(config.dataDir, brandMatch[1], "brand-kit", "assets", brandMatch[2]);
    return `file://${repairBrandAssetPath(abs)}`;
  }
  // /assets/{tenant}/projects/{projectId}/assets/{rest} -> {dataDir}/{tenant}/projects/{projectId}/assets/{rest}
  const projMatch = urlPath.match(/^\/assets\/([^/]+)\/projects\/([^/]+)\/assets\/(.+)$/);
  if (projMatch) {
    return `file://${path.resolve(config.dataDir, projMatch[1], "projects", projMatch[2], "assets", projMatch[3])}`;
  }
  // Fallback: HTTP
  return `http://localhost:${config.port}${urlPath}`;
}

/**
 * Generate CSS custom properties from the brand kit.
 */
/**
 * Determine if a hex color is "light" (luminance > 0.5).
 */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // Relative luminance (sRGB)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5;
}

/**
 * Pick a brand background image URL based on the scene theme.
 * Prefers dark-tagged images for dark scenes, light-tagged for light.
 * Returns undefined if no suitable background found.
 */
function pickBrandBackground(brand: BrandKit, isDark: boolean): { url: string; isDark: boolean } | undefined {
  const bgAssets = (brand.assets || []).filter((a: any) => a.type === 'background');
  if (bgAssets.length === 0) return undefined;

  const darkTags = /dark|night|deep|midnight/i;
  const lightTags = /light|white|bright|soft|pastel/i;

  const tagIsDark = (a: any) =>
    (a.tags || []).some((t: string) => darkTags.test(t)) || darkTags.test(a.name);
  const tagIsLight = (a: any) =>
    (a.tags || []).some((t: string) => lightTags.test(t)) || lightTags.test(a.name);

  const darkBgs = bgAssets.filter((a: any) => tagIsDark(a));
  const lightBgs = bgAssets.filter((a: any) => tagIsLight(a));

  if (isDark) {
    // Prefer dark backgrounds, fall back to any
    const pool = darkBgs.length > 0 ? darkBgs : bgAssets;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return picked ? { url: picked.url, isDark: tagIsDark(picked) || !tagIsLight(picked) } : undefined;
  } else {
    const pool = lightBgs.length > 0 ? lightBgs : bgAssets;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return picked ? { url: picked.url, isDark: tagIsDark(picked) } : undefined;
  }
}

/**
 * Generate CSS custom properties from the brand kit.
 *
 * Theme-aware: detects whether the effective scene background is light or dark,
 * and emits appropriate text colors. Templates are dark-themed by default and
 * reference vars like var(--mp-color-text, #ffffff). This function ensures the
 * CSS vars match the actual scene theme so text is always readable.
 *
 * Also emits:
 *   --mp-bg-image: url(...) for brand background injection
 *   --mp-color-cta: CTA button color (from accent)
 *   --mp-color-glow: glow/shadow color based on primary
 */
export function generateBrandCSS(brand: BrandKit, sceneBackground?: string, preview?: boolean): { css: string; theme: "dark" | "light"; hasBgImage: boolean } {
  const vars: string[] = [];

  // ── Determine effective theme ──
  // Decide per-scene: use the explicit scene background color if provided,
  // otherwise fall back to the brand background color.
  const effectiveBg = sceneBackground || brand.colors?.background || '#0f172a';
  const bgIsLight = isLightColor(effectiveBg);

  // Start with the background color to determine theme. The background image
  // picked below may override this if its tags disagree.
  let sceneIsDark = !bgIsLight;

  // ── Colors ──
  if (brand.colors) {
    for (const [key, value] of Object.entries(brand.colors)) {
      // Skip text and text_muted -- we handle them theme-aware below
      if (key === 'text' || key === 'text_muted') continue;
      vars.push(`  --mp-color-${key.replace(/_/g, '-')}: ${value};`);
    }
  }

  // ── Background image (pick before text colors so tags can refine theme) ──
  // An EXPLICIT scene background is a director's choice of a flat canvas --
  // it suppresses the brand-kit background image entirely. (Before this, the
  // harvested brand "background" asset painted OVER every flat-color scene.)
  const bgResult = sceneBackground ? null : pickBrandBackground(brand, sceneIsDark);
  if (bgResult) {
    // Let the picked background image's tags override the theme.
    // If the brand bg color is light but we picked a dark-tagged image,
    // switch to dark theme. Vice versa.
    sceneIsDark = bgResult.isDark;
  }

  // ── Theme-aware text colors ──
  // On dark backgrounds: white text, light muted text
  // On light backgrounds: use brand text colors
  if (sceneIsDark) {
    vars.push('  --mp-color-text: #ffffff;');
    vars.push('  --mp-color-text-muted: #94a3b8;');
  } else {
    vars.push(`  --mp-color-text: ${brand.colors?.text || '#0f172a'};`);
    vars.push(`  --mp-color-text-muted: ${brand.colors?.text_muted || '#64748b'};`);
  }

  // ── Complete the text-color vocabulary ──
  // Codegen text colors are TOKENS-ONLY (raw hex in `color:` is rejected at
  // finish_scene) -- so every legitimate case needs a var. These cover the
  // cases that used to push the model to raw literals: text inside a dark
  // panel on a light scene (and vice versa), and text on accent/primary fills
  // (picked by fill luminance so it always clears contrast).
  vars.push('  --mp-color-on-dark: #ffffff;');
  vars.push('  --mp-color-on-dark-muted: rgba(255,255,255,0.72);');
  vars.push(`  --mp-color-on-light: ${brand.colors?.text || '#0f172a'};`);
  vars.push(`  --mp-color-on-light-muted: ${brand.colors?.text_muted || '#64748b'};`);
  const accentFill = brand.colors?.accent || brand.colors?.primary || '#6366f1';
  const primaryFill = brand.colors?.primary || accentFill;
  vars.push(`  --mp-color-on-accent: ${isLightColor(accentFill) ? '#111318' : '#ffffff'};`);
  vars.push(`  --mp-color-on-primary: ${isLightColor(primaryFill) ? '#111318' : '#ffffff'};`);

  // Always provide a theme-aware surface + hairline border so component cards
  // and borders are visible on BOTH light and dark scenes even when the brand
  // kit doesn't define them. (Components reference var(--mp-color-surface) /
  // var(--mp-color-border); without these defaults they'd fall back to the
  // dark-theme literals baked into the component and vanish on a light brand.)
  const _colorsAny = (brand.colors || {}) as unknown as Record<string, unknown>;
  if (!_colorsAny.surface) {
    vars.push(`  --mp-color-surface: ${sceneIsDark ? '#1b2030' : '#ffffff'};`);
  }
  if (!_colorsAny.border) {
    vars.push(`  --mp-color-border: ${sceneIsDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'};`);
  }

  // Scene-level background override
  if (sceneBackground) {
    vars.push(`  --mp-color-background: ${sceneBackground};`);
  } else if (sceneIsDark && bgIsLight) {
    // Brand bg is light but scene is dark (dark bg image selected).
    // Force a dark background so the body doesn't flash white.
    vars.push('  --mp-color-background: #0a0a0f;');
  }

  // ── Font ──
  if (brand.fonts?.length) {
    vars.push(`  --mp-font-family: '${brand.fonts[0].family}', sans-serif;`);
  }

  // ── Style props ──
  if (brand.style?.border_radius) {
    vars.push(`  --mp-border-radius: ${brand.style.border_radius};`);
  }
  if (brand.style?.motion) {
    vars.push(`  --mp-motion-style: ${brand.style.motion};`);
  }

  // ── Background image ──
  if (bgResult) {
    // Resolve relative URLs to absolute for file:// protocol
    const resolvedUrl = bgResult.url.startsWith('/assets/')
      ? resolveAssetPath(bgResult.url, preview)
      : bgResult.url.startsWith('/api/')
      ? (preview ? bgResult.url : `http://localhost:${config.port}${bgResult.url}`)
      : bgResult.url;
    vars.push(`  --mp-bg-image: url(${resolvedUrl});`);
    vars.push('  --mp-has-bg-image: 1;');
  } else {
    vars.push('  --mp-bg-image: none;');
    vars.push('  --mp-has-bg-image: 0;');
  }

  // ── CTA color (accent) ──
  if (brand.colors?.accent) {
    vars.push(`  --mp-color-cta: ${brand.colors.accent};`);
  }

  // ── Glow color (derived from primary) ──
  if (brand.colors?.primary) {
    vars.push(`  --mp-color-glow: ${brand.colors.primary};`);
  }

  // ── Theme hint ──
  vars.push(`  --mp-theme: ${sceneIsDark ? 'dark' : 'light'};`);

  return { css: `:root {\n${vars.join('\n')}\n}`, theme: sceneIsDark ? 'dark' : 'light', hasBgImage: !!bgResult };
}


/**
 * Build inline position style for a component container.
 */
export function buildPositionStyle(comp: SceneComponent): string {
  const parts: string[] = [];
  const pos = comp.position;
  const z = comp.z_index ?? 0;

  if (!pos) {
    // Default: fill entire scene
    parts.push("left:0", "top:0", "width:100%", "height:100%");
  } else {
    // Handle "center" shorthand
    if (pos.x === "center" && pos.y === "center") {
      parts.push("left:0", "top:0", "width:100%", "height:100%");
    } else {
      const x = typeof pos.x === "number" ? `${pos.x}px` : pos.x;
      const y = typeof pos.y === "number" ? `${pos.y}px` : pos.y;
      parts.push(`left:${x}`, `top:${y}`);
    }

    if (pos.width) {
      const w = typeof pos.width === "number" ? `${pos.width}px` : pos.width;
      parts.push(`width:${w}`);
    } else if (!pos.x || pos.x === "center") {
      parts.push("width:100%");
    }

    if (pos.height) {
      const h = typeof pos.height === "number" ? `${pos.height}px` : pos.height;
      parts.push(`height:${h}`);
    } else if (!pos.y || pos.y === "center") {
      parts.push("height:100%");
    }
  }

  parts.push(`z-index:${z}`);

  return parts.join("; ");
}

/**
 * Wrap component blocks in a content_region container when specified.
 * If no content_region is set, returns the blocks joined normally.
 *
 * When content_region is present, all components are placed inside a
 * positioned div that occupies the specified side and width of the frame.
 * This leaves the other side clear for the speaker video (full-behind mode).
 */
export function buildContentRegionWrapper(scene: Scene, componentBlocks: string[]): string {
  const blocks = componentBlocks.join("\n\n");

  if (!scene.content_region) {
    return blocks;
  }

  const { side, width, offset } = scene.content_region;
  const edgeOffset = offset || "0px";

  // Build CSS for the wrapper
  // The wrapper is absolutely positioned and fills the full height.
  // Components inside use their normal positioning relative to this container.
  let positionCSS: string;
  if (side === "left") {
    positionCSS = `left: ${edgeOffset}; top: 0; width: ${width}; height: 100%;`;
  } else {
    positionCSS = `right: ${edgeOffset}; top: 0; width: ${width}; height: 100%;`;
  }

  const wrapperStyle = `position: absolute; ${positionCSS} overflow: hidden; box-sizing: border-box;`;

  return (
    `<div class="mp-content-region" data-side="${side}" style="${wrapperStyle}">\n` +
    blocks.split("\n").map(line => "  " + line).join("\n") +
    `\n</div>`
  );
}

/**
 * Build a script block that creates a component's GSAP timeline
 * and adds it to the master timeline.
 */
export function buildComponentScript(
  comp: SceneComponent,
  scriptSource: string,
  duration: number,
  canvas: Canvas,
  options?: { motion?: string },
): string {
  // Normalize component scripts: strip ES module syntax (illegal outside <script type="module">)
  const normalizedScript = scriptSource
    .replace(/export\s+default\s+function\s+/g, "function ")
    .replace(/^\s*export\s+/gm, "");

  // Wrap the component's createTimeline in an IIFE
  // Pass the component's DOM element, data, and context
  const safeId = comp.id.replace(/[^a-zA-Z0-9_]/g, "_");

  return `  // ── ${comp.type} (${comp.id}) ──
  (function() {
    var el = document.querySelector('[data-cid="${comp.id}"]');
    var data = ${JSON.stringify(comp.data)};
    var ctx = {
      duration: ${duration},
      fps: ${canvas.fps},
      canvas: { width: ${canvas.width}, height: ${canvas.height} },
      motion: "${options?.motion || "cinematic"}",
      // Self-contained components may orchestrate nested sub-component timelines
      // via ctx.getComponentTimeline(id). Provide the same fallback the scene-level
      // ctx uses (empty timeline) so a missing/internal id is a no-op rather than
      // a thrown "ctx.getComponentTimeline is not a function" that blocks __MP_READY.
      getComponentTimeline: (typeof __getComponentTimeline !== 'undefined'
        ? __getComponentTimeline
        : function(id) { return gsap.timeline(); })
    };

    // Component's createTimeline function
    var createTimeline = (function() {
      ${scriptSource}
      return createTimeline;
    })();

    if (typeof createTimeline === 'function') {
      // One component throwing (e.g. a tween on an element a revise removed)
      // must degrade to THAT scene rendering static -- not kill the whole
      // document's boot and freeze the film.
      var tl_${safeId} = null;
      try {
        tl_${safeId} = createTimeline(el, data, ctx);
      } catch (eCT_${safeId}) {
        try { console.error('[scene] createTimeline crashed for ${safeId}:', eCT_${safeId} && eCT_${safeId}.message); } catch (e2_${safeId}) {}
      }
      if (tl_${safeId}) {
        master.add(tl_${safeId}, 0);
      }
    }
  })();`;
}

/**
 * Load GSAP source from the local gsap directory.
 * Falls back to a CDN URL in script tag if local files not found.
 */
/**
 * Load the vendored three.js bundle (a single IIFE that defines global THREE
 * plus the addons we bundled: EffectComposer, RenderPass, UnrealBloomPass,
 * ShaderPass, RoundedBoxGeometry). Returns "" if the bundle is absent, so
 * scenes without WebGL components are unaffected.
 */
export async function loadThreeSource(threeDir: string): Promise<string> {
  const filePath = path.join(threeDir, "three.min.js");
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`three.js bundle not found: ${filePath}`);
    return "";
  }
}

export async function loadGsapSource(gsapDir: string): Promise<string> {
  const files = [
    "gsap.min.js",
    "SplitText.min.js",
    "CustomEase.min.js",
    "CustomBounce.min.js",
    "CustomWiggle.min.js",
    "EasePack.min.js",
    "MorphSVGPlugin.min.js",
    "DrawSVGPlugin.min.js",
    "ScrambleTextPlugin.min.js",
  ];
  const sources: string[] = [];

  for (const file of files) {
    const filePath = path.join(gsapDir, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      sources.push(`// ── ${file} ──\n${content}`);
    } catch {
      // If local file not available, we'll use a stub that warns
      console.warn(`GSAP file not found: ${filePath}`);
    }
  }

  if (sources.length === 0) {
    // Fallback: return a minimal stub that creates a no-op gsap object
    // This shouldn't happen in production
    return `
console.warn("GSAP not loaded -- using stub");
var gsap = {
  timeline: function(opts) {
    return {
      paused: true,
      to: function() { return this; },
      from: function() { return this; },
      set: function() { return this; },
      add: function() { return this; },
      time: function() { return this; },
      duration: function() { return 0; }
    };
  },
  to: function() {},
  from: function() {},
  set: function() {}
};`;
  }

  return sources.join("\n\n");
}

/**
 * Load shared script utilities (cursor, typing, camera, script-runner).
 * These are plain .js files that get inlined into the assembled HTML
 * alongside GSAP, making them available to all component scripts.
 */
export async function loadSharedUtilities(): Promise<string> {
  // Resolve path relative to this source file's location in the repo
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const sharedDir = path.join(thisDir, "..", "components", "shared");

  const sharedFiles = ["cursor.js", "typing.js", "camera.js", "script-runner.js", "spring-presets.js", "parallax.js", "text-effects.js", "video-sync.js", "atmosphere.js"];
  const sources: string[] = [];

  for (const file of sharedFiles) {
    try {
      const content = await fs.readFile(path.join(sharedDir, file), "utf-8");
      sources.push(`// ── shared/${file} ──\n${content}`);
    } catch {
      // Shared utilities are optional; warn but don't fail
      console.warn(`Shared utility not found: ${file}`);
    }
  }

  return sources.join("\n\n");
}
