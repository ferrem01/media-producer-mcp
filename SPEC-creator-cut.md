# SPEC: creator-cut -- a person explains, the screen proves it

Status: AGREED (2026-09-16, Marc + Claude). Ninth film grammar. Builds on
`SPEC-take-flow.md` (needs, takes, word anchors, the board), the speaker
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
- Needs on the board (`assets[]`, `status: needed`, Upload).

Missing (the build list):
- **The grammar's contract** in the creative director and storyboard
  writer, with the ad/tutorial split on `motion` + length.
- **Evidence needs.** The writer declares per beat what proof it wants:
  `screenshot` / `screen_recording` / `stock_footage` (b-roll) / `mockup`
  with a description and how it is used (card or cutaway). The board lists
  them beside the take with Upload; b-roll needs are generated in-house and
  flip to provided by themselves. `AssetRequirementType` already has every
  kind; what is new is the writer asking, per beat, and the board showing
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

## The board and the build (how it flows)

1. `generate(film_grammar: "creator-cut", frame: "9x16")` -> a board where
   every scene is a claim with the lines and, per beat, the evidence it
   wants. The cards show the outline and an evidence placeholder per beat.
2. The board lists the needs: the take(s), and each screenshot / recording
   / b-roll with its description. Upload fills one; b-roll fills itself.
   Record all or per scene, as today.
3. Build: captions from the take words; inserts on their words; punch-ins on
   the face; cutaways per the takeover recipe with their annotations.
4. Studio and render as today.

## Phases

1. Contract + evidence needs on the board (writer, director, board UI).
2. Captions from the take; the evidence card; annotations on cutaways.
3. Layout under the busy edit; the ad pass (punchy, 30s) and the tutorial
   pass (calm, 75s) as the exit test.

## Exit test

Two films from the two references' shapes, Marc on camera, Quotient as the
product: a 30s ad (punchy) and a 75s tutorial (calm), each with real
screenshots supplied through the board and one generated b-roll. Judged
side by side with the references.

## Decisions (2026-09-16)

- Cutaways are the way proof comes in; cards only when the brief asks.
- No standing header; a chapter label is a graphic on its claim.
- A CTA or sponsor line only when the brief asks.
- Ad and tutorial are one grammar, split on `motion` and length; revisit
  with evidence after one of each is built.
