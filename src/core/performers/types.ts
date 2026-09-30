/**
 * PERFORMERS: the vendors that can perform a speaker take as a cast actor
 * (core/recast.ts, core/generated-take.ts). One file per vendor behind this
 * interface, so a new vendor is one new file and a line in index.ts.
 *
 * A performer is driven by one of two things:
 *   audio -- it hears a voice and draws the whole person (HeyGen): the
 *            movement is its own, the voice and timing ours. It can also
 *            perform a GENERATED take (the script voiced, no recording).
 *   video -- it maps the recording's motion onto the actor (Kling, Runway,
 *            Wan): the gestures are the recording's. Each call takes at
 *            most maxSeconds, so a long take is cut at its pauses.
 */
import type { CastActor } from "../cast.js";

export type PerformerId = "heygen" | "kling" | "runway" | "wan";

export interface PerformerInfo {
  id: PerformerId;
  label: string;
  drivenBy: "audio" | "video";
  /** What the result keeps of the recording, in a phrase for the picker. */
  keeps: string;
  /** The catch, in a phrase for the picker. */
  limits: string;
  /** The server key it needs. */
  key: string;
  /** Rough minutes of work per 30 s of take (the picker's estimate). */
  minutesPer30s: number;
  experimental?: boolean;
}

export interface PerformContext {
  tenant: string;
  actor: CastActor;
  /** The actor's portrait (absolute), for vendors that draw from a picture. */
  portraitAbs: string;
  workDir: string;
  /** The take's frame, for the aspect asked for. */
  width: number;
  height: number;
  /** A public URL for a file in workDir, when the server has one (large
   *  sources go by URL instead of a data URI). */
  publicUrl?: (file: string) => Promise<string | null>;
  onStage?: (stage: string) => void;
}

export interface Performer extends PerformerInfo {
  /** Audio-driven: the voice (an mp3) -> a video file (absolute path). A
   *  submitted job id kept in workDir lets a restart collect it. */
  fromAudio?(audio: string, ctx: PerformContext): Promise<string>;
  /** Video-driven: a stretch of the take (at most maxSeconds, with its own
   *  sound) -> a video file of the actor doing it. `tag` names the stretch
   *  so its files and job ids stay apart from the others'. */
  fromVideo?(video: string, tag: string, ctx: PerformContext): Promise<string>;
  maxSeconds?: number;
  /** A vendor with its own whole-take method (Wan: reference pass, 16 fps,
   *  the room kept) does the entire recast itself. */
  recastTake?(opts: { rawAbs: string; outAbs: string; voiceId?: string; ctx: PerformContext; onChunk?: (done: number, total: number) => void }): Promise<void>;
}
