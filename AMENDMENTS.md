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

## 2026-07-08 — Asset intelligence + screencast-frame + revise verification (PRs #216–#219)

Born from a live incident: presenting a screen recording inside a browser frame took an
hour of eyeballed percentages in Studio. Three capabilities close the gap:

- **A — Asset intelligence at ingest** (`core/asset-intel.ts`): sample frames across an
  uploaded video, classify rows/columns by temporal activity → per-edge trims (embedded
  window/browser chrome, letterbox), content box, light/dark theme. Sidecar
  `<file>.intel.json`; `POST /api/analyze-asset/{tenant}/{project}?name=` backfills.
  Facts flow to codegen specs (`SOURCE FOOTAGE FACTS`), the layout tool (`source_intel`
  + doubled-chrome warning), and `crop:"auto"`.
- **B — `screencast-frame` rebuilt** into a real browser-frame component: markup `<video>`
  (EDL/transport-safe), `frame_style` macos-browser|plain|none, frame = single clip shape,
  `crop:"auto"` resolved from the sidecar at assembly (both assemblers + tag rewrite),
  overscan math from intrinsic size, no self-fade. Codegen prompt + dropped-footage retry
  now route real footage here instead of hand-rolled div mocks.
- **D — revise verifies its own geometry**: diff the geometry-critical declarations a patch
  changed, boot the revised scene once, compare declared vs rendered; clamped values name
  the clamping rule (e.g. the `img,video{max-width:100%}` reset). `layout_warnings` in MCP
  + HTTP responses and the Studio status line. Runs even with `skip_gates`.

### Chrome-boundary accuracy (honest state)

Three refinement passes: interior-seam cut (#217), detail-drop split (#218), hairline
fine pass at native row resolution (#219). Synthetics land within ±4px across four
regimes (gradient chrome, chrome+static app header, detailed chrome, hairline divider).
On the real 99U Safari recording auto-detection reads **136px vs 108px ideal** (~14 CSS px
extra crop into blank app-header padding): that toolbar has no divider hairline and its
boundary step (Δ5 luma) is smaller than app-content steps below (Δ13) — no unsupervised
ordering rule picks it without breaking other cases. Judged acceptable: the trim is a
suggestion; components/agents/Studio can override with exact values.

### Open items

- Studio "crop source chrome" button = thin UI over the sidecar + `screencast-frame`.
- Generation wall-clock (~37 min for a 4-scene narration video) needs profiling
  (suspects: sequential per-scene codegen, huge scene files, critique regen loops).
- Revise fast-gates once passed a boot-crashing scene (defects:[]) — still unexplained.

## 2026-07-10 — Scene templates, atmosphere kit, match cuts (PRs #239–#246)

The composition strategy shift: **curated whole-scene templates** (the Figma-component
model — locked composition, data slots, detach later if needed) instead of asking
codegen to invent professional layouts from adjectives. Codegen remains the fallback
for footage/bespoke scenes; templates are the storyboard's FIRST choice.

- **Template library** (`src/components/scene-templates/`, category `scene-template`):
  `st-hero-stat` (count-up numeral, ghost echo, beat-phased tag walk; `theme:"dark"`),
  `st-kinetic-list` (full-width rows, ghost indices, spotlight walk), `st-quote`
  (dark contrast beat, `*emphasis*` words in secondary hue), `st-logo-close` (closing
  sting: logo bloom, pulsing gradient CTA, never self-fades).
- **Atmosphere kit** (`shared/atmosphere.js`, auto-loaded): `mpAtmosphere` (gradient base +
  drifting radial washes + animated film grain + vignette), `mpCameraPush`, `mpShimmer`,
  `mpGlow`, `mpGradientBorder`, `mpBlurFrom/To`, `mpBeatPhases` — one lighting language
  so every template feels lit by the same studio.
- **Storyboard selection → direct instantiation**: `DraftScene.scene_template`; prompt
  section "SCENE TEMPLATES (your FIRST choice)" with light/dark rhythm guidance;
  `generateScene()` instantiates st-* drafts directly (no codegen call, near-instant,
  no critique budget).
- **mpLogoOnDark** (#243): brand kits often ship only a light-theme wordmark — on dark
  templates it was invisible (Quotient: mean opaque-pixel luma 58.7). Templates measure
  the loaded logo via canvas and flip lightness keeping hue (invert + hue-rotate on a
  wrapper span, GSAP-tween-safe); glow rides the wrapper so it keeps brand color.
- **Match-cut transitions** (#244): new `match-cut` type = anchored punch-through (drive
  into A's exit anchor, land on B's entry anchor, one continuous move). Anchors are
  DECLARED in template schemas (`"match": {entry, exit}` normalized points — templates
  are fixed compositions, so no measurement pass needed); non-template scenes fall back
  to center. Prompt: default between consecutive template scenes, 0.5–0.7s.
- **Critique protection** (#245): template scenes skip per-scene critique/regen (a regen
  would CODEGEN a replacement, destroying the template) and are excluded from editorial
  `fix_scene` (no source to revise; regen fallback is a no-op that burns the budget).
- **Slot revise** (#246): Studio revise on a template scene edits slot DATA via one small
  LLM call (slot list + current data + instruction → updated JSON, with schema-echo and
  slot-def-scrub guards). Un-expressible asks (layout/size/motion) surface as a
  `layout_warnings` note instead of silently doing nothing.

### Also in this window (context)

- Generation wall-clock profiled and fixed (one-boot critique captures, trace
  concurrency, mode=full gate, footage re-attachment): 99U rebuild 21.0 min vs 23.4;
  remaining cost is LLM output time — template instantiation is the structural fix.
- Intent-based media edits shipped (pins/cuts/rate-regions first-class, solver derives
  segments; Studio pin/cut markers, HOLD blocks, custom rates, merge/restore).

### Open items

- Regenerate the 99U film end-to-end to exercise storyboard template selection +
  match cuts (Marc will review everything at once).
- Scene-preview PNG can render blank for scenes whose elements enter via timeline
  (render tool seeks dur/2) — root cause still open.
- Studio session-log shipper does not capture the scene IFRAME console, only the shell.
- Render final-stitch ffmpeg frames-race (pre-existing; verify in a real env).
- Revise fast-gates once passed a boot-crashing scene (defects:[]) — still unexplained.

---

## 2026-07-11 — Event-rate contract, template library ×11, callout authoring (PRs #274–#284)

The 99U prompt became the standing end-to-end contract test; each run's failures
became platform fixes the same night. The FILM DIRECTION report card went from
`4/4 templated | themes LLLD | float 0 | swarm 0` (clean but slideshowy) to
`3/4 | DLDc | swarm 1 | float 1 | slowest 4.3s/event` (launch-film grammar).

### Enforcement (the contract grows teeth)

- **Asset path recovery** (#274): storyboard LLM shortened a footage path → 404 → empty
  frame. `recoverAssetUrl` (basename search of the tenant asset tree, library preferred)
  at st-screencast instantiation + mapper slot snap-back to the scene's footage URL.
- **Invented callout geometry stripped** (#275): no LLM in the storyboard path sees
  frames, so mapper-returned callout rects ring arbitrary regions (blank canvas, in the
  live run). Dropped at assign time; Studio is where callouts are born (see below).
- **Event rate** (#276): a composition holding still >8s reads as a slide regardless of
  dressing. `enforceFilmDirection` counts per-scene visual events, warns loudly, and the
  report card gains `slowest N.Ns/event`. st-kinetic-list stretches CONTENT not holds
  (meta splits into phrase sub-beats with tick pulses when a takeover window runs long;
  item cap 6→8). Template mapper mines ~one item per narration sentence (34s scene went
  2 items → 6). Storyboard turn budget 8192→16000 (#277) after a kinetic-cut storyboard
  triple-truncated with zero scenes banked.
- **Type-on-photo rule** (#278): codegen NON-NEGOTIABLE #7 (never cards over a photo;
  scrim + type in the photo's world) + `card_on_photo` blocking critique defect.

### Template library (be greedy: templates for what recurs, codegen for the bespoke)

- **st-photo-close** (#279): the cinematic photo-world close as a locked template —
  baked scrim gradients guarantee type contrast on ANY image; kicker/headline/subline/
  interpunct items/logo. Mapper now offers hero-image scenes; instantiation fills
  `backdrop_image` from the enriched image. Kills the recurring codegen failure class
  (black frame, ink-on-sky, panels-on-photo — all three happened in one night).
- **st-swarm upgrades** (#278/#279): kind inference (numbers→stats, short lines→pills,
  quotes→quotes) + deterministic variants (solid brand pops, ghost outlines, oversized)
  + full TYPOGRAPHIC MODE (≥70% short items → props are bare flying type, no cards).
- **Four new templates** (#280): st-manifesto (kinetic type statement, *starred* accent
  slams), st-compare (old-way scraps vs calm column, loser collapses), st-flow (spark
  charges a rail, step takeovers), st-convergence (many→hub flare→clean fan-out).
  Library now 11; all themable, match-anchored, event-counted, boot-tested.

### Callout authoring in Studio (#281–#284)

One zoom gesture, two treatments: the draw-a-zoom crosshairs on a screencast now offer
"Zoom in (camera)" vs "Call out (lift)" — the callout IS the reverse zoom (region lifts
OUT toward the camera). Float stage defaults to callout. Fixes from Marc's live use:
wrapper detection by real structure (`.scf-stage` + `data-cid`, composite prefix
stripped) (#282/#283); callout pills + editor popover on the scrubber; clone EDL sync
(component re-copies `data-mp-edl` post-parse AND the preview transport ties derived
clips to their base clip's source-map — the clone was resurrecting removed segments);
true plane tilt (hold counter-rotation removed — it fought the orbit drift) (#284).
New scoped `PATCH /api/projects/.../components/:id` endpoint. `travel` field on
callouts = flight speed.

### Open items

- proj_d6f9dae6 is the current 99U reference film (type swarm / 6-item lock-in /
  float screencast / st-photo-close close). Not rendered to mp4 (Marc's call).
- st-photo-close scrim may read heavy on bright golden imagery — single gradient to tune.
- Scene durations can overshoot the narration length (~2s on the last scene); consider
  clamping the storyboard sum to the speaker-track duration.
- Callout region % is authored against the float plane's PROJECTED rect (approximation);
  fine-tune via the pill editor if a drawn region needs nudging.
- **BACKLOG -- WebGL screencast stage (the depth ceiling).** The float depth saga
  (PRs #288-#294) settled on the glassy-border pane -- Marc's pick -- after proving
  CSS-composited depth tops out there: painted edges vanish by contrast, 3D-face
  extrusions hide inside the silhouette at shallow tilt, panes read as stacked
  windows under camera zoom. The real next level is rendering the screencast INSIDE
  the three.js world: the video as a texture on a real slab mesh on a real glass
  plane, lit by the scene's lights -- true thickness, reflections, and parallax at
  any angle/zoom for free. Machinery half-exists (three.js runtime + deterministic
  state-tween pattern proven in webgl-backdrop); the hard problem is frame-exact
  video-texture sync in the capture pipeline (worker seeks video, texture must
  update per captured frame). Big build; big payoff.

## 2026-07-12 — Motion architecture + the silent kinetic-type explainer (PRs #297–#303)

The Quotient-in-Slack explainer became the forcing function for the biggest
architecture consolidation since beats. Three generations of the same film, each
failure turned into a deterministic rule:

- **Scripted-mock contract** (#297): slack-workspace/quotient-chat/chat-simulator/
  claude-chat-composer all had full `runScript` engines that no schema documented —
  codegen embedded them as static props and hand-animated over their DOM (double
  composers, header collisions). Schemas now document `script` + `cursor_targets` +
  action vocabularies; codegen rule "scripted components perform themselves";
  finish_scene validators for broken `<component data>` attrs and orphaned
  timeline code (`tl is not defined` after a premature `return tl;}` from
  append_script); storyboard truncation hardened (one add_scene per response,
  consecutive-only abort); `max_revisions` param on generate.
- **slack-workspace resilience** (#298, #301): no-script intro performs the thread
  (paced pops + typing bar) instead of a static screenshot; LLM alias keys
  normalized (author/time → name/timestamp — a missing name crashed the whole
  timeline into an EMPTY channel); declarative shorthand compiled to script
  (`composer_text`, `typing_indicator`, `bot_reply`) — three generations proved
  storyboards write intent keys, never action arrays.
- **SPEC-motion-architecture.md + v1 implementation** (#299, #300): four layers
  with single ownership; ONE stage camera with semantic anchors
  (`CameraMove.anchor` = "component.anchorName", resolved at tween start with
  transform compensation — frames a moving/posed component where drawn rects go
  stale; type-qualified matching in #301); pose/enter/exit as first-class wrapper
  fields in both assemblers; component tiers (performable-surface/animated-prop/
  static-prop); template pass-through rule; script-runner camera actions
  deprecated (rotate-3d reclassified as pose); ui-chat-thread deprecated;
  storyboard may author ANCHORED camera moves (sanitized, max 4). Backdrops
  stamped `data-mp-backdrop` and excluded from the camera rig — the camera moves
  the subject, not the world (#301, Marc's catch).
- **Brand voice** (#302, #303): st-artifact claims default to the BRAND display
  font (`voice:'serif'` opts into the borrowed HyperFrames editorial look);
  logo.dev URL baking mirrored into the direct-component path (hand-authored
  logo components rendered invisibly).
- **The film** (proj_2ad23344, silent by design): logo-lockup manifesto intro →
  two claim scenes over the performing slack-workspace (camera riding the typing
  via anchors) → pure kinetic-text takeover (st-manifesto) → scripted thread
  demonstration → settings-toggle close. Marc: "looks like a real hype video."

### Open items (added)

- **Slack simulator fidelity upgrade** (Marc): the slack-workspace mock is good
  enough to star but reads slightly simplified up close — richer message
  rendering (link unfurls in flight, hover states, attachments, member chips),
  smoother thread-panel open, real scroll physics. Worth a dedicated pass now
  that it is the workhorse surface of product films.
- Lane-timing coordination: storyboard-authored camera moves vs the shorthand
  compiler's typing window are aligned by hand today (observed: a zoom landing on
  an already-cleared composer). Consider auto-snapping composer-anchored zooms to
  the compiled type-message window at assembly.

## 2026-07-12 (later) — Slack simulator fidelity, from Marc's real screenshots

Marc supplied two rounds of real Slack screenshots ("I can send you screenshots
of what it really looks like and you can upgrade it").

- **Round 1 — DM views** (#305): modern left rail (64px #350D36: workspace tile,
  Home/DMs/Activity/Later/More with labels, +, self avatar w/ presence) beside
  the 236px #4A154B conversation column; "Find a conversation..." search;
  sentence-case section headers; **Agents & apps** section (icon squares, badge
  pills, active = white pill w/ #611f69 badge); app-notification message grammar
  (bold `title` line + body + blue `link_text` action link); composer rebuilt to
  the real layout — formatting bar ABOVE the field, action row below, green
  #007a5a send + chevron.
- **Round 2 — channel views + script actions** (#306): **rich Quotient unfurl
  card** ("Quotient ▾" over a white bordered card: app icon, bold title,
  "Campaign in Quotient", Start/End/Owner field chips w/ avatar, "As of ..."
  footer) — from `messages[].unfurl` AND as a script action (`unfurl`) so the
  card animates in mid-story ("unfurled items in the script to show the real
  thing"); **`thinking` script action** (bot block with pulsing "Thinking..."
  dots; next bot-message auto-replaces it; `bot_thinking` shorthand); channel
  tabs row; huddle split button; blue @Name / gold @channel mention pills;
  image-attachment block (filename + chevron + rounded image); date divider
  pills; `hover-message` floating action toolbar; thread "Also send to
  #channel" row. Contract untouched: 3 camera anchors, message_index
  addressing, shorthand compiler all verified by DOM probe.

The round-1 open item ("Slack simulator fidelity upgrade") is DONE.
