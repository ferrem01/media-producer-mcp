/**
 * MOTION PHYSICS -- the mechanical half of visual_system.motion.
 *
 * SPEC-creative-axes rule 2: every enum value on a creative axis must be
 * backed by machinery, not just prose in a prompt. `cutout-physics` was
 * shipped as guidance only -- the director was told to describe rigid flat
 * pieces and the codegen was free to ignore it. These two helpers are the
 * machinery, and they are applied by the assembler to the finished scene
 * timeline, so no component has to opt in and none can opt out.
 *
 * Both come from the same observation in Jake Moran's Behind-the-Craft
 * write-up: the print feel is carried almost entirely by two things --
 * elements that STEP at ~12fps while the camera stays smooth, and edges
 * that BOIL by a fraction of a pixel. Everything else is art direction.
 *
 * SCRUB SAFETY (SPEC-motion-architecture): the renderer seeks the master
 * timeline to arbitrary times, and GSAP suppresses callbacks on seek, so
 * neither helper may use onUpdate/onRepeat. Stepping is an EASE (a pure
 * function of progress) and the boil is a sequence of zero-duration
 * `set` tweens -- both replay identically at any seek order.
 */

/** The stop-motion rate the cutout world moves on. The camera is exempt:
 *  stepping the camera reads as a dropped frame, not as stop-motion. */
var MP_CUTOUT_FPS = 12;

/** Is this tween target part of the camera rig? */
function mpIsCameraTarget(t) {
  if (!t || !t.classList) return false;
  return t.classList.contains('mp-camera') || t.classList.contains('__mp_camera_rig');
}

/**
 * Quantize a timeline's element motion onto an fps grid: each tween holds
 * its pose for 1/fps of a second, then jumps to where its own ease would
 * have put it. The ease SHAPE is preserved (we step the input, not the
 * output), so a settle still settles -- it just settles in visible steps.
 *
 * @param {gsap.core.Timeline} timeline  Usually the scene master.
 * @param {{fps?: number, skip?: (target: any) => boolean}} [opts]
 * @returns {number} how many tweens were quantized (0 = nothing to do).
 */
function mpStepQuantize(timeline, opts) {
  if (!timeline || typeof timeline.getChildren !== 'function') return 0;
  var o = opts || {};
  var fps = o.fps > 0 ? o.fps : MP_CUTOUT_FPS;
  var skip = typeof o.skip === 'function' ? o.skip : null;
  var n = 0;
  var tweens;
  try {
    tweens = timeline.getChildren(true, true, false);
  } catch (e) { return 0; }

  for (var i = 0; i < tweens.length; i++) {
    var tw = tweens[i];
    var dur;
    try { dur = tw.duration(); } catch (e1) { continue; }
    // Zero-duration tweens are `set` calls -- already instantaneous.
    if (!dur) continue;
    var targets = [];
    try { targets = tw.targets() || []; } catch (e2) { targets = []; }
    if (!targets.length) continue;
    var exempt = false;
    for (var t = 0; t < targets.length; t++) {
      if (mpIsCameraTarget(targets[t]) || (skip && skip(targets[t]))) { exempt = true; break; }
    }
    if (exempt) continue;
    // Already quantized (a re-run, or a component that stepped itself).
    if (tw.vars && tw.vars.__mpStepped) continue;

    var steps = Math.max(1, Math.round(dur * fps));
    // One step over the whole tween is just a hard cut -- leave it smooth
    // rather than turn a 60ms micro-move into a pop.
    if (steps < 2) continue;

    var base;
    try { base = gsap.parseEase((tw.vars && tw.vars.ease) || 'none') || function (p) { return p; }; }
    catch (e3) { base = function (p) { return p; }; }

    tw.vars.ease = mpMakeStepEase(base, steps);
    tw.vars.__mpStepped = true;
    // Safe here and only here: the assembler runs this before the master has
    // rendered, so re-recording start values reads the same frame-0 state.
    try { tw.invalidate(); } catch (e4) {}
    n++;
  }
  return n;
}

/** base(floor(p * steps) / steps) -- steps the INPUT so the curve survives. */
function mpMakeStepEase(base, steps) {
  return function (p) {
    if (p >= 1) return base(1);
    return base(Math.floor(p * steps) / steps);
  };
}

/**
 * INK BOIL: sub-pixel edge wobble, stepped on the same grid, so drawn
 * elements look redrawn each frame instead of photographed once.
 *
 * Implemented as an SVG turbulence/displacement filter whose seed is
 * advanced by `set` tweens -- displacing at the filter level means we never
 * fight an element's own transform (the reason a jitter-the-transform
 * version cannot work: it would have to write x/y that the element's own
 * tween owns).
 *
 * @param {gsap.core.Timeline} timeline
 * @param {Array<HTMLElement>} elements  Elements to boil (the inked ones).
 * @param {{fps?: number, scale?: number, seed?: number, duration?: number}} [opts]
 * @returns {number} how many elements were boiled.
 */
function mpInkBoil(timeline, elements, opts) {
  if (!timeline || !elements || !elements.length) return 0;
  var o = opts || {};
  var fps = o.fps > 0 ? o.fps : MP_CUTOUT_FPS;
  // Sub-pixel by design. Above ~1.5 the type stops being crisp and the
  // contrast gate starts reading softened edges.
  var scale = o.scale > 0 ? Math.min(1.5, o.scale) : 0.8;
  var duration = o.duration > 0 ? o.duration : (timeline.duration() || 5);
  var seed = (o.seed || 7) >>> 0;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  var NS = 'http://www.w3.org/2000/svg';
  window.__mpBoilN = (window.__mpBoilN || 0) + 1;
  var uid = 'mp-boil-' + window.__mpBoilN;

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  var filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', uid);
  // Room for the displacement so nothing clips at the element's edge.
  filter.setAttribute('x', '-10%');
  filter.setAttribute('y', '-10%');
  filter.setAttribute('width', '120%');
  filter.setAttribute('height', '120%');
  var turb = document.createElementNS(NS, 'feTurbulence');
  turb.setAttribute('type', 'fractalNoise');
  turb.setAttribute('baseFrequency', '0.02 0.05');
  turb.setAttribute('numOctaves', '2');
  turb.setAttribute('seed', '1');
  turb.setAttribute('result', 'mpBoilNoise');
  var disp = document.createElementNS(NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'mpBoilNoise');
  disp.setAttribute('scale', String(scale));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');
  filter.appendChild(turb);
  filter.appendChild(disp);
  svg.appendChild(filter);
  document.body.appendChild(svg);

  var n = 0;
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (!el || !el.style) continue;
    var prior = el.style.filter;
    el.style.filter = prior ? prior + ' url(#' + uid + ')' : 'url(#' + uid + ')';
    n++;
  }
  if (!n) { svg.remove(); return 0; }

  // Pre-rolled seed sequence: a `set` per frame, so any seek lands on the
  // same seed the forward playthrough would have shown.
  var frames = Math.max(1, Math.ceil(duration * fps));
  for (var f = 0; f < frames; f++) {
    timeline.set(turb, { attr: { seed: 1 + Math.floor(rnd() * 90) } }, f / fps);
  }
  return n;
}
