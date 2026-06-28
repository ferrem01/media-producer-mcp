/**
 * Storyboard tiler for the editorial vision pass.
 *
 * The editorial critique (Pass 3) judges the whole video. To let it SEE the
 * result, we tile one frame per scene into a single storyboard image and hand
 * that to the (vision-capable) critiqueEditorial alongside the storyboard -- so it can
 * judge whether the rendered scenes actually delivered what the storyboard intended.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const exec = promisify(execFile);

/**
 * Tile per-scene frame PNGs into a single grid image (3 columns). Returns the
 * base64 PNG, or null if no frames were given. Frames appear in array order,
 * left-to-right, top-to-bottom -- i.e. scene order.
 */
export async function tileFramesToStoryboard(framePaths: string[]): Promise<string | null> {
  if (framePaths.length === 0) return null;
  const tmp = path.join(os.tmpdir(), `storyboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tmp, { recursive: true });
  try {
    const out = path.join(tmp, "storyboard.png");
    const tw = 360, th = 203; // 16:9 thumbnail
    if (framePaths.length === 1) {
      await exec("ffmpeg", ["-y", "-i", framePaths[0], "-vf", `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black`, out], { timeout: 20000 });
    } else {
      const cols = Math.min(3, framePaths.length);
      const inputs: string[] = [];
      const scaleParts: string[] = [];
      const stackInputs: string[] = [];
      const layout: string[] = [];
      for (let i = 0; i < framePaths.length; i++) {
        inputs.push("-i", framePaths[i]);
        scaleParts.push(`[${i}]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black[s${i}]`);
        stackInputs.push(`[s${i}]`);
        const c = i % cols, r = Math.floor(i / cols);
        layout.push(`${c * tw}_${r * th}`);
      }
      const filter = scaleParts.join(";") + ";" + stackInputs.join("") + `xstack=inputs=${framePaths.length}:layout=${layout.join("|")}:fill=black[out]`;
      await exec("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", out], { timeout: 30000 });
    }
    return (await fs.readFile(out)).toString("base64");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
