import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// THE CAST CARD (Studio): who performs the person in a speaker film -- you,
// your recording recast as an actor through a vendor, or a take generated
// from the script. The card talks to the cast, recast and generated-take
// routes; these pin that wiring (the page script itself is parsed by
// studio-page.test.ts).

describe("Studio: the Cast card", () => {
  const html = getPreviewHtml();

  it("no Cast button: who performs a scene is chosen in its take and on the storyboard; the film's plan sits under the scene list", () => {
    expect(html).not.toContain('id="cast-btn"');
    // Nothing about performers in the scene list (Marc: "you don't need to show this in the nav").
    expect(html).not.toContain('pf-film-bar');
    expect(html).not.toContain('scene-who');
    // The take dialog: me, or a cast member -- opened on the source the plan says.
    // Six sources in one row, no group labels (Marc: "this whole a cast member thing ... unnecessary").
    expect(html).not.toContain('<span class="np-group">A cast member</span>');
    expect(html).toContain('data-np-src="recast"');
    expect(html).toContain('data-np-src="generate"');
    expect(html).toContain("npOpenPanel(project, cardC, pfStart, si, ai);");
    // The board's need row offers the same two sources (not on a cameo clip).
    expect(html).toContain("camera_video: ['booth', 'phone', 'room', 'upload', 'recast', 'generate']");
    expect(html).toContain("if ((src === 'recast' || src === 'generate') && a.use === 'clip') return;");
    expect(html).toContain("if (src === 'recast' || src === 'generate') { perfPanel(project, panel, src, si); return; }");
    // Every choice in the panel is the scene's plan.
    expect(html).toContain("{ action: 'plan', scenes: [{ index: si, performer: perfm }] }");
    expect(html).toContain("api('POST', '/recast/' + pfT() + '/' + pfP(project), { actor: actor, performer: eng, scenes: [si] })");
    // The slot says who and whether their voice is ready.
    expect(html).toContain("nb.textContent = slotLbl || 'take needed';");
  });

});

describe("Studio cast: scene by scene (core/scene-performance.ts)", () => {
  it("the generate panel: who first (grouped), the engine follows from who, no first-frame row, a progress screen while it is made, extra shots in plain words", () => {
    const html = getPreviewHtml();
    expect(html).toContain("['Generated people', function(a) { return !a.heygen_look_id && a.fictional; }], ['HeyGen looks'");
    expect(html).toContain("function pfGenEngine(a) { return a && a.heygen_look_id ? 'heygen' : 'seedance'; }");
    expect(html).not.toContain('<label>First frame</label>');
    expect(html).toContain("if (run) { panel.innerHTML = pfStatusHtml(project, si, s, perf); return; }");
    expect(html).toContain("'Seedance makes the 480p draft'");
    expect(html).toContain('<video class="pf-video" controls playsinline');
    expect(html).toContain("Extra shots over this scene (");
    expect(html).not.toContain("Cutaways over this scene");
  });

  it("the take popover has one way out to a new take: Replace this take, opening the take dialog on what made it", () => {
    const html = getPreviewHtml();
    expect(html).toContain('id="tk-replace" style="flex:1;">Replace this take&#8230;</button>');
    expect(html).toContain("camPopClose(); openTakeDialog(p, si, tk);");
    expect(html).toContain("var start = tk && tk.performed_by ? 'generate' : cast ? 'recast' : 'booth';");
    expect(html).toContain("var pfStart = (opts && opts.start) || pfDefaultSource(project, si);");
  });
});
