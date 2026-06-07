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

import { parseComponent, bindTemplate, scopeCSS, type ParsedComponent } from "./component-parser.js";
import {
  generateFontLinks,
  resolveAssetUrls,
  generateBrandCSS,
  buildPositionStyle,
  buildContentRegionWrapper,
  buildComponentScript,
  loadGsapSource,
  loadSharedUtilities,
} from "./scene-assembler.js";
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
  const { scenes: sceneInputs, brandKit, canvas, speakerUrl } = options;

  // Load GSAP + shared utilities once
  const gsapSource = await loadGsapSource(options.gsapDir);
  const sharedSource = await loadSharedUtilities();

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

  for (let si = 0; si < sceneInputs.length; si++) {
    const { scene, components } = sceneInputs[si];

    // Parse component sources
    const sourceMap = new Map<string, ParsedComponent>();
    for (const cs of components) {
      sourceMap.set(cs.type, parseComponent(cs.source));
    }

    const isTransparent = scene.transparent_background === true;
    const sceneBgCSS = generateBrandCSS(brandKit, scene.background, true);

    // Build component blocks for this scene
    const componentBlocks: string[] = [];
    const componentStyles: string[] = [];
    const componentScripts: string[] = [];

    for (const comp of scene.components) {
      const parsed = sourceMap.get(comp.type);
      if (!parsed) continue;

      const resolvedData = resolveAssetUrls(comp.data, true, speakerUrl);
      const boundHtml = bindTemplate(parsed.template, resolvedData);
      const posStyle = buildPositionStyle(comp);

      // Scope component IDs to scene to avoid collisions across scenes
      const scopedCid = `${scene.id}__${comp.id}`;

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
  background: ${canvas.background || "#000000"};
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
<script>
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

  return html;
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
