# SPEC.md — Visual-Quality Enforcement

Spec for the quality system that raises generated-video fidelity: **how scenes are
generated** (codegen rules) and **how weak scenes are caught** (critique enforcement),
plus the unified scene vocabulary. Companion to `UNIFIED-CODEGEN-SPEC.md` (the codegen
architecture) and `ARCHITECTURE.md` (data model). Implemented in PR #85.

## Levers

Perceived quality comes from three places, which fail differently:
1. **Visual craft** — codegen (`agentic-codegen.ts`). Biggest driver. Levers: the codegen
   system prompt, the component library, `design-skills.md`.
2. **Storytelling** — creative director + storyboard (already the strongest layer).
3. **Taste loop** — critique. How aggressively weak scenes are caught + regenerated.

This spec covers #1 (codegen rules) and #3 (enforcement).

## 1. Codegen NON-NEGOTIABLES

Top-priority block at the head of the codegen system prompt (`buildAgenticSystemPrompt`
in `agentic-codegen.ts`), so it isn't buried under the component-usage instructions. Five
rules, each targeting an observed failure mode:

1. **Legibility over mood — including surfaces.** Mood words ("muted", "desaturated",
   "the color of exhaustion") govern *saturation*, never contrast/visibility. Every
   card/window/panel must be a distinct value from the background (brand surface token or
   ≥~8% lightness shift) with a visible border (≥1.5px, mid-value) + real shadow. Text ≥4.5:1.
2. **Fill the whole frame — no dead zones.** Distribute content across the full canvas;
   no empty band > ~25% of height; fill ≥70%. Dense/overlapping/colliding briefs must
   actually overlap.
3. **Real content, never skeletons.** UI must contain believable specific content, not
   placeholder/wireframe bars.
4. **Render every element the visual notes name.** A named spark/cursor/glow/line/badge/
   transition must appear; you may not silently drop it.
5. **Make the emotion visible.** The Purpose's feeling must show in composition + motion.

## 2. Critique enforcement — two complementary halves

The per-scene critic sees the **final frame + a 6-frame contact sheet + the scene's
purpose/visual_notes**. Accept condition (`pipeline.ts`): `score >= 7 AND runtime.ok AND
no correctness defects`. `maxRevisions` default 2.

### 2a. LLM rubric (semantic) — `consolidated-critique.ts`

The active per-scene critic (`critiqueConsolidated`, called from `pipeline.ts`). Blocking
`defects[]`; `consolidatedCorrectness` sets `pass = defects.length === 0`, so any defect
blocks acceptance and its `detail` flows into the regen feedback. Defect taxonomy
(mirrors the NON-NEGOTIABLES; the semantic ones only the model can judge):

- `overlap`, `off_canvas`, `illegible`, `stray_ui`, `missing_asset`, `off_brand_theme`
- `invisible_surface` — ghost panel (fill ≈ background value, no border/shadow)
- `empty_skeleton` — placeholder/wireframe content
- `dropped_element` — a named element absent from **every** frame. **Transient** beats
  (flash, spark, field-line, crack, motion trail that dissolves) count as rendered if in
  **any** contact-sheet frame; absence from the final frame is correct, not a defect.
- `dead_frame` — sparse/flat frame or brief-demands-density-but-tidy
- `intent_mismatch` — stated emotion not visible **in the layout across frames**. Judged
  from composition, NOT apparent motion — a still can't show velocity, so never flag
  "looks static/frozen".

Guard: mood words never excuse invisible surfaces / illegible text / empty skeletons /
dropped elements / dead frames.

### 2b. Measurement gates (quantitative, deterministic)

Prompt rules land for qualitative moves but the model under-executes *quantitative*
constraints ("≥8% lightness", "no band >25%"). These MEASURE the constraint and block
with a specific number. Wired in `pipeline.ts` right after the critique; each emits
blocking correctness defects with the measured value in the detail.

- **`measureTextContrast`** (`text-contrast.ts`) — renders the frame with glyphs hidden,
  grid-samples the backdrop behind each text run, computes WCAG contrast (worst-case over
  the run). Blocks below 4.5:1 (3:1 large). Also flags text over video with no backing.
- **`measureLayout`** (`layout-metrics.ts`) — `layoutProbe` in `capture.ts` collects
  candidate surfaces (fill/border/shadow), content bounding boxes, and page bg. Emits:
  - `invisible_surface` — panel fill < **8%** lightness separation from page bg AND no
    visible border (≥1.5px, ≥6 lightness sep) AND no shadow. Reports measured %.
  - `dead_frame` — content coverage < **16%** of the canvas AND the top/bottom strips are
    a **flat** backdrop (worst-channel RGB std-dev < **8** in the empty strips). Per-COLOR-
    channel, sampled in the strips: a vibrant gradient is luminance-flat but hugely
    color-varied (a naive luminance metric misses it) and content in the center is
    excluded by sampling the strips. Only fires when EVERY probed moment is dead.

Calibration reference: empty CTA color-spread ~0–6 (flagged); vibrant-gradient CTA ~15–30
(passes). Tunables are named constants at the top of `layout-metrics.ts`.

Division of labor: measurement owns the quantifiable (contrast, surface separation, fill);
the LLM owns the semantic (dropped element, intent). Together they caught every failure
class we could produce on dark and light brands.

## 3. Scene vocabulary

One vocabulary end-to-end: **`purpose`** (what the scene communicates) + **`visual_notes`**
(how it looks/moves). `DraftScene` matches `StoryboardScene`. The word "brief" is retired at
the scene level; the assembled codegen bundle is "the spec" (`buildCodegenSpec`, `sceneSpec`,
`specText`). No back-compat fallback chains. A loud guard in `storyboard-builder.ts` warns
and falls back to `purpose`/`label` if the model returns no `visual_notes` — so visual
direction is never silently dropped. Saved `project.json` already stored `purpose`/
`visual_notes`, so no data migration.

## Validation done (PR #85)

- Typecheck + build clean; 109/114 unit tests (the 5 failures are the sandbox's missing
  Playwright browser, not the change).
- Live end-to-end generations on a **dark** and a **light** brand: storyboards carried
  `purpose`/`visual_notes`; gates fired and improved scenes (e.g. `Layout gate:
  [invisible_surface]` "panel fills at only 1.6% lightness separation, needs ≥8%").
- Gate calibration + transient-motion fix verified: a shatter scene that scored 7 with
  false `dropped_element`+`intent_mismatch` now scores 8 with none; a genuinely empty CTA
  still scores 3 and blocks.
