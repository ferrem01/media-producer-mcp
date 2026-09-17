# SPEC: creator-cut -- a person explains, the screen proves it

Status: AGREED (2026-09-16, Marc + Claude); phase 1 BUILT (the grammar
value, the contract, proof needs in Studio, provided proof cast as a
cutaway). Ninth film grammar. Builds on
`SPEC-take-flow.md` (needs, takes, word anchors, Studio in your hand), the speaker
recipe in `SPEC-motion-architecture.md`, and `SPEC-creative-axes.md`.

## The references

Two Instagram films Marc wants to emulate, watched frame by frame:

- **@whoismattrodin, 86s (tutorial).** One continuous phone take, warm room,
  glasses, hands. A title chip holds at the top for the whole film ("How to
  create a personalized weekly newsletter with Claude"), then flips to the
  sponsor line. One word at a time at the bottom, always on. Real UI crops
  float over him as translucent cards, timed to the word he says -- an app
  icon, a "New project" dialog, an inbox, a scheduling panel -- then leave.
  Never a cut away from him.
- **@bigpictureclub, 56s (ad).** One take of her on a chair, mid shot. Big
  outlined chapter labels change per point: "Default AI", "Plugins", "Local
  File", "Computer use", "Artifacts", "Image Generation", "Comment 'work'".
  Yellow single-word captions, always on. Hard cuts to full-frame screen
  recordings and screenshots with hand-drawn circles and arrows, then back
  to her. Icon stickers beside her. Several cuts per sentence.
- **@neiljesani, 31s (ad, tax firm).** One chair, one lens. The graphic
  layer is the spoken words: two to four at a time, keyed to the voice,
  the key word in gold or red ("avoidable", "Stop overpaying"). Small
  outlined pill chips land on a phrase ("That's a house", "Click the link
  below"). Three cutaways, 3-4s each, all motion graphics of the IDEA on a
  mint plate: a stock portrait with "$3 million", cash falling and a
  hand-drawn circle around "$1.4 million"; a house photo with a pill; a
  chess pawn with "strategies / for decades". The footage goes black and
  white for one line. Ends on the person.
- **@air.hq, 50s (ad, Air).** Walk-and-talk: every line a different take
  in a different place (doorway, tree, fence, pond, car), jump cuts
  between them. Words set beside the person in the negative space, thin
  white sans. The product idea performed in the world ("AI-native
  tagging" as tag chips floating on the fence, the tree, the pond).
  Product screenshots as cutaways with the caption over them. Gags as
  b-roll (a goat for "brand manager"). Logo wall to open, URL to close.

**What the four share** is the grammar: a person talks, the voice is the
clock, the spoken words are on screen the whole time keyed to the voice,
proof cuts in and out on a word, it ends on the person or a URL. What
varies sits on other axes: the caption convention (three of four use the
words, only Big Picture Club uses chapter labels), the cutaway KIND
(screens, idea graphics, the idea performed in the world, gag b-roll), the
look (visual system, brand kit), and the setting (one chair or a new spot
per line -- a recording instruction, not a grammar).

## Why it is a grammar

The grammar axis is RHYTHM: the spine and the edit. Our `speaker` grammar is
one rhythm -- a steady shot of the person, one beat per scene, one graphic
riding over them per beat, no cuts inside a scene, the frame left clean.
These films are another: the person is still the spine and the voice is
still the clock, but the edit is busy. The screen answers almost every
claim, either floating over the person or replacing them for a beat. The
captions never stop. The camera punches in and out on the person. `speaker` cannot produce this and would not be
asked to: its contract tells the writer to do the opposite.

The test every grammar passes: could an existing grammar with a different
look or sound make it? No. So: a value on `film_grammar`, not a style and
not a new field. The anti-sprawl rules hold -- no new axis, no new concept,
and almost all of its machinery already exists.

Ad vs tutorial are ONE grammar. They differ on axes we have: `motion`
(punchy: punch-ins, fast landings; calm: the steady shot) and length (30s
vs 60-90s, and the cut cadence follows). If, once one of each is built,
they still want different contracts, split then, with evidence.

## The contract (what the storyboard writer is told)

1. **The person is the spine.** One continuous take, or one take per scene
   -- either way the film cuts back to them between every piece of proof.
   The voice is the clock; every scene is one CLAIM; each beat is what the
   screen shows while the claim is said.
   **The words are on screen the whole time** (decided 2026-09-16, after
   the four references): the build captions every scene from the take's
   words -- two to four at a time, on a plate over the chest, keyed to the
   voice, running through the cutaways too (the voice never stops, so the
   words never stop). The writer never casts captions; it marks the ONE
   word each line turns on with `*stars*` in `voiceover_text`, lifted off
   the line at normalize time and tinted in the brand color; unmarked
   lines stay plain (numbers tint by rule). Editable in Studio. A chapter
   label is cast only when the claim wants a name, never as a default.
2. **The screen proves every claim.** Each beat names its EVIDENCE: a
   screenshot, a screen recording, b-roll, or a product mock the library
   can perform. The proof comes in as a CUTAWAY: it takes the frame for the
   beat, hard cut in and out, with an annotation where the eye should go
   (Big Picture Club). The cut is part of the rhythm -- it breaks up the
   voice and gives the film its motion (Marc). A CARD -- the proof floating
   over the person on a plate, the person still on screen (Matt) -- only
   when the brief asks for it. Never a beat with nothing on screen but the
   person for more than one sentence.
3. **No standing header.** A chapter label on a claim ("Plugins", "Computer
   use") is a graphic like any other: cast when that claim wants one, gone
   when the claim moves on. A title that holds for the whole film is NOT
   part of the grammar -- it appears only when the brief asks for it.
4. **Captions run the whole film**, one word at a time, from the take's own
   word timings. The existing caption family (`caption-karaoke` and kin);
   the grammar picks the variant and never authors captions as copy.
5. **The camera moves on the person.** Punch-ins on the claim, pull-backs on
   the turn -- `camera_moves` aimed at the face, at the cadence `motion`
   sets. The rig already carries the camera (PR #775).
6. **Stickers, not decoration.** An icon beside the head names the thing
   being talked about (a calendar, a cart). Same sticker-prop, same phone
   scale.
7. **A CTA or sponsor line only when asked.** Not part of the grammar. When
   the brief asks for one, it is a graphic on the final beat and the film
   holds on it.
8. **Sound.** The voice. A bed only under an ad, ducked far.

## Machinery

Exists (reused as is):
- Continuous take as the spine and per-scene takes (the take flow); word
  timings from the take (measured spine); Record all and the per-scene cut.
- Word anchors: every insert enters on a word.
- Camera moves on the person (the rig camera, face re-aim).
- Takeover cutaways (the takeover recipe: opaque, full-frame, hard cut).
- Caption components; sticker-prop; kinetic-text with a plate; image and
  screenshot components; b-roll generation (`generate_clip`).
- Needs in Studio (`assets[]`, `status: needed`, Upload).

Missing (the build list):
- **The grammar's contract** in the creative director and storyboard
  writer, with the ad/tutorial split on `motion` + length.
- **Evidence needs.** The writer declares per beat what proof it wants:
  `screenshot` / `screen_recording` / `stock_footage` (b-roll) / `mockup`
  with a description and how it is used (card or cutaway). Studio lists
  them beside the take with Upload; b-roll needs are generated in-house and
  flip to provided by themselves. `AssetRequirementType` already has every
  kind; what is new is the writer asking, per beat, and Studio showing
  it.
- **Captions from the take**, wired: after attach, the scene's caption
  component gets the take's words. (Today captions are authored phrases.)
- **The evidence card**: an image/screenshot on a plate that enters on a
  word and leaves on another, phone-scaled, placed by the face-aware
  layout. Likely `image` with a plate and anchors rather than a new type.
- **Annotations on cutaways**: a circle or an arrow drawn on the evidence
  at a word (`annotation` exists; the recipe has to place it on the
  cutaway).
- **The tall-frame layout under a busy edit**: a card, a label, a caption
  lane and a sticker at once, around the face. The bands exist; the rule
  for what yields when they collide does not.

## Studio and the build (how it flows)

1. `generate(film_grammar: "creator-cut", frame: "9x16")` -> a board where
   every scene is a claim with the lines and, per beat, the evidence it
   wants. The cards show the outline and an evidence placeholder per beat.
2. Studio lists the needs first: the take(s), and each screenshot / recording
   / b-roll with its description. Upload fills one; b-roll fills itself.
   Record all or per scene, as today.
3. Build: captions from the take words; inserts on their words; punch-ins on
   the face; cutaways per the takeover recipe with their annotations.
4. Studio and render as today.

## Phases

1. Contract + proof needs in Studio (writer, director, Studio UI).
   **Built.** `creator-cut` is a `film_grammar` value; every gate that read
   `speaker` reads `personCarries()` (`core/take-needs.ts`), so the grammar
   inherits the take flow whole. The writer's contract inherits speaker's
   spine and states the busy edit. The proof is written on the scene's
   EXISTING needs record, `assets[]` -- no new field: a need gains four
   optional fields (`use` cutaway | card, `at` / `until` word anchors,
   `focus`). `core/asset-needs.ts` normalizes what the writer wrote, the
   phone Studio lists every non-take need under its claim with Upload, the
   desktop Studio shows them in the scene's own card, and
   `POST /api/provide-asset/{t}/{p}` (the HTTP twin of the update tool's
   `provide_asset`) fills one. The build casts every provided file as the
   EXISTING `image` or `video` component, full-bleed, with `at` / `exit_at`
   -- and on those two components a timed window is a HARD cut (no fade
   either side; a still gets a slow push, a clip plays from its own start).
   No new component type. Proof never blocks the build. Not yet: b-roll
   and mocks generated in-house (their needs read "optional"), cards, the
   focus drawn on the proof, captions from the take.
2. Captions from the take. **Built** (`core/captions.ts`): the scene's
   spine (asserted from the script, measured from the take) becomes the
   EXISTING `reel-caption-lane` -- phrases broken on punctuation, a
   breath, four words or 1.8s, each holding until the next; the writer's
   `*starred*` words tinted, numbers by rule; a word anchor on every
   phrase edge so a take that lands later re-times the captions with
   everything else. The lane owns the chest band (the band above the
   hairline when the face sits low), above the proof and a label. The
   empty-cast label from the scene's name is gone.
   **The idea beat** (built 2026-09-17, after the Gamma and Jesani ads): a
   claim no screen can prove -- money, time, a person, a place, a feeling
   -- gets a DRAWN OBJECT. It is a proof KIND on the existing needs, not a
   grammar: `assets[]` type `illustration` (description = the one object
   in one sentence, `at`/`until` word anchors, `focus`), drawn in-house
   after media enrichment (portrait on a tall frame), marked provided, and
   cut in on the claim's words through the same `proofComponents` path a
   screenshot takes. Over it the writer casts the figure as a plated label
   with `ring: true`: kinetic-text draws a hand-drawn loop around its own
   line once the words land (the brand's secondary color). On hype-cut and
   tempo-cut the same object rides BEHIND a type beat as the scene's
   `hero_image` (already honored by enrichment) -- THE OBJECT BEHIND THE
   WORDS -- and the director knows a story ad (pain, flip, payoff) is
   hype-cut. Why not a grammar: a grammar is rhythm; Jesani's film would
   switch grammars three times for three seconds each. The evidence to
   split is an all-idea film that wants a different edit.
   Still to come: the evidence card; annotations on cutaways; b-roll needs
   filled in-house; the black-and-white beat; pills that land on the word.
3. Layout under the busy edit; the ad pass (punchy, 30s) and the tutorial
   pass (calm, 75s) as the exit test.

## Exit test

Two films from the two references' shapes, Marc on camera, Quotient as the
product: a 30s ad (punchy) and a 75s tutorial (calm), each with real
screenshots supplied through Studio and one generated b-roll. Judged
side by side with the references.

## Decisions (2026-09-16)

- **Motion graphics are the default proof** (after the first live board,
  which asked for seven screen recordings and cut to nothing): the writer
  casts the library mock that performs the claim as the cutaway, cut in
  on a word and out on a word (`enter: {effect: "cut", at: "@word"}` on the
  component -- the wrapper's own clock takes word anchors now). The film
  has its cuts on the first build with nothing supplied. A real screenshot
  or recording is an optional need on `assets[]`; a provided file replaces
  the mock in that window. Never a recording where a still would do.
- **The camera moves by rule.** A creator-cut claim with no authored moves
  gets a punch-in on the claim aimed at the face, the camera rests on each
  cutaway and returns to the person on its exit (and a pull-back on the
  turn when the claim is long enough); calm motion gets a slow push. The
  writer may still author its own.
- **A cutaway mock on a tall frame is framed on its region** (`frame_anchor`
  on the component; the wrapper scales and shifts at the cut so the rows
  and labels read on a phone, the way the references crop a desktop screen
  to the part being talked about). The camera cannot do this: it fits a
  region, never crops one.
- **The voice never stops.** The take is the base of every scene and its
  audio runs first word to last; a cutaway, a card, an overlay are only
  what is on screen for a window between two words.
- Cutaways are the way proof comes in; cards only when the brief asks.
- No standing header; a chapter label is a graphic on its claim.
- A CTA or sponsor line only when the brief asks.
- Ad and tutorial are one grammar, split on `motion` and length; revisit
  with evidence after one of each is built.

## B-roll rides the same lane

A `stock_footage` need is the idea beat's moving twin: the build fetches it
(portrait on a tall frame) and cuts it in on the claim's words exactly like a
drawn illustration or a provided screenshot. The human records only what the
build cannot find: the on-camera lines, and any shot of themselves (the
over-the-shoulder laptop shot in the founder-story reference).

## The split

The third `use` on a proof, beside `cutaway` and `card`: on a tall frame the
screen owns the top of the frame, flush, and the person owns the bottom,
captions on the person. It is the talking-head-under-the-screen shape every
"creator at a laptop" ad uses, and what a screencast IS on a phone. One rule
(`splitScreenHeight` in `scene-generator.ts`), two callers: a creator-cut
proof marked `use: "split"` (on the need, or in a library mock's data when the
mock is the proof), and the speaker screencast template on a tall canvas,
which drops the corner bubble for it. The screen's bottom edge comes from the
face: it ends above the hairline, never under 34% nor over 55%. Short claims
stay cutaways; the split is for the beat that lingers on the screen.
