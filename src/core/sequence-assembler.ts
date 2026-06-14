/**
 * Sequence Assembler
 *
 * Assembles a SEQUENCE scene -- a multi-beat continuous take using
 * real library/project components. Unlike the regular scene assembler
 * which starts all component timelines at t=0, the sequence assembler:
 *
 * 1. Places ALL components on a shared stage (initially hidden)
 * 2. Builds a master GSAP timeline with labeled beats
 * 3. At each beat, controls which components are visible and where
 * 4. Triggers each component's createTimeline at the right offset
 * 5. Adds connecting animations (slides, fades, scales) between beats
 *
 * The result is one continuous take where components persist and
 * transform across beats instead of being replaced.
 */

import { normalizeHtmlUrls } from "./normalize-urls.js";
import {
  parseComponent,
  bindTemplate,
  scopeCSS,
  type ParsedComponent,
} from "./component-parser.js";
import {
  generateBrandCSS,
  generateFontLinks,
  resolveAssetUrls,
  loadGsapSource,
  loadSharedUtilities,
  buildPositionStyle,
  type ComponentSource,
} from "./scene-assembler.js";
import type { Scene, SceneComponent, BrandKit, Canvas, SequenceBeat } from "./types.js";

// ── Types ──

export interface SequenceBeatChoreography {
  /** Beat label (matches SequenceBeat.label) */
  label: string;
  /** Start time in seconds (auto-calculated from beat durations) */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Components visible during this beat (by component id) */
  visibleComponents: string[];
  /** Position overrides for components during this beat */
  positions?: Record<string, { x: string; y: string; width: string; height: string }>;
  /** Transition animation for components entering/exiting this beat */
  transitions?: Record<string, {
    enter?: { from: Record<string, any>; duration?: number; ease?: string };
    exit?: { to: Record<string, any>; duration?: number; ease?: string };
    move?: { to: Record<string, any>; duration?: number; ease?: string };
  }>;
}

export interface SequenceAssembleOptions {
  scene: Scene;
  components: ComponentSource[];
  brandKit: BrandKit;
  canvas: Canvas;
  gsapDir: string;
  /** Choreography for each beat. If not provided, auto-generated from beats. */
  choreography?: SequenceBeatChoreography[];
  preview?: boolean;
  speakerUrl?: string;
}

/**
 * Assemble a sequence scene into a self-contained HTML document.
 */
export async function assembleSequence(options: SequenceAssembleOptions): Promise<string> {
  const { scene, components, brandKit, canvas, preview, speakerUrl } = options;

  if (!scene.beats?.length) {
    throw new Error("Sequence assembler requires scene.beats[]");
  }

  // Parse component sources
  const sourceMap = new Map<string, ParsedComponent>();
  for (const cs of components) {
    sourceMap.set(cs.type, parseComponent(cs.source));
  }

  // Generate brand CSS
  const { css: brandCSS, theme: sceneTheme, hasBgImage } = generateBrandCSS(brandKit, scene.background, preview);

  // Build choreography from beats if not provided
  const choreography = fillMissingStartTimes(options.choreography || buildAutoChoreography(scene), scene);

  // Process each component (ALL of them, regardless of beat visibility)
  const componentBlocks: string[] = [];
  const componentStyles: string[] = [];
  const componentScriptFns: string[] = [];

  for (const comp of scene.components) {
    const parsed = sourceMap.get(comp.type);
    if (!parsed) {
      console.warn(`[sequence] Component "${comp.type}" not found, skipping`);
      continue;
    }

    const resolvedData = resolveAssetUrls(comp.data || {}, preview, speakerUrl);
    const boundHtml = bindTemplate(parsed.template, resolvedData);
    const posStyle = buildPositionStyle(comp);

    // All components start hidden (opacity: 0)
    componentBlocks.push(
      `  <!-- Component: ${comp.type} (${comp.id}) -->\n` +
      `  <div class="mp-component mp-seq-component" data-cid="${comp.id}" style="${posStyle}; opacity: 0; visibility: hidden;">\n` +
      `    ${boundHtml}\n` +
      `  </div>`
    );

    if (parsed.style) {
      componentStyles.push(
        `/* ${comp.type} (${comp.id}) */\n${scopeCSS(parsed.style, comp.id)}`
      );
    }

    // Store the createTimeline function for later orchestration
    const safeId = comp.id.replace(/[^a-zA-Z0-9_]/g, "_");
    const normalizedScript = parsed.script
      .replace(/export\s+default\s+function\s+/g, "function ")
      .replace(/^\s*export\s+/gm, "");

    componentScriptFns.push(`
  // ── ${comp.type} (${comp.id}) -- timeline factory ──
  var createTimeline_${safeId} = (function() {
    ${normalizedScript}
    return createTimeline;
  })();`);
  }

  // Build the choreography script
  const choreographyScript = buildChoreographyScript(scene, choreography, canvas);

  // Load GSAP and shared utilities
  const gsapSource = await loadGsapSource(options.gsapDir);
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

/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${canvas.width}px;
  height: ${canvas.height}px;
  overflow: hidden;
  clip-path: inset(0);
  background: var(--mp-color-background, ${scene.background || canvas.background || "#000000"});
}

/* ── Sequence stage ── */
.mp-sequence-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.mp-component {
  position: absolute;
  overflow: hidden;
}

.mp-seq-component {
  will-change: transform, opacity;
}

/* ── Ambient ── */
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
    radial-gradient(1.5px 1.5px at 60% 20%, var(--mp-color-primary, #6366f1), transparent);
  background-size: 100% 100%;
  animation: mp-ambient-drift 8s ease-in-out infinite alternate;
}
@keyframes mp-ambient-drift {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(10px, -15px) scale(1.01); }
}

/* ── Component Styles ── */
${componentStyles.join("\n\n")}
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
<div class="mp-camera" style="position:absolute;inset:-20px;width:calc(100% + 40px);height:calc(100% + 40px);will-change:transform;">
<div class="mp-ambient"></div>
<div class="mp-sequence-stage">
${componentBlocks.join("\n\n")}
</div>
</div>

<script>
(function() {
  var master = gsap.timeline({ paused: true });
  var totalDuration = ${scene.duration_seconds};

  // ── Camera motion ──
  var cameraEl = document.querySelector('.mp-camera');
  if (cameraEl) {
    master.to(cameraEl, {
      scale: 1.03,
      x: 6,
      y: -4,
      duration: totalDuration,
      ease: 'none',
    }, 0);
  }

  // ── Component timeline factories ──
${componentScriptFns.join("\n")}

  // ── Sequence choreography ──
${choreographyScript}

  // Expose for Playwright capture
  window.__MP_TIMELINE = master;
  window.__MP_DURATION = totalDuration;
  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  return normalizeHtmlUrls(html);
}

/**
 * Fill in missing startTime/duration on choreography entries.
 * The LLM planner sometimes omits startTime; we derive it from
 * cumulative beat durations so the assembler always has valid timing.
 */
function fillMissingStartTimes(
  choreography: SequenceBeatChoreography[],
  scene: Scene,
): SequenceBeatChoreography[] {
  var needsFill = choreography.some(c => c.startTime == null);
  if (!needsFill) return choreography;

  // Build a label->duration map from scene beats
  var beatDurations = new Map<string, number>();
  if (scene.beats) {
    for (var b of scene.beats) {
      beatDurations.set(b.label, b.duration_seconds);
    }
  }

  var runningTime = 0;
  return choreography.map(c => {
    var duration = c.duration ?? beatDurations.get(c.label) ?? 5;
    var startTime = c.startTime ?? runningTime;
    runningTime = startTime + duration;
    return { ...c, startTime, duration };
  });
}

/**
 * Auto-generate choreography from scene beats.
 * Each beat shows all components (simple sequential reveal).
 */
function buildAutoChoreography(scene: Scene): SequenceBeatChoreography[] {
  if (!scene.beats?.length) return [];

  var choreography: SequenceBeatChoreography[] = [];
  var startTime = 0;
  var allComponentIds = scene.components.map(c => c.id);

  for (var beat of scene.beats) {
    choreography.push({
      label: beat.label,
      startTime,
      duration: beat.duration_seconds,
      visibleComponents: allComponentIds,
    });
    startTime += beat.duration_seconds;
  }

  return choreography;
}

/**
 * Build the choreography script that orchestrates component timelines
 * across beats on the master timeline.
 */
function buildChoreographyScript(
  scene: Scene,
  choreography: SequenceBeatChoreography[],
  canvas: Canvas,
): string {
  var lines: string[] = [];

  // Build beat labels
  for (var beat of choreography) {
    lines.push(`  master.addLabel('${beat.label}', ${beat.startTime});`);
  }
  lines.push('');

  // For each beat, show/hide components and trigger their timelines
  for (var bi = 0; bi < choreography.length; bi++) {
    var beat = choreography[bi];
    var prevBeat = bi > 0 ? choreography[bi - 1] : null;

    lines.push(`  // ── Beat: ${beat.label} (${beat.startTime}s - ${beat.startTime + beat.duration}s) ──`);

    for (var comp of scene.components) {
      var safeId = comp.id.replace(/[^a-zA-Z0-9_]/g, "_");
      var el = `document.querySelector('[data-cid="${comp.id}"]')`;
      var isVisible = beat.visibleComponents.includes(comp.id);
      var wasVisible = prevBeat ? prevBeat.visibleComponents.includes(comp.id) : false;

      if (isVisible && !wasVisible) {
        // Component enters this beat
        var enterFrom = beat.transitions?.[comp.id]?.enter?.from || { opacity: 0, x: 100 };
        var enterDur = beat.transitions?.[comp.id]?.enter?.duration || 0.6;
        var enterEase = beat.transitions?.[comp.id]?.enter?.ease || 'power2.out';

        lines.push(`  // Show ${comp.id}`);
        lines.push(`  master.set(${el}, { visibility: 'visible', opacity: 0 }, ${beat.startTime});`);
        lines.push(`  master.fromTo(${el}, ${JSON.stringify(enterFrom)}, { opacity: 1, x: 0, y: 0, scale: 1, duration: ${enterDur}, ease: '${enterEase}' }, ${beat.startTime});`);

        // Trigger component's internal timeline at beat start
        lines.push(`  (function() {`);
        lines.push(`    var compEl = ${el};`);
        lines.push(`    if (compEl && typeof createTimeline_${safeId} === 'function') {`);
        lines.push(`      var ctx = { duration: ${beat.duration}, fps: ${canvas.fps}, canvas: { width: ${canvas.width}, height: ${canvas.height} }, motion: 'cinematic' };`);
        lines.push(`      var compTl = createTimeline_${safeId}(compEl, ${JSON.stringify(comp.data || {})}, ctx);`);
        lines.push(`      if (compTl) master.add(compTl, ${beat.startTime});`);
        lines.push(`    }`);
        lines.push(`  })();`);
      } else if (isVisible && wasVisible) {
        // Component persists -- apply position change if specified
        var moveTo = beat.transitions?.[comp.id]?.move?.to;
        if (moveTo) {
          var moveDur = beat.transitions?.[comp.id]?.move?.duration || 0.8;
          var moveEase = beat.transitions?.[comp.id]?.move?.ease || 'power2.inOut';
          lines.push(`  // Move ${comp.id}`);
          lines.push(`  master.to(${el}, { ...${JSON.stringify(moveTo)}, duration: ${moveDur}, ease: '${moveEase}' }, ${beat.startTime});`);
        }
      } else if (!isVisible && wasVisible) {
        // Component exits this beat
        var exitTo = beat.transitions?.[comp.id]?.exit?.to || { opacity: 0, x: -100 };
        var exitDur = beat.transitions?.[comp.id]?.exit?.duration || 0.4;
        var exitEase = beat.transitions?.[comp.id]?.exit?.ease || 'power2.in';
        lines.push(`  // Hide ${comp.id}`);
        lines.push(`  master.to(${el}, { ...${JSON.stringify(exitTo)}, duration: ${exitDur}, ease: '${exitEase}' }, ${beat.startTime});`);
        lines.push(`  master.set(${el}, { visibility: 'hidden' }, ${beat.startTime + exitDur});`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
