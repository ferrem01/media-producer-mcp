/**
 * KLING 3.0 Motion Control (on fal): the recording's motion, timing and
 * expression mapped onto the actor's portrait, up to 30 s a call. Keeps the
 * person's own gestures -- but a hand holding something (the handheld mic
 * on Old Chimp) can come back warped, and a long take is cut at its pauses.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runKling, download, dataUri, ffmpeg } from "../actor-test.js";
import type { Performer, PerformContext } from "./types.js";

export const kling: Performer = {
  id: "kling",
  label: "Kling",
  drivenBy: "video",
  keeps: "Your actual gestures and timing",
  limits: "30 s per call (seams on longer takes); hands holding things can warp",
  key: "FAL_KEY",
  minutesPer30s: 14,
  maxSeconds: 29,

  async fromVideo(video: string, tag: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w(`kling-${tag}.mp4`);
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = w("portrait.jpg");
    if (!(await fs.stat(img).then(() => true, () => false))) {
      await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
    }
    // A 30 s source is too big to inline comfortably: fal fetches it by URL
    // when the server has a public address.
    const src = (await ctx.publicUrl?.(video)) || await dataUri(video, "video/mp4");
    const pic = (await ctx.publicUrl?.(img)) || await dataUri(img, "image/jpeg");
    await download(await runKling(src, pic), out);
    return out;
  },
};
