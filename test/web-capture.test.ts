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
        <video style="width:100%;height:60px;background:#000;"></video>
        <canvas width="80" height="40"></canvas>
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
      // Stub the extension messaging the content script expects. qc-shot
      // returns REAL pixels (a solid-teal viewport canvas) so the screenshot
      // freeze path runs exactly as in production.
      await page.evaluate(`window.chrome = window.chrome || {}; window.chrome.runtime = {
        sendMessage: async (msg) => {
          if (msg.type === "qc-shot") {
            const cv = document.createElement("canvas");
            cv.width = Math.round(innerWidth * devicePixelRatio);
            cv.height = Math.round(innerHeight * devicePixelRatio);
            const cx = cv.getContext("2d");
            cx.fillStyle = "#3fa7a0"; cx.fillRect(0, 0, cv.width, cv.height);
            return { ok: true, dataUrl: cv.toDataURL("image/png") };
          }
          return { ok: true, type: "stub" };
        },
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
    // ...and the PAINT GUARANTEE holds: media that cannot ride as DOM
    // (video, canvas) never survives serialization -- each region is FROZEN
    // from the reference screenshot as an <img> carrying real pixels.
    expect(bundle.html).not.toMatch(/<video/i);
    expect(bundle.html).not.toMatch(/<canvas/i);
    const frozenImgs = bundle.html.match(/<img[^>]*object-fit:cover[^>]*src="data:image\/png/gi) || [];
    expect(frozenImgs.length, "video + canvas should both be frozen from the screenshot").toBeGreaterThanOrEqual(2);
    // ...and the bundle mints through the REAL server path.
    const minted = await mintCapturedComponent("captest", { ...bundle, name: "picker-pricing" });
    const html = await fs.readFile(minted.componentPath, "utf-8");
    expect(html).toContain("Upgrade now");
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/<script>window.evil/);
  }, 300_000);
});

describe("extension serializer: positioned layout survives (the LinkedIn header bug)", () => {
  // getComputedStyle resolves auto offsets on absolute elements to USED page
  // coordinates (top:56px = 56px from the ORIGINAL viewport). Baking those
  // flung a11y-hidden spans and absolute chrome to alien positions -- the
  // name vanished, the header collapsed right, the stats bar disappeared.
  // The serializer now rebuilds absolute geometry against containing blocks
  // INSIDE the capture. This fixture is shaped like a LinkedIn post header.
  it("keeps the name, ellipsized title, stats bar and absolute chrome in place", async () => {
    // Mirrors LinkedIn's SDUI feed structure (from a real logged-in capture):
    // nested single-track GRIDS placing items with grid-column:-1, wrapped in
    // display:contents -- computed grid values are not round-trippable, so
    // the serializer must freeze grid geometry instead of re-baking it.
    const pageHtml = `<!doctype html><html><head><style>
        body { margin: 40px; font-family: Arial; background: #f4f4f8; }
        /* 9px base font like the real SDUI card -- children override it.
           The name is sized at EXACTLY the UA default (16px): a serializer
           that diffs inherited props against UA defaults skips it, and the
           replica name then inherits the 9px base and renders tiny. */
        .post { width: 550px; background: #fff; border-radius: 8px; padding: 16px; overflow: hidden; font-size: 9px; }
        .hdr { display: flex; align-items: flex-start; }
        .meta-grid { display: grid; flex: 1; min-width: 0; }
        .meta-col { grid-column: -1; grid-row: 1; display: flex; flex-direction: column; }
        .name-grid { display: grid; }
        .name-cell { grid-column: -1; grid-row: 1; font-weight: 600; font-size: 16px; color: #191919; }
        .vh { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; width: 1px; overflow: hidden; position: absolute; white-space: nowrap; }
        .title { font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .controls { margin-left: auto; flex: none; }
      </style></head><body>
      <div class="post" id="post">
        <div class="hdr">
          <div class="meta-grid"><div style="display:contents"><div class="meta-col">
            <div class="name-grid"><div class="name-cell">Jake Stein<span class="vh">View Jake Stein's profile</span><span style="display:inline-block;position:relative;width:16px;height:16px;"><svg id="badge" width="16" height="16" viewBox="0 0 16 16" style="position:absolute;top:50%;left:50%;transform:translate(-8px,-8px);"><rect width="16" height="16" fill="#c37d16"/></svg></span> · 1st</div></div>
            <span class="title">Co-founder and CEO at Common Paper | Making contracts better for everyone</span>
            <a id="plainlink" href="/in/jake" style="color:#191919;text-decoration:none;font-size:14px;">View profile</a>
            <div style="font-size:14px;"><button id="followbtn" style="font-size:14px;font-weight:600;font-family:Arial;">Follow</button></div>
          </div></div></div>
          <div class="controls"><button>x</button></div>
        </div>
        <div>I started going to church. No, really.</div>
        <div class="social" style="display:grid;margin-top:10px;padding-top:8px;">
          <div style="grid-column:-1;grid-row:1;position:relative;">
            <span class="counts">973 reactions - 147 comments</span>
            <button style="position:absolute;right:0;top:0;">go</button>
          </div>
        </div>
      </div></body></html>`;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "webcap-hdr-"));
    const pageFile = path.join(dir, "page.html");
    await fs.writeFile(pageFile, pageHtml);
    const captureJs = await fs.readFile(path.resolve(__dirname, "../recorder-extension/capture.js"), "utf-8");

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
      });
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.goto(`file://${pageFile}`, { waitUntil: "load" });
      await page.evaluate(`window.chrome = window.chrome || {}; window.chrome.runtime = {
        sendMessage: async (msg) => ({ ok: true, type: "stub" }),
      };`);
      await page.evaluate(captureJs);
      const box = await page.locator("#post").boundingBox();
      await page.mouse.move(box!.x + 10, box!.y + 40);
      await page.mouse.wheel(0, -1);
      await page.mouse.wheel(0, -1);
      await page.keyboard.press("c");
      await page.waitForFunction(() => (window as any).__qcLastBundle, { timeout: 15_000 });
      const bundle = await page.evaluate(() => (window as any).__qcLastBundle);

      // Render the REPLICA alone and measure where things landed.
      const rf = path.join(dir, "replica.html");
      await fs.writeFile(rf, `<!doctype html><body style="margin:20px;background:#f4f4f8">${bundle.html}</body>`);
      const p2 = await browser.newPage({ viewport: { width: 700, height: 400 } });
      await p2.goto(`file://${rf}`, { waitUntil: "load" });
      const r = await p2.evaluate(`(() => {
        const all = [...document.body.firstElementChild.querySelectorAll("*")];
        const leaf = (t) => all.find((e) => (e.textContent || "").includes(t) && ![...e.children].some((ch) => (ch.textContent || "").includes(t)));
        const nameEl = all.filter((e) => e.textContent.trim().startsWith("Jake Stein") && e.children.length <= 3).pop();
        const stats = leaf("973 reactions");
        const goBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "go");
        const badge = document.querySelector("svg");
        const link = [...document.querySelectorAll("a")].find((a) => a.textContent === "View profile");
        const followBtn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Follow");
        const card = document.body.firstElementChild.getBoundingClientRect();
        return {
          link: link ? { color: getComputedStyle(link).color, deco: getComputedStyle(link).textDecorationLine } : null,
          followBtn: followBtn ? { fontSize: getComputedStyle(followBtn).fontSize, fontWeight: getComputedStyle(followBtn).fontWeight } : null,
          badge: badge ? badge.getBoundingClientRect().toJSON() : null,
          name: nameEl ? { r: nameEl.getBoundingClientRect().toJSON(), color: getComputedStyle(nameEl).color, deco: getComputedStyle(nameEl).textDecorationLine, fontSize: getComputedStyle(nameEl).fontSize } : null,
          stats: stats ? stats.getBoundingClientRect().toJSON() : null,
          goBtn: goBtn ? goBtn.getBoundingClientRect().toJSON() : null,
          card: card.toJSON(),
        };
      })()`) as any;
      // The visible name renders wide, on the left, dark, not underlined...
      expect(r.name, "name element missing from replica").toBeTruthy();
      expect(r.name.r.width).toBeGreaterThan(40);
      expect(r.name.r.x - r.card.x).toBeLessThan(60);
      expect(r.name.color).toBe("rgb(25, 25, 25)");
      expect(r.name.deco).toContain("none");
      // ...at its true size, NOT the card's 9px base (inherited props must
      // diff against the parent, not the UA default)...
      expect(r.name.fontSize).toBe("16px");
      // ...UA-styled tags keep their SITE styling even when it equals the
      // parent: an inherit-colored link must not fall to UA blue/underline,
      // and a button matching its parent's font must not fall to UA 13px
      // (which clipped "+ Follo")...
      expect(r.link, "plain link missing").toBeTruthy();
      expect(r.link.color).toBe("rgb(25, 25, 25)");
      expect(r.link.deco).toContain("none");
      expect(r.followBtn, "follow button missing").toBeTruthy();
      expect(r.followBtn.fontSize).toBe("14px");
      expect(r.followBtn.fontWeight).toBe("600");
      // ...the stats bar exists IN FLOW below the body text...
      expect(r.stats, "stats bar missing from replica").toBeTruthy();
      expect(r.stats.y).toBeGreaterThan(r.name.r.y + 30);
      // ...and the absolute button anchors to ITS bar's right edge, not to
      // some page-viewport coordinate.
      expect(r.goBtn, "absolute chrome button missing").toBeTruthy();
      expect(Math.abs(r.goBtn.right - (r.card.right - 16))).toBeLessThan(24);
      expect(Math.abs(r.goBtn.y - r.stats.y)).toBeLessThan(30);
      // ...and the badge SVG (absolute + translate inside a 16px span, the
      // LinkedIn "in" icon shape) sits ON the name row, translated ONCE.
      expect(r.badge, "badge svg missing from replica").toBeTruthy();
      expect(Math.abs(r.badge.y - r.name.r.y)).toBeLessThan(14);
      expect(r.badge.x - r.card.x).toBeGreaterThan(40);
      expect(r.badge.x - r.card.x).toBeLessThan(220);
      expect(Math.round(r.badge.width)).toBe(16);
    } finally {
      if (browser) await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
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
      fonts: [
        // A real embedded face the shell must carry...
        { family: "Acme Grotesk", weight: "700", style: "normal", data: "data:font/woff2;base64," + Buffer.from("fake-font-bytes").toString("base64") },
        // ...and two hostile ones it must drop: an external URL (the whole
        // point is NO network at render) and an injection attempt.
        { family: "Evil", data: "https://evil.example.com/font.woff2" },
        { family: 'Break"}</style><script>alert(1)</script>', data: "data:font/woff2;base64,QUJD" },
      ],
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
    // Embedded fonts: the real face rides in the shell, the hostile ones die.
    expect(html).toContain('@font-face { font-family: "Acme Grotesk"');
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("evil.example.com/font");
    expect(html).not.toMatch(/<script>alert/);
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
        var btn = Array.from(document.querySelectorAll('button')).find(function (b) { return b.textContent.indexOf('Upgrade') !== -1; });
        var dist = null;
        if (cursor && btn) {
          var c = cursor.getBoundingClientRect(), b = btn.getBoundingClientRect();
          dist = Math.hypot((c.left + c.width / 2) - (b.left + b.width / 2), (c.top + c.height / 2) - (b.top + b.height / 2));
        }
        return {
          hl: run ? getComputedStyle(run).backgroundSize : null,
          price: price ? price.textContent : null,
          cursorShown: cursor ? getComputedStyle(cursor).opacity : null,
          cursorToButton: dist,
        };
      })()`) as any;
      // The underline ripped across the quote...
      expect(r.hl, "highlight run missing").toBeTruthy();
      expect(r.hl).toMatch(/^\d/);
      expect(parseFloat(r.hl)).toBeGreaterThan(0);
      // ...the price counted up to $49 keeping its dress...
      expect(r.price).toContain("49");
      expect(r.price).toContain("$");
      // ...and the film's cursor TRAVELED to Upgrade (not just appeared:
      // a function-valued target once left it visible at 0,0 -- pin the
      // position, cursor tip near the button's center).
      expect(r.cursorShown, "cursor never appeared for the click").toBeTruthy();
      expect(r.cursorToButton, "cursor-to-button distance unmeasurable").not.toBeNull();
      expect(r.cursorToButton, `cursor never reached the button (${Math.round(r.cursorToButton)}px away)`).toBeLessThan(80);
    } finally {
      if (browser) await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 300_000);
});
