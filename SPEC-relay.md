# SPEC: relay — every beat carried by an object

Status: SHIPPED 2026-09-26 (Marc: "Yes on grammar"). The grammar the parked
`SPEC-metamorph.md` asked for, built on today's machinery: the handoffs
are coordinates between library components. It needed no morph runtime;
since Morph v1 (2026-09-26) any other pair hands off with
`enter {effect: "morph", from}`.
Reference film: the Cosmos promo (x.com/kaolti/status/2103481296018092204),
rebuilt as `proj_9c829aa3` (13 scenes, 39.5 s, one 18 s oner).

## What it is

A film grammar answers one question: what carries the argument? In relay,
**objects** carry it, and nothing cuts inside a stretch of story. Two moves
do all the work:

- **The handoff.** The object that ends one beat becomes the start of the
  next. In Cosmos: the wall of images spirals into a point, the point becomes
  the logo, the logo's last dot swells into the search bar, and the colour
  chip drops a dot that floods the frame.
- **The through-line.** One object stays on screen across beats while they
  change around it. In Cosmos, the search bar rises to the top and holds
  while the results arrive, a colour filter floods and pulls back, and the
  query becomes an image search.

Against the grammars we have:
- **canvas-tour** moves the *viewer* across one surface; its beats are places.
- **relay** moves the *story* through objects; its beats are handoffs.
- **tempo-cut / hype-cut** cut on the music.

Marc named the gap when the first rebuild shipped as seventeen hard-cut
scenes: "everything's sort of just their own little separate scenes. And
then it just transitions to a new scene." The same content, rebuilt as one
18-second oner with the search bar as its through-line, read as the film.

## The shape

- **5-14 scenes.**
- **1-3 oners**: long scenes, 10-20 s each, holding 4-8 beats with no cut
  inside.
- **Punctuation** between them: hard-cut type beats of 0.5-3 s. Examples are
  a flash triplet ("Saved." / "Screenshotted." / "Forgotten."), a negation
  triplet ("No ads." / "No likes." / "No performing.") on alternating grounds,
  and a stat card.
- Every transition is `none`. A punctuation beat of 1.5 s or less is built
  `entrance: "settled"`, because an entrance playing inside half a second
  never finishes.
- The type is the voice: lines come into focus word by word, with no
  narrator, over a driving bed.

## A oner is one scene, not a sequence

A scene boundary resets every component, so the object being carried
vanishes. Inside a oner, beats are components **arriving and leaving on
times**. They use the wrapper's `enter` / `exit` with an `at`, or the
component's own timeline: `data.at`, `steps[].at`, formation `at`,
`exit_at`.

The through-line is one component instance for the whole oner. Its box must
span its whole path, because the component wrapper clips. A search bar that
rises from mid-frame to the top needs a box from `y: 0%` with `height:
111%` (measured: the bar vanished the moment it rose).

## The handoff kit (coordinates, not prose)

| From | To | The data that joins them |
|---|---|---|
| `image-swarm` `point` formation at x/y | `dot-logo` | the logo's `x/y` = the point's; logo `at` = the point's end |
| `dot-logo` `move {x, y, at, duration}` | `search-bar` `from: "dot"` | the bar's box centres on the move's x/y; bar `at` = `move.at + move.duration`; `grow` sets how fast it opens |
| `search-bar` chip | `color-flood` | `from_x` / `from_y` = the chip's place |
| `color-flood` `retract_at` | the next grid | the grid's `at` = `retract_at` |
| `image-swarm` `flythrough` | `image-swarm` `grid` | the next formation; the field lands as the results |
| `filter-grid` `keep` | the framed set | the same component |
| `dot-logo` `move` | `cta-card` | `actions_at` = the move's end; the dot becomes the button |
| `search-bar` step `to_y` (+ `scale`) | the rest of the oner | the bar parks at the top, and later steps (`clear`, `chip`, `type`) re-query |

**Any other pair: the morph.** Prefer `enter: { effect: "morph", from:
"<source>", at, duration }` on the arriving component (SPEC-metamorph.md,
"Morph v1"). It is born out of the source's box, or out of a part of it
(`"<source>.<anchor>"`), travels to its own box, and the source hands itself
over. `from` names a component in the same scene by its type (`_2` for the
second of a type). The coordinate handoffs above stay for the pieces built
for them: a dot that becomes a bar is the bar's own growth, not a box.

If the next beat cannot start from something on screen, the oner ends
there and a punctuation cut follows.

## Where it lives

- `creative-director.ts`: `FilmGrammar`, `FILM_GRAMMARS`, the director's
  description and its scene-count note.
- `storyboard-builder.ts`: `RELAY FILMS` (gated), with band 5-14.
- `pipeline.ts`:
  - creativity clamped to 0.15 (component-first: a freeform scene cannot
    know the coordinates);
  - the music bed on;
  - text as the voice;
  - after the build, every cut hard and short beats settled.
- `server.ts`: the `film_grammar` enum and the operator instructions.
- `test/relay.test.ts`: pins every layer. `test/grammar-contract.test.ts`
  guards the gating and world-neutrality.

## Not in v1 (parked in SPEC-metamorph.md)

- ~~A morph runtime~~: shipped 2026-09-26 as Morph v1 (one source, one
  target, inside a scene). The ghost moves (`burst`, `converge`, `dive`)
  stay parked.
- A rack-focus transition that joins two oners.
- Handoffs across a scene boundary. v1 keeps every handoff inside one scene,
  where both components share a page.
