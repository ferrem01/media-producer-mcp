# QUALITY-ROADMAP.md — from "good scenes" to "great films"

The goal: **prompt → Framer/Linear/Stripe-class product film**, plus best-in-market
product demos (screencast, PiP, how-to) — with zero video expertise required.

This document is the result of a full-codebase audit (LLM/creative layer, render/
assembly/audio layer, demo/ingest layer). It records the diagnosis, the target
architecture, and a prioritized backlog. Update it as pillars land.

---

## The one-sentence diagnosis

**This is a world-class scene machine with no film machine.** Every scene is an
isolated, well-crafted unit; cinema happens *between* the units — rhythm, continuity,
grade, camera — and that layer mostly doesn't exist yet.

Calibration on the goal: Framer/Linear/Stripe launch films are motion graphics +
product cinematography — fully reachable on this renderer (the `glass-slab` component
proved the ceiling). Apple *launch films* are physical cameras and actors; the
reachable Apple target is keynote-style feature graphics, not film footage.

## What the audit found (with pointers)

**Strengths (keep, build on):**
- Deterministic seek-based capture (`scene-worker.ts`, `capture.ts`) — Remotion-class
  infrastructure; the foundation everything else depends on.
- The prompt bibles (`src/llm/design-skills.md`, `visual-storytelling-guide.md`) —
  genuinely specific, opinionated, numeric within-scene craft.
- Per-scene critique: vision judge + **deterministic pixel gates** (contrast
  measurement, ghost panels, dead frames, runtime validation) — rare and valuable.
- Speaker-track pipeline (`speaker-track.ts`) — the strongest demo capability.
- Brand extraction + asset harvesting with vision captions.

**Structural gaps (the film layer):**
1. **Scenes are blind to each other.** Codegen never sees sibling scenes; the
   treatment's "through-line" is prose, never enforced or measured. Match cuts are
   architecturally impossible: all transitions animate two frozen PNGs
   (`transitions.ts`, `render.ts` segment interleave).
2. **No rhythm.** Zero BPM/onset analysis. Music is selected *last* by keyword-matching
   the prompt (`pipeline.ts` mood block), looped to fit. Cuts never land on beats.
   Scene durations come from a words-per-minute heuristic.
3. **Freeform codegen has a taste ceiling.** Generating scenes from scratch against
   rules converges to rules-compliant generic. The best output ever produced
   (glass-slab) was *crafted once and reused* — not generated.
4. **No film-level finishing.** ~~No global grade~~ (fixed: `film_grade`), camera drift
   resets per scene, editorial critique never checks motif persistence or continuity.
5. **Demo/ingest is synthetic-only.** Scripted cursor/camera over mockups is good, but
   real recordings get no click detection, no auto-zoom, no transcription, no
   trim/speed/crop (except speaker track). Playwright `recordVideo` is unused.
6. **Iteration is expensive.** Single quality tier (CRF 18 full-res), no render cache.
   Preview mode only drops fps.

---

## The five pillars (priority order)

### Pillar 1 — Music-first timeline (rhythm) `P0`
Pick the track **before** storyboarding. Rhythm is the #1 perceived-quality signal.
- [x] Beat-map selected tracks: dependency-free analyzer (`src/audio/beat-map.ts`,
      ffmpeg PCM → onset envelope → autocorrelation tempo with octave correction →
      joint tempo+phase grid fit → downbeat rotation). Cached per track. Validated
      on synthetic click tracks: BPM within 0.05, downbeats within ~30ms.
- [x] Music-first pipeline order: track selected + beat-mapped after the creative
      director, BEFORE the storyboard; beat grid injected into the storyboard
      prompt ("author durations in whole bars").
- [x] Quantize cuts to downbeats: each (transition_in + scene) segment snapped to
      whole bars (`quantizeScenesToBars`), track head-trimmed so beat 1 = video
      t=0 (`trim_start` on the bgm track), VO extensions round up to the next bar.
- [ ] Anchor each scene's Build→Breathe→Resolve phases to beats (pass beat offsets
      in `ctx` so component timelines can sync — `project.audio.beat_map` is
      already stored for this).
- [x] Fix ducking: auto-pipeline wrote a config shape render never read
      (`pipeline.ts` vs `render.ts`); ducking now covers **every** VO clip window,
      not just the first (`mixer.ts` multi-trigger enable expression).

### Pillar 2 — The film layer (continuity) `P0`
- [x] **Global film grade**: one consistent color pass (soft S-curve + saturation +
      fine grain) over the final concat (`encode.ts applyFilmGrade`,
      `project.film_grade`, default "cinematic" for generated videos).
- [x] **Motif discipline**: exactly ONE caption style per film — prompt rule in
      `storyboard-builder.ts` + deterministic `unifyCaptionStyle()` in `pipeline.ts`.
      Extend next to: one accent behavior, one background strategy family.
- [ ] **Shared-element transitions (cheap match cut)**: both endpoint states of a
      component are deterministic, so a transition segment can animate the *actual
      component* (e.g. glass-slab) from scene A's rest pose to scene B's opening
      pose, swapping content mid-move. Prototype with glass-slab.
- [ ] **A `Look` object**: treatment emits {typeTreatment, captionStyle, motif,
      accentBehavior, gradePreset} as *data*; editorial critique validates against it.
- [ ] **Sequences** (the real fix): render groups of beats as ONE HTML document with
      a persistent world + continuous camera; hard cuts only between sequences.
      (`composite-assembler.ts` already proves multi-scene documents work.)
- [ ] Film-level camera plan: continuous drift/push direction across a sequence
      instead of per-scene seeded resets (`scene-assembler.ts` camera block).

### Pillar 3 — Golden library + adapt-don't-generate (taste) `P1`
- [ ] Curate 20–50 exemplar scenes at glass-slab polish, parameterized by schema.
      The storyboard *casts and parameterizes* exemplars; freeform codegen only
      fills gaps.
- [ ] Promotion path: codegen output that passes critique with a high score gets
      saved as a reusable exemplar (library compounds with use).
- [ ] Reference-film corpus: annotated shot-by-shot breakdowns of Framer/Linear/
      Stripe films (timing tables, motion grammar, structure) retrieved into the
      creative director — it currently has rules but has never "seen" a great film.

### Pillar 4 — The demo wedge (market) `P1`
Nobody does end-to-end **agent-operated product filming**. We already have Playwright.
- [ ] Self-recording: drive a live product with Playwright `recordVideo` + instrumented
      event log (clicks/inputs/navigation are *known events* — no CV needed).
      "URL + task in → polished walkthrough out."
- [ ] Auto zoom/pan on activity: camera.js-style moves keyed by the event log
      (Screen-Studio polish, but deterministic).
- [ ] Whisper transcription for ingested recordings → word-timed captions (.srt/
      karaoke), chapter detection, auto-structured how-to storyboards.
- [ ] Clip primitives on ANY video component: trim / speed / crop (today only the
      speaker track can trim).

### Pillar 5 — Iteration economics `P2`
- [ ] Preview tier upgrade: deviceScaleFactor 0.5 capture (quarter pixels) + faster
      encode preset, alongside the existing fps drop. (Film grade already skipped
      in preview.)
- [ ] Per-scene render cache: hash(scene JSON + component sources + canvas) → skip
      unchanged scenes on re-render.
- [ ] Film-level eval harness: pacing-curve check, motif-persistence check,
      golden-frame regression diffs.

### Pillar 6 — Pipeline model upgrades (quality dial, orthogonal to everything) `P0`
The pipeline's own LLMs are a direct quality lever, independent of all the pillars
above. Current wiring (`src/config.ts`):

| Stage | Env var | Current default | Recommendation |
|-------|---------|-----------------|----------------|
| Creative director + storyboard + codegen | `MP_LLM_MODEL` | `claude-sonnet-4-6` | `claude-sonnet-5` now; consider `claude-opus-4-8` for the director |
| Per-scene critique (vision judge) | `MP_CRITIQUE_MODEL` | `claude-haiku-4-5` | keep (cheap + gates are deterministic anyway) |
| Asset captioning | `MP_CAPTION_MODEL` | `claude-haiku-4-5-20251001` | keep |

- [ ] Set `MP_LLM_MODEL=claude-sonnet-5` on the deployed server (zero-code upgrade).
- [ ] **Per-stage model config**: one `MP_LLM_MODEL` for director/storyboard/codegen is
      too coarse. The creative director runs ~1 call per video and sets the ceiling for
      everything downstream — it deserves the strongest model (`MP_DIRECTOR_MODEL`);
      codegen runs N scenes × iterations and can stay a tier down (`MP_CODEGEN_MODEL`).
- [ ] Re-run the quality eval set after each model bump — model upgrades sometimes
      shift prompt-adherence in ways the bibles were tuned around.

### Hygiene / correctness backlog
- [x] Ducking schema bug (silently dead in auto pipeline) — fixed.
- [ ] Whole-video revision (`runVideoRevisionPipeline`) rebuilds the storyboard from
      scratch and **drops the treatment** → revisions drift. Make revision a diff:
      approved fields immutable unless explicitly reopened; re-attach treatment.
- [ ] Speaker-track path bypasses the film grade (grades only the standard
      renderVideo path today).

---

## Sequencing

| Phase | Contents | Outcome |
|-------|----------|---------|
| Now (this PR) | ducking fix, film grade, motif discipline, roadmap | films stop having amateur tells |
| Next | beat-mapped music-first timeline; shared-element glass transition | rhythm + first real match cut |
| Then | Look object + revision-as-diff; golden library program | consistent, compounding taste |
| Then | sequences (persistent world/camera); demo wedge (self-recording + Whisper) | continuity + the market moat |
| Ongoing | preview tier, render cache, film-level evals, reference corpus | speed + regression safety |
