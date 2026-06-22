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
- **Status:** in progress.

### 2. Curated motion / animation preset library  *(from HyperFrames — fixes our #1 weakness)*
The codegen *invents* motion each scene → variance (UC1 mess, inconsistent quality).
A vetted library of named, high-quality **motion/transition presets** the codegen
**composes from** (instead of improvising) raises consistency + cinematic quality at
the source, and reduces how often the correctness gate has to catch failures.

### 3. Re-runnable generation assets  *(from Palmier)*
Store every generated asset (hero image, b-roll, logo, scene) with its **prompt +
model + seed + references** so it's **re-runnable / tweakable in place** —
"regenerate just this image with a tweak" without rebuilding the whole video.

---

## Second tier — widen the moat
4. **Deepen the autonomous quality loop:** de-duplicating keyframe-snapped storyboard
   sampler for editorial (Palmier); run the correctness gate on **bookend** scenes;
   on-demand "inspect scene at time T" so the critique can zoom (Palmier two-tier perception).
5. **Approve-before-render checkpoint** (HyperFrames step 4): an explicit plan/storyboard
   approval gate (we already have the preview + plan editing).
6. **Export the composition as editable, standalone HTML the user owns** (HyperFrames'
   "code you own" model) — bridges the ownership/transparency gap for power users.

## Explicitly NOT chasing (stay in our lane)
- **Avatars / talking-head presenters** — HeyGen's core business, not our fight.
- **A full timeline NLE** — that's Palmier; our bet is generation + autonomous quality.

## Known loose ends (pre-existing)
- Edge-seam class fix (paint root/body with the scene bg so any revealed sliver is invisible).
- Correctness gate on bookend (intro/outro) scenes.
- Delete the dead `template` field on `PlannedScene`.
