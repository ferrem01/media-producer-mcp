import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({
  args: ['--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html';
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });

// Advance timeline to 2.5s
await page.evaluate(t => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

// Check cell opacity before
const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.grid-cell')).map((c, i) => ({
    i, opacity: getComputedStyle(c).opacity
  }));
});
console.log('BEFORE:', JSON.stringify(before));

// Replace videos with red divs
await page.evaluate(() => {
  document.querySelectorAll('video').forEach(v => {
    const d = document.createElement('div');
    d.style.cssText = 'width:100%;height:100%;background:red;';
    v.replaceWith(d);
  });
});

await page.evaluate(t => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

const after = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.grid-cell')).map((c, i) => ({
    i, opacity: getComputedStyle(c).opacity, kids: c.children.length
  }));
});
console.log('AFTER:', JSON.stringify(after));

await page.screenshot({ path: '/tmp/gsap-test.png', type: 'png' });
console.log('Screenshot saved');

await browser.close();
