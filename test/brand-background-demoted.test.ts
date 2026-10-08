import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBrandCSS } from "../src/core/scene-assembler.js";

// Marc, Oct 8: "the backdrop is that annoying background that we have as part
// of our brand, which I freaking hate ... I almost never want you to use
// that." A brand-kit "background" image is never painted behind a scene on
// its own; the writer is told to use it only when the brief asks.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KIT = {
  colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [],
  assets: [{ name: "waves", url: "/assets/t/brand-kit/images/waves.webp", type: "background", tags: ["light"] }],
} as any;

describe("the brand background image is demoted", () => {
  it("a scene with no background gets no brand image", () => {
    const out = generateBrandCSS(KIT, undefined, true);
    expect(out.css).not.toContain("waves.webp");
    expect(out.css).not.toContain("--mp-bg-image");
    expect(out.theme).toBe("light");
  });

  it("no template, assembler or writer prompt reaches for it by default", async () => {
    const src = (p: string) => fs.readFile(path.resolve(__dirname, "..", p), "utf-8");
    for (const f of ["src/core/scene-assembler.ts", "src/core/composite-assembler.ts"]) expect(await src(f)).not.toContain("mp-page-bg");
    const tpl = await fs.readdir(path.resolve(__dirname, "../src/templates"));
    for (const f of tpl.filter((x) => x.endsWith(".html"))) expect(await src(`src/templates/${f}`)).not.toContain("bg-brand-image");
    const sb = await src("src/llm/storyboard-builder.ts");
    expect(sb).not.toContain("Brand Background Images (MANDATORY)");
    expect(sb).toContain("only when the brief asks for them");
  });
});
