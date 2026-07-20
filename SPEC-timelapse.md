# SPEC: Timelapse — the wait as a deliberate beat

Status: SHIPPED (2026-07-20, PRs #458–#463). Acceptance film: proj_c55cfce5
(Marc's "AI takes forever" experiment — 5+ min recording, most of it waiting).

## The problem

Screen recordings of AI-assisted work are mostly *waiting*. The raw material
for a 90-second film is 5 minutes of footage where 3 of those minutes are a
progress spinner. Speeding the wait up as continuous video fails twice:

- Past ~8× it reads as an ugly smear — motion blur soup, nothing legible.
- Past 16× browsers/codecs can't honestly play it at all, so 16× is the hard
  cap for continuous playback — and a pin that needs more than 16× simply
  cannot land ("lands 8.1s off").

Real editors don't fast-forward through a wait; they cut a **timelapse**: a
deliberate beat that says "time passed here" and lands you on the other side.

## The effect

A timelapse is a **segment type** in the screen lane — NOT an effect-lane
overlay. It maps 1:1 onto a span of footage, exactly like every other rate
block (this was litigated: a first version drew it in the effects lane, and
two lanes showing one truth read as noise).

Three parts make it honest storytelling instead of a fast-forward:

1. **Sampled playback.** Above 8×, the beat plays as a flipbook: each sampled
   frame holds ~0.45s of output (`mapSourceTime` quantization). The viewer
   sees discrete states of progress, not a blur. Below 8× it plays smooth.
   The final 0.45s step parks on the **landing frame** — the exact frame
   playback continues from — so the beat settles instead of jumping.
2. **The elapsed clock.** A pill overlay ("⏱ +2:47 · ⏩18×") counts the real
   time flying by, ticking on the same 0.45s quantum as the frames. Emitted
   by `timelapseClockScript` as a zero-ease proxy tween on the scene
   timeline, so capture seeks and Studio preview render it identically.
3. **The beat owns its film time.** `out_seconds` is EXACT — a fixed-duration
   constraint, cap-exempt, excluded from pin-window flexing. When the beat
   needs more film time than the talk track provides, `applyTimelapse`
   splices a matching **silence gap** into the speaker EDL
   (`clip.edl.gaps`, funded via `cutAudioToWithGaps`), ripples pins,
   captions, chapters, spine, and booth cues, and freezes the camera bubble
   for the beat. Removing the beat refunds the gap. Nothing else moves.

## Policy: suggest when it's ugly, auto when it's impossible

- **8–16× continuous footage** → a dashed **⏩?** tag rides the segment in
  the screen lane. Click → popover → "Make it a timelapse". The user decides.
- **A pin strained past 16×** → `autoTimelapseForStrain` fires server-side,
  because there is no honest manual state to leave the user in. Auto must be
  **loud** (Studio toast), **visible** (striped ⏩ block in the screen lane),
  and **reversible** (same popover resizes or removes it).
- 16× stays the continuous-video cap. Deliberate timelapses are the only way
  past it.

## Sizing: the pin window is the truth

The beat's duration comes from the window the user's pins already define,
never from a heuristic alone:

- `window = nextPin.out − prevPin.out`. If `window ≥ 3s`, the beat fills it
  **edge-to-edge** — span runs `prevPin.src → nextPin.src`, out = window —
  so the striped block ends exactly at the pin, no gap funded, no film
  growth (the user already paid for that time with speech).
- Only a too-small window falls back to the funded default: ~1s of film per
  30s of waiting, clamped 3–8s, with the difference spliced into the talk
  track as silence.
- Resizing measures against the window too (`prevOut` in `applyTimelapse` is
  always pin-to-pin), so resizing inside an already-wide window never
  splices a bogus gap. A new beat whose span overlaps existing beats
  REPLACES them (overlapping fixed-duration constraints can't coexist).
- The solver never auto-slows footage below 1× to pad a surplus window
  (explicit slow-mo rate_regions keep their preference); what can't be
  filled becomes a HOLD on the pinned frame ("arrives early — holds").

## Data model

- `MediaIntents.timelapses: [{src_start, src_end, out_seconds}]` — solved
  into segments carrying `tl: 1`, rate = kept-footage/out_seconds (clamp
  0.1..2000; cuts inside the span play no part).
- `SpeakerClip.edl.gaps: [{src_at, seconds}]` — silence spliced at a source
  position of the talk track. `speakerDeriveKey` hashes gaps; transcript
  caches re-key across the gap (`maintainTranscriptCacheAfterGap` server-side,
  `afterSpeakerEdit`'s bake_seam shift client-side).
- Routes: `POST /api/timelapse/:tenant/:project {action: apply|remove,
  scene_id, key, src_start, src_end?, out_seconds?}`; media-edits ops return
  `{timelapse_auto, note, project}` when the auto fires.

## ⚠ The three mapper twins

Source-time mapping lives in THREE places that must agree exactly — a
timelapse bug shipped once for each of them before this was written down:

1. `mapSourceTime` (TS, `media-edl.ts`) — render/capture.
2. `MAP_SOURCE_TIME_JS` (injected runtime JS, same file) — scene/composite
   pages.
3. `edlMapClient` (`preview-app.ts`) — Studio preview playback.

Touch one, grep for the other two. Symptoms of a missed twin: lane widths
that overrun pins (16× clamp on a tl segment), preview landing pins ~15%
late, sub-1× crawl segments.

## Known limits

- Preview plays the beat as rapid seeks of a paused video (browsers can't
  decode H.264 at 18×); on slow connections mid-beat frames can lag the
  clock. The render extracts frames exactly — the mp4 is ground truth.
- Repeated apply/remove cycles of one beat can drift scene duration by
  ~0.1s per round trip (rounding); shows up as a hair of extra end-hold.
