# SPEC: canvas-tour — one sheet, a camera route, no cuts

Status: DESIGN — reviewed with Marc 2026-08-05, NOT implemented. Do not build
without resolving the open questions at the bottom. Prototype that validated
every mechanism: the Behind-the-Craft recreation (session scratchpad
`craft-proto/`, rendered as `craft-proto-v2.mp4`; reference film:
x.com/jakefromheygen/status/2084718040672076145 — "Behind the Craft",
letterpress paper world, macro camera, pen-written cursive).

## What it is

A new film grammar. A canvas-tour film is ONE continuous shot: every beat is
laid out spatially on a single oversized sheet, and the camera glides
park-to-park between them. Beats are *places*, transitions are *camera
transits*, pacing is *travel time*, and type is *performed* (pen-written,
typewritten) rather than slammed. There are no cuts anywhere in the film.

Rule of thumb vs. the other grammars: launch-film is one cinematic world
visited by scenes with cuts between them; canvas-tour is one *literal surface*
where the camera never cuts at all.

## Design principles (litigated during design review)

1. **Extend existing concepts; create none.** Every noun below already has a
   home in the codebase. A new concept requires its own design review first.
2. **No nesting.** The scene list stays flat. An earlier draft placed scenes
   inside a parent scene's canvas; that creates two kinds of scene membership
   and special-cases every scene-list consumer. Rejected.
3. **Single source of truth.** Stations are stored; the camera track is
   DERIVED. Nothing about the tour is persisted twice.

## Concept model

Four concepts. Three exist; the fourth is a field, not a type.

- **Viewport** — the fixed 1920x1080 output frame. Exists implicitly.
  Unchanged, stays unnamed in code.
- **Scene** — components + timeline + duration. Exists. Gains two OPTIONAL
  fields (below). Every existing scene is untouched (defaults preserve
  today's behavior exactly).
- **Camera** — `CameraMove[]` (`src/core/types.ts:200`) applied by the
  assembler on `__mp_camera_rig`. Exists; schema unchanged. ONE policy
  change: the pipeline may now emit camera moves (the "authored by direct
  manipulation in Studio -- never by prompt" doc comment becomes stale and
  must be updated when this ships).
- **Station** — a scene's address on the composite canvas plus how the camera
  frames it. Stored ON the scene. A station is not a container and not a new
  scene kind; per the beat lineage, it is launch-film's "beat inside a world"
  promoted to a real scene the system can see (critique, VO, Studio editing
  all apply per station for free).

### Data changes (complete list)

On `Scene` (both optional; absent = today's behavior):

```
canvas?: { w: number; h: number }   // surface size multiplier vs viewport;
                                    // default 1x1. Only meaningful on the
                                    // composite for v1 (see layout mode).
station?: {
  x: number; y: number;             // placement on the composite canvas
                                    // (percent of canvas -- the SAME
                                    // coordinate meaning CameraMove already
                                    // documents; canvas==frame today so the
                                    // meanings coincide for existing scenes)
  scale?: number;                   // content scale at placement (default 1)
  rotation?: number;                // resting tilt of the patch (default 0)
  framing?: {                       // where the camera parks; default =
    cx: number; cy: number;         //   "frame the whole patch"
    zoom: number; rotation?: number;
  };
  // dwell is NOT a new field: it is the scene's existing duration_seconds,
  // reinterpreted as parked time. Studio's duration editing (chip + filmstrip
  // edge drag) therefore edits dwell with zero new UI.
}
```

Nothing else is stored. No project-level camera field, no station list, no
parent scene.

## Assembly: a layout mode on the composite

The composite assembler (the thing that already turns the flat scene list
into one continuous playable timeline for Studio preview) gains a second
layout policy, selected by the grammar:

- **temporal** (today, unchanged): scenes succeed each other in time at the
  same position; transitions overlap cuts.
- **spatial** (new): scenes coexist on one oversized canvas at their
  stations; the film's clock is the sum of dwells + transit times; the camera
  visits stations in scene-list order (reorder API = reroute the tour).

The camera track is derived at assembly: `stations -> CameraMove[]`
(pure, deterministic, cacheable). Parks come from `station.framing`; transits
are synthesized between consecutive parks (ease + a slight tilt in flight).
A transit occupies the slot scene transitions occupy today — it IS the
transition type for this layout mode, not a new idea.

Scrub-safety (hard requirement, learned in the prototype): GSAP suppresses
callbacks on pause/seek, so the rig's transform must be derived state
re-applied after every seek — never callback-driven. The existing rig apply
path must be verified under Studio scrubbing and the frame renderer at this
zoom range before anything else is built.

Also to verify (existing machinery, new range): CameraMove behavior at 4-8x
macro zoom and rotation-in-transit. Existing moves are modest; the tour needs
precision framing at station arrival (being 40px off ruins a macro park).

## Render

The film renders as one continuous capture of the composite — no per-scene
stitch, no concat, no transitions (incidentally sidestepping the known
final-stitch frames-race). Parallel capture remains possible by splitting the
timeline by FRAME RANGES (deterministic seeks) rather than by scenes; decide
in implementation whether v1 needs it or single-pass capture is fast enough.

## Dependencies (separate builds, specced here only by reference)

- **Paper world**: `WorldSpec.surface = { texture, intensity, tone, ink }`.
  Intensity dial spans clean print (~0.15, the Lenny film) to letterpress
  (~0.85, Behind the Craft). Backed by a deterministic seeded+cached texture
  painter (photographic tooth via Veo macro photo -> ffmpeg high-pass
  `grainextract` -> feathered random-rotation stamps; NEVER grid/mirror
  tiling — butterfly artifacts). Ink channel = multiply + roughen filter via
  the template-theming path. Ships independently of the grammar (task #54
  pole included).
- **Performed-type components** (all grammars benefit; certify normally):
  `pen-write` (real script font + hand-traced fat mask stroke revealed by
  dashoffset + displacement roughening — NEVER draw letterforms directly;
  masks are authored against a debug grid), `typewriter`, `cli-line`,
  `fade-the-fluff` (word-level para diff).
- **generate_clip modes**: `texture` and `cutout` (prop stickers via
  colorkey+despill) saving to the brand kit as assets.

## Quality system

- Gates/critique sample at PARKED station framings, not random times:
  mid-transit frames (motion) and deliberate macro parks (90% empty paper)
  would false-fail dead-frame/coverage checks. The #44 camera-aware gates
  already read the rig; parked times are known from the derived track.
- Ghost-panel gate learns the world base tone: paper (#f4f1ea-class) vs
  white cards is ~4% lightness separation — cards on paper must carry
  credited edges (borders/shadows), and the gate must judge against the
  world tone, not assume near-white backgrounds.

## Studio

v1: the composite plays and scrubs as it already does (one long timeline);
dwell editing = existing duration editing; station position/framing editable
via the existing scene-level PATCH. Station markers on the scrubber and
drag-to-reposition on canvas are v2 niceties, not launch requirements.

## Known pre-existing debt this unlocks (NOT in scope)

Codegen-authored scenes bake whole-scene camera motion into HTML
(`mpCameraPush`, launch-film beat travel) — a second, opaque camera
representation that predates this work. Once the pipeline emits typed
`camera_moves`, launch-film's beat travel can migrate onto the same track
(leaving only micro-motion in scene code), ending with exactly one camera
representation. Own refactor, own task; do not smuggle into the grammar work.

## Open questions (resolve before implementation)

1. **Transit authorship** — fully derived from adjacent stations, or may the
   storyboard hint style (tilt amount, speed, "pass by X en route")? Leaning:
   derived for v1 with a per-film transit personality knob; per-transit hints
   only if films demand them.
2. **Dwell vs performance clock** — does a station's action timeline start at
   camera arrival, or pre-roll during transit-in (the settled-entrance
   pattern)? Leaning: start at arrival for v1; pre-roll is a polish pass.
3. **Audio mapping** — VO per station (per scene today) is the obvious
   mapping; verify ducking + beat_map behave over one long composite clock.
4. **Storyboard schema surface** — how stations are expressed in the
   storyboard prompt/JSON (positions chosen by the LLM vs a layout algorithm
   placing them on a spiral/grid with LLM adjustment). This is the real craft
   risk of the grammar: station LAYOUT quality, not machinery.
5. **Canvas bounds** — fixed 4x4 default vs storyboard-chosen; and whether
   the film's paper is painted at canvas size once (prototype answer: yes,
   seeded painter at canvas size, cached).
