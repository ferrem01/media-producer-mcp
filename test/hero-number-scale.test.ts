import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quantizeScenesToBars } from "../src/llm/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// #36. Two original items plus the long tail verification 5 exposed.

describe("bar quantization respects the grammar's scene cap", () => {
  it("snaps DOWN instead of re-inflating a length-clamped scene", () => {
    // A social-reel scene clamped to its 6s cap, on a 3.4s bar: 6/3.4 rounds
    // to 2 bars = 6.8s -- past the cap the clamp just enforced. With the cap
    // passed through, it snaps down to 1 bar.
    const scenes = [{ label: "hook", duration_seconds: 6 }];
    quantizeScenesToBars(scenes as any, 3.4, 6);
    expect(scenes[0].duration_seconds).toBeLessThanOrEqual(6);
    expect(scenes[0].duration_seconds).toBeCloseTo(3.4, 1);
  });

  it("still rounds to the NEAREST bar when no cap is in play", () => {
    const scenes = [{ label: "beat", duration_seconds: 6 }];
    quantizeScenesToBars(scenes as any, 3.4);
    expect(scenes[0].duration_seconds).toBeCloseTo(6.8, 1);
  });

  it("never snaps below one bar", () => {
    // A cap tighter than one bar cannot force zero bars.
    const scenes = [{ label: "beat", duration_seconds: 3.5 }];
    quantizeScenesToBars(scenes as any, 3.4, 3);
    expect(scenes[0].duration_seconds).toBeCloseTo(3.4, 1);
  });
});

describe("hero-number scale (data-story)", () => {
  it("number-counter-row reads data.hero / data.font_size / data.color", async () => {
    const src = await read("../src/components/titles/number-counter-row.component.html");
    expect(src).toMatch(/data\.hero/);
    // The storyboard writes "hero": true INSIDE the stat object as naturally
    // as at the data root (proj_b75ca862: every counter, stat level, scale
    // never applied). Both spellings must count.
    expect(src).toMatch(/stats\.some\(function \(s\) \{ return s && s\.hero; \}\)/);
    // Labels ride the ink, not a fixed slate that fails on every ground.
    expect(src).toMatch(/labelEl\.style\.opacity = '0\.72'/);
    expect(src).toMatch(/data\.font_size/);
    expect(src).toMatch(/valueEl\.style\.fontSize = heroSize/);
    expect(src).toMatch(/valueEl\.style\.color = data\.color/);
    // One protagonist stat fills ~1/4 of the frame height.
    expect(src).toMatch(/26vh/);
  });

  it("the data-story contract makes hero sizing part of the data", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/HERO TYPE IS DATA, NOT HOPE/);
    expect(sb).toMatch(/"hero": true/);
  });

  it("number-counter-row joined COLOR_CAPABLE only once it read the field", async () => {
    const sr = await read("../src/core/scene-repair.ts");
    expect(sr).toMatch(/"number-counter-row"/);
  });
});

describe("sticker-prop fits its own box", () => {
  it("shrinks long text instead of spilling past the pill", async () => {
    const src = await read("../src/components/props/sticker-prop.component.html");
    expect(src).toMatch(/prop\.scrollWidth/);
    expect(src).toMatch(/Math\.max\(11,/);           // floor
    expect(src).toMatch(/whiteSpace = 'normal'/);    // wrap as last resort
  });
});

describe("transient entrance dimness is not a contrast defect", () => {
  it("the gate keeps persistently-dim findings and drops mid-fade ones", async () => {
    const tc = await read("../src/core/text-contrast.ts");
    expect(tc).toMatch(/failedFull/);
    expect(tc).toMatch(/passedFull/);
    expect(tc).toMatch(/d\.reason !== "low-contrast" \|\| failedFull\.has\(d\.text\) \|\| !passedFull\.has\(d\.text\)/);
  });
});

describe("a hardcoded-dark mock pins its own ink", () => {
  it("email-compose does not paint the brand text token on its dark card", async () => {
    // proj_b75ca862: every address line at 1.03:1 -- the card is #1a1a22 and
    // .email-value rode var(--mp-color-text), which is dark ink on light brands.
    const src = await read("../src/components/mockups/email-compose.component.html");
    const emailValue = src.split(".email-value {")[1]?.split("}")[0] || "";
    expect(emailValue).not.toMatch(/--mp-color-text/);
    expect(emailValue).toMatch(/#f4f4f6/);
  });
});

describe("mock borders survive Chromium's rounding", () => {
  it("no gate-credited panel uses a 1.5px border (computed as 1px at DPR 1)", async () => {
    for (const f of [
      "../src/components/mockups/quotient-chat.component.html",
      "../src/components/mockups/quotient-campaign.component.html",
      "../src/components/mockups/quotient-social.component.html",
      "../src/components/mockups/quotient-app-shell.component.html",
      "../src/components/mockups/composer.component.html",
    ]) {
      const src = await read(f);
      expect(src, `${f} still has a 1.5px panel border`).not.toMatch(/border: 1\.5px solid #d/);
    }
  });
});
