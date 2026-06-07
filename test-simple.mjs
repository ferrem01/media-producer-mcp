import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html';
console.log('Loading page...');
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('Page loaded, waiting for __MP_READY...');
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });
console.log('Ready!');

const count = await page.evaluate(() => document.querySelectorAll('video').length);
console.log('Videos found:', count);

await browser.close();
