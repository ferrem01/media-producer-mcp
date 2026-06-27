/**
 * Validates the legibility gate (measureTextContrast).
 *
 * It must flag dark-on-dark / low-contrast text and pass high-contrast text --
 * AND, crucially, catch text that is washed over only PART of its run (busy
 * footage), which a single average-contrast measurement misses. The gate samples
 * the text box as a grid and flags when a meaningful fraction is low-contrast.
 *
 * Usage: node test/text-contrast.mjs   (run after `npm run build`)
 */
import fs from "node:fs";
import { measureTextContrast } from "../dist/core/text-contrast.js";

function scene(lines) {
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:1920px;height:1080px;background:#0b0f1a;overflow:hidden}
    .line{position:absolute;left:0;right:0;text-align:center;font-family:sans-serif;font-weight:800;font-size:64px}
    ${lines.style}
  </style></head><body>
    ${lines.body}
    <script>window.__MP_TIMELINE={time:function(){}}; window.__MP_READY=true;</script>
  </body></html>`;
}

const results = [];
function ok(name, cond) { results.push(cond); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); }

// Case 1+2: solid backgrounds -- dark-on-dark flagged, white-on-dark passes.
{
  const HTML = scene({
    style: `.bad{top:300px;color:#1b2540}/*navy on near-black*/ .good{top:520px;color:#fff}`,
    body: `<div class="line bad">Every marketer knows this feeling</div>
           <div class="line good">Your marketing finally clear</div>`,
  });
  fs.writeFileSync("/tmp/tc1.html", HTML);
  const d = await measureTextContrast({ htmlPath: "/tmp/tc1.html", width: 1920, height: 1080, atTimes: [0] });
  ok("flags navy-on-near-black", d.some(x => /Every marketer/.test(x.text)));
  ok("passes white-on-near-black", !d.some(x => /finally clear/.test(x.text)));
}

// Case 3: the busy-footage case. Dark text over a backdrop that's 65% bright +
// 35% dark. The AVERAGE backdrop is bright -> average contrast passes (~11:1),
// but ~35% of the run is dark-on-dark and washed. The OLD average-only check
// missed exactly this; the grid/worst-case check must flag it.
{
  const HTML = scene({
    style: `.washed{top:480px;color:#0f172a;
      background:linear-gradient(to right,#ffffff 0%,#ffffff 65%,#11182a 65%,#11182a 100%);
      padding:20px 0}`,
    body: `<div class="line washed">Every morning the same chaos too many tools</div>`,
  });
  fs.writeFileSync("/tmp/tc3.html", HTML);
  const d = await measureTextContrast({ htmlPath: "/tmp/tc3.html", width: 1920, height: 1080, atTimes: [0] });
  console.log("  busy-bg defects:", JSON.stringify(d));
  ok("flags dark text washed over the dark third (avg would pass)", d.length > 0);
}

// Case 4+5: text-over-video TREATMENT check. A full-bleed `.mp-broll` element
// stands in for footage. Bare text over it (no backing) must be flagged
// "no-backing"; text inside a panel/scrim must pass.
{
  const HTML = `<!doctype html><html><head><style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
    .mp-broll{position:absolute;inset:0;width:100%;height:100%;background:#7a7f8a;z-index:0}
    .bare{position:absolute;top:820px;left:0;right:0;text-align:center;color:#fff;font:800 64px sans-serif;z-index:2}
    .panel{position:absolute;top:300px;left:560px;width:800px;background:rgba(10,14,30,0.6);border-radius:14px;padding:24px;z-index:2}
    .panel .t{color:#fff;font:800 64px sans-serif;text-align:center}
  </style></head><body>
    <div class="mp-broll"></div>
    <div class="bare">Bare text on moving footage</div>
    <div class="panel"><div class="t">Protected by a panel</div></div>
    <script>window.__MP_TIMELINE={time:function(){}}; window.__MP_READY=true;</script>
  </body></html>`;
  fs.writeFileSync("/tmp/tc45.html", HTML);
  const d = await measureTextContrast({ htmlPath: "/tmp/tc45.html", width: 1920, height: 1080, atTimes: [0] });
  console.log("  video-treatment defects:", JSON.stringify(d));
  ok("flags bare text over footage as no-backing", d.some(x => /Bare text/.test(x.text) && x.reason === "no-backing"));
  ok("passes text protected by a panel", !d.some(x => /Protected by a panel/.test(x.text)));
}

// Case 6: text protected by a ::before pseudo-element scrim must NOT be flagged
// (a very common way to do it -- the detector must see pseudo-elements).
{
  const HTML = `<!doctype html><html><head><style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
    .mp-broll{position:absolute;inset:0;width:100%;height:100%;background:#7a7f8a;z-index:0}
    .cap{position:absolute;top:780px;left:560px;width:800px;text-align:center;color:#fff;font:800 64px sans-serif;z-index:2}
    .cap::before{content:"";position:absolute;inset:-18px;background:rgba(10,14,30,0.62);border-radius:14px;z-index:-1}
  </style></head><body>
    <div class="mp-broll"></div>
    <div class="cap">Protected by a pseudo scrim</div>
    <script>window.__MP_TIMELINE={time:function(){}}; window.__MP_READY=true;</script>
  </body></html>`;
  fs.writeFileSync("/tmp/tc6.html", HTML);
  const d = await measureTextContrast({ htmlPath: "/tmp/tc6.html", width: 1920, height: 1080, atTimes: [0] });
  ok("passes text protected by a ::before pseudo scrim", !d.some(x => /pseudo scrim/.test(x.text) && x.reason === "no-backing"));
}

// Case 7: bare text over footage that is itself graded via a filter (technique C)
// must NOT be flagged no-backing -- contrast sampling validates the graded frame.
{
  const HTML = `<!doctype html><html><head><style>
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
    .mp-broll{position:absolute;inset:0;width:100%;height:100%;background:#7a7f8a;filter:brightness(0.4);z-index:0}
    .cap{position:absolute;top:780px;left:0;right:0;text-align:center;color:#fff;font:800 64px sans-serif;z-index:2}
  </style></head><body>
    <div class="mp-broll"></div>
    <div class="cap">Bare text over graded footage</div>
    <script>window.__MP_TIMELINE={time:function(){}}; window.__MP_READY=true;</script>
  </body></html>`;
  fs.writeFileSync("/tmp/tc7.html", HTML);
  const d = await measureTextContrast({ htmlPath: "/tmp/tc7.html", width: 1920, height: 1080, atTimes: [0] });
  ok("passes bare text over filter-graded footage (technique C)", !d.some(x => /graded footage/.test(x.text) && x.reason === "no-backing"));
}

const pass = results.every(Boolean);
console.log(`\n=== legibility gate: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
