import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeBeats, quantizeToBars, quantizeUpToBars } from "../src/audio/beat-map.js";

const execFileAsync = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

describe("quantizeToBars", () => {
  it("snaps to the nearest whole bar", () => {
    expect(quantizeToBars(4.2, 2.0)).toBe(4.0);
    expect(quantizeToBars(5.1, 2.0)).toBe(6.0);
    expect(quantizeToBars(6.0, 2.0)).toBe(6.0);
  });

  it("never goes below the minimum bar count", () => {
    expect(quantizeToBars(0.3, 2.0)).toBe(2.0);
    expect(quantizeToBars(0.3, 2.0, 2)).toBe(4.0);
  });

  it("passes through when barSec is invalid", () => {
    expect(quantizeToBars(4.2, 0)).toBe(4.2);
  });
});

describe("quantizeUpToBars", () => {
  it("rounds up to the next whole bar", () => {
    expect(quantizeUpToBars(4.2, 2.0)).toBe(6.0);
    expect(quantizeUpToBars(6.0, 2.0)).toBe(6.0);
  });
});

describe("analyzeBeats (needs ffmpeg)", () => {
  it("recovers tempo and downbeat from synthetic click tracks", async () => {
    if (!(await hasFfmpeg())) {
      console.warn("ffmpeg not available; skipping analyzeBeats test");
      return;
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "beatmap-test-"));
    try {
      // 120 BPM: beat every 0.5s, accented downbeat every 2.0s, first beat at 0.25s.
      // The accent pattern deliberately baits the tempo-halving octave error.
      const file = path.join(tmp, "click120.wav");
      await execFileAsync("ffmpeg", [
        "-y", "-v", "quiet", "-f", "lavfi",
        "-i",
        "aevalsrc='if(lt(mod(t-0.25,2.0),0.06),0.9*sin(2*PI*220*t),if(lt(mod(t-0.25,0.5),0.05),0.45*sin(2*PI*880*t),0.005*random(0)))':s=22050:d=30",
        file,
      ]);

      const m = await analyzeBeats(file);

      expect(Math.abs(m.bpm - 120)).toBeLessThan(1);
      expect(Math.abs(m.barSec - 2.0)).toBeLessThan(0.02);
      // Any downbeat of the true grid is a valid firstDownbeatSec
      const barOff = (((m.firstDownbeatSec - 0.25) % m.barSec) + m.barSec) % m.barSec;
      const downErr = Math.min(barOff, m.barSec - barOff);
      expect(downErr).toBeLessThan(0.1);
      expect(m.confidence).toBeGreaterThan(0.2);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }, 30000);
});
