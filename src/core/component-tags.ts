/**
 * <component> tag resolution for unified codegen.
 *
 * Finds <component type="..." data='...' /> tags in scene HTML,
 * resolves them to real library components, and returns the
 * resolved HTML with component CSS and timeline functions.
 *
 * This is the foundation of the unified codegen architecture:
 * the LLM writes .scene.html files that embed library components
 * via <component> tags alongside custom HTML/CSS/GSAP.
 */

import { parseComponent, bindTemplate, scopeCSS, type ParsedComponent } from "./component-parser.js";
import { config } from "../config.js";

/**
 * Build a logo.dev image URL from component data, mirroring the logo component's
 * exposed params. Done at assembly time so the <img src> is baked into the HTML
 * and the logo loads unconditionally -- it must NOT depend on the component's
 * createTimeline (animation) being invoked by the codegen.
 */
export function buildLogoDevUrl(data: Record<string, any>, token: string): string {
  const domain = String(data.domain || "example.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const size = Number(data.size) || 128;
  const format = data.format || "png";
  const theme = data.theme || "dark";
  const greyscale = data.greyscale === true || data.greyscale === "true";
  const fallback = data.fallback || "monogram";
  const retina = data.retina !== false && data.retina !== "false";
  const params = [
    `token=${encodeURIComponent(token)}`,
    `format=${format}`,
    `size=${retina ? size * 2 : size}`,
  ];
  if (greyscale) params.push("greyscale=true");
  if (theme && theme !== "auto") params.push(`theme=${theme}`);
  if (fallback) params.push(`fallback=${fallback}`);
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.join("&")}`;
}

export interface ResolvedComponent {
  /** Instance id (comp_0, comp_1, ...) */
  id: string;
  /** Component type name */
  type: string;
  /** Data props passed to the component */
  data: Record<string, unknown>;
  /** Parsed component source */
  parsed: ParsedComponent;
  /** Bound HTML (template with data applied) */
  boundHtml: string;
  /** Scoped CSS */
  scopedCss: string;
  /** Raw script (createTimeline function body) */
  script: string;
}

export interface ComponentTagResult {
  /** HTML with <component> tags replaced by resolved component HTML */
  html: string;
  /** All resolved components */
  components: ResolvedComponent[];
}

/**
 * Regex to match <component> tags.
 * Supports self-closing and open/close forms:
 *   <component type="foo" data='{}' />
 *   <component type="foo" data='{}' ></component>
 *   <component type="foo" />
 *
 * Quote-aware: a `>` INSIDE a quoted attribute value (JSON data containing
 * markup like "</div>") must not end the tag -- with a naive [^>]*? the tag
 * truncates mid-JSON, the component silently binds empty data (ghost panel)
 * and the JSON remainder leaks into the page as literal text.
 */
const COMPONENT_TAG_REGEX = /<component\s+((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>(?:<\/component>)?/gi;

/**
 * Extract an attribute value from a tag's attribute string.
 * Handles both single and double quotes.
 */
function extractAttr(attrs: string, name: string): string | null {
  // Try double quotes first
  const dqRegex = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const dqMatch = attrs.match(dqRegex);
  if (dqMatch) return dqMatch[1];

  // Try single quotes
  const sqRegex = new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i");
  const sqMatch = attrs.match(sqRegex);
  if (sqMatch) return sqMatch[1];

  return null;
}

/**
 * Extract data attribute which may contain JSON with nested quotes.
 * Handles data='{ "key": "value" }' pattern.
 */
function extractDataAttr(attrs: string): Record<string, unknown> {
  // Try single-quoted data attribute (contains double quotes in JSON)
  const sqMatch = attrs.match(/data\s*=\s*'([\s\S]*?)'/i);
  if (sqMatch) {
    try {
      return JSON.parse(sqMatch[1]);
    } catch {
      console.warn(`  [component-tags] Failed to parse data attribute: ${sqMatch[1].substring(0, 100)}...`);
      return {};
    }
  }

  // Try double-quoted data attribute (contains escaped quotes or simple values)
  const dqMatch = attrs.match(/data\s*=\s*"([\s\S]*?)"/i);
  if (dqMatch) {
    try {
      return JSON.parse(dqMatch[1].replace(/&quot;/g, '"'));
    } catch {
      console.warn(`  [component-tags] Failed to parse data attribute: ${dqMatch[1].substring(0, 100)}...`);
      return {};
    }
  }

  return {};
}

/**
 * Resolve all <component> tags in HTML.
 *
 * @param html - HTML string containing <component> tags
 * @param componentSources - Map of component type -> raw .component.html source
 * @param resolveAssetUrls - Optional function to resolve asset URLs in data
 * @returns Resolved HTML and component metadata
 */
export function resolveComponentTags(
  html: string,
  componentSources: Map<string, string>,
  resolveAssetUrls?: (data: Record<string, unknown>) => Record<string, unknown>,
): ComponentTagResult {
  const components: ResolvedComponent[] = [];
  let compIndex = 0;

  const resolvedHtml = html.replace(COMPONENT_TAG_REGEX, (fullMatch, attrs: string) => {
    const type = extractAttr(attrs, "type");
    if (!type) {
      console.warn(`  [component-tags] <component> tag missing type attribute, skipping`);
      return `<!-- component tag missing type -->`;
    }

    const source = componentSources.get(type);
    if (!source) {
      console.warn(`  [component-tags] Component "${type}" not found in library, skipping`);
      return `<!-- component "${type}" not found -->`;
    }

    // Parse the component source
    let parsed: ParsedComponent;
    try {
      parsed = parseComponent(source);
    } catch (e: any) {
      console.warn(`  [component-tags] Failed to parse component "${type}": ${e.message}`);
      return `<!-- component "${type}" parse error -->`;
    }

    // Extract attributes
    const explicitId = extractAttr(attrs, "id");
    const extraClass = extractAttr(attrs, "class") || "";
    const extraStyle = extractAttr(attrs, "style") || "";
    const data = extractDataAttr(attrs);

    const id = explicitId || `comp_${compIndex}`;
    compIndex++;

    // Resolve asset URLs in data if handler provided
    const resolvedData = resolveAssetUrls ? resolveAssetUrls(data) : data;

    // Logo component: bake the logo.dev URL into the <img src> at assembly time
    // so it loads regardless of whether the codegen wires its animation timeline.
    if (type === "logo") {
      const ld = resolvedData as Record<string, any>;
      const isProminent = ld.prominent === true || ld.prominent === "true";
      // A logo in a row/grid stays compact; a hero (prominent) logo is scaled up
      // by CSS to fill the frame, so fetch it at high resolution to stay crisp.
      ld.size = Number(ld.size) || 128;
      if (isProminent) ld.size = Math.max(ld.size, 480);
      ld.__logoUrl = buildLogoDevUrl(ld, config.logoDevToken);
      ld.__prominentClass = isProminent ? "prominent" : "";
    }

    // Bind data to template
    const boundHtml = bindTemplate(parsed.template, resolvedData);

    // Scope CSS
    const scopedCss = parsed.style ? scopeCSS(parsed.style, id) : "";

    // Build the replacement HTML
    const classAttr = `component-instance${extraClass ? " " + extraClass : ""}`;
    const styleAttr = extraStyle ? ` style="${extraStyle}"` : "";
    const replacement =
      `<div class="${classAttr}" data-cid="${id}" data-comp-id="${id}" data-comp-type="${type}"${styleAttr}>\n` +
      `      ${boundHtml}\n` +
      `    </div>`;

    components.push({
      id,
      type,
      data: resolvedData,
      parsed,
      boundHtml,
      scopedCss,
      script: parsed.script,
    });

    return replacement;
  });

  return { html: resolvedHtml, components };
}

/**
 * Build the JavaScript that registers all component timelines.
 * Returns a script block that creates component timeline functions
 * and provides ctx.getComponentTimeline(id).
 */
export function buildComponentTimelineScript(
  components: ResolvedComponent[],
  sceneDuration: number,
  canvas: { width: number; height: number },
  /** Resolved beat segments ([{label, start, end}]) exposed as ctx.beats. */
  beats?: Array<{ label: string; start: number; end: number }>,
): string {
  if (components.length === 0) return "";
  const beatsJson = JSON.stringify(beats || []);

  const registrations: string[] = [];

  for (const comp of components) {
    // Rename createTimeline to avoid collisions
    const fnName = `createTimeline_${comp.id.replace(/[^a-zA-Z0-9]/g, "_")}`;

    registrations.push(`
    // Component: ${comp.type} (${comp.id})
    var ${fnName} = (function() {
      ${comp.script}
      return createTimeline;
    })();
    __componentTimelines["${comp.id}"] = function() {
      var el = document.querySelector('[data-comp-id="${comp.id}"]');
      if (!el) { console.warn("Component element not found: ${comp.id}"); return gsap.timeline(); }
      var data = ${JSON.stringify(comp.data)};
      var ctx = {
        duration: ${sceneDuration},
        fps: 30,
        canvas: { width: ${canvas.width}, height: ${canvas.height} },
        beats: ${beatsJson},
      };
      return ${fnName}(el, data, ctx);
    };`);
  }

  return `
  // ── Component Timeline Registry ──
  var __componentTimelines = {};
  var __consumedComponentTimelines = {};
  ${registrations.join("\n")}

  // Helper for scene createTimeline to access component timelines.
  // Records consumption so the assembler can auto-wire any block the scene
  // embedded but forgot to add (otherwise its animation -- incl. ambient
  // background loops -- would silently never play).
  function __getComponentTimeline(id) {
    var factory = __componentTimelines[id];
    if (!factory) { console.warn("No component timeline for: " + id); return gsap.timeline(); }
    __consumedComponentTimelines[id] = true;
    return factory();
  }
  `;
}
