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

## Generation performance — the ~20-min problem (timing deep dive)

A multi-scene generate ran ~22 min; after the work below the best measured run is
**~17 min**. The **root cause is that generation is OUTPUT-BOUND**: per-call token
instrumentation (`MP_LLM_TIMING`) showed the codegen emits **4–6k output tokens per
scene at ~80 tok/s ≈ 50–70s**, and that cost recurs on every retry and editorial
regen. Input size barely affects latency (a 42k-token planner call took the same
~35s as a 9.6k-token call). On a 4-core box the headless-Chrome captures are also
CPU-bound. Render itself is fine (~2 min).

### ✅ Shipped
- **Browser pooling** — reuse one headless Chrome instead of cold-launching per
  capture (~seconds → ~100ms/capture). PR #10.
- **Consolidated per-scene critique** — 3 vision calls → 1 (functional+premium+
  correctness in one call); deleted the old 3-pass path. ~2× at the call level +
  more thorough. PR #11.
- **Editorial: drop the wasted post-regen re-score** — it re-rendered every frame +
  made a second big vision call only to `console.log` a score nothing used.
  ~80–150s back on the slowest runs, zero quality impact. PR #12.
- **Surgical SEARCH/REPLACE patching in the critique loop** — a retry patches the
  existing scene HTML with minimal blocks instead of re-emitting the whole ~6k-token
  scene. Benchmarked **~16× faster** on a local fix (84 output tokens vs 5,935;
  3.8s vs 61.7s). Covers score-driven "premium feel" retries + local visual defects;
  `off_brand_theme`/structural defects/runtime errors route to a full regen; an
  improvement-guard escalates to regen if a patch doesn't raise the score. PR #13.
- **Configurable scene concurrency** (`MP_SCENE_CONCURRENCY`) — pays off on more
  cores; on a 4-core box raising it oversubscribes CPU and is slower. PR #8/#10.
- **Per-scene progress + ETA** so the long wait is communicative. PR #10.
- **`MP_LLM_TIMING`** diagnostic (per-call in/out tokens + duration). PR #13.

### ❌ Investigated and ruled OUT (don't chase these)
- **Compact/trimmed planner catalog** — input size doesn't drive latency, so it's a
  *cost* win, not speed; and the planner uses the field info to brief well.
- **Cap codegen `max_tokens`** — scenes stop naturally at 4–6k (`stop=tool_use`, never
  hitting the 16k ceiling), so a cap can't speed the typical scene — it only
  truncates (breaks) the rare large one.
- **Lower the retry cap** — retries are already capped (2); the cost is legitimate
  work, not a runaway.
- **A planner search/lookup tool** — would add per-lookup round-trips (~10s each) →
  slower, not faster.

### Remaining levers (tradeoffs / infra)
- **🅳 `quality: "preview"` mode** — skip/lighten the **editorial pass** (still the
  single biggest block at ~160–220s) for previews; keep it for production. Biggest
  remaining cut; small quality tradeoff.
- **Downscale the storyboard image** before the editorial vision call (quality-neutral).
- **Reuse per-scene frames** in editorial instead of re-rendering them.
- **Per-scene render cache** — re-render skips unchanged scenes (fast iteration re-renders).
- **More CPU cores** — the only quality-neutral way to make concurrency help.
- **Fewer/shorter scenes** — bounded quality tradeoff.

### The honest floor
Generation is fundamentally **output-bound**: when scenes genuinely need a full regen,
and for the editorial pass, you're paying real token-generation time at ~80 tok/s.
Cracking ~17 → ~10 min needs the **tradeoff** levers above (preview mode, fewer
scenes) or **more compute** — not another free win.

### Iteration story (confirmed good — keep it)
Follow-on edits are NOT 20 min: plan edits (add/remove/reorder scene) are instant;
a single-scene revision regenerates only that scene and **skips the editorial pass**
(~1–3 min). Don't regress this.

## Explicitly NOT chasing (stay in our lane)
- **Avatars / talking-head presenters** — HeyGen's core business, not our fight.
- **A full timeline NLE** — that's Palmier; our bet is generation + autonomous quality.

## Known loose ends (pre-existing)
- Edge-seam class fix (paint root/body with the scene bg so any revealed sliver is invisible).
- Correctness gate on bookend (intro/outro) scenes — bookends ignore the aesthetic
  score and gate only on hard defects, so rough-but-not-"defective" bookends ship.
- Delete the dead `template` field on `PlannedScene`.

## Backlog — open follow-ups (b-roll / legibility / theme work)
- **Codegen first-pass layout quality (overlap / off-canvas clipping).** The
  critique *catches* overlap/clipping/missing-element and regenerates, but that's
  the bulk of the retry cost. Improving first-pass layout (safe areas, no text on
  the subject, no edge clipping) is the biggest lever on both quality and latency.
- **Chrome-component theme sweep** — `browser-frame`, `device-mockup` still use
  dark-theme literals. Need care (chrome vs brand surface) vs. the content
  components already swept. Lower frequency.
- **Verify cta-card button with a `var()` button_color.** The JS no-fill bug
  (appending an alpha hex to a `var()`) is fixed, but the last verify run used a
  hex color, so the `var()` path hasn't been seen end-to-end on a render.
- **Confirm `missing_asset` isn't a false positive on animated-out elements.** The
  vision critique judges a late frame; an element that legitimately animates out
  before then can be wrongly flagged "missing".
- **Generation latency (~12 min) is output-bound** — see "Generation performance"
  above; preview quality only speeds the render half, not generation.
