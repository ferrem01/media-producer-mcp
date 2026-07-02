/**
 * Glass-turn transition — the shared-element match cut (QUALITY-ROADMAP
 * Pillar 2).
 *
 * Standard transitions animate two frozen PNGs, so a cut between two
 * glass-slab scenes reads as: slab at rest → crossfade → hairline → turn.
 * Disconnected. This transition instead REUSES the glass-slab component
 * itself and seeks its deterministic timeline in reverse: the slab at rest
 * (scene A's exact end pose, screenshot A on its face) turns back through
 * edge-on — which is pixel-identical to scene B's opening frame, because it
 * IS the same component at t=0. One continuous object carries the viewer
 * across the cut; the content swap happens while the face is edge-on and
 * invisible.
 *
 * Zero duplicated glass code: geometry, materials, bloom, grade, and easing
 * all come from the component source, so the transition can never drift out
 * of sync with the scenes on either side of it.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { captureScene } from "./capture.js";
import { encodeScene } from "./encode.js";
import { parseComponent } from "./component-parser.js";
import { loadGsapSource, loadThreeSource } from "./scene-assembler.js";
import { localizeRemoteMedia } from "./remote-media.js";
import { config } from "../config.js";

export interface GlassTurnOptions {
  /** The glass-slab component's data from scene A (screenshot, glow, aspect) */
  glassData: Record<string, unknown>;
  /** Scene A's duration — the component timeline time of its final frame */
  sceneDurationA: number;
  /** Brand motion personality (affects the component's internal timing) */
  motion?: string;
  /** Transition duration in seconds */
  duration: number;
  width: number;
  height: number;
  fps: number;
  workDir: string;
  gsapDir: string;
  /** Full glass-slab .component.html source */
  componentSource: string;
}

/**
 * Render the glass-turn transition as an MP4 segment.
 * Throws on failure — the caller falls back to a standard transition.
 */
export async function renderGlassTurnTransition(opts: GlassTurnOptions): Promise<string> {
  const { duration, width, height, fps, workDir, gsapDir } = opts;
  await fs.mkdir(workDir, { recursive: true });

  const parsed = parseComponent(opts.componentSource);
  if (!parsed.script.includes("createTimeline")) {
    throw new Error("glass-turn: component source has no createTimeline");
  }

  const [gsapSource, threeSource] = await Promise.all([
    loadGsapSource(gsapDir),
    loadThreeSource(config.threeDir),
  ]);
  if (!threeSource) throw new Error("glass-turn: three.js bundle not found");

  // The component's own timeline is seeked in reverse by a wrapper master:
  // proxy.t runs from scene A's end time down to ~0 (edge-on start pose).
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
.mp-component { position: absolute; inset: 0; overflow: hidden; }
${parsed.style || ""}
</style>
<!-- three.js MUST be its own script tag: its "use strict" directive would
     otherwise make the concatenated GSAP block strict and kill it. -->
<script>
${threeSource}
</script>
<script>
${gsapSource}
</script>
</head>
<body>
<div class="mp-component">
${parsed.template}
</div>
<script>
(function() {
  var createTimeline = (function() {
    ${parsed.script}
    return createTimeline;
  })();

  var el = document.querySelector('.mp-component');
  var data = ${JSON.stringify(opts.glassData)};
  var ctx = {
    duration: ${opts.sceneDurationA},
    fps: ${fps},
    canvas: { width: ${width}, height: ${height} },
    motion: ${JSON.stringify(opts.motion || "cinematic")},
    getComponentTimeline: function() { return gsap.timeline(); }
  };
  var TRANS_DUR = ${duration};
  var DUR_A = ${opts.sceneDurationA};

  function boot() {
    var inner = null;

    // Texture-ready barrier: unlike a normal scene (face hidden through the
    // edge-on hold while the texture streams in), the face is fully visible
    // at frame 0 here. The component calls data.__onTexture once the
    // screenshot texture is applied. Before signaling readiness we force a
    // re-render of the rest pose: frame 0 seeks master.time(0), and a GSAP
    // tween's onUpdate does NOT fire at exactly its start position -- the
    // canvas keeps whatever was rendered last, so it must already be the
    // textured rest pose.
    var ready = function() {
      if (window.__MP_READY) return;
      try {
        if (inner) { inner.time(0.02); inner.time(DUR_A); }
      } catch (e) { /* render anyway */ }
      window.__MP_READY = true;
    };
    if (data.screenshot) {
      data.__onTexture = ready;
      setTimeout(ready, 8000); // never hang readiness on a broken asset
    }

    inner = createTimeline(el, data, ctx);
    inner.pause();

    // The turn lives in [holdDur, holdDur+rotDur] of the component timeline;
    // everything after is a slow push-in. Two-phase reverse mapping so the
    // turn-away fills the transition instead of the static push:
    //   phase 1 (25%): scene A's end pose -> just-settled pose (push returns)
    //   phase 2 (75%): the full turn back to edge-on
    var timing = inner.__gls || { holdDur: 0.6, rotDur: 2.7 };
    var settleT = Math.min(DUR_A, timing.holdDur + timing.rotDur + 0.15);
    var P1 = DUR_A > settleT + 0.05 ? 0.25 : 0;
    function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function innerTimeAt(p) {
      if (P1 > 0 && p < P1) return DUR_A + (settleT - DUR_A) * easeInOut(p / P1);
      var q = P1 > 0 ? (p - P1) / (1 - P1) : p;
      return settleT + (0.02 - settleT) * easeInOut(q);
    }

    var master = gsap.timeline({ paused: true });
    var proxy = { p: 0 };
    master.to(proxy, {
      p: 1,
      duration: TRANS_DUR,
      ease: 'none',
      onUpdate: function() { inner.time(Math.max(0.001, innerTimeAt(proxy.p))); }
    }, 0);
    inner.time(DUR_A);

    window.__MP_TIMELINE = master;
    window.__MP_DURATION = TRANS_DUR;
    if (!data.screenshot) window.__MP_READY = true;
  }

  boot();
})();
</script>
</body>
</html>`;

  // Download any remote media (the screenshot URL) so capture is hermetic.
  const localizedHtml = await localizeRemoteMedia(html, workDir);

  const htmlPath = path.join(workDir, "glass-turn.html");
  const framesDir = path.join(workDir, "frames");
  const mp4Path = path.join(workDir, "glass-turn.mp4");
  await fs.writeFile(htmlPath, localizedHtml);

  await captureScene({ htmlPath, outputDir: framesDir, fps, duration, width, height });
  await encodeScene({ framesDir, outputPath: mp4Path, fps });
  await fs.rm(framesDir, { recursive: true, force: true });

  return mp4Path;
}

/** True when a scene contains a full-bleed glass-slab component. */
export function sceneHasGlassSlab(scene: { components?: Array<{ type: string }> }): boolean {
  return !!scene.components?.some((c) => c.type === "glass-slab");
}
