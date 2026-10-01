/**
 * HEYGEN: hears the voice and draws the whole person -- a HeyGen look (the
 * person's digital twin, a photo look, a stock presenter) or, for an actor
 * with no look, the portrait (Avatar IV from a photo). Avatar V wherever
 * the look offers it (Marc on the sofa look on V: "insanely good. Even my
 * hand motions"). One call per take; the job id is kept so a restart
 * collects it instead of paying twice.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runHeygenV3, getHeygenLook, download, ffmpeg } from "../actor-test.js";
import type { Performer, PerformContext } from "./types.js";

export const heygen: Performer = {
  id: "heygen",
  label: "HeyGen",
  drivenBy: "audio",
  keeps: "Your voice and timing; HeyGen draws the movement",
  limits: "Gestures are HeyGen's, not yours",
  key: "HEYGEN_API_KEY",
  minutesPer30s: 3,

  async fromAudio(audio: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w("heygen.mp4");
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const lookId = ctx.actor.heygen_look_id;
    const look = lookId ? await getHeygenLook(lookId).catch(() => null) : null;
    const { width: W, height: H } = ctx;
    const req = w("heygen.json");
    const prior = await fs.readFile(req, "utf8").then((t) => JSON.parse(t)?.video_id as string, () => undefined);
    let img: string | undefined;
    if (!lookId) {
      img = w("portrait.jpg");
      await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
    }
    const call = (resume?: string) => runHeygenV3({
      lookId, imgFile: img, audioFile: audio,
      aspect: H > W * 1.1 ? "9:16" : W > H * 1.1 ? "16:9" : "1:1",
      engine: look?.engines?.includes("avatar_v") ? "avatar_v" : undefined,
      resolution: "1080p", resume, motion: ctx.motion,
      onSubmit: async (id) => { await fs.writeFile(req, JSON.stringify({ video_id: id })); },
    });
    let url: string;
    try { url = await call(prior); }
    catch (e) {
      // A resumed video that failed or vanished: submit fresh, once.
      if (!prior) throw e;
      await fs.rm(req, { force: true });
      url = await call();
    }
    await download(url, out);
    return out;
  },
};
