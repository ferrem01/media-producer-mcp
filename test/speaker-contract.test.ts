import { describe, it, expect } from "vitest";
import { findSpeakerPlaceholders } from "../src/llm/agentic-codegen.js";
import { resolveSpeakerVideoTags } from "../src/core/scene-assembler.js";

describe("findSpeakerPlaceholders", () => {
  it("requires <video src=\"speaker\"> in screencast scenes", () => {
    const parts = {
      template: `<div class="pip-bubble"><div class="pip-ring"></div></div>`,
      style: `.pip-bubble { border-radius: 50%; }`,
    };
    const v = findSpeakerPlaceholders(parts, "screencast");
    expect(v.length).toBe(1);
    expect(v[0]).toContain('<video src="speaker">');
  });

  it("accepts a screencast scene whose PiP holds the speaker video", () => {
    const parts = {
      template: `<div class="pip-bubble"><video src="speaker" autoplay muted playsinline></video></div>`,
      style: `.pip-bubble video { object-fit: cover; border-radius: 50%; }`,
    };
    expect(findSpeakerPlaceholders(parts, "screencast")).toEqual([]);
  });

  it("flags drawn avatar / initials / silhouette markup (the observed violations)", () => {
    // Real class names from the three shipped violations: pip-avatar +
    // pip-initials (monogram PiP), pip-face/pip-shoulders (CSS silhouette),
    // speaker-figure (full drawn person).
    const parts = {
      template:
        `<video src="speaker" muted></video>` +
        `<div class="pip-avatar"><span class="pip-initials">M</span></div>` +
        `<div class="pip-bubble"><span class="pip-shoulders"></span><span class="pip-face"></span></div>` +
        `<div class="speaker-figure"></div>`,
      style: `.pip-avatar { background: red; }`,
    };
    const v = findSpeakerPlaceholders(parts, "screencast");
    const flagged = v.join("\n");
    expect(flagged).toContain("pip-avatar");
    expect(flagged).toContain("pip-initials");
    expect(flagged).toContain("pip-face");
    expect(flagged).toContain("pip-shoulders");
    expect(flagged).toContain("speaker-figure");
  });

  it("flags drawn-persona selectors that only appear in the style section", () => {
    const parts = {
      template: `<div class="hero"></div>`,
      style: `.avatar { width: 100px; } .presenter-placeholder { inset: 0; }`,
    };
    const v = findSpeakerPlaceholders(parts, "visible");
    expect(v.join("\n")).toContain("avatar");
    expect(v.join("\n")).toContain("presenter-placeholder");
  });

  it("does not flag legitimate PiP chrome, speaker frames, or brand monograms", () => {
    const parts = {
      template:
        `<div class="speaker-frame"><video src="speaker" muted></video></div>` +
        `<div class="pip-bubble"><div class="pip-ring"></div><div class="pip-live"></div></div>` +
        `<div class="logo-monogram">Q</div>`,
      style: `.pip-ring { border: 2px solid white; } .logo-monogram { font-weight: 700; }`,
    };
    expect(findSpeakerPlaceholders(parts, "visible")).toEqual([]);
  });

  it("does not demand the speaker video in visible mode (camera is the underlay)", () => {
    const parts = { template: `<div class="phrase">One brief</div>`, style: `` };
    expect(findSpeakerPlaceholders(parts, "visible")).toEqual([]);
  });
});

describe("resolveSpeakerVideoTags", () => {
  const URL = "file:///work/speaker_base.mp4";

  it("swaps the speaker token, stamps data-start-at, and keeps other attributes", () => {
    const html = `<div class="pip"><video src="speaker" autoplay muted playsinline></video></div>`;
    const out = resolveSpeakerVideoTags(html, URL, 8.5);
    expect(out).toContain(`src="${URL}"`);
    expect(out).toContain(`data-start-at="8.5"`);
    expect(out).toContain("playsinline");
    expect(out).not.toContain(`src="speaker"`);
  });

  it("forces muted so a PiP never doubles the speaker audio", () => {
    const out = resolveSpeakerVideoTags(`<video src="speaker" autoplay>`, URL, 0);
    expect(out).toMatch(/<video[^>]*\bmuted\b/);
  });

  it("respects an author-set data-start-at", () => {
    const out = resolveSpeakerVideoTags(`<video src="speaker" data-start-at="2" muted>`, URL, 9);
    expect(out).toContain(`data-start-at="2"`);
    expect(out).not.toContain(`data-start-at="9"`);
  });

  it("leaves ordinary videos untouched", () => {
    const html = `<video src="/assets/t/broll.mp4" muted></video>`;
    expect(resolveSpeakerVideoTags(html, URL, 3)).toBe(html);
  });
});
