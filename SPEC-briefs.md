# SPEC-briefs.md -- a marketing brief in, a shippable film out

## The test

Marc's head of marketing writes video concepts as rows of a sheet: Rank,
Topic, Product Focus, Opening Hook, Problem, Storyline, Quotient Solution,
Visual Direction, Suggested Length, CTA / End Line, Source URL, Production
Notes. The test: hand a row to the system and get a shippable film. Row 1
("One Sentence Became 27 Tasks", 2026-09-18, proj_3ce292de) got a board on
the first pass, then lost the hook, the storyline's burst and the office
footage on a single feedback redraft. This spec is what changed.

## What a brief locks

`src/llm/brief-locks.ts`. A brief LOCKS its quoted lines (four words or
more, or any quote introduced by "verbatim" / "exactly" / "must say") and
its named sections (opening hook, storyline, problem, solution, visual
direction, CTA / end line, must-say). A feedback redraft carries, in order:
the original brief, the lock block, the whole previous board scene by scene
(cast, copy, needs), then the feedback. The first prompt is persisted as
`project.brief` and never overwritten. After a board is written it is
checked against the locks; a missing locked line is a `warnings` entry on
the storyboard and a console warning.

## Real footage on any grammar

A `stock_footage` need on any scene of any film is fetched by the build
(Pexels, portrait on a tall frame). On a film a person carries it cuts in on
its words like any proof. On a film nobody carries it is the scene's GROUND:
it rides the media-backdrop channel the codegen b-roll uses, under the type
and the cards. The writer is told this in the assets schema and in the
launch-film guidance ("REAL FOOTAGE").

## The screen slate: the mock is never the placeholder

Every kind of thing a film needs from a human is a need with a stand-in
until it arrives: an image is drawn, b-roll is fetched, a speaker film
builds on a slate until the take lands. Screen recordings were the gap:
a need only on creator-cut, and nothing cast an uploaded one elsewhere.
Now a scene on any grammar whose payoff is a product mock also lists a
`screen_recording` (or `screenshot`) need. The mock is NOT the stand-in
(Marc, on the sheet-row film: a Quotient mock in a scene that asks for a
recording looks finished and is not). While the need is open the build
casts a SLATE -- the library's `asset-placeholder`, a plain dashed card
saying "Screen recording needed", the need's description and how to
replace it -- in the mock's exact slot, layer and cut window
(`castScreenSlates`, `core/asset-needs.ts`); with no mock it cuts in
full-bleed on the need's `at`/`until`, word anchors resolved on person
films. The mock is still written on the board: it tells the build where
the screen goes and when. When the recording is uploaded,
`castProvidedScreens` gives it the slate's slot and the slate leaves.
Studio lists the need with Upload like any other.

## The sources: every need is collected its own way, in the board

Marc: a storyboard that lists what it needs should let you get each thing
where you stand. A camera take is recorded on the phone (the take page)
or uploaded; a screen recording is recorded with the Quotient Recorder
or uploaded; b-roll is found (Pexels, a picker of candidates) or
uploaded; an illustration or product mock is drawn (image generation,
the build's own prompt) or uploaded. The table is `NEED_SOURCES`
(`core/need-sources.ts`); Studio renders it as the buttons on each need
row, desktop and phone, with the find and draw panels inline under the
row. Every source ends in the same write, `provideAsset`, and the build
casts the file into the slot the board held for it (the take base, the
screen slate's slot, the b-roll ground, the idea beat's cut). Server:
`GET /api/stock-search/{tenant}?q=` for the candidates and
`POST /api/need-source/{tenant}/{project}` `{scene_index, asset_index,
source: find|draw, pick_id?|prompt?}` for the make-it sources. The
Recorder gained a For picker: with a project chosen under Save to, its
open screen needs are listed, and a recording made for one is uploaded
into that project and fills the need instead of becoming a new scene.

Not yet: music as a need (the audio system still picks at build time),
and opening the same card by clicking the slot in a built scene.

## Columns the sheet should add

- **Format / placement** (16x9, 4x5, 9x16; where it ships) -- the frame is a
  guess otherwise and a wrong guess is a rebuild.
- **Who is on camera** (nobody, the founder, a marketer, a screen recording)
  -- picks the grammar and whether someone must record a take.
- **Claims and numbers allowed** -- a short "you may say" list.
- **Must-say lines** (verbatim), separate from the CTA.
- **Assets we have** (screenshots, recordings, logos) so the board asks for
  what is missing instead of guessing.
