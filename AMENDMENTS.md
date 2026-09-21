# AMENDMENTS.md — change & decision log

Running log of substantive changes and decisions, newest first. Pair with `SPEC.md`
(the design) and `CLAUDE.md` (how to work in the repo). Reference commits/PRs so a new
session can pick up mid-thread.

---

## 2026-09-17 — Tall-frame framing for every desktop surface, not only cutaways

The Cursor-style smoke film (proj_91b654b5, canvas-tour on 9x16): the
Slack window squeezed to the phone's width, the thread unreadable. The
framing creator-cut got (#789) applied only to cut-in proofs.

- `scene-generator.ts`: a proof surface that owns the width of a tall
  frame (slot >= 80%) with no person under it is framed on its performing
  region too (`frame_anchor`), whatever the grammar.
- `scene-assembler.ts`: `frameOf` works in the WRAPPER's own box (W x H),
  so a surface owning a band of the frame frames like a full-frame
  cutaway and always still covers its box; a framed surface with no
  entrance is framed from its first frame; a framed surface's entrance
  lands ON its framing (measured: the rise entrance tweened the framed
  window back to scale 1 half a second in).

## 2026-09-17 — The idea beat: a drawn object for a claim no screen can prove

Two more reference Story ads (Gamma: headlines over an illustrated clock,
balloons, a laptop in clouds; Cursor: one Slack thread carrying the ad)
plus Jesani's photo-and-circle cutaways. Run unpinned, the Gamma brief
came back as tempo-cut with every type beat on a bare dark field: the
writer had no way to ask for an object. The Cursor brief came back as a
canvas-tour on one slack-workspace, buildable as-is (the deploy smoke
film from here).

Decided with Marc: NOT a grammar ("idea cut") -- a grammar is rhythm, and
Jesani's film would switch grammars three times for three seconds each.
A proof KIND on the existing needs instead:
- `asset-needs.ts`: `illustration` joins PROOF_TYPES (the type already
  existed on AssetRequirementType); label "Illustration (the build draws
  it)".
- `pipeline.ts`: after media enrichment, on a person grammar, every
  `illustration` need with no file is drawn with `generateImage` (portrait
  on a tall frame), saved to the project's assets, marked provided, cast
  through `proofComponents` and its anchors resolved against the scene's
  spine (the spine pass already ran). Enrichment gets `portrait` so the
  writer's `hero_image` stills fit a tall frame too.
- `kinetic-text`: `ring: true` draws a hand-drawn loop around the LINE
  (the container that hugs the words, not the slot) once the words land,
  stroke in the brand's secondary; `ring_at`, `ring_color`.
- Writer: creator-cut THE IDEA BEAT (need + plated label + ring);
  hype-cut and tempo-cut THE OBJECT BEHIND THE WORDS (`hero_image` on a
  type beat, two or three per film); the grammar-contract test made both
  say "the world's display type", not the component's name.
- Director: a story ad (pain, flip, payoff in big lines over objects) is
  hype-cut, not tempo-cut.

## 2026-09-16 — The first full end-to-end creator-cut film: four defects, four rules

proj_f10e79cf: fresh board, one recording, built and rendered with no
hand fix. Marc: "black on black" captions; "a random little pill ...
half on, half off screen"; the captions "cracked out over the main part
of the screen" on a cutaway; "I thought we had rules for this".

- **Black on black.** The lane's plain words took the brand's text color
  (#17171c on a light brand) on the dark plate. Under a plate or a shadow
  the ink is white, whatever the brand says (`reel-caption-lane`).
- **Why the gate let it through.** Over the camera every ink finding was
  dropped ("measured against the plain page, not the camera"). Now the
  scene is measured on a DARK page and a LIGHT page as well; ink that
  fails on both fails on any camera -- the plate is its own ground -- and
  the finding stands (`pipeline.ts`, assembled-scene gates).
- **The sticker left the frame.** Side slots and bands were laid out on
  the full frame; the rig's punch-in (1.22-1.3x on the face) pushed a slot
  at the edge out of the picture. `tallSpeakerBands` now cuts the bands,
  the side slots and the corner fallbacks to the window the punch-in still
  shows; the lane, pinned to the frame, keeps the frame's own bands and
  takes 12% at the band's top, leaving the rest for a sticker or the pills
  (a close face has no side slot at all). The roomier side first.
- **The sticker read random.** The writer landed it at 0.2s and flashed
  it for a second. By rule it lands on the claim's emphasis word and stays
  until the cutaway cuts in (the cut is its exit).
- **Captions over the cutaway.** With a close face the lane sits high,
  where a framed mock's content is. For every cut window the lane drops to
  the chest band (`data.cut_top`, read by `wrapperChoreoScript`) and comes
  back with the person.

- **Rebuilt to test the four (second render):** the ink and the lane's
  drop held; two things the rebuild showed. (1) Every sticker landed on
  its emphasis word and exited on the cut-in -- the same word, so none
  showed: with the numbers resolved, a sticker needs a second before the
  cut, else it rides the cutaway and leaves with it. (2) The empty-moment
  gate ran on person scenes (the build-from-board path had no speaker
  clip wired at gate time) and its repair enlarged the caption lane to
  fill a frame the camera fills: the gate skips when the build knows the
  scene is over the camera (`opts.overCamera`).

## 2026-09-16 — The take page, third round: the lines set the floor, tap to advance, no scrolling, one camera prompt

Marc, recording the fresh creator-cut board (proj_f10e79cf) in one go:
"ripping through the words faster than any human being could actually
speak", "a long ass page ... scroll all the way down, hit record, then
scroll all the way back", "the browser keeps asking me if I can use the
camera".

- **The prompter raced** because the writer gave scene 1 twenty-four words
  and four seconds (6 words/s) and the prompter paced to the board's
  seconds. The take page now paces at speaking pace and treats the board's
  number as a floor, never a ceiling. The pipeline floors every spoken
  scene's duration at `speakingEstimate(script)` before the spine, so the
  cut windows and the captions resolve against a clock a mouth can keep
  (`core/script-lines.ts` already had the estimate). A take that lands is
  still the clock.
- **Tap to advance**: one cue at a time on its own clock; a tap on the
  stage jumps to the next line and restarts the clock there. The prompter
  can never run ahead of the person.
- **No scrolling**: the ready screen is one viewport -- the script scrolls
  inside its card, Record stays in reach; the stage is fixed to the
  viewport and every screen change scrolls to the top.
- **One camera prompt per visit**: the stream survives review, retake and
  record-again (`stopAll` no longer kills the tracks); it is released when
  the page hides.

- **Locked under the stage** (Marc, on the deploy: "I can still scroll
  the take screen up"): while the stage is up the document is locked --
  `html.lock body { position:fixed }`, the one lock iOS Safari honours --
  and touch moves are swallowed, so the recording screen cannot rubber-
  band or scroll.

## 2026-09-16 — One link, any screen: the phone Studio and the take page read the tenant from the token

Marc opened the Studio link on his phone: "Missing ?tenant= and
?project= in the link." The desktop Studio's links carry project + token
and no tenant (the token is a tenant-scoped JWT); the phone page and the
take page demanded `?tenant=`. Both now read `tenant_id` off the token
when the link has none, and say which part is missing.

## 2026-09-16 — captions: the words hold still under the punch-in

The first captioned render (proj_9e650f1a): in scenes 6 and 7 the
captions sat at 92%-97% of the frame, inside the platform strip. The lane
rode the camera rig like every other component, and the 1.3x punch-in
on the person pushed the chest band to 87%-103% (measured with the
assembled scene). The reference films punch in on the person while the
words hold still.

- `scene-assembler.ts`: `isFixedToFrame(type)` (the caption lane); the
  wrapper carries `data-mp-fixed="1"` and the rig's child loop parks it
  outside, where its own z-index (41) keeps it above the rig (z 2).
- `composite-assembler.ts` (Studio's preview): the same attribute -- and
  the cut-in plate (`data-mp-cutaway`, white) it never had, so Studio
  previews what the render draws.

## 2026-09-16 — captions: one tinted word per sentence by rule; no one-word flash

The first captioned rebuild of proj_9e650f1a (a board written before the
emphasis marks existed) rendered every caption plain -- the fallback
tinted numbers only -- and "without you even touching" / "it." flashed a
lone word.

- `fallbackEmphasis`: with no mark from the writer, ONE word per
  sentence -- a number, then a name (a capitalized word that does not
  open the sentence), then the brand's name, then the longest word of six
  letters or more; a sentence with none stays plain.
- `captionPhrases`: a lone trailing word folds back into the phrase
  before it, or the pair rebalances 3 + 2 when that phrase is full; a
  word ending on punctuation still stands alone ("done,").

## 2026-09-16 — creator-cut: the words are on screen the whole time

Four reference films (Matt Rodin, Big Picture Club, Neil Jesani, Air) share
one text layer: the SPOKEN WORDS, two to four at a time, keyed to the
voice, one word tinted. Only one of them uses chapter labels -- our first
default. Marc: "I like that there is a captions layer with certain words
emphasized in a different color. We had that in earlier versions but it
does not seem to be default anymore. I don't like chapter labels as a
default." The pieces existed (`reel-caption-lane` with `*starred*`
emphasis; the per-scene spine with word times; a contract line saying
captions are derived from the take) and nothing connected them.

- `core/captions.ts` (new): `captionPhrases` groups the spine's words into
  phrases (end punctuation, a breath > 0.6s, four words, 1.8s; each holds
  to the next; a lone trailing word folds back); `captionLane` casts the
  existing lane, plated, phone-scale, with a word anchor on every phrase
  edge so a take landing later re-times it; `emphasisFromLines` lifts the
  writer's `*stars*` off the line; `fallbackEmphasis` tints numbers (and
  the brand's name when given).
- Writer (`storyboard-builder.ts`): THE WORDS ARE ON SCREEN THE WHOLE
  TIME + MARK THE EMPHASIS; the cast is sticker + cutaway, a label ONLY
  when the claim wants a name. `normalizeSceneShape` lifts the stars into
  `scene.emphasis` (carried to the saved storyboard); the prompter, the
  needs and the spine read the clean line.
- Build (`pipeline.ts`, creator-cut defaults): the lane is cast from the
  scene's spine unless the writer cast one; the empty-cast label from the
  scene's name is gone.
- Layout (`scene-generator.ts`): the lane owns the chest band on a tall
  frame at z 41 (above the proof at 36 and a label at 39), the band above
  the hairline when the face sits low (the surfaces that wanted it are
  dropped -- the words win); the lower third centred on a wide frame.
- Decided with Marc: the AI picks the emphasized word (writer first, rule
  fallback, editable in Studio); the words sit over the chest, not beside
  the head ("not enough room next to the head on a narrow tall view");
  the captions keep running over the cutaways.
- Not yet: idea cutaways for a claim no screen can prove ("I am sure
  there will be a time"), the black-and-white beat, pills on the word.

## 2026-09-16 — Studio: one recording, several takes -- the voice fell behind

Marc: "by the second scene my mouth is moving and the sound is not
coming out yet." In Studio the voice comes from the hidden speaker
underlay and, on a scene with camera moves, the picture from the scene's
own rig camera. The underlay swaps takes when the FILE changes; seven
takes cut from one recording are seven windows of one file, so at the
cut nothing swapped, the underlay played straight through the dead air
between takes, and the drift guard ("the speaker is the clock" under 2s)
never corrected it. Separate recordings never showed it.

- `preview-app.ts` (speaker branch of `syncMedia`): the active take is
  file + trim window; a new window on the same file seeks the underlay to
  its trim, once, at the cut.
- The render cuts the audio on the same trims in ffmpeg and is unaffected.

## 2026-09-16 — Build-from-board: the working copy goes away

Every build of an approved board (`generate mode:'full' + project_id`)
runs the pipeline in a fresh working-copy project, copies scenes,
components, voiceover and assets back onto the board's project, and left
the copy behind as a duplicate "generated" project in the tenant's list
(measured live: proj_0c242038 and proj_2c64fefc, one per build of
proj_9e650f1a). The job's result also named the twin, not the board.

- `server.ts` (`queueBuildFromStoryboard`): every reference into the copy's
  project dir (scenes, assets, speaker track -- b-roll, generated stills,
  the take) is retargeted to the original before the save; the copy is
  removed once every subdir copied (a failed copy keeps it, loudly); the
  result carries the original project.
- `test/build-from-board-cleanup.test.ts`.

## 2026-09-16 — creator-cut: the plate that hid every cutaway

The second rendered ad (proj_9e650f1a, rebuilt after #789) showed NO
cutaway at all -- label, sticker, person, and the mocks never appeared.
The plate added in #789 (`background:#fff` on a cut-in proof wrapper)
was glued onto the position style with no separator, so the wrapper's
style read `z-index:36background:#fff`; the browser dropped that whole
declaration, the wrapper fell to z auto, and the camera rig's own video
(z 0, later in the DOM) painted over it. The source-regex test passed
because the text was exactly what it asserted.

- `scene-assembler.ts`: the plate is its own declaration (`; background:#fff`).
- `test/creator-cut.test.ts`: assembles a real cut-in mock and asserts the
  emitted wrapper style carries BOTH `z-index:36` and the plate.
- `pipeline.ts`: the writer's shorthand (`enter: "cut"`) is read as the
  object form before the creator-cut defaults, so a cut with no time still
  lands at 30% and the last claim still ends on the person (measured: the
  close's mock arrived as the string, kept no time, cut in at frame 0 for
  the whole claim, and the film ended on the metrics screen).

Lesson: when a fix is a string in markup, the test renders the markup.

---

## 2026-09-16 — creator-cut: motion graphics are the proof by default, the camera moves by rule

The first live board (proj_6b42ee1c) asked for seven screen recordings
and cut to nothing, and authored no camera move on any of six scenes.
Marc: why are we obsessed with a screenshot when the library is full of
motion graphics -- default to those, let the user replace one; and the
voice runs the whole time, a cutaway is only what is on screen.

- **The proof is cast, not requested.** The writer stages the library mock
  that performs each claim as a CUTAWAY in `components[]`: `enter:
  {effect: "cut", at: "@word"}`, `exit: {effect: "cut", at: "@word"}`. The
  wrapper's entrance/exit `at` takes a word anchor like any data time
  (`extractAnchors`/`resolveComponent` walk `enter`/`exit` under an
  `enter.`/`exit.` path); `cut` is a choreography effect -- the fade pose
  played in 0.02s, no ease. A real screenshot/recording is an optional
  `assets[]` need; a provided file replaces the mock cut in on the same
  word (`replaceCutWindow`). "Never ask for a recording where a still
  would do."
- **A cutaway is not a takeover, not furniture, not zoomed.** A mock cut
  in for a beat is excluded from the takeover heuristic's surfaces (the
  scene stays over the person), exempt from the phone-reel mock drop, laid
  full-stage at z 36, and never phone-zoomed (`isCutaway` in
  scene-generator).
- **The writer nests enter/exit inside data.** The second live board
  (proj_55464519) cast a mock cut-in on every claim, and every one arrived
  as `data.enter` / `data.exit`, so the anchors were extracted from there
  and the wrapper never cut. `liftWrapperAnims` (core/word-anchors.ts)
  moves them beside data, in the normalizer (fresh boards, with a note)
  and in `extractAnchors` (saved boards at build); the schema now says "a
  sibling of data, never inside it". The same board also dropped the
  chapter label and the sticker on every scene and left the hook scene
  with no cast at all, so the contract now says every scene is cast with
  three objects, the first one too.
- **The first rendered creator-cut film** (proj_9e650f1a, one continuous
  recording cut into seven takes by the transcript, 32.5s). Marc's notes
  on the frames, all fixed: the camera showed through the corners of a
  cut-in mock (the Quotient mocks draw a floating window with margins) --
  a cut-in proof surface is now plated opaque in the assembler; the
  screens read too big on the vertical frame -- the framing scale drops
  from 2.2 to 1.5 columns' worth and the region sits higher; the chapter
  labels the writer cut in WITH the proof painted under it (same layer,
  later in the DOM) -- a cut-in that is not a proof surface lays at z 39;
  the close stayed on the metrics screen -- the last claim's proof cuts
  out 1.5s before the end so the film ends on the person; the camera rule
  emitted every move twice when a label and a mock cut in on one word --
  deduped. One definition of a proof surface (`PROOF_SURFACE_RE` in
  `core/asset-needs.ts`) now serves the pipeline, the generator and the
  assembler. And the take page's prompter moves to the top of the stage,
  by the lens: "you can see my eyes looking down in every take".
- **No standing header, by rule; unresolved cut words get the default
  window.** The rerun of the tutorial brief (proj_f308b321) obeyed the
  contract in every other way -- director calm and voice-only, every
  scene cast, a mock cut in on a word on every claim -- and put "Weekly
  Newsletter · Draft / · Editing / · Scheduled / · Sent" on all seven
  scenes: a title with a per-scene tail, and no chapter labels. The
  pipeline now strips a pill head shared by (nearly) every scene and keeps
  the tail as the chapter label (else the scene's name). Same board: a cut
  whose word was not in the lines resolved to 0 -- with both ends at 0, a
  cutaway for the whole claim -- so unresolved `enter.at` / `exit.at` on a
  cut get the 30% / 80% window instead.
  Verified on the build: DRAFT / EDITING / SCHEDULED / SENT, windows of
  1.2s and up, the calm camera on every scene. One tail was a lone dash
  and became a pill reading "—"; a tail with no letter or digit now falls
  back to the scene's name.
- **The contract stands alone; the build covers a writer miss.** The
  first unpinned test (proj_0f1e1b41, a tutorial brief, nothing pinned):
  the director chose creator-cut, 9x16 and calm from the brief alone, and
  the writer cast half the scenes with nothing, staged mocks with no cut
  window, and merged the label into the sticker. Cause: creator-cut
  inherited speaker's whole section, whose tall-frame law forbids app
  mocks on a phone -- the writer split the difference. Now creator-cut's
  section restates the six spine laws it shares (verbatim, pulled from
  the speaker section) and inherits nothing. And two build-time defaults
  in the pipeline's person-grammar loop: a mock in a creator-cut scene
  with no entrance is cut in from 30% to 80% of the claim
  (`CUTAWAY_MOCK_RE`), and a scene with no cast gets its chapter label
  from its own name. The director's bullet says a tutorial has no music
  bed (it had chosen "warm").
- **The person is the base before any take** (`personBase` in the
  pipeline: speaker_source, or clips on file, OR a person grammar). The
  third live board (proj_b04fb594) was built over the slate before Marc
  recorded, and because the base was decided from the clips on file it got
  the generic layout: a world backdrop under every scene (which buries the
  camera when the take lands), no bands around the face, the phone-reel
  rules off, app mocks kept as furniture. SPEC-take-flow says build order
  is free; now it is. Same build showed a storyboard that wrote nothing
  but `reset` on four scenes (treated as no camera, so the rule applies),
  cut windows of 0.5s (held open to `CUT_MIN` 1.2s at build), and a
  calendar performance framed on the brief (`pickAnchor` now reads the
  script's actions and `active_tab`).
- **The camera moves on the person by rule** (creator-cut only,
  `creatorCutCameraMoves` in the scene generator, once the cut windows are
  seconds): a claim with no authored moves gets a punch-in aimed at the
  face (scale 1.22 in 0.45s), the camera comes to rest on each cutaway
  and back to the person on its exit, and a claim of 3.5s or more pulls
  back on the turn; calm motion gets a slow push (1.1 over 2-4s). Speaker
  films are unchanged.
- **A cutaway mock on a tall frame is FRAMED on its region.** Probed in the
  assembler: a desktop mock at full frame on a 1080x1920 canvas filled the
  top quarter and left the rest empty, and the camera's anchored zoom could
  not help (it FITS a region, never crops one; a region as wide as the
  canvas fits at 1x). So the generator stamps `frame_anchor` (the region
  the mock's script performs in, else its first content region -- read from
  the component's own `data-anchor`s) on tall-frame cutaways, and the
  wrapper choreography scales and shifts the wrapper at the cut's first
  render: about two columns' worth of zoom, an overflowing region shown
  from its left edge and top, a fitting one centred, clamped so the
  wrapper always covers the frame. First render, not mount: the region may
  be a pane the mock's script only switches to later (the tasks tab was
  0x0 at t=0). Layout boxes, not client rects: the rig may be mid-zoom.

---

## 2026-09-16 — One Studio: the phone view is Studio, and it says what it needs

Marc ran the first creator-cut board and did not know the proof had been
asked for. The requests were there, one block per scene under the take's
Record and Upload, reading like notes; nothing at the top said "I need six
takes and seven screen recordings from you". And the page was a separate
thing called "the board" with its own URL, which he had taken for Studio on
a phone the whole time. His call: one Studio, and the phone version shows
only what you do on a phone.

- **`/board` is gone.** `/studio` serves the phone view (`studio-phone.ts`,
  was `board-page.ts`) when the user agent is a phone; `?desktop=1` forces
  the desktop app; the old `/board` address 301s to `/studio`. The take
  page links back to Studio. The word "board" for the page is retired
  ("storyboard" stays what it was).
- **Then moved out of the nav.** Marc, on seeing the desktop panel: "I
  expected it to be in the scene details, not in a section on the left
  nav." The desktop list is gone; each scene's card carries its own needs
  (`sceneNeedsHtml`: the draft view under the lines, the storyboard editor
  above its actions). The phone view keeps its summary at the top, since
  there the whole page is the list of what to do.
- **Needed from you, first.** Both views open with the list: the camera
  takes and each kind of proof, counted across the film, with how many are
  still to go. The phone view keeps Record / Upload per scene under it; the
  desktop Studio (`renderNeedsPanel`, top of the sidebar, before AND after
  a build) lists every need with Record (the booth, webcam) and Upload,
  through the same routes the phone uses (`upload-asset`, then `take` or
  `provide-asset`). Screenshots are made at the desk; that is where the
  Upload has to be.

---

## 2026-09-16 — creator-cut, phase 1: the ninth grammar, its contract, the proof on the board

`SPEC-creator-cut.md` (AGREED with Marc from two Instagram references: a
creator tutorial and a creator ad). A person explains and the SCREEN PROVES
it -- the person is the spine and the voice is the clock, as in `speaker`,
but the edit is busy: every claim names its evidence and the proof cuts in
full-frame and back.

- **The value.** `creator-cut` on `film_grammar` (director, writer, tool
  schema, MCP instructions, `SPEC-creative-axes.md`). Every gate that read
  `filmGrammar === "speaker"` now reads `personCarries()` from
  `core/take-needs.ts` (`PERSON_GRAMMARS = ["speaker", "creator-cut"]`), so
  the new grammar inherits the whole take flow -- needs, the booth, the
  measured spine, the face-aware layout, the takeover recipe, the cards, the
  board -- without a second copy of any of it. `creator-cut` inherits
  speaker's writer section the way hype-cut inherits tempo-cut's, and its
  own section states where the edit departs (one claim per scene, the
  screen proves every claim, no standing header, camera on the person, a
  sticker names the thing, CTA only when asked, ad vs tutorial on motion
  and length).
- **The proof, on the existing needs.** The first cut of this introduced
  a parallel `evidence[]` field mirrored into `assets[]`, and a `cutaway`
  component type. Marc: fewer concepts unless there is overwhelming
  evidence. Both folded. The writer emits the proof as entries on the
  scene's existing `assets[]` needs (type screenshot | screen_recording |
  stock_footage | mockup, description), and a need gains four optional
  fields: `use` cutaway | card, `at` / `until` word anchors, `focus`.
  `core/asset-needs.ts` normalizes what the writer wrote into full need
  records (human kinds "recommended", the build's kinds "nice_to_have"
  until in-house generation lands); a hydrated board's needs pass through
  intact. Proof never blocks the build. The board lists every non-take
  need under its claim with Upload; the file goes through
  `/api/upload-asset` and `POST /api/provide-asset/{t}/{p}` (the HTTP twin
  of the update tool's `provide_asset`) fills it, with the take's
  asset-dir guard.
- **The cut, on the existing image and video.** A provided file becomes
  the existing `image` or `video` component, full-bleed, with `at` /
  `exit_at`. On those two components a timed window is a HARD cut -- no
  fade either side, the cut is the rhythm (sub-frame tweens, not `set()`,
  which renders on creation when placed later in a timeline; measured in
  an assembler probe). A still gets a slow push over its window; a clip
  plays from its own start (negative `data-start-at`, the capture's seek
  math clamps at 0). Cast in the pipeline before the spine pass so its
  anchors resolve with everyone else's; a full-bleed image or video is the
  proof layer in the layout (full stage at z 36, under the stage overlays,
  never re-slotted into a band, never phone-zoomed). `storyboardToSaved`
  now carries `assets` -- it wrote `assets: []`, which would have thrown
  every uploaded file away on the way back to disk after a build-from-board.
- **Not yet (phase 2).** Captions from the take's words, the evidence card,
  the focus drawn on the cutaway, b-roll and mocks made in-house, the
  tall-frame layout under the busy edit.

---

## 2026-09-15 — The booth, second round: back to the board, de-air, soft look

From Marc's notes after the fresh two-scene run:
- **Back to the board.** The take page had no way back except the browser
  button. The ready screen links back; the done screen's primary action is
  "Back to the board" (desktop Studio moved to a secondary button).
- **De-air.** Every take ends with the reach for the stop button and starts
  with a breath. The transcript already knows when the first and last words
  were said, so the attach step trims the clip to speech: first word minus
  0.35s, last word plus 0.45s (`deAirWindow` in `core/measured-spine.ts`),
  never more than 6s off either end (a transcript that missed the ending must
  not lose it). Record-all windows are tightened the same way. The trims ride
  on the take and its clip; the base builder already honours them.
- **Soft look.** A gentle grade at ingest -- temporal denoise that smooths
  skin without blurring edges, a touch of warmth and contrast
  (`SOFT_LOOK_FILTER` in `core/take-sanitize.ts`). On by default on the take
  page (a toggle), applied to board uploads, recorded as `take.look`.

## 2026-09-15 — Tall speaker frames: stack over the chest, phone-scale type

Both live 9x16 speaker films came out of the recipe with the WIDE speaker
layout: a 35%-wide right-third dock (a 378px sliver on a 1080 canvas), 17-44px
type designed for a desktop frame, and floating pills drifting across the
face. The first film only looked right because every overlay was placed by
hand; the two-scene test (`proj_234d8a01`) showed the raw output.

`authoredLayout` gains a TALL SPEAKER branch (`vertical && speaker &&
!takeover`): surfaces, heroes and captions stack FULL-WIDTH in two bands that
miss a phone selfie's face (about 22-68% of the height on both live takes) --
the LOWER band over the chest (58-82%) first, the TOP band under the platform
strip (13-30%) when the lower one is full; accents take the corners of those
bands; floating pills drift in the lower band. Four fixed-pixel components
(`sticker-prop`, `prop-strike`, `floating-pills`, `composer`) gained a `scale`
field (CSS zoom on their root); the authored-scene builder sets 1.8 on a tall
speaker frame when the board did not, and gives `auto-tagged-link` 72px. The
wide layout is untouched.

Second pass after the fresh two-scene run (`proj_7c8380c5`, chest-up at eye
level): the chin sits near 65%, so the lower band is now ONE row at 68-82%
and the top band takes the next two; accents sit in the top corners; pills
drift at 66-82% and keep their whole label inside the box. A position the
board wrote no longer wins on a tall speaker frame (its composer grew to 26%
and covered the list under it); a `text-list` becomes one plated caption
phrase (it was 44px dark slide text on his chin).

Not done: reading the face's actual band from the take (a low camera in bed
puts the face at 70% of the height; the bands are fixed for now).

## 2026-09-15 — The take flow, phase 1: needs, per-scene takes, the take job

`SPEC-take-flow.md` (agreed with Marc after the first two live takes). The take
was a dead end: it attached and nothing knew. Phase 1 gives it a place in the
model and something for the agent to wait on.

- **Needs.** A `speaker` board declares one `camera_video` need per scene with
  spoken lines (`recording_instructions` = the script), emitted
  deterministically after every storyboard save (`core/take-needs.ts`,
  `ensureSpeakerNeeds`). The concept already existed on `StoryboardScene.assets`
  and was rendered nowhere; it is now the fulfilment target.
- **Per-scene takes.** `project.take` -> `project.takes[]` (migrated), one
  ACTIVE per scene = the clip `speaker_track` carries; `SpeakerTrackClip`
  gained `scene_index`. `POST /api/take` takes `scene_index` (default: first
  open need), replaces that scene's clip, keeps every record, flips the need
  to provided. `/take?scene=N` prompts one scene's lines.
- **The `take` tool + job.** `take(project_id, scene_index?)` returns the
  Studio link, the booth link, the open needs and the script, and queues a
  `take` job that completes when the take attaches (waiters in
  `core/take-needs.ts`, released by the attach handler). Same poll contract as
  generate/render. Jobs are in-memory: a reload drops the waiter, the need on
  disk survives, the agent re-asks.
- **One ingest.** `add`/`update` with `speaker_track` now run the same
  sanitizer as the page on this project's own assets.

**Phase 2 (same PR): word anchors + the measured spine.** A component time
may be authored as a word in the scene's script -- `{"word": "dashboard"}` or
`"@dashboard"` (options: occurrence, edge start|end, offset) -- at any depth of
`data` (`at`, `send_at`, `phrases[1].start`, `script[3].at`). `core/word-anchors.ts`
lifts them into `component.anchors` (by data path) and resolves them into the
numeric field, so every renderer stays numeric. Two spines, one resolver:
ASSERTED (script words spread over the estimated duration by character
weight) at build, MEASURED (the take's whisper words, repaired like the Studio
lane) at attach -- `core/measured-spine.ts`. The build resolves anchors for
every speaker scene (`pipeline.ts`, before the takeover pass); `POST /api/take`
transcribes the take, makes it the scene's clock (duration = take length)
and re-resolves the storyboard entry AND the built scene, so create-before-
take and take-before-create are the same code path. A number set by hand in
Studio drops the anchor it overrides. The storyboard builder's SPEAKER block
now asks for anchors instead of seconds. `scene.spine` records which clock the
scene was last resolved against.

**Phase 3 (same PR): the board in your hand.** `/board?tenant&project&token`
(`src/board-page.ts`): one card per storyboard scene -- still, script, the
take need as a pill, Record (the booth for THAT scene) and Upload (the same
push path as the booth, attached with `scene_index`). "Record all" runs the
booth through every scene (`/take?scene=all`); the attach handler transcribes
once, cuts the recording where each scene's script begins
(`splitByScripts`, second-word confirmation, proportional fallback), and
attaches one WINDOWED take per scene (`trim_start/trim_end` on the take and
its clip; the base builder already honours trims; the spine re-bases the
words to the window). Build is enabled once every need is filled, Render once
built, both poll their job; a rendered film plays inline. `/studio` on a phone
302s to `/board` (`?desktop=1` forces the desktop app), so the one link Marc
passes around is still the Studio link. Verified in a headless iPhone against
a local server; the real phone is Marc's next test.

Live exit test after the merge (`take` tool on `proj_c210e5e1` through an MCP
client: tool present, job queued, links and script returned) caught two
things: a clip saved before per-scene takes carried no `scene_index`, so the
attached take read as "needed" (migration now stamps it -- #760); and a
WAITING take job counted as a job in flight, which blocked every auto-deploy
while a booth link was open. The deploy guard now ignores `take` jobs (a wait,
not work) and the job route reports them as `waiting`, not `rendering`.

**First real two-scene run (`proj_234d8a01`, Marc on his iPhone).** The
storyboard LLM wrote word anchors for all seven overlays unprompted; the
take job woke on arrival; Record-all's transcript cut landed exactly where
scene 2 begins. Three defects, all fixed the same hour:
- `/take?scene=N` prompted the WHOLE board: the page is a template literal
  and the `\d` in its scene-param regex reached the browser as `d`. Marc read
  both scenes into scene 1's take, then read scene 1 again for scene 2. The
  test now asserts on the served HTML, not the source.
- The build's copy-back was WIPED by a stale attach: the attach handler held a
  loaded project across sanitize + whisper (tens of seconds) and saved last.
  The handler now does the file work first (and primes the transcript cache),
  then loads, attaches, re-times and saves within milliseconds.
- `take.loudness.measured_lufs` read 0 on every take: the ebur128 summary
  line differs on the droplet's ffmpeg 4.x. Measurement now comes from
  loudnorm's own first pass, the numbers the normalizing pass already used.
Also seen, not yet fixed: an anchor to a word the LLM did not put in its own
script ("juggle") resolves to 0 (the storyboard prompt already forbids it;
a fuzzy fallback is the next step), and whisper hearing "Quotient" as
"question" defeats the "Quotient" anchor on one take.

Not built: a project- or need-scoped token for handing a link to someone who
is not the tenant (design it in when a second human records); the desktop
Studio still reads `speaker_track.clips[0]` only (a multi-scene speaker film
shows its first clip in the desktop lane); auto-build on arrival.

## 2026-09-15 — Take ingest sanitizer (orientation baked, reframe, loudness)

First real iPhone run of `/take` (`proj_c210e5e1`, 17s): recorded, uploaded and
attached cleanly. Two things the file needed, and one thing I got wrong on the
way.

**The file.** iOS Safari's MediaRecorder stored the sensor's LANDSCAPE frame
sideways in a 1080x1920 buffer with a -90 degree display matrix; the voice sat
at -35.7 LUFS. The phone's live preview had shown Marc a portrait cover-crop of
that landscape stream, so the honest picture is wider than what he framed.

**The wrong turn (PRs #756, #757).** I read the matrix as spurious ("frames
already upright, tag double-rotates") from a thumbnail, and stripped it. The
tag was honest: honoring it gives the upright landscape picture; stripping it
put the speaker on his side in the render, which Marc caught from the MP4.
Lesson written down so it stays written: judge orientation at full size, and
treat a container rotation tag as a claim to VERIFY by decoding, never as a
defect to remove.

**What it does now** (`core/take-sanitize.ts`, run once in `POST /api/take`,
in place):
- bakes the rotation tag into the frames (ffmpeg autorotate on decode,
  re-encode, identity matrix out) so ffmpeg, Chromium and the muxer agree;
- when the upright take is WIDER than the film's canvas, crops the center
  column at the canvas aspect and scales to the canvas -- the frame the phone
  showed the speaker. A take taller than the canvas is left alone;
- normalizes the voice to -16 LUFS (two-pass linear loudnorm);
- reports `rotation_baked`, `reframed`, `loudness` on `project.take`.
Probing is one `ffmpeg -i` stderr parse (no ffprobe on static builds).

**The page.** `/take` now records a portrait CANVAS: the live `<video>` is
drawn cover-cropped into a 1080x1920 canvas each frame and
`canvas.captureStream()` + the mic track feed the MediaRecorder, so the file
carries true portrait pixels at full resolution and no rotation tag. Falls back
to the raw track where `captureStream` is missing; `take.capture` says which.
Untested on a real iPhone at merge time -- Marc's next take is the test.

Same run, second bug, in the build: every `generateScene` call site set
`hasSpeakerTrack: !!opts.speaker_source`, so a project whose take was attached
AFTER the board (the script-first flow the take page exists for) built with
no speaker base -- the recipe painted a full-bleed mesh backdrop over Marc.
The pipeline already knew (`pipelineHasNarration` gates TTS and the `speaker`
grammar default from the loaded project); the four sites now read it too.

Not covered: takes attached by hand through the `add` tool (they never pass
this endpoint); final-MIX loudness (-14 LUFS) -- still the separate PR; the
speaker recipe's dock layout and fixed-px sticker/strike type on a 9x16
canvas (this cut was placed by hand; `reel-caption-lane` carried the words).

## 2026-09-14 — FRAME axis; `social-reel` deleted; `speaker-screencast` split

`SPEC-format-and-spine.md`. A storyboard for a performed 15-second vertical ad
came back with `voiceover_text` null on every scene (proj_ddca872c): the
`social-reel` contract forbade the field. Its own first line said "the FORMAT
carries the film" -- a delivery surface filed in the axis whose every other
value names what carries the ARGUMENT. Seven of its ten rules were phone-screen
or feed consequences; the two that were not were the two that broke.

- **`frame`** is the fourth axis: `16x9 | 9x16 | 4x5 | 1x1`. A size and the
  bands a platform draws over -- no duration, no story shape. Pinnable on
  `generate`/`create`; the director infers it from where the prompt says the
  film ships; explicit `canvas_width/height` override it. `canvas.preset` is
  gone (`canvas.frame` replaces it; on-disk projects migrate on load).
- **`social-reel` is deleted**, not aliased -- from the type, the enum, the
  director's prose, the builder's contract block, the scene band, the length
  discipline, the tool schema and the MCP instructions. Its measured
  vertical-composition laws moved to a FRAME block in the builder's universal
  preamble, gated on the canvas being tall, so they fire for ANY grammar --
  citations (`proj_56358b25`) carried verbatim. Its story arc already
  existed as `hype-cut`'s; its no-voiceover rule was the bug.
- **`speaker-screencast` split**: `screencast` (the screen carries it; the
  narrator drives the clock, on camera in a bubble or voice-only -- the
  `screencast_source` assemble path lands here) and `speaker` (a person
  carries it; full-bleed, graphics over them, `voiceover_text` required).
  The "only choose it when a recording exists" rule is deleted: `speaker` is
  chosen at script time as often as after a take. The `st-speaker-screencast`
  scene-template COMPONENT keeps its name -- components are a different
  namespace and on-disk scenes reference it.
- Spine is named in the spec as an internal concept (what the beats are
  indexed by: bars, sentences, places, figures) and never a parameter.
  Asserted vs measured spines are what make script-first production work;
  that is Phase 2.
- Known risk, called in the spec: the vertical laws were tuned inside one
  grammar and now fire against grammars that never had to obey a frame.
  Exit tests: `speaker`+`9x16` on the proj_ddca872c brief, `hype-cut`+`9x16`,
  `tempo-cut`+`16x9` as the landscape control.

## 2026-07-19 — Words-lag-audio drift: the cache shift ran on RAW words (PR #435)

Marc: after cutting, "the words in speaker track are way behind what the
actual track sounds like." Live repro (proj_7b064560): cutting the 9s
silence tore out "a social post example. Great. Here we go. All right,"
and produced non-monotonic times. Root cause: the transcript-cache shift
ran on RAW whisper words -- which are SMEARED ACROSS silences -- while
users cut on the SNAPPED clock the lane shows; dropping the cut span ate
words the snap had rescued. Fix: the cut route snaps the cached words
against the OLD bake's silences before `shiftWordsForCut` (mid-based,
seam-clamped); the client in-memory shift matches;
`GET /api/speaker-transcript?fresh=1` drops a damaged cache (used to heal
proj_2b5f790e). Rule of thumb recorded: ANY consumer that edits word
times must operate on the snapped clock, never raw whisper output.

## 2026-07-19 — RE-FIT model + speaker piece editing (design: Marc; ROADMAP #8 amended)

Marc, on cutting 9s of recorded silence: "I would not want you to also cut
9s from the media. I would want you to adjust things bc they are pinned in
the media track but not also delete the same 9s from the media clip."
That replaced the linked mirror-cut model shipped the day before.

- **applySpeakerCut rewritten (re-fit):** a speaker cut removes TIME, never
  screen content. Screen targets keep every frame and RE-SOLVE into the
  shorter scene through pins: an implicit anchor at the cut seam (sync is
  frozen up to it) + a terminal anchor at the new scene end (remaining
  footage compresses to fit), both tagged `auto: refit-<src>` /
  `refit-end` so restore can lift them; user pins ride their words left.
  FOLLOWERS (the camera bubble = the voice's own take) still mirror the
  cut in source terms — lips must lose what the voice lost. "Cut both" as
  a speaker option is REJECTED (flubbed screen action → user cuts the
  screen lane themselves). Assembly-time idle∩silence stays cut-both.
  Note: re-fit is timelapse-over-silence by another door — cutting silent
  talk now compresses the screen through the gap instead of deleting it.
- **applySpeakerRestore (reverse referee):** removes the cut, film grows at
  the seam, this cut's anchors lifted, user pins/captions/spine/cues shift
  right, follower cut removed, screens relax, bake re-derived (zero cuts →
  narration repoints at the original take, no bake). Route:
  `POST /api/speaker-restore {src_start, src_end}`.
- **Studio speaker pieces = the media-lane interaction** (Marc: "shouldn't
  we just make it the same as we have for media?"): click the clip (or a
  piece between split markers) → popover with ▶ Play this piece (arms a
  `_stopAt` audition stop), Split at playhead, 🗑 Remove this piece; ✂
  seams → Restore popover. Split markers are session-local sketch lines
  (bake clock) cleared on any edit. Shift-click words still cuts;
  word-cut + piece-remove share one `speakerCutRequest`/`afterSpeakerEdit`
  path (invalidates wave/transcript caches, reloads). 🔗 badge now means
  voice↔camera (the screen re-fits, it doesn't mirror).
- Backlogged selection sugar: click-the-gap (silence auto-select) and
  drag-select (see ROADMAP backlog).

## 2026-07-18 — Timeline v2: Marc's layout pass (PR #425)

Marc on the merged lanes: "good, not great... icons not words, stationary...
timeline at top or bottom... visual separation is kinda crap... would you
even show those tracks?" The layout is now:

- **Lane order SCREEN / SPEAKER / MUSIC top-to-bottom**, each on its own
  bordered lane bed; the **ruler+scrubber is a distinct TOP band**
  (Descript-style) with a playhead line dropping through every lane.
- **Stationary inline-SVG icons** (screen / person / note) in a fixed left
  gutter OUTSIDE the scroller — always visible, always aligned, at any
  scroll/zoom. The 🔗 linked badge lives in the gutter under the speaker
  icon (lane state, not a clock moment).
- **Conditional lanes**: `laneLayout()` computes tops from what the film
  has; no speaker / no music → lane absent, strip shrinks (verified on
  proj_2ad23344, which has no audio at all → ruler + screen only).
- Known trade-off: beat-films (no voiceover) no longer show storyboard
  beat text in a words lane — no speaker, no speaker lane. The text
  remains in the scene list; revisit if scrub-by-script is missed.

## 2026-07-18 — Merged speaker lane + wave-strip zoom bug (PRs #421, #422, #423)

The full stage-3 promise from ROADMAP #8: the speaker's four scattered
timeline artifacts (voiceover audio-line, waveform strip, word lane, camera
row) now read as ONE speaker lane.

- **`.spk-clip` block** spans where the voice sits on the film clock (clip
  `at` + narration element duration; falls back to film end until metadata
  loads); inserted below the waveform + words in stacking order so they read
  as content OF the clip. Speaker EDL cuts draw as ✂ seams at their film
  positions (source→bake→film through prior cuts). The orange voiceover
  audio-lane line is suppressed when a speaker lane exists.
- **Wave-strip zoom bug (pre-existing, exposed by the lane):** a canvas's
  `width` attribute over-constrains `left:0;right:0`, so `#wave-strip`'s
  rect stayed at the UNZOOMED width — at any timeline zoom the whole wave
  squeezed into the film's first ~10% while words/blocks spread. Found by
  bitmap-probing the live page (headless chromium via the tunnel): canvas
  cssW 901px vs track 9405px. Fix: size bitmap AND css width from
  `#timeline-track` each draw (#423). Peaks also now fetch once per project
  and draw synchronously (#422) — fetch-in-the-draw could resolve out of
  order; the word-cut success path invalidates peaks + transcript caches.
- Verified on proj_2b5f790e (regenerated from the 7/18 camera recording
  with the new pipeline: speaker EDL + snapped captions) — screenshot
  audit: block at 4.84%, 1 speaker seam, labels, 🔗, 207 words, camera
  row suppressed, intro region clean.
- Known gap (deliberate): restoring a SCREEN cut via its ✂ popover on a
  linked film edits only the screen list (speaker keeps the time) — the
  reverse referee (reinsert time everywhere) doesn't exist yet. Unlink /
  restore flows are future work.

## 2026-07-18 — "Voice and camera not playing" debug: stale JS + whisper silence-smear (PRs #418, #419)

Marc reported proj_34d1497c playing without voice or camera. Remote debugging
from the sandbox (agent-proxy notes below), two real findings:

- **Playback itself was fine** — the report was a stale pre-deploy Studio tab;
  a hard refresh fixed it. What made it undiagnosable was that a rejected
  `play()` was only logged under `__MP_SYNCDEBUG`. **PR #418**: `[play-fail]`
  is now always logged (once per element), and `reportMediaHealth` ships a
  per-element snapshot (readyState/currentTime/paused/volume/error) to the
  session log at play+2.5s and play+10s. A silent-playback report is now a
  one-line remote read.
- **Whisper smears word timestamps across long pauses** (PR #419). The film's
  baked narration is silent 71.95–81.30s, but whisper timestamped ten words
  ("and a social post example. Great. Here we go. All right,") evenly across
  the gap — the word lane and captions promised speech over dead air, and
  word-anchored edits (pins, speaker cuts) would aim at silence. Fix:
  `snapWordsOutOfSilences` (transcribe.ts) uses ffmpeg silencedetect spans as
  ground truth — words with midpoints inside a ≥1.5s silence are pulled to
  real speech, sentence-aware (through the last sentence-terminal → close the
  sentence BEFORE the pause; the rest → open the one AFTER); edge-straddlers
  clamp. Applied in `getSentenceSpine` (assembly captions) and
  `/api/speaker-transcript` (Studio lane + word-cutting). Regression test
  from the film's literal numbers in `test/word-snap.test.ts`.
- The film's remaining 9.4s of dead air is REAL (screen busy, speaker quiet —
  idle∩silence correctly kept it). The systemic answer stays parked:
  timelapse-over-silence (speed the screen through voice gaps).

**Sandbox remote-debugging notes** (cost an hour, don't rediscover):
- The agent proxy 502s ANY tunneled request carrying an `Authorization`
  header (even garbage, even /health) — Studio also auths via `?token=`, so
  strip the header when forwarding. A local CONNECT-tunnel forwarder
  (scratchpad `forward.js`: http server → CONNECT → droplet, Host rewritten
  to match the CONNECT target, retries on transient 5xx) lets headless
  Chromium drive the live droplet Studio.
- `/opt/pw-browsers/chromium` has NO AAC/H.264 — `DEMUXER_ERROR_NO_SUPPORTED_
  STREAMS` on m4a/mp4 is the sandbox browser, not the app; VP9/mp3 play.

## 2026-07-18 — Symmetric speaker EDL stages 2–4: the referee + word-cutting (ROADMAP #8)

Stage 1 made the speaker lane declarative (EDL truth, bake as cache). These
stages make it EDITABLE and make the timeline read as tracks.

- **`applySpeakerCut(project, filmFrom, filmTo)`** (`speaker-edl.ts`) — the
  referee. ONE atomic op: "remove this span of FILM time." The speaker is
  the master clock, so a speaker cut removes time itself; the op writes every
  consequence in one pass: speaker cut mapped film→bake→ORIGINAL source
  through existing kept spans (`bakeToSourceTime`), same film span mapped
  through every media_edits target's OWN segments to its OWN source clock
  (so a cut through an 8× timelapse window removes the wider source span),
  re-solve + pin-drop, scene duration shrink, caption/chapter shift
  (scene-local), spine shift (bake clock), booth-script cue shift (film
  clock), and a re-derived bake via `ensureSpeakerDerived`. Route:
  `POST /api/speaker-cut/{tenant}/{project}` `{from,to}` → result + saved
  project. Tests: `test/speaker-cut.test.ts` (mapping through existing cuts,
  timelapse-region widening, one-pass consequence audit, scene-bounds guard).
- **Stage 3, Studio lanes** (`preview-app.ts`): gutter labels name the rows
  (`screen` / `speaker` / `music`); the camera bubble's video is suppressed
  from the SCREEN rows (it's a FOLLOWER of the speaker lane, matched by
  speaker-clip source filename); a **🔗 linked** badge shows when speaker and
  screencast cut lists are identical — the recorder's shared-cut convention
  made visible.
- **Stage 4, word-cutting**: shift-click the first and last word in the
  transcript lane → ✂ Cut button for the span (+60ms pad each side) → POST
  speaker-cut → project reloads with voice, screen, captions and duration
  all rippled. Plain click still scrubs + opens the pin picker.
- **Clock fix found while wiring**: transcript + waveform times are
  FILE-relative, but Mode A narration is placed at `clip.at` (after the
  6.1s intro) — the word lane and wave strip drew everything ~6s left of
  reality on recorder films. `speakerFilmOffset()` (speaker clip `at`, else
  narration `start_time`) now shifts word placement, the wave strip, and the
  cut span sent to the referee.
- Gotcha for future studio edits: the Studio app is ONE template literal —
  a backtick inside a comment terminates it (tsc error pages away from the
  real cause). Parse-check the emitted `<script>` after edits.

## 2026-07-18 — First-contact hardening (the day real use found the plumbing)

Four bugs, one pattern: detection worked, the joint between stages dropped
the result. All found by real recordings, none by tests-in-isolation.

- **Duration-less MediaRecorder files**: Chrome writes no duration header;
  probes read 0 and "empty recording" surfaced three layers away. Remux at
  ingest + probe fallback to `ffmpeg -i` parsing (envs without ffprobe).
- **Upload ordering vs intel**: video intel analyzes before the events
  sidecar arrives, so tab captures got static-band trims of their own UI
  (271px of product sidebar read as "chrome"). recorder-events now
  re-refines saved intel on sidecar arrival (`refineSavedIntelForRecorder`).
- **Idle-range shape mismatch**: sidecar idle is `{start,end}`; the Mode A
  cut intersector read `{from,to}` -- every live-narrated film shipped
  uncut while logs showed perfect detection. Regression test drives the
  real shapes end-to-end.
- **MP_AUTO_CALLOUTS resurrection**: the parked feature's env-flag gate was
  still set in the droplet's `/etc/media-producer/env` -- parked features
  must be re-enabled by code change, not config residue. Auto-invocation
  deleted outright.
- **GOTCHA (open, systemic): deploys kill in-flight generations.**
  `recorder-generate` work runs fire-and-forget inside the server process;
  a CD deploy restarts pm2 and the assembly dies silently, leaving a draft
  shell (same class as the render-clobber gotcha). Don't merge while an
  assembly is in flight; product fix = restart-surviving job queue or
  deploy draining.
- **Recorder recipe v2** shipped the same day: brand backdrop + macOS
  browser frame (chrome bar shows the recorded host from the sidecar),
  ~matted at 96% width, crop:"auto". Deterministic component config -- the
  matte also makes crop imprecision invisible in a way full-bleed never did.
- **Backlogged**: editable cuts on narrated films with audio re-derive +
  independent speaker/media cut editing (ROADMAP second tier).

---

## 2026-07-18 — Recorder complete: teleprompter, Mode A, closed loop

All three spec modes now exist. This slice:

- **Booth teleprompter** (`booth-script.ts` + `/api/booth-script` +
  Studio prompter bar): the LLM drafts narration cues TIMED TO THE CUT --
  it sees real-time vs timelapse spans, sidecar pages/clicks/chapter marks
  mapped src→film through the EDL, and budgets ~2.4 words/sec per span.
  Editable in the booth (`[m:ss] text` lines); prompter shows current+next
  cue with 1.2s lead, driven by the film clock (pauses with pause). Since
  the script is known, captions stop depending on whisper's hearing.
- **Mode A — narrate live while demoing** (`assembleLiveNarration`): mic
  muxed onto the tab recording's clock (vp9+opus, one file). Cuts =
  sidecar idle ∩ ffmpeg silencedetect, shrunk 0.35s, min 2.5s — applied as
  HARD CUTS to video (EDL) and audio (atrim/concat → standalone m4a
  narration track) so A/V sync survives by construction; v1 deliberately
  skips timelapse (would chipmunk/desync the embedded voice — future
  polish is atempo over silent spans). `attachBoothNarration` gained
  `narrationStartsAt` so live narration (starts WITH the demo) and booth
  takes (start at film 0) share one attach path. Signalled by
  `narration_embedded` → `speaker_source === screencast_source`.
  Teleprompter opens in a SEPARATE window — tab capture films the tab, an
  in-page overlay would be in the film.
- **Booth pause = breather** (earlier same day): transport pause pauses
  the MediaRecorder; play resumes both; scrub-while-paused flags a desync
  warning. And MediaRecorder blobs (no duration header — Chrome quirk) are
  remuxed on arrival, fixing "narration take is empty or unreadable".
- **Closed loop**: after generate, the offscreen doc polls the projects
  list and notifies with a clickable Studio link (notification click opens
  the film; popup shows the link). Extension 0.5.0; 0.4.0 pinned the
  extension ID via manifest `key` so settings survive reinstalls.
- **Secure-context guard**: Studio on bare-IP http has no
  `navigator.mediaDevices`; the booth explains the
  `unsafely-treat-insecure-origin-as-secure` workaround instead of
  crashing. Real fix (domain + TLS) is on the roadmap.

---

## 2026-07-17 — Mode B narration booth (SPEC-recorder.md, MVP step 2)

First live extension recording worked end-to-end same day (proj_cac63a35:
74s tab recording → 27s sidecar-compressed cut, zero pixel decoding). Mode B
lands on top of it — narrate AGAINST the locked cut, so the "voice recorded
separately vs. video needs condensing" conflict can't exist:

- **`attachBoothNarration`** (`narrated-screencast.ts`): lays a booth take
  onto an assembled project. Picture is LOCKED — scenes, durations and media
  edits untouched, no fit-solve, no pins (the take was performed to the cut,
  sync is by construction). Attaches: narration track (replaces prior take;
  retake-idempotent), whisper spine → captions + chapter cards (scene-local
  offset past the intro; captions spoken during the intro drop), ducked
  instrumental bed (picked once, kept across retakes), `project.spine`.
  Tested with mocked probes (`test/booth-attach.test.ts`).
- **Route** `POST /api/booth-narration/{tenant}/{project}?name=` — raw audio
  body (MediaRecorder webm/opus), saves the take as a project asset, runs the
  attach synchronously (whisper on a booth-length take is seconds).
- **Studio booth UI** (`preview-app.ts`): 🎙 Narrate button (shown when the
  film has a screencast scene) → bottom-right booth card: mic permission →
  3-2-1 countdown → seeks to 0 and plays the film with ALL program audio
  muted while MediaRecorder records → auto-stops at film end → review with
  audio playback → Use take / Retake / Discard → upload + reload. Program
  mute is re-asserted every monitor tick (audio elements can be rebuilt).
- **Extension popup** now reacts to live upload status (runtime broadcast +
  storage.session change listener) instead of freezing on "uploading…".

Punch-in retakes (re-record from a timeline point) deferred; whole-take
retake is cheap at walkthrough lengths. Next slice: Mode A (live mic +
idle∩silence compression + teleprompter).

---

## 2026-07-17 — Quotient Recorder foundation (SPEC-recorder.md, MVP step 1)

Record → Stop → the film assembles itself. First slice of the recorder:

- **`recorder-extension/`** — MV3 Chrome extension, no build step. Popup
  (server/tenant/token config + record/stop), background orchestrator
  (tabCapture stream id, event collection on the recording clock, idle
  derivation from activity marks), offscreen doc (MediaRecorder WebM/VP9 +
  uploads directly: video → events sidecar → trigger generate), content
  script (clicks with element boxes + accessible names, SPA navigations via
  history hooks, DOM-mutation activity pings, ⌘/Ctrl+Shift+N chapter marks).
- **`src/core/recorder-events.ts`** — sidecar types + `eventsToMotionIntel`
  (pure, tested): idle ranges ← mutationsIdle, transitions ← navigations,
  focus ← clicked-element boxes as viewport fractions (devicePixelRatio-safe).
- **`ensureMotionIntel` prefers the sidecar** over every pixel heuristic and
  skips the decode entirely — compression + chapter pins upgrade to ground
  truth with zero changes elsewhere. Heuristics remain the Mode-C fallback.
- **Routes**: `POST /api/recorder-events/{tenant}/{project}?name=` (store
  sidecar + convert to intel immediately), `POST /api/recorder-generate/
  {tenant}` (fire-and-forget speaker-screencast assemble).

Next slices per spec: Mode B booth (narrate against the compressed cut),
then Mode A (live mic + idle∩silence compression + teleprompter).

---

## 2026-07-17 — Auto-callouts PARKED (feature off by default)

After six iterations in one day, auto-callouts still shipped boxes that miss
on real footage — set aside deliberately rather than polished forever. The
machinery is intact (`vision-grounding.ts` groundCallouts, `callout-plan.ts`,
focus events, tests) behind **`MP_AUTO_CALLOUTS=1`**; the assemble path skips
it by default. Manual callouts via screencast-frame `data.callouts` still
work and render beautifully — the RENDERER was never the problem.

**What we learned (start here on the retry):**
1. Claude models answer bounding boxes in PIXELS of the shown image no matter
   how the prompt demands percentages (computer-use training). Ask in pixels,
   convert. This part is solved.
2. Rendering/geometry is pixel-exact (verified with the layout probe): ring,
   zoom-clone crop, source→screen mapping all correct. Never re-debug those.
3. The hard problem is TIME × SEMANTICS: cues land at content-change moments;
   through a ~3-4x timelapse, fractions of a second of output cross content
   seams; and the narrator references things that aren't on screen yet
   ("it will draft the template" = future tense). Frame-sampling strategies
   (start/end verification, shift-late) reduced but did not eliminate misses.
4. Verification passes don't converge: the verifier judges a static frame,
   the viewer judges motion. Whatever ships next must be validated against
   the RENDERED WINDOW (e.g. a filmstrip of 3-4 frames judged together), or
   anchor callouts to UI elements tracked across frames, not to boxes.

**Promising directions for the retry:** filmstrip verification (one call, all
window frames); anchoring on idle stretches only (static by definition);
element-level tracking; or making callouts a Studio-first manual feature with
vision as a suggestion UI (human confirms before it ships).

---

## 2026-07-17 — Vision grounding: pins and callouts get eyes

Motion analysis sees THAT pixels changed, never WHAT they are — the root
cause of both watch-test complaints (pins too conservative, callouts
arbitrary). `src/llm/vision-grounding.ts` adds a small-model vision pass at
the two decision points of the assemble step:

- **`groundChapterPins`** — for each boundary the motion pass left unpinned,
  extract stills just after the candidate seams in a **±30s** window (wide is
  safe now: a model verifies) and ask which screen — if any — is what the
  chapter's opening narration describes. `{"match":"none"}` is valid and
  common. Confident matches merge with the motion pins (monotonic-checked,
  re-solved, strain-reverted).
- **`groundCallouts`** — for each action-cue sentence, extract the frame at
  that mapped moment and ask for the bounding box of the element the
  narrator names, or `found:false`. Replaces the motion-only callouts when
  an LLM is configured; motion heuristic remains the no-LLM fallback.

Model: `MP_VISION_MODEL` (default `claude-haiku-4-5`); ~10–15 small calls
per assemble. Character preserved: vision only grounds proposals, no
confident answer → nothing ships, everything stays editable in Studio, and
every failure degrades to the motion-only behavior.

---

## 2026-07-17 — Watch-test fixes: real ducking in Studio, instrumental bed, median callout boxes

First human watch of the full recipe surfaced three defects:

- **Studio preview ducking used `ducked_volume` as an ABSOLUTE level** while
  the render mixer applies it as a relative multiplier -- so "ducking" RAISED
  a 0.22 bed to 0.35 for the whole narration. Preview now matches the mixer
  (base × ducked_volume). Renders were always correct.
- **Bed with lyrics fights the narrator**: `selectMusic` gained
  `instrumental: true` (Jamendo `vocalinstrumental=instrumental`); the
  narrated bed uses it, volume trimmed to 0.18.
- **Callout boxes were union-inflated**: a long focus run accumulated every
  stray flicker until the box hit the size caps (all four proposals at h=56%).
  Focus events now emit the MEDIAN per-second box (typical activity region),
  per-second concentration cap 0.2, event area cap 0.16, callout caps 50/45%.
- Sidecar cache versioned (`motion_v`, MOTION_INTEL_V=2) so stale cached
  focus/transitions recompute once and upgrade in place.

---

## 2026-07-17 — Pins v2 (iterative), auto-callouts, ducked music bed

Rungs 3-4 of the speaker-screencast ladder + the pin upgrade:

- **Pins v2 — iterative refinement** (`planChapterPins` rewritten): the
  proportional guess drifts with every un-modeled pace change, so a fixed
  window around the raw guess misses correct seams (measured Δ19s). Now:
  start from the end-pin, then repeatedly (1) re-solve the map with pins so
  far, (2) recompute unpinned guesses on the CORRECTED map, (3) pin the
  single most confident match. Each accepted pin re-anchors the map. Still
  conservative (no seam in window → no pin; infeasible pin → discarded).
- **Auto-callouts** (`core/callout-plan.ts` + focus events in
  `compress-waiting.ts`): the narration says WHEN (action-cue sentences:
  click/open/type/...), the footage says WHERE (focus events = seconds of
  motion whose union bbox stays small — typing in a field, a panel
  updating; scrolls/repaints rejected, ≥2s only). A callout is proposed
  only when both agree, mapped through the PINNED media map, and rides
  screencast-frame's existing region-glow/lift rendering as plain editable
  component data. Caps: ≤6, ≥18s apart, never over a chapter card.
  (Also fixed: callout clones forced `height:auto` — collapsed to the 150px
  fallback on capture pages; now inherit the base's explicit height.)
- **Ducked music bed**: the assemble recipe now attaches a calm
  commercial-safe bed at 0.22 volume, looped, with `audio.ducking` (to 0.35×
  while the narration speaks, swelling in gaps + bookends) — the render
  mixer's existing envelope ducking does the work. Opt out with
  `background_music: false`.
- **Motion intel unified**: `ensureMotionIntel` — idle + transitions + focus
  from ONE decode, sidecar write-back upgrades older assets in place,
  in-process memoization for concurrent callers.

---

## 2026-07-17 — Chapter pins: semantic audio↔video sync (speaker-screencast)

Before this, narration and footage were only **durationally** synced (the
compression solve matches totals) — nothing guaranteed the screencast SHOWS the
broadcast screen while the narrator talks about it, and an early mismatch
drifted through the whole film. Now the spine's chapter boundaries become
**pins** on the screencast's media map:

- **`transitionsFromScores`** (`compress-waiting.ts`, now `analyzeMotion` — one
  decode, both signals): hard visual transitions = short isolated spikes in the
  same frame-diff profile idle detection uses. Sustained motion (scrolls,
  animations) is rejected; multi-step navigations within 3s collapse to one.
  Cached at ingest as `intel.transitions`.
- **`planChapterPins`** (`auto-compress.ts`, pure): per chapter boundary, take
  the proportional guess (where the current solve already lands), snap to the
  nearest transition within ±6s, keep only monotonic confident matches — **a
  boundary with no visual seam nearby gets NO pin** (a wrong pin is worse than
  none). An end-pin (scene end → source end) keeps the narration fit exact.
- **`proposeChapterPins`**: re-solves via `solveMediaEdits` (idle rate_regions
  stay the elastic between pins); **strained pins are dropped** and re-solved.
  Pins carry the chapter title as their label → they land in Studio's media
  lane named, visible, draggable. Machine proposes; human owns the last 10%.
- Wired into `assembleNarratedScreencast` after the spine; summary reports
  `N chapter pin(s) snapped to visual transitions`.

Drift is now bounded per chapter and re-anchored at every pinned boundary.
This also sets up rung 3 (callouts/punch-ins): anchored off pins, callouts
survive a human dragging one.

---

## 2026-07-17 — Speaker-screencast sentence spine: captions + chapters

The grammar's own spine, realized (the backlog item from the prep+mandate entry).
Tempo-cut snaps to **bars**; the narrated walkthrough now snaps to **sentences**.

- **`src/core/sentence-spine.ts`** — whisper word segments (transcribe.ts, on-box)
  → `buildSentences` (terminal punctuation / real pause / run-on guard) →
  `buildChapters` (breaks at long narration pauses past a min length, force-closes
  before 75s). Pure + unit-tested; leading-silence onset correction shared with the
  Studio words lane.
- **`components/captions/narration-track`** — one full-frame overlay: a lower-third
  scrim pill per sentence (auto-shrink, no flicker between back-to-back sentences)
  plus brief dimmed **chapter title moments** (kicker "CHAPTER N" + accent bar).
- **`assembleNarratedScreencast`** — builds the spine from the narration (narration
  time IS film time; overlay times are scene-local, minus the intro bookend), titles
  chapters via ONE small LLM call (`titleChapters`; on failure chapter cards are
  skipped — captions never depend on the LLM), stamps the overlay onto the
  walkthrough scene, and stores **`project.spine`** (film-time sentences + chapters)
  for Studio and the future clipping/social-cut grammar.
- Degrades cleanly: no whisper on the box → the exact pre-spine assembly.

Backlog next (rungs 3-4 of the speaker-screencast ladder): narration-timed region
callouts/punch-ins on the screencast; ducked music bed under narration; PiP camera
when a camera file exists; speaker-name lower third on the intro.

---

## 2026-07-16 — Unified grammar pipeline: prep + mandate (the "hard" L4)

**North-star architecture for how every `film_grammar` runs.** L4 originally made
`filmGrammar` a structured *field* but only a **soft** signal — it whispered to the LLM
storyboard (mandatory contract sections + a tempo-cut creativity clamp) and everything
still flowed through the same LLM generate. Music-first was the one exception: it was
already `prep (pick track → beat grid) → constrain the shared storyboard`. This
generalizes that shape to **every grammar**.

**The model — ONE pipeline, per-grammar PREP + MANDATE** (`src/llm/grammar-prep.ts`,
`runGrammarPrep`): before the storyboard, each grammar contributes
1. a **mandate** — `"generate"` (LLM invents the visuals) or `"assemble"` (materials are
   GIVEN, place them deterministically);
2. a timing **spine** the cut snaps to (music **bars** / narration **sentences**); and
3. the **given materials** it brings (music bed / a screen recording).

The deterministic-vs-LLM split is now an **emergent property of the mandate, not a
separate code path**. `runGeneratePipeline` calls `runGrammarPrep`; on `"assemble"`
(speaker-screencast + a `screencast_source`) it short-circuits *before the creative
director* into `assembleNarratedScreencast` (place the recording + compress-the-waiting
fit to the narration + brand bookends) and returns — same pipeline entry, same
project/render model, the LLM steps simply don't run. On `"generate"` it's the existing
music-first path (spine = bars) feeding the shared storyboard.

- `generate`'s `screencast_source` now routes *through* the pipeline (it was a standalone
  handler branch); `pickMusicMood` moved into `grammar-prep.ts`.
- **Backlog (logged here, not yet built):** (a) make `tempo-cut` *imply* music-first
  instead of being gated on the `background_music` flag; (b) let the selected track inform
  the *treatment*, not just the storyboard (music is picked after the concept today);
  (c) give speaker-screencast a real sentence **spine** so the shared assembly can lay
  captions/overlays timed to the narration (transcription already exists).

---

## 2026-06-30 → 07-01 — Visual-quality system + one scene vocabulary

**Shipped: PR #85 → merged to `master` (squash `3df01d5`).** Follow-up on branch
`claude/render-chromium-path` (`ae0ac1e`, unmerged).

### What changed (and why)

Videos were visually weak: washed-out "ghost" panels, empty/dead frames, scenes missing
elements the storyboard named, low-contrast text — and the critique loop let it all ship.
We hit two levers: **how scenes are generated** and **how weak scenes are caught**, plus a
naming cleanup. See `SPEC.md` for the design.

1. **Codegen NON-NEGOTIABLES** (`agentic-codegen.ts`) — top-priority prompt block: legibility
   over mood (incl. surfaces), fill the frame, real content, render every named element,
   make the emotion visible.
2. **Critique enforcement — LLM rubric** (`consolidated-critique.ts`): new blocking defect
   types `invisible_surface`, `empty_skeleton`, `dropped_element`, `dead_frame`,
   `intent_mismatch`. Auto-block via `pass = defects.length === 0`; details feed regen.
3. **Critique enforcement — measurement gate** (`layout-metrics.ts` + `layoutProbe` in
   `capture.ts`, wired in `pipeline.ts`): deterministic ghost-panel (lightness separation)
   and dead-frame (content coverage + per-color-channel backdrop spread) checks. Sits
   beside the existing `measureTextContrast` legibility gate.
4. **Transient-motion tuning** (`consolidated-critique.ts`): `dropped_element` only fires
   when a named element is in NO frame; `intent_mismatch` is judged from layout, not
   apparent motion in a still. Fixed real false positives seen in the live run.
5. **One scene vocabulary:** `DraftScene` `description`/`brief` → `purpose`/`visual_notes`
   (matches `StoryboardScene`). Storyboard LLM prompt emits the new keys; codegen bundle is
   "the spec" (`buildCodegenBrief`→`buildCodegenSpec`, `sceneBrief`→`sceneSpec`,
   `briefText`→`specText`, `formatSceneBrief`→`formatSceneNotes`). No fallback chains; a
   loud guard prevents silently dropping visual direction. No data migration.
6. **`MP_CHROMIUM_PATH` env override** at every `chromium.launch` site so captures/renders
   run where the bundled Playwright revision isn't installed. In PR #85: `capture.ts`,
   `capture-worker.ts`, `brand-extractor.ts`. On follow-up branch: `scene-worker.ts`,
   `capture-url.ts`.

### Decisions

- **Measurement vs. prompt for quantitative rules.** Prompt rules plateau on numeric
  constraints ("≥8% lightness"); the model nods and under-executes. Enforce those by
  *measuring* pixels/geometry and blocking on a threshold — not more prose. Semantic
  failures (dropped element, intent) stay with the LLM critic. The two are complementary.
- **Dead-frame metric is per-COLOR-channel in the empty strips**, not luminance over the
  whole frame. A vibrant brand gradient is luminance-flat but hugely color-varied; and
  sampling the top/bottom strips avoids the centered-text confound. (Luminance-over-frame
  was tried first and was exactly backwards — flat CTA scored higher than the gradient one.)
- **Full rename, no back-compat.** Per request: remove "brief" from the scene vocabulary
  entirely rather than keep fallback reads. Guard against silent drops with a loud warning
  instead of a legacy-key fallback.
- **Merge decision:** merged despite light-brand weakness because the change *strictly
  improves* both cases — on light brands the gates now catch inversion/low-contrast that
  previously shipped silently. Light-brand generation quality is a separate follow-up.

### Validation

- Typecheck + build clean; 109/114 unit tests (5 failures = sandbox missing Playwright
  browser, unrelated — a render test passes with a working browser).
- Live **dark**-brand end-to-end gen: 3 good scenes; gates fired and fixed ghost panels.
- Live **light**-brand end-to-end gen: gates correctly caught theme inversion + low
  contrast; output weaker than dark (see open items).
- Genuine **MCP-client** run (not the pipeline shortcut): connected over HTTP →
  `listTools` (17) → `generate` (storyboard + full) → poll `job` → `render`. Confirmed the
  rename and gates flow through the real tool surface.

### Open items / follow-ups

- **[render] final-stitch ffmpeg frames-race** (`scene-worker.ts`): parallel scene workers
  vs. frame-dir cleanup → `"Could find no file ... frames"` while the scene mp4 exists.
  Pre-existing render code (NOT touched by PR #85); possibly sandbox-timing. Per-scene
  clips render fine; only concat + transitions + audio fail. **Verify in a real env first.**
- **[codegen] light-brand reliability**: first instinct is theme inversion (purple-on-light)
  + borderline-contrast text + sparse frames. Gates catch it but the generator burns its
  revision budget. Improve the generator (not the gates).
- **[chore] merge `claude/render-chromium-path`** (the two remaining `MP_CHROMIUM_PATH`
  launch sites) if renders need to run in constrained/remote envs.
- **[docs] `ARCHITECTURE.md` is stale** — still references `plan`/`brief`; current
  vocabulary is `storyboard`/`purpose`/`visual_notes`.

## 2026-07-08 — Asset intelligence + screencast-frame + revise verification (PRs #216–#219)

Born from a live incident: presenting a screen recording inside a browser frame took an
hour of eyeballed percentages in Studio. Three capabilities close the gap:

- **A — Asset intelligence at ingest** (`core/asset-intel.ts`): sample frames across an
  uploaded video, classify rows/columns by temporal activity → per-edge trims (embedded
  window/browser chrome, letterbox), content box, light/dark theme. Sidecar
  `<file>.intel.json`; `POST /api/analyze-asset/{tenant}/{project}?name=` backfills.
  Facts flow to codegen specs (`SOURCE FOOTAGE FACTS`), the layout tool (`source_intel`
  + doubled-chrome warning), and `crop:"auto"`.
- **B — `screencast-frame` rebuilt** into a real browser-frame component: markup `<video>`
  (EDL/transport-safe), `frame_style` macos-browser|plain|none, frame = single clip shape,
  `crop:"auto"` resolved from the sidecar at assembly (both assemblers + tag rewrite),
  overscan math from intrinsic size, no self-fade. Codegen prompt + dropped-footage retry
  now route real footage here instead of hand-rolled div mocks.
- **D — revise verifies its own geometry**: diff the geometry-critical declarations a patch
  changed, boot the revised scene once, compare declared vs rendered; clamped values name
  the clamping rule (e.g. the `img,video{max-width:100%}` reset). `layout_warnings` in MCP
  + HTTP responses and the Studio status line. Runs even with `skip_gates`.

### Chrome-boundary accuracy (honest state)

Three refinement passes: interior-seam cut (#217), detail-drop split (#218), hairline
fine pass at native row resolution (#219). Synthetics land within ±4px across four
regimes (gradient chrome, chrome+static app header, detailed chrome, hairline divider).
On the real 99U Safari recording auto-detection reads **136px vs 108px ideal** (~14 CSS px
extra crop into blank app-header padding): that toolbar has no divider hairline and its
boundary step (Δ5 luma) is smaller than app-content steps below (Δ13) — no unsupervised
ordering rule picks it without breaking other cases. Judged acceptable: the trim is a
suggestion; components/agents/Studio can override with exact values.

### Open items

- Studio "crop source chrome" button = thin UI over the sidecar + `screencast-frame`.
- Generation wall-clock (~37 min for a 4-scene narration video) needs profiling
  (suspects: sequential per-scene codegen, huge scene files, critique regen loops).
- Revise fast-gates once passed a boot-crashing scene (defects:[]) — still unexplained.

## 2026-07-10 — Scene templates, atmosphere kit, match cuts (PRs #239–#246)

The composition strategy shift: **curated whole-scene templates** (the Figma-component
model — locked composition, data slots, detach later if needed) instead of asking
codegen to invent professional layouts from adjectives. Codegen remains the fallback
for footage/bespoke scenes; templates are the storyboard's FIRST choice.

- **Template library** (`src/components/scene-templates/`, category `scene-template`):
  `st-hero-stat` (count-up numeral, ghost echo, beat-phased tag walk; `theme:"dark"`),
  `st-kinetic-list` (full-width rows, ghost indices, spotlight walk), `st-quote`
  (dark contrast beat, `*emphasis*` words in secondary hue), `st-logo-close` (closing
  sting: logo bloom, pulsing gradient CTA, never self-fades).
- **Atmosphere kit** (`shared/atmosphere.js`, auto-loaded): `mpAtmosphere` (gradient base +
  drifting radial washes + animated film grain + vignette), `mpCameraPush`, `mpShimmer`,
  `mpGlow`, `mpGradientBorder`, `mpBlurFrom/To`, `mpBeatPhases` — one lighting language
  so every template feels lit by the same studio.
- **Storyboard selection → direct instantiation**: `DraftScene.scene_template`; prompt
  section "SCENE TEMPLATES (your FIRST choice)" with light/dark rhythm guidance;
  `generateScene()` instantiates st-* drafts directly (no codegen call, near-instant,
  no critique budget).
- **mpLogoOnDark** (#243): brand kits often ship only a light-theme wordmark — on dark
  templates it was invisible (Quotient: mean opaque-pixel luma 58.7). Templates measure
  the loaded logo via canvas and flip lightness keeping hue (invert + hue-rotate on a
  wrapper span, GSAP-tween-safe); glow rides the wrapper so it keeps brand color.
- **Match-cut transitions** (#244): new `match-cut` type = anchored punch-through (drive
  into A's exit anchor, land on B's entry anchor, one continuous move). Anchors are
  DECLARED in template schemas (`"match": {entry, exit}` normalized points — templates
  are fixed compositions, so no measurement pass needed); non-template scenes fall back
  to center. Prompt: default between consecutive template scenes, 0.5–0.7s.
- **Critique protection** (#245): template scenes skip per-scene critique/regen (a regen
  would CODEGEN a replacement, destroying the template) and are excluded from editorial
  `fix_scene` (no source to revise; regen fallback is a no-op that burns the budget).
- **Slot revise** (#246): Studio revise on a template scene edits slot DATA via one small
  LLM call (slot list + current data + instruction → updated JSON, with schema-echo and
  slot-def-scrub guards). Un-expressible asks (layout/size/motion) surface as a
  `layout_warnings` note instead of silently doing nothing.

### Also in this window (context)

- Generation wall-clock profiled and fixed (one-boot critique captures, trace
  concurrency, mode=full gate, footage re-attachment): 99U rebuild 21.0 min vs 23.4;
  remaining cost is LLM output time — template instantiation is the structural fix.
- Intent-based media edits shipped (pins/cuts/rate-regions first-class, solver derives
  segments; Studio pin/cut markers, HOLD blocks, custom rates, merge/restore).

### Open items

- Regenerate the 99U film end-to-end to exercise storyboard template selection +
  match cuts (Marc will review everything at once).
- Scene-preview PNG can render blank for scenes whose elements enter via timeline
  (render tool seeks dur/2) — root cause still open.
- Studio session-log shipper does not capture the scene IFRAME console, only the shell.
- Render final-stitch ffmpeg frames-race (pre-existing; verify in a real env).
- Revise fast-gates once passed a boot-crashing scene (defects:[]) — still unexplained.

---

## 2026-07-11 — Event-rate contract, template library ×11, callout authoring (PRs #274–#284)

The 99U prompt became the standing end-to-end contract test; each run's failures
became platform fixes the same night. The FILM DIRECTION report card went from
`4/4 templated | themes LLLD | float 0 | swarm 0` (clean but slideshowy) to
`3/4 | DLDc | swarm 1 | float 1 | slowest 4.3s/event` (launch-film grammar).

### Enforcement (the contract grows teeth)

- **Asset path recovery** (#274): storyboard LLM shortened a footage path → 404 → empty
  frame. `recoverAssetUrl` (basename search of the tenant asset tree, library preferred)
  at st-screencast instantiation + mapper slot snap-back to the scene's footage URL.
- **Invented callout geometry stripped** (#275): no LLM in the storyboard path sees
  frames, so mapper-returned callout rects ring arbitrary regions (blank canvas, in the
  live run). Dropped at assign time; Studio is where callouts are born (see below).
- **Event rate** (#276): a composition holding still >8s reads as a slide regardless of
  dressing. `enforceFilmDirection` counts per-scene visual events, warns loudly, and the
  report card gains `slowest N.Ns/event`. st-kinetic-list stretches CONTENT not holds
  (meta splits into phrase sub-beats with tick pulses when a takeover window runs long;
  item cap 6→8). Template mapper mines ~one item per narration sentence (34s scene went
  2 items → 6). Storyboard turn budget 8192→16000 (#277) after a kinetic-cut storyboard
  triple-truncated with zero scenes banked.
- **Type-on-photo rule** (#278): codegen NON-NEGOTIABLE #7 (never cards over a photo;
  scrim + type in the photo's world) + `card_on_photo` blocking critique defect.

### Template library (be greedy: templates for what recurs, codegen for the bespoke)

- **st-photo-close** (#279): the cinematic photo-world close as a locked template —
  baked scrim gradients guarantee type contrast on ANY image; kicker/headline/subline/
  interpunct items/logo. Mapper now offers hero-image scenes; instantiation fills
  `backdrop_image` from the enriched image. Kills the recurring codegen failure class
  (black frame, ink-on-sky, panels-on-photo — all three happened in one night).
- **st-swarm upgrades** (#278/#279): kind inference (numbers→stats, short lines→pills,
  quotes→quotes) + deterministic variants (solid brand pops, ghost outlines, oversized)
  + full TYPOGRAPHIC MODE (≥70% short items → props are bare flying type, no cards).
- **Four new templates** (#280): st-manifesto (kinetic type statement, *starred* accent
  slams), st-compare (old-way scraps vs calm column, loser collapses), st-flow (spark
  charges a rail, step takeovers), st-convergence (many→hub flare→clean fan-out).
  Library now 11; all themable, match-anchored, event-counted, boot-tested.

### Callout authoring in Studio (#281–#284)

One zoom gesture, two treatments: the draw-a-zoom crosshairs on a screencast now offer
"Zoom in (camera)" vs "Call out (lift)" — the callout IS the reverse zoom (region lifts
OUT toward the camera). Float stage defaults to callout. Fixes from Marc's live use:
wrapper detection by real structure (`.scf-stage` + `data-cid`, composite prefix
stripped) (#282/#283); callout pills + editor popover on the scrubber; clone EDL sync
(component re-copies `data-mp-edl` post-parse AND the preview transport ties derived
clips to their base clip's source-map — the clone was resurrecting removed segments);
true plane tilt (hold counter-rotation removed — it fought the orbit drift) (#284).
New scoped `PATCH /api/projects/.../components/:id` endpoint. `travel` field on
callouts = flight speed.

### Open items

- proj_d6f9dae6 is the current 99U reference film (type swarm / 6-item lock-in /
  float screencast / st-photo-close close). Not rendered to mp4 (Marc's call).
- st-photo-close scrim may read heavy on bright golden imagery — single gradient to tune.
- Scene durations can overshoot the narration length (~2s on the last scene); consider
  clamping the storyboard sum to the speaker-track duration.
- Callout region % is authored against the float plane's PROJECTED rect (approximation);
  fine-tune via the pill editor if a drawn region needs nudging.
- **BACKLOG -- WebGL screencast stage (the depth ceiling).** The float depth saga
  (PRs #288-#294) settled on the glassy-border pane -- Marc's pick -- after proving
  CSS-composited depth tops out there: painted edges vanish by contrast, 3D-face
  extrusions hide inside the silhouette at shallow tilt, panes read as stacked
  windows under camera zoom. The real next level is rendering the screencast INSIDE
  the three.js world: the video as a texture on a real slab mesh on a real glass
  plane, lit by the scene's lights -- true thickness, reflections, and parallax at
  any angle/zoom for free. Machinery half-exists (three.js runtime + deterministic
  state-tween pattern proven in webgl-backdrop); the hard problem is frame-exact
  video-texture sync in the capture pipeline (worker seeks video, texture must
  update per captured frame). Big build; big payoff.

## 2026-07-12 — Motion architecture + the silent kinetic-type explainer (PRs #297–#303)

The Quotient-in-Slack explainer became the forcing function for the biggest
architecture consolidation since beats. Three generations of the same film, each
failure turned into a deterministic rule:

- **Scripted-mock contract** (#297): slack-workspace/quotient-chat/chat-simulator/
  claude-chat-composer all had full `runScript` engines that no schema documented —
  codegen embedded them as static props and hand-animated over their DOM (double
  composers, header collisions). Schemas now document `script` + `cursor_targets` +
  action vocabularies; codegen rule "scripted components perform themselves";
  finish_scene validators for broken `<component data>` attrs and orphaned
  timeline code (`tl is not defined` after a premature `return tl;}` from
  append_script); storyboard truncation hardened (one add_scene per response,
  consecutive-only abort); `max_revisions` param on generate.
- **slack-workspace resilience** (#298, #301): no-script intro performs the thread
  (paced pops + typing bar) instead of a static screenshot; LLM alias keys
  normalized (author/time → name/timestamp — a missing name crashed the whole
  timeline into an EMPTY channel); declarative shorthand compiled to script
  (`composer_text`, `typing_indicator`, `bot_reply`) — three generations proved
  storyboards write intent keys, never action arrays.
- **SPEC-motion-architecture.md + v1 implementation** (#299, #300): four layers
  with single ownership; ONE stage camera with semantic anchors
  (`CameraMove.anchor` = "component.anchorName", resolved at tween start with
  transform compensation — frames a moving/posed component where drawn rects go
  stale; type-qualified matching in #301); pose/enter/exit as first-class wrapper
  fields in both assemblers; component tiers (performable-surface/animated-prop/
  static-prop); template pass-through rule; script-runner camera actions
  deprecated (rotate-3d reclassified as pose); ui-chat-thread deprecated;
  storyboard may author ANCHORED camera moves (sanitized, max 4). Backdrops
  stamped `data-mp-backdrop` and excluded from the camera rig — the camera moves
  the subject, not the world (#301, Marc's catch).
- **Brand voice** (#302, #303): st-artifact claims default to the BRAND display
  font (`voice:'serif'` opts into the borrowed HyperFrames editorial look);
  logo.dev URL baking mirrored into the direct-component path (hand-authored
  logo components rendered invisibly).
- **The film** (proj_2ad23344, silent by design): logo-lockup manifesto intro →
  two claim scenes over the performing slack-workspace (camera riding the typing
  via anchors) → pure kinetic-text takeover (st-manifesto) → scripted thread
  demonstration → settings-toggle close. Marc: "looks like a real hype video."

### Open items (added)

- **Slack simulator fidelity upgrade** (Marc): the slack-workspace mock is good
  enough to star but reads slightly simplified up close — richer message
  rendering (link unfurls in flight, hover states, attachments, member chips),
  smoother thread-panel open, real scroll physics. Worth a dedicated pass now
  that it is the workhorse surface of product films.
- Lane-timing coordination: storyboard-authored camera moves vs the shorthand
  compiler's typing window are aligned by hand today (observed: a zoom landing on
  an already-cleared composer). Consider auto-snapping composer-anchored zooms to
  the compiled type-message window at assembly.

## 2026-07-12 (later) — Slack simulator fidelity, from Marc's real screenshots

Marc supplied two rounds of real Slack screenshots ("I can send you screenshots
of what it really looks like and you can upgrade it").

- **Round 1 — DM views** (#305): modern left rail (64px #350D36: workspace tile,
  Home/DMs/Activity/Later/More with labels, +, self avatar w/ presence) beside
  the 236px #4A154B conversation column; "Find a conversation..." search;
  sentence-case section headers; **Agents & apps** section (icon squares, badge
  pills, active = white pill w/ #611f69 badge); app-notification message grammar
  (bold `title` line + body + blue `link_text` action link); composer rebuilt to
  the real layout — formatting bar ABOVE the field, action row below, green
  #007a5a send + chevron.
- **Round 2 — channel views + script actions** (#306): **rich Quotient unfurl
  card** ("Quotient ▾" over a white bordered card: app icon, bold title,
  "Campaign in Quotient", Start/End/Owner field chips w/ avatar, "As of ..."
  footer) — from `messages[].unfurl` AND as a script action (`unfurl`) so the
  card animates in mid-story ("unfurled items in the script to show the real
  thing"); **`thinking` script action** (bot block with pulsing "Thinking..."
  dots; next bot-message auto-replaces it; `bot_thinking` shorthand); channel
  tabs row; huddle split button; blue @Name / gold @channel mention pills;
  image-attachment block (filename + chevron + rounded image); date divider
  pills; `hover-message` floating action toolbar; thread "Also send to
  #channel" row. Contract untouched: 3 camera anchors, message_index
  addressing, shorthand compiler all verified by DOM probe.

The round-1 open item ("Slack simulator fidelity upgrade") is DONE.

## 2026-07-12 (later still) — Claude surfaces at screenshot fidelity

Marc: "the next component I wanna work on and make really good is the Claude
desktop component" → then "I want to focus on cowork specifically."

- **Taxonomy** (corrected by Marc's screenshots): terminal CLI /
  Claude Code desktop (Code tab) / Claude Cowork desktop (Home tab).
- **claude-code-session** (#315): the terminal — banner, tool blocks with
  diffs, working spinner with LIVE elapsed/token counter riding the master
  timeline, todos, streaming responses. Shorthand: prompt_text/tool_calls/
  response_text.
- **claude-desktop** (#315, rebuilt #317): the real Code tab — light bone
  theme, Home/Code toggle, numbered Recents (status dots opt-in), claude.ai-
  style pane, 'Type / for commands' composer. The invented dark fleet
  sidebar was deleted.
- **claude-cowork-home** (#317, fidelity #318/#322/#323): starburst greeting
  (real mark via logo.dev claude.ai + multiply-blend against a locally
  painted backdrop; SVG fallback), composer with Chat/Cowork toggle, plus-
  menu (hoisted to window-last child — entrance transforms + wrapper
  preserve-3d defeat z-index; DOM order is the only reliable layer), ideas.
- **claude-cowork-session** (#318, tool grammar #320/#321): the running
  task — serif prose, right rail (Progress N-of-M + step checklist,
  Outputs, Context/Connectors chips that light while in use), and the REAL
  tool-group treatment: humanized title, clock-icon thinking with code
  chips, Result pill, dotted 'Using Quotient…' spinner, ✓ Done, then
  auto-collapse to 'List Social Posts ›'. Real Quotient MCP tool names
  throughout (create-campaign, create-social-post...).
- **Camera cover-clamp** (#316): anchored/whole-scene zooms can never frame
  outside the canvas (|x| ≤ (s−1)·W/2). Anchors should hug CONTENT (the
  rail's card stack), not full-height containers (#319).
- Demo films: proj_5b7edf4f (terminal + Code desktop), proj_eb454668
  (Cowork home → running task with scripted Quotient tool calls).

## 2026-07-12 — Quotient Social fidelity (PRs #325, #326)

Marc: "lets take a look at quotient chat and quotient social... here is the
screenshots. here is social. one is a post that has been published and one
that is in draft."

- **quotient-social rebuilt** (#325) from the real editor screenshots:
  platform-aware ('x' | 'linkedin' — toolbar tile, author treatment,
  char-limit default 25,000/3,000), campaign-tag pill with progress ring,
  'Go to thread ↗', and the black Schedule split-button whose dropdown
  (Publish Now / Schedule for later) is a window-last child positioned from
  the button. Post card on the dotted grid: green '✓ Post published on …'
  bar vs gray '✎ Draft' bar + char counter, X author (brand avatar, corner
  badge, verified check, @handle) vs LinkedIn (photo, in badges), up to two
  side-by-side media cards (image / gradient headline / file chips).
  publish-post is the money beat: menu row flashes, bar flips green,
  Schedule → View. Legacy embed_*/schedule-post still map through.
- **update tool camera_moves accepted `target` but stripped `anchor`**
  (#326): zod's default key-stripping silently dropped the documented
  anchor grammar, so MCP-saved moves zoomed on frame center. One-line
  schema fix. (Symptom to remember: move plays, framing is wrong.)
- Demo: proj_8446563d scene_social — draft → dropdown → Publish Now →
  green bar, with anchored zooms on qs.status / qs.toolbar.

## 2026-07-12 — quotient-app-shell: the composable app chrome (PR #328)

Marc: "what i really want to do is build a component system. The left nav and
header......the social edit screen....the message panel to the right. Then i
can swap out the middle for different parts of the platform."

- **quotient-app-shell** (#328): icon rail (nav_active highlight + avatar),
  breadcrumb header (bell 480, Search ⌘+K, black New Chat), right AGENT
  PANEL (tabbed title, reviewed-line, collapsible 'Updated [in] LinkedIn
  post' tool cards with faded post preview, agent/user messages, typing,
  composer with Auto + mic + send). The CENTER IS AN EMPTY WELL:
  content-region contract = shell full-frame → center component at
  x 3.6%, y 6.2%, 63%×93%. quotient-social drops in today; campaign /
  email / doc / flow screens reuse the same hole. show_panel:false =
  full-width well. Anchors: content, panel, messages, composer, header, nav.
- Demo: proj_8446563d scene_shell — agent panel narrates the edit, user
  types 'Perfect — publish it.', center editor opens the Schedule menu and
  flips draft → published green while the panel confirms.

## 2026-07-12 — quotient-campaign: the campaign center (PR #330)

Marc's screenshots: Brief / Tasks / Activation / Deliverables tabs.

- **quotient-campaign** (#330): tab bar + four working views. Brief =
  rich-text doc (updated line, title, Date Range chips, Owner row,
  sections with bullets). Tasks = 'Completed 0/6' counter, To-do group,
  rows with dashed-circle checkbox / red priority bars / owner avatar /
  deliverable platform icon / 'Get Started' Quotient chip. Activation =
  week calendar (time gutter, day columns, deliverable cards with
  Published/Draft/Launched). Deliverables = green-rocket status table.
  Actions: switch-tab, complete-task (counter ticks), move-event (card
  lifts + glides between days -- the drag beat), set-event-status,
  set-deliverable-status, scroll-view. Anchors: tabs/brief/tasks/
  calendar/deliverables. Second center for quotient-app-shell.
- Demo: proj_8446563d scene_campaign — brief → tasks (2 checked) →
  activation (Marc's post dragged to Friday) → deliverables (last row
  flips Published), agent panel narrating each move.

## 2026-07-12 — polish: social footer + shell inset window (PR #332)

Marc: shell "getting clipped in your test film... make it smaller so i can
be sure the entire app is visible"; social "we lost the bottom part of the
social post."

- **quotient-social**: engagement row (Likes/Comments/Reposts/Forwards,
  show_engagement) + footer AUTHOR block (avatar w/ corner badge, name +
  badge + gray Author chip, first comment via author_comment e.g.
  'Apply here: {url}') restored from the real screenshot.
- **quotient-app-shell** is now a rounded floating window (radius/border/
  shadow) placed INSET, never full-bleed: shell {x 1.2%, y 2%, 97.6%×96%} →
  center {x 4.7%, y 8%, 61.5%×89%} (formula in the schema). Full-bleed
  placement + scene drift is what cropped the rail/header.
- Note: final-mp4 duration ≠ sum of scene durations (crossfades add time);
  compute frame-grab timestamps from ffprobe/Duration, not scene math —
  "clipped" end frames were actually mid-zoom camera moments.

## 2026-07-12 — social bottom = the real editor; rail = the real icons (PR #334)

- **quotient-social bottom**: drafts show the action strip (emoji + image +
  'Ask for Changes' with the Quotient mark); published shows the muted
  Likes/Comments/Reposts/Forwards row; publish-post swaps them live.
  Below the card: Comments section ('Comments' + 'Write a comment...'
  composer, show_comments). Long cards: script scroll-post to reveal the
  bottom on camera.
- **quotient-app-shell rail** rebuilt to Marc's screenshot: panel-collapse
  pinned at the very top (moved out of the header), then home, history,
  flag, thumbs-up, book, mail, image, file, flows NODES, calendar, people,
  scheduled CLOCK-BOX, memory BRAIN; avatar at bottom. nav_active +=
  'scheduled'.

## 2026-07-13 — quotient-chat = THE agent panel, composed into the shell (PR #337)

Marc: "the right agent panel in app shell ideally would be the same one in
quotient-chat... mainly bc it is the same one in real life."

- **quotient-chat rebuilt** from the 5 panel screenshots: tab row (running
  tab with spinning ✳, copies badge → References popover), color-coded
  verb lines (linkedin blue / x black / email+doc orange / task+campaign
  blue / blog+memory dark), **content-card = the streaming box** (the
  created/updated doc types itself into a white inner box under a top
  fade, floating scroll-down button while streaming, collapse_delay),
  task-status ('Marked N task(s) as ◑ In review' + checkbox rows),
  'Conversation summarized' divider, pink-initials user bubbles, composer.
  Legacy tool-use/asset-card actions alias to verb lines.
- **One panel everywhere**: shell keeps a simple built-in panel; fidelity
  composition = shell show_panel:false + quotient-chat at the panel slot
  (x 67.6%, y 8%, 30.5%×87% with the standard inset shell). Demo
  scene_campaign now runs the 3-component composition (shell + campaign
  center + real panel), scene_chat showcases the panel standalone.

## 2026-07-13 — Connector explainer restyled HyperFrames + render write-back gotcha (PR #339)

Marc: "WebGL backgrounds to each scene... components smaller so they're
contained... no voiceover — classic hyperframes: kinetic text, then a
scene... intro slide with the Claude logo and the Quotient logo." Then:
"the pitch is work on the idea in Claude... execute in Quotient... then
list out all the features of quotient that work."

- **proj_0890a34e restructured**: intro (logos × logos, 'Now connected.')
  → 4 manifesto interstitials (THE IDEA / THE WORK / EXECUTE / SHIP) each
  cutting to its product scene (Cowork ask, Cowork run, Quotient campaign
  trio, publish trio) → **st-swarm feature roll** ('All of Quotient. One
  connector.' over 12 flying feature words) → hero close. All product
  windows inset over webgl-backdrop worlds (Cowork 84%, shell trio 88%).
- **kinetic-text data.color** (PR #339): the component inherited
  --mp-color-text (near-black on light brands) — illegible on dark
  worlds. Optional CSS color override added.
- **GOTCHA (unfixed, real bug): editing a project while a render job is
  running gets CLOBBERED** — the job holds the project in memory and
  writes it back on completion, silently reverting any edit made
  mid-render (lost the feature-roll scene + manifesto rewrites once).
  Rule: never update/add while a render runs; re-apply after it
  completes. Product fix: render completion should patch status/output
  fields only, not write the whole project snapshot.

## L4 film grammar (this session, after the two tempo-cut generation tests)

- **`filmGrammar` is now a structured Treatment field** (`launch-film` |
  `tempo-cut` | `speaker-screencast`), not prose. The creative director
  commits to exactly one (caller can force it via the generate tool's
  `film_grammar` param); the pipeline reads it as DATA: it activates the
  matching storyboard contract section as MANDATORY, clamps creativity to
  0.15 for tempo-cut (component-first assembly), and falls back to text
  detection only for treatments that predate the field.
- **speaker-screencast codified as the third grammar** so the earlier
  speaker-track work stays first-class: the voice is the clock (cuts on
  sentences, never mid-sentence), the human narrates (no text-as-VO, no
  statement slides), overlays line-rise on the sentence that introduces
  them, music absent or ducked far under the voice. Mechanics (content
  region, takeover + PiP) were already in the speaker instructions; the
  grammar adds the editorial contract.
- Why: two A/B generation tests proved prompt-only contracts drift — run 1
  (prose only) broke scene budget/music/labels; run 2 (fixes) still picked
  a generic chat surface over the real product mock and leaked a stage
  direction. Grammar-as-data + the `generic_surface` and
  `stage_direction_leak` gates is the enforcement stack.

## Testing, tooling & distribution batch (2026-07-19, after the re-fit editing model)

- **TESTPLAN.md** — the 15-minute golden-path manual script: record with the
  extension (camera + narrate + deliberate pause + 8s silence-over-activity),
  audit auto-assembly, exercise re-fit speaker editing (word-cut, piece
  split/play/remove, restore), screen + effects edits, camera bubble + booth,
  and finish with a real render — the mp4 is the only proof of the audio mix.
- **scripts/studio-smoke.mjs** — automated post-deploy invariants driven
  through a real browser (Playwright): boot without JS errors, lane geometry
  uniform, gutter icons labeled, fx/screen blocks open their editors, speaker
  pieces + word lane sane, transcript monotonic; `--edit` adds a speaker
  cut/restore referee round-trip through the API (mutates — use a throwaway
  film). Verified 11/11 against the live droplet.
- **`edit_speaker` MCP tool** (server.ts) — list/cut/restore on the talk
  track, so an AI client can do what the Studio word-lane does. Reuses
  applySpeakerCut/applySpeakerRestore + the shared transcript-cache
  maintenance now extracted into speaker-edl.ts
  (`maintainTranscriptCacheAfterCut` / `dropTranscriptCache`, also used by the
  HTTP routes — one code path for both surfaces).
- **Landing page is now a real front door**: MCP endpoint, a Get-started
  section (connect an AI client; download + install the recorder extension),
  and `/extension.zip` serving `recorder-extension.zip` from the repo root
  (rebuild with `npm run build:ext`; extension defaults contain NO server
  URL/tenant/token — verified before zipping).
- **HTTPS via Caddy is part of deploy** (`scripts/setup-caddy.sh`, called from
  deploy.sh before the env load): idempotent apt install, managed Caddyfile
  (`reverse_proxy 127.0.0.1:$MP_PORT`), ufw 80/443, rewrites `MP_PUBLIC_URL`
  to the https domain so preview links flip automatically. Domain =
  `MP_CADDY_DOMAIN`, falling back to `<ip-with-dashes>.sslip.io` (zero-DNS);
  `MP_CADDY_DISABLE=1` opts out; a hand-written Caddyfile is never touched.
  HTTPS also retires the insecure-origins Chrome flag for getUserMedia.

## Post-deploy verification findings (same day, after the tooling batch shipped)

- **REAL BUG (fixed): applySpeakerCut only re-fitted media-edits entries that
  already existed.** A film whose assembly made no idle-silence cuts has no
  entries at all — a speaker cut then shrank the scene but silently truncated
  the screen's tail (content loss, against the re-fit contract) and never
  mirrored into the camera bubble (lip desync). Now the cut SEEDS identity
  entries first: screen = [0, oldDur] of its own clock; camera follower = the
  speaker's clock with its existing cuts. 3 new referee tests cover seed,
  seed-with-prior-cuts, and seeded round-trip. (Found because Marc's real
  film proj_2b5f790e is in exactly this state — screencast entry absent,
  camera entry present.)
- A stray NUL byte had landed in speaker-edl.ts (a python edit script wrote
  "\0" where "" was meant — in a Python string literal \0 IS the NUL byte).
  Harmless at runtime (unused fallback branch) but the file scanned as
  binary. Fixed; lesson: grep -P '\x00' after scripted edits.
- **Composite-ready window 10s → 30s** (waitForCompositeReady): on a cold
  server/slow pipe the composite takes >10s to register its timelines; the
  old window stranded the Studio in per-scene fallback with EMPTY media and
  word lanes (looked like data loss, was a timeout). studio-smoke now polls
  readiness up to 75s instead of a fixed 15s nap.

## Render-mix bug from Marc's first ground-truth watch (2026-07-19 night)

- **Ducking never engaged on speaker films (fixed).** The mixer matches its
  ducking config to mix inputs by PATH EQUALITY; inputs are built with
  resolveVideoPath but resolveDucking passed RAW track sources. Generated
  films' VO sources are already filesystem paths (match), but speaker films
  carry web-style `/assets/...` narration sources -- the trigger never
  matched and ducking silently skipped: full-blast music bed, drowned voice.
  resolveDucking now resolves both sides identically. Symptom log line to
  look for: "Ducking: duckIdx=N triggers=0".
- Marc also reported "no zoom in the render" -- frame extraction shows the
  zoom IS in the mp4 (7.6-10.7s film time, matching the stored move at
  scene-local 1.5s with return). Likely blink-and-miss; awaiting his
  re-check on the re-render.

## Camera-bubble sync investigation (2026-07-19 late night)

Marc reported the camera bubble out of sync with the voice on the rendered
film. What forensics on the mp4 established (methods: motion-event matching,
A/V envelope cross-correlation, droplet cache-frame content checks via the
new /api/render-probe):

- The narration AUDIO is placed exactly right (verified at two points:
  pre-cut offset +6.10s, post-cut film 96 -> source 95.92 vs expected 95.93).
- The bubble is IN SYNC in the pre-cut region (correlation peak at 0.0s lag).
- The droplet's frame extraction + cache are content-exact (probed at 4
  indices; ffmpeg 4.4.2 vs sandbox 7.0 -- initial suspicion of VFR resample
  divergence was WRONG; do not chase it again).
- Post-cut verdicts were unreliable on this footage: the speaker sits nearly
  motionless, so pixel methods can't discriminate candidate maps. UNRESOLVED
  whether the rendered bubble mis-maps after the seams; need Marc's eyes
  (where/when/lead-or-lag) to narrow it.
- REAL data bug found and fixed regardless: applySpeakerCut/Restore updated
  clip.edl.cuts but carried clip.edl.segments STALE (Marc's film had cuts
  [74.85, 84.88] but segments encoding only 74.85). Both now re-derive
  segments from the merged cuts (speakerSegmentsFor). No active consumer of
  the stale field was identified -- media_edits carried the correct map into
  both the render and the Studio composite -- but two encodings of one fact
  must not disagree.

## Camera-sync ROOT CAUSE (2026-07-19, after Marc's 13-16s pointer)

**Found and fixed: the stitch INSERTS transition segments (default 0.5s
crossfade at every scene boundary) into the video, while every audio track
is placed at its raw content-clock start_time.** Result: ALL scene video
after the first boundary runs late vs the audio by the accumulated
transition time -- on Marc's film exactly +0.50s from film 6.6 onward,
measured at 0.92-0.97 correlation by region-matched video-to-video
alignment (bubble AND screen; the audio itself was placed exactly). The
container math sealed it: 123.2s content + 2x0.5s inserted = 124.2s
observed duration. Preview is unaffected (no inserted transitions), which
is why the Studio looked perfect.

Fix: renderVideo records every inserted transition (content-time, seconds)
and shifts each audio track's start by the insertions at/before it; the mix
duration includes inserted time. renderAudioOnly computes the same from
project data (expectedInsertedTransitions, unit-tested).

Investigation debris worth keeping: droplet ffmpeg 4.4.2 and sandbox 7.0
produce BYTE-IDENTICAL fps-filter extractions (verified frame-by-frame with
a downloaded 4.4.1 static build) -- do not suspect VFR resampling again.
Statistical A/V-lag methods (motion-vs-envelope correlation) FAIL on
sitting-still footage; region-matched video-to-video correlation is the
reliable instrument.

OPEN QUESTION (preview-render parity): the Studio's film clock has no
transitions, the render's does -- so rendered timestamps run ahead of
studio timestamps by 0.5s per boundary. Consider OVERLAPPING transitions
(no inserted time) instead, which would unify the clocks; needs a call.

## HTTPS resolution (2026-07-19 night): it was already working

Marc was right to be surprised: this droplet has a WORKING hand-written
Caddy setup from before — caddy v2.11.2 active, valid Let's Encrypt cert
for **159-203-115-164.nip.io** (rsa4096), reverse_proxy to :3200, plus a
/hyperframes/* route to :3001. setup-caddy.sh correctly refused to touch
the unmanaged Caddyfile, but the debugging session then probed its OWN
invented fallback (sslip.io) instead of discovering the configured domain
— hence "no cert" for 35 minutes of head-scratching. Lesson: inspect the
box's actual state (now possible via GET /api/caddy-status) before
concluding anything about it.

Changes: setup-caddy.sh now ADOPTS an existing hand-written Caddyfile
that proxies our port (uses its site address for MP_PUBLIC_URL, touches
nothing); fresh installs use nip.io + `key_type rsa4096` per the proven
recipe; extension default server + docs point at
https://159-203-115-164.nip.io. Do NOT overwrite the hand-written
Caddyfile on this droplet — it carries the /hyperframes route.

## TESTPLAN run findings, round 1 (Marc, 2026-07-20)

- **Upload progress** (extension 0.8.0): a 5-minute take is a 100-300MB
  upload and the popup said only "Uploading…" — reads as a hang. The
  offscreen uploader now uses XHR (real page context, so upload.onprogress
  works; fetch has no upload progress) with ONE combined meter across tab +
  camera files; popup renders "Uploading… 42% · 38 / 91 MB", live and when
  opened mid-upload (progress rides qrLastStatus in storage.session).
- **HUD timer flash**: the PiP HUD's clock interval started when the HUD
  opened — during the 3-2-1 countdown — while rollT was still 0, so it
  rendered Date.now() as minutes for a beat. Shows 0:00 until the take
  actually rolls.

## Timelapse as a deliberate effect (2026-07-20)

Marc's experiment film (proj_c55cfce5, 217s cut, 142s of footage jammed
into a 1.8s pin window) proved the failure mode: continuous fast-forward
past ~8x reads as an ugly smear, and past 16x the pin math simply cannot
land ("lands 8.1s off"). The answer is the film-grammar move real editors
use: a TIMELAPSE beat that owns its own film time.

- **Data**: `MediaIntents.timelapses [{src_start, src_end, out_seconds}]`
  — exact-duration, cap-exempt constraints. Solver emits `tl: 1` segments
  with fixed rate (kept-span/out_seconds, clamp 0.1..2000), excluded from
  pin-window flexing. `edl.gaps [{src_at, seconds}]` on the speaker clip
  funds the beat: applyTimelapse splices a matching silence gap into the
  talk track (cutAudioToWithGaps), so captions/pins/booth cues ripple once
  and nothing desyncs. removeTimelapse refunds the gap. The camera bubble
  freezes (adjustHold) for the beat.
- **Playback**: past 8x a tl segment plays as SAMPLED frames (0.45s
  flipbook steps in mapSourceTime + MAP_SOURCE_TIME_JS) instead of
  continuous blur, with an elapsed-clock chip ("⏱ +2:47 · ⏩28×") emitted
  by timelapseClockScript — a zero-ease proxy tween on the scene timeline
  (NOT rAF wall-clock), so capture seeks and Studio playback render it
  identically. The clock ticks on the same 0.45s quantum as the frames.
- **Policy**: suggest when it's ugly, auto only when it's impossible.
  8-16x continuous segments get a dashed ⏩? chip in the effects lane
  (click → make it deliberate); a pin strained past 16x triggers
  autoTimelapseForStrain server-side — loud (studio toast), visible
  (striped ⏩ block in the effects lane), reversible (resize/remove in the
  same popover). 16x stays the continuous-video cap.
- **Routes**: POST /api/timelapse/:tenant/:project {action: apply|remove,
  scene_id, key, src_start, src_end?, out_seconds?}; /api/media-edits ops
  return `{timelapse_auto, note, project}` when the auto fires. Transcript
  cache re-keys across the gap (maintainTranscriptCacheAfterGap); the
  Studio reuses afterSpeakerEdit's bake_seam shift client-side.

Acceptance film is proj_c55cfce5: cut, pin, accept the suggestion, and
the film should read clean.

## Timelapse UI correction (Marc, 2026-07-20): it's a SEGMENT, not an effect

Marc's read on the first live version: "Why did you make it an effect? I
would have expected it to just be a segment type." He's right — a
timelapse maps 1:1 onto a span of footage, which is exactly what the
screen lane's rate blocks are; drawing it as a second bar in the effects
lane put two pictures of one truth on screen. His screenshot also caught
a real bug: renderMediaLane didn't know tl rates (clamped everything to
16x for width), so the screen lane drew the timelapsed stretch too wide
and shoved the map past the pins — while the effects block sat perfectly
between them.

Now: tl segments render IN the screen lane as a striped "⏩ 28.2×"
segment (click → resize/remove popover); fast (8x+) plain segments carry
a small ⏩? tag (click → make it deliberate); the effects lane is back to
zooms/callouts only; screen-lane widths are tl-aware so the map lines up
with the pins.

## Timelapse round 3 (Marc, 2026-07-20): "it should end at the wow"

Marc pinned "right," and "wow" with ~13s of talk left between them, and
the auto sized the beat with its default heuristic (8s) while the pins
already defined a 12.8s window. The solver then stretched the 0.5s of
leftover footage to 0.104x slow motion to fill the 4.3s surplus --
"that's the wrong math", and playback visibly didn't end at the pinned
frame. Three coordinated fixes:

- **Solver floor**: auto-flex never slows footage below min(pref, 1) --
  relaxing fast prefs toward 1x to fill a window stays; sub-1x crawl is
  gone. Whatever the floor can't fill becomes a HOLD on the pinned frame
  ("arrives early -- holds", same as every other surplus window). Also:
  adjacent same-rate tl pieces merge across hard boundaries (a rate
  region ending mid-beat split one beat into two lane blocks).
- **Auto sizing fills the window**: when the pins already define a window
  wider than the default beat, out_seconds = window - 1x-landing-residual
  (edge-to-edge, ending at the pinned word) with NO gap and NO film
  growth. Only a too-small window falls back to the funded 3..8s default.
- **Resize measures the window**: applyTimelapse's prevOut is always the
  pin-to-pin window, never the beat's stored out_seconds -- resizing a
  beat inside an already-wide window must not splice a bogus gap.

## Timelapse round 4 (Marc, 2026-07-20): preview map didn't know tl either

"Still off... the scene I pinned is happening where the playhead is" —
~1.5s late. Root cause: the Studio preview has its OWN copy of the
source-time mapper (edlMapClient in preview-app.ts) and it still clamped
every rate to 16x, so it played the 18.3x beat ~15% long and everything
after landed late. Same bug class as renderMediaLane in round 3 — there
are now three tl-aware mapper twins that must agree: mapSourceTime (TS,
render), MAP_SOURCE_TIME_JS (injected), edlMapClient (preview). Grep all
three when touching mapping.

Also: the beat's FINAL 0.45s flipbook step now parks on the landing
frame (src_end−0.05) in all three mappers — the beat settles on the
exact frame playback continues from, and the preview buffers the landing
before the boundary instead of seeking there late.

## Timelapse polish (Marc, 2026-07-20): the block ends exactly at the pin

Playback verdict after round 4: "pretty accurate and pretty tight" — one
visual complaint left: the striped block ended 0.5s before the pin (the
auto's real-speed lead-out). That lead-out is redundant since the beat's
final flipbook step parks on the landing frame, so the auto's span now
runs to the pinned frame itself (spanEnd = pin.src) and the beat fills
the window exactly: block edge == pin, visually and temporally.

## PiP bubble controls round 2 (Marc, 2026-07-20): shape + drag

Marc: "change the PIP size and location... square to rectangle to circle
... move it around the screen." What existed: corner presets + S/M/L on
the bubble popover (and a separate built-in pip_* config on
screencast-frame that pipeline scenes use). Added for the camera_pip /
booth_pip component path his films use:

- screencast-frame gains data.shape:'circle' ('none' mode): square
  cover-cropped viewport clipped to a circle (frame box fitted 1:1; the
  media branch center-crops so no letterbox wedges inside the ring).
  Studio squares the position box in px when switching (h% = w% * 16/9
  on the 16:9 canvas).
- Bubble popover: Rect / Round / Circle buttons (corner_radius 0 / 18 /
  shape:circle) via the component PATCH route.
- The bubble is now DIRECTLY draggable in the preview: grabbing it moves
  the bubble (the zoom marquee still owns drags that start anywhere
  else); release PATCHes position -- no preview reload needed.

## Chapters become first-class edits (Marc, 2026-07-20)

Design settled through debate: a chapter card is "an overlay that says
chapter on it" -- an EFFECT, not a ruler marker (Marc: "the time scrubber
should be sacred... your main navigational UI construct"; nothing lives
on the ruler, ever). Data stays where the renderer reads it, the callout
pattern: narration-track's data.chapters [{title, at, dur?}].

- Effects lane renders ⚑ blocks (white/indigo) from data.chapters; click
  → popover: title / at / shows-for / Delete → component PATCH.
- Add: click the actual screen → revise popover gains "⚑ Add chapter
  here…" (drops one at the playhead); clicking the on-screen chapter
  card itself offers "⚑ Edit this chapter…".
- chapters_edited flag: the sentence spine only DRAFTS the chapter list;
  once Studio has written it, re-attaching narration keeps the user's
  list verbatim (auto never overwrites edits).
- narration-track honors per-chapter dur (card hold, default 2.2s).

Auto policy unchanged for now: the spine still drafts chapters on first
assembly. If living with editable chapters still annoys, downgrading the
draft to a suggestion is a one-line policy change on this same UI.

## Booth draft 500 + deploy resilience (Marc, 2026-07-20)

Marc clicked booth's Draft Script and got a 500: "Anthropic returned
empty response". Root cause was NOT the film analysis (runs clean on his
project) but the LLM call budget: newer models think by default and the
thinking spends from max_tokens, so the drafter's 1500 cap was consumed
before any JSON text was emitted.

- booth-script maxTokens 1500 -> 6000 (with a comment naming the trap).
- llm client's empty-response error now reports stop_reason + returned
  block types and hints "raise maxTokens" when stop_reason=max_tokens.
- Live-verified on proj_c55cfce5: draft returns a timed cue list; the
  timelapse span correctly gets a single bridging line.

Same PR fixes the deploy wedge that took the droplet down twice:

- /api/deploy's detached child was still the app's process-tree child,
  and pm2 kills by walking ppids -- a reload mid-deploy SIGINT-killed
  `npm ci`, leaving a half-built dist crash-looping. The deploy is now
  double-forked (setsid + nohup) so it re-parents to init. Proven live:
  the first post-merge auto-deploy (old code) died at its own pm2
  reload; the second (new code) ran through reload to completion.
- New health watchdog, installed idempotently by deploy.sh: pm2
  max_memory_restart 1200M + an every-minute /etc/cron.d probe of
  /health. Escalation: 3 straight misses -> pm2 restart; 2 restarts
  without recovery -> full `deploy.sh master` under flock (the only
  cure for a corrupted dist). Any healthy probe resets the ladder.
  Log: /var/log/mp-watchdog.log.

## Revise-an-element works on speaker films (Marc, 2026-07-20)

Marc highlighted the PiP bubble, typed "can you make this even smaller?",
and got "Error: API error 400". Root cause: reviseScene only knew two
editing primitives -- patch a CODEGEN component's source, or edit an
st- TEMPLATE's slots. Speaker films are neither: pure library-component
compositions (screencast-frame, narration-track, gradient-background),
so EVERY element revise on a speaker film 400'd with "no codegen
component to revise". (The Studio also swallowed the body and showed
only the status code.)

- New third primitive: library-component DATA revise. A click that
  resolves to a library component maps the instruction onto that
  component's schema-constrained data (same LLM contract as template
  slots, incl. the _note escape hatch), MERGES new over old (a dropped
  key must never delete video_url -- that key IS the film), saves, and
  re-assembles the preview.
- Routing is now an exported pure function (resolveReviseTarget):
  element hit on a library comp -> component-data; codegen comp ->
  source patch (unchanged); st- -> slot revise (unchanged); else an
  instructive error naming the scene's components.
- Studio sends the resolved compId with the element payload, and api()
  now surfaces the server's error body instead of "API error N".
- Regression suite: test/scene-revise.test.ts -- routing matrix, LLM
  guardrails (schema echoes, garbage JSON, dropped keys), the on-disk
  component-data path with a mocked LLM, and source guards on the
  Studio template literal (compId in payload, data-cid reading, error
  body surfacing).

## Multi-tenancy phase 1: enforcement (Marc, 2026-07-20)

Analysis for the multi-tenant push found the system was multi-tenant in
storage only: authMiddleware resolved WHO you are, then every API route
took the tenant from the URL and every MCP tool from a plain tenant_id
param -- nothing compared them. Any logged-in user could read/write any
tenant. (Also: Jacob's OAuth tenant HAD been created correctly --
jacob-getquotient-ai in _system/tenants.json; it looked missing because
tenant DIRECTORIES are created lazily on first write, so `ls` of the
data dir misses login-only tenants.)

- Single choke point in index.ts after authMiddleware: every
  tenant-scoped /api route (tenant = first segment; revise/undo nested)
  403s unless the token's tenant matches. "*" is the new ADMIN scope
  (AUTH_TOKENS entry like "opstok:*") for cross-tenant operator tooling.
  ADDING A ROUTE: register it in the alternation (or, if tenant-less,
  in the test's allowlist) -- test/tenant-enforcement.test.ts scans the
  source and fails on unregistered /api routes.
- MCP tools now act on the SESSION's tenant: /mcp stamps req.auth, the
  SDK surfaces it as extra.authInfo, and a tenant-enforcing tool()
  wrapper overrides params.tenant_id with it (param still honored for
  admin/stdio-dev sessions, where it is required). tenant_id is now
  optional in every tool schema -- authenticated users stop passing it.
- Job routes (no tenant in URL): list is forced to the caller's tenant;
  single-job GET and wait answer 404 for a foreign tenant's job (job
  existence itself is cross-tenant information).
- Closed while auditing: /assets/_system/* served UNAUTHENTICATED --
  including _system/tenants.json (user emails/names) and deploy.log;
  now only _system/cache/ (music bed cache) is served. Tenant registry
  path now follows config.dataDir instead of a hardcoded
  /data/media-producer.
- Deploy note: static tokens in AUTH_TOKENS now really scope to their
  mapped tenant (DEPLOY.md documents preview123 -> marc-getquotient-ai).

Phase 2 (next): "Sign in with Google" in the recorder extension via the
server's existing OAuth PKCE endpoints -- zero fields in the popup, the
session's tenant does the rest.

## Multi-tenancy phase 2: extension "Sign in with Google" (Marc, 2026-07-20)

The bar, verbatim: "in the extension there will be nothing the user has
to enter besides logging in. I don't want to even show the tenant id or
url of the droplet or anything."

- Popup is now zero-field: signed-out shows one "Sign in with Google"
  button; signed-in shows an avatar/name/email card with Sign out. The
  record button is gated on auth (and upload terminal states cannot
  re-enable a signed-out popup).
- The extension registers itself as an OAuth client of the server's
  EXISTING surface (RFC 7591 /register, /authorize backed by Google,
  /token with PKCE + rotating refresh) -- no new server code. Flow:
  chrome.identity.launchWebAuthFlow -> code+state to the pinned
  chromiumapp.org redirect -> /token exchange -> /auth/me for
  email/tenant.
- After sign-in the account is mirrored into the SAME sync settings the
  recording pipeline has always read ({server, tenant, token}), so
  capture/upload/generate paths are untouched. The 24h JWT silently
  refreshes before auth-status renders and before every take starts.
- Server URL is baked into the build (users never see it). Manual-token
  installs are grandfathered as a "(configured token)" signed-in state.
- Manifest 0.9.0 (+"identity" permission); zip rebuilt (served at
  /extension.zip). Regression: test/extension-auth.test.ts guards the
  zero-field contract, PKCE/state/refresh wiring, and settings mirror.
- Same-account-everywhere now holds: MCP login and extension login are
  the same Google identity -> same tenant (enforcement from phase 1).

## Tenants visible from first login + admin listing (Marc, 2026-07-20)

- First OAuth login now eagerly scaffolds the tenant on disk
  (projects/, brand-kit/assets/, components/) -- lazily-created dirs
  made login-only tenants invisible to `ls`, which is exactly how
  Jacob's (correctly created) tenant read as missing. Naming stays
  slugified full email: marc@getquotient.ai -> marc-getquotient-ai,
  jacob@getquotient.ai -> jacob-getquotient-ai.
- GET /api/tenants (admin "*" scope or deploy token ONLY): registry
  entries merged with on-disk state -- tenant_id, email, name,
  created/last-login, on_disk, project count. Replaces the ls
  heuristic.
- Extension: removed the grandfathered manual-token path (Marc: only
  him + Jacob use this; no backwards compatibility wanted). Sign-in is
  now the only way in.

## Studio: session login, tenant field gone (Marc, 2026-07-20)

"If I am logged in as the right user shouldn't I be able to just use
studio without passing in tenant and token every time... I don't even
want to see that field at the top of studio anymore."

- Google login now sets an HttpOnly SameSite=Lax session cookie
  (mp_session, 30 days) and redirects back into Studio; extractToken
  accepts it alongside Bearer/?token=, so the whole API works
  cookie-authenticated. /auth/logout clears it (Sign out link in the
  header chip). return_to is constrained to on-site paths.
- A BARE /studio now just works: boot asks /auth/me (cookie), resolves
  the session's tenant, loads its projects; signed out -> bounce
  through Google and straight back. Share links with ?tenant=&token=
  still work and win when present.
- The Tenant field and Load button are GONE from the Studio header --
  replaced by the project picker plus a signed-in chip (avatar, email,
  sign out). Tenant is never typed anywhere anymore: MCP, extension,
  and Studio all derive it from the login, with phase-1 enforcement
  underneath.

## Extension badge: the take's status at a glance (Marc, 2026-07-21)

Marc: "the extension has a little 'rec' on the icon... what else can you
add to that little icon?" The badge is now a full state machine:

- Armed: amber "•" (click the page to start).
- Recording: a TICKING elapsed clock (M:SS red; >=10min "12m"). The
  offscreen document is the 1s metronome -- it is alive exactly while a
  take is, and its ticks also keep the MV3 worker from idling out.
- Paused: "⏸". Chapter mark (⌘⇧N): flashes "⚑" 1.2s so the keystroke
  visibly landed, then the clock resumes.
- Uploading: live percentage (blue). Assembling: "⋯" (indigo).
  Ready: "✓" (green). Failed: "!" (red). Opening the popup
  acknowledges terminal states and clears the badge.
- The tooltip always carries the long-form state (hover the icon).
- Extension 0.9.1; zip rebuilt; source guards added to
  test/extension-auth.test.ts.

## Screen-owned film clock (Marc, 2026-07-21)

Live report: a screen-only recording (no speaker) stayed 3:25 after Marc
cut it down to ~1:45 -- the scene kept its stale recorded duration and
the tail rendered as a long dead hatch. "Shouldn't the whole video get
shorter?" Yes:

- New concept: screenOwnsClock(project) -- true when nothing
  audio-anchored exists (no speaker clips, no voiceover; music alone
  doesn't anchor). In that world the footage IS the film clock.
- contractSceneToEdl: after every media-edit op, legacy segments save,
  and timelapse apply/remove, a screen-owned scene's duration_seconds
  becomes the EDL's natural output length (kept footage at its rates;
  clearing all edits restores the source duration). Speaker films NEVER
  move -- audio must not shift when footage is edited.
- Studio applies the contracted duration from the op response
  (scene.duration_seconds + totalDuration) before restarting the
  preview, so the ruler, hatch, and total time agree immediately.
- Regression: media-edl.test.ts covers the ownership predicate, the
  contraction math (cuts, rates, restore, speaker-film immunity), and
  that a plain cut solves to kept-footage length with no pad/hold.
  Route-level verified locally: add_cut 60..120 on a 205s scene ->
  duration 145; clear -> 205.

## Camera parity: pan + rotate join zoom in Studio (Marc, 2026-07-21)

Marc: "bring panning and rotate up to parity with zoom and callout" --
we're not only making product walkthroughs; tempo-cut films live on
camera language. The ENGINE always supported zoom/pan/rotate/reset (the
generation pipeline places them); only hand-authoring was zoom-only.

- Revise popover on any element now offers "→ Pan here" and "↻ Rotate"
  next to the zooms. Pan glides the focal point to the element keeping
  the current zoom; the first move in a scene carries its own 1.4x
  (runtime change: pan/rotate honor an explicit m.scale -- a 1x pan is
  invisible). Rotate tilts 8 degrees by default.
- The effects-lane block popover gains an angle field (rotate, +/-45)
  and shows scale for every non-box move; blocks already rendered with
  ↔ / ↻ glyphs.
- One camera runtime (cameraMovesScript) serves preview AND render, so
  no twin drift.

## 3D aside: frame tilts away, words type in, camera returns (Marc, 2026-07-21)

Marc: "take the entire browser frame, rotate it in three dimensions off
to the side, making room on the left where I could type in some words...
then have the thing pan back and fill up the entire screen."

- New camera move type "aside" (types.ts + cameraMovesScript): the
  frame's own component wrapper tilts in real perspective (rotationY,
  transformPerspective 1600, slight scale-down, slide toward the far
  side); brand-styled words TYPE ON character-by-character in the
  cleared third (word-grouped so lines never break mid-word); the words
  exit and the frame glides back to full screen. Captions, bubble and
  backdrop stay level -- asides never join the 2D rig groups.
- Studio: "◧ Aside + words" button in the revise popover (video
  selected) places one at the playhead; its ◧ effects-lane block edits
  words, side (left/right), timing, hold, scale, return.
- Verified headless: matrix3d mid-move (real z-rotation), 27 chars
  typed on, words gone before the return, frame back to visual
  identity after. One camera runtime serves preview and render.

## Composable primitives: 3D rotate + text, aside retired (Marc, 2026-07-21)

Marc, on reviewing the aside: "I would rather see if I can just simply
make rotate more robust and then use the existing tools to add the
text in." Right call -- the aside was a macro pretending to be a
primitive. Now:

- ROTATE is fully 3D: axis knob on the block (z = flat spin, y = 3D
  book-page turn, x = 3D tilt), plus a signed shift (canvas %) that
  clears space beside/above the tilted frame, plus scale. Non-z axes
  get perspective automatically; return/reset flatten rotationX/Y too.
- TEXT is a primitive: "T Add text here" in the revise popover drops a
  real kinetic-text component (type-on entrance, brand-styled) at the
  playhead where you clicked, with its own start time. Because it is a
  component, the existing tools take over: click it to revise ("make
  it bigger", "change the words") or Remove (new button when a
  kinetic-text is selected). New routes: POST/DELETE
  /api/projects/:t/:p/scenes/:sid/components (choke-point guarded).
- Marc's scene is now a recipe, not a feature: rotate(y, -26deg,
  shift 18%) + text at the playhead + return.
- The ◧ Aside button is gone; its runtime + block editor stay so any
  placed blocks keep working. Headless-verified: the 3D rotate
  produces the identical mid-move matrix3d the aside did.

## 3D rotate gets assertive; aside fully removed (Marc, 2026-07-21)

Marc on the first 3D rotate test: "the rotation is not really getting
out of the way -- I would have expected a greater tilt, greater slide.
Also, did you leave the aside effect in there?"

- The aside is now fully gone: type, runtime, block-editor fields,
  glyph. (No projects carried aside moves; verified before removal.)
- 3D rotate defaults are ASSERTIVE: on axis y/x, the neutral values
  (angle 0, shift 0, scale 1) read as "untouched" and upgrade to a
  real turn (-26deg), a real slide (18% away from the receding edge)
  and a step back (0.86). Any deliberately set value is honored. The
  block editor mirrors this: switching axis to y/x autofills the
  preset into still-default fields so what you see saved is what
  plays. Marc's existing y-axis blocks upgrade automatically.

## Pan is never a no-op (Marc, 2026-07-21)

Marc: "I hit pan and nothing happens." Root cause: pan was defined as
"move the focal point at the CURRENT zoom" -- and at 1x (the camera
returns to wide after most moves) a pan is mathematically nothing: the
whole frame is visible and the cover-clamp pins motion to zero. The
add-a-scale heuristic only fired when the scene had no earlier moves,
so any scene with existing camera work authored invisible pans.

- Authored pans always carry their own zoom (1.4x, editable on the ↔
  block) and the runtime guarantees the floor for any pan without one:
  glide at the current zoom when pushed in, drift in at 1.4x when
  wide. A pan now ALWAYS moves.
- Chaining pans glides the camera point-to-point while zoomed --
  Marc's "pan over to that box" model without a new gesture. A
  draw-a-box pan target (a la Zoom inside) remains an option if
  clicking elements isn't precise enough in practice.

## Pan is a peer effect + drag gesture + parallel lane bars (Marc, 2026-07-21)

Marc's design, refined over two rounds: (1) pan's gesture is DRAGGING
the picture to a new spot -- a box is zoom's metaphor, pan is
movement; (2) pan and zoom are SEPARATE effects, unaware of each
other, that may run at the same time (a pan riding a zoom's hold);
(3) when two effects overlap in time, the effects-lane bars split the
height and run in parallel -- peers should look like peers.

- Runtime (cameraMovesScript): a pan resolves at its tween's FIRST
  RENDER, not at build time. It adopts whatever scale the camera
  holds at that moment (a holding zoom keeps its zoom; a wide camera
  gets the 1.4x floor so motion is never invisible) and its return
  restores the PRE-PAN framing -- never yanking a still-holding zoom
  back to wide. The zoom's own return still carries the camera home
  from wherever the pan left it (GSAP return tweens read live state).
  Headless-verified: pan inside a 2.5x hold glides at 2.5x to the
  focal, returns to the zoom framing, zoom return lands identity;
  bare pan floors at 1.4x with the cover-clamp.
- Studio gesture: the ↔ Pan button (element AND scene popovers) ARMS
  grab-drag mode -- drag the preview footage where the camera should
  look (maps convention: the picture follows the cursor), release
  drops the pan block at the playhead. Live feedback rides the real
  camera rig (scene root stands in when no rig exists yet); a wide
  camera snaps to 1.4x on grab so the drag previews the truth. Esc
  cancels and restores. Saved drag-pans carry NO scale -- the block
  editor shows scale as "auto" (blank = adopt at fire time).
- Effects lane: blocks are collected then laid out; transitively
  overlapping blocks cluster, get greedy row assignment, and each
  concurrent block renders at 1/n of the 26px bed (.fx-thin) --
  parallel effects read as parallel bars. Generalizes past two but
  two is the practical case.
- Tests: test/camera-pan.test.ts pins the fire-time contract, the
  no-scale drag-pan, the dual popover entry, the lane split, and
  syntax-parses the generated Studio JS (the template-literal trap).

## Pan v3: pure translation + pan-inside (Marc, 2026-07-21)

Marc: "when I pan, it seems to also be zooming... I don't think we
should be doing [the 1.4x]" and: should pan get an inside variant to
match zoom-inside? Yes to both.

- Pan NEVER zooms. The 1.4x floor is deleted everywhere -- it was a
  leftover from the click era, when invisible pans were a FEEDBACK
  problem patched with forced zoom. The runtime tweens x/y only (a
  scale on the move is ignored), the drag saves no scale, and the
  block editor has no scale field for pans (and strips scale from
  legacy pan blocks on save).
- A wide (1x) camera has nowhere to pan: the cover-clamp pins the
  motion to zero and that no-op is the HONEST answer. Studio says so
  the moment you grab at wide ("add a zoom, then drag during its
  hold") instead of faking motion.
- ⊕ Pan inside…: zoom-inside's sibling, shown when the selection is
  (or contains) a video. Same grab-drag, aimed at the footage inside
  the frame -- travel across a magnified recording without moving the
  browser frame. Requires an inside-zoom first (the grab says so);
  the saved move carries the same video[src*=...] target zoom-inside
  uses, feedback rides the content rig, and the frame's crop masks
  the travel (clamped to the footage's own range).
- Scene-pan feedback now targets the SCENE rig specifically
  (:not(--content)) so an in-video rig can't stand in for the camera.
- Probe re-verified: pan inside a 2.5x hold still glides at 2.5x and
  returns to the zoom framing; a bare pan on a wide camera measures
  identity throughout (deliberate no-op).

## Pan inside falls back to the scene zoom (Marc, 2026-07-21)

Marc, zoomed on the composer via a SCENE zoom, clicked Pan inside and
was told "nothing to pan inside yet" -- technically correct (the
footage inside the frame wasn't magnified; only Zoom inside... does
that), humanly wrong (he was looking at a zoomed picture). "Pan what
I see" wins: when Pan inside finds no magnified footage but the scene
camera IS zoomed, the grab falls back to a scene pan with a status
note explaining the switch. The refusal now only fires when nothing
is zoomed at all (and mentions scrubbing into the zoom's hold as the
other likely miss).

## Pan reads the lane, not just the pixels (Marc, 2026-07-21)

Marc, with a genuine Zoom inside... block AT the playhead, clicked
Pan inside and was told nothing was magnified. Root cause: the grab
checked the DOM's current instant, and at a zoom block's own start
the rig hasn't eased in yet -- measured wide, refused, and my status
message then misdiagnosed his zoom as scene-level (it was targeted;
verified in proj_c55cfce5's data). The author's intent lives in the
LANE, so the grab now resolves in priority order:
 1. a zoom whose window (ease ramp included, plus a 0.75s pre-window)
    covers the playhead -> RIDE IT: preview jumps to its settled
    framing, the drag happens in the frame the pan will play in, and
    the saved pan's at is nudged to just after the zoom settles so
    the two run parallel (targeted zoom -> inside pan on its target;
    scene zoom -> scene pan);
 2. the rig the button asked for, magnified now;
 3. the other rig, magnified now ("pan what I see", with a note);
 4. a settled zoom window from the data (DOM read misfired);
 5. honest refusal, now mentioning "scrub onto a zoom block".
Also: readXf reads scale/x/y through the iframe's gsap.getProperty
(with matrix AND matrix3d parsing as fallback) -- computed-style
regex parsing missed the matrix3d serialization transforms take
during playback.
## Scripted surfaces: performances survive storyboard → codegen (Marc, 2026-07-22)

Regression test (regenerate the Claude-connector tempo cut from one prompt,
proj_1031fb41) vs the hand-built original (proj_0890a34e): the new film's
mocks arrived FROZEN — static end-state data (progress 3/3, tool calls
already green), no typing, no firing, and the two Quotient scenes hand-rolled
+ failed gates at -46. Root causes, all structural:

- The storyboard's `components` was a STRING array — the prompt said "put the
  full interaction sequence in data.script" but the schema had nowhere to put
  it outside `scene_template.data`, and the sanitizer flattened any object to
  its type string.
- `buildCodegenSpec`'s Component Schemas section listed data fields but never
  `script_actions` — codegen literally never saw that a surface could perform.

Fixed (fix 1+2 of 3; deterministic critique gate deferred):
- `components` entries are now string | {type, data} end to end (DraftScene,
  StoryboardScene, sanitizer keeps authored data, template-assign skips
  scenes carrying it, pipeline helpers normalized). Storyboard prompt +
  tempo-cut contract: performable mocks MUST be staged as objects with a
  timed data.script (static_surface = blocking).
- Codegen spec now carries a "Storyboard-Authored Component Data (embed
  VERBATIM)" section + 🎬 PERFORMABLE schema blocks with the full action
  vocabulary; system prompt: performable surfaces arrive MID-PERFORMANCE.
- Scene-generator enforcement extended: an authored script that doesn't
  survive into the scene HTML triggers the corrective retry (same mechanism
  as the zero-<component>-tags check).
- test/scripted-surfaces.test.ts covers the pass-through.

## Authored compositions skip codegen (Marc, 2026-07-23)

v3 rerun postmortem: with scripts flowing (see previous entry), the mock
scenes STILL shipped broken -- codegen's only remaining job was layout and
it sized a cowork mock 2545px wide inside a 1719px clipping card (content
painted off both edges, rail clipped to "Outpu"/"Cont", 3 revision rounds
burned re-inventing the framing). Marc: hand-built films work because hands
write structured component scenes, not HTML.

- New deterministic path in scene-generator: when every non-backdrop
  component hint is an authored object (data + scripts) the scene is
  instantiated directly -- components with the standard inset framings
  (quotient trio recipe: shell 1.2%/2% 97.6%x96% + center 61.5% + chat
  30.5% with show_panel:false; single window 8%/6.5% 84%x87%), webgl
  backdrop world, ids = types so authored camera anchors resolve, marked
  scene.authored_composition.
- Critique loop + editorial fix pass treat authored compositions like
  template scenes (boot gate only; regen would rebuild the same scene).
- Instant instead of minutes per mock scene; immune to codegen drops.

## Studio structure: badges + inspector + scene focus mode (Marc, 2026-07-23)

Marc: should Studio expose what scenes are made of? Yes -- the data IS the
film now. SPEC-studio-structure.md; rule: structure on the side, time on
the bottom, film-wide lanes only for film-wide things.

- Scene chips: provenance glyph (▦ template / ⬒ composition / ✦ custom)
  -- tells the user how the scene edits before they touch it.
- Inspector drawer (header ⬒ Inspect): scene cast as a tree + the
  resurrected typed prop editor (it was fully built and disabled --
  els.propEditor just had no DOM home). script arrays render as ordered
  at+action+text rows. Saves ride the existing component PATCH.
- Scene focus mode (dblclick a chip): timeline becomes the scene's own
  clock -- row per component, bars enter.at..exit.at with draggable
  edges, script diamonds draggable, beat gridlines with snap. Custom
  scenes render one opaque bar. Every drag is an ordinary PATCH, so
  Studio and MCP edits stay one system.
- animationSchema accepts `at` (assembler honored it since the motion
  architecture; the zod schema silently stripped it).
- Live-verified on proj_fa58e846: 8▦+5⬒ badges, inspector tree +
  7 script rows on the cowork scene, focus lane with 7 diamonds and
  3 beat gridlines on the 13.5s scene clock.

## Authored-layout intelligence + film continuity pass (Marc, 2026-07-28)

Marc on the e2e world film: "generally looks kinda like crap... things
are not lined up correctly... looks like a bunch of separate scenes."
Root causes: the authored-layout fallback stacked every recipe-less
component into the SAME 84% inset (scene 6: stat-card + kinetic-text
center-collided), and nothing enforced cross-cut continuity (cursor cast
in 7/8 scenes with broken handoffs). "Implement them both."

- authoredLayout is now per-INSTANCE and role-aware (scene-generator.ts):
  captions (kinetic-text/annotation/typewriter/caption-*) and heroes
  (stat-card/number-counter-row/headline-carousel/hero-reveal/quote-block)
  never become windows. One surface + copy -> window docks left 58%, copy
  stacks in a real right column; recipes/pairs + copy -> lower-third band;
  no surfaces -> heroes center stage, captions lower third; 3+ recipe-less
  surfaces -> even row, never a stack. ghost-type full-stage z4 (behind
  windows), floating-pills full-stage z38, storyboard-authored backdrops
  DROPPED in world films (one world, one backdrop). Same-type instances
  get unique ids (type, type_2...) and distinct frames. All prior recipes
  (trio/pair/84% inset/accent corners/cursor overlay) pinned unchanged.
- New deterministic continuity pass (src/llm/continuity.ts,
  enforceFilmContinuity) runs in pipeline.ts the moment the scene list
  exists: (1) MATCH-CUT PINNING -- consecutive authored scenes sharing a
  surface type get the later instance pinned to the earlier frame +
  data.match_cut stamped, skipped when the inherited frame would bury a
  sibling column; (2) THE ONE HAND -- cursor-performer capped to the
  first consecutive chain (max 4 scenes), the rest removed, handoffs
  repaired so scene N's first path point = scene N-1's last.
- test/continuity.test.ts (12 tests) pins all of it.
- Post-ship addendum (same day): WORLD INK CLAMP -- the verification
  film exposed storyboards authoring dark-era caption ink (#f5f6fa) on
  the light world (invisible headline). Authored comps skip codegen
  contrast gates, so buildAuthoredCompositionScene now deterministically
  clamps caption/hero ink that matches the world's lightness (or is
  absent on a light world) to the world's ink (brand text / #f5f6fa).

## Off-canvas + text-collision gates; deterministic payoff/close (Marc, 2026-07-28)

Marc on the verified film: scenes 6-7 (the codegen tail) had "some overlap
and some misplacement... the start free trial thing sort of under the
bottom of the canvas." The deterministic path is now the quality path; two
fixes shrink codegen's blast radius:

- Layout probe (capture.ts) now reports offCanvasContent (buttons/media/
  panels/text hanging >=25% past a canvas edge, or buttons/media parked
  fully outside but near -- the CTA-below-the-fold class was invisible to
  every gate because onCanvas() skipped such elements before any check)
  and textCollisions (two text elements overlapping >=40% where neither
  contains the other -- sibling copy on sibling copy). measureLayout
  aggregates both with >=2-probe persistence (entrance/exit transients
  don't count) and emits blocking off_canvas_content / text_collision
  defects; pipeline maps them into the critique loop.
- Tempo-cut storyboard contract: THE PAYOFF BEAT is deterministic
  (stat-card / number-counter-row object -- the layout engine now gives
  heroes center stage), THE CLOSE is a template (st-logo-close), and
  OBJECTS, NOT STRINGS (one plain-string hint silently dropped a whole
  scene to the codegen path this grammar forbids).
- test/layout-gates.test.ts: 4 live-browser gate tests + 2 source guards.

## Editorial grammar + HyperFrames block parity (Marc, 2026-07-28)

Marc on the HyperFrames catalog film (miguel07code's X post): our tempo-cuts
lack that polish; the reference tells its story in huge rolling serif type
alternating with motion-graphic evidence. "Yes build it" + port the missing
blocks. Frame-by-frame analysis showed the polish is typography + grammar,
not block count (our caption family is already 1:1 with theirs).

- NEW FILM GRAMMAR "editorial": typography-first manifesto dialect --
  st-statement beats (huge display-serif thought, ONE *starred* word in
  gradient italic, cream/near-black canvas) ALTERNATING with full-bleed
  evidence beats. Registered end-to-end: creative-director FilmGrammar +
  prompt, storyboard contract (THE ALTERNATION / TEMPERATURE IS RHYTHM /
  ONE EMPHASIS PER STATEMENT / EVIDENCE PERFORMS / KICKERS AS CHAPTERS),
  server zod enum, pipeline policy (component-first creativity clamp 0.15,
  music bed default ON -> bar quantization via the shared music-first prep).
- st-statement scene template: Instrument Serif (Google font, system-serif
  fallback), *emphasis* -> gradient-italic span, data.lines rolling
  sequences (each thought rises from a line mask, holds, rolls up and out),
  themes cream (default, 'light' aliases) / dark (the chapter flip), no
  webgl backdrop ever injected (it paints its own canvas).
- SHADER TRANSITIONS: engine already had 9 gl-transitions + ~20 GSAP types
  (Marc was right to be surprised) -- they just weren't in the scene
  contract. Added 6 new GLSL shaders for HyperFrames parity
  (shader-flash-white, shader-light-leak, shader-gravitational-lens,
  shader-thermal, shader-domain-warp, shader-ridged-burn) and exposed the
  FULL shader family + whip-pan/cinematic-zoom/push in the SceneTransition
  union + storyboard vocabulary.
- NEW BLOCKS (agent-built, conventions-checked): lower-third (8 broadcast
  presets: clean-bar, accent-underline, bold-block, color-block, dark-card,
  kicker-name, mask-reveal, soft-pill), terminal-run theme presets (8
  macOS-Terminal-inspired: pro, ocean, red-sands, homebrew, novel,
  silver-aerogel, grass, clear-dark via CSS-var retune), map-route
  (stylized dot-matrix world/US map with bezier route arcs + pulsing
  markers), device-showcase (CSS-3D iPhone/MacBook/duo glamour shells with
  screenshot slots + float).
- Tests: editorial.test.ts (9), hyperframes-blocks.test.ts (4),
  hyperframes-blocks2.test.ts (6). Full suite 568 passed (same 4
  pre-existing env failures). st-statement proof frames captured
  headlessly: cream + gradient emphasis + dark variant all correct.

## Shot-per-shot recreation round 2: fidelity fixes (Marc, 2026-07-28)

Marc: "I don't think what we built looks like the reference video shot per
shot at all." He was right -- the first pass sampled 12 stills of a
~28-shot sub-second montage and called it shot-per-shot. Round 2 rebuilt
against the definitive 3fps shot list (28 shots incl. X-post card, phone
trio, 52-counter pair, Spotify card, npx line, 01-04 step sequence,
build-up checklist, 5 category cards, github URL) and forced out real
product fixes:

- MICRO-SHOT ENTRANCE COMPRESSION (scene-assembler): component entrances
  are authored for 4-8s scenes; sub-1.4s cuts sampled EMPTY. Scenes
  <=1.4s now play each component timeline at 2.2/duration speed.
  + scene-cache CACHE_VERSION bump (assembler changes now bust the cache;
  a stale 273ms "re-render" proved they didn't).
- glass-shard-wall (threed): three.js beveled glass mosaic with teal
  text ghosting through -- the reference's one build-from-scratch visual.
- vignette-spot (effects): radial ellipse wash (category-card backdrop).
- code-block style:"bare" (+font_size/color): naked mono lines on the
  scene canvas -- terminal-line beats and checklists were invisible
  dark-on-dark inside the window chrome.
- kinetic-text font_size: hero numerals ("52" at 16vw) vs the 60px
  caption default.
- flowchart FIT TO THE SHOT: the 5s draw choreography now scales to
  complete by ~55% of the scene -- micro-shots show the whole tree.

## Recreation closed: 28-for-28 + settled entrances (Marc, 2026-07-28)

The HyperFrames catalog recreation (proj_3acdc1c8) reached visual-twin
state and Marc closed the arc. Final rounds (PRs #535-#539):

- Typography/scale controls: kinetic-text font/letter_spacing/font_weight/
  accent_color/align; st-manifesto data.uniform (no small-word shrink);
  x-post-card + spotify data.scale. GOTCHA FOUND: an inline CSS transform
  scale was silently overwritten by the first GSAP tween touching scale --
  display scale must be folded into the tween values themselves.
- spotify-now-playing layout:"card" (portrait hero: big square art +
  note glyph + Spotify badge); x-post-card count-ups parse K/M suffixes
  ("2.3K" ticked to 2 before); flowchart per-node color chips (sticky-note
  style, auto text contrast) + edge_color; device-showcase screen presets
  (app-hero/app-stats/app-chart) + data.rotate for fanned trios;
  glass-shard-wall cool silver-blue palette + text_front.
- PACING: Marc "seems much faster than the original" -- two real causes:
  15fps preview choppiness (production 30fps fixed most of it) and four
  scene durations diverging from the reference cut rhythm (matched; film
  now 24.2s vs ref 24.1s, cut-for-cut).
- SETTLED ENTRANCES (scene.entrance:"settled", PR #538): assembler plays
  each component timeline's [2.2s, 2.2s+dur] window via tweenFromTo --
  hard cuts land on STANDING content (entrances/count-ups resolved,
  ambient still running). ctx.duration deliberately NOT extended: the
  components' `duration > 2` exit guards keep exits out of the window,
  which also limits the flag to scenes <= 2s. CACHE_VERSION 4. Applied to
  the 25 hold shots; the glass wall drift + checklist build stay animated.
- Operator playbook now carries the four-grammar cheat sheet (product
  demos the product = tempo-cut; words carry the argument = editorial;
  one cinematic world = launch-film; human on camera = speaker-screencast)
  so driving agents ask the right question and pin film_grammar.

Next up (Marc's backlog): Studio scrubber component bars always visible
(design the density problem), narration/script-from-video test+fix pass,
Studio aesthetic polish.

## Auto-fix loop: gate defects become data repairs (2026-07-31)

Component-assembled scenes (speaker films, takeovers, most of tempo-cut,
data-story and social-reel) have no codegen source, so every gate finding
shipped as `quality: {passed:false, attempts:0}` -- an honest measurement
nobody could act on. `src/core/scene-repair.ts` (PRs #584, #585) turns the
findings into deterministic DATA patches, applied inside a
measure -> repair -> re-measure loop in the authored branch of
`pipeline.ts`, bounded by `maxRetries`. The stamp is now honest in both
directions: `passed` can be true, `attempts` counts repair passes, and a
`repairs` log says what was changed.

The table (each family derived from a repair performed BY HAND earlier in
the session, then re-derived from the first live run):
- clipped_text / off_canvas -> font_size x0.8 + container height x1.5
- off_canvas_content -> clamp the box back inside (full-bleed exempt)
- illegible -> repaint `data.color` from the backdrop luminance the gate
  measured: < 0.18 -> #ffffff, else #101014
- dead_entrance -> entrance = "settled"
- dead_frame / empty_moment -> enlarge the primary surface x1.3 (94%/80% caps)

Deliberately NOT patched: intent_mismatch, empty_skeleton, stray_ui
(judgment -- a data patch cannot make a scene mean something different),
and contrast INSIDE a component's own chrome (quotient-social's "Likes"
label at 2.59:1) -- no scene-data color exists there, so claiming a fix
would be a lie. Those stay reports.

FIRST LIVE RUN (proj_0a31e568, social-reel, 7.7 min): scene 5 came back
`attempts:2` with four repairs -- the loop works -- and the report was a
to-do list. `illegible` was 8 of 13 unresolved findings and had NO patch
(added, above; `measureTextContrast` now reports `backdropLuminance`).
Two real bugs: the loop asked `bg` for a border (a backdrop is SUPPOSED
to melt into the page) and grew a `sticker-prop` 36% -> 60% to fill a dead
frame while the subject stayed small. Backdrops and props are now excluded
from both patches. `COLOR_CAPABLE` is a verified list, not a guess --
grep `data.color` in src/components.

### Per-stage wall clock (#39 prerequisite)

`createStageTimer` in `pipeline.ts` times every stage off the single
onProgress callback (injectable clock, only closes on an actual CHANGE of
step) and attaches `stage_timings` to PipelineResult, which the generate
job returns verbatim. 20-minute generates were previously unauditable:
percentages, never durations.

### Open, needs a decision (not a patch)

`assembled-scene-gates` -> st-statement measures 13% content coverage
against the layout gate's 16% floor and takes a `dead_frame` badge. Fails
identically on master, and only surfaces where a real browser exists --
i.e. it is live on the droplet. The editorial grammar's deliberate
negative space and the gate's coverage floor genuinely disagree.


### Round 3: the loop's own two bugs (proj_de47d492)

The second live run fired repairs on 5 of 7 scenes -- and both new
behaviours were wrong.

1. **invisible_surface was a NO-OP.** It set `data.border`/`data.shadow`
   and logged "border + shadow requested". It fired on five scenes, the
   defect survived every time, and the reason is flat: **not one component
   in the library reads `data.border`** (grep it). A patch that writes data
   nothing consumes reports a repair that never happened -- strictly worse
   than the badge it replaced. The patch is DELETED; a ghosting panel's
   fill lives inside the component.
2. **A clipped run got shrunk four times in one pass.** One overflowing
   line reports as several clipped_text defects (the gate samples the
   truncation at different widths) and each patched the SAME component:
   32px -> 16.38px, 15% -> 60% tall, still clipped. Now ONE patch per
   component per pass, then re-measure. And text also reported
   `off_canvas_content` is skipped entirely -- it sat 51% past the LEFT
   edge, which no font size can fix.

THE RULE, recorded at the top of scene-repair.ts: never add a patch
without first verifying the component actually reads the field.
COLOR_CAPABLE exists for exactly this reason.

### The real remaining defect is the component library, not the scenes

Across both runs the surviving findings are overwhelmingly the Quotient
mock components' own chrome: quotient-chat's "Type a message..." at
2.59:1, its checklist rows at 1.32-1.40:1, quotient-campaign's tab labels
("Brief"/"Tasks"/"Deliverables") at 3.5:1, quotient-social's "Likes" at
2.59:1, and `div.qch`/`div.qch-composer` panels at 1.1-4.5% lightness
separation (needs 8%). No scene-data patch can reach any of it. This is
the next real piece of work.

### #39 answered by the first stage_timings

proj_de47d492, 515s total: storyboarding 225.3s (44%), scenes 140.7s
(27%), concept 62.5s, media 49.9s, editorial 36.3s (7%). The editorial
pass -- the thing #39 assumed was worth cutting -- is the SMALLEST LLM
stage. The storyboard builder is the target.

### Round 4: the accent word (proj_0b762363)

Verification 3 confirmed round 3 -- zero border no-ops, the shrink ran ONCE,
and the contrast patch fired for real on a live film:
`kinetic-text: color -> #101014 (backdrop luminance 0.996)`. It also showed
one more gap.

`Every *word*, written.` reports as TWO runs: the base "Every , written."
at 1.01:1 and the accent "word" at 2.53:1. Neither is a substring of the
authored line (the stars, and the accent span being its own text node), so
componentCarriesText matched neither -- and `*starred*` words take the brand
PRIMARY rather than `data.color`, which on a near-white page is its own
defect. Fixed: text matching falls back to word overlap (all needle words
present, at least one >= 4 chars) and strips the star markers, and a repaint
sets `accent_color` too. Legibility over mood is codegen non-negotiable #1.
Substring matching now requires >= 3 characters -- "on"/"to" appear inside
almost any line by coincidence, and repainting a headline off the back of
that would be a guess.

## #43 + #39: the two fixes the auto-fix arc pointed at (2026-08-02)

### Quotient mocks: legible chrome, real elevation, no phantom initials (#43)

The surviving gate findings on every assembled film were the mocks' own
chrome. Three mechanisms, fixed at the source (see the commit for the
numbers): the shared warm grays (#9c9a94/#a3a19a/#8b8983 at 2.3-3.5:1)
darkened to #6b6963/#63615c (4.8-6.0:1, hierarchy preserved); shells and
flagged panels bumped to 1.5px #dedcd6 borders + >= 0.12-alpha shadows (what
the ghost-panel gate credits as a visible edge -- .qsp had NO edge at all);
avatar initials moved into a span that hides when the photo loads (they were
being measured against the photo's pixels at 1:1) with the fallback ink
darkened to #3d5c94 because in a sandboxed render the photo never loads and
the fallback IS the frame. test/quotient-mock-legibility.test.ts boots the
real components on a light page and runs the real gates; the stills confirm
the mocks still read as the Quotient app.

### Storyboard batching (#39, first cut)

The bottleneck was a prompt fossil: "HARD CHUNKING RULE: at most ONE
add_scene call per response" -- 15+ sequential round-trips per film, each
re-reading the whole growing conversation. The rule predated the
truncation-recovery machinery that makes batching safe (discard the turn,
retry smaller, strikes). The prompt now targets 2-4 add_scene calls per
turn; the recovery path still forces one-scene turns after a truncation.
The loop mechanics needed no change (it always processed every tool call in
a response). Expected effect: storyboarding drops from ~15 turns to ~3-5.
Verify against stage_timings on the next live runs before claiming a number.

### Verification 4 (proj_65e702e3): #43 verified, #39 measured, one new class

Same brief, fourth run, on the build with the mock fixes + storyboard
batching.

**#43 verified.** The old defect class is GONE from a live film: zero
muted-chrome contrast findings ("Type a message", tab labels, "Likes"),
zero div.qch/div.qsp ghost panels, zero phantom initials. One straggler
found and fixed: composer's .cmpz-card needed the same shell recipe.

**#39 measured honestly.** storyboarding 188.9s vs 221.4/225.3 baseline --
~15% faster raw, ~25% per-scene (this board drew 8 scenes, baselines 7).
Real, not the hoped-for collapse; the model appears to batch only
partially. Next lever if more is needed: count turns via the trace, and
consider merging concept (72s, also sequential) into the storyboard call.

**New class exposed (task #44): the gates fight the camera.** The campaign
board was staged at x:0 width:100% -- fully on-canvas -- yet reported
"Tasks" 67% past the left edge and buttons entirely off the right. The
cursor-performer's mid-scene ZOOMS scale the stage; the gates probe at
45/70/90% of scene time -- mid-zoom -- and flag content the zoom
legitimately pushed off-frame. The auto-fix loop then burned its budget
shrinking kinetic-text that was never too big (twice per scene, four
scenes, defect survived every pass). Fix belongs in the gates
(camera-neutral probe times, or skip clipped/off-canvas checks when the
stage root carries a scale transform at probe time). Precedent:
cameraIsBackground already skips the empty-canvas gate on speaker scenes.

## #44: camera-aware gates -- a zoom is a shot, not a bug (2026-08-02)

Marc: "we will be zooming in the future or panning so this cant happen."

captureSingleFrame now measures the camera rig's transform AT THE PROBED
INSTANT (after the timeline seek): any .__mp_camera_rig / .__mp_camera_clip /
.mp-camera holding scale outside [0.95, 1.05] or |translate| > 14px marks the
frame cameraActive. Thresholds sit above the ambient Ken Burns (1.03 +
<=10px drift inside its 20px overscan), so only real camera_moves trip it.

On a cameraActive frame the gates skip GEOMETRY findings only -- clipped
text, off-canvas content, edge bleed, text collisions in measureLayout, and
the "clipped" reason in measureTextContrast. Scale-invariant checks still
run: contrast ratios, ghost-panel fill separation, dead-frame coverage.
Detection is live-DOM rather than camera_moves window math on purpose: it
needs no timing model, and it covers every zoom mechanism (camera_moves,
Studio zoom-inside rigs, future pans) identically.

Behavioral test (test/camera-aware-gates.test.ts): a held 1.6x zoom that
pushes half the layout off-frame produces zero geometry findings, while the
SAME content genuinely off-canvas without a camera still flags -- the
control that proves the skip informed the gate rather than neutering it.

### Verification 5 (proj_b8eb5c3b): the series' fastest and cleanest run

379.7s total (series: 463 / 515 / 443 / 485). storyboarding 168.1s (was
221-225 pre-batching, -25%), scenes 95.2s, editorial 21.5s. Unresolved
defects 12 (was 22 on run 4); the camera false-positive class -- titles and
buttons "off-frame" mid-zoom -- is fully gone.

What remains is the long tail, each noted with its cause:
- quotient-chat's placeholder stayed visible UNDER the typed message (100%
  text-on-text collision): the `filled` class rides a gsap .call() that does
  not fire on a deterministic seek. Fixed structurally in CSS:
  `.qch-input-text:not(:empty) ~ .qch-placeholder { display:none }`.
- sticker-prop pill text overflowing its fixed-size pill ("1 AGENT / 12
  POSTS / 5 CHANNELS", ~84px past, then measured white-on-white at 1.18:1
  outside the pill). The container-growth repair cannot fix a fixed-CSS
  pill font; the component needs wrap/auto-shrink. (#36 territory.)
- text_collision comparing kinetic-text's full CONTAINER box against a pill
  placed inside its empty corner -- glyph-level boxes would be the honest
  comparison. Refinement, not a blocker.
- Two inner-chip ghost panels (div.qch-cc live at 1.1% despite the 1.5px
  border locally passing; div.qcp-ev calendar chips) -- inner-chip styling,
  next component polish pass.
- Template/theme text contrast on 2 headlines (2.86-3.17:1) with no
  data.color channel -- template typography, #36.

## #36: hero-number scale + the long tail, closed (2026-08-02)

The last open backlog item, plus everything verification 5 traced to
component interiors:

- **Bar-quantize re-inflation (the original #36 bug)**: LENGTH_DISCIPLINE
  clamps run BEFORE quantizeScenesToBars, and toBars rounded to the NEAREST
  bar -- a 6s-capped social-reel scene on a 3.4s bar re-inflated to 6.8s.
  The quantizer now takes the grammar's sceneCap and snaps DOWN when
  rounding up would breach it: the cut stays on the grid AND the film keeps
  its promised length.
- **Hero-number scale**: number-counter-row's fixed 72px (6.7% of a 1080p
  frame) now yields to data: data.font_size directly, or data.hero (one
  stat ~26vh, rows share proportionally); data.color repaints. The
  data-story contract carries "HERO TYPE IS DATA, NOT HOPE" and the
  component joined COLOR_CAPABLE -- only after it actually read the field.
- **Chromium border rounding (the qch-cc mystery solved)**: Chromium
  computes a 1.5px border as 1px at DPR 1 (measured with a live probe) --
  under the gate's MIN_VISIBLE_BORDER floor AND visually a hairline. Every
  1.5px panel border from the #588 pass is now 2px, .qcp-ev calendar chips
  included. The mock-legibility test now SCRIPTS a content card into
  existence, closing the blind spot that let the empty-shell test pass
  while the live film flagged.
- **sticker-prop fits its own box**: long pill text shrinks to fit (floor
  11px, wrap as last resort) instead of spilling ~84px past the pill and
  reading white-on-white.
- **Transient entrance dimness**: a low-contrast finding measured ONLY
  mid-fade (opacity 0.5-0.85), for text that reaches full opacity and
  PASSES at another probe, is the entrance animation -- dropped in
  measureTextContrast's finalize. Persistently dim text keeps its finding.
  reasoning-stream's receded rows also land at 0.45/0.35 opacity now
  (below the gate's decorative threshold; 0.5 composited dark ink to a
  ~3.2:1 mid-gray on light washes).
- **Glyph-box collisions**: the collision probe unions each element's own
  text-node line rects instead of the container box -- a pill in a
  container's EMPTY corner no longer reads as a 100% collision. Type-on
  words not yet revealed (zero-size rects) are ignored.
- **quotient-chat placeholder** (already merged in #591) completed the set.

### Data-story verification (proj_b75ca862): the caps held; the flag needed a second spelling

33.0s total (cap 42), max scene EXACTLY 7s (cap 7) -- the quantize snap-down
worked on a live film, and the storyboard adopted "hero": true on every
counter. But it wrote the flag INSIDE the stat object, not at data root, so
the scale never applied ("1 AGENT" measured 1% coverage). The component now
accepts both spellings. Two more theme leaks fixed the same way as the
quotient mocks: number-counter-row's fixed slate label (#64748b, 3.43:1 on
every ground) now rides the value's ink at 0.72 presence, and email-compose
-- a HARDCODED-dark card -- was painting var(--mp-color-text) (dark ink on
light brands) on #1a1a22: 1.03:1 on every address line. A fixed-dark mock
pins its own light ink.

Remaining, known, template-side: st- template claim/tagline text has no
data.color channel, so a light-theme template over a dark mesh patch stays
a report (scene_001's claim at 1.09:1). Template typography theming is its
own arc.

## #45: ground-measured ink -- the theme flag loses to the actual page (2026-08-02)

The task was filed as "template typography theming", but the evidence
reshaped it. proj_b75ca862's 1.09:1 claim was NOT an st- template: it was
the ANNOTATION component, which carries no plate of its own -- theme:"dark"
only flips its ink light for use on dark grounds -- authored with
theme:"dark" AND color:"#17171c" on a LIGHT film. The component obeyed the
flag (near-white ink on a near-white mesh) and ignored the color field
entirely, which would have been perfect. (The tagline case that motivated
option (b) turned out to be the transient-fade class, already fixed in the
gate.)

The fix is (b) in spirit, without pixel reads: the scene page's background
IS the brand ground and it is measurable. atmosphere.js gains
mpGroundLum() (page luminance; null on transparent speaker pages),
mpParseColor(), mpInkContrast(). Annotation now derives dark/light from the
MEASURED ground (WCAG midpoint 0.18, matching the ink-repair loop); the
authored theme flag only decides when the page is transparent. An authored
data.color is honored when it clears 4.5:1 on the measured ground and
ignored when it cannot be read.

Behavioral proof (test/ground-ink.test.ts, real assembler + real gate): the
exact authored data from proj_b75ca862 now measures clean on a white page;
the mirrored case (dark ink authored on a dark film) measures clean too;
a passing authored ink is honored. The helpers are global -- any ink-only
component can adopt the same two lines.

## CI: the suite goes green and a robot finally watches it (2026-08-02)

"Is there any testing?" exposed the structural gap: 82 test files and no CI
-- each round ran only the suites neighboring its change, which is exactly
how three playbook assertions stayed broken through eight merges (#595).

Now: .github/workflows/ci.yml runs typecheck + build + the FULL vitest
suite (Chromium + ffmpeg installed) on every PR and on master. Three repairs
made the suite honestly green rather than green-by-exclusion:
- MP_WORKER_DIR: render.ts and capture.ts fork their workers from
  import.meta.url's directory, which under vitest is src/ (no .js). The env
  var points TS runners at dist/core; CI builds first and sets it. This
  un-broke render.test.ts and showcase.test.ts EVERYWHERE, not just CI.
- integration.test.ts is a main()-style script, never a vitest suite --
  excluded in vitest.config.ts (run it directly with tsx).
- The two genuinely-failing tests are marked it.fails WITH their stories
  (codegen-e2e's pure-custom __componentTimelines drift; the st-statement
  negative-space vs 16%-coverage-floor design decision). Green without
  hiding them: the day either behavior changes, .fails flips red and forces
  the call.

Full suite: 81/81 files. First fully-green run of the project.

### CI's first day: three catches before it was even merged

Run 1 (PR #596): three speaker suites used "/nonexistent" as a data dir to
mean "never touches disk" -- ensureSpeakerDerived mkdirs its assets dir, and
only the root sandbox could create /nonexistent. Fixed with real mkdtemp
scratch dirs.

Run 2: three MORE suites (live-narration-cuts, reference-images,
scene-cache) leaned on the /data/media-producer default -- also
root-only. Fixed systemically: vitest.config.ts mkdtemps a scratch dir and
sets MP_DATA_DIR for every run, killing the class.

Run 3: GREEN. The lesson, recorded: this sandbox runs as ROOT, so any test
that writes an absolute path silently passes here and fails on every normal
machine. CI is the only guard that sees it.

## The st-statement decision: declaration over exemption (2026-08-02)

DECIDED: deliberate negative space is a property the template DECLARES and
the gate honors. st-statement's root carries [data-mp-deliberate-space];
the layout probe reports it only from a VISIBLE, near-full-bleed declarer;
deadFrameDefect halves its floor (16% -> 8%) when set. st-statement's 13%
passes as the design it is, a genuinely blank frame (~0-2%: the statement
never rendered) still flags, and the gate stays sharp for every component
that doesn't earn the flag. The known-failing test flipped back to a real
assertion. Only type-on-empty templates may declare it.

### End-to-end run 1 on the final build (proj_a0bc86f4): 3/5 clean, finale perfect

Same data-story brief as proj_b75ca862. Unresolved defects 5 (was 15).
Scenes 1, 4 and 5 -- INCLUDING the money-number finale, "1 AGENT" at 26vh
with stat-level hero + authored 26vh font -- passed every gate. Caps held
again (33.0s / max 7s). Two blemishes, both fixed as self-defending
components:
- The hero "12" (26vh) overflowed a box sized for the old 72px row (8% digit
  clip, label 23px past the frame). number-counter-row now measures its
  built row against its own box and scales the type down proportionally.
- st-kinetic-list's "01 / 05" item numbers rode the raw brand PRIMARY --
  tuned for the light page -- over the template's own dark WebGL world
  (~2:1). Dark theme now lifts the primary toward light (color-mix 35%
  primary / 65% #f4f4f8): hue kept, legibility earned. Same token-leak
  class as email-compose.

## The certification sweep: the whole library goes clean (2026-08-02)

Films sample 4-6 components per generation from a library of ~140, so
chasing component chrome one film at a time was a slot machine.
test/component-certification.test.ts boots EVERY component with synthesized
schema data (test/helpers/sample-data.ts) on a light AND a dark ground and
measures it with the production gates. Gated behind MP_CERT_SWEEP=1 (heavy;
hundreds of browser boots), MP_CERT_ONLY=list for fast fix loops,
MP_CERT_REPORT for parallel runs.

First audit: 111 raw findings -> rig fixes (honest dual probes, sane sample
data) -> TRUE BASELINE: 127 findings across 54 components. Four parallel
agents fixed every one -- none claimed as rig artifacts:
- The dominant class: chrome riding PAGE tokens on surfaces the component
  painted itself (the email-compose token-leak doctrine, now library-wide).
- The "0:1 clipped at rest" mysteries were INPUT VALIDATION bugs: scale:42
  and split:42 blowing layouts to 4200% -- clamped in-component.
- ios26-home-screen's "1:1 storm": the fixed 480x1000 phone never fit its
  box; all chrome sat off-view. It now scale-fits its stage.
- A dozen composer/sidebar ghost panels took 2px borders / >=0.12-alpha
  hairlines in their own divider colors.
- stat-card's count-up printed raw tween floats mid-count; precision now
  derives from the target.
- Dark-world template kickers lift the brand primary toward light, resolved
  to rgb() at boot.

FINAL: full-library integration sweep = 0 findings.

CORE FOLLOW-UP (found independently by three agents): parseRgb in
text-contrast.ts cannot parse the `color(srgb r g b)` serialization Chromium
emits for computed color-mix() values -- it reads the 0-1 floats as 0-255
and scores the ink near-black. Components work around it by resolving mixes
to rgb() in JS. The gate should learn the color() syntax.

### The all-clean attempt on the certified library (proj_36750f52)

FIRST passed:true STAMP IN PROJECT HISTORY: scene_001 reported
passed:true, attempts:1, with two live repairs (ink repainted white against
a measured 0.063-luminance backdrop; the starred accent followed). Four of
six scenes fully clean; 4 unresolved findings total (series: 15 -> 5 -> 8 ->
4). The two failing scenes, honestly:
- scene_002 stacked FIVE panels (stat-card + chat + browser + email over a
  mesh); the chat's own certified text measured 3.2-3.5:1 against sampled
  backdrops that mix overlapping panel edges -- a scene COMPOSITION class
  (overlap sampling), not component chrome. browser-frame's viewport also
  ghosted at 0.0% (it paints the page color) -- fixed: inset bezel ring.
- scene_006's tagline measured 1.08:1 live (the signature of #f4f4f8 on
  white -- the light class seemingly never applied), but the EXACT scene
  data + code measures CLEAN in local repro. Unreproduced; left open rather
  than guessed at. Watch the next close scene.

## hype-cut: the seventh grammar (distilled from the Cowork x Quotient film)

The "Word for Word" film (proj_bf247f37) started as a tempo-cut and was
directed, note by note, into something tempo-cut forbids: seven one-bar
st-statement interstitials woven BETWEEN product beats (tempo-cut law:
"never a statement slide mid-film"), a premise-first type cold open, all
Cowork beats carrying one continuous session transcript, a typed follow-up
ask escalating the story into a second act, and a cursor click inside the
session driving the cut into the payoff app. That is editorial's
statement/evidence alternation at tempo-cut's bar-quantized pace -- a
distinct dialect, not a tuning: "the words hype what the product proves."
Registered as film_grammar "hype-cut" (director row + storyboard contract +
component-first creativity clamp + music-first default + generate-tool
enum). Reference cut: proj_bf247f37, 15 scenes / 49.7s.

Two of the film's lessons were NOT new-grammar material and landed as
defaults instead:
- tempo-cut gains CONTINUITY OF STATE (consecutive scenes on the same
  surface resume state via history/start_scrolled, never reset) -- the
  "looks like separate scenes, not one continuous video" complaint predates
  this film and was a contract gap, not a dialect difference.
- The text-as-voiceover strip now covers tempo-cut/hype-cut/editorial too
  (backlog #49): proj_bf247f37 shipped EIGHT baked voiceover tracks reading
  its scene LABELS out loud because the strip only covered
  social-reel/data-story.

## canvas-tour: specced, not built (the three-video analysis arc)

Marc had three reference films analyzed frame-by-frame (Lenny's Product Pass
launch, HeyGen's "Behind the Craft" letterpress film, the Remotion Agent
Skills "Shipper" film). Two local prototypes came out of it (print-palette
world; the Behind-the-Craft recreation with photographic paper texture,
font+mask pen-write cursive, and a one-canvas camera route) plus a design
review that repeatedly SHRANK the scope by mapping "new features" onto
existing concepts:

- The "camera rig" the tour needs already exists: typed CameraMove
  (core/types.ts) + __mp_camera_rig. The only change is policy (pipeline may
  emit moves; today Studio-only) plus a derivation function.
- "Dive into the built product" (Shipper film's best beat) is NOT a feature:
  it is docking + camera + timed actions we already have — a recipe plus a
  slot-card variant on quotient-chat (task #57).
- Station = fields on a scene (flat list preserved; the nested-scene draft
  was rejected as un-DRY); the "one continuous film" container is the
  EXISTING composite assembler gaining a spatial layout mode; the camera
  track is DERIVED from stations, never stored.

Full design: SPEC-canvas-tour.md (status DESIGN — open questions must be
resolved before code). Backlog: #54 paper/illustrated world bundle, #56
canvas-tour, #57 Shipper steals. Build order agreed with Marc: performed-type
components first, textured-world system second, grammar third.

## The creative axes: visual_system + audio_system on generate

Marc's consistency ruling closed the three-video arc: film_grammar was the
only creative field on generate while WorldSpec lived as invisible machinery
and motion/motif were prose or proposals -- "I would just love some
consistency here." The fix is the film-craft triad as the operator surface:
film_grammar (rhythm) + visual_system (look: world/motion/type/motif) +
audio_system (sound: music_mood/voice), every subfield omit-to-infer /
provide-to-pin, resolved by the creative director into the treatment as
typed data. Motif is pin-only and asset-validated (no sticker film without
stickers -- the build fails loudly pointing at generate_clip mode='cutout').
music_mood drives the existing Jamendo search at both selection sites;
'none' suppresses the bed. The axis map, current + anticipated enum values,
and the four anti-sprawl growth rules live in SPEC-creative-axes.md -- read
it before replicating the next video from X.

## canvas-tour + kinetic continuity (the eighth grammar, doctrine-only)

Shipped as prompts, not machinery: the storyboard contract now carries
KINETIC CONTINUITY for every grammar (boundaries CAUSED by the outgoing
scene, momentum matched across the cut, direction continuous, one element
carried over -- Jake Moran's "every transition is something the outgoing
scene causes"), and canvas-tour registers as the eighth film_grammar (one
unbroken shot across a single surface; beats are places; performed type;
one stitching element; 55-75% bare surface). Component-first like
editorial, quiet bed on, text-as-voiceover. The station/canvas spatial
machinery in SPEC-canvas-tour.md remains a re-review-gated contingency --
the doctrine version came first deliberately, and the "Ink Line" storyboard
(proj_81ceb251) had already invented a one-continuous-desk film from the
paper world alone, which is what argued for doctrine over machinery.

## The photographic tooth never once reached the paper

Two bugs, one silent failure, found only by reading a shipped film's stored
world instead of looking at it. `generate_clip mode='texture'` wrote the
distilled tile to `brand-kit/assets/images/` and returned its URL, but never
added it to `brandKit.assets` -- and `deriveWorld` resolves the tooth by
scanning that manifest, not the disk. So the world came back as
`surface {tone, intensity}` with no `texture` key, on a film explicitly
built to show the paper look. The motif resolver had the identical hole,
while its own error message told callers minted cutouts "land in the brand
kit". With registration fixed and the URL finally arriving, the tooth still
never stamped: `paper-ground` set `img.src` and tested `img.complete` in the
same tick, which is always false for an uncached image, and there was no
onload path at all.

The lesson worth keeping is the failure SHAPE, not the two fixes. Paper with
no photo on it still looks like paper. Every screenshot, every contrast gate,
every layout gate read as healthy for three merged PRs, because the
degradation was to a plausible-looking fallback rather than to something
broken. Wherever a component's premium path can quietly fall back to a
procedural one, the component now has to say which path it took:
`paper-ground` writes `data-mp-tooth` (absent = none requested, 0 =
requested but not painted, 1 = stamped) and `test/paper-tooth.test.ts`
asserts all three through a real browser. Apply the same rule to the next
asset-fed component before trusting a gate to catch it.

Related: CI had been red on master since the playbook grew to eight film
grammars and the two new axes (5900 chars against a 5000 ceiling). Cut back
to 4995 rather than raised -- the deletion that mattered was the "rule of
thumb" line restating all eight grammars a second time.

## cutout-physics stops being an adjective

SPEC-creative-axes rule 2 says every value on a creative axis has to be backed
by machinery. `visual_system.motion: cutout-physics` shipped without any: the
director was told to describe rigid flat pieces, the codegen was free to
ignore it, and nothing measured whether it had. An operator could pin the axis
and get a film indistinguishable from `punchy`.

It now has both halves. Positively, the assembler applies the contract to the
finished master timeline, LAST -- after every component timeline is wired and
the orphans are folded in -- so library components, templates and codegen
scenes are all covered without any of them opting in and none able to opt out:
`mpStepQuantize` puts element tweens on a 12fps grid while the camera stays
smooth (a stepped camera reads as dropped frames, not stop-motion), and
`mpInkBoil` wobbles inked edges by a fraction of a pixel while the backdrop
holds perfectly still. Jake Moran named those two as most of the print feel.

Both are scrub-safe by construction, which drove the implementation. The
renderer SEEKS rather than plays and GSAP suppresses callbacks on seek, so
neither could use onUpdate: stepping is an EASE (`base(floor(p*n)/n)` -- it
steps the input, so the ease shape survives and a settle still settles, just
visibly), and the boil is a sequence of zero-duration `set` tweens over a
pre-rolled seed sequence. The boil displaces at the FILTER level for the same
reason a transform-jitter version cannot exist: it would have to write x/y
that the element's own tween already owns.

Negatively, `checkBannedMoves` measures what each contract forbids and reports
it in `get(target:'motion')` -- overshoot for both calm and cutout-physics,
tilt for calm only (a sticker landing askew is the cutout look, not a defect),
soft bloom for cutout-physics. Morph is listed as unmeasured rather than
shipped as a check that silently never fires.

The film's value reaches the assembler as `Scene.motion_physics`, stamped per
scene by the pipeline exactly the way `entrance` is -- the assembler only ever
sees one scene, so a film-level fact has to ride on each one.

## The layout follows the face

Two live tall-frame runs (kitchen take, bed take) put graphics on Marc's
face because the band layout assumed a chest-up selfie: chin at 65%,
captions in the top 13-30%, accents beside a head that was presumed at the
middle. The bed take had the face at 61% with the head filling 41% of the
height; the kitchen take at 49%. One fixed set of bands cannot serve both.

The take now carries a measured `face` (`{cx, cy, size, confidence}` as
frame fractions). `detectFace` in `core/face-band.ts` samples six frames
through ffmpeg as raw gray 270x480 and runs the vendored pico.js cascade
(`src/vendor/pico`, MIT, nenadmarkus/picojs -- no native deps, ~1-2s per
take) and keeps the median box when at least half the frames agree.
Measured once at attach and written on the `Take`, so the layout never
re-opens the file.

`tallSpeakerBands(face, frameRatio)` in `scene-generator.ts` builds the
slots from that box: the lower band starts just under the chin (only if the
chin leaves room above the platform UI zone), the top band ends above the
hairline (only if there is 8% or more to fill), and the side slots hug the
head at eye level, each only if 18% of the width remains. The authored tall
branch places surfaces lower-band-first, then top-band rows, drops what
does not fit (logged), puts accents in the side slots, pills in whichever
band no surface uses. Without a face the old defaults stand, so a take with
no face found lays out exactly as before.

The pipeline hands `take_face` to the layout per scene through the draft,
next to the spine. Existing takes have no face until re-attached; the
default bands cover them.

## Lines edited by thumb; silences written into the script

Two asks from the second live run. Marc wanted to pass the board link
around and iterate the spoken lines from a phone, and a reader of the
script could not see where the pauses were.

Editing: the board card gets "Edit the lines" (a textarea, Save, Cancel)
against a new `PATCH /api/storyboard/{t}/{p}/scenes/{i}` that edits the
STORYBOARD record by index. The existing storyboard-scene route needs a
built scene id, and the board runs before anything is built. On a speaker
board the save re-points the need's recording instructions and resolves the
anchors again (measured spine if a take is attached, speaking pace
otherwise) so the film stays aligned with the new words until the next take.
A take now records the lines it was performed against (`Take.lines`, set in
`attachTake` from the storyboard); the card flags a take the lines have
moved past and offers Re-record. The route name is in the tenant guard.

Silences: the notation is one sentence per line (a breath, 0.3s) and a line
that says only `(pause)` (a beat, 1s). `core/script-lines.ts` is the one
parser; the prompter cues by line and shows the beat as "•••" for its
second; the asserted spine takes the gaps out of the usable span before the
words share the rest (over-paused short scenes shrink the gaps together
rather than starving the words); the board and booth keep the lines. The
markers are never words: `scriptWords` drops them, so anchors, record-all
cuts and the speaking-pace estimate never see "(pause)". The storyboard
builder's SPEAKER contract now asks for the notation and tells the LLM to
budget the scene for it. Old single-line scripts read exactly as before.

## Two accent-level fixes from the v4 film

Measured on proj_7c8380c5 after the face-aware layout landed.

"Mail" still clipped the right edge. Two causes, one in the pill and one
in the stage. The clamp read the pill's `offsetWidth`, which ignores the
depth `scale()` that grows a near pill about its centre by up to 30%; and
its left-edge push was a `Math.min` no-op. Deeper: the clamp measured
against the HOST, and a full-width component's host is not the frame --
the camera rig bleeds 20px past the canvas on every side, so a 0-100% box
starts at -20 and ends at 1100. The pill now works out where the frame is
in host units from its own bounding rect, keeps the visual box (measured x
depth) inside it, and uses its own drift amplitude as the margin. Under
CSS `zoom`, GSAP lands a translate of `amp` at amp x zoom host px
(measured: amp 11.1 at zoom 1.8 moved the pill 20 host px), so the margin
scales with the zoom. Verified over 30 frames across three seeds: every
pill inside 1080 at every phase of the drift.

"QUOTIENT" beside the head was 32px tall: the stamp fits itself to its
slot, and the right of that head left 18% of the width. A side slot now
needs 26% (below that the stamp shrinks past legibility); when only one
side has room, the second accent stacks under the first on that side
instead of squeezing into the narrow one.

## The lines are editable in the desktop Studio too; an inline (pause) reads

Marc expected to change the voiceover in Studio's storyboard. Before a
build the draft view showed the lines read-only, and the after-build
storyboard editor's save skipped the follow-through the board's edit does.
The draft view now carries a "Lines" textarea and Save on every card,
wired to the same by-index route as the phone board; the after-build save
(`/api/storyboard-scene`) runs the same `afterLinesEdit` (need re-pointed,
anchors re-resolved against the measured or asserted spine) and reports
`script_changed_since_take`. One helper, two routes, three surfaces.

The first board written under the notation put "(pause)" at the end of a
sentence twice instead of on its own line. `scriptLines` now splits a line
at an inline marker into its text and the beat, and both page prompters
do the same, so either spelling is the same second of held silence.

## The preview shows the scene's own take

Third end-to-end run (proj_37d090da, three per-scene takes): Marc saw the
first take play and the other two scenes show "some final second" of a
take. The film had not been rendered; that was the Studio scene preview.
Its camera underlay was always the FIRST clip, seeked to the scene's film
start (9.99s, 16.66s) modulo the file length -- the last frame of take
one, twice. The render was never wrong: it concatenates the clips.

`speakerClipForScene` picks the camera for a preview: with per-scene
takes, that scene's clip from its own trim; with one continuous track,
the first clip at the film start as before; a per-scene track with no
take for the scene shows no camera rather than the wrong one.

## A board with no furniture only takes over on the explicit opt-out

Same run: the payoff scene's browser-frame became a 10-second takeover
that covered Marc. The takeover recipe's heuristic ("a product surface
with no speaker furniture on the scene") was written for films whose
presenter scenes carry a lower-third; it needs furniture somewhere to
compare against. A take-flow speaker board carries none, so under it every
surface scene was a takeover. The heuristic now only fires when the film
has furniture on some scene; otherwise the board's explicit
`transparent_background: false` is the only way to cover the camera, which
is what the SPEAKER contract already told the storyboard writer.

## Phone reel graphics: one zoom for every component, no desktop furniture

Marc, on the third run: the animations are "just not very nice". What was
on screen: a notification stack as thin grey lines under his chin, a
progress bar as a tiny percentage rail on every scene, a browser window
too small to read. Two causes.

The phone scale reached four component types through their own
`data.scale`; every other type rendered at desktop pixels. The scale is now
a wrapper property (`SceneComponent.zoom`, CSS `zoom` on `.mp-component`):
percent geometry on an absolutely positioned box resolves against the
stage even under zoom, so the layout slot holds and only the content
grows. Every component on a tall speaker frame gets 1.8x, except the ones
that size themselves (font floors, the caption lane, the stage overlay).
The pill clamp derives its zoom from real px over layout units so it works
whichever element carries it.

Some components have no phone form at all. Before the layout, a
progress-bar on a speaker reel is dropped and a notification-stack becomes
floating pills of its app names (anchors and `at` carried). The SPEAKER
contract now tells the storyboard writer what a tall-frame graphic IS (a
performed word or number, one per beat, entering on its word) and what it
never is (a dashboard, a rail, a list, a browser, a grid), in principle
rather than by component name, as the grammar contract requires.

## The desktop Studio's camera follows the scene

Fourth run (proj_780a33d0): three per-scene takes, Build from the board,
refresh the desktop Studio -- the first take plays, then scenes 2 and 3
show nothing and shudder. Studio drove ONE speaker <video> from
`clips[0]` everywhere: the source, the trim, the film-time mapping
(`time + trimStart`) and the one-stream clock (`currentTime - trimStart`).
With per-scene takes that seeks take one past its end and the seek-storm
guards fight the wall clock.

Two speaker models have to hold (Marc): one continuous recording as the
spine of the whole film, and several takes strung together, one per
scene. `speakerClipForTime(time)` picks the clip under a film time -- the
first clip from film time 0 when no clip carries `scene_index`, the
scene's own clip (trim_start = the scene's film start) when they do, and
no camera for a scene with no take. The sync loop swaps the element's
source at the cut (a Record-all board is one file windowed per scene, so
it never reloads), and every film<->source mapping goes through
`speakerSourceTime` / `speakerFilmTime` of the ACTIVE clip, the clock
included. Speaker-video detection matches any clip, not just the first.

## Every Studio lane follows the scene

After #773 the camera played per scene, but the timeline still read the
FIRST clip for everything else: the transcript lane showed take one's
words only, the waveform was take one's, the scene stills for scenes 2 and
3 were blank (the still seeked take one to the scene's film start), the
speaker lane drew no pieces (its piece editor is the single-recording
model), and a storyboard "zoom" chip sat on a scene where the camera is
the picture. Marc, rightly: "what a mess".

`core/speaker-lane.ts` lays a per-scene track on the film clock:
`laneClips` (each take at its scene's film start with its window),
`laneWords` (each take's cached words, windowed and shifted -- the same
words the spine used), `lanePeaks` (each take's peaks cut to its window,
silence between). The transcript and waveform routes use them when the
track is per-scene; a continuous track keeps its path. The scene-still
route passes the scene's own clip and trim. Studio draws one piece per
take on the speaker lane (click to jump), and reads a per-scene
transcript as film time instead of shifting it by the first clip's trim.

Over-camera scenes lose their storyboard camera moves in the takeover
recipe: the stage camera rides the overlay only, so a zoom there moves the
graphics and not the person -- a chip that visibly does nothing.

## The speaker is the spine: the camera rides the rig, the lane wears the takes, cuts are swaps

Marc, on the fourth run's Studio: the zoom chip should ZOOM HIM, the takes
belong on the speaker row not the filmstrip, and every cut flashed blank.

The camera rides the rig. On a speaker scene with camera moves the camera
is a <video> INSIDE .mp-camera (`speakerRigVideoHtml`) instead of the fixed
underlay behind the page: the rig transforms it with the graphics, so a
zoom zooms the person. In the render the capture already swaps in-page
videos for stills per frame (data-start-at), so the moved camera is in the
frames; in the single-scene preview the video carries the drift-corrected
seek loop; in the Studio composite it is registered like any scene video
and synced per scene, and Studio hides its own camera element behind that
scene. Scenes without moves are untouched. The takeover recipe no longer
drops over-camera camera moves (#774's stopgap); it re-aims them: a move
the board anchored on a graphic loses its anchor and gets the face as its
focal point (the take's measured face; the upper middle before a take).

The lane wears the takes. `/api/take-poster/{t}/{p}/{takeId}` makes one
still per take at its trim (cached); the speaker-lane pieces tile it. The
timeline filmstrip of a speaker film asks the still route for `camera=0`:
the scene's graphics alone. The sidebar keeps the composite still.

Cuts are swaps. A second camera element is preloaded with the NEXT scene's
take, parked at its trim, four seconds ahead; at the cut the two swap roles
(display, mute, the clock's element) instead of one reloading its source.

## The storyboard card is the film's frame, and shows the person

Marc: a 9x16 board's cards looked like "a giant screen", and nothing on
a speaker board told the reader a person was expected in the frame.

The stills were always photographed at the canvas size; the SHEET cropped
every one to 16:9. The card now takes the film's aspect ratio, and a tall
film's card lays the frame beside its record (420px column) instead of
above it. On a speaker film every over-camera card carries a
head-and-shoulders outline in the chest-up framing the layout assumes,
labeled "SPEAKER ON CAMERA" down in the platform zone, under the scene's
graphics -- and once a take is attached, that take's still instead. The
card also lays the graphics out the way the build will (the speaker
bands, the measured face when there is one), so the board previews the
film's layout doctrine rather than a wide-frame guess of it.

`core/take-poster.ts` makes the take still (ffmpeg, at the trim, cached
beside the thumbnails); the speaker-lane route and the cards share it.

## Three writer habits, three rules (the fifth board)

The first board under the new cards showed three things the storyboard
writer does that the prompt alone does not stop, so each is now a rule.

Lines arrived with literal "\n" in them -- the writer double-escaped its
line breaks -- so the prompter would have read one long line with
backslashes in it. `unescapeLines` in the storyboard builder's scene
normalization turns them (and escaped quotes) back into characters, on
the scene's lines and each beat's.

Scene 3 cast quotient-chat, the third app mock in three boards. On a
phone speaker reel any app mock (`PHONE_REEL_MOCK_RE`: quotient-*,
claude-*, slack-*, chat-simulator, browser-frame, dashboards, editors,
post cards, st-* templates) is dropped before the layout, with a log; the
composer is the one mock with a phone form and stays.

Scene 2's beats said "camera slowly pushes in on Marc's face" and
camera_moves was empty. In the takeover recipe, an over-camera scene with
no moves whose beat prose describes a push-in gets one: a slow 1.2x zoom
from that beat's start, held to the cut, aimed at the face by the re-aim
that follows.

## The surgical revise holds the same shape as the whole board

Re-authoring one scene of proj_4488f790 through the surgical path returned
a sticker-prop carrying an invented "script" array and lines with literal
"\n" -- the two things the whole-board builder's normalization catches,
which the surgical path skipped entirely, and the writer had never seen
the component library's data fields (its prompt named types only).

`normalizeSceneShape` is now one exported function (unescape the lines,
normalize component entries, sanitize camera moves, drop unknown types)
used by both writers. The surgical prompt carries the library, with the
rule that a component's data has only its type's fields, and the server
builds the catalog for it.

## Studio's draft view is the film's frame; the placeholder is a picture

Marc, on the first tall board in Studio: the still sat in a landscape box
("everything is landscape") and none of the graphics showed. The still was
photographed tall; the draft view's CSS cropped it to 16:9 through its
middle -- where a speaker film's graphics never sit (above the hairline,
below the chin). And the placeholder was "brown and crappy": a schematic,
not a picture.

The draft view now sets `--mp-frame` from the project's canvas: the still
and the rail thumbnails take the film's aspect ratio, and on a tall film
the card lays the still beside its record in a 300px column (sticky), the
thumbnails at half width. The placeholder is a camera-off avatar: a dim
room with radial falloff, a soft filled bust with a faint rim, the label
quiet in the platform zone. Light type on plates reads on it the way it
will on a real take.

## A continuous speaker track keeps no scene markers

Transcribing two reference films on a scratch project (one clip, no
scenes) returned nothing: the migration from #760 stamped `scene_index` on
EVERY clip that lacked one ("one per scene in order"), so a single
continuous recording read as scene 0's take. With no built scenes the
per-scene lane was empty, so the transcript and waveform routes served
nothing; with built scenes every scene after the first would have lost
its camera. That was the second speaker model Marc named -- one recording
as the spine of the whole film -- silently broken by the first.

A clip is per-scene only when a recorded take says so (its source matches
a take). Every other clip stays unstamped and plays from film time 0. And
a per-scene track with nothing to lay its markers on is not a lane; the
routes fall back to the continuous path.

## B-roll rides the idea-beat lane (creator-cut stock_footage needs are fetched by the build)

Measured on the founder-story reference (a 45s LinkedIn creator-cut): two of its
seven beats are stock-style office b-roll. Our creator-cut writer can ask for a
`stock_footage` need, but the build never fetched it -- only codegen scenes
with a `broll_query` reached Pexels, landscape only -- so the need sat on the
human's list. Now the same block that draws illustrations fetches stock needs
(Pexels, portrait on a tall frame, gated by `PEXELS_API_KEY`), marks them
provided and cuts them in on their words. What the build cannot find stays a
need for the human. Files: `pipeline.ts` (idea-beat block), `media/stock-footage.ts`
(`orientation` option), `test/creator-cut.test.ts`.

## The world beat (creator-cut contract line for stock b-roll)

Three boards in a row from the founder-story brief never asked for stock
footage, even when the brief named it beat by beat: the creator-cut contract
told the writer about the drawn object (illustration) and nothing about found
footage. Added THE WORLD BEAT beside THE IDEA BEAT in `storyboard-builder.ts`:
a line about people or a place with no product surface asks for a
`stock_footage` need that the build fetches and cuts in on the words, captions
still running, no sticker. Test in `test/creator-cut.test.ts`.

## Founder-story build: b-roll is a need on a person film; the filled board copies back

Measured on proj_120bdb3d (the founder-story creator-cut). Two faults: (1) the
writer put a `broll_query` on the two b-roll beats, which routes a scene to
freeform codegen (the authored recipe refuses drafts with one) -- the caption
lane vanished and the stock need was ignored. On person-carried grammars the
pipeline now folds `broll_query` into a `stock_footage` need and clears it.
(2) Build-from-board copied scenes, audio and assets back to the original
project but not the storyboard, so every need the build had filled (fetched
clip, drawn illustration) still read "needed" in Studio. `server.ts` now copies
the filled storyboard back, retargeted.

## The whole-board prompter is a whole-board take

Measured live on proj_120bdb3d: Marc opened the `take` tool's direct link
(no scene in it), the prompter ran all seven scenes, and the server pinned the
whole 49s recording to scene 1. The page only asked for the per-scene cut when
the link said `?scene=all` (Studio's "Record all" button); the tool's own link
never did. Not a regression of the split -- the direct link had always been
this way; Studio's button was the path that worked. Now the page treats a
whole-board prompter as a whole-board take, and the tool's link says
`scene=all`. Files: `take-page.ts`, `server.ts`, `test/take-page.test.ts`.

## The split: screen top, person bottom, on tall frames

From the founder-story reference (the laptop beat: product floating over the
over-the-shoulder shot) and Marc's second example (talking head under a
screencast). Neither existed: a creator-cut proof was a full-frame cutaway or
nothing, and a speaker screencast on 9x16 was the desktop picture with a corner
bubble. Added `use: "split"` as the third placement on a proof need (types,
normalizer, cast), the layout slot in the tall-frame recipe, the speaker
screencast template's tall-canvas branch (recording in the top band, no PiP,
scene transparent so the person shows), and the writer's contract line THE
SPLIT. `splitScreenHeight(face)` is the one rule both callers use. Tests in
`speaker-tall-layout.test.ts` and `creator-cut.test.ts`. Not touched: the
narrated-screencast assembler (`screencast_source` films) still places a
corner PiP on every canvas -- the next caller of the same rule.

## The board stays editable after the build

Measured live on proj_120bdb3d: a data-only scene edit (mark the beat-3 mocks
as the split) was refused because the film was "rendered". The storyboard
tool and the feedback redraft only accepted storyboard/draft projects, yet a
built film is rebuilt from its board with generate mode='full' -- so editing
the board after a build is the normal loop. `EDITABLE_BOARD_STATES` in
`server.ts` now admits generated and rendered; only a build or render in
flight, or a failed project, is locked. The tool text no longer says DRAFT.

## The split, second pass: the slice under the screen, the band's entrance, the band's framing

Measured on the first split render of proj_120bdb3d: the 34% band clipped
Marc's head (a selfie take has the face mid-frame), and the campaign mock
sat as three rows at the top of the band with the rest white. Three rules:

- THE SLICE: never shrink the take (a 9:16 take in a shorter box
  pillarboxes). The rig SLIDES the scene so the hairline sits just under the
  screen's edge (`splitSlide(face)`: +7% down for Marc's take, no zoom); a
  face that would have to move up zooms in just enough to cover the bottom.
  New camera move `slide` (dy%, scale, no cover clamp) in the rig runtime;
  the split band is pinned to the frame (`data-mp-fixed`, hoisted out of the
  rig) so the rig moves the person and not the screen.
- THE ENTRANCE: the band slides down from above the frame on the same
  half second as the rig's slide, landing on its framing; on exit it lifts
  out while the rig brings the person back up. The cut stays a "cut" on the
  board; the assembler plays a split's cut as the slide.
- THE FRAMING: a short wrapper (under 60% of the frame) fills its height
  with the anchor region, cropped from the left, capped at 3.2x.

## Team access to a tenant (SPEC-team.md)

Marc: "only I can see my projects" -- correct, a tenant was one email. Now a
tenant has members: an invite, a membership, or the company domain decides
where a login lands; consumer domains stay per-email; the founder's existing
tenant becomes the company's so nothing moves. `/api/team`, the `/team`
page from both Studios, and the `team` MCP tool list, invite and remove.
Everyone in a tenant sees everything; the tenant switcher is not built.
Follow-up: founding adopts the domain's OLDEST existing tenant, whoever's it
is -- a colleague signing in before the owner used to found a fresh empty
tenant that the owner then joined, their projects out of view.

## Studio, the take page and the team page look like Quotient

Marc: make Studio and the take page look like the Quotient app, with its
polish. The app's design system was extracted from its UI layer (tokens,
type, component recipes, layout numbers) into `src/quotient-theme.ts`: a
blue-violet tinted neutral scale, near-black as the accent, borders almost
invisible with shadows doing the separating, 12px radius on controls and
8px on small things, Inter at 14px medium for anything clickable, gray focus
rings, 150ms motion with a 1px press dip, dark mode by system preference.
Every page this server serves to a person includes it. The desktop Studio's
palette was mapped onto the tokens (its indigo became Quotient's blue for
selection and information; buttons became near-black), its chrome rewritten
as the app's: transparent top bar and sidebar on the canvas gradient, the
main area a white core panel rounded on its left corners, scene rows as nav
items. The phone Studio, take page and team page were restyled outright; the
take page's camera stage stays black. Measured on screenshots of all four
against a seeded project.
Second pass, after Marc refreshed and saw only the buttons change: the shell
itself. Scene rows are nav items (13px/500 label without the redundant
"Scene N -" prefix, 12px muted meta, status as a Quotient pill reading "1
unresolved"), the inspector is a white panel with the app's 56px compact
header and popup-style rows, the storyboard modal is the app's dialog (white,
12px, 20% overlay) instead of a dark card, the needs block is a card with
28px outline buttons, the timeline sits in a 10px bordered container, and
the draft view is a Quotient page (32px padding, 20px/500 title, cards with
shadow-sub, chips as pills). Checked on a seeded board and a built project.

## The sheet-row test: three things the system dropped (SPEC-briefs.md)

Row 1 of the marketing sheet produced a board, then a single "add the end
line and tighten" redraft rewrote the hook, dropped the burst of task cards
the storyline was built on, and left an empty gradient scene -- the redraft
was handed only the feedback and the previous narrative (and `params.prompt`
was undefined, so the project's prompt became "undefined\n## Revision
Feedback…"). Three fixes: (1) a redraft carries the original brief, what it
LOCKS (`brief-locks.ts`), and the whole previous board; the brief is
persisted once as `project.brief`; a board missing a locked line warns.
(2) A `stock_footage` need is fetched on any grammar; on a film nobody
carries it becomes the scene's ground via the media-backdrop channel. The
writer's assets schema and launch-film guidance say so. (3) A framed desktop
mock (data-mp-frame) crops its own edges on purpose; the off-canvas gate no
longer reports its toolbar buttons as content below the fold.

## The mock is the placeholder: screen recordings are a need on every grammar

Marc, on the sheet-row test: storyboard-first opens a needs concept we had
for images, b-roll and the speaker but not for screen recordings. A scene on
any grammar that stages a product mock as its payoff now also lists a
`screen_recording` need (writer contract, assets schema); the mock performs
until the team's recording is uploaded, then `castProvidedScreens` gives the
recording the mock's exact slot, layer and timing (full-bleed when the scene
has no mock). Person films keep cutting provided screens in on their words.

## The screen slate: an open screen need is never shipped as a mock

Marc, on scenes 4 and 5 of the sheet-row film: the Quotient mock standing in
for a screen recording is not honest -- it is the real components and looks
finished; he wants the speaker treatment, a placeholder that plainly says
"this is replaced by the actual video". The mock-as-placeholder rule (#815)
is superseded: `castScreenSlates` (`core/asset-needs.ts`) casts the
library's `asset-placeholder` in the mock's slot (same position, layer and
cut window; the mock leaves) for every open `screen_recording` /
`screenshot` need, full-bleed on the need's times when there is no mock
(word anchors pass through on person films and resolve against the spine
in the pipeline). `asset-placeholder` is now a proof surface, so it is
plated, cut in, framed and split like the screen it waits for, and
`castProvidedScreens` gives the uploaded recording the slate's slot first.
Idempotent on rebuild; a slate whose need was filled is cleared. The
component itself was redrawn as a deliberate slate (dashed frame, REC dot
for recordings, the description, "Upload the real one in Studio"). The
writer still casts the mock on the board -- it is how the build knows where
the screen goes -- and the contract says so.

## The sources: find, draw, record, upload -- each need collected in the board

Marc: needs are collected each its own way (the take page for a speaker,
the Recorder for a screencast, a b-roll library, image generation, music),
so the board should offer each need its ways, and the built film should
open the same card. This pass does the board. `NEED_SOURCES`
(`core/need-sources.ts`) is the table; the desktop and phone need cards
render it (Record / Recorder / Find b-roll / Draw it / Upload), with find
and draw as inline panels under the row (the card also lives inside the
storyboard dialog, so no second modal). Two routes: `stock-search`
(Pexels candidates -- `searchStockFootage`, split out of the build's
fetch; `downloadStockFootage` takes the pick by id) and `need-source`
(find or draw into the project's assets, then `provideAsset`, the same
write an upload makes). The build's idea-beat prompt moved to
`drawPrompt` so a redraw from Studio matches. The Recorder lists the
chosen project's open screen needs under For; a recording made for one is
uploaded into that project and posted to `provide-asset` (no events, no
assembly) and the popup links to Studio. Left for the next passes: music
as a need; click-the-slot in a built scene opening the same card.

## Music is a need: the bed chosen in the board, kept and cut against by the build

The sources pass left music to the build. Now `project.music`
(`MusicChoice`: auto | none | brand-kit | stock | jamendo | upload) is
written from Studio's Music card (desktop header button -> dialog; phone
needs area): `listMusicOptions` (`audio/music.ts`) offers the tenant's
tracks, the library mood-first and Jamendo hits (`searchJamendoTracks`,
split out of the pick); `resolveMusicChoice` turns the choice into the
track (a Jamendo pick downloads into the project's assets). The pick
route writes the `music_bed` track too, so the player carries it at once
and the existing keep-the-prior-bed rule holds it through a rebuild; the
inner pipeline resolves the choice and hands it to the prep as
`chosenMusic`, which skips its own pick and reads the beat grid from that
file, so a tempo-cut is cut against the bed it ships with. `none` sets
`backgroundMusic` off and strips the bed after a build-from-board.
Library previews stream from `/assets/_system/stock-music/` (audio
extensions only).

## The slot is the need: click it in the built film to open the same card

The last of Marc's sources arc: in a built scene, the thing you click is
often a need's slot. `needForSelection` (desktop Studio) maps the
selected component to the storyboard scene's need -- the slate by its
`data.need`, a provided image/video by `data.src`, a product mock to the
scene's screen need, the scene itself (or a full-bleed ground) to the
take, else the b-roll -- and the revise popover and the context menu
offer "Provide / Replace the <kind>...", which opens the scene's
storyboard dialog scrolled to that need's row with a brief highlight.
Nothing new to persist: the row is the one the board has, the write is
`provideAsset`, and a rebuild casts the new file into the slot.

## The pick applies now: a provided need takes its slot in the built scene

Marc: "you select the new video and hit save storyboard and nothing
changes -- does that make sense?" It did not. Providing a need on a built
film wrote the board and waited for a rebuild; music, by contrast,
played at once. `recastProvidedNeed` (`core/asset-needs.ts`, pure) now
patches the built scene from both provide routes: a swap replaces the
old file wherever it was cast (the b-roll ground, a still, a cut-in, a
provided screen); a first provision takes the slate's or mock's slot
(`castProvidedScreens`), lays the b-roll ground on a film nobody carries
(the generator's own `bg` shape), or cuts in on the need's seconds on a
person film. The composite is assembled from the record on every
request, so Studio shows it on reload; Studio's messages say "in the
scene now" and the dialog closes. A board with no built scene keeps
today's path: the build casts it.

## The dashed block is an open slot: needs still waiting are on the timeline

Marc: after the build there was no place to click for the screen
recording the board asked for -- only the slate image, which is a
component, not media. Rule: every lane block is a slot; dashed = open,
solid = the file is in it; both open the picker. `openNeedsOf` lists the
built film's needs still waiting; the media lane draws a dashed block
per screen / b-roll / drawing in its window on a row under the footage,
the speaker lane a dashed piece per take at its scene, and `laneLayout`
keeps those lanes up for open slots alone. The slate on the canvas and
the block on the lane are two faces of one need. Earlier today: the
popover carries one Replace button that opens THE PICKER in the dialog
(the grid needs room), a pick lands in the built scene at once
(`recastProvidedNeed`), and the sources live under every slot.

## The armed need: Studio points the Recorder at the slot

The Recorder handoff Marc described: click Record with the Recorder,
open the extension, record, stop, and the file replaces the empty spot.
Studio's Recorder source now arms the need (`arm-need`; one record per
tenant, two hours); the popup reads `armed-need` on open and sets Save
to and For to it, with a banner and a "Not this one" that disarms; the
recording that lands through `provide-asset` clears the record and
live-sync reloads the film. Only screen recordings and screenshots can
be armed. Extension zip rebuilt.

## The camera picker: record here, or on your phone

A take's slot now offers the same one-door flow as a screen: Record here
embeds the take page in the picker (`embed=1`: no back-links, and an
`mp-take-attached` postMessage closes the picker and reloads the film),
On your phone shows the take link as a QR drawn on this server
(`core/qr.ts`, byte mode, ECC L, versions 1-20, verified against a
reference decoder; the link carries the tenant token so it is never sent
out to be drawn), and Upload. The header's Record link on the board card
became the same two buttons.

## The board carries its stand-ins: the screen slate is cast when the board is written

Marc, on the 16:9 creator-cut board: scene 5 asks for a speaker and a
screencast but the card and the components show only the speaker. It
was not a blip: on a person film the proof was a need only, cast at
build; on a film nobody carries the writer cast a mock. Now
`castBoardStandIns` runs at every board save (the storyboard-only save
in the pipeline, the surgical revise, the direct board edit) and casts
the screen slate for every open screen need on any grammar; on a person
film `spineForScene` + `retimeSceneWith` turn the need's word anchors
into seconds at speaking pace (the anchors stay on the component for the
take's measured spine), with the creator-cut default window when the
script does not carry the word. `settledMoment` photographs a cut-in
inside its window, so the card shows the slate.

## The recipe: the third axis, a measured cut the writer fills

Marc: the reference films are tight because of their editing, and
generate asks the writer to invent that rhythm from prose every time.
`SPEC-recipes.md`. A recipe (`src/recipes/*.recipe.json`) is the
measured cut of one film with the content removed: identity and suits,
a spine of beats with [min, target, max] seconds and word budgets at
the recipe's pace, repeats, what enters on each beat and how the cutaway
lands; rhythm numbers; the layers' behavior; asks and latitude; and the
motion vocabulary in the assembler's own effect names. `core/recipes.ts`
loads and validates the library, feeds the director a menu (a pinned
recipe implies its grammar), hands the writer the mandatory block and
the scene budget, checks the finished board (warnings beside the brief
locks), and applies the motion to stamps, pills, lower-thirds and
keywords without overriding the writer; a fixed camera marks the scene
so the generator invents no punch-in. `generate` takes `recipe`. Five
recipes measured today from the films Marc sent: the Clay presenter
(presenter-n-things), bigpictureclub's split tour, Lieberman's founder
story with b-roll, Jesani's kinetic claims, Rodin's one-take cards.

## After Marc's first full run of the recipe board: three fixes and a check

Marc recorded the take on his phone and the three screens with the
Recorder on proj_179c8dfa (presenter-n-things, 16:9) and built it.
(1) A 9:16 take on a 16:9 film came through as a zoomed face: the
sanitizer only cropped takes wider than the canvas and left taller ones
to <video>'s object-fit: cover. `reframePad` now pillarboxes a tall take
(scaled to the canvas height, padded on a dark field) and records
`reframed.mode: "pillarbox"`. (2) The Recorder's recording reached the
built scene but the card kept the slate: the provide routes now recast
the BOARD scene too, and the card inlines provided media (a frame one
second into a clip via `ensureMediaPoster`, a still as a data URL) since
the card page is file:// and /assets never loads there. (3) The writer
authored a zoom on a fixed-camera recipe beat: `applyRecipeMotion` now
clears the writer's moves on a fixed beat. The check itself: the recipe
was committed, the board matched its spine, every stamp and lower-third
carried its motion; the take's measured spine stretched two beats past
the recipe's max (the take is the clock, by design).

## The fit is on the footage popover

Marc: "is fit something we can expose on the video component?" It was
already in the component's data (`object_fit`); what was missing was a
switch and an address. The footage popover now carries Fill / Whole,
written through the component PATCH route; a screen cast by the build
gets an id (`screen_<n>`), and a component cast without one (the films
before this) is addressed as `idx:<n>`. Provided screens default to
Whole (#836); providing the same screen again refits an older one.


## Two more recipes: the story ad with no person, and the location hop

Marc sent two films to add to the library. The Gamma story ad (16s, 9x16,
no person, no voice) and the Air ad (50s, 9x16, a founder with a handheld
mic in a new place on every cut).

- **story-ad-idea-beats** is the first recipe on hype-cut, and the first
  with no take: the on-screen line IS the voice (`layers.voice: "type"`,
  `asks.take: "none"`), typed on word by word, one illustrated object per
  beat sliding up under it. Feeling, pain over the object, wordmark
  reveal, product output fanning in, a wordless drift, payoff, end card
  with a pill button. Cut every 2.3s, nothing past 5s. Measured cuts at
  2.0, 4.5, 6.5, 8.5, 10.0, 12.0.
- **presenter-location-hop** is creator-cut. What makes it: the person is
  the constant and the place changes on every cut (so the take is one
  clip per beat, not continuous); each spoken word lands where it is said,
  staggered around the person, and stays until the cut ("scatter"
  captions, no plate); who-it-is-for over animal gag clips, a second
  each; kept outtakes as one-second breathers between sections; screens
  full-frame on the product's name with the words continuing at the
  bottom; a wide shot with URL and wordmark to close. Cut every 2.5s,
  the longest hold 5.5s, 180 wpm.

Nothing in the build changed; the loader validates both, the director's
menu grows by two, the test pins their bands (6-9 and 9-17 scenes) and
their word budgets. The scatter caption style and the per-scene take are
described to the writer in the block; making the assembler lay words
where they are said is the next step if the board asks for it.

## The scatter lane: the recipe's caption style reaches the build

The Air recipe says `captions.style: "scatter"` and, until now, only the
writer read it: the build cast the same plated chest-band lane for every
creator-cut film. Marc: go.

- `captionLane(spine, emphasis, { style })` -- the pipeline passes the
  recipe's `layers.captions.style`. "scatter" groups three words at most
  per phrase (`captionPhrases` takes `maxWords`) and casts the lane with
  `mode: "scatter"`, a shadow instead of a plate, left-aligned, 72px.
- `reel-caption-lane` learned the mode: each phrase gets its own spot
  (eight spots, left and right columns stepping down the frame from 5%
  to 64%), pops in word by word and STAYS; the ninth phrase clears the
  board. The phrase before the running one is marked `--rcl-old`.
- The lane owns the whole frame (scene generator: full-frame slot, no
  `cut_top`); over a cutaway the choreography sets `--mp-cut: 1` on the
  wrapper for the window (`isScatterLane`, scene-assembler) and the
  lane's CSS collapses every spot to the bottom band with only the
  running phrase visible -- the reference keeps the words at the foot of
  a full-frame screen.
- Verified in Chromium over an Air frame with a 2.6-5.2s cut window: the
  words accumulate around the person, the window shows one phrase low,
  everything returns when the person does. The plated lane is untouched.

## The recipe's cut is the edit: no bar grid, no b-roll of the person

Two things the first two Air-recipe boards (proj_421b06e9, proj_f20bd5da)
showed, both fixed in code, not by hand:

- Every person beat carried a `stock_footage` ask describing the person in
  the place ("handheld shot of a man walking ... talking to camera"): the
  writer sourcing "new place" as found footage. `pruneNeedsByRecipe` drops
  a b-roll ask from a beat whose shot is `person` with no cutaway; the gag
  clips on `broll` beats and every other need stay.
- The music's bar grid re-snapped the recipe's cut: one-second audience
  gags came out at 2.08s on a 115 BPM bed. With a recipe pinned the
  storyboard pass does not quantize; the recipe is the measured cut and
  the bed ducks under the voice.
- `checkBoardAgainstRecipe` now holds a scene named for its beat to that
  beat's own range, so the over-long beats are reported by name.

What is NOT fixed by code: the writer over-writes the beats (14 words on a
3.5s promise, 19 on the big picture), so the board runs 59s against a
42-55s recipe. The take is the clock in creator-cut, so the recording
decides; the block's word budgets are the lever, and a trim pass is the
next step if the boards keep running long.

Third board (proj_8147620f), two more, same fix in code: a feature beat's
"location" b-roll ask is dropped too (a beat carries b-roll only when the
recipe says its footage is found: a broll shot or a stock_footage
cutaway); a person beat keeps the person (`holdShotToRecipe` drops the
scene template the writer reached for -- st-photo-close on the big
picture, st-logo-close on the CTA -- since a card would cover the take);
and the writer is no longer handed the music's bar grid when a recipe is
pinned, so the beats are authored in the recipe's seconds.

## The still follows the data: the page learns when the cards were re-shot

Marc recorded a screen with the Recorder; the need flipped to provided,
the board scene was recast (the slate replaced by the recording, cut in
on its words), the card was re-photographed with the recording -- and
Studio kept showing the slate. The cards are shot a few seconds AFTER the
save, and the page's stills are keyed on `updated_at`, which moved at the
save: Studio refreshed, fetched the old still, and never looked again.

- `GET /api/project-version` now carries `cards_shot_at` (the contact
  sheet's mtime). Studio's live sync swaps every draft still's cache key
  in place when it moves -- no re-render, an edit in progress is left
  alone.
- A landed take re-shoots the cards (it never did; a provided screen
  did), and a built board re-shoots too: the board's stills are shown
  wherever the board is, and a need provided after the build must show.

## Record all: two scenes that open with the same words

Marc's film replayed a segment around 30s. Scenes 9 and 10 both open
with "Quotient builds"; `splitByScripts` searched for scene 10's opening
words from the index where scene 9's had just matched, found the same
two words at the same moment, and cut there: scene 9 got a zero-length
window (take_8, 29.32-29.32s) and scene 10 got both lines. The composite
then played scene 9 over an empty clip.

Fix: the next scene's words are searched only after at least half the
previous scene's words have been said, and a window shorter than a
breath counts as not found (proportional fallback). Marc's take was
re-split on the deployed fix.

## Contiguous take windows play through the cut

After the re-split Marc heard a tiny hiccup at 17.9s, the cut between
scenes 5 and 6. "Record all" cuts one file into windows that meet end to
start, so at the cut the preview's camera element is already where the
next window begins; the composite still seeked it there, and seeking a
playing video to its own position stalls it for a few frames -- a small
repeat at every cut. The preview now seeks only when the jump is real
(more than 0.12s: a de-aired gap, a scrub). The render was never affected
(the speaker base is concatenated by ffmpeg).

## The eighth recipe: ask, work, result (the Runway-in-ChatGPT ad)

Marc sent Runway's ad (28.5s, 1x1, no person, no voice of its own) and
said go. `ask-work-result` under canvas-tour: a second of the payoff with
the title, the ask typed in full into the product's chat surface, the
agent's checklist ticking through its tool calls and then the elapsed
time (the honesty beat), the deliverable full frame for nearly half the
film with two claim lines landing one at a time, one CTA line over its
last shot, the wordmark on black. Four lines of type in the whole film;
the lines fade rather than type on. It asks the human for one thing: the
deliverable (a recording or screenshot of the real output, or a generated
clip); the surface is a scripted library mock. Measured cuts at 1.57,
5.93, 10.77, 14.13 and, inside the deliverable, 17.0, 19.0, 22.0, 23.97,
26.67.

## The recipe says how each beat is made; the ninth recipe (Grade)

Marc: "I would like as part of the recipe when it should be motion
graphics vs a screencast." The format only implied it (a cutaway's kind).
Now every beat carries `made`: take | recording | motion | broll |
illustration | type, inferred from the shot when absent (`madeOf`), told
to the writer in the block ("MADE AS: MOTION GRAPHICS -- ... ask the human
for NOTHING on this beat" / "a REAL screen recording the human provides
-- list a screen_recording need ..."), and held by the build
(`holdMadeToRecipe`, in the recipe pass): a motion beat's screen needs
and slates are dropped, a recording beat that forgot to ask gets a
screen_recording need from its purpose. A recording that already landed
is never dropped. All eight recipes now say it beat by beat.

The ninth recipe, `founder-bookends-chapters`, measured from Voicepanel's
Grade film (88.5s, 16x9, five outer cuts): a founder on a couch with a
lower-third and a card beside the head per thing named, all badged on
the turn; the wordmark drawing on white; the promise and "let me show
you how"; two or three chapters of MOTION GRAPHICS on white, each named
by a kicker bottom-left with step dots bottom-right, one surface
building while the voice continues (a change every 4-5s, nothing past
6); back to the founder with a band of customer logos on the proof
line; wordmark and URL. No captions. The chapters ask the human for
nothing. Two small components the recipe names and the library lacks
(a kicker with step dots; a logo band behind the person) degrade to a
stamp and a logo wall until built.

## Two components the Grade recipe names: chapter-kicker, logo-band

Marc: build the two missing components, go. Both are full-frame overlays
that place themselves (a new SELF_PLACING list in the scene generator, z
42 on every layout), and both take the recipe's motion table
(`applyRecipeMotion`: kicker, logo_band).

- `chapter-kicker` {text, step, steps, at, ink, side}: the walkthrough's
  table of contents -- the kicker names the step bottom-left with its
  number, the step dots sit bottom-right, the steps before are filled,
  this one fills a beat after the name lands. Dark ink for a white
  ground, light for a dark one.
- `logo-band` {logos:[{src}|{text}], at, hold, y, speed, plate, ink}: a
  strip of customer logos at the upper third, repeated to fill twice the
  width, drifting left on the timeline (seek-safe), on a translucent
  plate over footage.

Verified in Chromium at 16x9 and 9x16. Type sizes off the larger axis so
a tall frame reads as big as a wide one.

## First board on the Grade recipe (proj_2384e533): three things the build now owns

The chapters came in as motion graphics from the library (quotient-chat,
quotient-campaign, flowchart, each with a cursor) and asked for no
screen; the logo band was cast on the return. Three misses, fixed in the
recipe pass, not the prompt:

- The chapter kicker was not cast. `castChapterKickers`: a beat whose
  `enters` names chapter-kicker gets one from the chapter scenes
  themselves -- the name from the label, the number from its place, the
  count from how many.
- Captions were laid on every scene though the recipe says none. The
  build now honors `captions.style: "none"`: no lane cast, a lane it cast
  earlier dropped.
- Every chapter asked for a camera take. No person on the beat means no
  take ask: `holdMadeToRecipe` drops `camera_video` on any beat whose
  shot is not a person.

Same board, two more, from the cards: chapter 3 (a flowchart, not a
proof surface) and the wordmark reveal were drawn OVER the person, and
the reveal and the close each got a ring where the wordmark belongs.
`holdGroundToRecipe` makes every no-person beat opaque
(`transparent_background: false`); `castWordmarkCards` casts the
logo-close template on a type_card beat that names stamp:wordmark (the
URL from the lines when it also names stamp:url) and drops the ring.
The logo band invented customers (Framer, Linear, Nestle): the recipe
and the component now say only customers the brief names, never
invented ones, and no band when none are named.

Second Grade board (proj_87b44c22): the writer cast the lower-third, the
props, the kickers and the logo-close cards itself this time -- and every
chapter still asked for a take, and none was opaque. Two plumbing gaps:
`storyboardToSaved` dropped `transparent_background` on the way to disk,
and `ensureSpeakerNeeds` (run on every load) re-added a camera_video need
to every scene with lines. The flag is now carried, and an opaque scene
takes no take need (a needed one it carried is withdrawn; a landed take
is kept).

Third Grade board (proj_7b306f5b): the chapters came in right -- opaque,
no asks, a kicker and a scripted mock each. The writer cast tool-window
mocks on the hook and the build turned them into screen_recording asks
with slates over the person. A beat made as the person's take (or as
type) asks for no screen either: `holdMadeToRecipe` drops its screen
needs and slates the way it does for motion graphics.

And the logo band invented customers a second time (Fable, Brightline,
Acme, Nova) despite the instruction. `holdLogoBandToBrief`: a text logo
not present in the brief is dropped, image logos from the tenant's
assets are trusted, a band left with nothing goes.

## "Record here" read as dead on the speaker lane

The need picker opens the booth panel on its own for a camera take, and a
click on a source already open toggled its panel closed -- so the first
"Record here" a person pressed closed the booth (Marc: "the record here
button does not work"). Reproduced locally in Chromium on the built
board. A second click on the open source now keeps it and scrolls it
into view; nothing toggles away.

## The take follows the film's frame

Marc recorded on his laptop for a 16x9 film and got a 1080x1920 take:
the take page's capture canvas was the phone's, fixed portrait, whatever
the film. It now reads the project's canvas once the page loads: a tall
film records 1080x1920 as before, a wide film 1920x1080 (1x1 -> 1080x1080,
4x5 -> 1080x1350), the camera is asked for that size, and on a wide film
the stage is the frame itself, centred, so what you see is what is
recorded. The server's sanitizer then has nothing to reframe.

## The take is the voice; the camera goes off

Marc recorded on his laptop into a BUILT film: the camera stayed lit
after "Use this take", and the scene played his take under the generated
line. Two causes. The build had laid a generated voiceover clip per scene
(vo_scene_<i>) because no take existed yet, and the take route never
removed it: `dropVoiceUnderTakes` now drops every scene's generated clip
once a take lands on it (Studio and the render both read the same
tracks). The embedded booth kept its stream after the attach: the take
page releases the camera the moment the take is in, and Studio unloads
any booth iframe when a dialog closes.

## A pile of props spreads

The sheet-row board's scene 2 ("the sentence splits"): thirteen task
cards popping out of the typed line, and the card showed two -- eleven
were stacked on the second of the two accent spots a plain scene had.
Props past the second now walk a ring of twelve spots around the frame
(sides alternating, the middle band left to the line they orbit).

## ask-work-result: the CTA line rides the result; a ground under the work

The sheet-row board on this recipe asked for a second screen recording
for its CTA beat, and the recipe pass stripped the office footage the row
asked for under the chaos. Two recipe edits, one format word:

- The CTA is not a beat: in the reference the ask of the viewer lands
  over the LAST shot of the deliverable, the same footage continuing. The
  beat is gone; the result beat runs 11-15s and its `enters` carry the
  CTA line at -3s. Band 4-5.
- `ground: "broll"` (new on the format): a beat that is motion graphics
  may still have found footage under it when the brief asks. The work
  beat has it; `pruneNeedsByRecipe` keeps a stock_footage need there and
  the block tells the writer.

Marc, on the row's scene 1: "do the visual notes seem to be connected to
the mock image?" They were not: the notes described a wooden desk and a
lamp and the scene cast only the composer on the brand world. On a
library-built scene the notes are prose; a ground has to be cast. The
ask beat (and the payoff open) now allow the footage ground too.

## Background blur at attach (the real one)

Marc, 2026-09-15: "how easy is it to add a blurry background to the take";
2026-09-20: "let's do the real one." Person matting on the server, per
take, as an option next to the soft look (`core/take-matte.ts`):

- Robust Video Matting (rvm_mobilenetv3, ONNX, CPU through
  onnxruntime-node) sees the sanitized take at a 288px short side and
  gives a soft per-frame alpha; its recurrent states carry frame to frame,
  so no flicker. ffmpeg then blurs the whole frame (boxblur, 8-32px at
  1080 wide by strength) and lays the sharp person back over it through
  the alpha, scaled up with a soft edge; the sound is carried.
- The raw take is KEPT. The blur is a copy beside it (<name>-blur.mp4);
  the take's `source` is the copy, `background.source_raw` the raw, so it
  can be undone or re-run. A failure never blocks the attach: the take
  lands unblurred and the note says why.
- Cost, measured here on four cores: about 85 ms a frame, a 15 s take in
  under a minute. The model (15 MB) is fetched once into
  <dataDir>/_system/models and checked by hash.
- The booth offers it as "Blur the background" (off by default, next to
  Soft look); the attach body carries `background: "blur"`.
- Install note: onnxruntime-node's install script tries to download CUDA
  binaries on Linux x64; `.npmrc` sets `onnxruntime-node-install-cuda=skip`
  so `npm ci` on CI and the droplet stays offline-safe.

Live check on the droplet: the attach with the blur inline held the
request past the proxy's 300 s limit and the connection dropped. The
blur now runs AFTER the attach (`queueTakeBlur`): the take lands at once,
unblurred, the matte runs in the background, and every take, clip and
need that points at the raw file swaps to the blurred copy when it is
done; the save bumps the version so Studio's live sync picks it up and
the cards re-shoot.

Measured live on the droplet: a 14 s take took about five minutes to
matte (two cores, ~600 ms a frame), against under a minute on four
cores here. The take is usable at once; the booth's hint and the attach
note now say "a few minutes". Halving it (every other frame, or a 224px
short side) is the next lever if it matters.

The five minutes had a cause: a canvas take carries a 120 fps timebase
with variable frames, and decoding it as-is duplicated every frame four
times for the model. The matte now runs at most 30 frames a second
(`MATTE_MAX_FPS`), the alpha muxed at the same rate against the original
timeline. Same picture, a quarter of the work.

## 2026-09-20 -- The take as a layer: alpha, and a ground under the person

Marc: "Couldn't you simplify this a little bit and have the background
just be alpha, meaning that it's transparent? ... if the component that's
underneath the speaker video is a video of the product or an image, it
would make the speaker look like it had that as the background." Yes --
and it is one model for blur, footage and stills alike.

- The camera was only ever the BASE: every speaker scene renders
  transparent over it (core/speaker-mode.ts), so nothing could lie under
  the person. The matte (core/take-matte.ts) now also writes
  `<name>-alpha.webm` -- the person on a transparent frame (VP9 with
  alpha, the one alpha video Chromium plays; ffmpeg decodes it through
  libvpx). One matte pass feeds both copies; the blur stays the default
  room when nothing lies under the person.
- `core/speaker-layer.ts`: a built person-film scene with a GROUND -- a
  full-stage clip, still or mock that holds the whole beat -- carries the
  take INSIDE the scene: a `video` component on the `speaker-alpha` token,
  cast right over the ground (z 1 / z 2) and under every graphic. The
  compositing rule reads it: such a scene renders OPAQUE, so the base is
  not doubled underneath. The board's `transparent_background` is never
  touched, so the take need stays open on it.
- Cast in two places: the pipeline after the build (a person film's scenes
  with a ground) and the take route at attach (boards built before the
  rule). The attach then asks the matte for the alpha copy whenever a
  scene carries the layer; the blur toggle keeps asking for the blur.
- Resolution everywhere the token can be seen: preview, composite,
  thumbnail and cards bind the token to this scene's alpha copy at the
  take's trim (`speakerClipForScene` now carries `alpha`); the render
  resolves it to the file before the worker; with no alpha copy yet the
  token falls back to the plain take (the person shows, the ground waits),
  and with no take at all the layer is left out (a black window would
  bury the ground). The `video` component honours `start_at`.
- The render workers keep the alpha: a `.webm` source is extracted as
  WebP (alpha kept, ~40 KB a frame at 1080x1920) through the libvpx
  decoder -- the native vp9 decoder drops the alpha plane; the frame
  cache key carries the format. Studio treats the alpha copy as the
  speaker (synced to the speaker clock, never listed as a media file).
- Verified here: Chromium composites a VP9 alpha WebM over a page
  background (a red page showed through the transparent corner); a 3 s
  slice matted to an alpha copy in 27 s on four cores; a one-scene film
  with a test-pattern ground, the alpha take and a lower third rendered
  through the speaker pipeline with the person over the pattern.
- Not done: Safari cannot play VP9 alpha (it wants HEVC with alpha); the
  Studio preview there shows the plain take over the ground. A light
  wrap on the matte's edge is the next lever if the halo shows on bright
  grounds.

## 2026-09-20 -- The speaker is a component: room, blur or alpha

Marc, on the alpha layer shipped this morning: "I thought we were going
to be able to choose background of blur or alpha ... make speaker track
be something that is only shown via a video component. By moving it to
the component it means we can put anything behind it, so we never have
to have an explicit replace-with-clip for the background." His model is
cleaner than the ground-detection shortcut, and it is now the model.

- Every speaker scene carries ONE `video` component on the `speaker`
  token (`speaker_layer: true`) with `data.background`: `room` (the raw
  take), `blur` (the blurred copy), `alpha` (the person cut out). Room
  and blur keep the fast path: the camera is the ffmpeg base under a
  transparent scene and the component draws nothing. Alpha plays the
  take's alpha copy INSIDE the scene at the component's place in the
  stack and the scene renders opaque -- whatever lies under it (a mock,
  footage, a still, the brand colour) is the room behind the person.
- The pipeline casts the component on every built scene over the camera
  of a person film: alpha over a ground (found footage, a still, a mock
  holding the whole beat), room otherwise. The take attach casts it on a
  film built before the rule and writes the booth's choice on it.
- The copies are made on request, never during recording, and once per
  take: the booth's choice (Room / Blur / Alpha, defaulting to the
  scene's setting) or Studio's Background row on the take's card
  (`POST /api/speaker-background {scene_index, background}`) queues the
  matte for the copy the setting lacks; the scene shows the raw take
  until it lands, a few minutes for a 15 s take on the server. Flipping
  a setting whose copy exists is instant. Takes recorded before today
  get their copies the same way -- no re-recording.
- The take record keeps `source` as the RAW take and carries `blur` and
  `alpha` urls (older takes stored the blurred copy as the source with
  the raw at `background.source_raw`; `takeCopies` reads both shapes).
  `syncSpeakerClips` points each clip of the speaker track at the copy
  its scene wants (the blurred copy as the base under a blur scene, the
  raw take otherwise, the alpha copy carried on the clip); `activeTake`
  matches a clip through any of the take's files. One matte job per file
  at a time; a copy asked for while it ran is queued when it ends.
- Verified here: the three settings through the built assembler (room and
  blur draw nothing over the underlay; alpha binds the alpha copy at the
  trim and the scene is opaque); the one-scene test film still renders
  the person over the pattern; the full suite green.

## 2026-09-20 -- One rule: a video component on the speaker token

Marc: "if the video component had the ability to play source speaker or
a file, you wouldn't need a special speaker component ... add position
and size fields and you have lots of control. Does that collapse some
concepts?" It does, and it is mostly deletion.

- The marker flag (`speaker_layer`) is gone from new data (still read).
  A `video` component whose `src` is `speaker` is the person -- any
  position, size, shape (`rectangle|rounded|circle`), any place in the
  stack, any number of them. `background` room|blur|alpha picks the copy.
- The camera base is an optimisation, not a concept: `speakerUsesBase`
  (one full-frame speaker on room or blur with nothing under it) keeps
  the fast path; anything else -- alpha, a ground, a corner bubble, a
  second speaker -- draws where it sits and the scene renders opaque.
  The render no longer rewrites the component's data: the worker binds
  the token at assembly, handed the scene's alpha copy at its trim, so
  the compositing rule reads the same data everywhere.
- Inspect: the cast row says "speaker"; background and shape are
  choices; a "place" preset writes the wrapper position (full frame or a
  circle bubble in a corner, about a fifth of the frame). The route
  behind the background choice is unchanged.
- Kept apart on purpose: the speaker TRACK (the take's audio, trims,
  word timings, the base) is the film's clock and voice; the component
  is only the picture. Legacy `pip_source: "speaker"` on screencast
  frames and generated `<video src="speaker">` bubbles keep their paths.
- Not yet: the pipeline still casts screencast scenes with the PiP
  property; a screencast board arriving as two video components (the
  recording as the ground, the speaker as a corner bubble) is the next
  step, once the hand-laid test film proves the combinations.
- Known limit: the copy is chosen per SCENE (the clip the speaker track
  plays there), so two speaker components in one scene share it -- a
  room and a blur speaker side by side both show the scene's clip.
  Alpha is per component (its own copy). Verified here through the
  built assembler: seven stacks (full room/blur on the base, full alpha,
  alpha over a ground, a room and an alpha circle over a screencast, two
  speakers) bind the file and the trim each one should.

## 2026-09-20 -- Sharper takes: the recorder's bitrate, the alpha copy's quality

Marc: "the camera quality on the laptop camera seems to be of low
quality. Is that normal?" Partly. The booth created its MediaRecorder
without a bitrate, so the browser's default (near 2.5 Mbps) smeared hair
and skin at 1080p; it now asks for 8 Mbps video and 128 kbps audio. The
alpha copy was encoded at crf 32 / cpu-used 5 for speed and read soft on
the cut-out scenes; crf 24 / cpu-used 4 costs no time (measured here:
the same 17 s on a 3 s slice, the file 1.7x larger). The soft look
(temporal denoise) stays a per-take choice, on by default -- turn it off
for a sharper take. Light on the face beats any setting.

## 2026-09-21 -- One Recorder session, both pieces

Marc recorded scene 7's page with the Recorder's sound and camera on and
asked what should happen. Nothing useful did: the armed-slot path took
the tab video for the need and dropped the camera file (it was only used
on the Recorder's new-project path). Now, for a screen-recording need on
a person film, the camera file beside the tab recording (sent as
`camera_url`, or found as `camera-<stamp>` next to `recording-<stamp>`)
is attached as the scene's take through `attachTakeToScene` -- the body
of `POST /api/take`, extracted so both routes share it: sanitize, prime
the words, face, de-air, re-time, drop the generated voice, the speaker
component's background (alpha over the page), the matte. The extension
(0.33.1) sends `camera_url`; older installs are covered by the sibling
lookup. Record the tab with the mic and camera on, and the scene gets
the page and you, cut out in front of it, in one go.
- The Recorder's camera now records like the booth: 1080p at 30 fps,
  8 Mbps video, 128 kbps audio (was 720p at 2.5 Mbps -- soft and dark
  as a take next to a booth take, measured on scene 7). Extension 0.33.2.
- Measured live the same night: Marc re-recorded scene 7 with the new
  extension and it became a scene 8 with two screencast frames. The
  popup caches the armed slot into settings when it opens; a slot armed
  in Studio after that was invisible to the recorder, and the take went
  the append route (into the library). The extension (0.33.3) now asks
  the server for the armed slot at stop -- a live arm wins over the
  cache -- and a recording for a project lands in that project. The
  append route casts the new scene in the component model too: the tab
  recording as the ground, a circle speaker component bottom-right, the
  camera file attached as the scene's take.
