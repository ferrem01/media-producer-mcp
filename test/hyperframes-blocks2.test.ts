import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const comp = (cat: string, name: string) =>
  path.resolve(__dirname, "../src/components", cat, `${name}.component.html`);

// HyperFrames block steals, batch 2: the dot-matrix flight map and the Apple
// device-glamour showcase. Each must parse (template + script), pair with a
// storyboard-visible schema, and stay seek-safe: frames are captured by
// seeking the gsap timeline, so no wall clocks and no unseeded randomness.
const SEEK_UNSAFE =
  /requestAnimationFrame|setInterval|setTimeout|performance\.now|Date\.now|Math\.random/;

describe("hyperframes blocks 2", () => {
  it("map-route: parses, seek-safe, schema advertises world|us regions", async () => {
    const file = comp("data-viz", "map-route");
    const src = await fs.readFile(file, "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.template.length).toBeGreaterThan(10);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(SEEK_UNSAFE);
    const schema = JSON.parse(
      await fs.readFile(file.replace(".component.html", ".schema.json"), "utf-8"),
    );
    expect(schema.type).toBe("map-route");
    expect(schema.category).toBe("data-viz");
    expect(schema.description.length).toBeGreaterThan(40);
    expect(schema.data.region.enum).toEqual(["world", "us"]);
    expect(schema.data.routes.type).toBe("array");
  });

  it("device-showcase: parses, seek-safe, schema advertises iphone|macbook|duo", async () => {
    const file = comp("mockups", "device-showcase");
    const src = await fs.readFile(file, "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.template.length).toBeGreaterThan(10);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(SEEK_UNSAFE);
    const schema = JSON.parse(
      await fs.readFile(file.replace(".component.html", ".schema.json"), "utf-8"),
    );
    expect(schema.type).toBe("device-showcase");
    expect(schema.category).toBe("mockups");
    expect(schema.description.length).toBeGreaterThan(40);
    expect(schema.data.device.enum).toEqual(["iphone", "macbook", "duo"]);
  });

  it("glass-shard-wall: parses, seek-safe, schema advertises seed+kicker+stats", async () => {
    const file = comp("threed", "glass-shard-wall");
    const src = await fs.readFile(file, "utf-8");
    const parsed = parseComponent(src);
    expect(parsed.template.length).toBeGreaterThan(10);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(SEEK_UNSAFE);
    const schema = JSON.parse(
      await fs.readFile(file.replace(".component.html", ".schema.json"), "utf-8"),
    );
    expect(schema.type).toBe("glass-shard-wall");
    expect(schema.category).toBe("threed");
    expect(schema.description.length).toBeGreaterThan(40);
    expect(schema.data.seed.type).toBe("number");
    expect(schema.data.kicker.type).toBe("string");
    expect(schema.data.stats.type).toBe("array");
  });
});
