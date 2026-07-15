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
 * Kept in one tiny dependency-free module so preview, render, thumbnail,
 * critique, and composite never disagree — and so the rule is unit-testable.
 */
export function sceneCompositesOverSpeaker(
  scene: { transparent_background?: boolean } | null | undefined,
  hasSpeakerTrack: boolean,
): boolean {
  if (!hasSpeakerTrack || !scene) return false;
  return scene.transparent_background !== false;
}
