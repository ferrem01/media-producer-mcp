import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// "I am not exactly centered in the frame" (Marc, proj_c99e52c3): the
// "Marc at his desk" look is a LANDSCAPE digital twin; asked for 9:16 with
// fit cover, HeyGen cropped its middle wherever he sat. Now a look of the
// other orientation is asked for in its own shape and the recast's fit crops
// a portrait frame around the detected face.

const run = promisify(execFile);

describe("asking HeyGen for the look's own shape", () => {
  it("a landscape look in a portrait film is asked for 16:9 (and the reverse); a matching look keeps the take's", async () => {
    const { lookAspect } = await import("../src/core/performers/heygen.js");
    expect(lookAspect("landscape", 1080, 1920)).toBe("16:9");
    expect(lookAspect("portrait", 1920, 1080)).toBe("9:16");
    expect(lookAspect("portrait", 1080, 1920)).toBe("9:16");
    expect(lookAspect("landscape", 1920, 1080)).toBe("16:9");
    expect(lookAspect(undefined, 1080, 1920)).toBe("9:16");
    expect(lookAspect("landscape", 1080, 1080)).toBe("16:9");
  });
});

describe("cropping around the face", () => {
  it("centres the face across a portrait frame cut from a landscape picture, eyes two fifths down, inside the picture", async () => {
    const { placeCrop } = await import("../src/core/recast.js");
    // 1920x1080 covering 1080x1920 scales to 3413x1920.
    expect(placeCrop({ cx: 0.62, cy: 0.4 }, 3413, 1920, 1080, 1920)).toEqual({ x: 1576, y: 0 });
    expect(placeCrop({ cx: 0.5, cy: 0.4 }, 3413, 1920, 1080, 1920).x).toBe(1166);   // the old centre crop
    expect(placeCrop({ cx: 0.98, cy: 0.4 }, 3413, 1920, 1080, 1920).x).toBe(2334);  // clamped to the edge
    expect(placeCrop({ cx: 0.02, cy: 0.4 }, 3413, 1920, 1080, 1920).x).toBe(0);
    // A landscape frame cut from a portrait picture: the face two fifths down.
    expect(placeCrop({ cx: 0.5, cy: 0.3 }, 1920, 3413, 1920, 1080)).toEqual({ x: 0, y: 592 });
  });

  it("leaves a picture of the take's own shape to the plain centre crop", async () => {
    const { faceCrop } = await import("../src/core/recast.js");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-facecrop-"));
    const f = path.join(dir, "p.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=540x960:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", f]);
    expect(await faceCrop(f, 1080, 1920, 2)).toBeNull();
    // Another shape with no face in it: the centre is the fallback.
    const g = path.join(dir, "q.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=960x540:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", g]);
    expect(await faceCrop(g, 1080, 1920, 2)).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("a HeyGen recast made before the face crop is made again", () => {
    const src = require("node:fs").readFileSync(path.join(__dirname, "..", "src/core/recast.ts"), "utf8") as string;
    expect(src).toMatch(/performer\.id !== "heygen" \|\| existing\.framing === FRAMING/);
    expect(src).toMatch(/framing: FRAMING, .*made_at: now/);
  });
});
