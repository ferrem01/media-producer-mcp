import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// quotient-email-editor: the Quotient email editor (canvas + email column +
// props panel), hand-built from captures of the real app. The email is a
// data-driven marketing email that writes itself on the timeline: blocks
// arrive top to bottom, headline and text type in, the button pops last,
// and the selection outline (and the panel) follow the block being written.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "quotient-email-editor";
const SRC = path.resolve(__dirname, `../src/components/mockups/${TYPE}.component.html`);
const WELL = { x: "4.7%", y: "8%", width: "93.7%", height: "89%" };
const FULL = { x: "0%", y: "0%", width: "100%", height: "100%" };

async function assemble(data: Record<string, unknown>, W = 1920, H = 1080, position: Record<string, string> = WELL) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: 7, background: "#f4f4f7",
      components: [{ id: "ed", type: TYPE, position, data }],
    } as any,
    components: [{ type: TYPE, source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, W: number, H: number, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qee-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate(() => (document as any).fonts.ready.then(() => true));
    const out = await fn(page);
    expect(errors).toEqual([]);
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Everything a test reads at one moment of the timeline.
const snapshot = () => {
  const root = document.querySelector(".qee")!;
  const op = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).opacity) * (getComputedStyle(n).visibility === "hidden" ? 0 : 1) : -1);
  const blocks = [...document.querySelectorAll(".qee-b")].map((b) => ({
    kind: b.getAttribute("data-kind"),
    shown: b.getAttribute("data-kind") === "button" ? op(b.querySelector(".qee-btn")) : op(b),
    text: (b.querySelector(".qee-t") || b).textContent || "",
    typing: !!b.querySelector(".qee-caret"),
    visibleText: [...(b.querySelector(".qee-t") || b).childNodes].filter((n) => !(n as Element).classList?.contains("qee-ghost")).map((n) => n.textContent).join(""),
  }));
  return {
    blocks,
    selected: root.getAttribute("data-selected"),
    tab: root.getAttribute("data-tab"),
    order: root.getAttribute("data-block-order"),
    scroll: Number(root.getAttribute("data-scroll")),
    bgHex: document.querySelector('[data-v="bg"]')!.textContent,
    fgHex: document.querySelector('[data-v="fg"]')!.textContent,
    sel: getComputedStyle(document.querySelector(".qee-sel")!).visibility,
    all: root.textContent || "",
  };
};

describe("quotient-email-editor", () => {
  it("carries no real content from the captures", async () => {
    const src = await fs.readFile(SRC, "utf-8");
    for (const real of ["Marc's take", "Marc\\u2019s take", "Klaviyo", "Braze", "Cisco", "Cision", "GIGR", "Marc Ferrentino", "cm7ncepht"]) {
      expect(src, `source still contains ${real}`).not.toContain(real);
    }
    expect(src).not.toMatch(/data:image\/(png|jpeg|jpg|webp);base64/);
    expect(src.length).toBeLessThan(120_000);
  });

  it("writes itself: blocks arrive in order, the headline types, the button pops last, the outline and panel follow", async () => {
    const html = await assemble({});
    const r = await withPage(html, 1920, 1080, async (page) => {
      const snaps: any[] = [];
      for (let t = 0; t <= 3.2; t += 0.05) {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        snaps.push({ t, ...(await page.evaluate(snapshot)) });
      }
      const anchors = await page.evaluate(() => [...document.querySelectorAll("[data-anchor]")].map((n) => n.getAttribute("data-anchor")));
      return { snaps, anchors };
    });
    const s0 = r.snaps[0], end = r.snaps[r.snaps.length - 1];
    const kinds = end.blocks.map((b: any) => b.kind);
    expect(kinds).toEqual(["logo", "eyebrow", "hero", "headline", "text", "button", "features", "footer"]);
    // Frame 0: nothing written yet, no outline.
    expect(s0.blocks.every((b: any) => b.shown < 0.05)).toBe(true);
    expect(s0.sel).toBe("hidden");
    // Arrival times follow the published order, top to bottom, the button last.
    const order = String(end.order).split(",").map(Number);
    expect(order[order.length - 1]).toBe(kinds.indexOf("button"));
    const arrive = kinds.map((_: any, i: number) => r.snaps.find((s) => s.blocks[i].shown > 0.5)?.t ?? 99);
    for (let i = 1; i < order.length; i++) expect(arrive[order[i]]).toBeGreaterThan(arrive[order[i - 1]]);
    expect(Math.max(...arrive)).toBe(arrive[kinds.indexOf("button")]);
    expect(arrive[kinds.indexOf("button")]).toBeLessThan(2.6);
    // The headline TYPES: a moment with a caret and a strict prefix of the final text.
    const hi = kinds.indexOf("headline");
    const finalHead = end.blocks[hi].text;
    expect(finalHead).toBe("Your trial ends in 3 days");
    const mid = r.snaps.find((s) => s.blocks[hi].typing && s.blocks[hi].visibleText.length > 2 && s.blocks[hi].visibleText.length < finalHead.length);
    expect(mid).toBeTruthy();
    expect(finalHead.startsWith(mid.blocks[hi].visibleText)).toBe(true);
    // The body text types too, and settles with no caret.
    const ti = kinds.indexOf("text");
    expect(r.snaps.some((s) => s.blocks[ti].typing)).toBe(true);
    expect(end.blocks.some((b: any) => b.typing)).toBe(false);
    expect(end.blocks[ti].text).toContain("1,284");
    // The outline visits the blocks in writing order and rests on the button.
    const visited: string[] = [];
    for (const s of r.snaps) if (s.selected !== "none" && visited[visited.length - 1] !== s.selected) visited.push(s.selected);
    expect(visited).toEqual(order.map((i) => `block-${i}`));
    expect(end.selected).toBe(`block-${kinds.indexOf("button")}`);
    // The panel follows: text block = #6A6A78 body grey, button = brand fill + white text.
    const onText = r.snaps.find((s) => s.selected === `block-${ti}`);
    expect(onText.fgHex).toBe("#6A6A78");
    expect(end.bgHex).toBe("#393BF5");
    expect(end.fgHex).toBe("#FFFFFF");
    // The chip, and every word from the defaults.
    expect(end.all).toContain("Drafted with Quotient");
    expect(end.all).toContain("Keep my workspace");
    expect(end.all).toContain("Your Flows trial");
    for (const f of ["Flows that run themselves", "Emails written in your voice", "See what every send drove"]) expect(end.all).toContain(f);
    // Settled, the canvas has scrolled back so the top of the email shows.
    expect(end.scroll).toBeLessThan(200);
    // Camera anchors.
    for (const a of ["email", "panel", "canvas", "headline", "hero", "button", "text", "features", "footer"]) expect(r.anchors).toContain(a);
    for (let i = 0; i < kinds.length; i++) expect(r.anchors).toContain(`block-${i}`);
  }, 120000);

  it("data.at shifts the performance; entrance:'none' is the finished email at frame 0", async () => {
    const shifted = await withPage(await assemble({ at: 1.5 }), 1920, 1080, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1.4); });
      return page.evaluate(snapshot);
    });
    expect(shifted.blocks.every((b: any) => b.shown < 0.05)).toBe(true);
    const r = await withPage(await assemble({ entrance: "none" }), 1920, 1080, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(0); });
      return page.evaluate(snapshot);
    });
    expect(r.blocks.every((b: any) => b.shown > 0.99)).toBe(true);
    expect(r.blocks.find((b: any) => b.kind === "headline")!.text).toBe("Your trial ends in 3 days");
    expect(r.blocks.some((b: any) => b.typing)).toBe(false);
    expect(r.selected).toBe("block-5");
    expect(r.sel).toBe("visible");
    expect(r.scroll).toBe(0);
  }, 60000);

  it("data drives every word -- brand, blocks, card and quote", async () => {
    const data = {
      brand: { name: "Northwind", color: "#0f766e" },
      subject: "Northwind subject line",
      blocks: [
        { kind: "logo" },
        { kind: "eyebrow", text: "Northwind Weekly" },
        { kind: "hero", steps: [{ title: "Lead signs up", sub: "Trigger" }, { title: "Score the lead", sub: "AI" }, { title: "Route to sales", sub: "Slack" }], label: "Routing flow" },
        { kind: "headline", text: "Meet the new routing" },
        { kind: "text", text: "Leads now reach the right rep in 40 seconds." },
        { kind: "card", title: "How Northwind cut reporting time 80%", text: "A short read for the ops team." },
        { kind: "quote", label: "Sarah's note", text: "This changed our Mondays." },
        { kind: "divider" },
        { kind: "button", text: "See it live" },
        { kind: "footer", copyright: "Northwind Ltd.", text: "Sent to the ops list." },
      ],
    };
    const r = await withPage(await assemble(data), 1920, 1080, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(5); });
      return page.evaluate(() => ({
        text: document.querySelector(".qee")!.textContent || "",
        btnBg: getComputedStyle(document.querySelector(".qee-btn")!).backgroundColor,
        quoteRule: getComputedStyle(document.querySelector(".qee-b-quote")!).borderLeftColor,
        layers: [...document.querySelectorAll(".qp-lrow[data-layer]")].map((n) => n.textContent),
      }));
    });
    for (const w of ["Northwind", "Northwind Weekly", "Lead signs up", "Score the lead", "Route to sales", "Routing flow", "Meet the new routing",
      "Leads now reach the right rep in 40 seconds.", "How Northwind cut reporting time 80%", "A short read for the ops team.",
      "Sarah's note:", "This changed our Mondays.", "See it live", "Northwind Ltd.", "Sent to the ops list.", "Northwind subject line"]) {
      expect(r.text, w).toContain(w);
    }
    for (const w of ["Your trial ends", "Keep my workspace", "Marc's take", "Klaviyo", "Braze", "Cisco"]) expect(r.text).not.toContain(w);
    expect(r.btnBg).toBe("rgb(15, 118, 110)");
    expect(r.quoteRule).toBe("rgb(80, 39, 203)");
    expect(r.layers).toEqual(["Logo", "Eyebrow", "Hero", "Headline", "Text", "Card", "Quote", "Divider", "Button", "Footer"]);
  }, 60000);

  it("phone-first: a tall box hides the panel and sets body type >= 22px at 1080 wide", async () => {
    const r = await withPage(await assemble({}, 1080, 1920, FULL), 1080, 1920, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(4); });
      return page.evaluate(() => {
        const col = document.querySelector(".qee-col")!.getBoundingClientRect();
        const body = document.querySelector(".qee-b-text .qee-t")!;
        const head = document.querySelector(".qee-b-headline .qee-t")!;
        const last = document.querySelector(".qee-b-footer")!.getBoundingClientRect();
        return {
          panel: getComputedStyle(document.querySelector(".qee-panel")!).display,
          body: parseFloat(getComputedStyle(body).fontSize), head: parseFloat(getComputedStyle(head).fontSize),
          colW: col.width, colL: col.left, footerBottom: last.bottom,
          docked: document.querySelector(".qee")!.classList.contains("is-docked"),
        };
      });
    });
    expect(r.panel).toBe("none");
    expect(r.body).toBeGreaterThanOrEqual(22);
    expect(r.head).toBeGreaterThan(48);
    expect(r.colW).toBeGreaterThan(950);            // fills the width, a thin dotted margin left over
    expect(r.colL).toBeGreaterThan(10);
    expect(r.footerBottom).toBeLessThanOrEqual(1920); // the whole email fits the phone frame
    expect(r.docked).toBe(true);
  }, 60000);

  it("script: select, set-text, type, count, switch-tab, highlight -- scrub-safe both ways", async () => {
    const data = {
      script: [
        { action: "select", block: "headline", at: 3.0 },
        { action: "set-text", block: "button", to: "Upgrade now", at: 3.2 },
        { action: "count", target: "1,284", to: 2410, at: 3.4, duration: 1 },
        { action: "switch-tab", tab: "Layers", at: 4.6 },
        { action: "highlight", block: "hero", at: 4.8, duration: 1.2 },
        { action: "type", block: "eyebrow", text: "Last call", at: 5.2, speed: 0.05 },
        { action: "click", target: "Styles", at: 6.0 },
      ],
    };
    const r = await withPage(await assemble(data), 1920, 1080, async (page) => {
      const at = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => ({
          ...(() => {
            const root = document.querySelector(".qee")!;
            return { selected: root.getAttribute("data-selected"), tab: root.getAttribute("data-tab") };
          })(),
          btn: document.querySelector(".qee-btn span")!.textContent,
          body: document.querySelector(".qee-b-text .qee-t")!.textContent,
          eyebrow: [...document.querySelector(".qee-b-eyebrow .qee-t")!.childNodes].filter((n) => !(n as Element).classList?.contains("qee-ghost")).map((n) => n.textContent).join(""),
          layersOn: getComputedStyle(document.querySelector('.qp-view[data-view="Layers"]')!).display,
          layerSel: document.querySelector(".qp-lrow.on")?.textContent || "",
          hl: parseFloat(getComputedStyle(document.querySelector(".qee-b-hero > .qee-hl")!).opacity),
          size: document.querySelector('[data-v="size"]')!.textContent,
        }));
      };
      const late = await at(6.5);
      const back = await at(2.9);
      const sel = await at(3.1);
      const counting = await at(3.7);
      const counted = await at(4.5);
      const tab = await at(4.9);
      const hl = await at(5.3);
      const typing = await at(5.4);
      return { late, back, sel, counting, counted, tab, hl, typing };
    });
    // Seeking back undoes everything.
    expect(r.back.btn).toBe("Keep my workspace");
    expect(r.back.body).toContain("1,284");
    expect(r.back.tab).toBe("Styles");
    expect(r.back.selected).toBe("block-5");
    // select: the outline moves, the panel follows (headline size 34).
    expect(r.sel.selected).toBe("block-3");
    expect(r.sel.size).toBe("34");
    // set-text and count.
    expect(r.counting.btn).toBe("Upgrade now");
    const mid = Number((r.counting.body.match(/ran ([\d,]+) times/) || [])[1]?.replace(/,/g, ""));
    expect(mid).toBeGreaterThan(1284);
    expect(mid).toBeLessThan(2410);
    expect(r.counted.body).toContain("ran 2,410 times");
    // switch-tab: the Layers view shows, the selected layer lit.
    expect(r.tab.tab).toBe("Layers");
    expect(r.tab.layersOn).toBe("block");
    expect(r.tab.layerSel).toBe("Headline");
    // highlight on the hero.
    expect(r.hl.hl).toBeGreaterThan(0.5);
    // type retypes and selects the eyebrow.
    expect(r.typing.selected).toBe("block-1");
    expect(r.typing.eyebrow.length).toBeGreaterThan(0);
    expect("Last call".startsWith(r.typing.eyebrow)).toBe(true);
    expect(r.late.eyebrow).toBe("Last call");
    expect(r.late.btn).toBe("Upgrade now");
  }, 60000);
});
