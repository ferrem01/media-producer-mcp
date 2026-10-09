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
    expect(js).toMatch(/BREATH_S = 0\.15, PAUSE_S = 1\.0/);
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
    expect(html).toMatch(/WORDS_PER_SEC = 3\.0/); // ad pace, 180 wpm (Marc: "it was too slow")
    // The board's number is the cut, never the mouth, BOTH ways: 24 words in a 4s scene raced the prompter,
    // and a 10s creator-cut scene with 4s of words held its last line (Marc: "reading, then pausing").
    expect(html).not.toMatch(/Math\.max\(Number\(s\.duration_seconds\)/);
    // A scene change adds nothing: the talk track is continuous (Marc).
    expect(html).not.toMatch(/SCENE_BREATH/);
    // Emphasis holds, punctuation beats.
    expect(html).toMatch(/var EMPH_K = 1\.3, COMMA_S = 0\.12, DASH_S = 0\.3;/);
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
    // Off by default (Marc, Oct 7: "maybe the fill and soft should not be default on").
    expect(html).toMatch(/<input type="checkbox" id="softLook"> Soft look/);
    expect(html).toMatch(/<div class="toggle off" id="softDial">/);
    expect(html).toMatch(/look: \(\$\('softLook'\) && \$\('softLook'\)\.checked\) \? 'soft' : 'natural'/);
    // Marc: "something we can dial up and dial down" -- a smoothing dial
    // under the checkbox, starting at his pick when switched on.
    expect(html).toMatch(/id="softStrength" min="0" max="1" step="0\.05" value="0\.5"/);
    expect(html).toMatch(/soft_strength: \$\('softStrength'\) \? parseFloat\(\$\('softStrength'\)\.value\)/);
    expect(html).toMatch(/\$\('softDial'\)\.classList\.toggle\('off', !this\.checked\)/);
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

  it("asks the recorder for 12 Mbps video (the default near 2.5 smeared a 1080p take; 8 banded skin on iOS)", async () => {
    const src = await read("../src/take-page.ts");
    expect(src).toMatch(/var recOpts = \{ videoBitsPerSecond: 12000000, audioBitsPerSecond: 128000 \};/);
    expect(src).toMatch(/rec = new MediaRecorder\(src, recOpts\);/);
    expect(src).not.toMatch(/new MediaRecorder\(src, \{ mimeType: mime \}\)/);
  });

  it("refuses a take URL outside the project's own asset dir", async () => {
    const src = await read("../src/index.ts");
    // The route's body lives in attachTakeToScene (shared with the Recorder's camera file).
    const at = src.indexOf("async function attachTakeToScene(");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 14000);
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
      expect(await page.evaluate(() => document.getElementById("subtitle")!.textContent)).toMatch(/about 0:0[2-6] at 180 wpm/);
      // The speed control re-times the script and says the new pace.
      await page.click("#fasterBtn"); await page.click("#fasterBtn");
      expect(await page.evaluate(() => document.getElementById("speedWpm")!.textContent)).toBe("216 wpm");
      expect(await page.evaluate(() => document.getElementById("subtitle")!.textContent)).toMatch(/at 216 wpm/);
      expect(await page.evaluate(() => localStorage.getItem("mp.prompter.speed.p"))).toBe("1.2");
      await page.click("#slowerBtn"); await page.click("#slowerBtn");
      await page.click("#recordBtn");
      // The camera opens on the light check (booth-light-check.test.ts);
      // Start recording rolls the count-in.
      await page.waitForSelector("#goBtn", { state: "visible", timeout: 8000 });
      await page.click("#goBtn");
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

describe("the booth keeps to one scene: films are chosen in Studio (SPEC-remote-booth.md)", () => {
  it("the prompter code is the shared module, the same one the remote booth inlines", async () => {
    const { PROMPTER_TIMING_JS, PROMPTER_VIEW_JS, buildCues } = await import("../src/core/prompter.js");
    const html = getTakeHtml();
    expect(html).toContain(PROMPTER_TIMING_JS.trim().split("\n")[0]);
    expect(html).toContain("function showCue(i) {");
    expect(PROMPTER_VIEW_JS).toContain("function showCue(i) {");
    const cues = buildCues([{ voiceover_text: "One brief, every surface.\n(pause)\nIt ships.", emphasis: ["brief"] }]);
    expect(cues.map((c) => c.text)).toEqual(["One brief, every surface.", "•••", "It ships."]);
    expect(cues[0].toks.filter((t) => t.emph).map((t) => t.t)).toEqual(["brief,"]);
    expect(cues[1].dur).toBe(1);
  });

  it("a domain or a decimal is one word, not a sentence break (\"getquotient.\" then \"ai.\" cost a second)", async () => {
    const { buildCues } = await import("../src/core/prompter.js");
    const cues = buildCues([{ voiceover_text: "Try it free at getquotient.ai. It is 3.5x faster! Really?" }]);
    expect(cues.map((c) => c.text)).toEqual(["Try it free at getquotient.ai.", "It is 3.5x faster!", "Really?"]);
  });

  it("the speed control scales the whole pace but keeps a written (pause) at a second", async () => {
    const { buildCues, clampSpeed, speedWpm } = await import("../src/core/prompter.js");
    const sc = [{ voiceover_text: "Drag-and-drop templates, blast the whole list, hope for the best.\n(pause)\nLet the old guy retire." }];
    const sum = (sp: number) => buildCues(sc, sp).reduce((a, c) => a + c.dur, 0);
    const base = sum(1), fast = sum(1.2);
    expect(fast).toBeLessThan(base);
    expect(fast - 1).toBeCloseTo((base - 1) / 1.2, 1);
    expect(buildCues(sc, 1.2)[1].dur).toBe(1);
    expect(clampSpeed(9)).toBe(1.5);
    expect(clampSpeed(0.1)).toBe(0.7);
    expect(speedWpm(1)).toBe(180);
    // Both booths carry the control.
    const booth = (await import("../src/remote-booth-page.js")).getRemoteBoothHtml();
    for (const h of [getTakeHtml(), booth]) {
      expect(h).toContain('id="slowerBtn"');
      expect(h).toContain('id="fasterBtn"');
      expect(h).toMatch(/cues = buildCues\(cueScenes, speed\)/);
    }
  });

  it("has no Films sheet: moving between films is the phone Studio's Films link (Marc: \"I don't need a film button that only shows me unrecorded film\")", () => {
    const html = getTakeHtml();
    for (const id of ["filmsBtn", "filmsBtnReview", "filmsBtnDone", "filmsSheet", "filmsList"]) expect(html).not.toContain(`id="${id}"`);
    expect(html).not.toContain("/api/booth-films/");
    expect(html).toContain('<p><a class="link" id="studioLinkTop" href="#">← Back to Studio</a></p>');
  });
});

describe("the done screen goes on to the next scene (Marc, Oct 6)", () => {
  it("picks the next scene with lines and no take, wrapping round; none when all are done", async () => {
    const { NEXT_SCENE_JS } = await import("../src/take-page.js");
    const next = new Function(NEXT_SCENE_JS + "; return nextOpenScene;")() as (s: any[], t: number[], f: number) => number;
    const s = [{ lines: true }, { lines: true }, { lines: false }, { lines: true }];
    expect(next(s, [0], 0)).toBe(1);
    expect(next(s, [0, 1], 1)).toBe(3);          // a scene with no lines is skipped
    expect(next(s, [1, 3], 3)).toBe(0);          // wraps to an earlier one still open
    expect(next(s, [0, 1, 3], 3)).toBe(-1);
    const html = getTakeHtml();
    expect(html).not.toContain("Desktop Studio");
    expect(html.match(/id="studioLink"/g)).toHaveLength(1);
  });

  it("records a scene, attaches it, and Next scene opens the next unrecorded one on the same page", async () => {
    const closers: Array<() => Promise<void>> = [];
    const { chromium, devices } = await import("playwright");
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const ctx = await browser.newContext({ ...devices["iPhone 13"], permissions: ["camera", "microphone"] });
      const page = await ctx.newPage();
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      const proj = { name: "T", canvas: { width: 1080, height: 1920 }, treatment: { filmGrammar: "creator-cut" }, scenes: [],
        takes: [{ id: "t1", scene_index: 1, source: "/a.mp4" }],
        storyboard: { scenes: [
          { label: "Hook", duration_seconds: 3, voiceover_text: "One." },
          { label: "Signal one", duration_seconds: 3, voiceover_text: "Two." },
          { label: "Signal two", duration_seconds: 3, voiceover_text: "Three." } ] } };
      const attached: any[] = [];
      const http = await import("node:http");
      const server = http.createServer((req, res) => {
        const u = req.url || "";
        let body = ""; req.on("data", (c) => { body += c; });
        req.on("end", () => {
          if (u.startsWith("/api/projects/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(proj)); return; }
          if (u.startsWith("/api/upload-asset/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ url: "/assets/t/projects/p/assets/take.webm" })); return; }
          if (u.startsWith("/api/take/")) { attached.push(JSON.parse(body)); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
          res.writeHead(200, { "content-type": "text/html" }); res.end(getTakeHtml());
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      closers.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as any).port;
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x&scene=0`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      await page.click("#recordBtn");
      await page.waitForSelector("#goBtn", { state: "visible", timeout: 8000 });
      await page.click("#goBtn");
      await page.waitForSelector("#stopBtn", { state: "visible", timeout: 8000 });
      await page.waitForTimeout(4500);                                        // count-in, then a beat of recording
      await page.click("#stopBtn");
      await page.waitForSelector("#useBtn", { state: "visible", timeout: 8000 });
      await page.click("#useBtn");
      await page.waitForSelector("#nextBtn", { state: "visible", timeout: 10000 });
      expect(attached[0].scene_index).toBe(0);
      // Scene 2 already has a take: Next skips to scene 3.
      expect(await page.textContent("#nextBtn")).toBe("Next: Scene 3 · Signal two");
      expect(await page.getAttribute("#studioLink", "class")).toBe("btn ghost");
      await page.click("#nextBtn");
      await page.waitForFunction(() => document.getElementById("ready")!.classList.contains("on") && /Scene 3/.test(document.getElementById("title")!.textContent || ""), null, { timeout: 8000 });
      expect(new URL(page.url()).searchParams.get("scene")).toBe("2");
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 8000 });
      expect(await page.textContent("#script")).toContain("Three.");
      expect(errors).toEqual([]);
    } finally { await browser.close(); for (const c of closers) await c(); }
  }, 90000);

  it("Voice only: the mic alone (no camera), the prompter, and the voice lands as the scene's voice recording", async () => {
    const closers: Array<() => Promise<void>> = [];
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    try {
      const ctx = await browser.newContext({ permissions: ["microphone"] });
      const page = await ctx.newPage();
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      // Every getUserMedia ask, recorded: Voice only never asks for video.
      await page.addInitScript(() => {
        const asks: any[] = (window as any).__asks = [];
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c: any) => { asks.push(c); return orig(c); };
      });
      const proj = { name: "T", canvas: { width: 1920, height: 1080 }, treatment: { filmGrammar: "speaker" }, scenes: [],
        storyboard: { scenes: [{ label: "Hook", duration_seconds: 3, voiceover_text: "One." }, { label: "Two", duration_seconds: 3, voiceover_text: "Two." }] } };
      const voices: Array<{ url: string; bytes: number }> = [];
      let takes = 0;
      const http = await import("node:http");
      const server = http.createServer((req, res) => {
        const u = req.url || "";
        const chunks: Buffer[] = []; req.on("data", (c) => { chunks.push(c); });
        req.on("end", () => {
          if (u.startsWith("/api/projects/")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(proj)); return; }
          if (u.startsWith("/api/voice-line/")) { voices.push({ url: u, bytes: Buffer.concat(chunks).length }); res.writeHead(200, { "content-type": "application/json" }); res.end("{\"ok\":true}"); return; }
          if (u.startsWith("/api/take/") || u.startsWith("/api/upload-asset/")) { takes++; res.writeHead(500); res.end(); return; }
          res.writeHead(200, { "content-type": "text/html" }); res.end(getTakeHtml());
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      closers.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as any).port;
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x&scene=0`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      // The same take screen, one switch: the prompter stays, the camera goes.
      expect(await page.isVisible("#bgChoice")).toBe(true);
      await page.check("#voiceOnly");
      expect(await page.textContent("#recordBtn")).toBe("Record my voice");
      expect(await page.isVisible("#bgChoice")).toBe(false);                  // a camera's choices go
      await page.click("#recordBtn");
      await page.waitForSelector("#stopBtn", { state: "visible", timeout: 8000 });   // no light check: straight to the count-in
      await page.waitForTimeout(4500);
      await page.click("#stopBtn");
      await page.waitForSelector("#useBtn", { state: "visible", timeout: 8000 });
      expect(await page.textContent("#reviewMeta")).toContain("voice only");
      await page.click("#useBtn");
      await page.waitForSelector("#done.on", { timeout: 10000 });
      expect(voices).toHaveLength(1);
      expect(voices[0].url).toMatch(/^\/api\/voice-line\/t\/p\?scene=0&name=voice\.(webm|m4a)&token=x$/);
      expect(voices[0].bytes).toBeGreaterThan(1024);
      expect(takes).toBe(0);
      const asks = await page.evaluate(() => (window as any).__asks);
      expect(asks.length).toBe(1);
      expect(asks[0].video).toBeUndefined();
      expect(await page.textContent("#doneNote")).toContain("Your voice is in");
      // A whole-board link offers no Voice only (a voice is one scene's).
      await page.goto(`http://127.0.0.1:${port}/take?tenant=t&project=p&token=x&scene=all`);
      await page.waitForFunction(() => !(document.getElementById("recordBtn") as HTMLButtonElement).disabled, null, { timeout: 10000 });
      expect(await page.isVisible("#voiceRow")).toBe(false);
      expect(await page.textContent("#recordBtn")).toBe("Record");
      expect(errors).toEqual([]);
    } finally { await browser.close(); for (const c of closers) await c(); }
  }, 90000);
});
