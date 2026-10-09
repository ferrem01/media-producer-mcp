import { describe, it, expect } from "vitest";
import { captionsYieldToCover, coverWindows } from "../src/core/caption-yield.js";

// Marc, Oct 9 (Dana): the caption covered the cover's date and time. The
// lane is pinned above everything, so it steps aside while a full-screen
// cover is up.
const lane = (phrases: any[]) => ({ id: "caps", type: "reel-caption-lane", data: { phrases } });
const cover = (extra: any) => ({ id: "cover", type: "webinar-cover", position: { x: 0, y: 0, width: "100%", height: "100%" },
  data: { title: "T", ground: "waves" }, ...extra });

describe("captions step aside for a full-screen cover", () => {
  it("opener: phrases under the cover go, one straddling its exit starts after it", () => {
    const scene: any = { id: "s", duration_seconds: 4, components: [
      cover({ exit: { effect: "slide-up", at: 1.2, duration: 0.45 } }),
      lane([{ text: "Is your", start: 0.1, end: 1 }, { text: "marketing data", start: 1, end: 2.1 }, { text: "spread", start: 2.1, end: 3 }]),
    ] };
    expect(coverWindows(scene)).toEqual([[0, 1.65]]);
    const out: any = captionsYieldToCover(scene);
    expect(out.components[1].data.phrases).toEqual([
      { text: "marketing data", start: 1.65, end: 2.1 }, { text: "spread", start: 2.1, end: 3 }]);
    expect(scene.components[1].data.phrases).toHaveLength(3); // saved data untouched
  });

  it("close: captions stop when the cover comes down", () => {
    const scene: any = { id: "s", duration_seconds: 3.9, components: [
      lane([{ text: "It's free.", start: 0.4, end: 2.4 }, { text: "Click the link", start: 2.4, end: 3.1 }]),
      cover({ enter: { effect: "slide-down", at: 2.26, duration: 0.45 } }),
    ] };
    const out: any = captionsYieldToCover(scene);
    expect(out.components[0].data.phrases).toEqual([{ text: "It's free.", start: 0.4, end: 2.26 }]);
  });

  it("leaves a scene alone without a full-screen cover on its own sheet", () => {
    const card: any = { id: "s", duration_seconds: 4, components: [
      cover({ position: { x: "6%", y: "53%", width: "88%", height: "12%" } }), lane([{ text: "A", start: 0, end: 2 }])] };
    expect(captionsYieldToCover(card)).toBe(card);
    const bare: any = { id: "s", duration_seconds: 4, components: [
      { ...cover({}), data: { title: "T" } }, lane([{ text: "A", start: 0, end: 2 }])] };
    expect(captionsYieldToCover(bare)).toBe(bare);
  });
});
