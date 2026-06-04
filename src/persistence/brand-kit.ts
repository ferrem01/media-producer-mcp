/**
 * Brand Kit persistence.
 *
 * Reads/writes brand kit data under {tenant}/brand-kit/:
 *   brand-kit.json  - raw data (colors, fonts, style, asset registry)
 *   brand-kit.css   - compiled CSS custom properties
 *   assets/         - uploaded brand assets (logos, fonts, music, etc.)
 */

import fs from "node:fs/promises";
import type { BrandKit } from "../core/types.js";
import {
  brandKitDir,
  brandKitJsonPath,
  brandKitCssPath,
  brandKitAssetsDir,
} from "./paths.js";

/**
 * Load a tenant's brand kit. Returns null if none exists.
 */
export async function loadBrandKit(tenantId: string): Promise<BrandKit | null> {
  try {
    const raw = await fs.readFile(brandKitJsonPath(tenantId), "utf-8");
    const kit = JSON.parse(raw) as BrandKit;

    // Migration: old format had assets: { backgrounds: [...] }
    if (kit.assets && !Array.isArray(kit.assets)) {
      const old = kit.assets as any;
      if (old.backgrounds && Array.isArray(old.backgrounds)) {
        kit.assets = old.backgrounds.map((bg: any) => ({ ...bg, type: "background" }));
      } else {
        kit.assets = [];
      }
    }
    // Ensure all assets have a type
    if (Array.isArray(kit.assets)) {
      for (const a of kit.assets) {
        if (!(a as any).type) (a as any).type = "background";
      }
    }

    return kit;
  } catch {
    return null;
  }
}

/**
 * Save a tenant's brand kit and compile its CSS.
 * Creates the brand-kit/ directory tree if it doesn't exist.
 */
export async function saveBrandKit(tenantId: string, kit: BrandKit): Promise<void> {
  // Ensure brand-kit/ and brand-kit/assets/ exist
  await fs.mkdir(brandKitAssetsDir(tenantId), { recursive: true });

  // Write JSON
  await fs.writeFile(brandKitJsonPath(tenantId), JSON.stringify(kit, null, 2));

  // Compile and write CSS
  const css = compileBrandCSS(kit);
  await fs.writeFile(brandKitCssPath(tenantId), css);
}

/**
 * Compile a BrandKit into a CSS custom properties stylesheet.
 */
export function compileBrandCSS(kit: BrandKit): string {
  const vars: string[] = [];

  // Colors
  if (kit.colors) {
    for (const [key, value] of Object.entries(kit.colors)) {
      vars.push(`  --mp-color-${key.replace(/_/g, "-")}: ${value};`);
    }
  }

  // Typography
  if (kit.fonts?.length) {
    vars.push(`  --mp-font-family: '${kit.fonts[0].family}', sans-serif;`);
    const weights = kit.fonts[0].weights || [400, 700];
    const weightNames: Record<number, string> = {
      400: "normal",
      500: "medium",
      600: "semibold",
      700: "bold",
      800: "extrabold",
    };
    for (const w of weights) {
      const name = weightNames[w];
      if (name) {
        vars.push(`  --mp-font-weight-${name}: ${w};`);
      }
    }
  }

  // Style
  if (kit.style?.border_radius) {
    vars.push(`  --mp-border-radius: ${kit.style.border_radius};`);
  }
  if (kit.style?.motion) {
    vars.push(`  --mp-motion-style: ${kit.style.motion};`);
  }

  return `/* Auto-generated from brand-kit.json -- do not edit */\n:root {\n${vars.join("\n")}\n}\n`;
}

/**
 * Return the path where a brand asset file should be stored.
 */
export function brandAssetPath(tenantId: string, filename: string): string {
  const dir = brandKitAssetsDir(tenantId);
  // Basic sanitization: strip path traversal
  const safe = filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
  return `${dir}/${safe}`;
}

/**
 * Check whether a brand-kit directory exists for a tenant.
 */
export async function brandKitExists(tenantId: string): Promise<boolean> {
  try {
    await fs.access(brandKitDir(tenantId));
    return true;
  } catch {
    return false;
  }
}
