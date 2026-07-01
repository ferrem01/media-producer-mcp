/**
 * MCP Tool: extract_brand_from_website
 *
 * Extracts design tokens from a live website using Playwright,
 * optionally enhances them with LLM analysis, and merges into
 * the tenant's brand kit.
 */

import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const execFileP = promisify(execFile);
import { extractBrandFromUrl, enhanceWithLLM, harvestSiteImages, canonicalImageKey, type RawImageCandidate, type HarvestOptions } from "./brand-extractor.js";
import { loadBrandKit, saveBrandKit } from "../persistence/brand-kit.js";
import { llmConfigFromEnv, callLLM, type LLMConfig, type LLMContentPart } from "../llm/client.js";
import { config } from "../config.js";
import type { BrandKit, BrandLogo, BrandAsset, BrandAssetType } from "../core/types.js";

function extFromContentType(ct: string, url: string): string {
  ct = (ct || "").toLowerCase();
  if (ct.includes("svg")) return "svg";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("x-icon") || ct.includes("vnd.microsoft.icon")) return "ico";
  if (ct.includes("webp")) return "webp";
  const m = (url || "").split("?")[0].match(/\.(svg|png|jpe?g|ico|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

/**
 * Probe a downloaded logo for its real dimensions and which background theme it
 * suits. Theme is inferred from the luminance of the logo's INK (opaque pixels):
 * a dark wordmark -> "light" (use on light bg), a white/light mark -> "dark",
 * anything mid-range (e.g. a colorful icon) -> "any". Uses ffmpeg/ffprobe only.
 */
async function analyzeLogo(filePath: string): Promise<{ width: number; height: number; theme: BrandLogo["theme"] }> {
  if (/\.svg$/i.test(filePath)) return { width: 0, height: 0, theme: "any" };
  let width = 0, height = 0;
  try {
    const { stdout } = await execFileP("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", filePath]);
    const m = stdout.trim().match(/(\d+)x(\d+)/);
    if (m) { width = +m[1]; height = +m[2]; }
  } catch { /* dims optional */ }

  let theme: BrandLogo["theme"] = "any";
  try {
    const yavg = async (vf: string): Promise<number> => {
      const { stderr } = await execFileP("ffmpeg", ["-i", filePath, "-vf", `${vf},signalstats,metadata=print`, "-frames:v", "1", "-f", "null", "-"], { maxBuffer: 1e8 });
      const m = (stderr || "").match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
      return m ? parseFloat(m[1]) : NaN;
    };
    // format=rgba first so palette/opaque PNGs expose a real alpha plane.
    const meanAlpha = await yavg("format=rgba,alphaextract");           // 0-255: coverage * 255
    const premultLuma = await yavg("format=rgba,premultiply=inplace=1"); // mean of inkLuma * coverage
    if (isFinite(meanAlpha) && meanAlpha >= 8 && isFinite(premultLuma)) {
      const inkLuma = (premultLuma / meanAlpha) * 255;     // luminance of the opaque ink, 0-255
      if (inkLuma < 100) theme = "light";       // dark ink reads on light backgrounds
      else if (inkLuma > 155) theme = "dark";   // light ink reads on dark backgrounds
    }
  } catch { /* theme detection optional */ }

  return { width, height, theme };
}

/**
 * Download the top logo candidates and register them in the brand kit's logos[].
 * Candidates come ranked from the extractor (header logo > apple-touch-icon > favicon).
 * og-image banners are skipped as logos. Returns the BrandLogo entries created.
 */
async function downloadLogos(
  tenantId: string,
  candidates: Array<{ url: string; kind: string; score: number; alt: string; width: number; height: number }>,
  max = 3,
): Promise<BrandLogo[]> {
  const dir = path.join(config.dataDir, tenantId, "brand-kit", "assets", "logo");
  await fs.mkdir(dir, { recursive: true });
  const out: BrandLogo[] = [];
  for (const cand of candidates.filter((c) => c.kind !== "og-image")) {
    if (out.length >= max) break;
    try {
      const res = await fetch(cand.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const ext = extFromContentType(res.headers.get("content-type") || "", cand.url);
      const idx = out.length + 1;
      const filename = `extracted-${idx}.${ext}`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buf);

      // Probe the saved file for true dimensions + which background theme it suits.
      const probe = await analyzeLogo(filePath);
      const aspect = probe.width && probe.height ? probe.width / probe.height
        : (cand.width && cand.height ? cand.width / cand.height : 0);
      const variant: BrandLogo["variant"] =
        (/icon|favicon/.test(cand.kind) || (aspect > 0 && aspect < 1.5)) ? "icon"
        : (aspect >= 3 ? "wordmark" : "full");
      const height = probe.height || cand.height || 0;
      out.push({
        name: `extracted-${variant}-${probe.theme}-${idx}`,
        url: `/assets/${tenantId}/brand-kit/logo/${filename}`,
        variant,
        theme: probe.theme,
        ...(height ? { height } : {}),
      });
    } catch (e: any) {
      console.warn(`[extract_brand] logo download failed (${cand.kind} ${cand.url}):`, e.message);
    }
  }
  return out;
}

/** Probe a raster image file for its pixel dimensions via ffprobe. Best-effort. */
async function probeImageSize(filePath: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execFileP("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", filePath]);
    const m = stdout.trim().match(/(\d+)x(\d+)/);
    if (m) return { width: +m[1], height: +m[2] };
  } catch { /* dims optional */ }
  return { width: 0, height: 0 };
}

/** Build the caption LLM config: prefer a cheap Haiku model for Anthropic. */
function captionLLMConfig(): LLMConfig {
  const base = llmConfigFromEnv();
  if (base.provider === "anthropic") {
    return { ...base, model: process.env.MP_CAPTION_MODEL || "claude-haiku-4-5-20251001" };
  }
  return base; // OpenAI: keep the configured (vision-capable) model
}

interface ImageCaption {
  description: string;
  tags: string[];
  type: "product" | "screenshot" | "image";
  skip: boolean;
}

const CAPTION_SYSTEM = `You label images harvested from a company's website so a video-generation model can later pick the right visual. Given ONE image, respond with ONLY valid JSON (no markdown fences):
{
  "description": "one factual sentence (<=160 chars) describing what the image shows and how it could be used in a video",
  "tags": ["3-6 lowercase keywords: subject, colors, mood, orientation"],
  "type": "product" | "screenshot" | "image",
  "skip": true | false
}
Rules: type "screenshot" = app/dashboard/UI captures; "product" = product/device/feature shots; "image" = photos, illustrations, hero/marketing imagery. Set skip=true ONLY for junk: logos, icons, tiny decorative slivers, ads, or blank/placeholder images.`;

/** Caption a single harvested image with a vision LLM. Returns null on failure. */
async function captionImage(cfg: LLMConfig, cand: RawImageCandidate, dataUrl: string): Promise<ImageCaption | null> {
  const parts: LLMContentPart[] = [
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: `Alt/label hint: ${cand.alt || "(none)"}. Rendered size: ${cand.width}x${cand.height}. Source kind: ${cand.kind}.` },
  ];
  try {
    const raw = await callLLM(cfg, [{ role: "user", content: parts }], { systemPrompt: CAPTION_SYSTEM, maxTokens: 400, temperature: 0.2 });
    let cleaned = raw.trim();
    const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fence) cleaned = fence[1].trim();
    const parsed = JSON.parse(cleaned) as Partial<ImageCaption>;
    if (!parsed || typeof parsed.description !== "string") return null;
    return {
      description: parsed.description.slice(0, 240),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [],
      type: parsed.type === "product" || parsed.type === "screenshot" ? parsed.type : "image",
      skip: parsed.skip === true,
    };
  } catch (e: any) {
    console.warn(`[harvest] caption failed for ${cand.url}:`, e.message);
    return null;
  }
}

/** Map a caption + candidate kind to a stored BrandAsset type. */
function resolveAssetType(caption: ImageCaption, cand: RawImageCandidate): BrandAssetType {
  if (caption.type === "product" || caption.type === "screenshot") return caption.type;
  // A generic image that was a large CSS background is most useful as a "background".
  if (cand.kind === "background") return "background";
  return "image";
}

/**
 * Crawl the site, download harvested images, caption each with a vision LLM, and
 * merge them into kit.assets[]. Best-effort: never throws (imagery is additive).
 * Returns the BrandAsset entries added.
 */
export async function harvestAndStoreAssets(
  tenantId: string,
  url: string,
  kit: BrandKit,
  opts: HarvestOptions = {},
): Promise<BrandAsset[]> {
  let candidates: RawImageCandidate[] = [];
  try {
    candidates = await harvestSiteImages(url, opts);
  } catch (e: any) {
    console.warn("[harvest] site crawl failed:", e.message);
    return [];
  }
  if (candidates.length === 0) return [];

  let cfg: LLMConfig;
  try { cfg = captionLLMConfig(); } catch (e: any) {
    console.warn("[harvest] no LLM configured for captioning; skipping image harvest:", e.message);
    return [];
  }

  const dir = path.join(config.dataDir, tenantId, "brand-kit", "assets", "images");
  await fs.mkdir(dir, { recursive: true });

  // Canonical keys of already-stored assets so re-runs don't duplicate the same
  // underlying image served via www/apex, size variants, or Next.js optimizer URLs.
  const existingKeys = new Set(
    (kit.assets || []).map((a) => (a.source_url ? canonicalImageKey(a.source_url) : "")).filter(Boolean),
  );
  const added: BrandAsset[] = [];

  for (const cand of candidates) {
    if (existingKeys.has(canonicalImageKey(cand.url))) continue;
    try {
      const res = await fetch(cand.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const ct = res.headers.get("content-type") || "";
      const ext = extFromContentType(ct, cand.url);
      if (!/^(png|jpg|webp)$/.test(ext)) continue; // vision-friendly rasters only

      // Caption from the bytes (base64) when small enough; else from the source URL.
      const mediaType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const dataUrl = buf.length <= 4_000_000 ? `data:${mediaType};base64,${buf.toString("base64")}` : cand.url;
      const caption = await captionImage(cfg, cand, dataUrl);
      if (!caption || caption.skip) continue;

      const idx = (kit.assets?.length || 0) + added.length + 1;
      const filename = `image-${idx}.${ext}`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buf);
      const dims = await probeImageSize(filePath);

      added.push({
        name: `harvested-${caption.type}-${idx}`,
        url: `/assets/${tenantId}/brand-kit/images/${filename}`,
        type: resolveAssetType(caption, cand),
        description: caption.description,
        tags: caption.tags,
        source_url: cand.url,
        ...(dims.width ? { width: dims.width } : cand.width ? { width: cand.width } : {}),
        ...(dims.height ? { height: dims.height } : cand.height ? { height: cand.height } : {}),
      });
      existingKeys.add(canonicalImageKey(cand.url));
    } catch (e: any) {
      console.warn(`[harvest] image download/caption failed (${cand.url}):`, e.message);
    }
  }

  if (added.length > 0) {
    kit.assets = (kit.assets || []).concat(added);
    console.log(`[extract_brand] harvested ${added.length} image asset(s): ${added.map((a) => a.name).join(", ")}`);
  }
  return added;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

/**
 * Extract a brand from a live URL, build/merge the tenant brand kit (colors,
 * fonts, design system, downloaded logos), save it, and return a summary.
 * Shared by the extract_brand_from_website tool and the website_to_video one-shot.
 */
export interface ImageHarvestConfig extends HarvestOptions {
  /** When true, crawl the site and harvest+caption imagery into kit.assets[]. */
  includeImages?: boolean;
}

export async function extractAndStoreBrand(
  tenantId: string,
  url: string,
  enhance: boolean,
  imageHarvest: ImageHarvestConfig = {},
): Promise<{ kit: BrandKit; summary: any }> {
  var result = await extractBrandFromUrl(url);
  var designSystem = result.design_system;
  var extractedColors = result.colors;

  if (enhance) {
    try {
      var llmConfig = llmConfigFromEnv();
      var heroScreenshot = designSystem.screenshots?.hero || "";
      var enhanced = await enhanceWithLLM(designSystem, heroScreenshot, llmConfig);
      designSystem.guidelines = enhanced.guidelines;
      designSystem.patterns = enhanced.patterns;
    } catch (llmErr: any) {
      console.warn("[extract_brand] LLM enhancement failed:", llmErr.message);
    }
  }

  var storedDesignSystem = { ...designSystem };
  delete storedDesignSystem.screenshots;

  var existing = await loadBrandKit(tenantId);
  var kit: BrandKit;
  if (existing) {
    var isDefaultColors = existing.colors.primary === "#5B21B6" && existing.colors.background === "#0f172a";
    kit = { ...existing, colors: isDefaultColors ? extractedColors : existing.colors, design_system: storedDesignSystem };
    if (existing.fonts?.length === 1 && existing.fonts[0].family === "Inter") {
      var extractedFonts = [];
      if (designSystem.typography.font_heading) {
        extractedFonts.push({ family: designSystem.typography.font_heading, source: "google" as const, weights: [parseInt(designSystem.typography.heading_weight) || 700] });
      }
      if (designSystem.typography.font_body && designSystem.typography.font_body !== designSystem.typography.font_heading) {
        extractedFonts.push({ family: designSystem.typography.font_body, source: "google" as const, weights: [parseInt(designSystem.typography.body_weight) || 400, 500, 600, 700] });
      }
      if (extractedFonts.length > 0) kit.fonts = extractedFonts;
    }
  } else {
    kit = {
      colors: extractedColors,
      fonts: [{ family: designSystem.typography.font_heading || "Inter", source: "google" as const, weights: [parseInt(designSystem.typography.heading_weight) || 700] }],
      style: { border_radius: designSystem.radius.md, motion: "cinematic" as const },
      design_system: storedDesignSystem,
    };
    if (designSystem.typography.font_body && designSystem.typography.font_body !== designSystem.typography.font_heading) {
      kit.fonts.push({ family: designSystem.typography.font_body, source: "google" as const, weights: [parseInt(designSystem.typography.body_weight) || 400, 500, 600, 700] });
    }
  }

  if (!kit.logos || kit.logos.length === 0) {
    const extractedLogos = await downloadLogos(tenantId, result.logos || []);
    if (extractedLogos.length > 0) {
      kit.logos = extractedLogos;
      console.log(`[extract_brand] registered ${extractedLogos.length} logo(s): ${extractedLogos.map((l) => l.name).join(", ")}`);
    }
  }

  // Optionally crawl the site and harvest+caption product/background imagery.
  var harvestedAssets: BrandAsset[] = [];
  if (imageHarvest.includeImages) {
    harvestedAssets = await harvestAndStoreAssets(tenantId, url, kit, {
      depth: imageHarvest.depth,
      maxPages: imageHarvest.maxPages,
      maxImages: imageHarvest.maxImages,
      minSize: imageHarvest.minSize,
    });
  }

  await saveBrandKit(tenantId, kit);

  var summary = {
    status: "extracted", url,
    extracted_at: designSystem.extracted_at,
    colors: { primary_bg: designSystem.color_roles.primary_bg, primary_action: designSystem.color_roles.primary_action, text_primary: designSystem.color_roles.text_primary },
    typography: { heading_font: designSystem.typography.font_heading, body_font: designSystem.typography.font_body, heading_weight: designSystem.typography.heading_weight },
    spacing: { base_unit: designSystem.spacing.base_unit, density: designSystem.density },
    patterns: designSystem.patterns,
    logos: (kit.logos || []).map((l) => ({ name: l.name, variant: l.variant, theme: l.theme, url: l.url })),
    logo_candidates_found: (result.logos || []).length,
    enhanced: enhance && !!designSystem.guidelines,
    guidelines_preview: designSystem.guidelines ? designSystem.guidelines.substring(0, 200) + "..." : undefined,
    images_harvested: imageHarvest.includeImages ? harvestedAssets.length : undefined,
    assets: imageHarvest.includeImages
      ? harvestedAssets.map((a) => ({ name: a.name, type: a.type, description: a.description, url: a.url }))
      : undefined,
  };
  return { kit, summary };
}

/**
 * Register the extract_brand_from_website tool on an MCP server.
 */
export function registerBrandExtractTool(server: McpServer): void {
  server.tool(
    "extract_brand_from_website",
    "Extract design tokens (colors, typography, spacing, radius, shadows, motion, patterns) from a live website URL. Optionally enhances with LLM analysis. With include_images, also crawls the site (entry page + interior product/feature pages), downloads product/background imagery, captions each with a vision LLM, and stores them as described brand assets. Merges everything into the tenant's brand kit.",
    {
      tenant_id: z.string().describe("Tenant identifier"),
      url: z.string().describe("Website URL to extract brand from"),
      enhance: z.boolean().optional().default(false).describe("Run LLM analysis on extracted tokens for guidelines and refined patterns"),
      include_images: z.boolean().optional().default(false).describe("Crawl the site and harvest+caption product/background imagery into the brand kit's assets (slower, uses vision LLM tokens)"),
      crawl_depth: z.number().int().min(0).max(2).optional().default(1).describe("How many link-hops beyond the entry page to crawl for imagery (0=entry only, max 2). Only used with include_images."),
      max_pages: z.number().int().min(0).max(20).optional().default(5).describe("Max interior pages to visit while harvesting imagery. Only used with include_images."),
      max_images: z.number().int().min(1).max(40).optional().default(8).describe("Max images to keep, ranked largest-first. Only used with include_images."),
    },
    async (params) => {
      try {
        const { summary } = await extractAndStoreBrand(params.tenant_id, params.url, params.enhance ?? false, {
          includeImages: params.include_images ?? false,
          depth: params.crawl_depth,
          maxPages: params.max_pages,
          maxImages: params.max_images,
        });
        return ok(summary);
      } catch (e: any) {
        return err("Brand extraction failed: " + e.message);
      }
    },
  );
}
