import { describe, it, expect } from "vitest";
import { detectStageDirectionLeaks, htmlToText } from "../src/llm/focused-detectors.js";

describe("detectStageDirectionLeaks", () => {
  it("catches the real leak from proj_572b4f2c scene 7", () => {
    // The storyboard parenthetical rendered as visible pixels.
    const text = htmlToText(
      "<div class='mini-card'><span>Quotient Agent</span><span>AGENT THREAD (MINIATURE, TOP-LEFT)</span></div>",
    );
    const defects = detectStageDirectionLeaks(text);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects[0].type).toBe("stage_direction_leak");
    expect(defects[0].detail).toContain("miniature");
  });

  it("catches positional parentheticals", () => {
    expect(detectStageDirectionLeaks("summary card (bottom-right) shows totals").length).toBe(1);
    expect(detectStageDirectionLeaks("cursor drifts (camera pushes in slowly)").length).toBe(1);
  });

  it("catches unambiguous authoring markers", () => {
    expect(detectStageDirectionLeaks("lorem ipsum dolor sit amet").length).toBe(1);
    expect(detectStageDirectionLeaks("todo: replace with real headline").length).toBe(1);
  });

  it("does not flag legitimate product copy", () => {
    const legit = [
      "your week's posts. one conversation.",
      "turn this week's campaign brief into a linkedin post and an x post",
      "schedule (2 slots left this week)",
      "published wed 9:00 am - linkedin post",
      "we shipped floating chat - stay in flow while the agent works alongside you",
      "top left corner of the dashboard shows notifications", // positional words OUTSIDE parens are prose
    ];
    for (const t of legit) {
      expect(detectStageDirectionLeaks(t), `false positive on: ${t}`).toEqual([]);
    }
  });

  it("caps at 3 defects", () => {
    const text = "(top-left) a (camera zoom in) b lorem ipsum c (bottom-right) d todo: e";
    expect(detectStageDirectionLeaks(text).length).toBeLessThanOrEqual(3);
  });
});
