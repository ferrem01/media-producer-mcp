# SPEC: Cast scenes -- who performs each scene, how, and where

Status: AGREED (2026-10-04, Marc + Claude). Builds on the scene performances
shipped 2026-10-04 (`core/scene-performance.ts`, `core/seedance.ts`, PRs
#1089-#1099) and the Cast (`core/cast.ts`, `core/recast.ts`,
`core/generated-take.ts`). Running log of what was measured: `AMENDMENTS.md`.

## What we learned (Oct 4, proj_566ccd05: seven scenes of Dana)

1. **Seedance redraws everything in every shot** -- the person, the room, the
   framing. Only references hold steady: the start frame and the character
   sheet hold the face; nothing held the room until the room reference.
2. **A room reference keeps the room.** Scenes 6-7 remade with scene 1's frame
   as the room matched scene 1; the chained originals had lost the painting,
   changed the shelves and crept closer.
3. **Chaining start frames compounds drift.** A scene started from the last
   frame of the one before inherits its small redraw; seven scenes add up.
   Anchor scenes to a fixed image; chain only where the join must be seamless.
4. **The voice follows its input.** Seedance copies pitch, timing and wording
   of the reference audio faithfully. Quality is decided before Seedance: the
   v4 scripted delivery (tags, "..." pauses, CAPITALS, /IPA/) or a recording
   spoken in the usual voice. Pitch-shifting failed twice (a chipmunk; garbled
   words) and is gone. The pitch check stops a voice >10% off before paying.
5. **Laying our own voice file over the video breaks lip sync**: Seedance
   re-performs the line. Its own audio is the sound.

## Two functions, three choices

Every person-carried scene answers one question first: **who performs it?**

| Who | How | Engines (best first) | Where |
|---|---|---|---|
| **Me** | Record | -- (the booth) | my room |
| **A cast member** | **Recast** my recording | Genjutsu, Kling (one-to-one); HeyGen (hears the voice, draws its own movement) | my room (Genjutsu can take a setting image: optional) |
| **A cast member** | **Generate** (no recording) | **Seedance** for generated people and portraits; **HeyGen** for HeyGen looks | Seedance: a **Location**. HeyGen: the **Look** (a look IS a setting; a new one is made from a prompt) |

The actor decides the engines that make sense; the UI shows only those, best
one preselected. Kling/Runway portrait animation from a voice exists but is
hidden (weaker).

## The libraries (per tenant)

- **Cast** (exists): HeyGen looks; real portraits (consent); generated people
  (`fictional`, model `sheet`, start-frame portrait, ElevenLabs `voice_id`).
- **Locations** (new, `core/locations.ts`): `{ id, name, image, prompt?,
  created_at }` in `<tenant>/locations/`. The image is a **clean plate** -- the
  set with nobody in it -- so it pins the room, not a pose. Made three ways:
  drawn from a prompt (GPT Image), cleaned from a frame (GPT Image edit: "the
  same room with nobody in it"), or uploaded.

## The plan lives on each scene

Revised Oct 5 (Marc): every scene can be someone else, so **the film holds no
plan**. Each scene's own `storyboard.scenes[i].performer = { actor (null = me),
how: record | recast | generate, engine?, location? }`; nothing set = read off
what the scene already plays (its performance, else its recast), else me. (The
first build carried a film-wide `storyboard.cast_plan`; a film that still has
one reads it as each scene's default until its next plan edit copies it onto
the scenes and drops it.) `storyboard.scenes[i].performance` carries the
execution and results: `shot`, `voice_source`, `delivery`, prompts, `frames` /
`frame`, `voice_preview` (the read heard -- what Seedance is sent while it
still matches), `draft`, `final`, `made_with`, `status`, `stage`, `error`.

Each scene's **state** is derived: ready (its take answers its plan), todo,
stale (made for another plan). Nothing is ever remade by itself.

## The flow: storyboard -> build -> make each scene -> finals -> render

1. **Storyboard.** Each scene's performer (later: drafted from the brief).
2. **Build**: graphics, captions, layout; scenes planned as Generate are voiced
   in the actor's voice (the read their take will be made to). No video spend.
   A build keeps every scene's plan, performance and b-roll.
3. **Make each scene** (explicit, paid, one scene at a time -- no "make all"):
   the take dialog or the scene's storyboard -> Generate -> Make the draft (its
   cost shown) -> a progress screen (each step, a percentage, the vendor's word)
   -> the draft plays right there -> Make the 1080p final.
4. **Render** the film (only on request).

## Surfaces

- **Studio**: a scene's take dialog (click its slot) and its storyboard both
  offer Record here / On your phone / Across the room / Upload a file / Recast
  my recording / Generate. Generate: Who (grouped: generated people, HeyGen
  looks, photos) -> With follows from who (a look: HeyGen; anyone else:
  Seedance) -> Where (a location) -> the shot -> voice and delivery with Hear ->
  Make the draft / final -> extra shots (silent b-roll of the actor over the
  line). The first frame is drawn by itself. Nothing about performers in the
  scene list. **Cast** and **Locations** are tenant pages in the rail.
- **MCP**: `update` storyboard `scenes[].performer` (one scene) or `cast_plan`
  (written onto every scene); `cast` actions `scenes`, `hear_voice`,
  `perform_scene`, `revoice`, `restore`, `scene_cast`, `actor_clip`,
  `scene_location`, `recast` with `scenes`, `locations` / `add_location` /
  `remove_location`.
- **API**: `/api/scene-performance/{t}/{p}[/{si}]`, `/api/locations/{t}[/{id}]`.

## Phases

- **A. Locations**: library, clean plates, a scene's location (frames drawn in
  it, sent as the room reference), API, MCP, Studio picker.
- **B. The plan**: per scene (`scenes[i].performer`), `how`/`engine`/`location`,
  `update` edits, stale states. (The film-wide default was removed Oct 5.)
- **C. Perform all / finals all** -- built Oct 4, DELETED Oct 5 (Marc: no "make
  all"; each scene is made on purpose).
- **D. HeyGen generate per scene** (engine `heygen`); the whole-film
  generated take becomes "generate on every scene".
- **E. Studio flow**: the decision tree, Locations tab, board line.
- Later: the board filling the plan from the brief (storyboard builder), bridge
  clips (first+last frame, silent) for a walk between rooms.
