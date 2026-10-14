import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A REAL PERSON (SPEC-real-person.md): added with a name and consent and no
// photo, then built from the three clips they record -- far, close, turn.
// The close clip makes the portrait and the front still, the turn clip the
// three-quarter stills, the far clip the 15 s reference (its most-spoken
// window). Until the close clip lands nothing can perform them.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-foundation-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t";

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

/** A phone-like clip: a moving test picture and a tone that falls silent
 *  over [quietFrom, quietTo) -- the far clip's "pause" the reference skips. */
async function clip(out: string, seconds: number, quiet?: [number, number]) {
  const vol = quiet ? `volume='if(between(t,${quiet[0]},${quiet[1]}),0,1)':eval=frame` : "volume=1";
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=s=640x360:r=24:d=${seconds}`,
    "-f", "lavfi", "-i", `sine=f=220:d=${seconds}`, "-af", vol, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out]);
}
const dur = async (f: string) => {
  const e = await run("ffmpeg", ["-hide_banner", "-i", f]).then(() => "", (x: any) => String(x.stderr || ""));
  const m = e.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

describe("a real person's foundation", () => {
  it("picks the reference window with the most speech, after the settle", async () => {
    const { bestWindow } = await import("../src/core/actor-foundation.js");
    expect(bestWindow(60, [])).toBe(2);                                  // all speech: just after sitting back
    expect(bestWindow(60, [{ from: 0, to: 20 }])).toBe(20);              // a long silent start is skipped
    expect(bestWindow(40, [{ from: 10, to: 14 }, { from: 30, to: 40 }])).toBe(14);
    expect(bestWindow(12, [])).toBe(0);                                  // shorter than the window: all of it
  });

  it("starts with no picture, is built clip by clip, and leaves no files when removed", async () => {
    const { addActor, removeActor, getActor, needPicture } = await import("../src/core/cast.js");
    const { saveFoundationClip, foundationState } = await import("../src/core/actor-foundation.js");
    await expect(addActor(T, { name: "Marc", real: true })).rejects.toThrow(/consent/);
    const marc = await addActor(T, { name: "Marc", real: true, consent: true });
    expect(marc.consent?.at).toBeTruthy();
    expect(marc.foundation).toEqual({ clips: [], stills: [] });
    expect(foundationState(marc)).toEqual({ recorded: [], missing: ["far", "close", "turn"], complete: false });
    // Nothing performs a person with no picture.
    await expect(needPicture(T, marc)).rejects.toThrow(/record their foundation/);

    const tmp = path.join(DATA, "in"); await fs.mkdir(tmp, { recursive: true });
    await clip(path.join(tmp, "short.mp4"), 3);
    await expect(saveFoundationClip(T, "marc", "close", path.join(tmp, "short.mp4"))).rejects.toThrow(/at least 8 s/);

    await clip(path.join(tmp, "close.mp4"), 10);
    let a = await saveFoundationClip(T, "marc", "close", path.join(tmp, "close.mp4"));
    expect(a.foundation!.clips.map((c) => c.kind)).toEqual(["close"]);
    expect(a.foundation!.stills.map((s) => s.kind)).toEqual(["front"]);
    await expect(needPicture(T, a)).resolves.toBeTruthy();                // the close clip made the portrait
    expect(await fs.stat(path.join(DATA, T, a.portrait)).then((s) => s.size > 0)).toBe(true);

    await clip(path.join(tmp, "turn.mp4"), 6);
    a = await saveFoundationClip(T, "marc", "turn", path.join(tmp, "turn.mp4"));
    expect(a.foundation!.stills.map((s) => s.kind).sort()).toEqual(["front", "left", "right"]);
    expect(a.foundation!.made_at).toBeUndefined();

    // The far clip: 30 s, silent for its first 8 s -- the reference starts after the pause.
    await clip(path.join(tmp, "far.mp4"), 30, [0, 8]);
    a = await saveFoundationClip(T, "marc", "far", path.join(tmp, "far.mp4"));
    expect(foundationState(a).complete).toBe(true);
    expect(a.foundation!.made_at).toBeTruthy();
    expect(a.foundation!.clips.map((c) => c.kind)).toEqual(["far", "close", "turn"]);
    const ref = path.join(DATA, T, a.foundation!.ref_video!);
    expect(await dur(ref)).toBeGreaterThan(14.5);
    expect(await dur(ref)).toBeLessThan(15.5);
    const refProbe = await run("ffmpeg", ["-hide_banner", "-i", ref]).then(() => "", (x: any) => String(x.stderr || ""));
    expect(refProbe).not.toMatch(/Audio:/);                               // who and how they move, not a voice

    // Recording a clip again replaces it (and keeps the others).
    await clip(path.join(tmp, "close2.mp4"), 12);
    a = await saveFoundationClip(T, "marc", "close", path.join(tmp, "close2.mp4"));
    expect(a.foundation!.clips.find((c) => c.kind === "close")!.seconds).toBeCloseTo(12, 0);
    expect(a.foundation!.clips).toHaveLength(3);
    expect((await getActor(T, "marc"))!.foundation!.clips).toHaveLength(3);

    const files = [a.portrait, a.foundation!.ref_video!, ...a.foundation!.clips.map((c) => c.file), ...a.foundation!.stills.map((s) => s.file)];
    expect(await removeActor(T, "marc")).toBe(true);
    for (const f of files) await expect(fs.access(path.join(DATA, T, f))).rejects.toThrow();
  }, 120_000);

  it("makes an uploaded clip in the background, and says why when it cannot", async () => {
    const { addActor, getActor } = await import("../src/core/cast.js");
    const { startFoundationClip, foundationIdle } = await import("../src/core/actor-foundation.js");
    await addActor(T, { name: "Ana", real: true, consent: true });
    const tmp = path.join(DATA, "in3"); await fs.mkdir(tmp, { recursive: true });
    await clip(path.join(tmp, "turn.mp4"), 6);
    const started = await startFoundationClip(T, "ana", "turn", path.join(tmp, "turn.mp4"));
    expect(started.foundation!.work).toEqual([expect.objectContaining({ kind: "turn", status: "processing" })]);
    await foundationIdle();
    let a = (await getActor(T, "ana"))!;
    expect(a.foundation!.work).toBeUndefined();
    expect(a.foundation!.clips.map((c) => c.kind)).toEqual(["turn"]);
    await expect(fs.access(path.join(tmp, "turn.mp4"))).rejects.toThrow();   // the upload is gone
    // Too short: the clip is not kept, and the actor says why.
    await clip(path.join(tmp, "far.mp4"), 4);
    await startFoundationClip(T, "ana", "far", path.join(tmp, "far.mp4"));
    await foundationIdle();
    a = (await getActor(T, "ana"))!;
    expect(a.foundation!.work).toEqual([expect.objectContaining({ kind: "far", status: "failed", error: expect.stringMatching(/at least 20 s/) })]);
    expect(a.foundation!.clips.map((c) => c.kind)).toEqual(["turn"]);
    // Not a video at all.
    await fs.writeFile(path.join(tmp, "junk.bin"), "not a video");
    await startFoundationClip(T, "ana", "close", path.join(tmp, "junk.bin"));
    await foundationIdle();
    a = (await getActor(T, "ana"))!;
    expect(a.foundation!.work!.find((w) => w.kind === "close")!.error).toMatch(/could not be read as a video/);
  }, 60_000);

  it("is only for a real person", async () => {
    const { addActor } = await import("../src/core/cast.js");
    const { saveFoundationClip } = await import("../src/core/actor-foundation.js");
    await fs.mkdir(path.join(DATA, T, "assets"), { recursive: true });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=320x400", "-frames:v", "1", path.join(DATA, T, "assets", "dana.png")]);
    await addActor(T, { name: "Dana", image: "assets/dana.png", fictional: true });
    const tmp = path.join(DATA, "in2"); await fs.mkdir(tmp, { recursive: true });
    await clip(path.join(tmp, "c.mp4"), 9);
    await expect(saveFoundationClip(T, "dana", "close", path.join(tmp, "c.mp4"))).rejects.toThrow(/real person/);
  }, 60_000);
});
