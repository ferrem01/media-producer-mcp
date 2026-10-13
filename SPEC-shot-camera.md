# SPEC-shot-camera.md -- what a generated shot was "shot on", and how its camera moves

Status: built 2026-10-13 (this PR), from the Oct 13 tests below. Companion
docs: `SPEC-creator-formats.md` (the setting, the printable vocabulary),
`SPEC-cast-scenes.md` (the performer plan), `SPEC-creative-axes.md` (the
film's axes), `SPEC-motion-architecture.md` (the motion-graphics camera -- a
different thing, see Naming). Code: `src/core/shot-camera.ts`.

## Why

Two creator tips (trypromptwise reels, Sep 21 and Sep 25) say the same thing
about AI video: **name the camera**. Naming a camera body or format ("shot on
an iPhone front camera", "16mm film") brings its whole look. Naming one
camera move ("slow dolly push-in") gets a directed shot, not a drifting one.

Before this, every start frame got the same sentence ("Shot on a cinema
camera with a 35-50mm lens ..."), so every generated person looked like the
same polished commercial -- even in a creator-cut made for TikTok. The
Seedance shot was free text with a framing and almost never a move, and a
`gen_video` clip's move was whatever the writer put in its prose.

## The two concepts

| Concept | Level | What it answers | Where it lives |
|---|---|---|---|
| **Film camera** | film | What was this film shot on? | `treatment.filmCamera`; `create` / `update` / `generate film_camera` |
| **Shot move** | shot | How does the camera move in this generated shot? | `storyboard.scenes[i].shot_move`; an actor clip's own `move` |

Both are closed lists in `src/core/shot-camera.ts`, each entry carrying the
exact words the models were tested with. The writer picks an id; nobody
writes the words. Both print with `list target:"vocabulary"`
(`film_cameras`, `shot_moves`).

**What they touch:** only GENERATED pictures of a person or place -- the
start frame (GPT Image), the Seedance take and actor clips, the Veo
`gen_video` clip and the Veo presenter. A recording, stock footage, motion
graphics and `hero_image` stills are untouched (a hero image is often an
illustrated object; a camera body would fight it).

### Naming

`camera_moves` already exists: the GSAP scene camera on a motion-graphics
scene. This spec does not touch it. The new words are `film_camera` and
`shot_move` so the two never meet; `look` is taken too (HeyGen looks).

## What the tests showed (Oct 13, Dana, Seedance 2.5)

**Stills, one per camera** (same sit-down shot, only the camera sentence
changed; the face held in every one):

| Camera | Result | Kept |
|---|---|---|
| Today's sentence / cinema | identical, as intended | **cinema** (the default, word for word today's) |
| Anamorphic | a small flare, a little more blur | folded into cinema |
| Phone, front | the biggest change: a real selfie, wider, arm to camera | **phone-front** |
| Phone, back | brighter, flatter, "filmed on a phone" | **phone-back** |
| Documentary (FX3) | darker, available light | **documentary** |
| 16mm | warm, backlit, halation | **film-16mm** |
| 35mm | between cinema and phone-back | folded into cinema |
| Action cam | wider room, face not distorted -- does not read as a GoPro | dropped |
| Camcorder | only softer; not a home video | dropped |
| Disposable | flash with dark falloff, reads right | **disposable** |
| Drone | works as an insert, her face held small | **drone** (clips only) |

**Clips, one per move** (5 s silent Seedance, 720p, with the model sheet):
static, push-in, pull-out, handheld, tracking, pan, tilt, rack focus and FPV
worked. Crane was weak (rose a little). **Orbit barely moved; dolly zoom did
not happen.**

**The retry** (orbit and dolly zoom, the move named first, with and without
the model sheet):

| | With the sheet | Without |
|---|---|---|
| Orbit | still a small drift | **a real half-circle**, ending behind her shoulder; her face drifts a little mid-move |
| Dolly zoom | the room shifts a little | she shrinks -- a pull-out, not a dolly zoom |

So the **model sheet pins the camera** to the first frame's view: it is what
keeps her face, and it is what stops a move that has to leave that view.
Dolly zoom does not work either way and is not on the list.

## 1. Film camera (one per film)

**One camera per film** -- an iPhone shot beside an Alexa shot reads as
stitched stock. Six film cameras: `cinema` (default), `phone-front`,
`phone-back`, `documentary`, `film-16mm`, `disposable`. `drone` is an
**insert camera**: an actor clip may name it, a film may not.

- **The start frame** is drawn with the camera's `frame` words in place of
  the old fixed sentence; `cinema`'s words ARE the old sentence, so a film
  with no camera looks exactly as before.
- **Seedance and Veo** get the camera's `video` words at the end of the shot.
- **The director** picks it for a new film (echoing a pin), else
  `inferFilmCamera`: a speaker / creator-cut film is `phone-front` on a tall
  frame and `documentary` in 16x9; a tempo-cut / hype-cut on a tall frame is
  `phone-back`; everything else `cinema`. A film made before this has no
  `filmCamera` and stays `cinema` -- nothing already made changes look.
- **Studio**: the performer panel's Camera row sets it for the whole film
  (`POST /api/scene-performance/... {action:"film_camera"}`). Frames already
  drawn stay; the next one is drawn in the new look.

## 2. Shot move (one per generated shot)

**One move per shot.** Thirteen ids:

| id | Speaking | Without the sheet | Start frame framed for it |
|---|---|---|---|
| `static` | yes | | |
| `push-in` | yes | | a little wider |
| `pull-out` | yes | | a little tighter |
| `handheld` | yes | | |
| `tracking` | yes (a walk-and-talk) | | |
| `pan-right`, `pan-left` | no | | the person on the far side |
| `tilt-up`, `tilt-down` | no | | (tilt-up) on the hands |
| `rack-focus` | no | | an object sharp in front |
| `orbit` | no | **yes** | |
| `crane` | no | **yes** | low |
| `fpv` | no | **yes** | |

`pan-left` and `tilt-down` are the mirrors of the tested `pan-right` and
`tilt-up`. `crane` and `fpv` drop the sheet on the same evidence as orbit
(crane failed with it); neither was re-tested without it.

The words go **first** in the shot: `CAMERA MOVE: <words>; the move is the
camera's, not the person's.` (`static`: `CAMERA: <words>.`) -- the wording
the retry clips were made with.

**Speaking shots** (a performed scene, the Veo presenter) take only the five
gentle moves; lip sync and the face do not hold through the others. A
performed scene that names none gets its **setting's** move (selfie,
doing, second-camera: handheld; sit-down, car, podcast, outdoor-sit:
static; walk-talk: tracking); no setting, no move -- the shot alone, as
before. The settings' shot words are unchanged.

**The multi-take Veo presenter** is always `static` (any move shows the
stitch); a single take is `push-in`. Both come from the list.

**Refused, not swapped:** a move a shot cannot take is an error where it is
asked for (`update` storyboard `shot_move`, `cast` `move`, Studio). The
board enforcer drops an unknown move, or an unsafe one on a film a person
carries, and logs it. A move resolved at make time from a stale board falls
back to the setting's and says so (`move_note`).

## 3. Where it is read

| Builder | What changed |
|---|---|
| `framePrompt` (`scene-performance.ts`) | the fixed sentence became the camera's `frame` words; the move's start framing goes before it |
| `speakingPrompt` / `silentPrompt` (`seedance.ts`) | take `{ move, camera, sheet }`: the move first, the camera's `video` words last; `silentPrompt`'s "cinematic" became the camera's words |
| `sceneCamera` (`scene-performance.ts`) | a performed scene's camera and move (its `shot_move`, else its setting's) |
| `startActorClip` | `move` + `camera` per clip, kept on the clip; orbit / crane / fpv send no sheet |
| `runPerformance` | the draft's inputs include the camera and the move, so a changed one is a new draft |
| `gen_video` (pipeline) | `[move words] [writer's shot] [camera words]`; the writer is told to put the move in `shot_move`, never in the prose |
| `generateVideoPresenter` (`video-gen.ts`) | `cameraNote` reads the list |
| board save (pipeline) | `shot_move` carried like `shot` |

## 4. Surfaces

- **MCP:** `create` / `update` / `generate` `film_camera`; `update`
  storyboard `scenes[].shot_move`; `cast` `move` (start_frame, perform_scene,
  actor_clip) and `camera` (actor_clip); `list target:"vocabulary"`.
- **Studio:** the performer panel's shot step has a Camera row (the film's
  camera, the scene's move -- gentle moves only, the setting's named as the
  default); the "Extra shots" form picks a clip's move and camera.
- **Saved data:** no converter. Both fields are optional; absent reads as
  the default (cinema; the setting's move).

## Not built (open)

1. **Stock b-roll** does not lean toward the film camera (it might find
   worse clips).
2. **Speed** (slow / medium / fast) -- every move is slow.
3. **Per-setting allowed moves** -- only the speaking rule is enforced.
4. **A motion check** on a draft (ffmpeg global motion: static ~ none,
   push-in scale up) to catch a phrase that stops working.
5. **A speaking-shot test** of the gentle moves under lip sync -- the clips
   above were silent. They are the moves that worked best, so it did not
   block the build.
