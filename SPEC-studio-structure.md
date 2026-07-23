# SPEC: Studio Structure — badges, inspector, scene focus mode

Studio today shows the film's *time* (lanes) but hides its *structure*: what a
scene is made of, where it came from, and when each piece enters. After the
scripted-surfaces work, the data IS the film — template slots, component data,
`data.script` performances, `enter.at` choreography — so Studio exposes it.

Three surfaces, one rule: **structure on the side, time on the bottom, and
film-wide lanes only for film-wide things.** Scene-local detail appears
contextually and disappears; the master timeline never grows permanent lanes.

## 1. Provenance badges (scene strip)

Every scene chip carries a glyph classifying how the scene was built:

| glyph | kind        | detection                                   | meaning for editing |
|-------|-------------|---------------------------------------------|---------------------|
| ▦     | template    | any component type starts with `st-`        | designer-built composition; edits are slot-data edits, instant + deterministic |
| ⬒     | composition | `authored_composition` flag, or all library component types | structured component scene (hand-built or storyboard-authored); edits are data edits |
| ✦     | custom      | any component type starts with `scene_`     | codegen HTML; edits go through the LLM revise patch |

Tooltip explains the kind. The badge quietly teaches the mental model:
▦ and ⬒ are the fast, safe scenes; ✦ is bespoke.

## 2. Inspector (right panel, collapsible)

Selection-driven panel showing the current scene's **cast**:

- One node per component: friendly label (type), z-order, provenance-aware.
- Node body renders `data` as a form:
  - primitives (string/number/boolean) → inputs;
  - `script` arrays → ordered action rows (`at` + action + text), editable;
  - other arrays/objects → JSON textarea (advanced).
- `enter`/`exit` render as effect + at + duration fields.
- Save → `PUT /api/component-data` (auth-guarded; body
  `{project_id, scene_id, component_id, data?, enter?, exit?, position?}`),
  server saves and the client reassembles the preview.
- Canvas click focuses the node; node hover outlines the element on canvas.
- Custom (codegen) scenes show one "Custom scene" node whose editor is the
  existing revise prompt; no fake form over freeform HTML.

## 3. Scene focus mode (the second clock)

The master timeline runs on the film clock; component choreography runs on the
scene clock. Double-clicking a scene chip (or the chip's ⤢) enters focus mode:

- The ruler rescales to `0..scene.duration_seconds`; film lanes hide.
- One row per component (z-order top-down):
  - a **bar** from `enter.at` (default 0) to `exit.at` (default scene end);
    dragging the left edge writes `enter.at`, right edge writes `exit.at`
    (creating a default `fade` enter/exit when absent);
  - **script actions as diamonds** on the bar at their `at` times; dragging a
    diamond rewrites `data.script[i].at`;
  - custom (codegen) scenes render one opaque full-width bar (their internals
    are freeform GSAP).
- **Beat gridlines**: vertical lines at cumulative `scene.beats` boundaries;
  drags snap to them (and to whole/half seconds) within a small threshold.
  In tempo-cut films beats are music bars, so snapping is beat-quantization.
- Exit via the same gesture / an explicit "← film" control; the film timeline
  returns untouched.

All writes go through the same `PUT /api/component-data` endpoint; every drag
is an ordinary data edit, so MCP/LLM edits and Studio edits stay one system.

## Schema note

`ComponentAnimation.at` already existed in the type and has always been
honored by the assembler's choreography script; the MCP `animationSchema` now
accepts it too (it used to strip it). No new runtime semantics were invented
for this spec — Studio surfaces what the engine already plays.

## Non-goals (for now)

- Keyframes. Components perform themselves; Studio nudges `at` times, effects
  and data — it never authors motion curves.
- Editing codegen scene internals structurally ("convert to composition" is a
  future direction, not part of this spec).
- Cross-scene component rows on the master timeline (that squish is exactly
  what focus mode exists to avoid).
