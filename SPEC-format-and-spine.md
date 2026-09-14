# SPEC: Format and spine — separating what a film IS from where it SHIPS

Status: AGREED — design review (Marc + Claude session, 2026-09-14); Phase 1 built the same day. This is
the rule-4 review that `SPEC-creative-axes.md` demands before a fourth field
exists. It proposes one new axis (`frame` -- the word `format` already means the output TYPE, video|image|presentation, on the project and the create tool, so the axis takes the name the table below already gave it), the removal of one grammar value
(`social-reel`), the splitting of another (`speaker-screencast`), and names an
internal concept (`spine`) that the code already has but never made explicit.

Nothing here is built. Read `SPEC-creative-axes.md` first — this amends it.

## Why

A storyboard was generated for a 15-second Instagram ad whose brief said, four
separate ways, that a human would perform it to camera and that the board must
carry spoken lines readable off a teleprompter (`proj_ddca872c`, 2026-09-14).

Every one of its seven scenes came back with `voiceover_text: null`.

The grammar obeyed its own contract, which ends: *"NO VOICEOVER:
voiceover_text stays empty; the captions are the script."* No brief can
override that, so the failure is structural, not promptable.

The interesting part is the second-order finding. The board **choreographed to
a script it was forbidden to write**. From scene 1's visual notes:

> "...stacking messily tighter around his face beat by beat **as he lists the
> tools that don't agree**... **On the word 'Quotient' at the turn**, every
> chip gets YANKED off-frame... the card SETTLES softly **as Marc finishes his
> last line**."

It knows he lists tools, says "Quotient" at the turn, and has a last line. The
entire motion design is cued to spoken copy that exists nowhere in the board.
The grammar needs the script and has no field to hold it.

### The root cause is a mis-filed value

`social-reel`'s own first line, in `creative-director.ts`:

> `"social-reel": the vertical feed dialect (9:16, 15-30s TOTAL). **The FORMAT
> carries the film**`

Every other grammar answers *what carries the argument* with a content answer —
the product, the story, the words, the numbers, a person, one surface.
`social-reel` answers with the delivery surface. That is a different question
occupying the same slot.

Sorting its nine contract rules makes the scale of the mis-filing clear:

| Rule | Actually a consequence of |
| --- | --- |
| Vertical composition, top 12% / bottom 18% clear | the phone screen |
| Layout vocabulary CLOSED (TYPE CARD / STACK / HERO) | the phone screen — its stated reason is *"there is no width for it"* |
| SIDE-BY-SIDE IS BANNED | the phone screen |
| Landscape surfaces cropped, not shrunk | the phone screen |
| Evidence at phone scale; desktop shells banned | the phone screen |
| Hook ≤2s | the feed |
| Loop seam | the feed |
| 15–28s envelope | the feed |
| Captions ARE the voiceover; `voiceover_text` empty | **nothing — this is the bug** |
| Hard cuts on downbeats, 1.5–4s | the spine (see below) |

Seven of ten are format consequences. The two that are not are exactly the two
that broke: the narration rule blocked the script, the edit rule is a spine
claim wearing grammar clothes.

**Stated precisely: a format was smuggled into the grammar list, so choosing a
format costs you your grammar.** You want vertical, you must pick
`social-reel`; picking `social-reel` means you cannot pick `tempo-cut`,
`hype-cut`, `canvas-tour`, or a person. An Instagram ad that is all motion
graphics, half speaker, or one unbroken vertical traverse is not currently
expressible.

## Rule 3 test (the covenant's gate for a new field)

`SPEC-creative-axes.md` closes: *"Anticipated future FIELD: None beyond the
triad... If a fourth axis ever seems necessary, run rule 3's test and hold a
design review — the triad has held for a hundred years of cinema."*

Rule 3 requires **orthogonal to every existing axis AND operator-worthy**.

| Axis | Does `frame` overlap it? |
| --- | --- |
| RHYTHM (`film_grammar`) | No. Aspect ratio, duration envelope and platform safe areas say nothing about who narrates, what earns a cut, or music's role. |
| LOOK (`visual_system`) | No. Not the surface, the physics, the type voice, or a recurring motif. |
| SOUND (`audio_system`) | No. |

**Operator-worthy**: "make it for Instagram" is plausibly the single most
common pin a marketer would want, and today it is unsayable without also
surrendering the grammar.

On the century-of-cinema argument: the triad held because **cinema shipped to
one format at a time**. Aspect ratio was not a creative axis when every film
went to a theatre screen; it becomes one the moment the same film ships to a
feed, a phone, and a landing page in the same week. Film craft does carry this
axis — Academy, Scope, IMAX, 4:3 broadcast — and DPs compose for it.

And the decisive point for the anti-sprawl covenant: **the field count grows by
one, the concept count does not.** `social-reel` already encodes format. This
relocates a mis-filed value; it does not invent ambition.

## The model: four axes

| Axis | Field | Decides | Analog |
| --- | --- | --- | --- |
| RHYTHM | `film_grammar` | what carries the argument, what earns a cut | editing |
| LOOK | `visual_system` | surface, physics, type voice, motif | art direction |
| SOUND | `audio_system` | music personality, narration voice | sound design |
| **FRAME** | **`frame`** | **the canvas and the bands the platform occludes — geometry, nothing else** | **delivery format** |

Same contract as the other three: omitted → inferred; provided → pinned.

## Axis: `frame` — the geometry of the output surface, and nothing else

**A frame is a size.** It carries the canvas and the bands the platform
occludes. It carries no duration, no story shape, no editorial rule. If a
thing is not a number about the screen, it is not in the frame.

| Value | Canvas | Occluded bands | Typical home |
| --- | --- | --- | --- |
| `16x9` | 1920×1080 | none | default; embeds, landing pages, YouTube |
| `9x16` | 1080×1920 | top 12%, bottom 18% | Reels, TikTok, Shorts |
| `4x5` | 1080×1350 | none — the media is not overlaid | Instagram/LinkedIn feed |
| `1x1` | 1080×1080 | none | feed, ad units |

Platform names are a **lookup that resolves to a frame**, not values of their
own: "for Instagram Reels" → `9x16`; "for the LinkedIn feed" → `4x5`. The
system knows the mapping so the operator never types dimensions.

### What the frame decides

Layout, and only layout. Given the canvas and the occluded bands, the agent
stages the scene: what fits, how big, where the captions sit, whether a
landscape surface must be cropped rather than shrunk.

These are the measured vertical-composition learnings, carried across from
`social-reel` verbatim with their cited evidence. They apply to any frame
taller than it is wide:

- Closed layout vocabulary: TYPE CARD / STACK / HERO
- SIDE-BY-SIDE IS BANNED ("there is no width for it")
- Landscape surfaces get CROPPED, not shrunk (width 160–240% + negative x)
- Evidence at phone scale; whole desktop workspaces banned
  (cited: `proj_56358b25` scene 4 — full-width but illegible)

### What the frame does NOT decide

**Duration.** A 9:16 film is not inherently short. Duration belongs to the
grammar, which knows what it is arguing and how long that takes.

**Story shape.** Hook, escalation, payoff and the loop seam are editorial
choices. They belong to the grammar — see below.

## Axis: `film_grammar` — revised

`social-reel` leaves the list. `speaker-screencast` splits in two: the current
value bundles *a screen recording* with *a human narrating it*, but those are
different protagonists. A product walkthrough is carried by the screen. A
talking-head ad is carried by the person.

| Grammar | What carries the argument | Change |
| --- | --- | --- |
| `launch-film` | the brand moment | — |
| `tempo-cut` | the product | — |
| `hype-cut` | the story | — |
| `editorial` | the words | — |
| `data-story` | the numbers | — |
| `canvas-tour` | one surface | — |
| `screencast` | the screen | renamed from `speaker-screencast` |
| `speaker` | a person | **new** |
| ~~`social-reel`~~ | ~~the format~~ | **deleted — see below** |

Count is unchanged at eight. `speaker` and `screencast` compose: a screencast
film usually has a speaker in PiP; a speaker film may cut to a screencast beat.

### `social-reel` is deleted, not aliased

No compatibility shim. The value is removed from the enum, the type, the
director's prose, the builder's contract block, the scene-count table, the
tool schema and the server's MCP instructions. A caller passing it should get
an error, not a silent redirect.

Its rules disperse:

| social-reel rule | Goes to |
| --- | --- |
| Vertical composition, 12% / 18% occlusion | `frame: 9x16` |
| Closed layout vocabulary; side-by-side banned | frame (any tall canvas) |
| Crop-don't-shrink; phone-scale evidence; no desktop shells | frame (any tall canvas) |
| Hook ≤2s, escalation beats, payoff | **grammar** — and see the note below |
| Loop seam | **grammar** (an editorial choice about how a film ends) |
| 15–28s envelope, 5–8 scenes | **grammar** |
| "Captions ARE the voiceover; `voiceover_text` empty" | **deleted** — this was the bug |
| Hard cuts on downbeats, 1.5–4s | **grammar** (`tempo-cut` / `hype-cut` already own it) |

**Its story arc already existed.** `hype-cut` is "premise-first open, two-act
escalation, click-driven cut into the payoff app" — hook, escalation, payoff,
the same shape written twice. So `social-reel` was not only a mis-filed
format; it also duplicated a grammar. `frame: 9x16` + `hype-cut` is what it
was reaching for, and that combination is expressible the moment the frame
axis exists.

## Concept: spine (internal — NOT a field)

A **spine is what a film's beats are indexed by**. It is not the beats; it is
the ruler they are laid against. The codebase already believes this — from
`core/sentence-spine.ts`:

> *"Tempo-cut's spine is the bar grid (music-first); the narrated walkthrough's
> spine is the SENTENCE... The narration owns the film clock in this grammar."*

Spine is **implied by grammar and never passed by an operator**. Two grammars
may share one (tempo-cut and hype-cut both take the bar grid; speaker and
screencast both take the sentence), and a grammar may admit more than one.

| Grammar | Spine | Admits alternatives? |
| --- | --- | --- |
| `tempo-cut`, `hype-cut` | bar grid | no — hard cuts on downbeats *is* the grammar |
| `speaker`, `screencast` | sentence | no |
| `canvas-tour` | place (spatial, not temporal) | no — "no cut the viewer can name" *is* the grammar |
| `data-story` | figure (claim → proof) | no |
| `editorial` | statement (reading time) | no |
| `launch-film` | emotional arc | no |

Most grammars entail their spine, and that is fine. The concept earns its place
by making the choice **visible** — and by naming the asserted/measured
distinction below, which is what unblocks script-first production.

### Asserted vs measured spines

A spine is either **derived from a source asset** or **written by an author**.
They are the same kind of object either way, which means **a spine can exist
before its source does**.

| | Source | Derivation |
| --- | --- | --- |
| Measured bar grid | an mp3 | `beatMap` (bpm, bar length) |
| Measured sentence | a take | whisper word times → `sentence-spine.ts` |
| Asserted sentence | a script | the author's lines + estimated timings |

**Measured supersedes asserted.** That single rule delivers script-first
production with no new machinery:

1. The board carries an **asserted** sentence spine — her lines, her estimated
   durations.
2. That spine drives the teleprompter. (`booth_script` is already an asserted
   spine: `{at, text}` cues against a timeline. It was built once, for one
   case — re-voicing a locked cut — and generalises.)
3. The take produces a **measured** sentence spine.
4. Measured wins: durations update to the real delivery, captions come from the
   take.

This also resolves the dual meaning of `duration_seconds`. Under an asserted
spine it is a *prediction*; under a measured one it is a *fact*. Same field,
and the spine says which.

Known consequence: captions should come from the **measured** spine, not the
script — that is how captioning actually works, and it preserves ad-libs. The
script's role is to bias transcription (feed the known copy to whisper as a
prior) so brand names and proper nouns resolve correctly. Observed failure:
whisper rendered an unknown name as "Prana" with no prior available.

## The multi-format workflow (in scope)

"Make a LinkedIn version of this, now make it for Instagram" is close to the
most common ad request there is. It is a requirement of this design.

**Decision: separate projects, joined by a first-class derive operation.**

    derive(project_id, frame: '9x16') → new project_id

The board (beats, copy, footage, order) is **copied**, the new frame is set,
the scenes are **re-staged for the new geometry as a proposal** (the
`proposed: true` idiom the compress-the-waiting EDL already uses), and
`derived_from` records the lineage. The two projects are independent from
that moment on.

Why separate, not shared (this reverses an earlier draft):

- **Approval.** Once a format is signed off, a copy edit elsewhere must not
  silently change it. Propagation across formats is a liability for anything
  already shipped, not a convenience.
- **Independent editing is the norm.** A 9:16 and a 16:9 of the same ad make
  different creative decisions, not just different positions — the two
  hand-built reels of 2026-09-11/13 chose a framed card with a type field at
  4:5 and full-bleed footage with burned captions at 9:16. Once a variant is
  edited independently it is a separate thing, and it is always edited
  independently.
- **It is how design tools work.** Canva's resize produces a new design;
  Figma duplicates the frame. Nobody keeps N bodies in one document.
- **Every per-project mechanism keeps working unchanged** — render, stills,
  jobs, the scene cache, Studio. A shared project would have needed a Studio
  format switcher and per-format edit state; that machinery existed only
  because of the shared-project choice, which was the design saying it was
  wrong.

What is given up: copy fixes do not propagate. If that ever matters, the
lineage link is enough to offer "the source changed — re-derive?" later. Not
in scope now.

## Conflicts this spec must resolve

**`canvas.preset` already exists** (`landscape | vertical | square`). It is a
vestigial format field living on the canvas. `format` must subsume it — one
concept, one home — not sit beside it.

**Duration leaves the format entirely.** Grammars carry their own ranges and
scene counts, as they already do. A 9:16 film is not inherently short.

**The canvas side-effect relocates.** Today picking `social-reel` silently
sets vertical. That behaviour becomes `format`'s, and must not survive in two
places.

## Not recommended cells

The matrix is open, but not every cell is good. Quality guidance, not
architectural blocks:

- `launch-film` × `9x16` — "expansive cinematic worlds" want width and time.
- `data-story` × `9x16` — its own contract already fights 1080px-wide charts;
  possible with aggressive cropping, rarely good.
- `canvas-tour` × `1x1` — a traverse wants a long axis to travel.

Genuinely good and currently unsayable: `9x16` × `speaker` (the ad this all
started from), `9x16` × `tempo-cut`, `9x16` × `hype-cut` (what `social-reel`
was reaching for), `9x16` × `canvas-tour`.

## Decisions recorded from review (2026-09-14)

- **Format is geometry only.** No duration, no story shape. Both belong to
  the grammar.
- **Format infers.** Now that it is a lookup with no editorial judgement
  attached ("for Instagram Reels" → `9x16`), it infers like the other axes.
- **The story arc lives in the brief, not the grammar.** `speaker` makes the
  person own the clock; "15-second Instagram ad, open with a hook" is the
  brief's job, and the model knows what one looks like. If the script is
  good and the performance is off, that is the humans' problem.
- **`screencast` assumes a narrator; the face is optional.** Camera on → PiP
  bubble; camera off → voice-only. Both are the same grammar because the
  screen is the base layer either way. `speaker` is the same spine with the
  layering inverted.
- **Occluded bands stay on the format** as a default mask for the geometry's
  most common platform, overridable. (Reels and TikTok are both `9x16` and
  occlude differently; the default covers the common case.)
- **Multi-format is derive-a-copy, not shared staging.** See above.

## Remaining small items (implementation, not design)

- Explicit `canvas_width` / `canvas_height` on `generate` still exist. Format
  sets them; explicit dimensions override.
- Existing projects on disk carry `canvas.preset`. Map to `format` on load.
- The footage-first path (`screencast_source` → deterministic assemble, no
  board) is **left untouched** by this change. It has been agreed separately
  that it should produce a proposed board; that is its own PR.

## Phasing — three phases, each shippable

**Phase 1 — the structural change.** Add the `format` axis. Delete
`social-reel` everywhere (13 occurrences across 5 files). Split
`speaker-screencast` into `speaker` and `screencast`; delete the
"only choose it when a recording exists" rule so `speaker` is choosable
before the take. Move the vertical-composition rules into a format block in
the storyboard builder. Subsume `canvas.preset`.

Exit test: `generate({ film_grammar: 'speaker', format: '9x16', mode:
'storyboard' })` with the `proj_ddca872c` brief returns a board with
`voiceover_text` populated on every beat and staged in the middle band.

Known risk: the vertical rules were tuned inside `social-reel`, knowing the
film would be caption-led motion graphics. They will now fire against
`tempo-cut`, `canvas-tour` and `speaker`, which have never had to obey a
format constraint. Run three or four combinations before calling Phase 1
done; expect to tune.

**Phase 2 — script-first.** Board → prompter cues (arithmetic on the
board's own durations, no LLM). Script-biased transcription (the board's copy
as whisper's prior). Measured spine re-times the board and sources the
captions.

**Phase 3 — derive.** `derive(project_id, format)`: clone, set format,
re-stage as a proposal, record lineage.

## Non-goals

- Changing `visual_system` or `audio_system`.
- Auto-reframing landscape footage into vertical (face tracking). Separate.
- Loudness normalisation. Separate, unrelated, already scoped.
- Building anything. This document is the design review rule 4 requires.
