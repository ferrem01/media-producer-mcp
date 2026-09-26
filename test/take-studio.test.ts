import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  studioGradeFilter, analyzeFrames, measureTake, faceEllipse, assumedFace,
  WB_CLAMP, EV_CLAMP, SKIN_PULL_MAX, CONTRAST_MAX, type TakeStudioStats, type RgbFrame,
} from "../src/core/take-studio.js";
import { gradeTake, ungradedPathOf, probeTake, sanitizeTake, hdrToSdrFilter } from "../src/core/take-sanitize.js";
import { queueTakeGrade } from "../src/core/take-grade.js";

const run = promisify(execFile);
const ffmpeg = async (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
type Rgb = [number, number, number];
const rb = (c: number[]) => c[0] / c[2];

/** Stats as the measure reports them; defaults are a clean, well-lit take. */
function stats(o: {
  bg?: Rgb; bgShare?: number; lit?: Rgb; shadow?: Rgb; skin?: Rgb; skinShare?: number;
  faceP50?: number; faceP95?: number; clip?: number; p5?: number; p95?: number;
} = {}): TakeStudioStats {
  const lit = o.lit ?? [214, 160, 136], shadow = o.shadow ?? [150, 110, 94];
  return {
    v: 1, frames: 8,
    face: { cx: 0.5, cy: 0.4, rx: 0.1, ry: 0.07, source: "detected" },
    luma: { p5: o.p5 ?? 0.04, p50: 0.5, p95: o.p95 ?? 0.9 },
    skin: {
      share: o.skinShare ?? 0.8, rgb: o.skin ?? [182, 135, 115], lit, shadow, split: "side",
      luma: { p10: 0.3, p50: o.faceP50 ?? 0.52, p95: o.faceP95 ?? 0.7 }, clip: o.clip ?? 0,
    },
    bg: { rgb: o.bg ?? [150, 150, 150], share: o.bgShare ?? 0.5, luma: 0.59 },
  };
}

// Marc's test take, 2026-09-26 (key panel on its warm setting), as the
// measure read it off IMG_2755: wall neutral, lit cheek orange, shadow
// cheek neutral, face and wall equally bright.
const MARC = stats({
  bg: [151, 154, 150], bgShare: 0.6, lit: [233.6, 150.5, 98.4], shadow: [145.8, 106.1, 85.8], skin: [192, 127, 90.4],
  faceP50: 0.596, faceP95: 0.722, p5: 0.094, p95: 0.725,
});

describe("the studio correction: stats -> filter", () => {
  it("pulls a warm key off the lit cheek, hue kept, the wall left neutral", () => {
    const c = studioGradeFilter(MARC);
    expect(c.skin).toBeGreaterThan(0.1);
    expect(c.skin).toBeLessThanOrEqual(SKIN_PULL_MAX);
    // A desaturation toward luma: red down, blue up, green nudged up.
    expect(c.skin_cmy![0]).toBeGreaterThan(0);
    expect(c.skin_cmy![2]).toBeLessThan(0);
    expect(c.filter).toMatch(/selectivecolor=correction_method=absolute:reds='[\d.]+ -?[\d.]+ -[\d.]+ 0'/);
    // The lit cheek comes most of the way to the shadow cheek, and the
    // shadow cheek never goes grey.
    expect(c.face_rb!.lit).toBeGreaterThan(2.2);
    expect(c.face_rb!.lit_after).toBeLessThan(1.95);
    expect(c.face_rb!.lit_after).toBeGreaterThan(c.face_rb!.shadow);
    expect(c.face_rb!.shadow_after).toBeGreaterThanOrEqual(1.3);
    // The wall is already grey: at most a nudge.
    for (const g of c.wb) expect(Math.abs(g - 1)).toBeLessThan(0.03);
    // Face median 0.60 is in the band: no exposure move.
    expect(c.ev).toBe(0);
    expect(c.notes.join("\n")).toMatch(/warm key: lit skin R\/B 2\.3\d vs shadow 1\.\d\d/);
  });

  it("clamps an extreme warm key and keeps the shadow cheek above the floor", () => {
    const c = studioGradeFilter(stats({ lit: [250, 150, 60], shadow: [170, 110, 90] }));
    expect(c.skin).toBeLessThanOrEqual(SKIN_PULL_MAX);
    for (const x of c.skin_cmy!) expect(Math.abs(x)).toBeLessThanOrEqual(0.5);
    expect(c.face_rb!.shadow_after).toBeGreaterThanOrEqual(1.3 - 1e-3);
    expect(c.notes.join("\n")).toMatch(/clamped from/);
  });

  it("leaves a warm skin tone alone when both cheeks agree (one light, not a coloured key)", () => {
    // A darker skin tone is warm on BOTH halves: R/B ~2.6 lit and shadow.
    const c = studioGradeFilter(stats({ lit: [180, 110, 70], shadow: [120, 72, 46], skin: [150, 92, 58] }));
    expect(c.skin).toBe(0);
    expect(c.filter).not.toMatch(/selectivecolor/);
  });

  it("a neutral, well-exposed, full-range take comes back as near-identity (null)", () => {
    const c = studioGradeFilter(stats());
    expect(c.filter).toBe("null");
    expect(c.wb).toEqual([1, 1, 1]);
    expect([c.skin, c.ev, c.contrast]).toEqual([0, 0, 0]);
  });

  it("a dark face gets a positive exposure lift, clamped to half a stop, through a curve pinned at 0 and 1", () => {
    const c = studioGradeFilter(stats({ faceP50: 0.25, faceP95: 0.4 }));
    expect(c.ev).toBe(EV_CLAMP);
    expect(c.face_luma!.after).toBeGreaterThan(c.face_luma!.before);
    expect(c.filter).toMatch(/curves=master='0\/0 0\.25\/0\.29\d* 1\/1'/);
    expect(c.notes.join("\n")).toMatch(/exposure: .*\(clamped\)/);
    // A little under the band: a small lift, not the clamp.
    const small = studioGradeFilter(stats({ faceP50: 0.42, faceP95: 0.6 }));
    expect(small.ev).toBeGreaterThan(0);
    expect(small.ev).toBeLessThan(EV_CLAMP);
    // Highlights protected: skin already clipping gets no lift at all.
    expect(studioGradeFilter(stats({ faceP50: 0.3, clip: 0.05 })).ev).toBe(0);
  });

  it("a bright face comes down, clamped", () => {
    const c = studioGradeFilter(stats({ faceP50: 0.85, faceP95: 0.97 }));
    expect(c.ev).toBeLessThan(0);
    expect(c.ev).toBeGreaterThanOrEqual(-EV_CLAMP);
  });

  it("neutralizes a cast room from the background, each gain clamped to 15%", () => {
    const c = studioGradeFilter(stats({ bg: [190, 150, 110], skin: [200, 150, 90], lit: [220, 165, 100], shadow: [160, 118, 72] }));
    expect(c.wb[0]).toBeLessThan(1);
    expect(c.wb[2]).toBeGreaterThan(1);
    for (const g of c.wb) expect(Math.abs(g - 1)).toBeLessThanOrEqual(WB_CLAMP + 1e-9);
    expect(c.filter).toMatch(/^colorchannelmixer=rr=0\.\d+:gg=[\d.]+:bb=1\.\d+/);
    expect(c.notes.join("\n")).toMatch(/clamped to \+-15%/);
  });

  it("backs the white balance off when it would turn the skin magenta (a beige wall, not a cast)", () => {
    // take-d (an older booth take): wall R/B 1.20, skin with little yellow.
    const c = studioGradeFilter(stats({ bg: [183, 178, 153], skin: [187.7, 133.3, 115.4], lit: [202.7, 146, 126.4], shadow: [161.2, 115.7, 99.6] }));
    const sk = [187.7 * c.wb[0], 133.3 * c.wb[1], 115.4 * c.wb[2]];
    expect((sk[1] - sk[2]) / (sk[0] - sk[2])).toBeGreaterThanOrEqual(0.17); // the floor, give or take the gains rounded to 3 places
    expect(c.wb[2]).toBeGreaterThan(1); // still toward neutral, only less
    expect(c.notes.join("\n")).toMatch(/turned the skin magenta/);
  });

  it("does not trust a thin background or a face with no skin", () => {
    const c = studioGradeFilter(stats({ bg: [200, 150, 100], bgShare: 0.01, skinShare: 0.02, lit: [250, 150, 60] }));
    expect(c.wb).toEqual([1, 1, 1]);
    expect(c.skin).toBe(0);
    expect(c.ev).toBe(0);
  });

  it("a flat frame gets a shadow curve that leaves the face and wall where they are", () => {
    const c = studioGradeFilter(stats({ p5: 0.2, p95: 0.7 }));
    expect(c.contrast).toBeGreaterThan(0);
    expect(c.contrast).toBeLessThanOrEqual(CONTRAST_MAX);
    expect(c.filter).toMatch(/curves=master='0\/0 0\.25\/0\.2\d+ 0\.6\/0\.6 1\/1'/);
  });
});

/** One portrait frame: a grey wall, and an elliptical "face" whose left half
 *  is lit orange and right half neutral skin. */
function frame(w: number, h: number, o: { lit: Rgb; shadow: Rgb; wall: Rgb; face: { cx: number; cy: number; rx: number; ry: number } }): RgbFrame {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = ((x + 0.5) / w - o.face.cx) / o.face.rx, dy = ((y + 0.5) / h - o.face.cy) / o.face.ry;
    const c = dx * dx + dy * dy <= 1 ? (dx < 0 ? o.lit : o.shadow) : o.wall;
    data.set(c, (y * w + x) * 3);
  }
  return { data, width: w, height: h };
}

describe("the studio correction: the measure", () => {
  it("finds the lit and shadow cheeks by side, and the wall's cast from the neutral pixels", () => {
    const face = { cx: 0.5, cy: 0.45, size: 0.14 };
    const region = faceEllipse(face);
    const f = frame(160, 284, { lit: [234, 151, 98], shadow: [146, 106, 86], wall: [160, 150, 140], face: region });
    const s = analyzeFrames([f, f], face);
    expect(s.face.source).toBe("detected");
    expect(s.skin.split).toBe("side");
    expect(s.skin.lit).toEqual([234, 151, 98]);
    expect(s.skin.shadow).toEqual([146, 106, 86]);
    expect(s.bg.rgb).toEqual([160, 150, 140]);
    expect(s.bg.share).toBeGreaterThan(0.5);
    expect(s.skin.share).toBeGreaterThan(0.9);
  });

  it("with no detected face, assumes the upper middle of a portrait frame", () => {
    const a = assumedFace(1080, 1920);
    expect(a.source).toBe("assumed");
    expect(a.cy).toBeLessThan(0.5);
    const f = frame(160, 284, { lit: [234, 151, 98], shadow: [146, 106, 86], wall: [150, 150, 150], face: a });
    const s = analyzeFrames([f], null);
    expect(s.skin.share).toBeGreaterThan(0.9);
    expect(rb(s.skin.lit)).toBeGreaterThan(2.3);
  });
});

describe("the studio correction on a real encode", () => {
  let dir: string;
  beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-studio-")); });

  /** A portrait clip: a grey wall and an orange-keyed "face" in the assumed
   *  face spot (no cascade finds a synthetic ellipse): lit half rgb(234,151,98),
   *  shadow half rgb(146,106,86). */
  async function orangeTake(name: string): Promise<string> {
    const file = path.join(dir, `${name}.mp4`);
    const W = 270, H = 480, cx = 0.5 * W, cy = 0.38 * H, rx = 0.17 * W, ry = 0.11 * H;
    const inFace = `lte(pow((X-${cx})/${rx},2)+pow((Y-${cy})/${ry},2),1)`;
    const ch = (lit: number, shadow: number, wall: number) => `if(${inFace},if(lt(X,${cx}),${lit},${shadow}),${wall})`;
    await ffmpeg(["-y", "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=30:d=2`,
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=2",
      "-vf", `format=gbrp,geq=r='${ch(234, 146, 150)}':g='${ch(151, 106, 152)}':b='${ch(98, 86, 150)}',format=yuv420p`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-c:a", "aac", file]);
    return file;
  }

  it("moves the orange face toward neutral, keeps the wall grey, keeps the original", async () => {
    const file = await orangeTake("orange");
    const original = await fs.readFile(file);
    const dur = (await probeTake(file)).duration;
    const before = await measureTake(file, { duration: dur, face: null, frames: 4 });
    expect(rb(before.skin.lit)).toBeGreaterThan(2.2);

    const g = await gradeTake(file, { look: "natural", correct: true });
    expect(g.correct).toBe(true);
    expect(g.studio!.applied.filter).toMatch(/selectivecolor/);
    expect((await fs.readFile(ungradedPathOf(file))).equals(original)).toBe(true); // the raw is kept
    const after = await measureTake(file, { duration: dur, face: null, frames: 4 });
    expect(rb(after.skin.lit)).toBeLessThan(rb(before.skin.lit) - 0.3); // the orange drains
    expect(rb(after.skin.lit)).toBeGreaterThan(rb(after.skin.shadow)); // still the warmer side
    expect(Math.abs(rb(after.bg.rgb) - 1)).toBeLessThan(0.04); // the wall stays grey
    const p = await probeTake(file);
    expect([p.width, p.height, p.hasAudio]).toEqual([270, 480, true]);

    // Off again: natural without the correction is the original, byte for byte.
    const off = await gradeTake(file, { look: "natural", correct: false });
    expect(off.studio).toBeUndefined();
    expect((await fs.readFile(file)).equals(original)).toBe(true);
  }, 60000);

  it("every grade from the queue carries the correction on the take record, and it can be switched off", async () => {
    const file = await orangeTake("queued");
    const url = "/assets/t1/projects/p1/assets/queued.mp4";
    let stored: any = {
      tenant_id: "t1", project_id: "p1", storyboard: { scenes: [{ label: "a" }] }, scenes: [],
      takes: [{ id: "take_0", scene_index: 0, source: url, recorded_at: "x", look: "natural" }],
      speaker_track: { clips: [] },
    };
    const saves: any[] = [];
    const job = (o: { look: "soft" | "natural"; correct?: boolean; strength?: number }) => ({
      tenantId: "t1", projectId: "p1", rawUrl: url, dataDir: dir, ...o,
      resolvePath: () => file,
      loadProject: async () => JSON.parse(JSON.stringify(stored)),
      saveProject: async (p: any) => { stored = p; saves.push(JSON.parse(JSON.stringify(p))); },
    });
    const settle = async (n: number) => { for (let i = 0; i < 300 && saves.length < n; i++) await new Promise((r) => setTimeout(r, 100)); };

    queueTakeGrade(job({ look: "natural" })); // arrival: on by default
    await settle(1);
    let t = stored.takes[0];
    expect(t.correct).toBeUndefined();
    expect(t.grade.measured.v).toBe(1);
    expect(t.grade.skin).toBeGreaterThan(0);
    expect(t.grade.filter).toMatch(/selectivecolor/);
    expect(t.grade.notes.join("\n")).toMatch(/warm key/);
    const measured = JSON.stringify(t.grade.measured);

    queueTakeGrade(job({ look: "soft", strength: 0.3 })); // a look re-grade keeps it
    await settle(2);
    t = stored.takes[0];
    expect(t.look).toBe("soft");
    expect(t.grade.filter).toMatch(/selectivecolor/);
    expect(JSON.stringify(t.grade.measured)).toBe(measured); // measured once, reused

    queueTakeGrade(job({ look: "natural", correct: false }));
    await settle(3);
    t = stored.takes[0];
    expect(t.correct).toBe(false);
    expect(t.grade.off).toBe(true);
    expect(t.grade.filter).toBeUndefined();
    expect((await fs.readFile(file)).equals(await fs.readFile(ungradedPathOf(file)))).toBe(true);

    queueTakeGrade(job({ look: "natural" })); // the setting sticks when a job does not say
    await settle(4);
    expect(stored.takes[0].correct).toBe(false);
  }, 90000);
});

describe("HDR takes become SDR at sanitize", () => {
  let dir: string;
  beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-hdr-")); });

  it("builds the tone map (zscale + mobius at 203 nits) and an approximate fallback", () => {
    expect(hdrToSdrFilter("hlg")).toMatch(/^zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:rin=tv:t=linear:npl=203,.*tonemap=tonemap=mobius.*zscale=t=bt709:m=bt709:r=tv,format=yuv420p$/);
    expect(hdrToSdrFilter("pq", { fullRange: true })).toMatch(/tin=smpte2084:.*:rin=pc:/);
    expect(hdrToSdrFilter("hlg", { fallback: true })).toMatch(/^colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:format=yuv420p,curves=all='0\/0 0\.375\/0\.42 0\.75\/0\.86 1\/1'$/);
  });

  it("an HLG-tagged take is detected, tone-mapped and stored bt709; an SDR take is not", async () => {
    const sdr = path.join(dir, "sdr.mp4");
    await ffmpeg(["-y", "-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30:duration=1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", sdr]);
    expect((await probeTake(sdr)).hdr).toBeUndefined();
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-filters"]).catch((e) => e);
    const filters = String((await run("ffmpeg", ["-hide_banner", "-filters"])).stdout || stderr || "");
    const hlg = path.join(dir, "hlg.mp4");
    const toHlg = / zscale /.test(filters)
      ? ["-vf", "zscale=rin=tv:tin=bt709:min=bt709:pin=bt709:t=linear:npl=203,format=gbrpf32le,zscale=p=bt2020:t=arib-std-b67:m=bt2020nc:r=tv:npl=203,format=yuv420p10le"]
      : ["-pix_fmt", "yuv420p10le"];
    await ffmpeg(["-y", "-i", sdr, ...toHlg, "-c:v", "libx264", "-preset", "ultrafast",
      "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", hlg]);
    expect((await probeTake(hlg)).hdr).toBe("hlg");
    // What the take looked like before this: an 8-bit re-encode, no tone map.
    const naive = path.join(dir, "naive.mp4");
    await ffmpeg(["-y", "-i", hlg, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", naive]);
    const r = await sanitizeTake(hlg);
    expect(r.tonemapped?.from).toBe("hlg");
    expect(r.probe.hdr).toBeUndefined();
    const table = String((await run("ffmpeg", ["-hide_banner", "-i", hlg]).catch((e) => e)).stderr || "");
    expect(table).toMatch(/yuv420p\(tv, bt709/);
    if (/ zscale /.test(filters)) {
      // Luma and chroma of one frame, as a bt709 player shows it: the tone
      // map lands nearer the SDR it started as than the naive encode does
      // (which is grey: flat and desaturated).
      const look = async (f: string) => {
        const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", f, "-frames:v", "1", "-vf", "scale=64:-2", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" } as any);
        const b = stdout as unknown as Buffer; let y = 0, c = 0;
        for (let i = 0; i < b.length; i += 3) { y += 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]; c += Math.max(b[i], b[i + 1], b[i + 2]) - Math.min(b[i], b[i + 1], b[i + 2]); }
        const n = b.length / 3; return { y: y / n, c: c / n };
      };
      const [a, t, nv] = [await look(sdr), await look(hlg), await look(naive)];
      expect(Math.abs(t.c - a.c)).toBeLessThan(Math.abs(nv.c - a.c));
      expect(Math.abs(t.y - a.y)).toBeLessThan(20);
      expect(t.c).toBeGreaterThan(nv.c);
    }
  }, 60000);
});
