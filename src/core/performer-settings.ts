/**
 * THE SETTING (SPEC-creator-formats.md): where the person is and how the
 * phone sees them -- the "where you are" half of the talking-head types. A
 * scene's `performer.setting`. Two jobs: the booth shows it as filming
 * guidance, and a generated or recast performer gets it as the shot when
 * none is given. The Locations library says WHICH room (Seedance); the
 * setting says how the person is in it. They compose.
 */

export interface PerformerSetting {
  id: string;
  name: string;
  /** What the human is told in the booth: how to place the phone and themselves. */
  booth: string;
  /** The shot a generated performer is drawn and performed in. */
  shot: string;
}

export const PERFORMER_SETTINGS: PerformerSetting[] = [
  {
    id: "selfie", name: "Selfie",
    booth: "Hold the phone at arm's length, lens at eye level, face in the top third. Look at the lens.",
    shot: "A handheld selfie-style medium close-up, the person holding the phone at arm's length and talking straight to the camera",
  },
  {
    id: "sit-down", name: "Classic Sit-Down",
    booth: "Phone on a stand at eye level, about an arm and a half away, chest up in frame. Sit in front of a background with some depth (not a flat wall). Look at the lens.",
    shot: "A seated medium shot from a tripod at eye level, the person sitting in a chair talking to the camera, a lived-in room with depth behind them",
  },
  {
    id: "walk-talk", name: "Walk & Talk",
    booth: "Hold the phone out in front of you and walk slowly toward it. Keep your face in the top third and talk to the lens. Somewhere with space to walk and steady light.",
    shot: "A walk-and-talk shot: the person walking slowly toward a handheld camera held at arm's length, talking to it, the background moving past, a gentle natural bounce",
  },
  {
    id: "car", name: "Car Talk",
    booth: "Parked, never driving. Phone on the dashboard or a vent mount, angled up a little at your face. Look just past the lens, the way you'd talk to a passenger.",
    shot: "A car-talk shot from a phone mounted on the dashboard: the person in the driver's seat of a parked car, seat belt off, talking to the camera, daylight through the windows",
  },
  {
    id: "podcast", name: "Podcast Style",
    booth: "A mic in shot on the desk. Phone on a stand off to one side, a three-quarter angle. Talk to a point just beside the lens, as if someone sits there.",
    shot: "A podcast-style three-quarter shot: the person at a desk in front of a broadcast microphone on an arm, talking to someone just off camera, warm studio light",
  },
  {
    id: "outdoor-sit", name: "Outdoor Sit & Talk",
    booth: "Sit outside on a bench, steps or grass. The light on your face, never behind you. Phone on a stand or propped at eye level.",
    shot: "A seated outdoor shot: the person sitting outside on a bench in soft daylight, greenery or a street softly out of focus behind them, talking to the camera",
  },
  {
    id: "doing", name: "Do Something & Talk",
    booth: "Keep doing the task while you talk (making coffee, packing a box, writing on a pad). Frame wide enough that the phone sees your hands and your face.",
    shot: "A medium-wide shot of the person busy with a task with their hands while they talk to the camera, glancing up between movements",
  },
  {
    id: "second-camera", name: "Second-Camera",
    booth: "Someone else holds the phone from the side. Talk to them, not to the lens, as if mid-conversation.",
    shot: "A third-person documentary angle: the person filmed from the side by a second camera operator, talking to someone just off camera, never looking into the lens",
  },
];

export const SETTING_IDS = PERFORMER_SETTINGS.map((s) => s.id);

export function getSetting(id: unknown): PerformerSetting | undefined {
  if (typeof id !== "string" || !id) return undefined;
  const k = id.trim().toLowerCase();
  return PERFORMER_SETTINGS.find((s) => s.id === k);
}

/** The shot a scene's setting asks for, or undefined when it names none. */
export function shotForSetting(id: unknown): string | undefined {
  return getSetting(id)?.shot;
}
