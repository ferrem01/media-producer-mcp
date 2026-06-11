/**
 * Reference Image Pipeline Unit Tests
 *
 * Tests the reference image processing module:
 * - Data URI parsing and base64 extraction
 * - URL image downloading and caching
 * - Content part building for LLM messages
 * - Summary text generation
 * - Size validation
 * - MIME type inference
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {
  processReferenceImages,
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "../src/llm/reference-images.js";
import type { ReferenceImage } from "../src/core/types.js";

// ── Test fixtures ──

// 1x1 red PNG as base64 (minimal valid PNG)
const RED_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const TEST_TENANT = "test_refimg";
const TEST_PROJECT = "proj_refimg_test";

// Clean up test cache dir before/after
const cacheDir = path.join(
  process.env.MP_DATA_DIR || "/data/media-producer",
  TEST_TENANT,
  "projects",
  TEST_PROJECT,
  "_assets",
  "references",
);

beforeAll(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
});

afterAll(async () => {
  // Clean up test data
  const testDir = path.join(
    process.env.MP_DATA_DIR || "/data/media-producer",
    TEST_TENANT,
  );
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
});

// ── processReferenceImages ──

describe("processReferenceImages", () => {
  it("processes data URI images", async () => {
    const images: ReferenceImage[] = [
      {
        url: `data:image/png;base64,${RED_PIXEL_PNG_BASE64}`,
        role: "ui_reference",
        label: "Test red pixel",
      },
    ];

    const results = await processReferenceImages(images, TEST_TENANT, TEST_PROJECT);

    expect(results).toHaveLength(1);
    expect(results[0]._mediaType).toBe("image/png");
    expect(results[0]._base64Data).toBe(RED_PIXEL_PNG_BASE64);
    expect(results[0]._cachedPath).toBeTruthy();
    expect(results[0].label).toBe("Test red pixel");
    expect(results[0].role).toBe("ui_reference");

    // Verify file was cached to disk
    const stat = await fs.stat(results[0]._cachedPath!);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("skips invalid data URIs gracefully", async () => {
    const images: ReferenceImage[] = [
      {
        url: "data:text/plain;base64,SGVsbG8=",
        role: "screenshot",
      },
    ];

    const results = await processReferenceImages(images, TEST_TENANT, TEST_PROJECT);
    // Should skip (invalid data URI format for images)
    expect(results).toHaveLength(0);
  });

  it("respects MAX_IMAGES cap (10)", async () => {
    const images: ReferenceImage[] = Array.from({ length: 15 }, (_, i) => ({
      url: `data:image/png;base64,${RED_PIXEL_PNG_BASE64}`,
      role: "style_reference" as const,
      label: `Image ${i}`,
    }));

    const results = await processReferenceImages(images, TEST_TENANT, TEST_PROJECT);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("downloads URL images from a local server", async () => {
    // Spin up a tiny HTTP server serving a PNG
    const pngBuffer = Buffer.from(RED_PIXEL_PNG_BASE64, "base64");
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": pngBuffer.length,
      });
      res.end(pngBuffer);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}/test.png`;

    try {
      const images: ReferenceImage[] = [
        { url, role: "screenshot", label: "Local test image" },
      ];
      const results = await processReferenceImages(images, TEST_TENANT, TEST_PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]._mediaType).toBe("image/png");
      expect(results[0]._base64Data).toBeTruthy();
      expect(results[0]._cachedPath).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it("skips images that fail to download", async () => {
    const images: ReferenceImage[] = [
      {
        url: "http://127.0.0.1:1/nonexistent.png",
        role: "ui_reference",
      },
    ];

    const results = await processReferenceImages(images, TEST_TENANT, TEST_PROJECT);
    expect(results).toHaveLength(0);
  });
});

// ── buildReferenceImageParts ──

describe("buildReferenceImageParts", () => {
  it("builds correct LLM content parts", () => {
    const images: ReferenceImage[] = [
      {
        url: "https://example.com/img.png",
        role: "ui_reference",
        label: "Dashboard screenshot",
        _base64Data: RED_PIXEL_PNG_BASE64,
        _mediaType: "image/png",
      },
      {
        url: "https://example.com/style.jpg",
        role: "style_reference",
        _base64Data: "abc123",
        _mediaType: "image/jpeg",
      },
    ];

    const parts = buildReferenceImageParts(images);

    // 2 images * 2 parts each (text label + image block) = 4
    expect(parts).toHaveLength(4);

    // First: text label
    expect(parts[0].type).toBe("text");
    expect((parts[0] as any).text).toContain("Reference image 1");
    expect((parts[0] as any).text).toContain("Dashboard screenshot");

    // Second: image block
    expect(parts[1].type).toBe("image_url");
    expect((parts[1] as any).image_url.url).toContain("data:image/png;base64,");

    // Third: text label for second image
    expect(parts[2].type).toBe("text");
    expect((parts[2] as any).text).toContain("Reference image 2");

    // Fourth: image block
    expect(parts[3].type).toBe("image_url");
    expect((parts[3] as any).image_url.url).toContain("data:image/jpeg;base64,");
  });

  it("skips images without base64 data", () => {
    const images: ReferenceImage[] = [
      {
        url: "https://example.com/failed.png",
        role: "screenshot",
        // No _base64Data or _mediaType
      },
    ];

    const parts = buildReferenceImageParts(images);
    expect(parts).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    const parts = buildReferenceImageParts([]);
    expect(parts).toHaveLength(0);
  });
});

// ── buildReferenceImageSummary ──

describe("buildReferenceImageSummary", () => {
  it("builds a summary with image metadata", () => {
    const images: ReferenceImage[] = [
      { url: "...", role: "ui_reference", label: "Claude UI" },
      { url: "...", role: "style_reference", label: "Brand palette" },
    ];

    const summary = buildReferenceImageSummary(images);

    expect(summary).toContain("## Reference Images");
    expect(summary).toContain("2 reference image(s)");
    expect(summary).toContain("Claude UI");
    expect(summary).toContain("Brand palette");
    expect(summary).toContain("ui_reference");
    expect(summary).toContain("style_reference");
  });

  it("returns empty string for no images", () => {
    const summary = buildReferenceImageSummary([]);
    expect(summary).toBe("");
  });

  it("handles unlabeled images", () => {
    const images: ReferenceImage[] = [
      { url: "...", role: "screenshot" },
    ];

    const summary = buildReferenceImageSummary(images);
    expect(summary).toContain("unlabeled");
  });
});
