/**
 * Text typing animation utilities.
 *
 * Adds character-by-character typing, deletion, select-all, and paste
 * tweens to an existing GSAP timeline.
 */

/**
 * Type text character by character into a target element.
 *
 * Works with both <input>/<textarea> (sets .value) and regular
 * elements (appends to .textContent).
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         element
 * @param {string}              text
 * @param {number}              at       Timeline position (seconds).
 * @param {number}              [speed=30]  Characters per second.
 */
function typeText(tl, element, text, at, speed) {
  var cps = speed || 30;
  var charDuration = 1 / cps;
  var isInput = _isInputElement(element);

  for (var i = 0; i < text.length; i++) {
    (function(ch, offset) {
      tl.call(function() {
        if (isInput) {
          element.value += ch;
        } else {
          element.textContent += ch;
        }
      }, null, at + offset);
    })(text[i], i * charDuration);
  }
}

/**
 * Delete characters from an element one by one.
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         element
 * @param {number}              count   Characters to delete.
 * @param {number}              at      Timeline position (seconds).
 * @param {number}              [speed=30]
 */
function deleteText(tl, element, count, at, speed) {
  var cps = speed || 30;
  var charDuration = 1 / cps;
  var isInput = _isInputElement(element);

  for (var i = 0; i < count; i++) {
    (function(offset) {
      tl.call(function() {
        if (isInput) {
          element.value = element.value.slice(0, -1);
        } else {
          element.textContent = element.textContent.slice(0, -1);
        }
      }, null, at + offset);
    })(i * charDuration);
  }
}

/**
 * Select all text in an input (visual highlight via CSS).
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         element
 * @param {number}              at
 */
function selectAllText(tl, element, at) {
  tl.call(function() {
    if (_isInputElement(element)) {
      element.select();
    }
    // Add a visual highlight class
    element.style.background = 'rgba(167, 139, 250, 0.3)';
  }, null, at);

  // Remove highlight after a moment (0.6s)
  tl.call(function() {
    element.style.background = '';
  }, null, at + 0.6);
}

/**
 * Paste text instantly into an element.
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         element
 * @param {string}              text
 * @param {number}              at
 */
function pasteText(tl, element, text, at) {
  var isInput = _isInputElement(element);
  tl.call(function() {
    if (isInput) {
      element.value = text;
    } else {
      element.textContent = text;
    }
  }, null, at);
}

// ── Internal helpers ──

function _isInputElement(el) {
  var tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
}
