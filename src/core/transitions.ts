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
  | "curtain"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down"
  | "iris"
  | "push"
  // Shader transitions (WebGL)
  | "shader-crosswarp"
  | "shader-ripple"
  | "shader-radial"
  | "shader-directional-warp"
  | "shader-burn"
  | "shader-chromatic"
  | "shader-lens-distortion";

/** Check if a transition type uses WebGL shaders */
function isShaderTransition(type: string): boolean {
  return type.startsWith("shader-");
}

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

  // Check if this is a shader transition
  if (isShaderTransition(type)) {
    return renderShaderTransition(opts, frameABase64, frameBBase64, gsapSource);
  }

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
export function getTransitionScript(type: string, duration: number, width: number = 1920): string {
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


    case "slide-up":
      return `
  gsap.set(imgB, { yPercent: 100 });
  imgB.style.zIndex = '2';
  tl.to(imgB, { yPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "slide-down":
      return `
  gsap.set(imgB, { yPercent: -100 });
  imgB.style.zIndex = '2';
  tl.to(imgB, { yPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "slide-left":
      return `
  gsap.set(imgB, { xPercent: 100 });
  imgB.style.zIndex = '2';
  tl.to(imgB, { xPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "slide-right":
      return `
  gsap.set(imgB, { xPercent: -100 });
  imgB.style.zIndex = '2';
  tl.to(imgB, { xPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

    case "wipe-left":
      return `
  gsap.set(imgB, { clipPath: 'inset(0 100% 0 0)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, { clipPath: 'inset(0 0% 0 0)', duration: dur, ease: 'power2.inOut' }, 0);`;

    case "wipe-right":
      return `
  gsap.set(imgB, { clipPath: 'inset(0 0 0 100%)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, { clipPath: 'inset(0 0 0 0%)', duration: dur, ease: 'power2.inOut' }, 0);`;

    case "wipe-up":
      return `
  gsap.set(imgB, { clipPath: 'inset(100% 0 0 0)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, { clipPath: 'inset(0% 0 0 0)', duration: dur, ease: 'power2.inOut' }, 0);`;

    case "wipe-down":
      return `
  gsap.set(imgB, { clipPath: 'inset(0 0 100% 0)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, { clipPath: 'inset(0 0 0% 0)', duration: dur, ease: 'power2.inOut' }, 0);`;

    case "iris":
      return `
  gsap.set(imgB, { clipPath: 'circle(0% at 50% 50%)' });
  imgB.style.zIndex = '2';
  tl.to(imgB, { clipPath: 'circle(100% at 50% 50%)', duration: dur, ease: 'power2.inOut' }, 0);`;

    case "push":
      return `
  gsap.set(imgB, { xPercent: 100 });
  tl.to(imgA, { xPercent: -100, duration: dur, ease: 'power2.inOut' }, 0);
  tl.to(imgB, { xPercent: 0, duration: dur, ease: 'power2.inOut' }, 0);`;

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
export async function loadGsapMinimal(gsapDir: string): Promise<string> {
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

// ── Shader Transitions (WebGL) ──

/**
 * GLSL fragment shader library for transitions.
 * All shaders from gl-transitions (MIT license).
 * Each shader expects: uniform float progress, uniform sampler2D from, uniform sampler2D to
 */
const SHADER_LIBRARY: Record<string, { glsl: string; uniforms?: Record<string, string> }> = {
  "shader-crosswarp": {
    glsl: `
      // Author: Eke Péter <peterekepeter@gmail.com> | License: MIT
      vec4 transition(vec2 p) {
        float x = progress;
        x = smoothstep(0.0, 1.0, (x * 2.0 + p.x - 1.0));
        return mix(getFromColor((p - 0.5) * (1.0 - x) + 0.5), getToColor((p - 0.5) * x + 0.5), x);
      }`,
  },
  "shader-ripple": {
    glsl: `
      // Author: gre | License: MIT
      const float amplitude = 100.0;
      const float speed = 50.0;
      vec4 transition(vec2 uv) {
        vec2 dir = uv - vec2(0.5);
        float dist = length(dir);
        vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + 0.5) / 30.0 * progress;
        return mix(
          getFromColor(uv + offset),
          getToColor(uv),
          smoothstep(0.2, 1.0, progress)
        );
      }`,
  },
  "shader-radial": {
    glsl: `
      // Author: Xaychru | License: MIT
      const float smoothness = 1.0;
      const float PI = 3.141592653589;
      vec4 transition(vec2 p) {
        vec2 rp = p * 2.0 - 1.0;
        return mix(
          getToColor(p),
          getFromColor(p),
          smoothstep(0.0, smoothness, atan(rp.y, rp.x) - (progress - 0.5) * PI * 2.5)
        );
      }`,
  },
  "shader-directional-warp": {
    glsl: `
      // Author: pschroen | License: MIT
      const float smoothness = 0.1;
      const vec2 direction = vec2(-1.0, 1.0);
      const vec2 center = vec2(0.5, 0.5);
      vec4 transition(vec2 uv) {
        vec2 v = normalize(direction);
        v /= abs(v.x) + abs(v.y);
        float d = v.x * center.x + v.y * center.y;
        float m = 1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness)));
        return mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m);
      }`,
  },
  "shader-burn": {
    glsl: `
      // Author: gre | License: MIT
      const vec3 burnColor = vec3(0.9, 0.4, 0.2);
      vec4 transition(vec2 uv) {
        return mix(
          getFromColor(uv) + vec4(progress * burnColor, 1.0),
          getToColor(uv) + vec4((1.0 - progress) * burnColor, 1.0),
          progress
        );
      }`,
  },
  "shader-chromatic": {
    glsl: `
      // Chromatic aberration transition
      vec4 transition(vec2 uv) {
        float amount = 0.03 * sin(progress * 3.14159);
        vec4 fromR = getFromColor(uv + vec2(amount, 0.0));
        vec4 fromG = getFromColor(uv);
        vec4 fromB = getFromColor(uv - vec2(amount, 0.0));
        vec4 fromAberrated = vec4(fromR.r, fromG.g, fromB.b, 1.0);
        vec4 toR = getToColor(uv + vec2(amount, 0.0));
        vec4 toG = getToColor(uv);
        vec4 toB = getToColor(uv - vec2(amount, 0.0));
        vec4 toAberrated = vec4(toR.r, toG.g, toB.b, 1.0);
        return mix(fromAberrated, toAberrated, smoothstep(0.0, 1.0, progress));
      }`,
  },
  "shader-lens-distortion": {
    glsl: `
      // Gravitational lens distortion transition
      vec4 transition(vec2 uv) {
        vec2 center = vec2(0.5, 0.5);
        vec2 dir = uv - center;
        float dist = length(dir);
        float strength = 0.5 * sin(progress * 3.14159);
        float distortion = 1.0 + strength * (1.0 - smoothstep(0.0, 0.5, dist));
        vec2 distortedUV = center + dir * distortion;
        distortedUV = clamp(distortedUV, 0.0, 1.0);
        return mix(
          getFromColor(distortedUV),
          getToColor(distortedUV),
          smoothstep(0.3, 0.7, progress)
        );
      }`,
  },
};

/**
 * Render a shader-based transition using WebGL.
 */
async function renderShaderTransition(
  opts: TransitionOptions,
  frameABase64: string,
  frameBBase64: string,
  gsapSource: string,
): Promise<string> {
  const { type, duration, width, height, fps, workDir } = opts;

  const shaderDef = SHADER_LIBRARY[type];
  if (!shaderDef) {
    console.warn(`Shader "${type}" not found, falling back to crossfade`);
    return renderTransition({ ...opts, type: "crossfade" });
  }

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
canvas {
  width: ${width}px;
  height: ${height}px;
}
</style>
<script>
${gsapSource}
</script>
</head>
<body>
<canvas id="glcanvas" width="${width}" height="${height}"></canvas>
<script>
(function() {
  var canvas = document.getElementById('glcanvas');
  var gl = canvas.getContext('webgl', {preserveDrawingBuffer: true}) || canvas.getContext('experimental-webgl', {preserveDrawingBuffer: true});
  if (!gl) {
    console.error('WebGL not supported, falling back to crossfade');
    // Fallback: create img elements and do a simple crossfade
    document.body.innerHTML = '<img id="fA" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" src="data:image/png;base64,${frameABase64}"><img id="fB" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0" src="data:image/png;base64,${frameBBase64}">';
    var fA = document.getElementById('fA');
    var fB = document.getElementById('fB');
    var tl = gsap.timeline({ paused: true });
    tl.to(fA, { autoAlpha: 0, duration: ${duration} }, 0);
    tl.to(fB, { autoAlpha: 1, duration: ${duration} }, 0);
    window.__MP_TIMELINE = tl;
    window.__MP_DURATION = ${duration};
    window.__MP_READY = true;
    return;
  }

  // Vertex shader
  var vertSrc = [
    'attribute vec2 a_position;',
    'varying vec2 v_texCoord;',
    'void main() {',
    '  v_texCoord = a_position * 0.5 + 0.5;',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  // Fragment shader with gl-transitions wrapper
  var fragSrc = [
    'precision mediump float;',
    'varying vec2 v_texCoord;',
    'uniform sampler2D from;',
    'uniform sampler2D to;',
    'uniform float progress;',
    'uniform vec2 resolution;',
    '',
    'vec4 getFromColor(vec2 uv) { return texture2D(from, uv); }',
    'vec4 getToColor(vec2 uv) { return texture2D(to, uv); }',
    '',
    ${JSON.stringify(shaderDef.glsl)},
    '',
    'void main() {',
    '  gl_FragColor = transition(v_texCoord);',
    '}'
  ].join('\n');

  // Compile shaders
  function compileShader(src, type) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  var vertShader = compileShader(vertSrc, gl.VERTEX_SHADER);
  var fragShader = compileShader(fragSrc, gl.FRAGMENT_SHADER);
  var program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  // Full-screen quad
  var vertices = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Uniforms
  var uProgress = gl.getUniformLocation(program, 'progress');
  var uResolution = gl.getUniformLocation(program, 'resolution');
  gl.uniform2f(uResolution, ${width}, ${height});

  // Load textures from images
  function loadTexture(imgElement, unit) {
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  // Create images and load
  var imgA = new Image();
  var imgB = new Image();
  var loaded = 0;

  function onLoad() {
    loaded++;
    if (loaded < 2) return;

    loadTexture(imgA, 0);
    loadTexture(imgB, 1);
    gl.uniform1i(gl.getUniformLocation(program, 'from'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'to'), 1);

    // GSAP drives the progress uniform
    var state = { progress: 0 };
    var tl = gsap.timeline({ paused: true });
    tl.to(state, {
      progress: 1,
      duration: ${duration},
      ease: 'none',
      onUpdate: function() {
        gl.uniform1f(uProgress, state.progress);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    });

    // Initial render
    gl.uniform1f(uProgress, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    window.__MP_TIMELINE = tl;
    window.__MP_DURATION = ${duration};
    window.__MP_READY = true;
  }

  imgA.onload = onLoad;
  imgB.onload = onLoad;
  imgA.onerror = function() { console.error('Image A failed'); onLoad(); };
  imgB.onerror = function() { console.error('Image B failed'); onLoad(); };
  imgA.src = 'data:image/png;base64,${frameABase64}';
  imgB.src = 'data:image/png;base64,${frameBBase64}';

  // Safety timeout: if images don't load in 10s, set ready anyway
  setTimeout(function() {
    if (!window.__MP_READY) {
      console.warn('Shader transition: timeout waiting for images, forcing ready');
      window.__MP_READY = true;
      window.__MP_DURATION = ${duration};
      window.__MP_TIMELINE = gsap.timeline({ paused: true });
    }
  }, 10000);
})();
</script>
</body>
</html>`;

  // Write and capture same as CSS transitions
  const htmlPath = path.join(workDir, "transition.html");
  await fs.writeFile(htmlPath, html);

  const framesDir = path.join(workDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  console.log(`  Shader transition: ${type} (${duration}s)`);

  try {
    const totalFrames = Math.ceil(duration * fps);
    await captureScene({
      htmlPath,
      outputDir: framesDir,
      width,
      height,
      fps,
      duration,
    });

    console.log(`  Captured ${totalFrames} shader frames`);

    const outputPath = path.join(workDir, "transition.mp4");
    await encodeScene({
      framesDir,
      outputPath,
      fps,
    });

    console.log(`  Encoded shader: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.warn(`  Shader transition ${type} failed, falling back to blur-crossfade: ${err}`);
    return renderTransition({ ...opts, type: "blur-crossfade" });
  }
}
