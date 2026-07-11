/**
 * Brand font resolution.
 *
 * Brand kits routinely name foundry faces (PP Neue Montreal, Neue Haas,
 * SF Pro...) with source "google" -- but Google Fonts doesn't carry them, the
 * stylesheet request 400s SILENTLY, and every headline in every scene renders
 * in the generic fallback. The brand's typographic voice disappears and
 * nothing fails. This module resolves each google-sourced family before
 * assembly: known foundry faces map to their closest real Google face, and
 * unknown families are verified against the Google Fonts CSS endpoint (a 4xx
 * rewrites to the mapped or default fallback, LOUDLY).
 */

import type { BrandKit } from "./types.js";

/** Foundry faces we know aren't on Google Fonts -> closest Google face. */
const KNOWN_NON_GOOGLE: Record<string, string> = {
  ppneuemontreal: "Archivo",
  neuemontreal: "Archivo",
  ppneuemachina: "Space Grotesk",
  neuehaasgrotesk: "Archivo",
  neuehaasunica: "Archivo",
  helveticanow: "Archivo",
  helveticaneue: "Archivo",
  helvetica: "Archivo",
  sfprodisplay: "Inter",
  sfprotext: "Inter",
  sfpro: "Inter",
  circularstd: "DM Sans",
  circular: "DM Sans",
  graphik: "Inter",
  aeonik: "Space Grotesk",
  suisseintl: "Inter Tight",
  suisse: "Inter Tight",
  soehne: "Inter",
  untitledsans: "Inter",
};

const DEFAULT_FALLBACK = "Inter";

/** family -> resolved family (session cache; includes verified-OK identities). */
const resolveCache = new Map<string, string>();

function norm(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve one google-sourced family to a family that actually exists on
 * Google Fonts. Network verification is fail-OPEN: an unreachable fonts API
 * keeps the original family (offline sandboxes must not rewrite valid
 * brands); only an explicit 4xx -- "this family does not exist" -- rewrites.
 */
export async function resolveGoogleFontFamily(family: string, weights?: number[]): Promise<string> {
  const cached = resolveCache.get(family);
  if (cached) return cached;

  const mapped = KNOWN_NON_GOOGLE[norm(family)];
  if (mapped) {
    console.warn(`[fonts] "${family}" is not on Google Fonts -- substituting closest face "${mapped}"`);
    resolveCache.set(family, mapped);
    return mapped;
  }

  const w = (weights && weights.length ? weights : [400]).join(";");
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@${w}&display=swap`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timer);
    if (res.status >= 400 && res.status < 500) {
      // Weight mismatch also 400s -- retry the bare family before giving up.
      const res2 = await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}&display=swap`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => null);
      if (!res2 || (res2.status >= 400 && res2.status < 500)) {
        console.warn(`[fonts] "${family}" not found on Google Fonts (HTTP ${res.status}) -- substituting "${DEFAULT_FALLBACK}". Headlines were silently rendering in the browser fallback.`);
        resolveCache.set(family, DEFAULT_FALLBACK);
        return DEFAULT_FALLBACK;
      }
    }
  } catch { /* network unavailable -- fail open, keep the family */ }

  resolveCache.set(family, family);
  return family;
}

/**
 * Return a copy of the brand kit with every google-sourced font family
 * resolved to one that actually loads. Assemblers call this once at entry so
 * the font links AND --mp-font-family agree.
 */
export async function resolveBrandKitFonts(brand: BrandKit): Promise<BrandKit> {
  if (!brand?.fonts?.length) return brand;
  const fonts = await Promise.all(brand.fonts.map(async (f) => {
    if (f.source !== "google" || !f.family) return f;
    const resolved = await resolveGoogleFontFamily(f.family, f.weights);
    return resolved === f.family ? f : { ...f, family: resolved };
  }));
  const changed = fonts.some((f, i) => f !== brand.fonts![i]);
  return changed ? { ...brand, fonts } : brand;
}
