/**
 * WAN 2.2 Animate "replace" (on fal): redraws the person from the portrait
 * over the recording -- the gestures, the room and the light stay. Wan's
 * calls are short, so it has its own whole-take method (a reference pass,
 * one seed, 8 s chunks at 16 fps, the room composited back): recastFile in
 * core/recast.ts. Slow, and on long takes the seams can show -- experimental.
 */
import fs from "node:fs/promises";
import type { Performer } from "./types.js";

export const wan: Performer = {
  id: "wan",
  label: "Wan",
  drivenBy: "video",
  keeps: "Your gestures, your room and light",
  limits: "Slow; seams and a halo can show on long takes",
  key: "FAL_KEY",
  minutesPer30s: 40,
  experimental: true,

  async recastTake({ rawAbs, outAbs, voiceId, ctx, onChunk }) {
    const { recastFile, actorSeed } = await import("../recast.js");
    const { matteTake, alphaCopyName } = await import("../take-matte.js");
    const { config } = await import("../../config.js");
    await recastFile({
      rawAbs, outAbs, workDir: ctx.workDir, portraitAbs: ctx.portraitAbs, voiceId,
      seed: actorSeed(ctx.actor.id), keepRoom: true,
      interpolate: process.env.MP_RECAST_INTERP === "blend" ? "blend" : "mci",
      // The matte's alpha copy: the take's own (made once, reused) and the redrawn picture's.
      matte: async (video) => {
        const alpha = alphaCopyName(video);
        if (await fs.stat(alpha).then((x) => x.size > 0, () => false)) return alpha;
        const r = await matteTake(video, { dataDir: config.dataDir, blur: false, alpha: true });
        if (!r.alpha) throw new Error("the matte made no alpha");
        return r.alpha;
      },
      onStage: ctx.onStage, onChunk,
    });
  },
};
