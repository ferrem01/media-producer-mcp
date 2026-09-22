import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { getLibraryHtml } from "../src/preview-app/library-app.js";
import { getBrandPageHtml } from "../src/preview-app/brand-page.js";
import { getTeamHtml } from "../src/team-page.js";

// HOME is Films, Team and Brand behind one rail. They were three different
// things in three places (a page, a page, and a tray inside Studio), which is
// why Studio's header kept growing.

const CARDS = [
  { project_id: "p1", name: "Short", status: "rendered", frame: "16x9", scene_count: 9, duration_seconds: 35, rendered: true, touched_at: "2026-09-21T00:00:00Z" },
  { project_id: "p2", name: "Quotient — The Checklist That Runs Itself, A Very Long Title Indeed", status: "rendered", frame: "16x9", scene_count: 9, duration_seconds: 43, rendered: true, touched_at: "2026-09-21T00:00:00Z" },
  { project_id: "p3", name: "A Vertical Film", status: "generated", frame: "9x16", scene_count: 7, duration_seconds: 48, rendered: false, touched_at: "2026-09-20T00:00:00Z" },
  { project_id: "p4", name: "Square One", status: "storyboard", frame: "1x1", scene_count: 0, duration_seconds: 0, rendered: false, touched_at: "2026-09-19T00:00:00Z" },
  { project_id: "p5", name: "Four By Five", status: "rendered", frame: "4x5", scene_count: 10, duration_seconds: 31, rendered: true, touched_at: "2026-09-19T00:00:00Z",
    copies: [{ project_id: "p5b", name: "Four By Five", status: "generated", frame: "4x5", scene_count: 10, duration_seconds: 31, rendered: false, touched_at: "2026-09-18T00:00:00Z" }] },
  { project_id: "p6", name: "Two Line Title That Wraps Here", status: "rendered", frame: "16x9", scene_count: 12, duration_seconds: 62, rendered: true, touched_at: "2026-09-18T00:00:00Z" },
];

const ME = { email: "marc@getquotient.ai", name: "Marc Ferrentino", tenant_id: "marc-getquotient-ai" };

/**
 * Serve the page over HTTP, not file://. These pages ask "/auth/me" who is
 * signed in and go to the login when nobody answers; on a file:// page that
 * request is file:///auth/me, which no route mock reliably intercepts -- CI
 * redirected itself to a blank page while the same test passed locally.
 */
async function serve(html: string) {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    const json = (body: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.startsWith("/auth/me")) return json(ME);
    if (url.startsWith("/api/library/")) {
      return json({ cards: CARDS, total: CARDS.length, counts: { all: 6, rendered: 4, built: 1, board: 1, archived: 0 } });
    }
    if (url.startsWith("/api/team/")) {
      return json({ tenant_id: ME.tenant_id, domains: ["getquotient.ai"], members: [{ email: ME.email, name: ME.name, via: "founder" }], invites: [] });
    }
    if (url.startsWith("/api/brand-kit/")) {
      return json({ colors: { primary: "#393bf5", background: "#ffffff" }, fonts: [{ family: "Inter", source: "google", weights: [400, 700] }], logos: [], assets: [], voice: "nova" });
    }
    if (url.includes("/poster")) { res.writeHead(204); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

async function open(browser: Browser, html: string) {
  const site = await serve(html);
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  // Google Fonts is not reachable from CI; do not wait on it.
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(site.url, { waitUntil: "domcontentloaded" });
  return { page, cleanup: () => site.close() };
}

describe("home", () => {
  it("gives every film card the same box, whatever its frame or title length", async () => {
    const browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    try {
      const { page, cleanup } = await open(browser, getLibraryHtml());
      try {
        await page.waitForSelector(".card", { timeout: 15_000 });
        await page.waitForTimeout(400);
        const sizes = await page.$$eval(".card", (cards) =>
          cards.map((c) => {
            const r = c.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
          }));
        expect(sizes.length).toBeGreaterThan(4);
        // A 9x16 film, a 1x1 film and a title that wraps to two lines all have
        // to leave the shelf square -- that is what "the same size" means.
        expect([...new Set(sizes.map((s) => s.h))], "card heights").toHaveLength(1);
        expect([...new Set(sizes.map((s) => s.w))], "card widths").toHaveLength(1);
      } finally { await page.close(); await cleanup(); }
    } finally { await browser.close(); }
  }, 90_000);

  it("signs every page in the way Studio does and puts all three behind one rail", async () => {
    const browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    try {
      for (const [name, html, active] of [
        ["films", getLibraryHtml(), "nav-films"],
        ["team", getTeamHtml(), "nav-team"],
        ["brand", getBrandPageHtml(), "nav-brand"],
      ] as const) {
        const { page, cleanup } = await open(browser, html);
        try {
          await page.waitForSelector("#rail-me", { state: "attached", timeout: 15_000 });
          await page.waitForFunction(() => {
            const el = document.getElementById("rail-me");
            return !!el && el.style.display === "flex";
          }, { timeout: 15_000 });
          // The rail carries all three, and the signed-in person, on every page.
          const rail = await page.$$eval(".rail a.rail-item", (a) => a.map((x) => x.id));
          expect(rail, `${name} rail`).toEqual(["nav-films", "nav-team", "nav-brand"]);
          expect(await page.$eval(`#${active}`, (e) => e.classList.contains("on")), `${name} marks itself`).toBe(true);
          expect(await page.textContent("#rail-me"), `${name} shows who is signed in`).toContain("Marc Ferrentino");
          // Every item points at a real page, with the tenant carried across.
          for (const [id, href] of [["nav-films", "/library"], ["nav-team", "/team"], ["nav-brand", "/brand"]]) {
            const url = await page.$eval(`#${id}`, (e) => (e as HTMLAnchorElement).getAttribute("href"));
            expect(url, `${name} -> ${id}`).toContain(href);
            expect(url, `${name} -> ${id} carries the tenant`).toContain("tenant=marc-getquotient-ai");
          }
        } finally { await page.close(); await cleanup(); }
      }
    } finally { await browser.close(); }
  }, 120_000);

  it("the brand kit is a page, not a tray inside Studio", async () => {
    const studio = await fs.readFile(path.resolve(import.meta.dirname, "../src/preview-app/preview-app.ts"), "utf-8");
    expect(studio).not.toMatch(/brand-overlay/);
    expect(studio).not.toMatch(/id="brand-btn"/);
    const index = await fs.readFile(path.resolve(import.meta.dirname, "../src/index.ts"), "utf-8");
    expect(index).toMatch(/urlPath === "\/brand"/);

    const browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    try {
      const { page, cleanup } = await open(browser, getBrandPageHtml());
      try {
        await page.waitForSelector("#bk-guidelines", { timeout: 15_000 });
        // The kit's own controls survived the move out of the tray.
        expect(await page.$$eval('[data-ck]', (n) => n.length), "colour pickers").toBeGreaterThanOrEqual(7);
        expect(await page.$("#bk-voice")).toBeTruthy();
        expect(await page.$("#bk-drop")).toBeTruthy();
        expect(await page.$("#bk-save")).toBeTruthy();
      } finally { await page.close(); await cleanup(); }
    } finally { await browser.close(); }
  }, 90_000);
});
