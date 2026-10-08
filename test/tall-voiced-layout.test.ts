import { describe, it, expect } from "vitest";

// The fresh Six Tabs build (proj_27c1233f, 9x16 relay, voiced): the flood
// filled a band (a black rectangle mid-frame), the click-stream, the Claude
// session and the report were squeezed into fifths of the frame, the words
// sat under them, and a sticker stamped in the platform UI's top band.
const opts = (extra: any = {}) => ({
  sceneIndex: 0, totalScenes: 6, brandKit: { colors: { primary: "#393bf5" }, fonts: [] },
  canvas: { width: 1080, height: 1920 }, hasSpeakerTrack: false, treatment: { filmGrammar: "relay", frame: "9x16" }, ...extra,
});
const lane = { type: "reel-caption-lane", position: { x: "5%", y: "66%", width: "90%", height: "11%" }, z_index: 41, data: { phrases: [{ text: "Analytics,", start: 0, end: 1 }] } };
const pctOf = (v: any) => parseFloat(String(v));

describe("a voiced tall frame: one stage above the words", () => {
  it("the flood is the whole frame under the words; the one surface takes the stage above the lane", async () => {
    const { buildAuthoredCompositionScene } = await import("../src/llm/scene-generator.js");
    const draft: any = { label: "s2", duration_seconds: 4, purpose: "", visual_notes: "", components: [], beats: [] };
    const comps = buildAuthoredCompositionScene("s2", draft, [
      { type: "color-flood", data: { mode: "contract", color: "#0b0b0c", at: 0 } },
      { type: "click-stream", data: { stops: [{ src: "/assets/t/projects/p/assets/c01.jpg", w: 1080, h: 1350 }] } },
      lane,
    ] as any, opts() as any).scene.components as any[];
    const flood = comps.find((c) => c.type === "color-flood");
    expect(flood.position).toMatchObject({ x: 0, y: 0, width: "100%", height: "100%" });
    const cap = comps.find((c) => c.type === "reel-caption-lane");
    expect(cap.z_index).toBeGreaterThan(flood.z_index);
    const cs = comps.find((c) => c.type === "click-stream");
    expect(pctOf(cs.position.height)).toBeGreaterThan(40);
    expect(pctOf(cs.position.y) + pctOf(cs.position.height)).toBeLessThanOrEqual(64.1);
  });

  it("a people strip takes a slim band and the session the rest; stickers stamp inside the safe band", async () => {
    const { buildAuthoredCompositionScene } = await import("../src/llm/scene-generator.js");
    const draft: any = { label: "s4", duration_seconds: 5, purpose: "", visual_notes: "", components: [], beats: [] };
    const comps = buildAuthoredCompositionScene("s4", draft, [
      { type: "claude-code-session", data: { script: [] } },
      { type: "people-row", data: { people: [{ name: "Max Davish" }] } },
      { type: "sticker-prop", data: { kind: "pill", text: "TEST" } },
      lane,
    ] as any, opts() as any).scene.components as any[];
    const session = comps.find((c) => c.type === "claude-code-session");
    const row = comps.find((c) => c.type === "people-row");
    expect(pctOf(session.position.height)).toBeGreaterThan(pctOf(row.position.height) * 2);
    expect(pctOf(session.position.height)).toBeGreaterThan(30);
    const st = comps.find((c) => c.type === "sticker-prop");
    expect(pctOf(st.position.y)).toBeGreaterThanOrEqual(12);
    expect(pctOf(st.position.y) + pctOf(st.position.height)).toBeLessThanOrEqual(64);
  });
});
