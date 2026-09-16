import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPhoneStudioHtml } from "../src/studio-phone.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFile(path.join(here, rel), "utf8");

describe("Studio on a phone (SPEC-take-flow.md, phase 3)", () => {
  const html = getPhoneStudioHtml();
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

  it("parses as JavaScript and carries no template-literal hazards", () => {
    expect(() => new Function(js)).not.toThrow();
    expect(js).not.toMatch(/`/);
    expect(js).not.toMatch(/\$\{/);
  });

  it("is one card per storyboard scene: script, still, the take need, Record and Upload", () => {
    expect(js).toMatch(/storyboard_card_scene_' \+ \(i \+ 1\) \+ '\.png/);
    expect(js).toMatch(/x\.type === 'camera_video'/);          // the need
    expect(js).toMatch(/'Needs a take'/);
    expect(js).toMatch(/link\('\/take', '&scene=' \+ i\)/);      // Record opens the booth for THAT scene
    expect(js).toMatch(/\/upload-asset\//);                      // Upload = the same push path as the booth
    expect(js).toMatch(/scene_index: i, capture: 'upload'/);
  });

  it("lists the proof each claim asked for, with Upload per piece (SPEC-creator-cut.md)", () => {
    expect(js).toMatch(/g === 'speaker' \|\| g === 'creator-cut'/);   // the booth serves both person grammars
    expect(js).toMatch(/x\.type !== 'camera_video'/);                   // every non-take need on the scene is proof
    expect(js).toMatch(/'The proof this claim wants'/);
    expect(js).toMatch(/\/provide-asset\/' \+ encodeURIComponent\(tenant\)/); // a provided file fills the need
    expect(js).toMatch(/scene_index: i, asset_index: j/);
    // Proof never blocks the build: the hint says so instead.
    expect(js).toMatch(/the build runs without/);
  });

  it("offers Record all when more than one scene has lines, and the booth attaches it as 'all'", async () => {
    expect(js).toMatch(/link\('\/take', '&scene=all'\)/);
    const take = await read("../src/take-page.ts");
    expect(take).toMatch(/qp\.get\('scene'\) === 'all'/);
    expect(take).toMatch(/scene_index: recordAll \? 'all'/);
  });

  it("lets the reader edit a scene's lines in place and flags a take the lines have moved past", () => {
    expect(js).toMatch(/api\('PATCH', '\/storyboard\/' \+ encodeURIComponent\(tenant\) \+ '\/' \+ encodeURIComponent\(project\) \+ '\/scenes\/' \+ i, \{ voiceover_text: ta\.value \}\)/);
    expect(js).toMatch(/'Edit the lines'/);
    expect(js).toMatch(/take\.lines\.trim\(\) !== script/);
    // Pause notation is shown the way the prompter shows it, and the script keeps its lines.
    expect(js).toMatch(/PAUSE_LINE = \/\^\\\(\\s\*pause\\s\*\\\)\[\.,!\?\]\*\$\/i/);
    expect(html).toMatch(/\.script \{[^}]*white-space:pre-line/);
  });

  it("the desktop Studio edits the same lines: the draft view before a build, the storyboard editor after", async () => {
    const app = await read("../src/preview-app/preview-app.ts");
    expect(app).toMatch(/id="dv-vo-text"/);                                           // editable before anything is built
    expect(app).toMatch(/api\('PATCH', '\/storyboard\/' \+ encodeURIComponent\(state\.tenantId\)[^\n]*'\/scenes\/' \+ draftSel, \{ voiceover_text: voText\.value \}\)/);
    expect(app).toMatch(/id="sm-script"/);                                            // the after-build editor
    const server = await read("../src/index.ts");
    // Both routes follow through the same way: need re-pointed, anchors re-resolved, take flagged.
    expect(server.match(/await afterLinesEdit\(project, idx\)/g)?.length).toBe(2);
    expect(server.match(/script_changed_since_take: linesMovedPastTake\(project, idx\)/g)?.length).toBe(2);
  });

  it("builds only once every need is filled, renders once built, and polls the job", () => {
    expect(js).toMatch(/build\.disabled = open\.length > 0/);
    expect(js).toMatch(/rend\.disabled = !built/);
    expect(js).toMatch(/\/generate-scenes\//);
    expect(js).toMatch(/\/render\//);
    expect(js).toMatch(/'\/job\/' \+ encodeURIComponent\(tenant\)/);
  });

  it("reads the tenant from the token when the link has none, like the desktop Studio (measured: 'Missing ?tenant=' on the phone)", () => {
    expect(html).toMatch(/if \(!tenant && token\) \{\s*try \{\s*var seg = token\.split\('\.'\)\[1\] \|\| '';/);
    expect(html).toMatch(/tenant = String\(pay\.tenant_id \|\| pay\.tenant \|\| ''\);/);
    expect(html).toMatch(/Missing \?project= in the link\./);
  });

  it("is sized for a thumb and links back to the desktop Studio", () => {
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(js).toMatch(/link\('\/studio', '&desktop=1'\)/);
  });

  it("IS the Studio link on a phone: served at /studio, no separate page (Marc: one Studio)", async () => {
    const src = await read("../src/index.ts");
    expect(src).toMatch(/iPhone\|iPad\|iPod\|Android\.\*Mobile\|Mobile Safari/);
    expect(src).toMatch(/res\.end\(getPhoneStudioHtml\(\)\)/);
    expect(src).toMatch(/desktop=1/);
    // The old address goes to Studio; nothing is served as "the board".
    expect(src).toMatch(/Location: "\/studio" \+ q/);
    expect(src).not.toMatch(/getBoardHtml/);
    expect(html).toMatch(/<title>Studio<\/title>/);
    expect(html).not.toMatch(/<title>Board/);
  });

  it("says what the film still needs from you before a single card; the desktop Studio puts each scene's needs in its own card", async () => {
    expect(js).toMatch(/'Needed from you'/);
    expect(js).toMatch(/' to go'/);
    const desktop = await read("../src/preview-app/preview-app.ts");
    // In the scene's card (draft view) and the storyboard editor -- not a nav section (Marc).
    expect(desktop).toMatch(/function sceneNeedsHtml\(project, si\)/);
    expect(desktop).toMatch(/h \+= sceneNeedsHtml\(project, draftSel\);/);
    expect(desktop).toMatch(/return si >= 0 \? sceneNeedsHtml\(p, si\) : '';/);
    expect(desktop).not.toMatch(/id="needs-panel"/);
    expect(desktop).not.toMatch(/renderNeedsPanel/);
    // Same routes as the phone: the take, and provide-asset for proof.
    expect(desktop).toMatch(/'\/provide-asset\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(desktop).toMatch(/'\/take\/' \+ encodeURIComponent\(state\.tenantId\)/);
  });
});
