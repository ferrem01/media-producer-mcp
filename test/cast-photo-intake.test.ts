import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A CAST MEMBER'S PHOTOS ON THE WAY IN (Marc, Oct 7): phone photos stood on
// their side (the EXIF turn was ignored), and the uploads they were made from
// stayed in the library. Now a photo stands upright, a HEIC is named, and the
// uploads go -- at once when copied, and all of them when a member is removed.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-cast-intake-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t";
const LIB = path.join(DATA, T, "projects", "library", "assets");
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });
const size = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || "").match(/, (\d+)x(\d+)/)?.slice(1, 3).join("x") || ""; } };

/** A JPEG that says "turn me 90 degrees clockwise" (EXIF Orientation 6), the way a phone stores a portrait photo. */
async function sidewaysJpeg(out: string): Promise<void> {
  const plain = out + ".plain.jpg";
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=300x100", "-frames:v", "1", plain]);
  const jpg = await fs.readFile(plain);
  const tiff = Buffer.from("4d4d002a00000008" + "0001" + "011200030000000100060000" + "00000000", "hex");
  const head = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, head.length + 2]), head]);
  await fs.writeFile(out, Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]));
  await fs.rm(plain);
}

describe("a cast member's photos on the way in", () => {
  it("reads a phone's EXIF turn and stands the photo upright", async () => {
    await fs.mkdir(LIB, { recursive: true });
    const { jpegOrientation, orientFilter } = await import("../src/core/image-orient.js");
    const f = path.join(LIB, "cast-2026-10-07T21-54-01-954Z.jpg");
    await sidewaysJpeg(f);
    expect(await jpegOrientation(f)).toBe(6);
    expect(orientFilter(6)).toBe("transpose=1");
    expect(orientFilter(1)).toBe("");
    const cast = await import("../src/core/cast.js");
    const marc = await cast.addActor(T, { name: "Marc", image: "projects/library/assets/cast-2026-10-07T21-54-01-954Z.jpg", consent: true });
    expect(await size(path.join(DATA, T, marc.portrait))).toBe("100x300");   // upright: tall, not wide
    await expect(fs.access(f)).rejects.toThrow();                              // the upload went once copied
    const p = path.join(LIB, "cast-photo-2026-10-07T21-55-00-001Z.jpg");
    await sidewaysJpeg(p);
    const a = await cast.addActorPhoto(T, marc.id, "projects/library/assets/cast-photo-2026-10-07T21-55-00-001Z.jpg");
    expect(await size(path.join(DATA, T, a.photos![0]))).toBe("100x300");
    await expect(fs.access(p)).rejects.toThrow();
  });

  it("names a HEIC instead of failing silently, and drops it", async () => {
    const cast = await import("../src/core/cast.js");
    const h = path.join(LIB, "cast-photo-2026-10-07T21-56-00-002Z.heic");
    await fs.writeFile(h, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic", "latin1"), Buffer.alloc(64)]));
    await expect(cast.addActorPhoto(T, "marc", "projects/library/assets/cast-photo-2026-10-07T21-56-00-002Z.heic")).rejects.toThrow(/HEIC/);
    await expect(fs.access(h)).rejects.toThrow();
  });

  it("removing a member deletes their files and every Cast-page upload still in the library; other library files stay", async () => {
    const cast = await import("../src/core/cast.js");
    const left = path.join(LIB, "cast-photo-2026-10-07T21-57-00-003Z.jpg");   // a photo that never made it in
    const other = path.join(LIB, "logo.png");
    await fs.writeFile(left, "x"); await fs.writeFile(other, "x");
    const marc = (await cast.getActor(T, "marc"))!;
    const kept = [marc.portrait, ...(marc.photos || [])].map((f) => path.join(DATA, T, f));
    expect(await cast.removeActor(T, "marc")).toBe(true);
    for (const f of [...kept, left]) await expect(fs.access(f)).rejects.toThrow();
    await fs.access(other);
    // A sweep with an age floor leaves a photo still on its way in.
    const fresh = path.join(LIB, "cast-photo-2026-10-07T21-58-00-004Z.jpg");
    await fs.writeFile(fresh, "x");
    expect(await cast.sweepIntake(T)).toBe(0);
    await fs.access(fresh);
  });
});
