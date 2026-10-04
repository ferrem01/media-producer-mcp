/**
 * HIGGSFIELD Genjutsu Motion Transfer: the recording's motion, timing,
 * camera and room rebuilt with the actor from the portrait -- the Recast in
 * Higgsfield's reels (Marc: "literally doing what we want to do"). ByteDance's
 * public Seedance API refused realistic faces (2.0 and 2.5, measured); this
 * is Higgsfield's own endpoint. 4-30 s a call (longer is cut at the take's
 * pauses); it fetches inputs by public URL only. The job's status URL is kept
 * in workDir so a restart collects it instead of paying twice.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runGenjutsu, download, ffmpeg, GENJUTSU_SHEET_PROMPT } from "../actor-test.js";
import type { Performer, PerformContext } from "./types.js";

export const higgsfield: Performer = {
  id: "higgsfield",
  label: "Higgsfield",
  drivenBy: "video",
  keeps: "Your gestures, timing, camera and room -- the person swapped",
  limits: "Recordings only (no script mode); 30 s per call (seams on longer takes)",
  key: "HF_API_KEY_ID",
  minutesPer30s: 6,
  maxSeconds: 30,

  async fromVideo(video: string, tag: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w(`higgsfield-${tag}.mp4`);
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = w("portrait.jpg");
    if (!(await fs.stat(img).then(() => true, () => false))) {
      await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
    }
    const src = await ctx.publicUrl?.(video), pic = await ctx.publicUrl?.(img);
    if (!src || !pic) throw new Error("Higgsfield fetches the take by URL: the server needs its public https address");
    // A cast member made from a model sheet: the start frame first, the
    // sheet second (the same person from other angles).
    const images = [pic];
    if (ctx.sheetAbs) {
      const sheet = w("sheet.jpg");
      if (!(await fs.stat(sheet).then(() => true, () => false))) {
        await ffmpeg(["-i", ctx.sheetAbs, "-frames:v", "1", "-vf", "scale='min(2048,iw)':-2", "-q:v", "2", sheet]);
      }
      const sheetUrl = await ctx.publicUrl?.(sheet);
      if (sheetUrl) images.push(sheetUrl);
    }
    const req = w(`higgsfield-${tag}.json`);
    const prior = await fs.readFile(req, "utf8").then((t) => JSON.parse(t)?.status_url as string, () => undefined);
    const call = (resume?: string) => runGenjutsu(src, images, {
      resume, ...(images.length > 1 ? { prompt: GENJUTSU_SHEET_PROMPT } : {}), onSubmit: async (statusUrl) => { await fs.writeFile(req, JSON.stringify({ status_url: statusUrl })); },
    });
    let url: string;
    try { url = await call(prior); }
    catch (e) { if (!prior) throw e; await fs.rm(req, { force: true }); url = await call(); }
    await download(url, out);
    return out;
  },
};
