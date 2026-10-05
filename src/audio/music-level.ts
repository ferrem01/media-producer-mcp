/**
 * THE BED'S LEVEL: how loud the music sits, and how far it dips under a
 * voiceover. Two numbers on the project, read as they are by the render
 * (core/render.ts resolveDucking -> audio/mixer.ts) and by Studio's player:
 *
 *   audio.tracks[music].volume       the bed's level, 0-1
 *   audio.ducking.ducked_volume      a MULTIPLIER of that level while a
 *                                    voiceover plays (0.35 = 35% of it)
 *
 * Ducking only fires against voiceover TRACKS. A speaker film's voice is
 * the speaker track, not a voiceover track, so its bed sits at `volume`
 * under the whole film -- `ducks` says which case a film is in, so the
 * card never offers a dial that does nothing.
 */
import type { Project } from "../core/types.js";

export interface MusicLevel {
  volume: number | null;
  ducked_volume: number | null;
  /** True when the bed actually dips: ducking on and a voiceover to dip under. */
  ducks: boolean;
  /** A speaker film: the voice is the speaker track, which ducking does not hear. */
  speaker: boolean;
}

const bedOf = (project: Project) => (project.audio?.tracks || []).find((t) => t.type === "music");

export function musicLevel(project: Project): MusicLevel {
  const bed = bedOf(project);
  const d = project.audio?.ducking;
  const voices = (project.audio?.tracks || []).some((t) => t.type === "voiceover" || (d && t.id === d.trigger_track && t.id !== bed?.id));
  return {
    volume: bed ? (typeof bed.volume === "number" ? bed.volume : 1) : null,
    ducked_volume: d ? d.ducked_volume : null,
    ducks: !!(bed && d?.enabled && voices),
    speaker: !!project.speaker_track?.clips?.length,
  };
}

function level(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`${name} must be a number from 0 to 1`);
  return Math.round(n * 1000) / 1000;
}

/** Set the bed's level and/or its dip. Throws when there is no bed to set. */
export function setMusicLevel(project: Project, body: { volume?: unknown; ducked_volume?: unknown }): MusicLevel {
  const bed = bedOf(project);
  if (!bed) throw new Error("This film has no music bed");
  if (body.volume === undefined && body.ducked_volume === undefined) throw new Error("Give volume and/or ducked_volume");
  const volume = body.volume !== undefined ? level(body.volume, "volume") : undefined;
  const ducked = body.ducked_volume !== undefined ? level(body.ducked_volume, "ducked_volume") : undefined;
  // Every music clip: two clips of one song (a repeated bar) stay one level.
  if (volume !== undefined) for (const t of project.audio!.tracks) if (t.type === "music") t.volume = volume;
  if (ducked !== undefined) {
    project.audio!.ducking = project.audio!.ducking
      ? { ...project.audio!.ducking, ducked_volume: ducked }
      : { enabled: true, duck_track: bed.id, trigger_track: "voiceover", ducked_volume: ducked, attack: 0.3, release: 0.5 };
  }
  return musicLevel(project);
}
