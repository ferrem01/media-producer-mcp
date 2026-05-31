/**
 * Script Runner
 *
 * Parses a script action array and builds GSAP timeline entries.
 * This is the main entry point for the shared script system.
 *
 * Usage inside a component's createTimeline:
 *
 *   var tl = gsap.timeline({ paused: true });
 *   runScript(tl, el, data.script, data.cursor_targets, ctx);
 *   return tl;
 */

/**
 * Run a script: parse action array, build GSAP timeline.
 *
 * @param {gsap.core.Timeline} tl         Timeline to populate.
 * @param {HTMLElement}         container  Root component element.
 * @param {Array}               script     Array of script actions.
 * @param {Object}              targets    Named cursor target positions.
 * @param {Object}              ctx        Component context (duration, fps, canvas, etc.).
 * @param {Object}              [handlers] Optional custom action handlers.
 */
function runScript(tl, container, script, targets, ctx, handlers) {
  if (!script || !script.length) return;

  targets = targets || {};
  handlers = handlers || {};

  // Lazily create cursor / camera only when needed
  var cursor = null;
  var camera = null;

  var needsCursor = _scriptNeedsAction(script, [
    'move-cursor', 'click', 'double-click', 'hover', 'drag',
    'right-click', 'hide-cursor', 'show-cursor'
  ]);
  var needsCamera = _scriptNeedsAction(script, [
    'zoom-to', 'zoom-out', 'pan', 'rotate-3d', 'camera-reset'
  ]);

  if (needsCursor) {
    cursor = createCursor(container);
  }
  if (needsCamera) {
    camera = createCameraWrapper(container);
  }

  _processActions(tl, container, script, targets, ctx, handlers, cursor, camera);
}

/**
 * Process an array of actions into timeline entries.
 * Separated so `parallel` can recurse into it.
 */
function _processActions(tl, container, actions, targets, ctx, handlers, cursor, camera) {
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    var at = action.at || 0;
    var dur = action.duration != null ? action.duration : _getDefaultDuration(action.action);

    _processOneAction(tl, container, action, at, dur, targets, ctx, handlers, cursor, camera);
  }
}

function _processOneAction(tl, container, action, at, dur, targets, ctx, handlers, cursor, camera) {
  var target, el;

  switch (action.action) {

    // ── Cursor actions ──

    case 'move-cursor':
      target = resolveTarget(targets, action.target);
      if (target && cursor) moveCursor(tl, cursor, target, at, dur, action.ease);
      break;

    case 'click':
      if (cursor) {
        if (action.target) {
          target = resolveTarget(targets, action.target);
          if (target) {
            moveCursor(tl, cursor, target, at, 0.3, action.ease);
            clickCursor(tl, cursor, at + 0.3);
          }
        } else {
          clickCursor(tl, cursor, at);
        }
      }
      break;

    case 'double-click':
      if (cursor) {
        if (action.target) {
          target = resolveTarget(targets, action.target);
          if (target) {
            moveCursor(tl, cursor, target, at, 0.3, action.ease);
            doubleClickCursor(tl, cursor, at + 0.3);
          }
        } else {
          doubleClickCursor(tl, cursor, at);
        }
      }
      break;

    case 'hover':
      if (cursor) {
        target = resolveTarget(targets, action.target);
        if (target) moveCursor(tl, cursor, target, at, dur, action.ease);
      }
      break;

    case 'drag':
      if (cursor) {
        var startTarget = resolveTarget(targets, action.target);
        var endTarget   = resolveTarget(targets, action.end_target);
        if (startTarget) {
          moveCursor(tl, cursor, startTarget, at, 0.3);
          clickCursor(tl, cursor, at + 0.3);
        }
        if (endTarget) {
          moveCursor(tl, cursor, endTarget, at + 0.5, dur - 0.5);
        }
      }
      break;

    case 'right-click':
      if (cursor) {
        if (action.target) {
          target = resolveTarget(targets, action.target);
          if (target) moveCursor(tl, cursor, target, at, 0.3);
        }
        clickCursor(tl, cursor, at + 0.3);
      }
      break;

    case 'hide-cursor':
      if (cursor) hideCursor(tl, cursor, at);
      break;

    case 'show-cursor':
      if (cursor) showCursor(tl, cursor, at);
      break;

    // ── Typing actions ──

    case 'type':
      el = _findTarget(container, action.target);
      if (el) typeText(tl, el, action.text || '', at, action.speed);
      break;

    case 'type-delete':
      el = _findTarget(container, action.target);
      if (el) deleteText(tl, el, action.count || 1, at, action.speed);
      break;

    case 'type-select-all':
      el = _findTarget(container, action.target);
      if (el) selectAllText(tl, el, at);
      break;

    case 'type-paste':
      el = _findTarget(container, action.target);
      if (el) pasteText(tl, el, action.text || '', at);
      break;

    // ── Camera actions ──

    case 'zoom-to':
      if (camera) {
        var zt = action.target
          ? resolveTarget(targets, action.target)
          : { x: action.x || 50, y: action.y || 50 };
        if (zt) zoomTo(tl, camera, zt, action.scale || 2, at, dur, action.ease);
      }
      break;

    case 'zoom-out':
      if (camera) zoomOut(tl, camera, at, dur, action.ease);
      break;

    case 'pan':
      if (camera) panCamera(tl, camera, action.x, action.y, at, dur, action.ease);
      break;

    case 'rotate-3d':
      if (camera) rotateCamera(tl, camera, action.rotateX, action.rotateY, at, dur, action.ease);
      break;

    case 'camera-reset':
      if (camera) resetCamera(tl, camera, at, dur, action.ease);
      break;

    // ── UI interaction actions ──

    case 'show-element':
      el = _querySelector(container, action.target);
      if (el) {
        tl.to(el, {
          autoAlpha: 1,
          duration: dur,
          ease: action.ease || 'power2.out'
        }, at);
      }
      break;

    case 'hide-element':
      el = _querySelector(container, action.target);
      if (el) {
        tl.to(el, {
          autoAlpha: 0,
          duration: dur,
          ease: action.ease || 'power2.in'
        }, at);
      }
      break;

    case 'highlight':
      el = _findTarget(container, action.target);
      if (el) {
        var color = action.color || '#A78BFA';
        tl.to(el, {
          boxShadow: '0 0 20px ' + color,
          duration: 0.3,
          yoyo: true,
          repeat: 1
        }, at);
      }
      break;

    case 'scroll':
      el = _querySelector(container, action.target);
      if (el) {
        tl.to(el, {
          scrollTop: action.scrollY || 0,
          duration: dur,
          ease: action.ease || 'power2.inOut'
        }, at);
      }
      break;

    case 'toggle':
      el = _findTarget(container, action.target);
      if (el) {
        tl.call(function() {
          el.classList.toggle('active');
          el.classList.toggle('on');
        }, null, at);
      }
      break;

    case 'update-text':
      el = _findTarget(container, action.target);
      if (el) {
        tl.call(function() {
          el.textContent = action.text || '';
        }, null, at);
      }
      break;

    case 'update-value':
      el = _findTarget(container, action.target);
      if (el && action.value != null) {
        var obj = { val: parseFloat(el.textContent) || 0 };
        tl.to(obj, {
          val: action.value,
          duration: dur,
          ease: action.ease || 'power2.out',
          onUpdate: function() {
            el.textContent = Math.round(obj.val);
          }
        }, at);
      }
      break;

    // ── Flow control ──

    case 'wait':
      // No-op. The `at` + `duration` naturally advances the timeline.
      break;

    case 'parallel':
      if (action.actions && action.actions.length) {
        for (var j = 0; j < action.actions.length; j++) {
          var sub = action.actions[j];
          var subAt = at + (sub.at || 0);
          var subDur = sub.duration != null ? sub.duration : _getDefaultDuration(sub.action);
          _processOneAction(tl, container, sub, subAt, subDur, targets, ctx, handlers, cursor, camera);
        }
      }
      break;

    // ── Default: custom handlers ──

    default:
      if (handlers[action.action]) {
        handlers[action.action](tl, container, action, at, dur, ctx);
      }
      break;
  }
}

// ── Helpers ──

/**
 * Get default duration for an action type.
 */
function _getDefaultDuration(actionType) {
  var defaults = {
    'move-cursor': 0.5,
    'click': 0.16,
    'double-click': 0.32,
    'type': 2,
    'type-delete': 1,
    'type-select-all': 0.3,
    'type-paste': 0.05,
    'zoom-to': 1,
    'zoom-out': 0.8,
    'pan': 0.8,
    'rotate-3d': 0.8,
    'camera-reset': 0.8,
    'show-element': 0.3,
    'hide-element': 0.3,
    'highlight': 0.6,
    'scroll': 0.8,
    'toggle': 0.05,
    'update-text': 0.05,
    'update-value': 0.8,
    'wait': 0.5,
    'hover': 0.5,
    'drag': 1,
    'right-click': 0.16,
    'hide-cursor': 0.2,
    'show-cursor': 0.2
  };
  return defaults[actionType] || 0.5;
}

/**
 * Check if a script (including nested parallel blocks) uses any of
 * the given action types.
 */
function _scriptNeedsAction(script, types) {
  for (var i = 0; i < script.length; i++) {
    for (var j = 0; j < types.length; j++) {
      if (script[i].action === types[j]) return true;
    }
    if (script[i].action === 'parallel' && script[i].actions) {
      if (_scriptNeedsAction(script[i].actions, types)) return true;
    }
  }
  return false;
}

/**
 * Find an element by data-target attribute or fall back to querySelector.
 */
function _findTarget(container, targetName) {
  if (!targetName) return null;
  // Try data-target first
  var el = container.querySelector('[data-target="' + targetName + '"]');
  if (el) return el;
  // Fall back to CSS selector
  return _querySelector(container, targetName);
}

/**
 * Safe querySelector wrapper.
 */
function _querySelector(container, selector) {
  if (!selector) return null;
  try {
    return container.querySelector(selector);
  } catch (e) {
    return null;
  }
}
