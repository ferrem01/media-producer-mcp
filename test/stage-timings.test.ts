import { describe, it, expect } from "vitest";
import { createStageTimer } from "../src/llm/pipeline.js";

// #39 starts here. A 20-minute generate on a film that was three-quarters
// deterministic assembly is a claim nobody could check, because the pipeline
// reported percentages and never durations. This is the measurement.

const clock = (ms: number[]) => {
  let i = 0;
  return () => ms[Math.min(i++, ms.length - 1)];
};

describe("createStageTimer", () => {
  it("attributes elapsed time to the stage that was running", () => {
    // start=0 | mark(concept)@1000 | mark(storyboarding)@3000 | finish@9000
    const t = createStageTimer(clock([0, 1000, 1000, 3000, 3000, 9000, 9000]));
    t.mark("concept");
    t.mark("storyboarding");
    expect(t.finish()).toEqual([
      { step: "starting", seconds: 1 },
      { step: "concept", seconds: 2 },
      { step: "storyboarding", seconds: 6 },
    ]);
  });

  it("does not split a stage that ticks repeatedly", () => {
    // Scene generation reports progress many times under one step name.
    const t = createStageTimer(clock([0, 5000, 5000, 12000, 12000]));
    t.mark("scenes");
    t.mark("scenes");
    t.mark("scenes");
    t.mark("editorial");
    const out = t.finish();
    expect(out.filter((s) => s.step === "scenes")).toHaveLength(1);
    expect(out.find((s) => s.step === "scenes")!.seconds).toBe(7);
  });

  it("ranks the summary slowest-first and hides sub-second noise", () => {
    const t = createStageTimer(clock([0, 100, 100, 60_000, 60_000, 70_000, 70_000]));
    t.mark("concept");        // starting: 0.1s -- noise
    t.mark("storyboarding");  // concept: 59.9s
    t.finish();               // storyboarding: 10s
    const s = t.summary();
    expect(s).toMatch(/^70\.0s total: /);
    expect(s.indexOf("concept")).toBeLessThan(s.indexOf("storyboarding"));
    expect(s).not.toContain("starting");
  });
});
