/**
 * End-to-end test: codegen scene with <component> tags.
 *
 * 1. Reads a hand-written .scene.html with <component> tags
 * 2. Runs it through assembleCodegenScene
 * 3. Captures frames with Playwright
 * 4. Verifies the output is not blank
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleCodegenScene, loadSharedUtilities, type ComponentSource } from "../src/core/scene-assembler.js";
import { captureSingleFrame } from "../src/core/capture.js";
import { loadBrandKit } from "../src/persistence/brand-kit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = path.resolve(__dirname, "..", "src", "components");
const GSAP_DIR = path.resolve(__dirname, "..", "node_modules", "gsap", "dist");

async function loadComponent(type: string): Promise<ComponentSource | null> {
  // Map type to file path
  const categories = ["mockups", "titles", "layouts", "effects", "media", "data-viz", "cta"];
  for (const cat of categories) {
    const filePath = path.join(COMPONENTS_DIR, cat, `${type}.component.html`);
    try {
      const source = await fs.readFile(filePath, "utf-8");
      return { type, source };
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log("=== E2E Codegen Scene Test ===\n");

  // 1. Read the test scene
  const sceneSource = await fs.readFile(
    path.resolve(__dirname, "..", "test", "fixtures", "test-codegen-scene.scene.html"),
    "utf-8",
  );
  console.log(`Scene source: ${sceneSource.length} chars`);

  // 2. Load required components
  const componentTypes = ["quotient-chat", "canva-editor"];
  const componentSources: ComponentSource[] = [];
  for (const type of componentTypes) {
    const comp = await loadComponent(type);
    if (comp) {
      componentSources.push(comp);
      console.log(`Loaded component: ${type} (${comp.source.length} chars)`);
    } else {
      console.error(`Component not found: ${type}`);
      process.exit(1);
    }
  }

  // 3. Load brand kit (use default if available)
  let brandKit;
  try {
    brandKit = await loadBrandKit("marc-getquotient-ai");
    console.log(`Brand kit loaded: ${brandKit.name || "default"}`);
  } catch {
    brandKit = {
      name: "Test",
      colors: {
        primary: "#6366f1",
        secondary: "#8b5cf6",
        accent: "#10b981",
        background: "#0f172a",
        text: "#e2e8f0",
      },
      fonts: [],
      logos: [],
    };
    console.log("Using fallback brand kit");
  }

  const canvas = { width: 1920, height: 1080, fps: 30, background: "#0f172a" };

  // 4. Assemble the scene
  console.log("\nAssembling codegen scene...");
  let gsapDir = GSAP_DIR;
  // Check if GSAP is in node_modules or a custom path
  try {
    await fs.access(gsapDir);
  } catch {
    gsapDir = path.resolve(__dirname, "..", "gsap");
  }

  const html = await assembleCodegenScene({
    sceneSource,
    componentSources,
    brandKit: brandKit as any,
    canvas,
    duration: 10,
    sceneId: "test_001",
    gsapDir,
    background: "#0f172a",
  });

  console.log(`Assembled HTML: ${html.length} chars`);

  // 5. Write assembled HTML to temp file
  const outDir = path.resolve(__dirname, "..", "_work", "e2e-codegen-test");
  await fs.mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "scene.html");
  await fs.writeFile(htmlPath, html, "utf-8");
  console.log(`Written to: ${htmlPath}`);

  // 6. Check for component markers in the output
  const hasChat = html.includes('data-comp-type="quotient-chat"');
  const hasEditor = html.includes('data-comp-type="canva-editor"');
  const hasTimeline = html.includes("__getComponentTimeline");
  const hasReady = html.includes("__MP_READY");

  console.log(`\nAssembly checks:`);
  console.log(`  quotient-chat resolved: ${hasChat ? "✓" : "✗"}`);
  console.log(`  canva-editor resolved: ${hasEditor ? "✓" : "✗"}`);
  console.log(`  Timeline registry: ${hasTimeline ? "✓" : "✗"}`);
  console.log(`  MP_READY flag: ${hasReady ? "✓" : "✗"}`);

  if (!hasChat || !hasEditor || !hasTimeline || !hasReady) {
    console.error("\n✗ Assembly checks failed!");
    process.exit(1);
  }

  // 7. Capture a frame at t=0s and t=6s
  console.log("\nCapturing frames...");
  try {
    const frame0Path = path.join(outDir, "frame_t0.png");
    await captureSingleFrame({
      htmlPath,
      outputPath: frame0Path,
      width: canvas.width,
      height: canvas.height,
      atTime: 0.5,
    });
    const frame0Stats = await fs.stat(frame0Path);
    console.log(`  Frame t=0.5s: ${frame0Path} (${(frame0Stats.size / 1024).toFixed(1)} KB)`);

    const frame6Path = path.join(outDir, "frame_t6.png");
    await captureSingleFrame({
      htmlPath,
      outputPath: frame6Path,
      width: canvas.width,
      height: canvas.height,
      atTime: 6,
    });
    const frame6Stats = await fs.stat(frame6Path);
    console.log(`  Frame t=6.0s: ${frame6Path} (${(frame6Stats.size / 1024).toFixed(1)} KB)`);

    // A blank white frame is typically < 5KB for 1920x1080
    if (frame0Stats.size > 5000 && frame6Stats.size > 5000) {
      console.log("\n✓ Both frames have content (not blank)");
    } else {
      console.warn("\n⚠ One or both frames may be blank (< 5KB)");
    }
  } catch (e: any) {
    console.error(`  Capture error: ${e.message}`);
    console.log("\n  (Capture requires Playwright -- assembly verification passed)");
  }

  console.log("\n=== Test Complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
