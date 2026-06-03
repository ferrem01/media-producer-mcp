/**
 * Image Canvas Inference
 *
 * Detects the right canvas size for image targets based on:
 * 1. Explicit caller override (wins)
 * 2. Platform/format hints in the prompt (inferred)
 * 3. Default fallback (1200x630 OG/social standard)
 */

import type { Canvas } from "../core/types.js";

export interface ImageCanvasPreset {
  name: string;
  width: number;
  height: number;
  /** Keywords that trigger this preset */
  keywords: RegExp;
}

const IMAGE_PRESETS: ImageCanvasPreset[] = [
  // Social - Instagram
  { name: "ig-post",    width: 1080, height: 1080, keywords: /instagram\s*(post|square|feed)/i },
  { name: "ig-story",   width: 1080, height: 1920, keywords: /instagram\s*(story|stories|reel)/i },
  { name: "ig",         width: 1080, height: 1080, keywords: /\binstagram\b/i },

  // Social - LinkedIn
  { name: "li-post",    width: 1200, height: 627,  keywords: /linkedin\s*(post|ad|sponsored|feed)/i },
  { name: "li-banner",  width: 1584, height: 396,  keywords: /linkedin\s*(banner|cover|header)/i },
  { name: "li",         width: 1200, height: 627,  keywords: /\blinkedin\b/i },

  // Social - Twitter/X
  { name: "tw-post",    width: 1600, height: 900,  keywords: /twitter\s*(post|card|ad)|x\s*(post|card|ad)/i },
  { name: "tw-header",  width: 1500, height: 500,  keywords: /twitter\s*(header|banner|cover)|x\s*(header|banner|cover)/i },
  { name: "tw",         width: 1600, height: 900,  keywords: /\b(twitter|(?<!\w)x(?!\w))\b.*\b(image|graphic|visual)\b/i },

  // Social - Facebook
  { name: "fb-post",    width: 1200, height: 630,  keywords: /facebook\s*(post|ad|feed|sponsored)/i },
  { name: "fb-cover",   width: 1640, height: 624,  keywords: /facebook\s*(cover|banner|header)/i },
  { name: "fb",         width: 1200, height: 630,  keywords: /\bfacebook\b/i },

  // Social - Pinterest
  { name: "pin",        width: 1000, height: 1500, keywords: /\bpinterest\b/i },

  // Social - TikTok
  { name: "tiktok",     width: 1080, height: 1920, keywords: /\btiktok\b/i },

  // YouTube
  { name: "yt-thumb",   width: 1280, height: 720,  keywords: /youtube\s*(thumb|thumbnail)/i },
  { name: "yt-banner",  width: 2560, height: 1440, keywords: /youtube\s*(banner|channel\s*art|cover)/i },

  // Email
  { name: "email-hero", width: 600,  height: 300,  keywords: /email\s*(hero|header|banner)/i },
  { name: "email",      width: 600,  height: 400,  keywords: /\bemail\b/i },

  // Web
  { name: "og",         width: 1200, height: 630,  keywords: /\b(og|open\s*graph|social\s*share|social\s*card|meta\s*image)\b/i },
  { name: "hero",       width: 1920, height: 1080, keywords: /\b(hero\s*(image|banner|section)|website\s*hero|landing\s*page\s*hero)\b/i },
  { name: "banner",     width: 1920, height: 480,  keywords: /\b(web\s*banner|site\s*banner|display\s*ad)\b/i },
  { name: "blog",       width: 1200, height: 630,  keywords: /\b(blog|article)\s*(image|header|cover|thumbnail)\b/i },

  // Ad formats
  { name: "ad-rect",    width: 1200, height: 628,  keywords: /\b(display\s*ad|google\s*ad|banner\s*ad)\b/i },
  { name: "ad-square",  width: 1080, height: 1080, keywords: /\b(square\s*ad|social\s*ad)\b/i },

  // Print-ish
  { name: "poster",     width: 1080, height: 1920, keywords: /\b(poster|flyer)\b/i },
  { name: "card",       width: 1080, height: 1080, keywords: /\b(card|postcard)\b/i },

  // Aspect ratio keywords
  { name: "square",     width: 1080, height: 1080, keywords: /\b(square|1:1)\b/i },
  { name: "portrait",   width: 1080, height: 1350, keywords: /\b(portrait|4:5)\b/i },
  { name: "wide",       width: 1920, height: 1080, keywords: /\b(widescreen|16:9)\b/i },
];

/**
 * Infer the right canvas for an image target based on the prompt.
 * Returns undefined if no platform/format is detected (caller uses default).
 */
export function inferImageCanvas(prompt: string): { preset: string; width: number; height: number } | undefined {
  for (const p of IMAGE_PRESETS) {
    if (p.keywords.test(prompt)) {
      return { preset: p.name, width: p.width, height: p.height };
    }
  }
  return undefined;
}

/**
 * Build the canvas for an image target from prompt inference.
 * Falls back to 1200x630 (OG/social standard) if no platform detected.
 */
export function resolveImageCanvas(prompt: string): Canvas {
  const inferred = inferImageCanvas(prompt);
  if (inferred) {
    return {
      width: inferred.width,
      height: inferred.height,
      preset: inferred.width === inferred.height ? "square" : inferred.width > inferred.height ? "landscape" : "vertical",
      fps: 30,
      background: "#0f172a",
    };
  }

  // Default: OG/social standard
  return {
    width: 1200,
    height: 630,
    preset: "landscape",
    fps: 30,
    background: "#0f172a",
  };
}
