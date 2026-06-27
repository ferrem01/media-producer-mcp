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

const pass = results.every(Boolean);
console.log(`\n=== legibility gate: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
