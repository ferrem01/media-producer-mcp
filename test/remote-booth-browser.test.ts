import { describe, it, expect } from "vitest";
import http from "node:http";
import { getRemoteBoothHtml, getRemoteCameraHtml } from "../src/remote-booth-page.js";
import { RemoteBoothHub, type RemoteTarget } from "../src/core/remote-booth.js";
import { setupWebSocket } from "../src/ws.js";
import { boothFilms } from "../src/core/booth-films.js";
import { guideOval } from "../src/core/light-check.js";

// THE REMOTE BOOTH, END TO END in one browser (SPEC-remote-booth.md): the
// control screen and the phone's camera page (a fake camera), paired through
// the real /ws relay (src/ws.ts + core/remote-booth.ts). Start on the
// laptop -> both count 3-2-1 -> the phone records locally -> Stop -> the
// phone uploads -> the laptop reviews -> Keep attaches through the booth's
// own route with capture "remote". Then the laptop moves the session to
// another film (Marc: "I have to remove the camera from the stand and then
// scan the QR for each") and the phone follows without a re-scan.

const TENANT = "acme";
const projects: Record<string, any> = {
  proj_wide: {
    project_id: "proj_wide", tenant_id: TENANT, name: "Launch film", canvas: { width: 1920, height: 1080 }, updated_at: "2026-09-26T10:00:00Z",
    treatment: { filmGrammar: "speaker", frame: "16x9" }, scenes: [],
    storyboard: { scenes: [
      { label: "Scene 1 · Hello", duration_seconds: 5, voiceover_text: "Hi, I'm Marc.", assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "needed" }] },
      { label: "Scene 2", duration_seconds: 5, voiceover_text: "This is the remote booth.", assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "needed" }] },
    ] },
  },
  proj_tall: {
    project_id: "proj_tall", tenant_id: TENANT, name: "Reel", canvas: { width: 1080, height: 1920 }, updated_at: "2026-09-25T10:00:00Z",
    treatment: { filmGrammar: "creator-cut", frame: "9x16" }, scenes: [],
    storyboard: { scenes: [
      { label: "Scene 1", duration_seconds: 4, voiceover_text: "One brief.", assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "provided", path: "/x.mp4" }] },
      { label: "Scene 2", duration_seconds: 4, voiceover_text: "Every surface.", assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "needed" }] },
    ] },
  },
};

async function testServer() {
  const uploads: Array<{ project: string; name: string; bytes: number; token: string | null }> = [];
  const attaches: Array<{ project: string; body: any; token: string | null }> = [];
  const files = new Map<string, Buffer>();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || "/", "http://x");
    const json = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (u.pathname === "/remote-booth") { res.writeHead(200, { "content-type": "text/html" }); res.end(getRemoteBoothHtml()); return; }
    if (u.pathname === "/remote-camera") { res.writeHead(200, { "content-type": "text/html" }); res.end(getRemoteCameraHtml()); return; }
    let m = u.pathname.match(/^\/api\/projects\/([^/]+)\/([^/]+)$/);
    if (m) { const p = projects[m[2]]; if (!p || m[1] !== TENANT) return json(404, { error: "no" }); return json(200, p); }
    if (u.pathname === `/api/booth-films/${TENANT}`) return json(200, { ok: true, films: boothFilms(Object.values(projects)) });
    if (u.pathname.startsWith("/api/take-qr/")) { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'); return; }
    m = u.pathname.match(/^\/api\/upload-asset\/([^/]+)\/([^/]+)$/);
    if (m && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const name = u.searchParams.get("name") || "x";
        const buf = Buffer.concat(chunks);
        const url = `/assets/${m![1]}/projects/${m![2]}/assets/${name}`;
        files.set(url, buf);
        uploads.push({ project: m![2], name, bytes: buf.length, token: u.searchParams.get("token") });
        json(200, { ok: true, url, size: buf.length });
      });
      return;
    }
    m = u.pathname.match(/^\/api\/take\/([^/]+)\/([^/]+)$/);
    if (m && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => { attaches.push({ project: m![2], body: JSON.parse(raw), token: u.searchParams.get("token") }); json(200, { ok: true, open_needs: [1] }); });
      return;
    }
    if (files.has(u.pathname)) { res.writeHead(200, { "content-type": "video/webm" }); res.end(files.get(u.pathname)); return; }
    res.writeHead(404); res.end();
  });
  const loadTarget = async (tenant: string, project: string, scene: number | "all"): Promise<RemoteTarget | null> => {
    const p = projects[project];
    if (!p || tenant !== TENANT) return null;
    return { project, scene, name: p.name, canvas: p.canvas, frame: p.treatment.frame, grammar: p.treatment.filmGrammar, lines: scene === "all" ? "" : p.storyboard.scenes[scene]?.voiceover_text };
  };
  const hub = new RemoteBoothHub({ loadTarget });
  setupWebSocket(server, { hub, validate: (t) => (t === "tokA" ? TENANT : t === "tokB" ? "intruder" : null), authEnabled: () => true });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { server, hub, uploads, attaches, port: (server.address() as any).port as number };
}

describe("the remote booth in a browser (control + phone, fake camera)", () => {
  it("pairs, previews, records on Start, uploads on Stop, attaches on Keep, and follows a retarget", async () => {
    const { chromium } = await import("playwright");
    const srv = await testServer();
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const base = `http://127.0.0.1:${srv.port}`;
    try {
      // THE CONTROL SCREEN: a laptop.
      const lap = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      const lapErrors: string[] = []; lap.on("pageerror", (e) => lapErrors.push(e.message));
      await lap.goto(`${base}/remote-booth?tenant=${TENANT}&project=proj_wide&scene=0&token=tokA`);
      // The script loads with or without a phone; the QR carries the session.
      await lap.waitForFunction(() => (document.getElementById("cue")!.textContent || "").indexOf("Hi, I") === 0, null, { timeout: 10000 });
      await lap.waitForFunction(() => /session=rb_/.test((document.getElementById("camLink") as HTMLAnchorElement).href), null, { timeout: 10000 });
      const camUrl = await lap.evaluate(() => (document.getElementById("camLink") as HTMLAnchorElement).href);
      expect(camUrl).toMatch(/\/remote-camera\?tenant=acme&session=rb_[A-Za-z0-9_-]+&token=tokA$/);
      expect(await lap.evaluate(() => (document.getElementById("qr") as HTMLImageElement).src)).toMatch(/\/api\/take-qr\/acme\/proj_wide\?session=rb_.*&token=tokA/);
      expect(await lap.isVisible("#pairCard")).toBe(true);

      // A phone with another tenant's token cannot join this session.
      const bad = await (await browser.newContext({ permissions: ["camera", "microphone"] })).newPage();
      await bad.goto(camUrl.replace("token=tokA", "token=tokB"));
      await bad.waitForFunction(() => /another workspace|cannot/.test(document.getElementById("status")!.textContent || ""), null, { timeout: 10000 });
      await bad.close();
      expect(await lap.isVisible("#pairCard")).toBe(true);

      // THE CAMERA: a phone on its side (a wide film).
      const phoneCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, permissions: ["camera", "microphone"] });
      await phoneCtx.addInitScript(() => {
        const w = window as any; w.__recOpts = [];
        const MR = w.MediaRecorder;
        w.MediaRecorder = function (s: any, o: any) { w.__recOpts.push(o); return new MR(s, o); };
        w.MediaRecorder.isTypeSupported = (t: string) => MR.isTypeSupported(t);
      });
      const phone = await phoneCtx.newPage();
      const phoneErrors: string[] = []; phone.on("pageerror", (e) => phoneErrors.push(e.message));
      await phone.goto(camUrl);

      // hello: the laptop learns what the camera really delivers.
      await lap.waitForFunction(() => !!(window as any).__rb.camera && (window as any).__rb.camera.width > 0, null, { timeout: 15000 });
      const hello = await lap.evaluate(() => (window as any).__rb.camera);
      expect(hello.camera).toBe("environment"); // rear by default
      expect(hello.width).toBeGreaterThan(0);
      expect(typeof hello.fps).toBe("number");
      expect(Array.isArray(hello.locks)).toBe(true);
      console.log(`  fake camera delivered ${hello.width}x${hello.height} @ ${hello.fps} fps (asked ideal 3840x2160)`);
      expect(await lap.isVisible("#camCard")).toBe(true);
      expect(await lap.isVisible("#pairCard")).toBe(false);
      expect(await lap.textContent("#pair")).toMatch(/Phone paired · \d+×\d+/);
      expect(await phone.textContent("#status")).toMatch(/Paired — waiting for the laptop/);

      // Preview frames arrive, the oval follows the shot size, the light check speaks.
      await lap.waitForFunction(() => (window as any).__rb.previews >= 3, null, { timeout: 10000 });
      const pvSize = await lap.evaluate(() => ({ w: (document.getElementById("pv") as HTMLCanvasElement).width, h: (document.getElementById("pv") as HTMLCanvasElement).height }));
      expect(pvSize).toEqual({ w: 320, h: 180 }); // the film's 16:9, ~320 px
      await lap.waitForFunction(() => !document.getElementById("light")!.classList.contains("wait"), null, { timeout: 8000 });
      const ovalAt = async () => lap.evaluate(() => { const r = document.getElementById("pv")!.getBoundingClientRect(), o = document.getElementById("oval")!.getBoundingClientRect(); return { w: r.width, h: r.height, ow: o.width, oh: o.height }; });
      await lap.click('#shotSeg button[data-shot="close"]');
      const close = await ovalAt();
      expect(close.oh).toBeCloseTo(2 * guideOval(close.w, close.h, "close").ry, 0);
      await lap.click('#shotSeg button[data-shot="wide"]');
      const wide = await ovalAt();
      expect(wide.oh).toBeCloseTo(2 * guideOval(wide.w, wide.h, "wide").ry, 0);
      expect(wide.oh).toBeLessThan(close.oh * 0.5);

      // START (the space bar) -> a 3-2-1 on BOTH devices -> the phone records.
      await lap.keyboard.press("Space");
      await lap.waitForFunction(() => getComputedStyle(document.getElementById("count")!).display === "flex", null, { timeout: 3000 });
      await phone.waitForFunction(() => getComputedStyle(document.getElementById("count")!).display === "flex", null, { timeout: 3000 });
      await phone.waitForFunction(() => (window as any).__cam.state === "recording", null, { timeout: 8000 });
      await lap.waitForFunction(() => (window as any).__rb.mode === "recording", null, { timeout: 8000 });
      const recInfo = await lap.evaluate(() => (window as any).__rb.recInfo);
      expect(recInfo.width / recInfo.height).toBeCloseTo(16 / 9, 1); // the film's frame
      const bps = (await phone.evaluate(() => (window as any).__recOpts))[0].videoBitsPerSecond;
      // By pixel count: 12 Mbps at 1080p up to 24 at 4K, in between for a 3K crop.
      const k = Math.max(0, Math.min(1, (recInfo.width * recInfo.height - 1920 * 1080) / (3840 * 2160 - 1920 * 1080)));
      expect(bps).toBe(Math.round((12 + 12 * k) * 1000) * 1000);
      // The prompter runs on the laptop; → advances a line (a clicker's "next").
      await lap.waitForFunction(() => document.querySelectorAll("#cue .w").length > 0, null, { timeout: 4000 });
      await lap.keyboard.press("PageDown");
      await lap.waitForTimeout(1200);
      // STOP (Esc, or a clicker's blank key) -> upload -> review on the laptop.
      await lap.keyboard.press("Escape");
      await lap.waitForFunction(() => (window as any).__rb.mode === "review", null, { timeout: 20000 });
      expect(srv.uploads.length).toBe(1);
      expect(srv.uploads[0]).toMatchObject({ project: "proj_wide", token: "tokA" });
      expect(srv.uploads[0].name).toMatch(/^remote-take-.*\.(webm|mp4)$/);
      expect(srv.uploads[0].bytes).toBeGreaterThan(1000);
      expect(await lap.isVisible("#review")).toBe(true);
      expect(await lap.evaluate(() => (document.getElementById("play") as HTMLVideoElement).src)).toMatch(/\/assets\/acme\/projects\/proj_wide\/assets\/remote-take-/);
      expect(await phone.evaluate(() => (window as any).__cam.state)).toBe("review");

      // KEEP -> the phone attaches through the booth's route.
      await lap.click("#keepBtn");
      await lap.waitForFunction(() => /Kept — Scene 1/.test(document.getElementById("status")!.textContent || ""), null, { timeout: 10000 });
      expect(srv.attaches.length).toBe(1);
      const at = srv.attaches[0];
      expect(at.project).toBe("proj_wide");
      expect(at.token).toBe("tokA");
      expect(at.body).toMatchObject({ capture: "remote", scene_index: 0, look: "soft", background: "room", url: srv.uploads[0] && `/assets/acme/projects/proj_wide/assets/${srv.uploads[0].name}` });
      expect(at.body.width / at.body.height).toBeCloseTo(16 / 9, 1);
      expect(at.body.duration).toBeGreaterThan(0.5);
      expect(await phone.evaluate(() => (window as any).__cam.state)).toBe("idle");
      // The next scene still owed a take is one press away.
      await lap.waitForSelector("#nextBtn:not([hidden])", { timeout: 5000 });
      expect(await lap.textContent("#nextBtn")).toBe("Next: Scene 2");

      // THE WAY OUT: "← Studio" goes back to this film in Studio (Marc: "I
      // have no way to get back out to the film I was working on"); the
      // film to-do drawer is gone.
      expect(await lap.getAttribute("#backLink", "href")).toBe("/studio?tenant=acme&project=proj_wide&token=tokA");
      expect(await lap.$("#films")).toBeNull();
      // Another scene of THIS film: the scene picker; the phone follows.
      const opts = await lap.evaluate(() => [...(document.getElementById("sceneSel") as HTMLSelectElement).options].map((o) => o.value));
      expect(opts.slice(0, 2)).toEqual(["0", "1"]);
      await lap.selectOption("#sceneSel", "1");
      await phone.waitForFunction(() => (window as any).__cam.target && (window as any).__cam.target.scene === 1, null, { timeout: 8000 });
      expect(await lap.evaluate(() => location.search)).toBe("?tenant=acme&project=proj_wide&scene=1&token=tokA");

      // ANOTHER FILM, a TALL one, the way Studio's "Across the room" opens
      // it: this tab navigates to its link. The stored session rejoins, the
      // link's film wins, and the phone follows (no re-scan) and re-opens
      // its camera in the new orientation.
      const opened = await phone.evaluate(() => (window as any).__cam.opened);
      await lap.goto(`${base}/remote-booth?tenant=${TENANT}&project=proj_tall&scene=1&token=tokA`);
      await phone.waitForFunction(() => (window as any).__cam.target && (window as any).__cam.target.project === "proj_tall", null, { timeout: 8000 });
      const tgt = await phone.evaluate(() => (window as any).__cam.target);
      expect(tgt).toMatchObject({ project: "proj_tall", scene: 1, canvas: { width: 1080, height: 1920 } });
      await phone.waitForFunction((n) => (window as any).__cam.opened > n, opened, { timeout: 8000 });
      await lap.waitForFunction(() => (document.getElementById("cue")!.textContent || "") === "Every surface.", null, { timeout: 8000 });
      expect(await lap.evaluate(() => location.search)).toBe("?tenant=acme&project=proj_tall&scene=1&token=tokA");
      await lap.waitForFunction(() => (document.getElementById("pv") as HTMLCanvasElement).height === 320, null, { timeout: 8000 });
      expect(await lap.evaluate(() => (document.getElementById("pv") as HTMLCanvasElement).width)).toBe(180);

      expect(lapErrors).toEqual([]);
      expect(phoneErrors).toEqual([]);
    } finally {
      await browser.close();
      await new Promise<void>((r) => srv.server.close(() => r()));
    }
  }, 120000);

  it("with no phone: prompter and timer only, and Upload attaches a file from any camera", async () => {
    const { chromium } = await import("playwright");
    const os = await import("node:os"); const fs = await import("node:fs/promises"); const path = await import("node:path");
    const srv = await testServer();
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rb-"));
    try {
      const lap = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
      const errors: string[] = []; lap.on("pageerror", (e) => errors.push(e.message));
      await lap.goto(`http://127.0.0.1:${srv.port}/remote-booth?tenant=${TENANT}&project=proj_wide&scene=1&token=tokA`);
      await lap.waitForFunction(() => (document.getElementById("cue")!.textContent || "") === "This is the remote booth.", null, { timeout: 10000 });
      await lap.click("#startBtn");
      await lap.waitForFunction(() => (window as any).__rb.mode === "recording", null, { timeout: 6000 });
      expect(await lap.evaluate(() => (window as any).__rb.remote)).toBe(false);
      await lap.waitForFunction(() => /0:0[1-9]/.test(document.getElementById("timer")!.textContent || ""), null, { timeout: 4000 });
      await lap.click("#startBtn"); // Stop
      expect(await lap.evaluate(() => (window as any).__rb.mode)).toBe("idle");
      expect(srv.uploads.length).toBe(0); // nothing recorded here, nothing sent

      const file = path.join(dir, "IMG_0001.MOV");
      await fs.writeFile(file, Buffer.alloc(4096, 7));
      await lap.setInputFiles("#fileIn", file);
      await lap.waitForFunction(() => (window as any).__rb.mode === "review", null, { timeout: 8000 });
      expect(srv.uploads[0]).toMatchObject({ project: "proj_wide", bytes: 4096 });
      expect(srv.uploads[0].name).toMatch(/^camera-take-.*\.mov$/);
      await lap.click("#keepBtn");
      await lap.waitForFunction(() => /Kept — Scene 2/.test(document.getElementById("status")!.textContent || ""), null, { timeout: 8000 });
      expect(srv.attaches[0].body).toMatchObject({ capture: "upload", scene_index: 1 });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await new Promise<void>((r) => srv.server.close(() => r()));
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);
});

describe("the remote booth pages' client scripts", () => {
  for (const [name, html] of [["control", getRemoteBoothHtml()], ["camera", getRemoteCameraHtml()]] as const) {
    it(`${name}: parses, and carries no template-literal hazards into the browser`, () => {
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      expect(scripts.length).toBe(1);
      for (const src of scripts) { expect(() => new Function(src)).not.toThrow(); expect(src).not.toMatch(/`/); }
      expect(html).not.toMatch(/\$\{/);
      // The socket carries the page's token; the page never trusts a tenant it was not given.
      expect(html).toMatch(/'\/ws' \+ \(o\.token \? '\?token=' \+ encodeURIComponent\(o\.token\) : ''\)/);
    });
  }

  it("camera: rear by default, ideal 3840x2160 then 1920x1080 at 30 fps in the film's shape, 12-24 Mbps by pixel count, attaches as 'remote'", () => {
    const html = getRemoteCameraHtml();
    expect(html).toMatch(/st = \{ state: 'idle', facing: 'environment'/);
    expect(html).toMatch(/var sizes = \[wide \? \[3840, 2160\] : \[2160, 3840\], wide \? \[1920, 1080\] : \[1080, 1920\], null\];/);
    expect(html).toMatch(/frameRate: \{ ideal: 30 \}/);
    expect(html).toMatch(/var bps = bitrateFor\(outW, outH\);/);
    // The film's shape rides with the size: iOS gave 3024x2160 for a bare 3840x2160 ask.
    expect(html).toMatch(/if \(sz\) v\.aspectRatio = \{ ideal: sz\[0\] \/ sz\[1\] \};/);
    expect(html).toMatch(/capture: 'remote'/);
    expect(html).toMatch(/navigator\.wakeLock\.request\('screen'\)/);
    expect(html).toMatch(/navigator\.getBattery/);
    // A lock only when the capabilities list the mode (Android Chrome; iOS has none).
    expect(html).toMatch(/if \(has\(caps\.exposureMode, 'manual'\)\)/);
  });

  it("bitrate follows the pixels: 12 Mbps at 1080p, ~18 for iOS's 3K crop, 24 at 4K", () => {
    const html = getRemoteCameraHtml();
    const src = html.slice(html.indexOf("function bitrateFor("), html.indexOf("function pickMime("));
    const bitrateFor = new Function(src + "; return bitrateFor;")() as (w: number, h: number) => number;
    expect(bitrateFor(1920, 1080)).toBe(12000000);
    expect(bitrateFor(1080, 1920)).toBe(12000000);
    expect(bitrateFor(3840, 2160)).toBe(24000000);
    expect(bitrateFor(3024, 1700)).toBeGreaterThan(17000000); // was 12 under the short-side >= 2160 rule
    expect(bitrateFor(3024, 1700)).toBeLessThan(19000000);
    expect(bitrateFor(1280, 720)).toBe(12000000);
  });

  it("Studio's Across the room opens the booth in the same tab, and the booth's ← Studio comes back", async () => {
    const { readFile } = await import("node:fs/promises");
    const studio = await readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(studio).toContain("window.location.href = roomUrl;");
    expect(studio).not.toContain("window.open(roomUrl");
    const html = getRemoteBoothHtml();
    expect(html).toContain('<a id="backLink" href="#">← Studio</a>');
    expect(html).toMatch(/project \? '\/studio\?tenant=' \+ enc\(tenant\) \+ '&project=' \+ enc\(project\)/);
    expect(html).not.toContain("/api/booth-films/' + enc(tenant))).then(function (r) { if (!r.ok) throw new Error('films ' + r.status); return r.json(); }).then(function (j) { return j.films || []; });\n  }\n  function esc(");
    expect(html).not.toContain('id="films"');
  });

  it("control: clicker keys (PageDown/PageUp/arrows, blank key) and the space bar drive the take", () => {
    const html = getRemoteBoothHtml();
    expect(html).toMatch(/var next = k === ' ' \|\| k === 'Spacebar' \|\| k === 'PageDown' \|\| k === 'ArrowRight' \|\| k === 'ArrowDown';/);
    expect(html).toMatch(/var prev = k === 'PageUp' \|\| k === 'ArrowLeft' \|\| k === 'ArrowUp';/);
    expect(html).toMatch(/var halt = k === 'Escape' \|\| k === 'b' \|\| k === 'B' \|\| k === '\.';/);
    expect(html).toMatch(/#prompt\.mirror \{ transform: scaleX\(-1\); \}/);
  });
});
