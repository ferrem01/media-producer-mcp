import { describe, it, expect } from "vitest";

// SAME AS ANOTHER SCENE (Marc, Oct 7: "in scene two, I want it to look the
// same as scene one ... I want the same starting frame"): a scene can start
// from a picture this actor already has in another scene -- drawn for it, or
// the one its recast was performed in -- and its place and words come along.

describe("a start picture from another scene", () => {
  const project: any = {
    storyboard: { scenes: [
      { performance: { actor: "marc", frame: "/a/f1.jpg", frames: [{ url: "/a/f1.jpg", shot: "A medium shot", location: "studio" }] } },
      { performance: { actor: "kavya", frames: [{ url: "/a/k1.jpg", shot: "Seated" }] } },
      {},
    ] },
    takes: [{ scene_index: 1, actors: { marc: { file: "/a/t.mp4", shot: "At a table", start_frame: "/a/rs.jpg" } } }],
  };
  it("finds the picture, its actor, words and place", async () => {
    const { otherSceneFrame } = await import("../src/core/scene-performance.js");
    expect(otherSceneFrame(project, 2, "/a/f1.jpg", "marc")).toEqual({ actor: "marc", shot: "A medium shot", location: "studio", scene: 0 });
    expect(otherSceneFrame(project, 2, "/a/rs.jpg", "marc")).toEqual({ actor: "marc", shot: "At a table", scene: 1 });   // a recast's start picture
    expect(otherSceneFrame(project, 2, "/a/k1.jpg", "marc")).toBeNull();     // another actor's picture is not this actor's
    expect(otherSceneFrame(project, 0, "/a/f1.jpg", "marc")).toBeNull();     // not from the scene itself
    expect(otherSceneFrame(project, 2, "/a/none.jpg")).toBeNull();
  });
  it("Studio offers them in the shot step, with the last frame of the scene before", async () => {
    const { getPreviewHtml } = await import("../src/preview-app/preview-app.js");
    const html = getPreviewHtml();
    expect(html).toContain('<div class="pf-sub">Same as another scene</div>');
    expect(html).toContain("[op.actor === a.id ? op.frame : '', o.cast === a.id ? o.recast_start_frame : '']");
    expect(html).toContain("{ action: 'pick', url: t.getAttribute('data-pf-adopt'), actor: actor }");
    expect(html).toContain("'>Last frame of scene ' + si + '</button>'");
  });
});
