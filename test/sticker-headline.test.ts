import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { headlineStickerNames, brandStickerUrl, stickerData, stickerNamesIn, ensureStickerFiles, stickerUrl } from "../src/core/sticker-library.js";

// Marc, Oct 20: "we also have an updated brand with some really cool icons
// and stickers that i would like to use in these videos". The brand's
// stickers live in the tenant's kit, and the hero line sets them BETWEEN the
// words ("All [notebook] that's left is the [checklist] marketing.").
const kit = { assets: [
  { name: "sticker-flows", url: "/assets/t/brand-kit/image/sticker-flows.png", type: "image", tags: ["sticker", "cutout"] },
  { name: "sticker-checklist", url: "/assets/t/brand-kit/image/sticker-checklist.png", type: "image", tags: ["sticker"] },
  { name: "illo-email", url: "/assets/t/brand-kit/image/illo-email.png", type: "image", tags: ["illustration"] },
] };

describe("brand stickers", () => {
  it("a sticker name is the brand kit's sticker first, then the house library", () => {
    expect(brandStickerUrl("sticker-flows", kit)).toBe("/assets/t/brand-kit/image/sticker-flows.png");
    expect(brandStickerUrl("Sticker Flows", kit)).toBe("/assets/t/brand-kit/image/sticker-flows.png");
    expect(brandStickerUrl("illo-email", kit)).toBeNull(); // not tagged a sticker
    expect(brandStickerUrl("money-stack", kit)).toBeNull();
    expect(stickerData("sticker-prop", { sticker: "sticker-flows" }, kit)).toMatchObject({ kind: "image", src: "/assets/t/brand-kit/image/sticker-flows.png" });
    expect(stickerData("sticker-prop", { sticker: "money-stack" }, kit).src).toBe(stickerUrl("money-stack"));
    expect(stickerData("sticker-rain", { stickers: ["sticker-checklist", "coin"] }, kit).srcs).toEqual(["/assets/t/brand-kit/image/sticker-checklist.png", stickerUrl("coin")]);
  });

  it("a brand sticker is never redrawn by the image model", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stk-"));
    const res = await ensureStickerFiles(dir, [{ type: "sticker-headline", data: { text: "Follow-ups [sticker-flows] run" } }, { type: "sticker-prop", data: { sticker: "sticker-checklist" } }], kit);
    expect(res).toEqual({ minted: [], failed: [] });
    await expect(fs.access(path.join(dir, "_system", "stickers"))).rejects.toThrow(); // the library was not even opened
  });

  it("the headline's [name] and [>name] tokens are its stickers, resolved at assembly", () => {
    expect(headlineStickerNames("All [sticker-notebook] that's left [>sticker-paper-plane]\nis the [ sticker-checklist ] marketing.")).toEqual(["sticker-notebook", "sticker-paper-plane", "sticker-checklist"]);
    expect(stickerNamesIn([{ type: "sticker-headline", data: { text: "a [rocket] b" } }]).map((n) => n.name)).toEqual(["rocket"]);
    const d = stickerData("sticker-headline", { text: "Done [sticker-checklist] and [>rocket]" }, kit);
    expect(d.srcs).toEqual({ "sticker-checklist": "/assets/t/brand-kit/image/sticker-checklist.png", rocket: stickerUrl("rocket") });
  });

  it("every assembly path hands the kit to the sticker resolver", async () => {
    const asm = await fs.readFile("src/core/scene-assembler.ts", "utf8");
    expect(asm).toMatch(/ensureStickerFiles\(config\.dataDir, scene\.components \|\| \[\], brandKit\)/);
    expect(asm).toMatch(/stickerData\(comp\.type, bakeDirectLogoData\([\s\S]*?\), brandKit\)/);
    const comp = await fs.readFile("src/core/composite-assembler.ts", "utf8");
    expect(comp).toMatch(/ensureStickerFiles\([^;]*brandKit\)/);
    expect(comp).toMatch(/stickerData\(comp\.type, bakeDirectLogoData\(\{ \.\.\.comp, data: layerData \}\), brandKit\)/);
    const server = await fs.readFile("src/server.ts", "utf8");
    expect(server.match(/ensureStickerFiles\(config\.dataDir, \[[^\]]+\], await loadBrandKit\(params\.tenant_id\)/g)).toHaveLength(2);
  });

  it("the sticker-headline component: serif by default, fixed sticker slots, words then stickers", async () => {
    const html = await fs.readFile("src/components/titles/sticker-headline.component.html", "utf8");
    expect(html).toMatch(/'Newsreader', Georgia/);
    expect(html).toMatch(/\.shl-s \{ display: inline-block; width: 1\.3em; height: 1\.02em; object-fit: contain;/);
    expect(html).toMatch(/if \(!srcs\[m\[2\]\]\) return;/); // a name with no file is dropped, never a broken image
    const schema = JSON.parse(await fs.readFile("src/components/titles/sticker-headline.schema.json", "utf8"));
    expect(schema).toMatchObject({ type: "sticker-headline", category: "titles" });
    expect(schema.data.text.required).toBe(true);
    expect(schema.data.srcs).toBeUndefined(); // filled at assembly, never authored
  });
});
