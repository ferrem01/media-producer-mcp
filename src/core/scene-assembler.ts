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
import { config } from "../config.js";

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
  /** When true, keep /assets/ HTTP paths instead of converting to file:// (for preview SPA) */
  preview?: boolean;
  /** HTTP URL for the speaker video (used in preview to resolve "speaker" references) */
  speakerUrl?: string;
}

/**
 * Assemble a scene into a self-contained HTML document.
 */
export async function assembleScene(options: AssembleOptions): Promise<string> {
  const { scene, components, brandKit, canvas, preview, speakerUrl } = options;

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
    const resolvedData = resolveAssetUrls(comp.data, preview, speakerUrl);
    const boundHtml = bindTemplate(parsed.template, resolvedData);

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
    componentScripts.push(buildComponentScript({ ...comp, data: resolvedData }, parsed.script, scene.duration_seconds, canvas, {
      motion: brandKit.style?.motion || "cinematic",
    }));
  }

  // Read GSAP source (bundled locally)
  const gsapSource = await loadGsapSource(options.gsapDir);

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
  background: ${isTransparent ? 'transparent' : `var(--mp-color-background, ${scene.background || canvas.background || "#000000"})`};
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
${isTransparent ? '' : hasBgImage ? '<div class="mp-page-bg" style="position:absolute;inset:0;z-index:0;background:var(--mp-bg-image,none);background-size:cover;background-position:center;"></div>' : ''}
${buildContentRegionWrapper(scene, componentBlocks)}

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
 * Resolve relative /assets/ URLs in component data to absolute URLs so they
 * work when loaded via file:// protocol in Playwright.
 */
function resolveAssetUrls(data: Record<string, any>, preview?: boolean, speakerUrl?: string): Record<string, any> {
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
      resolved[key] = `${baseUrl}${val}`;
    } else if (preview && typeof val === "string" && val.startsWith("file://")) {
      // In preview mode, convert file:// paths back to HTTP-servable paths.
      // file://{dataDir}/{tenant}/... -> /assets/{tenant}/...
      resolved[key] = fileUrlToHttpUrl(val);
    } else if (Array.isArray(val)) {
      resolved[key] = val.map((v: any) =>
        typeof v === "string" && v.startsWith("/assets/")
          ? resolveAssetPath(v, preview)
          : typeof v === "string" && v.startsWith("/api/")
          ? `${baseUrl}${v}`
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
    return `http://localhost:${config.port}/assets/${projMatch[1]}/projects/${projMatch[2]}/assets/${projMatch[3]}`;
  }

  // {dataDir}/{tenant}/brand-kit/assets/{rest} -> /assets/{tenant}/brand-kit/{rest}
  const brandMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/brand-kit/assets/(.+)$`));
  if (brandMatch) {
    return `http://localhost:${config.port}/assets/${brandMatch[1]}/brand-kit/${brandMatch[2]}`;
  }

  // {dataDir}/{tenant}/projects/{projectId}/_work/{rest} -> /work/{tenant}/projects/{projectId}/{rest}
  const workMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/projects/([^/]+)/_work/(.+)$`));
  if (workMatch) {
    return `http://localhost:${config.port}/work/${workMatch[1]}/projects/${workMatch[2]}/${workMatch[3]}`;
  }

  // {dataDir}/{tenant}/assets/{rest} -> /assets/{tenant}/assets/{rest}  (tenant-level assets)
  const tenantMatch = filePath.match(new RegExp(`^${dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/assets/(.+)$`));
  if (tenantMatch) {
    return `http://localhost:${config.port}/assets/${tenantMatch[1]}/assets/${tenantMatch[2]}`;
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
    return `file://${path.resolve(config.dataDir, brandMatch[1], "brand-kit", "assets", brandMatch[2])}`;
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
function pickBrandBackground(brand: BrandKit, isDark: boolean): string | undefined {
  const bgAssets = (brand.assets || []).filter(a => a.type === 'background');
  if (bgAssets.length === 0) return undefined;

  const darkTags = /dark|night|deep|midnight/i;
  const lightTags = /light|white|bright|soft|pastel/i;

  const darkBgs = bgAssets.filter(a =>
    (a.tags || []).some(t => darkTags.test(t)) || darkTags.test(a.name)
  );
  const lightBgs = bgAssets.filter(a =>
    (a.tags || []).some(t => lightTags.test(t)) || lightTags.test(a.name)
  );

  if (isDark) {
    // Prefer dark backgrounds, fall back to any
    const pool = darkBgs.length > 0 ? darkBgs : bgAssets;
    return pool[Math.floor(Math.random() * pool.length)]?.url;
  } else {
    const pool = lightBgs.length > 0 ? lightBgs : bgAssets;
    return pool[Math.floor(Math.random() * pool.length)]?.url;
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
function generateBrandCSS(brand: BrandKit, sceneBackground?: string, preview?: boolean): { css: string; theme: "dark" | "light"; hasBgImage: boolean } {
  const vars: string[] = [];

  // ── Determine effective theme ──
  // Templates are dark by default. The scene is "light" only if the brand
  // background is explicitly light AND no dark background image is being used.
  const effectiveBg = sceneBackground || brand.colors?.background || '#0f172a';
  const brandIsLight = isLightColor(effectiveBg);

  // Templates are designed for dark backgrounds. When the brand kit has a light
  // background color but also has dark background images (which templates will
  // use), the scene is still dark. Only treat as truly light if there are NO
  // dark background assets available.
  const bgAssets = (brand.assets || []).filter(a => a.type === 'background');
  const hasDarkBgs = bgAssets.some(a =>
    (a.tags || []).some(t => /dark|night|deep|midnight/i.test(t)) ||
    /dark|night|deep|midnight/i.test(a.name)
  );

  // Scene is dark if: brand bg is dark, OR brand has dark background images
  const sceneIsDark = !brandIsLight || hasDarkBgs;

  // ── Colors ──
  if (brand.colors) {
    for (const [key, value] of Object.entries(brand.colors)) {
      // Skip text and text_muted -- we handle them theme-aware below
      if (key === 'text' || key === 'text_muted') continue;
      vars.push(`  --mp-color-${key.replace(/_/g, '-')}: ${value};`);
    }
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

  // Scene-level background override
  if (sceneBackground) {
    vars.push(`  --mp-color-background: ${sceneBackground};`);
  } else if (sceneIsDark && brandIsLight) {
    // Brand bg is light but scene is dark (dark bg images override).
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
  const bgUrl = pickBrandBackground(brand, sceneIsDark);
  if (bgUrl) {
    // Resolve relative URLs to absolute for file:// protocol
    const resolvedUrl = bgUrl.startsWith('/assets/')
      ? resolveAssetPath(bgUrl, preview)
      : bgUrl.startsWith('/api/')
      ? `http://localhost:${config.port}${bgUrl}`
      : bgUrl;
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

  return { css: `:root {\n${vars.join('\n')}\n}`, theme: sceneIsDark ? 'dark' : 'light', hasBgImage: !!bgUrl };
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
 * Wrap component blocks in a content_region container when specified.
 * If no content_region is set, returns the blocks joined normally.
 *
 * When content_region is present, all components are placed inside a
 * positioned div that occupies the specified side and width of the frame.
 * This leaves the other side clear for the speaker video (full-behind mode).
 */
function buildContentRegionWrapper(scene: Scene, componentBlocks: string[]): string {
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
