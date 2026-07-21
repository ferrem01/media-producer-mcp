import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { cameraMovesScript } from "../src/core/scene-assembler.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// Pan is a PEER effect: independent of zoom at author time, composed at
// fire time. These tests pin the contract in the generated runtime script
// (the real behavioral check is a headless GSAP probe -- see AMENDMENTS).

const canvas = { width: 1920, height: 1080 };

function scriptFor(moves: any[]): string {
  return cameraMovesScript(moves as any, canvas, "document.body", "window.__MP_TIMELINE");
}

describe("peer-effect pan runtime", () => {
  const pan = [{ at: 2, type: "pan", x: 20, y: 30, duration: 0.8, hold: 1, return: true }];

  it("pan is pure translation resolved at fire time: reads the live scale, never tweens it", () => {
    const js = scriptFor(pan);
    // fire-time read of the rig's actual scale (used for math only)...
    expect(js).toContain("gsap.getProperty(rig.el, 'scaleX')");
    // ...and the pan tween animates x/y only -- no scale key, no floor
    const panBranch = js.slice(js.indexOf("PEER-EFFECT pan"), js.indexOf("var to;"));
    expect(panBranch).not.toContain("scale: function");
    expect(panBranch).not.toContain("1.4");
  });

  it("pan return restores the PRE-PAN position, not wide", () => {
    const js = scriptFor(pan);
    expect(js).toContain("pPrior ? pPrior.x : 0");
    expect(js).toContain("pPrior ? pPrior.y : 0");
  });

  it("the old build-time pan floor is gone everywhere", () => {
    const js = scriptFor(pan);
    expect(js).not.toContain("Math.max(st.scale, 1.4))");
  });

  it("generated camera script is valid JS", () => {
    const js = scriptFor([
      { at: 0.5, type: "zoom", scale: 2.5, duration: 0.5, hold: 6, return: true },
      ...pan,
    ]);
    expect(() => new vm.Script(js)).not.toThrow();
  });
});

describe("studio pan gesture + parallel lane", () => {
  const html = getPreviewHtml();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);

  it("studio page script is valid JS (template-literal guard)", () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new vm.Script(s)).not.toThrow();
  });

  it("pan is a drag gesture, not a click-to-place", () => {
    expect(html).toContain("panDragStart");
    expect(html).not.toContain("panToSelection");
    // both popovers (element + scene) offer it
    expect(html.match(/id="rv-pop-pan"/g)?.length).toBe(2);
  });

  it("pan-inside exists as zoom-inside's sibling", () => {
    expect(html).toContain("panInsideSelection");
    expect(html).toContain('id="rv-pop-pan-inside"');
    // the content rig is the inside target; the scene rig excludes it
    expect(html).toContain("__mp_camera_rig--content");
    expect(html).toContain(":not(.__mp_camera_rig--content)");
  });

  it("a saved drag-pan carries NO scale, and the editor never writes one onto a pan", () => {
    const m = /var mvU = \{ at: atU, type: 'pan',[^}]*\}/.exec(html);
    expect(m).toBeTruthy();
    expect(m![0]).not.toContain("scale");
    expect(html).toContain("if (next.type === 'pan') delete next.scale;");
  });

  it("a wide camera refuses the grab with an honest message", () => {
    expect(html).toContain("nothing to pan");
  });

  it("pan-inside over a scene zoom falls back to panning the scene camera", () => {
    // "pan what I see": a scene-zoomed picture is pannable even when the
    // footage inside the frame isn't magnified.
    expect(html).toContain("panning the scene camera instead");
  });

  it("a grab at a zoom block's start rides the zoom from the lane DATA", () => {
    // The DOM only shows the current instant; a zoom whose window covers
    // the playhead is pannable even before its ease-in has run. The saved
    // pan is nudged to start once the zoom settles.
    expect(html).toContain("zoomInForceAt");
    expect(html).toContain("afterZoom");
    expect(html).toContain("the pan starts once it settles");
  });

  it("the scale reader goes through gsap (matrix3d-proof)", () => {
    expect(html).toContain("g.getProperty(el, 'scaleX')");
  });

  it("overlapping effect blocks split the bar height (parallel bars)", () => {
    expect(html).toContain("placeSegs");
    expect(html).toContain("fx-thin");
    // row assignment exists: concurrent blocks get 1/n of the 26px bed
    expect(html).toContain("26 / s.rows");
  });
});
