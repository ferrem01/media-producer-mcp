import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { roomFilter, roomSettings, roomVoiceCopy, ROOM_LOUDNESS_LUFS } from "../src/core/voice-room.js";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const meanDb = (file: string, ss: number, t: number) => Number(String(spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ss), "-t", String(t), "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr || "").match(/mean_volume: (-?[\d.]+)/)?.[1] ?? NaN);

describe("the room: a generated voice put back in the room the picture shows", () => {
  it("scales the room with the amount, clamped", () => {
    const light = roomSettings(0.2), heavy = roomSettings(0.9);
    expect(heavy.wet).toBeGreaterThan(light.wet);
    expect(heavy.decay).toBeGreaterThan(light.decay);
    expect(heavy.tone).toBeGreaterThan(light.tone);
    expect(roomSettings(5)).toEqual(roomSettings(1));
    expect(roomSettings(NaN)).toEqual(roomSettings(0.5));
    expect(ROOM_LOUDNESS_LUFS).toBeLessThan(-16);
  });

  it("builds the mic, the room and the room tone from filters the deployed ffmpeg 4.x has", () => {
    const f = roomFilter(0.5, 9);
    for (const part of ["highpass=f=95", "equalizer=f=3200", "acompressor", "afir", "anoisesrc=d=10:c=brown", "[room]"]) expect(f).toContain(part);
    // Mixed with amerge + pan: amix's `normalize` is newer than 4.x.
    expect(f).not.toMatch(/amix|normalize/);
    expect(f).toMatch(/pan=mono\|c0=c0\+0\.23\*c1\[voiced\]/);
  });

  it("is a test copy: room_test makes files beside the take and attaches nothing", () => {
    const src = fs.readFileSync("src/core/scene-performance.ts", "utf8");
    const body = src.slice(src.indexOf("export async function roomTestScene"), src.indexOf("export async function restoreSceneTake"));
    expect(body).toContain("roomVoiceCopy(");
    expect(body).not.toMatch(/attacher|doAttach|patch\(/);
    expect(fs.readFileSync("src/server.ts", "utf8")).toContain('"room_test"');
  });

  it.skipIf(!hasFfmpeg)("runs: the pauses hear the room instead of digital silence, the picture is copied", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-"));
    const dry = path.join(dir, "dry.mp4"), out = path.join(dir, "room.mp4");
    // Phrases 0.9 s on, 0.6 s off.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=160x120:d=3", "-f", "lavfi", "-i",
      "aevalsrc='(sin(2*PI*200*t)+0.5*sin(2*PI*1200*t))*0.2*lt(mod(t,1.5),0.9)':s=48000:d=3", "-c:v", "libx264", "-c:a", "aac", "-shortest", dry]);
    const r = await roomVoiceCopy(dry, out, { amount: 0.5, work: dir });
    expect(r.settings.amount).toBe(0.5);
    const gapDry = meanDb(dry, 1.05, 0.35), gapRoom = meanDb(out, 1.05, 0.35);
    expect(gapRoom).toBeGreaterThan(gapDry + 15);
    expect(gapRoom).toBeLessThan(-45);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60000);
});
