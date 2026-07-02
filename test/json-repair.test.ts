import { describe, it, expect } from "vitest";
import { parseLlmJson } from "../src/llm/json-repair.js";

describe("parseLlmJson", () => {
  it("parses clean JSON", () => {
    expect(parseLlmJson('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: "two" });
  });

  it("strips a ```json fence", () => {
    expect(parseLlmJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    expect(parseLlmJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("repairs a raw newline inside a string value (the Sonnet-5 storyboard failure)", () => {
    const raw = '{"scenes": [{"label": "Scene 1", "beats": [{"label": "the reveal", "action": "The cursor glides in.\nThen the card blooms open."}]}]}';
    const parsed = parseLlmJson(raw);
    expect(parsed.scenes[0].beats[0].action).toBe("The cursor glides in.\nThen the card blooms open.");
  });

  it("repairs raw tabs and drops bare carriage returns inside strings", () => {
    const raw = '{"a": "col1\tcol2\r\nrow"}';
    const parsed = parseLlmJson(raw);
    expect(parsed.a).toBe("col1\tcol2\nrow");
  });

  it("does not touch whitespace OUTSIDE strings", () => {
    const raw = '{\n  "a": 1,\n  "b": 2\n}';
    expect(parseLlmJson(raw)).toEqual({ a: 1, b: 2 });
  });

  it("extracts the JSON span from preamble/postamble text", () => {
    expect(parseLlmJson('Sure, here is the JSON:\n{"a": 1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("extracts a span AND repairs a raw newline inside it", () => {
    const raw = 'Here:\n{"note": "line one\nline two"}\nDone.';
    expect(parseLlmJson(raw)).toEqual({ note: "line one\nline two" });
  });

  it("leaves already-escaped sequences alone", () => {
    expect(parseLlmJson('{"a": "line one\\nline two"}')).toEqual({ a: "line one\nline two" });
  });

  it("throws a labeled, truncated error when nothing parses", () => {
    expect(() => parseLlmJson("not json at all", "test context")).toThrow(/Invalid JSON from test context/);
  });
});
