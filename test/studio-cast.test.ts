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
    expect(html).toContain("if ((castUi.motion || '').trim()) body.motion = castUi.motion.trim();");
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
    expect(html).toContain("castAddActor({ name: name, image: rel, consent: true }, name)");
    expect(html).toContain("api('POST', '/heygen-avatars/' + castT(), { avatar_id: castUi.newBase, prompt: prompt");
  });
});
