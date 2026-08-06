/**
 * Cursor utilities for scripted component animations.
 *
 * All functions add tweens to an existing GSAP timeline at a given
 * position (`at`).  The cursor element is a macOS-style pointer SVG
 * positioned absolutely inside the component container.
 *
 * Uses `var` throughout -- these files are inlined into assembled
 * HTML and executed directly in the browser (no bundler, no modules).
 */

/**
 * Create a cursor element and append it to the container.
 *
 * @param {HTMLElement} container
 * @param {Object}      [options]
 * @param {string}      [options.color="#1a1a2e"]
 * @param {number}      [options.size=24]
 * @param {number}      [options.zIndex=9999]
 * @param {string}      [options.label]  Name pill trailing the tip (the
 *   multiplayer-document convention: a named cursor is another PERSON in the
 *   room, which is the whole point of showing more than one).
 * @returns {HTMLElement} The cursor DOM element.
 */
function createCursor(container, options) {
  var opts = options || {};
  var color = opts.color || '#1a1a2e';
  var size  = opts.size  || 24;
  var zIdx  = opts.zIndex != null ? opts.zIndex : 9999;

  var el = document.createElement('div');
  el.className = 'mp-cursor';
  el.style.position = 'absolute';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.pointerEvents = 'none';
  el.style.zIndex = zIdx;
  el.style.willChange = 'transform';
  el.innerHTML =
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">' +
      '<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.53.35-.85L5.85 2.35a.5.5 0 0 0-.35.86z" ' +
            'fill="' + color + '" stroke="#ffffff" stroke-width="1.5"/>' +
    '</svg>';

  if (typeof opts.label === 'string' && opts.label.trim()) {
    var pill = document.createElement('div');
    pill.className = 'mp-cursor-label';
    pill.textContent = opts.label.trim().slice(0, 18);
    pill.style.cssText =
      'position:absolute;left:' + Math.round(size * 0.62) + 'px;top:' + Math.round(size * 0.7) + 'px;' +
      'background:' + color + ';color:#fff;white-space:nowrap;' +
      'font:600 ' + Math.max(11, Math.round(size * 0.46)) + 'px/1 Inter,system-ui,sans-serif;' +
      'padding:' + Math.round(size * 0.2) + 'px ' + Math.round(size * 0.34) + 'px;' +
      'border-radius:' + Math.round(size * 0.3) + 'px;letter-spacing:0.01em;' +
      'box-shadow:0 1px 3px rgba(0,0,0,0.18)';
    el.appendChild(pill);
  }

  // Start hidden (opacity 0) so scripts can show it explicitly or
  // it becomes visible on first move.
  gsap.set(el, { autoAlpha: 0 });

  container.appendChild(el);
  return el;
}

/**
 * Add cursor movement to a GSAP timeline.
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         cursor
 * @param {{x: number|string, y: number|string}} target  Percentage or px.
 * @param {number}              at       Timeline position (seconds).
 * @param {number}              [duration=0.5]
 * @param {string}              [ease="power2.inOut"]
 */
function moveCursor(tl, cursor, target, at, duration, ease) {
  var dur = duration != null ? duration : 0.5;
  var e   = ease || 'power2.inOut';
  var tx  = _resolvePercent(target.x, cursor.parentElement.offsetWidth);
  var ty  = _resolvePercent(target.y, cursor.parentElement.offsetHeight);

  // Ensure cursor is visible when it moves.
  tl.to(cursor, { autoAlpha: 1, duration: 0.15 }, at);
  tl.to(cursor, { x: tx, y: ty, duration: dur, ease: e }, at);
}

/**
 * Add a click effect (quick scale pulse) to the timeline.
 */
function clickCursor(tl, cursor, at) {
  tl.to(cursor, { scale: 0.85, duration: 0.08, ease: 'power2.in' }, at);
  tl.to(cursor, { scale: 1,    duration: 0.08, ease: 'power2.out' }, at + 0.08);
}

/**
 * Add a double-click effect.
 */
function doubleClickCursor(tl, cursor, at) {
  clickCursor(tl, cursor, at);
  clickCursor(tl, cursor, at + 0.2);
}

/**
 * Hide cursor with fade.
 */
function hideCursor(tl, cursor, at) {
  tl.to(cursor, { autoAlpha: 0, duration: 0.2 }, at);
}

/**
 * Show cursor with fade.
 */
function showCursor(tl, cursor, at) {
  tl.to(cursor, { autoAlpha: 1, duration: 0.2 }, at);
}

/**
 * Resolve a named target to {x, y} from a targets map.
 * Supports fuzzy matching: dots, dashes, underscores, spaces, and case
 * are all treated as equivalent.
 *
 * @param {Object} targets  Map of name -> {x, y}.
 * @param {string} name     Target name to resolve.
 * @returns {{x: string|number, y: string|number}|null}
 */
function resolveTarget(targets, name) {
  if (!targets || !name) return null;
  if (targets[name]) return targets[name];

  var norm = _normalizeTargetName(name);
  var keys = Object.keys(targets);
  for (var i = 0; i < keys.length; i++) {
    if (_normalizeTargetName(keys[i]) === norm) return targets[keys[i]];
  }
  return null;
}

// ── Internal helpers ──

function _normalizeTargetName(n) {
  return n.toLowerCase().replace(/[-_.\s]+/g, '');
}

function _resolvePercent(val, containerSize) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.indexOf('%') !== -1) {
    return (parseFloat(val) / 100) * containerSize;
  }
  return parseFloat(val) || 0;
}
