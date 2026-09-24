/**
 * Builds a self-contained HTML page for previewing a single component
 * in the Playground iframe.
 */

export interface PlaygroundPreviewOptions {
  boundHtml: string;
  scopedCSS: string;
  gsapSource: string;
  sharedSource: string;
  script: string;
  data: Record<string, unknown>;
  /** `:root { --mp-color-* }` from the tenant's brand kit (generateBrandCSS),
   *  so a component previews in the colors a build gives it. */
  brandCss?: string;
  /** Font <link>s for the brand's fonts. */
  fontLinks?: string;
  /** The page behind the component (the brand background). */
  background?: string;
}

export function buildPlaygroundPreview(opts: PlaygroundPreviewOptions): string {
  const { boundHtml, scopedCSS, gsapSource, sharedSource, script, data } = opts;
  const bg = opts.background || "#ffffff";
  // The brand's vars when known; otherwise the app's LIGHT defaults. These
  // used to be the old dark slate theme (white text), so every scene
  // template -- which draws its own light backdrop -- previewed white on white.
  const rootVars = opts.brandCss || [
    ":root {",
    "  --mp-color-primary: #393bf5;",
    "  --mp-color-secondary: #6366f1;",
    "  --mp-color-accent: #393bf5;",
    "  --mp-color-background: #ffffff;",
    "  --mp-color-surface: #f4f4f7;",
    "  --mp-color-text: #17171c;",
    "  --mp-color-text-muted: #64748b;",
    "  --mp-color-on-dark: #ffffff;",
    "  --mp-color-on-light: #17171c;",
    "  --mp-font-family: 'Inter', system-ui, sans-serif;",
    "}",
  ].join("\n");

  const lines = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">',
    opts.fontLinks || "",
    "<style>",
    rootVars,
    "* { margin: 0; padding: 0; box-sizing: border-box; }",
    // The iframe's own size (1920x1080, 1080x1920, 1080x1080): a fixed
    // 1920x1080 body laid every tall preview out landscape.
    "html, body { width: 100vw; height: 100vh; overflow: hidden; background: " + bg + "; }",
    ".mp-component { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; }",
    scopedCSS,
    "</style>",
    "<script>",
    gsapSource,
    "if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);",
    "if (typeof CustomEase !== 'undefined') gsap.registerPlugin(CustomEase);",
    sharedSource,
    "</script>",
    "</head>",
    "<body>",
    '<div class="mp-component" data-cid="pg-comp">',
    "  " + boundHtml,
    "</div>",
    "<script>",
    "(function() {",
    "  var data = " + JSON.stringify(data) + ";",
    '  var el = document.querySelector(\'[data-cid="pg-comp"]\');',
    "  var ctx = { duration: 999, motion: 'cinematic' };",
    "  " + script,
    "  var tl = createTimeline(el, data, ctx);",
    "  var master = gsap.timeline({ paused: false });",
    "  master.add(tl, 0);",
    "  window.__MP_TIMELINE = master;",
    "  window.__MP_DURATION = 999;",
    "  window.__MP_READY = true;",
    "})();",
    "</script>",
    "</body>",
    "</html>",
  ];

  return lines.join("\n");
}
