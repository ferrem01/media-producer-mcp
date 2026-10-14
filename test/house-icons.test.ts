import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const read = (rel: string) => fs.readFile(path.join(LIB, rel), "utf-8");

// Marc, Oct 14: the cards "just look like they're low quality". Emoji on a
// card read as a template; the cards now carry drawn glyphs (shared/icons.js),
// and a placed notification lands in depth when its box appears.
describe("house icons (shared/icons.js)", () => {
  let icons: any;
  beforeAll(async () => {
    const win: any = {};
    new Function("window", await read("shared/icons.js"))(win);
    icons = win.mpIcons;
  });

  it("draws a named glyph as a stroked svg in the colour asked for", () => {
    expect(icons.names.length).toBeGreaterThanOrEqual(30);
    const s = icons.svg("mail", { color: "#fff" });
    expect(s).toMatch(/^<svg viewBox="0 0 24 24"/);
    expect(s).toContain('stroke="#fff"');
    expect(icons.svg("no-such-glyph")).toBe("");
  });

  it("maps the emoji saved films carry to glyphs, names to themselves, and nothing else", () => {
    expect(icons.resolve("📥")).toBe("inbox");
    expect(icons.resolve("🗑️")).toBe("trash"); // variation selector stripped
    expect(icons.resolve("✅")).toBe("check");
    expect(icons.resolve("🔥")).toBe("flame");
    expect(icons.resolve("Calendar")).toBe("calendar");
    expect(icons.resolve("🦄")).toBeNull();
    expect(icons.resolve("")).toBeNull();
    expect(icons.resolve(undefined)).toBeNull();
  });

  it("every scene loads it, and a component learns when its box enters", async () => {
    const asm = await fs.readFile(path.resolve(__dirname, "../src/core/scene-assembler.ts"), "utf-8");
    expect(asm).toMatch(/"samples\.js", "icons\.js"\]/);
    expect(asm).toMatch(/enter_at: \$\{typeof \(comp as any\)\.enter\?\.at === "number"/);
  });

  it("the notification draws a glyph on an app tile, has no alert stripe, and lands when its box appears", async () => {
    const nf = await read("mockups/notification-stack.component.html");
    expect(nf).toMatch(/icons\.resolve\(n\.icon\)/);
    expect(nf).not.toMatch(/notification-accent/);
    expect(nf).toMatch(/typeof ctx\.enter_at === 'number' \? ctx\.enter_at : 0\.4/);
    expect(nf).toMatch(/rotationX: 24/);
    const schema = JSON.parse(await read("mockups/notification-stack.schema.json"));
    expect(schema.data.notifications.items.properties.icon.label).toMatch(/house glyph/);
    expect(schema.data.at.type).toBe("number");
  });

  it("the checklist draws its row icons as glyphs too", async () => {
    const ck = await read("props/checklist-toggles.component.html");
    expect(ck).toMatch(/window\.mpIcons\.resolve\(it\.icon\)/);
  });
});
