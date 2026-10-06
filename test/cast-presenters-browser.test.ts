import { describe, it, expect } from "vitest";
import { chromium } from "playwright";
import { getCastHtml } from "../src/cast-page.js";

// ONE CARD PER PRESENTER (Marc, Oct 6): HeyGen's looks list shows one
// person's ~20 looks together, so the presenters tab was pages of one face.
// It now lists PEOPLE (GET /v3/avatars) with a Women/Men filter, and a
// person opens onto their looks; a look click adds the actor.
describe("Cast page: HeyGen presenters, person first", () => {
  it("lists people, filters by gender, opens a person's looks, and adds the look clicked", async () => {
    const browser = await chromium.launch({ ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}) });
    try {
      const page = await browser.newPage();
      const seen: string[] = []; const posted: any[] = [];
      const people = [{ id: "g1", name: "Dante", gender: "male", looks_count: 22 }, { id: "g2", name: "Priya", gender: "female", looks_count: 6 }];
      await page.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        const json = (o: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        if (u.pathname === "/cast") return route.fulfill({ status: 200, contentType: "text/html", body: getCastHtml() });
        if (u.pathname === "/auth/me") return json({ tenant_id: "t", email: "m@x" });
        if (u.pathname.startsWith("/api/heygen-avatars/")) {
          seen.push(u.search);
          if (u.searchParams.get("people")) return json({ people: u.searchParams.get("gender") === "female" ? people.filter((p) => p.gender === "female") : people, next_token: null });
          if (u.searchParams.get("group") === "g2") return json({ looks: [{ id: "lk_p1", name: "Priya Office 1", status: "completed" }, { id: "lk_p2", name: "Priya Kitchen 1", status: "completed" }], next_token: null });
          return json({ looks: [] });
        }
        if (u.pathname === "/api/cast/t" && route.request().method() === "POST") { posted.push(JSON.parse(route.request().postData() || "{}")); return json({ id: "priya", name: "Priya" }); }
        if (u.pathname === "/api/cast/t") return json({ cast: [] });
        if (u.pathname.startsWith("/api/")) return json({});
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://studio.test/cast?tenant=t");
      await page.click('#addTabs button[data-tab="pub"]');
      await page.waitForSelector("#peopleGrid .card");
      expect(await page.$$eval("#peopleGrid .card .name", (n) => n.map((x) => x.textContent))).toEqual(["Dante", "Priya"]);
      expect(await page.textContent("#peopleGrid")).toContain("22 looks");
      await page.click('#pubGender button[data-gender="female"]');
      await page.waitForFunction(() => document.querySelectorAll("#peopleGrid .card").length === 1);
      expect(seen.some((q) => q.includes("people=1") && q.includes("gender=female"))).toBe(true);
      expect(seen.every((q) => !/[?&]token=/.test(q))).toBe(true);           // never the login token's name
      await page.click("#peopleGrid .card");
      await page.waitForSelector("#lookGrid .card");
      expect(await page.$$eval("#lookGrid .card .meta", (n) => n.map((x) => x.textContent))).toEqual(["Priya Office 1", "Priya Kitchen 1"]);
      await page.click("#lookGrid .card");
      await page.waitForFunction(() => /in the cast/.test(document.getElementById("status")?.textContent || ""));
      expect(posted).toEqual([{ heygen_look_id: "lk_p1" }]);
      await page.click("#pubBack");
      await page.waitForSelector("#peopleGrid .card");                        // back to the people, filter kept
      expect(await page.$$eval("#peopleGrid .card", (n) => n.length)).toBe(1);
    } finally { await browser.close(); }
  }, 60000);
});

describe("heygenPeoplePage: HeyGen's people, gender filtered by paging on", () => {
  it("lists completed groups, keeps one gender, and pages until it has some", async () => {
    const { vi } = await import("vitest");
    process.env.HEYGEN_API_KEY = "hk";
    const pages: Record<string, any> = {
      "": { data: [{ id: "g1", name: "Dante", gender: "male", looks_count: 22, status: "completed" }, { id: "g0", name: "Draft", gender: "female", status: "processing" }], has_more: true, next_token: "p2" },
      p2: { data: [{ id: "g2", name: "Priya", gender: "female", looks_count: 6, status: "completed", preview_image_url: "https://x/p.jpg" }], has_more: false },
    };
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      const tok = new URL(String(url)).searchParams.get("token") || "";
      return new Response(JSON.stringify(pages[tok]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    try {
      const { heygenPeoplePage } = await import("../src/core/actor-test.js");
      const women = await heygenPeoplePage({ gender: "female" });
      expect(women).toEqual({ people: [{ id: "g2", name: "Priya", gender: "female", preview: "https://x/p.jpg", looks_count: 6 }], next_token: null });
      expect(urls[0]).toContain("https://api.heygen.com/v3/avatars?ownership=public");
      urls.length = 0;
      const all = await heygenPeoplePage({});
      expect(all.people.map((p) => p.name)).toEqual(["Dante"]);              // one page, the draft left out
      expect(all.next_token).toBe("p2");
      expect(urls).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); delete process.env.HEYGEN_API_KEY; }
  });
});
