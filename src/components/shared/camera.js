/**
 * Camera wrapper and zoom / pan / rotate controls.
 *
 * The camera is a wrapper <div> around all scene content.  Camera
 * actions modify its CSS transform to create zoom, pan, and 3D
 * rotation effects.
 */

/**
 * Create a camera wrapper around the container's children.
 * Returns the wrapper element.
 *
 * @param {HTMLElement} container  The root component element.
 * @returns {HTMLElement} The camera wrapper.
 */
function createCameraWrapper(container) {
  var wrapper = document.createElement('div');
  wrapper.className = 'mp-camera';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.transformOrigin = 'center center';
  wrapper.style.willChange = 'transform';

  // Move all existing children into the wrapper
  while (container.firstChild) {
    wrapper.appendChild(container.firstChild);
  }
  container.appendChild(wrapper);

  return wrapper;
}

/**
 * Zoom to a target area.
 *
 * @param {gsap.core.Timeline} tl
 * @param {HTMLElement}         camera     The camera wrapper.
 * @param {{x: number|string, y: number|string}} target  Focal point.
 * @param {number}              scale      Zoom level (default 2).
 * @param {number}              at         Timeline position.
 * @param {number}              [duration=1]
 * @param {string}              [ease="power2.inOut"]
 */
function zoomTo(tl, camera, target, scale, at, duration, ease) {
  var dur = duration != null ? duration : 1;
  var e   = ease || 'power2.inOut';
  var s   = scale != null ? scale : 2;

  var originX = _toPercent(target.x);
  var originY = _toPercent(target.y);

  tl.to(camera, {
    scale: s,
    transformOrigin: originX + ' ' + originY,
    duration: dur,
    ease: e
  }, at);
}

/**
 * Zoom out to full view.
 */
function zoomOut(tl, camera, at, duration, ease) {
  var dur = duration != null ? duration : 0.8;
  var e   = ease || 'power2.inOut';

  tl.to(camera, {
    scale: 1,
    transformOrigin: 'center center',
    duration: dur,
    ease: e
  }, at);
}

/**
 * Pan the camera by offset percentages.
 */
function panCamera(tl, camera, x, y, at, duration, ease) {
  var dur = duration != null ? duration : 0.8;
  var e   = ease || 'power2.inOut';

  tl.to(camera, {
    xPercent: x || 0,
    yPercent: y || 0,
    duration: dur,
    ease: e
  }, at);
}

/**
 * Apply 3D perspective rotation to the camera.
 */
function rotateCamera(tl, camera, rotateX, rotateY, at, duration, ease) {
  var dur = duration != null ? duration : 0.8;
  var e   = ease || 'power2.inOut';

  // Ensure perspective is set on the parent
  if (camera.parentElement) {
    camera.parentElement.style.perspective = '1200px';
  }

  tl.to(camera, {
    rotationX: rotateX || 0,
    rotationY: rotateY || 0,
    duration: dur,
    ease: e
  }, at);
}

/**
 * Reset camera to default state.
 */
function resetCamera(tl, camera, at, duration, ease) {
  var dur = duration != null ? duration : 0.8;
  var e   = ease || 'power2.inOut';

  tl.to(camera, {
    scale: 1,
    xPercent: 0,
    yPercent: 0,
    rotationX: 0,
    rotationY: 0,
    transformOrigin: 'center center',
    duration: dur,
    ease: e
  }, at);
}

// ── Internal helpers ──

function _toPercent(val) {
  if (typeof val === 'string' && val.indexOf('%') !== -1) return val;
  if (typeof val === 'number') return val + '%';
  return parseFloat(val) + '%';
}
