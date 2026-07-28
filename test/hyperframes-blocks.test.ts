import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const comp = (cat: string, name: string) =>
  path.resolve(__dirname, "../src/components", cat, `${name}.component.html`);
const schemaOf = (cat: string, name: string) =>
  comp(cat, name).replace(".component.html", ".schema.json");

// HyperFrames block ports: the lower-third preset family + macOS terminal
// themes. Each must parse (template + script), stay seek-safe (no wall-clock
// or nondeterministic APIs), and advertise every preset in its schema so the
// storyboard builder can cast them.

const LOWER_THIRD_STYLES = [
  "clean-bar",
  "accent-underline",
  "bold-block",
  "color-block",
  "dark-card",
  "kicker-name",
  "mask-reveal",
  "soft-pill",
] as const;

const TERMINAL_THEMES = [
  "pro",
  "ocean",
  "red-sands",
  "homebrew",
  "novel",
  "silver-aerogel",
  "grass",
  "clear-dark",
] as const;

describe("hyperframes blocks", () => {
  it("lower-third: parses, is seek-safe, and implements all 8 style presets", async () => {
    const src = await fs.readFile(comp("titles", "lower-third"), "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.template.length).toBeGreaterThan(10);
    expect(parsed.script).toContain("createTimeline");
    // Seek-safety: frame capture seeks the timeline; no wall clocks, no dice.
    expect(src).not.toMatch(
      /requestAnimationFrame|setInterval|setTimeout|performance\.now|Date\.now|Math\.random/,
    );
    for (const style of LOWER_THIRD_STYLES) {
      expect(src, `lower-third source missing preset ${style}`).toContain(style);
    }
  });

  it("lower-third: schema advertises all 8 styles for the storyboard catalog", async () => {
    const schema = JSON.parse(await fs.readFile(schemaOf("titles", "lower-third"), "utf-8"));
    expect(schema.type).toBe("lower-third");
    expect(schema.category).toBe("titles");
    expect(schema.description.length).toBeGreaterThan(40);
    expect(schema.data.name.required).toBe(true);
    const advertised = JSON.stringify(schema);
    for (const style of LOWER_THIRD_STYLES) {
      expect(advertised, `schema missing style ${style}`).toContain(style);
    }
    expect(schema.data.style.enum).toEqual([...LOWER_THIRD_STYLES]);
  });

  it("terminal-run: still parses and carries all 8 macOS theme presets", async () => {
    const src = await fs.readFile(comp("code", "terminal-run"), "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.template.length).toBeGreaterThan(10);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(/requestAnimationFrame|setInterval|performance\.now|Math\.random/);
    for (const theme of TERMINAL_THEMES) {
      expect(src, `terminal-run source missing theme ${theme}`).toContain(theme);
    }
  });

  it("terminal-run: schema mentions theme and enumerates the presets", async () => {
    const schema = JSON.parse(await fs.readFile(schemaOf("code", "terminal-run"), "utf-8"));
    expect(schema.description).toContain("theme");
    for (const theme of TERMINAL_THEMES) {
      expect(schema.data.theme.enum, `schema enum missing ${theme}`).toContain(theme);
    }
  });
});
