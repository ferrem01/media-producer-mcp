import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Polish audit part 4: email-compose and the CTA / proof cards rebuilt at
// video scale -- cards fill their slot, type sizes from the box, the ink
// follows the card's own surface, the button is the brand primary, shadows
// and margins stay inside what is seen.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "cta-card": "cta", "pricing-card": "cta", "testimonial-card": "cta", "social-proof": "cta", "quote-block": "titles", "email-compose": "mockups" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
// The real Quotient kit: accent is near-black, so a CTA painted from the accent reads as a black pill.
const BRAND = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff", surface: "#dfdfed", text: "#17171c", text_muted: "#8f8f9f" }, fonts: [] };
const PRIMARY = "rgb(57, 59, 245)";

type Comp = { type: string; data: unknown; position?: unknown };
async function open(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, opts: { background?: string; w?: number; h?: number } = {}) {
  const W = opts.w || 1920, H = opts.h || 1080;
  const types = [...new Set(comps.map((c) => c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 6, background: opts.background || "#f4f2ee",
      components: comps.map((c, i) => ({ id: "c" + i, type: c.type, position: c.position || { x: "center", y: "center" }, data: c.data })) } as any,
    components: await Promise.all(types.map(async (t) => ({ type: t, source: await SRC(t) }))),
    brandKit: BRAND as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pc-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** The element's box on screen, and whether it sits inside the frame with a margin. */
function inFrame(page: Page, sel: string) {
  return page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { w: r.width, h: r.height, margin: Math.min(r.left, r.top, innerWidth - r.right, innerHeight - r.bottom) };
  }, sel);
}

describe("cta-card", () => {
  it("fills a full frame at video scale inside a real margin, the button in the brand primary", async () => {
    await open([{ type: "cta-card", data: { headline: "Launch your next campaign in minutes", description: "One brief. Every channel.", button_text: "Start free" } }], async (page, seek) => {
      await seek(4);
      const box = await inFrame(page, ".cta-card");
      expect(box.w).toBeGreaterThan(1920 * 0.8);
      expect(box.margin).toBeGreaterThan(20); // the slot overhangs the frame; the card does not
      const m = await page.evaluate(() => {
        const b = document.querySelector(".cta-button")!;
        const shine = document.querySelector(".cta-shine")!.getBoundingClientRect(), br = b.getBoundingClientRect();
        return { bg: getComputedStyle(b).backgroundColor, shineOff: shine.left >= br.right - 1 };
      });
      expect(m.bg).toBe(PRIMARY);
      expect(m.shineOff).toBe(true); // the shine crossed and left
    });
  }, 60000);

  it("on a dark ground the card goes dark with white ink (never white text on a light plate)", async () => {
    await open([{ type: "cta-card", data: { headline: "Try Quotient free", button_text: "Get started" }, position: { x: "50%", y: "20%", width: "40%", height: "60%" } }], async (page, seek) => {
      await seek(4);
      const m = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector(".cta-card")!).backgroundColor, ink: getComputedStyle(document.querySelector(".cta-headline")!).color,
        fs: parseFloat(getComputedStyle(document.querySelector(".cta-headline")!).fontSize) }));
      expect(m.bg).toBe("rgb(22, 23, 29)");
      expect(m.ink).toBe("rgb(255, 255, 255)");
      expect(m.fs).toBeGreaterThan(48); // a 40% slot still gets video-size type
    }, { background: "#0d0e14" });
  }, 60000);
});

describe("pricing-card", () => {
  it("counts the price up, builds every feature row, and fills its slot", async () => {
    const data = { name: "Growth", price: "$49", period: "/month", highlighted: true, cta: "Start trial", features: ["Unlimited campaigns", "AI drafts", "Brand kit", "CRM sync", "Priority support"] };
    await open([{ type: "pricing-card", data, position: { x: "30%", y: "8%", width: "40%", height: "84%" } }], async (page, seek) => {
      await seek(0.5);
      expect(await page.evaluate(() => document.querySelector(".pc-price")!.textContent)).toBe("$0");
      await seek(4);
      const m = await page.evaluate(() => ({
        price: document.querySelector(".pc-price")!.textContent, badge: document.querySelector(".pc-badge")!.textContent,
        rows: [...document.querySelectorAll(".pc-feat")].filter((r) => +getComputedStyle(r).opacity > 0.99).length,
        cta: getComputedStyle(document.querySelector(".pc-cta")!).backgroundColor, feat: parseFloat(getComputedStyle(document.querySelector(".pc-feat")!).fontSize),
      }));
      expect(m.price).toBe("$49");
      expect(m.badge).toBe("Most popular");
      expect(m.rows).toBe(5);
      expect(m.cta).toBe(PRIMARY);
      expect(m.feat).toBeGreaterThan(20); // the audit measured 13px feature rows
      expect((await inFrame(page, ".pc-card")).h).toBeGreaterThan(1080 * 0.6);
    });
  }, 60000);
});

describe("testimonial-card", () => {
  it("rises line by line, sweeps the highlight, fills the stars and sets initials", async () => {
    const data = { quote: "We shipped our Q3 launch in one afternoon. Our pipeline doubled in six weeks.", highlight: "pipeline doubled in six weeks", name: "Priya Raman", role: "VP Marketing", company: "Northwind", rating: 5 };
    await open([{ type: "testimonial-card", data, position: { x: "10%", y: "15%", width: "80%", height: "70%" } }], async (page, seek) => {
      await seek(4.5);
      const m = await page.evaluate(() => ({
        lines: document.querySelectorAll(".tc-line").length, words: document.querySelectorAll(".tc-w").length,
        hl: [...document.querySelectorAll(".tc-w.hl")].map((w) => getComputedStyle(w).backgroundSize),
        stars: document.querySelectorAll(".tc-stars svg").length, initials: document.querySelector(".tc-initials")!.textContent,
        quote: parseFloat(getComputedStyle(document.querySelector(".tc-quote")!).fontSize),
      }));
      expect(m.lines).toBeGreaterThanOrEqual(2);
      expect(m.words).toBe(14);
      expect(m.hl.length).toBe(5);
      expect(new Set(m.hl)).toEqual(new Set(["100% 100%"]));
      expect(m.stars).toBe(5);
      expect(m.initials).toBe("PR");
      expect(m.quote).toBeGreaterThan(36); // the audit measured a 15px grey italic quote
    });
  }, 60000);
});

describe("social-proof", () => {
  it("counts every figure up and never lets one spill out of its card", async () => {
    const items = [{ text: "Northwind" }, { text: "Brightline" }, { text: "$1.2M", subtext: "pipeline sourced" }, { text: "#1", subtext: "on G2 for AI marketing" }];
    await open([{ type: "social-proof", data: { title: "Trusted by", layout: "grid", items }, position: { x: "5%", y: "10%", width: "30%", height: "80%" } }], async (page, seek) => {
      await seek(0.3);
      expect(await page.evaluate(() => document.querySelector(".sp-item.stat .sp-text")!.textContent)).toBe("$0.0M");
      await seek(4);
      const m = await page.evaluate(() => ({
        kinds: [...document.querySelectorAll(".sp-item")].map((c) => c.className.replace("sp-item ", "")),
        texts: [...document.querySelectorAll(".sp-text")].map((t) => t.textContent),
        spill: [...document.querySelectorAll(".sp-text")].filter((t) => t.scrollWidth > t.clientWidth + 1).length,
        sub: parseFloat(getComputedStyle(document.querySelector(".sp-sub")!).fontSize), fig: parseFloat(getComputedStyle(document.querySelector(".sp-item.stat .sp-text")!).fontSize),
      }));
      expect(m.kinds).toEqual(["logo", "logo", "stat", "stat"]);
      expect(m.texts).toEqual(["Northwind", "Brightline", "$1.2M", "#1"]);
      expect(m.spill).toBe(0);
      expect(m.fig).toBeGreaterThan(m.sub); // figures shrink on their own scale; labels keep theirs
    });
  }, 60000);
});

describe("quote-block", () => {
  it("sits on the ground by default, lines rise, the highlight takes the brand color", async () => {
    const data = { quote: "The first tool that writes like our brand, not like a robot.", highlight: "like our brand", author: "Dana Whitfield", role: "CMO, Brightline" };
    await open([{ type: "quote-block", data }], async (page, seek) => {
      await seek(4);
      const m = await page.evaluate(() => ({
        plate: getComputedStyle(document.querySelector(".qb-card")!).backgroundColor,
        hl: [...document.querySelectorAll(".qb-w.hl")].map((w) => getComputedStyle(w).color),
        lines: document.querySelectorAll(".qb-line").length, size: parseFloat(getComputedStyle(document.querySelector(".qb-quote")!).fontSize),
      }));
      expect(m.plate).toBe("rgba(0, 0, 0, 0)"); // no ghost panel
      expect(m.hl).toEqual([PRIMARY, PRIMARY, PRIMARY]);
      expect(m.lines).toBeGreaterThanOrEqual(2);
      expect(m.size).toBeGreaterThan(60); // design px; the fit box scales it ~2x on a full frame
    });
  }, 60000);
});

describe("email-compose", () => {
  it("fits a three-paragraph body, finishes typing before a scripted Send, then shows Sent", async () => {
    const data = { to: "Marketing List", from: "marc@getquotient.ai", subject: "Turn your pipeline into signups",
      body: "Hi there,\n\nMost teams chase qualified signups the hard way. Here's a faster path: one brief, one campaign, live this week.\n\nThanks,\nMarc",
      ai: true, attachments: ["brief.pdf"], script: [{ action: "click", target: "send-button", at: 3.2 }] };
    await open([{ type: "email-compose", data, position: { x: "8%", y: "8%", width: "84%", height: "84%" } }], async (page, seek) => {
      const targets = await page.evaluate(() => [...document.querySelectorAll("[data-target]")].map((e) => e.getAttribute("data-target")));
      for (const t of ["to-field", "subject-field", "body-field", "send-button"]) expect(targets).toContain(t);
      await seek(3.1);
      const m = await page.evaluate(() => {
        const b = document.querySelector(".ec-body") as HTMLElement;
        const chars = [...b.querySelectorAll("span:not(.ec-caret)")].filter((s) => !(s as HTMLElement).closest(".ec-ai"));
        return { fits: b.scrollHeight <= b.clientHeight + 2, typed: chars.filter((s) => getComputedStyle(s).display !== "none").length, total: chars.length };
      });
      expect(m.fits).toBe(true);
      expect(m.typed).toBe(m.total);
      await seek(5);
      expect(await page.evaluate(() => +getComputedStyle(document.querySelector(".ec-toast")!).opacity)).toBeGreaterThan(0.99);
    });
  }, 60000);
});
