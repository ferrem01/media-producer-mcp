import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({
  args: ['--disable-gpu', '--no-sandbox', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html';
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });

// Advance to t=2.5 -- grid cells should be visible
await page.evaluate((t) => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 200))));

// Check parent container visibility (the grid cells have autoAlpha animation)
const cellInfo = await page.evaluate(() => {
  const cells = document.querySelectorAll('.grid-cell');
  return Array.from(cells).map((cell, i) => {
    const cs = window.getComputedStyle(cell);
    const video = cell.querySelector('video');
    const videoCs = video ? window.getComputedStyle(video) : null;
    return {
      i,
      cellOpacity: cs.opacity,
      cellVisibility: cs.visibility,
      cellDisplay: cs.display,
      cellTransform: cs.transform,
      hasVideo: !!video,
      videoSrc: video?.src?.split('/').pop(),
      videoDisplay: videoCs?.display,
      videoWidth: videoCs?.width,
      videoHeight: videoCs?.height,
    };
  });
});

console.log('Grid cells at t=2.5:');
cellInfo.forEach(c => console.log(JSON.stringify(c)));

// Now replace videos with simple colored divs to test if replaceWith breaks GSAP
await page.evaluate(() => {
  const videos = document.querySelectorAll('video');
  videos.forEach((video, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;background:red;';
    div.setAttribute('data-replaced', 'true');
    video.replaceWith(div);
  });
});

// Re-check cells after replacement
const cellAfter = await page.evaluate(() => {
  const cells = document.querySelectorAll('.grid-cell');
  return Array.from(cells).map((cell, i) => {
    const cs = window.getComputedStyle(cell);
    const replaced = cell.querySelector('[data-replaced]');
    return {
      i,
      cellOpacity: cs.opacity,
      cellVisibility: cs.visibility,
      hasReplaced: !!replaced,
    };
  });
});

console.log('\nGrid cells AFTER replaceWith:');
cellAfter.forEach(c => console.log(JSON.stringify(c)));

await page.screenshot({ path: '/tmp/brady-replaced.png', type: 'png' });
console.log('\nScreenshot saved to /tmp/brady-replaced.png');
const stat = await fs.stat('/tmp/brady-replaced.png');
console.log('Size:', stat.size);

await browser.close();
