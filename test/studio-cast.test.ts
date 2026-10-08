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
    // The recast sends the very picture that was drawn and looked at, with its words.
    expect(html).toContain("api('POST', '/recast/' + pfT() + '/' + pfP(project), { actor: actor, performer: eng, scenes: [si], voice_id: d.rvoice === 'actor' ? 'actor' : 'mine', shot: inShot ? String(perf.shot || '') : '', start_frame: inShot ? perf.frame : undefined })");
    expect(html).toContain("var inShot = pfPerformer(eng).takesShot && !d.rcamera && perf.actor === actor && perf.frame;");
    // THE WIZARD (Marc, Oct 7): steps that apply to this actor and vendor only.
    expect(html).toContain("function pfWizSteps(kind, a, eng) {");
    expect(html).toContain("if (a && pfRecastEngines(a).length > 1) st.push(['with', 'With']);");   // a HeyGen look has one vendor: no With step
    expect(html).toContain("if (pfPerformer(eng).takesShot) st.push(['shot', 'The shot']);");      // only a vendor that takes a shot
    expect(html).toContain("if (a && a.voice_id) st.push(['voice', 'Voice']);");                   // no voice of their own: nothing to choose
    expect(html).toContain("if (!a || pfGenEngine(a) === 'seedance') st.push(['shot', 'The shot']);");  // generate: HeyGen's look is the shot
    // Faces, not names: the cast as headshots, and the one picked shown big.
    expect(html).toContain('class="pf-castpic');
    expect(html).toContain("return withToken('/api/cast/' + pfT() + '/' + encodeURIComponent(a.id) + '/portrait');");
    expect(html).toContain('<div class="pf-picked">');
    // The shot is drawn and seen (cents) before the vendor is paid: Next waits for it.
    expect(html).toContain("var SKEY = kind === 'recast' ? 'rshot' : 'shot';");
    expect(html).toContain("'Draw the shot first, so you see it before '");
    expect(html).toContain("'The shot was changed: draw it again to see it.'");
    expect(html).toContain("'The place was changed: draw it again to see it.'");
    // The shot step (Marc, Oct 7): WHERE as places you can see -- your locations, the
    // nine stock ones, or one you describe (with examples) -- then HOW FAR BACK, then the actor drawn there.
    expect(html).toContain('<div class="pf-sub">1 &#183; Where</div>');
    expect(html).toContain("'/stock-' + encodeURIComponent(st.id) + '/image'");
    expect(html).toContain("api('POST', '/locations/' + pfT(), { stock: t.getAttribute('data-pf-stock') })");
    expect(html).toContain("api('POST', '/locations/' + pfT(), { name: pname, prompt: pp, shape: tall ? 'tall' : 'wide' })");
    expect(html).toContain("var PF_PLACE_EXAMPLES = [");
    // A real room photo comes first (Marc, Oct 8): uploaded, then kept as it is.
    expect(html.indexOf('data-pf-go="roomphoto"')).toBeLessThan(html.indexOf('data-pf-place=""><span>No set place'));
    expect(html).toContain("api('POST', '/locations/' + pfT(), { name: rname, image: up.url, clean: false })");
    expect(html).toContain("var PF_FRAMINGS = [");
    expect(html).toContain("{ action: 'frame', actor: actor, shot: rs, location: pfWhere(d, s.plan || {}, perf) }");
    // Recast and Generate keep their own place in the wizard.
    expect(html).toContain("var SK = kind === 'recast' ? 'rstep' : 'gstep';");
    // One size for every step in the take dialog; Recast closes it and the job pill takes over.
    expect(html).toContain("#studio-modal-card .pf-wizbox { display: flex; flex-direction: column; height: min(66vh, 720px); }");
    expect(html).toContain("if (x && panel.closest && panel.closest('#studio-modal-card')) x.click();\n          watchTakeStatus();");
    // A failed recast is an error on the pill, never "Done".
    expect(html).toContain("if (rf && !jobs.length) errors = errors.concat([{ kind: 'recast', raw: 'recast', at: rf.at, message: rf.error, actor: rf.actor }]);");
    // The recast asks for the voice: the recording's by default, the actor's when they have one.
    expect(html).toContain('data-pf="rvoice" value="mine"');
    expect(html).toContain('data-pf="rvoice" value="actor"');
    // The slot says who and whether their voice is ready.
    expect(html).toContain("nb.textContent = slotLbl || 'take needed';");
  });

});

describe("Studio cast: scene by scene (core/scene-performance.ts)", () => {
  it("the generate panel: who first (grouped), the engine follows from who, no first-frame row, a progress screen while it is made, extra shots in plain words", () => {
    const html = getPreviewHtml();
    expect(html).toContain("['Generated people', function(x) { return !x.heygen_look_id && x.fictional; }], ['HeyGen looks'");
    expect(html).toContain("function pfGenEngine(a) { return a && a.heygen_look_id ? 'heygen' : 'seedance'; }");
    expect(html).not.toContain('<label>First frame</label>');
    expect(html).toContain("if (run) { panel.innerHTML = pfStatusHtml(project, si, s, perf); return; }");
    expect(html).toContain("'Seedance makes the 480p draft'");
    expect(html).toContain('<video class="pf-video" controls playsinline');
    expect(html).toContain("Extra shots over this scene (");
    expect(html).not.toContain("Cutaways over this scene");
  });

  it("pace on all scenes: Play waits, the edits run quietly, ONE reload at the start -- a reload mid-playback froze the preview", () => {
    const html = getPreviewHtml();
    // Any reload after a take edit stops playback first.
    expect(html).toMatch(/function afterSpeakerEdit\(r, seekTo\) \{[\s\S]{0,400}if \(state\.playing\) stopPlayback\(\);/);
    expect(html).toContain("if (quiet) { state.currentProject = r.project; return r; }");
    expect(html).toContain("els.playBtn.disabled = true;");
    expect(html).toContain("afterSpeakerEdit(last, all ? 0 : Math.max(0, sceneStartFor(si) - 0.5));");
  });

  it("the take popover has one way out to a new take: Replace this take, opening the take dialog on what made it", () => {
    const html = getPreviewHtml();
    expect(html).toContain('id="tk-replace" style="flex:1;">Replace this take&#8230;</button>');
    expect(html).toContain("camPopClose(); openTakeDialog(p, si, tk);");
    expect(html).toContain("var start = tk && tk.performed_by ? 'generate' : cast ? 'recast' : 'booth';");
    expect(html).toContain("var pfStart = (opts && opts.start) || pfDefaultSource(project, si);");
  });

  it("the voice picker: who the actor speaks as, your voices (hear this line, use for the actor) and the Voice Library (sample, add & use)", () => {
    const html = getPreviewHtml();
    expect(html).toContain("<label>Speaks as</label>");
    expect(html).toContain("data-pf-vtab=\"lib\">Voice Library</button>");
    expect(html).toContain("{ action: 'voice', actor: actor, voice_id: vid, delivery: d.delivery != null ? d.delivery : undefined }");
    expect(html).toContain("api('PATCH', '/cast/' + pfT() + '/' + encodeURIComponent(actor), { voice_id: id, voice_name: name })");
    expect(html).toContain("api('POST', '/cast/' + pfT() + '/voices', { owner: va[0], id: va[1], name: va[2] })");
    expect(html).toContain("'?library=1&gender='");
  });
});
