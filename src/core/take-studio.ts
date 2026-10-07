/**
 * THE STUDIO CORRECTION -- every booth take, on arrival, before the soft look.
 *
 * A phone at arm's length in a room is lit by whatever is there. Marc's
 * test take (2026-09-26, the ring panel on its warm setting) measured from
 * frames: the LIT cheek R/B ~2.3 (orange), the SHADOW cheek ~1.55 and the
 * wall ~0.98 (both neutral), the wall's luma ~158 as bright as the face
 * (~130-168). Nothing corrected colour or exposure; the soft look only
 * smoothed and warmed it further.
 *
 * Two halves, both deterministic:
 *
 *  MEASURE (measureTake -> analyzeFrames): ~8 frames across the take at
 *  160 px wide, rgb24 straight into Node. The face comes from the take's
 *  own detection (core/face-band.ts, `take.face`, measured at attach); no
 *  face -> an assumed ellipse in the upper middle, and a skin-colour mask
 *  inside it either way so hair, eyes and wall never count as skin. Out of
 *  that: the whole frame's luma percentiles, the skin's luma percentiles,
 *  the skin's colour split into its LIT and SHADOW halves (by side of the
 *  face -- the two cheeks -- else by luma), and the background's cast from
 *  the near-neutral pixels well outside the head.
 *
 *  CORRECT (studioGradeFilter): a pure function, stats -> ffmpeg filter
 *  string, every move clamped, every move skipped inside a dead band so a
 *  well-shot take passes through as `null`:
 *   1. WHITE BALANCE from the background (walls are near-neutral): per
 *      channel gains toward grey, luma-preserving, each clamped to +-15%
 *      (colorchannelmixer).
 *   2. A WARM KEY on the skin: the lit half of the face far warmer than the
 *      shadow half is a coloured light, not a skin tone (one neutral light
 *      gives both halves about the same R/B; a darker skin tone is warmer
 *      on BOTH halves, and is left alone). The excess is desaturated out
 *      of the red-dominant pixels only, hue kept, in proportion to their
 *      chroma (selectivecolor, reds range, absolute) -- a neutral wall at
 *      the same brightness has no chroma and is not touched, which a
 *      highlights/midtones colour balance could not promise.
 *   3. EXPOSURE: the face median into 0.45-0.70 of full range, at most
 *      +-0.5 stop, through a curve pinned at black and white so highlights
 *      roll off instead of clipping; no lift at all when the face already
 *      clips.
 *   4. CONTRAST: the lower half of a gentle S (the shadows deepen, the
 *      face and wall stay put), scaled by how flat the frame measures.
 *  A background pull-down would need a mask (the wall and the lit cheek
 *  share a luma range) -- deliberately not done.
 *
 * The raw take is never touched: the grade runs off the kept original
 * (core/take-sanitize.ts, gradeTake), so turning it off is a re-grade.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** One sampled frame, rgb24. */
export interface RgbFrame { data: Uint8Array; width: number; height: number }

/** The face as the take's detector reports it (fractions of the frame;
 *  `size` is the face height; core/face-band.ts). */
export interface FaceHint { cx: number; cy: number; size: number }

type Rgb = [number, number, number];

/** What the measure saw -- stored on the take (`take.grade.measured`) so a
 *  re-grade reuses it and a reader can see why the correction did what it
 *  did. Colours are means in 0-255; lumas are fractions of full range. */
export interface TakeStudioStats {
  v: 1;
  frames: number;
  /** The face region used (fractions of the frame): detected, or assumed. */
  face: { cx: number; cy: number; rx: number; ry: number; source: "detected" | "assumed" };
  /** Whole-frame luma percentiles. */
  luma: { p5: number; p50: number; p95: number };
  /** The skin pixels inside the face region. `share` is the fraction of the
   *  region that read as skin; `clip` the fraction of skin at >= 0.97. */
  skin: { share: number; rgb: Rgb; lit: Rgb; shadow: Rgb; split: "side" | "luma"; luma: { p10: number; p50: number; p95: number }; clip: number };
  /** Near-neutral pixels outside the head: their median colour and the
   *  fraction of the frame they cover. */
  bg: { rgb: Rgb; share: number; luma: number };
}

/** What the correction applied -- the numbers behind the filter. */
export interface TakeStudioCorrection {
  /** Per-channel gains (1 = untouched). */
  wb: Rgb;
  /** Warm-key pull: how far the lit skin was desaturated toward grey
   *  (0 = untouched), and the selectivecolor reds c/m/y that do it. */
  skin: number;
  skin_cmy?: Rgb;
  /** Exposure, stops (gamma-encoded gain 2^(ev/2.2) at the face median). */
  ev: number;
  /** S-curve amount (0 = none). */
  contrast: number;
  /** The face's lit/shadow R/B before and (predicted) after. */
  face_rb?: { lit: number; shadow: number; lit_after: number; shadow_after: number };
  /** Face median luma before and (predicted) after. */
  face_luma?: { before: number; after: number };
  /** One line per decision, measured numbers included. */
  notes: string[];
  /** The ffmpeg filter chain, "null" when nothing was worth doing. */
  filter: string;
}

// ── measure ──────────────────────────────────────────────────────────────

/** Rec.709 luma of gamma-encoded RGB (0-255 in, 0-255 out). */
const luma709 = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Where the face is assumed to be when none was detected: a selfie framing
 *  puts it centred in the upper-middle. Portrait frames put it higher and
 *  narrower. The skin mask does the rest. */
export function assumedFace(width: number, height: number): TakeStudioStats["face"] {
  return height >= width
    ? { cx: 0.5, cy: 0.38, rx: 0.17, ry: 0.11, source: "assumed" }
    : { cx: 0.5, cy: 0.4, rx: 0.1, ry: 0.18, source: "assumed" };
}

/** The ellipse that covers a detected face: pico's square box is about the
 *  face height; detectFace stretched the frame to 270x480, so in width
 *  fractions the box is size * 480/270 (the same math faceBand uses). */
export function faceEllipse(face: FaceHint): TakeStudioStats["face"] {
  const wFrac = face.size * (480 / 270);
  return { cx: r3(face.cx), cy: r3(face.cy), rx: r3(wFrac * 0.42), ry: r3(face.size * 0.52), source: "detected" };
}

/** Skin, by colour: red over green over blue with real chroma, a hue in the
 *  orange band (green sits between blue and red), not black, not blown. */
function isSkin(r: number, g: number, b: number): boolean {
  if (!(r > g && g > b)) return false;
  if (r < 50 || r - b < 12) return false;
  const hue = (g - b) / (r - b); // 0 = magenta-red, 1 = yellow
  return hue > 0.12 && hue < 0.85;
}

function histPercentile(hist: Uint32Array, total: number, p: number): number {
  if (!total) return 0;
  const want = p * (total - 1);
  let acc = 0;
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc > want) return i; }
  return hist.length - 1;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** The pure half of the measure: frames in, stats out. */
export function analyzeFrames(frames: RgbFrame[], face?: FaceHint | null): TakeStudioStats {
  const W = frames[0]?.width || 1, H = frames[0]?.height || 1;
  const region = face && face.size > 0 ? faceEllipse(face) : assumedFace(W, H);
  const allHist = new Uint32Array(256); let allN = 0;
  const skinHist = new Uint32Array(256); let skinN = 0; let regionN = 0;
  const skinPx: number[] = []; // r,g,b,y flattened
  const side = { l: [0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0] }; // r,g,b,Y,n per half of the face
  const bgR: number[] = [], bgG: number[] = [], bgB: number[] = [], bgY: number[] = [];
  let bgN = 0;
  for (const f of frames) {
    const { data, width, height } = f;
    for (let y = 0; y < height; y++) {
      const fy = (y + 0.5) / height;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const Y = luma709(r, g, b);
        allHist[Math.min(255, Math.round(Y))]++; allN++;
        const fx = (x + 0.5) / width;
        const dx = (fx - region.cx) / region.rx, dy = (fy - region.cy) / region.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1) {
          regionN++;
          if (isSkin(r, g, b) && Y >= 30) {
            skinHist[Math.min(255, Math.round(Y))]++; skinN++;
            skinPx.push(r, g, b, Y);
            // The two halves of the face (a strip down the nose is neither):
            // a side key lights one cheek and leaves the other to the fill.
            const h = dx < -0.2 ? side.l : dx > 0.2 ? side.r : null;
            if (h) { h[0] += r; h[1] += g; h[2] += b; h[3] += Y; h[4]++; }
          }
          continue;
        }
        // The head's surround (hair, ears, neck) is not background: only
        // pixels well outside the face count, and only near-neutral ones
        // (chroma under 30% of the brightest channel admits a real cast of
        // +-15% but not the painting, the shirt or the desk).
        if (d2 < 4) continue;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (Y < 30 || Y > 242 || mx - mn > 0.3 * mx) continue;
        bgR.push(r); bgG.push(g); bgB.push(b); bgY.push(Y); bgN++;
      }
    }
  }
  // Skin split by luma: the brightest 30% is the lit side, the darkest 30%
  // the shadow side (for a side key, the two cheeks).
  const litCut = histPercentile(skinHist, skinN, 0.7), shadowCut = histPercentile(skinHist, skinN, 0.3);
  const sum = { all: [0, 0, 0], lit: [0, 0, 0], shadow: [0, 0, 0] };
  const cnt = { all: 0, lit: 0, shadow: 0 };
  let clip = 0;
  for (let i = 0; i < skinPx.length; i += 4) {
    const r = skinPx[i], g = skinPx[i + 1], b = skinPx[i + 2], Y = skinPx[i + 3];
    sum.all[0] += r; sum.all[1] += g; sum.all[2] += b; cnt.all++;
    if (Y >= litCut) { sum.lit[0] += r; sum.lit[1] += g; sum.lit[2] += b; cnt.lit++; }
    if (Y <= shadowCut) { sum.shadow[0] += r; sum.shadow[1] += g; sum.shadow[2] += b; cnt.shadow++; }
    if (Y >= 0.97 * 255) clip++;
  }
  const mean = (k: "all" | "lit" | "shadow"): Rgb => cnt[k] ? [r1(sum[k][0] / cnt[k]), r1(sum[k][1] / cnt[k]), r1(sum[k][2] / cnt[k])] : [0, 0, 0];
  const f255 = (v: number) => r3(v / 255);
  // Lit vs shadow: by SIDE when both halves of the face carry skin (the
  // brighter half is the lit cheek), else by luma (brightest vs darkest 30%).
  // Side is the honest split for a side key -- a luma split mixes lips,
  // beard edges and the saturated shadow core into "shadow".
  const halfMin = Math.max(20, 0.15 * skinN);
  let lit = mean("lit"), shadow = mean("shadow"), split: "side" | "luma" = "luma";
  if (side.l[4] >= halfMin && side.r[4] >= halfMin) {
    const m = (h: number[]): Rgb => [r1(h[0] / h[4]), r1(h[1] / h[4]), r1(h[2] / h[4])];
    const lFirst = side.l[3] / side.l[4] >= side.r[3] / side.r[4];
    lit = m(lFirst ? side.l : side.r); shadow = m(lFirst ? side.r : side.l); split = "side";
  }
  return {
    v: 1,
    frames: frames.length,
    face: region,
    luma: { p5: f255(histPercentile(allHist, allN, 0.05)), p50: f255(histPercentile(allHist, allN, 0.5)), p95: f255(histPercentile(allHist, allN, 0.95)) },
    skin: {
      share: regionN ? r3(skinN / regionN) : 0,
      rgb: mean("all"), lit, shadow, split,
      luma: { p10: f255(histPercentile(skinHist, skinN, 0.1)), p50: f255(histPercentile(skinHist, skinN, 0.5)), p95: f255(histPercentile(skinHist, skinN, 0.95)) },
      clip: skinN ? r3(clip / skinN) : 0,
    },
    bg: { rgb: [r1(median(bgR)), r1(median(bgG)), r1(median(bgB))], share: allN ? r3(bgN / allN) : 0, luma: f255(median(bgY)) },
  };
}

/** Sample `frames` frames across the take (skipping the very ends), 160 px
 *  wide, and measure them. `face` is the take's detected face when known. */
export async function measureTake(filePath: string, o: { duration: number; face?: FaceHint | null; frames?: number; width?: number }): Promise<TakeStudioStats> {
  const n = Math.max(1, o.frames ?? 8);
  const W = o.width ?? 160;
  const dur = Math.max(0.1, o.duration || 0);
  const frames: RgbFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(Math.max(0, (dur * (i + 0.5)) / n), Math.max(0, dur - 0.05));
    try {
      const { stdout } = await execFileAsync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", filePath, "-frames:v", "1",
        "-vf", `scale=${W}:-2`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
      ], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 });
      const buf = stdout as unknown as Buffer;
      const h = Math.floor(buf.length / (W * 3));
      if (h > 0) frames.push({ data: new Uint8Array(buf.buffer, buf.byteOffset, W * h * 3), width: W, height: h });
    } catch { /* a frame that will not decode is skipped */ }
  }
  if (!frames.length) throw new Error("no frame could be decoded to measure");
  return analyzeFrames(frames, o.face);
}

// ── correct ──────────────────────────────────────────────────────────────

/** Each white-balance gain stays within +-15%. */
export const WB_CLAMP = 0.15;
/** Casts smaller than this (per channel, relative) are left alone. */
const WB_DEADBAND = 0.02;
/** The background must cover at least this much of the frame to be trusted. */
const BG_MIN_SHARE = 0.04;
/** The skin must be at least this much of the face region to be trusted. */
const SKIN_MIN_SHARE = 0.12;
/** A warm key: the lit half's R/B more than this over the shadow half's. */
const WARM_KEY_RATIO = 1.12;
/** The lit half is pulled to the shadow half's R/B times this (a key a
 *  touch warmer than its fill still reads as light, not as a cast). */
const WARM_KEY_KEEP = 1.1;
/** No half of the face goes below this R/B (grey skin is worse than warm). */
const SKIN_RB_FLOOR = 1.3;
/** The warm-key pull desaturates the lit skin toward grey by at most this
 *  fraction, and no selectivecolor component goes past SKIN_ADJ_MAX. */
export const SKIN_PULL_MAX = 0.45;
const SKIN_ADJ_MAX = 0.5;
/** Skin keeps green above blue: hue (G-B)/(R-B) under this reads pink. */
const SKIN_HUE_FLOOR = 0.18;
/** The face median's target band, fractions of full range (SDR). The top
 *  is 0.70, not 0.60: broadcast puts lighter skin at ~60-70 IRE, and a
 *  0.60 cap pulled Marc's well-lit take (face 0.66, IMG_2765) down 0.28
 *  stop -- a dimmer picture for no gain, since the wall darkened with it. */
export const FACE_LUMA_BAND: [number, number] = [0.45, 0.7];
/** Exposure moves at most this many stops either way. */
export const EV_CLAMP = 0.5;
const EV_DEADBAND = 0.05;
/** No exposure lift once this much of the skin already clips. */
const CLIP_GUARD = 0.02;
/** S-curve cap, and the amount below which it is skipped. */
export const CONTRAST_MAX = 0.04;
const CONTRAST_MIN = 0.01;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
const rb = (c: Rgb) => (c[2] > 0 ? c[0] / c[2] : 0);
/** 0 = magenta-red, 1 = yellow; skin sits ~0.25-0.5. */
const skinHue = (c: Rgb) => (c[0] - c[2] > 0 ? (c[1] - c[2]) / (c[0] - c[2]) : 0);

/**
 * Stats -> ffmpeg filter string. Pure: every number in the output is
 * derived from the stats with the clamps above, and a take that measures
 * well-balanced, well-exposed and full-range comes back as "null".
 */
export function studioGradeFilter(s: TakeStudioStats): TakeStudioCorrection {
  const notes: string[] = [];
  const parts: string[] = [];

  const skinOk = s.skin.share >= SKIN_MIN_SHARE && s.skin.lit[2] > 0 && s.skin.shadow[2] > 0;

  // 1. WHITE BALANCE. Gains that make the background's median grey, scaled
  //    so its luma is unchanged, each clamped to +-15%. Marc's latest take:
  //    wall median rgb(151,154,150), R/B 1.01 -- inside the dead band, so
  //    his WB is left alone; the orange is on his face, not in the room.
  //    An older booth take (take-d, 2026-09) read R/B 1.20 on the wall:
  //    blue +15% (clamped). SKIN GUARD: gains that would turn the face
  //    magenta (green no longer above blue -- the hue (G-B)/(R-B) under
  //    SKIN_HUE_FLOOR) are scaled back until it is not: a "neutral" wall
  //    that costs the skin its colour was a beige wall, and a warm room
  //    reads better than a pink face.
  let wb: Rgb = [1, 1, 1];
  const [br, bgc, bb] = s.bg.rgb;
  if (s.bg.share >= BG_MIN_SHARE && br > 0 && bgc > 0 && bb > 0) {
    const grey = luma709(br, bgc, bb);
    const raw: Rgb = [grey / br, grey / bgc, grey / bb];
    let g = raw.map((x) => clamp(x, 1 - WB_CLAMP, 1 + WB_CLAMP)) as Rgb;
    const clamped = raw.some((x, i) => Math.abs(x - g[i]) > 1e-6);
    let guarded = "";
    if (skinOk) {
      const sk = s.skin.rgb;
      const before = skinHue(sk);
      const floor = Math.min(before, SKIN_HUE_FLOOR);
      const full = g;
      const at = (t: number): Rgb => full.map((x) => Math.pow(x, t)) as Rgb;
      const hueAt = (t: number) => { const w = at(t); return skinHue([sk[0] * w[0], sk[1] * w[1], sk[2] * w[2]]); };
      if (hueAt(1) < floor) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (hueAt(mid) >= floor) lo = mid; else hi = mid; }
        g = at(lo);
        guarded = ` (scaled to ${Math.round(lo * 100)}%: the full gains turned the skin magenta, hue ${before.toFixed(2)} -> ${hueAt(1).toFixed(2)})`;
      }
    }
    if (g.some((x) => Math.abs(x - 1) > WB_DEADBAND)) {
      wb = g.map((x) => Math.round(x * 1000) / 1000) as Rgb;
      notes.push(`white balance: background median rgb(${s.bg.rgb.join(",")}) R/B ${rb(s.bg.rgb).toFixed(2)} over ${Math.round(s.bg.share * 100)}% of the frame -> gains ${wb.join("/")}${clamped ? " (clamped to +-15%)" : ""}${guarded}`);
      parts.push(`colorchannelmixer=rr=${fmt(wb[0])}:gg=${fmt(wb[1])}:bb=${fmt(wb[2])}`);
    } else {
      notes.push(`white balance: background R/B ${rb(s.bg.rgb).toFixed(2)} is neutral -- left alone${guarded}`);
    }
  } else {
    notes.push(`white balance: too little near-neutral background (${Math.round(s.bg.share * 100)}%) to trust -- left alone`);
  }

  const gain = (c: Rgb): Rgb => [c[0] * wb[0], c[1] * wb[1], c[2] * wb[2]];

  // 2. WARM KEY. After the WB, compare the face's two halves. Marc's take:
  //    lit rgb(234,151,98) R/B 2.36, shadow rgb(146,106,86) R/B 1.69 --
  //    1.40x apart, a warm key; the lit half goes to shadow x 1.1 ~1.86.
  //    The pull is a DESATURATION toward luma, so the hue stays and only
  //    the orange drains (a straight red-down/blue-up turned his hands
  //    pink): for the lit mean, P' = P - k (P - Y) per channel, and
  //    R'/B' = T gives k = (R - T B) / ((R - Y) - T (B - Y)).
  //    selectivecolor (reds range, absolute) moves each red-dominant pixel
  //    by -adj x (R - G) per channel, so adj = k (P - Y) / (R - G) of the
  //    lit mean. Pixels with less chroma move less; a neutral wall at the
  //    same brightness has R = G and does not move at all. Clamped: k to
  //    SKIN_PULL_MAX, each adj to +-0.5, and the shadow half never under
  //    SKIN_RB_FLOOR.
  let skinPull = 0;
  let skinCmy: Rgb | undefined;
  let faceRb: TakeStudioCorrection["face_rb"];
  const lit = skinOk ? gain(s.skin.lit) : null;
  const shadow = skinOk ? gain(s.skin.shadow) : null;
  if (lit && shadow) {
    const litRb = rb(lit), shadowRb = rb(shadow);
    const dl = lit[0] - lit[1], ds = shadow[0] - shadow[1];
    const target = Math.max(shadowRb * WARM_KEY_KEEP, SKIN_RB_FLOOR);
    const yl = luma709(lit[0], lit[1], lit[2]);
    const denom = (lit[0] - yl) - target * (lit[2] - yl);
    if (litRb > shadowRb * WARM_KEY_RATIO && litRb > target && dl > 0 && denom > 0) {
      // Per unit k, the adjustment each channel gets per unit of (R - G).
      const v: Rgb = [(lit[0] - yl) / dl, (lit[1] - yl) / dl, (lit[2] - yl) / dl];
      let k = (lit[0] - target * lit[2]) / denom;
      const want = k;
      const floorDen = ds > 0 ? ds * (v[0] - SKIN_RB_FLOOR * v[2]) : 0;
      if (floorDen > 0) k = Math.min(k, (shadow[0] - SKIN_RB_FLOOR * shadow[2]) / floorDen);
      k = Math.min(k, SKIN_PULL_MAX, ...v.map((x) => (Math.abs(x) > 0 ? SKIN_ADJ_MAX / Math.abs(x) : Infinity)));
      k = Math.max(0, k);
      if (k >= 0.01) {
        skinPull = Math.round(k * 1000) / 1000;
        const cmy = v.map((x) => Math.round(skinPull * x * 1000) / 1000) as Rgb;
        skinCmy = cmy;
        const after = (c: Rgb, d: number): Rgb => [c[0] - cmy[0] * d, c[1] - cmy[1] * d, c[2] - cmy[2] * d];
        const litAfter = after(lit, dl), shadowAfter = after(shadow, Math.max(0, ds));
        faceRb = { lit: r3(litRb), shadow: r3(shadowRb), lit_after: r3(rb(litAfter)), shadow_after: r3(rb(shadowAfter)) };
        notes.push(`warm key: lit skin R/B ${litRb.toFixed(2)} vs shadow ${shadowRb.toFixed(2)} (${(litRb / shadowRb).toFixed(2)}x, ${s.skin.split} split) -> orange desaturated ${Math.round(skinPull * 100)}%${want - skinPull > 0.005 ? ` (clamped from ${Math.round(want * 100)}%)` : ""}, lit ~${faceRb.lit_after.toFixed(2)}, shadow ~${faceRb.shadow_after.toFixed(2)}`);
        parts.push(`selectivecolor=correction_method=absolute:reds='${fmt(cmy[0])} ${fmt(cmy[1])} ${fmt(cmy[2])} 0'`);
      }
    } else {
      faceRb = { lit: r3(litRb), shadow: r3(shadowRb), lit_after: r3(litRb), shadow_after: r3(shadowRb) };
      notes.push(`skin: lit R/B ${litRb.toFixed(2)} vs shadow ${shadowRb.toFixed(2)} -- one light, left alone`);
    }
  } else {
    notes.push(`skin: ${Math.round(s.skin.share * 100)}% of the face region read as skin -- too little to judge, left alone`);
  }

  // 3. EXPOSURE. The face median after steps 1-2 (scaled by what the gains
  //    and the pull do to the skin mean's luma), brought to the nearest edge
  //    of the band -- never to its middle: the least move that fixes it.
  let ev = 0;
  let faceLuma: TakeStudioCorrection["face_luma"];
  if (skinOk) {
    const sk = s.skin.rgb;
    const y0 = luma709(sk[0], sk[1], sk[2]);
    const g = gain(sk);
    const d = Math.max(0, g[0] - g[1]);
    const y1 = skinCmy ? luma709(g[0] - skinCmy[0] * d, g[1] - skinCmy[1] * d, g[2] - skinCmy[2] * d) : luma709(g[0], g[1], g[2]);
    const m = clamp(s.skin.luma.p50 * (y0 > 0 ? y1 / y0 : 1), 0.02, 0.98);
    const [lo, hi] = FACE_LUMA_BAND;
    const want = m < lo ? lo : m > hi ? hi : m;
    // Stops at the face, in gamma-encoded terms: gain = 2^(ev / 2.2).
    let e = clamp(2.2 * Math.log2(want / m), -EV_CLAMP, EV_CLAMP);
    if (e > 0 && s.skin.clip > CLIP_GUARD) {
      notes.push(`exposure: face median ${m.toFixed(2)} is low but ${Math.round(s.skin.clip * 100)}% of the skin already clips -- no lift`);
      e = 0;
    }
    if (e > 0) {
      // Keep the face's brightest 5% under 0.96.
      const top = s.skin.luma.p95 * (y0 > 0 ? y1 / y0 : 1);
      if (top > 0) e = Math.min(e, Math.max(0, 2.2 * Math.log2(0.96 / top)));
    }
    if (Math.abs(e) >= EV_DEADBAND) {
      ev = Math.round(e * 100) / 100;
      const out = m * Math.pow(2, ev / 2.2);
      faceLuma = { before: r3(m), after: r3(out) };
      notes.push(`exposure: face median ${m.toFixed(2)} outside ${lo}-${hi} -> ${ev > 0 ? "+" : ""}${ev} stop${Math.abs(2.2 * Math.log2(want / m)) > EV_CLAMP ? " (clamped)" : ""}, ~${out.toFixed(2)}`);
      // Pinned at 0 and 1: the lift (or cut) lands on the face and rolls off
      // toward black and white instead of clipping.
      parts.push(`curves=master='0/0 ${fmt(m)}/${fmt(clamp(out, 0.02, 0.98))} 1/1'`);
    } else {
      faceLuma = { before: r3(m), after: r3(m) };
      if (!notes.some((x) => x.startsWith("exposure:"))) notes.push(`exposure: face median ${m.toFixed(2)} is in the band -- left alone`);
    }
  }

  // 4. CONTRAST. The frame's 5th-95th luma spread: a full-range picture
  //    spreads ~0.8+; a flat one less, and the curve grows as it shrinks.
  //    The lower half of an S only: the shadows deepen and everything from
  //    0.6 up stays put. A full S lifts the upper mids -- and in a booth
  //    take the upper mids are the face and a wall already as bright as it
  //    (Marc's: wall luma ~158, face ~152). Measured on a ramp, amount 0.027
  //    maps 64->57, 128->126, 160->160, 224->225.
  const spread = s.luma.p95 - s.luma.p5;
  let contrast = clamp(0.015 + (0.75 - spread) * 0.1, 0, CONTRAST_MAX);
  if (contrast >= CONTRAST_MIN) {
    contrast = Math.round(contrast * 1000) / 1000;
    notes.push(`contrast: luma spread ${spread.toFixed(2)} -> shadow curve ${contrast}`);
    parts.push(`curves=master='0/0 0.25/${fmt(0.25 - contrast)} 0.6/0.6 1/1'`);
  } else {
    contrast = 0;
    notes.push(`contrast: luma spread ${spread.toFixed(2)} is full -- left alone`);
  }

  return { wb, skin: skinPull, ...(skinCmy ? { skin_cmy: skinCmy } : {}), ev, contrast, face_rb: faceRb, face_luma: faceLuma, notes, filter: parts.length ? parts.join(",") : "null" };
}

// ── the fill light ───────────────────────────────────────────────────────

/**
 * THE FILL LIGHT -- a face-only lift of the shadows, in the grade's encode
 * between the correction and the soft look.
 *
 * Marc on his booth take (2026-09-27, proj_4dfaa63e): "The dark side of my
 * face looks sunken and I have bags under my eyes." The correction had done
 * almost nothing (a 3% white balance, a 0.03 curve): it was the light --
 * a high key from one side and no fill, so the far cheek fell away and the
 * brow shaded the under-eye. A real fill (a bounce board below the frame)
 * is the cure on set; this is the same idea after the fact.
 *
 * The graph: the frame split in two; one copy lifted by a curve (the
 * shadows most, the highlights barely); laid back over the frame through a
 * mask that is (a) an ellipse around the face, a little larger and lower
 * than the measured one so the cheeks and jaw are in, feathered to nothing
 * at its edge, times (b) a luma BAND -- full for the skin's shadows
 * (~45-70% down), fading out above (the lit cheek is left alone) and below
 * (pupils, brows, beard and hair are not greyed). The mask is computed at a
 * quarter of the frame's size (it is soft anyway) and scaled up, so the
 * per-pixel expression costs a sixteenth.
 *
 * `strength` 0-1; at 0.5 a curve 0.2 -> 0.29, 0.45 -> 0.55; at 1, 0.38 /
 * 0.65. The first range (0.27/0.52 at 0.5) was too timid to see on the
 * dial: Marc at 85, "it doesn't seem to be doing anything". The face is the take's own (measured region,
 * else the detection); no face, no fill -- the lift is never guessed onto
 * a wall.
 */
export const DEFAULT_FILL_STRENGTH = 0.5;
/** A take that never set the fill gets none (Marc, Oct 7: "maybe the fill
 *  and soft should not be default on for recorded videos"). The dial still
 *  starts at DEFAULT_FILL_STRENGTH when it is switched on in Studio. */
export const FILL_WHEN_UNSET = 0;
export function faceFillGraph(width: number, height: number, region: { cx: number; cy: number; rx: number; ry: number }, strength: number = DEFAULT_FILL_STRENGTH): string {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : DEFAULT_FILL_STRENGTH));
  if (s < 0.01 || !(width > 0 && height > 0) || !(region.rx > 0 && region.ry > 0)) return "";
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const qw = even(width / 4), qh = even(height / 4);
  const f = (n: number) => Math.round(n * 1000) / 1000;
  // The fill's reach, in quarter-frame pixels.
  const cx = f(region.cx * qw), cy = f((region.cy + 0.15 * region.ry) * qh);
  const rx = f(region.rx * 1.15 * qw), ry = f(region.ry * 1.3 * qh);
  const lift = (x: number, d: number) => `${f(x)}/${f(Math.min(1, x + d * s))}`;
  const curve = `0/0 ${lift(0.2, 0.18)} ${lift(0.45, 0.2)} ${lift(0.75, 0.06)} 1/1`;
  const ell = `pow(max(0,1-(pow((X-${cx})/${rx},2)+pow((Y-${cy})/${ry},2))),0.5)`;
  const band = `clip((186-lum(X,Y))/74,0,1)*clip((lum(X,Y)-45)/40,0,1)`;
  return [
    `split=2[fillbase][fillsrc]`,
    `[fillsrc]split=2[filllift0][fillm0]`,
    `[fillm0]scale=${qw}:${qh}:flags=area,format=gray,geq=lum='255*${ell}*${band}',scale=${width}:${height}:flags=bicubic,gblur=sigma=${f(Math.max(2, width / 180))}[fillmask]`,
    // The lifted copy is smoothed too: a bag is a shadow AND a texture;
    // lifting the shadow alone left the texture reading (Marc, fill at 85:
    // "it doesn't seem to be doing anything").
    `[filllift0]curves=all='${curve}',bilateral=sigmaS=${f(3 + 6 * s)}:sigmaR=${f(0.03 + 0.06 * s)}[filllift]`,
    `[filllift][fillmask]alphamerge[fillover]`,
    `[fillbase][fillover]overlay=format=auto`,
  ].join(";");
}
