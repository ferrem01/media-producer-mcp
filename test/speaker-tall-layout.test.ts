import { describe, it, expect } from "vitest";
import { buildPositionStyle } from "../src/core/scene-assembler.js";
import { buildAuthoredCompositionScene } from "../src/llm/scene-generator.js";

// Measured live on proj_234d8a01: the wide speaker dock put the composer,
// captions and URL in a 35%-wide right-third column with 34px type, and the
// floating pills over the speaker's eyes. A tall frame has no "beside her".
function build(canvas: { width: number; height: number }, authored: any[], transparent?: boolean, face?: { cx: number; cy: number; size: number }) {
  const draft: any = {
    label: "Beat", duration_seconds: 12, purpose: "", visual_notes: "", components: [], beats: [],
    ...(transparent === undefined ? {} : { transparent_background: transparent }),
    ...(face ? { take_face: face } : {}),
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

  it("puts the captions full-width below the chin and the surfaces under the platform strip, never a side column", () => {
    for (const t of ["composer", "reel-caption-lane", "auto-tagged-link"]) {
      const p = by(t).position;
      expect(pctNum(p.x)).toBe(5);
      expect(pctNum(p.width)).toBe(90);
    }
    // THE WORDS RIDE OVER EVERYTHING: the caption lane owns the lower band
    // (68%-82%: below a chest-up chin), above a cut-in proof (36) and a
    // label (39), so it runs through the cutaways (core/captions.ts)...
    expect(by("reel-caption-lane").position).toEqual({ x: "5%", y: "68%", width: "90%", height: "14%" });
    expect(by("reel-caption-lane").z_index).toBe(41);
    // ...and the surfaces stack under the platform strip (13%-30%).
    for (const t of ["composer", "auto-tagged-link"]) {
      const p = by(t).position;
      expect(pctNum(p.y)).toBeGreaterThanOrEqual(13);
      expect(pctNum(p.y) + pctNum(p.height)).toBeLessThanOrEqual(30.1);
    }
  });

  it("puts accents beside the head and floating pills below the chin, not on the face", () => {
    expect(by("sticker-prop").position).toEqual({ x: "64%", y: "31%", width: "31%", height: "12%" }); // beside the head, off both bands
    expect(by("floating-pills").position).toEqual({ x: "0%", y: "68%", width: "100%", height: "14%" });
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

  it("zooms the wrapper 1.8x for a phone unless the board set the component's own size", () => {
    expect(by("composer").zoom).toBe(1.8);
    expect(by("sticker-prop").zoom).toBe(1.8);
    expect(by("floating-pills").zoom).toBe(1.8);
    expect(by("kinetic-text")?.zoom ?? by("reel-caption-lane").zoom).toBeUndefined(); // sizes itself already
    expect(buildPositionStyle({ id: "x", type: "composer", data: {}, position: { x: "5%", y: "60%", width: "90%", height: "20%" }, zoom: 1.8 } as any)).toMatch(/zoom:1\.8/);
    expect(by("auto-tagged-link").data.font_size).toBe("72px");
    expect(by("reel-caption-lane").data.scale).toBeUndefined(); // auto-fits its box already
    const own = build({ width: 1080, height: 1920 }, [{ type: "sticker-prop", data: { kind: "pill", text: "x", scale: 1.2 } }]);
    expect(own[0].data.scale).toBe(1.2);
    expect(own[0].zoom).toBeUndefined();
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

describe("a speaker scene laid out around a MEASURED face", () => {
  const BED = { cx: 0.569, cy: 0.61, size: 0.406 };
  it("with the face low in the frame, the captions take the band above the hairline and nothing sits under the chin", () => {
    const comps = build({ width: 1080, height: 1920 }, AUTHORED, undefined, BED);
    const by = (t: string) => comps.find((c) => c.type === t);
    // No room under the chin: the words win the one band there is; the
    // surfaces that wanted it have no band left and are dropped (the
    // captions are the film's text layer, a composer is furniture).
    const lane = by("reel-caption-lane").position;
    expect(pctNum(lane.y)).toBeGreaterThanOrEqual(13);
    expect(pctNum(lane.y) + pctNum(lane.height)).toBeLessThanOrEqual(32.1);
    expect(by("composer")).toBeUndefined();
    expect(by("auto-tagged-link")).toBeUndefined();
    // Without the lane, every surface goes above the hairline as before.
    const plain = build({ width: 1080, height: 1920 }, AUTHORED.filter((c) => c.type !== "reel-caption-lane"), undefined, BED);
    for (const t of ["composer", "auto-tagged-link"]) {
      const p = plain.find((c) => c.type === t).position;
      expect(pctNum(p.y)).toBeGreaterThanOrEqual(13);
      expect(pctNum(p.y) + pctNum(p.height)).toBeLessThanOrEqual(32.1);
    }
    expect(pctNum(by("sticker-prop").position.x)).toBe(5);       // the one side with room
    expect(pctNum(by("floating-pills").position.y)).toBeGreaterThanOrEqual(13); // the pills share the free band, never the face
    expect(pctNum(by("floating-pills").position.y) + pctNum(by("floating-pills").position.height)).toBeLessThanOrEqual(32.1);
  });
});

describe("desktop furniture on a phone reel", () => {
  it("drops a progress-bar and turns a notification-stack into floating pills of its apps", () => {
    const comps = build({ width: 1080, height: 1920 }, [
      { type: "notification-stack", data: { notifications: [{ app: "Slack", message: "12 new" }, { app: "Gmail", message: "47 unread" }, { app: "Slack", message: "again" }], at: 1.5 } },
      { type: "progress-bar", data: { value: 100, label: "THE PAIN" } },
      { type: "composer", data: { text: "hi", at: 2 } },
    ]);
    expect(comps.map((c) => c.type)).toEqual(["floating-pills", "composer"]);
    expect(comps[0].data.items).toEqual(["Slack", "Gmail"]);
    expect(comps[0].data.at).toBe(1.5);
    expect(comps[0].zoom).toBe(1.8);
  });
  it("leaves them alone on a wide frame", () => {
    const comps = build({ width: 1920, height: 1080 }, [{ type: "progress-bar", data: { value: 50 } }, { type: "notification-stack", data: { notifications: [{ app: "Slack" }] } }]);
    expect(comps.map((c) => c.type)).toEqual(["progress-bar", "notification-stack"]);
    expect(comps[0].zoom).toBeUndefined();
  });
});

describe("type over the camera", () => {
  it("kinetic words ride on a plate, and a typewriter (sized in vw) is not zoomed on top of that", () => {
    const comps = build({ width: 1080, height: 1920 }, [
      { type: "kinetic-text", data: { text: "ONE PLACE", at: 0, color: "#101014" } },
      { type: "typewriter", data: { text: "Get more signups from the webinar.", font_size: "6vw" } },
    ]);
    const k = comps.find((c) => c.type === "kinetic-text")!, t = comps.find((c) => c.type === "typewriter")!;
    expect(k.data.plate).toBe(true);
    expect(k.zoom).toBeUndefined();
    expect(t.zoom).toBeUndefined();
  });
  it("the legibility gate drops ink findings for a scene that composites over the camera", async () => {
    const fs = await import("node:fs/promises");
    const p = await fs.readFile(new URL("../src/llm/pipeline.ts", import.meta.url), "utf8");
    expect(p).toMatch(/if \(type === "illegible" && opts\.overCamera\)/);
    expect(p.match(/overCamera: personBase &&/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("app mocks have no phone form on a speaker reel", () => {
  it("drops quotient-chat, chat-simulator and browser-frame; keeps the composer", () => {
    const comps = build({ width: 1080, height: 1920 }, [
      { type: "quotient-chat", data: { script: [] } },
      { type: "chat-simulator", data: {} },
      { type: "browser-frame", data: { url: "x" } },
      { type: "composer", data: { text: "hi", at: 2 } },
    ]);
    expect(comps.map((c) => c.type)).toEqual(["composer"]);
  });
});
