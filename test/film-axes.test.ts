import { describe, it, expect } from "vitest";
import { pinFilmAxes } from "../src/core/film-axes.js";
import { CLIP_NEED_DESCRIPTION, TAKE_NEED_DESCRIPTION } from "../src/core/take-needs.js";

// A board written by hand (create + update) had no way to say a person
// carries it, so the booth and the take tool treated every take as a clip
// (Marc, Oct 12: no Voice only on The First Five Minutes). pinFilmAxes sets
// the grammar -- or the recipe, which implies it -- and the needs follow.

const board = () => ({
  project_id: "p", tenant_id: "t", name: "T", format: "video", status: "storyboard", canvas: { width: 1080, height: 1920 }, scenes: [],
  storyboard: { scenes: [
    { label: "Hook", voiceover_text: "Someone just filled out your demo form.", assets: [
      { type: "camera_video", use: "clip", description: CLIP_NEED_DESCRIPTION, status: "needed", priority: "critical" },
    ], components: [{ type: "asset-placeholder", data: { need: CLIP_NEED_DESCRIPTION, text: CLIP_NEED_DESCRIPTION, asset_type: "Live-action clip needed" }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } }] },
    { label: "Two", voiceover_text: "For most teams? Nothing.", assets: [] },
  ] },
}) as any;

describe("pinFilmAxes", () => {
  it("a speaker grammar swaps the take tool's clip needs for one speaker take per spoken scene", () => {
    const p = board();
    expect(pinFilmAxes(p, { film_grammar: "speaker" })).toBeNull();
    expect(p.treatment.filmGrammar).toBe("speaker");
    for (const s of p.storyboard.scenes) {
      expect(s.assets.filter((a: any) => a.use === "clip")).toEqual([]);
      expect(s.assets.filter((a: any) => a.type === "camera_video" && a.description === TAKE_NEED_DESCRIPTION)).toHaveLength(1);
    }
    expect(p.storyboard.scenes[0].components).toEqual([]);   // the clip's slate left with it
  });

  it("a recipe sets its own grammar, and the two must agree", () => {
    const p = board();
    expect(pinFilmAxes(p, { recipe: "presenter-n-things" })).toBeNull();
    expect(p.treatment).toMatchObject({ filmGrammar: "creator-cut", recipe: "presenter-n-things" });
    expect(pinFilmAxes(board(), { film_grammar: "speaker", recipe: "presenter-n-things" })).toMatch(/belongs to the creator-cut grammar/);
    expect(pinFilmAxes(board(), { recipe: "no-such-recipe" })).toMatch(/Unknown recipe/);
  });

  it("a clip that already landed is kept", () => {
    const p = board();
    p.storyboard.scenes[0].assets[0].status = "provided";
    pinFilmAxes(p, { film_grammar: "speaker" });
    expect(p.storyboard.scenes[0].assets.some((a: any) => a.use === "clip")).toBe(true);
  });

  it("a grammar no person carries makes a camera ask a clip", () => {
    const p = board();
    p.storyboard.scenes[1].assets.push({ type: "camera_video", description: "The CMO walking past", status: "needed" });
    pinFilmAxes(p, { film_grammar: "hype-cut" });
    expect(p.treatment.filmGrammar).toBe("hype-cut");
    expect(p.storyboard.scenes[1].assets[0].use).toBe("clip");
  });

  it("nothing to pin changes nothing", () => {
    const p = board();
    expect(pinFilmAxes(p, {})).toBeNull();
    expect(p.treatment).toBeUndefined();
  });
});
