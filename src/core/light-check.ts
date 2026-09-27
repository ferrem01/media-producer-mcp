/**
 * The booth's LIGHT CHECK -- measure the live camera frame, say in plain
 * words what a person cannot see for themselves.
 *
 * Why: a manual review of Marc's booth take (measured from its frames) found
 * three lighting faults that are invisible from behind the phone:
 *   1. the key panel was on WARM while the room was daylight -- the lit cheek
 *      read R/B ~2.3 against a shadow cheek and a wall of ~1.0-1.5;
 *   2. the wall behind him was as bright as his face (luma ~158 vs a face of
 *      ~130-168);
 *   3. no rim light -- the hair edge read the same as the wall.
 * The page samples the frame ~2x a second, these functions turn the pixels
 * into numbers and the numbers into at most three tips.
 *
 * ONE SOURCE, TWO RUNTIMES: the functions are written ONCE, as plain ES5 in
 * LIGHT_CHECK_JS, which the take page inlines into its client script
 * (src/take-page.ts) and which this module evaluates for Node, so the tests
 * exercise exactly the code the phone runs (no twin to drift, unlike
 * MAP_SOURCE_TIME_JS). The string lives inside a template literal: no
 * backslashes, no backticks, no dollar-brace in it.
 *
 * Rim light (fault 3) is not measured: finding the hair edge needs a person
 * mask, and the booth has none live. The background tip covers the
 * separation it would buy.
 */

export interface LightStats {
  /** Mean luma (Rec.601, 0-255) inside the face oval. */
  faceLuma: number;
  /** Mean luma of the background band (top corners, outside the head). */
  bgLuma: number;
  /** Mean luma of the face oval's left / right halves (image space). */
  leftLuma: number;
  rightLuma: number;
  /** Colour cast: mean R / mean B. */
  faceRB: number;
  bgRB: number;
  leftRB: number;
  rightRB: number;
  /** Green cast: mean G / ((mean R + mean B) / 2). */
  faceGM: number;
  bgGM: number;
  /** Share (0-1) of face pixels with luma above LIGHT.CLIP. */
  clipShare: number;
}

export interface LightTip {
  /** dark | warm | cool | mixed | green | shine | wall | flat */
  id: string;
  text: string;
}

export interface GuideOval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** The "eyes here" line: one third from the top. */
  eyeY: number;
}

/** How much of the person the frame holds (the remote booth's selector). */
export type ShotSize = "close" | "medium" | "wide";

export const LIGHT_CHECK_JS = `
  // Thresholds, each set against the measured take (see src/core/light-check.ts).
  var LIGHT = {
    // Face mean luma under ~70 is a murky face on a phone sensor: noise and
    // mud before any other fault matters. Marc's face measured 130-168.
    DARK: 70,
    // Luma over 245 is blown skin (shine). More than 3% of the face there is
    // a hot spot a viewer sees, not a specular glint on an eye.
    CLIP: 245, CLIP_SHARE: 0.03,
    // The wall should sit below the face. Measured: wall 158, face ~149 mean
    // (130-168) -- 1.06x. At 0.9x or more the face does not lift off the wall.
    WALL: 0.9, WALL_HOT: 1.25,
    // Key vs fill: a half under 12% darker than the other is flat, frontal
    // light. Measured good modelling: 168 vs 130 is 23%.
    FLAT: 0.12,
    // COLOUR. Skin is warmer than a neutral wall even under matched light:
    // the shadow cheek (lit by the daylight room) read R/B ~1.5 against a
    // wall of ~1.0, so "face R/B more than 1.4x the wall" would flag every
    // correct setup. Face vs room fires at 1.75x (the warm-lit cheek read
    // 2.3, 2.3x the wall); bluer than the room (under 0.95x) fires too.
    WARM_VS_ROOM: 1.75, COOL_VS_ROOM: 0.95,
    // Two colour temperatures ACROSS the face -- the measured fault exactly:
    // warm key cheek 2.3 vs daylight-fill cheek 1.5 = 1.53x. Comparing the
    // face to itself is independent of skin tone, so it is the primary
    // signal; 1.3x leaves room for the ordinary drift of one light.
    SIDE_CAST: 1.3,
    // Green cast (overheads / mixed LEDs): skin sits a little UNDER the wall
    // on G/((R+B)/2) (~0.95 vs 1.0), so 1.1x the wall is already green.
    GREEN: 1.1,
    // Casts are only read where there is signal: a half darker than 40 is
    // noise, over 235 has a clipped red channel; a wall darker than 30 has
    // no colour to compare against.
    CAST_MIN: 40, CAST_MAX: 235, BG_CAST_MIN: 30,
    MAX_TIPS: 3
  };

  // SHOT SIZE (the remote booth, SPEC-remote-booth.md): how much of the
  // person the frame holds. close = the booth's head and shoulders at arm's
  // length (the default, unchanged); medium = waist up; wide = standing,
  // 6-10 ft back. The face shrinks and the eyes rise as the shot widens.
  // The wall rule needs no threshold of its own: the background band is
  // the top of the frame outside the head's column, so a smaller head
  // leaves MORE of the frame counted as background, on purpose -- in a wide
  // shot the room is a larger share of the picture.
  var SHOTS = { close: { k: 1, eye: 0 }, medium: { k: 0.62, eye: 0.3 }, wide: { k: 0.36, eye: 0.25 } };

  // Where the face goes, in a w x h picture: a head-and-shoulders oval with
  // the eyes on the upper third (the framing hint draws the same numbers).
  function guideOval(w, h, shot) {
    var sz = (shot === 'medium' || shot === 'wide') ? SHOTS[shot] : SHOTS.close;
    var portrait = h > w;
    var ry = h * (portrait ? 0.14 : 0.2) * sz.k;
    var rx = Math.min(ry * 0.78, w * 0.4);
    var eyeY = sz.eye ? h * sz.eye : h / 3;
    return { cx: w / 2, cy: eyeY + ry * 0.1, rx: rx, ry: ry, eyeY: eyeY };
  }

  // RGBA pixels (canvas ImageData.data) -> LightStats. The face is the inner
  // 70% of the guide oval (skin, not hair or the wall beside a cheek); the
  // background is the top band outside the head.
  function lightStats(px, w, h, shot) {
    var o = guideOval(w, h, shot);
    var irx = o.rx * 0.7, iry = o.ry * 0.7;
    var bandY = h * 0.25, clearX = o.rx * 1.35;
    var f = [0, 0, 0, 0, 0], fl = [0, 0, 0, 0, 0], fr = [0, 0, 0, 0, 0], bg = [0, 0, 0, 0, 0];
    var clip = 0;
    for (var y = 0; y < h; y++) {
      var dy = (y + 0.5 - o.cy) / iry;
      var inBand = y < bandY;
      if (!inBand && (dy < -1 || dy > 1)) continue;
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var r = px[i], g = px[i + 1], b = px[i + 2];
        var l = 0.299 * r + 0.587 * g + 0.114 * b;
        var dx = (x + 0.5 - o.cx) / irx;
        var acc = null;
        if (dx * dx + dy * dy <= 1) {
          f[0] += r; f[1] += g; f[2] += b; f[3] += l; f[4]++;
          if (l > LIGHT.CLIP) clip++;
          acc = x + 0.5 < o.cx ? fl : fr;
        } else if (inBand && Math.abs(x + 0.5 - o.cx) > clearX) {
          acc = bg;
        }
        if (acc) { acc[0] += r; acc[1] += g; acc[2] += b; acc[3] += l; acc[4]++; }
      }
    }
    function mean(a, k) { return a[4] ? a[k] / a[4] : 0; }
    function rb(a) { return a[4] ? (a[0] + a[4]) / (a[2] + a[4]) : 1; }
    function gm(a) { return a[4] ? (a[1] + a[4]) / ((a[0] + a[2]) / 2 + a[4]) : 1; }
    return {
      faceLuma: mean(f, 3), bgLuma: mean(bg, 3), leftLuma: mean(fl, 3), rightLuma: mean(fr, 3),
      faceRB: rb(f), bgRB: rb(bg), leftRB: rb(fl), rightRB: rb(fr),
      faceGM: gm(f), bgGM: gm(bg),
      clipShare: f[4] ? clip / f[4] : 0
    };
  }

  // LightStats -> at most three tips, most important first; [] = light looks
  // good. Order: a dark face first (nothing else reads until there is
  // light), then colour (the one fault a person cannot see on their own
  // screen, and the measured one), shine, the wall, and flatness last (a
  // ring light is flat on purpose for some).
  function lightAdvice(s) {
    var tips = [];
    if (!s) return tips;
    if (s.faceLuma < LIGHT.DARK) {
      tips.push({ id: 'dark', text: 'Underexposed — add light or move closer to it.' });
      // Near black: the lens is covered or the room is dark; any colour or
      // contrast read from it is noise.
      if (s.faceLuma < 25) return tips;
    }
    var castOk = function (l) { return l >= LIGHT.CAST_MIN && l <= LIGHT.CAST_MAX; };
    var side = castOk(s.leftLuma) && castOk(s.rightLuma)
      ? Math.max(s.leftRB, s.rightRB) / Math.max(0.01, Math.min(s.leftRB, s.rightRB)) : 1;
    var room = s.bgLuma >= LIGHT.BG_CAST_MIN && castOk(s.faceLuma);
    var rel = room ? s.faceRB / Math.max(0.01, s.bgRB) : 1;
    var green = room ? s.faceGM / Math.max(0.01, s.bgGM) : 1;
    if (rel > LIGHT.WARM_VS_ROOM) tips.push({ id: 'warm', text: 'Your face looks orange next to the room — set every light to the same colour (daylight if the windows are bright).' });
    else if (side > LIGHT.SIDE_CAST) tips.push({ id: 'mixed', text: 'One side of your face is more orange than the other — set every light to the same colour (daylight if the windows are bright).' });
    else if (rel < LIGHT.COOL_VS_ROOM) tips.push({ id: 'cool', text: 'Your face looks blue next to the room — set every light to the same colour (warmer panels, or the room lights off).' });
    else if (green > LIGHT.GREEN) tips.push({ id: 'green', text: 'Your face looks green next to the room — turn off the overhead lights and light yourself with the panels.' });
    if (s.clipShare > LIGHT.CLIP_SHARE) tips.push({ id: 'shine', text: 'Too much shine on your forehead — lower or soften the light above you.' });
    if (s.faceLuma >= LIGHT.DARK && s.bgLuma >= s.faceLuma * LIGHT.WALL) {
      tips.push({ id: 'wall', text: s.bgLuma >= s.faceLuma * LIGHT.WALL_HOT
        ? 'Behind you is brighter than your face — close the curtains or dim the light behind you, or bring your main light closer.'
        : 'The wall behind you is as bright as your face — dim it or bring your main light closer.' });
    }
    var hi = Math.max(s.leftLuma, s.rightLuma);
    if (s.faceLuma >= LIGHT.DARK && hi > 0 && Math.abs(s.leftLuma - s.rightLuma) / hi < LIGHT.FLAT) {
      tips.push({ id: 'flat', text: 'Flat light — make one side of your face brighter: move your main light to 45°.' });
    }
    return tips.slice(0, LIGHT.MAX_TIPS);
  }
`;

interface LightCheckApi {
  LIGHT: Record<string, number>;
  guideOval(w: number, h: number, shot?: ShotSize): GuideOval;
  lightStats(px: ArrayLike<number>, w: number, h: number, shot?: ShotSize): LightStats;
  lightAdvice(s: LightStats): LightTip[];
}

const api = new Function(`${LIGHT_CHECK_JS}\nreturn { LIGHT: LIGHT, guideOval: guideOval, lightStats: lightStats, lightAdvice: lightAdvice };`)() as LightCheckApi;

export const LIGHT = api.LIGHT;
export const guideOval = api.guideOval;
export const lightStats = api.lightStats;
export const lightAdvice = api.lightAdvice;
