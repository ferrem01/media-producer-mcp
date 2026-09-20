# SPEC-recipes.md -- the recipe: the measured cut of a film with the content removed

Status: shipped 2026-09-19 (library of nine). Companion docs: `SPEC-creative-axes.md`
(grammar), `SPEC-format-and-spine.md` (frame), `SPEC-creator-cut.md`, `SPEC-briefs.md`.

## Why

Marc, on the reference films: "the cuts are tight, the scenes are tight,
and generate does not deliver that polish." What those films have is not
visuals, it is editing -- a cut every few seconds, each on a word; a
cutaway that lands on the claim and leaves before the next; a stamp on
the noun; beats of five to ten seconds. Rhythm is deterministic, and we
were asking the writer to invent it from prose every time. A recipe is
that rhythm, measured from a film that worked, with the content removed.

## The third axis

A film commits to grammar (what carries the argument), frame (the size)
and recipe (the cut). All three are pinnable on `generate`; all three are
inferred by the director when left open. A recipe belongs to one grammar
and implies it when no grammar is pinned; it names the frames it is
proven at and works at the others through the frame laws. No recipe =
the writer invents the beats (generate as before).

## The data structure (`src/recipes/<id>.recipe.json`)

1. **Identity** -- `id`, `name`, `grammar`, `frames_proven`, `suits` (the
   message shapes it fits), `length_s` [min, max], `source` (the film,
   its length and frame, the measured cut times, the date).
2. **Spine** -- `spine[]`, ordered beats. Each: `role`, `shot` (person,
   person+cutaway, person+split, person+card, broll, idea_card, ...),
   `made` -- HOW the beat is made: `take` (the person's camera),
   `recording` (a REAL screen recording the human provides; a slate
   stands in), `motion` (MOTION GRAPHICS: library mocks and components
   perform it, nothing is asked of the human), `broll` (found footage),
   `illustration` (drawn), `type` (type alone). Inferred from the shot
   when absent (`madeOf`). `ground: "broll"` on a beat means found footage may lie under it when the brief asks (a stock_footage need is kept there; the surface and the cards ride over the clip). The build holds the board to it
   (`holdMadeToRecipe`): a motion beat's screen needs and slates are
   dropped, a recording beat that forgot to ask gets its need,
   `dur` [min, target, max] seconds (the word budget follows from it at
   the recipe's pace), optional `repeat` [min, max], `enters` (what lands
   on the beat: `stamp:noun`, `lower_third`, `keyword:type-on`,
   `end_card@-2s`), optional `cutaway` (`at`, `hold` fraction,
   `exit_before`, `use` cutaway | split | card, `kind`), and a `note`.
3. **Rhythm** -- `cut_cadence_s`, `max_hold_s`, `wpm`, `first_cut_by_s`,
   `end_card_s`. What the board is checked against.
4. **Layers** -- how the constant elements behave: `captions` (style,
   words per group, position, through cutaways), `stamps`, `lower_third`,
   `title_card`, `camera` (fixed | punch-in-per-claim), `music`. Style
   words, never colors: the brand kit dresses them.
5. **Asks** and **latitude** -- what the recipe needs from the human (the
   take, screens per proof, b-roll, images) and what the writer may drop,
   repeat or never touch.
6. **Motion** -- `elements` (per role: `in`, `in_s`, `out`, `out_s`,
   `per`), `transitions`, `camera` per beat role, `physics`. Effect names
   are the assembler's (`cut`, `fade`, `pop`, `rise`, `slide-*`); a name
   it does not know (`type-on`) is left to the component.

`core/recipes.ts` loads and validates the folder, gives the director a
one-line menu (`recipeMenu`), gives the writer the mandatory block with
beats, seconds and word budgets (`recipeBlock`), sets the scene budget
(`recipeSceneBand`), checks the finished board (`checkBoardAgainstRecipe`
-- warnings beside the brief locks), and applies the motion to the cast
(`applyRecipeMotion`: stamps, pills, lower-thirds and keywords take the
recipe's enter/exit unless the writer set one; a fixed camera marks the
scene so no punch-in is invented).

## The library (measured 2026-09-19)

Two things the seventh and sixth taught: a recipe can have no take at all
(`asks.take: "none"`, the on-screen type is the voice, `layers.voice:
"type"`), and a take can be per scene rather than continuous (the Air ad:
a new place on every cut, so the take is one clip per beat). Both are
read by the writer from the block. The build reads ONE layer word so far:
`layers.captions.style: "scatter"` casts the caption lane in scatter mode
(`core/captions.ts`): three words at most per phrase, each landing at its
own spot around the person (left and right columns stepping down the
frame) and staying until the cut; over a cutaway the choreography flags
the window with `--mp-cut` and the lane's CSS drops the running phrase to
the bottom band, the way the Air ad keeps the words at the foot of a
full-frame screen. Every other style is the plated chest-band lane.

| id | grammar | frame | from | shape |
|---|---|---|---|---|
| presenter-n-things | creator-cut | 16x9 | Clay, Jahnavi Shah, 65s | hook with lower-third and title stamp; "N things"; 2-4 proofs each with a stamp on the noun and a full-frame screen on the claim's verb; close with an end card |
| presenter-split-tour | creator-cut | 9x16 | bigpictureclub, 56s | many short steps, each a screen in the top half over the seated presenter with its name stamped; a summary card; single-word captions at the chest |
| founder-story-broll | creator-cut | 9x16 | Lieberman, 44.6s | selfie hook; found footage of the team; the product in the top half while the person works; story turn; b-roll; close with a stamp on the last words |
| speaker-kinetic-claims | speaker | 9x16 | Neil Jesani, 31.6s | seated expert; keywords typing on at the chest per claim; full-frame drawn idea cards for the numbers; a pill button CTA |
| speaker-one-take-cards | speaker | 9x16 | Matt Rodin, 86s | one unbroken selfie; a persistent title card; floating cards over the person per point; micro captions; no cuts |
| presenter-location-hop | creator-cut | 9x16 | Air, 50.4s | a person with a mic in a new place on every cut; each spoken word lands where it is said and stays; animal gag clips on the audience; kept outtakes as breathers; screens full-frame on the product's name; URL and wordmark to close |
| story-ad-idea-beats | hype-cut | 9x16 | Gamma, 16s | no person: type is the voice, one illustrated object per beat (the clock, the balloons); feeling, pain, wordmark reveal, product output fanning in, payoff, end card with a pill button |
| ask-work-result | canvas-tour | 1x1 | Runway in ChatGPT, 28.5s | an agent demo: a second of the payoff, the ask typed in full, the agent's checklist with its elapsed time, the deliverable full frame for half the film with two claim lines, one CTA line, wordmark on black; four lines of type in all |
| founder-bookends-chapters | creator-cut | 16x9 | Voicepanel Grade, 88.5s | a founder on a couch with props beside the head that get badged on the turn; the wordmark on white; 'let me show you how'; two or three chapters of MOTION GRAPHICS on white, each named by a kicker with step dots, one surface building per chapter; back to the founder with a logo band; wordmark and URL |

## Adding one

Send the film. Measure it: duration and frame; the cut times (scene
detection at 0.28 plus a look); what each beat is; what enters on it and
how; the caption style; the camera. Write the recipe file, name the
suits honestly, run the tests (the loader validates every file), and it
is in the menu on the next deploy. The taste is in which films get sent;
the system keeps the timing honest.

## Not yet

- A measuring tool that drafts the recipe file from a film (today by hand).
- Recipes for the other grammars (launch-film, tempo-cut, editorial,
  data-story, screencast). hype-cut and canvas-tour have one each.
- Studio: a recipe picker and the recipe's beats drawn on the ruler.
- The critique reading the recipe's motion as a rubric.
