/**
 * Speaker-film compositing rule — the ONE shared decision behind every
 * speaker-track mode. With a speaker track present, a scene composites OVER the
 * camera (its background is transparent so the camera shows through) UNLESS it
 * explicitly opts out with `transparent_background: false`.
 *
 * The three modes this governs (all the same "speaker guts"):
 *   - full-frame speaker head          -> transparent (camera fills the frame)
 *   - half-frame speaker + content_region content beside it -> transparent
 *   - opaque screencast + camera PiP   -> transparent_background:false -> OPAQUE
 *       (the screencast covers the camera; the camera shows only in its PiP)
 *
 * A fourth: a scene carrying the take as a LAYER over its own ground
 * (core/speaker-layer.ts) -> OPAQUE, the person plays inside the scene.
 *
 * Kept in one tiny module so preview, render, thumbnail,
 * critique, and composite never disagree — and so the rule is unit-testable.
 */
import { sceneCarriesSpeakerLayer } from "./speaker-layer.js";

export function sceneCompositesOverSpeaker(
  scene: { transparent_background?: boolean; components?: Array<{ data?: Record<string, any> } | null> | null } | null | undefined,
  hasSpeakerTrack: boolean,
): boolean {
  if (!hasSpeakerTrack || !scene) return false;
  // THE TAKE AS A LAYER (core/speaker-layer.ts): a scene that carries the
  // take inside it, over its own ground, is opaque -- the base under it
  // would double the person.
  if (sceneCarriesSpeakerLayer(scene)) return false;
  return scene.transparent_background !== false;
}
