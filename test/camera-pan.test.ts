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

  it("pan resolves at fire time: adopts current scale with a 1.4 floor", () => {
    const js = scriptFor(pan);
    // fire-time read of the rig's actual scale...
    expect(js).toContain("gsap.getProperty(rig.el, 'scaleX')");
    // ...unset scale adopts it, never below 1.4 on a wide camera
    expect(js).toContain("m.scale || (cs > 1.05 ? cs : 1.4)");
  });

  it("pan return restores the PRE-PAN framing, not wide", () => {
    const js = scriptFor(pan);
    expect(js).toContain("pPrior ? pPrior.scale : 1");
    expect(js).toContain("pPrior ? pPrior.x : 0");
  });

  it("the old build-time pan floor is gone (pan never reaches the generic branch)", () => {
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

  it("a saved drag-pan carries NO scale (auto-adopt at fire time)", () => {
    // the drag's onUp builds the move without a scale key
    const m = /var mvU = \{ at: atU, type: 'pan',[^}]*\}/.exec(html);
    expect(m).toBeTruthy();
    expect(m![0]).not.toContain("scale");
  });

  it("overlapping effect blocks split the bar height (parallel bars)", () => {
    expect(html).toContain("placeSegs");
    expect(html).toContain("fx-thin");
    // row assignment exists: concurrent blocks get 1/n of the 26px bed
    expect(html).toContain("26 / s.rows");
  });
});
