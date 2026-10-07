/**
 * KLING, two ways (both on fal):
 *   recast   -- Kling 3.0 Motion Control: the recording's motion, timing and
 *               expression mapped onto the actor's portrait, up to 30 s a
 *               call. Keeps the person's own gestures -- but a hand holding
 *               something (the handheld mic on Old Chimp) can come back
 *               warped, and a long take is cut at its pauses.
 *   generate -- Kling AI Avatar v2 Pro: the portrait animated from a voice
 *               (a script voiced by ElevenLabs or HeyGen), 2-60 s a call, a
 *               longer read cut at its pauses.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runKling, runKlingAvatar, download, dataUri, ffmpeg, durationOf } from "../actor-test.js";
import type { Performer, PerformContext } from "./types.js";

/** Kling's avatar mode takes at most 60 s of voice a call. */
const AVATAR_MAX = 55;

async function portraitJpg(ctx: PerformContext): Promise<string> {
  const img = path.join(ctx.workDir, "portrait.jpg");
  if (!(await fs.stat(img).then(() => true, () => false))) {
    await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
  }
  return img;
}

export const kling: Performer = {
  id: "kling",
  label: "Kling",
  drivenBy: "video",
  keeps: "Recast: your actual gestures and timing. From a script: Kling animates the portrait from the voice",
  framedBy: "Your camera: the recording's framing",
  limits: "30 s per call (seams on longer takes); hands holding things can warp",
  key: "FAL_KEY",
  minutesPer30s: 14,
  maxSeconds: 29,

  async fromVideo(video: string, tag: string, ctx: PerformContext): Promise<string> {
    const out = path.join(ctx.workDir, `kling-${tag}.mp4`);
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = await portraitJpg(ctx);
    // A 30 s source is too big to inline comfortably: fal fetches it by URL
    // when the server has a public address.
    const src = (await ctx.publicUrl?.(video)) || await dataUri(video, "video/mp4");
    const pic = (await ctx.publicUrl?.(img)) || await dataUri(img, "image/jpeg");
    await download(await runKling(src, pic), out);
    return out;
  },

  async fromAudio(audio: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w("kling-avatar.mp4");
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = await portraitJpg(ctx);
    const pic = (await ctx.publicUrl?.(img)) || await dataUri(img, "image/jpeg");
    const duration = await durationOf(audio);
    if (!duration) throw new Error("could not read the voice's length");
    const { planChunks, silencesOf } = await import("../recast.js");
    const parts = duration <= AVATAR_MAX ? [[0, duration] as [number, number]] : planChunks(duration, await silencesOf(audio), AVATAR_MAX, 20);
    const { width: W, height: H } = ctx;
    for (let i = 0; i < parts.length; i++) {
      const fit = w(`kav-fit-${i}.mp4`);
      if (await fs.stat(fit).then((x) => x.size > 0, () => false)) continue;
      const [a, b] = parts[i];
      const piece = w(`kav-${i}.mp3`);
      await ffmpeg(["-ss", String(a), "-to", String(b), "-i", audio, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", piece]);
      const raw = w(`kav-${i}.mp4`);
      await download(await runKlingAvatar(pic, (await ctx.publicUrl?.(piece)) || await dataUri(piece, "audio/mpeg")), raw);
      // Each piece exactly its stretch of the voice, at the frame asked for.
      await ffmpeg(["-i", raw, "-an", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${Math.ceil(b - a) + 1}`,
        "-t", (b - a).toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", fit]);
    }
    await fs.writeFile(w("kav-list.txt"), parts.map((_, i) => `file '${w(`kav-fit-${i}.mp4`)}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("kav-list.txt"), "-c", "copy", out]);
    return out;
  },
};
