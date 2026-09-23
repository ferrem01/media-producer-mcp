import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { parseComponent } from "../src/core/component-parser.js";

// The Quotient audience pages -- person, company, people list -- captured
// from the real app and moved into the house library. They are shared with
// every tenant, so they carry demo people only; and the two detail pages'
// activity feeds are scriptable: a signal fires, a row lands under its day.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKS = path.resolve(__dirname, "../src/components/mockups");
const TYPES = ["audience-person-detail", "audience-company-details", "audience-people-list"];
const read = (t: string) => fs.readFile(path.join(MOCKS, `${t}.component.html`), "utf-8");

async function assemble(type: string, data: Record<string, unknown>, W = 1920, H = 1080, position?: Record<string, string>) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: 6, background: "#f4f4f7",
      components: [{ id: "m0", type, position: position || { x: "4%", y: "4%", width: "92%", height: "92%" }, data }],
    } as any,
    components: [{ type, source: await read(type) }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, W: number, H: number, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aud-"));
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

describe("a component's own <style> and <script> come from after its template", () => {
  it("ignores a <style> inside the captured markup (an SVG icon's defs)", () => {
    // Taking the first <style> in the file handed audience-person-detail a
    // three-line icon rule instead of its styles: no font, no fit.
    const src = `<template><div><svg><defs><style style="x">.cls-1 { fill: none; }</style></defs></svg></div></template>
<style>.cap-root { display: flex; }</style>
<script>function createTimeline(el){ return gsap.timeline(); }</script>`;
    const p = parseComponent(src);
    expect(p.style).toBe(".cap-root { display: flex; }");
    expect(p.script).toContain("createTimeline");
  });
});

describe("the audience components are safe to share", () => {
  it("carry demo people only -- no customer names, emails, photos or workspace ids", async () => {
    for (const t of TYPES) {
      const src = await read(t);
      for (const real of ["ridepanda", "useodin", "@gmail.com", "openai.com", "Emily Parker", "Palcidus", "cm7ncepht", "Odin"]) {
        expect(src, `${t} still contains ${real}`).not.toContain(real);
      }
      // No photographs: every avatar is an initials SVG.
      expect(src, `${t} embeds a photo`).not.toMatch(/data:image\/(jpeg|jpg|webp);base64/);
      // Small enough to inline into every scene that uses it.
      expect(src.length, `${t} is ${src.length} bytes`).toBeLessThan(700_000);
    }
  });
});

describe("audience-person-detail", () => {
  it("lands scripted signals in the feed, grouped by day, at full height, in Inter, with the details column in frame", async () => {
    const html = await assemble("audience-person-detail", {
      today: "2026-09-23",
      activity: [
        { at: 0.4, type: "page_view", detail: "/pricing", source: "Website", time: "10:41 AM" },
        { at: 1.0, type: "deal_stage_changed", detail: "Qualified → Proposal", source: "HubSpot", time: "10:52 AM" },
        { at: 1.6, type: "product_event", name: "First campaign sent", source: "Product", time: "11:03 AM" },
        // An older day that already has a group: it joins that group.
        { at: 2.2, type: "email_clicked", date: "2026-09-21", detail: "Spring pricing update", time: "7:02 PM" },
      ],
    });
    const r = await withPage(html, 1920, 1080, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(3.5); });
      return page.evaluate(() => {
        const body = document.querySelector(".cap-body")!;
        const heads = [...body.querySelectorAll("h3")].map((h) => h.textContent!.trim());
        const titleOf = (row: Element) => [...row.querySelectorAll("div")].find((d) => !d.children.length || d.querySelector("span"))?.textContent || "";
        const g0 = body.querySelectorAll("h3")[0].nextElementSibling!;
        const rows0 = [...g0.children].map((r) => ({ text: r.textContent || "", h: (r as HTMLElement).getBoundingClientRect().height }));
        const g1 = body.querySelectorAll("h3")[1].nextElementSibling!;
        const firstOld = g1.children[0].textContent || "";
        const templateH = g1.children[1].getBoundingClientRect().height;
        const details = [...body.querySelectorAll("td")].find((td) => td.textContent!.trim() === "Head of Growth")!;
        const comp = document.querySelector(".mp-component")!.getBoundingClientRect();
        const nameEl = [...body.querySelectorAll("div,span")].find((d) => !d.children.length && d.textContent!.trim() === "Sarah Chen")!;
        return {
          heads: heads.slice(0, 3), rows0, firstOld, templateH,
          detailsRight: details.getBoundingClientRect().right, compRight: comp.right,
          font: getComputedStyle(nameEl).fontFamily, inter: (document as any).fonts.check("16px Inter", "Sarah Chen"),
          titles: rows0.map((x) => x.text),
        };
      });
    });
    // A new day, above the captured ones; the older event joined its day.
    expect(r.heads).toEqual(["Wednesday, September 23, 2026", "Monday, September 21, 2026", "Friday, September 18, 2026"]);
    expect(r.rows0).toHaveLength(3);
    expect(r.rows0[0].text).toContain("Sarah Chen triggered “First campaign sent”");
    expect(r.rows0[0].text).toContain("Product");
    expect(r.rows0[1].text).toContain("moved to a new deal stage");
    expect(r.rows0[1].text).toContain("Qualified → Proposal");
    expect(r.rows0[2].text).toContain("viewed a page");
    expect(r.firstOld).toContain("clicked a link in an email");
    // Full height: never squashed into a captured box's frozen height.
    for (const row of r.rows0) expect(row.h).toBeGreaterThan(r.templateH * 0.9);
    // The details column is inside the component, not off its right edge.
    expect(r.detailsRight).toBeLessThanOrEqual(r.compRight + 1);
    // Real Inter (a Latin face), not the fallback serif.
    expect(r.inter).toBe(true);
    expect(r.font).toMatch(/Inter/);
  }, 60000);

  it("focus 'feed' fills a split's top half with the feed, top aligned", async () => {
    const html = await assemble("audience-person-detail", { focus: "feed", today: "2026-09-23",
      activity: [{ at: 0.2, type: "signup", time: "9:00 AM" }] }, 1080, 1920, { x: "0%", y: "0%", width: "100%", height: "48%" });
    const r = await withPage(html, 1080, 1920, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1.5); });
      return page.evaluate(() => {
        const comp = document.querySelector(".mp-component")!.getBoundingClientRect();
        const tab = [...document.querySelectorAll(".cap-body *")].filter((d) => d.textContent!.trim() === "Recent Activity").pop()!.getBoundingClientRect();
        const body = document.querySelector(".cap-body")!.getBoundingClientRect();
        return { compTop: comp.top, compBottom: comp.bottom, tabTop: tab.top, bodyBottom: body.bottom };
      });
    });
    // The feed's tabs sit at the top of the box...
    expect(r.tabTop - r.compTop).toBeLessThan(120);
    // ...and the page reaches the bottom: no empty band under it.
    expect(r.bodyBottom).toBeGreaterThanOrEqual(r.compBottom - 2);
  }, 60000);
});

describe("audience-company-details", () => {
  it("gives each actor their initials and joins events to their day", async () => {
    const html = await assemble("audience-company-details", {
      today: "2026-09-23",
      activity: [
        { at: 0.3, type: "meeting_booked", actor: "Jordan Lee", detail: "Demo with Northwind", source: "Cal.com" },
        { at: 0.9, type: "crm_event", actor: "Alex Rivera", name: "Opportunity created", source: "Salesforce" },
      ],
    });
    const r = await withPage(html, 1920, 1080, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(2.5); });
      return page.evaluate(() => {
        const g0 = [...document.querySelectorAll(".cap-body h3")].find((h) => /\d{4}/.test(h.textContent || ""))!;
        const rows = [...g0.nextElementSibling!.children];
        return { head: g0.textContent, rows: rows.map((row) => ({ text: row.textContent, av: row.querySelector('[data-slot="avatar"]')?.textContent?.trim() })) };
      });
    });
    expect(r.head).toBe("Wednesday, September 23, 2026");
    expect(r.rows[0].text).toContain("Alex Rivera triggered “Opportunity created”");
    expect(r.rows[0].av).toBe("AR");
    expect(r.rows[1].text).toContain("Jordan Lee booked a meeting");
    expect(r.rows[1].text).toContain("Demo with Northwind");
    expect(r.rows[1].av).toBe("JL");
    // "Just now" is the default time for a signal that fires in the film.
    expect(r.rows[1].text).toContain("Just now");
  }, 60000);
});

describe("the activity feed runtime (shared/activity-feed.js)", () => {
  it("parses and formats day headers and resolves relative dates", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/components/shared/activity-feed.js"), "utf-8");
    const f = new Function(`${src}\nreturn { activityParseHeader, activityFormatHeader, activityResolveDate, activityDayKey, ACTIVITY_TYPES };`)() as any;
    const d = f.activityParseHeader("Monday, September 21, 2026");
    expect(f.activityDayKey(d)).toBe("2026-09-21");
    expect(f.activityFormatHeader(new Date(2026, 8, 23))).toBe("Wednesday, September 23, 2026");
    const today = new Date(2026, 8, 23);
    expect(f.activityDayKey(f.activityResolveDate("today", today))).toBe("2026-09-23");
    expect(f.activityDayKey(f.activityResolveDate("yesterday", today))).toBe("2026-09-22");
    expect(f.activityDayKey(f.activityResolveDate("-3", today))).toBe("2026-09-20");
    expect(f.activityDayKey(f.activityResolveDate("2026-10-01", today))).toBe("2026-10-01");
    // Every event type the schema offers has an icon and a verb.
    const schema = JSON.parse(await fs.readFile(path.join(MOCKS, "audience-person-detail.schema.json"), "utf-8"));
    for (const t of schema.data.activity.items.properties.type.enum) {
      expect(f.ACTIVITY_TYPES[t], t).toBeTruthy();
    }
  });
});
