/**
 * RUNWAY Act-Two: the recording's performance (face and body) on the
 * actor's portrait. Keeps the gestures; the look is glossier, and a call
 * takes a short clip, so a take is cut at its pauses.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runRunway, download, dataUri, ffmpeg } from "../actor-test.js";
import type { Performer, PerformContext } from "./types.js";

export const runway: Performer = {
  id: "runway",
  label: "Runway",
  drivenBy: "video",
  keeps: "Your gestures and expressions",
  limits: "Short clips (seams on longer takes); a glossier look",
  key: "RUNWAYML_API_SECRET",
  minutesPer30s: 4,
  maxSeconds: 15,

  async fromVideo(video: string, tag: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w(`runway-${tag}.mp4`);
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = w("portrait.jpg");
    if (!(await fs.stat(img).then(() => true, () => false))) {
      await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
    }
    const { width: W, height: H } = ctx;
    const ratio = H > W * 1.1 ? "720:1280" : W > H * 1.1 ? "1280:720" : "960:960";
    await download(await runRunway(await dataUri(video, "video/mp4"), await dataUri(img, "image/jpeg"), ratio), out);
    return out;
  },
};
