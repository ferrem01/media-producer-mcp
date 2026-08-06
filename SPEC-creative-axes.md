# SPEC: The creative axes — how any video decomposes, and how the system grows

Status: LIVE (the fields shipped 2026-08-05/06). This document is the map:
what the axes are, what values exist, what values are anticipated, and the
rules that keep growth from becoming sprawl. Read this FIRST when asked to
"replicate that video I saw on X" — the decomposition below is the method.

## The model (the film-craft triad)

Every film the system makes is defined by a prompt, the brand kit, and THREE
creative axes — the same triad film craft has used for a century:

| Axis | Field on `generate` | What it decides | Analog |
| --- | --- | --- | --- |
| RHYTHM | `film_grammar` | who narrates, what earns a cut, music's role, scene assembly | editing |
| LOOK | `visual_system` | the surface, the physics, the type voice, recurring devices | art direction |
| SOUND | `audio_system` | music personality, narration voice, (future: SFX) | sound design |

One contract for all three: **omitted → the creative director infers from the
prompt; provided → pinned** (the director must commit and design around it).
Subfields pin independently — pin the world, let the director pick the motion.

Internal machinery (WorldSpec, treatment prose, motion helpers) hides behind
these fields. Operators never need those words.

## The growth rules (the anti-sprawl covenant)

1. **New reference video → new VALUES, not new fields.** Decompose it:
   rhythm (rarely new — the grammars cover almost everything), look
   (occasionally a new world/motion/motif value), sound (occasionally a
   mood), components (frequently new — the cheap, safe growth). The
   three-video analysis arc of 2026-08-05 (Lenny Product Pass, Behind the
   Craft, Remotion Shipper) produced: 1 world value, 1 motion value, 1 motif
   value, ~6 components, 0 new fields.
2. **Every enum value must be backed by machinery** (a backdrop component, a
   motion contract, a component family, a search mapping). Values without
   machinery are lies the creative director will happily tell.
3. **A new FIELD requires a dimension orthogonal to every existing axis AND
   operator-worthy** (pin-vs-infer must be a decision a human would want).
   If a video can't be expressed as values + components, that is a design
   review, not a quiet extension.
4. **A new CONCEPT (neither value, subfield, nor component) requires explicit
   design review with Marc before any code.** (House rule; it repeatedly
   shrank this very design: the camera rig existed as CameraMove, the "dive"
   was a recipe, stations were scene fields, nesting was rejected.)

## Axis: `visual_system`

### `world` — the film's one continuous surface (backed by a backdrop component + WorldSpec)

| Value | Look | Status |
| --- | --- | --- |
| `light` | airy editorial mesh gradient | LIVE |
| `dark` | cinematic WebGL world | LIVE |
| `paper` | painted print/letterpress sheet, warm tone + ink channel, intensity dial (clean print 0.15 ↔ letterpress 0.85) | LIVE (paper-ground) |
| `blueprint` | dark engineering grid, drawn white linework | anticipated |
| `terminal` | CRT green-on-black, scanlines — dev-tool launches | anticipated |
| `linen` / `fabric` | textile weave (texture pipeline generalizes: Veo macro photo → high-pass → feathered stamps) | anticipated |
| `film-stock` | photographic grain, super-8 vignette, retro burn | anticipated |
| `chalkboard` | slate + chalk ink channel | anticipated |

Recipe for a new world: one backdrop component (the `paper-ground` pattern:
deterministic seeded paint, tone/ink CSS vars, registered in BACKDROP_TYPES +
BACKDROP_CAST_TYPES), a WorldSpec union entry, a deriveWorld trigger.

### `motion` — the physics contract (tokens + guidance; enforcement grows over time)

| Value | Feel | Status |
| --- | --- | --- |
| `punchy` | house slams, throws, pushes | LIVE (default) |
| `calm` | settle-never-bounce; entrances ease out and land; nothing overshoots (the Claude-Paper doctrine) | LIVE (guidance) |
| `cutout-physics` | rigid flat pieces drop/settle/swing; 12fps stop-motion steps + sub-pixel ink boil are the print feel's motion half (Jake Moran's vox pack) | LIVE (guidance; 12fps/boil helpers pending, #58) |
| `elastic` | cartoon squash-and-stretch | anticipated |
| `analog` | VHS jitter, tracking wobble | anticipated |
| `float` | weightless slow drift | anticipated |

Each value should eventually carry a banned-moves list (motion-as-world-
personality, #58): what a contract FORBIDS is most of its voice.

### `type` — display-type voice (brand kit fonts stay the base)

`grotesk` | `editorial-serif` | `typewriter` | `script` — LIVE as guidance to
codegen/templates. Fit-to-measure sizing rules land with the #58 gates.

### `motif` — a recurring performed element family (Marc: "a theme you run through the entire video")

| Value | Device | Status |
| --- | --- | --- |
| `cutout` | illustrated sticker set threading the film (assets from `generate_clip mode='cutout'`; performed by `sticker-prop kind='image'`) | LIVE |
| `hand-annotation` | marker circles/arrows/underlines as running commentary | anticipated (components partly exist) |
| `tape-and-torn-paper` | the true-zine garnish | anticipated |
| `polaroid` | photos as physical props | anticipated |
| `mascot` | one consistent character recurring (generate_clip reference_image gives consistency) | anticipated |

Motif rules: PIN-ONLY inference for now (the director must not invent a motif
without assets); `density: accent` (garnish on key beats) vs `lead` (the
stickers carry the film); assets REQUIRED in v1 — the pipeline resolves
`*-cutout.png` brand images or FAILS LOUDLY pointing at
`generate_clip mode='cutout'`. Never silent degradation.

## Axis: `audio_system`

| Subfield | Values | Status |
| --- | --- | --- |
| `music_mood` | driving, jazzy, ambient, playful, cinematic, warm, none | LIVE (drives track search; `none` suppresses the bed) |
| `voice` | alloy, echo, fable, onyx, nova, shimmer | LIVE (wins over legacy flat param) |
| `sfx` | typewriter clacks, clicks, whooshes synced to motion | FUTURE — requires an SFX engine first (rule 2); reference: HeyGen's sfx-music-launch composition |

## Named styles (presets, not concepts)

A style is a VALUE BUNDLE someone can ask for by name — never new machinery:

- **"cutout style"** = `visual_system: { world: paper, motion: cutout-physics, motif: { kind: cutout, density: lead } }`
- (future) "letterpress editorial" = paper@0.85 + calm + typewriter/serif
- (future) "zine" = paper + cutout-physics + tape-and-torn-paper motif

## Anticipated future FIELD (the only one forecast)

None beyond the triad. Type voice folded into `visual_system` (it is part of
the look). Sound completed the triad. Duration targets, language, palette
tints are scalar params or subfields, not axes. If a fourth axis ever seems
necessary, run rule 3's test and hold a design review — the triad has held
for a hundred years of cinema.
