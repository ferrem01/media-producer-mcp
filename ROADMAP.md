# Media Producer — Roadmap

Synthesized from a competitive analysis of **HyperFrames** (HeyGen — our closest
comparable: programmatic HTML/GSAP launch videos authored in the agent) and
**Palmier** (YC — an agent-operated timeline NLE), benchmarked against our
strengths.

## Our durable differentiator (keep compounding)
Both competitors are **human-in-the-loop** (HyperFrames: review frames in Studio;
Palmier: edit the timeline). Our moat is **"on-brand, correct video from a prompt
— no frame-by-frame review,"** powered by the vision-in-the-loop quality system:
- per-scene **correctness gate** (catches broken/overlapping/off-brand scenes, regenerates),
- **plan-fidelity editorial** pass (did each scene deliver the plan?),
- **brand-theme adherence** (light brands render light), brand extraction, logo.dev,
  and a data-bound component library.

---

## Top 3 (do next)

### 1. `website-to-video` one-shot  *(from HyperFrames — highest leverage, lowest effort)*
One tool/skill: a **URL in → an on-brand rendered launch video out**. We already
have every piece (`extract_brand_from_website` → `generate` → `render`); this is
orchestration. It's the biggest ease-of-entry win and plays to our brand-extraction
+ brand-theme strengths (HyperFrames' `frame.md` is manual asset-gathering).
- **Status:** ✅ done — `website_to_video` tool (`src/server.ts`): one async job that
  extracts+stores the brand kit, generates scenes on it, and renders. Returns a job_id.

### 2. Curated motion / animation preset library  *(from HyperFrames — fixes our #1 weakness)*
The codegen *invents* motion each scene → variance (UC1 mess, inconsistent quality).
A vetted library of named, high-quality **motion/transition presets** the codegen
**composes from** (instead of improvising) raises consistency + cinematic quality at
the source, and reduces how often the correctness gate has to catch failures.
- **Status:** ✅ done — but **reframed**. The "motion preset prose" was reverted
  (redundant with `design-skills.md`). The real fix was an **auto-wire fix** (the
  codegen embedded blocks but left their timelines unwired, so ambient motion died),
  a **planner underuse fix** (prefer the catalog; intent→category routing; library
  usage went 79%→100% of scenes), and a big **catalog expansion 67→125 blocks**
  (social, maps, Apple Liquid Glass, CSS-3D, captions, code, FX, flowchart,
  +transitions) — each verified by a vision **quality audit** that caught + fixed
  real defects. PR #6/#7.

### 3. Re-runnable generation assets  *(from Palmier)*
Store every generated asset (hero image, b-roll, logo, scene) with its **prompt +
model + seed + references** so it's **re-runnable / tweakable in place** —
"regenerate just this image with a tweak" without rebuilding the whole video.
- **Status:** ✅ done — `Asset` now carries prompt/model/size/quality/version;
  `regenerate_asset` tool re-runs one image in place (prompt tweak or size/quality
  override), versions the file, and re-wires the scene that uses it.
  (`seed` is N/A for gpt-image-1; stored the full param set instead.)

---

## Second tier — widen the moat
4. **Deepen the autonomous quality loop:** de-duplicating keyframe-snapped storyboard
   sampler for editorial (Palmier); ✅ run the correctness gate on **bookend** scenes (done);
   on-demand "inspect scene at time T" so the critique can zoom (Palmier two-tier perception).
5. **Approve-before-render checkpoint** (HyperFrames step 4): an explicit plan/storyboard
   approval gate (we already have the preview + plan editing).
6. **Export the composition as editable, standalone HTML the user owns** (HyperFrames'
   "code you own" model) — bridges the ownership/transparency gap for power users.

---

## Generation performance — the ~20-min problem (from the timing deep dive)

A multi-scene generate runs ~15–24 min. Traces show the cost is **call volume ×
serialization on a CPU-bound (4-core) box**, NOT one heavy call. Per video:
planner + concept-director, then per scene a codegen (Sonnet ~15–30s) + critique
+ any retries (each retry = another full codegen+capture+critique), then the
**editorial pass**. Render itself is fine (~2 min).

### ✅ Shipped
- **Browser pooling** — reuse one headless Chrome instead of cold-launching per
  capture (~seconds → ~100ms/capture). PR #10.
- **Consolidated per-scene critique** — 3 vision calls → 1 (functional+premium+
  correctness in one call). ~2× at the call level + more thorough; deleted the old
  3-pass path. PR #11. *(Real but small at the whole-generation level — swamped by variance.)*
- **Configurable scene concurrency** (`MP_SCENE_CONCURRENCY`) — pays off on more
  cores; on a 4-core box raising it oversubscribes CPU and is slower. PR #8/#10.
- **Per-scene progress + ETA** so the long wait is communicative. PR #10.

### 🔬 Editorial pass deep-dive findings (biggest single chunk: 160–300s, ~20% of a run)
`runEditorial()` = render every scene's frame → tile a storyboard → ONE big-image
vision call → regenerate up to 2 flagged scenes → **then run the whole pass AGAIN
to "re-score."**
- **🅰 FREE WIN — the re-score is pure waste:** after regen it re-renders all frames
  + makes a second large vision call, and the result is **only `console.log`'d**
  (never used for a decision). Removing it saves ~80–150s on exactly the slowest
  runs (the ones that regenerate a scene), zero quality impact. *Do this first.*
- **🅱 Downscale the storyboard image** before the vision call — latency scales with
  image size; the tiled N-frame storyboard is large. Quality-neutral.
- **🅲 Reuse per-scene frames** already captured in the per-scene loop instead of
  re-rendering them for the storyboard.
- **🅳 `quality: "preview"` mode** that skips/lightens the editorial pass (keep it for
  production). Biggest cut for the iteration loop; small quality tradeoff.
- **🅴 Cap editorial regen 2 → 1** (fewer codegen regens).

### Other timing levers (tradeoffs / infra)
- **Per-scene render cache** — re-rendering re-renders ALL scenes; a content-hash
  cache would make iteration *re-renders* near-instant (skip unchanged scenes).
- **More CPU cores** — the only quality-neutral way to make concurrency help.
- **Cap per-scene retries** / **fewer scenes** — bounded quality tradeoffs.

### Iteration story (confirmed good — keep it)
Follow-on edits are NOT 20 min: plan edits (add/remove/reorder scene) are instant;
a single-scene revision regenerates only that scene and **skips the editorial pass**
(~1–3 min). Don't regress this.

## Explicitly NOT chasing (stay in our lane)
- **Avatars / talking-head presenters** — HeyGen's core business, not our fight.
- **A full timeline NLE** — that's Palmier; our bet is generation + autonomous quality.

## Known loose ends (pre-existing)
- Edge-seam class fix (paint root/body with the scene bg so any revealed sliver is invisible).
- Correctness gate on bookend (intro/outro) scenes.
- Delete the dead `template` field on `PlannedScene`.
