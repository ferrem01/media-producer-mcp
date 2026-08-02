# AMENDMENTS.md — change & decision log

Running log of substantive changes and decisions, newest first. Pair with `SPEC.md`
(the design) and `CLAUDE.md` (how to work in the repo). Reference commits/PRs so a new
session can pick up mid-thread.

---

## 2026-07-19 — Words-lag-audio drift: the cache shift ran on RAW words (PR #435)

Marc: after cutting, "the words in speaker track are way behind what the
actual track sounds like." Live repro (proj_7b064560): cutting the 9s
silence tore out "a social post example. Great. Here we go. All right,"
and produced non-monotonic times. Root cause: the transcript-cache shift
ran on RAW whisper words -- which are SMEARED ACROSS silences -- while
users cut on the SNAPPED clock the lane shows; dropping the cut span ate
words the snap had rescued. Fix: the cut route snaps the cached words
against the OLD bake's silences before `shiftWordsForCut` (mid-based,
seam-clamped); the client in-memory shift matches;
`GET /api/speaker-transcript?fresh=1` drops a damaged cache (used to heal
proj_2b5f790e). Rule of thumb recorded: ANY consumer that edits word
times must operate on the snapped clock, never raw whisper output.

## 2026-07-19 — RE-FIT model + speaker piece editing (design: Marc; ROADMAP #8 amended)

Marc, on cutting 9s of recorded silence: "I would not want you to also cut
9s from the media. I would want you to adjust things bc they are pinned in
the media track but not also delete the same 9s from the media clip."
That replaced the linked mirror-cut model shipped the day before.

- **applySpeakerCut rewritten (re-fit):** a speaker cut removes TIME, never
  screen content. Screen targets keep every frame and RE-SOLVE into the
  shorter scene through pins: an implicit anchor at the cut seam (sync is
  frozen up to it) + a terminal anchor at the new scene end (remaining
  footage compresses to fit), both tagged `auto: refit-<src>` /
  `refit-end` so restore can lift them; user pins ride their words left.
  FOLLOWERS (the camera bubble = the voice's own take) still mirror the
  cut in source terms — lips must lose what the voice lost. "Cut both" as
  a speaker option is REJECTED (flubbed screen action → user cuts the
  screen lane themselves). Assembly-time idle∩silence stays cut-both.
  Note: re-fit is timelapse-over-silence by another door — cutting silent
  talk now compresses the screen through the gap instead of deleting it.
- **applySpeakerRestore (reverse referee):** removes the cut, film grows at
  the seam, this cut's anchors lifted, user pins/captions/spine/cues shift
  right, follower cut removed, screens relax, bake re-derived (zero cuts →
  narration repoints at the original take, no bake). Route:
  `POST /api/speaker-restore {src_start, src_end}`.
- **Studio speaker pieces = the media-lane interaction** (Marc: "shouldn't
  we just make it the same as we have for media?"): click the clip (or a
  piece between split markers) → popover with ▶ Play this piece (arms a
  `_stopAt` audition stop), Split at playhead, 🗑 Remove this piece; ✂
  seams → Restore popover. Split markers are session-local sketch lines
  (bake clock) cleared on any edit. Shift-click words still cuts;
  word-cut + piece-remove share one `speakerCutRequest`/`afterSpeakerEdit`
  path (invalidates wave/transcript caches, reloads). 🔗 badge now means
  voice↔camera (the screen re-fits, it doesn't mirror).
- Backlogged selection sugar: click-the-gap (silence auto-select) and
  drag-select (see ROADMAP backlog).

## 2026-07-18 — Timeline v2: Marc's layout pass (PR #425)

Marc on the merged lanes: "good, not great... icons not words, stationary...
timeline at top or bottom... visual separation is kinda crap... would you
even show those tracks?" The layout is now:

- **Lane order SCREEN / SPEAKER / MUSIC top-to-bottom**, each on its own
  bordered lane bed; the **ruler+scrubber is a distinct TOP band**
  (Descript-style) with a playhead line dropping through every lane.
- **Stationary inline-SVG icons** (screen / person / note) in a fixed left
  gutter OUTSIDE the scroller — always visible, always aligned, at any
  scroll/zoom. The 🔗 linked badge lives in the gutter under the speaker
  icon (lane state, not a clock moment).
- **Conditional lanes**: `laneLayout()` computes tops from what the film
  has; no speaker / no music → lane absent, strip shrinks (verified on
  proj_2ad23344, which has no audio at all → ruler + screen only).
- Known trade-off: beat-films (no voiceover) no longer show storyboard
  beat text in a words lane — no speaker, no speaker lane. The text
  remains in the scene list; revisit if scrub-by-script is missed.

## 2026-07-18 — Merged speaker lane + wave-strip zoom bug (PRs #421, #422, #423)

The full stage-3 promise from ROADMAP #8: the speaker's four scattered
timeline artifacts (voiceover audio-line, waveform strip, word lane, camera
row) now read as ONE speaker lane.

- **`.spk-clip` block** spans where the voice sits on the film clock (clip
  `at` + narration element duration; falls back to film end until metadata
  loads); inserted below the waveform + words in stacking order so they read
  as content OF the clip. Speaker EDL cuts draw as ✂ seams at their film
  positions (source→bake→film through prior cuts). The orange voiceover
  audio-lane line is suppressed when a speaker lane exists.
- **Wave-strip zoom bug (pre-existing, exposed by the lane):** a canvas's
  `width` attribute over-constrains `left:0;right:0`, so `#wave-strip`'s
  rect stayed at the UNZOOMED width — at any timeline zoom the whole wave
  squeezed into the film's first ~10% while words/blocks spread. Found by
  bitmap-probing the live page (headless chromium via the tunnel): canvas
  cssW 901px vs track 9405px. Fix: size bitmap AND css width from
  `#timeline-track` each draw (#423). Peaks also now fetch once per project
  and draw synchronously (#422) — fetch-in-the-draw could resolve out of
  order; the word-cut success path invalidates peaks + transcript caches.
- Verified on proj_2b5f790e (regenerated from the 7/18 camera recording
  with the new pipeline: speaker EDL + snapped captions) — screenshot
  audit: block at 4.84%, 1 speaker seam, labels, 🔗, 207 words, camera
  row suppressed, intro region clean.
- Known gap (deliberate): restoring a SCREEN cut via its ✂ popover on a
  linked film edits only the screen list (speaker keeps the time) — the
  reverse referee (reinsert time everywhere) doesn't exist yet. Unlink /
  restore flows are future work.

## 2026-07-18 — "Voice and camera not playing" debug: stale JS + whisper silence-smear (PRs #418, #419)

Marc reported proj_34d1497c playing without voice or camera. Remote debugging
from the sandbox (agent-proxy notes below), two real findings:

- **Playback itself was fine** — the report was a stale pre-deploy Studio tab;
  a hard refresh fixed it. What made it undiagnosable was that a rejected
  `play()` was only logged under `__MP_SYNCDEBUG`. **PR #418**: `[play-fail]`
  is now always logged (once per element), and `reportMediaHealth` ships a
  per-element snapshot (readyState/currentTime/paused/volume/error) to the
  session log at play+2.5s and play+10s. A silent-playback report is now a
  one-line remote read.
- **Whisper smears word timestamps across long pauses** (PR #419). The film's
  baked narration is silent 71.95–81.30s, but whisper timestamped ten words
  ("and a social post example. Great. Here we go. All right,") evenly across
  the gap — the word lane and captions promised speech over dead air, and
  word-anchored edits (pins, speaker cuts) would aim at silence. Fix:
  `snapWordsOutOfSilences` (transcribe.ts) uses ffmpeg silencedetect spans as
  ground truth — words with midpoints inside a ≥1.5s silence are pulled to
  real speech, sentence-aware (through the last sentence-terminal → close the
  sentence BEFORE the pause; the rest → open the one AFTER); edge-straddlers
  clamp. Applied in `getSentenceSpine` (assembly captions) and
  `/api/speaker-transcript` (Studio lane + word-cutting). Regression test
  from the film's literal numbers in `test/word-snap.test.ts`.
- The film's remaining 9.4s of dead air is REAL (screen busy, speaker quiet —
  idle∩silence correctly kept it). The systemic answer stays parked:
  timelapse-over-silence (speed the screen through voice gaps).

**Sandbox remote-debugging notes** (cost an hour, don't rediscover):
- The agent proxy 502s ANY tunneled request carrying an `Authorization`
  header (even garbage, even /health) — Studio also auths via `?token=`, so
  strip the header when forwarding. A local CONNECT-tunnel forwarder
  (scratchpad `forward.js`: http server → CONNECT → droplet, Host rewritten
  to match the CONNECT target, retries on transient 5xx) lets headless
  Chromium drive the live droplet Studio.
- `/opt/pw-browsers/chromium` has NO AAC/H.264 — `DEMUXER_ERROR_NO_SUPPORTED_
  STREAMS` on m4a/mp4 is the sandbox browser, not the app; VP9/mp3 play.

## 2026-07-18 — Symmetric speaker EDL stages 2–4: the referee + word-cutting (ROADMAP #8)

Stage 1 made the speaker lane declarative (EDL truth, bake as cache). These
stages make it EDITABLE and make the timeline read as tracks.

- **`applySpeakerCut(project, filmFrom, filmTo)`** (`speaker-edl.ts`) — the
  referee. ONE atomic op: "remove this span of FILM time." The speaker is
  the master clock, so a speaker cut removes time itself; the op writes every
  consequence in one pass: speaker cut mapped film→bake→ORIGINAL source
  through existing kept spans (`bakeToSourceTime`), same film span mapped
  through every media_edits target's OWN segments to its OWN source clock
  (so a cut through an 8× timelapse window removes the wider source span),
  re-solve + pin-drop, scene duration shrink, caption/chapter shift
  (scene-local), spine shift (bake clock), booth-script cue shift (film
  clock), and a re-derived bake via `ensureSpeakerDerived`. Route:
  `POST /api/speaker-cut/{tenant}/{project}` `{from,to}` → result + saved
  project. Tests: `test/speaker-cut.test.ts` (mapping through existing cuts,
  timelapse-region widening, one-pass consequence audit, scene-bounds guard).
- **Stage 3, Studio lanes** (`preview-app.ts`): gutter labels name the rows
  (`screen` / `speaker` / `music`); the camera bubble's video is suppressed
  from the SCREEN rows (it's a FOLLOWER of the speaker lane, matched by
  speaker-clip source filename); a **🔗 linked** badge shows when speaker and
  screencast cut lists are identical — the recorder's shared-cut convention
  made visible.
- **Stage 4, word-cutting**: shift-click the first and last word in the
  transcript lane → ✂ Cut button for the span (+60ms pad each side) → POST
  speaker-cut → project reloads with voice, screen, captions and duration
  all rippled. Plain click still scrubs + opens the pin picker.
- **Clock fix found while wiring**: transcript + waveform times are
  FILE-relative, but Mode A narration is placed at `clip.at` (after the
  6.1s intro) — the word lane and wave strip drew everything ~6s left of
  reality on recorder films. `speakerFilmOffset()` (speaker clip `at`, else
  narration `start_time`) now shifts word placement, the wave strip, and the
  cut span sent to the referee.
- Gotcha for future studio edits: the Studio app is ONE template literal —
  a backtick inside a comment terminates it (tsc error pages away from the
  real cause). Parse-check the emitted `<script>` after edits.

## 2026-07-18 — First-contact hardening (the day real use found the plumbing)

Four bugs, one pattern: detection worked, the joint between stages dropped
the result. All found by real recordings, none by tests-in-isolation.

- **Duration-less MediaRecorder files**: Chrome writes no duration header;
  probes read 0 and "empty recording" surfaced three layers away. Remux at
  ingest + probe fallback to `ffmpeg -i` parsing (envs without ffprobe).
- **Upload ordering vs intel**: video intel analyzes before the events
  sidecar arrives, so tab captures got static-band trims of their own UI
  (271px of product sidebar read as "chrome"). recorder-events now
  re-refines saved intel on sidecar arrival (`refineSavedIntelForRecorder`).
- **Idle-range shape mismatch**: sidecar idle is `{start,end}`; the Mode A
  cut intersector read `{from,to}` -- every live-narrated film shipped
  uncut while logs showed perfect detection. Regression test drives the
  real shapes end-to-end.
- **MP_AUTO_CALLOUTS resurrection**: the parked feature's env-flag gate was
  still set in the droplet's `/etc/media-producer/env` -- parked features
  must be re-enabled by code change, not config residue. Auto-invocation
  deleted outright.
- **GOTCHA (open, systemic): deploys kill in-flight generations.**
  `recorder-generate` work runs fire-and-forget inside the server process;
  a CD deploy restarts pm2 and the assembly dies silently, leaving a draft
  shell (same class as the render-clobber gotcha). Don't merge while an
  assembly is in flight; product fix = restart-surviving job queue or
  deploy draining.
- **Recorder recipe v2** shipped the same day: brand backdrop + macOS
  browser frame (chrome bar shows the recorded host from the sidecar),
  ~matted at 96% width, crop:"auto". Deterministic component config -- the
  matte also makes crop imprecision invisible in a way full-bleed never did.
- **Backlogged**: editable cuts on narrated films with audio re-derive +
  independent speaker/media cut editing (ROADMAP second tier).

---

## 2026-07-18 — Recorder complete: teleprompter, Mode A, closed loop

All three spec modes now exist. This slice:

- **Booth teleprompter** (`booth-script.ts` + `/api/booth-script` +
  Studio prompter bar): the LLM drafts narration cues TIMED TO THE CUT --
  it sees real-time vs timelapse spans, sidecar pages/clicks/chapter marks
  mapped src→film through the EDL, and budgets ~2.4 words/sec per span.
  Editable in the booth (`[m:ss] text` lines); prompter shows current+next
  cue with 1.2s lead, driven by the film clock (pauses with pause). Since
  the script is known, captions stop depending on whisper's hearing.
- **Mode A — narrate live while demoing** (`assembleLiveNarration`): mic
  muxed onto the tab recording's clock (vp9+opus, one file). Cuts =
  sidecar idle ∩ ffmpeg silencedetect, shrunk 0.35s, min 2.5s — applied as
  HARD CUTS to video (EDL) and audio (atrim/concat → standalone m4a
  narration track) so A/V sync survives by construction; v1 deliberately
  skips timelapse (would chipmunk/desync the embedded voice — future
  polish is atempo over silent spans). `attachBoothNarration` gained
  `narrationStartsAt` so live narration (starts WITH the demo) and booth
  takes (start at film 0) share one attach path. Signalled by
  `narration_embedded` → `speaker_source === screencast_source`.
  Teleprompter opens in a SEPARATE window — tab capture films the tab, an
  in-page overlay would be in the film.
- **Booth pause = breather** (earlier same day): transport pause pauses
  the MediaRecorder; play resumes both; scrub-while-paused flags a desync
  warning. And MediaRecorder blobs (no duration header — Chrome quirk) are
  remuxed on arrival, fixing "narration take is empty or unreadable".
- **Closed loop**: after generate, the offscreen doc polls the projects
  list and notifies with a clickable Studio link (notification click opens
  the film; popup shows the link). Extension 0.5.0; 0.4.0 pinned the
  extension ID via manifest `key` so settings survive reinstalls.
- **Secure-context guard**: Studio on bare-IP http has no
  `navigator.mediaDevices`; the booth explains the
  `unsafely-treat-insecure-origin-as-secure` workaround instead of
  crashing. Real fix (domain + TLS) is on the roadmap.

---

## 2026-07-17 — Mode B narration booth (SPEC-recorder.md, MVP step 2)

First live extension recording worked end-to-end same day (proj_cac63a35:
74s tab recording → 27s sidecar-compressed cut, zero pixel decoding). Mode B
lands on top of it — narrate AGAINST the locked cut, so the "voice recorded
separately vs. video needs condensing" conflict can't exist:

- **`attachBoothNarration`** (`narrated-screencast.ts`): lays a booth take
  onto an assembled project. Picture is LOCKED — scenes, durations and media
  edits untouched, no fit-solve, no pins (the take was performed to the cut,
  sync is by construction). Attaches: narration track (replaces prior take;
  retake-idempotent), whisper spine → captions + chapter cards (scene-local
  offset past the intro; captions spoken during the intro drop), ducked
  instrumental bed (picked once, kept across retakes), `project.spine`.
  Tested with mocked probes (`test/booth-attach.test.ts`).
- **Route** `POST /api/booth-narration/{tenant}/{project}?name=` — raw audio
  body (MediaRecorder webm/opus), saves the take as a project asset, runs the
  attach synchronously (whisper on a booth-length take is seconds).
- **Studio booth UI** (`preview-app.ts`): 🎙 Narrate button (shown when the
  film has a screencast scene) → bottom-right booth card: mic permission →
  3-2-1 countdown → seeks to 0 and plays the film with ALL program audio
  muted while MediaRecorder records → auto-stops at film end → review with
  audio playback → Use take / Retake / Discard → upload + reload. Program
  mute is re-asserted every monitor tick (audio elements can be rebuilt).
- **Extension popup** now reacts to live upload status (runtime broadcast +
  storage.session change listener) instead of freezing on "uploading…".

Punch-in retakes (re-record from a timeline point) deferred; whole-take
retake is cheap at walkthrough lengths. Next slice: Mode A (live mic +
idle∩silence compression + teleprompter).

---

## 2026-07-17 — Quotient Recorder foundation (SPEC-recorder.md, MVP step 1)

Record → Stop → the film assembles itself. First slice of the recorder:

- **`recorder-extension/`** — MV3 Chrome extension, no build step. Popup
  (server/tenant/token config + record/stop), background orchestrator
  (tabCapture stream id, event collection on the recording clock, idle
  derivation from activity marks), offscreen doc (MediaRecorder WebM/VP9 +
  uploads directly: video → events sidecar → trigger generate), content
  script (clicks with element boxes + accessible names, SPA navigations via
  history hooks, DOM-mutation activity pings, ⌘/Ctrl+Shift+N chapter marks).
- **`src/core/recorder-events.ts`** — sidecar types + `eventsToMotionIntel`
  (pure, tested): idle ranges ← mutationsIdle, transitions ← navigations,
  focus ← clicked-element boxes as viewport fractions (devicePixelRatio-safe).
- **`ensureMotionIntel` prefers the sidecar** over every pixel heuristic and
  skips the decode entirely — compression + chapter pins upgrade to ground
  truth with zero changes elsewhere. Heuristics remain the Mode-C fallback.
- **Routes**: `POST /api/recorder-events/{tenant}/{project}?name=` (store
  sidecar + convert to intel immediately), `POST /api/recorder-generate/
  {tenant}` (fire-and-forget speaker-screencast assemble).

Next slices per spec: Mode B booth (narrate against the compressed cut),
then Mode A (live mic + idle∩silence compression + teleprompter).

---

## 2026-07-17 — Auto-callouts PARKED (feature off by default)

After six iterations in one day, auto-callouts still shipped boxes that miss
on real footage — set aside deliberately rather than polished forever. The
machinery is intact (`vision-grounding.ts` groundCallouts, `callout-plan.ts`,
focus events, tests) behind **`MP_AUTO_CALLOUTS=1`**; the assemble path skips
it by default. Manual callouts via screencast-frame `data.callouts` still
work and render beautifully — the RENDERER was never the problem.

**What we learned (start here on the retry):**
1. Claude models answer bounding boxes in PIXELS of the shown image no matter
   how the prompt demands percentages (computer-use training). Ask in pixels,
   convert. This part is solved.
2. Rendering/geometry is pixel-exact (verified with the layout probe): ring,
   zoom-clone crop, source→screen mapping all correct. Never re-debug those.
3. The hard problem is TIME × SEMANTICS: cues land at content-change moments;
   through a ~3-4x timelapse, fractions of a second of output cross content
   seams; and the narrator references things that aren't on screen yet
   ("it will draft the template" = future tense). Frame-sampling strategies
   (start/end verification, shift-late) reduced but did not eliminate misses.
4. Verification passes don't converge: the verifier judges a static frame,
   the viewer judges motion. Whatever ships next must be validated against
   the RENDERED WINDOW (e.g. a filmstrip of 3-4 frames judged together), or
   anchor callouts to UI elements tracked across frames, not to boxes.

**Promising directions for the retry:** filmstrip verification (one call, all
window frames); anchoring on idle stretches only (static by definition);
element-level tracking; or making callouts a Studio-first manual feature with
vision as a suggestion UI (human confirms before it ships).

---

## 2026-07-17 — Vision grounding: pins and callouts get eyes

Motion analysis sees THAT pixels changed, never WHAT they are — the root
cause of both watch-test complaints (pins too conservative, callouts
arbitrary). `src/llm/vision-grounding.ts` adds a small-model vision pass at
the two decision points of the assemble step:

- **`groundChapterPins`** — for each boundary the motion pass left unpinned,
  extract stills just after the candidate seams in a **±30s** window (wide is
  safe now: a model verifies) and ask which screen — if any — is what the
  chapter's opening narration describes. `{"match":"none"}` is valid and
  common. Confident matches merge with the motion pins (monotonic-checked,
  re-solved, strain-reverted).
- **`groundCallouts`** — for each action-cue sentence, extract the frame at
  that mapped moment and ask for the bounding box of the element the
  narrator names, or `found:false`. Replaces the motion-only callouts when
  an LLM is configured; motion heuristic remains the no-LLM fallback.

Model: `MP_VISION_MODEL` (default `claude-haiku-4-5`); ~10–15 small calls
per assemble. Character preserved: vision only grounds proposals, no
confident answer → nothing ships, everything stays editable in Studio, and
every failure degrades to the motion-only behavior.

---

## 2026-07-17 — Watch-test fixes: real ducking in Studio, instrumental bed, median callout boxes

First human watch of the full recipe surfaced three defects:

- **Studio preview ducking used `ducked_volume` as an ABSOLUTE level** while
  the render mixer applies it as a relative multiplier -- so "ducking" RAISED
  a 0.22 bed to 0.35 for the whole narration. Preview now matches the mixer
  (base × ducked_volume). Renders were always correct.
- **Bed with lyrics fights the narrator**: `selectMusic` gained
  `instrumental: true` (Jamendo `vocalinstrumental=instrumental`); the
  narrated bed uses it, volume trimmed to 0.18.
- **Callout boxes were union-inflated**: a long focus run accumulated every
  stray flicker until the box hit the size caps (all four proposals at h=56%).
  Focus events now emit the MEDIAN per-second box (typical activity region),
  per-second concentration cap 0.2, event area cap 0.16, callout caps 50/45%.
- Sidecar cache versioned (`motion_v`, MOTION_INTEL_V=2) so stale cached
  focus/transitions recompute once and upgrade in place.

---

## 2026-07-17 — Pins v2 (iterative), auto-callouts, ducked music bed

Rungs 3-4 of the speaker-screencast ladder + the pin upgrade:

- **Pins v2 — iterative refinement** (`planChapterPins` rewritten): the
  proportional guess drifts with every un-modeled pace change, so a fixed
  window around the raw guess misses correct seams (measured Δ19s). Now:
  start from the end-pin, then repeatedly (1) re-solve the map with pins so
  far, (2) recompute unpinned guesses on the CORRECTED map, (3) pin the
  single most confident match. Each accepted pin re-anchors the map. Still
  conservative (no seam in window → no pin; infeasible pin → discarded).
- **Auto-callouts** (`core/callout-plan.ts` + focus events in
  `compress-waiting.ts`): the narration says WHEN (action-cue sentences:
  click/open/type/...), the footage says WHERE (focus events = seconds of
  motion whose union bbox stays small — typing in a field, a panel
  updating; scrolls/repaints rejected, ≥2s only). A callout is proposed
  only when both agree, mapped through the PINNED media map, and rides
  screencast-frame's existing region-glow/lift rendering as plain editable
  component data. Caps: ≤6, ≥18s apart, never over a chapter card.
  (Also fixed: callout clones forced `height:auto` — collapsed to the 150px
  fallback on capture pages; now inherit the base's explicit height.)
- **Ducked music bed**: the assemble recipe now attaches a calm
  commercial-safe bed at 0.22 volume, looped, with `audio.ducking` (to 0.35×
  while the narration speaks, swelling in gaps + bookends) — the render
  mixer's existing envelope ducking does the work. Opt out with
  `background_music: false`.
- **Motion intel unified**: `ensureMotionIntel` — idle + transitions + focus
  from ONE decode, sidecar write-back upgrades older assets in place,
  in-process memoization for concurrent callers.

---

## 2026-07-17 — Chapter pins: semantic audio↔video sync (speaker-screencast)

Before this, narration and footage were only **durationally** synced (the
compression solve matches totals) — nothing guaranteed the screencast SHOWS the
broadcast screen while the narrator talks about it, and an early mismatch
drifted through the whole film. Now the spine's chapter boundaries become
**pins** on the screencast's media map:

- **`transitionsFromScores`** (`compress-waiting.ts`, now `analyzeMotion` — one
  decode, both signals): hard visual transitions = short isolated spikes in the
  same frame-diff profile idle detection uses. Sustained motion (scrolls,
  animations) is rejected; multi-step navigations within 3s collapse to one.
  Cached at ingest as `intel.transitions`.
- **`planChapterPins`** (`auto-compress.ts`, pure): per chapter boundary, take
  the proportional guess (where the current solve already lands), snap to the
  nearest transition within ±6s, keep only monotonic confident matches — **a
  boundary with no visual seam nearby gets NO pin** (a wrong pin is worse than
  none). An end-pin (scene end → source end) keeps the narration fit exact.
- **`proposeChapterPins`**: re-solves via `solveMediaEdits` (idle rate_regions
  stay the elastic between pins); **strained pins are dropped** and re-solved.
  Pins carry the chapter title as their label → they land in Studio's media
  lane named, visible, draggable. Machine proposes; human owns the last 10%.
- Wired into `assembleNarratedScreencast` after the spine; summary reports
  `N chapter pin(s) snapped to visual transitions`.

Drift is now bounded per chapter and re-anchored at every pinned boundary.
This also sets up rung 3 (callouts/punch-ins): anchored off pins, callouts
survive a human dragging one.

---

## 2026-07-17 — Speaker-screencast sentence spine: captions + chapters

The grammar's own spine, realized (the backlog item from the prep+mandate entry).
Tempo-cut snaps to **bars**; the narrated walkthrough now snaps to **sentences**.

- **`src/core/sentence-spine.ts`** — whisper word segments (transcribe.ts, on-box)
  → `buildSentences` (terminal punctuation / real pause / run-on guard) →
  `buildChapters` (breaks at long narration pauses past a min length, force-closes
  before 75s). Pure + unit-tested; leading-silence onset correction shared with the
  Studio words lane.
- **`components/captions/narration-track`** — one full-frame overlay: a lower-third
  scrim pill per sentence (auto-shrink, no flicker between back-to-back sentences)
  plus brief dimmed **chapter title moments** (kicker "CHAPTER N" + accent bar).
- **`assembleNarratedScreencast`** — builds the spine from the narration (narration
  time IS film time; overlay times are scene-local, minus the intro bookend), titles
  chapters via ONE small LLM call (`titleChapters`; on failure chapter cards are
  skipped — captions never depend on the LLM), stamps the overlay onto the
  walkthrough scene, and stores **`project.spine`** (film-time sentences + chapters)
  for Studio and the future clipping/social-cut grammar.
- Degrades cleanly: no whisper on the box → the exact pre-spine assembly.

Backlog next (rungs 3-4 of the speaker-screencast ladder): narration-timed region
callouts/punch-ins on the screencast; ducked music bed under narration; PiP camera
when a camera file exists; speaker-name lower third on the intro.

---

## 2026-07-16 — Unified grammar pipeline: prep + mandate (the "hard" L4)

**North-star architecture for how every `film_grammar` runs.** L4 originally made
`filmGrammar` a structured *field* but only a **soft** signal — it whispered to the LLM
storyboard (mandatory contract sections + a tempo-cut creativity clamp) and everything
still flowed through the same LLM generate. Music-first was the one exception: it was
already `prep (pick track → beat grid) → constrain the shared storyboard`. This
generalizes that shape to **every grammar**.

**The model — ONE pipeline, per-grammar PREP + MANDATE** (`src/llm/grammar-prep.ts`,
`runGrammarPrep`): before the storyboard, each grammar contributes
1. a **mandate** — `"generate"` (LLM invents the visuals) or `"assemble"` (materials are
   GIVEN, place them deterministically);
2. a timing **spine** the cut snaps to (music **bars** / narration **sentences**); and
3. the **given materials** it brings (music bed / a screen recording).

The deterministic-vs-LLM split is now an **emergent property of the mandate, not a
separate code path**. `runGeneratePipeline` calls `runGrammarPrep`; on `"assemble"`
(speaker-screencast + a `screencast_source`) it short-circuits *before the creative
director* into `assembleNarratedScreencast` (place the recording + compress-the-waiting
fit to the narration + brand bookends) and returns — same pipeline entry, same
project/render model, the LLM steps simply don't run. On `"generate"` it's the existing
music-first path (spine = bars) feeding the shared storyboard.

- `generate`'s `screencast_source` now routes *through* the pipeline (it was a standalone
  handler branch); `pickMusicMood` moved into `grammar-prep.ts`.
- **Backlog (logged here, not yet built):** (a) make `tempo-cut` *imply* music-first
  instead of being gated on the `background_music` flag; (b) let the selected track inform
  the *treatment*, not just the storyboard (music is picked after the concept today);
  (c) give speaker-screencast a real sentence **spine** so the shared assembly can lay
  captions/overlays timed to the narration (transcription already exists).

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

## 2026-07-12 (later still) — Claude surfaces at screenshot fidelity

Marc: "the next component I wanna work on and make really good is the Claude
desktop component" → then "I want to focus on cowork specifically."

- **Taxonomy** (corrected by Marc's screenshots): terminal CLI /
  Claude Code desktop (Code tab) / Claude Cowork desktop (Home tab).
- **claude-code-session** (#315): the terminal — banner, tool blocks with
  diffs, working spinner with LIVE elapsed/token counter riding the master
  timeline, todos, streaming responses. Shorthand: prompt_text/tool_calls/
  response_text.
- **claude-desktop** (#315, rebuilt #317): the real Code tab — light bone
  theme, Home/Code toggle, numbered Recents (status dots opt-in), claude.ai-
  style pane, 'Type / for commands' composer. The invented dark fleet
  sidebar was deleted.
- **claude-cowork-home** (#317, fidelity #318/#322/#323): starburst greeting
  (real mark via logo.dev claude.ai + multiply-blend against a locally
  painted backdrop; SVG fallback), composer with Chat/Cowork toggle, plus-
  menu (hoisted to window-last child — entrance transforms + wrapper
  preserve-3d defeat z-index; DOM order is the only reliable layer), ideas.
- **claude-cowork-session** (#318, tool grammar #320/#321): the running
  task — serif prose, right rail (Progress N-of-M + step checklist,
  Outputs, Context/Connectors chips that light while in use), and the REAL
  tool-group treatment: humanized title, clock-icon thinking with code
  chips, Result pill, dotted 'Using Quotient…' spinner, ✓ Done, then
  auto-collapse to 'List Social Posts ›'. Real Quotient MCP tool names
  throughout (create-campaign, create-social-post...).
- **Camera cover-clamp** (#316): anchored/whole-scene zooms can never frame
  outside the canvas (|x| ≤ (s−1)·W/2). Anchors should hug CONTENT (the
  rail's card stack), not full-height containers (#319).
- Demo films: proj_5b7edf4f (terminal + Code desktop), proj_eb454668
  (Cowork home → running task with scripted Quotient tool calls).

## 2026-07-12 — Quotient Social fidelity (PRs #325, #326)

Marc: "lets take a look at quotient chat and quotient social... here is the
screenshots. here is social. one is a post that has been published and one
that is in draft."

- **quotient-social rebuilt** (#325) from the real editor screenshots:
  platform-aware ('x' | 'linkedin' — toolbar tile, author treatment,
  char-limit default 25,000/3,000), campaign-tag pill with progress ring,
  'Go to thread ↗', and the black Schedule split-button whose dropdown
  (Publish Now / Schedule for later) is a window-last child positioned from
  the button. Post card on the dotted grid: green '✓ Post published on …'
  bar vs gray '✎ Draft' bar + char counter, X author (brand avatar, corner
  badge, verified check, @handle) vs LinkedIn (photo, in badges), up to two
  side-by-side media cards (image / gradient headline / file chips).
  publish-post is the money beat: menu row flashes, bar flips green,
  Schedule → View. Legacy embed_*/schedule-post still map through.
- **update tool camera_moves accepted `target` but stripped `anchor`**
  (#326): zod's default key-stripping silently dropped the documented
  anchor grammar, so MCP-saved moves zoomed on frame center. One-line
  schema fix. (Symptom to remember: move plays, framing is wrong.)
- Demo: proj_8446563d scene_social — draft → dropdown → Publish Now →
  green bar, with anchored zooms on qs.status / qs.toolbar.

## 2026-07-12 — quotient-app-shell: the composable app chrome (PR #328)

Marc: "what i really want to do is build a component system. The left nav and
header......the social edit screen....the message panel to the right. Then i
can swap out the middle for different parts of the platform."

- **quotient-app-shell** (#328): icon rail (nav_active highlight + avatar),
  breadcrumb header (bell 480, Search ⌘+K, black New Chat), right AGENT
  PANEL (tabbed title, reviewed-line, collapsible 'Updated [in] LinkedIn
  post' tool cards with faded post preview, agent/user messages, typing,
  composer with Auto + mic + send). The CENTER IS AN EMPTY WELL:
  content-region contract = shell full-frame → center component at
  x 3.6%, y 6.2%, 63%×93%. quotient-social drops in today; campaign /
  email / doc / flow screens reuse the same hole. show_panel:false =
  full-width well. Anchors: content, panel, messages, composer, header, nav.
- Demo: proj_8446563d scene_shell — agent panel narrates the edit, user
  types 'Perfect — publish it.', center editor opens the Schedule menu and
  flips draft → published green while the panel confirms.

## 2026-07-12 — quotient-campaign: the campaign center (PR #330)

Marc's screenshots: Brief / Tasks / Activation / Deliverables tabs.

- **quotient-campaign** (#330): tab bar + four working views. Brief =
  rich-text doc (updated line, title, Date Range chips, Owner row,
  sections with bullets). Tasks = 'Completed 0/6' counter, To-do group,
  rows with dashed-circle checkbox / red priority bars / owner avatar /
  deliverable platform icon / 'Get Started' Quotient chip. Activation =
  week calendar (time gutter, day columns, deliverable cards with
  Published/Draft/Launched). Deliverables = green-rocket status table.
  Actions: switch-tab, complete-task (counter ticks), move-event (card
  lifts + glides between days -- the drag beat), set-event-status,
  set-deliverable-status, scroll-view. Anchors: tabs/brief/tasks/
  calendar/deliverables. Second center for quotient-app-shell.
- Demo: proj_8446563d scene_campaign — brief → tasks (2 checked) →
  activation (Marc's post dragged to Friday) → deliverables (last row
  flips Published), agent panel narrating each move.

## 2026-07-12 — polish: social footer + shell inset window (PR #332)

Marc: shell "getting clipped in your test film... make it smaller so i can
be sure the entire app is visible"; social "we lost the bottom part of the
social post."

- **quotient-social**: engagement row (Likes/Comments/Reposts/Forwards,
  show_engagement) + footer AUTHOR block (avatar w/ corner badge, name +
  badge + gray Author chip, first comment via author_comment e.g.
  'Apply here: {url}') restored from the real screenshot.
- **quotient-app-shell** is now a rounded floating window (radius/border/
  shadow) placed INSET, never full-bleed: shell {x 1.2%, y 2%, 97.6%×96%} →
  center {x 4.7%, y 8%, 61.5%×89%} (formula in the schema). Full-bleed
  placement + scene drift is what cropped the rail/header.
- Note: final-mp4 duration ≠ sum of scene durations (crossfades add time);
  compute frame-grab timestamps from ffprobe/Duration, not scene math —
  "clipped" end frames were actually mid-zoom camera moments.

## 2026-07-12 — social bottom = the real editor; rail = the real icons (PR #334)

- **quotient-social bottom**: drafts show the action strip (emoji + image +
  'Ask for Changes' with the Quotient mark); published shows the muted
  Likes/Comments/Reposts/Forwards row; publish-post swaps them live.
  Below the card: Comments section ('Comments' + 'Write a comment...'
  composer, show_comments). Long cards: script scroll-post to reveal the
  bottom on camera.
- **quotient-app-shell rail** rebuilt to Marc's screenshot: panel-collapse
  pinned at the very top (moved out of the header), then home, history,
  flag, thumbs-up, book, mail, image, file, flows NODES, calendar, people,
  scheduled CLOCK-BOX, memory BRAIN; avatar at bottom. nav_active +=
  'scheduled'.

## 2026-07-13 — quotient-chat = THE agent panel, composed into the shell (PR #337)

Marc: "the right agent panel in app shell ideally would be the same one in
quotient-chat... mainly bc it is the same one in real life."

- **quotient-chat rebuilt** from the 5 panel screenshots: tab row (running
  tab with spinning ✳, copies badge → References popover), color-coded
  verb lines (linkedin blue / x black / email+doc orange / task+campaign
  blue / blog+memory dark), **content-card = the streaming box** (the
  created/updated doc types itself into a white inner box under a top
  fade, floating scroll-down button while streaming, collapse_delay),
  task-status ('Marked N task(s) as ◑ In review' + checkbox rows),
  'Conversation summarized' divider, pink-initials user bubbles, composer.
  Legacy tool-use/asset-card actions alias to verb lines.
- **One panel everywhere**: shell keeps a simple built-in panel; fidelity
  composition = shell show_panel:false + quotient-chat at the panel slot
  (x 67.6%, y 8%, 30.5%×87% with the standard inset shell). Demo
  scene_campaign now runs the 3-component composition (shell + campaign
  center + real panel), scene_chat showcases the panel standalone.

## 2026-07-13 — Connector explainer restyled HyperFrames + render write-back gotcha (PR #339)

Marc: "WebGL backgrounds to each scene... components smaller so they're
contained... no voiceover — classic hyperframes: kinetic text, then a
scene... intro slide with the Claude logo and the Quotient logo." Then:
"the pitch is work on the idea in Claude... execute in Quotient... then
list out all the features of quotient that work."

- **proj_0890a34e restructured**: intro (logos × logos, 'Now connected.')
  → 4 manifesto interstitials (THE IDEA / THE WORK / EXECUTE / SHIP) each
  cutting to its product scene (Cowork ask, Cowork run, Quotient campaign
  trio, publish trio) → **st-swarm feature roll** ('All of Quotient. One
  connector.' over 12 flying feature words) → hero close. All product
  windows inset over webgl-backdrop worlds (Cowork 84%, shell trio 88%).
- **kinetic-text data.color** (PR #339): the component inherited
  --mp-color-text (near-black on light brands) — illegible on dark
  worlds. Optional CSS color override added.
- **GOTCHA (unfixed, real bug): editing a project while a render job is
  running gets CLOBBERED** — the job holds the project in memory and
  writes it back on completion, silently reverting any edit made
  mid-render (lost the feature-roll scene + manifesto rewrites once).
  Rule: never update/add while a render runs; re-apply after it
  completes. Product fix: render completion should patch status/output
  fields only, not write the whole project snapshot.

## L4 film grammar (this session, after the two tempo-cut generation tests)

- **`filmGrammar` is now a structured Treatment field** (`launch-film` |
  `tempo-cut` | `speaker-screencast`), not prose. The creative director
  commits to exactly one (caller can force it via the generate tool's
  `film_grammar` param); the pipeline reads it as DATA: it activates the
  matching storyboard contract section as MANDATORY, clamps creativity to
  0.15 for tempo-cut (component-first assembly), and falls back to text
  detection only for treatments that predate the field.
- **speaker-screencast codified as the third grammar** so the earlier
  speaker-track work stays first-class: the voice is the clock (cuts on
  sentences, never mid-sentence), the human narrates (no text-as-VO, no
  statement slides), overlays line-rise on the sentence that introduces
  them, music absent or ducked far under the voice. Mechanics (content
  region, takeover + PiP) were already in the speaker instructions; the
  grammar adds the editorial contract.
- Why: two A/B generation tests proved prompt-only contracts drift — run 1
  (prose only) broke scene budget/music/labels; run 2 (fixes) still picked
  a generic chat surface over the real product mock and leaked a stage
  direction. Grammar-as-data + the `generic_surface` and
  `stage_direction_leak` gates is the enforcement stack.

## Testing, tooling & distribution batch (2026-07-19, after the re-fit editing model)

- **TESTPLAN.md** — the 15-minute golden-path manual script: record with the
  extension (camera + narrate + deliberate pause + 8s silence-over-activity),
  audit auto-assembly, exercise re-fit speaker editing (word-cut, piece
  split/play/remove, restore), screen + effects edits, camera bubble + booth,
  and finish with a real render — the mp4 is the only proof of the audio mix.
- **scripts/studio-smoke.mjs** — automated post-deploy invariants driven
  through a real browser (Playwright): boot without JS errors, lane geometry
  uniform, gutter icons labeled, fx/screen blocks open their editors, speaker
  pieces + word lane sane, transcript monotonic; `--edit` adds a speaker
  cut/restore referee round-trip through the API (mutates — use a throwaway
  film). Verified 11/11 against the live droplet.
- **`edit_speaker` MCP tool** (server.ts) — list/cut/restore on the talk
  track, so an AI client can do what the Studio word-lane does. Reuses
  applySpeakerCut/applySpeakerRestore + the shared transcript-cache
  maintenance now extracted into speaker-edl.ts
  (`maintainTranscriptCacheAfterCut` / `dropTranscriptCache`, also used by the
  HTTP routes — one code path for both surfaces).
- **Landing page is now a real front door**: MCP endpoint, a Get-started
  section (connect an AI client; download + install the recorder extension),
  and `/extension.zip` serving `recorder-extension.zip` from the repo root
  (rebuild with `npm run build:ext`; extension defaults contain NO server
  URL/tenant/token — verified before zipping).
- **HTTPS via Caddy is part of deploy** (`scripts/setup-caddy.sh`, called from
  deploy.sh before the env load): idempotent apt install, managed Caddyfile
  (`reverse_proxy 127.0.0.1:$MP_PORT`), ufw 80/443, rewrites `MP_PUBLIC_URL`
  to the https domain so preview links flip automatically. Domain =
  `MP_CADDY_DOMAIN`, falling back to `<ip-with-dashes>.sslip.io` (zero-DNS);
  `MP_CADDY_DISABLE=1` opts out; a hand-written Caddyfile is never touched.
  HTTPS also retires the insecure-origins Chrome flag for getUserMedia.

## Post-deploy verification findings (same day, after the tooling batch shipped)

- **REAL BUG (fixed): applySpeakerCut only re-fitted media-edits entries that
  already existed.** A film whose assembly made no idle-silence cuts has no
  entries at all — a speaker cut then shrank the scene but silently truncated
  the screen's tail (content loss, against the re-fit contract) and never
  mirrored into the camera bubble (lip desync). Now the cut SEEDS identity
  entries first: screen = [0, oldDur] of its own clock; camera follower = the
  speaker's clock with its existing cuts. 3 new referee tests cover seed,
  seed-with-prior-cuts, and seeded round-trip. (Found because Marc's real
  film proj_2b5f790e is in exactly this state — screencast entry absent,
  camera entry present.)
- A stray NUL byte had landed in speaker-edl.ts (a python edit script wrote
  "\0" where "" was meant — in a Python string literal \0 IS the NUL byte).
  Harmless at runtime (unused fallback branch) but the file scanned as
  binary. Fixed; lesson: grep -P '\x00' after scripted edits.
- **Composite-ready window 10s → 30s** (waitForCompositeReady): on a cold
  server/slow pipe the composite takes >10s to register its timelines; the
  old window stranded the Studio in per-scene fallback with EMPTY media and
  word lanes (looked like data loss, was a timeout). studio-smoke now polls
  readiness up to 75s instead of a fixed 15s nap.

## Render-mix bug from Marc's first ground-truth watch (2026-07-19 night)

- **Ducking never engaged on speaker films (fixed).** The mixer matches its
  ducking config to mix inputs by PATH EQUALITY; inputs are built with
  resolveVideoPath but resolveDucking passed RAW track sources. Generated
  films' VO sources are already filesystem paths (match), but speaker films
  carry web-style `/assets/...` narration sources -- the trigger never
  matched and ducking silently skipped: full-blast music bed, drowned voice.
  resolveDucking now resolves both sides identically. Symptom log line to
  look for: "Ducking: duckIdx=N triggers=0".
- Marc also reported "no zoom in the render" -- frame extraction shows the
  zoom IS in the mp4 (7.6-10.7s film time, matching the stored move at
  scene-local 1.5s with return). Likely blink-and-miss; awaiting his
  re-check on the re-render.

## Camera-bubble sync investigation (2026-07-19 late night)

Marc reported the camera bubble out of sync with the voice on the rendered
film. What forensics on the mp4 established (methods: motion-event matching,
A/V envelope cross-correlation, droplet cache-frame content checks via the
new /api/render-probe):

- The narration AUDIO is placed exactly right (verified at two points:
  pre-cut offset +6.10s, post-cut film 96 -> source 95.92 vs expected 95.93).
- The bubble is IN SYNC in the pre-cut region (correlation peak at 0.0s lag).
- The droplet's frame extraction + cache are content-exact (probed at 4
  indices; ffmpeg 4.4.2 vs sandbox 7.0 -- initial suspicion of VFR resample
  divergence was WRONG; do not chase it again).
- Post-cut verdicts were unreliable on this footage: the speaker sits nearly
  motionless, so pixel methods can't discriminate candidate maps. UNRESOLVED
  whether the rendered bubble mis-maps after the seams; need Marc's eyes
  (where/when/lead-or-lag) to narrow it.
- REAL data bug found and fixed regardless: applySpeakerCut/Restore updated
  clip.edl.cuts but carried clip.edl.segments STALE (Marc's film had cuts
  [74.85, 84.88] but segments encoding only 74.85). Both now re-derive
  segments from the merged cuts (speakerSegmentsFor). No active consumer of
  the stale field was identified -- media_edits carried the correct map into
  both the render and the Studio composite -- but two encodings of one fact
  must not disagree.

## Camera-sync ROOT CAUSE (2026-07-19, after Marc's 13-16s pointer)

**Found and fixed: the stitch INSERTS transition segments (default 0.5s
crossfade at every scene boundary) into the video, while every audio track
is placed at its raw content-clock start_time.** Result: ALL scene video
after the first boundary runs late vs the audio by the accumulated
transition time -- on Marc's film exactly +0.50s from film 6.6 onward,
measured at 0.92-0.97 correlation by region-matched video-to-video
alignment (bubble AND screen; the audio itself was placed exactly). The
container math sealed it: 123.2s content + 2x0.5s inserted = 124.2s
observed duration. Preview is unaffected (no inserted transitions), which
is why the Studio looked perfect.

Fix: renderVideo records every inserted transition (content-time, seconds)
and shifts each audio track's start by the insertions at/before it; the mix
duration includes inserted time. renderAudioOnly computes the same from
project data (expectedInsertedTransitions, unit-tested).

Investigation debris worth keeping: droplet ffmpeg 4.4.2 and sandbox 7.0
produce BYTE-IDENTICAL fps-filter extractions (verified frame-by-frame with
a downloaded 4.4.1 static build) -- do not suspect VFR resampling again.
Statistical A/V-lag methods (motion-vs-envelope correlation) FAIL on
sitting-still footage; region-matched video-to-video correlation is the
reliable instrument.

OPEN QUESTION (preview-render parity): the Studio's film clock has no
transitions, the render's does -- so rendered timestamps run ahead of
studio timestamps by 0.5s per boundary. Consider OVERLAPPING transitions
(no inserted time) instead, which would unify the clocks; needs a call.

## HTTPS resolution (2026-07-19 night): it was already working

Marc was right to be surprised: this droplet has a WORKING hand-written
Caddy setup from before — caddy v2.11.2 active, valid Let's Encrypt cert
for **159-203-115-164.nip.io** (rsa4096), reverse_proxy to :3200, plus a
/hyperframes/* route to :3001. setup-caddy.sh correctly refused to touch
the unmanaged Caddyfile, but the debugging session then probed its OWN
invented fallback (sslip.io) instead of discovering the configured domain
— hence "no cert" for 35 minutes of head-scratching. Lesson: inspect the
box's actual state (now possible via GET /api/caddy-status) before
concluding anything about it.

Changes: setup-caddy.sh now ADOPTS an existing hand-written Caddyfile
that proxies our port (uses its site address for MP_PUBLIC_URL, touches
nothing); fresh installs use nip.io + `key_type rsa4096` per the proven
recipe; extension default server + docs point at
https://159-203-115-164.nip.io. Do NOT overwrite the hand-written
Caddyfile on this droplet — it carries the /hyperframes route.

## TESTPLAN run findings, round 1 (Marc, 2026-07-20)

- **Upload progress** (extension 0.8.0): a 5-minute take is a 100-300MB
  upload and the popup said only "Uploading…" — reads as a hang. The
  offscreen uploader now uses XHR (real page context, so upload.onprogress
  works; fetch has no upload progress) with ONE combined meter across tab +
  camera files; popup renders "Uploading… 42% · 38 / 91 MB", live and when
  opened mid-upload (progress rides qrLastStatus in storage.session).
- **HUD timer flash**: the PiP HUD's clock interval started when the HUD
  opened — during the 3-2-1 countdown — while rollT was still 0, so it
  rendered Date.now() as minutes for a beat. Shows 0:00 until the take
  actually rolls.

## Timelapse as a deliberate effect (2026-07-20)

Marc's experiment film (proj_c55cfce5, 217s cut, 142s of footage jammed
into a 1.8s pin window) proved the failure mode: continuous fast-forward
past ~8x reads as an ugly smear, and past 16x the pin math simply cannot
land ("lands 8.1s off"). The answer is the film-grammar move real editors
use: a TIMELAPSE beat that owns its own film time.

- **Data**: `MediaIntents.timelapses [{src_start, src_end, out_seconds}]`
  — exact-duration, cap-exempt constraints. Solver emits `tl: 1` segments
  with fixed rate (kept-span/out_seconds, clamp 0.1..2000), excluded from
  pin-window flexing. `edl.gaps [{src_at, seconds}]` on the speaker clip
  funds the beat: applyTimelapse splices a matching silence gap into the
  talk track (cutAudioToWithGaps), so captions/pins/booth cues ripple once
  and nothing desyncs. removeTimelapse refunds the gap. The camera bubble
  freezes (adjustHold) for the beat.
- **Playback**: past 8x a tl segment plays as SAMPLED frames (0.45s
  flipbook steps in mapSourceTime + MAP_SOURCE_TIME_JS) instead of
  continuous blur, with an elapsed-clock chip ("⏱ +2:47 · ⏩28×") emitted
  by timelapseClockScript — a zero-ease proxy tween on the scene timeline
  (NOT rAF wall-clock), so capture seeks and Studio playback render it
  identically. The clock ticks on the same 0.45s quantum as the frames.
- **Policy**: suggest when it's ugly, auto only when it's impossible.
  8-16x continuous segments get a dashed ⏩? chip in the effects lane
  (click → make it deliberate); a pin strained past 16x triggers
  autoTimelapseForStrain server-side — loud (studio toast), visible
  (striped ⏩ block in the effects lane), reversible (resize/remove in the
  same popover). 16x stays the continuous-video cap.
- **Routes**: POST /api/timelapse/:tenant/:project {action: apply|remove,
  scene_id, key, src_start, src_end?, out_seconds?}; /api/media-edits ops
  return `{timelapse_auto, note, project}` when the auto fires. Transcript
  cache re-keys across the gap (maintainTranscriptCacheAfterGap); the
  Studio reuses afterSpeakerEdit's bake_seam shift client-side.

Acceptance film is proj_c55cfce5: cut, pin, accept the suggestion, and
the film should read clean.

## Timelapse UI correction (Marc, 2026-07-20): it's a SEGMENT, not an effect

Marc's read on the first live version: "Why did you make it an effect? I
would have expected it to just be a segment type." He's right — a
timelapse maps 1:1 onto a span of footage, which is exactly what the
screen lane's rate blocks are; drawing it as a second bar in the effects
lane put two pictures of one truth on screen. His screenshot also caught
a real bug: renderMediaLane didn't know tl rates (clamped everything to
16x for width), so the screen lane drew the timelapsed stretch too wide
and shoved the map past the pins — while the effects block sat perfectly
between them.

Now: tl segments render IN the screen lane as a striped "⏩ 28.2×"
segment (click → resize/remove popover); fast (8x+) plain segments carry
a small ⏩? tag (click → make it deliberate); the effects lane is back to
zooms/callouts only; screen-lane widths are tl-aware so the map lines up
with the pins.

## Timelapse round 3 (Marc, 2026-07-20): "it should end at the wow"

Marc pinned "right," and "wow" with ~13s of talk left between them, and
the auto sized the beat with its default heuristic (8s) while the pins
already defined a 12.8s window. The solver then stretched the 0.5s of
leftover footage to 0.104x slow motion to fill the 4.3s surplus --
"that's the wrong math", and playback visibly didn't end at the pinned
frame. Three coordinated fixes:

- **Solver floor**: auto-flex never slows footage below min(pref, 1) --
  relaxing fast prefs toward 1x to fill a window stays; sub-1x crawl is
  gone. Whatever the floor can't fill becomes a HOLD on the pinned frame
  ("arrives early -- holds", same as every other surplus window). Also:
  adjacent same-rate tl pieces merge across hard boundaries (a rate
  region ending mid-beat split one beat into two lane blocks).
- **Auto sizing fills the window**: when the pins already define a window
  wider than the default beat, out_seconds = window - 1x-landing-residual
  (edge-to-edge, ending at the pinned word) with NO gap and NO film
  growth. Only a too-small window falls back to the funded 3..8s default.
- **Resize measures the window**: applyTimelapse's prevOut is always the
  pin-to-pin window, never the beat's stored out_seconds -- resizing a
  beat inside an already-wide window must not splice a bogus gap.

## Timelapse round 4 (Marc, 2026-07-20): preview map didn't know tl either

"Still off... the scene I pinned is happening where the playhead is" —
~1.5s late. Root cause: the Studio preview has its OWN copy of the
source-time mapper (edlMapClient in preview-app.ts) and it still clamped
every rate to 16x, so it played the 18.3x beat ~15% long and everything
after landed late. Same bug class as renderMediaLane in round 3 — there
are now three tl-aware mapper twins that must agree: mapSourceTime (TS,
render), MAP_SOURCE_TIME_JS (injected), edlMapClient (preview). Grep all
three when touching mapping.

Also: the beat's FINAL 0.45s flipbook step now parks on the landing
frame (src_end−0.05) in all three mappers — the beat settles on the
exact frame playback continues from, and the preview buffers the landing
before the boundary instead of seeking there late.

## Timelapse polish (Marc, 2026-07-20): the block ends exactly at the pin

Playback verdict after round 4: "pretty accurate and pretty tight" — one
visual complaint left: the striped block ended 0.5s before the pin (the
auto's real-speed lead-out). That lead-out is redundant since the beat's
final flipbook step parks on the landing frame, so the auto's span now
runs to the pinned frame itself (spanEnd = pin.src) and the beat fills
the window exactly: block edge == pin, visually and temporally.

## PiP bubble controls round 2 (Marc, 2026-07-20): shape + drag

Marc: "change the PIP size and location... square to rectangle to circle
... move it around the screen." What existed: corner presets + S/M/L on
the bubble popover (and a separate built-in pip_* config on
screencast-frame that pipeline scenes use). Added for the camera_pip /
booth_pip component path his films use:

- screencast-frame gains data.shape:'circle' ('none' mode): square
  cover-cropped viewport clipped to a circle (frame box fitted 1:1; the
  media branch center-crops so no letterbox wedges inside the ring).
  Studio squares the position box in px when switching (h% = w% * 16/9
  on the 16:9 canvas).
- Bubble popover: Rect / Round / Circle buttons (corner_radius 0 / 18 /
  shape:circle) via the component PATCH route.
- The bubble is now DIRECTLY draggable in the preview: grabbing it moves
  the bubble (the zoom marquee still owns drags that start anywhere
  else); release PATCHes position -- no preview reload needed.

## Chapters become first-class edits (Marc, 2026-07-20)

Design settled through debate: a chapter card is "an overlay that says
chapter on it" -- an EFFECT, not a ruler marker (Marc: "the time scrubber
should be sacred... your main navigational UI construct"; nothing lives
on the ruler, ever). Data stays where the renderer reads it, the callout
pattern: narration-track's data.chapters [{title, at, dur?}].

- Effects lane renders ⚑ blocks (white/indigo) from data.chapters; click
  → popover: title / at / shows-for / Delete → component PATCH.
- Add: click the actual screen → revise popover gains "⚑ Add chapter
  here…" (drops one at the playhead); clicking the on-screen chapter
  card itself offers "⚑ Edit this chapter…".
- chapters_edited flag: the sentence spine only DRAFTS the chapter list;
  once Studio has written it, re-attaching narration keeps the user's
  list verbatim (auto never overwrites edits).
- narration-track honors per-chapter dur (card hold, default 2.2s).

Auto policy unchanged for now: the spine still drafts chapters on first
assembly. If living with editable chapters still annoys, downgrading the
draft to a suggestion is a one-line policy change on this same UI.

## Booth draft 500 + deploy resilience (Marc, 2026-07-20)

Marc clicked booth's Draft Script and got a 500: "Anthropic returned
empty response". Root cause was NOT the film analysis (runs clean on his
project) but the LLM call budget: newer models think by default and the
thinking spends from max_tokens, so the drafter's 1500 cap was consumed
before any JSON text was emitted.

- booth-script maxTokens 1500 -> 6000 (with a comment naming the trap).
- llm client's empty-response error now reports stop_reason + returned
  block types and hints "raise maxTokens" when stop_reason=max_tokens.
- Live-verified on proj_c55cfce5: draft returns a timed cue list; the
  timelapse span correctly gets a single bridging line.

Same PR fixes the deploy wedge that took the droplet down twice:

- /api/deploy's detached child was still the app's process-tree child,
  and pm2 kills by walking ppids -- a reload mid-deploy SIGINT-killed
  `npm ci`, leaving a half-built dist crash-looping. The deploy is now
  double-forked (setsid + nohup) so it re-parents to init. Proven live:
  the first post-merge auto-deploy (old code) died at its own pm2
  reload; the second (new code) ran through reload to completion.
- New health watchdog, installed idempotently by deploy.sh: pm2
  max_memory_restart 1200M + an every-minute /etc/cron.d probe of
  /health. Escalation: 3 straight misses -> pm2 restart; 2 restarts
  without recovery -> full `deploy.sh master` under flock (the only
  cure for a corrupted dist). Any healthy probe resets the ladder.
  Log: /var/log/mp-watchdog.log.

## Revise-an-element works on speaker films (Marc, 2026-07-20)

Marc highlighted the PiP bubble, typed "can you make this even smaller?",
and got "Error: API error 400". Root cause: reviseScene only knew two
editing primitives -- patch a CODEGEN component's source, or edit an
st- TEMPLATE's slots. Speaker films are neither: pure library-component
compositions (screencast-frame, narration-track, gradient-background),
so EVERY element revise on a speaker film 400'd with "no codegen
component to revise". (The Studio also swallowed the body and showed
only the status code.)

- New third primitive: library-component DATA revise. A click that
  resolves to a library component maps the instruction onto that
  component's schema-constrained data (same LLM contract as template
  slots, incl. the _note escape hatch), MERGES new over old (a dropped
  key must never delete video_url -- that key IS the film), saves, and
  re-assembles the preview.
- Routing is now an exported pure function (resolveReviseTarget):
  element hit on a library comp -> component-data; codegen comp ->
  source patch (unchanged); st- -> slot revise (unchanged); else an
  instructive error naming the scene's components.
- Studio sends the resolved compId with the element payload, and api()
  now surfaces the server's error body instead of "API error N".
- Regression suite: test/scene-revise.test.ts -- routing matrix, LLM
  guardrails (schema echoes, garbage JSON, dropped keys), the on-disk
  component-data path with a mocked LLM, and source guards on the
  Studio template literal (compId in payload, data-cid reading, error
  body surfacing).

## Multi-tenancy phase 1: enforcement (Marc, 2026-07-20)

Analysis for the multi-tenant push found the system was multi-tenant in
storage only: authMiddleware resolved WHO you are, then every API route
took the tenant from the URL and every MCP tool from a plain tenant_id
param -- nothing compared them. Any logged-in user could read/write any
tenant. (Also: Jacob's OAuth tenant HAD been created correctly --
jacob-getquotient-ai in _system/tenants.json; it looked missing because
tenant DIRECTORIES are created lazily on first write, so `ls` of the
data dir misses login-only tenants.)

- Single choke point in index.ts after authMiddleware: every
  tenant-scoped /api route (tenant = first segment; revise/undo nested)
  403s unless the token's tenant matches. "*" is the new ADMIN scope
  (AUTH_TOKENS entry like "opstok:*") for cross-tenant operator tooling.
  ADDING A ROUTE: register it in the alternation (or, if tenant-less,
  in the test's allowlist) -- test/tenant-enforcement.test.ts scans the
  source and fails on unregistered /api routes.
- MCP tools now act on the SESSION's tenant: /mcp stamps req.auth, the
  SDK surfaces it as extra.authInfo, and a tenant-enforcing tool()
  wrapper overrides params.tenant_id with it (param still honored for
  admin/stdio-dev sessions, where it is required). tenant_id is now
  optional in every tool schema -- authenticated users stop passing it.
- Job routes (no tenant in URL): list is forced to the caller's tenant;
  single-job GET and wait answer 404 for a foreign tenant's job (job
  existence itself is cross-tenant information).
- Closed while auditing: /assets/_system/* served UNAUTHENTICATED --
  including _system/tenants.json (user emails/names) and deploy.log;
  now only _system/cache/ (music bed cache) is served. Tenant registry
  path now follows config.dataDir instead of a hardcoded
  /data/media-producer.
- Deploy note: static tokens in AUTH_TOKENS now really scope to their
  mapped tenant (DEPLOY.md documents preview123 -> marc-getquotient-ai).

Phase 2 (next): "Sign in with Google" in the recorder extension via the
server's existing OAuth PKCE endpoints -- zero fields in the popup, the
session's tenant does the rest.

## Multi-tenancy phase 2: extension "Sign in with Google" (Marc, 2026-07-20)

The bar, verbatim: "in the extension there will be nothing the user has
to enter besides logging in. I don't want to even show the tenant id or
url of the droplet or anything."

- Popup is now zero-field: signed-out shows one "Sign in with Google"
  button; signed-in shows an avatar/name/email card with Sign out. The
  record button is gated on auth (and upload terminal states cannot
  re-enable a signed-out popup).
- The extension registers itself as an OAuth client of the server's
  EXISTING surface (RFC 7591 /register, /authorize backed by Google,
  /token with PKCE + rotating refresh) -- no new server code. Flow:
  chrome.identity.launchWebAuthFlow -> code+state to the pinned
  chromiumapp.org redirect -> /token exchange -> /auth/me for
  email/tenant.
- After sign-in the account is mirrored into the SAME sync settings the
  recording pipeline has always read ({server, tenant, token}), so
  capture/upload/generate paths are untouched. The 24h JWT silently
  refreshes before auth-status renders and before every take starts.
- Server URL is baked into the build (users never see it). Manual-token
  installs are grandfathered as a "(configured token)" signed-in state.
- Manifest 0.9.0 (+"identity" permission); zip rebuilt (served at
  /extension.zip). Regression: test/extension-auth.test.ts guards the
  zero-field contract, PKCE/state/refresh wiring, and settings mirror.
- Same-account-everywhere now holds: MCP login and extension login are
  the same Google identity -> same tenant (enforcement from phase 1).

## Tenants visible from first login + admin listing (Marc, 2026-07-20)

- First OAuth login now eagerly scaffolds the tenant on disk
  (projects/, brand-kit/assets/, components/) -- lazily-created dirs
  made login-only tenants invisible to `ls`, which is exactly how
  Jacob's (correctly created) tenant read as missing. Naming stays
  slugified full email: marc@getquotient.ai -> marc-getquotient-ai,
  jacob@getquotient.ai -> jacob-getquotient-ai.
- GET /api/tenants (admin "*" scope or deploy token ONLY): registry
  entries merged with on-disk state -- tenant_id, email, name,
  created/last-login, on_disk, project count. Replaces the ls
  heuristic.
- Extension: removed the grandfathered manual-token path (Marc: only
  him + Jacob use this; no backwards compatibility wanted). Sign-in is
  now the only way in.

## Studio: session login, tenant field gone (Marc, 2026-07-20)

"If I am logged in as the right user shouldn't I be able to just use
studio without passing in tenant and token every time... I don't even
want to see that field at the top of studio anymore."

- Google login now sets an HttpOnly SameSite=Lax session cookie
  (mp_session, 30 days) and redirects back into Studio; extractToken
  accepts it alongside Bearer/?token=, so the whole API works
  cookie-authenticated. /auth/logout clears it (Sign out link in the
  header chip). return_to is constrained to on-site paths.
- A BARE /studio now just works: boot asks /auth/me (cookie), resolves
  the session's tenant, loads its projects; signed out -> bounce
  through Google and straight back. Share links with ?tenant=&token=
  still work and win when present.
- The Tenant field and Load button are GONE from the Studio header --
  replaced by the project picker plus a signed-in chip (avatar, email,
  sign out). Tenant is never typed anywhere anymore: MCP, extension,
  and Studio all derive it from the login, with phase-1 enforcement
  underneath.

## Extension badge: the take's status at a glance (Marc, 2026-07-21)

Marc: "the extension has a little 'rec' on the icon... what else can you
add to that little icon?" The badge is now a full state machine:

- Armed: amber "•" (click the page to start).
- Recording: a TICKING elapsed clock (M:SS red; >=10min "12m"). The
  offscreen document is the 1s metronome -- it is alive exactly while a
  take is, and its ticks also keep the MV3 worker from idling out.
- Paused: "⏸". Chapter mark (⌘⇧N): flashes "⚑" 1.2s so the keystroke
  visibly landed, then the clock resumes.
- Uploading: live percentage (blue). Assembling: "⋯" (indigo).
  Ready: "✓" (green). Failed: "!" (red). Opening the popup
  acknowledges terminal states and clears the badge.
- The tooltip always carries the long-form state (hover the icon).
- Extension 0.9.1; zip rebuilt; source guards added to
  test/extension-auth.test.ts.

## Screen-owned film clock (Marc, 2026-07-21)

Live report: a screen-only recording (no speaker) stayed 3:25 after Marc
cut it down to ~1:45 -- the scene kept its stale recorded duration and
the tail rendered as a long dead hatch. "Shouldn't the whole video get
shorter?" Yes:

- New concept: screenOwnsClock(project) -- true when nothing
  audio-anchored exists (no speaker clips, no voiceover; music alone
  doesn't anchor). In that world the footage IS the film clock.
- contractSceneToEdl: after every media-edit op, legacy segments save,
  and timelapse apply/remove, a screen-owned scene's duration_seconds
  becomes the EDL's natural output length (kept footage at its rates;
  clearing all edits restores the source duration). Speaker films NEVER
  move -- audio must not shift when footage is edited.
- Studio applies the contracted duration from the op response
  (scene.duration_seconds + totalDuration) before restarting the
  preview, so the ruler, hatch, and total time agree immediately.
- Regression: media-edl.test.ts covers the ownership predicate, the
  contraction math (cuts, rates, restore, speaker-film immunity), and
  that a plain cut solves to kept-footage length with no pad/hold.
  Route-level verified locally: add_cut 60..120 on a 205s scene ->
  duration 145; clear -> 205.

## Camera parity: pan + rotate join zoom in Studio (Marc, 2026-07-21)

Marc: "bring panning and rotate up to parity with zoom and callout" --
we're not only making product walkthroughs; tempo-cut films live on
camera language. The ENGINE always supported zoom/pan/rotate/reset (the
generation pipeline places them); only hand-authoring was zoom-only.

- Revise popover on any element now offers "→ Pan here" and "↻ Rotate"
  next to the zooms. Pan glides the focal point to the element keeping
  the current zoom; the first move in a scene carries its own 1.4x
  (runtime change: pan/rotate honor an explicit m.scale -- a 1x pan is
  invisible). Rotate tilts 8 degrees by default.
- The effects-lane block popover gains an angle field (rotate, +/-45)
  and shows scale for every non-box move; blocks already rendered with
  ↔ / ↻ glyphs.
- One camera runtime (cameraMovesScript) serves preview AND render, so
  no twin drift.

## 3D aside: frame tilts away, words type in, camera returns (Marc, 2026-07-21)

Marc: "take the entire browser frame, rotate it in three dimensions off
to the side, making room on the left where I could type in some words...
then have the thing pan back and fill up the entire screen."

- New camera move type "aside" (types.ts + cameraMovesScript): the
  frame's own component wrapper tilts in real perspective (rotationY,
  transformPerspective 1600, slight scale-down, slide toward the far
  side); brand-styled words TYPE ON character-by-character in the
  cleared third (word-grouped so lines never break mid-word); the words
  exit and the frame glides back to full screen. Captions, bubble and
  backdrop stay level -- asides never join the 2D rig groups.
- Studio: "◧ Aside + words" button in the revise popover (video
  selected) places one at the playhead; its ◧ effects-lane block edits
  words, side (left/right), timing, hold, scale, return.
- Verified headless: matrix3d mid-move (real z-rotation), 27 chars
  typed on, words gone before the return, frame back to visual
  identity after. One camera runtime serves preview and render.

## Composable primitives: 3D rotate + text, aside retired (Marc, 2026-07-21)

Marc, on reviewing the aside: "I would rather see if I can just simply
make rotate more robust and then use the existing tools to add the
text in." Right call -- the aside was a macro pretending to be a
primitive. Now:

- ROTATE is fully 3D: axis knob on the block (z = flat spin, y = 3D
  book-page turn, x = 3D tilt), plus a signed shift (canvas %) that
  clears space beside/above the tilted frame, plus scale. Non-z axes
  get perspective automatically; return/reset flatten rotationX/Y too.
- TEXT is a primitive: "T Add text here" in the revise popover drops a
  real kinetic-text component (type-on entrance, brand-styled) at the
  playhead where you clicked, with its own start time. Because it is a
  component, the existing tools take over: click it to revise ("make
  it bigger", "change the words") or Remove (new button when a
  kinetic-text is selected). New routes: POST/DELETE
  /api/projects/:t/:p/scenes/:sid/components (choke-point guarded).
- Marc's scene is now a recipe, not a feature: rotate(y, -26deg,
  shift 18%) + text at the playhead + return.
- The ◧ Aside button is gone; its runtime + block editor stay so any
  placed blocks keep working. Headless-verified: the 3D rotate
  produces the identical mid-move matrix3d the aside did.

## 3D rotate gets assertive; aside fully removed (Marc, 2026-07-21)

Marc on the first 3D rotate test: "the rotation is not really getting
out of the way -- I would have expected a greater tilt, greater slide.
Also, did you leave the aside effect in there?"

- The aside is now fully gone: type, runtime, block-editor fields,
  glyph. (No projects carried aside moves; verified before removal.)
- 3D rotate defaults are ASSERTIVE: on axis y/x, the neutral values
  (angle 0, shift 0, scale 1) read as "untouched" and upgrade to a
  real turn (-26deg), a real slide (18% away from the receding edge)
  and a step back (0.86). Any deliberately set value is honored. The
  block editor mirrors this: switching axis to y/x autofills the
  preset into still-default fields so what you see saved is what
  plays. Marc's existing y-axis blocks upgrade automatically.

## Pan is never a no-op (Marc, 2026-07-21)

Marc: "I hit pan and nothing happens." Root cause: pan was defined as
"move the focal point at the CURRENT zoom" -- and at 1x (the camera
returns to wide after most moves) a pan is mathematically nothing: the
whole frame is visible and the cover-clamp pins motion to zero. The
add-a-scale heuristic only fired when the scene had no earlier moves,
so any scene with existing camera work authored invisible pans.

- Authored pans always carry their own zoom (1.4x, editable on the ↔
  block) and the runtime guarantees the floor for any pan without one:
  glide at the current zoom when pushed in, drift in at 1.4x when
  wide. A pan now ALWAYS moves.
- Chaining pans glides the camera point-to-point while zoomed --
  Marc's "pan over to that box" model without a new gesture. A
  draw-a-box pan target (a la Zoom inside) remains an option if
  clicking elements isn't precise enough in practice.

## Pan is a peer effect + drag gesture + parallel lane bars (Marc, 2026-07-21)

Marc's design, refined over two rounds: (1) pan's gesture is DRAGGING
the picture to a new spot -- a box is zoom's metaphor, pan is
movement; (2) pan and zoom are SEPARATE effects, unaware of each
other, that may run at the same time (a pan riding a zoom's hold);
(3) when two effects overlap in time, the effects-lane bars split the
height and run in parallel -- peers should look like peers.

- Runtime (cameraMovesScript): a pan resolves at its tween's FIRST
  RENDER, not at build time. It adopts whatever scale the camera
  holds at that moment (a holding zoom keeps its zoom; a wide camera
  gets the 1.4x floor so motion is never invisible) and its return
  restores the PRE-PAN framing -- never yanking a still-holding zoom
  back to wide. The zoom's own return still carries the camera home
  from wherever the pan left it (GSAP return tweens read live state).
  Headless-verified: pan inside a 2.5x hold glides at 2.5x to the
  focal, returns to the zoom framing, zoom return lands identity;
  bare pan floors at 1.4x with the cover-clamp.
- Studio gesture: the ↔ Pan button (element AND scene popovers) ARMS
  grab-drag mode -- drag the preview footage where the camera should
  look (maps convention: the picture follows the cursor), release
  drops the pan block at the playhead. Live feedback rides the real
  camera rig (scene root stands in when no rig exists yet); a wide
  camera snaps to 1.4x on grab so the drag previews the truth. Esc
  cancels and restores. Saved drag-pans carry NO scale -- the block
  editor shows scale as "auto" (blank = adopt at fire time).
- Effects lane: blocks are collected then laid out; transitively
  overlapping blocks cluster, get greedy row assignment, and each
  concurrent block renders at 1/n of the 26px bed (.fx-thin) --
  parallel effects read as parallel bars. Generalizes past two but
  two is the practical case.
- Tests: test/camera-pan.test.ts pins the fire-time contract, the
  no-scale drag-pan, the dual popover entry, the lane split, and
  syntax-parses the generated Studio JS (the template-literal trap).

## Pan v3: pure translation + pan-inside (Marc, 2026-07-21)

Marc: "when I pan, it seems to also be zooming... I don't think we
should be doing [the 1.4x]" and: should pan get an inside variant to
match zoom-inside? Yes to both.

- Pan NEVER zooms. The 1.4x floor is deleted everywhere -- it was a
  leftover from the click era, when invisible pans were a FEEDBACK
  problem patched with forced zoom. The runtime tweens x/y only (a
  scale on the move is ignored), the drag saves no scale, and the
  block editor has no scale field for pans (and strips scale from
  legacy pan blocks on save).
- A wide (1x) camera has nowhere to pan: the cover-clamp pins the
  motion to zero and that no-op is the HONEST answer. Studio says so
  the moment you grab at wide ("add a zoom, then drag during its
  hold") instead of faking motion.
- ⊕ Pan inside…: zoom-inside's sibling, shown when the selection is
  (or contains) a video. Same grab-drag, aimed at the footage inside
  the frame -- travel across a magnified recording without moving the
  browser frame. Requires an inside-zoom first (the grab says so);
  the saved move carries the same video[src*=...] target zoom-inside
  uses, feedback rides the content rig, and the frame's crop masks
  the travel (clamped to the footage's own range).
- Scene-pan feedback now targets the SCENE rig specifically
  (:not(--content)) so an in-video rig can't stand in for the camera.
- Probe re-verified: pan inside a 2.5x hold still glides at 2.5x and
  returns to the zoom framing; a bare pan on a wide camera measures
  identity throughout (deliberate no-op).

## Pan inside falls back to the scene zoom (Marc, 2026-07-21)

Marc, zoomed on the composer via a SCENE zoom, clicked Pan inside and
was told "nothing to pan inside yet" -- technically correct (the
footage inside the frame wasn't magnified; only Zoom inside... does
that), humanly wrong (he was looking at a zoomed picture). "Pan what
I see" wins: when Pan inside finds no magnified footage but the scene
camera IS zoomed, the grab falls back to a scene pan with a status
note explaining the switch. The refusal now only fires when nothing
is zoomed at all (and mentions scrubbing into the zoom's hold as the
other likely miss).

## Pan reads the lane, not just the pixels (Marc, 2026-07-21)

Marc, with a genuine Zoom inside... block AT the playhead, clicked
Pan inside and was told nothing was magnified. Root cause: the grab
checked the DOM's current instant, and at a zoom block's own start
the rig hasn't eased in yet -- measured wide, refused, and my status
message then misdiagnosed his zoom as scene-level (it was targeted;
verified in proj_c55cfce5's data). The author's intent lives in the
LANE, so the grab now resolves in priority order:
 1. a zoom whose window (ease ramp included, plus a 0.75s pre-window)
    covers the playhead -> RIDE IT: preview jumps to its settled
    framing, the drag happens in the frame the pan will play in, and
    the saved pan's at is nudged to just after the zoom settles so
    the two run parallel (targeted zoom -> inside pan on its target;
    scene zoom -> scene pan);
 2. the rig the button asked for, magnified now;
 3. the other rig, magnified now ("pan what I see", with a note);
 4. a settled zoom window from the data (DOM read misfired);
 5. honest refusal, now mentioning "scrub onto a zoom block".
Also: readXf reads scale/x/y through the iframe's gsap.getProperty
(with matrix AND matrix3d parsing as fallback) -- computed-style
regex parsing missed the matrix3d serialization transforms take
during playback.
## Scripted surfaces: performances survive storyboard → codegen (Marc, 2026-07-22)

Regression test (regenerate the Claude-connector tempo cut from one prompt,
proj_1031fb41) vs the hand-built original (proj_0890a34e): the new film's
mocks arrived FROZEN — static end-state data (progress 3/3, tool calls
already green), no typing, no firing, and the two Quotient scenes hand-rolled
+ failed gates at -46. Root causes, all structural:

- The storyboard's `components` was a STRING array — the prompt said "put the
  full interaction sequence in data.script" but the schema had nowhere to put
  it outside `scene_template.data`, and the sanitizer flattened any object to
  its type string.
- `buildCodegenSpec`'s Component Schemas section listed data fields but never
  `script_actions` — codegen literally never saw that a surface could perform.

Fixed (fix 1+2 of 3; deterministic critique gate deferred):
- `components` entries are now string | {type, data} end to end (DraftScene,
  StoryboardScene, sanitizer keeps authored data, template-assign skips
  scenes carrying it, pipeline helpers normalized). Storyboard prompt +
  tempo-cut contract: performable mocks MUST be staged as objects with a
  timed data.script (static_surface = blocking).
- Codegen spec now carries a "Storyboard-Authored Component Data (embed
  VERBATIM)" section + 🎬 PERFORMABLE schema blocks with the full action
  vocabulary; system prompt: performable surfaces arrive MID-PERFORMANCE.
- Scene-generator enforcement extended: an authored script that doesn't
  survive into the scene HTML triggers the corrective retry (same mechanism
  as the zero-<component>-tags check).
- test/scripted-surfaces.test.ts covers the pass-through.

## Authored compositions skip codegen (Marc, 2026-07-23)

v3 rerun postmortem: with scripts flowing (see previous entry), the mock
scenes STILL shipped broken -- codegen's only remaining job was layout and
it sized a cowork mock 2545px wide inside a 1719px clipping card (content
painted off both edges, rail clipped to "Outpu"/"Cont", 3 revision rounds
burned re-inventing the framing). Marc: hand-built films work because hands
write structured component scenes, not HTML.

- New deterministic path in scene-generator: when every non-backdrop
  component hint is an authored object (data + scripts) the scene is
  instantiated directly -- components with the standard inset framings
  (quotient trio recipe: shell 1.2%/2% 97.6%x96% + center 61.5% + chat
  30.5% with show_panel:false; single window 8%/6.5% 84%x87%), webgl
  backdrop world, ids = types so authored camera anchors resolve, marked
  scene.authored_composition.
- Critique loop + editorial fix pass treat authored compositions like
  template scenes (boot gate only; regen would rebuild the same scene).
- Instant instead of minutes per mock scene; immune to codegen drops.

## Studio structure: badges + inspector + scene focus mode (Marc, 2026-07-23)

Marc: should Studio expose what scenes are made of? Yes -- the data IS the
film now. SPEC-studio-structure.md; rule: structure on the side, time on
the bottom, film-wide lanes only for film-wide things.

- Scene chips: provenance glyph (▦ template / ⬒ composition / ✦ custom)
  -- tells the user how the scene edits before they touch it.
- Inspector drawer (header ⬒ Inspect): scene cast as a tree + the
  resurrected typed prop editor (it was fully built and disabled --
  els.propEditor just had no DOM home). script arrays render as ordered
  at+action+text rows. Saves ride the existing component PATCH.
- Scene focus mode (dblclick a chip): timeline becomes the scene's own
  clock -- row per component, bars enter.at..exit.at with draggable
  edges, script diamonds draggable, beat gridlines with snap. Custom
  scenes render one opaque bar. Every drag is an ordinary PATCH, so
  Studio and MCP edits stay one system.
- animationSchema accepts `at` (assembler honored it since the motion
  architecture; the zod schema silently stripped it).
- Live-verified on proj_fa58e846: 8▦+5⬒ badges, inspector tree +
  7 script rows on the cowork scene, focus lane with 7 diamonds and
  3 beat gridlines on the 13.5s scene clock.

## Authored-layout intelligence + film continuity pass (Marc, 2026-07-28)

Marc on the e2e world film: "generally looks kinda like crap... things
are not lined up correctly... looks like a bunch of separate scenes."
Root causes: the authored-layout fallback stacked every recipe-less
component into the SAME 84% inset (scene 6: stat-card + kinetic-text
center-collided), and nothing enforced cross-cut continuity (cursor cast
in 7/8 scenes with broken handoffs). "Implement them both."

- authoredLayout is now per-INSTANCE and role-aware (scene-generator.ts):
  captions (kinetic-text/annotation/typewriter/caption-*) and heroes
  (stat-card/number-counter-row/headline-carousel/hero-reveal/quote-block)
  never become windows. One surface + copy -> window docks left 58%, copy
  stacks in a real right column; recipes/pairs + copy -> lower-third band;
  no surfaces -> heroes center stage, captions lower third; 3+ recipe-less
  surfaces -> even row, never a stack. ghost-type full-stage z4 (behind
  windows), floating-pills full-stage z38, storyboard-authored backdrops
  DROPPED in world films (one world, one backdrop). Same-type instances
  get unique ids (type, type_2...) and distinct frames. All prior recipes
  (trio/pair/84% inset/accent corners/cursor overlay) pinned unchanged.
- New deterministic continuity pass (src/llm/continuity.ts,
  enforceFilmContinuity) runs in pipeline.ts the moment the scene list
  exists: (1) MATCH-CUT PINNING -- consecutive authored scenes sharing a
  surface type get the later instance pinned to the earlier frame +
  data.match_cut stamped, skipped when the inherited frame would bury a
  sibling column; (2) THE ONE HAND -- cursor-performer capped to the
  first consecutive chain (max 4 scenes), the rest removed, handoffs
  repaired so scene N's first path point = scene N-1's last.
- test/continuity.test.ts (12 tests) pins all of it.
- Post-ship addendum (same day): WORLD INK CLAMP -- the verification
  film exposed storyboards authoring dark-era caption ink (#f5f6fa) on
  the light world (invisible headline). Authored comps skip codegen
  contrast gates, so buildAuthoredCompositionScene now deterministically
  clamps caption/hero ink that matches the world's lightness (or is
  absent on a light world) to the world's ink (brand text / #f5f6fa).

## Off-canvas + text-collision gates; deterministic payoff/close (Marc, 2026-07-28)

Marc on the verified film: scenes 6-7 (the codegen tail) had "some overlap
and some misplacement... the start free trial thing sort of under the
bottom of the canvas." The deterministic path is now the quality path; two
fixes shrink codegen's blast radius:

- Layout probe (capture.ts) now reports offCanvasContent (buttons/media/
  panels/text hanging >=25% past a canvas edge, or buttons/media parked
  fully outside but near -- the CTA-below-the-fold class was invisible to
  every gate because onCanvas() skipped such elements before any check)
  and textCollisions (two text elements overlapping >=40% where neither
  contains the other -- sibling copy on sibling copy). measureLayout
  aggregates both with >=2-probe persistence (entrance/exit transients
  don't count) and emits blocking off_canvas_content / text_collision
  defects; pipeline maps them into the critique loop.
- Tempo-cut storyboard contract: THE PAYOFF BEAT is deterministic
  (stat-card / number-counter-row object -- the layout engine now gives
  heroes center stage), THE CLOSE is a template (st-logo-close), and
  OBJECTS, NOT STRINGS (one plain-string hint silently dropped a whole
  scene to the codegen path this grammar forbids).
- test/layout-gates.test.ts: 4 live-browser gate tests + 2 source guards.

## Editorial grammar + HyperFrames block parity (Marc, 2026-07-28)

Marc on the HyperFrames catalog film (miguel07code's X post): our tempo-cuts
lack that polish; the reference tells its story in huge rolling serif type
alternating with motion-graphic evidence. "Yes build it" + port the missing
blocks. Frame-by-frame analysis showed the polish is typography + grammar,
not block count (our caption family is already 1:1 with theirs).

- NEW FILM GRAMMAR "editorial": typography-first manifesto dialect --
  st-statement beats (huge display-serif thought, ONE *starred* word in
  gradient italic, cream/near-black canvas) ALTERNATING with full-bleed
  evidence beats. Registered end-to-end: creative-director FilmGrammar +
  prompt, storyboard contract (THE ALTERNATION / TEMPERATURE IS RHYTHM /
  ONE EMPHASIS PER STATEMENT / EVIDENCE PERFORMS / KICKERS AS CHAPTERS),
  server zod enum, pipeline policy (component-first creativity clamp 0.15,
  music bed default ON -> bar quantization via the shared music-first prep).
- st-statement scene template: Instrument Serif (Google font, system-serif
  fallback), *emphasis* -> gradient-italic span, data.lines rolling
  sequences (each thought rises from a line mask, holds, rolls up and out),
  themes cream (default, 'light' aliases) / dark (the chapter flip), no
  webgl backdrop ever injected (it paints its own canvas).
- SHADER TRANSITIONS: engine already had 9 gl-transitions + ~20 GSAP types
  (Marc was right to be surprised) -- they just weren't in the scene
  contract. Added 6 new GLSL shaders for HyperFrames parity
  (shader-flash-white, shader-light-leak, shader-gravitational-lens,
  shader-thermal, shader-domain-warp, shader-ridged-burn) and exposed the
  FULL shader family + whip-pan/cinematic-zoom/push in the SceneTransition
  union + storyboard vocabulary.
- NEW BLOCKS (agent-built, conventions-checked): lower-third (8 broadcast
  presets: clean-bar, accent-underline, bold-block, color-block, dark-card,
  kicker-name, mask-reveal, soft-pill), terminal-run theme presets (8
  macOS-Terminal-inspired: pro, ocean, red-sands, homebrew, novel,
  silver-aerogel, grass, clear-dark via CSS-var retune), map-route
  (stylized dot-matrix world/US map with bezier route arcs + pulsing
  markers), device-showcase (CSS-3D iPhone/MacBook/duo glamour shells with
  screenshot slots + float).
- Tests: editorial.test.ts (9), hyperframes-blocks.test.ts (4),
  hyperframes-blocks2.test.ts (6). Full suite 568 passed (same 4
  pre-existing env failures). st-statement proof frames captured
  headlessly: cream + gradient emphasis + dark variant all correct.

## Shot-per-shot recreation round 2: fidelity fixes (Marc, 2026-07-28)

Marc: "I don't think what we built looks like the reference video shot per
shot at all." He was right -- the first pass sampled 12 stills of a
~28-shot sub-second montage and called it shot-per-shot. Round 2 rebuilt
against the definitive 3fps shot list (28 shots incl. X-post card, phone
trio, 52-counter pair, Spotify card, npx line, 01-04 step sequence,
build-up checklist, 5 category cards, github URL) and forced out real
product fixes:

- MICRO-SHOT ENTRANCE COMPRESSION (scene-assembler): component entrances
  are authored for 4-8s scenes; sub-1.4s cuts sampled EMPTY. Scenes
  <=1.4s now play each component timeline at 2.2/duration speed.
  + scene-cache CACHE_VERSION bump (assembler changes now bust the cache;
  a stale 273ms "re-render" proved they didn't).
- glass-shard-wall (threed): three.js beveled glass mosaic with teal
  text ghosting through -- the reference's one build-from-scratch visual.
- vignette-spot (effects): radial ellipse wash (category-card backdrop).
- code-block style:"bare" (+font_size/color): naked mono lines on the
  scene canvas -- terminal-line beats and checklists were invisible
  dark-on-dark inside the window chrome.
- kinetic-text font_size: hero numerals ("52" at 16vw) vs the 60px
  caption default.
- flowchart FIT TO THE SHOT: the 5s draw choreography now scales to
  complete by ~55% of the scene -- micro-shots show the whole tree.

## Recreation closed: 28-for-28 + settled entrances (Marc, 2026-07-28)

The HyperFrames catalog recreation (proj_3acdc1c8) reached visual-twin
state and Marc closed the arc. Final rounds (PRs #535-#539):

- Typography/scale controls: kinetic-text font/letter_spacing/font_weight/
  accent_color/align; st-manifesto data.uniform (no small-word shrink);
  x-post-card + spotify data.scale. GOTCHA FOUND: an inline CSS transform
  scale was silently overwritten by the first GSAP tween touching scale --
  display scale must be folded into the tween values themselves.
- spotify-now-playing layout:"card" (portrait hero: big square art +
  note glyph + Spotify badge); x-post-card count-ups parse K/M suffixes
  ("2.3K" ticked to 2 before); flowchart per-node color chips (sticky-note
  style, auto text contrast) + edge_color; device-showcase screen presets
  (app-hero/app-stats/app-chart) + data.rotate for fanned trios;
  glass-shard-wall cool silver-blue palette + text_front.
- PACING: Marc "seems much faster than the original" -- two real causes:
  15fps preview choppiness (production 30fps fixed most of it) and four
  scene durations diverging from the reference cut rhythm (matched; film
  now 24.2s vs ref 24.1s, cut-for-cut).
- SETTLED ENTRANCES (scene.entrance:"settled", PR #538): assembler plays
  each component timeline's [2.2s, 2.2s+dur] window via tweenFromTo --
  hard cuts land on STANDING content (entrances/count-ups resolved,
  ambient still running). ctx.duration deliberately NOT extended: the
  components' `duration > 2` exit guards keep exits out of the window,
  which also limits the flag to scenes <= 2s. CACHE_VERSION 4. Applied to
  the 25 hold shots; the glass wall drift + checklist build stay animated.
- Operator playbook now carries the four-grammar cheat sheet (product
  demos the product = tempo-cut; words carry the argument = editorial;
  one cinematic world = launch-film; human on camera = speaker-screencast)
  so driving agents ask the right question and pin film_grammar.

Next up (Marc's backlog): Studio scrubber component bars always visible
(design the density problem), narration/script-from-video test+fix pass,
Studio aesthetic polish.

## Auto-fix loop: gate defects become data repairs (2026-07-31)

Component-assembled scenes (speaker films, takeovers, most of tempo-cut,
data-story and social-reel) have no codegen source, so every gate finding
shipped as `quality: {passed:false, attempts:0}` -- an honest measurement
nobody could act on. `src/core/scene-repair.ts` (PRs #584, #585) turns the
findings into deterministic DATA patches, applied inside a
measure -> repair -> re-measure loop in the authored branch of
`pipeline.ts`, bounded by `maxRetries`. The stamp is now honest in both
directions: `passed` can be true, `attempts` counts repair passes, and a
`repairs` log says what was changed.

The table (each family derived from a repair performed BY HAND earlier in
the session, then re-derived from the first live run):
- clipped_text / off_canvas -> font_size x0.8 + container height x1.5
- off_canvas_content -> clamp the box back inside (full-bleed exempt)
- illegible -> repaint `data.color` from the backdrop luminance the gate
  measured: < 0.18 -> #ffffff, else #101014
- dead_entrance -> entrance = "settled"
- dead_frame / empty_moment -> enlarge the primary surface x1.3 (94%/80% caps)

Deliberately NOT patched: intent_mismatch, empty_skeleton, stray_ui
(judgment -- a data patch cannot make a scene mean something different),
and contrast INSIDE a component's own chrome (quotient-social's "Likes"
label at 2.59:1) -- no scene-data color exists there, so claiming a fix
would be a lie. Those stay reports.

FIRST LIVE RUN (proj_0a31e568, social-reel, 7.7 min): scene 5 came back
`attempts:2` with four repairs -- the loop works -- and the report was a
to-do list. `illegible` was 8 of 13 unresolved findings and had NO patch
(added, above; `measureTextContrast` now reports `backdropLuminance`).
Two real bugs: the loop asked `bg` for a border (a backdrop is SUPPOSED
to melt into the page) and grew a `sticker-prop` 36% -> 60% to fill a dead
frame while the subject stayed small. Backdrops and props are now excluded
from both patches. `COLOR_CAPABLE` is a verified list, not a guess --
grep `data.color` in src/components.

### Per-stage wall clock (#39 prerequisite)

`createStageTimer` in `pipeline.ts` times every stage off the single
onProgress callback (injectable clock, only closes on an actual CHANGE of
step) and attaches `stage_timings` to PipelineResult, which the generate
job returns verbatim. 20-minute generates were previously unauditable:
percentages, never durations.

### Open, needs a decision (not a patch)

`assembled-scene-gates` -> st-statement measures 13% content coverage
against the layout gate's 16% floor and takes a `dead_frame` badge. Fails
identically on master, and only surfaces where a real browser exists --
i.e. it is live on the droplet. The editorial grammar's deliberate
negative space and the gate's coverage floor genuinely disagree.


### Round 3: the loop's own two bugs (proj_de47d492)

The second live run fired repairs on 5 of 7 scenes -- and both new
behaviours were wrong.

1. **invisible_surface was a NO-OP.** It set `data.border`/`data.shadow`
   and logged "border + shadow requested". It fired on five scenes, the
   defect survived every time, and the reason is flat: **not one component
   in the library reads `data.border`** (grep it). A patch that writes data
   nothing consumes reports a repair that never happened -- strictly worse
   than the badge it replaced. The patch is DELETED; a ghosting panel's
   fill lives inside the component.
2. **A clipped run got shrunk four times in one pass.** One overflowing
   line reports as several clipped_text defects (the gate samples the
   truncation at different widths) and each patched the SAME component:
   32px -> 16.38px, 15% -> 60% tall, still clipped. Now ONE patch per
   component per pass, then re-measure. And text also reported
   `off_canvas_content` is skipped entirely -- it sat 51% past the LEFT
   edge, which no font size can fix.

THE RULE, recorded at the top of scene-repair.ts: never add a patch
without first verifying the component actually reads the field.
COLOR_CAPABLE exists for exactly this reason.

### The real remaining defect is the component library, not the scenes

Across both runs the surviving findings are overwhelmingly the Quotient
mock components' own chrome: quotient-chat's "Type a message..." at
2.59:1, its checklist rows at 1.32-1.40:1, quotient-campaign's tab labels
("Brief"/"Tasks"/"Deliverables") at 3.5:1, quotient-social's "Likes" at
2.59:1, and `div.qch`/`div.qch-composer` panels at 1.1-4.5% lightness
separation (needs 8%). No scene-data patch can reach any of it. This is
the next real piece of work.

### #39 answered by the first stage_timings

proj_de47d492, 515s total: storyboarding 225.3s (44%), scenes 140.7s
(27%), concept 62.5s, media 49.9s, editorial 36.3s (7%). The editorial
pass -- the thing #39 assumed was worth cutting -- is the SMALLEST LLM
stage. The storyboard builder is the target.

### Round 4: the accent word (proj_0b762363)

Verification 3 confirmed round 3 -- zero border no-ops, the shrink ran ONCE,
and the contrast patch fired for real on a live film:
`kinetic-text: color -> #101014 (backdrop luminance 0.996)`. It also showed
one more gap.

`Every *word*, written.` reports as TWO runs: the base "Every , written."
at 1.01:1 and the accent "word" at 2.53:1. Neither is a substring of the
authored line (the stars, and the accent span being its own text node), so
componentCarriesText matched neither -- and `*starred*` words take the brand
PRIMARY rather than `data.color`, which on a near-white page is its own
defect. Fixed: text matching falls back to word overlap (all needle words
present, at least one >= 4 chars) and strips the star markers, and a repaint
sets `accent_color` too. Legibility over mood is codegen non-negotiable #1.
Substring matching now requires >= 3 characters -- "on"/"to" appear inside
almost any line by coincidence, and repainting a headline off the back of
that would be a guess.

## #43 + #39: the two fixes the auto-fix arc pointed at (2026-08-02)

### Quotient mocks: legible chrome, real elevation, no phantom initials (#43)

The surviving gate findings on every assembled film were the mocks' own
chrome. Three mechanisms, fixed at the source (see the commit for the
numbers): the shared warm grays (#9c9a94/#a3a19a/#8b8983 at 2.3-3.5:1)
darkened to #6b6963/#63615c (4.8-6.0:1, hierarchy preserved); shells and
flagged panels bumped to 1.5px #dedcd6 borders + >= 0.12-alpha shadows (what
the ghost-panel gate credits as a visible edge -- .qsp had NO edge at all);
avatar initials moved into a span that hides when the photo loads (they were
being measured against the photo's pixels at 1:1) with the fallback ink
darkened to #3d5c94 because in a sandboxed render the photo never loads and
the fallback IS the frame. test/quotient-mock-legibility.test.ts boots the
real components on a light page and runs the real gates; the stills confirm
the mocks still read as the Quotient app.

### Storyboard batching (#39, first cut)

The bottleneck was a prompt fossil: "HARD CHUNKING RULE: at most ONE
add_scene call per response" -- 15+ sequential round-trips per film, each
re-reading the whole growing conversation. The rule predated the
truncation-recovery machinery that makes batching safe (discard the turn,
retry smaller, strikes). The prompt now targets 2-4 add_scene calls per
turn; the recovery path still forces one-scene turns after a truncation.
The loop mechanics needed no change (it always processed every tool call in
a response). Expected effect: storyboarding drops from ~15 turns to ~3-5.
Verify against stage_timings on the next live runs before claiming a number.

### Verification 4 (proj_65e702e3): #43 verified, #39 measured, one new class

Same brief, fourth run, on the build with the mock fixes + storyboard
batching.

**#43 verified.** The old defect class is GONE from a live film: zero
muted-chrome contrast findings ("Type a message", tab labels, "Likes"),
zero div.qch/div.qsp ghost panels, zero phantom initials. One straggler
found and fixed: composer's .cmpz-card needed the same shell recipe.

**#39 measured honestly.** storyboarding 188.9s vs 221.4/225.3 baseline --
~15% faster raw, ~25% per-scene (this board drew 8 scenes, baselines 7).
Real, not the hoped-for collapse; the model appears to batch only
partially. Next lever if more is needed: count turns via the trace, and
consider merging concept (72s, also sequential) into the storyboard call.

**New class exposed (task #44): the gates fight the camera.** The campaign
board was staged at x:0 width:100% -- fully on-canvas -- yet reported
"Tasks" 67% past the left edge and buttons entirely off the right. The
cursor-performer's mid-scene ZOOMS scale the stage; the gates probe at
45/70/90% of scene time -- mid-zoom -- and flag content the zoom
legitimately pushed off-frame. The auto-fix loop then burned its budget
shrinking kinetic-text that was never too big (twice per scene, four
scenes, defect survived every pass). Fix belongs in the gates
(camera-neutral probe times, or skip clipped/off-canvas checks when the
stage root carries a scale transform at probe time). Precedent:
cameraIsBackground already skips the empty-canvas gate on speaker scenes.

## #44: camera-aware gates -- a zoom is a shot, not a bug (2026-08-02)

Marc: "we will be zooming in the future or panning so this cant happen."

captureSingleFrame now measures the camera rig's transform AT THE PROBED
INSTANT (after the timeline seek): any .__mp_camera_rig / .__mp_camera_clip /
.mp-camera holding scale outside [0.95, 1.05] or |translate| > 14px marks the
frame cameraActive. Thresholds sit above the ambient Ken Burns (1.03 +
<=10px drift inside its 20px overscan), so only real camera_moves trip it.

On a cameraActive frame the gates skip GEOMETRY findings only -- clipped
text, off-canvas content, edge bleed, text collisions in measureLayout, and
the "clipped" reason in measureTextContrast. Scale-invariant checks still
run: contrast ratios, ghost-panel fill separation, dead-frame coverage.
Detection is live-DOM rather than camera_moves window math on purpose: it
needs no timing model, and it covers every zoom mechanism (camera_moves,
Studio zoom-inside rigs, future pans) identically.

Behavioral test (test/camera-aware-gates.test.ts): a held 1.6x zoom that
pushes half the layout off-frame produces zero geometry findings, while the
SAME content genuinely off-canvas without a camera still flags -- the
control that proves the skip informed the gate rather than neutering it.

### Verification 5 (proj_b8eb5c3b): the series' fastest and cleanest run

379.7s total (series: 463 / 515 / 443 / 485). storyboarding 168.1s (was
221-225 pre-batching, -25%), scenes 95.2s, editorial 21.5s. Unresolved
defects 12 (was 22 on run 4); the camera false-positive class -- titles and
buttons "off-frame" mid-zoom -- is fully gone.

What remains is the long tail, each noted with its cause:
- quotient-chat's placeholder stayed visible UNDER the typed message (100%
  text-on-text collision): the `filled` class rides a gsap .call() that does
  not fire on a deterministic seek. Fixed structurally in CSS:
  `.qch-input-text:not(:empty) ~ .qch-placeholder { display:none }`.
- sticker-prop pill text overflowing its fixed-size pill ("1 AGENT / 12
  POSTS / 5 CHANNELS", ~84px past, then measured white-on-white at 1.18:1
  outside the pill). The container-growth repair cannot fix a fixed-CSS
  pill font; the component needs wrap/auto-shrink. (#36 territory.)
- text_collision comparing kinetic-text's full CONTAINER box against a pill
  placed inside its empty corner -- glyph-level boxes would be the honest
  comparison. Refinement, not a blocker.
- Two inner-chip ghost panels (div.qch-cc live at 1.1% despite the 1.5px
  border locally passing; div.qcp-ev calendar chips) -- inner-chip styling,
  next component polish pass.
- Template/theme text contrast on 2 headlines (2.86-3.17:1) with no
  data.color channel -- template typography, #36.

## #36: hero-number scale + the long tail, closed (2026-08-02)

The last open backlog item, plus everything verification 5 traced to
component interiors:

- **Bar-quantize re-inflation (the original #36 bug)**: LENGTH_DISCIPLINE
  clamps run BEFORE quantizeScenesToBars, and toBars rounded to the NEAREST
  bar -- a 6s-capped social-reel scene on a 3.4s bar re-inflated to 6.8s.
  The quantizer now takes the grammar's sceneCap and snaps DOWN when
  rounding up would breach it: the cut stays on the grid AND the film keeps
  its promised length.
- **Hero-number scale**: number-counter-row's fixed 72px (6.7% of a 1080p
  frame) now yields to data: data.font_size directly, or data.hero (one
  stat ~26vh, rows share proportionally); data.color repaints. The
  data-story contract carries "HERO TYPE IS DATA, NOT HOPE" and the
  component joined COLOR_CAPABLE -- only after it actually read the field.
- **Chromium border rounding (the qch-cc mystery solved)**: Chromium
  computes a 1.5px border as 1px at DPR 1 (measured with a live probe) --
  under the gate's MIN_VISIBLE_BORDER floor AND visually a hairline. Every
  1.5px panel border from the #588 pass is now 2px, .qcp-ev calendar chips
  included. The mock-legibility test now SCRIPTS a content card into
  existence, closing the blind spot that let the empty-shell test pass
  while the live film flagged.
- **sticker-prop fits its own box**: long pill text shrinks to fit (floor
  11px, wrap as last resort) instead of spilling ~84px past the pill and
  reading white-on-white.
- **Transient entrance dimness**: a low-contrast finding measured ONLY
  mid-fade (opacity 0.5-0.85), for text that reaches full opacity and
  PASSES at another probe, is the entrance animation -- dropped in
  measureTextContrast's finalize. Persistently dim text keeps its finding.
  reasoning-stream's receded rows also land at 0.45/0.35 opacity now
  (below the gate's decorative threshold; 0.5 composited dark ink to a
  ~3.2:1 mid-gray on light washes).
- **Glyph-box collisions**: the collision probe unions each element's own
  text-node line rects instead of the container box -- a pill in a
  container's EMPTY corner no longer reads as a 100% collision. Type-on
  words not yet revealed (zero-size rects) are ignored.
- **quotient-chat placeholder** (already merged in #591) completed the set.

### Data-story verification (proj_b75ca862): the caps held; the flag needed a second spelling

33.0s total (cap 42), max scene EXACTLY 7s (cap 7) -- the quantize snap-down
worked on a live film, and the storyboard adopted "hero": true on every
counter. But it wrote the flag INSIDE the stat object, not at data root, so
the scale never applied ("1 AGENT" measured 1% coverage). The component now
accepts both spellings. Two more theme leaks fixed the same way as the
quotient mocks: number-counter-row's fixed slate label (#64748b, 3.43:1 on
every ground) now rides the value's ink at 0.72 presence, and email-compose
-- a HARDCODED-dark card -- was painting var(--mp-color-text) (dark ink on
light brands) on #1a1a22: 1.03:1 on every address line. A fixed-dark mock
pins its own light ink.

Remaining, known, template-side: st- template claim/tagline text has no
data.color channel, so a light-theme template over a dark mesh patch stays
a report (scene_001's claim at 1.09:1). Template typography theming is its
own arc.

## #45: ground-measured ink -- the theme flag loses to the actual page (2026-08-02)

The task was filed as "template typography theming", but the evidence
reshaped it. proj_b75ca862's 1.09:1 claim was NOT an st- template: it was
the ANNOTATION component, which carries no plate of its own -- theme:"dark"
only flips its ink light for use on dark grounds -- authored with
theme:"dark" AND color:"#17171c" on a LIGHT film. The component obeyed the
flag (near-white ink on a near-white mesh) and ignored the color field
entirely, which would have been perfect. (The tagline case that motivated
option (b) turned out to be the transient-fade class, already fixed in the
gate.)

The fix is (b) in spirit, without pixel reads: the scene page's background
IS the brand ground and it is measurable. atmosphere.js gains
mpGroundLum() (page luminance; null on transparent speaker pages),
mpParseColor(), mpInkContrast(). Annotation now derives dark/light from the
MEASURED ground (WCAG midpoint 0.18, matching the ink-repair loop); the
authored theme flag only decides when the page is transparent. An authored
data.color is honored when it clears 4.5:1 on the measured ground and
ignored when it cannot be read.

Behavioral proof (test/ground-ink.test.ts, real assembler + real gate): the
exact authored data from proj_b75ca862 now measures clean on a white page;
the mirrored case (dark ink authored on a dark film) measures clean too;
a passing authored ink is honored. The helpers are global -- any ink-only
component can adopt the same two lines.

## CI: the suite goes green and a robot finally watches it (2026-08-02)

"Is there any testing?" exposed the structural gap: 82 test files and no CI
-- each round ran only the suites neighboring its change, which is exactly
how three playbook assertions stayed broken through eight merges (#595).

Now: .github/workflows/ci.yml runs typecheck + build + the FULL vitest
suite (Chromium + ffmpeg installed) on every PR and on master. Three repairs
made the suite honestly green rather than green-by-exclusion:
- MP_WORKER_DIR: render.ts and capture.ts fork their workers from
  import.meta.url's directory, which under vitest is src/ (no .js). The env
  var points TS runners at dist/core; CI builds first and sets it. This
  un-broke render.test.ts and showcase.test.ts EVERYWHERE, not just CI.
- integration.test.ts is a main()-style script, never a vitest suite --
  excluded in vitest.config.ts (run it directly with tsx).
- The two genuinely-failing tests are marked it.fails WITH their stories
  (codegen-e2e's pure-custom __componentTimelines drift; the st-statement
  negative-space vs 16%-coverage-floor design decision). Green without
  hiding them: the day either behavior changes, .fails flips red and forces
  the call.

Full suite: 81/81 files. First fully-green run of the project.

### CI's first day: three catches before it was even merged

Run 1 (PR #596): three speaker suites used "/nonexistent" as a data dir to
mean "never touches disk" -- ensureSpeakerDerived mkdirs its assets dir, and
only the root sandbox could create /nonexistent. Fixed with real mkdtemp
scratch dirs.

Run 2: three MORE suites (live-narration-cuts, reference-images,
scene-cache) leaned on the /data/media-producer default -- also
root-only. Fixed systemically: vitest.config.ts mkdtemps a scratch dir and
sets MP_DATA_DIR for every run, killing the class.

Run 3: GREEN. The lesson, recorded: this sandbox runs as ROOT, so any test
that writes an absolute path silently passes here and fails on every normal
machine. CI is the only guard that sees it.
