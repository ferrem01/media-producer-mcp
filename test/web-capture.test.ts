import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

// WEB CAPTURE (SPEC-web-capture.md): a browser-extension bundle in, a real
// tenant component out. ONE concept -- no "clip". The visual path is
// deterministic (sanitize, never generate), the shell delegates behavior to
// shared/capture-performance.js, and the minted file lands where every
// existing reader looks: component html FLAT in the tenant dir (render/
// critique search extra dirs flat), schema in captured/ (the catalog scans
// category subdirs).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpData = await fs.mkdtemp(path.join(os.tmpdir(), "webcap-"));
process.env.MP_DATA_DIR = tmpData;

const { mintCapturedComponent, sanitizeCapturedHtml } = await import("../src/core/web-capture.js");
const { assembleScene } = await import("../src/core/scene-assembler.js");

const FIXTURE_HTML = `
<div style="width:420px;height:260px;background:#ffffff;border:1px solid #e2e2ef;border-radius:12px;padding:24px;font-family:Arial, sans-serif;color:#17171c;">
  <div style="font-size:14px;color:#6b7280;">STARTER</div>
  <div class="price" style="font-size:42px;font-weight:700;">$29<span style="font-size:16px;">/mo</span></div>
  <p style="font-size:14px;">The first product launch that actually felt like magic instead of chaos.</p>
  <button style="background:#393bf5;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:14px;" onclick="alert('x')">Upgrade now</button>
  <script>document.title='pwned'</script>
  <img src="https://evil.example.com/pixel.png" alt="">
  <iframe src="https://evil.example.com/frame"></iframe>
</div>`;

describe("extension picker + serializer (capture.js)", () => {
  it("picks a region, serializes it with inlined styles, and the bundle mints", async () => {
    const pageHtml = `<!doctype html><html><head><style>
        .card { width: 380px; background: #fff; border: 1px solid #e2e2ef; border-radius: 14px; padding: 22px; font-family: Arial; color: #17171c; }
        .tier { font-size: 13px; color: #6b7280; letter-spacing: .08em; }
        .price { font-size: 40px; font-weight: 700; }
        .cta { background: #393bf5; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; }
      </style></head><body style="margin:40px;background:#f4f4f8;">
      <div class="card" id="pricebox"><div class="tier">STARTER</div>
        <div class="price">$29/mo</div>
        <p>Launches that feel like magic instead of chaos.</p>
        <button class="cta" onclick="evil()">Upgrade now</button>
        <script>window.evil = () => {}</` + `script>
      </div></body></html>`;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "webcap-page-"));
    const pageFile = path.join(dir, "page.html");
    await fs.writeFile(pageFile, pageHtml);
    const captureJs = await fs.readFile(path.resolve(__dirname, "../recorder-extension/capture.js"), "utf-8");

    let browser: Browser | null = null;
    let bundle: any;
    try {
      browser = await chromium.launch({
        ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
      });
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.goto(`file://${pageFile}`, { waitUntil: "load" });
      // Stub the extension messaging the content script expects.
      await page.evaluate(`window.chrome = window.chrome || {}; window.chrome.runtime = {
        sendMessage: async (msg) => msg.type === "qc-shot" ? { ok: false } : { ok: true, type: "stub" },
      };`);
      await page.evaluate(captureJs);
      // Hover the card, then press C to capture it.
      const box = await page.locator("#pricebox").boundingBox();
      await page.mouse.move(box!.x + 10, box!.y + 10);
      // The hover lands on an inner element; widen once to the card via wheel-up.
      await page.mouse.wheel(0, -1);
      await page.keyboard.press("c");
      await page.waitForFunction(() => (window as any).__qcLastBundle, { timeout: 15_000 });
      bundle = await page.evaluate(() => (window as any).__qcLastBundle);
    } finally {
      if (browser) await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }

    // The serialized replica carries the page's own computed look...
    expect(bundle.html).toContain("Upgrade now");
    expect(bundle.html).toContain("$29/mo");
    expect(bundle.html).toMatch(/border-top-left-radius:\s*14px/);
    expect(bundle.html).toMatch(/rgb\(57,\s*59,\s*245\)/); // the CTA violet, computed
    expect(bundle.width).toBeGreaterThan(300);
    // ...and the bundle mints through the REAL server path.
    const minted = await mintCapturedComponent("captest", { ...bundle, name: "picker-pricing" });
    const html = await fs.readFile(minted.componentPath, "utf-8");
    expect(html).toContain("Upgrade now");
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/<script>window.evil/);
  }, 300_000);
});

describe("sanitizeCapturedHtml", () => {
  it("strips scripts, handlers, iframes and external refs but keeps the surface", async () => {
    const clean = await sanitizeCapturedHtml(FIXTURE_HTML);
    expect(clean).toContain("Upgrade now");
    expect(clean).toContain("$29");
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).not.toMatch(/evil\.example\.com/);
  }, 120_000);
});

describe("mintCapturedComponent", () => {
  let minted: Awaited<ReturnType<typeof mintCapturedComponent>>;

  beforeAll(async () => {
    minted = await mintCapturedComponent("captest", {
      name: "Acme Pricing!!", // gets kebab-sanitized
      description: "Acme pricing card, starter tier",
      html: FIXTURE_HTML,
      source_url: "https://acme.example.com/pricing",
      width: 420, height: 260,
      screenshot: "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
    });
  }, 120_000);

  it("mints a flat tenant component + captured/ schema + reference", async () => {
    expect(minted.type).toBe("acme-pricing");
    expect(path.basename(minted.componentPath)).toBe("acme-pricing.component.html");
    expect(minted.componentPath).not.toContain("/captured/");
    expect(minted.schemaPath).toContain("/captured/");
    const html = await fs.readFile(minted.componentPath, "utf-8");
    expect(html).toContain("runCapturePerformance");
    expect(html).toContain("Upgrade now");
    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain("source_url: https://acme.example.com/pricing");
    const schema = JSON.parse(await fs.readFile(minted.schemaPath, "utf-8"));
    expect(schema.category).toBe("captured");
    expect(schema.description).toContain("CAPTURED SURFACE");
    expect(schema.script_actions.map((a: any) => a.action)).toContain("highlight");
    expect(minted.refPath && (await fs.stat(minted.refPath)).size).toBeGreaterThan(0);
  });

  it("performs the generic verbs on the frozen markup in a real browser", async () => {
    const source = await fs.readFile(minted.componentPath, "utf-8");
    const html = await assembleScene({
      scene: {
        id: "s1", label: "cap", duration_seconds: 5, background: "#f2efe7",
        components: [{
          id: "c1", type: "acme-pricing",
          position: { x: "10%", y: "10%", width: "80%", height: "80%" },
          data: {
            script: [
              { action: "highlight", text: "felt like magic", style: "underline", color: "#393bf5", at: 0.4 },
              { action: "count-up", text: "$29", to: 49, at: 1.2, duration: 0.8 },
              { action: "click", text: "Upgrade now", at: 2.4 },
            ],
          },
        }],
      } as any,
      components: [{ type: "acme-pricing", source }],
      brandKit: { colors: { background: "#f2efe7", text: "#17171c", primary: "#393bf5" }, fonts: [] } as any,
      canvas: { width: 1280, height: 720 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "webcap-probe-"));
    const f = path.join(dir, "scene.html");
    await fs.writeFile(f, html);
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
      });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`file://${f}`, { waitUntil: "load", timeout: 60_000 });
      await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
      const r = await page.evaluate(`(() => {
        var tl = window.__MP_TIMELINE;
        tl.pause(); tl.time(3.5);
        var run = document.querySelector('.cap-hl-run');
        var price = document.querySelector('.price');
        var cursor = document.querySelector('.mp-cursor');
        return {
          hl: run ? getComputedStyle(run).backgroundSize : null,
          price: price ? price.textContent : null,
          cursorShown: cursor ? getComputedStyle(cursor).opacity : null,
        };
      })()`) as any;
      // The underline ripped across the quote...
      expect(r.hl, "highlight run missing").toBeTruthy();
      expect(r.hl).toMatch(/^\d/);
      expect(parseFloat(r.hl)).toBeGreaterThan(0);
      // ...the price counted up to $49 keeping its dress...
      expect(r.price).toContain("49");
      expect(r.price).toContain("$");
      // ...and the film's cursor entered to click Upgrade.
      expect(r.cursorShown, "cursor never appeared for the click").toBeTruthy();
    } finally {
      if (browser) await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 300_000);
});
