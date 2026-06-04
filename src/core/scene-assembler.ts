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

import { parseComponent, bindTemplate, scopeCSS, type ParsedComponent } from "./component-parser.js";
import type { Scene, SceneComponent, BrandKit, Canvas } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
}

/**
 * Assemble a scene into a self-contained HTML document.
 */
export async function assembleScene(options: AssembleOptions): Promise<string> {
  const { scene, components, brandKit, canvas } = options;

  // Build a lookup of component sources by type
  const sourceMap = new Map<string, ParsedComponent>();
  for (const cs of components) {
    sourceMap.set(cs.type, parseComponent(cs.source));
  }

  // Generate brand kit CSS variables
  const brandCSS = generateBrandCSS(brandKit, scene.background);

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
    const boundHtml = bindTemplate(parsed.template, comp.data);

    // Position the component
    const posStyle = buildPositionStyle(comp);

    // Wrap in container div
    componentBlocks.push(
      `  <!-- Component: ${comp.type} (${comp.id}) -->\n` +
      `  <div class="mp-component" data-cid="${comp.id}" style="${posStyle}">\n` +
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
    componentScripts.push(buildComponentScript(comp, parsed.script, scene.duration_seconds, canvas, {
      motion: brandKit.style?.motion || "cinematic",
    }));
  }

  // Read GSAP source (bundled locally)
  const gsapSource = await loadGsapSource(options.gsapDir);

  // Read shared script utilities
  const sharedSource = await loadSharedUtilities();

  // Assemble final HTML
  const html = `<!DOCTYPE html>
<html>
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
  background: var(--mp-color-background, ${scene.background || canvas.background || "#000000"});
}

/* ── Component containers ── */
.mp-component {
  position: absolute;
  overflow: hidden;
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
${componentBlocks.join("\n\n")}

<script>
(function() {
  const master = gsap.timeline({ paused: true });

${componentScripts.join("\n\n")}

  // Expose for Playwright capture
  window.__MP_TIMELINE = master;
  window.__MP_DURATION = ${scene.duration_seconds};
  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  return html;
}

/**
 * Generate Google Fonts link tags from the brand kit.
 */
function generateFontLinks(brand: BrandKit): string {
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
 * Generate CSS custom properties from the brand kit.
 */
function generateBrandCSS(brand: BrandKit, sceneBackground?: string): string {
  const vars: string[] = [];

  if (brand.colors) {
    for (const [key, value] of Object.entries(brand.colors)) {
      vars.push(`  --mp-color-${key.replace(/_/g, "-")}: ${value};`);
    }
  }

  // Scene-level background override: when a scene explicitly sets a background
  // color, it takes priority over the brand kit default.
  if (sceneBackground) {
    vars.push(`  --mp-color-background: ${sceneBackground};`);
  }

  if (brand.fonts?.length) {
    vars.push(`  --mp-font-family: '${brand.fonts[0].family}', sans-serif;`);
  }

  if (brand.style?.border_radius) {
    vars.push(`  --mp-border-radius: ${brand.style.border_radius};`);
  }

  if (brand.style?.motion) {
    vars.push(`  --mp-motion-style: ${brand.style.motion};`);
  }

  return `:root {\n${vars.join("\n")}\n}`;
}

/**
 * Build inline position style for a component container.
 */
function buildPositionStyle(comp: SceneComponent): string {
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
 * Build a script block that creates a component's GSAP timeline
 * and adds it to the master timeline.
 */
function buildComponentScript(
  comp: SceneComponent,
  scriptSource: string,
  duration: number,
  canvas: Canvas,
  options?: { motion?: string },
): string {
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
      motion: "${options?.motion || "cinematic"}"
    };

    // Component's createTimeline function
    var createTimeline = (function() {
      ${scriptSource}
      return createTimeline;
    })();

    if (typeof createTimeline === 'function') {
      var tl_${safeId} = createTimeline(el, data, ctx);
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
async function loadGsapSource(gsapDir: string): Promise<string> {
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
async function loadSharedUtilities(): Promise<string> {
  // Resolve path relative to this source file's location in the repo
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const sharedDir = path.join(thisDir, "..", "components", "shared");

  const sharedFiles = ["cursor.js", "typing.js", "camera.js", "script-runner.js", "spring-presets.js", "parallax.js", "text-effects.js", "video-sync.js"];
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
