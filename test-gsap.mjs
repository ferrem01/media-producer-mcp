import { chromium } from "playwright";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  args: ["--disable-gpu", "--no-sandbox", "--allow-file-access-from-files", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = "/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html";
await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });

// Advance timeline to t=2.5s
await page.evaluate(t => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

// Check cell visibility BEFORE replacement
const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".grid-cell")).map((c, i) => {
    const cs = window.getComputedStyle(c);
    return { i, opacity: cs.opacity, visibility: cs.visibility, transform: cs.transform };
  });
});
console.log("BEFORE replacement - cells:");
before.forEach(b => console.log(JSON.stringify(b)));

// Replace videos with red divs
await page.evaluate(() => {
  document.querySelectorAll("video").forEach(v => {
    const d = document.createElement("div");
    d.style.cssText = "width:100%;height:100%;background:red;";
    v.replaceWith(d);
  });
});

// Re-advance timeline (GSAP targets may have been invalidated)
await page.evaluate(t => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

// Check cell visibility AFTER replacement
const after = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".grid-cell")).map((c, i) => {
    const cs = window.getComputedStyle(c);
    return { i, opacity: cs.opacity, visibility: cs.visibility, children: c.children.length };
  });
});
console.log("\nAFTER replacement - cells:");
after.forEach(a => console.log(JSON.stringify(a)));

await page.screenshot({ path: "/tmp/brady-gsap-test.png", type: "png" });
const stat = await fs.stat("/tmp/brady-gsap-test.png");
console.log("\nScreenshot:", stat.size, "bytes");

await browser.close();
