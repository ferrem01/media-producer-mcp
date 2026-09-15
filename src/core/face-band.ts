/**
 * Where is the face? (SPEC-take-flow.md, the layout that follows the person)
 *
 * The tall-frame speaker layout used fixed bands ("below the chin at 68%")
 * tuned to one chest-up selfie; a low camera put the face where the lower
 * band was. This measures the face in the take itself, once, at attach: a
 * handful of frames spread across the recording, a small frontal-face
 * cascade (pico, MIT -- vendored under src/vendor/pico), the median box.
 * The result rides on the take as fractions of the frame, and the layout
 * builds its bands around it. No face found -> null, and the layout keeps
 * its fixed bands.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pico, type PicoClassifier } from "../vendor/pico/pico.js";

const execFileAsync = promisify(execFile);

/** The face as fractions of the frame: center and size (the cascade's box
 *  is square, sized to the face height). */
export interface FaceBox { cx: number; cy: number; size: number; confidence: number }

/** The bands a layout may use, as fractions of the frame height/width. */
export interface FaceBand {
  /** The face itself, with a small margin: nothing goes here. */
  top: number; bottom: number; left: number; right: number;
}

let classifierPromise: Promise<PicoClassifier> | null = null;
async function classifier(): Promise<PicoClassifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      // dist/core -> dist/vendor/pico; src/core -> src/vendor/pico.
      const bytes = await fs.readFile(path.join(here, "..", "vendor", "pico", "facefinder"));
      return pico.unpack_cascade(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    })();
  }
  return classifierPromise;
}

/** Detect the largest confident face in one grayscale frame. */
export function detectInFrame(pixels: Uint8Array, width: number, height: number, classify: PicoClassifier): FaceBox | null {
  let dets = pico.run_cascade(
    { pixels, nrows: height, ncols: width, ldim: width },
    classify,
    { shiftfactor: 0.1, minsize: Math.round(Math.min(width, height) * 0.15), maxsize: Math.round(Math.max(width, height)), scalefactor: 1.1 },
  );
  dets = pico.cluster_detections(dets, 0.2).filter((d) => d[3] > 20).sort((a, b) => b[3] - a[3]);
  if (!dets.length) return null;
  const [r, c, s, q] = dets[0];
  return { cy: r / height, cx: c / width, size: s / height, confidence: q };
}

/**
 * Sample `frames` frames across the take (skipping the first and last
 * seconds) and return the median face, or null when fewer than half the
 * frames show one.
 */
export async function detectFace(filePath: string, duration: number, frames = 6): Promise<FaceBox | null> {
  const classify = await classifier();
  const W = 270, H = 480;
  const boxes: FaceBox[] = [];
  const span = Math.max(1, duration - 2);
  for (let i = 0; i < frames; i++) {
    const t = Math.min(Math.max(0.5, 1 + (span * (i + 0.5)) / frames), Math.max(0.5, duration - 0.5));
    let raw: Buffer;
    try {
      const { stdout } = await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-ss", String(t.toFixed(2)), "-i", filePath, "-frames:v", "1",
        "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-",
      ], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
      raw = stdout as unknown as Buffer;
    } catch { continue; }
    if (raw.length !== W * H) continue;
    const box = detectInFrame(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), W, H, classify);
    if (box) boxes.push(box);
  }
  if (boxes.length < Math.max(1, Math.ceil(frames / 2))) return null;
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    cx: round3(med(boxes.map((b) => b.cx))),
    cy: round3(med(boxes.map((b) => b.cy))),
    size: round3(med(boxes.map((b) => b.size))),
    confidence: round3(med(boxes.map((b) => b.confidence))),
  };
}

/** The no-go rectangle around a face, as fractions: the cascade's square is
 *  about the face height, so pad it into a head-and-chin region. */
export function faceBand(face: FaceBox): FaceBand {
  const halfH = face.size * 0.62;            // hairline to chin, plus a margin
  const halfW = face.size * 0.5 * (480 / 270) * 0.62; // the square in width fractions, padded
  return {
    top: round3(Math.max(0, face.cy - halfH)),
    bottom: round3(Math.min(1, face.cy + halfH)),
    left: round3(Math.max(0, face.cx - halfW)),
    right: round3(Math.min(1, face.cx + halfW)),
  };
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
