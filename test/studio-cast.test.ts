import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// THE CAST CARD (Studio): who performs the person in a speaker film -- you,
// your recording recast as an actor through a vendor, or a take generated
// from the script. The card talks to the cast, recast and generated-take
// routes; these pin that wiring (the page script itself is parsed by
// studio-page.test.ts).

describe("Studio: the Cast card", () => {
  const html = getPreviewHtml();

  it("a Cast button in the header, shown on built films a person carries, locked while rendering", () => {
    expect(html).toContain('id="cast-btn"');
    expect(html).toContain("castBtnEl.style.display = (project.scenes || []).length && castIsPersonFilm(project) ? '' : 'none';");
    expect(html).toContain("body.mp-rendering #cast-btn");
    expect(html).toContain("openCastCard(state.currentProject)");
  });

  it("loads the cast, the vendors, who plays now and the voices; recasts, generates, and puts you back", () => {
    expect(html).toContain("api('/cast/' + castT())");
    expect(html).toContain("api('/cast/' + castT() + '/voices')");
    expect(html).toContain("api('POST', '/recast/' + castT() + '/' + castP(), { actor: a.id, performer: p.id, voice_id: voiceId, motion: (castUi.motion || '').trim() || undefined })");
    // A direction for HeyGen's invented movement.
    expect(html).toContain('id="cast-motion"');
    expect(html).toContain("body.motion = (castUi.motion || '').trim();");
    expect(html).toContain("api('POST', '/recast/' + castT() + '/' + castP(), { actor: null })");
    expect(html).toContain("'/generated-take/' + encodeURIComponent(t) + '/' + encodeURIComponent(pid)");
    // A generated take replaces the film's take: a copy first, by default.
    expect(html).toContain("copy: true");
    expect(html).toContain("'/duplicate'");
  });

  it("vendors a mode cannot use are shown but disabled, with why", () => {
    expect(html).toContain("copies a recording, so it cannot perform a script");
    expect(html).toContain("not set up on this server");
  });

  it("adds actors from HeyGen looks, stock presenters, a photo (with consent) or a new look from a prompt", () => {
    expect(html).toContain("'/heygen-avatars/' + castT() + '?looks=1'");
    expect(html).toContain("'?public=1'");
    expect(html).toContain("This is me, or a person who agreed to be cast.");
    // A photo is vouched for: you / a person who agreed, or a generated person
    // (fictional) whose model sheet can ride along (Marc's AI cast brief).
    expect(html).toContain("if (isFictional) body.fictional = true; else body.consent = true;");
    expect(html).toContain("A generated person (nobody real): the photo is its start frame.");
    expect(html).toContain("if (sheetRel) body.sheet = sheetRel;");
    expect(html).toContain("a.fictional ? ' · generated' : ''");
    expect(html).toContain("api('POST', '/heygen-avatars/' + castT(), { avatar_id: castUi.newBase, prompt: prompt");
  });
});

describe("Studio cast: scene by scene (core/scene-performance.ts)", () => {
  it("each scene can be the recording, a recast of it, or the actor performing it with no recording -- frame, draft, final, b-roll", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
    expect(src).toContain(`data-cast-mode="scenes">Scene by scene</button>`);
    expect(src).toContain("api('/scene-performance/' + castT() + '/' + castP())");
    expect(src).toContain("{ actor: rcA.id, performer: rcP.id, scenes: [Number(v)] }");
    expect(src).toContain("{ action: 'recording' }");
    expect(src).toContain("{ action: 'frame', actor: spActor, shot: spShot(v) || undefined, frame_prompt: spPrompt('f', v) }");
    expect(src).toContain("quality: fin ? 'final' : 'draft'");
    expect(src).toContain("{ action: 'clip', actor: spActor, shot: cs.value.trim(), seconds: sec ? Number(sec.value) : 5 }");
    // The poll keeps going while a scene works, and never redraws the box being typed in.
    expect(src).toContain("if (castRunning()) { if (!castTyping()) castRender(); castPoll(); return; }");
    // Any prompt for any scene: both boxes prefilled, a cleared box goes back to the default.
    expect(src).toContain("frame_prompt: spPrompt('f', v), video_prompt: spPrompt('v', v)");
    expect(src).toContain("return !t || t === dv.trim() ? '' : t;");
    // Linking scenes: start from the scene before's last frame.
    expect(src).toContain("{ action: 'continue', actor: spActor, from_scene: Number(v) - 1, shot: spShot(v) || undefined }");
    // The sound of a performed scene: the exact voice file, or the model's read.
    expect(src).toContain("spPost(m[1], { action: 'revoice', voice_track: t.value }");
    // The pitch check stopped a scene: say why, and offer to make it anyway.
    expect(src).toContain("data-sp-force=");
    expect(src).toContain("force: true }, 'Making the draft anyway…')");
    // Delivery, and the voice heard alone before Seedance.
    expect(src).toContain("{ action: 'voice', actor: spActor, voice_source: (castUi.spVoice || {})[hv] || undefined, delivery: delBox ? delBox.value : undefined }");
    // The room reference rides with the perform call.
    expect(src).toContain("room_url: rBox ? rBox.value : undefined }");
    // Regexes inside the page template are written with doubled backslashes.
    expect(src).toContain("/^sp-shot-(\\\\d+)$/");
  });

  it("locations: a library of clean plates in Scene by scene, and each scene's location picked from it", () => {
    const html = getPreviewHtml();
    expect(html).toContain("api('/locations/' + castT())");
    expect(html).toContain("api('POST', '/locations/' + castT(), body)");
    expect(html).toContain("api('DELETE', '/locations/' + castT() + '/' + encodeURIComponent(v))");
    expect(html).toContain("'/api/locations/' + castT() + '/' + encodeURIComponent(l.id) + '/image'");
    expect(html).toContain("if (lf && lf.value) { body.image = lf.value; if (lk && lk.checked) body.clean = false; }");
    expect(html).toContain("spPost(m[1], { action: 'location', location: t.value }");
    // The raw room reference only shows when the scene has no location.
    expect(html).toContain("if (roomOpts.length && !perf.location) {");
  });
});
