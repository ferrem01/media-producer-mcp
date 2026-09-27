import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene, hoistCssImports } from "../src/core/scene-assembler.js";

// The Quotient mockups load Inter with `@import url(...)` at the top of their
// own <style>. Assembled into one combined sheet, that import sat mid-sheet,
// where a browser ignores it: every captured product page rendered in the
// system fallback font.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKS = path.resolve(__dirname, "../src/components/mockups");

describe("a component's CSS @import", () => {
  it("is lifted out of the <style> into a <link> in the head, once", async () => {
    const types = ["quotient-report", "quotient-campaign"];
    const html = await assembleScene({
      scene: {
        id: "s1", label: "a", duration_seconds: 4, background: "#ffffff",
        components: types.map((type, i) => ({ id: `m${i}`, type, position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: {} })),
      } as any,
      components: await Promise.all(types.map(async (type) => ({ type, source: await fs.readFile(path.join(MOCKS, `${type}.component.html`), "utf-8") }))),
      brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
      canvas: { width: 1920, height: 1080 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const styles = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
    expect(styles.join("\n")).not.toMatch(/@import/);
    const head = html.slice(0, html.indexOf("</head>"));
    const links = head.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*">/g) || [];
    expect(links).toHaveLength(1);
    // Before the sheet that uses it.
    expect(head.indexOf(links[0])).toBeLessThan(head.indexOf("<style"));
  });

  it("leaves a page without imports untouched, and never touches script text", () => {
    const plain = `<html><head><meta charset="utf-8"><style>a{color:red}</style></head><body><script>var s = "@import url(x.css);";</script></body></html>`;
    expect(hoistCssImports(plain)).toBe(plain);
    const both = `<html><head><meta charset="utf-8"><style>b{} @import "y.css"; c{}</style></head><body><script>var s = "@import url(x.css);";</script></body></html>`;
    const out = hoistCssImports(both);
    expect(out).toContain(`<link rel="stylesheet" href="y.css">`);
    expect(out).toContain(`var s = "@import url(x.css);"`);
    expect(out).not.toMatch(/<style>[^<]*@import/);
  });
});
