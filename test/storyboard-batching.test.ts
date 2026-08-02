import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// #39, measured: storyboarding is 44% of a generate (225s of 515 on
// proj_de47d492) while the editorial pass everyone assumed was the problem is
// 7%. The cause was a prompt fossil: a HARD CHUNKING RULE forcing ONE
// add_scene call per response -- 15+ sequential round-trips per film, each
// re-reading the whole growing conversation. The rule predated the
// truncation-recovery machinery (discard the turn, retry smaller, strike
// counting) that makes batching safe.

describe("storyboard builder batches its turns", () => {
  it("the prompt asks for several scenes per response, not one", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/BATCH YOUR TURNS/);
    expect(sb).toMatch(/2-4 add_scene calls per turn/);
    expect(sb).not.toMatch(/HARD CHUNKING RULE/);
    expect(sb).not.toMatch(/at most ONE add_scene call per response/);
  });

  it("the loop can bank multiple add_scene calls from a single response", async () => {
    // The mechanics that make batching safe to ask for: every tool call in a
    // response is processed, and a truncated turn is discarded then re-sent
    // in smaller pieces rather than aborting the board.
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/for \(var toolCall of response\.toolCalls\)/);
    expect(sb).toMatch(/truncations > 2/);
    expect(sb).toMatch(/DISCARDED -- NONE of its tool calls were applied/);
  });

  it("the recovery path still forces one-scene turns after truncation", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/exactly ONE add_scene call for ONE scene/);
  });
});
