/**
 * Web capture minting (SPEC-web-capture.md): a browser-extension capture
 * bundle in, a real tenant component out. ONE concept -- there is no "clip";
 * the capture IS a component from second one, castable by the storyboard and
 * scriptable through shared/capture-performance.js.
 *
 * The visual path is deterministic end to end: the markup is the site's own
 * DOM with computed styles inlined by the extension, and this module only
 * SANITIZES (strips scripts/handlers/iframes/external refs) -- it never
 * generates. The reference screenshot saved beside the component is its
 * permanent visual contract for any future LLM edit.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { LAUNCH_OPTS } from "./capture.js";
import { tenantComponentsDir } from "../persistence/paths.js";

export interface CaptureFont {
  family: string;
  weight?: string;
  style?: string;
  /** The font binary as a data URI (extension fetches + bakes it). */
  data: string;
}

export interface CaptureBundle {
  /** kebab-case component name, e.g. "brightloop-testimonial" */
  name: string;
  /** One-line description for the catalog (what the storyboard LLM reads). */
  description?: string;
  /** The serialized subtree: computed styles inlined, assets as data URIs. */
  html: string;
  /** Embedded webfonts so the replica keeps the site's real type. */
  fonts?: CaptureFont[];
  /** Reference screenshot of the region as a data URL (PNG). */
  screenshot?: string;
  source_url?: string;
  /** Captured region size in CSS px. */
  width: number;
  height: number;
  /** Device pixel ratio at capture time. */
  dpr?: number;
}

export interface MintResult {
  type: string;
  componentPath: string;
  schemaPath: string;
  refPath?: string;
}

/** Belt: regex pre-strip before the HTML ever reaches a parser. */
function preStrip(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
}

/**
 * Suspenders: parse in a real browser and walk the DOM, removing everything
 * the replica must not carry -- scripts, handlers, embeds, external
 * references (the extension inlines what it wants kept; anything still
 * pointing at the network gets dropped, not fetched).
 */
export async function sanitizeCapturedHtml(html: string): Promise<string> {
  const browser = await chromium.launch(LAUNCH_OPTS);
  try {
    const page = await browser.newPage();
    // Never let the parse fetch anything.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"></head><body>${preStrip(html)}</body></html>`,
      { waitUntil: "domcontentloaded", timeout: 15_000 },
    ).catch(() => { /* aborted subresources may reject; the DOM is parsed */ });
    const cleaned = await page.evaluate(`(() => {
      const KILL = ["SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "AUDIO", "SOURCE", "TEMPLATE"];
      const body = document.body;
      for (const el of Array.from(body.querySelectorAll("*"))) {
        if (KILL.includes(el.tagName)) { el.remove(); continue; }
        for (const attr of Array.from(el.attributes)) {
          const n = attr.name.toLowerCase();
          const v = String(attr.value || "");
          if (n.startsWith("on")) { el.removeAttribute(attr.name); continue; }
          if ((n === "href" || n === "xlink:href") && !v.startsWith("#")) { el.setAttribute(attr.name, "#"); continue; }
          if ((n === "src" || n === "srcset" || n === "poster") && /^(https?:)?\\/\\//i.test(v.trim())) {
            el.removeAttribute(attr.name); continue;
          }
          if (n === "style" && /url\\s*\\(\\s*['"]?\\s*(https?:)?\\/\\//i.test(v)) {
            el.setAttribute("style", v.replace(/[a-z-]+\\s*:\\s*[^;]*url\\s*\\(\\s*['"]?\\s*(https?:)?\\/\\/[^;]*(;|$)/gi, ""));
          }
        }
        if (el.tagName === "VIDEO") {
          const img = document.createElement("div");
          img.style.cssText = "width:100%;height:100%;background:#111;";
          el.replaceWith(img);
        }
      }
      return body.innerHTML;
    })()`);
    return String(cleaned);
  } finally {
    await browser.close();
  }
}

const NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Fonts the shell will carry: data-URI binaries only, sane families, capped. */
const FONT_DATA_RE = /^data:(?:font\/[a-z0-9.+-]+|application\/(?:x-)?font[a-z0-9.+-]*|application\/octet-stream);base64,[A-Za-z0-9+/=]+$/;
function fontFaceCss(fonts: CaptureFont[] | undefined): string {
  const out: string[] = [];
  let budget = 5 * 1024 * 1024;
  for (const f of (fonts || []).slice(0, 8)) {
    if (!f || typeof f.data !== "string" || !FONT_DATA_RE.test(f.data)) continue;
    if (f.data.length > budget) continue;
    const family = String(f.family || "").replace(/[^\w -]/g, "").trim().slice(0, 64);
    if (!family) continue;
    const weight = /^[a-z0-9 ]{1,20}$/i.test(String(f.weight || "")) ? f.weight : "normal";
    const style = /^(normal|italic|oblique[a-z0-9 ]*)$/i.test(String(f.style || "")) ? f.style : "normal";
    budget -= f.data.length;
    out.push(`  @font-face { font-family: "${family}"; src: url(${f.data}); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`);
  }
  return out.join("\n");
}

function componentShell(name: string, bundle: CaptureBundle, cleanedHtml: string): string {
  const w = Math.round(bundle.width);
  const h = Math.round(bundle.height);
  const src = bundle.source_url ? String(bundle.source_url).slice(0, 300) : "unknown";
  return `<!--
  CAPTURED COMPONENT: ${name}
  source_url: ${src}
  captured_at: __CAPTURED_AT__
  region: ${w}x${h}
  Frozen markup from a real page (SPEC-web-capture.md). The markup below is a
  deterministic capture -- appearance is under the visual contract of the
  reference screenshot saved beside this file; any LLM edit must hold it.
  Behavior comes from shared/capture-performance.js (highlight, click, type,
  set-text, count-up, scroll -- text-first targeting).
-->
<template>
  <div class="cap-root">
    <div class="cap-frame">
      <div class="cap-body">
${cleanedHtml}
      </div>
    </div>
  </div>
</template>
<style>
__FONT_FACES__
  .cap-root { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .cap-frame { position: relative; flex: none; width: ${w}px; height: ${h}px; }
  .cap-body { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; }
  .cap-body .cap-hl-run { box-decoration-break: clone; -webkit-box-decoration-break: clone; }
</style>
<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    // The capture has a fixed native size; scale to FIT the assigned box so
    // the site's own proportions survive any scene layout.
    var frame = el.querySelector('.cap-frame');
    var fit = function () {
      var pw = el.clientWidth || ${w};
      var ph = el.clientHeight || ${h};
      var s = Math.min(pw / ${w}, ph / ${h}) || 1;
      frame.style.transform = 'scale(' + s + ')';
      frame.style.transformOrigin = 'center center';
    };
    fit();
    if (data && data.entrance === 'rise') {
      gsap.set(el.querySelector('.cap-frame'), { autoAlpha: 0, y: 24 });
      tl.to(el.querySelector('.cap-frame'), { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.1);
    }
    runCapturePerformance(tl, el, data || {}, ctx || {});
    return tl;
  }
</script>
`;
}

function componentSchema(name: string, bundle: CaptureBundle): Record<string, unknown> {
  return {
    type: name,
    label: name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    category: "captured",
    description: (bundle.description || `Captured from ${bundle.source_url || "a website"}`) +
      " [CAPTURED SURFACE: real site markup, frozen. Script it with the generic capture verbs; target elements by their visible text.]",
    capture: {
      source_url: bundle.source_url || null,
      captured_at: "__CAPTURED_AT__",
      width: Math.round(bundle.width),
      height: Math.round(bundle.height),
    },
    data: {
      entrance: { type: "string", label: "Entrance", optional: true, placeholder: "settled (default) | rise" },
      accent: { type: "string", label: "Accent color", optional: true, placeholder: "#393bf5" },
      script: { type: "array", label: "Performance script", optional: true, items: { type: "object" } },
    },
    script_actions: [
      { action: "highlight", description: "Underline/box/spotlight a phrase: {text, style?: underline|box|spotlight, color?, at, duration?}" },
      { action: "click", description: "The film's cursor travels to the element containing {text} and clicks" },
      { action: "type", description: "Type into the input containing/near {text|selector}: {text_input? via selector, text, speed?}" },
      { action: "set-text", description: "Swap visible copy: {text: current, to: replacement, at}" },
      { action: "count-up", description: "Animate a number: {text: current value, to, duration?, at}" },
      { action: "scroll", description: "Scroll the capture to an element or offset: {to: text|y, at}" },
    ],
  };
}

/**
 * Mint the component. File placement follows the two existing readers:
 * - `<tenant>/components/<name>.component.html` FLAT -- render, critique and
 *   pipeline search extra component dirs flat.
 * - `<tenant>/components/captured/<name>.schema.json` -- the catalog scans
 *   category subdirectories only.
 * Reference screenshot + meta live beside the schema in captured/.
 */
export async function mintCapturedComponent(
  tenantId: string,
  bundle: CaptureBundle,
  now: Date = new Date(),
): Promise<MintResult> {
  if (!bundle?.html || typeof bundle.html !== "string") throw new Error("bundle.html is required");
  if (!bundle.width || !bundle.height) throw new Error("bundle.width/height are required");
  const base = String(bundle.name || "capture").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!NAME_RE.test(base)) throw new Error(`invalid component name "${bundle.name}"`);
  if (bundle.html.length > 6 * 1024 * 1024) throw new Error("capture bundle too large (6MB limit)");

  const rootDir = tenantComponentsDir(tenantId);
  const capDir = path.join(rootDir, "captured");
  await fs.mkdir(capDir, { recursive: true });

  // Collision policy: -2, -3... (a re-capture is a NEW component; provenance
  // links them via source_url).
  let name = base;
  for (let i = 2; ; i++) {
    try { await fs.access(path.join(rootDir, `${name}.component.html`)); name = `${base}-${i}`; } catch { break; }
  }

  const cleaned = await sanitizeCapturedHtml(bundle.html);
  if (!cleaned.trim()) throw new Error("capture is empty after sanitization");

  const capturedAt = now.toISOString();
  const componentPath = path.join(rootDir, `${name}.component.html`);
  const schemaPath = path.join(capDir, `${name}.schema.json`);
  const shell = componentShell(name, bundle, cleaned)
    .replace("__CAPTURED_AT__", capturedAt)
    .replace("__FONT_FACES__", fontFaceCss(bundle.fonts));
  await fs.writeFile(componentPath, shell);
  const schema = componentSchema(name, bundle);
  (schema as any).capture.captured_at = capturedAt;
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));

  let refPath: string | undefined;
  const shot = bundle.screenshot;
  if (shot && /^data:image\/png;base64,/.test(shot)) {
    refPath = path.join(capDir, `${name}.capture-ref.png`);
    await fs.writeFile(refPath, Buffer.from(shot.slice("data:image/png;base64,".length), "base64"));
  }

  return { type: name, componentPath, schemaPath, refPath };
}
