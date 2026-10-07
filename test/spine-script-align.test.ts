import { describe, it, expect } from "vitest";
import { alignToScript, measuredSpine, resolveAnchor } from "../src/core/word-anchors.js";
import { captionLane } from "../src/core/captions.js";

// THE SCRIPT'S WORDS ON THE RECORDING'S CLOCK (Oct 7): the churn film's
// captions read what whisper heard ("Turn doesn't happen on Renewable Day",
// "Sigma 5", "gatequotion.ai") and anchors on the script's words missed.
const heardOf = (txt: string, step = 0.4) => measuredSpine(txt.split(" ").map((w, i) => ({ text: w, start: 0.3 + i * step, end: 0.3 + i * step + step * 0.9 })), 8);

describe("alignToScript", () => {
  it("keeps the script's words and the recording's timing where whisper misheard", () => {
    const heard = heardOf("Turn doesn't happen on Renewable Day. It shows up months earlier in five signals.");
    const sp = alignToScript(heard, "Churn doesn't happen on renewal day.\nIt shows up months earlier, in five signals.");
    expect(sp.source).toBe("measured");
    expect(sp.words.map((w) => w.text).join(" ")).toBe("Churn doesn't happen on renewal day. It shows up months earlier, in five signals.");
    expect(sp.words[0].start).toBe(heard.words[0].start);                  // "Churn" sits where "Turn" was heard
    expect(sp.words[5]).toMatchObject({ start: heard.words[5].start, end: heard.words[5].end }); // day.
    expect(captionLane(sp, [])!.data.phrases.map((p: any) => p.text).join(" ")).not.toMatch(/Turn|Renewable/);
  });

  it("shares a misheard run's span, and an anchor on the script's word now lands", () => {
    const heard = heardOf("Pick one signal this week. Why are one flow into it? Set these up for free at gatequotion.ai.");
    const sp = alignToScript(heard, "Pick one signal this week.\nWire one flow to it.\nSet these up free at getquotient.ai.");
    const txt = sp.words.map((w) => w.text);
    expect(txt).toContain("Wire"); expect(txt).toContain("getquotient.ai."); expect(txt).not.toContain("for");
    const wire = sp.words[txt.indexOf("Wire")];
    expect(wire.start).toBeCloseTo(heard.words[5].start, 3);               // "Why are" -> "Wire"
    expect(resolveAnchor(sp, { word: "getquotient.ai." })).toBeCloseTo(heard.words[heard.words.length - 1].start, 3);
    for (let i = 1; i < sp.words.length; i++) expect(sp.words[i].start).toBeGreaterThanOrEqual(sp.words[i - 1].start);
  });

  it("gives a script word whisper dropped a slot in its gap", () => {
    const heard = heardOf("Signal five the feature sits untouched.");
    const sp = alignToScript(heard, "Signal five: the feature they bought it for sits untouched.");
    const t = sp.words.map((w) => w.text);
    expect(t).toEqual(["Signal", "five:", "the", "feature", "they", "bought", "it", "for", "sits", "untouched."]);
    const they = sp.words[4], sits = sp.words[8];
    expect(they.start).toBeGreaterThanOrEqual(sp.words[3].end - 1e-6);
    expect(sits.start).toBe(heard.words[4].start);
  });

  it("keeps what was said when the take left the script", () => {
    const heard = heardOf("So today I want to talk about something completely different okay");
    expect(alignToScript(heard, "Churn doesn't happen on renewal day.")).toBe(heard);
  });
});
