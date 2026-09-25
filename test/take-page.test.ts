import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTakeHtml } from "../src/take-page.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFile(path.join(HERE, rel), "utf8");

// The take page is the phone booth for a speaker film: the board's script as
// a teleprompter over the front camera, record / review / retake, upload,
// attach as the speaker base. Phase 2's front door
// (SPEC-format-and-spine.md): the board's ASSERTED spine driving the prompter.
//
// Like the studio page it is ONE template literal with the whole client
// script inside it, so the same failure class applies: a backslash the
// literal eats, or a stray ${, and the page never hydrates on the phone.

describe("the take page's client script", () => {
  const html = getTakeHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it("reads the tenant from the token when the link has none (one link, any screen)", () => {
    expect(html).toMatch(/if \(!tenant && token\) \{\s*try \{\s*var segT = token\.split\('\.'\)\[1\] \|\| '';/);
    expect(html).toMatch(/tenant = String\(payT\.tenant_id \|\| payT\.tenant \|\| ''\);/);
  });

  it("parses as JavaScript (a syntax error bricks the booth)", () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) expect(() => new Function(src)).not.toThrow();
  });

  it("carries no template-literal hazards into the browser", () => {
    expect(html).not.toMatch(/\$\{/);
    for (const src of scripts) expect(src).not.toMatch(/`/);
  });
});

describe("what the booth does", () => {
  const html = getTakeHtml();

  it("puts the prompter at the top of the stage, by the lens (Marc: eyes looking down in every take)", () => {
    const html = getTakeHtml();
    expect(html).toMatch(/#prompt \{ position:absolute; left:0; right:0; top: calc\(64px \+ env\(safe-area-inset-top\)\)/);
    expect(html).not.toMatch(/#prompt \{[^}]*bottom:/);
  });

  it("cues the prompter by line: a (pause) line is a held beat shown as •••, a line break a breath", () => {
    const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    expect(js).toMatch(/PAUSE_LINE = \/\^\\\(\\s\*pause\\s\*\\\)\[\.,!\?\]\*\$\/i/);
    expect(js).toMatch(/BREATH_S = 0\.3, PAUSE_S = 1\.0/);
    expect(js).toMatch(/text\.split\(\/\\r\?\\n\/\)/);
    expect(js).toMatch(/out\.push\(\{ text: PAUSE_GLYPH, toks: \[\], dur: PAUSE_S, gap: PAUSE_S, beat: i \}\)/);
    expect(html).toMatch(/\.beat \{[^}]*white-space:pre-line/);
  });

  it("records the front camera at the FILM'S frame with the recorder extension's audio constraints", () => {
    expect(html).toMatch(/facingMode: 'user'/);
    expect(html).toMatch(/width: \{ ideal: capW \}, height: \{ ideal: capH \}/);
    // The take follows the film's frame (Marc, on a laptop: "why did it record
    // it as if it was an iPhone?"): 9x16 -> 1080x1920, 16x9 -> 1920x1080.
    expect(html).toMatch(/if \(w >= h\) \{ capH = 1080; capW = Math\.round\(1080 \* w \/ h \/ 2\) \* 2; \}/);
    expect(html).toMatch(/setFrame\(p\.canvas\);/);
    expect(html).toMatch(/width: capture === 'canvas' \? capW : trackW, height: capture === 'canvas' \? capH : trackH/);
    expect(html).toMatch(/#stage\.wide #live \{[^}]*aspect-ratio: var\(--frame-w, 16\) \/ var\(--frame-h, 9\)/);
    // Echo cancellation OFF: the same choice the extension made after the
    // combined-I/O device nulled the mic. Consistent behaviour on every device.
    expect(html).toMatch(/echoCancellation: false, noiseSuppression: true, autoGainControl: true/);
  });

  it("records the picture on screen -- a portrait canvas -- not the raw camera track", () => {
    // iOS hands the recorder the sensor's landscape frame plus a rotation
    // tag; the screen shows a portrait cover-crop. Measured live
    // (proj_c210e5e1): the raw track shipped a wide, sideways-stored file.
    expect(html).toMatch(/<canvas id="cap" width="1080" height="1920">/);
    expect(html).toMatch(/cv\.captureStream\(30\)/);
    expect(html).toMatch(/s\.getAudioTracks\(\)\.forEach\(function \(t\) \{ src\.addTrack\(t\); \}\)/); // mic rides along
    expect(html).toMatch(/Math\.max\(cv\.width \/ vw, cv\.height \/ vh\)/);           // cover-crop, same framing as the screen
    expect(html).toMatch(/requestVideoFrameCallback/);                              // one draw per camera frame where available
    expect(html).toMatch(/capture = 'raw'/);                                       // fallback when captureStream is missing
    expect(html).toMatch(/capture: capture/);                                      // and the server is told which
  });

  it("prefers the container the phone can actually produce", () => {
    // Safari records mp4, Chrome/Android webm; the candidate order tries mp4 first.
    expect(html).toMatch(/'video\/mp4;codecs=avc1,mp4a', 'video\/mp4', 'video\/webm;codecs=vp9,opus'/);
    expect(html).toMatch(/isTypeSupported/);
  });

  it("shows a level meter and calls out a silent take while it is still rolling", () => {
    // Two whole walkthroughs shipped mute before anyone knew (AMENDMENTS 2026-09).
    expect(html).toMatch(/getFloatTimeDomainData/);
    expect(html).toMatch(/\(now - lastLoud\) > 3000/);
    expect(html).toMatch(/No sound is reaching the mic/);
  });

  it("paces the prompter at speaking pace, never faster than the board's words allow, splitting a long beat by word share", () => {
    expect(html).toMatch(/voiceover_text/);
    expect(html).toMatch(/duration_seconds/);
    expect(html).toMatch(/WORDS_PER_SEC = 2\.4/);
    // The board's number is the cut, never the mouth, BOTH ways: 24 words in a 4s scene raced the prompter,
    // and a 10s creator-cut scene with 4s of words held its last line (Marc: "reading, then pausing").
    expect(html).not.toMatch(/Math\.max\(Number\(s\.duration_seconds\)/);
    // A scene change adds nothing: the talk track is continuous (Marc).
    expect(html).not.toMatch(/SCENE_BREATH/);
    // Emphasis holds, punctuation beats.
    expect(html).toMatch(/var EMPH_K = 1\.4, COMMA_S = 0\.2, DASH_S = 0\.4;/);
  });

  it("shows one cue at a time on its own clock, and a tap on the stage jumps to the next line", () => {
    expect(html).toMatch(/function showCue\(i\) \{/);
    expect(html).toMatch(/cueTimer = setTimeout\(function \(\) \{ showCue\(i \+ 1\); \}, c\.dur \* 1000\);/);
    // Karaoke: the line's words light at pace; the next TWO lines show under it.
    expect(html).toMatch(/sp\.className = 'w' \+ \(k\.emph \? ' em' : ''\)/);
    expect(html).toMatch(/if \(el >= toks\[k\]\.start\) spans\[k\]\.classList\.add\('on'\);/);
    expect(html).toMatch(/<div id="prompt"><div id="cue"><\/div><div id="next"><\/div><div id="next2"><\/div><\/div>/);
    expect(html).toMatch(/function advanceCue\(\) \{ if \(rec && rec\.state === 'recording' && cueIdx >= 0 && cueIdx < cues\.length\) showCue\(cueIdx \+ 1\); \}/);
    expect(html).toMatch(/\$\('stage'\)\.addEventListener\('click'/);
    expect(html).toMatch(/Tap the screen to jump to the next line\./);
  });

  it("never makes the human scroll: the script scrolls inside its card, the stage owns the viewport, Record stays in reach", () => {
    expect(html).toMatch(/#ready \{ height:100dvh; overflow-y:auto;/);
    expect(html).toMatch(/<div class="rec-dock"><button class="btn" id="recordBtn" disabled>Record<\/button><\/div>/);
    expect(html).toMatch(/#script \{ flex:0 1 auto; max-height:44dvh; overflow-y:auto;/);
    expect(html).toMatch(/#stage \{ position:fixed; inset:0; z-index:5; background:#000; touch-action:manipulation; \}/);
    expect(html).toMatch(/try \{ window\.scrollTo\(0, 0\); \} catch \(eS\) \{\}/);
    // ...and the page under the stage is locked (a fixed body is the lock iOS honours), touches never scroll it.
    expect(html).toMatch(/html\.lock body \{ position:fixed; width:100%; top:0; left:0; \}/);
    expect(html).toMatch(/document\.documentElement\.classList\.toggle\('lock', id === 'stage'\);/);
    expect(html).toMatch(/document\.addEventListener\('touchmove', function \(ev\) \{ if \(document\.documentElement\.classList\.contains\('lock'\)\) ev\.preventDefault\(\); \}, \{ passive: false \}\);/);
  });

  it("asks for the camera once per visit: the stream survives review, retake and record-again, released when the page hides", () => {
    expect(html).toMatch(/var live = stream && stream\.getTracks\(\)\.some\(function \(t\) \{ return t\.readyState === 'live'; \}\);/);
    expect(html).toMatch(/\(live \? Promise\.resolve\(stream\) : navigator\.mediaDevices\.getUserMedia\(constraints\)\)/);
    expect(html).toMatch(/window\.addEventListener\('pagehide', releaseCamera\);/);
    // stopAll no longer kills the tracks.
    const stopAll = html.slice(html.indexOf("function stopAll()"), html.indexOf("function releaseCamera()"));
    expect(stopAll).not.toMatch(/t\.stop\(\)/);
  });

  it("uploads to the project's own assets and then attaches via /api/take", () => {
    expect(html).toMatch(/\/api\/upload-asset\//);
    expect(html).toMatch(/\/api\/take\//);
    expect(html).toMatch(/speaker base/);
    // the token rides on every request, same as /upload
    expect(html).toMatch(/function withToken/);
  });

  it("gets the human back to Studio from the ready and done screens, and offers the soft look", () => {
    const html = getTakeHtml();
    expect(html).toMatch(/id="studioLinkTop"/);
    expect(html).toMatch(/id="studioLink"/);
    // ONE Studio: the link is the Studio link, which serves the phone view to a phone.
    expect(html).toMatch(/var studioHref = '\/studio\?tenant='/);
    expect(html).not.toMatch(/\/board\?/);
    expect(html).toMatch(/id="softLook" checked/);
    expect(html).toMatch(/look: \(\$\('softLook'\) && \$\('softLook'\)\.checked\) \? 'soft' : 'natural'/);
  });

  it("is mobile-safe: playsinline video, safe-area padding, no zoom", () => {
    expect(html).toMatch(/playsinline/);
    expect(html).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(html).toMatch(/user-scalable=no/);
  });
});

describe("the server side", () => {
  it("serves /take next to /upload and guards /api/take by tenant", async () => {
    const src = await read("../src/index.ts");
    expect(src).toMatch(/urlPath === "\/take"/);
    expect(src).toMatch(/getTakeHtml\(\)/);
    // the tenant guard regex must list `take` or a tenant token could attach
    // to another tenant's project
    expect(src).toMatch(/\|traces\|take\|take-poster\|storyboard\|provide-asset\|team\)\\\/\(\[\^\/\]\+\)\//);
  });

  it("asks the recorder for 8 Mbps video (the browser's default near 2.5 Mbps smeared a 1080p take)", async () => {
    const src = await read("../src/take-page.ts");
    expect(src).toMatch(/var recOpts = \{ videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 \};/);
    expect(src).toMatch(/rec = new MediaRecorder\(src, recOpts\);/);
    expect(src).not.toMatch(/new MediaRecorder\(src, \{ mimeType: mime \}\)/);
  });

  it("refuses a take URL outside the project's own asset dir", async () => {
    const src = await read("../src/index.ts");
    // The route's body lives in attachTakeToScene (shared with the Recorder's camera file).
    const at = src.indexOf("async function attachTakeToScene(");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 10000);
    expect(block).toMatch(/expectedPrefix = `\/assets\/\$\{tkTenant\}\/projects\/\$\{tkProject\}\/assets\/`/);
    expect(block).toMatch(/tkUrl\.includes\("\.\."\)/);
    // the take is attached per scene through the needs module, not by hand
    expect(block).toMatch(/attachTake\(tkProjectObj, \{/);
    expect(block).toMatch(/scene_index: sceneIndex/);
    expect(block).toMatch(/resolveTakeWaiters\(tkTenant, tkProject, t\)/);      // every attached take releases its waiters
  });

  it("records every take on the project, one active per scene (SPEC-take-flow.md)", async () => {
    const types = await read("../src/core/types.ts");
    expect(types).toMatch(/takes\?: Take\[\];/);
    expect(types).toMatch(/export interface Take \{[\s\S]*scene_index: number;[\s\S]*capture\?: string;/);
    expect(types).not.toMatch(/\n  take\?: \{/);
  });

  it("records one scene when the link says which, and tells the server", () => {
    const html = getTakeHtml();
    expect(html).toMatch(/qp\.get\('scene'\)/);
    // The SERVED page must carry the digit class -- this file is a template
    // literal and a lone backslash never reaches the browser (measured live:
    // every scene link prompted the whole board).
    expect(html).toMatch(/\/\^\\d\+\$\/\.test\(qp\.get\('scene'\)/);
    expect(html).toMatch(/scene_index: recordAll \? 'all' : \(sceneIndex >= 0 \? sceneIndex : undefined\)/);
    // Whenever the prompter shows the whole board, the take covers the whole board (the server cuts it per scene).
    expect(html).toMatch(/var recordAll = qp\.get\('scene'\) === 'all' \|\| sceneIndex < 0;/);
  });
});

describe("Record stays on screen on a small phone (measured)", () => {
  it("the background row's long hint no longer pushes Record below a screen that cannot scroll", async () => {
    // Marc, live: "I don't see a record button anymore" -- the Room/Blur/Alpha
    // hint rendered as a one-word-wide column and shoved Record to y=1072 on
    // a 664px screen.
    const { chromium, devices } = await import("playwright");
    const os = await import("node:os"); const fs = await import("node:fs/promises");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-"));
    await fs.writeFile(path.join(dir, "take.html"), getTakeHtml());
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      for (const dev of ["iPhone SE", "iPhone 13"]) {
        const page = await (await browser.newContext({ ...devices[dev] })).newPage();
        await page.route("**/api/**", (r) => r.abort());
        await page.goto("file://" + path.join(dir, "take.html"));
        await page.evaluate(() => {
          document.querySelectorAll("section").forEach((s) => s.classList.remove("on"));
          document.getElementById("ready")!.classList.add("on");
          document.getElementById("script")!.innerHTML = "<p class=beat><b>Beat 1</b>" + "A long line of the script that wraps on a phone. ".repeat(12) + "</p>";
        });
        const r = await page.evaluate(() => { const b = document.getElementById("recordBtn")!.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
        expect(r.top, dev).toBeGreaterThan(0);
        expect(r.bottom, dev).toBeLessThanOrEqual(r.vh);
      }
    } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 60000);
});

describe("the prompter in a browser (fake camera)", () => {
  it("paces continuously, holds emphasis, beats on punctuation, and Start over re-rolls", async () => {
    const closers: Array<() => Promise<void>> = [];
    const { chromium, devices } = await import("playwright");
    const os = await import("node:os"); const fs = await import("node:fs/promises");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-"));
    await fs.writeFile(path.join(dir, "take.html"), getTakeHtml());
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const ctx = await browser.newContext({ ...devices["iPhone 13"], permissions: ["camera", "microphone"] });
      const page = await ctx.newPage();
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      const proj = { name: "T", canvas: { width: 1080, height: 1920 }, treatment: { filmGrammar: "creator-cut" }, scenes: [],
        storyboard: { scenes: [
          { duration_seconds: 10, voiceover_text: "One brief, every surface.", emphasis: ["brief"] },
          { duration_seconds: 12, voiceover_text: "It ships \u2014 *today*." } ] } };
      // A real origin (not file://): the page's relative /api fetch must hit
      // something every Playwright version routes the same way.
      const http = await import("node:http");
      const server = http.createServer((req, res) => {
        if ((req.url || "").startsWith("/api/projects/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(proj)); return; }
        res.writeHead(200, { "content-type": "text/html" }); res.end(getTakeHtml());
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      closers.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as any).port;
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      // The whole script runs at speaking pace: well under the board's 22s.
      expect(await page.evaluate(() => document.getElementById("subtitle")!.textContent)).toMatch(/about 0:0[2-6] at speaking pace/);
      await page.click("#recordBtn");
      await page.waitForFunction(() => document.querySelectorAll("#cue .w").length > 0, null, { timeout: 8000 });
      const first = await page.evaluate(() => ({
        em: [...document.querySelectorAll("#cue .w.em")].map((e) => e.textContent),
        next: document.getElementById("next")!.textContent,
      }));
      expect(first.em).toEqual(["brief,"]);
      expect(first.next).toBe("It ships \u2014 today."); // stars lifted, the next scene flows straight on
      await page.waitForFunction(() => (document.getElementById("cue")!.textContent || "").startsWith("It ships"), null, { timeout: 6000 });
      const second = await page.evaluate(() => [...document.querySelectorAll("#cue .w")].map((e) => e.className));
      expect(second.some((c) => c.includes("em"))).toBe(true); // *today*
      expect(second.some((c) => c.includes("dash"))).toBe(true);
      await page.click("#againRecBtn");
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("count")!).display)).toBe("flex");
      await page.waitForFunction(() => document.querySelectorAll("#cue .w").length > 0, null, { timeout: 8000 });
      expect(errors).toEqual([]);
    } finally { await browser.close(); for (const c of closers) await c(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 90000);
});
