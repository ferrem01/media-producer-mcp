import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene, inlineLottieAnimation, loadLottieSource } from "../src/core/scene-assembler.js";
import { transformComponentTagData } from "../src/core/component-tags.js";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// lottie-accent: professionally-animated vector accents, deterministic under
// frame capture because (1) the animation JSON is inlined at assembly (no
// fetch on file://) and (2) the player is seeked from the scene clock, never
// autoplayed. These tests pin both halves of that contract.
describe("lottie-accent", () => {
  it("inlines a curated asset's animation JSON into component data", async () => {
    const out = await inlineLottieAnimation({ asset: "confetti", at: 0.5 });
    expect(out.animation).toBeTruthy();
    expect(typeof out.animation.fr).toBe("number");
    expect(out.at).toBe(0.5);
  });

  it("leaves data untouched for unknown assets (component warns at runtime)", async () => {
    const out = await inlineLottieAnimation({ asset: "no-such-asset" });
    expect(out.animation).toBeUndefined();
  });

  it("ships the full curated set advertised in the schema", async () => {
    const schema = JSON.parse(
      await fs.readFile(path.resolve(__dirname, "../src/components/props/lottie-accent.schema.json"), "utf-8"),
    );
    // Every asset name in the schema description must exist on disk --
    // the storyboard casts by these names.
    const advertised = schema.description.match(/data\.asset\): ([a-z0-9-, ]+)\./i)![1].split(",").map((s: string) => s.trim());
    expect(advertised.length).toBeGreaterThanOrEqual(15);
    for (const name of advertised) {
      const p = path.resolve(__dirname, "../src/components/shared/lottie", `${name}.json`);
      const st = await fs.stat(p).catch(() => null);
      expect(st, `curated asset missing on disk: ${name}`).toBeTruthy();
    }
  });

  it("rewrites codegen <component> tags with inlined animation (pre-pass)", async () => {
    const html = `<div><component type="lottie-accent" data='{"asset":"check-mark","at":1}' /></div>`;
    const out = await transformComponentTagData(html, "lottie-accent", inlineLottieAnimation);
    expect(out).toContain('"animation"');
    expect(out).toContain('"fr"');
    expect(out).toContain('type="lottie-accent"');
    // Non-matching tags untouched
    const other = `<component type="kinetic-text" data='{"text":"hi"}' />`;
    expect(await transformComponentTagData(other, "lottie-accent", inlineLottieAnimation)).toBe(other);
  });

  it("assembles a scene with the player inlined and the frames driven off the scene clock", async () => {
    const compSrc = await fs.readFile(
      path.resolve(__dirname, "../src/components/props/lottie-accent.component.html"), "utf-8",
    );
    const html = await assembleScene({
      scene: {
        id: "s1", label: "t", duration_seconds: 5,
        components: [{
          id: "c1", type: "lottie-accent",
          position: { x: "10%", y: "10%", width: "30%", height: "40%" },
          data: { asset: "confetti" },
        }],
      } as any,
      components: [{ type: "lottie-accent", source: compSrc }],
      brandKit: { fonts: [] } as any,
      canvas: { width: 1280, height: 720 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    expect(html).toContain("lottie-web svg player");   // player bundle present
    expect(html).toContain('"fr"');                    // animation data inlined
    expect(html).toContain("goToAndStop");             // seek-driven, not autoplay
    expect(html).not.toContain("autoplay: true");
  });

  it("does NOT inline the ~240KB player into scenes that don't use it", async () => {
    const html = await assembleScene({
      scene: { id: "s2", label: "t", duration_seconds: 5, components: [] } as any,
      components: [],
      brandKit: { fonts: [] } as any,
      canvas: { width: 1280, height: 720 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    expect(html).not.toContain("lottie-web svg player");
  });

  it("vendored player bundle exists", async () => {
    const src = await loadLottieSource(config.lottieDir);
    expect(src.length).toBeGreaterThan(100_000);
  });
});
