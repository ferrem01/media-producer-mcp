import { chromium } from 'playwright';
const D='/tmp/claude-0/-home-user-media-producer-mcp/c32dfa79-e27a-513d-b313-5e16cec01d25/scratchpad/glasstrans';
import fs from 'node:fs';
// instrument the generated html: track __onTexture firing
let html = fs.readFileSync(D+'/glass-turn.html','utf8');
html = html.replace("var ready = function() { window.__MP_READY = true; };",
  "var ready = function(src) { window.__GT_READY_VIA = window.__GT_READY_VIA || src || 'cb'; window.__MP_READY = true; };");
html = html.replace("setTimeout(ready, 8000);", "setTimeout(function(){ready('timeout');}, 8000);");
fs.writeFileSync(D+'/glass-turn-probe.html', html);
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--use-gl=swiftshader','--enable-webgl','--no-sandbox','--allow-file-access-from-files']});
const pg = await browser.newPage({ viewport:{width:1280,height:720}});
pg.on('console', m => console.log('[page]', m.text().slice(0,120)));
pg.on('pageerror', e => console.log('[ERR]', e.message.slice(0,200)));
const t0=Date.now();
await pg.goto('file://'+D+'/glass-turn-probe.html', {waitUntil:'load'});
await pg.waitForFunction('window.__MP_READY===true',{timeout:20000});
console.log('READY after', Date.now()-t0, 'ms via', await pg.evaluate('window.__GT_READY_VIA'));
await pg.evaluate('window.__MP_TIMELINE.time(0.001)');
await pg.screenshot({path: D+'/probe-f0-immediate.png'});
await pg.waitForTimeout(400);
await pg.evaluate('window.__MP_TIMELINE.time(0.001)');
await pg.screenshot({path: D+'/probe-f0-after400ms.png'});
await browser.close();
