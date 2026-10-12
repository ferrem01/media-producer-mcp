import { describe, it, expect } from "vitest";
import { getTakeHtml } from "../src/take-page.js";

// WHICH MICROPHONE (Marc, Oct 12): his laptop was set to the monitor's mic,
// not the one he had plugged in, and a take came out thin. The booth now
// lists the inputs, says which one it records from, keeps the pick for the
// next visit, and falls back to the default when the picked mic is gone.

describe("the booth's microphone picker", () => {
  it("lists the inputs, records from the pick, and falls back when it is gone", async () => {
    const closers: Array<() => Promise<void>> = [];
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const ctx = await browser.newContext({ permissions: ["microphone", "camera"] });
      const page = await ctx.newPage();
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const asks: any[] = (window as any).__asks = [];
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c: any) => { asks.push(JSON.parse(JSON.stringify(c))); return orig(c); };
        // A mic picked on an earlier visit that is no longer plugged in.
        try { localStorage.setItem("mp_take_mic", "unplugged-mic"); } catch { /* none */ }
      });
      const proj = { name: "T", canvas: { width: 1080, height: 1920 }, treatment: { filmGrammar: "speaker" }, scenes: [],
        storyboard: { scenes: [{ label: "Hook", duration_seconds: 3, voiceover_text: "One." }] } };
      const http = await import("node:http");
      const server = http.createServer((req, res) => {
        const u = req.url || "";
        req.on("data", () => {});
        req.on("end", () => {
          if (u.startsWith("/api/projects/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(proj)); return; }
          res.writeHead(200, { "content-type": "text/html" }); res.end(getTakeHtml());
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      closers.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as any).port;
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x&scene=0`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      // The picker is there before recording, with the system default first.
      await page.waitForSelector("#micRow", { state: "visible", timeout: 8000 });
      const options = await page.$$eval("#micSel option", (os) => os.map((o) => (o as HTMLOptionElement).value));
      expect(options[0]).toBe("");
      expect(options.length).toBeGreaterThan(1);
      // Record with the stale pick: the exact ask fails, the booth retries on the default.
      await page.check("#voiceOnly");
      await page.click("#recordBtn");
      await page.waitForSelector("#stopBtn", { state: "visible", timeout: 8000 });
      const asks = await page.evaluate(() => (window as any).__asks);
      expect(asks[0].audio.deviceId).toEqual({ exact: "unplugged-mic" });
      expect(asks[1].audio.deviceId).toBeUndefined();
      expect(await page.evaluate(() => localStorage.getItem("mp_take_mic"))).toBeNull();
      // It says which mic it is recording from.
      await page.click("#stopBtn");
      await page.waitForFunction(() => /Recording from: /.test(document.getElementById("micHint")!.textContent || ""), null, { timeout: 8000 });
      // A pick is kept and used on the next take. (Device ids are read on
      // this page: a browser may hand out new ones after a reload.)
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x&scene=0`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      await page.waitForFunction(() => (document.getElementById("micSel") as HTMLSelectElement).options.length > 1, null, { timeout: 8000 });
      const real = await page.$eval("#micSel", (el) => (el as HTMLSelectElement).options[1].value);
      await page.selectOption("#micSel", real);
      expect(await page.evaluate(() => localStorage.getItem("mp_take_mic"))).toBe(real);
      await page.evaluate(() => { (window as any).__asks.length = 0; });
      await page.check("#voiceOnly");
      await page.click("#recordBtn");
      await page.waitForSelector("#stopBtn", { state: "visible", timeout: 8000 });
      const asks2 = await page.evaluate(() => (window as any).__asks);
      expect(asks2[0].audio.deviceId).toEqual({ exact: real });
      expect(errors).toEqual([]);
    } finally { await browser.close(); for (const c of closers) await c(); }
  }, 90000);
});
