import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkScript } from "../src/media/video-gen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// Script-to-presenter: a full speech becomes N consistent Veo takes stitched
// into one speaker_source-ready clip. The chunker is the deterministic heart
// -- it decides take boundaries, and a bad split means a rushed or cut-off
// delivery.

describe("chunkScript", () => {
  it("keeps a short line as one take", () => {
    expect(chunkScript("Hi, I'm your Quotient marketing agent.")).toEqual([
      "Hi, I'm your Quotient marketing agent.",
    ]);
  });

  it("packs sentences up to the word budget and splits at sentence boundaries", () => {
    const script =
      "Marketing used to take a team of five. Now it takes one conversation. " +
      "Give me a brief and I will plan the campaign, write every deliverable, and schedule the launch. " +
      "That is not a promise. That is Tuesday.";
    const takes = chunkScript(script);
    // Never splits mid-sentence:
    for (const t of takes) expect(t).toMatch(/[.?!]["')\]]*$/);
    // Reassembles to the exact script:
    expect(takes.join(" ")).toBe(script);
    // Every take fits a Veo delivery (a single longer sentence may run over,
    // but none of these do):
    for (const t of takes) expect(t.split(/\s+/).length).toBeLessThanOrEqual(22);
    expect(takes.length).toBeGreaterThanOrEqual(2);
  });

  it("gives an over-budget single sentence its own take instead of cutting it", () => {
    const long =
      "This one sentence deliberately rambles on and on with far more than twenty two words in it so that no boundary exists to split at anywhere.";
    const takes = chunkScript(`Short opener. ${long} Short closer.`);
    expect(takes).toContain(long);
  });

  it("handles missing terminal punctuation", () => {
    const takes = chunkScript("An unfinished thought without a period");
    expect(takes).toEqual(["An unfinished thought without a period"]);
  });
});

describe("generate_presenter wiring (source guards)", () => {
  it("orchestrator: chained references, speech-trimmed stitch, whisper verification", async () => {
    // First live run (quotient_pitch): every take anchored to take 1's frame
    // and raw takes stitched whole -- each cut jerked back to the take-1 pose
    // after a beat of dead air. The stitch now chains take N's FINAL frame
    // into take N+1's reference and trims each take to its spoken window.
    const vg = await read("../src/media/video-gen.ts");
    expect(vg).toMatch(/const MAX_TAKES = 8/);
    expect(vg).toMatch(/referenceImagePath: i === 0 \? undefined : referenceFramePath/);
    expect(vg).toMatch(/CHAINED reference/);
    expect(vg).toMatch(/_ref_\$\{i \+ 1\}/);               // per-take chained frame
    expect(vg).toMatch(/"-sseof", "-0\.1"/);               // the take's true final frame
    expect(vg).toMatch(/speechStart = segments\[0\]\.start/);
    expect(vg).toMatch(/t\.speechStart - LEAD_IN/);        // trim to the spoken window
    expect(vg).toMatch(/whisperAvailable/);
    expect(vg).toMatch(/"-c", "copy"/);
    expect(vg).toMatch(/"libx264"/);                       // uniform re-encode path
  });

  it("tool + playbook expose the flow", async () => {
    const s = await read("../src/server.ts");
    expect(s).toMatch(/"generate_presenter"/);
    expect(s).toMatch(/heard_by_whisper/);
    expect(s).toMatch(/FULL SPEECHES: generate_presenter/);
  });
});
