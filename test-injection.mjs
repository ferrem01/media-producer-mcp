import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const browser = await chromium.launch({
  args: ['--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html';
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });

// Discover videos
const videoInfos = await page.evaluate(() => {
  const videos = document.querySelectorAll('video');
  return Array.from(videos).map((v, i) => ({
    src: v.src || v.getAttribute('src') || '',
    startAt: parseFloat(v.getAttribute('data-start-at') || '0'),
    index: i,
  }));
});
console.log('videoInfos:', JSON.stringify(videoInfos.map(v => ({i: v.index, startAt: v.startAt}))));

// Extract frames
const videoPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/assets/camera.mp4';
const framesDir = '/tmp/vframes_injection_test';
try { await fs.rm(framesDir, { recursive: true }); } catch {}
await fs.mkdir(framesDir, { recursive: true });
console.log('Extracting frames...');
await execFileAsync('ffmpeg', ['-i', videoPath, '-vf', 'fps=30', '-start_number', '0', framesDir + '/frame-%06d.png'], { timeout: 120000 });
const files = await fs.readdir(framesDir);
const totalFrames = files.filter(f => f.endsWith('.png')).length;
console.log('Extracted', totalFrames, 'frames');

// Hide videos, insert sibling imgs
await page.evaluate(() => {
  const videos = document.querySelectorAll('video');
  videos.forEach((video, idx) => {
    video.style.setProperty('visibility', 'hidden', 'important');
    video.style.setProperty('pointer-events', 'none', 'important');
    const img = document.createElement('img');
    img.id = '__render_frame_' + idx + '__';
    img.className = '__render_frame__';
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.visibility = 'visible';
    img.style.pointerEvents = 'none';
    const startAt = video.getAttribute('data-start-at');
    if (startAt) img.setAttribute('data-start-at', startAt);
    img.setAttribute('data-video-id', 'vimg-' + idx);
    video.parentElement?.appendChild(img);
  });
});

// Advance to t=4s
const time = 4.0;
await page.evaluate(t => window.__MP_TIMELINE.time(t), time);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

// Build frame updates
const fps = 30;
const frameUpdates = [];
for (const vInfo of videoInfos) {
  const targetTime = Math.max(0, time - vInfo.startAt);
  const frameIndex = Math.min(Math.round(targetTime * fps), totalFrames - 1);
  const framePath = path.join(framesDir, 'frame-' + String(frameIndex).padStart(6, '0') + '.png');
  const frameData = await fs.readFile(framePath);
  const dataUri = 'data:image/png;base64,' + frameData.toString('base64');
  console.log(`  vInfo[${vInfo.index}]: startAt=${vInfo.startAt}, targetTime=${targetTime}, frameIndex=${frameIndex}, dataUri length=${dataUri.length}`);
  frameUpdates.push({ imgId: '__render_frame_' + vInfo.index + '__', dataUri });
}

// Inject
await page.evaluate((updates) => new Promise(resolve => {
  let pending = updates.length;
  if (pending === 0) { resolve(); return; }
  const done = () => { if (--pending <= 0) resolve(); };
  for (const { imgId, dataUri } of updates) {
    const img = document.getElementById(imgId);
    if (!img) { console.log('NOT FOUND:', imgId); done(); continue; }
    img.addEventListener('load', () => done(), { once: true });
    img.addEventListener('error', () => done(), { once: true });
    setTimeout(() => done(), 3000);
    img.src = dataUri;
  }
}), frameUpdates);

// Check what each img shows
const imgCheck = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img.__render_frame__')).map((img, i) => ({
    id: img.id,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    srcLength: img.src.length,
    srcStart: img.src.substring(0, 30),
  }));
});
console.log('\nImg elements after injection:');
imgCheck.forEach(i => console.log(JSON.stringify(i)));

await page.screenshot({ path: '/tmp/injection-test.png', type: 'png' });
console.log('\nScreenshot saved');

await browser.close();
await fs.rm(framesDir, { recursive: true, force: true });
