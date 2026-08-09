import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkScript, normalizationGainDb } from "../src/media/video-gen.js";

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

describe("take loudness matching", () => {
  // Marc on quotient_pitch_v3: "the middle segment, the volume changed --
  // a little tinny." Measured: Veo handed back take 1 at -26.0 dB mean,
  // take 2 at -19.5 dB peaking at -0.2 dBFS (clipping), take 3 at -23.4 dB.
  // The stitch had preserved that faithfully.
  it("moves each take to the common target", () => {
    expect(normalizationGainDb(-26.0)).toBe(3);      // take 1 up
    expect(normalizationGainDb(-19.5)).toBe(-3.5);   // take 2 down (the loud one)
    expect(normalizationGainDb(-23.4)).toBe(0.4);    // take 3 barely moves
  });

  it("clamps absurd corrections and no-ops on a failed measure", () => {
    expect(normalizationGainDb(-90)).toBe(12);       // silence -> capped, not +67dB
    expect(normalizationGainDb(-1)).toBe(-12);
    expect(normalizationGainDb(null)).toBe(0);
    expect(normalizationGainDb(Number.NaN)).toBe(0);
  });

  it("honors an explicit target", () => {
    expect(normalizationGainDb(-20, -20)).toBe(0);
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

  it("locks the camera on multi-take speeches and reports seam positions", async () => {
    // Marc on v2: seam 1 blipped, seams 2-3 were invisible. Only take 1
    // carried "push-in" -- it ended tighter than take 2 began. Multi-take
    // now locks the shot size; a single take keeps the push-in (no seam).
    const vg = await read("../src/media/video-gen.ts");
    expect(vg).toMatch(/CAMERA LOCK on multi-take/);
    expect(vg).toMatch(/const multiTake = lines\.length > 1/);
    expect(vg).toMatch(/Locked-off static camera: no zoom, no push-in/);
    expect(vg).toMatch(/very slight slow push-in/);        // still there for single takes
    expect(vg).toMatch(/seams\.push/);
    const s = await read("../src/server.ts");
    expect(s).toMatch(/seam_seconds: result\.seams/);
  });

  it("tool + MCP instructions expose the flow", async () => {
    const s = await read("../src/server.ts");
    expect(s).toMatch(/"generate_presenter"/);
    expect(s).toMatch(/heard_by_whisper/);
    expect(s).toMatch(/generate_presenter = a whole script/);
  });
});
