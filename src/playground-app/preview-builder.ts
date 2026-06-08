/**
 * Builds a self-contained HTML page for previewing a single component
 * in the Playground iframe.
 */

export interface PlaygroundPreviewOptions {
  boundHtml: string;
  scopedCSS: string;
  gsapSource: string;
  script: string;
  data: Record<string, unknown>;
}

export function buildPlaygroundPreview(opts: PlaygroundPreviewOptions): string {
  const { boundHtml, scopedCSS, gsapSource, script, data } = opts;

  const lines = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">',
    "<style>",
    ":root {",
    "  --mp-color-primary: #A78BFA;",
    "  --mp-color-secondary: #6366f1;",
    "  --mp-color-accent: #A78BFA;",
    "  --mp-color-background: #0f172a;",
    "  --mp-color-surface: #1e293b;",
    "  --mp-color-text: #ffffff;",
    "  --mp-color-text-muted: #94a3b8;",
    "  --mp-font-family: 'Inter', system-ui, sans-serif;",
    "}",
    "* { margin: 0; padding: 0; box-sizing: border-box; }",
    "html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0f172a; }",
    ".mp-component { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; }",
    scopedCSS,
    "</style>",
    "<script>",
    gsapSource,
    "if (typeof SplitText !== 'undefined') gsap.registerPlugin(SplitText);",
    "if (typeof CustomEase !== 'undefined') gsap.registerPlugin(CustomEase);",
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
