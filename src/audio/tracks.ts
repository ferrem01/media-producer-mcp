/**
 * A film's audio tracks are keyed by id: adding a track whose id is already
 * there REPLACES it, in its place. A plain push stacked copies -- re-voicing
 * vo_scene_2 left three copies of the line on the film (Oct 8, proj_f5c104bb).
 */
import type { AudioTrack } from "../core/types.js";

export function putTrack(tracks: AudioTrack[], track: AudioTrack): AudioTrack[] {
  const at = tracks.findIndex((t) => t.id === track.id);
  const rest = tracks.filter((t) => t.id !== track.id);
  if (at < 0) return [...rest, track];
  rest.splice(Math.min(at, rest.length), 0, track);
  return rest;
}
