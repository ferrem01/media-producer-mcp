/**
 * Validates the legibility gate (measureTextContrast): it must flag dark-on-dark
 * / low-contrast text and pass high-contrast text. Builds a scene with one
 * illegible line (navy on near-black, like the b-roll caption that shipped) and
 * one legible line (white on near-black), then asserts the gate catches exactly
 * the bad one.
 *
 * Usage: node test/text-contrast.mjs
 */
import fs from "node:fs";
import { measureTextContrast } from "../dist/core/text-contrast.js";

const HTML = `<!doctype html><html><head><style>
  html,body{margin:0;width:1920px;height:1080px;background:#0b0f1a;overflow:hidden}
  .line{position:absolute;left:0;right:0;text-align:center;font-family:sans-serif;font-weight:800;font-size:64px}
  .bad{top:420px;color:#1b2540}   /* navy on near-black -> illegible */
  .good{top:600px;color:#ffffff}  /* white on near-black -> legible */
</style></head><body>
  <div class="line bad">Every marketer knows this feeling</div>
  <div class="line good">Your marketing finally clear</div>
  <script>window.__MP_TIMELINE={time:function(){}}; window.__MP_READY=true;</script>
</body></html>`;
fs.writeFileSync("/tmp/tc-scene.html", HTML);

const defects = await measureTextContrast({ htmlPath: "/tmp/tc-scene.html", width: 1920, height: 1080, atTime: 0 });
console.log("defects:", JSON.stringify(defects, null, 1));

const flaggedBad = defects.some(d => /Every marketer/.test(d.text));
const flaggedGood = defects.some(d => /finally clear/.test(d.text));
console.log("flagged the illegible navy line:", flaggedBad);
console.log("flagged the legible white line:", flaggedGood, "(should be false)");

const pass = flaggedBad && !flaggedGood;
console.log(`\n=== legibility gate: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
