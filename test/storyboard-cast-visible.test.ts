import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// A saved storyboard could not say what the film was built from.
//
// `storyboardToSaved` hardcoded `template: ""` and dropped `scene_template`
// entirely. That is worse than a missing field, because casting a template
// ALSO empties the scene's `components` -- so a fully templated scene and a
// scene that got nothing at all serialized to the identical shape:
//
//     { template: "", components: [] }
//
// Every reader inherited the blindness. Studio's draft view already had a
// branch for `s.scene_template` that had never once executed (and would have
// printed "[object Object]" if it had). The rebuild prompt emitted a blank
// "Template: " line on every scene. And measuring "how much of this film is
// templated" off a storyboard response counted every template as a codegen
// fallback -- which is exactly the wrong-way-round conclusion it produced.
//
// These are source-level assertions on the seam itself. The behaviour they
// protect is invisible by construction: nothing downstream errors when the
// cast goes missing, it just quietly reads as "codegen".

describe("a saved storyboard says what it was cast as", () => {
  it("carries scene_template through storyboardToSaved", async () => {
    const src = await read("../src/llm/pipeline.ts");
    const at = src.indexOf("function storyboardToSaved");
    expect(at, "storyboardToSaved not found").toBeGreaterThan(0);
    const body = src.slice(at, at + 1600);
    expect(body, "the cast must survive the save").toMatch(/scene_template:\s*s\.scene_template/);
  });

  it("declares scene_template on StoryboardScene", async () => {
    const types = await read("../src/core/types.ts");
    const at = types.indexOf("export interface StoryboardScene");
    expect(at).toBeGreaterThan(0);
    const body = types.slice(at, types.indexOf("\n}", at));
    expect(body).toMatch(/scene_template\?:\s*\{\s*type:\s*string;\s*data:\s*Record<string,\s*unknown>\s*\}/);
  });

  it("names the cast in the rebuild prompt instead of the dead legacy field", async () => {
    // buildPromptFromStoryboard re-serializes an APPROVED storyboard into the
    // prompt that rebuilds it. It emitted `Template: ${s.template}` -- always
    // blank -- so the rebuild re-decided every scene's composition from prose.
    const src = await read("../src/server.ts");
    const at = src.indexOf("function buildPromptFromStoryboard");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 2000);
    expect(body, "the blank legacy line must be gone").not.toMatch(/Template: \$\{s\.template\}/);
    expect(body).toMatch(/s\.scene_template\?\.type/);
    expect(body, "the rebuild needs the slot data too, not just the type")
      .toMatch(/JSON\.stringify\(s\.scene_template\.data/);
  });

  it("renders the template chip from .type, not the object", async () => {
    const app = await read("../src/preview-app/preview-app.ts");
    const at = app.indexOf("function renderDraftView");
    expect(at).toBeGreaterThan(0);
    const body = app.slice(at, at + 3000);
    expect(body).toMatch(/s\.scene_template && s\.scene_template\.type/);
  });

  it("leaves `template` in place as the dead slot it is, clearly marked", async () => {
    // Still written (as "") and still read by an older update path, so it is
    // not safe to delete here -- but nothing should reach for it as the cast.
    const types = await read("../src/core/types.ts");
    const at = types.indexOf("export interface StoryboardScene");
    const body = types.slice(at, types.indexOf("\n}", at));
    expect(body).toMatch(/DEAD legacy slot/);
    expect(body).toMatch(/Use scene_template/);
  });
});
