/**
 * URL Screenshot Capture
 *
 * Uses Playwright to capture screenshots of arbitrary URLs.
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

export interface CaptureUrlOptions {
  url: string;
  outputPath: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  selector?: string;
  delayMs?: number;
}

export interface CaptureUrlResult {
  width: number;
  height: number;
  path: string;
}

export async function captureUrl(opts: CaptureUrlOptions): Promise<CaptureUrlResult> {
  const browser = await chromium.launch({
    args: ["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
    // Honor an explicit Chromium path in constrained/remote envs whose bundled
    // Playwright revision isn't downloaded (mirrors capture.ts LAUNCH_OPTS).
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({
      width: opts.width || 1920,
      height: opts.height || 1080,
    });
    await page.goto(opts.url, { waitUntil: "networkidle", timeout: 30000 });

    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }

    await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });

    let capturedWidth = opts.width || 1920;
    let capturedHeight = opts.height || 1080;

    if (opts.selector) {
      const el = await page.$(opts.selector);
      if (!el) throw new Error("Selector not found: " + opts.selector);
      const box = await el.boundingBox();
      if (box) {
        capturedWidth = Math.round(box.width);
        capturedHeight = Math.round(box.height);
      }
      await el.screenshot({ path: opts.outputPath, type: "png" });
    } else {
      await page.screenshot({
        path: opts.outputPath,
        type: "png",
        fullPage: opts.fullPage || false,
      });
      if (opts.fullPage) {
        const dims = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        capturedWidth = dims.width;
        capturedHeight = dims.height;
      }
    }

    await page.close();
    return { width: capturedWidth, height: capturedHeight, path: opts.outputPath };
  } finally {
    await browser.close();
  }
}
