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
    expect(js).toMatch(/items\.push\(\{ text: PAUSE_GLYPH, words: 0, gap: PAUSE_S \}\)/);
    expect(html).toMatch(/\.beat \{[^}]*white-space:pre-line/);
  });

  it("records the front camera in portrait with the recorder extension's audio constraints", () => {
    expect(html).toMatch(/facingMode: 'user'/);
    expect(html).toMatch(/width: \{ ideal: 1080 \}, height: \{ ideal: 1920 \}/);
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

  it("paces the prompter from the board's own durations, splitting a long beat by word share", () => {
    expect(html).toMatch(/voiceover_text/);
    expect(html).toMatch(/duration_seconds/);
    expect(html).toMatch(/WORDS_PER_SEC = 2\.4/);
    expect(html).toMatch(/speech \* \(it\.words \/ words\) \+ it\.gap/);
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
    expect(src).toMatch(/\|traces\|take\|take-poster\|storyboard\|provide-asset\)\\\/\(\[\^\/\]\+\)\//);
  });

  it("refuses a take URL outside the project's own asset dir", async () => {
    const src = await read("../src/index.ts");
    const at = src.indexOf("const takeMatch = urlPath.match");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 8000);
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
  });
});
