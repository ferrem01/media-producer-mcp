import { describe, it, expect } from "vitest";
import { chromium } from "playwright";
import { getCastHtml } from "../src/cast-page.js";
import { getFoundationHtml } from "../src/foundation-page.js";

// A REAL PERSON, end to end in the browser (SPEC-real-person.md): the Cast
// page's "A real person" tab takes a name and consent -- no photo -- and
// opens the foundation panel (a QR code to the phone page); the phone page
// says the clips are the foundation, coaches the setup, records a clip
// hands-free (countdown, a timer, stop) and sends it to the actor's
// foundation; a clip filmed elsewhere can be uploaded instead.
const launch = () => chromium.launch({
  ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

describe("a real person's foundation, in the browser", () => {
  it("Cast: a name and consent make the person and open the foundation panel with the phone's QR code", async () => {
    const browser = await launch();
    try {
      const page = await browser.newPage();
      const posted: any[] = []; let cast: any[] = [];
      await page.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        const json = (o: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        if (u.pathname === "/cast") return route.fulfill({ status: 200, contentType: "text/html", body: getCastHtml() });
        if (u.pathname === "/auth/me") return json({ tenant_id: "t", email: "m@x" });
        if (u.pathname === "/api/cast/t" && route.request().method() === "POST") {
          const b = JSON.parse(route.request().postData() || "{}"); posted.push(b);
          const a = { id: "marc", name: b.name, consent: { at: "x" }, foundation: { clips: [], stills: [] }, created_at: "2026-10-14T00:00:00Z" };
          cast = [a]; return json(a);
        }
        if (u.pathname === "/api/cast/t") return json({ cast });
        if (u.pathname.startsWith("/api/take-qr/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>" });
        if (u.pathname.endsWith("/portrait")) return route.fulfill({ status: 404, body: "" });
        if (u.pathname.startsWith("/api/")) return json({});
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://studio.test/cast?tenant=t");
      await page.click('#addTabs button[data-tab="real"]');
      expect(await page.textContent("#addBody")).toContain("three short clips you record once");
      expect(await page.$("#addBody input[type=file]")).toBeNull();        // no photo
      await page.fill("#aName", "Marc");
      await page.click("#aAdd");
      await page.waitForFunction(() => /Confirm this is you/.test(document.getElementById("status")?.textContent || ""));
      expect(posted).toEqual([]);
      await page.check("#aConsent");
      await page.click("#aAdd");
      await page.waitForSelector("#foundationPanel");
      expect(posted).toEqual([{ name: "Marc", consent: true, real: true }]);
      const qr = await page.getAttribute('#foundationPanel img[alt^="Scan"]', "src");
      expect(qr).toContain("/api/take-qr/t/-?actor=marc");
      expect(await page.textContent("#foundationPanel")).toContain("Far");
      expect(await page.getAttribute("#foundationPanel a.btn", "href")).toContain("/foundation?tenant=t&actor=marc");
      // The card: a real person, no picture yet, the foundation to record.
      await page.click("#fdClose");
      await page.waitForSelector("#actors .card .nopic");
      expect(await page.textContent("#actors .card")).toContain("Real person");
      expect(await page.textContent("#actors .card")).toContain("Foundation: 0 of 3 clips");
      expect(await page.$("#actors .card .photos")).toBeNull();
      expect(await page.$("#actors .card .found")).not.toBeNull();
    } finally { await browser.close(); }
  }, 60000);

  it("the phone page: the foundation's words, a hands-free clip, and an upload instead", async () => {
    const browser = await launch();
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
      const sent: { path: string; bytes: number }[] = [];
      let actor: any = { id: "marc", name: "Marc", consent: { at: "x" }, foundation: { clips: [], stills: [] } };
      await page.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        const json = (o: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        if (u.pathname === "/foundation") return route.fulfill({ status: 200, contentType: "text/html", body: getFoundationHtml() });
        if (u.pathname === "/api/cast/t") return json({ cast: [actor] });
        const m = u.pathname.match(/^\/api\/cast\/t\/marc\/foundation\/(far|close|turn)$/);
        if (m && route.request().method() === "POST") {
          sent.push({ path: u.pathname, bytes: (route.request().postDataBuffer() || Buffer.alloc(0)).length });
          actor = { ...actor, foundation: { ...actor.foundation, clips: [...actor.foundation.clips, { kind: m[1], file: "x", seconds: 6, recorded_at: "now" }] } };
          return json(actor);
        }
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://localhost/foundation?tenant=t&actor=marc&token=tok");
      await page.waitForSelector("#clips .clip");
      const text = await page.textContent("body");
      expect(text).toContain("foundation of your avatar");
      expect(text).toContain("Never from above");
      expect(await page.$$eval("#clips .clip h2", (n) => n.map((x) => (x.textContent || "").trim()))).toEqual([
        expect.stringContaining("1. Far"), expect.stringContaining("2. Close"), expect.stringContaining("3. Turn"),
      ]);
      // Record the turn: Start, a 5 s countdown, then a timer; Stop after the minimum, watch it, use it.
      await page.click('[data-rec="turn"]');
      await page.waitForSelector("#stage.on");
      await page.click("#bottom button:has-text('Start')");
      await page.waitForSelector("#stage.rec", { timeout: 8000 });
      await page.waitForTimeout(5600);
      await page.click("#bottom button:has-text('Stop')");
      await page.waitForSelector("#bottom button:has-text('Use this clip')");
      await page.click("#bottom button:has-text('Use this clip')");
      await page.waitForFunction(() => /The turn clip is in/.test(document.getElementById("msg")?.textContent || ""));
      expect(sent).toHaveLength(1);
      expect(sent[0].path).toBe("/api/cast/t/marc/foundation/turn");
      expect(sent[0].bytes).toBeGreaterThan(1000);
      expect(await page.textContent('#clips .clip:nth-child(3) .state')).toContain("Recorded");
      // A clip filmed on another camera, uploaded instead.
      await page.setInputFiles('[data-up="close"]', { name: "close.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(4096, 1) });
      await page.waitForFunction(() => /The close clip is in/.test(document.getElementById("msg")?.textContent || ""));
      expect(sent.map((s) => s.path)).toEqual(["/api/cast/t/marc/foundation/turn", "/api/cast/t/marc/foundation/close"]);
    } finally { await browser.close(); }
  }, 60000);

  it("looks: the Cast panel adds, picks the default and removes; the phone ends by picking one", async () => {
    const browser = await launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      const patches: any[] = [];
      const done = { clips: [{ kind: "far", file: "a", seconds: 75, recorded_at: "1" }, { kind: "close", file: "b", seconds: 30, recorded_at: "2" }, { kind: "turn", file: "c", seconds: 12, recorded_at: "3" }], stills: [{ kind: "front", file: "s" }], ref_video: "r", made_at: "2026-10-14T00:00:00Z" };
      let actor: any = { id: "marc", name: "Marc", consent: { at: "x" }, foundation: done, created_at: "2026-10-14T00:00:00Z" };
      await page.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        const json = (o: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        if (u.pathname === "/cast") return route.fulfill({ status: 200, contentType: "text/html", body: getCastHtml() });
        if (u.pathname === "/foundation") return route.fulfill({ status: 200, contentType: "text/html", body: getFoundationHtml() });
        if (u.pathname === "/auth/me") return json({ tenant_id: "t", email: "m@x" });
        if (u.pathname === "/api/cast/t/marc" && route.request().method() === "PATCH") {
          const b = JSON.parse(route.request().postData() || "{}"); patches.push(b);
          const looks = (b.looks || []).map((l: any) => ({ id: l.id || l.name.toLowerCase(), ...l }));
          actor = { ...actor, looks, default_look: b.default_look || (looks[0] && looks[0].id) };
          return json(actor);
        }
        if (u.pathname === "/api/cast/t") return json({ cast: [actor] });
        if (u.pathname.startsWith("/api/take-qr/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
        if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://studio.test/cast?tenant=t");
      await page.waitForSelector("#actors .card .found");
      await page.click("#actors .card .found");
      await page.waitForSelector("#foundationPanel");
      expect(await page.textContent("#foundationPanel")).toContain("No looks yet");
      await page.click('#foundationPanel [data-lk-sug="Founder"]');
      await page.waitForSelector('#foundationPanel [data-lk-def="founder"]');
      expect(patches[0].looks).toEqual([{ name: "Founder", wardrobe: expect.stringContaining("black overshirt") }]);
      await page.fill("#lkName", "Keynote"); await page.fill("#lkWear", "a navy suit, white open-collar shirt");
      await page.click("#lkAdd");
      await page.waitForSelector('#foundationPanel [data-lk-def="keynote"]');
      expect(patches[1].looks.map((l: any) => l.name)).toEqual(["Founder", "Keynote"]);
      await page.check('#foundationPanel [data-lk-def="keynote"]');
      await page.waitForFunction(() => /Default look set/.test(document.getElementById("status")?.textContent || ""));
      expect(patches[2].default_look).toBe("keynote");
      await page.click('#foundationPanel [data-lk-del="0"]');
      await page.waitForFunction(() => !document.querySelector('#foundationPanel [data-lk-def="founder"]'));
      expect(patches[3].looks.map((l: any) => l.name)).toEqual(["Keynote"]);

      // The phone: a finished foundation with no looks asks what they wear.
      actor = { ...actor, looks: undefined, default_look: undefined };
      await page.goto("http://localhost/foundation?tenant=t&actor=marc&token=tok");
      await page.waitForSelector("#lookPick", { state: "visible" });
      await page.click("#lookBtns button:has-text('Weekend')");
      await page.waitForFunction(() => /Weekend is your look/.test(document.getElementById("msg")?.textContent || ""));
      expect(patches.at(-1)).toEqual({ looks: [{ name: "Weekend", wardrobe: "a grey crew-neck sweater and jeans" }] });
      expect(await page.isVisible("#lookPick")).toBe(false);
    } finally { await browser.close(); }
  }, 60000);
});
