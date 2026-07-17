import { describe, it, expect } from "vitest";
import { focusEventsFromChanges, type FrameChange } from "../src/core/compress-waiting.js";
import { planCallouts } from "../src/core/callout-plan.js";

const still = (): FrameChange => ({ score: 0.05, changedFrac: 0, box: null });
const localized = (x: number, y: number): FrameChange => ({
  score: 2.2,
  changedFrac: 0.02,
  box: { x, y, w: 0.12, h: 0.08 },
});
const fullRepaint = (): FrameChange => ({
  score: 40,
  changedFrac: 0.9,
  box: { x: 0, y: 0, w: 1, h: 1 },
});

describe("focusEventsFromChanges", () => {
  it("finds a sustained localized burst and merges its seconds", () => {
    // 10s still, 4s of typing in one spot, 10s still (4 fps)
    const changes: FrameChange[] = [
      ...Array.from({ length: 40 }, still),
      ...Array.from({ length: 16 }, () => localized(0.3, 0.42)),
      ...Array.from({ length: 40 }, still),
    ];
    const ev = focusEventsFromChanges(changes, 4);
    expect(ev.length).toBe(1);
    expect(ev[0].start).toBe(10);
    expect(ev[0].end).toBe(14);
    expect(ev[0].x).toBeCloseTo(0.3, 1);
    expect(ev[0].w).toBeLessThan(0.3);
  });

  it("rejects full-frame repaints and scrolls", () => {
    const changes: FrameChange[] = [
      ...Array.from({ length: 20 }, still),
      ...Array.from({ length: 12 }, fullRepaint),
      ...Array.from({ length: 20 }, still),
    ];
    expect(focusEventsFromChanges(changes, 4)).toEqual([]);
  });

  it("drops sub-second blips", () => {
    const changes: FrameChange[] = [
      ...Array.from({ length: 20 }, still),
      ...Array.from({ length: 2 }, () => localized(0.5, 0.5)),
      ...Array.from({ length: 20 }, still),
    ];
    expect(focusEventsFromChanges(changes, 4)).toEqual([]);
  });
});

describe("planCallouts", () => {
  const identity = [{ src_start: 0, src_end: 300, rate: 1 }];
  const focus = [
    { start: 28, end: 33, x: 0.6, y: 0.1, w: 0.15, h: 0.1 },
    { start: 100, end: 104, x: 0.2, y: 0.5, w: 0.1, h: 0.08 },
  ];

  it("proposes a callout where an action cue meets a focus event", () => {
    const callouts = planCallouts(
      [
        { text: "Here we can see the overview of the campaign.", start: 10, end: 15 }, // no cue
        { text: "Now click the Broadcasts tab to open it.", start: 29, end: 33 },     // cue + focus
      ],
      [], identity, focus, 280,
    );
    expect(callouts.length).toBe(1);
    expect(callouts[0].at).toBe(29);
    // Box covers the focus region (60%,10% with padding), in percent.
    expect(callouts[0].x).toBeGreaterThan(50);
    expect(callouts[0].x).toBeLessThan(60);
    expect(callouts[0].w).toBeGreaterThanOrEqual(14);
  });

  it("skips cues with no concentrated activity nearby", () => {
    const callouts = planCallouts(
      [{ text: "Click save when you're done.", start: 200, end: 203 }],
      [], identity, focus, 280,
    );
    expect(callouts).toEqual([]);
  });

  it("respects chapter cards, spacing and the callout cap", () => {
    const manyFocus = Array.from({ length: 20 }, (_, i) => ({
      start: i * 14, end: i * 14 + 4, x: 0.4, y: 0.4, w: 0.1, h: 0.1,
    }));
    const captions = Array.from({ length: 20 }, (_, i) => ({
      text: "Now click the button.", start: i * 14 + 0.5, end: i * 14 + 4,
    }));
    const callouts = planCallouts(captions, [{ at: 42 }], identity, manyFocus, 280);
    expect(callouts.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < callouts.length; i++) {
      expect(callouts[i].at - callouts[i - 1].at).toBeGreaterThanOrEqual(18);
    }
    expect(callouts.every((c) => Math.abs(c.at - 42) >= 5)).toBe(true);
  });
});
