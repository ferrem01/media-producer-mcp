/**
 * GSAP-Powered Transitions
 *
 * Instead of ffmpeg xfade filters, transitions are rendered as short HTML scenes
 * that composite the last frame of scene A and first frame of scene B,
 * animated via GSAP, and captured with Playwright just like regular scenes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { captureScene, captureSingleFrame } from "./capture.js";
import { encodeScene } from "./encode.js";

export type TransitionType =
  | "crossfade"
  | "blur-crossfade"
  | "slide-reveal"
  | "zoom-through"
  | "glitch-cut"
  | "morph-wipe"
  | "scale-rotate"
  | "curtain";

export interface TransitionOptions {
  /** Transition type */
  type: TransitionType | string;
  /** Duration in seconds */
  duration: number;
  /** Path to last frame PNG of scene A */
  frameA: string;
  /** Path to first frame PNG of scene B */
  frameB: string;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Frames per second */
  fps: number;
  /** Working directory for intermediate files */
  workDir: string;
  /** Path to GSAP vendor directory */
  gsapDir: string;
}

/**
 * Render a transition between two scenes as a short MP4 segment.
 * Returns the path to the transition MP4.
 */
export async function renderTransition(opts: TransitionOptions): Promise<string> {
  const { type, duration, frameA, frameB, width, height, fps, workDir, gsapDir } = opts;

  await fs.mkdir(workDir, { recursive: true });

  // Read frame images as base64 data URIs
  const frameABase64 = (await fs.readFile(frameA)).toString("base64");
  const frameBBase64 = (await fs.readFile(frameB)).toString("base64");

  // Load GSAP source
  const gsapSource = await loadGsapMinimal(gsapDir);

  // Get the animation script for this transition type
  const animScript = getTransitionScript(type, duration, width);

  // Build the HTML
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: #000;
}
#frameA, #frameB {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
<script>
${gsapSource}
</script>
</head>
<body>
<img id="frameA" src="data:image/png;base64,${frameABase64}">
<img id="frameB" src="data:image/png;base64,${frameBBase64}">
<script>
(function() {
  var imgA = document.getElementById('frameA');
  var imgB = document.getElementById('frameB');
  var dur = ${duration};

  var tl = gsap.timeline({ paused: true });

  ${animScript}

  window.__MP_TIMELINE = tl;
  window.__MP_DURATION = dur;
  window.__MP_READY = true;
})();
</script>
</body>
</html>`;

  const htmlPath = path.join(workDir, "transition.html");
  const framesDir = path.join(workDir, "frames");
  const mp4Path = path.join(workDir, "transition.mp4");

  await fs.writeFile(htmlPath, html);

  // Capture frames
  await captureScene({
    htmlPath,
    outputDir: framesDir,
    fps,
    duration,
    width,
    height,
  });

  // Encode to MP4
  await encodeScene({
    framesDir,
    outputPath: mp4Path,
    fps,
  });

  // Clean up frames
  await fs.rm(framesDir, { recursive: true, force: true });

  return mp4Path;
}

/**
 * Extract the last frame from a scene's captured frames or MP4.
 * Returns path to a PNG file.
 */
export async function extractLastFrame(
  sceneMp4: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Use ffmpeg to extract the last frame
  // First get duration
  const { stdout: durStr } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    sceneMp4,
  ]);
  const duration = parseFloat(durStr.trim());

  // Seek near end and grab last frame
  const seekTime = Math.max(0, duration - 0.05);
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(seekTime),
    "-i", sceneMp4,
    "-frames:v", "1",
    "-s", `${width}x${height}`,
    outputPath,
  ]);

  return outputPath;
}

/**
 * Extract the first frame from a scene MP4.
 * Returns path to a PNG file.
 */
export async function extractFirstFrame(
  sceneMp4: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", sceneMp4,
    "-frames:v", "1",
    "-s", `${width}x${height}`,
    outputPath,
  ]);

  return outputPath;
}

/**
 * Get the GSAP animation script for a transition type.
 */
function getTransitionScript(type: string, duration: number, width: number = 1920): string {
  switch (type) {
    case "crossfade":
      return `
  gsap.set(imgB, { autoAlpha: 0 });
  tl.to(imgA, { autoAlpha: 0, duration: dur }, 0);
  tl.to(imgB, { autoAlpha: 1, duration: dur }, 0);`;

    case "blur-crossfade":
      return `
  gsap.set(imgB, { autoAlpha: 0, filter: 'blur(20px)' });
  tl.to(imgA, { autoAlpha: 0, filter: 'blur(20px)', duration: dur }, 0);
  tl.to(imgB, { autoAlpha: 1, filter: 'blur(0px)', duration: dur }, 0);`;

    case "slide-reveal":
      return `
  gsap.set(imgB, { xPercent: 100 });
  imgB.style.boxShadow = '-20px 0 40px rgba(0,0,0,0.5)';
  tl.to(imgB, { xPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "zoom-through":
      return `
  var halfDur = dur * 0.5;
  tl.to(imgA, { scale: 1.5, autoAlpha: 0, duration: halfDur, ease: 'power2.in' }, 0);
  gsap.set(imgB, { scale: 1.5, autoAlpha: 0 });
  tl.to(imgB, { scale: 1, autoAlpha: 1, duration: halfDur, ease: 'power2.out' }, halfDur);`;

    case "glitch-cut":
      return `
  // Quick glitch effect then hard cut
  var glitchDur = Math.min(dur * 0.6, 0.3);
  var cutPoint = dur - 0.05;
  gsap.set(imgB, { autoAlpha: 0 });
  // RGB split / jitter on frame A
  tl.to(imgA, {
    x: '+=8', filter: 'hue-rotate(90deg) saturate(3)',
    duration: glitchDur * 0.15, yoyo: true, repeat: 5, ease: 'steps(1)'
  }, 0);
  tl.to(imgA, { scaleX: 1.02, duration: glitchDur * 0.1, yoyo: true, repeat: 3 }, 0);
  // Hard cut to B
  tl.set(imgA, { autoAlpha: 0 }, cutPoint);
  tl.set(imgB, { autoAlpha: 1 }, cutPoint);`;

    case "morph-wipe":
      return `
  gsap.set(imgB, { clipPath: 'circle(0% at 50% 50%)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, {
    clipPath: 'circle(150% at 50% 50%)',
    duration: dur,
    ease: 'power2.inOut'
  }, 0);`;

    case "scale-rotate":
      return `
  gsap.set(imgB, { scale: 1.2, rotation: 5, autoAlpha: 0 });
  tl.to(imgA, { scale: 0.8, rotation: -5, autoAlpha: 0, duration: dur, ease: 'power2.inOut' }, 0);
  tl.to(imgB, { scale: 1, rotation: 0, autoAlpha: 1, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "curtain":
      return `
  // Create N vertical strips of frame A that peel away
  var stripCount = 8;
  var stripW = ${width} / stripCount;
  imgA.style.display = 'none';
  gsap.set(imgB, { zIndex: 0 });
  var stripContainer = document.createElement('div');
  stripContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;overflow:hidden;';
  document.body.appendChild(stripContainer);
  for (var i = 0; i < stripCount; i++) {
    var strip = document.createElement('div');
    strip.style.cssText = 'position:absolute;top:0;width:' + stripW + 'px;height:100%;overflow:hidden;left:' + (i * stripW) + 'px;transform-origin:left center;';
    var inner = document.createElement('img');
    inner.src = imgA.src;
    inner.style.cssText = 'position:absolute;top:0;left:-' + (i * stripW) + 'px;width:${width}px;height:100%;object-fit:cover;';
    strip.appendChild(inner);
    stripContainer.appendChild(strip);
    tl.to(strip, {
      rotateY: -90,
      autoAlpha: 0,
      duration: dur * 0.7,
      ease: 'power2.in'
    }, i * (dur * 0.3 / stripCount));
  }`;

    default:
      // Fall back to crossfade for unknown types
      console.warn(`Unknown transition type "${type}", falling back to crossfade`);
      return `
  gsap.set(imgB, { autoAlpha: 0 });
  tl.to(imgA, { autoAlpha: 0, duration: dur }, 0);
  tl.to(imgB, { autoAlpha: 1, duration: dur }, 0);`;
  }
}

/**
 * Load minimal GSAP source (just gsap.min.js) for transitions.
 */
async function loadGsapMinimal(gsapDir: string): Promise<string> {
  const gsapPath = path.join(gsapDir, "gsap.min.js");
  try {
    return await fs.readFile(gsapPath, "utf-8");
  } catch {
    console.warn(`GSAP not found at ${gsapPath}, transitions may fail`);
    return `console.warn("GSAP not loaded");
var gsap = {
  timeline: function() { return { to: function() { return this; }, from: function() { return this; }, fromTo: function() { return this; }, set: function() { return this; }, time: function() { return this; }, add: function() { return this; } }; },
  set: function() {},
  to: function() {},
  from: function() {},
  fromTo: function() {}
};`;
  }
}
