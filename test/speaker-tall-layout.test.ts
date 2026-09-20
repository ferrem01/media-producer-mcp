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

describe("a pile of props on a plain scene", () => {
  it("spreads around the frame instead of stacking on the second spot, keeping the middle band clear", () => {
    const draft: any = { label: "Beat", duration_seconds: 5, purpose: "", visual_notes: "", components: [], beats: [] };
    const authored = [{ type: "kinetic-text", data: { text: "Launch our product update next Tuesday." } }]
      .concat(Array.from({ length: 13 }, (_, i) => ({ type: "sticker-prop", data: { kind: "pill", text: "TASK " + i, at: 0.3 * (i + 1) } })));
    const res = buildAuthoredCompositionScene("s1", draft, authored, { sceneIndex: 1, totalScenes: 7, brandKit: { colors: {}, fonts: [] }, canvas: { width: 1080, height: 1080 }, hasSpeakerTrack: false } as any);
    const props = (res.scene.components as any[]).filter((c) => c.type === "sticker-prop");
    expect(props.length).toBe(13);
    const spots = new Set(props.map((c) => c.position.x + "," + c.position.y));
    expect(spots.size).toBeGreaterThanOrEqual(12);          // no stacking
    for (const c of props.slice(2)) {                       // the ring (the first two are the house spots)
      const y = Number(String(c.position.y).replace("%", "")), h = Number(String(c.position.height).replace("%", ""));
      expect(y + h <= 41 || y >= 40).toBe(true);           // the middle band stays the line's
    }
  });
});

describe("self-placing overlays", () => {
  it("the chapter kicker and the logo band take the whole frame on any layout and place themselves", () => {
    const tall = build({ width: 1080, height: 1920 }, [
      { type: "chapter-kicker", data: { text: "Define what good means", step: 2, steps: 3 } },
      { type: "logo-band", data: { logos: [{ text: "Nestlé" }, { text: "Gamma" }] } },
    ]);
    for (const t of ["chapter-kicker", "logo-band"]) {
      const c = tall.find((x) => x.type === t);
      expect(c.position).toEqual({ x: 0, y: 0, width: "100%", height: "100%" });
      expect(c.z_index).toBe(42);
    }
    const wide = build({ width: 1920, height: 1080 }, [{ type: "chapter-kicker", data: { text: "Test scenarios", step: 1, steps: 3 } }]);
    expect(wide.find((x) => x.type === "chapter-kicker").position).toEqual({ x: 0, y: 0, width: "100%", height: "100%" });
  });
  it("the lower third places itself too: the whole frame, never a side slot (it hung off the edge in a 35% slot)", () => {
    for (const canvas of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
      const out = build(canvas, [{ type: "lower-third", data: { name: "Marc Ferrentino", title: "Founder", style: "clean-bar", at: 0.3 } }]);
      const c = out.find((x) => x.type === "lower-third");
      expect(c.position).toEqual({ x: 0, y: 0, width: "100%", height: "100%" });
      expect(c.z_index).toBe(42);
    }
  });
});

describe("the scatter lane on a tall speaker frame", () => {
  it("owns the whole frame, pinned, and is never dropped to the chest band over a cutaway", () => {
    const comps = build({ width: 1080, height: 1920 }, [
      { type: "reel-caption-lane", data: { mode: "scatter", phrases: [{ text: "The big picture", start: 0.2 }, { text: "is that time", start: 1.1 }] } },
      { type: "sticker-prop", data: { kind: "stamp", text: "?", at: 3 } },
    ]);
    const lane = comps.find((c) => c.type === "reel-caption-lane");
    expect(lane.position).toEqual({ x: "0%", y: "0%", width: "100%", height: "100%" });
    expect(lane.z_index).toBe(41);
    expect(lane.data.cut_top).toBeUndefined();
  });
});

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
    expect(by("reel-caption-lane").position).toEqual({ x: "5%", y: "68%", width: "90%", height: "12%" });
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

describe("the bands and side slots stay inside the frame the punch-in shows", () => {
  it("cuts the side slots and the top band to the 1/zoom window centred on the face", async () => {
    const { tallSpeakerBands } = await import("../src/llm/scene-generator.js");
    // Marc's close take (proj_f10e79cf): the sticker beside the head left the frame under a 1.3x punch-in.
    const b = tallSpeakerBands({ cx: 0.565, cy: 0.566, size: 0.387 } as any, 9 / 16, 1.3);
    const win = 1 / 1.3, vx0 = Math.max(0, Math.min(1 - win, 0.565 - win / 2));
    for (const sd of b.sides) {
      expect(sd.x).toBeGreaterThanOrEqual(vx0 + 0.03 - 0.001);
      expect(sd.x + sd.width).toBeLessThanOrEqual(vx0 + win - 0.03 + 0.001);
    }
    expect(b.sides.length).toBeGreaterThan(0);
    // The chin is too low for a chest band; the top band starts inside the window.
    expect(b.lower).toBeNull();
    expect(b.top!.top).toBeGreaterThanOrEqual(Math.max(0, Math.min(1 - win, 0.566 - win / 2)) + 0.02 - 0.001);
    // No punch-in: the old geometry.
    const flat = tallSpeakerBands({ cx: 0.5, cy: 0.45, size: 0.3 } as any, 9 / 16, 1);
    expect(flat.sides.some((sd) => sd.x === 0.05)).toBe(true);
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
    // The one side with room -- inside the window a 1.3x punch-in still shows (measured live: a
    // sticker at the frame's edge left the frame under the zoom), so not at 5% any more.
    expect(pctNum(by("sticker-prop").position.x)).toBeGreaterThanOrEqual(21);
    expect(pctNum(by("sticker-prop").position.x)).toBeLessThan(50);
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
  it("the legibility gate drops ink findings for a scene that composites over the camera -- unless the ink fails on a dark AND a light page", async () => {
    const fs = await import("node:fs/promises");
    const p = await fs.readFile(new URL("../src/llm/pipeline.ts", import.meta.url), "utf8");
    expect(p).toMatch(/if \(type === "illegible" && opts\.overCamera && !\(failsAnyCamera && failsAnyCamera\.has\(d\.text\)\)\)/);
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

describe("THE SPLIT on a tall frame: the screen owns the top, the person the bottom", () => {
  const face = { cx: 0.5, cy: 0.5, size: 0.39 }; // a selfie take: face top at 30.5%
  const otsFace = { cx: 0.7, cy: 0.62, size: 0.3 }; // over the shoulder: face top at 47%
  it("a split proof takes the top of the frame flush, ending above the hairline (min 34%, max 55%)", async () => {
    const { splitScreenHeight } = await import("../src/llm/scene-generator.js");
    expect(splitScreenHeight(undefined)).toBe(47);
    expect(splitScreenHeight(face)).toBe(34);
    expect(splitScreenHeight(otsFace)).toBe(44);
    const c = build({ width: 1080, height: 1920 }, [
      { type: "video", data: { src: "/assets/t/projects/p/assets/rec.mp4", at: 1, exit_at: 9, use: "split" }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } },
      { type: "reel-caption-lane", data: { phrases: [{ text: "One answer", start: 6 }] } },
    ], undefined, otsFace);
    const v = c.find((x) => x.type === "video");
    expect(v.position).toEqual({ x: "0%", y: "0%", width: "100%", height: "44%" });
    expect(v.z_index).toBe(36);
  });
  it("a cutaway without the mark still takes the whole frame", () => {
    const c = build({ width: 1080, height: 1920 }, [
      { type: "video", data: { src: "/assets/t/projects/p/assets/rec.mp4", at: 1, exit_at: 9 }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } },
    ], undefined, otsFace);
    expect(c.find((x) => x.type === "video").position).toEqual({ x: "0%", y: "0%", width: "100%", height: "100%" });
  });
  it("a library mock marked use:split in its data is the split too", () => {
    const c = build({ width: 1080, height: 1920 }, [
      { type: "quotient-campaign", data: { use: "split" }, enter: { effect: "cut", at: 1 }, exit: { effect: "cut", at: 9 } },
    ], undefined, face);
    expect(c.find((x) => x.type === "quotient-campaign").position).toEqual({ x: "0%", y: "0%", width: "100%", height: "34%" });
  });
});

describe("a speaker screencast on a tall canvas is the split, not a bubble", () => {
  it("puts the recording in the top of the frame with no PiP and leaves the scene transparent for the person", async () => {
    const { buildTemplateScene } = await import("../src/llm/scene-generator.js");
    const draft: any = { label: "Walkthrough", duration_seconds: 20, scene_template: { type: "st-speaker-screencast", data: { source: "/assets/t/projects/p/assets/tab.mp4" } }, take_face: { cx: 0.7, cy: 0.62, size: 0.3 } };
    const mk = (canvas: any) => buildTemplateScene("s1", draft, { sceneIndex: 0, totalScenes: 1, canvas, tenantId: "t", brandKit: { colors: {}, fonts: [] } } as any)!.scene as any;
    const tall = mk({ width: 1080, height: 1920 });
    const frame = tall.components.find((c: any) => c.type === "screencast-frame");
    expect(frame.position).toEqual({ x: "0%", y: "0%", width: "100%", height: "44%" });
    expect(frame.data.pip_source).toBeUndefined();
    expect(frame.data.max_width_pct).toBe(100);
    expect(tall.transparent_background).toBeUndefined();
    const wide = mk({ width: 1920, height: 1080 });
    const wf = wide.components.find((c: any) => c.type === "screencast-frame");
    expect(wf.position.height).toBe("100%");
    expect(wf.data.pip_source).toBe("speaker");
    expect(wide.transparent_background).toBe(false);
  });
});

describe("THE SLICE UNDER THE SCREEN: the rig slides the person under the split, the band slides in", () => {
  it("a selfie take slides down a few percent with no zoom; a face that would move up zooms just enough to cover", async () => {
    const { splitSlide } = await import("../src/llm/scene-generator.js");
    expect(splitSlide({ cx: 0.5, cy: 0.5, size: 0.39 })).toEqual({ dy: 7, scale: 1 });   // hairline 30.5% -> under a 34% band
    expect(splitSlide({ cx: 0.7, cy: 0.62, size: 0.3 })).toEqual({ dy: 0, scale: 1 });   // over the shoulder: already under a 44% band
    expect(splitSlide({ cx: 0.5, cy: 0.75, size: 0.3 })).toEqual({ dy: -2, scale: 1.04 }); // face low: up 2%, zoom covers the bottom
    expect(splitSlide(undefined)).toEqual({ dy: 0, scale: 1 });
  });
  it("the creator-cut camera slides on a split cut (instead of resetting) and comes back to the face after", async () => {
    const { creatorCutCameraMoves } = await import("../src/llm/scene-generator.js");
    const moves = creatorCutCameraMoves([
      { type: "quotient-campaign", data: { use: "split" }, enter: { effect: "cut", at: 4 }, exit: { effect: "cut", at: 12 } },
    ] as any, { grammar: "creator-cut", face: { cx: 0.5, cy: 0.5, size: 0.39 }, duration: 16, takeover: false })!;
    const slide = moves.find((m) => m.type === "slide") as any;
    expect(slide).toMatchObject({ at: 4, dy: 7, scale: 1, duration: 0.55 });
    expect(moves.some((m) => m.type === "reset" && m.at === 4)).toBe(false);
    expect(moves.some((m) => m.type === "zoom" && m.at === 12)).toBe(true);
  });
  it("the split band is pinned to the frame, slides in from above and lifts out; a short band fills its height", async () => {
    const { wrapperChoreoScript, isSplitWrapper } = await import("../src/core/scene-assembler.js");
    expect(isSplitWrapper({ data: { use: "split" } })).toBe(true);
    expect(isSplitWrapper({ data: { src: "x.png" } })).toBe(false);
    const js = wrapperChoreoScript([
      { id: "c1", type: "video", data: { src: "/a/rec.mp4", use: "split" }, position: { x: "0%", y: "0%", width: "100%", height: "44%" }, enter: { effect: "cut", at: 2 }, exit: { effect: "cut", at: 9 } } as any,
    ], 12, "", 1080, 1920);
    expect(js).toMatch(/"split":true/);
    expect(js).toMatch(/if \(eCut && c\.split\) \{[\s\S]*yPercent: -115, autoAlpha: 1/);
    expect(js).toMatch(/if \(xCut && c\.split\) \{[\s\S]*yPercent: -115, duration: 0\.45/);
    expect(js).toMatch(/if \(H < CH \* 0\.6\) sc = Math\.max\(sc, Math\.min\(3\.2, \(H \* 0\.88\) \/ r\.h\)\);/);
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/core/scene-assembler.ts", import.meta.url), "utf-8");
    expect(src).toMatch(/isFixedToFrame\(comp\.type\) \|\| isSplitWrapper\(comp\) \? ` data-mp-fixed="1"`/);
    expect(src).toMatch(/else if \(m\.type === 'slide'\) \{/);
    const comp = await fs.readFile(new URL("../src/core/composite-assembler.ts", import.meta.url), "utf-8");
    expect(comp).toMatch(/isFixedToFrame\(comp\.type\) \|\| isSplitWrapper\(comp\) \? ' data-mp-fixed="1"'/);
  });
});
