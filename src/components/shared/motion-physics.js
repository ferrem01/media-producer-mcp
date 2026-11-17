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

/** Tweens already put on a grid (stepped, or cut). Kept outside the tween's
 *  vars: GSAP re-reads vars on invalidate() and warns about any key it does
 *  not know on a DOM target. */
var MP_STEPPED = typeof WeakSet === 'function' ? new WeakSet() : null;
function mpIsStepped(tw) { return !!(MP_STEPPED && MP_STEPPED.has(tw)); }
function mpMarkStepped(tw) { if (MP_STEPPED) MP_STEPPED.add(tw); }

/**
 * Give a tween a new ease WITHOUT invalidating it. A tween reads its ease
 * when it initialises; one that has not yet will read vars.ease. One that
 * already has (a from() renders its start state the moment it is built)
 * keeps its parsed ease in `_ease`, so that is replaced in place.
 * Never invalidate here: an invalidated from() re-reads its END state from
 * the element, which its own immediate render has already set to the START
 * state -- `from({autoAlpha:0})` became 0 -> 0 and the element never
 * appeared (the AI email panel in the Flows film rendered blank).
 */
function mpSetEase(tw, ease) {
  tw.vars.ease = ease;
  if (tw._initted) tw._ease = typeof ease === 'function' ? ease : gsap.parseEase(ease);
}

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
    if (mpIsStepped(tw)) continue;

    var steps = Math.max(1, Math.round(dur * fps));
    // One step over the whole tween is just a hard cut -- leave it smooth
    // rather than turn a 60ms micro-move into a pop.
    if (steps < 2) continue;

    var base;
    try { base = gsap.parseEase((tw.vars && tw.vars.ease) || 'none') || function (p) { return p; }; }
    catch (e3) { base = function (p) { return p; }; }

    mpSetEase(tw, mpMakeStepEase(base, steps));
    mpMarkStepped(tw);
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

/**
 * CALM: settle, never bounce. Every overshooting ease on the timeline
 * (back, elastic, bounce -- a sticker's pop, a dot's bounce, a chip's spring)
 * becomes a plain power ease in the same direction, so things land and stop.
 * Components keep their choreography; only the overshoot goes. Run on the
 * master before it plays; each ease is swapped in place (mpSetEase).
 *
 * @param {gsap.core.Timeline} timeline  Usually the scene master.
 * @returns {number} how many tweens were calmed (0 = nothing to do).
 */
function mpCalmEases(timeline) {
  if (!timeline || typeof timeline.getChildren !== 'function') return 0;
  var OVER = /^(back|elastic|bounce)/i;
  var n = 0;
  var tweens;
  try { tweens = timeline.getChildren(true, true, false); } catch (e) { return 0; }
  for (var i = 0; i < tweens.length; i++) {
    var v = tweens[i].vars;
    if (!v || typeof v.ease !== 'string' || !OVER.test(v.ease)) continue;
    var dir = /inout/i.test(v.ease) ? 'inOut' : /\.in\b|easein\b/i.test(v.ease) ? 'in' : 'out';
    mpSetEase(tweens[i], dir === 'out' ? 'power3.out' : 'power2.' + dir);
    n++;
  }
  return n;
}

/**
 * HAND-DRAWN: the motion of a hand-made brand film (the Quotient rebrand's
 * video rules). Three things, all mechanical:
 *
 *  1. CUT, DON'T FADE. A tween that only fades something in or out lands
 *     in one frame: an entrance is fully there on its first frame, an exit
 *     is gone on its last. A fade-up reads corporate; a cut reads made by
 *     hand. A tween that also MOVES keeps its motion (on twos).
 *  2. ON TWOS. Everything else holds each pose for two frames (15 poses a
 *     second at 30 fps), like drawn animation. The camera is exempt, as in
 *     cutout-physics: a stepped camera reads as dropped frames.
 *  3. THE WIGGLE. Every hand-drawn piece -- a component part marked
 *     [data-boil] (a title's words, a symbol field, a squiggle) and any small
 *     component on the frame -- takes a new pose every four frames: a couple
 *     of pixels and under a degree, each piece on its own seed. It moves the
 *     CSS `translate` / `rotate` properties, which compose with the element's
 *     own transform, so it never fights the piece's choreography.
 *
 * Product UI stays still: a full-frame mockup is not a drawing.
 *
 * @param {gsap.core.Timeline} timeline  The scene master.
 * @param {{duration?: number, fps?: number, amount?: number, every?: number, root?: Element}} [opts]
 *   root: where the pieces live -- the document for a single scene, the
 *   scene's own element in the composite (Studio's preview of the whole film).
 */
function mpHandDrawn(timeline, opts) {
  if (!timeline || typeof timeline.getChildren !== 'function') return;
  var o = opts || {};
  var FPS = 30, every = o.every > 0 ? o.every : 4, amount = o.amount > 0 ? o.amount : 3;
  var duration = o.duration > 0 ? o.duration : (timeline.duration() || 5);
  // 1. Cuts: before stepping, so a fade becomes one jump, not 15 small ones.
  var tweens;
  try { tweens = timeline.getChildren(true, true, false); } catch (e) { tweens = []; }
  var cut = 0;
  for (var i = 0; i < tweens.length; i++) {
    var tw = tweens[i], v = tw.vars || {};
    var dur; try { dur = tw.duration(); } catch (e1) { continue; }
    if (!dur || mpIsStepped(tw)) continue;
    var a = v.autoAlpha !== undefined ? v.autoAlpha : v.opacity;
    if (typeof a !== 'number') continue;
    // Only a pure fade is cut. A tween that also travels (a card flying into
    // the logo while it fades) keeps its motion: cutting it would hold the
    // card still and then drop it at the end. It steps on twos below.
    if (mpTweenMoves(v)) continue;
    var targets = []; try { targets = tw.targets() || []; } catch (e2) {}
    if (targets.some(mpIsCameraTarget)) continue;
    // A from() tween runs toward the element's own value, the other way round.
    var appears = v.runBackwards ? a < 0.5 : a >= 0.5;
    mpSetEase(tw, appears ? function (p) { return p > 0 ? 1 : 0; } : function (p) { return p >= 1 ? 1 : 0; });
    mpMarkStepped(tw);
    cut++;
  }
  // 2. On twos.
  mpStepQuantize(timeline, { fps: FPS / 2 });
  // 3. The wiggle.
  var root = o.root && o.root.querySelectorAll ? o.root : document;
  var box = root === document ? null : root.getBoundingClientRect();
  var W = (box && box.width) || window.innerWidth || 1920, H = (box && box.height) || window.innerHeight || 1080;
  var pieces = [];
  var add = function (el) { if (el && pieces.indexOf(el) < 0) pieces.push(el); };
  Array.prototype.forEach.call(root.querySelectorAll('.mp-component [data-boil]'), add);
  Array.prototype.forEach.call(root.querySelectorAll('.mp-component[data-cid]:not([data-mp-backdrop])'), function (el) {
    if (el.querySelector('video, [data-boil]')) return;
    var r = el.getBoundingClientRect();
    if (r.width * r.height > 0 && r.width * r.height < W * H * 0.25) add(el);
  });
  if (!pieces.length) return;
  var seeds = pieces.map(function (el, k) { return 'boil-' + k + '-' + (el.getAttribute('data-boil') || el.getAttribute('data-cid') || ''); });
  var amp = pieces.map(function (el) { var n = Number(el.getAttribute('data-boil-amount')); return n >= 0 && el.hasAttribute('data-boil-amount') ? n : amount; });
  var jit = function (seed, pose, axis) { return mpHandJitter(seed + ':' + axis + ':' + pose); };
  var clock = { t: 0 };
  var draw = function (t) {
    var pose = Math.floor(t * FPS / every);
    for (var k = 0; k < pieces.length; k++) {
      var s = pieces[k].style, m = amp[k];
      s.setProperty('translate', (jit(seeds[k], pose, 'x') * m).toFixed(2) + 'px ' + (jit(seeds[k], pose, 'y') * m).toFixed(2) + 'px');
      s.setProperty('rotate', (jit(seeds[k], pose, 'r') * m * 0.3).toFixed(3) + 'deg');
    }
  };
  draw(0);
  var wiggle = gsap.fromTo(clock, { t: 0 }, { t: duration, duration: duration, ease: 'none', immediateRender: false,
    onUpdate: function () { draw(clock.t); } });
  // Its poses are already on the four-frame grid: never step it again.
  mpMarkStepped(wiggle);
  timeline.add(wiggle, 0);
  return { cut: cut, pieces: pieces.length };
}

/** Tween settings, not animated properties. */
var MP_TWEEN_CONFIG = /^(duration|delay|ease|stagger|repeat|repeatDelay|repeatRefresh|yoyo|yoyoEase|paused|immediateRender|lazy|overwrite|inherit|id|data|callbackScope|runBackwards|startAt|keyframes|onStart|onStartParams|onUpdate|onUpdateParams|onComplete|onCompleteParams|onRepeat|onRepeatParams|onReverseComplete|onReverseCompleteParams|onInterrupt|autoRound|reversed|smoothChildTiming|parent)$/;
/** Does this tween animate anything besides opacity / visibility? */
function mpTweenMoves(v) {
  for (var k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    if (k === 'opacity' || k === 'autoAlpha' || k === 'visibility' || MP_TWEEN_CONFIG.test(k)) continue;
    return true;
  }
  return false;
}

/** A stable number in [-1, 1] for a string: the wiggle's pose for one piece. */
function mpHandJitter(key) {
  var h = 2166136261;
  for (var i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}
