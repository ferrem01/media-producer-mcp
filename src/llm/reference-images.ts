/**
 * Reference Image Processing
 *
 * Downloads, validates, caches, and base64-encodes reference images
 * so the LLM storyboard builder and scene generator can SEE visual references
 * instead of hallucinating from text descriptions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "../persistence/paths.js";
import type { ReferenceImage } from "../core/types.js";
import type { LLMContentPart } from "./client.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5MB per image
const MAX_IMAGES = 10;
const SUPPORTED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);

/**
 * Download, validate, cache, and base64-encode reference images.
 * Populates _cachedPath, _base64Data, and _mediaType on each image.
 */
export async function processReferenceImages(
  images: ReferenceImage[],
  tenantId: string,
  projectId: string,
): Promise<ReferenceImage[]> {
  var capped = images.slice(0, MAX_IMAGES);
  var cacheDir = path.join(
    projectDir(tenantId, projectId), "_assets", "references"
  );
  await fs.mkdir(cacheDir, { recursive: true });

  var results: ReferenceImage[] = [];

  for (var i = 0; i < capped.length; i++) {
    var img = { ...capped[i] };
    try {
      if (img.url.startsWith("data:")) {
        // Parse data URI
        var match = img.url.match(
          /^data:(image\/[^;]+);base64,(.+)$/
        );
        if (!match) throw new Error("Invalid data URI");
        img._mediaType = match[1];
        img._base64Data = match[2];
        // Also save to disk for caching
        var ext = img._mediaType.split("/")[1] || "png";
        var cachePath = path.join(cacheDir, `ref_${i}.${ext}`);
        await fs.writeFile(cachePath, Buffer.from(img._base64Data, "base64"));
        img._cachedPath = cachePath;
      } else if (img.url.startsWith("file://")) {
        // Read from local filesystem
        var filePath = img.url.slice(7); // strip file://
        var buffer = Buffer.from(await fs.readFile(filePath));
        if (buffer.length > MAX_IMAGE_BYTES) {
          throw new Error(
            `Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 5MB)`
          );
        }
        var mediaType = inferMediaType(filePath) || "image/png";
        var ext = mediaType.split("/")[1] || "png";
        if (ext === "jpeg") ext = "jpg";
        var cachePath = path.join(cacheDir, `ref_${i}.${ext}`);
        await fs.writeFile(cachePath, buffer);
        img._cachedPath = cachePath;
        img._base64Data = buffer.toString("base64");
        img._mediaType = mediaType;
      } else {
        // Download from URL
        var response = await fetch(img.url, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        var contentType = response.headers.get("content-type") || "";
        var mediaType = contentType.split(";")[0].trim();
        if (!SUPPORTED_TYPES.has(mediaType)) {
          // Try to infer from URL extension
          mediaType = inferMediaType(img.url) || "image/png";
        }
        var buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES) {
          throw new Error(
            `Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 5MB)`
          );
        }
        var ext = mediaType.split("/")[1] || "png";
        if (ext === "jpeg") ext = "jpg";
        var cachePath = path.join(cacheDir, `ref_${i}.${ext}`);
        await fs.writeFile(cachePath, buffer);
        img._cachedPath = cachePath;
        img._base64Data = buffer.toString("base64");
        img._mediaType = mediaType;
      }
      results.push(img);
      console.log(
        `  [ref-images] Cached reference ${i}: ${img.label || img.role} (${img._mediaType})`
      );
    } catch (e: any) {
      console.warn(
        `  [ref-images] Failed to process reference ${i}: ${e.message}`
      );
      // Skip failed images, don't block the pipeline
    }
  }

  return results;
}

function inferMediaType(url: string): string | null {
  var ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  var map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return ext ? map[ext] || null : null;
}

/**
 * Build LLM content parts (image blocks) for reference images.
 * Used to inject into storyboard builder and agentic generator messages.
 */
export function buildReferenceImageParts(
  images: ReferenceImage[],
): LLMContentPart[] {
  var parts: LLMContentPart[] = [];

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    if (!img._base64Data || !img._mediaType) continue;

    // Label text block before each image
    parts.push({
      type: "text",
      text: `Reference image ${i + 1}${img.label ? ` — "${img.label}"` : ""} (${img.role}):`,
    });

    // Image content block as data URI
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${img._mediaType};base64,${img._base64Data}`,
      },
    });
  }

  return parts;
}

/**
 * Build a text summary of available reference images (for system prompts).
 */
export function buildReferenceImageSummary(
  images: ReferenceImage[],
): string {
  if (!images.length) return "";

  var lines = [
    "\n## Reference Images",
    `You have ${images.length} reference image(s). They are included as vision content in this conversation.`,
    "Study them carefully and match the visual style, layout, and design patterns you see.",
    "",
  ];

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    lines.push(
      `- **Reference ${i + 1}**: ${img.label || "unlabeled"} (${img.role})`
    );
  }

  lines.push("");
  lines.push(
    "When writing scene visual notes or HTML, explicitly reference these images: " +
    '"Match the layout from reference image 1", "Use the color palette from reference 2", etc.'
  );

  return lines.join("\n");
}
