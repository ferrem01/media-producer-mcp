/**
 * Composite Assembler
 *
 * Takes all scenes in a project and produces a single HTML document where
 * each scene is a positioned div. A master GSAP timeline orchestrates all
 * scene timelines sequentially, with transitions as GSAP tweens between
 * scene containers.
 *
 * This replaces the per-scene iframe approach for the preview SPA, enabling:
 * - Accurate scrubbing across scene boundaries
 * - Real-time transition playback (no html2canvas)
 * - Transport clock driven playback (GSAP as puppet)
 */

import { normalizeHtmlUrls } from "./normalize-urls.js";
import { parseComponent, bindTemplate, scopeCSS, type ParsedComponent } from "./component-parser.js";
import { resolveComponentTags } from "./component-tags.js";
import {
  generateFontLinks,
  resolveAssetUrls,
  generateBrandCSS,
  buildPositionStyle,
  buildContentRegionWrapper,
  buildComponentScript,
  loadGsapSource,
  loadThreeSource,
  loadSharedUtilities,
  loadLibraryComponentSources,
  resolveSpeakerVideoTags,
  stripEagerVideoLoading,
  cameraMovesScript,
  wrapperChoreoScript,
  mediaEdlScript,
} from "./scene-assembler.js";
import { config } from "../config.js";
import { resolveAutoCropData, resolveScreencastAutoCrops } from "./asset-intel.js";
import { speakerSceneFilmStarts } from "./speaker-track.js";
import { resolveBrandKitFonts } from "./font-resolve.js";
import type { Scene, SceneComponent, BrandKit, Canvas } from "./types.js";

export interface CompositeComponentSource {
  type: string;
  source: string;
}

export interface CompositeSceneInput {
  scene: Scene;
  components: CompositeComponentSource[];
}

export interface CompositeOptions {
  scenes: CompositeSceneInput[];
  brandKit: BrandKit;
  canvas: Canvas;
  gsapDir: string;
  speakerUrl?: string;
}

/**
 * Assemble all project scenes into a single composite HTML document.
 */
export async function assembleComposite(options: CompositeOptions): Promise<string> {
  const { scenes: sceneInputs, canvas, speakerUrl } = options;
  // Resolve brand fonts FIRST so links and --mp-font-family agree on a
  // family that actually exists (see font-resolve.ts).
  const brandKit = await resolveBrandKitFonts(options.brandKit);

  // Load GSAP + shared utilities once
  const gsapSource = await loadGsapSource(options.gsapDir);
  const sharedSource = await loadSharedUtilities();

  // three.js is heavy (~660KB) -- inline it only when a scene's component
  // actually references the global THREE. The render path (scene-assembler)
  // always did this; the composite (Studio) never did, so WebGL components
  // silently bailed on their `typeof THREE === 'undefined'` guard and the
  // backdrop played as a permanently black canvas.
  const usesThree = options.scenes.some((s) => s.components.some((c) => c.source.includes("THREE")));
  const threeSource = usesThree ? await loadThreeSource(config.threeDir) : "";

  // Codegen scenes embed library components via <component> tags (video,
  // browser frames, charts...). Load the library once if any scene needs it,
  // so those tags resolve here the same way the render path resolves them --
  // an unresolved <component> tag is invisible to the browser, which is how
  // screencast/b-roll videos silently vanished from Studio.
  const anyComponentTags = options.scenes.some((s) =>
    s.components.some((c) => c.source.includes("<component ")));
  const librarySourceMap = new Map<string, string>();
  if (anyComponentTags) {
    for (const cs of await loadLibraryComponentSources(config.componentLibDir)) {
      librarySourceMap.set(cs.type, cs.source);
    }
  }

  // Generate brand kit CSS (use first scene's background as fallback)
  const firstScene = sceneInputs[0]?.scene;
  const { css: brandCSS, theme: sceneTheme, hasBgImage } = generateBrandCSS(brandKit, firstScene?.background, true);

  // Collect font links from brand kit
  const fontLinks = generateFontLinks(brandKit);

  // Build per-scene blocks
  const sceneBlocks: string[] = [];
  const sceneStyles: string[] = [];
  const sceneScripts: string[] = [];
  const sceneMeta: Array<{ id: string; duration: number; transitionIn?: { type: string; duration: number } }> = [];

  // Cumulative scene starts in FILM time (scene durations + inserted
  // transition durations) -- the same clock the render's speaker base and
  // audio follow, so PiP/panel camera views match the voice.
  const sceneStarts = speakerSceneFilmStarts(sceneInputs.map((si2) => si2.scene));

  for (let si = 0; si < sceneInputs.length; si++) {
    const { scene, components } = sceneInputs[si];

    // Parse component sources
    const sourceMap = new Map<string, ParsedComponent>();
    for (const cs of components) {
      sourceMap.set(cs.type, parseComponent(cs.source));
    }

    // Mirror the RENDER's transparency rule for speaker projects: scenes
    // composite over the live camera unless they explicitly opt out
    // (transparent_background === false). Without this, Studio paints each
    // scene's brand background where the render shows the human -- the
    // composite looked nothing like the film.
    const isTransparent = speakerUrl
      ? scene.transparent_background !== false
      : scene.transparent_background === true;
    const sceneBgCSS = generateBrandCSS(brandKit, scene.background, true);

    // Build component blocks for this scene
    const componentBlocks: string[] = [];
    const componentStyles: string[] = [];
    const componentScripts: string[] = [];

    for (const comp of scene.components) {
      const parsed = sourceMap.get(comp.type);
      if (!parsed) continue;

      const preData = comp.type === "screencast-frame" ? await resolveAutoCropData(comp.data) : comp.data;
      const resolvedData = resolveAssetUrls(preData, true, speakerUrl);
      let boundHtml = bindTemplate(parsed.template, resolvedData);
      // Resolve raw <video src="speaker"> PiP tags (same contract as the
      // render and single-scene preview) -- an unresolved token is a dead,
      // empty bubble in Studio.
      if (speakerUrl) {
        boundHtml = resolveSpeakerVideoTags(boundHtml, speakerUrl, sceneStarts[si]);
      }
      const posStyle = buildPositionStyle(comp);

      // Scope component IDs to scene to avoid collisions across scenes
      const scopedCid = `${scene.id}__${comp.id}`;

      // Resolve nested <component> tags (codegen scenes). Each nested
      // instance gets a scene-scoped id (resolveComponentTags restarts at
      // comp_0 per call, so two codegen scenes would otherwise collide),
      // its scoped CSS is collected, and its timeline runs on sceneTl so
      // script-created elements (e.g. the video component's <video>, built
      // by loadVideoForCapture) actually exist in the preview DOM.
      if (boundHtml.includes("<component ") && librarySourceMap.size > 0) {
        boundHtml = await resolveScreencastAutoCrops(boundHtml);
        const tagResult = resolveComponentTags(
          boundHtml,
          librarySourceMap,
          (data) => resolveAssetUrls(data, true, speakerUrl),
        );
        boundHtml = tagResult.html;
        for (const nested of tagResult.components) {
          const nestedCid = `${scene.id}__${nested.id}`;
          // The wrapper quotes ids in data-cid/data-comp-id attrs and scoped
          // CSS selectors -- a quoted replace renames all three coherently.
          boundHtml = boundHtml.split(`"${nested.id}"`).join(`"${nestedCid}"`);
          if (nested.scopedCss) {
            componentStyles.push(
              `/* nested ${nested.type} (${nestedCid}) */\n${nested.scopedCss.split(`"${nested.id}"`).join(`"${nestedCid}"`)}`
            );
          }
          const nestedScript = buildComponentScript(
            { id: nestedCid, type: nested.type, data: nested.data } as SceneComponent,
            nested.parsed.script,
            scene.duration_seconds,
            canvas,
            { motion: brandKit.style?.motion || "cinematic" },
          );
          componentScripts.push(nestedScript.replace(/master\.add\(/g, 'sceneTl.add('));
        }
      }

      componentBlocks.push(
        `    <div class="mp-component" data-cid="${scopedCid}" style="${posStyle}">\n` +
        `      ${boundHtml}\n` +
        `    </div>`
      );

      if (parsed.style) {
        componentStyles.push(
          `/* ${comp.type} (${scopedCid}) */\n${scopeCSS(parsed.style, scopedCid)}`
        );
      }

      // Build component script -- adds to sceneTl (not master)
      const script = buildComponentScript(
        { ...comp, id: scopedCid, data: resolvedData },
        parsed.script,
        scene.duration_seconds,
        canvas,
        { motion: brandKit.style?.motion || "cinematic" },
      );
      // Rewrite "master.add(" to "sceneTl.add(" since each scene has its own timeline
      componentScripts.push(script.replace(/master\.add\(/g, 'sceneTl.add('));
    }

    // Stage wrapper choreography (pose / enter / exit) on this scene's
    // timeline; the composite namespaces wrapper ids, so pass the prefix.
    // The generator emits master.* calls -- rewrite to sceneTl like the rest.
    const choreo = wrapperChoreoScript(scene.components, scene.duration_seconds, `${scene.id}__`);
    if (choreo) componentScripts.push(choreo.replace(/master\./g, "sceneTl."));

    // Media source-maps: stamp each edited video with data-mp-edl so the
    // preview's sync loop plays it through its edit (condensed screencasts).
    if (scene.media_edits && Object.keys(scene.media_edits).length) {
      componentScripts.push(mediaEdlScript(
        scene.media_edits,
        `document.querySelector('.mp-scene[data-scene-id="${scene.id}"]')`,
      ));
    }

    // Direct-manipulation camera moves: deterministic rig on this scene's
    // timeline (same data the render applies -- Studio preview matches).
    if (scene.camera_moves && scene.camera_moves.length) {
      componentScripts.push(cameraMovesScript(
        scene.camera_moves,
        canvas,
        `document.querySelector('.mp-scene[data-scene-id="${scene.id}"]')`,
        "sceneTl",
      ));
    }

    // Determine scene background
    const sceneBg = isTransparent
      ? 'transparent'
      : `var(--mp-color-background, ${scene.background || canvas.background || "#000000"})`;

    // Build content region wrapper for this scene
    const contentRegion = buildContentRegionWrapper(scene, componentBlocks);

    // Scene container div - all start hidden; the master timeline controls visibility
    sceneBlocks.push(
      `  <!-- Scene: ${scene.id} (${si}) -->\n` +
      `  <div class="mp-scene" data-scene-id="${scene.id}" data-scene-index="${si}" ` +
      `style="position:absolute;top:0;left:0;width:${canvas.width}px;height:${canvas.height}px;` +
      `overflow:hidden;background:${sceneBg};visibility:hidden;opacity:0;">\n` +
      ((!isTransparent && sceneBgCSS.hasBgImage)
        ? `    <div class="mp-page-bg" style="position:absolute;inset:0;z-index:0;background:var(--mp-bg-image,none);background-size:cover;background-position:center;"></div>\n`
        : '') +
      `${contentRegion}\n` +
      `  </div>`
    );

    sceneStyles.push(...componentStyles);

    // Scene timeline builder - creates a child timeline for this scene
    sceneScripts.push(
      `  // ── Scene: ${scene.id} ──\n` +
      `  (function() {\n` +
      `    var sceneEl = document.querySelector('[data-scene-id="${scene.id}"]');\n` +
      `    var sceneTl = gsap.timeline({ paused: true });\n\n` +
      componentScripts.join("\n\n") +
      `\n\n    window.__MP_SCENE_TIMELINES["${scene.id}"] = sceneTl;\n` +
      `    window.__MP_SCENE_ELEMENTS["${scene.id}"] = sceneEl;\n` +
      `  })();`
    );

    // Collect scene metadata for master timeline construction
    const transIn = scene.transition_in;
    sceneMeta.push({
      id: scene.id,
      duration: scene.duration_seconds,
      transitionIn: transIn && transIn.type && transIn.type !== "none" && transIn.duration_seconds > 0
        ? { type: transIn.type, duration: transIn.duration_seconds }
        : undefined,
    });
  }

  // Build the master timeline orchestration script
  const masterScript = buildMasterTimelineScript(sceneMeta, canvas);

  const html = `<!DOCTYPE html>
<html data-theme="${sceneTheme}">
<head>
<meta charset="utf-8">
${fontLinks}
<style>
/* ── Brand Kit ── */
${brandCSS}

/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${canvas.width}px;
  height: ${canvas.height}px;
  overflow: hidden;
  background: transparent;
}

/* ── Scene containers ── */
.mp-scene {
  position: absolute;
  top: 0; left: 0;
  width: ${canvas.width}px;
  height: ${canvas.height}px;
  overflow: hidden;
}

/* ── Component containers ── */
.mp-component {
  position: absolute;
  overflow: hidden;
}

.mp-component * {
  max-width: 100%;
  box-sizing: border-box;
}

img, video {
  max-width: 100%;
  height: auto;
}

/* ── Scene Styles ── */
${sceneStyles.join("\n\n")}
</style>
${threeSource ? `<!-- three.js (bundled: three + addons, global THREE). MUST be its own
     <script>: the bundle opens with "use strict", and concatenating it with the
     GSAP block below would make that block strict too. -->
<script>
${threeSource}
</script>
` : ""}<script>
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
<!-- No camera underlay here: the Studio shell renders its own speaker layer
     (#speaker-bg, drift-synced by syncMedia) behind this transparent
     composite. Injecting one too meant TWO simultaneous 1080p decoders for
     the same camera file -- enough to kill a mobile tab on open. -->${""}
${sceneBlocks.join("\n\n")}

<script>
(function() {
  // Scene timeline + element registries
  window.__MP_SCENE_TIMELINES = {};
  window.__MP_SCENE_ELEMENTS = {};

  // Build per-scene GSAP timelines
${sceneScripts.join("\n\n")}

  // Build master timeline that orchestrates scenes + transitions
${masterScript}

  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  // The composite is always a preview surface -- never let scene videos
  // eagerly decode; syncMedia drives playback when the user presses Play.
  return stripEagerVideoLoading(normalizeHtmlUrls(html));
}

/**
 * Build the master timeline script that sequences scenes and adds transitions.
 *
 * The master timeline is a single GSAP timeline where:
 * - Each scene occupies its duration window
 * - Scene visibility is controlled by autoAlpha tweens
 * - Transitions overlap the end of scene A and start of scene B
 * - Scene child timelines are seeked in sync via onUpdate callback
 */
function buildMasterTimelineScript(
  scenes: Array<{ id: string; duration: number; transitionIn?: { type: string; duration: number } }>,
  canvas: Canvas,
): string {
  if (scenes.length === 0) return '  window.__MP_TIMELINE = gsap.timeline({ paused: true });\n  window.__MP_DURATION = 0;';

  // Compute timeline positions for each scene
  // Transitions overlap: scene B starts `transition.duration` before scene A ends
  const positions: Array<{ id: string; start: number; duration: number; transIn?: { type: string; duration: number } }> = [];
  let cursor = 0;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const overlap = (i > 0 && s.transitionIn) ? s.transitionIn.duration : 0;
    const start = Math.max(0, cursor - overlap);

    positions.push({
      id: s.id,
      start,
      duration: s.duration,
      transIn: i > 0 ? s.transitionIn : undefined,
    });

    cursor = start + s.duration;
  }

  const totalDuration = cursor;

  // Generate the script
  let script = `  var master = gsap.timeline({ paused: true });\n`;
  script += `  var sceneMeta = ${JSON.stringify(positions)};\n`;
  script += `  var totalDur = ${totalDuration};\n\n`;

  // For each scene, add visibility + child timeline sync
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];

    script += `  // Scene ${i}: ${p.id} (${p.start.toFixed(3)}s - ${(p.start + p.duration).toFixed(3)}s)\n`;
    script += `  (function() {\n`;
    script += `    var sceneEl = window.__MP_SCENE_ELEMENTS["${p.id}"];\n`;
    script += `    var sceneTl = window.__MP_SCENE_TIMELINES["${p.id}"];\n`;
    script += `    if (!sceneEl || !sceneTl) return;\n\n`;

    // Make scene visible at start
    script += `    // Visibility: show at start\n`;
    script += `    master.set(sceneEl, { visibility: "visible", autoAlpha: 1 }, ${p.start});\n`;

    // If there's a transition into this scene
    if (p.transIn && i > 0) {
      const prevPos = positions[i - 1];
      const transDur = p.transIn.duration;
      const transStart = p.start;

      script += `\n    // Transition: ${p.transIn.type} (${transDur}s)\n`;
      script += `    var prevSceneEl = window.__MP_SCENE_ELEMENTS["${prevPos.id}"];\n`;
      script += `    if (prevSceneEl) {\n`;
      script += buildCompositeTransitionScript(p.transIn.type, transDur, transStart);
      script += `    }\n`;
    }

    // Hide scene after it ends
    const hideTime = p.start + p.duration;
    script += `    master.set(sceneEl, { visibility: "hidden", autoAlpha: 0 }, ${hideTime});\n`;

    // Drive scene child timeline from master via a proxy tween
    script += `\n    // Drive scene timeline from master\n`;
    script += `    master.to({ t: 0 }, {\n`;
    script += `      t: ${p.duration},\n`;
    script += `      duration: ${p.duration},\n`;
    script += `      ease: "none",\n`;
    script += `      onUpdate: function() {\n`;
    script += `        var localTime = this.progress() * ${p.duration};\n`;
    script += `        sceneTl.time(Math.min(localTime, sceneTl.duration()));\n`;
    script += `      }\n`;
    script += `    }, ${p.start});\n`;

    script += `  })();\n\n`;
  }

  script += `  window.__MP_TIMELINE = master;\n`;
  script += `  window.__MP_DURATION = ${totalDuration};\n`;
  script += `  window.__MP_SCENE_META = sceneMeta;\n`;

  return script;
}

/**
 * Build transition GSAP tweens between two scene container elements.
 * prevSceneEl and sceneEl are available in the caller's scope.
 */
function buildCompositeTransitionScript(type: string, duration: number, transStart: number): string {
  switch (type) {
    case "crossfade":
      return `      master.to(prevSceneEl, { autoAlpha: 0, duration: ${duration}, ease: "none" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: ${duration}, ease: "none" }, ${transStart});\n`;

    case "blur-crossfade":
      return `      master.to(prevSceneEl, { autoAlpha: 0, filter: "blur(20px)", duration: ${duration} }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { autoAlpha: 0, filter: "blur(20px)" }, { autoAlpha: 1, filter: "blur(0px)", duration: ${duration} }, ${transStart});\n`;

    case "zoom-through": {
      const half = duration * 0.5;
      return `      master.to(prevSceneEl, { scale: 1.5, autoAlpha: 0, duration: ${half}, ease: "power2.in" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { scale: 1.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: ${half}, ease: "power2.out" }, ${transStart + half});\n`;
    }

    case "match-cut":
      // Preview approximation of the render's anchored punch-through
      // (center-anchored here; the render reads declared template anchors).
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.to(prevSceneEl, { scale: 1.55, autoAlpha: 0, filter: "blur(12px)", transformOrigin: "50% 45%", duration: ${duration}, ease: "power2.in" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { scale: 1.3, autoAlpha: 0, filter: "blur(10px)", transformOrigin: "50% 45%" }, { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: ${duration * 0.62}, ease: "power3.out" }, ${transStart + duration * 0.38});\n`;

    case "slide-up":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { yPercent: 100, autoAlpha: 1 }, { yPercent: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "slide-down":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { yPercent: -100, autoAlpha: 1 }, { yPercent: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "slide-left":
    case "slide-reveal":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { xPercent: 100, autoAlpha: 1 }, { xPercent: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "slide-right":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { xPercent: -100, autoAlpha: 1 }, { xPercent: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "morph-wipe":
    case "iris":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { clipPath: "circle(0% at 50% 50%)", autoAlpha: 1 }, { clipPath: "circle(150% at 50% 50%)", duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "push":
      return `      master.to(prevSceneEl, { xPercent: -100, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { xPercent: 100, autoAlpha: 1 }, { xPercent: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "wipe-left":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { clipPath: "inset(0 100% 0 0)", autoAlpha: 1 }, { clipPath: "inset(0 0% 0 0)", duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "wipe-right":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { clipPath: "inset(0 0 0 100%)", autoAlpha: 1 }, { clipPath: "inset(0 0 0 0%)", duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "wipe-up":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { clipPath: "inset(100% 0 0 0)", autoAlpha: 1 }, { clipPath: "inset(0% 0 0 0)", duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "wipe-down":
      return `      sceneEl.style.zIndex = "2";\n` +
             `      master.fromTo(sceneEl, { clipPath: "inset(0 0 100% 0)", autoAlpha: 1 }, { clipPath: "inset(0 0 0% 0)", duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "glitch-cut": {
      const glitchDur = Math.min(duration * 0.6, 0.3);
      return `      gsap.set(sceneEl, { autoAlpha: 0 });\n` +
             `      var _cutPoint = ${transStart + duration} - 0.05;\n` +
             `      master.to(prevSceneEl, { x: "+=8", filter: "hue-rotate(90deg) saturate(3)", duration: ${glitchDur * 0.15}, yoyo: true, repeat: 5, ease: "steps(1)" }, ${transStart});\n` +
             `      master.set(prevSceneEl, { autoAlpha: 0 }, _cutPoint);\n` +
             `      master.set(sceneEl, { autoAlpha: 1 }, _cutPoint);\n`;
    }

    case "scale-rotate":
      return `      master.to(prevSceneEl, { scale: 0.8, rotation: -5, autoAlpha: 0, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { scale: 1.2, rotation: 5, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: ${duration}, ease: "power2.inOut" }, ${transStart});\n`;

    case "curtain":
      // Curtain is complex (creates DOM elements). Fall back to crossfade for composite preview.
      return `      master.to(prevSceneEl, { autoAlpha: 0, duration: ${duration}, ease: "none" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: ${duration}, ease: "none" }, ${transStart});\n`;

    default:
      // Fallback to crossfade
      return `      master.to(prevSceneEl, { autoAlpha: 0, duration: ${duration}, ease: "none" }, ${transStart});\n` +
             `      master.fromTo(sceneEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: ${duration}, ease: "none" }, ${transStart});\n`;
  }
}
