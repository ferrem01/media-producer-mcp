/**
 * Inserted transitions add video time the content clock doesn't know about;
 * audio placed on the raw content clock plays EARLY after every boundary
 * (heard as lip-sync error on speaker films -- the +0.5s bubble bug).
 */
import { describe, it, expect } from "vitest";
import { expectedInsertedTransitions } from "../src/core/render.js";

const film = (transitions: Array<any>) => ({
  scenes: [
    { id: "intro", duration_seconds: 6.1, transition_in: transitions[0] },
    { id: "screencast", duration_seconds: 111.9, transition_in: transitions[1] },
    { id: "outro", duration_seconds: 5.2, transition_in: transitions[2] },
  ],
}) as any;

describe("expectedInsertedTransitions", () => {
  it("defaults to a 0.5s crossfade at every boundary", () => {
    const ins = expectedInsertedTransitions(film([undefined, undefined, undefined]));
    expect(ins).toEqual([
      { atContentTime: 6.1, seconds: 0.5 },
      { atContentTime: 118, seconds: 0.5 },
    ]);
  });

  it("honors explicit durations and none", () => {
    const ins = expectedInsertedTransitions(film([
      undefined,
      { type: "match-cut", duration_seconds: 1.2 },
      { type: "none" },
    ]));
    expect(ins).toEqual([{ atContentTime: 6.1, seconds: 1.2 }]);
  });

  it("a track starting exactly at a boundary shifts by that boundary's transition", () => {
    const ins = expectedInsertedTransitions(film([undefined, undefined, undefined]));
    const insertedBefore = (t: number) =>
      ins.reduce((s, tr) => s + (tr.atContentTime <= t + 0.001 ? tr.seconds : 0), 0);
    expect(insertedBefore(0)).toBe(0);        // music bed at film start
    expect(insertedBefore(6.1)).toBe(0.5);    // narration at scene 2 start
    expect(insertedBefore(120)).toBe(1);      // anything past the outro boundary
  });
});
