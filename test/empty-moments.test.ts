import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { measureEmptyMoments } from "../src/core/layout-metrics.js";

// The empty-moment probe for DETERMINISTIC (assembled/template) scenes:
// flags moments where essentially nothing is on canvas -- the dead entrance
// gaps and fully empty mid-film frames both grammar maiden flights shipped.
// Requires a browser (MP_CHROMIUM_PATH in constrained envs).

const W = 1920, H = 1080;

/** A scene whose content becomes visible only at t >= `showAt` (opacity flip
 *  driven by the harness timeline seek, like a GSAP entrance would). */
function page(showAt: number | null): string {
  return `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;width:${W}px;height:${H}px;background:linear-gradient(135deg,#393bf5,#17171c);overflow:hidden;position:relative}
    #content{position:absolute;left:200px;top:200px;width:1400px;height:600px;background:#fff;font-size:48px;font-family:sans-serif;opacity:${showAt === null ? 1 : 0}}
  </style></head><body>
  <div id="content">Forty-seven campaigns shipped this quarter</div>
  <script>
    window.__MP_TIMELINE = { time: function(t) {
      ${showAt === null ? "" : `document.getElementById("content").style.opacity = t >= ${showAt} ? "1" : "0";`}
    } };
    window.__MP_READY = true;
  </script>
  </body></html>`;
}

async function probe(showAt: number | null, atTimes: number[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "empty-moment-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, page(showAt));
  try {
    return await measureEmptyMoments({ htmlPath, width: W, height: H, atTimes });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("empty-moment probe (assembled scenes)", () => {
  it("flags the dead entrance gap but not the settled moments", async () => {
    // Content enters at t=2: the 1.0s probe is the visible gap, 3s/5s are fine.
    const empty = await probe(2, [1.0, 3.0, 5.0]);
    expect(empty.map((m) => m.atTime)).toEqual([1.0]);
    expect(empty[0].coverage).toBeLessThan(0.02);
  }, 120000);

  it("stays quiet on a scene whose content is present throughout", async () => {
    const empty = await probe(null, [1.0, 3.0, 5.0]);
    expect(empty).toHaveLength(0);
  }, 120000);

  it("flags every probed moment of a scene that never shows content", async () => {
    // Entrance at t=99 -- content never becomes visible in the probed window.
    const empty = await probe(99, [1.0, 3.0, 5.0]);
    expect(empty).toHaveLength(3);
  }, 120000);
});
