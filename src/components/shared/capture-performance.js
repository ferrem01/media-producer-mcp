/**
 * Capture performance runtime (SPEC-web-capture.md)
 *
 * The generic verb set every CAPTURED component gets for free. A capture is
 * frozen markup from a real website -- inert scenery -- and these verbs
 * puppet it: highlight a phrase, click a button with the film's cursor, swap
 * copy, count a number up, scroll a region. One shared implementation so an
 * improvement here lifts every capture ever taken.
 *
 * TARGETING IS TEXT-FIRST: actions address elements by their VISIBLE TEXT
 * ({"text": "Upgrade"}) with CSS selector as the fallback ({"selector": ...}).
 * Text is what an LLM authoring a storyboard can see on the card and write
 * reliably; selectors from a stranger's minified CSS are line noise.
 *
 * Uses `var` throughout -- inlined into assembled HTML, no bundler.
 */

/**
 * Find the innermost element whose visible text contains `text`.
 * Innermost wins: "the $29" should match the price span, not the whole card.
 */
function capFindByText(root, text) {
  if (!text) return null;
  var needle = String(text).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!needle) return null;
  var best = null;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  var node = walker.currentNode;
  while (node) {
    if (node !== root) {
      var t = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t.indexOf(needle) !== -1) {
        // Deeper (more specific) containers replace shallower ones.
        if (!best || best.contains(node)) best = node;
      }
    }
    node = walker.nextNode();
  }
  return best;
}

/** Resolve an action's target inside the capture root: text first, selector fallback. */
function capResolve(root, action) {
  var el = null;
  if (action.text) el = capFindByText(root, action.text);
  if (!el && action.selector) {
    try { el = root.querySelector(action.selector); } catch (e) { el = null; }
  }
  return el;
}

/** The exact text node span for highlight underlines: wrap the matched text run. */
function capWrapText(el, text) {
  var needle = String(text).replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  var node;
  while ((node = walker.nextNode())) {
    var idx = node.textContent.replace(/\s+/g, ' ').indexOf(needle);
    if (idx === -1) continue;
    // Re-find the index in the RAW text (whitespace-normalized match).
    var raw = node.textContent;
    var rawIdx = raw.toLowerCase().indexOf(needle.toLowerCase());
    if (rawIdx === -1) rawIdx = 0;
    var span = document.createElement('span');
    span.className = 'cap-hl-run';
    var range = document.createRange();
    range.setStart(node, rawIdx);
    range.setEnd(node, Math.min(raw.length, rawIdx + needle.length));
    try { range.surroundContents(span); return span; } catch (e) { return el; }
  }
  return null;
}

/**
 * Build the timeline for a captured component's script.
 *
 *   var tl = gsap.timeline({ paused: true });
 *   runCapturePerformance(tl, el, data, ctx);
 *   return tl;
 *
 * Delegates cursor mechanics to shared cursor.js and generic actions to
 * script-runner.js handler extension.
 */
function runCapturePerformance(tl, container, data, ctx) {
  var root = container.querySelector('.cap-body') || container;
  var accent = (data && data.accent) || '#393bf5';

  var handlers = {
    'highlight': function (tl2, ctr, action, at) {
      var el = capResolve(root, action);
      if (!el) return;
      var style = action.style || 'underline';
      var color = action.color || accent;
      var dur = action.duration != null ? action.duration : 0.6;
      if (style === 'underline') {
        var run = action.text ? (capWrapText(el, action.text) || el) : el;
        tl2.call(function () {
          run.style.backgroundImage = 'linear-gradient(' + color + ', ' + color + ')';
          run.style.backgroundRepeat = 'no-repeat';
          run.style.backgroundPosition = '0 96%';
          run.style.backgroundSize = '0% 3px';
        }, null, at);
        var prox = { p: 0 };
        tl2.to(prox, {
          p: 100, duration: dur, ease: 'power2.inOut',
          onUpdate: function () { run.style.backgroundSize = prox.p + '% 3px'; },
        }, at + 0.02);
      } else if (style === 'box') {
        tl2.call(function () {
          var r = el.getBoundingClientRect();
          var cr = root.getBoundingClientRect();
          var box = document.createElement('div');
          box.className = 'cap-hl-box';
          box.style.cssText = 'position:absolute;pointer-events:none;border:3px solid ' + color +
            ';border-radius:6px;opacity:0;left:' + (r.left - cr.left - 6) + 'px;top:' + (r.top - cr.top - 6) +
            'px;width:' + (r.width + 12) + 'px;height:' + (r.height + 12) + 'px;';
          root.appendChild(box);
          gsap.to(box, { opacity: 1, duration: 0.25, ease: 'power2.out' });
        }, null, at);
      } else if (style === 'spotlight') {
        tl2.call(function () {
          var r = el.getBoundingClientRect();
          var cr = root.getBoundingClientRect();
          var veil = document.createElement('div');
          veil.className = 'cap-hl-veil';
          var cx = r.left - cr.left + r.width / 2;
          var cy = r.top - cr.top + r.height / 2;
          var rad = Math.max(r.width, r.height) * 0.75;
          veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle ' +
            rad + 'px at ' + cx + 'px ' + cy + 'px, transparent 0%, transparent 70%, rgba(10,10,18,0.55) 100%);';
          root.appendChild(veil);
          gsap.to(veil, { opacity: 1, duration: 0.4, ease: 'power2.out' });
        }, null, at);
      }
    },

    'set-text': function (tl2, ctr, action, at) {
      var el = capResolve(root, action);
      if (!el || action.to == null) return;
      tl2.call(function () { el.textContent = String(action.to); }, null, at);
    },

    'count-up': function (tl2, ctr, action, at) {
      var el = capResolve(root, action);
      if (!el) return;
      var raw = (el.textContent || '').trim();
      var from = action.from != null ? Number(action.from) : (parseFloat(raw.replace(/[^0-9.\-]/g, '')) || 0);
      var to = Number(action.to);
      if (!isFinite(to)) return;
      // Preserve the number's dress: "$29/mo" keeps its $ and /mo.
      var m = raw.match(/^([^0-9\-]*)([0-9][0-9,.]*)(.*)$/);
      var prefix = m ? m[1] : '';
      var suffix = m ? m[3] : '';
      var decimals = (String(to).split('.')[1] || '').length;
      var prox = { n: from };
      tl2.to(prox, {
        n: to, duration: action.duration != null ? action.duration : 1.2, ease: 'power2.out',
        onUpdate: function () {
          var v = decimals ? prox.n.toFixed(decimals) : Math.round(prox.n).toLocaleString('en-US');
          el.textContent = prefix + v + suffix;
        },
      }, at);
    },

    'type': function (tl2, ctr, action, at) {
      var el = capResolve(root, action);
      if (!el || action.text == null) return;
      var full = String(action.text);
      var isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      var speed = action.speed || 30; // chars/sec, house convention
      var prox = { n: 0 };
      tl2.call(function () { if (isInput) el.value = ''; else el.textContent = ''; }, null, at);
      tl2.to(prox, {
        n: full.length, duration: full.length / speed, ease: 'none',
        onUpdate: function () {
          var s = full.slice(0, Math.ceil(prox.n));
          if (isInput) el.value = s; else el.textContent = s;
        },
      }, at + 0.02);
    },

    'scroll': function (tl2, ctr, action, at) {
      var target = null;
      if (action.to && typeof action.to === 'object') target = null;
      else if (typeof action.to === 'string') target = capResolve(root, { text: action.to, selector: action.to });
      var y = 0;
      tl2.call(function () {
        if (target) {
          var r = target.getBoundingClientRect();
          var cr = root.getBoundingClientRect();
          y = root.scrollTop + (r.top - cr.top) - 24;
        } else {
          y = Number(action.y) || 0;
        }
        gsap.to(root, { scrollTop: y, duration: action.duration != null ? action.duration : 0.8, ease: 'power2.inOut' });
      }, null, at);
    },
  };

  // The capture verbs are applied DIRECTLY (script-runner has same-named
  // built-in cases -- highlight/type/scroll -- that would shadow custom
  // handlers, and those built-ins speak selector conventions a captured
  // stranger-DOM doesn't have). Cursor work (click/move/hover) goes through
  // the shared runner with {text}-resolved positional targets so the film's
  // cursor mechanics stay in one place.
  var CAP_VERBS = { 'highlight': 1, 'set-text': 1, 'count-up': 1, 'type': 1, 'scroll': 1 };
  var script = (data && data.script) || [];
  var cursorScript = [];
  var dynTargets = {};
  var dynCount = 0;
  for (var i = 0; i < script.length; i++) {
    var a = script[i];
    if (CAP_VERBS[a.action]) {
      handlers[a.action](tl, container, a, a.at || 0);
      continue;
    }
    if ((a.action === 'click' || a.action === 'move-cursor' || a.action === 'hover' || a.action === 'double-click') && (a.text || a.selector) && !a.target) {
      var el = capResolve(root, a);
      if (el) {
        var name = '__cap_t' + (dynCount++);
        (function (elc) {
          dynTargets[name] = function () {
            var r = elc.getBoundingClientRect();
            var cr = container.getBoundingClientRect();
            return {
              x: ((r.left + r.width / 2 - cr.left) / cr.width * 100) + '%',
              y: ((r.top + r.height / 2 - cr.top) / cr.height * 100) + '%',
            };
          };
        })(el);
        var copy = {};
        for (var k in a) copy[k] = a[k];
        copy.target = name;
        cursorScript.push(copy);
        continue;
      }
    }
    cursorScript.push(a);
  }

  runScript(tl, container, cursorScript, dynTargets, ctx, {});
}
