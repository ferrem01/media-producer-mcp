/**
 * fill 'blur' through a REAL render (Oct 26). A 9:16 take on fill 'blur' in
 * a 4:5 LinkedIn frame rendered with only the blurred copy and a dark side:
 * the render worker hides each <video> and appends an <img> of its frames,
 * and the sharp copy -- position: relative -- had its img flow BELOW the
 * hidden video, out of the frame. Studio, playing the live <video>, looked
 * right. This renders the component and measures the frame.
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { renderProject } from "../src/core/render.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../test-output/video-fill-render");
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

beforeAll(async () => {
  config.componentLibDir = path.resolve(__dirname, "../src/components");
  config.gsapDir = path.resolve(__dirname, "../vendor/gsap");
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
});

/** Gray frame at t as rows of pixels. */
function frameAt(file: string, t: number, w: number): number[][] {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 << 20 });
  const rows: number[][] = [];
  for (let y = 0; y < raw.length / w; y++) rows.push(Array.from(raw.subarray(y * w, (y + 1) * w)));
  return rows;
}
const region = (img: number[][], x0: number, x1: number) => {
  let sum = 0, edge = 0, n = 0;
  for (const row of img.slice(40, -40)) for (let x = x0; x < x1 - 1; x++) { sum += row[x]; edge += Math.abs(row[x + 1] - row[x]); n++; }
  return { mean: sum / n, edge: edge / n };
};

describe("video fill 'blur' in a render", () => {
  it.skipIf(!hasFfmpeg)("the whole clip sits sharp in the middle over its blurred copy, both sides lit", async () => {
    // A 9:16 clip with grain everywhere (fine detail a blur wipes out) and a bright floor.
    // A fresh name each run: extracted frames are cached by the clip's path.
    const clip = path.join(OUT, `tall-${Date.now()}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=2",
      "-vf", "eq=brightness=0.25,noise=alls=50:allf=t", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
    const W = 400, H = 500;
    const project: Project = {
      project_id: "proj_fill", tenant_id: "test", name: "fill blur", format: "video", status: "draft",
      canvas: { width: W, height: H, frame: "4x5", fps: 10, background: "#000000" },
      brand_kit: { colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#000000", surface: "#111111", text: "#ffffff", text_muted: "#94a3b8" }, fonts: [], style: { border_radius: "8px", motion: "cinematic" } } as any,
      scenes: [{ id: "s1", label: "Take", duration_seconds: 1.5, components: [
        { id: "v", type: "video", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 1, data: { src: clip, fill: "blur", object_fit: "cover" } },
      ] }],
    } as any;
    const out = path.join(OUT, "out.mp4");
    await renderProject({ project, workDir: path.join(OUT, "work"), componentLibDir: config.componentLibDir, gsapDir: config.gsapDir, outputPath: out });
    const img = frameAt(out, 0.8, W);
    // The sharp clip is ~281 px wide (500 * 9/16), leaving ~59 px each side;
    // measure well inside each part, clear of the seam between them.
    const left = region(img, 2, 30), right = region(img, W - 30, W - 2), mid = region(img, 120, 280);
    const seen = JSON.stringify({ left, mid, right, whole: region(img, 0, W) });
    // Both sides show the blurred copy (not black), and stay soft.
    expect(left.mean, seen).toBeGreaterThan(40);
    expect(right.mean, seen).toBeGreaterThan(40);
    // The middle is the sharp clip: far more detail than the blurred sides.
    expect(mid.edge, seen).toBeGreaterThan(2 * Math.max(left.edge, right.edge));
  }, 240000);
});
