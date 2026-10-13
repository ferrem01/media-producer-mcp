# SPEC-shot-camera.md -- what a generated shot was "shot on", and how its camera moves

Status: proposed 2026-10-13. Not built. Companion docs: `SPEC-creator-formats.md`
(the setting, the printable vocabulary), `SPEC-cast-scenes.md` (the performer
plan), `SPEC-creative-axes.md` (the film's axes), `SPEC-motion-architecture.md`
(the motion-graphics camera -- a different thing, see Naming).

## Why

Two creator tips (trypromptwise reels, Sep 21 and Sep 25) say the same thing
about AI video: **name the camera**. Naming a camera body or format ("shot on
an iPhone front camera", "16mm film") brings its whole look: grain, color,
depth of field, how real it feels. Naming one camera move ("slow dolly
push-in") gets a shot that is directed, not a drifting one. Seedance and Veo
both follow these phrases. Loose prose they follow badly.

Today we do neither on purpose:

- Every start frame gets the same sentence (`framePrompt`,
  `src/core/scene-performance.ts`): "Shot on a cinema camera with a 35-50mm
  lens ...". So every generated person looks like the same polished
  commercial, even in a creator-cut made for TikTok, where polish reads as an
  ad.
- The Seedance shot is free text (`speakingPrompt` / `silentPrompt`,
  `src/core/seedance.ts`). The default (`DEFAULT_SHOT`) and the eight
  settings (`performer-settings.ts`) give a framing but almost never a move.
  B-roll gets "cinematic" and nothing else.
- `gen_video` (Veo b-roll) is told to write "subject, action, camera move,
  light" in prose (`storyboard-builder.ts`). The move is whatever the writer
  thought of, sometimes two or three at once.
- The Veo presenter (`generateVideoPresenter`, `src/media/video-gen.ts`)
  locks the camera on multi-take speeches. That is right, and it stays.

## The two concepts

| Concept | Level | What it answers | Where it lives |
|---|---|---|---|
| **Film camera** | film | What was this film shot on? | `treatment.filmCamera`, `generate film_camera`, recipe `film_camera` |
| **Shot move** | shot | How does the camera move in this one generated shot? | `storyboard.scenes[i].shot_move` |

Both are closed lists in code (`src/core/shot-camera.ts`). Both print with
`list target:"vocabulary"` next to grammar, recipe, setting and proof use.
Each entry carries the exact tested phrase sent to the model. The writer
picks an id and never writes the phrase.

**What they touch:** only GENERATED pictures. That means start frames
(GPT Image), AI stills (`hero_image`), Seedance performances, Veo b-roll
(`gen_video`) and the Veo presenter. A real recording, stock footage and
motion graphics are not touched.

### Naming

`camera_moves` already exists. It is the GSAP scene camera (punch-in, pan
across the canvas) on a motion-graphics scene (`scene-generator.ts`,
`/api/camera-moves`). This spec does not touch it. The new words are
`film_camera` and `shot_move` so the two never meet in a schema, a prompt
or a Studio label. `look` is taken too (HeyGen looks, `/api/take-look`).

## 1. Film camera (one per film)

**One camera per film.** Mixing an iPhone shot with an Alexa shot in one
film reads as stitched-together stock. This is the same discipline as the
one-camera rule in `SPEC-motion-architecture.md`.

| id | Name | Frame phrase (stills and start frames) | Video phrase (Seedance and Veo) | On a person? |
|---|---|---|---|---|
| `cinema` | Cinema | Shot on an ARRI Alexa with a 35-50mm prime lens, true-to-life skin with pores and natural imperfections, motivated natural light, subtle film grain | Shot on an ARRI Alexa, natural motivated light, subtle film grain, true-to-life skin | yes |
| `anamorphic` | Cinema anamorphic | Shot on an ARRI Alexa with anamorphic lenses, 2.39 look inside the frame, oval bokeh, soft horizontal flares, shallow depth of field | Anamorphic cinema lens, oval bokeh, gentle horizontal flares, shallow depth of field | yes |
| `phone-front` | Phone, front camera | A real iPhone front-camera photo: wide 24mm selfie perspective, slight lens distortion near the edges, phone HDR, everything fairly sharp, natural window light, unretouched | Filmed on an iPhone front camera held by the person, phone video look, wide selfie lens, natural light, no cinematic grading | yes |
| `phone-back` | Phone, back camera | A real iPhone main-camera photo: 26mm, natural phone color, mild portrait-mode background blur, unretouched | Filmed on an iPhone main camera, natural phone color and exposure | yes |
| `documentary` | Documentary | Shot on a Sony FX3 documentary camera, available light, slightly underexposed shadows, real location, no styling | Documentary footage on a Sony FX3, available light, observational | yes |
| `film-16mm` | 16mm film | Shot on 16mm film (Kodak Vision3), visible grain, soft halation on highlights, slightly lifted blacks, warm color | 16mm film footage, visible grain, halation, gate weave | yes |
| `film-35mm` | 35mm film | Shot on 35mm film (Kodak Portra), fine grain, rich skin tones, gentle highlight rolloff | 35mm film footage, fine grain, rich natural color | yes |
| `action-cam` | Action camera | GoPro photo: ultra-wide fisheye perspective, deep focus, punchy color | GoPro footage, ultra-wide fisheye, deep focus, immersive | inserts only |
| `camcorder` | Home camcorder | A frame from a 2000s MiniDV camcorder: soft detail, video noise, blown highlights, timestamp-free | MiniDV camcorder home video, interlaced softness, video noise, auto exposure | inserts only |
| `disposable` | Disposable flash | A disposable-camera photo: direct on-camera flash, dark falloff behind the subject, warm grain | (stills only) | inserts only |
| `drone` | Drone | Aerial photo from a DJI drone, high vantage, wide | Aerial DJI drone footage, smooth and stable | inserts only (no person) |

**"Inserts only"** means a b-roll or `hero_image` beat, never a speaking
shot of the presenter. A GoPro or camcorder face breaks the identity the
model sheet holds, and the lip sync with it.

**Per-scene override:** a scene MAY name a different `film_camera`, but only
on an insert (a silent shot, a `gen_video`, a `hero_image`). The performer's
camera never changes within a film. The board enforcer clears an override
on a speaking scene and logs it.

### How the director picks it

Inferred from grammar and frame, echoed as `filmCamera`, pinnable like
every other axis (`generate film_camera`, a recipe's `film_camera`):

| Grammar | 9x16 / 4x5 / 1x1 | 16x9 |
|---|---|---|
| `creator-cut`, `speaker` | `phone-front` | `documentary` |
| `launch-film` | `cinema` | `anamorphic` |
| `tempo-cut`, `hype-cut` | `phone-back` | `cinema` |
| `editorial` | `film-35mm` | `film-35mm` |
| everything else | `cinema` | `cinema` |

The brief wins when it names a look ("shot like an old home video" ->
`camcorder` on inserts, the performer stays on the inferred camera).

## 2. Shot move (one per generated shot)

**One move per shot.** These models fall apart when moves are stacked.
Each move has a speed (`slow` default | `medium` | `fast`) and, where it
needs one, a direction.

| id | Phrase sent (slow) | Direction | Speaking-safe | Start-frame hint |
|---|---|---|---|---|
| `static` | Locked-off static camera on a tripod: no zoom, no push-in, no camera movement, constant framing | -- | yes | as framed |
| `push-in` | Slow dolly push-in toward the subject, smooth, ending a little tighter | -- | yes | a touch wider than the shot asks |
| `pull-out` | Slow dolly pull-out away from the subject, revealing more of the place | -- | yes | a touch tighter than the shot asks |
| `handheld` | Subtle handheld camera: gentle natural sway and micro-movements, never shaky | -- | yes | as framed |
| `tracking` | The camera tracks with the subject at a constant distance as they move | `back` (leading, they walk toward it) `side` | yes, only with `walk-talk` | as framed |
| `pan` | Slow smooth pan across the scene | `left` `right` | no | the pan's start side |
| `tilt` | Slow smooth tilt | `up` `down` | no | the tilt's start |
| `orbit` | The camera orbits slowly around the subject, keeping them centered | `left` `right` | no | as framed |
| `crane` | Smooth crane move, rising (or descending) over the scene | `up` `down` | no | low / high vantage |
| `rack-focus` | Rack focus from the foreground object to the subject behind it | -- | no (needs a foreground object named in the shot) | the foreground object sharp |
| `dolly-zoom` | Dolly zoom (vertigo effect): the subject stays the same size while the background stretches | -- | no | as framed |
| `fpv` | Fast FPV drone flight through the space | -- | no (insert, no person) | as framed |

`whip-pan` is NOT in the list. It is a transition between two shots, and
one generated clip cannot make one. The edit makes it (a cut with a motion
blur), as it already does.

**Speaking-safe:** a speaking Seedance shot or a Veo presenter shot
accepts only `static`, `push-in`, `pull-out`, `handheld`, and `tracking`
with `walk-talk`, all at `slow`. Anything else breaks lip sync and the face.
The enforcer moves an unsafe pick to the setting's default, below, and logs
it.

**Multi-take Veo presenter:** always `static`, whatever is asked. The takes
are stitched, and any move shows the seam. This is today's `cameraNote`,
now read from the list.

### The setting gives the default move

The setting already says where the phone is. The move follows from it when
none is named. Each setting also lists the moves it can hold, and a pick
outside them falls back to the default:

| Setting | Default | Allowed |
|---|---|---|
| `selfie` | `handheld` | handheld, push-in |
| `sit-down` | `static` | static, push-in, pull-out |
| `walk-talk` | `tracking` (back) | tracking, handheld |
| `car` | `static` | static, handheld |
| `podcast` | `static` | static, push-in |
| `outdoor-sit` | `static` | static, push-in, pull-out |
| `doing` | `handheld` | handheld, static, push-in |
| `second-camera` | `handheld` | handheld, static, pull-out |
| (no setting) | `push-in` | the speaking-safe moves |

The settings' `shot` text keeps the framing and the place. Any camera
movement wording in it ("handheld", "a gentle natural bounce") moves into
the default move, so the shot and the move never say two things.

## 3. Where the phrases go

Prompt order for every generated shot: **references -> shot (framing,
place, action) -> move -> camera -> constraints**.

| Builder | Change |
|---|---|
| `framePrompt` (`scene-performance.ts`) | The fixed "cinema camera" sentence is DELETED. It becomes the film camera's frame phrase, plus the move's start-frame hint. The anti-AI-skin clause stays for every camera that shows a person. |
| `speakingPrompt` / `silentPrompt` (`seedance.ts`) | They take `{ shot, move, camera }`. They add "Camera: <move phrase>. <video phrase>." `silentPrompt`'s "cinematic" is DELETED (the camera says it). |
| `defaultPrompts` | Passes them through. A scene's hand-written `frame_prompt` / `video_prompt` still wins untouched. |
| `generateVideoPresenter` (`video-gen.ts`) | `cameraNote` is DELETED. Multi-take reads `static`; single-take reads the scene's move (default `push-in`). The camera's video phrase is added. |
| `gen_video` (pipeline) | The builder writes subject, action and light in `gen_video`, and the move in `shot_move`. The pipeline appends the phrases. The builder guidance line ("subject, action, camera move, light") is rewritten to say so. |
| `hero_image` | Gets the film camera's frame phrase, so the film's stills match its footage. |
| Locations (`locations.ts`) | Untouched. A location plate is shared across films, so it stays neutral. The camera is applied in the frame drawn from it. |
| Stock (`broll_query`) | Untouched in v1. See Open questions. |

## 4. Surfaces

- **MCP:** `generate film_camera` (pin), `update` a scene's `shot_move`.
  Both lists in `list target:"vocabulary"`. One line in the MegaMedia server
  instructions next to the other axes.
- **Studio:** the film's camera in the film header (one picker, inferred
  value shown). The move in the scene's performer panel and on a
  `gen_video` beat (a picker, plus direction and speed when the move takes
  them). Unsafe moves are greyed on a speaking scene, with the reason.
- **Board:** the storyboard builder emits `shot_move` on every scene with a
  generated shot. The board enforcer (`board-enforce.ts`) applies the
  rules: one camera, speaking-safe moves, setting-allowed moves.

Saved data needs no converter. Both fields are optional, and an absent
field resolves to the defaults above. A changed camera or move drops the
scene's picked start frame and draft, like a changed location does today.

## 5. Proving it (cheap to expensive; nothing paid without Marc's go)

1. **Stills, every camera (cheap, GPT Image only).** One cast actor, one
   location, the `sit-down` setting, drawn once per camera. Output: a
   contact sheet for Marc. A camera whose frames don't look different from
   `cinema`, or that breaks the face, is cut or rephrased before any video.
2. **Seedance 480p drafts, speaking-safe moves (paid).** The same actor and
   line, one draft per speaking-safe move, on the two default cameras
   (`phone-front`, `cinema`). Keep only the moves the model actually obeys.
3. **Seedance and Veo, insert moves (paid).** One silent draft per
   non-speaking move. Same rule: a move it ignores comes off the list.
4. **A check, not a gate (later).** Measure global motion between a
   draft's first and last frames (ffmpeg): `static` ~ none, `push-in`
   scale up, `pull-out` scale down, `pan` horizontal drift. Logged on the
   draft, so a phrase that stops working shows up. It becomes a gate only
   if it proves reliable.

The phrases in the tables are the starting set. Steps 1-3 rewrite them,
and the code's list is whatever survived.

## 6. Clean-up in the same PR

- The fixed cinema sentence in `framePrompt`, "cinematic" in
  `silentPrompt`, and `cameraNote` in `generateVideoPresenter` go. Their
  jobs move to the lists.
- Movement words come out of `PERFORMER_SETTINGS[].shot` and
  `DEFAULT_SHOT` (into the default move).
- The `gen_video` guidance line in `storyboard-builder.ts` is rewritten.
- Docs: `SPEC-creator-formats.md` (the vocabulary table gains the two
  rows), `CLAUDE.md` (pointer), `AMENDMENTS.md` (the entry and the
  stills/drafts results).

## Open questions for Marc

1. **Names.** `film_camera` and `shot_move`, to keep clear of the GSAP
   `camera_moves`. OK?
2. **Stock b-roll.** Should a `broll_query` lean toward the film camera
   ("handheld phone footage of ..." for `phone-front`)? It could make stock
   match better, or it could just find worse clips.
3. **Speed.** Is `slow` the right default for everything, or should a
   punchy `visual_system.motion` move the default to `medium`?
4. **The real booth.** Should the booth guidance quote the move ("hold
   still on a stand" vs "walk slowly toward it")? That already happens
   through the setting, so v1 leaves the booth alone.
