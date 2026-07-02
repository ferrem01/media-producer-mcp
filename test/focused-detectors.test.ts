import { describe, it, expect } from "vitest";
import { htmlToText, verifyInstance } from "../src/llm/focused-detectors.js";

describe("htmlToText", () => {
  it("strips tags, scripts, and styles; normalizes whitespace", () => {
    const html = `<html><head><style>.x{color:red}</style><script>var a=1;</script></head>
      <body><div class="hero">Hello   <b>World</b></div>&nbsp;<span>Metrics: 42</span></body></html>`;
    expect(htmlToText(html)).toBe("hello world metrics: 42");
  });
});

describe("verifyInstance (hallucination guard)", () => {
  const ctx = {
    sceneText: htmlToText("<div>Every signal, captured. <span>Start for free</span></div>"),
    specText: "A thin blue beam sweeps the frame, then a notification badge reading '47 unread' appears.",
  };

  it("accepts purely visual findings (no evidence)", () => {
    expect(verifyInstance({ evidence: "", detail: "two cards overlap bottom-left" }, "scene", ctx)).toBe(true);
  });

  it("accepts evidence that exists in the scene text", () => {
    expect(verifyInstance({ evidence: "Every signal, captured.", detail: "x" }, "scene", ctx)).toBe(true);
    expect(verifyInstance({ evidence: "start FOR free", detail: "x" }, "scene", ctx)).toBe(true);
  });

  it("drops evidence that does not exist in the scene text", () => {
    expect(verifyInstance({ evidence: "Lorem ipsum dolor", detail: "x" }, "scene", ctx)).toBe(false);
  });

  it("verifies dropped_element evidence against the SPEC text", () => {
    expect(verifyInstance({ evidence: "notification badge", detail: "x" }, "spec", ctx)).toBe(true);
    expect(verifyInstance({ evidence: "a golden dragon", detail: "x" }, "spec", ctx)).toBe(false);
  });

  it("accepts when there is nothing to verify against", () => {
    expect(verifyInstance({ evidence: "anything", detail: "x" }, "scene", { specText: "spec" })).toBe(true);
    expect(verifyInstance({ evidence: "anything", detail: "x" }, undefined, ctx)).toBe(true);
  });
});
