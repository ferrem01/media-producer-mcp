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

  it("puts ONE surface full-width below the chin and the rest under the platform strip, never a side column", () => {
    for (const t of ["composer", "reel-caption-lane", "auto-tagged-link"]) {
      const p = by(t).position;
      expect(pctNum(p.x)).toBe(5);
      expect(pctNum(p.width)).toBe(90);
    }
    // The first surface owns the lower band (68%-82%: below a chest-up chin)...
    expect(by("composer").position).toEqual({ x: "5%", y: "68%", width: "90%", height: "14%" });
    // ...the next two stack under the platform strip (13%-30%).
    for (const t of ["reel-caption-lane", "auto-tagged-link"]) {
      const p = by(t).position;
      expect(pctNum(p.y)).toBeGreaterThanOrEqual(13);
      expect(pctNum(p.y) + pctNum(p.height)).toBeLessThanOrEqual(30.1);
    }
  });

  it("puts accents beside the head and floating pills below the chin, not on the face", () => {
    expect(by("sticker-prop").position).toEqual({ x: "64%", y: "31%", width: "31%", height: "12%" }); // beside the head, off both bands
    expect(by("floating-pills").position).toEqual({ x: "0%", y: "66%", width: "100%", height: "16%" });
  });

  it("lets the band layout win over a position the board wrote (measured: a 26%-tall composer on the list under it)", () => {
    const c = build({ width: 1080, height: 1920 }, [
      { type: "composer", data: { text: "x" }, position: { x: "5%", y: "58%", width: "90%", height: "26%" } },
    ]);
    expect(c[0].position).toEqual({ x: "5%", y: "68%", width: "90%", height: "14%" });
    const wide = build({ width: 1920, height: 1080 }, [
      { type: "composer", data: { text: "x" }, position: { x: "10%", y: "10%", width: "40%", height: "30%" } },
    ]);
    expect(wide[0].position).toEqual({ x: "10%", y: "10%", width: "40%", height: "30%" }); // wide frames still honour the board
  });

  it("renders a text-list as one plated caption phrase", () => {
    const c = build({ width: 1080, height: 1920 }, [{ type: "text-list", data: { title: "Running now", items: ["Email", "Social", "Web"], at: 5 } }]);
    expect(c[0].type).toBe("reel-caption-lane");
    expect(c[0].data).toMatchObject({ scrim: "plate", phrases: [{ text: "*Email* · *Social* · *Web*", start: 5, end: 12 }] });
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
