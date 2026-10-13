/**
 * THE CAMERA OF A GENERATED SHOT (SPEC-shot-camera.md): what the film was
 * "shot on" and how the camera moves in one shot. Two closed lists, each
 * entry carrying the exact phrase the models were tested with (Oct 13, Dana:
 * stills for every camera, a Seedance clip for every move). The writer picks
 * an id; nobody writes the phrase.
 *
 *   film camera -- one per film (`treatment.filmCamera`): the start frame is
 *                  drawn in its look and Seedance keeps the look of the frame
 *                  it starts from. A b-roll clip may name an insert camera.
 *   shot move   -- one per generated shot (`storyboard.scenes[i].shot_move`,
 *                  or an actor clip's own `move`). A speaking shot takes only
 *                  the gentle moves (lip sync and the face hold); the moves
 *                  that leave the first frame's view (orbit, crane, fpv) go
 *                  without the model sheet, which pins the camera to it.
 *
 * Only generated pictures read these. A recording, stock footage and motion
 * graphics never do; the GSAP scene camera is `camera_moves`, another thing.
 */

/** The skin clause every camera that shows a person keeps (Marc, Oct 8: "it
 *  does look like AI ... the texture, the quality of the picture"). */
const REAL_SKIN = "True-to-life skin with pores, fine lines and natural imperfections, not airbrushed, no plastic sheen, not CGI.";

export interface FilmCamera {
  id: string;
  name: string;
  /** Said to the image model drawing a start frame or still. */
  frame: string;
  /** Said to the video model. */
  video: string;
  /** false: an insert camera -- a b-roll clip may name it, a film may not
   *  (a presenter's face does not hold on it). */
  film: boolean;
}

export const FILM_CAMERAS: FilmCamera[] = [
  {
    id: "cinema", name: "Cinema", film: true,
    // The sentence every start frame got before the list existed: the
    // default look stays exactly what it was.
    frame: "Shot on a cinema camera with a 35-50mm lens: true-to-life skin with pores, fine lines and natural imperfections, not airbrushed, no plastic sheen, not CGI; motivated natural light, real contrast, subtle film grain.",
    video: "Cinematic, natural motivated light.",
  },
  {
    id: "phone-front", name: "Phone, front camera", film: true,
    frame: `A real iPhone front-camera photo: wide 24mm selfie perspective, slight lens distortion near the edges, phone HDR, everything fairly sharp, natural window light, unretouched. ${REAL_SKIN}`,
    video: "Filmed on an iPhone front camera, phone video look, wide selfie lens, natural light, no cinematic grading.",
  },
  {
    id: "phone-back", name: "Phone, back camera", film: true,
    frame: `A real iPhone main-camera photo: 26mm, natural phone color, mild portrait-mode background blur, unretouched. ${REAL_SKIN}`,
    video: "Filmed on an iPhone main camera, natural phone color and exposure.",
  },
  {
    id: "documentary", name: "Documentary", film: true,
    frame: `Shot on a Sony FX3 documentary camera, available light, slightly underexposed shadows, real location, no styling. ${REAL_SKIN}`,
    video: "Documentary footage on a Sony FX3, available light, observational.",
  },
  {
    id: "film-16mm", name: "16mm film", film: true,
    frame: `Shot on 16mm film (Kodak Vision3): visible grain, soft halation on highlights, slightly lifted blacks, warm color. ${REAL_SKIN}`,
    video: "16mm film footage, visible grain, soft halation, warm color.",
  },
  {
    id: "disposable", name: "Disposable flash", film: true,
    frame: `A disposable-camera photo: direct on-camera flash, dark falloff behind the subject, warm grain. ${REAL_SKIN}`,
    video: "Disposable-camera look: direct on-camera flash, dark falloff behind the subject, warm grain.",
  },
  {
    id: "drone", name: "Drone", film: false,
    frame: "Aerial photo from a DJI drone, high vantage, wide, looking down. Real, not CGI.",
    video: "Aerial DJI drone footage, smooth and stable.",
  },
];

export const FILM_CAMERA_IDS = FILM_CAMERAS.filter((c) => c.film).map((c) => c.id);
export const CAMERA_IDS = FILM_CAMERAS.map((c) => c.id);
export const DEFAULT_CAMERA = "cinema";

export function getCamera(id: unknown): FilmCamera | undefined {
  return typeof id === "string" ? FILM_CAMERAS.find((c) => c.id === id.trim().toLowerCase()) : undefined;
}

/** The camera a film is shot on: its treatment's, else the default. */
export function filmCameraOf(project: any): FilmCamera {
  const c = getCamera(project?.treatment?.filmCamera);
  return c && c.film ? c : getCamera(DEFAULT_CAMERA)!;
}

/** The director's default when the brief names no look: a person film made
 *  for the phone looks shot on one; a launch film stays cinema. */
export function inferFilmCamera(grammar: string | undefined, frame: string | undefined): string {
  const tall = !!frame && frame !== "16x9";
  if (grammar === "creator-cut" || grammar === "speaker") return tall ? "phone-front" : "documentary";
  if ((grammar === "tempo-cut" || grammar === "hype-cut") && tall) return "phone-back";
  return DEFAULT_CAMERA;
}

export interface ShotMove {
  id: string;
  name: string;
  /** Said to the video model, first in the shot: "CAMERA MOVE: <phrase>." */
  phrase: string;
  /** A speaking shot may take it: lip sync and the face hold. */
  speaking: boolean;
  /** Made without the model sheet: the sheet pins the camera to the first
   *  frame's view, and this move has to leave it (Oct 13: the orbit barely
   *  moved with the sheet, made a half-circle without it). */
  noSheet?: boolean;
  /** How the start frame is framed so the move has somewhere to go. */
  start?: string;
}

/** Tested Oct 13 on Seedance 2.5 (SPEC-shot-camera.md, "What the clips
 *  showed"). Dolly zoom is not here: it failed with and without the sheet. */
export const SHOT_MOVES: ShotMove[] = [
  { id: "static", name: "Static", speaking: true,
    phrase: "locked-off static camera on a tripod: no zoom, no push-in, no camera movement, constant framing" },
  { id: "push-in", name: "Push in", speaking: true,
    phrase: "slow dolly push-in toward the person, smooth, ending tighter on their face",
    start: "Framed a little wider than described, so the camera can push in." },
  { id: "pull-out", name: "Pull out", speaking: true,
    phrase: "slow dolly pull-out away from the person, revealing more of the place",
    start: "Framed a little tighter than described, so the camera can pull out." },
  { id: "handheld", name: "Handheld", speaking: true,
    phrase: "subtle handheld camera, gentle natural sway and micro-movements, never shaky" },
  { id: "tracking", name: "Tracking", speaking: true,
    phrase: "the camera tracks backward ahead of the person at a constant distance as they walk toward it, keeping them the same size in frame" },
  { id: "pan-right", name: "Pan right", speaking: false,
    phrase: "slow smooth pan from left to right across the place, ending on the person",
    start: "The person on the right of the frame, the place opening to the left." },
  { id: "pan-left", name: "Pan left", speaking: false,
    phrase: "slow smooth pan from right to left across the place, ending on the person",
    start: "The person on the left of the frame, the place opening to the right." },
  { id: "tilt-up", name: "Tilt up", speaking: false,
    phrase: "slow smooth tilt up from their hands to their face",
    start: "A close shot of the person's hands, their face just out of frame above." },
  { id: "tilt-down", name: "Tilt down", speaking: false,
    phrase: "slow smooth tilt down from their face to their hands" },
  { id: "rack-focus", name: "Rack focus", speaking: false,
    phrase: "static camera, rack focus from the object in the foreground to the person's face",
    start: "An everyday object sharp in the foreground, the person behind it out of focus." },
  { id: "orbit", name: "Orbit", speaking: false, noSheet: true,
    phrase: "the camera travels a half-circle, 180 degrees, around the person, keeping them centered the whole time, the room turning behind them" },
  { id: "crane", name: "Crane up", speaking: false, noSheet: true,
    phrase: "smooth crane move rising up and over the person, ending high and looking down",
    start: "A low eye-level shot." },
  { id: "fpv", name: "FPV flight", speaking: false, noSheet: true,
    phrase: "fast FPV drone flight through the place, swooping past and around the person" },
];

export const MOVE_IDS = SHOT_MOVES.map((m) => m.id);

export function getMove(id: unknown): ShotMove | undefined {
  return typeof id === "string" ? SHOT_MOVES.find((m) => m.id === id.trim().toLowerCase()) : undefined;
}

/** The move a shot is made with: the one asked for, when the shot can take
 *  it; else the setting's (a speaking shot asked for an unsafe move gets the
 *  setting's, and the note says so); else none -- the shot alone. */
export function resolveMove(asked: unknown, settingMove: string | undefined, speaking: boolean): { move?: ShotMove; note?: string } {
  const want = getMove(asked);
  const fallback = getMove(settingMove);
  if (want && (!speaking || want.speaking)) return { move: want };
  if (want) return { move: fallback, note: `${want.name} is not made on a speaking shot (lip sync and the face do not hold)${fallback ? `; ${fallback.name.toLowerCase()} instead` : ""}` };
  return { move: fallback };
}

/** A scene's camera move: undefined keeps it, "" clears it (the setting's
 *  then), an id sets it. A move the shot cannot take is refused here, not
 *  quietly swapped. True when it changed. */
export function setShotMove(scene: any, v: string | undefined, speaking: boolean): boolean {
  if (v === undefined) return false;
  const id = String(v).trim().toLowerCase();
  const before = scene.shot_move;
  if (!id) delete scene.shot_move;
  else {
    const m = getMove(id);
    if (!m) throw new Error(`Unknown camera move "${v}" (${MOVE_IDS.join(", ")})`);
    if (speaking && !m.speaking) throw new Error(`${m.name} cannot be made on a speaking shot (lip sync and the face do not hold): ${SHOT_MOVES.filter((x) => x.speaking).map((x) => x.id).join(", ")}`);
    scene.shot_move = m.id;
  }
  return before !== scene.shot_move;
}

/** The camera words that open a shot's prompt. */
export function moveLine(move: ShotMove | undefined): string {
  if (!move) return "";
  return move.id === "static" ? `CAMERA: ${move.phrase}.` : `CAMERA MOVE: ${move.phrase}; the move is the camera's, not the person's.`;
}
