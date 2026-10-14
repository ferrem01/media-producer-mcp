# SPEC: A real person -- an avatar built from your own recordings

Status: AGREED (2026-10-14, Marc + Claude); phases 1 (the foundation) and 2 (performing from it, looks) BUILT. Builds on the Cast
(`core/cast.ts`, `cast-page.ts`), the scene performances
(`core/scene-performance.ts`, `core/seedance.ts`, SPEC-cast-scenes.md) and
the take page (`take-page.ts`). Replaces the real-person half of "a sheet
from photos" (SPEC-cast-scenes.md).

## Why: two kinds of actor that are not the same thing

The Cast treats every portrait actor alike: a portrait, maybe photos, a
model sheet drawn from them, and for every scene a start frame drawn by GPT
Image that Seedance animates. That is right for a **generated person**
(Dana): nobody knows the original, the drawing *is* the person. It is wrong
for a **real person** (Marc): people know the original, and every drawn
image between his real face and the take moves him away from it.

Marc, Oct 14: "There is an AI avatar with model sheet and then there is a
real person. They are kind of not the same thing."

| | Generated person | Real person |
|---|---|---|
| The source | A portrait + a drawn model sheet | **Recordings of the person** |
| A scene is made from | A drawn start frame, animated | The recordings as references; **no start frame** |
| What makes it good | The drawing | **Shooting the reference well** |

## What we learned (Oct 10-14, proj_0b19db0e scene 3, Higgsfield tests)

Same line, same room (the "Taupe studio desk" location), same recorded
voice; only the references changed.

1. **A drawn start frame wins over real photos.** Seedance treats it as the
   truth (the video starts on that exact picture), so the drawn face holds
   and real photos beside it only nudge it. Every take with a drawn frame
   read as "a drawing" (Marc: "I look like a drawing is the problem").
2. **No start frame + real photos looks real** -- skin, stubble, a lav mic
   it added on its own -- and it still lands the framing from the prompt
   and the room reference (medium-wide, camera locked). But the likeness
   drifted: phone selfies are close, flat and daylit, so it guessed what he
   looks like at three meters in low light (broader face, darker hair,
   narrow eyes, "greasy", "my hair looks like a loaf").
3. **A real recording as a VIDEO reference is the big step.** His 15 s scene
   take (4K, seated, at about the target distance) as `reference_videos`,
   plus three photos for the hair (he wore a cap): the most him of any
   test -- grey salt-and-pepper hair, his expressions, his hand gestures.
   Marc: "both videos look really really real."
4. **A close-up still among the references pulls the shot in.** With a
   tight crop of his face added, the take came out as a medium close-up;
   without it, it held the medium-wide. Stills must be shot at (or framed
   like) the distance we want, or be clearly labelled as identity only.
5. **The take copies the reference's flaws faithfully.** The reference was
   lit from above on a hot day: under-eye bags, lines, shine. Asking for
   "flattering studio light, lightly retouched" changed almost nothing.
   The light in the reference recording IS the light on his face in every
   scene. (Marc: "my biggest complaint is that I look like shit.")
6. **Seedance's output is the softness ceiling.** ~3 Mbps at 1080p (the
   "high bitrate" option on Higgsfield did not move it): banding in smooth
   walls, blockiness in faces. A Topaz upscale (2160p) was the crispest
   result; it sharpens what is there, it does not fix the face.

So the quality is decided **before** Seedance, by the reference recording --
the same lesson as the voice (SPEC-cast-scenes.md, "the voice follows its
input").

## The flow: Cast -> "A real person" -> record your foundation

The Cast page's "A real person" tab becomes a guided creation, not a photo
upload. It tells the person, plainly, that **these recordings are the
foundation of the avatar**: everything it will ever look like comes from
them.

1. **Name + consent.** "This is me, or a person who agreed to be cast"
   (required, as today).
2. **Set up** -- one screen, a checklist with a picture of the setup:
   - Sit at a table or in a chair; the phone on a tripod or a shelf at
     seated eye level.
   - **Light your face from the front-side** (a window or a lamp beside the
     phone), never from above. The room otherwise dim is fine.
   - A plain dark top; no cap or hat; glasses only if you always wear them.
   - Take the shine off (a little powder, or a splash of cold water).
   - Quiet room; the phone's own mic is fine (the voice is recorded
     separately per scene).
3. **Record three clips**, one after another, on the phone. Each has its
   own screen with what to do, a framing guide drawn over the camera, and a
   countdown:
   - **Far, 60-90 s** -- the phone about three meters back, you seated,
     framed from the knees up. Talk to the lens about anything (a prompt
     card offers easy topics: "what you're working on", "your morning").
     *How you look and move at the shot's distance.*
   - **Close, 30 s** -- the phone about one meter away, chest up, same
     light. Talk again. *The detail: eyes, skin, the true spacing of your
     features.*
   - **Turn, 10 s** -- from the close position, look slowly from your left,
     to the lens, to your right, and back. *Profile and three-quarter views.*
4. **Check** -- the page shows what the avatar is built from: the far clip,
   and the stills pulled from the close and turn clips (front, three-quarter
   left, three-quarter right). Re-record any clip that is off (too dark, cap
   on, cut off) -- each clip is replaceable on its own.
5. **Try it** (not built yet) -- one short sample performance (a fixed ~6 s line in the
   tenant's default location, 480p draft) so the person sees the avatar
   before using it in a film. Optional, one button.

Recorded on the phone on the **foundation page** (`/foundation?tenant=&actor=`,
`src/foundation-page.ts`): the desktop Cast page shows a QR code that opens
it (`/api/take-qr/{t}/-?actor=`), as a scene's take does today, or the clips
can be **uploaded** (filmed with any camera). Its own page, not a mode of
the take page: the take page is a film's booth (a project, a script on a
prompter, a take to attach); a foundation belongs to a person and has no
film and no script. It reuses the take page's light check.
Recording again later replaces the foundation; scenes already made keep
their takes.

The **portrait** (the Cast card, HeyGen and the other vendors) becomes the
front still from the close clip -- no separate photo upload.

## The data

On the actor (`CastActor`, `cast.json`):

```ts
foundation?: {
  clips: { kind: "far" | "close" | "turn"; file: string; seconds: number; recorded_at: string }[];
  /** Pulled once from the clips when they land (ffmpeg, no model). */
  stills: { kind: "front" | "left" | "right"; file: string }[];
  /** The <=15 s segment of the far clip sent to Seedance (its reference
   *  video limit): speech, face visible, the least motion blur. */
  ref_video: string;
  made_at: string;
};
```

A real person is `consent` + `foundation`. A consent actor without a
`foundation` (today's Marc) keeps working on today's path until recorded,
with a note on its card and on the scene's Seedance panel: "Record your
foundation for a more real you."

## Performing a scene as a real person

`perform_scene` with Seedance, for an actor with a complete `foundation`:

- **No start frame.** `start_frame`, `pick_frame` and `continue_from` do
  not apply (the panel hides them; the tool says so). The shot text and the
  location carry the framing.
- **References** (Atlas `reference-to-video`, which already takes
  `reference_videos`, see `core/actor-test.ts`):
  `@Image1-3` the stills (identity), `@Image4` the location's clean plate
  (the room AND the framing), `@Video1` the reference segment (who he is and
  how he moves), `@Audio1` the scene's voice.
- **The prompt** leads with the framing (finding 4), says what the video is
  for and what not to copy ("only for who he is and how he moves; not its
  room, chair, clothes or light"), then wardrobe, light, the locked camera,
  the voice. A `realPersonPrompt(shot, cam)` beside `speakingPrompt` in
  `seedance.ts`; the scene's `video_prompt` override still wins.
- **Draft then final** as today (480p draft, `draft-complete` to 1080p).
- **Continuity across scenes** comes from the same references in every
  scene; there is no shared start frame to chain.
- Voice sources are unchanged (script / take / recording), and so is
  `fitVoiceToClip`.

## Looks: what the person wears

Marc, Oct 14: "would be great to specify clothes and looks." The tests
showed Seedance dresses the person as the prompt says, whatever he wore in
the references (his polo became a black overshirt with no trouble). So the
foundation is recorded once, and clothes are words.

- A real person has **looks**: `looks: { id, name, wardrobe, glasses?: boolean }[]`
  on the actor -- e.g. "Founder" (*a plain black overshirt over a dark
  t-shirt, dark trousers*), "Keynote" (*a navy suit, white open-collar
  shirt, no tie*), "Weekend" (*a grey crew-neck sweater, jeans*). One is the
  **default**; the guided flow ends by asking for it (three suggestions to
  tap, or type your own).
- A scene picks a look (`performer.look`, the scene's plan), else the
  actor's default. The Seedance panel picks it (saved on the plan);
  `perform_scene` takes `look`; the storyboard's `performer.look` sets it.
  (A film-wide default look is not built.)
- The look's wardrobe goes into the prompt; the references stay the same.
  Changing a scene's look makes its take stale (another look, another
  take), like changing its location.
- What a look cannot do: change the face, the hair or the build (that is
  the foundation), or reliably add accessories the person never wears
  (glasses come and go badly -- the flag says only "wears glasses" or not).

## Finish: Topaz (phase 3, optional per take)

An "Enhance" action on a made take: a Topaz 2160p upscale, kept beside the
original (the take can switch back). Vendor and key are an open question
(Higgsfield's `upscale_video` proxies Topaz; a direct Topaz API is the
other option). Not part of making the take: it costs time and credits, and
it only sharpens.

## Surfaces

- **Cast page**: the "A real person" tab is the guided flow above. A real
  person's card shows "Foundation: recorded Oct 14" with Re-record and View.
- **Foundation page** (`/foundation`): the checklist, the three clip
  screens with the framing guide and the light check, a countdown and an
  auto-stop; each clip goes to `POST /api/cast/{t}/{actor}/foundation/{kind}`
  (raw bytes), and is served back at `GET .../foundation/{kind}`, its stills
  at `GET .../still/{front|left|right}`.
- **Studio, the scene's Seedance panel**: for a real person, no frame to
  draw or pick -- their foundation's stills, a line saying Seedance makes
  them from their own recording, and the look picker.
- **MCP `cast` tool**: `add_actor` with `real: true` (consent, no image)
  returns `foundation_url`; a `foundation` action reports which clips are in
  and the link; `perform_scene` reads the foundation (and takes `look`);
  `update_actor` takes `looks` / `default_look`; `start_frame` and
  `continue_from` refuse a real person.

## Clean up (done in phase 2)

- The **photos + sheet-from-photos** path is gone: the "Photos & sheet"
  panel, `add_photo` / `remove_photo` / `make_sheet` / `use_sheet` /
  `discard_sheet`, the photos / sheet-draft / model-sheet routes, the
  sheet-from-photos prompt and its tests. A generated person keeps its
  uploaded model sheet (that is what it is made of).
- Saved data: an actor's old `photos` / `sheet_draft` are read by nothing;
  their files go when the actor is removed. A consent actor made before the
  foundation (a portrait, maybe a sheet) still performs the old way -- a
  drawn start frame -- until they are made again as a real person.
- Higgsfield recasts take a second picture (`sheetFor` in
  `core/recast.ts`); for a real person it is their foundation's
  three-quarter still (the portrait is its front still).

## Phases (each a PR, merged and live before the next)

1. **Foundation** (BUILT): the data, the foundation page (three clips +
   upload), the stills and the reference segment pulled on arrival, the
   guided Cast flow, the card. No performance change yet.
2. **Perform from the foundation** (BUILT): the real-person Seedance path
   (stills + reference video + room + voice, no frame, `realPersonPrompt`),
   looks, the Studio panel and tool changes; the photos/sheet path deleted.
   The "Try it" sample performance on the Cast page is NOT built: it needs a
   film to perform in -- for now, try the avatar on a real scene.
3. **Enhance**: the Topaz finish on a take.

## Exit test

Marc records his foundation once (phone, at home, about ten minutes),
performs scene 3 of proj_0b19db0e at Profound's distance, and the take
looks like him -- recognisable to someone who knows him, no drawn look --
with nothing hand-run outside the platform.

## Decided (Oct 14)

- **Clothes and looks**: named looks per person, a default, a pick per
  scene (above). Phase 2.
- **The far clip's length**: Seedance takes at most 15 s of reference
  video, but the person records 60-90 s; the server picks the best 15 s and
  can re-pick without a re-record.
- **Retouch**: parked. Good front light in the foundation first (finding
  5); a beauty pass after the take only if that is not enough.
