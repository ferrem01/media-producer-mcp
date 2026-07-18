# SPEC-recorder.md — the Quotient Recorder (Chrome extension + instrumented capture)

Status: **specced 2026-07-17, pre-MVP.** Companion docs: `SPEC-motion-architecture.md`,
`AMENDMENTS.md` (2026-07-17 entries: the speaker-screencast arc + the auto-callouts
parking that motivates this).

## Why this exists (the one-paragraph argument)

The speaker-screencast grammar spends all of its difficulty reverse-engineering
semantics out of a flat mp4: motion profiles to guess idle, seam detection to guess
page changes, vision models to guess what a click target was (parked — see
AMENDMENTS). At record time, the **browser knows all of it**. A recording
extension flips the problem: instead of salvaging meaning from pixels, we capture
meaning alongside pixels. The recorder is also the strategic moat: anyone can
generate video from an mp4; owning the recorder means owning ground truth nobody
else has.

## The product flow

Record → Stop → link to a finished film. Zero intermediate steps for the user.
The extension uploads (video + events sidecar + optional mic track) to the MCP,
fires `generate` with `screencast_source`, and surfaces the Studio link when done.

## The three modes

### Mode A — narrate live while demoing
Mic + tab captured on the SAME clock; audio and video are born in sync.
- The dead-time problem (waiting for agents) is handled at compress time: only
  stretches that are **both idle (sidecar: no input, no DOM mutations) and
  silent (audio VAD)** are collapsed — video and audio cut identically, so sync
  survives condensing by construction.
- Teleprompter overlay (script scrolls during recording) makes live narration
  practical; the known script doubles as caption ground truth.

### Mode B — narrate against the compressed cut  ⟵ the flagship
Solves the recurring "voice recorded separately, video needs condensing" pain by
**inverting the dependency**: today video is condensed to fit the narration; in
Mode B the narration is performed to fit the condensed video (how real editors
work: picture lock, then VO).
1. Record the screencast with the extension — no talking. Video + sidecar upload.
2. The MCP immediately builds the compressed cut (idle collapsed using sidecar
   truth — no motion-profile guessing).
3. The user records the voiceover **while watching the compressed cut play
   back** (ADR-booth pattern; in Studio or in the extension). Punch-in retakes
   land on the film timeline.
Consequence: the narration clock IS the film clock. No fit-solving, no drift,
no sync pins — that problem class stops existing for extension-recorded films.

### Mode C — legacy (exists today)
Any mp4 + separately recorded voice → the current pipeline: motion-profile idle
detection, fit-solve compression, chapter pins, whisper spine. Kept as the
salvage path; nothing in this spec removes it.

## The events sidecar (`events.json`, uploaded with the video)

All timestamps on the recording clock (ms from record start). Version-tagged.

```jsonc
{
  "version": 1,
  "recording": { "width": 2294, "height": 1440, "fps": 30, "startedAt": "...", "url": "https://staging.getquotient.ai/..." },
  "clicks":      [ { "t": 34200, "x": 1204, "y": 931, "box": { "x": 1144, "y": 913, "w": 120, "h": 36 },
                     "label": "Connect", "role": "button", "selector": "..." } ],
  "inputs":      [ { "t": 12100, "kind": "type|scroll|drag", "box": { }, "label": "Type a message" } ],
  "navigations": [ { "t": 58900, "url": "/broadcasts", "title": "Broadcasts" } ],
  "mutationsIdle": [ { "from": 61000, "to": 117000 } ],   // no input + no meaningful DOM mutations
  "chapters":    [ { "t": 60000, "label": "optional user hotkey marks (N)" } ],
  "retakes":     [ { "cutFrom": 84000, "cutTo": 91000 } ]
}
```

What each stream replaces:
- `clicks`/`inputs` → **callouts + punch-ins, deterministic** (un-parks the
  feature as a lookup table: exact element boxes, no vision grounding).
- `navigations` → **chapter pins** (exact page-transition timestamps; no seam
  detection, no ±30s windows).
- `mutationsIdle` (∩ audio silence in Mode A) → **compress-the-waiting** without
  decoding a motion profile.
- `chapters` → intentional chapter boundaries; titles still LLM-suggested,
  human-editable.
- `recording` dims → no crop/chrome probing (`has_own_chrome` moot: tab capture
  has no OS chrome).

## Extension (MV3) — capture notes

- `chrome.tabCapture` / `getDisplayMedia` + `MediaRecorder` → WebM/VP9.
  VP9 decodes in Playwright's Chromium (unlike H.264) — capture-page video
  handling gets simpler for these files, not harder.
- Mic via `getUserMedia`, recorded as a separate track on the same clock
  (Mode A) or in the Mode-B booth pass.
- Content script records events (click/keydown/scroll + MutationObserver
  batches + history/navigation hooks); background script owns the recording
  session + upload.
- Auth: tenant token (same `AUTH_TOKENS` scheme as Studio), configured once in
  the extension options.
- Privacy: nothing leaves the machine until Stop→Upload; a pre-upload review
  step lists what was captured; selector strings are optional (labels + boxes
  suffice) to limit DOM leakage.

## Server / pipeline integration

1. **Upload**: extend `upload` to accept the sidecar (stored next to the asset
   like `.intel.json`; the intel analyzer skips whatever the sidecar already
   answers).
2. **Prep**: `runGrammarPrep` prefers sidecar truth over heuristics whenever a
   sidecar exists — idle spans, chapter anchors, callout/punch-in candidates.
   Heuristic paths remain the fallback (Mode C).
3. **Mode B booth**: a Studio (or extension) view that plays the compressed cut
   and records mic against it; upload attaches as the narration with
   offset 0 — no fit pass.
4. **Auto-generate**: upload completion can fire `generate`
   (`screencast_source` = the new asset) and notify with the Studio link.

## MVP order (build after spec sign-off)

1. **Foundation** — ✅ SHIPPED 2026-07-17 (extension + sidecar + auto-generate;
   first live recording proved the chain same day: proj_cac63a35's 74s tab
   recording → 27s sidecar-compressed cut, zero pixel decoding).
2. **Mode B booth** — ✅ SHIPPED 2026-07-17 (Studio 🎙 Narrate: locked-cut
   playback + mic recording + whole-take retakes; `attachBoothNarration` +
   `POST /api/booth-narration`). Punch-in retakes deferred — whole-take
   retake is cheap at walkthrough lengths.
3. **Mode A** — ✅ SHIPPED 2026-07-18 (popup mic toggle primes permission for
   the offscreen recorder; mic muxed onto the tab video's clock; idle∩silent
   spans HARD-CUT from both streams — `assembleLiveNarration`, no timelapse in
   v1 so the embedded voice can't chipmunk; teleprompter in a separate window
   because tab capture would film an in-page overlay). Timelapse-over-silence
   remains future polish. Plus: booth teleprompter with LLM-drafted scripts
   timed to the cut (`/api/booth-script`), and the extension now closes the
   loop — it polls until the film exists and notifies with the Studio link.

## Non-goals (v1)

- Cross-browser (Chrome first), webcam PiP overlay, in-extension editing
  beyond retake marks, desktop/native capture. All possible later; none block
  the value.
