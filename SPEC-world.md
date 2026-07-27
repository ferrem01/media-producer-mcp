# SPEC — The World: film-level visual continuity

*Status: specced (July 27). Motivated by frame-level analysis of the current
crop of viral "Opus 5 motion video" posts (single-file compositions): their
perceived quality edge over our tempo cuts is not per-scene craft — our gated
scenes hold up — it is CONTINUITY. One world persists across every beat;
content swaps inside it. Our films concatenate N independently-generated
scenes and read as a deck of posters: the backdrop resets at every cut, theme
temperature jumps, no element survives a scene boundary.*

## The claim

A film is not a sequence of scenes. It is **one world, visited by scenes**.
Today the only film-level visual commitments we make are the brand kit
(colors/fonts) and the Treatment's `visualStyle` — four sentences of *prose
advice* that each downstream stage is free to reinterpret. The world spec
upgrades that prose into a **typed, enforceable contract** authored once and
honored everywhere.

## The object

```ts
/** Authored ONCE per film by the creative director; carried by GrammarPrep;
 *  honored by storyboard, all three scene paths, and the assembler. */
export interface WorldSpec {
  /** The continuous backdrop system. ONE recipe for the whole film. */
  backdrop: {
    component: "mesh-gradient" | "webgl-backdrop" | "gradient-background";
    /** Single seed for the film. Scene assembly derives NOTHING per-scene. */
    seed: number;
    /** Palette anchors resolved against the brand kit (hexes, 2-4). */
    palette: string[];
    /** Film-level grain/texture treatment (subtle, applied by the renderer's
     *  existing film-polish pass -- not per scene). */
    grain?: "none" | "fine" | "editorial";
  };
  /** "light" | "dark". The film's home temperature. Scenes DO NOT choose
   *  their own theme; only chapter cards may flip it (below). */
  theme: "light" | "dark";
  /** Type system tokens (family/scale/weight attitude) all text-bearing
   *  components receive as CSS vars alongside brand vars. */
  type_scale: { display: string; body: string; mono?: string };
  /** Recurring motif tokens the storyboard may cast repeatedly (a pill
   *  style, a chip color, an accent asset) -- repetition reads as design. */
  motifs?: string[];
  /** Explicit permission slots for full-bleed theme-flip beats (the "ship"
   *  moment). Anything else rendering off-theme is a gate defect. */
  chapter_slots?: number;
}
```

## How it rides the existing pipeline (the fit)

The film-grammar system was built for exactly this class of film-level
commitment — the world is a **fourth prep output**, not a new pipeline:

1. **Creative director** already emits `visualStyle` (colorMood,
   spatialStrategy…). It now ALSO emits the `WorldSpec` — the typed version
   of the same decision, resolved against the brand kit (light brand → light
   world by default; the dark cinematic world becomes a *choice*, not the
   default).
2. **GrammarPrep** already carries mandate + timing spine + materials into
   the shared storyboard. It gains `world: WorldSpec`. (grammar-prep.ts —
   same shape as `music`/`beatMap`.)
3. **Storyboard builder** prompt changes from "decide a background strategy
   per scene" to "the world is GIVEN; scenes happen inside it." B-roll /
   hero_image beats remain available but are framed as *windows opened in
   the world*, and full-bleed theme flips must claim one of
   `world.chapter_slots` (the deliberate chapter-card beat).
4. **Scene paths** — all three already take assembly-time injections:
   - *Authored compositions*: the deterministic path currently injects
     `webgl-backdrop` with `seed: 5 + sceneIndex * 7`. That line is the
     poster-deck bug in miniature. It becomes `world.backdrop` verbatim.
   - *Templates (st-\*)*: already brand-token driven; they additionally
     receive world type/palette CSS vars.
   - *Codegen*: the spec builder injects the world block (backdrop is
     ALREADY IN THE PAGE; codegen styles content only, on-theme).
5. **Assembler** (both per-scene render and Studio composite): renders the
   backdrop with `film_time = scene_start + t` instead of scene-local time,
   so the backdrop's slow drift **continues across cuts**. Determinism is
   preserved — each scene's frames remain a pure function of (world.seed,
   film-time) — so per-scene capture, caching, and parallel scene workers
   all still work. This is the same trick the speaker clock already uses
   (`speakerSceneFilmStarts`).
6. **Gates**: brand-theme adherence currently checks scenes against the
   brand. It now checks against `world.theme` — an off-theme scene outside a
   chapter slot is a blocking defect, which converts today's light-brand
   dark-inversion failure mode from "gate catches it after codegen burns a
   revision" into "codegen never had a choice."

What does NOT fit today (net-new work): the continuous-clock backdrop offset
(small, assembler), the `mesh-gradient` light world family as a first-class
backdrop with seeded drift (new component work), and film-level performers
(below).

## The light default world

The flagship deliverable of P1: a **light mesh-gradient world family**
(2-4 brand-resolved anchor colors, soft radial drift, fine grain) as the
default tempo-cut world for light brands. Success criterion: a light-brand
tempo cut generated with a one-line prompt looks like it belongs on the
timeline next to the viral single-file demos — airy, warm, continuous.

## Film-level performers (P3)

A cursor (we already ship `cursor.js`) choreographed at FILM level: it
travels across scene boundaries, clicks the thing that causes the next beat,
and turns UI exhibits into a story. Same film-time-offset mechanism as the
backdrop. Out of P1 scope; specced here so the world object reserves a
`performers?` extension point.

## Component steals (P2 — independent of the world plumbing)

From the same frame analysis, five bounded components/upgrades:
1. `ghost-type` — oversized watermark word layered behind foreground content.
2. kinetic-text inline **pill-carousel** (cycling roles inside a headline).
3. `floating-pills` — faux-3D drifting data chips orbiting a hero stat.
4. `reasoning-stream` — monospace AI-thinking rails, dim→bright (deeply
   on-brand for Quotient films).
5. ui-mocks `fidelity: "focus"` — skeleton/blur everything except the focal
   region, so mocks direct the eye instead of competing with it.

## Beat density (P3, storyboard-only)

Tempo-cut grammar permits 1.2–1.5s micro-beats on the bar grid (current
practical floor ~2.2s). Half-bar cuts allowed for social films. No engine
change — the spine already quantizes; this is prompt + validation range.

## Phasing

- **P1 (the point):** WorldSpec type + creative-director emission +
  grammar-prep carry + storyboard constraint + backdrop continuity in both
  assemblers + light mesh world + gate check. One film-visible outcome:
  continuous world, light default.
- **P2:** the five component steals (each independently shippable).
- **P3:** film-level cursor performer; micro-beat density.

## Non-goals

- No per-scene world overrides (that is the bug this spec deletes).
- No new pipeline stage — the world rides prep, like music and the spine.
- No change to speaker-screencast assemble-mandate films (their world IS the
  recording).
