# SPEC: metamorph — a oner carried by objects, not the camera

Status: DESIGN — drafted 2026-09-25 from Marc's reference, not implemented.
Reference film: Runneth Talent launch (x.com/rezakhadjavi/status/2103192804788961502),
40 s, 16:9, sampled every 0.5 s and at 8 fps around each handoff. The
shot-change detector finds **zero hard cuts**.

## What it is

A film grammar. A metamorph film never cuts: each beat's hero object is
**born from the previous beat's hero**. An avatar becomes a card, cards become
a grid, the grid becomes a shortlist, a card dives into a notification, and the
opening avatars return to become the logo. The camera barely moves; the
**objects** carry the continuity.

The industry has no single name for it. The parts have names:
- **Metamorphosis animation.** One thing transforms into the next with no cut
  (Émile Cohl, *Fantasmagorie*, 1908). This is the defining trait.
- **Oner / long take.** No cuts. Strictly that's about the camera, but it is
  the feeling.
- **Graphic match.** A shape carries across a transition.
- **Invisible cut.** A disguised join; the reference's defocus dissolves are
  this.

Against the grammars we have:
- **canvas-tour** is a oner carried by the CAMERA across one surface: beats
  are places.
- **metamorph** is a oner carried by OBJECTS on one ground: beats are
  transformations.
- **launch-film** and **tempo-cut** cut.

### The reference, beat by beat

| t | Beat | Handoff into the next |
|---|---|---|
| 0–2 s | Avatars and brand chips float at depth around "Introducing" | They blur back; the wordmark resolves (rack focus) |
| 3.5–5 s | The same avatars BURST out and land as profile cards | The cards pack a 5-column grid (burst into a grid) |
| 8.5–10 s | Matches ring green; the rest blur away | Five survivors slide into a ranked column (cull) |
| 13.5–19 s | Application cards are dealt, read, and stamped Shortlisted / Not this search | The next card deals in (review deck) |
| 19.5 s | Lena's card dissolves into the interview panel in the same slot | Rack focus, in place |
| 24.5–27 s | One card flies in, FANS to five, COLLAPSES to one | The card shrinks and DIVES into the Gmail notification's avatar row |
| 30–31 s | A cursor clicks the notification | Dissolve to "Trusted by" plus a logo marquee |
| 36 s | The opening avatars return, orbit, and CONVERGE into the app icon | The URL types (bookend) |

Constants:
- One cream ground, start to finish.
- A line TYPES on the left with a live cursor while the object performs on
  the right. The typing is the narrator and sets the tempo.
- One beat every 3–5 s.

## The question: does every component need a morph state?

**No.** A morph is a relation between TWO components, so per-component morph
states would be an N×N problem: every pair would need a bespoke choreography.
Three tiers instead. Only the third asks anything of a component, and what it
asks is tagging, not new states:

1. **Rack focus (any two components; zero component work).** The outgoing
   component blurs, scales back ~6% and fades. The incoming one sharpens from
   blur in the same slot, overlapping by ~0.3 s. It is a scene-level wrapper
   effect, like `enter`/`exit`, so every component in the library gets it for
   free. This is the fallback whenever no object handoff fits.
2. **Object handoffs (tagging only).** Components publish their morphable
   parts with `data-morph` tags, exactly as they already publish
   `data-anchor` for the camera (SPEC-motion-architecture.md, "Anchors").
   Examples: `data-morph="avatar"`, `"card"`, `"logo"`.
   - A scene-level **handoff engine** flies stand-ins ("ghosts") from the
     outgoing component's tagged parts to the incoming component's tagged
     parts.
   - Neither component knows the other exists.
   - Per component this is a few attributes on elements it already draws.
3. **Performing components (new builds).** Some transformations are a
   component's own internal performance: a grid culling to a shortlist, a
   deck being dealt, a fan collapsing. Those are new components (below).
   They also publish tags, so they can hand off in and out.

Rough cost: **about 15 existing components get tags** (a few lines each),
**three new components**, **one handoff engine**. Nothing else in the library
changes.

## The handoff engine

### Data (on `Scene`, beside `camera_moves` — one lane, like the camera)

```ts
handoffs?: Array<{
  at: number | string;          // seconds, or a word anchor ("@shortlist")
  from: string;                 // "componentId.tag"  e.g. "grid.avatar"
  to: string;                   // "componentId.tag"  e.g. "notif.avatar"
  move: "fly" | "burst" | "converge" | "dive" | "rack-focus";
  duration?: number;            // default 0.9
  stagger?: number;             // default 0.025 per ghost
  ease?: string;                // default power3.inOut
}>;
```

Word anchors resolve exactly like every other `at` (core/word-anchors.ts).
For `rack-focus`, the tags are ignored: it acts on the two components'
wrappers.

### Mapping sources to targets

| move | shape | pairing |
|---|---|---|
| `fly` | n → n | Pairwise by document order. Extras on either side fade. |
| `burst` | 1 or few → many | Ghosts start stacked on the source's centre and spread to every target slot. |
| `converge` | many → 1 | Every source ghost flies to the single target, shrinking; the target fades in on the last arrival. |
| `dive` | 1 → 1, target smaller | Scale-down flight with a slight arc; the target slot "receives" it with a 1.06 pulse. |
| `rack-focus` | wrapper → wrapper | Blur, scale and opacity crossfade in place. |

### Runtime (deterministic, single renderer)

- **Measure at build, not per frame.**
  - Source rects are measured with the outgoing component's timeline at `at`.
  - Target rects are measured with the incoming component's timeline at
    `at + duration`, its landing state.
  - Both are in stage coordinates, under the one camera rig. The assembler
    seeks each component's timeline to measure, then resets it. This mirrors
    anchor resolution, and it is deterministic because every component is
    seekable.
- **Ghosts.**
  - Deep clones of the source parts, placed in a morph overlay layer above
    the components and inside the camera rig, so a camera move carries them.
  - Mid-flight the source clone crossfades to a clone of the target part, so
    radius, fill and content morph as a dissolve, not a hard swap.
- **Visibility.**
  - Source parts hide at `at`.
  - Target parts stay hidden until their ghost lands (`autoAlpha`), then the
    real element takes over at its final state and the ghost is removed.
  - The incoming component's own entrance still plays for every part NOT
    targeted.
- **Rendering.** All motion is tweens on the scene timeline. The ghost layer
  renders from the timeline's single `onUpdate`, following the
  single-renderer rule (no per-ghost callbacks), and no randomness is used.
  The capture's seek-anywhere contract holds.

### Tags (the vocabulary, and who publishes them first)

| tag | meaning | first publishers |
|---|---|---|
| `avatar` | a round face | brady-grid, audience-people-list, notification-stack, macos-notification, card-fan, the new review-deck and grid-cull |
| `card` | a rectangular record | card-fan, card-cascade, audience-people-list rows, the new review-deck and grid-cull |
| `chip` | a pill or label | floating-pills, feature-map nodes |
| `logo` | a mark | logo, logo-band, logo-outro |
| `headline` | the line of type | typewriter, kinetic-text |
| `number` | the hero figure | stat-card, number-counter-row, dashboard-kpi |
| `notification` | a toast | notification-stack, macos-notification, liquid-glass-notification |
| `screen` | a UI window | browser-frame, device-mockup, the quotient-* shells |

A component may publish several tags. Tags are listed in the component's
schema (`morph_tags`) so the writer only pairs what exists.

## The three new components

1. **review-deck.** Rich record cards dealt one at a time.
   - Per card: a highlight scans its rows, ticks land, a verdict stamps
     ("Shortlisted" / "Not this search", any label), and the card is dealt
     off as the next slides in.
   - Data:
     `cards[{avatar, name, role, rows[], thumbs[], verdict, verdict_tone}]`,
     `pace`.
   - Tags: `card`, `avatar`.
   - For Quotient: lead scoring, "the agent reads every lead."
2. **grid-cull.** A dense wall of small row cards (40–300).
   - Matches ring in brand color, the rest blur and fade, and the survivors
     slide into a ranked column (with an optional title chip, "Your JD ·
     Creative strategist").
   - Data: `count`, `rows` (or generated from `seed` plus a few real ones),
     `keep[]`, `column_title`.
   - Tags: `card`, `avatar` (the survivors).
   - For Quotient: audience segmentation, the needle in the haystack.
3. **verdict-scorecard.** Criteria rows tick one by one, then a dark verdict
   tile lands ("Top 5%").
   - Data: `criteria[]`, `verdict`, `at`.
   - Pairs with video-call; tag `number` on the verdict.

The reference's other pieces already exist: typewriter, logo-band, card-fan,
notification-stack or macos-notification, video-call, brady-grid,
cursor-performer, floating-pills and screen-cloud. Faces at depth is a small
extension to floating-pills.

## The grammar contract (what the director and writer do)

`filmGrammar: "metamorph"`.
- **One ground.** One `world` for the whole film: flat or paper, light by
  default.
- **No cuts.**
  - The film is a few long **chapter scenes** (typically 2–4, 10–20 s each),
    each holding several beats. Handoffs need both components in one DOM, so
    a chapter is where they can happen; this is the same doctrine that made
    canvas-tour v1 work with existing machinery.
  - Between chapters the scene transition is `rack-focus` (a blur crossfade
    at scene level), never a cut.
- **Every beat is born from the last.** Each beat names its hero component
  and the `move` it enters by. The builder turns beats into the chapter's
  components (enter/exit at beat boundaries) and its `handoffs` lane. A beat
  with no plausible object handoff enters by rack focus. At most two rack
  focuses in a row, or it stops being a metamorph film.
- **The narrator types.**
  - Default layout: a typed line on the left third with a live cursor, and
    the hero object on the right two-thirds.
  - The line types, holds, then blurs out as the next types.
  - With a voice (speaker, creator-cut), the typed line becomes the caption
    of the spoken line instead.
- **Bookend.** The opening's objects return at the close and converge into
  the logo.
- **Tempo.** 3–5 s per beat. The handoff takes 0.6–1.0 s and starts before
  the typed line finishes, so the eye is always travelling.

Frame: any. On 9x16 and 4x5 the typed line moves above the object.

## Phases and exit tests

1. **Components (useful in every grammar now).**
   - Build review-deck, grid-cull and verdict-scorecard, with tests and demo
     renders.
   - Exit: each performs deterministically, stays in frame at 16x9, 9x16 and
     4x5, and seeks anywhere.
2. **Rack focus + handoff engine + tags.**
   - The `handoffs` lane and its runtime; tags on the ~15 first publishers;
     `rack-focus` as a scene transition and an in-scene move.
   - Exit: a one-chapter demo recreating the reference's middle run (avatars
     burst into a grid, cull to a shortlist, a deck, a card dives into a
     notification) with no visible cut, measured by the shot-change
     detector, and every ghost landing within 2 px of its target.
3. **Grammar.**
   - Director and writer prompts, the builder that derives chapters and
     handoffs from beats, and the `metamorph` enum value.
   - Exit: a Quotient board generated cold ("Quotient Analytics — from
     everything, to the one number that matters"), built and rendered, with
     zero hard cuts.

## Non-goals

- Morphing arbitrary pixels (shape tweening between unrelated drawings).
  Handoffs move tagged DOM parts; anything else rack-focuses.
- Handoffs across scene boundaries. Chapters are the unit, and between
  chapters it is rack focus.
- Camera travel as the carrier. That is canvas-tour; the two can combine
  later.

## Open questions

- Two things Marc described are not in this reference: cards assembling into
  a face, and a line drawn out along an axis.
  - Cards forming a face would be a `converge` onto a `mosaic` target
    (a component that lays N tiles out as an image).
  - The line would be a `trace` move (a path drawn from a source part and
    carried along an axis).
  - Add both once we have the film they came from.
- Should `grid-cull` generate its crowd procedurally (seeded fake rows) or
  require real rows? Proposal: seeded by default, with real rows for the
  survivors.
