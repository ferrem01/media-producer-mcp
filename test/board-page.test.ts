import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getBoardHtml } from "../src/board-page.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFile(path.join(here, rel), "utf8");

describe("the board page (SPEC-take-flow.md, phase 3)", () => {
  const html = getBoardHtml();
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
    expect(js).toMatch(/x\.evidence === j/);                            // the need is found by its evidence index
    expect(js).toMatch(/'The proof this claim wants'/);
    expect(js).toMatch(/\/evidence\/' \+ encodeURIComponent\(tenant\)/); // a provided file fills the need
    expect(js).toMatch(/scene_index: i, evidence_index: j/);
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

  it("is sized for a thumb and links back to the desktop Studio", () => {
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(js).toMatch(/link\('\/studio', '&desktop=1'\)/);
  });

  it("is where the Studio link lands on a phone", async () => {
    const src = await read("../src/index.ts");
    expect(src).toMatch(/urlPath === "\/board"/);
    expect(src).toMatch(/getBoardHtml\(\)/);
    expect(src).toMatch(/iPhone\|iPad\|iPod\|Android\.\*Mobile\|Mobile Safari/);
    expect(src).toMatch(/Location: "\/board" \+ q/);
    expect(src).toMatch(/desktop=1/);
  });
});
