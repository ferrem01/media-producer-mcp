/** The performer registry (core/performers/types.ts). A new vendor: one file, one line here. */
import { heygen } from "./heygen.js";
import { kling } from "./kling.js";
import { runway } from "./runway.js";
import { higgsfield } from "./higgsfield.js";
import type { Performer, PerformerId, PerformerInfo } from "./types.js";
import type { CastActor } from "../cast.js";

export type { Performer, PerformerId, PerformerInfo, PerformContext } from "./types.js";

export const PERFORMERS: Performer[] = [heygen, kling, higgsfield, runway];

export function getPerformer(id: string): Performer | undefined {
  return PERFORMERS.find((p) => p.id === id);
}

/** For the picker: every vendor, whether this server has its key, and what
 *  it can do (recast a recording; generate a take from the script). */
export function performerList(): Array<PerformerInfo & { available: boolean; recast: boolean; generate: boolean; maxSeconds?: number }> {
  return PERFORMERS.map((p) => ({
    id: p.id, label: p.label, drivenBy: p.drivenBy, keeps: p.keeps, limits: p.limits, key: p.key,
    minutesPer30s: p.minutesPer30s, ...(p.experimental ? { experimental: true } : {}),
    ...(p.maxSeconds ? { maxSeconds: p.maxSeconds } : {}),
    available: !!process.env[p.key], recast: true, generate: !!p.fromAudio,
  }));
}

/** Who performs when the caller does not say: HeyGen for a HeyGen look
 *  (the actor tests' winner), else the best video-driven vendor with a key. */
export function defaultPerformer(actor: CastActor): Performer {
  if (actor.heygen_look_id) return heygen;
  return [kling, higgsfield, heygen, runway].find((p) => !!process.env[p.key]) || heygen;
}
