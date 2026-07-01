# AMENDMENTS.md — change & decision log

Running log of substantive changes and decisions, newest first. Pair with `SPEC.md`
(the design) and `CLAUDE.md` (how to work in the repo). Reference commits/PRs so a new
session can pick up mid-thread.

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
