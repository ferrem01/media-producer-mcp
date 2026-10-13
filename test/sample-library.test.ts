import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadSampleLibrary, listSamples, sampleLibraryPromptSection, sampleWorkDir } from "../src/core/sample-work.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

describe("the Sample library (house work for made-up brands, every tenant)", () => {
  it("every piece has an id, a title and a committed file; ids are unique", () => {
    const all = loadSampleLibrary();
    expect(all.length).toBeGreaterThanOrEqual(94);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) {
      expect(p.title.length).toBeGreaterThan(8);
      expect(p.title).not.toBe(p.id);
      expect(fs.existsSync(path.join(sampleWorkDir(), path.basename(p.src)))).toBe(true);
    }
  });

  it("carries a whole B2B lifecycle and a whole ecommerce lifecycle, each from one brand", () => {
    const b2b = listSamples({ kind: "email", brand: "flowpath" }).map((p) => p.flow);
    for (const f of ["welcome", "activation", "first-win", "feature-tip", "social-proof", "trial-ending", "upgrade", "check-in", "milestone", "renewal", "win-back", "feedback"]) expect(b2b).toContain(f);
    const eco = listSamples({ kind: "email", brand: "mare" }).map((p) => p.flow);
    for (const f of ["welcome", "browse", "cart", "order", "shipping", "review", "replenish", "back-in-stock", "price-drop", "vip", "birthday", "win-back"]) expect(eco).toContain(f);
    expect(listSamples({ flow: "cart" }).every((p) => p.flow === "cart")).toBe(true);
    expect(listSamples({ q: "roast report" }).map((p) => p.id)).toContain("kiln-email-newsletter");
  });

  it("is offered to the storyboard writer: every piece by exact url, with when and how to use it", () => {
    const sec = sampleLibraryPromptSection();
    expect(sec).toMatch(/## The Sample Library/);
    expect(sec).toMatch(/index-reel items\[\]\.src/);
    for (const p of loadSampleLibrary()) expect(sec).toContain(p.src);
    const sb = fs.readFileSync(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");
    expect(sb).toMatch(/systemPrompt \+= sampleLibraryPromptSection\(\)/);
  });

  it("Studio has a Samples card beside music and sound: browse by area, add a piece or a moving set", () => {
    const html = getPreviewHtml();
    expect(html).toMatch(/id="rv-pop-samples"/);
    expect(html).toMatch(/function openSamplesCard\(project\)/);
    expect(html).toMatch(/'\/sample-options\/'/);
    expect(html).toMatch(/type: 'asset-wall'/);
    const idx = fs.readFileSync(path.resolve(__dirname, "../src/index.ts"), "utf-8");
    expect(idx).toMatch(/\/api\\\/sample-options\\\//);
  });

  it("the MCP lists it: list target 'samples'", () => {
    const srv = fs.readFileSync(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    expect(srv).toMatch(/"vocabulary", "samples"\]/);
    expect(srv).toMatch(/if \(target === "samples"\) return ok\(listSamples\(params\.samples \|\| \{\}\)\)/);
  });
});
