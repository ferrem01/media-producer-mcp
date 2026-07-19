# TESTPLAN.md — the 15-minute golden path

One repeatable pass that exercises every recorder + Studio capability.
Run it after any substantial change (the unit suite covers the math; this
covers the *experience*). The recorder flow found every real bug so far —
this is that flow, written down.

**Precision expectations (not bugs):** word-lane times are whisper + snap
accuracy, roughly ±0.3s per word. Sub-second wobble on individual words is
normal; drift measured in *seconds* is a bug. Rates within 0.05 of 1× show
no label by design.

---

## 1. Record (extension) — ~3 min

Setup: extension ≥0.7 loaded, camera + narration checkboxes ON in the popup.

1. Open the app you're demoing (a normal `https://` page, not `chrome://`).
2. Start recording from the popup. **Expect:** "Click anywhere to roll"
   overlay → 3-2-1 countdown → the little HUD window appears (timer + pause
   + stop) and is NOT part of the page.
3. While recording, deliberately:
   - **pause once** via the HUD, breathe, resume;
   - **go silent ~8s while doing something visible** on screen (this seeds
     the re-fit test later);
   - narrate a couple of distinct actions ("now I click X") for pin tests.
4. Stop. **Expect:** popup shows upload progress for BOTH files (tab +
   camera), then a Studio link. The link must NOT open an empty project.

## 2. Auto-assembly audit — ~2 min

Open the Studio link (hard-refresh if the tab was already open).

- **Expect:** intro → framed walkthrough (browser frame, brand backdrop,
  ~20px matting) → outro. No black bars, no left-edge clipping.
- Camera bubble bottom-right, lips matching the voice.
- Timeline shows the lanes that exist, top to bottom: ruler, ✨ EFFECTS
  (only if the film has zooms/callouts), 🖥 SCREEN (one row), 👤 SPEAKER
  (clip block with waveform + words inside), ♪ MUSIC (slim). All content
  beds identical height; hover each gutter icon → descriptive tooltip.
- If you left dead air where the screen was ALSO idle, an automatic ✂ seam
  sits on the speaker lane and the film is already shorter than the take.
- Press play. **Expect:** voice, music (ducked under voice), screen and
  bubble all in sync; playhead dot glides smoothly with the line centered
  through it; captions match what you hear.

## 3. Speaker editing (the re-fit model) — ~4 min

Everything here removes TIME from the film but never screen content — the
screen re-fits through its pins; only the camera bubble mirrors voice cuts.

1. **Word-cut:** zoom in (+) until words are readable. Shift-click a first
   word, shift-click a last word → ✂ Cut button → click it.
   **Expect:** film duration drops by the span; the words close up over the
   gap immediately (no stale words, no empty lane); screen keeps all its
   footage; the bubble skips the same span.
2. **Piece editing:** click the speaker clip → *Split at playhead* (park
   the playhead first) → click a piece → *▶ Play this piece* (auditions,
   auto-stops) → *🗑 Remove this piece* on the silence you seeded.
   **Expect:** same ripple as a word-cut; the screen action you performed
   during the silence still fully plays, slightly faster.
3. **Restore:** click any ✂ seam → *↩ Restore*.
   **Expect:** the film grows back by exactly that span; captions return to
   their old times; the restored stretch may show no words until a page
   reload re-transcribes (voice plays fine) — that's expected.
4. Scrub across the whole film afterwards: audio and words must stay
   aligned everywhere (the drift bugs are regression-tested, but ears beat
   tests).

## 4. Screen + effects editing — ~2 min

1. Click a screen block → speed a segment up (2×+), or *Compress waiting*.
   **Expect:** rate label at one decimal; narration does not move.
2. Add or edit a zoom (draw a box on the preview or click an existing
   effects block). **Expect:** the effect appears on the ✨ lane as a block
   spanning ease→hold→return; unchecking *return* makes the block run to
   the scene end with a faded right edge.
3. Click a word (plain click) → pin the screencast to it via the picker.
   **Expect:** pin diamond appears; playback hits that frame on that word.

## 5. Camera bubble + booth — ~3 min

1. Click the bubble → corner + size controls; move it. **Expect:** it
   relocates instantly and survives reload.
2. 🎙 Narrate → *Draft script* (teleprompter cues appear against the film
   clock) → record a retake reading the prompter, pausing playback once
   mid-take (pause holds the recording too).
   **Expect:** upload succeeds, captions regenerate, new take replaces the
   old, music bed survives.
   ⚠️ Known open design question: retaking AFTER speaker cuts leaves the
   screen's re-fit anchors from the old voice — flag anything weird here.

## 6. Render — the ground truth — ~5 min of waiting

1. Render to mp4 (production).
2. Watch the WHOLE file, sound on. **Expect:** everything the preview
   promised: cuts absent, no dead air where you removed it, captions in
   sync, bubble lips matching, effects firing, duration matching Studio's
   total. The preview approximates; this file is the deliverable.

---

## Automated companion

`node scripts/studio-smoke.mjs` asserts the Studio invariants (lanes,
geometry, popovers, cut/restore round-trip via API) against any deployed
environment — run it after every deploy. It does NOT replace step 6: only
a rendered file proves the mix.
