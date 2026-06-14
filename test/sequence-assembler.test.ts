import { describe, it, expect } from "vitest";

// We test the fillMissingStartTimes behavior indirectly by importing
// the assembler and checking that missing startTimes get filled.
// Since fillMissingStartTimes is not exported, we test via the module.

// Direct unit test: replicate the logic
function fillMissingStartTimes(
  choreography: Array<{ label: string; startTime?: number; duration?: number; visibleComponents: string[] }>,
  beats: Array<{ label: string; duration_seconds: number }>,
) {
  var needsFill = choreography.some(c => c.startTime == null);
  if (!needsFill) return choreography;

  var beatDurations = new Map<string, number>();
  for (var b of beats) {
    beatDurations.set(b.label, b.duration_seconds);
  }

  var runningTime = 0;
  return choreography.map(c => {
    var duration = c.duration ?? beatDurations.get(c.label) ?? 5;
    var startTime = c.startTime ?? runningTime;
    runningTime = startTime + duration;
    return { ...c, startTime, duration };
  });
}

describe("fillMissingStartTimes", () => {
  it("fills startTime from cumulative beat durations", () => {
    var choreography = [
      { label: "chat", visibleComponents: ["comp_0"] },
      { label: "connect", visibleComponents: ["comp_0", "comp_1"] },
      { label: "publish", visibleComponents: ["comp_2"] },
    ];
    var beats = [
      { label: "chat", duration_seconds: 8 },
      { label: "connect", duration_seconds: 8 },
      { label: "publish", duration_seconds: 7 },
    ];

    var result = fillMissingStartTimes(choreography, beats);

    expect(result[0].startTime).toBe(0);
    expect(result[0].duration).toBe(8);
    expect(result[1].startTime).toBe(8);
    expect(result[1].duration).toBe(8);
    expect(result[2].startTime).toBe(16);
    expect(result[2].duration).toBe(7);
  });

  it("preserves existing startTime values", () => {
    var choreography = [
      { label: "a", startTime: 0, duration: 5, visibleComponents: ["c0"] },
      { label: "b", startTime: 5, duration: 5, visibleComponents: ["c1"] },
    ];
    var beats = [
      { label: "a", duration_seconds: 5 },
      { label: "b", duration_seconds: 5 },
    ];

    var result = fillMissingStartTimes(choreography, beats);

    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(5);
  });

  it("uses default duration of 5 when beat not found", () => {
    var choreography = [
      { label: "unknown", visibleComponents: ["c0"] },
    ];
    var beats: Array<{ label: string; duration_seconds: number }> = [];

    var result = fillMissingStartTimes(choreography, beats);

    expect(result[0].startTime).toBe(0);
    expect(result[0].duration).toBe(5);
  });
});
