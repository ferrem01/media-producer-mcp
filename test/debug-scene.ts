/**
 * Debug: open the assembled scene HTML and check GSAP state.
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const htmlPath = path.join(ROOT, "test-output/e2e/video/scene_0/scene.html");

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

  // Check if GSAP loaded and timeline exists
  const ready = await page.evaluate(() => (window as any).__MP_READY);
  console.log("__MP_READY:", ready);

  const tlDuration = await page.evaluate(() => {
    const tl = (window as any).__MP_TIMELINE;
    return tl ? tl.duration() : "no timeline";
  });
  console.log("Timeline duration:", tlDuration);

  // Check initial state of title elements
  const titleState = await page.evaluate(() => {
    const el = document.querySelector('[data-cid="comp_title"] .title');
    if (!el) return "title element not found";
    const cs = getComputedStyle(el);
    return {
      text: el.textContent,
      visibility: cs.visibility,
      opacity: cs.opacity,
      transform: cs.transform,
      display: cs.display,
      color: cs.color,
    };
  });
  console.log("Title state at t=0:", titleState);

  // Advance timeline to 1.0s and check
  await page.evaluate(() => (window as any).__MP_TIMELINE.time(1.0));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(undefined))));

  const titleAt1s = await page.evaluate(() => {
    const el = document.querySelector('[data-cid="comp_title"] .title') as HTMLElement;
    if (!el) return "not found";
    const cs = getComputedStyle(el);
    return {
      visibility: cs.visibility,
      opacity: cs.opacity,
      transform: cs.transform,
    };
  });
  console.log("Title state at t=1.0s:", titleAt1s);

  // Screenshot at t=1.0s
  await page.screenshot({ path: path.join(ROOT, "debug-frame-1s.png") });
  console.log("Screenshot saved: debug-frame-1s.png");

  // Advance to 1.5s
  await page.evaluate(() => (window as any).__MP_TIMELINE.time(1.5));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(undefined))));
  await page.screenshot({ path: path.join(ROOT, "debug-frame-1.5s.png") });

  const titleAt1_5 = await page.evaluate(() => {
    const el = document.querySelector('[data-cid="comp_title"] .title') as HTMLElement;
    if (!el) return "not found";
    const cs = getComputedStyle(el);
    return {
      visibility: cs.visibility,
      opacity: cs.opacity,
      transform: cs.transform,
    };
  });
  console.log("Title state at t=1.5s:", titleAt1_5);

  // Check all timelines in master
  const childCount = await page.evaluate(() => {
    const tl = (window as any).__MP_TIMELINE;
    return tl ? tl.getChildren().length : 0;
  });
  console.log("Master timeline children:", childCount);

  await browser.close();
}

main().catch(console.error);
