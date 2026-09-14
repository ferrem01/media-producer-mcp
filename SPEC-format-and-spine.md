# SPEC: Format and spine — separating what a film IS from where it SHIPS

Status: PROPOSED — design review (Marc + Claude session, 2026-09-14). This is
the rule-4 review that `SPEC-creative-axes.md` demands before a fourth field
exists. It proposes one new axis (`format`), the removal of one grammar value
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

| Axis | Does `format` overlap it? |
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
| **FRAME** | **`format`** | **canvas, duration envelope, safe areas, distribution behaviour** | **delivery format** |

Same contract as the other three: omitted → inferred; provided → pinned.

## Axis: `format`

| Value | Canvas | Envelope | Safe areas | Distribution facts |
| --- | --- | --- | --- | --- |
| `landscape` | 1920×1080 | none | none | default; embeds, landing pages, YouTube |
| `reel` | 1080×1920 | ≤30s (ads: ≤15s) | top 12%, bottom 18% | hook ≤2s; loop seam; sound-off likely |
| `feed-portrait` | 1080×1350 | ≤60s | none — media is not overlaid | hook still matters; no loop |
| `feed-square` | 1080×1080 | ≤60s | none | — |
| `story` | 1080×1920 | 15s segments | top 14%, bottom 20% | anticipated |

A format owns four things and nothing else:

1. **Canvas** — the dimensions. This absorbs the side-effect where picking
   `social-reel` silently set vertical.
2. **Duration envelope** — a ceiling, not a target.
3. **Safe areas** — which bands platform UI covers. Note `feed-portrait` does
   *not* overlay the media, which is why its captions can sit lower than a
   reel's.
4. **Distribution behaviour** — hook pressure, loop seam, sound-off assumption.

Everything in the table above is a fact about where the film ships. None of it
is a fact about what the film argues.

### The vertical composition rules are format rules

These move from `social-reel`'s contract to any format whose canvas is
narrower than it is tall, and they are **measured learnings with cited
evidence** — they must be carried across verbatim, not paraphrased:

- Closed layout vocabulary: TYPE CARD / STACK / HERO
- SIDE-BY-SIDE IS BANNED ("there is no width for it")
- Landscape surfaces get CROPPED, not shrunk (width 160–240% + negative x)
- Evidence at phone scale; whole desktop workspaces banned
  (cited: `proj_56358b25` scene 4 — full-width but illegible)

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
| ~~`social-reel`~~ | ~~the format~~ | **removed → `format: reel`** |

Count is unchanged at eight. `speaker` and `screencast` compose: a screencast
film usually has a speaker in PiP; a speaker film may cut to a screencast beat.

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

## Conflicts this spec must resolve

**Duration.** Format carries an envelope; grammars carry their own ranges
(`data-story` wants 25–45s, `reel` caps at 30s). **Format wins the envelope;
the grammar adapts its scene count.** Scene count stops being a grammar
constant and becomes envelope ÷ the grammar's beat length.

**`canvas.preset` already exists** (`landscape | vertical | square`). It is a
vestigial format field living on the canvas. `format` must subsume it — one
concept, one home — not sit beside it.

**Backward compatibility.** `social-reel` is a public value in the `generate`
tool enum and appears in the server's own MCP instructions. It must survive as
an **alias** expanding to `format: reel` + an inferred grammar, or every
existing caller breaks.

**Where the canvas side-effect lives.** Today picking `social-reel` sets
vertical. That behaviour relocates to `format` and must not be left in two
places.

## Not recommended cells

The matrix is open, but not every cell is good. These are quality guidance,
not architectural blocks:

- `launch-film` × `reel` — "expansive cinematic worlds" has no room in 15s.
- `data-story` × `reel` — its own contract already fights 1080px-wide charts;
  possible with aggressive cropping, rarely good.
- `canvas-tour` × `feed-square` — a traverse wants a long axis to travel.

Genuinely good and currently unsayable: `reel` × `speaker` (the ad this all
started from), `reel` × `tempo-cut`, `reel` × `canvas-tour`.

## Open questions

1. **Where does hook / escalation / payoff live?** It is listed above as a
   feed fact, but it is arguably a *story* shape — which is `hype-cut`'s
   business. If it is a story shape, `format: reel` carries only the hook
   pressure and the loop seam, and the escalation arc stays with the grammar.
   Unresolved.
2. **Does `format` infer, or must it be pinned?** The other three axes infer
   from the prompt. "An Instagram ad" clearly implies `reel` — but the cost of
   a wrong inference is an unusable aspect ratio, which is harsher than a wrong
   motion value.
3. **One board, many formats?** Rendering one project at 9:16 and 4:5 is the
   obvious next want. Is that one project with N format renders, or N projects?
   Safe areas differ, so caption placement differs — it is not a pure re-crop.

## Non-goals

- Changing `visual_system` or `audio_system`.
- Auto-reframing landscape footage into vertical (face tracking). Separate.
- Loudness normalisation. Separate, unrelated, already scoped.
- Building anything. This document is the design review rule 4 requires.
