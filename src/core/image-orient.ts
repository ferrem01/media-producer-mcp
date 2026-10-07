/**
 * UPRIGHT PHOTOS. A phone stores a portrait photo sideways and says so in
 * its EXIF Orientation tag; the server's ffmpeg (4.4) ignores the tag when it
 * re-encodes, so Marc's cast photos (Oct 7) landed on their side. We read
 * the tag ourselves and turn the picture with an explicit filter, with
 * -noautorotate so a newer ffmpeg that does honour the tag never turns it
 * twice. HEIC (an iPhone's own format) is named plainly: ffmpeg 4.4 can't
 * read it.
 */
import fs from "node:fs/promises";

/** The EXIF Orientation of a JPEG (1 = upright; 1 when there is none). */
export async function jpegOrientation(file: string): Promise<number> {
  let b: Buffer;
  try { b = (await fs.readFile(file)).subarray(0, 256 * 1024); } catch { return 1; }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker === 0xe1 && b.toString("latin1", i + 4, i + 10) === "Exif\0\0") {
      const t = i + 10, le = b.toString("latin1", t, t + 2) === "II";
      const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
      const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
      if (t + 8 > b.length) return 1;
      const ifd = t + u32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > b.length) break;
        if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
      }
      return 1;
    }
    if (marker === 0xda) break; // image data: no EXIF before it
    i += 2 + len;
  }
  return 1;
}

/** The ffmpeg filter that stands an image with this Orientation upright. */
export function orientFilter(o: number): string {
  return ({ 2: "hflip", 3: "hflip,vflip", 4: "vflip", 5: "transpose=0", 6: "transpose=1", 7: "transpose=3", 8: "transpose=2" } as Record<number, string>)[o] || "";
}

/** True for HEIC / HEIF (an iPhone's own photo format). */
export async function isHeic(file: string): Promise<boolean> {
  try {
    const fh = await fs.open(file, "r");
    try {
      const buf = Buffer.alloc(16);
      await fh.read(buf, 0, 16, 0);
      return buf.toString("latin1", 4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1|avif)$/.test(buf.toString("latin1", 8, 12));
    } finally { await fh.close(); }
  } catch { return false; }
}

/** ffmpeg arguments for one upright still from an uploaded image: the input
 *  flags and the filter to put before the caller's own (scale ...). */
export async function uprightInput(file: string): Promise<{ pre: string[]; vf: (rest: string) => string }> {
  if (await isHeic(file)) throw new Error("That photo is HEIC (an iPhone's own format), which the server can't read yet. On the iPhone: Settings > Camera > Formats > Most Compatible, or share it as a JPEG.");
  const turn = orientFilter(await jpegOrientation(file));
  return { pre: ["-noautorotate"], vf: (rest: string) => (turn ? `${turn},${rest}` : rest) };
}
