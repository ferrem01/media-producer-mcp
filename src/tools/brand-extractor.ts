/**
 * Brand Extractor
 *
 * Uses Playwright to extract design tokens from a live website,
 * then clusters/normalizes them into a DesignSystem.
 * Optionally enhances results with LLM analysis.
 */

import { chromium } from "playwright";
import type {
  BrandColors,
  DesignSystem,
  DesignSystemColorRoles,
  DesignSystemTypography,
  DesignSystemSpacing,
  DesignSystemRadius,
  DesignSystemShadows,
  DesignSystemMotion,
  DesignSystemPatterns,
} from "../core/types.js";
import { callLLM, type LLMConfig, type LLMMessage, type LLMContentPart } from "../llm/client.js";

// ── Raw extraction types ──

interface RawColorEntry {
  value: string;
  usage: "background" | "text" | "border";
  count: number;
}

interface RawFontEntry {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  element: string;
  count: number;
}

interface RawSpacingEntry {
  value: number;
  count: number;
}

interface RawRadiusEntry {
  value: string;
  context: "button" | "card" | "input" | "other";
  count: number;
}

interface RawShadowEntry {
  value: string;
  count: number;
}

interface RawMotionEntry {
  duration: string;
  easing: string;
  count: number;
}

interface RawButtonInfo {
  bg: string;
  radius: string;
  padding: string;
  border: string;
  shadow: string;
}

interface RawCardInfo {
  shadow: string;
  border: string;
  padding: string;
  radius: string;
}

interface RawLogoCandidate {
  url: string;
  kind: string;
  score: number;
  alt: string;
  width: number;
  height: number;
}

interface RawExtractionResult {
  colors: RawColorEntry[];
  fonts: RawFontEntry[];
  spacing: RawSpacingEntry[];
  radii: RawRadiusEntry[];
  shadows: RawShadowEntry[];
  motions: RawMotionEntry[];
  buttons: RawButtonInfo[];
  cards: RawCardInfo[];
  inputs: { border: string; radius: string; bg: string }[];
  sectionGaps: number[];
  logos: RawLogoCandidate[];
}

// ── Main extraction function ──

export async function extractBrandFromUrl(url: string): Promise<{
  design_system: DesignSystem;
  colors: BrandColors;
  logos: RawLogoCandidate[];
}> {
  var browser = await chromium.launch({
    args: ["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
    // Honor an explicit Chromium path in constrained/remote envs whose bundled
    // Playwright revision isn't downloaded (mirrors capture.ts LAUNCH_OPTS).
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });

  try {
    var page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait extra time for fonts and dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    // Take hero screenshot
    var screenshotBuffer = await page.screenshot({ type: "png" });
    var heroScreenshot = "data:image/png;base64," + screenshotBuffer.toString("base64");

    // Extract raw design tokens via page.evaluate
    var raw = await page.evaluate(() => {
      var colors: Array<{ value: string; usage: string; count: number }> = [];
      var colorMap: Record<string, { usage: string; count: number }> = {};
      var fonts: Array<{ family: string; size: string; weight: string; lineHeight: string; letterSpacing: string; element: string; count: number }> = [];
      var fontMap: Record<string, { family: string; size: string; weight: string; lineHeight: string; letterSpacing: string; element: string; count: number }> = {};
      var spacingValues: Record<number, number> = {};
      var radii: Array<{ value: string; context: string; count: number }> = [];
      var radiusMap: Record<string, { context: string; count: number }> = {};
      var shadows: Array<{ value: string; count: number }> = [];
      var shadowMap: Record<string, number> = {};
      var motions: Array<{ duration: string; easing: string; count: number }> = [];
      var motionMap: Record<string, { duration: string; easing: string; count: number }> = {};
      var buttons: Array<{ bg: string; radius: string; padding: string; border: string; shadow: string }> = [];
      var cards: Array<{ shadow: string; border: string; padding: string; radius: string }> = [];
      var inputs: Array<{ border: string; radius: string; bg: string }> = [];
      var sectionGaps: number[] = [];

      function addColor(val: string, usage: string) {
        if (!val || val === "transparent" || val === "rgba(0, 0, 0, 0)") return;
        var key = val + "|" + usage;
        if (colorMap[key]) {
          colorMap[key].count++;
        } else {
          colorMap[key] = { usage: usage, count: 1 };
        }
      }

      function parseSpacing(val: string): number[] {
        if (!val) return [];
        return val.split(" ").map(function(v) { return parseFloat(v); }).filter(function(n) { return !isNaN(n) && n > 0; });
      }

      // Scan all visible elements
      var allElements = document.querySelectorAll("*");
      var visibleElements: Element[] = [];

      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.top > window.innerHeight * 3) continue; // limit scanning depth
        visibleElements.push(el);
      }

      for (var j = 0; j < visibleElements.length; j++) {
        var elem = visibleElements[j];
        var style = window.getComputedStyle(elem);
        var tag = elem.tagName.toLowerCase();

        // Colors
        addColor(style.color, "text");
        addColor(style.backgroundColor, "background");
        addColor(style.borderColor, "border");

        // Fonts (for text elements)
        if (["h1","h2","h3","h4","h5","h6","p","span","a","li","td","th","label","button","div"].indexOf(tag) >= 0) {
          var text = (elem.textContent || "").trim();
          if (text.length > 0 && text.length < 500) {
            var fontKey = style.fontFamily + "|" + style.fontSize + "|" + style.fontWeight;
            if (fontMap[fontKey]) {
              fontMap[fontKey].count++;
            } else {
              fontMap[fontKey] = {
                family: style.fontFamily,
                size: style.fontSize,
                weight: style.fontWeight,
                lineHeight: style.lineHeight,
                letterSpacing: style.letterSpacing,
                element: tag,
                count: 1,
              };
            }
          }
        }

        // Spacing
        var paddingVals = parseSpacing(style.padding);
        var marginVals = parseSpacing(style.margin);
        var gapVal = parseFloat(style.gap);
        for (var s = 0; s < paddingVals.length; s++) {
          var pv = Math.round(paddingVals[s]);
          if (pv > 0 && pv <= 200) spacingValues[pv] = (spacingValues[pv] || 0) + 1;
        }
        for (var m = 0; m < marginVals.length; m++) {
          var mv = Math.round(marginVals[m]);
          if (mv > 0 && mv <= 200) spacingValues[mv] = (spacingValues[mv] || 0) + 1;
        }
        if (!isNaN(gapVal) && gapVal > 0 && gapVal <= 200) {
          spacingValues[Math.round(gapVal)] = (spacingValues[Math.round(gapVal)] || 0) + 1;
        }

        // Border radius
        var radius = style.borderRadius;
        if (radius && radius !== "0px") {
          var context = "other";
          if (tag === "button" || (tag === "a" && elem.getAttribute("role") === "button")) context = "button";
          else if (tag === "input" || tag === "textarea" || tag === "select") context = "input";
          else if (parseFloat(style.padding) > 12 && (style.boxShadow !== "none" || style.borderWidth !== "0px")) context = "card";

          var rKey = radius + "|" + context;
          if (radiusMap[rKey]) {
            radiusMap[rKey].count++;
          } else {
            radiusMap[rKey] = { context: context, count: 1 };
          }
        }

        // Box shadows
        if (style.boxShadow && style.boxShadow !== "none") {
          if (shadowMap[style.boxShadow]) {
            shadowMap[style.boxShadow]++;
          } else {
            shadowMap[style.boxShadow] = 1;
          }
        }

        // Transitions
        if (style.transitionDuration && style.transitionDuration !== "0s") {
          var durations = style.transitionDuration.split(",").map(function(d) { return d.trim(); });
          var easings = (style.transitionTimingFunction || "ease").split(",").map(function(e) { return e.trim(); });
          for (var t = 0; t < durations.length; t++) {
            var mKey = durations[t] + "|" + (easings[t] || easings[0]);
            if (motionMap[mKey]) {
              motionMap[mKey].count++;
            } else {
              motionMap[mKey] = { duration: durations[t], easing: easings[t] || easings[0], count: 1 };
            }
          }
        }

        // Button detection
        if (tag === "button" || (tag === "a" && (elem.className.toString().toLowerCase().indexOf("btn") >= 0 || elem.className.toString().toLowerCase().indexOf("button") >= 0 || elem.getAttribute("role") === "button"))) {
          buttons.push({
            bg: style.backgroundColor,
            radius: style.borderRadius,
            padding: style.padding,
            border: style.border,
            shadow: style.boxShadow,
          });
        }

        // Card detection
        if (tag === "div" || tag === "section" || tag === "article") {
          var hasShadow = style.boxShadow && style.boxShadow !== "none";
          var hasBorder = style.borderWidth !== "0px" && style.borderStyle !== "none";
          var hasPadding = parseFloat(style.padding) > 12;
          if ((hasShadow || hasBorder) && hasPadding) {
            cards.push({
              shadow: style.boxShadow,
              border: style.border,
              padding: style.padding,
              radius: style.borderRadius,
            });
          }
        }

        // Input detection
        if (tag === "input" || tag === "textarea" || tag === "select") {
          inputs.push({
            border: style.border,
            radius: style.borderRadius,
            bg: style.backgroundColor,
          });
        }

        // Section gap detection (major sections)
        if (tag === "section" || (tag === "div" && elem.parentElement && elem.parentElement.tagName.toLowerCase() === "main")) {
          var marginTop = parseFloat(style.marginTop);
          var paddingTop = parseFloat(style.paddingTop);
          var gap = Math.max(marginTop, paddingTop);
          if (gap > 8) sectionGaps.push(Math.round(gap));
        }
      }

      // Convert maps to arrays
      for (var ck in colorMap) {
        var parts = ck.split("|");
        colors.push({ value: parts[0], usage: colorMap[ck].usage, count: colorMap[ck].count });
      }
      for (var fk in fontMap) {
        fonts.push(fontMap[fk]);
      }
      var spacingArr: Array<{ value: number; count: number }> = [];
      for (var sk in spacingValues) {
        spacingArr.push({ value: parseInt(sk), count: spacingValues[sk as any] });
      }
      for (var rk in radiusMap) {
        var rParts = rk.split("|");
        radii.push({ value: rParts[0], context: radiusMap[rk].context, count: radiusMap[rk].count });
      }
      for (var shk in shadowMap) {
        shadows.push({ value: shk, count: shadowMap[shk] });
      }
      for (var mk in motionMap) {
        motions.push(motionMap[mk]);
      }

      // ── Logo / brand-mark candidates ──
      var logos: Array<{ url: string; kind: string; score: number; alt: string; width: number; height: number }> = [];
      function absUrl(u: string | null): string | null {
        if (!u) return null;
        try { return new URL(u, location.href).href; } catch (e) { return null; }
      }
      function pushLogo(url: string | null, kind: string, score: number, alt?: string, width?: number, height?: number) {
        if (!url) return;
        for (var i = 0; i < logos.length; i++) { if (logos[i].url === url) return; }
        logos.push({ url: url, kind: kind, score: score, alt: alt || "", width: width || 0, height: height || 0 });
      }
      function logoish(el: Element): boolean {
        var s = ((el.getAttribute("class") || "") + " " + (el.getAttribute("id") || "") + " " +
          (el.getAttribute("alt") || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
        return /logo|brand|wordmark/.test(s);
      }
      // <img> logos: explicit logo-ish, or any img sitting in the header/nav/home-link near the top
      Array.prototype.slice.call(document.querySelectorAll("img")).forEach(function (img: HTMLImageElement) {
        var inHeader = !!img.closest('header, nav, [class*="header" i], [class*="nav" i], [class*="logo" i], a[href="/"], a[href="' + location.origin + '/"]');
        var isLogo = logoish(img);
        if (!isLogo && !inHeader) return;
        var rect = img.getBoundingClientRect();
        var score = (isLogo ? 100 : 0) + (inHeader ? 50 : 0) + (rect.top < 200 ? 20 : 0);
        pushLogo(absUrl(img.currentSrc || img.src), isLogo ? "header-logo-img" : "header-img", score, img.getAttribute("alt") || "", img.naturalWidth, img.naturalHeight);
      });
      // Inline <svg> logos -> serialize to a data URL
      Array.prototype.slice.call(document.querySelectorAll("svg")).forEach(function (svg: SVGElement) {
        if (!logoish(svg) && !svg.closest('a[href="/"], header [class*="logo" i], nav [class*="logo" i], [class*="logo" i]')) return;
        var rect = svg.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 8) return;
        var xml = new XMLSerializer().serializeToString(svg);
        if (xml.length > 60000) return;
        if (!/xmlns=/.test(xml)) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
        pushLogo("data:image/svg+xml;utf8," + encodeURIComponent(xml), "header-logo-svg", 90 + (rect.top < 200 ? 20 : 0), "", Math.round(rect.width), Math.round(rect.height));
      });
      // apple-touch-icon (clean square mark)
      Array.prototype.slice.call(document.querySelectorAll('link[rel~="apple-touch-icon"]')).forEach(function (l: HTMLLinkElement) {
        pushLogo(absUrl(l.getAttribute("href")), "apple-touch-icon", 40);
      });
      // og:image (brand banner -- lower priority, often not a clean logo)
      var ogImg = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
      if (ogImg) pushLogo(absUrl(ogImg.getAttribute("content")), "og-image", 25);
      // favicon fallback
      Array.prototype.slice.call(document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')).forEach(function (l: HTMLLinkElement) {
        pushLogo(absUrl(l.getAttribute("href")), "favicon", 20);
      });
      logos.sort(function (a, b) { return b.score - a.score; });
      logos = logos.slice(0, 8);

      return {
        colors: colors,
        fonts: fonts,
        spacing: spacingArr,
        radii: radii,
        shadows: shadows,
        motions: motions,
        buttons: buttons,
        cards: cards,
        inputs: inputs,
        sectionGaps: sectionGaps,
        logos: logos,
      };
    });

    await page.close();

    // Normalize raw data into design system
    var typedRaw = raw as RawExtractionResult;
    var colorRoles = normalizeColors(typedRaw.colors);
    var typography = normalizeTypography(typedRaw.fonts);
    var spacing = normalizeSpacing(typedRaw.spacing, typedRaw.sectionGaps, typedRaw.cards);
    var radius = normalizeRadius(typedRaw.radii);
    var shadowsResult = normalizeShadows(typedRaw.shadows);
    var motion = normalizeMotion(typedRaw.motions);
    var patterns = normalizePatterns(typedRaw.buttons, typedRaw.cards, typedRaw.inputs);
    var density = normalizeDensity(typedRaw.sectionGaps);

    var brandColors: BrandColors = {
      primary: colorRoles.primary_action,
      secondary: colorRoles.secondary_action,
      accent: colorRoles.link,
      background: colorRoles.primary_bg,
      surface: colorRoles.surface,
      text: colorRoles.text_primary,
      text_muted: colorRoles.text_muted,
    };

    var designSystem: DesignSystem = {
      source_url: url,
      extracted_at: new Date().toISOString(),
      color_roles: colorRoles,
      typography: typography,
      spacing: spacing,
      radius: radius,
      shadows: shadowsResult,
      motion: motion,
      patterns: patterns,
      density: density,
      screenshots: {
        hero: heroScreenshot,
      },
    };

    return { design_system: designSystem, colors: brandColors, logos: typedRaw.logos || [] };
  } finally {
    await browser.close();
  }
}

// ── LLM Enhancement ──

export async function enhanceWithLLM(
  designSystem: DesignSystem,
  screenshotBase64: string,
  llmConfig: LLMConfig,
): Promise<{ guidelines: string; patterns: DesignSystemPatterns }> {
  // Build a summary of the design tokens (omit screenshot data from token dump)
  var tokenSummary = {
    source_url: designSystem.source_url,
    color_roles: designSystem.color_roles,
    typography: {
      font_heading: designSystem.typography.font_heading,
      font_body: designSystem.typography.font_body,
      scale: designSystem.typography.scale,
      heading_weight: designSystem.typography.heading_weight,
      body_weight: designSystem.typography.body_weight,
    },
    spacing: designSystem.spacing,
    radius: designSystem.radius,
    shadows: designSystem.shadows,
    motion: designSystem.motion,
    patterns: designSystem.patterns,
    density: designSystem.density,
  };

  var systemPrompt = `You are a senior design system analyst. Given extracted design tokens from a website and a screenshot, describe the brand's design language in 3-5 concise paragraphs. Focus on: visual density, how spacing is used, typography character (modern/classic/playful), shadow usage, border radius patterns, button and card styles, color temperature and contrast approach, motion personality. Also refine the component patterns based on what you observe.

Return ONLY valid JSON (no markdown fences) with this structure:
{
  "guidelines": "Multi-paragraph description of the brand's design language...",
  "patterns": {
    "button_style": "filled"|"outline"|"ghost",
    "button_shape": "rounded"|"pill"|"square",
    "card_style": "flat"|"bordered"|"elevated"|"glass",
    "card_border": true|false,
    "input_style": "outline"|"filled"|"underline",
    "divider_style": "solid"|"dashed"|"none",
    "gradient_direction": "to bottom right",
    "gradient_style": "linear-gradient(...)"
  }
}`;

  // Build messages with image support
  var contentParts: LLMContentPart[] = [
    { type: "text", text: "Here are the extracted design tokens:\n\n" + JSON.stringify(tokenSummary, null, 2) },
  ];

  // Include screenshot if available
  if (screenshotBase64) {
    contentParts.push({
      type: "image_url",
      image_url: { url: screenshotBase64 },
    });
    contentParts.push({
      type: "text",
      text: "\nAbove is the hero screenshot of the website. Analyze both the tokens and the visual to produce your assessment.",
    });
  }

  var messages: LLMMessage[] = [
    { role: "user", content: contentParts },
  ];

  var response = await callLLM(llmConfig, messages, {
    systemPrompt: systemPrompt,
    maxTokens: 2000,
    temperature: 0.3,
  });

  // Parse the JSON response
  try {
    // Strip markdown fences if present
    var cleaned = response.trim();
    var fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    var parsed = JSON.parse(cleaned);
    return {
      guidelines: parsed.guidelines || "",
      patterns: {
        button_style: parsed.patterns?.button_style || designSystem.patterns.button_style,
        button_shape: parsed.patterns?.button_shape || designSystem.patterns.button_shape,
        card_style: parsed.patterns?.card_style || designSystem.patterns.card_style,
        card_border: parsed.patterns?.card_border ?? designSystem.patterns.card_border,
        input_style: parsed.patterns?.input_style || designSystem.patterns.input_style,
        divider_style: parsed.patterns?.divider_style || designSystem.patterns.divider_style,
        gradient_direction: parsed.patterns?.gradient_direction || designSystem.patterns.gradient_direction,
        gradient_style: parsed.patterns?.gradient_style || designSystem.patterns.gradient_style,
      },
    };
  } catch {
    // If JSON parse fails, use the raw response as guidelines
    return {
      guidelines: response.substring(0, 2000),
      patterns: designSystem.patterns,
    };
  }
}

// ── Normalization helpers ──

function parseRgb(colorStr: string): [number, number, number] | null {
  // Handle rgb(r, g, b) and rgba(r, g, b, a)
  var rgbMatch = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  // Handle hex
  var hexMatch = colorStr.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    var hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
    ];
  }
  return null;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2)
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(function(c) {
    var hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function dedupeColors(entries: RawColorEntry[], threshold: number = 10): Array<{ rgb: [number, number, number]; hex: string; usage: string; count: number }> {
  var clusters: Array<{ rgb: [number, number, number]; hex: string; usage: string; count: number }> = [];

  for (var i = 0; i < entries.length; i++) {
    var rgb = parseRgb(entries[i].value);
    if (!rgb) continue;

    var merged = false;
    for (var j = 0; j < clusters.length; j++) {
      if (colorDistance(rgb, clusters[j].rgb) < threshold && entries[i].usage === clusters[j].usage) {
        clusters[j].count += entries[i].count;
        // Keep the more common one's color
        if (entries[i].count > clusters[j].count - entries[i].count) {
          clusters[j].rgb = rgb;
          clusters[j].hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
        }
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        rgb: rgb,
        hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
        usage: entries[i].usage,
        count: entries[i].count,
      });
    }
  }

  return clusters.sort(function(a, b) { return b.count - a.count; });
}

function normalizeColors(rawColors: RawColorEntry[]): DesignSystemColorRoles {
  var bgColors = dedupeColors(rawColors.filter(function(c) { return c.usage === "background"; }));
  var textColors = dedupeColors(rawColors.filter(function(c) { return c.usage === "text"; }));
  var borderColors = dedupeColors(rawColors.filter(function(c) { return c.usage === "border"; }));

  // Find primary background (most common background color)
  var primaryBg = bgColors.length > 0 ? bgColors[0].hex : "#ffffff";
  var primaryBgLum = bgColors.length > 0 ? luminance(bgColors[0].rgb[0], bgColors[0].rgb[1], bgColors[0].rgb[2]) : 1;
  var isDark = primaryBgLum < 0.5;

  // Surface: second most common bg color, or slightly different from primary
  var surface = bgColors.length > 1 ? bgColors[1].hex : (isDark ? "#1e293b" : "#f8fafc");

  // Elevated: third bg or brighter surface
  var elevated = bgColors.length > 2 ? bgColors[2].hex : (isDark ? "#334155" : "#ffffff");

  // Primary action: look for saturated background colors that aren't the main bg
  var actionColors = bgColors.filter(function(c) {
    var saturation = Math.max(c.rgb[0], c.rgb[1], c.rgb[2]) - Math.min(c.rgb[0], c.rgb[1], c.rgb[2]);
    return saturation > 30 && colorDistance(c.rgb, bgColors[0]?.rgb || [255, 255, 255]) > 50;
  });
  var primaryAction = actionColors.length > 0 ? actionColors[0].hex : "#3b82f6";
  var primaryActionRgb = actionColors.length > 0 ? actionColors[0].rgb : [59, 130, 246] as [number, number, number];

  // Hover: slightly darker/lighter version of primary action
  var hoverShift = isDark ? 20 : -20;
  var primaryActionHover = rgbToHex(
    Math.max(0, Math.min(255, primaryActionRgb[0] + hoverShift)),
    Math.max(0, Math.min(255, primaryActionRgb[1] + hoverShift)),
    Math.max(0, Math.min(255, primaryActionRgb[2] + hoverShift))
  );

  // Secondary action
  var secondaryAction = actionColors.length > 1 ? actionColors[1].hex : (isDark ? "#475569" : "#e2e8f0");

  // Text colors by luminance
  var textPrimary = textColors.length > 0 ? textColors[0].hex : (isDark ? "#ffffff" : "#0f172a");
  var textSecondary = textColors.length > 1 ? textColors[1].hex : (isDark ? "#cbd5e1" : "#475569");
  var textMuted = textColors.length > 2 ? textColors[2].hex : (isDark ? "#94a3b8" : "#64748b");

  // Link colors: look for blue-ish text colors
  var linkColors = textColors.filter(function(c) {
    return c.rgb[2] > c.rgb[0] && c.rgb[2] > c.rgb[1]; // blue dominant
  });
  var link = linkColors.length > 0 ? linkColors[0].hex : primaryAction;
  var linkRgb = linkColors.length > 0 ? linkColors[0].rgb : primaryActionRgb;
  var linkHover = rgbToHex(
    Math.max(0, Math.min(255, linkRgb[0] + hoverShift)),
    Math.max(0, Math.min(255, linkRgb[1] + hoverShift)),
    Math.max(0, Math.min(255, linkRgb[2] + hoverShift))
  );

  // Borders
  var borderMain = borderColors.length > 0 ? borderColors[0].hex : (isDark ? "#334155" : "#e2e8f0");
  var borderSubtle = borderColors.length > 1 ? borderColors[1].hex : (isDark ? "#1e293b" : "#f1f5f9");

  // Text on primary: determine if primary action is light or dark
  var actionLum = luminance(primaryActionRgb[0], primaryActionRgb[1], primaryActionRgb[2]);
  var textOnPrimary = actionLum > 0.5 ? "#000000" : "#ffffff";

  return {
    primary_bg: primaryBg,
    surface: surface,
    elevated: elevated,
    primary_action: primaryAction,
    primary_action_hover: primaryActionHover,
    secondary_action: secondaryAction,
    destructive: "#ef4444",
    success: "#22c55e",
    warning: "#f59e0b",
    border: borderMain,
    border_subtle: borderSubtle,
    text_primary: textPrimary,
    text_secondary: textSecondary,
    text_muted: textMuted,
    text_on_primary: textOnPrimary,
    link: link,
    link_hover: linkHover,
  };
}

function normalizeTypography(rawFonts: RawFontEntry[]): DesignSystemTypography {
  if (rawFonts.length === 0) {
    return defaultTypography();
  }

  // Sort by count to find most common font families
  var familyCounts: Record<string, number> = {};
  for (var i = 0; i < rawFonts.length; i++) {
    var family = rawFonts[i].family.split(",")[0].trim().replace(/['"]/g, "");
    familyCounts[family] = (familyCounts[family] || 0) + rawFonts[i].count;
  }

  var sortedFamilies = Object.entries(familyCounts).sort(function(a, b) { return b[1] - a[1]; });
  var bodyFont = sortedFamilies[0]?.[0] || "Inter";
  var headingFont = bodyFont;

  // Check if headings use a different font
  var headingFonts = rawFonts.filter(function(f) {
    return ["h1", "h2", "h3", "h4", "h5", "h6"].indexOf(f.element) >= 0;
  });
  if (headingFonts.length > 0) {
    var hFamilyCounts: Record<string, number> = {};
    for (var h = 0; h < headingFonts.length; h++) {
      var hFamily = headingFonts[h].family.split(",")[0].trim().replace(/['"]/g, "");
      hFamilyCounts[hFamily] = (hFamilyCounts[hFamily] || 0) + headingFonts[h].count;
    }
    var topHeadingFont = Object.entries(hFamilyCounts).sort(function(a, b) { return b[1] - a[1]; })[0];
    if (topHeadingFont) headingFont = topHeadingFont[0];
  }

  // Find mono font (look for mono/code in family name)
  var monoFont = "ui-monospace";
  for (var mi = 0; mi < sortedFamilies.length; mi++) {
    if (sortedFamilies[mi][0].toLowerCase().indexOf("mono") >= 0 || sortedFamilies[mi][0].toLowerCase().indexOf("code") >= 0) {
      monoFont = sortedFamilies[mi][0];
      break;
    }
  }

  // Build type scale from heading sizes
  var sizesByElement: Record<string, string[]> = {};
  for (var fi = 0; fi < rawFonts.length; fi++) {
    if (!sizesByElement[rawFonts[fi].element]) sizesByElement[rawFonts[fi].element] = [];
    sizesByElement[rawFonts[fi].element].push(rawFonts[fi].size);
  }

  var getSize = function(el: string, fallback: string): string {
    var sizes = sizesByElement[el];
    if (!sizes || sizes.length === 0) return fallback;
    // Return most common size
    var counts: Record<string, number> = {};
    for (var s = 0; s < sizes.length; s++) counts[sizes[s]] = (counts[sizes[s]] || 0) + 1;
    return Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; })[0][0];
  };

  // Collect heading and body weights
  var headingWeights = headingFonts.map(function(f) { return f.weight; });
  var bodyFontsData = rawFonts.filter(function(f) { return f.element === "p" || f.element === "span"; });
  var bodyWeights = bodyFontsData.map(function(f) { return f.weight; });
  var mostCommon = function(arr: string[], fallback: string): string {
    if (arr.length === 0) return fallback;
    var counts: Record<string, number> = {};
    for (var a = 0; a < arr.length; a++) counts[arr[a]] = (counts[arr[a]] || 0) + 1;
    return Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; })[0][0];
  };

  // Collect line heights and letter spacing
  var lineHeights = rawFonts.map(function(f) { return f.lineHeight; }).filter(function(lh) { return lh !== "normal"; });
  var letterSpacings = rawFonts.map(function(f) { return f.letterSpacing; }).filter(function(ls) { return ls !== "normal" && ls !== "0px"; });

  var sortedLineHeights = lineHeights.map(function(lh) { return parseFloat(lh); }).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });
  var sortedLetterSpacings = letterSpacings.map(function(ls) { return parseFloat(ls); }).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });

  return {
    font_heading: headingFont,
    font_body: bodyFont,
    font_mono: monoFont,
    scale: {
      display: getSize("h1", "48px"),
      h1: getSize("h1", "36px"),
      h2: getSize("h2", "30px"),
      h3: getSize("h3", "24px"),
      h4: getSize("h4", "20px"),
      body_lg: "18px",
      body: getSize("p", "16px"),
      body_sm: "14px",
      caption: "12px",
      overline: "11px",
    },
    line_heights: {
      tight: sortedLineHeights.length > 0 ? sortedLineHeights[0] + "px" : "1.2",
      normal: sortedLineHeights.length > 1 ? sortedLineHeights[Math.floor(sortedLineHeights.length / 2)] + "px" : "1.5",
      relaxed: sortedLineHeights.length > 2 ? sortedLineHeights[sortedLineHeights.length - 1] + "px" : "1.75",
    },
    letter_spacing: {
      tight: sortedLetterSpacings.length > 0 ? sortedLetterSpacings[0] + "px" : "-0.02em",
      normal: "0",
      wide: sortedLetterSpacings.length > 0 ? sortedLetterSpacings[sortedLetterSpacings.length - 1] + "px" : "0.05em",
    },
    heading_weight: mostCommon(headingWeights, "700"),
    body_weight: mostCommon(bodyWeights, "400"),
  };
}

function defaultTypography(): DesignSystemTypography {
  return {
    font_heading: "Inter",
    font_body: "Inter",
    font_mono: "ui-monospace",
    scale: {
      display: "48px", h1: "36px", h2: "30px", h3: "24px", h4: "20px",
      body_lg: "18px", body: "16px", body_sm: "14px", caption: "12px", overline: "11px",
    },
    line_heights: { tight: "1.2", normal: "1.5", relaxed: "1.75" },
    letter_spacing: { tight: "-0.02em", normal: "0", wide: "0.05em" },
    heading_weight: "700",
    body_weight: "400",
  };
}

function normalizeSpacing(rawSpacing: RawSpacingEntry[], sectionGaps: number[], cards: RawCardInfo[]): DesignSystemSpacing {
  // Test base units 4, 6, 8
  var bestBase = 8;
  var bestScore = 0;

  for (var base of [4, 6, 8]) {
    var score = 0;
    var total = 0;
    for (var i = 0; i < rawSpacing.length; i++) {
      total += rawSpacing[i].count;
      if (rawSpacing[i].value % base === 0) {
        score += rawSpacing[i].count;
      }
    }
    var adherence = total > 0 ? score / total : 0;
    if (adherence > bestScore) {
      bestScore = adherence;
      bestBase = base;
    }
  }

  // Build named scale
  var scale: Record<string, string> = {};
  var scaleNames = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
  for (var si = 0; si < scaleNames.length; si++) {
    scale[scaleNames[si]] = (bestBase * (si + 1)) + "px";
  }

  // Section gap
  var avgGap = sectionGaps.length > 0
    ? Math.round(sectionGaps.reduce(function(a, b) { return a + b; }, 0) / sectionGaps.length)
    : 48;

  // Card padding
  var cardPaddings = cards.map(function(c) { return parseFloat(c.padding); }).filter(function(n) { return !isNaN(n); });
  var avgCardPadding = cardPaddings.length > 0
    ? Math.round(cardPaddings.reduce(function(a, b) { return a + b; }, 0) / cardPaddings.length)
    : 24;

  return {
    base_unit: bestBase,
    scale: scale,
    section_gap: avgGap + "px",
    card_padding: avgCardPadding + "px",
    container_max_width: "1280px",
  };
}

function normalizeRadius(rawRadii: RawRadiusEntry[]): DesignSystemRadius {
  var byContext: Record<string, string[]> = { button: [], card: [], input: [], other: [] };
  for (var i = 0; i < rawRadii.length; i++) {
    byContext[rawRadii[i].context].push(rawRadii[i].value);
  }

  // Sort all unique radius values
  var allValues = rawRadii.map(function(r) { return parseFloat(r.value); }).filter(function(n) { return !isNaN(n) && n > 0; });
  allValues.sort(function(a, b) { return a - b; });
  var unique = Array.from(new Set(allValues));

  var sm = unique.length > 0 ? unique[0] + "px" : "4px";
  var md = unique.length > 1 ? unique[Math.floor(unique.length / 2)] + "px" : "8px";
  var lg = unique.length > 2 ? unique[unique.length - 1] + "px" : "16px";

  var mostCommon = function(arr: string[], fallback: string): string {
    if (arr.length === 0) return fallback;
    var counts: Record<string, number> = {};
    for (var j = 0; j < arr.length; j++) counts[arr[j]] = (counts[arr[j]] || 0) + 1;
    return Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; })[0][0];
  };

  return {
    none: "0px",
    sm: sm,
    md: md,
    lg: lg,
    full: "9999px",
    button: mostCommon(byContext.button, md),
    card: mostCommon(byContext.card, lg),
    input: mostCommon(byContext.input, md),
  };
}

function normalizeShadows(rawShadows: RawShadowEntry[]): DesignSystemShadows {
  if (rawShadows.length === 0) {
    return {
      sm: "0 1px 2px rgba(0,0,0,0.05)",
      md: "0 4px 6px rgba(0,0,0,0.1)",
      lg: "0 10px 15px rgba(0,0,0,0.1)",
      button: "0 1px 2px rgba(0,0,0,0.05)",
      card: "0 4px 6px rgba(0,0,0,0.1)",
      focus_ring: "0 0 0 3px rgba(59,130,246,0.5)",
    };
  }

  // Sort by "size" (sum of offset values)
  var scored = rawShadows.map(function(s) {
    var nums = s.value.match(/(\d+)px/g) || [];
    var total = nums.reduce(function(acc, n) { return acc + parseInt(n); }, 0);
    return { value: s.value, score: total, count: s.count };
  }).sort(function(a, b) { return a.score - b.score; });

  var sm = scored.length > 0 ? scored[0].value : "0 1px 2px rgba(0,0,0,0.05)";
  var md = scored.length > 1 ? scored[Math.floor(scored.length / 2)].value : "0 4px 6px rgba(0,0,0,0.1)";
  var lg = scored.length > 2 ? scored[scored.length - 1].value : "0 10px 15px rgba(0,0,0,0.1)";

  return {
    sm: sm,
    md: md,
    lg: lg,
    button: sm,
    card: md,
    focus_ring: "0 0 0 3px rgba(59,130,246,0.5)",
  };
}

function normalizeMotion(rawMotions: RawMotionEntry[]): DesignSystemMotion {
  if (rawMotions.length === 0) {
    return {
      duration_fast: "0.15s",
      duration_normal: "0.3s",
      duration_slow: "0.5s",
      easing_default: "ease",
      easing_enter: "ease-out",
      easing_exit: "ease-in",
      hover_transform: "translateY(-1px)",
      hover_shadow: false,
    };
  }

  // Sort durations
  var durations = rawMotions.map(function(m) { return parseFloat(m.duration); }).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });
  var uniqueDurations = Array.from(new Set(durations));

  // Most common easing
  var easingCounts: Record<string, number> = {};
  for (var i = 0; i < rawMotions.length; i++) {
    easingCounts[rawMotions[i].easing] = (easingCounts[rawMotions[i].easing] || 0) + rawMotions[i].count;
  }
  var topEasing = Object.entries(easingCounts).sort(function(a, b) { return b[1] - a[1]; })[0]?.[0] || "ease";

  return {
    duration_fast: uniqueDurations.length > 0 ? uniqueDurations[0] + "s" : "0.15s",
    duration_normal: uniqueDurations.length > 1 ? uniqueDurations[Math.floor(uniqueDurations.length / 2)] + "s" : "0.3s",
    duration_slow: uniqueDurations.length > 2 ? uniqueDurations[uniqueDurations.length - 1] + "s" : "0.5s",
    easing_default: topEasing,
    easing_enter: "ease-out",
    easing_exit: "ease-in",
    hover_transform: "translateY(-1px)",
    hover_shadow: true,
  };
}

function normalizePatterns(
  buttons: RawButtonInfo[],
  cards: RawCardInfo[],
  inputs: { border: string; radius: string; bg: string }[],
): DesignSystemPatterns {
  // Button style
  var buttonStyle: "filled" | "outline" | "ghost" = "filled";
  if (buttons.length > 0) {
    var filledCount = 0;
    var outlineCount = 0;
    var ghostCount = 0;
    for (var i = 0; i < buttons.length; i++) {
      var bg = buttons[i].bg;
      var border = buttons[i].border;
      if (bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
        if (border && border !== "none" && border.indexOf("0px") < 0) {
          outlineCount++;
        } else {
          ghostCount++;
        }
      } else {
        filledCount++;
      }
    }
    if (outlineCount > filledCount && outlineCount > ghostCount) buttonStyle = "outline";
    else if (ghostCount > filledCount) buttonStyle = "ghost";
  }

  // Button shape from radius
  var buttonShape: "rounded" | "pill" | "square" = "rounded";
  if (buttons.length > 0) {
    var avgButtonRadius = buttons.map(function(b) { return parseFloat(b.radius); }).filter(function(n) { return !isNaN(n); });
    if (avgButtonRadius.length > 0) {
      var avg = avgButtonRadius.reduce(function(a, b) { return a + b; }, 0) / avgButtonRadius.length;
      if (avg >= 50) buttonShape = "pill";
      else if (avg <= 2) buttonShape = "square";
    }
  }

  // Card style
  var cardStyle: "flat" | "bordered" | "elevated" | "glass" = "flat";
  if (cards.length > 0) {
    var elevatedCount = 0;
    var borderedCount = 0;
    var glassCount = 0;
    for (var ci = 0; ci < cards.length; ci++) {
      var cShadow = cards[ci].shadow;
      var cBorder = cards[ci].border;
      if (cShadow && cShadow !== "none") {
        elevatedCount++;
      }
      if (cBorder && cBorder !== "none" && cBorder.indexOf("0px") < 0) {
        borderedCount++;
      }
    }
    if (elevatedCount > borderedCount) cardStyle = "elevated";
    else if (borderedCount > 0) cardStyle = "bordered";
  }

  // Input style
  var inputStyle: "outline" | "filled" | "underline" = "outline";
  if (inputs.length > 0) {
    var outlinedInputs = 0;
    var filledInputs = 0;
    for (var ii = 0; ii < inputs.length; ii++) {
      if (inputs[ii].bg && inputs[ii].bg !== "transparent" && inputs[ii].bg !== "rgba(0, 0, 0, 0)" && inputs[ii].bg !== "rgb(255, 255, 255)") {
        filledInputs++;
      } else {
        outlinedInputs++;
      }
    }
    if (filledInputs > outlinedInputs) inputStyle = "filled";
  }

  return {
    button_style: buttonStyle,
    button_shape: buttonShape,
    card_style: cardStyle,
    card_border: cards.some(function(c) { return c.border && c.border !== "none" && c.border.indexOf("0px") < 0; }),
    input_style: inputStyle,
    divider_style: "solid",
    gradient_direction: "to bottom right",
    gradient_style: "none",
  };
}

function normalizeDensity(sectionGaps: number[]): "compact" | "comfortable" | "spacious" {
  if (sectionGaps.length === 0) return "comfortable";
  var avg = sectionGaps.reduce(function(a, b) { return a + b; }, 0) / sectionGaps.length;
  if (avg > 48) return "spacious";
  if (avg < 24) return "compact";
  return "comfortable";
}
