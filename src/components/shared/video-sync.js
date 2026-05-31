/**
 * Video Sync Utility
 *
 * Load a video element for frame-by-frame capture.
 * Preloads the video and pauses it so Playwright can seek it.
 */

// eslint-disable-next-line no-unused-vars
function loadVideoForCapture(container, src, options) {
  // options: { width, height, startAt, style }
  options = options || {};
  var video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.style.cssText = options.style || 'width:100%;height:100%;object-fit:cover;';
  if (options.startAt) video.setAttribute('data-start-at', String(options.startAt));
  if (options.width) video.width = options.width;
  if (options.height) video.height = options.height;
  container.appendChild(video);

  // Pause immediately - Playwright will control seeking
  video.pause();

  return video;
}
