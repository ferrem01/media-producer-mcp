# SPEC: The take flow -- needs, takes, word anchors, the board in your hand

Status: AGREED (2026-09-15, Marc + Claude). Builds on `SPEC-format-and-spine.md`
(asserted vs measured spine) and the `/take` page (PR #755, #758).

## What this fixes

Measured on the first live run (`proj_c210e5e1`): the take is a dead end. It
uploads, sanitizes, and attaches -- and nothing knows. The project stays in
`storyboard`, the agent finds out only by polling, overlays stay timed to the
script's ESTIMATE, and the agent had to hand-build the `/take` URL. Re-timing
to the spoken delivery was done by hand twice.

## The model

**A speaker film declares NEEDS.** The storyboard already has the concept: each
scene carries `assets[]` with `status: needed | provided`. A speaker board emits
one `camera_video` need per scene that has `voiceover_text`, with
`recording_instructions` = the script. Nothing new to invent; the take page
and Studio become the fulfilment UI for a need that already existed.

**A take fulfils a need, per scene.** `POST /api/take` gains `scene_id`. The
take becomes that scene's clip in `speaker_track.clips` (ordered by scene;
the base builder already concatenates) and is recorded in `project.takes[]`
(`{id, scene_id, source, recorded_at, duration, capture, loudness, ...}`).
A new take for the same scene REPLACES its clip. `project.take` (singular) is
retired. Every path that attaches a speaker file -- the page, the `add` tool,
`update({speaker_track})` -- runs the sanitizer (bake orientation, reframe to
the canvas, dialogue loudness).

**The agent requests a take with one call and waits on a job.** `take` tool
(new): `take(project_id, scene_id?)` returns the Studio link to hand the human
and a `job_id`. The job (type `take`) completes when the take attaches; its
result carries the take URL, dimensions, duration, loudness, and the re-timed
scene. Same async contract as `generate` and `render`: poll `job`. The
storyboard job's completion carries `studio_url` too, so the agent hands over
one link, once.

**Arrival re-times the film (the measured spine).** On attach the server
transcribes the take (whisper, word times), sets the scene's
`duration_seconds` to the take's length, and resolves every WORD ANCHOR in the
scene against the transcript. Then it marks the need `provided`.

**Word anchors.** A component time field may be authored as an anchor instead
of a number: `{ "word": "dashboard", "offset": 0.3 }` (optional `occurrence`
for repeated words, `edge: "start" | "end"` -- default start). Stored on the
component as `anchors: { "<field path>": Anchor }`; the numeric field always
holds the RESOLVED value so every renderer stays numeric and dumb. Two
resolvers, one function: asserted (script words at ~2.4 wps, at build time)
and measured (the transcript, at attach). The speaker recipe authors anchors
when it lays out a speaker scene; `reel-caption-lane` phrases anchor
`start`/`end` to their own first/last word. Hand edits in Studio that set a
number clear that field's anchor.

**Build order is free.** Create before the take: the film builds against the
asserted spine over a slate base ("awaiting take"), Studio can be reviewed,
and arrival swaps the base and re-times. Create after: the same code path,
different order. Replacing a take after build is the same again: the scene's
clip swaps, its times re-resolve, the render cache sees a changed scene.

**The board in your hand.** `/studio` opened on a phone shows the BOARD VIEW:
one card per scene -- script, status, Record / Upload where a need is open,
the current preview to play. Record opens the booth for that scene. "Record
all" runs the prompter through every scene with breaks; the transcript cuts
the take per scene by each scene's first word. The desktop Studio is
untouched. One link goes around: the Studio link.

**Not in this spec.** Auto-build-on-arrival (opt-in later, once needs and
jobs exist), a project- or need-scoped token for handing a link to someone
who is not the tenant (design it in when a second human records), final-mix
loudness.

## Phases (each a PR, merged and live before the next)

1. **Needs, takes, the take job.** `camera_video` needs on speaker boards;
   `takes[]` + per-scene clips; `/api/take` with `scene_id`; sanitizer on every
   speaker attach; `take` tool + `take` job; `studio_url` on storyboard job
   completion; `/take?scene=`.
2. **Word anchors + measured spine.** Anchor model + resolver; speaker recipe
   and caption lane author anchors; transcribe-and-retime on attach; need ->
   provided; scene duration from the take.
3. **The board view.** `/studio` on a phone -> board; per-scene Record /
   Upload; Record all with per-scene cuts; slate base for create-before-take.

## Exit test

Board for a two-scene speaker film -> agent calls `take` and hands over the
Studio link -> phone shows two cards -> record scene 1, then scene 2 (or
Record all) -> the take job completes with the re-timed scenes -> `generate
mode:'full'` + `render` with no hand edits -> overlays land on the spoken
words. Then re-record scene 2 from the phone; only scene 2 re-renders.
