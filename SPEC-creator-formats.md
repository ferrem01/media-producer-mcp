# SPEC-creator-formats.md -- the creator vocabulary: four hard concepts, each a list

Status: shipped 2026-10-07. Companion docs: `SPEC-recipes.md` (the recipe),
`SPEC-creative-axes.md` (grammar), `SPEC-cast-scenes.md` (the performer plan),
`SPEC-creator-cut.md` (proof on a claim), `SPEC-format-and-spine.md` (frame).

## Why

Marc makes more viral creator videos now than any other kind. Two lists
describe that world well and are already named the way creators talk:

- **The 10 viral content formats** -- Talking Head, Screen Share, Listicle,
  Ranking, Reaction, Clone, Split Screen, Green Screen, Voiceover B-roll, Yap.
- **The 17 talking-head types** -- seven are *where the person is*
  (Classic Sit-Down, Walk & Talk, Car Talk, Podcast Style, Outdoor Sit &
  Talk, Do Something & Talk, Second-Camera) and ten are *where the proof
  lives* (Green Screen, Split-Screen, Dual-Role/Clone, Demonstrate,
  Whiteboard, TV, Laptop, React, Prop, Point & Explain).

Marc: "as long as they are hard concepts and I can see lists of options for
each one. That helps me think through what combos of grammar and recipes
etc. are possible." So nothing here is a new layer of ideas; every name
lands on one of four concepts we already had, and each concept is a closed
list you can print.

## The four hard concepts

| Concept | Level | What it answers | Where it lives |
|---|---|---|---|
| **Grammar** | film | What carries the argument? | `treatment.filmGrammar`, `generate film_grammar` |
| **Recipe** (and its **format**) | film | What is the measured cut? Which viral format is it? | `treatment.recipe`, `generate recipe`; `src/recipes/*.recipe.json` |
| **Setting** | scene | Where is the person and how are they shot? | `storyboard.scenes[i].performer.setting` |
| **Proof use** | beat | Where does this beat's proof sit relative to the person? | `storyboard.scenes[i].assets[j].use` |

Plus the fifth axis that already existed and is only a size: **frame**
(`16x9 | 9x16 | 4x5 | 1x1`).

**Print every list:** `list target:"vocabulary"` (MCP) returns all of them,
with every recipe grouped under its format and grammar. The code is
`src/core/vocabulary.ts`; the lists are the code's lists, never a copy.

A combination reads as one line: *"Listicle -- index-reel-host (creator-cut,
9x16), scenes in Car Talk, proofs on a phone"* or *"Talking Head --
speaker-kinetic-claims, Walk & Talk, one beat on a laptop"*.

### 1. Grammar (film) -- unchanged, ten values

`launch-film`, `tempo-cut`, `hype-cut`, `editorial`, `data-story`,
`canvas-tour`, `relay`, `screencast`, `speaker`, `creator-cut`. No new
grammar was needed: every viral format is a cut of one of these.

### 2. Recipe (film) -- now carries a `format`

A recipe gains two identity fields:

- `format` -- which of the ten viral formats it is: `talking-head |
  screen-share | listicle | ranking | reaction | clone | split-screen |
  green-screen | voiceover-broll | yap`. Optional: an ad cut that is none
  of them (`story-ad-idea-beats`, `launch-what-if-features`) has no format.
- `variant` -- a short name for the version within the format
  (`index-reel host`, `deep`, `one take`).

`generate creator_format:"<format>"` picks the format's recipe when no
recipe is pinned: the first one listed under it below, or the first proven
at the film's frame when a frame is pinned; `recipe` still pins an exact cut
and wins. (`format` on create is the output kind -- video, image -- hence the
longer name.)

**The ten formats and their recipes:**

| Format | What it is | Grammar | Recipes (default first) |
|---|---|---|---|
| Talking Head | a person to camera, graphics over them | speaker | speaker-kinetic-claims, speaker-one-take-cards, founder-selfie-punch-cards, presenter-location-hop, founder-bookends-chapters, founder-launch |
| Screen Share | the screen carries it | screencast / canvas-tour | ask-work-result (and the `screencast` grammar itself, with a real recording via `screencast_source`) |
| Listicle | N things, counted | creator-cut / tempo-cut | presenter-n-things (deep), index-reel-host (the 9x16 pick), index-reel-page |
| Ranking | items placed on a tier list, one by one | creator-cut | ranking-tier-list |
| Reaction | a source clip on top, the person reacting under it | creator-cut | reaction-split |
| Clone | the same person playing two roles in one frame | creator-cut | clone-dialogue |
| Split Screen | a screen in the top half, the person under it | creator-cut | presenter-split-tour |
| Green Screen | the person cut out over the proof | creator-cut | green-screen-explainer |
| Voiceover B-roll | a voice over footage, no face | hype-cut (a narrator) / creator-cut | voiceover-broll-story, founder-story-broll (the version with a face) |
| Yap | one unscripted take, big captions, almost no graphics | speaker | yap-one-take |

### 3. Setting (scene) -- new field on the performer plan, eight values

`performer: {actor, how, engine, location, setting}`. A setting is *where
the person is and how the phone sees them*. It does two jobs:

1. **The booth** shows it as filming guidance on the take page ("prop the
   phone on the dash, look just past it").
2. **A generated or recast performer** gets it as the shot: when a
   `perform_scene` / `start_frame` names no shot, the setting's shot text is
   the shot (and so the start frame and the Seedance prompt).

| id | Name | Booth guidance (abridged) | Shot for a generated performer (abridged) |
|---|---|---|---|
| `selfie` | Selfie | arm's length, phone at eye level | handheld selfie medium close-up |
| `sit-down` | Classic Sit-Down | phone on a stand at eye level, chest up, a clean background with depth | seated medium shot, a lived-in room behind |
| `walk-talk` | Walk & Talk | hold the phone out, walk slowly toward it, keep the face in the top third | walking toward a handheld camera, gentle bounce |
| `car` | Car Talk | phone on the dash or a vent mount, parked, look just past the lens | the driver's seat, seen from the dash |
| `podcast` | Podcast Style | a mic in shot, phone off to one side, talk to a point beside the lens | at a desk with a broadcast mic, three-quarter angle |
| `outdoor-sit` | Outdoor Sit & Talk | seated outside, the light on your face, not behind you | seated outdoors, soft daylight |
| `doing` | Do Something & Talk | keep doing the task while you talk; the phone sees your hands and face | busy with a task with their hands, talking to camera |
| `second-camera` | Second-Camera | someone else holds the phone; you talk to them, not the lens | filmed from the side by a second person, talking to someone off camera |

The Locations library still says *which room* (Seedance); the setting says
*how the person is in it*. They compose.

### 4. Proof use (beat) -- fourteen values

A proof need's `use` says where the proof sits relative to the person.
The first four existed; ten are new.

| use | Name | Layout the build gives it | What the booth hears |
|---|---|---|---|
| `cutaway` | Cutaway (default) | full frame, hard cut in on the word and out | -- |
| `split` | Split Screen | tall frame: the screen owns the top, the person under it | -- |
| `card` | Card | a plated card beside the person | -- |
| `clip` | Clip | a live-action moment on a film no person carries | record the moment |
| `green` | Green Screen | the proof is the ground for the whole beat; the person plays cut out over it (the alpha copy) | -- |
| `tv` | TV | the proof on a TV set beside the person | -- |
| `laptop` | Laptop | the proof on a laptop beside the person | -- |
| `phone` | Phone | the proof in a phone frame beside the person | -- |
| `whiteboard` | Whiteboard | the proof pinned to a whiteboard beside the person, a marker title | -- |
| `point` | Point & Explain | a card on the side the person points to | "point to your left as you say it" |
| `react` | React | the proof on top (tall) or to the side (wide), the person reacting | "watch it and react" |
| `prop` | Prop | nothing is drawn: the person holds the thing up | "hold up <the thing>" |
| `demo` | Demonstrate | nothing is drawn: the person shows it with their hands | "show <it> with your hands" |
| `clone` | Clone | a second take of the same person, filling the other half of the frame | "Take B: same spot, sit on the other side, answer yourself" |

`tv`, `laptop`, `phone`, `whiteboard`, `card`, `point` and `react` are one
new component, **`proof-frame`**: a self-placing frame around the proof
(image or clip) on the side away from the face, sized for the frame, cut in
and out on the need's words. A slate stands in the same frame until the
file lands. `green` reuses the speaker component's alpha background (the
person cut out over a ground). `prop` and `demo` are directions, not files:
they never show as "needed" in Studio and draw nothing. `clone` is a
camera need recorded in the booth as Take B; the take page asks which take
you are recording on a scene that has one.

**Recipe beats name a use too:** a beat's `cutaway.use` can be any of the
fourteen; a proof need on that beat with no use takes the beat's.
**Recipe beats name a setting too:** `setting` on a beat writes the
scene's `performer.setting` when the scene has none.

## The index reel (the Listicle's fast version)

What the two reference reels do (kienobi and peter): one claim, *"12 lifecycle
emails in 12 seconds"*, pinned at the top the whole time; a phone-frame
example that swaps about every 0.9 s; the count visible so the viewer knows
how far in they are; and either a person talking under it (host) or a
designed page with a numbered list filling in step with the examples (no
host). The pace is the point: too fast to read everything, so people save
it and come back.

**One component, `index-reel`,** does both:

- `headline` -- pinned at the top for the whole scene.
- `items[]` -- `{title, src?, subject?, preview?, at?}`. An item with no
  `src` draws an example itself (an email: sender, subject, preview lines
  and a button) so a reel needs no screenshots to look finished.
- `per_item_s` -- default 0.9; `at` per item can be a word anchor.
- `mode: "host"` -- the headline band and a phone frame on the side away
  from the face, a `3/12` count chip, over the person.
- `mode: "page"` -- an opaque designed page: headline, numbered list that
  fills in as each item lands (the current one in full ink, the rest
  quiet), the phone frame beside or under the list.

**Two recipes:**

- `index-reel-host` (creator-cut, 9x16): hook (headline lands, 1.5-2.5 s) ->
  run (all items, one scene, ~0.9 s each) -> close (save this / follow,
  2-3 s). One take, fixed camera, captions at the chest.
- `index-reel-page` (tempo-cut, 9x16, no person, music, the type is the
  voice): the same three beats on the page.

## Ranking, Reaction, Clone (the new parts)

- **Yap -- `yap-one-take`:** one continuous selfie, no graphics past a title
  stamp, big captions. The take page tells you the lines are talking points;
  the captions come from what you said (the script alignment keeps the heard
  words when under half of them match the lines).
- **Ranking -- `tier-list` component:** rows S / A / B / C / D (labels and
  colors overridable), items `{label, tier, at}` drop into their row on
  their word, the latest one marked. Recipe `ranking-tier-list`: hook ->
  one scene per item placed (the list stays up as a split over the person)
  -> the final board -> close.
- **Reaction -- `use: "react"`:** the source clip on top (tall) or to the
  side (wide) in a `proof-frame` with no chrome, the person under it. The
  source is a screen_recording / stock_footage / uploaded clip need.
  Recipe `reaction-split`: the clip plays, the person stops it to comment,
  verdict, close.
- **Clone -- `use: "clone"` + two takes:** the trick creators use: the phone
  locked off, Take A sits on the left half of the frame, Take B on the right.
  The build lays Take B's right half over the right half of the frame
  (`object_position: right center`), so the two read as one room with two of
  you. Take A is the scene's own take -- the voice and the clock, whoever
  speaks; Take B LISTENS and reacts in silence (its sound is muted, so the
  timing never has to match). A clone need's `side: "left"` puts Take B on
  the left instead, for the lines the other role says sitting on the right.
  The take page shows "Take A (you) / Take B (your clone)" on a scene with a
  clone need; Take B lands through the clip path in its half. Recipe
  `clone-dialogue`: the doubter asks, you answer, back and forth, one scene
  per exchange (a clone beat with no Take B need gets one).

## What changed in code

- `src/core/vocabulary.ts` -- the lists (formats, settings, proof uses,
  grammars) and `vocabulary()` for the MCP `list target:"vocabulary"`.
- `src/core/performer-settings.ts` -- the eight settings: booth guidance and
  shot text; `shotForSetting`.
- `src/core/proof-placement.ts` -- the fourteen uses and `placeProof`, the
  one function that turns a full-bleed proof (or its slate) into its placed
  form. Called where proofs and slates are cast (`asset-needs.ts`).
- `types.ts` -- `CastPlan.setting`; `AssetRequirement.use` widened.
- `recipes.ts` -- `format`, `variant`, beat `setting`, `cutaway.use` any
  proof use; `holdSettingToRecipe`, `holdUseToRecipe`; `recipeForFormat`.
- Components: `proof-frame`, `index-reel`, `tier-list`; `video` reads
  `object_position`.
- Take page: the setting's guidance, each beat's direction (point, react,
  prop, demo), the yap note, and the Take A / Take B choice on a clone scene;
  the clone take lands as a clip in its half (`POST /api/take {as:"clone"}`).
- Generated performers: `sceneShot` -- the setting's shot when the scene's
  shot was only a default (the stock shot or another setting's); a shot
  written by hand stays.
- Writer prompt: the new uses and the settings.

## Not yet

- The source clip's own sound under a reaction (the clip plays silent; the
  person's voice is the track).
- Studio: a setting picker in the performer panel (MCP, the API and recipe
  beats set it today), and the vocabulary drawn as a picker on generate.
- The writer choosing a setting per scene on its own (recipe beats and the
  update tool set it today).
- A Screen Share recipe with the face in a bubble over the recording (needs
  a second speaker layer over a full-beat cutaway).
- Clone with both takes moving across the middle (the split is a straight
  vertical line; cross it and you vanish).
- A measuring pass on real index reels to tune `per_item_s` by count.
