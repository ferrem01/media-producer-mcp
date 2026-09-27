import { describe, it, expect } from "vitest";
import { getTakeHtml } from "../src/take-page.js";
import { LIGHT, LIGHT_CHECK_JS, guideOval, lightAdvice, lightStats, type LightStats } from "../src/core/light-check.js";

// The booth's light check (src/core/light-check.ts, inlined into
// src/take-page.ts). A manual review of Marc's booth take, measured from its
// frames, found: a warm key in a daylight room (lit cheek R/B ~2.3, shadow
// cheek and wall ~1.0-1.5), a wall as bright as the face (luma ~158 vs a face
// of ~130-168), no rim light. The booth now says so before the take.

const neutral: LightStats = {
  faceLuma: 150, bgLuma: 90, leftLuma: 172, rightLuma: 128,
  faceRB: 1.5, bgRB: 1.05, leftRB: 1.5, rightRB: 1.5,
  faceGM: 0.95, bgGM: 1.0, clipShare: 0.005,
};
const ids = (s: LightStats) => lightAdvice(s).map((t) => t.id);

describe("lightAdvice: the measured take", () => {
  it("orange face next to a neutral wall -> the colour tip FIRST, then the wall", () => {
    // The take as measured: warm key cheek 2.3, daylight-fill cheek 1.5,
    // wall ~1.2; wall 158 vs face 130-168.
    const take: LightStats = { faceLuma: 149, bgLuma: 158, leftLuma: 168, rightLuma: 130,
      faceRB: 1.9, bgRB: 1.2, leftRB: 2.3, rightRB: 1.5, faceGM: 0.92, bgGM: 1.0, clipShare: 0.01 };
    const tips = lightAdvice(take);
    expect(tips[0].id).toBe("mixed");
    expect(tips[0].text).toMatch(/same colour \(daylight if the windows are bright\)/);
    expect(tips.map((t) => t.id)).toEqual(["mixed", "wall"]); // 168 vs 130 is real modelling: not flat
    // Both panels on warm (both cheeks orange) against a neutral wall.
    expect(ids({ ...take, leftRB: 2.3, rightRB: 2.2, faceRB: 2.25, bgRB: 1.0 })[0]).toBe("warm");
    expect(lightAdvice({ ...take, leftRB: 2.3, rightRB: 2.2, faceRB: 2.25, bgRB: 1.0 })[0].text)
      .toBe("Your face looks orange next to the room — set every light to the same colour (daylight if the windows are bright).");
  });

  it("a wall as bright as the face -> the background tip", () => {
    expect(ids({ ...neutral, bgLuma: 140, faceLuma: 150 })).toEqual(["wall"]);
    expect(lightAdvice({ ...neutral, bgLuma: 140 })[0].text).toBe("The wall behind you is as bright as your face — dim it or bring your main light closer.");
    // A window behind (much brighter than the face) is worded as such.
    expect(lightAdvice({ ...neutral, bgLuma: 200 })[0].text).toMatch(/^Behind you is brighter than your face/);
    expect(ids({ ...neutral, bgLuma: 134 })).toEqual([]); // 0.89x: just under the line
  });

  it("balanced, matched light -> no tips (the page shows 'Light looks good')", () => {
    expect(lightAdvice(neutral)).toEqual([]);
    // Skin is warmer than a neutral wall even under matched light (shadow
    // cheek 1.5 vs wall 1.0 measured): 1.43x must NOT fire.
    expect(neutral.faceRB / neutral.bgRB).toBeGreaterThan(1.4);
  });

  it("the rest of the list, in priority order, at most three", () => {
    expect(ids({ ...neutral, faceLuma: 60, leftLuma: 70, rightLuma: 50 })[0]).toBe("dark");
    expect(ids({ ...neutral, faceLuma: 10, leftLuma: 10, rightLuma: 10, bgLuma: 10 })).toEqual(["dark"]); // covered lens: nothing else
    expect(ids({ ...neutral, clipShare: 0.05 })).toEqual(["shine"]);
    expect(ids({ ...neutral, leftLuma: 152, rightLuma: 148 })).toEqual(["flat"]);
    expect(ids({ ...neutral, faceRB: 1.0, leftRB: 1.0, rightRB: 1.0, bgRB: 1.2 })).toEqual(["cool"]);
    expect(ids({ ...neutral, faceGM: 1.12 })).toEqual(["green"]);
    const all = lightAdvice({ ...neutral, faceRB: 2.4, leftRB: 2.4, rightRB: 2.4, bgRB: 1.0, clipShare: 0.1, bgLuma: 160, leftLuma: 151, rightLuma: 149 });
    expect(all.map((t) => t.id)).toEqual(["warm", "shine", "wall"]);
    expect(all.length).toBe(LIGHT.MAX_TIPS);
  });
});

describe("lightStats: pixels to numbers", () => {
  it("reads the measured take from a synthetic frame: warm key half, daylight half, bright wall", () => {
    const w = 160, h = 284;
    const px = new Uint8ClampedArray(w * h * 4);
    const o = guideOval(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inFace = ((x + 0.5 - o.cx) / o.rx) ** 2 + ((y + 0.5 - o.cy) / o.ry) ** 2 <= 1;
      const c = !inFace ? [158, 158, 150] : x + 0.5 < o.cx ? [220, 150, 96] : [160, 125, 107];
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    const s = lightStats(px, w, h);
    expect(s.leftRB).toBeCloseTo(2.28, 1);
    expect(s.rightRB).toBeCloseTo(1.49, 1);
    expect(s.bgLuma).toBeCloseTo(157, 0);
    expect(s.faceLuma).toBeGreaterThan(140);
    expect(s.faceLuma).toBeLessThan(158);
    expect(s.clipShare).toBe(0);
    // Face 1.87 vs this wall's 1.05 is 1.78x AND the halves differ 1.53x:
    // either colour reading, the colour tip leads and the wall follows.
    const got = lightAdvice(s).map((t) => t.id);
    expect(["warm", "mixed"]).toContain(got[0]);
    expect(got.slice(1)).toEqual(["wall"]);
  });

  it("puts the eyes on the upper third and the head in a portrait oval", () => {
    const o = guideOval(1080, 1920);
    expect(o.eyeY).toBe(640);
    expect(o.cy).toBeGreaterThan(o.eyeY);
    expect(o.ry).toBeGreaterThan(o.rx);
    expect(o.cx).toBe(540);
    // Scale-free: the page draws it in CSS pixels, measures it in a 160px sample.
    const small = guideOval(160, (160 * 1920) / 1080);
    expect(small.rx / 160).toBeCloseTo(o.rx / 1080, 5);
  });
});

describe("the booth page carries it", () => {
  const html = getTakeHtml();
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

  it("inlines the one light-check source and records at 12 Mbps", () => {
    expect(js).toContain(LIGHT_CHECK_JS.trim().split("\n")[0]);
    expect(js).toMatch(/function lightAdvice\(s\)/);
    expect(js).toMatch(/var recOpts = \{ videoBitsPerSecond: 12000000, audioBitsPerSecond: 128000 \};/);
    expect(html).toMatch(/<div id="lightCard"/);
    expect(html).toMatch(/<div id="eyes"><span>eyes here<\/span><\/div>/);
    // Dismissal is remembered for the visit, and storage failures are swallowed.
    expect(js).toMatch(/function lightOff\(\) \{ try \{ return sessionStorage\.getItem\(LIGHT_OFF_KEY\) === '1'; \} catch \(e\) \{ return false; \} \}/);
    // A lock only when the capabilities list the mode.
    expect(js).toMatch(/if \(has\(caps\.exposureMode, 'manual'\)\)/);
    expect(js).toMatch(/if \(has\(caps\.whiteBalanceMode, 'manual'\)\)/);
  });
});

describe("the light check in a browser (fake camera)", () => {
  it("opens on the light check, never blocks Start, hides for the visit, locks exposure/WB only where offered", async () => {
    const closers: Array<() => Promise<void>> = [];
    const { chromium, devices } = await import("playwright");
    const http = await import("node:http");
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const proj = { name: "T", canvas: { width: 1080, height: 1920 }, treatment: { filmGrammar: "speaker" }, scenes: [],
        storyboard: { scenes: [{ duration_seconds: 6, voiceover_text: "One brief, every surface." }] } };
      const server = http.createServer((req, res) => {
        if ((req.url || "").startsWith("/api/projects/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(proj)); return; }
        res.writeHead(200, { "content-type": "text/html" }); res.end(getTakeHtml());
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      closers.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as any).port;

      const open = async (offerLocks: boolean) => {
        const ctx = await browser.newContext({ ...devices["iPhone 13"], permissions: ["camera", "microphone"] });
        // Spy on the recorder's options, and play a camera that does (or
        // does not) offer manual exposure / white balance.
        await ctx.addInitScript((offer: boolean) => {
          const w = window as any;
          w.__recOpts = []; w.__applied = [];
          const MR = w.MediaRecorder;
          w.MediaRecorder = function (s: any, o: any) { w.__recOpts.push(o); return new MR(s, o); };
          w.MediaRecorder.isTypeSupported = (t: string) => MR.isTypeSupported(t);
          const P = w.MediaStreamTrack.prototype;
          const gs = P.getSettings;
          P.getCapabilities = function () {
            return offer ? { exposureMode: ["continuous", "manual"], whiteBalanceMode: ["continuous", "manual"], exposureTime: { min: 1, max: 1000 }, colorTemperature: { min: 2500, max: 7500 } } : { width: { min: 1, max: 1920 } };
          };
          P.getSettings = function () { return Object.assign({}, gs.call(this), offer ? { exposureTime: 333, colorTemperature: 5200 } : {}); };
          P.applyConstraints = function (c: any) { w.__applied.push(JSON.parse(JSON.stringify(c))); return Promise.resolve(); };
        }, offerLocks);
        const page = await ctx.newPage();
        const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x`);
        await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
        return { page, errors, ctx };
      };

      // 1. Record opens the camera on the light check, not the count-in.
      const { page, errors } = await open(true);
      await page.click("#recordBtn");
      await page.waitForSelector("#lightCard", { state: "visible", timeout: 8000 });
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("count")!).display)).toBe("none");
      expect(await page.isEnabled("#goBtn")).toBe(true); // never blocks
      expect(await page.isVisible("#oval")).toBe(true);
      expect(await page.isVisible("#eyes")).toBe(true);
      // The oval is drawn from the same numbers the measurement uses.
      const g = await page.evaluate(() => {
        const r = document.getElementById("live")!.getBoundingClientRect(), o = document.getElementById("oval")!.getBoundingClientRect();
        const e = document.getElementById("eyes")!.getBoundingClientRect();
        return { w: r.width, h: r.height, ow: o.width, oh: o.height, ocx: o.left + o.width / 2, eyeY: e.top - r.top };
      });
      const want = guideOval(g.w, g.h);
      expect(g.ow).toBeCloseTo(2 * want.rx, 0);
      expect(g.oh).toBeCloseTo(2 * want.ry, 0);
      expect(g.eyeY).toBeCloseTo(g.h / 3, 0);
      // A verdict lands within a couple of samples: tips, or "Light looks good".
      await page.waitForFunction(() => !document.getElementById("lightCard")!.classList.contains("wait"), null, { timeout: 8000 });
      const verdict = await page.evaluate(() => ({ title: document.getElementById("lightTitle")!.textContent, tips: document.querySelectorAll("#lightTips li").length, good: document.getElementById("lightCard")!.classList.contains("good") }));
      expect(verdict.good ? verdict.title === "Light looks good" && verdict.tips === 0 : verdict.title === "Light check" && verdict.tips >= 1 && verdict.tips <= 3).toBe(true);

      // 2. Hide: remembered for the visit, the badge replaces the card, and
      // the camera locks after its settle -- carrying the asked-for size.
      await page.click("#lightHide");
      expect(await page.evaluate(() => sessionStorage.getItem("mp.booth.lightcheck.off"))).toBe("1");
      expect(await page.isVisible("#lightCard")).toBe(false);
      expect(await page.isVisible("#lightBadge")).toBe(true);
      await page.waitForFunction(() => (window as any).__applied.length > 0, null, { timeout: 5000 });
      const applied = await page.evaluate(() => (window as any).__applied);
      expect(applied.length).toBe(1);
      expect(applied[0].advanced).toEqual([{ exposureMode: "manual", exposureTime: 333 }, { whiteBalanceMode: "manual", colorTemperature: 5200 }]);
      expect(applied[0].width).toBeDefined(); // the base constraints ride along

      // 3. Start records at 12 Mbps; the guide goes away once rolling.
      await page.click("#goBtn");
      await page.waitForFunction(() => (window as any).__recOpts.length > 0, null, { timeout: 8000 });
      expect((await page.evaluate(() => (window as any).__recOpts))[0].videoBitsPerSecond).toBe(12000000);
      expect(await page.isVisible("#oval")).toBe(false);
      await page.click("#stopBtn");
      await page.waitForSelector("#review.on", { timeout: 8000 });
      // 4. Hidden for the visit: the next take goes straight to the count-in.
      await page.click("#retakeBtn");
      await page.click("#recordBtn");
      await page.waitForFunction(() => getComputedStyle(document.getElementById("count")!).display === "flex", null, { timeout: 8000 });
      expect(await page.isVisible("#lightCard")).toBe(false);
      expect(errors).toEqual([]);

      // 5. A camera without the modes (iOS Safari): no applyConstraints, ever.
      const b = await open(false);
      await b.page.click("#recordBtn");
      await b.page.waitForSelector("#lightCard", { state: "visible", timeout: 8000 });
      await b.page.click("#lightHide");
      await b.page.click("#goBtn");
      await b.page.waitForFunction(() => (window as any).__recOpts.length > 0, null, { timeout: 8000 });
      await b.page.waitForTimeout(1800);
      expect(await b.page.evaluate(() => (window as any).__applied.length)).toBe(0);
      expect(b.errors).toEqual([]);
    } finally { await browser.close(); for (const c of closers) await c(); }
  }, 90000);
});


describe("shot size: the oval follows how much of the person the frame holds (the remote booth)", () => {
  it("close is the booth's oval exactly; medium and wide shrink the face and raise the eyes", () => {
    for (const [w, h] of [[1080, 1920], [1920, 1080], [320, 180]]) {
      expect(guideOval(w, h, "close")).toEqual(guideOval(w, h));
      const c = guideOval(w, h, "close"), m = guideOval(w, h, "medium"), wd = guideOval(w, h, "wide");
      expect(m.ry / c.ry).toBeCloseTo(0.62, 5);
      expect(wd.ry / c.ry).toBeCloseTo(0.36, 5);
      expect(wd.rx).toBeLessThan(m.rx);
      expect(m.eyeY).toBeCloseTo(h * 0.3, 5);
      expect(wd.eyeY).toBeCloseTo(h * 0.25, 5);
      expect(wd.cx).toBe(w / 2);
    }
    // Anything else reads as close (a stray value never breaks the maths).
    expect(guideOval(1920, 1080, "constructor" as any)).toEqual(guideOval(1920, 1080));
  });

  it("measures the face where the oval is: a small bright face in a wide frame is read as a face, not as the room", () => {
    const w = 320, h = 180;
    const px = new Uint8ClampedArray(w * h * 4);
    const o = guideOval(w, h, "wide");
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inFace = ((x + 0.5 - o.cx) / o.rx) ** 2 + ((y + 0.5 - o.cy) / o.ry) ** 2 <= 1;
      const c = inFace ? [200, 160, 130] : [60, 60, 62];
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    const wide = lightStats(px, w, h, "wide");
    expect(wide.faceLuma).toBeGreaterThan(150);
    expect(wide.bgLuma).toBeLessThan(70);
    // Read with the close oval, the same frame's "face" is mostly room.
    const asClose = lightStats(px, w, h);
    expect(asClose.faceLuma).toBeLessThan(wide.faceLuma - 40);
  });

  it("the control screen inlines the same source and measures at the chosen shot size", async () => {
    const { getRemoteBoothHtml } = await import("../src/remote-booth-page.js");
    const html = getRemoteBoothHtml();
    expect(html).toContain(LIGHT_CHECK_JS.trim().split("\n")[0]);
    expect(html).toMatch(/lightStats\(ctx\.getImageData\(0, 0, w, h\)\.data, w, h, prefs\.shot\)/);
    expect(html).toMatch(/guideOval\(r\.width, r\.height, prefs\.shot\)/);
  });
});
