import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const browser = await chromium.launch({
  args: ['--disable-gpu', '--no-sandbox', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const htmlPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/_work/speaker_scene_4/scene.html';
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__MP_READY === true, { timeout: 15000 });

// Advance timeline to t=2.5s (grid should be visible by then)
await page.evaluate((t) => window.__MP_TIMELINE.time(t), 2.5);
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 100))));
await page.screenshot({ path: '/tmp/brady-before.png', type: 'png', omitBackground: true });

// Check video element states BEFORE replacement
const videoBefore = await page.evaluate(() => {
  const videos = document.querySelectorAll('video');
  return Array.from(videos).map((v, i) => {
    const cs = window.getComputedStyle(v);
    const parent = v.parentElement;
    const parentCs = parent ? window.getComputedStyle(parent) : null;
    const grandparent = parent?.parentElement;
    const gpCs = grandparent ? window.getComputedStyle(grandparent) : null;
    return {
      i, src: v.src.split('/').pop(),
      startAt: v.getAttribute('data-start-at'),
      currentTime: v.currentTime,
      readyState: v.readyState,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      parentTag: parent?.tagName, parentClass: parent?.className,
      parentDisplay: parentCs?.display, parentVisibility: parentCs?.visibility, parentOpacity: parentCs?.opacity,
      gpTag: grandparent?.tagName, gpClass: grandparent?.className,
      gpDisplay: gpCs?.display, gpVisibility: gpCs?.visibility, gpOpacity: gpCs?.opacity,
    };
  });
});
console.log('=== BEFORE replacement ===');
videoBefore.forEach(v => console.log(JSON.stringify(v)));

// Extract frames
const videoPath = '/data/media-producer/marc-getquotient-ai/projects/proj_2f122047/assets/camera.mp4';
const framesDir = '/tmp/vframes_debug_test';
try { await fs.rm(framesDir, { recursive: true }); } catch {}
await fs.mkdir(framesDir, { recursive: true });
console.log('Extracting...');
await execFileAsync('ffmpeg', ['-i', videoPath, '-vf', 'fps=30', '-start_number', '0', framesDir + '/frame-%06d.png'], { timeout: 120000 });
const files = await fs.readdir(framesDir);
const totalFrames = files.filter(f => f.endsWith('.png')).length;
console.log('Extracted', totalFrames, 'frames');

// Replace <video> with <img>
await page.evaluate(({framesDir, totalFrames}) => {
  const videos = document.querySelectorAll('video');
  videos.forEach((video, idx) => {
    const img = document.createElement('img');
    const cs = window.getComputedStyle(video);
    img.style.cssText = video.style.cssText;
    img.style.objectFit = cs.objectFit || 'cover';
    img.style.display = cs.display === 'none' ? 'none' : (video.style.display || 'block');
    img.style.width = video.style.width || cs.width;
    img.style.height = video.style.height || cs.height;
    const startAt = video.getAttribute('data-start-at');
    if (startAt) img.setAttribute('data-start-at', startAt);
    img.setAttribute('data-video-id', 'vimg-' + idx);
    img.setAttribute('data-frames-dir', framesDir);
    img.setAttribute('data-total-frames', String(totalFrames));
    const targetTime = Math.max(0, 2.5 - parseFloat(startAt || '0'));
    const frameIndex = Math.min(Math.round(targetTime * 30), totalFrames - 1);
    img.src = 'file://' + framesDir + '/frame-' + String(frameIndex).padStart(6, '0') + '.png';
    video.replaceWith(img);
  });
}, {framesDir, totalFrames});

// Wait for images to load
await page.evaluate(() => new Promise(r => {
  const imgs = document.querySelectorAll('img[data-video-id]');
  if (imgs.length === 0) { r(); return; }
  let pending = imgs.length;
  const done = () => { if (--pending <= 0) r(); };
  imgs.forEach(img => {
    if (img.complete) done();
    else { img.addEventListener('load', done, {once:true}); setTimeout(done, 5000); }
  });
}));

// Check image element states AFTER replacement
const imgAfter = await page.evaluate(() => {
  const imgs = document.querySelectorAll('img[data-video-id]');
  return Array.from(imgs).map((img, i) => {
    const cs = window.getComputedStyle(img);
    const parent = img.parentElement;
    const parentCs = parent ? window.getComputedStyle(parent) : null;
    return {
      i, src: img.src.split('/').pop(),
      complete: img.complete, naturalWidth: img.naturalWidth,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      width: cs.width, height: cs.height,
      parentTag: parent?.tagName, parentClass: parent?.className,
      parentOpacity: parentCs?.opacity, parentVisibility: parentCs?.visibility,
    };
  });
});
console.log('\n=== AFTER replacement ===');
imgAfter.forEach(v => console.log(JSON.stringify(v)));

await page.screenshot({ path: '/tmp/brady-after.png', type: 'png', omitBackground: true });

const beforeStat = await fs.stat('/tmp/brady-before.png');
const afterStat = await fs.stat('/tmp/brady-after.png');
console.log('\nBefore size:', beforeStat.size, 'After size:', afterStat.size);

await browser.close();
await fs.rm(framesDir, { recursive: true, force: true });
