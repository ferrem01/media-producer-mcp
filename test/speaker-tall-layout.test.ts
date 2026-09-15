import { describe, it, expect } from "vitest";
import { buildAuthoredCompositionScene } from "../src/llm/scene-generator.js";

// Measured live on proj_234d8a01: the wide speaker dock put the composer,
// captions and URL in a 35%-wide right-third column with 34px type, and the
// floating pills over the speaker's eyes. A tall frame has no "beside her".
function build(canvas: { width: number; height: number }, authored: any[], transparent?: boolean) {
  const draft: any = {
    label: "Beat", duration_seconds: 12, purpose: "", visual_notes: "", components: [], beats: [],
    ...(transparent === undefined ? {} : { transparent_background: transparent }),
  };
  const res = buildAuthoredCompositionScene("s1", draft, authored, {
    sceneIndex: 0, totalScenes: 2, brandKit: { colors: {}, fonts: [] }, canvas, hasSpeakerTrack: true,
  } as any);
  return res.scene.components as any[];
}
const pctNum = (v: any) => Number(String(v).replace("%", ""));
const AUTHORED = [
  { type: "composer", data: { text: "How's it doing?", at: 2 } },
  { type: "reel-caption-lane", data: { phrases: [{ text: "One answer", start: 6 }] } },
  { type: "auto-tagged-link", data: { base: "getquotient.ai", type_at: 11 } },
  { type: "sticker-prop", data: { kind: "stamp", text: "?", at: 10 } },
  { type: "floating-pills", data: { items: ["Email", "Ads"] } },
];

describe("a speaker scene on a TALL frame", () => {
  const comps = build({ width: 1080, height: 1920 }, AUTHORED);
  const by = (t: string) => comps.find((c) => c.type === t);

  it("stacks surfaces and captions full-width in the lower band, spilling to the top band, never a side column", () => {
    for (const t of ["composer", "reel-caption-lane", "auto-tagged-link"]) {
      const p = by(t).position;
      expect(pctNum(p.x)).toBe(5);
      expect(pctNum(p.width)).toBe(90);
    }
    // First two in the lower band over the chest (58%-82%)...
    expect(pctNum(by("composer").position.y)).toBeGreaterThanOrEqual(58);
    expect(pctNum(by("reel-caption-lane").position.y) + pctNum(by("reel-caption-lane").position.height)).toBeLessThanOrEqual(82.1);
    // ...the third under the platform strip (13%-30%), clear of the face.
    expect(pctNum(by("auto-tagged-link").position.y)).toBeGreaterThanOrEqual(13);
    expect(pctNum(by("auto-tagged-link").position.y) + pctNum(by("auto-tagged-link").position.height)).toBeLessThanOrEqual(30.1);
  });

  it("puts accents in the band corners and floating pills over the chest, not the face", () => {
    expect(by("sticker-prop").position).toEqual({ x: "62%", y: "13%", width: "32%", height: "12%" });
    expect(by("floating-pills").position).toEqual({ x: "0%", y: "52%", width: "100%", height: "30%" });
  });

  it("scales fixed-pixel type for a phone unless the board set its own size", () => {
    expect(by("composer").data.scale).toBe(1.8);
    expect(by("sticker-prop").data.scale).toBe(1.8);
    expect(by("floating-pills").data.scale).toBe(1.8);
    expect(by("auto-tagged-link").data.font_size).toBe("72px");
    expect(by("reel-caption-lane").data.scale).toBeUndefined(); // auto-fits its box already
    const own = build({ width: 1080, height: 1920 }, [{ type: "sticker-prop", data: { kind: "pill", text: "x", scale: 1.2 } }]);
    expect(own[0].data.scale).toBe(1.2);
  });

  it("floors a desktop pixel font the board wrote, and lights the URL's ink over the camera", () => {
    const c = build({ width: 1080, height: 1920 }, [
      { type: "auto-tagged-link", data: { base: "getquotient.ai", font_size: "44px", ink: "#17171c" } },
      { type: "kinetic-text", data: { text: "hi", font_size: "40px" } },
      { type: "auto-tagged-link", data: { base: "x.ai", font_size: "96px", ink: "#f5f6fa" } },
    ]);
    expect(c[0].data.font_size).toBe("72px");
    expect(c[0].data.ink).toBe("#f5f6fa");
    expect(c[1].data.font_size).toBe("72px");
    expect(c[2].data.font_size).toBe("96px");   // a phone-sized value stands
    expect(c[2].data.ink).toBe("#f5f6fa");
  });

  it("leaves a takeover scene full-frame", () => {
    const c = build({ width: 1080, height: 1920 }, [{ type: "quotient-app-shell", data: {} }], false);
    expect(c[0].position).toMatchObject({ x: 0, y: 0, width: "100%", height: "100%" });
  });
});

describe("a speaker scene on a WIDE frame", () => {
  it("keeps the right-third dock and desktop type", () => {
    const comps = build({ width: 1920, height: 1080 }, AUTHORED);
    const composer = comps.find((c) => c.type === "composer");
    expect(pctNum(composer.position.x)).toBe(62);
    expect(pctNum(composer.position.width)).toBe(35);
    expect(composer.data.scale).toBeUndefined();
    expect(comps.find((c) => c.type === "floating-pills").position).toMatchObject({ x: 0, y: 0, width: "100%", height: "100%" });
  });
});
