/**
 * Regression tests for the speaker-track compositing rule -- the ONE decision
 * shared by every speaker mode (full-frame head, half-frame + content, PiP).
 *
 * This locks the behavior the modes depend on, so a change aimed at one mode
 * (e.g. the PiP lip-sync fix) can't silently flip another:
 *   - full-frame speaker  -> composites OVER the camera (transparent)
 *   - half-frame speaker   -> composites OVER the camera (transparent)
 *   - opaque screencast+PiP -> transparent_background:false -> does NOT (opaque)
 *   - no speaker track      -> never composites over a (nonexistent) camera
 */

import { describe, it, expect } from "vitest";
import { sceneCompositesOverSpeaker } from "../src/core/speaker-mode.js";

describe("sceneCompositesOverSpeaker: the shared speaker-mode rule", () => {
  const hasSpeaker = true;

  it("FULL-FRAME speaker head: transparent (composites over the camera)", () => {
    // A talking-head scene leaves transparent_background unset -> transparent.
    expect(sceneCompositesOverSpeaker({}, hasSpeaker)).toBe(true);
    expect(sceneCompositesOverSpeaker({ transparent_background: true }, hasSpeaker)).toBe(true);
  });

  it("HALF-FRAME speaker + content: transparent (camera shows beside content)", () => {
    // content_region confines the content; the scene still composites over the
    // camera, so its background must stay transparent.
    const halfScene = { transparent_background: undefined as boolean | undefined } as any;
    expect(sceneCompositesOverSpeaker(halfScene, hasSpeaker)).toBe(true);
  });

  it("PiP (opaque screencast): does NOT composite over the camera", () => {
    // transparent_background:false -> the screencast covers the camera; the
    // camera appears only in its PiP bubble. This is the mode we just fixed;
    // it must stay OPAQUE.
    expect(sceneCompositesOverSpeaker({ transparent_background: false }, hasSpeaker)).toBe(false);
  });

  it("NO speaker track: never composites over a camera, regardless of the flag", () => {
    expect(sceneCompositesOverSpeaker({}, false)).toBe(false);
    expect(sceneCompositesOverSpeaker({ transparent_background: true }, false)).toBe(false);
    expect(sceneCompositesOverSpeaker({ transparent_background: false }, false)).toBe(false);
  });

  it("is null-safe", () => {
    expect(sceneCompositesOverSpeaker(null, true)).toBe(false);
    expect(sceneCompositesOverSpeaker(undefined, true)).toBe(false);
  });
});
