/**
 * Preview SPA - single HTML string export.
 *
 * Light-themed video player style preview for media-producer-mcp.
 * Vanilla JS, no build step, no framework.
 */

export function getPreviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Studio — Media Producer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    font-family: 'Inter', -apple-system, sans-serif;
    background: #fafafa;
    color: #111827;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Layout */
  #app {
    display: grid;
    grid-template-rows: 48px 1fr auto;
    grid-template-columns: 240px 1fr;
    height: 100vh;
  }

  /* Header */
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    z-index: 10;
  }
  header h1 { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; letter-spacing: -0.01em; }
  .header-controls {
    display: flex; align-items: center; gap: 8px; margin-left: auto;
  }
  .header-controls label { font-size: 11px; font-weight: 500; color: #6b7280; }
  .header-controls input, .header-controls select {
    background: #ffffff; border: 1px solid #d1d5db; color: #111827;
    padding: 5px 10px; border-radius: 6px; font-size: 12px; font-family: inherit;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .header-controls input:focus, .header-controls select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
  }
  .header-controls select { min-width: 180px; cursor: pointer; }
  .btn {
    padding: 5px 14px; border: none; border-radius: 6px;
    font-size: 12px; font-weight: 500; font-family: inherit;
    cursor: pointer; transition: all 0.15s ease;
  }
  .btn-primary { background: #4f46e5; color: #fff; }
  .btn-primary:hover { background: #4338ca; box-shadow: 0 1px 3px rgba(79,70,229,0.3); }
  .btn-secondary { background: #f3f4f6; color: #111827; border: 1px solid #e5e7eb; }
  .btn-secondary:hover { background: #e5e7eb; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Narration booth (Mode B): bottom-right card so the film stays watchable
     while recording. */
  #booth-overlay { position: fixed; inset: 0; display: none; align-items: flex-end; justify-content: flex-end; padding: 20px 20px 76px; pointer-events: none; z-index: 300; }
  #booth-card { pointer-events: auto; width: 320px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); padding: 16px; font-size: 12.5px; color: #111827; }
  #booth-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  #booth-card p { color: #6b7280; line-height: 1.5; margin-bottom: 10px; }
  #booth-card .booth-row { display: flex; gap: 8px; margin-top: 10px; }
  /* Draft-in-progress: indeterminate sweep -- honest about not knowing the
     total, alive enough that minutes never read as a hang. */
  .booth-draft-bar { position: relative; height: 4px; border-radius: 2px; background: #e5e7eb; overflow: hidden; margin-top: 10px; }
  .booth-draft-fill { position: absolute; top: 0; bottom: 0; width: 34%; border-radius: 2px; background: linear-gradient(90deg, #818cf8, #6366f1); animation: booth-sweep 1.6s ease-in-out infinite; }
  @keyframes booth-sweep { 0% { left: -34%; } 100% { left: 100%; } }
  #booth-card .booth-row .btn { flex: 1; padding: 8px 10px; }
  .booth-count { font-size: 64px; font-weight: 700; text-align: center; padding: 18px 0; color: #4f46e5; font-variant-numeric: tabular-nums; }
  .booth-live { display: flex; align-items: center; gap: 8px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .booth-dot { width: 10px; height: 10px; border-radius: 50%; background: #dc2626; animation: boothPulse 1.2s ease-in-out infinite; }
  @keyframes boothPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  #booth-card audio { width: 100%; margin: 8px 0 2px; }
  #booth-card textarea { width: 100%; box-sizing: border-box; height: 180px; font: 11px/1.5 'JetBrains Mono', monospace; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; resize: vertical; }

  /* Teleprompter: bottom-center, above the playback bar, out of the film's way. */
  #prompter-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 96px; width: min(760px, 68vw); background: rgba(15,18,32,0.9); color: #fff; border-radius: 12px; padding: 14px 22px; z-index: 290; display: none; text-align: center; box-shadow: 0 10px 32px rgba(0,0,0,0.35); }
  #prompter-cur { font-size: 19px; font-weight: 600; line-height: 1.45; min-height: 27px; }
  #prompter-next { font-size: 13.5px; color: rgba(255,255,255,0.55); margin-top: 6px; line-height: 1.4; }

  /* Sidebar - spans rows 2 and 3 */
  #sidebar {
    grid-row: 2 / 4;
    background: #ffffff;
    border-right: 1px solid #e5e7eb;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #9ca3af;
    padding: 14px 12px 8px;
  }
  .scene-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 12px;
    border-left: 3px solid transparent;
    transition: all 0.15s ease;
    background: #ffffff;
    border-radius: 0 8px 8px 0;
    margin-right: 6px;
  }
  .scene-item:hover { background: #f9fafb; transform: translateX(1px); }
  .scene-prov { display: inline-block; margin-right: 5px; font-size: 10px; line-height: 1; vertical-align: 1px; cursor: help; }
  .scene-prov.sp-template { color: #0ea5e9; }
  .scene-prov.sp-composition { color: #6366f1; }
  .scene-prov.sp-custom { color: #d48c34; }
  .scene-item.active {
    background: #eef2ff;
    border-left-color: #6366f1;
    color: #111827;
  }
  .scene-thumb {
    width: 64px; height: 36px;
    border-radius: 6px; background: #f3f4f6;
    border: 1px solid #e5e7eb;
    flex-shrink: 0; overflow: hidden;
    position: relative;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .scene-thumb iframe {
    width: 1920px; height: 1080px;
    transform: scale(0.03333);
    transform-origin: top left;
    border: none; pointer-events: none;
    position: absolute; top: 0; left: 0;
  }
  .scene-info { flex: 1; min-width: 0; }
  .scene-label {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 12px; font-weight: 500; color: #1f2937;
  }
  .scene-dur {
    font-size: 10px; color: #9ca3af;
    background: #f3f4f6; padding: 1px 6px; border-radius: 10px;
    display: inline-block;
  }
  .scene-meta-row { margin-top: 3px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
  .empty-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;
  }

  /* Main */
  #main {
    display: flex; flex-direction: column; overflow: hidden; background: #f3f4f6;
  }
  #preview-container {
    flex: 1; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .preview-wrapper { position: relative; }
  #preview-iframe {
    background: #000; border: none;
    transition: opacity 0.15s ease;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    border-radius: 8px;
    transform-origin: top left;
  }
  .preview-wrapper { overflow: hidden; border-radius: 8px; }
  .no-scene { color: #9ca3af; font-size: 13px; text-align: center; }

  /* Playback controls */
  #playback-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 16px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
  }
  .play-btn {
    width: 30px; height: 30px; background: #4f46e5;
    border: none; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.15s ease;
  }
  .play-btn:hover { background: #4338ca; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
  .play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .play-btn svg { fill: #fff; }
  #slider-wrap { position: relative; flex: 1; height: 122px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  #slider-wrap::-webkit-scrollbar { display: none; }
  #timeline-track { position: relative; height: 100%; min-width: 100%; width: 100%; }
  /* Fixed lane gutter: one icon per visible lane, stationary at the left of
     the timeline no matter where the track is scrolled. NO align-self
     override: the gutter and #slider-wrap are the same height (y.total), so
     both must use the row's centered alignment -- pinning the gutter to
     flex-start while the wrap centered made every icon ride high whenever
     the lane stack was shorter than the transport controls (the bare
     screen-only timeline). */
  #lane-gutter { position: relative; width: 22px; flex: none; }
  .lg-ic { position: absolute; left: 2px; width: 16px; height: 16px; color: #94a3b8; }
  .lg-ic svg { width: 16px; height: 16px; display: block; }
  /* Lane beds: each track paints on its own surface so the layers read as
     layers; the ruler band on top is visually a different kind of thing. */
  .lane-bed { position: absolute; left: 0; right: 0; pointer-events: none; box-sizing: border-box; }
  .lane-bed.ruler { background: #eef1f6; border-bottom: 1px solid #cbd5e1; }
  .lane-bed.screen { background: rgba(148,163,184,0.07); border: 1px solid rgba(148,163,184,0.20); border-radius: 6px; }
  .lane-bed.speaker { background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.18); border-radius: 6px; }
  .lane-bed.music { background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.16); border-radius: 5px; }
  /* The playhead: one line through every lane, driven by the master clock. */
  #playhead-line { position: absolute; top: 18px; bottom: 0; width: 1.5px; background: #4f46e5; opacity: 0.45; z-index: 5; pointer-events: none; }
  /* Audio lanes under the scrubber: music coverage + voiceover clip windows. */
  #audio-lanes { position: absolute; left: 0; right: 0; top: 86px; height: 10px; pointer-events: none; }
  .audio-lane-seg { position: absolute; height: 4px; border-radius: 2px; pointer-events: auto; }
  .audio-lane-seg.music { top: 0; height: 6px; background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(99,102,241,0.55) 12%, rgba(99,102,241,0.55)); }
  .audio-lane-seg.voiceover { top: 5px; background: #f59e0b; opacity: 0.75; }
  .audio-lane-seg.sfx { top: 5px; background: #10b981; opacity: 0.6; }
  #timeline-slider {
    position: absolute; left: 0; top: 66px; width: 100%; -webkit-appearance: none; appearance: none;
    height: 18px; background: transparent;
    outline: none; cursor: pointer; margin: 0; z-index: 4;
  }
  #timeline-slider::-webkit-slider-runnable-track { height: 3px; background: #c7cdd8; border-radius: 3px; margin-top: 7px; }
  #timeline-slider::-moz-range-track { height: 3px; background: #c7cdd8; border-radius: 3px; }
  /* Beat/scene markers over the timeline: scene cuts are strong ticks, beats are soft ticks. */
  #beat-ticks { position: absolute; left: 0; right: 0; top: 66px; height: 5px; pointer-events: none; }
  .beat-tick { position: absolute; top: 50%; width: 1px; height: 9px; transform: translateY(-50%); background: #a5b4fc; opacity: 0.75; border-radius: 1px; }
  .beat-tick.scene-cut { width: 2px; height: 13px; background: #6366f1; opacity: 0.9; }
  /* Camera-move pills on the scrubber: one clickable pill per zoom/pan/rotate. */
  #cam-pills { position: absolute; left: 0; right: 0; top: 52px; height: 16px; pointer-events: none; }
  .cam-pill {
    position: absolute; top: -3px; transform: translateX(-50%);
    width: 15px; height: 15px; border-radius: 50%;
    background: #4f46e5; color: #fff; border: 1.5px solid #fff;
    font-size: 9px; line-height: 12px; text-align: center;
    cursor: pointer; pointer-events: auto; box-sizing: border-box;
    box-shadow: 0 1px 4px rgba(79,70,229,0.45);
    transition: transform 0.1s ease;
    /* Above the (invisible, 18px-tall) scrub input z:4 and the playhead
       line z:5 -- below them the pill is visually buried and unclickable. */
    z-index: 6;
  }
  .cam-pill:hover { transform: translateX(-50%) scale(1.3); }
  .cam-pill.active { background: #312e81; transform: translateX(-50%) scale(1.3); }
  /* Effects lane: zooms/pans/rotates/callouts as DURATION blocks -- how
     long each effect is in force, not just where it starts. */
  #fx-lane { position: absolute; left: 0; right: 0; height: 32px; pointer-events: none; }
  .fx-seg { position: absolute; top: 3px; height: 26px; box-sizing: border-box; border-radius: 4px;
    border: 1px solid #fff; background: #ddd6fe; color: #5b21b6;
    box-shadow: inset 0 0 0 1px rgba(124,58,237,0.28);
    font-size: 11px; font-weight: 600; line-height: 24px; padding: 0 5px;
    overflow: hidden; white-space: nowrap; pointer-events: auto; cursor: pointer; }
  .fx-seg:hover { box-shadow: 0 0 0 1.5px #7c3aed, inset 0 0 0 1px rgba(124,58,237,0.28); }
  .fx-seg.active { box-shadow: 0 0 0 1.5px #5b21b6, inset 0 0 0 1px rgba(124,58,237,0.4); }
  /* Parallel effects: blocks that overlap in time split the bar height --
     each concurrent effect gets a skinnier bar so parallelism is visible
     in the lane itself (top/height are set inline per block). */
  .fx-seg.fx-thin { font-size: 9px; line-height: 11px; padding: 0 4px; border-radius: 3px; }
  /* Open-ended effect (no return): fades out instead of hard-stopping --
     the effect stays applied, there is no end to draw. */
  .fx-seg.fx-open { border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;
    -webkit-mask-image: linear-gradient(to right, #000 72%, transparent);
    mask-image: linear-gradient(to right, #000 72%, transparent); }
  /* Chapter cards: title overlays drawn on the film -- effects, per Marc's
     ruling ("the scrubber is sacred; a chapter card is an overlay"). */
  .fx-chap { background: #fff; color: #312e81; border: 1.5px solid #6366f1;
    box-shadow: inset 0 0 0 1px rgba(99,102,241,0.15); }
  .fx-chap:hover { box-shadow: 0 0 0 1.5px #4f46e5; }
  .lane-bed.fx { background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.18); border-radius: 6px; }
  /* Media lane: each video's source-map as blocks (color = rate). */
  #media-lane { position: absolute; left: 0; right: 0; top: 0; height: 52px; pointer-events: none; }
  .ml-row { position: absolute; left: 0; right: 0; height: 26px; }
  .ml-row-tag { position: absolute; top: -1px; z-index: 3; margin-left: 3px; padding: 0 5px; height: 13px; line-height: 13px;
    font-size: 9px; letter-spacing: 0.02em; color: rgba(255,255,255,0.85); background: rgba(15,17,26,0.72);
    border-radius: 3px; pointer-events: none; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ml-seg { position: absolute; height: 100%; border-radius: 4px; pointer-events: auto; cursor: pointer; opacity: 0.92; box-sizing: border-box;
    border: 1px solid #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.10);
    font-size: 12px; line-height: 24px; font-weight: 600; color: rgba(255,255,255,0.97); text-align: center; overflow: hidden; white-space: nowrap; }
  .ml-seg.r-plain, .ml-seg.r-freeze { color: #6b7280; }
  .ml-seg:hover { opacity: 1; box-shadow: 0 0 0 1.5px #4f46e5; z-index: 2; }
  .ml-seg.r-normal { background: #a5b4fc; }
  .ml-seg.r-fast { background: #fbbf24; }
  .ml-seg.r-turbo { background: #f87171; }
  .ml-seg.r-freeze { background: repeating-linear-gradient(45deg, #d1d5db, #d1d5db 3px, #f3f4f6 3px, #f3f4f6 6px); }
  .ml-seg.r-plain { background: #eef2ff; border: 1px dashed #a5b4fc; }
  /* Timelapse: a SEGMENT type, not an effect -- it maps 1:1 onto a span of
     footage, exactly like every other rate block in this lane. */
  .ml-seg.r-tl { background: repeating-linear-gradient(135deg, #6366f1 0 6px, #818cf8 6px 12px);
    color: #fff; box-shadow: inset 0 0 0 1.5px #4338ca; }
  /* Suggestion tag riding a fast segment: "make this stretch deliberate". */
  .ml-tl-suggest { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 4px;
    border: 1.5px dashed rgba(255,255,255,0.85); background: rgba(49,46,129,0.35);
    color: #fff; cursor: pointer; line-height: 19px; }
  .ml-tl-suggest:hover { background: rgba(49,46,129,0.6); }
  /* Pins: the user's sync anchors -- a diamond above the lane. Color = health. */
  /* Pin marker: a clean map-pin head floating ABOVE the lane, tip on the
     exact pinned film time, with a hairline guide dropping through the
     blocks toward the timeline. The lane itself keeps only blocks + chips,
     so co-located edits stop piling into one blob. */
  .ml-pin { --pin-c: #4f46e5; position: absolute; top: -2px; margin-left: -9px; width: 18px; height: 58px;
    cursor: pointer; pointer-events: auto; z-index: 6; background: transparent; }
  .ml-pin::before { content: ''; position: absolute; left: 1px; top: 0; width: 14px; height: 14px;
    background: var(--pin-c); border: 2.5px solid #fff; border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg); box-shadow: 0 1px 5px rgba(20,20,40,0.45); transition: transform 0.12s ease; }
  .ml-pin::after { content: ''; position: absolute; left: 8px; top: 16px; width: 1.5px; height: 40px;
    background: var(--pin-c); opacity: 0.55; }
  .ml-pin:hover::before { transform: rotate(-45deg) scale(1.3); }
  .ml-pin-strained { --pin-c: #d97706; }
  .ml-pin-broken { --pin-c: #dc2626; animation: mlPinPulse 1.2s ease-in-out infinite; }
  @keyframes mlPinPulse { 50% { opacity: 0.45; } }
  /* Cuts: restorable removed footage -- a scissors chip at the seam. */
  .ml-cut { position: absolute; top: 2px; margin-left: -8px; width: 16px; height: 18px; line-height: 18px; text-align: center;
    font-size: 11px; cursor: pointer; pointer-events: auto; z-index: 4; color: #dc2626;
    background: #fff; border: 1px solid #fca5a5; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
  .ml-cut:hover { transform: scale(1.2); }
  /* Speaker/words lane: what's being said, beat by beat; click to seek. */
  #word-lane { position: absolute; left: 0; right: 0; top: 94px; height: 26px; pointer-events: none; }
  .wl-word {
    position: absolute; top: 6px; height: 14px; box-sizing: border-box;
    font-size: 10px; line-height: 14px; color: #374151;
    padding: 0 3px; white-space: nowrap;
    background: rgba(255,255,255,0.88);
    cursor: pointer; pointer-events: auto; border-radius: 3px;
  }
  .wl-word:hover { color: #4f46e5; background: rgba(99,102,241,0.07); }
  #wave-strip { position: absolute; left: 0; right: 0; top: 94px; height: 26px; pointer-events: none; opacity: 0.28; }

  /* Merged speaker lane (ROADMAP #8): ONE row reads as the speaker's clip --
     a block spanning where the voice sits on the film clock, with the
     waveform and the words drawn inside it and the speaker EDL's own cut
     seams marked on it. */
  /* Speaker pieces read exactly like media segments: white-bordered blocks
     whose shared edges form the seam (no extra divider lines). */
  .spk-clip { position: absolute; height: 26px; box-sizing: border-box;
    background: rgba(224,231,255,0.95); border: 1px solid #fff; border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(99,102,241,0.28);
    pointer-events: auto; cursor: pointer; }
  /* Hover highlights WITHOUT raising the piece: the words (and their pin
     targets) always stay on top of the block. */
  .spk-clip:hover { box-shadow: 0 0 0 1.5px #4f46e5, inset 0 0 0 1px rgba(99,102,241,0.28); }
  .spk-cut { position: absolute; margin-left: -8px; width: 16px; height: 18px; line-height: 17px; text-align: center;
    font-size: 11px; z-index: 5; color: #4f46e5; background: #fff; border: 1px solid #a5b4fc; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12); pointer-events: auto; cursor: pointer; }
  .spk-cut:hover { transform: scale(1.15); }

  /* Word-cut selection (stage 4): shift-click two words to mark a span. */
  .wl-word.wl-sel { background: #fde68a; border-color: #f59e0b; color: #78350f; }
  #word-cut-btn { position: absolute; z-index: 40; font: 600 10px Inter, sans-serif; background: #b91c1c; color: #fff; border: 0; border-radius: 6px; padding: 3px 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  /* The native thumb is INVISIBLE (it keeps a fat grab/drag target over the
     ruler) -- the visible circle is drawn on the playhead line instead. A
     range thumb's center travels a band inset by half the thumb width, so
     it can never line up with percent-positioned lanes at the edges. */
  #timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 18px; opacity: 0; cursor: pointer;
  }
  #timeline-slider::-moz-range-thumb {
    width: 20px; height: 18px; opacity: 0; cursor: pointer; border: none;
  }
  #playhead-line::before {
    content: ''; position: absolute; top: -15px; left: 50%; transform: translateX(-50%);
    width: 15px; height: 15px; border-radius: 50%;
    background: #3730a3; border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(55,48,163,0.5);
  }
  /* Transport column: play button with the clock stacked beneath it. A fixed
     narrow width (vs an inline time readout) hands ~160px back to the
     scrubber, and the ticking clock still never reflows the timeline. */
  #transport-left {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    flex-shrink: 0; width: 56px;
  }
  .time-display {
    display: flex; flex-direction: column; align-items: center;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-variant-numeric: tabular-nums; line-height: 1.3;
  }
  #time-cur { font-size: 11px; color: #374151; font-weight: 500; }
  #time-total { font-size: 9px; color: #9ca3af; }
  /* Rate badge floats below the clock, out of the flex flow, so its
     appearing/resizing never reflows the timeline. */
  #time-stack { position: relative; flex-shrink: 0; display: inline-block; }
  #rate-badge {
    display: none; position: absolute; left: 50%; transform: translateX(-50%);
    top: calc(100% + 3px);
    font: 600 9px Inter, sans-serif; padding: 1px 6px; border-radius: 999px;
    white-space: nowrap; pointer-events: none;
  }

  /* Audio cluster (right edge): one ♪ icon = mute toggle + track-count chip;
     the volume slider lives in a hover/focus flyout so it costs no bar width. */
  .vol-control {
    position: relative; display: flex; align-items: center; gap: 4px;
    flex-shrink: 0; padding: 4px 6px; border-radius: 8px;
  }
  .vol-control:hover { background: #f3f4f6; }
  .vol-control .vol-icon { font-size: 14px; color: #6b7280; cursor: pointer; user-select: none; }
  .vol-control .vol-icon.muted { color: #cbd5e1; }
  .audio-indicator {
    font-size: 10px; font-weight: 600; color: #9ca3af; white-space: nowrap;
    background: #f3f4f6; padding: 0 5px; border-radius: 999px; line-height: 15px;
  }
  .audio-indicator:empty { display: none; }
  .audio-indicator.has-audio { color: #4f46e5; background: #eef2ff; }
  /* In the left transport column: clear the floating rate badge, and open
     the flyout to the RIGHT (right:0 would push it off the screen edge). */
  #transport-left .vol-control { margin-top: 8px; }
  .vol-flyout {
    position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 20;
    display: flex; align-items: center; padding: 8px 10px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    opacity: 0; pointer-events: none; transition: opacity 0.12s ease;
  }
  /* Invisible bridge over the 6px gap so the flyout survives the mouse travel. */
  .vol-flyout::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 10px; }
  .vol-control:hover .vol-flyout, .vol-control:focus-within .vol-flyout { opacity: 1; pointer-events: auto; }
  #vol-slider { width: 90px; cursor: pointer; accent-color: #6366f1; display: block; }

  /* Bottom panels */
  #bottom-panels {
    grid-column: 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 200px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
  }

  /* Component Layers */
  #storyboard-panel {
    border-right: 1px solid #e5e7eb;
    overflow-y: auto;
  }
  #storyboard-panel .panel-header {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #9ca3af;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #f3f4f6;
  }
  #storyboard-body { padding: 8px 12px; }
  .sb-row { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
  .sb-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: #9ca3af;
  }
  .sb-input {
    width: 100%; box-sizing: border-box; resize: vertical;
    padding: 6px 8px; font-size: 12px; font-family: inherit; line-height: 1.35;
    border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; color: #111827;
  }
  .sb-input:focus { outline: none; border-color: #6366f1; }
  .sb-actions { display: flex; gap: 6px; margin-top: 4px; }
  .sb-hint { font-size: 10px; color: #64748b; margin-top: 4px; }
  /* Compact read-only storyboard preview (full editing happens in the dialog). */
  .sb-preview { max-height: 86px; overflow-y: auto; margin-bottom: 8px; }
  .sb-prev-row { margin-bottom: 6px; }
  .sb-beat-line { margin-bottom: 3px; }
  .sb-beat-line .sb-beat-time { font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 10px; color: #6366f1; }
  /* Critique verdict badges -- the observability gap: a scene that exhausted
     its revision budget and shipped still-defective ships with this visible
     instead of only in server logs. */
  .scene-quality-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; }
  .scene-quality-badge.qb-pass { background: rgba(16,185,129,0.15); color: #10b981; }
  .scene-quality-badge.qb-warn { background: rgba(245,158,11,0.16); color: #f59e0b; }
  .sb-quality-block { margin-bottom: 10px; padding: 8px 10px; border-radius: 8px; }
  .sb-quality-block.qb-pass { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25); }
  .sb-quality-block.qb-warn { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); }
  .sb-quality-head { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .sb-quality-head.qb-pass { color: #10b981; }
  .sb-quality-head.qb-warn { color: #f59e0b; }
  .sb-quality-defect { font-size: 11px; color: #cbd5e1; margin-bottom: 2px; line-height: 1.35; }
  .sb-prev-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; }
  .sb-prev-text { font-size: 12px; color: #374151; line-height: 1.35; white-space: pre-wrap; }
  .sb-prev-text.empty { color: #9ca3af; font-style: italic; }

  /* ── Studio modal (storyboard editor + regenerate progress) ── */
  .studio-modal-backdrop {
    position: fixed; inset: 0; background: rgba(15,23,42,0.55);
    -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
    z-index: 9999; display: flex; align-items: center; justify-content: center;
  }
  .studio-modal-card {
    background: #0f172a; color: #e2e8f0; width: min(760px, 92vw);
    max-height: 86vh; overflow-y: auto; border-radius: 12px;
    border: 1px solid #334155; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    padding: 20px 22px;
  }
  .sm-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
  .sm-desc { font-size: 12px; color: #94a3b8; margin: 0 0 14px; }
  .sm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
  .sm-field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
  .sm-field textarea {
    width: 100%; box-sizing: border-box; resize: vertical; min-height: 90px;
    padding: 10px 12px; font: 13px/1.5 inherit; border-radius: 8px;
    border: 1px solid #334155; background: #1e293b; color: #e2e8f0;
  }
  .sm-field textarea:focus { outline: none; border-color: #6366f1; }
  .sm-field input { width: 100%; box-sizing: border-box; padding: 9px 12px; font: 13px/1.4 inherit; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
  .sm-field input:focus { outline: none; border-color: #6366f1; }
  .sm-row2 { display: flex; gap: 12px; }
  .sm-row2 .sm-field { flex: 1; }
  .sm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
  /* Structured beat rows in the storyboard editor */
  .sm-beat-row { display: grid; grid-template-columns: 110px 62px 1fr 180px auto; gap: 6px; margin-bottom: 6px; align-items: center; }
  .sm-beat-row input { width: 100%; box-sizing: border-box; padding: 7px 9px; font: 12px/1.3 inherit; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
  .sm-beat-row input:focus { outline: none; border-color: #6366f1; }
  .sbr-btns { display: flex; gap: 2px; }
  .sbr-btns button { width: 22px; height: 26px; border: 1px solid #334155; background: #1e293b; color: #94a3b8; border-radius: 5px; cursor: pointer; font-size: 12px; padding: 0; }
  .sbr-btns button:hover { border-color: #6366f1; color: #e2e8f0; }
  .sm-beat-head { display: grid; grid-template-columns: 110px 62px 1fr 180px auto; gap: 6px; margin-bottom: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  #sm-beat-add { margin-top: 2px; }
  .sm-beat-total { font-size: 11px; color: #94a3b8; margin-left: 10px; }
  .sm-btn { padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
  .sm-btn:disabled { opacity: 0.5; cursor: default; }
  .sm-btn.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
  .sm-progress-bar { height: 8px; border-radius: 999px; background: #1e293b; overflow: hidden; margin: 16px 0 8px; }
  .sm-progress-fill { height: 100%; background: linear-gradient(90deg,#6366f1,#8b5cf6); width: 5%; border-radius: 999px; transition: width 0.4s ease; }
  .sm-phase { font-size: 13px; color: #cbd5e1; }
  .sm-sub { font-size: 12px; color: #94a3b8; margin-top: 6px; }
  .sm-status { font-size: 12px; margin-top: 10px; min-height: 16px; }
  .sm-status.ok { color: #34d399; }
  .sm-status.err { color: #f87171; }

  /* Inspector drawer (scene structure) */
  #inspector {
    position: fixed; top: 48px; right: 0; bottom: 0; width: 340px; z-index: 60;
    background: #ffffff; border-left: 1px solid #e5e7eb; box-shadow: -8px 0 24px rgba(15,23,42,0.08);
    transform: translateX(100%); transition: transform 0.18s ease; display: flex; flex-direction: column;
  }
  #inspector.open { transform: translateX(0); }
  .insp-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
  #insp-title { font-size: 13px; font-weight: 600; color: #111827; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .insp-prov { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: #eef2ff; cursor: help; }
  .insp-prov.sp-template { color: #0284c7; background: #e0f2fe; }
  .insp-prov.sp-composition { color: #4f46e5; background: #eef2ff; }
  .insp-prov.sp-custom { color: #b45309; background: #fef3c7; }
  #insp-close { border: none; background: none; font-size: 18px; color: #9ca3af; cursor: pointer; line-height: 1; }
  #insp-tree { max-height: 38%; overflow-y: auto; border-bottom: 1px solid #f3f4f6; padding: 6px 8px; }
  .insp-node { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 8px;
    border-radius: 6px; cursor: pointer; font-size: 12px; color: #374151; }
  .insp-node:hover { background: #f3f4f6; }
  .insp-node.active { background: #eef2ff; color: #4338ca; }
  .insp-node .in-type { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .insp-node .in-meta { font-size: 10px; color: #9ca3af; flex-shrink: 0; }
  #prop-editor { flex: 1; overflow-y: auto; padding: 4px 10px 16px; }
  .prop-script-row { display: flex; gap: 5px; align-items: center; margin-bottom: 4px; }
  .prop-script-row .ps-at { width: 54px; font-size: 11px; padding: 3px 4px; border: 1px solid #e5e7eb; border-radius: 5px; }
  .prop-script-row .ps-action { font-size: 10px; font-weight: 600; color: #6366f1; width: 92px; flex-shrink: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prop-script-row .ps-text { flex: 1; font-size: 11px; padding: 3px 5px; border: 1px solid #e5e7eb; border-radius: 5px; min-width: 0; }

  /* Scene focus mode: the scene's own clock, one row per component.
     Sits BELOW the ruler band so the film scrubber stays visible and
     usable while focused (the focus playhead mirrors it live). */
  #focus-lane { position: absolute; left: 0; right: 0; top: 22px; z-index: 30;
    background: #101322; border-radius: 6px; overflow: hidden; }
  .fm-head { display: flex; align-items: center; gap: 10px; height: 26px; padding: 0 8px; }
  #fm-exit { border: 1px solid #4a4f78; background: #262b45; color: #e0e5ff; font-size: 11px; font-weight: 600;
    padding: 3px 10px; border-radius: 999px; cursor: pointer; }
  #fm-exit:hover { background: #343a63; border-color: #6366f1; }
  #fm-play { border: 1px solid #3b4066; background: #1c2038; color: #a5b4fc; font-size: 11px;
    padding: 3px 10px; border-radius: 999px; cursor: pointer; }
  #fm-play:hover { background: #262b45; }
  .fm-title { font-size: 10px; color: #8b93b8; letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fm-hint { margin-left: auto; font-size: 9px; color: #5b6288; flex-shrink: 0; padding-right: 4px; }
  .fm-playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #f43f5e;
    box-shadow: 0 0 6px rgba(244,63,94,0.8); z-index: 6; pointer-events: none; }
  .fm-track { position: absolute; left: 140px; right: 10px; top: 24px; bottom: 6px; }
  .fm-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(148,163,184,0.12); }
  .fm-grid.fm-beat { background: rgba(99,102,241,0.55); width: 1px; }
  .fm-row { position: absolute; left: 0; right: 0; height: 22px; }
  .fm-name { position: absolute; left: -134px; width: 126px; top: 3px; font-size: 10px; color: #aab2d5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  .fm-bar { position: absolute; top: 3px; height: 15px; background: linear-gradient(180deg, #5157e8, #4046c9);
    border-radius: 4px; opacity: 0.92; }
  .fm-bar.fm-custom { background: repeating-linear-gradient(45deg, #3a3f63, #3a3f63 6px, #303554 6px, #303554 12px); }
  .fm-edge { position: absolute; top: -2px; bottom: -2px; width: 8px; cursor: ew-resize; border-radius: 3px; }
  .fm-edge:hover { background: rgba(255,255,255,0.35); }
  .fm-edge-l { left: -3px; } .fm-edge-r { right: -3px; }
  .fm-diamond { position: absolute; top: 6px; width: 9px; height: 9px; margin-left: -4.5px; background: #fbbf24;
    transform: rotate(45deg); cursor: grab; border-radius: 2px; box-shadow: 0 0 0 1.5px rgba(15,17,34,0.9); }
  .fm-diamond:hover { background: #fde68a; }

  /* Prop Editor */
  #props-panel {
    overflow-y: auto;
  }
  #props-panel .panel-header {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #9ca3af;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #f3f4f6;
  }
  .props-content { padding: 8px 12px; }
  .prop-component-type {
    font-size: 13px; font-weight: 600; color: #6366f1;
    margin-bottom: 8px; letter-spacing: -0.01em;
  }
  .prop-row {
    display: flex; flex-direction: column; gap: 3px;
    margin-bottom: 8px;
  }
  .prop-label {
    font-size: 11px; font-weight: 500; color: #6b7280;
  }
  .prop-input {
    width: 100%; padding: 6px 10px;
    font-size: 12px; font-family: inherit;
    background: #ffffff; color: #111827;
    border: 1px solid #d1d5db; border-radius: 6px;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .prop-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  textarea.prop-input {
    resize: vertical; min-height: 40px;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 11px;
    background: #f9fafb;
  }
  .prop-check {
    width: 14px; height: 14px;
    accent-color: #6366f1;
  }
  .prop-readonly-json {
    font-size: 11px; color: #6b7280;
    background: #f9fafb; padding: 6px 8px;
    border-radius: 6px; border: 1px solid #e5e7eb;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    white-space: pre-wrap; word-break: break-all;
    max-height: 80px; overflow-y: auto;
  }

  /* Smart prop editor styles */
  .prop-color-row {
    display: flex; align-items: center; gap: 6px;
  }
  .prop-color-picker {
    width: 28px; height: 28px; padding: 1px 2px;
    border: 1px solid #d1d5db; border-radius: 6px;
    background: #ffffff; cursor: pointer; flex-shrink: 0;
    transition: border-color 0.15s ease;
  }
  .prop-color-picker:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .prop-color-text {
    flex: 1; padding: 6px 10px; font-size: 12px; font-family: inherit;
    background: #ffffff; color: #111827;
    border: 1px solid #d1d5db; border-radius: 6px;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .prop-color-text:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

  .prop-number-row {
    display: flex; flex-direction: column; gap: 2px;
  }
  .prop-range {
    width: 100%; -webkit-appearance: none; appearance: none;
    height: 3px; background: #e5e7eb; border-radius: 3px;
    outline: none; cursor: pointer;
  }
  .prop-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; background: #6366f1; cursor: pointer;
    transition: transform 0.1s ease;
  }
  .prop-range::-webkit-slider-thumb:hover { transform: scale(1.2); }
  .prop-range::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #6366f1; cursor: pointer; border: none;
  }

  .prop-toggle {
    position: relative; display: inline-block; width: 34px; height: 18px;
  }
  .prop-toggle input { opacity: 0; width: 0; height: 0; }
  .prop-toggle-slider {
    position: absolute; cursor: pointer; inset: 0;
    background: #d1d5db; border-radius: 18px; transition: 0.2s ease;
  }
  .prop-toggle-slider::before {
    content: ''; position: absolute; width: 14px; height: 14px;
    left: 2px; bottom: 2px;
    background: #fff; border-radius: 50%; transition: 0.2s;
  }
  .prop-toggle input:checked + .prop-toggle-slider { background: #6366f1; }
  .prop-toggle input:checked + .prop-toggle-slider::before { transform: translateX(16px); }

  .prop-url-row {
    display: flex; flex-direction: column; gap: 3px;
  }
  .prop-url-link {
    font-size: 11px; color: #6366f1; text-decoration: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 100%; display: block;
  }
  .prop-url-link:hover { text-decoration: underline; }

  .prop-select {
    width: 100%; padding: 6px 10px;
    font-size: 12px; font-family: inherit;
    background: #ffffff; color: #111827;
    border: 1px solid #d1d5db; border-radius: 6px;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    cursor: pointer;
  }
  .prop-select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

  .prop-json-error {
    font-size: 10px; color: #dc2626; margin-top: 2px;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: transparent; border-radius: 5px; transition: background 0.2s; }
  *:hover > ::-webkit-scrollbar-thumb,
  ::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
  ::-webkit-scrollbar-thumb:active { background: #9ca3af; }

  /* Loading spinner */
  .buffer-overlay {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.7);
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    backdrop-filter: blur(4px);
  }

  .loading-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;
    gap: 8px;
  }
  .loading-dots { display: inline-flex; gap: 4px; }
  .loading-dots span {
    width: 5px; height: 5px; border-radius: 50%; background: #9ca3af;
    animation: dotPulse 1.2s ease-in-out infinite;
  }
  .loading-dots span:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  /* ── Studio revise UI (light, consistent with the rest of the app) ── */
  #revise-panel { padding: 10px 12px; font-size: 12px; color: #374151; display: flex; flex-direction: column; gap: 8px; }
  #revise-panel .rv-sel { font-size: 11px; color: #6b7280; min-height: 16px; }
  #revise-panel .rv-sel b { color: #111827; }
  #revise-panel .rv-scope-row { display: flex; align-items: center; gap: 8px; }
  #revise-panel .rv-scope-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; flex: 0 0 auto; }
  #revise-panel .rv-scope { display: flex; gap: 4px; flex: 1; }
  #revise-panel .rv-scope button { flex: 1; padding: 6px 8px; font-size: 11px; font-weight: 500; border: 1px solid #d1d5db; background: #fff; color: #6b7280; border-radius: 7px; cursor: pointer; transition: all 0.12s ease; }
  #revise-panel .rv-scope button:hover { background: #f9fafb; }
  #revise-panel .rv-scope button.active { background: #6366f1; color: #fff; border-color: #6366f1; }
  #revise-panel textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 46px; padding: 8px 10px; font-size: 12px; font-family: inherit; background: #fff; color: #111827; border: 1px solid #d1d5db; border-radius: 8px; }
  #revise-panel textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  #revise-panel textarea:disabled { opacity: 0.5; }
  #revise-panel .rv-status, .sb-actions ~ .rv-status, #sb-status { font-size: 11px; min-height: 16px; }
  .rv-status.ok { color: #059669; }
  .rv-status.warn { color: #d97706; }
  .rv-status.err { color: #dc2626; }

  /* Shared button system (used by both Revise + Storyboard panels) */
  .rv-go {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 14px; font-size: 12px; font-weight: 600; font-family: inherit;
    background: #6366f1; color: #fff; border: 1px solid #6366f1; border-radius: 8px;
    cursor: pointer; transition: all 0.12s ease; white-space: nowrap;
  }
  .rv-go:hover { background: #4f46e5; border-color: #4f46e5; }
  .rv-go:disabled { opacity: 0.5; cursor: default; }
  /* Secondary (Edit storyboard, Undo): clearly a button on a light surface */
  .rv-go.secondary { background: #fff; color: #374151; border: 1px solid #d1d5db; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .rv-go.secondary:hover { background: #f9fafb; border-color: #9ca3af; }
  #studio-ctx { position: fixed; z-index: 9999; display: none; min-width: 180px; padding: 5px; border-radius: 10px;
    background: rgba(15,18,30,0.92); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.10); box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
  #studio-ctx button { display: block; width: 100%; text-align: left; padding: 7px 10px; font-size: 12px; color: #e2e8f0; background: none; border: none; border-radius: 6px; cursor: pointer; }
  #studio-ctx button:hover { background: rgba(99,102,241,0.25); }
  #studio-ctx .ctx-sep { height: 1px; margin: 4px 6px; background: rgba(255,255,255,0.08); }
  /* Floating popovers: revise-next-to-the-element + camera-move editor on a pill. */
  .studio-pop {
    position: fixed; z-index: 9998; display: none; width: 320px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(15,23,42,0.18); padding: 10px 12px;
    font-size: 12px; color: #374151; box-sizing: border-box;
  }
  .studio-pop .sp-head { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
  .studio-pop .sp-title { flex: 1; font-size: 11px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .studio-pop .sp-title b { color: #111827; }
  .studio-pop .sp-x { flex: 0 0 auto; border: 0; background: none; color: #9ca3af; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px; }
  .studio-pop .sp-x:hover { color: #374151; }
  .studio-pop textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 52px; padding: 8px 10px; font-size: 12px; font-family: inherit; background: #fff; color: #111827; border: 1px solid #d1d5db; border-radius: 8px; }
  .studio-pop textarea:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  .studio-pop textarea:disabled { opacity: 0.5; }
  .studio-pop .sp-row { display: flex; gap: 6px; margin-top: 7px; align-items: center; }
  .studio-pop .sp-scope { display: flex; gap: 4px; margin-bottom: 7px; }
  .studio-pop .sp-scope button { flex: 1; padding: 5px 8px; font-size: 11px; font-weight: 500; border: 1px solid #d1d5db; background: #fff; color: #6b7280; border-radius: 7px; cursor: pointer; }
  .studio-pop .sp-scope button.active { background: #6366f1; color: #fff; border-color: #6366f1; }
  .studio-pop .sp-status { font-size: 11px; min-height: 14px; margin-top: 5px; }
  .studio-pop .sp-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 4px; }
  .studio-pop .sp-fields label { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: #6b7280; }
  .studio-pop .sp-fields input[type="number"] { width: 56px; padding: 4px 6px; font-size: 11px; border: 1px solid #d1d5db; border-radius: 6px; }
  .studio-pop .sp-region { grid-column: 1 / -1; font-size: 11px; color: #6b7280; }
  /* Transient status toast (the bottom panels that used to host status lines are gone). */
  #studio-toast {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%) translateY(8px);
    z-index: 9997; max-width: 640px; padding: 8px 16px; border-radius: 999px;
    background: rgba(17,24,39,0.92); color: #e5e7eb; font-size: 12px;
    box-shadow: 0 8px 24px rgba(15,23,42,0.25);
    opacity: 0; pointer-events: none; transition: opacity 0.18s ease, transform 0.18s ease;
  }
  #studio-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  #studio-toast.ok { background: rgba(5,102,72,0.94); color: #d1fae5; }
  #studio-toast.warn { background: rgba(146,64,14,0.94); color: #fef3c7; }
  #studio-toast.err { background: rgba(153,27,27,0.94); color: #fee2e2; }
  /* Storyboard button on each scene row */
  .scene-sb-btn {
    flex: 0 0 auto; border: 1px solid #e5e7eb; background: #fff; color: #6b7280;
    font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 6px; cursor: pointer;
  }
  .scene-sb-btn:hover { border-color: #6366f1; color: #4f46e5; }
  .scene-quality-badge { cursor: pointer; }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>Studio</h1>
    <div class="header-controls">
      <label>Project</label>
      <select id="project-select" disabled><option value="">Loading&#8230;</option></select>
      <button class="btn btn-secondary" id="booth-btn" style="display:none;" title="Record a voiceover while the cut plays (narration booth)">&#127908; Narrate</button>
      <button class="btn btn-secondary" id="inspect-btn" title="Scene structure: what this scene is made of &#8212; components, data, scripts">&#11026; Inspect</button>
      <span id="user-chip" style="display:none;align-items:center;gap:6px;margin-left:12px;font-size:11px;color:#6b7280;">
        <img id="user-pic" width="20" height="20" style="border-radius:50%;display:none;" alt="">
        <span id="user-email"></span>
        <a href="/auth/logout" style="color:#9ca3af;text-decoration:none;margin-left:2px;">Sign out</a>
      </span>
    </div>
  </header>

  <div id="sidebar">
    <div class="sidebar-header">Scenes</div>
    <div id="scene-list"><div class="empty-state">Load a project</div></div>
  </div>

  <!-- Inspector drawer (SPEC-studio-structure): the current scene's cast --
       component tree + typed data editor. Structure lives on the side;
       time lives on the bottom. -->
  <div id="inspector">
    <div class="insp-head">
      <span id="insp-title">Scene</span>
      <span id="insp-prov" class="insp-prov"></span>
      <button id="insp-close" title="Close">&#215;</button>
    </div>
    <div id="insp-tree"><div class="empty-state">Load a project</div></div>
    <div class="panel-header">Properties</div>
    <div id="prop-editor"><div class="empty-state">Select a component</div></div>
  </div>

  <div id="main">
    <div id="preview-container">
      <div class="no-scene" id="preview-placeholder">Select a scene to preview</div>
      <div class="preview-wrapper" id="preview-wrapper" style="display:none;">
        <video id="speaker-bg" muted playsinline preload="metadata" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none;border-radius:8px;"></video>
        <iframe id="preview-iframe" allow="autoplay; fullscreen"></iframe>
        <div id="buffer-overlay" class="buffer-overlay"><div class="loading-state">Buffering media<div class="loading-dots"><span></span><span></span><span></span></div></div></div>
      </div>
    </div>

    <div id="playback-bar">
      <span id="transport-left">
        <span style="display:flex;gap:3px;">
          <button id="tl-zoom-in" class="scene-sb-btn" title="Zoom timeline in">+</button>
          <button id="tl-zoom-out" class="scene-sb-btn" title="Zoom timeline out">&minus;</button>
        </span>
        <button class="play-btn" id="play-btn" disabled>
          <svg id="play-icon" width="14" height="14" viewBox="0 0 14 14">
            <polygon points="3,1 12,7 3,13"/>
          </svg>
        </button>
        <span id="time-stack"><span id="rate-badge" title="Live media rate: the active segment's mapped speed, and the measured actual advance of the video's clock"></span><span class="time-display" id="time-display"><span id="time-cur">0.0s</span><span id="time-total">0.0s</span></span></span>
        <span class="vol-control" id="vol-control">
          <span class="vol-icon" id="vol-icon" title="Mute / unmute" tabindex="0">&#9834;</span>
          <span class="audio-indicator" id="audio-indicator"></span>
          <span class="vol-flyout"><input type="range" id="vol-slider" min="0" max="100" value="100" step="1"></span>
        </span>
      </span>
      <span id="lane-gutter"></span>
      <span id="slider-wrap">
        <div id="timeline-track">
        <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="any" disabled>
        <div id="beat-ticks"></div>
        <div id="audio-lanes"></div>
        <div id="cam-pills"></div>
        <div id="fx-lane"></div>
        <div id="media-lane"></div>
        <div id="focus-lane" style="display:none;"></div>
        <canvas id="wave-strip"></canvas>
        <div id="word-lane"></div>
        <div id="playhead-line" style="display:none"></div>
        </div>
      </span>
    </div>
  </div>

</div>

<div id="booth-overlay"><div id="booth-card"></div></div>
<div id="prompter-bar"><div id="prompter-cur"></div><div id="prompter-next"></div></div>

<div id="studio-toast"></div>
<div id="studio-ctx"></div>
<div id="rv-pop" class="studio-pop"></div>
<div id="cam-pop" class="studio-pop" style="width:280px;"></div>

<div id="studio-modal" class="studio-modal-backdrop" style="display:none;">
  <div class="studio-modal-card" id="studio-modal-card"></div>
</div>

<script>
(function() {
  // State
  var state = {
    tenantId: '',
    projects: [],
    currentProject: null,
    currentSceneIndex: -1,
    currentComponentIndex: -1,
    playing: false,
    playAll: false,
    duration: 0,
    totalDuration: 0,
    animFrameId: null,
    audioElements: [],
    audioDuckingInterval: null,
    musicStarted: false,
    masterVolume: 1,
    // Master clock
    masterTime: 0,
    lastTickTime: 0,
    // Composite mode: single document with all scenes
    compositeLoaded: false,
    // Unified media clip registry for Phase 2 sync
    mediaClips: [],
    forceSync: false,
    // Speaker track trim values (single source of truth)
    speakerTrimStart: 0,
    speakerTrimEnd: Infinity
  };

  // DOM refs
  var els = {
    projectSelect: document.getElementById('project-select'),
    sceneList: document.getElementById('scene-list'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewWrapper: document.getElementById('preview-wrapper'),
    camHint: document.getElementById('cam-hint'),
    previewIframe: document.getElementById('preview-iframe'),
    speakerBg: document.getElementById('speaker-bg'),
    previewContainer: document.getElementById('preview-container'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    slider: document.getElementById('timeline-slider'),
    timeCur: document.getElementById('time-cur'),
    timeTotal: document.getElementById('time-total'),
    bufferOverlay: document.getElementById('buffer-overlay'),
    audioIndicator: document.getElementById('audio-indicator'),
    volSlider: document.getElementById('vol-slider'),
    volIcon: document.getElementById('vol-icon'),
    sbPreview: document.getElementById('sb-preview'),
    propEditor: document.getElementById('prop-editor')
  };

  // Auth token from URL
  window.__MP_SYNCDEBUG = new URLSearchParams(window.location.search).has('syncdebug');
  // Which build is this browser actually running? (/health is unauthenticated;
  // its commit field is set by the deploy.) First line of every debug session.
  try {
    fetch('/health').then(function(r) { return r.json(); }).then(function(j) {
      console.log('[studio] build', (j && j.commit) || '?', window.__MP_SYNCDEBUG ? '(syncdebug on)' : '');
    }).catch(function() {});
  } catch (eB) {}
  var _token = new URLSearchParams(window.location.search).get('token');
  var _urlTenant = new URLSearchParams(window.location.search).get('tenant');

  // ── Session log shipping ──
  // Every console line (ours and the browser's errors) lands in a ring
  // buffer and is shipped to the server every few seconds, so a remote
  // debugger can tail THIS browser session's [scene]/[chase]/[edl]/error
  // channels without asking the user to open devtools and copy-paste.
  var _slBuf = [];
  var _slSid = new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 8);
  (function() {
    ['log', 'warn', 'error'].forEach(function(lv) {
      var orig = console[lv].bind(console);
      console[lv] = function() {
        try {
          var msg = Array.prototype.slice.call(arguments).map(function(a) {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch (e) { return String(a); }
          }).join(' ');
          _slBuf.push({ t: Date.now(), l: lv, m: msg.slice(0, 600) });
          if (_slBuf.length > 800) _slBuf.splice(0, _slBuf.length - 800);
        } catch (e) { /* never break the console */ }
        orig.apply(null, arguments);
      };
    });
    window.addEventListener('error', function(e) {
      console.error('[uncaught]', (e && e.message) || '?', (e && e.filename) || '', (e && e.lineno) || '');
    });
    window.addEventListener('unhandledrejection', function(e) {
      console.error('[unhandledrejection]', String(e && e.reason).slice(0, 300));
    });
  })();
  function _slFlush(useBeacon) {
    if (!_slBuf.length) return;
    var tenant = (typeof state !== 'undefined' && state.tenantId) || _urlTenant;
    if (!tenant) return;
    var batch = _slBuf.splice(0, _slBuf.length);
    var proj = (typeof state !== 'undefined' && state.currentProject && state.currentProject.project_id) || null;
    var url = '/api/studio-log/' + encodeURIComponent(tenant) + '?session=' + _slSid +
      (_token ? '&token=' + encodeURIComponent(_token) : '');
    var body = JSON.stringify({ project: proj, lines: batch });
    try {
      if (useBeacon && navigator.sendBeacon) { navigator.sendBeacon(url, body); return; }
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).catch(function() {});
    } catch (e) { /* logging must never break the app */ }
  }
  setInterval(function() { _slFlush(false); }, 5000);
  window.addEventListener('beforeunload', function() { _slFlush(true); });
  console.log('[studio] session log id', _slSid);

  // Mobile budget: phones cannot boot 5 live scene runtimes (GSAP + up to
  // several WebGL contexts) on open -- the tab gets killed. On coarse-pointer
  // / small screens, thumbnails render as static tiles and the composite
  // loads only when the user taps to load the preview.
  var IS_MOBILE = (function() {
    try {
      return window.matchMedia('(pointer: coarse)').matches || Math.min(window.screen.width, window.screen.height) < 700;
    } catch (e) { return false; }
  })();

  // Append the URL token as a query param. The Authorization header alone is
  // not enough: proxies and middleboxes routinely strip Authorization from
  // plain-HTTP requests, silently 401-ing every Studio API call. Query params
  // survive any proxy, and the server accepts both.
  function withToken(path) {
    if (!_token) return path;
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(_token);
  }

  // API helper
  function api(methodOrPath, pathOrBody, bodyArg) {
    // Support both api(path) and api(method, path, body)
    var method, path, body;
    if (pathOrBody && typeof pathOrBody === 'string') {
      method = methodOrPath;
      path = pathOrBody;
      body = bodyArg;
    } else {
      method = 'GET';
      path = methodOrPath;
      body = pathOrBody;
    }
    var opts = { method: method, headers: {} };
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api' + withToken(path), opts).then(function(r) {
      if (!r.ok) {
        // Surface the server's error message -- "API error 400" hides the
        // actionable reason the route body carries.
        return r.json().catch(function() { return null; }).then(function(b) {
          throw new Error((b && b.error) ? b.error : ('API error ' + r.status));
        });
      }
      return r.json();
    });
  }

  // Fetch HTML with auth (for srcdoc approach)
  function fetchHtml(path) {
    var opts = { headers: {} };
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
    return fetch('/api' + withToken(path), opts).then(function(r) {
      if (!r.ok) throw new Error('Fetch error ' + r.status);
      return r.text();
    });
  }

  // Utils
  function escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Calculate total video duration
  function calcTotalDuration() {
    var p = state.currentProject;
    if (!p || !p.scenes) return 0;
    var total = 0;
    p.scenes.forEach(function(s) { total += s.duration_seconds || 0; });
    return total;
  }

  // Calculate cumulative time offset for a scene index
  function sceneOffset(index) {
    var p = state.currentProject;
    if (!p || !p.scenes) return 0;
    var offset = 0;
    for (var i = 0; i < index && i < p.scenes.length; i++) {
      offset += p.scenes[i].duration_seconds || 0;
    }
    return offset;
  }

  // Render scene-cut + beat markers over the global timeline slider.
  // Scene boundaries are strong ticks; each scene's beat starts are soft ticks.
  function renderBeatTicks() {
    var wrap = document.getElementById('beat-ticks');
    if (!wrap) return;
    wrap.innerHTML = '';
    var p = state.currentProject;
    if (!p || !p.scenes || !p.scenes.length) return;
    var total = 0;
    p.scenes.forEach(function(s) { total += s.duration_seconds || 0; });
    if (!(total > 0)) return;
    var offset = 0;
    p.scenes.forEach(function(s, si) {
      if (si > 0) {
        var cut = document.createElement('div');
        cut.className = 'beat-tick scene-cut';
        cut.style.left = ((offset / total) * 100).toFixed(2) + '%';
        cut.title = 'Scene ' + (si + 1);
        wrap.appendChild(cut);
      }
      var beats = s.beats || (p.storyboard && p.storyboard.scenes && p.storyboard.scenes[si] && p.storyboard.scenes[si].beats) || [];
      var bt = offset;
      beats.forEach(function(b, bi) {
        if (bi > 0) {
          var tick = document.createElement('div');
          tick.className = 'beat-tick';
          tick.style.left = ((bt / total) * 100).toFixed(2) + '%';
          tick.title = (b.label || ('beat ' + (bi + 1)));
          wrap.appendChild(tick);
        }
        bt += (b.duration_seconds || 0);
      });
      offset += s.duration_seconds || 0;
    });
  }


  // Sync audio currentTime to the global video timeline position
  function syncAudioToGlobalTime(globalTime) {
    state.audioElements.forEach(function(audio) {
      var dur = audio.duration;
      if (!dur || !isFinite(dur)) return;

      if (audio._trackType === 'music' && audio.loop) {
        var target = globalTime % dur;
        if (Math.abs(audio.currentTime - target) > 0.5) {
          audio.currentTime = target;
        }
      } else {
        // Non-looping: if past end of track, leave it alone
        if (globalTime >= dur) return;
        var target = Math.min(globalTime, dur);
        if (Math.abs(audio.currentTime - target) > 0.5) {
          audio.currentTime = target;
        }
      }
    });
  }

  // ── Unified Media Sync (Phase 2) ──

  var HARD_SYNC_THRESHOLD = 0.5;
  var STRICT_SYNC_THRESHOLD = 0.04;
  var FORCE_SYNC_THRESHOLD = 0.02;
  var STRICT_REQUIRED_SAMPLES = 2;

  // Build/rebuild the media clip registry from current project state.
  // Called once on project load and when composite finishes init.
  function buildMediaClips() {
    state.mediaClips = [];
    var project = state.currentProject;
    if (!project) return;

    var totalDur = state.totalDuration || 0;

    // 1. Speaker video -- continuous base layer for the full project duration
    var speakerEl = els.speakerBg;
    if (speakerEl && project.speaker_track && project.speaker_track.clips && project.speaker_track.clips.length) {
      var spkClip = project.speaker_track.clips[0];
      state.speakerTrimStart = spkClip.trim_start != null ? spkClip.trim_start : (spkClip.start || 0);
      state.speakerTrimEnd = spkClip.trim_end != null ? spkClip.trim_end : Infinity;
      state.mediaClips.push({
        el: speakerEl,
        kind: 'speaker',
        start: 0,
        end: totalDur,
        lastOffset: null,
        driftSamples: 0
      });
    }

    // 2. Audio elements (music, voiceover, sfx). A non-looping clip plays only
    //    within [start, start+clipDuration]; looping music spans the timeline.
    state.audioElements.forEach(function(audio) {
      state.mediaClips.push({
        el: audio,
        kind: 'audio',
        trackType: audio._trackType || 'sfx',
        loop: !!audio.loop,
        start: audio._startTime || 0,
        end: totalDur,
        offset: 0,
        lastOffset: null,
        driftSamples: 0,
        baseVolume: audio._baseVolume || audio.volume,
        fadeIn: audio._fadeIn || 0,
        fadeOut: audio._fadeOut || 0
      });
    });

    // 3. Scene videos (inside composite iframe) are discovered dynamically
    //    in syncMedia because they live in the iframe DOM
  }

  // Discover scene videos from the composite iframe and add to registry if not already tracked.
  function discoverSceneVideos() {
    if (!state.compositeLoaded) return;
    try {
      var doc = els.previewIframe.contentWindow && els.previewIframe.contentWindow.document;
      if (!doc) return;
      var meta = els.previewIframe.contentWindow.__MP_SCENE_META;
      if (!meta) return;
      var videos = doc.querySelectorAll('video');
      for (var vi = 0; vi < videos.length; vi++) {
        var v = videos[vi];
        if (v._mpRegistered) continue;
        var sceneEl = v.closest('.mp-scene');
        if (!sceneEl) continue;
        var sceneId = sceneEl.getAttribute('data-scene-id');
        var sceneMeta = null;
        for (var mi = 0; mi < meta.length; mi++) {
          if (meta[mi].id === sceneId) { sceneMeta = meta[mi]; break; }
        }
        if (!sceneMeta) continue;
        var startAt = parseFloat(v.getAttribute('data-start-at') || '0');
        v._mpRegistered = true;
        v._mpSceneEl = sceneEl;
        // Scene videos never own the audio; unmuted media in the iframe is
        // also refused play() by the autoplay policy (parent-page clicks
        // don't activate the frame). Enforce as a property too -- component
        // scripts can undo the attribute.
        try { v.muted = true; } catch (eM) {}
        // The transport owns every scene-video clock. Codegen components
        // sometimes author their own scrub drivers (a GSAP proxy writing
        // currentTime every frame from its own t=0 clock, canplay->pause
        // handlers) -- two drivers on one clock reads as "the video snaps
        // back to the start, crawls behind the film, then jumps". Shadow
        // the setter: component writes are ignored; the sync loop seeks
        // through the native setter (_mpSeek).
        try {
          var win0 = v.ownerDocument.defaultView;
          var ctDesc = Object.getOwnPropertyDescriptor(win0.HTMLMediaElement.prototype, 'currentTime');
          if (ctDesc && ctDesc.set) {
            v._mpSeek = (function(vv, dd) { return function(t9) { dd.set.call(vv, t9); }; })(v, ctDesc);
            Object.defineProperty(v, 'currentTime', {
              configurable: true,
              get: (function(vv, dd) { return function() { return dd.get.call(vv); }; })(v, ctDesc),
              set: (function(vv) { return function(x9) {
                if (window.__MP_SYNCDEBUG && !vv._mpCtBlockLogged) {
                  vv._mpCtBlockLogged = true;
                  try { console.log('[ct-blocked] component script tried to seek', (vv.currentSrc || vv.src || '?').split('/').pop().slice(0, 40), 'to', Number(x9).toFixed(2), '-- the transport owns this clock'); } catch (eCB) {}
                }
              }; })(v)
            });
          }
        } catch (eSh) {}
        if (window.__MP_SYNCDEBUG) {
          ['emptied', 'abort', 'stalled', 'error', 'loadstart'].forEach(function(evn) {
            v.addEventListener(evn, function() {
              try { console.log('[media-ev]', evn, (v.currentSrc || v.src || '?').split('/').pop().slice(0, 40), 'ct', v.currentTime.toFixed(2), 'rs', v.readyState, 'net', v.networkState); } catch (eE) {}
            });
          });
        }
        // Detect if this video is the speaker track (PiP speaker scenes)
        var speakerClipUrl = getSpeakerClipUrl();
        var isSpeakerVideo = speakerClipUrl && v.src && (
          v.src === speakerClipUrl ||
          v.src.indexOf(speakerClipUrl.split('/').pop()) >= 0
        );
        state.mediaClips.push({
          el: v,
          kind: 'scene-video',
          sceneEl: sceneEl,
          sceneId: sceneId,
          start: sceneMeta.start,
          end: sceneMeta.start + sceneMeta.duration,
          offset: startAt,
          isSpeaker: !!isSpeakerVideo,
          derived: !!v.getAttribute('data-mp-derived'),
          lastOffset: null,
          driftSamples: 0
        });
      }
    } catch(e) {}
  }

  // Media source-map (EDL) client math -- MUST match core/media-edl.ts.
  // Maps a video's output clock (scene-local time) to source time through
  // ordered {src_start, src_end, rate} segments; past the end -> freeze.
  function edlMapClient(segs, t) {
    var acc = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      // Hold/freeze: park frame src_start for its hold-seconds (frozen so the
      // preview holds the exact frame instead of creeping at 0.1x).
      if (typeof s.hold === 'number' && s.hold > 0) {
        if (t < acc + s.hold) return { src: s.src_start, rate: 0, frozen: true };
        acc += s.hold;
        continue;
      }
      // Timelapse segments are cap-exempt (mirrors mapSourceTime in
      // media-edl.ts EXACTLY -- clamping tl to 16x here made the preview
      // play the beat ~15% long and land every later pin late).
      var rate = s.tl ? Math.min(2000, Math.max(0.1, s.rate || 1)) : Math.min(16, Math.max(0.1, s.rate || 1));
      if (s.src_end <= s.src_start) continue;
      var outDur = (s.src_end - s.src_start) / rate;
      if (t < acc + outDur) {
        if (s.tl && rate > 8) {
          // Sampled flipbook, same 0.45s quantum as the render; the final
          // step parks on the landing frame so the boundary is seamless.
          if (t - acc > outDur - 0.45) return { src: Math.max(s.src_start, s.src_end - 0.05), rate: rate, frozen: false };
          var q = Math.floor((t - acc) / 0.45) * 0.45;
          return { src: Math.min(s.src_end - 0.05, s.src_start + q * rate), rate: rate, frozen: false };
        }
        return { src: s.src_start + (t - acc) * rate, rate: rate, frozen: false };
      }
      acc += outDur;
    }
    var last = segs[segs.length - 1];
    if (last && typeof last.hold === 'number' && last.hold > 0) return { src: last.src_start, rate: 1, frozen: true };
    return { src: Math.max(last.src_start, last.src_end - 0.05), rate: 1, frozen: true };
  }

  // Unified media sync -- three-tier drift correction for all media elements.
  function syncMedia(time, playing) {
    // Discover any new scene videos from iframe
    discoverSceneVideos();

    for (var ci = 0; ci < state.mediaClips.length; ci++) {
      var clip = state.mediaClips[ci];
      var el = clip.el;

      // ── Speaker: continuous base layer, always playing when state.playing ──
      if (clip.kind === 'speaker') {
        // Ensure src is loaded
        if (!el.src || el.src === '' || el.src === window.location.href) {
          var clipUrl = getSpeakerClipUrl();
          if (!clipUrl) { el.style.display = 'none'; continue; }
          el.src = clipUrl;
          el.load();
        }
        // Visibility: show on speaker scenes, hide on opaque scenes
        var speakerActive = isSpeakerScene(state.currentSceneIndex);
        if (speakerActive) {
          el.style.display = 'block';
          els.previewIframe.style.background = 'transparent';
        } else {
          el.style.display = 'none';
        }
        // Always sync time + play/pause regardless of visibility
        // Speaker plays continuously so audio is uninterrupted
        // Apply speaker track trim: global time 0 maps to trim_start in source
        var target = time + state.speakerTrimStart;
        if (target > state.speakerTrimEnd) target = state.speakerTrimEnd;
        var spkDrift = Math.abs(el.currentTime - target);
        if (playing && !el.paused && el.readyState >= 3 && !state.forceSync && spkDrift < 2) {
          // The speaker IS the clock while rolling: never corrective-seek it
          // (that snaps the picture AND blips the voice). The clock follows
          // it instead (see animLoop).
        } else {
          syncElement(clip, el, target, playing, false);
        }
        if (playing && el.paused) { try { el.play().catch(function(eP) { if (!clip._playFailLogged) { clip._playFailLogged = true; console.warn('[play-fail] speaker', eP && eP.name, String((eP && eP.message) || '').slice(0, 100)); } }); } catch (eS) {} }
        else if (!playing && !el.paused) el.pause();
        // Unmute when playing (audio should be heard even on non-speaker scenes)
        el.muted = !playing;
        continue;
      }

      // ── Scene videos: only active when their scene is visible ──
      if (clip.kind === 'scene-video') {
        var sceneVisible = false;
        try {
          sceneVisible = clip.sceneEl.style.visibility !== 'hidden' && parseFloat(clip.sceneEl.style.opacity || '0') > 0;
        } catch(e) {}
        if (!sceneVisible) {
          if (!el.paused) el.pause();
          clip.lastOffset = null;
          clip.driftSamples = 0;
          continue;
        }
        var localTime = time - clip.start;
        if (localTime < 0 || localTime > (clip.end - clip.start)) {
          if (!el.paused) el.pause();
          continue;
        }
        // Derived mirrors (callout clones) always follow their BASE clip's
        // adopted source-map: the clone may have been created before the
        // EDL stamp landed on the base, so its own attrs cannot be trusted.
        if (clip.derived) {
          if (!clip.baseClip) {
            for (var bi = 0; bi < state.mediaClips.length; bi++) {
              var bc = state.mediaClips[bi];
              if (bc !== clip && bc.kind === 'scene-video' && !bc.derived && bc.sceneId === clip.sceneId &&
                  (bc.el.getAttribute('src') || '') === (el.getAttribute('src') || '')) { clip.baseClip = bc; break; }
            }
          }
          if (clip.baseClip) {
            clip.edl = clip.baseClip.edl;
            clip.offset = clip.baseClip.offset;
          }
        }
        // Media source-map: the stamp script writes data-mp-edl during doc
        // parse; read it lazily (once seen, cached on the clip).
        if (clip.edl === undefined && !clip.isSpeaker) {
          var edlRaw = el.getAttribute('data-mp-edl');
          if (edlRaw) {
            try { clip.edl = JSON.parse(edlRaw); } catch (e) { clip.edl = null; }
            if (clip.edl && !clip.edl.length) clip.edl = null;
            if (clip.edl && window.__MP_SYNCDEBUG) {
              try { console.log('[edl] adopted', (el.currentSrc || el.src || '').split('/').pop().slice(0, 40), edlRaw); } catch (e5) {}
            }
          }
        }
        var target;
        if (clip.isSpeaker) {
          // Speaker-sourced video: sync to speaker track timeline
          // Uses same trim values as the speaker bg -- single source of truth
          target = time + state.speakerTrimStart;
          if (target > state.speakerTrimEnd) target = state.speakerTrimEnd;
        } else if (clip.edl) {
          // Edited media: map through the source-map; play at the active
          // segment's rate so the clock advances at the same slope the
          // target does (drift stays flat between corrections).
          var m = edlMapClient(clip.edl, localTime);
          target = m.src;
          if (m.frozen) {
            if (el.playbackRate !== 1) { try { el.playbackRate = 1; } catch (e) {} }
            clip._edlFast = false;
            // Source exhausted: hold the last frame for the rest of the scene.
            syncElement(clip, el, target, false, true);
            continue;
          }
          if (m.rate > 4) {
            // Browsers can't DECODE H.264 at timelapse rates -- playbackRate
            // silently underdelivers and the picture looks ~1x. Render
            // timelapse honestly as rapid seeks of a paused element.
            clip._edlFast = true;
            if (el.playbackRate !== 1) { try { el.playbackRate = 1; } catch (e) {} }
            syncElement(clip, el, target, false, true);
            continue;
          }
          clip._edlFast = false;
          clip._baseRate = m.rate;
          if (!clip._chasing && el.playbackRate !== m.rate) { try { el.playbackRate = m.rate; } catch (e) {} }
        } else {
          // Regular video asset: start_at is source offset
          target = clip.offset + localTime;
          clip._baseRate = 1;
        }
        syncElement(clip, el, target, playing, true);
        continue;
      }

      // ── Audio: global timeline ──
      if (clip.kind === 'audio') {
        var dur = el.duration;
        if (!dur || !isFinite(dur)) continue;
        if (clip.loop) {
          // Looping music: spans the whole timeline.
          syncElement(clip, el, time % dur, playing, false);
        } else {
          // Voiceover/sfx: only audible inside its window on the global
          // timeline. Source position is time relative to the clip's start.
          var local = time - (clip.start || 0);
          if (local < 0 || local >= dur) {
            if (!el.paused) el.pause();
            clip.lastOffset = null;
            continue;
          }
          syncElement(clip, el, local, playing, false);
        }
        continue;
      }
    }
  }

  // Live media-rate badge (next to the time display): the ACTIVE scene's
  // edited video, its mapped segment rate, and the measured actual advance.
  // Called from updateTimeDisplay so it works PAUSED and while scrubbing,
  // not just during playback; self-throttled.
  function updateRateBadge(time) {
    var el = document.getElementById('rate-badge');
    if (!el) return;
    var nowRb = (window.performance && performance.now) ? performance.now() : Date.now();
    if (state._rbTs && nowRb - state._rbTs < 300) return;
    state._rbTs = nowRb;
    var best = null;
    for (var i = 0; i < (state.mediaClips || []).length; i++) {
      var c = state.mediaClips[i];
      if (c.kind !== 'scene-video' || c.isSpeaker || !c.edl) continue;
      var visible = false;
      try { visible = c.sceneEl.style.visibility !== 'hidden' && parseFloat(c.sceneEl.style.opacity || '0') > 0; } catch (eV) {}
      if (!visible) continue;
      var local = time - c.start;
      if (local < 0 || local > (c.end - c.start)) continue;
      best = { clip: c, m: edlMapClient(c.edl, local) };
      break;
    }
    if (!best) { el.style.display = 'none'; state._rbPrev = null; return; }
    var label, bg, fg;
    if (best.m.frozen) {
      label = '❄ frozen';
      bg = '#e5e7eb'; fg = '#6b7280';
      state._rbPrev = null;
    } else {
      var rate = best.m.rate;
      var meas = '';
      var ct = best.clip.el.currentTime;
      var prev = state._rbPrev;
      if (state.playing && prev && prev.clip === best.clip && time > prev.time + 0.3) {
        var actual = (ct - prev.ct) / (time - prev.time);
        if (isFinite(actual) && actual >= 0) meas = ' · actual ' + actual.toFixed(1) + '×';
      }
      state._rbPrev = { clip: best.clip, ct: ct, time: time };
      label = '\u25B6 ' + fmtRate(rate) + meas;
      bg = rate >= 6 ? '#fee2e2' : (rate > 1.2 ? '#fef3c7' : '#eef2ff');
      fg = rate >= 6 ? '#b91c1c' : (rate > 1.2 ? '#92400e' : '#4338ca');
    }
    el.textContent = label;
    el.style.display = 'inline-block';
    el.style.background = bg;
    el.style.color = fg;
  }

  // Core drift-correcting sync for a single element.
  function syncElement(clip, el, target, playing, isSceneVideo) {
    var drift = Math.abs(el.currentTime - target);
    var offset = target - el.currentTime;
    var prevOffset = clip.lastOffset;
    clip.lastOffset = offset;

    // Seeking a *playing* media element re-buffers and glitches the output, so
    // we never micro-correct playing audio OR video -- only hard-sync on a large
    // jump. (Previously audio was micro-seeked every few frames at clip start,
    // where play() latency briefly inflates drift -> seconds of garbled stutter
    // until it stabilized.) A clean clock advances on its own once playing.
    var isPlayingMedia = !el.paused && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO');

    // Seek-storm guards. Seeking a STARVED element restarts its buffering, the
    // element stalls again, drift regrows, we seek again -- a visible ~1s
    // shudder-loop. (1) Never seek the same clip more than once per 750ms.
    // (2) While a playing video is starved (readyState < 3), let it buffer
    // instead of correcting, unless drift is truly runaway (>3s).
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var seekAllowed = !clip._lastSeekTs || (now - clip._lastSeekTs) > (clip._edlFast ? 200 : 1250);
    var starved = (el.tagName === 'VIDEO') ? el.readyState < 3 : (isPlayingMedia && el.readyState < 3);
    // A starving video gets exactly ONE positioning seek (so the browser
    // fetches from the right offset), then we stop touching it: every
    // further seek past the buffer edge aborts the download and restarts
    // it, pinning readyState at 1 indefinitely.
    var seekBlocked = starved && clip._starveSeeked === true;
    function doSeek(t) {
      if (starved) clip._starveSeeked = true;
      if (window.__MP_SYNCDEBUG) {
        try { console.log('[sync-seek]', (el.currentSrc || el.src || el.tagName).split('/').pop().slice(0, 40), 'film', (state.masterTime || 0).toFixed(2), 'from', el.currentTime.toFixed(2), 'to', t.toFixed(2), 'drift', drift.toFixed(2), 'rs', el.readyState, 'playing', !el.paused, 'starved', starved, 'recovered', justRecovered); } catch (e4) {}
      }
      if (el._mpSeek) el._mpSeek(t); else el.currentTime = t;
      clip._lastSeekTs = now;
      clip.driftSamples = 0;
      clip._wasStarved = false;
    }

    // Smooth catch-up: a healthy, PLAYING, muted scene video that's moderately
    // off chases sync (1.6x behind / 0.7x ahead) instead of hard-seeking -- the
    // seek is a visible snap, the chase is invisible on screen content.
    //
    // The speaker PiP is a MUTED picture of the camera whose audio lives on the
    // separate speaker-bg element (the clock). It must chase that clock TIGHTLY
    // or the face lip-syncs ~0.5s off the voice. Bending a muted bubble's rate
    // is inaudible, so it chases like any other scene video -- just to a tighter
    // lock. (The actual audio element is kind:'speaker', handled elsewhere and
    // never reaches here, so its rate is still never bent.) Cuts still seek.
    var chaseStart = clip.isSpeaker ? 0.1 : 0.3;   // start locking sooner for the PiP
    var chaseEnd = clip.isSpeaker ? 0.05 : 0.12;   // and hold it tighter (~1 frame)
    var chaseEligible = isSceneVideo && isPlayingMedia && el.readyState >= 3;
    if (chaseEligible && drift > chaseStart && drift <= 3 && !firstTick && !(prevOffset !== null && Math.abs(offset - prevOffset) > 0.5)) {
      var base = clip._baseRate || 1;
      var chase = (target > el.currentTime) ? Math.min(4, base * 1.6) : Math.max(0.5, base * 0.7);
      if (el.playbackRate !== chase) { try { el.playbackRate = chase; } catch (e6) {} }
      if (!clip._chasing && window.__MP_SYNCDEBUG) {
        try { console.log('[chase] start', (el.currentSrc || '').split('/').pop().slice(0, 40), 'film', (state.masterTime || 0).toFixed(2), 'drift', drift.toFixed(2), 'rate', chase.toFixed(2)); } catch (e8) {}
      }
      clip._chasing = true;
      return;
    }
    if (clip._chasing && (drift <= chaseEnd || !isPlayingMedia)) {
      var base2 = clip._baseRate || 1;
      if (el.playbackRate !== base2) { try { el.playbackRate = base2; } catch (e7) {} }
      clip._chasing = false;
      if (window.__MP_SYNCDEBUG) {
        try { console.log('[chase] end', (el.currentSrc || '').split('/').pop().slice(0, 40), 'film', (state.masterTime || 0).toFixed(2), 'drift', drift.toFixed(2)); } catch (e9) {}
      }
    }

    // A starved clip is NEVER seeked -- seeking restarts its buffering, which
    // is the storm's fuel. A frozen frame that catches up beats a shuddering
    // one. The moment it recovers (readyState >= 3), one hard sync realigns it.
    if (starved) {
      if (!clip._wasStarved) {
        clip._starveT0 = now;
        if (window.__MP_SYNCDEBUG) {
          try { console.log('[starve] begin', (el.currentSrc || '').split('/').pop().slice(0, 40), 'film', (state.masterTime || 0).toFixed(2), 'ct', el.currentTime.toFixed(2), 'rs', el.readyState); } catch (eA) {}
        }
      }
      clip._wasStarved = true;
    }
    else { clip._starveSeeked = false; }
    var justRecovered = !starved && clip._wasStarved === true;
    if (justRecovered && window.__MP_SYNCDEBUG) {
      try { console.log('[starve] end', (el.currentSrc || '').split('/').pop().slice(0, 40), 'film', (state.masterTime || 0).toFixed(2), 'after', ((now - (clip._starveT0 || now)) / 1000).toFixed(1) + 's', 'drift', drift.toFixed(2)); } catch (eC) {}
    }

    // Tier 1: Hard sync (>500ms drift)
    var firstTick = prevOffset === null;
    var offsetJumped = !firstTick && Math.abs(offset - prevOffset) > 0.5;
    if (drift > HARD_SYNC_THRESHOLD && (firstTick || offsetJumped || justRecovered || drift > 3)) {
      // offsetJumped = a discrete map jump (segment boundary / cut), not
      // drift: exempt from the anti-storm cooldown so dense EDLs (many
      // segments close together) cut on time. Starvation still gates.
      if ((seekAllowed || offsetJumped || justRecovered) && !seekBlocked) doSeek(target);
    }
    // Tier 2: Strict sync (>40ms, 2 consecutive -- skip for playing media to avoid stutter)
    else if (!isPlayingMedia && !seekBlocked && drift > STRICT_SYNC_THRESHOLD) {
      clip.driftSamples = (clip.driftSamples || 0) + 1;
      if (clip.driftSamples >= STRICT_REQUIRED_SAMPLES && seekAllowed) {
        doSeek(target);
      }
    }
    // Tier 3: Force sync (>20ms, on seek/play/pause transitions only)
    else if (!isPlayingMedia && !seekBlocked && state.forceSync && drift > FORCE_SYNC_THRESHOLD) {
      if (seekAllowed) doSeek(target);
    }
    else {
      clip.driftSamples = 0;
    }

    // Play/pause
    if (playing && el.paused) {
      // The user is playing now -- let the browser buffer aggressively
      // (preview surfaces load with preload="metadata" to keep OPEN cheap).
      if (el.preload !== 'auto') { try { el.preload = 'auto'; } catch (e) {} }
      el.play().catch(function(err) {
        // A rejected play() is invisible otherwise -- the element just sits
        // paused while the film rolls (the autoplay-policy failure mode).
        // Always logged (once per element): it lands in the session log so
        // remote debugging sees WHY sound/picture stayed dead.
        if (!clip._playFailLogged) {
          clip._playFailLogged = true;
          try { console.warn('[play-fail]', (el.currentSrc || el.src || '?').split('/').pop().slice(0, 40), err && err.name, String((err && err.message) || '').slice(0, 100)); } catch (eF) {}
        }
      });
    } else if (!playing && !el.paused) {
      el.pause();
    }
  }

  // ── Audio Management ──

  function resolveAudioUrl(source) {
    if (!source) return null;
    if (source.indexOf('http') === 0) return source;
    var prefix = '/data/media-producer/';
    if (source.indexOf(prefix) === 0) {
      return '/assets/' + source.substring(prefix.length);
    }
    return source;
  }

  function initAudio() {
    destroyAudio();
    state.musicStarted = false;
    var p = state.currentProject;
    if (!p || !p.audio || !p.audio.tracks || !p.audio.tracks.length) {
      els.audioIndicator.innerHTML = '';
      els.audioIndicator.className = 'audio-indicator';
      return;
    }

    var tracks = p.audio.tracks;
    var count = 0;
    tracks.forEach(function(track) {
      var url = resolveAudioUrl(track.source);
      if (!url) return;

      var audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.src = url;
      audio.volume = typeof track.volume === 'number' ? track.volume : 1;
      if (track.loop) audio.loop = true;

      audio._trackType = track.type || 'sfx';
      audio._trackId = track.id || '';
      audio._fadeIn = track.fade_in || 0;
      audio._fadeOut = track.fade_out || 0;
      audio._baseVolume = audio.volume;
      // When on the global timeline this track begins (voiceover clips are
      // staggered per scene). Looping music spans the whole timeline.
      audio._startTime = typeof track.start_time === 'number' ? track.start_time : 0;

      // Kick off buffering now (on project load) so the first clip is decoded
      // well before the user hits play -- avoids a cold-start garble on scene 1.
      try { audio.load(); } catch (e) {}

      state.audioElements.push(audio);
      count++;
    });

    if (count > 0) {
      // Compact count chip next to the volume icon; the word "tracks" lives
      // in the tooltip so the bar stays narrow.
      els.audioIndicator.textContent = String(count);
      els.audioIndicator.title = count + ' audio track' + (count > 1 ? 's' : '');
      els.audioIndicator.className = 'audio-indicator has-audio';
    } else {
      els.audioIndicator.innerHTML = '';
      els.audioIndicator.className = 'audio-indicator';
    }
    buildMediaClips();
    renderAudioLanes();
    // Clip widths need each track's real duration -- re-render as metadata lands.
    state.audioElements.forEach(function(audio) {
      audio.addEventListener('loadedmetadata', renderAudioLanes);
    });
  }

  // Draw music coverage + voiceover/sfx clip windows under the timeline slider,
  // so where the music starts (and any silent gaps) is VISIBLE in the studio.
  function renderAudioLanes() {
    var wrap = document.getElementById('audio-lanes');
    if (!wrap) return;
    wrap.innerHTML = '';
    var total = state.totalDuration || calcTotalDuration();
    if (!(total > 0) || !state.audioElements.length) return;
    // With a speaker lane, the narration is drawn as the speaker clip block
    // (waveform + words inside it) -- the extra voiceover line is noise.
    var hasSpkLane = laneLayout().speaker >= 0;
    state.audioElements.forEach(function(audio) {
      if (hasSpkLane && audio._trackType === 'voiceover') return;
      var start = audio._startTime || 0;
      var dur = (audio.duration && isFinite(audio.duration)) ? audio.duration : 0;
      // Looping music covers from its start to the end of the film.
      var end = audio.loop ? total : (dur > 0 ? Math.min(start + dur, total) : total);
      if (end <= start) return;
      var seg = document.createElement('div');
      seg.className = 'audio-lane-seg ' + (audio._trackType || 'sfx');
      seg.style.left = ((start / total) * 100).toFixed(2) + '%';
      seg.style.width = (((end - start) / total) * 100).toFixed(2) + '%';
      var name = (audio._trackId || audio._trackType || 'audio');
      seg.title = name + ': ' + start.toFixed(1) + 's \\u2192 ' + end.toFixed(1) + 's'
        + (audio._fadeIn ? ' (fade-in ' + audio._fadeIn + 's)' : '')
        + (audio.loop ? ' (loops)' : '');
      wrap.appendChild(seg);
    });
    // The speaker clip block sizes itself from the narration element's
    // duration -- redraw the lane once metadata is in (same trigger as us).
    renderLaneLabels();
  }

  function destroyAudio() {
    state.audioElements.forEach(function(audio) {
      audio.pause();
      audio.src = '';
    });
    state.audioElements = [];
    state.musicStarted = false;
    if (state.audioDuckingInterval) {
      clearInterval(state.audioDuckingInterval);
      state.audioDuckingInterval = null;
    }
  }

  // Effective per-track volume = the track's mixed level scaled by the master
  // volume the user controls in the transport bar.
  function effVolume(audio) {
    var mv = (typeof state.masterVolume === 'number') ? state.masterVolume : 1;
    return (audio._baseVolume != null ? audio._baseVolume : 1) * mv;
  }

  // Start or resume audio. Per-clip play/pause + seek is owned by syncMedia
  // (which knows each clip's window); playAudio only unlocks playback within the
  // user gesture and sets levels. It never forces currentTime -- doing so made
  // every staggered voiceover restart from 0 and overlap.
  function playAudio() {
    state.audioElements.forEach(function(audio) {
      // Apply fade-in (music) or the track's level, scaled by master volume.
      if (!state.musicStarted && audio._fadeIn > 0) {
        var targetVol = effVolume(audio);
        audio.volume = 0;
        var fadeSteps = Math.ceil(audio._fadeIn * 20);
        var step = 0;
        var fadeInterval = setInterval(function() {
          step++;
          audio.volume = Math.min(targetVol, (step / fadeSteps) * targetVol);
          if (step >= fadeSteps) clearInterval(fadeInterval);
        }, 50);
      } else {
        audio.volume = effVolume(audio);
      }
      // Unlock the element within the gesture; syncMedia pauses out-of-window
      // clips synchronously on the same tick, so nothing overlaps audibly.
      if (audio.paused) audio.play().catch(function(eP) {
        if (!audio._playFailLogged) {
          audio._playFailLogged = true;
          console.warn('[play-fail] audio', (audio.src || '?').split('/').pop().split('?')[0].slice(0, 40), eP && eP.name, String((eP && eP.message) || '').slice(0, 100));
        }
      });
    });
    state.musicStarted = true;
    startDucking();
  }

  function pauseAudio() {
    state.audioElements.forEach(function(audio) {
      audio.pause();
    });
    stopDucking();
  }

  function stopAudioFull() {
    state.audioElements.forEach(function(audio) {
      audio.pause();
      audio.currentTime = 0;
    });
    state.musicStarted = false;
    stopDucking();
  }

  function startDucking() {
    stopDucking();
    var p = state.currentProject;
    if (!p || !p.audio || !p.audio.ducking) return;
    var duckedVolume = p.audio.ducking.ducked_volume || 0.12;

    var mv = (typeof state.masterVolume === 'number') ? state.masterVolume : 1;
    state.audioDuckingInterval = setInterval(function() {
      var voActive = false;
      state.audioElements.forEach(function(audio) {
        if (audio._trackType === 'voiceover' && !audio.paused && audio.currentTime > 0) {
          voActive = true;
        }
      });

      var curMv = (typeof state.masterVolume === 'number') ? state.masterVolume : 1;
      state.audioElements.forEach(function(audio) {
        if (audio._trackType === 'music') {
          // ducked_volume is a RELATIVE multiplier of the track's own level --
          // matching the render mixer, which applies volume=duckedVol on top
          // of the already-volume-filtered track. Treating it as an absolute
          // level made "ducking" RAISE a quiet bed (0.22 base, 0.35 ducked)
          // for the whole narration.
          var base = audio._baseVolume != null ? audio._baseVolume : 1;
          audio.volume = Math.min(1, (voActive ? base * duckedVolume : base) * curMv);
        }
      });
    }, 100);
  }

  function stopDucking() {
    if (state.audioDuckingInterval) {
      clearInterval(state.audioDuckingInterval);
      state.audioDuckingInterval = null;
    }
    state.audioElements.forEach(function(audio) {
      if (audio._trackType === 'music') {
        audio.volume = effVolume(audio);
      }
    });
  }

  // Auto-load tenant from URL -- handled at end of init (see bottom)

  // Load projects for tenant
  function loadProjects() {
    // tenantId comes from the session (/auth/me) or a share-link param --
    // there is no tenant field to read.
    if (!state.tenantId) return;

    api('/projects/' + state.tenantId).then(function(projects) {
      state.projects = projects || [];
      els.projectSelect.innerHTML = '';
      if (!state.projects.length) {
        els.projectSelect.innerHTML = '<option value="">No projects found</option>';
        els.projectSelect.disabled = true;
        return;
      }
      state.projects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.project_id;
        var label = p.name || p.project_id;
        if (p.scene_count != null) label += ' (' + p.scene_count + ' scenes)';
        if (p.format) label += ' [' + p.format + ']';
        opt.textContent = label;
        els.projectSelect.appendChild(opt);
      });
      els.projectSelect.disabled = false;

      var urlProject = new URLSearchParams(window.location.search).get('project');
      if (urlProject) {
        els.projectSelect.value = urlProject;
        if (els.projectSelect.value === urlProject) {
          loadProject(urlProject);
          return;
        }
      }
    }).catch(function() {
      els.projectSelect.innerHTML = '<option value="">Failed to load</option>';
    });
  }

  // Preload all scene HTML into cache
  // Preload speaker background video so it's buffered for instant scene transitions
  function preloadSpeakerVideo() {
    var video = els.speakerBg;
    if (!video) return;
    var clipUrl = getSpeakerClipUrl();
    if (!clipUrl) return;
    if (!video.src || !video.src.includes(clipUrl.split('/').pop())) {
      video.src = clipUrl;
      video.load();
    }
  }

  // Wait for all video elements to buffer enough for smooth playback.
  // Returns a Promise that resolves when speaker bg + all iframe videos
  // have fired canplaythrough (or timeout after 8s).
  function waitForMediaReady() {
    return new Promise(function(resolve) {
      var videos = [];
      var timeout = 8000;

      // Speaker bg
      var spk = els.speakerBg;
      if (spk && spk.src && spk.src !== window.location.href) {
        videos.push(spk);
      }

      // Scene videos inside composite iframe
      try {
        var doc = els.previewIframe.contentWindow && els.previewIframe.contentWindow.document;
        if (doc) {
          var iframeVids = doc.querySelectorAll('video');
          for (var i = 0; i < iframeVids.length; i++) {
            videos.push(iframeVids[i]);
          }
        }
      } catch(e) {}

      if (videos.length === 0) { resolve(); return; }

      var remaining = videos.length;
      var resolved = false;

      function onReady() {
        remaining--;
        if (remaining <= 0 && !resolved) {
          resolved = true;
          resolve();
        }
      }

      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        // readyState 4 = HAVE_ENOUGH_DATA (canplaythrough already fired)
        if (v.readyState >= 4) {
          onReady();
        } else {
          v.addEventListener('canplaythrough', onReady, { once: true });
          // Also trigger a load if the video hasn't started loading
          if (v.readyState === 0 && v.src) {
            v.load();
          }
        }
      }

      // Timeout fallback -- don't block forever on slow connections
      setTimeout(function() {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, timeout);
    });
  }


  // Load composite HTML (all scenes in one document) for transport clock mode
  function loadComposite(project) {
    state.compositeLoaded = false;
    state._compositeHtml = null;
    if (!project || !project.scenes || !project.scenes.length) return Promise.resolve();
    var compositePath = '/preview-composite/' + state.tenantId + '/' + project.project_id;
    return fetchHtml(compositePath).then(function(html) {
      state._compositeHtml = html;
    }).catch(function(err) {
      console.warn('[preview] composite load failed, using per-scene mode:', err);
      state._compositeHtml = null;
    });
  }

  // Initialize composite mode: write composite HTML to iframe
  function initComposite() {
    if (!state._compositeHtml) return false;
    // document.write reuses the SAME window, so the previous document's
    // __MP_READY/__MP_TIMELINE survive the rewrite. Without clearing them,
    // waitForCompositeReady can fire against the OLD detached timeline; the
    // new composite is then never seeked and sits at the blank intro frame
    // (fully transparent -> the camera shows through). studioReload had this
    // guard; every composite write needs it.
    try {
      var w0 = els.previewIframe.contentWindow;
      if (w0) { w0.__MP_READY = false; w0.__MP_TIMELINE = null; w0.__MP_SCENE_META = null; }
    } catch (e) {}
    writeSceneToIframe(state._compositeHtml);
    // Make iframe background transparent so speaker video shows through
    // for transparent_background scenes in composite mode
    els.previewIframe.style.background = 'transparent';
    return true;
  }

  // Wait for composite document to be ready (all scene timelines registered)
  function waitForCompositeReady(cb) {
    var attempts = 0;
    var check = setInterval(function() {
      attempts++;
      try {
        var w = els.previewIframe.contentWindow;
        if (w && w.__MP_READY && w.__MP_TIMELINE && w.__MP_SCENE_META) {
          clearInterval(check);
          state.compositeLoaded = true;
          buildMediaClips();
          state.totalDuration = w.__MP_DURATION || state.totalDuration;
          setTimeout(function() { auditEdlStamps(0); }, 6000);
          cb(w.__MP_TIMELINE);
        }
      } catch(e) { clearInterval(check); }
      // 30s: a cold server + slow pipe can take >10s to hand over the
      // composite's GSAP + scene registrations; giving up too early strands
      // the Studio in per-scene mode with empty media/word lanes.
      if (attempts > 600) {
        clearInterval(check);
        console.warn('[preview] composite ready timeout, falling back to per-scene mode');
      }
    }, 50);
  }

  // Get the master timeline from the composite document
  function getCompositeMasterTimeline() {
    try {
      var w = els.previewIframe.contentWindow;
      return w && w.__MP_TIMELINE;
    } catch(e) { return null; }
  }

  // Sync all video elements inside the composite iframe to the master time

  // Determine which scene index a global time falls in (composite-aware)
  function compositeSceneForTime(globalTime) {
    try {
      var meta = els.previewIframe.contentWindow.__MP_SCENE_META;
      if (!meta || !meta.length) return { index: 0, localTime: 0 };
      for (var i = meta.length - 1; i >= 0; i--) {
        if (globalTime >= meta[i].start) {
          return { index: i, localTime: globalTime - meta[i].start };
        }
      }
      return { index: 0, localTime: 0 };
    } catch(e) {
      return { index: 0, localTime: 0 };
    }
  }


  // Load a specific project
  function loadProject(projectId) {
    if (!projectId || !state.tenantId) return;
    api('/projects/' + state.tenantId + '/' + projectId).then(function(project) {
      state.currentProject = project;
      state.currentSceneIndex = -1;
      state.currentComponentIndex = -1;
      state.totalDuration = calcTotalDuration();
      state.masterTime = 0;
      stopPlayback();
      renderSceneList();
      clearPreview();
      clearLayers();
      clearProps();

      // Initialize audio tracks once for the project
      initAudio();

      // Narration booth: offered whenever the film has screencast footage to
      // narrate over (the attach endpoint needs a screencast scene).
      var boothBtnEl = document.getElementById('booth-btn');
      if (boothBtnEl) {
        var hasScreencast = (project.scenes || []).some(function(s) {
          return (s.components || []).some(function(c) { return c.type === 'screencast-frame'; });
        });
        boothBtnEl.style.display = hasScreencast ? '' : 'none';
      }
      try { booth.script = null; } catch (eBS) {} // re-fetch per project

      // Mobile: don't boot the composite (all scenes' runtimes in one doc)
      // until the user asks for it.
      if (IS_MOBILE) {
        els.previewPlaceholder.innerHTML = '<button id="mobile-load-preview" style="font:600 15px Inter,sans-serif;padding:14px 26px;border-radius:999px;border:0;background:#6366f1;color:#fff;cursor:pointer;">\u25b6 Tap to load preview</button>';
        els.previewPlaceholder.style.display = '';
        var mlp = document.getElementById('mobile-load-preview');
        if (mlp) mlp.addEventListener('click', function() { startCompositePreview(state.currentProject); }, { once: true });
        return;
      }
      startCompositePreview(project);
    }).catch(function() {
      els.sceneList.innerHTML = '<div class="empty-state">Failed to load project</div>';
    });
  }

  function startCompositePreview(project, resume) {
      // resume: { time, sceneIndex } -- restore position after an in-place
      // reload (e.g. saving a camera move). Without it, boot at the start.
      // Any open popover is anchored to the outgoing document -- close it.
      camPopClose();
      rvPopClose();
      // Show loading state while preloading scenes
      els.previewPlaceholder.innerHTML = '<div class="loading-state">Preloading scenes<div class="loading-dots"><span></span><span></span><span></span></div></div>';
      els.previewPlaceholder.style.display = '';

      // Load composite (all scenes in one doc) alongside individual scenes
      loadComposite(project).then(function() {
        if (state._compositeHtml && project.scenes && project.scenes.length > 0) {
          // Composite mode: write single document to iframe
          els.previewPlaceholder.textContent = 'Loading composite preview...';
          initComposite();
          waitForCompositeReady(function(masterTl) {
            var idx = (resume && resume.sceneIndex >= 0 && resume.sceneIndex < project.scenes.length) ? resume.sceneIndex : 0;
            var t = resume ? Math.max(0.001, Math.min(resume.time || 0, state.totalDuration || 0)) : 0.001;
            state.currentSceneIndex = idx;
            state.currentComponentIndex = -1;
            state.duration = project.scenes[idx].duration_seconds || 0;
            updateActiveScene(idx);
            renderLayers();
            clearProps();
            updateSceneIndicator();
            renderCamPills();
            renderMediaLane();
            renderWordLane();
            renderWaveStrip();
            loadTranscript();
            // Desktop: buffer the ACTIVE scene's videos (blanket load() of
            // everything just made five files fight for bandwidth).
            if (!IS_MOBILE) preloadSceneVideos(idx);
            masterTl.time(t);
            state.masterTime = t;
            els.slider.value = state.totalDuration > 0 ? Math.round((t / state.totalDuration) * 1000) : 0;
            updateTimeDisplay(t);
            // Show speaker bg if first scene needs it
            // Show preview with buffering overlay on top
            els.previewPlaceholder.style.display = 'none';
            els.previewWrapper.style.display = '';
            els.bufferOverlay.style.display = 'flex';
            waitForMediaReady().then(function() {
              els.slider.disabled = false;
              els.playBtn.disabled = false;
              els.bufferOverlay.style.display = 'none';
              // Re-assert the restored frame: a late-loading video can reset
              // the GSAP render, leaving the transparent blank frame (camera
              // showing through) while the transport still reports t.
              if (masterTl) { masterTl.time(t); masterTl.pause(); }
              state.forceSync = true;
              syncMedia(t, false);
              state.forceSync = false;
            });
          });
        } else {
          els.previewPlaceholder.textContent = 'Failed to load composite preview';
        }
      }).catch(function(err) {
        console.error('[preview] composite load error:', err);
        els.previewPlaceholder.textContent = 'Failed to load preview';
      });
  }

  // Render scene list in sidebar
  // ── Scene provenance (SPEC-studio-structure) ──
  // How a scene was built determines how it edits: template and composition
  // scenes are structured data (instant, deterministic edits); custom scenes
  // are generated code (edits go through the AI revise pass).
  function sceneProvenance(scene) {
    var comps = (scene && scene.components) || [];
    if (comps.some(function(c) { return typeof c.type === 'string' && c.type.indexOf('st-') === 0; })) return 'template';
    if (comps.some(function(c) { return /^scene_/.test(c.type || ''); })) return 'custom';
    return 'composition';
  }
  var PROVENANCE = {
    template:    { glyph: '\\u25a6', label: 'Template',    tip: 'Template scene \\u2014 designer-built composition. Edits are instant slot-data edits.' },
    composition: { glyph: '\\u2b12', label: 'Composition', tip: 'Composition \\u2014 structured library components with data (and scripts). Edits apply directly.' },
    custom:      { glyph: '\\u2726', label: 'Custom',      tip: 'Custom scene \\u2014 bespoke generated code. Edits go through an AI revise pass.' },
  };

  function renderSceneList() {
    var project = state.currentProject;
    if (!project || !project.scenes || !project.scenes.length) {
      els.sceneList.innerHTML = '<div class="empty-state">No scenes</div>';
      return;
    }
    var html = '';
    project.scenes.forEach(function(scene, i) {
      var active = i === state.currentSceneIndex;
      var label = scene.label || ('Scene ' + (i + 1));
      var beatCount = (scene.beats && scene.beats.length)
        || (project.storyboard && project.storyboard.scenes && project.storyboard.scenes[i] && project.storyboard.scenes[i].beats && project.storyboard.scenes[i].beats.length)
        || 0;
      var q = scene.quality;
      var badgeHtml = '';
      if (q) {
        if (q.passed) {
          badgeHtml = '<span class="scene-quality-badge qb-pass" title="Passed critique clean">\\u2713 clean</span>';
        } else {
          var n = (q.unresolved_defects || []).length;
          badgeHtml = '<span class="scene-quality-badge qb-warn" title="' + escAttr((q.unresolved_defects || []).join('\\n')) + '">\\u26a0 shipped with ' + n + ' unresolved</span>';
        }
      }
      var prov = PROVENANCE[sceneProvenance(scene)];
      html += '<div class="scene-item' + (active ? ' active' : '') + '" data-index="' + i + '">'
        + '<div class="scene-thumb" data-scene-id="' + escHtml(scene.id) + '"></div>'
        + '<div class="scene-info">'
        + '<div class="scene-label"><span class="scene-prov sp-' + sceneProvenance(scene) + '" title="' + escAttr(prov.tip) + '">' + prov.glyph + '</span>' + (i + 1) + '. ' + escHtml(label) + '</div>'
        + '<div class="scene-meta-row">'
        + '<span class="scene-dur">' + (scene.duration_seconds || 0).toFixed(1) + 's' + (beatCount ? ' \\u00b7 ' + beatCount + ' beats' : '') + '</span>'
        + '<button class="scene-sb-btn" data-index="' + i + '" title="Storyboard, defects &amp; regenerate">&#x2261; Storyboard</button>'
        + badgeHtml
        + '</div>'
        + '</div>'
        + '</div>';
    });
    els.sceneList.innerHTML = html;
    renderBeatTicks();
    renderAudioLanes();
    renderCamPills();

    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectScene(parseInt(el.dataset.index, 10));
      });
      // Double-click: TOGGLE scene focus mode -- the timeline becomes this
      // scene's component timeline (SPEC-studio-structure).
      el.addEventListener('dblclick', function() {
        var idx = parseInt(el.dataset.index, 10);
        if (focusSceneIdx === idx) { exitFocus(); return; }
        selectScene(idx);
        enterFocus(idx);
      });
    });

    // Storyboard button (and the defect badge) open the storyboard dialog
    // for that scene -- the dialog now also carries the defect report and
    // the Regenerate action.
    function openSbFor(idx, ev) {
      ev.stopPropagation();
      selectScene(idx);
      renderLayers();
      openStoryboardEditor();
    }
    els.sceneList.querySelectorAll('.scene-sb-btn').forEach(function(btn) {
      btn.addEventListener('click', function(ev) { openSbFor(parseInt(btn.dataset.index, 10), ev); });
    });
    els.sceneList.querySelectorAll('.scene-quality-badge').forEach(function(badge) {
      var item = badge.closest('.scene-item');
      if (item) badge.addEventListener('click', function(ev) { openSbFor(parseInt(item.dataset.index, 10), ev); });
    });

    // Thumbnails are captured STILLS (videos + speaker camera included, taken
    // a few seconds into the scene) -- an <img>, so they're cheap enough for
    // mobile too. The server caches per scene content; the timestamp busts
    // the browser cache so a revised scene shows its new frame.
    els.sceneList.querySelectorAll('.scene-thumb').forEach(function(thumb) {
      var sceneId = thumb.dataset.sceneId;
      var img = document.createElement('img');
      img.setAttribute('loading', 'lazy');
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      img.addEventListener('error', function() { img.remove(); });
      // Cache-Control:no-cache + ETag on the server: the browser revalidates
      // on every project load and gets a fast 304 until the scene changes.
      img.src = '/api' + withToken('/scene-thumb/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(project.project_id) + '/' + encodeURIComponent(sceneId));
      thumb.appendChild(img);
    });
  }

  function selectScene(index) {
    var wasPlaying = state.playing;
    state.currentSceneIndex = index;
    state.currentComponentIndex = -1;
    if (focusSceneIdx >= 0 && focusSceneIdx !== index) exitFocus();
    if (inspOpen()) setTimeout(renderInspector, 0);

    // Stop the animation loop but preserve music state
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    state.playing = false;
    state.playAll = false;
    updatePlayIcon();

    // Don't touch music audio on manual scene click. Only pause voiceover/sfx.

    updateActiveScene(index);

    if (!state.compositeLoaded) return;
    {
      // Composite mode: seek master timeline to scene start
      var meta = els.previewIframe.contentWindow.__MP_SCENE_META;
      var sceneStart = meta && meta[index] ? meta[index].start : sceneOffset(index);
      state.masterTime = sceneStart;
      var masterTl = getCompositeMasterTimeline();
      if (masterTl) {
        masterTl.time(sceneStart);
        masterTl.pause();
      }
      els.slider.value = state.totalDuration > 0 ? Math.round((sceneStart / state.totalDuration) * 1000) : 0;
      updateTimeDisplay(sceneStart);
      updateSceneIndicator();
      // Speaker track
      renderLayers();
      clearProps();
    }
  }

  // Buffer one scene's videos ahead of need (no load(): that resets and
  // refetches; flipping preload lets the browser continue sensibly).
  function preloadSceneVideos(index) {
    try {
      var p2 = state.currentProject;
      if (!p2 || !p2.scenes || !p2.scenes[index]) return;
      var sid = p2.scenes[index].id;
      var root = els.previewIframe.contentDocument.querySelector('.mp-scene[data-scene-id="' + sid + '"]');
      if (!root) return;
      var vs2 = root.querySelectorAll('video');
      for (var vb = 0; vb < vs2.length; vb++) {
        if (vs2[vb].preload !== 'auto') vs2[vb].preload = 'auto';
      }
      // Pre-position a HIDDEN scene's paused videos at their scene-entry
      // source frame: the cut then lands on the right content immediately
      // (no visible snap back from a stale frame left by an earlier
      // viewing), and the browser buffers from the right offset instead of
      // wherever the element happened to sit.
      var hidden = root.style.visibility === 'hidden' || !(parseFloat(root.style.opacity || '0') > 0);
      if (!hidden) return;
      for (var ci = 0; ci < state.mediaClips.length; ci++) {
        var c = state.mediaClips[ci];
        if (c.kind !== 'scene-video' || c.sceneId !== sid || !c.el.paused) continue;
        var entry;
        if (c.isSpeaker) {
          entry = c.start + (state.speakerTrimStart || 0);
        } else {
          var segs2 = c.edl;
          if (segs2 === undefined) {
            var raw2 = c.el.getAttribute('data-mp-edl');
            if (raw2) { try { segs2 = JSON.parse(raw2); } catch (e6) { segs2 = null; } }
          }
          entry = (segs2 && segs2.length) ? edlMapClient(segs2, 0).src : c.offset;
        }
        if (entry != null && isFinite(entry) && Math.abs(c.el.currentTime - entry) > 0.75) {
          if (window.__MP_SYNCDEBUG) {
            try { console.log('[preload] pre-positioned', (c.el.currentSrc || '').split('/').pop().slice(0, 40), c.el.currentTime.toFixed(2), '->', entry.toFixed(2)); } catch (e8) {}
          }
          try { if (c.el._mpSeek) c.el._mpSeek(entry); else c.el.currentTime = entry; } catch (e7) {}
        }
      }
    } catch (e5) {}
  }

  // Update scene list active highlight without re-rendering
  function updateActiveScene(index) {
    if (window.__MP_SYNCDEBUG) {
      try {
        var p9 = state.currentProject;
        var sid9 = p9 && p9.scenes && p9.scenes[index] && p9.scenes[index].id;
        var vids9 = [];
        (state.mediaClips || []).forEach(function(c9) {
          if (c9.kind !== 'scene-video' || c9.sceneId !== sid9) return;
          var e9 = c9.el, b9 = 'none';
          try { if (e9.buffered.length) b9 = e9.buffered.start(0).toFixed(1) + '-' + e9.buffered.end(0).toFixed(1); } catch (eb9) {}
          vids9.push((e9.currentSrc || e9.src || '?').split('/').pop().slice(0, 30)
            + ' ct=' + e9.currentTime.toFixed(2) + ' rs=' + e9.readyState + ' buf=' + b9
            + (e9.paused ? ' paused' : ' playing') + (c9.edl ? ' edl' : ''));
        });
        console.log('[scene] -> ' + (index + 1) + ' film ' + (state.masterTime || 0).toFixed(2)
          + (vids9.length ? ' | ' + vids9.join(' | ') : ' (no scene videos)'));
      } catch (e10) {}
    }
    if (!IS_MOBILE) { preloadSceneVideos(index); preloadSceneVideos(index + 1); }
    var items = els.sceneList.querySelectorAll('.scene-item');
    items.forEach(function(el) {
      var i = parseInt(el.dataset.index, 10);
      if (i === index) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }


  // Build transition HTML from two data URI frames


  // GSAP source cache for transition HTML
  var _gsapSrcCache = null;

  // Write cached HTML into the preview iframe
  function writeSceneToIframe(html) {
    var iframe = els.previewIframe;
    var project = state.currentProject;
    // Reset any residual styles from previous scenes
    iframe.style.transform = "";
    iframe.style.clipPath = "";
    iframe.style.filter = "";
    iframe.style.zIndex = "";
    iframe.width = (project && project.canvas && project.canvas.width) || 1920;
    iframe.height = (project && project.canvas && project.canvas.height) || 1080;

    // Hide iframe during content swap to prevent flash
    iframe.style.opacity = '0';
    els.previewWrapper.style.display = 'block';
    els.previewPlaceholder.style.display = 'none';

    try {
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
    } catch(e) {
      iframe.srcdoc = html;
    }
    updatePreviewScale();
    // Attach Studio selection to the (same-origin) iframe doc; retry until body exists.
    (function attachStudioHook(tries) {
      try {
        var d = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (d && d.body) { if (typeof studioAttach === 'function') studioAttach(d); return; }
      } catch(e) { console.warn('[studio] attach error', e); return; }
      if (tries > 0) setTimeout(function(){ attachStudioHook(tries - 1); }, 60);
    })(20);

    // Show once content is ready (videos + speaker bg)
    function reveal() { iframe.style.opacity = '1'; }

    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      var vids = doc.querySelectorAll('video');
      var waitCount = vids.length;

      // Also wait for speaker bg on speaker scenes
      if (isSpeakerScene(state.currentSceneIndex) && els.speakerBg && els.speakerBg.readyState < 2) {
        waitCount++;
      }

      if (waitCount > 0) {
        var loaded = 0;
        var revealed = false;
        var done = function() {
          loaded++;
          if (loaded >= waitCount && !revealed) { revealed = true; reveal(); }
        };

        // Speaker bg wait
        if (isSpeakerScene(state.currentSceneIndex) && els.speakerBg && els.speakerBg.readyState < 2) {
          els.speakerBg.addEventListener('canplay', done, { once: true });
        }

        for (var i = 0; i < vids.length; i++) {
          if (vids[i].readyState >= 2) { done(); }
          else { vids[i].addEventListener('canplay', done, { once: true }); }
        }

        // Fallback: show after 400ms no matter what
        setTimeout(function() { if (!revealed) { revealed = true; reveal(); } }, 400);
      } else {
        reveal();
      }
    } catch(e) {
      reveal();
    }
  }



  function updatePreviewScale() {
    var container = els.previewContainer;
    var iframe = els.previewIframe;
    var wrapper = els.previewWrapper;
    if (!container || !iframe || wrapper.style.display === 'none') return;

    var project = state.currentProject;
    var nW = (project && project.canvas && project.canvas.width) || 1920;
    var nH = (project && project.canvas && project.canvas.height) || 1080;

    var rect = container.getBoundingClientRect();
    var pad = 24;
    var scaleX = (rect.width - pad * 2) / nW;
    var scaleY = (rect.height - pad * 2) / nH;
    var scale = Math.min(scaleX, scaleY, 1);

    iframe.style.width = nW + 'px';
    iframe.style.height = nH + 'px';
    iframe.style.transform = 'scale(' + scale + ')';

    wrapper.style.width = (nW * scale) + 'px';
    wrapper.style.height = (nH * scale) + 'px';
  }
  window.addEventListener('resize', updatePreviewScale);

  function clearPreview() {
    els.previewWrapper.style.display = 'none';
    els.previewPlaceholder.style.display = '';
    try { els.previewIframe.contentDocument.open(); els.previewIframe.contentDocument.write(''); els.previewIframe.contentDocument.close(); } catch(e) {}
    els.slider.disabled = true;
    els.playBtn.disabled = true;
    els.slider.value = 0;
    state.duration = 0;
    updateTimeDisplay(0);
    updateSceneIndicator();
    stopPlayback();
  }

  // ── Component Layers ──

  // The left bottom panel is the editable Storyboard for the current scene.
  // (renderLayers/clearLayers keep their names so the existing scene-change call
  // sites refresh the storyboard; there is one codegen component per scene now, so a
  // component-layer list conveyed nothing.) Values come from the scene's edited
  // storyboard fields, falling back to the original storyboard entry.
  // Map a StoryboardScene (project.storyboard.scenes[idx]) into the editor's field shape.
  function storyboardSceneToFields(ps) {
    ps = ps || {};
    return {
      purpose: ps.purpose || '',
      script: ps.voiceover_text || '',
      visual_notes: ps.visual_notes || '',
      duration_seconds: (typeof ps.duration_seconds === 'number') ? ps.duration_seconds : '',
      broll_query: ps.broll_query || '',
      hero_image: ps.hero_image || '',
      components: Array.isArray(ps.components) ? ps.components : [],
      beats: Array.isArray(ps.beats) ? ps.beats : [],
    };
  }

  // ── Structured beat editor (rows of label / seconds / action / voiceover) ──

  function beatRowHtml(b) {
    b = b || {};
    return '<div class="sm-beat-row">' +
      '<input class="sbr-label" placeholder="label" value="' + escAttr(b.label || '') + '">' +
      '<input class="sbr-secs" type="number" min="0.5" step="0.5" placeholder="s" value="' + escAttr(b.duration_seconds != null && b.duration_seconds !== '' ? '' + b.duration_seconds : '') + '">' +
      '<input class="sbr-action" placeholder="what HAPPENS -- motion verbs, what transforms" value="' + escAttr(b.action || '') + '">' +
      '<input class="sbr-vo" placeholder="voiceover (optional)" value="' + escAttr(b.voiceover_text || '') + '">' +
      '<span class="sbr-btns">' +
        '<button type="button" class="sbr-up" title="Move up">\\u2191</button>' +
        '<button type="button" class="sbr-down" title="Move down">\\u2193</button>' +
        '<button type="button" class="sbr-del" title="Remove beat">\\u00d7</button>' +
      '</span></div>';
  }

  // Read every row as-is (no filtering) -- used for reorder/remove so indexes hold.
  function readBeatRowsRaw() {
    var beats = [];
    document.querySelectorAll('#sm-beat-rows .sm-beat-row').forEach(function(row) {
      beats.push({
        label: row.querySelector('.sbr-label').value.trim(),
        duration_seconds: parseFloat(row.querySelector('.sbr-secs').value) || 0,
        action: row.querySelector('.sbr-action').value.trim(),
        voiceover_text: row.querySelector('.sbr-vo').value.trim()
      });
    });
    return beats;
  }

  // Beats for saving: drop rows with no action, tidy fields.
  function readBeatRowsForSave() {
    var out = [];
    readBeatRowsRaw().forEach(function(b) {
      if (!b.action) return;
      var beat = { label: b.label || ('beat ' + (out.length + 1)), duration_seconds: b.duration_seconds, action: b.action };
      if (b.voiceover_text) beat.voiceover_text = b.voiceover_text;
      out.push(beat);
    });
    return out;
  }

  function renderBeatRows(beats) {
    var host = document.getElementById('sm-beat-rows');
    if (!host) return;
    host.innerHTML = (beats || []).map(beatRowHtml).join('');
    updateBeatTotal();
  }

  function updateBeatTotal() {
    var el = document.getElementById('sm-beat-total');
    if (!el) return;
    var sum = 0;
    readBeatRowsRaw().forEach(function(b) { sum += b.duration_seconds || 0; });
    el.textContent = sum > 0 ? 'beats total: ' + (Math.round(sum * 10) / 10) + 's (rescaled to fit the scene on save)' : '';
  }

  function wireBeatEditor(initialBeats) {
    renderBeatRows(initialBeats);
    var host = document.getElementById('sm-beat-rows');
    var addBtn = document.getElementById('sm-beat-add');
    if (addBtn) addBtn.addEventListener('click', function() {
      var beats = readBeatRowsRaw();
      beats.push({ label: '', duration_seconds: '', action: '', voiceover_text: '' });
      renderBeatRows(beats);
    });
    if (!host) return;
    host.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      var row = e.target.closest('.sm-beat-row');
      var rows = Array.prototype.slice.call(host.querySelectorAll('.sm-beat-row'));
      var i = rows.indexOf(row);
      if (i < 0) return;
      var beats = readBeatRowsRaw();
      if (btn.className.indexOf('sbr-del') >= 0) beats.splice(i, 1);
      else if (btn.className.indexOf('sbr-up') >= 0 && i > 0) { var t = beats[i - 1]; beats[i - 1] = beats[i]; beats[i] = t; }
      else if (btn.className.indexOf('sbr-down') >= 0 && i < beats.length - 1) { var t2 = beats[i + 1]; beats[i + 1] = beats[i]; beats[i] = t2; }
      else return;
      renderBeatRows(beats);
    });
    host.addEventListener('input', function(e) {
      if (e.target.className && e.target.className.indexOf('sbr-secs') >= 0) updateBeatTotal();
    });
  }

  function renderLayers() {
    // Keeps studio.sb (the storyboard dialog's data source) in step with the
    // active scene. The old bottom-panel preview is gone; the DOM part is a
    // no-op unless the panel exists.
    var project = state.currentProject;
    var idx = state.currentSceneIndex;
    var scene = project && idx >= 0 && project.scenes[idx];
    if (!scene) { clearLayers(); return; }
    var storyboardScene = (project.storyboard && project.storyboard.scenes && project.storyboard.scenes[idx]) || {};
    studio.sb = storyboardSceneToFields(storyboardScene);
    studio.sb.quality = scene.quality || null;
    renderStoryboardPreview();
  }

  function renderStoryboardPreview() {
    if (!els.sbPreview) return;
    var b = studio.sb || {};
    // Critique verdict: what shipped and why. This is the observability the
    // studio previously had none of -- a scene that lost its fight with the
    // critic (exhausted its revision budget) is now visible here, not just
    // in server logs, so it can be targeted with Revise/Regenerate directly.
    var qualityHtml = '';
    if (b.quality) {
      var q = b.quality;
      var cls = q.passed ? 'qb-pass' : 'qb-warn';
      var head = q.passed
        ? '\\u2713 Passed critique clean (score ' + q.score + ', ' + q.attempts + ' attempt' + (q.attempts === 1 ? '' : 's') + ')'
        : '\\u26a0 Shipped with ' + (q.unresolved_defects || []).length + ' unresolved defect' + ((q.unresolved_defects || []).length === 1 ? '' : 's') + ' (score ' + q.score + ', ' + q.attempts + ' attempt' + (q.attempts === 1 ? '' : 's') + ')';
      var defectsHtml = (q.unresolved_defects || []).map(function(d) {
        return '<div class="sb-quality-defect">\\u2022 ' + escHtml(d) + '</div>';
      }).join('');
      qualityHtml = '<div class="sb-quality-block ' + cls + '"><div class="sb-quality-head ' + cls + '">' + head + '</div>' + defectsHtml + '</div>';
    }
    function row(label, text) {
      var has = text && ('' + text).trim();
      return '<div class="sb-prev-row"><div class="sb-prev-label">' + label + '</div>'
        + '<div class="sb-prev-text' + (has ? '' : ' empty') + '">' + escHtml(has ? text : '\\u2014') + '</div></div>';
    }
    var meta = [];
    if (b.duration_seconds) meta.push(b.duration_seconds + 's');
    if (b.components && b.components.length) meta.push(b.components.length + ' component' + (b.components.length === 1 ? '' : 's'));
    if (b.broll_query) meta.push('b-roll');
    else if (b.hero_image) meta.push('hero image');
    var metaHtml = meta.length
      ? '<div class="sb-prev-row"><div class="sb-prev-label">Setup</div><div class="sb-prev-text">' + escHtml(meta.join(' \\u00b7 ')) + '</div></div>'
      : '';
    // Beat timeline: the scene's internal shot clock, one line per beat.
    var beatsHtml = '';
    if (b.beats && b.beats.length) {
      var t = 0;
      var lines = b.beats.map(function(beat, i) {
        var start = t; t += (beat.duration_seconds || 0);
        return '<div class="sb-beat-line"><span class="sb-beat-time">' + start.toFixed(1) + 's</span> <b>' + escHtml(beat.label || ('beat ' + (i + 1))) + '</b> \\u2014 ' + escHtml(beat.action || '') + '</div>';
      }).join('');
      beatsHtml = '<div class="sb-prev-row"><div class="sb-prev-label">Beats (' + b.beats.length + ')</div><div class="sb-prev-text">' + lines + '</div></div>';
    }
    els.sbPreview.innerHTML = qualityHtml + row('Purpose', b.purpose) + row('Script', b.script) + row('Visual notes', b.visual_notes) + beatsHtml + metaHtml;
  }

  function clearLayers() {
    state.currentComponentIndex = -1;
    studio.sb = { purpose: '', script: '', visual_notes: '', duration_seconds: '', broll_query: '', hero_image: '', components: [], beats: [], quality: null };
    if (els.sbPreview) els.sbPreview.innerHTML = '<div class="sb-prev-text empty">No scene selected</div>';
  }

  // ── Smart Prop Editor ──

  // Known enum mappings: key pattern -> possible values
  var ENUM_MAP = {
    'mode': ['words', 'letters', 'lines'],
    'effect': ['scale', 'fade', 'slide', 'none'],
    'animation': ['scale', 'fade', 'slide', 'bounce', 'none'],
    'transition': ['fade', 'slide', 'wipe', 'cut', 'none'],
    'direction': ['left', 'right', 'up', 'down'],
    'alignment': ['left', 'center', 'right'],
    'align': ['left', 'center', 'right'],
    'textAlign': ['left', 'center', 'right'],
    'text_align': ['left', 'center', 'right'],
    'position': ['top', 'center', 'bottom', 'left', 'right'],
    'fontWeight': ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    'font_weight': ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    'easing': ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'],
    'blend': ['normal', 'multiply', 'screen', 'overlay'],
    'blendMode': ['normal', 'multiply', 'screen', 'overlay'],
    'blend_mode': ['normal', 'multiply', 'screen', 'overlay']
  };

  var NAMED_COLORS = [
    'red','blue','green','black','white','yellow','orange','purple','pink','cyan',
    'magenta','gray','grey','brown','transparent','aliceblue','antiquewhite','aqua',
    'aquamarine','azure','beige','bisque','blanchedalmond','blueviolet','burlywood',
    'cadetblue','chartreuse','chocolate','coral','cornflowerblue','cornsilk','crimson',
    'darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
    'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
    'darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise',
    'darkviolet','deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick',
    'floralwhite','forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod',
    'greenyellow','honeydew','hotpink','indianred','indigo','ivory','khaki','lavender',
    'lavenderblush','lawngreen','lemonchiffon','lightblue','lightcoral','lightcyan',
    'lightgoldenrodyellow','lightgray','lightgreen','lightgrey','lightpink','lightsalmon',
    'lightseagreen','lightskyblue','lightslategray','lightslategrey','lightsteelblue',
    'lightyellow','lime','limegreen','linen','maroon','mediumaquamarine','mediumblue',
    'mediumorchid','mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen',
    'mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose','moccasin',
    'navajowhite','navy','oldlace','olive','olivedrab','orangered','orchid',
    'palegoldenrod','palegreen','paleturquoise','palevioletred','papayawhip','peachpuff',
    'peru','plum','powderblue','rebeccapurple','rosybrown','royalblue','saddlebrown',
    'salmon','sandybrown','seagreen','seashell','sienna','silver','skyblue','slateblue',
    'slategray','slategrey','snow','springgreen','steelblue','tan','teal','thistle',
    'tomato','turquoise','violet','wheat','whitesmoke','yellowgreen'
  ];

  function isColorValue(val) {
    if (typeof val !== 'string') return false;
    var v = val.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
    if (/^(rgb|hsl)a?\\s*\\(/i.test(v)) return true;
    if (NAMED_COLORS.indexOf(v) >= 0) return true;
    return false;
  }

  function isUrlValue(val) {
    return typeof val === 'string' && /^https?:\\/\\//i.test(val.trim());
  }

  function getEnumOptions(key, currentVal) {
    // Check exact key match
    var k = key.toLowerCase().replace(/[-_]/g, '');
    for (var enumKey in ENUM_MAP) {
      if (enumKey.toLowerCase().replace(/[-_]/g, '') === k) {
        return ENUM_MAP[enumKey];
      }
    }
    // Check if key ends with a known enum suffix
    for (var enumKey2 in ENUM_MAP) {
      var suffix = enumKey2.toLowerCase().replace(/[-_]/g, '');
      if (k.length > suffix.length && k.slice(-suffix.length) === suffix) {
        return ENUM_MAP[enumKey2];
      }
    }
    return null;
  }

  // Convert any color string to hex for the color picker (best effort)
  function colorToHex(val) {
    if (/^#([0-9a-f]{6})$/i.test(val)) return val;
    if (/^#([0-9a-f]{3})$/i.test(val)) {
      var c = val.slice(1);
      return '#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    // For named/rgb/hsl, use a canvas to convert
    try {
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = val;
      return ctx.fillStyle; // returns hex
    } catch(e) { return '#000000'; }
  }

  function getNumberRange(val) {
    // Determine slider range based on value
    if (val >= 0 && val <= 1) return { min: 0, max: 1, step: 0.01 };
    if (val >= 0 && val <= 10) return { min: 0, max: 20, step: 0.1 };
    if (val >= 0 && val <= 100) return { min: 0, max: 200, step: 1 };
    if (val >= 0 && val <= 1000) return { min: 0, max: 2000, step: 1 };
    var absVal = Math.abs(val) || 1;
    return { min: -absVal * 2, max: absVal * 2, step: absVal > 100 ? 1 : 0.1 };
  }

  function renderProps() {
    if (!els.propEditor) return; // obsolete prop editor removed; Revise panel handles edits
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    var comp = scene && scene.components && scene.components[state.currentComponentIndex];
    if (!comp) { clearProps(); return; }

    var html = '<div class="props-content">';
    html += '<div class="prop-component-type">' + escHtml(comp.type) + '</div>';

    var data = comp.data || {};
    var keys = Object.keys(data);

    if (!keys.length) {
      html += '<div class="empty-state" style="height:auto;padding:8px 0;">No properties</div>';
    } else {
      keys.forEach(function(key) {
        var val = data[key];
        html += '<div class="prop-row">';
        html += '<label class="prop-label">' + escHtml(key) + '</label>';

        if (typeof val === 'boolean') {
          // Toggle switch
          html += '<label class="prop-toggle"><input type="checkbox" class="prop-toggle-input" data-key="' + escAttr(key) + '"' + (val ? ' checked' : '') + '><span class="prop-toggle-slider"></span></label>';

        } else if (typeof val === 'number') {
          // Number input + range slider
          var range = getNumberRange(val);
          html += '<div class="prop-number-row">';
          html += '<input type="number" class="prop-input prop-num-input" data-key="' + escAttr(key) + '" value="' + val + '" step="' + range.step + '">';
          html += '<input type="range" class="prop-range" data-key="' + escAttr(key) + '" min="' + range.min + '" max="' + range.max + '" step="' + range.step + '" value="' + val + '">';
          html += '</div>';

        } else if (typeof val === 'string') {
          var enumOpts = getEnumOptions(key, val);
          if (enumOpts) {
            // Enum select dropdown
            html += '<select class="prop-select" data-key="' + escAttr(key) + '">';
            var hasCurrentVal = enumOpts.indexOf(val) >= 0;
            if (!hasCurrentVal) {
              html += '<option value="' + escAttr(val) + '" selected>' + escHtml(val) + '</option>';
            }
            enumOpts.forEach(function(opt) {
              html += '<option value="' + escAttr(opt) + '"' + (opt === val ? ' selected' : '') + '>' + escHtml(opt) + '</option>';
            });
            html += '</select>';
          } else if (isColorValue(val)) {
            // Color picker + text input
            var hexVal = colorToHex(val);
            html += '<div class="prop-color-row">';
            html += '<input type="color" class="prop-color-picker" data-key="' + escAttr(key) + '" value="' + escAttr(hexVal) + '">';
            html += '<input type="text" class="prop-color-text" data-key="' + escAttr(key) + '" value="' + escAttr(val) + '">';
            html += '</div>';
          } else if (isUrlValue(val)) {
            // URL link + text input
            html += '<div class="prop-url-row">';
            html += '<a class="prop-url-link" href="' + escAttr(val) + '" target="_blank" rel="noopener">' + escHtml(val) + '</a>';
            html += '<input type="text" class="prop-input prop-url-input" data-key="' + escAttr(key) + '" value="' + escAttr(val) + '">';
            html += '</div>';
          } else if (val.length > 50) {
            // Long string textarea
            html += '<textarea class="prop-input" data-key="' + escAttr(key) + '" rows="3">' + escHtml(val) + '</textarea>';
          } else {
            // Short string text input
            html += '<input type="text" class="prop-input" data-key="' + escAttr(key) + '" value="' + escAttr(val) + '">';
          }

        } else if (key === 'script' && Array.isArray(val) && val.length && val.every(function(a) { return a && typeof a === 'object' && a.action; })) {
          // Scripted performance: ordered action rows (at + action + text).
          // The at times are the scene's choreography -- same data the focus
          // mode diamonds drag.
          html += '<div class="prop-script" data-key="script">';
          val.forEach(function(a, ai) {
            html += '<div class="prop-script-row">'
              + '<input type="number" step="0.1" min="0" class="ps-at" data-ai="' + ai + '" value="' + (typeof a.at === 'number' ? a.at : '') + '" title="scene-local time (s)">'
              + '<span class="ps-action" title="' + escAttr(a.action) + '">' + escHtml(a.action) + '</span>'
              + (typeof a.text === 'string'
                  ? '<input type="text" class="ps-text" data-ai="' + ai + '" value="' + escAttr(a.text) + '">'
                  : '<span class="ps-text" style="border:none;color:#9ca3af;">' + escHtml(JSON.stringify(a).slice(0, 60)) + '</span>')
              + '</div>';
          });
          html += '</div>';

        } else if (Array.isArray(val)) {
          // Array: check if it's an array of color strings
          var isColorArray = val.length > 0 && val.every(function(v) { return isColorValue(v); });
          if (isColorArray) {
            html += '<div class="prop-color-array" data-key="' + escAttr(key) + '">';
            val.forEach(function(c, ci) {
              var hexC = colorToHex(c);
              html += '<div class="prop-color-row" style="margin-bottom:4px;">';
              html += '<input type="color" class="prop-color-picker prop-arr-color" data-key="' + escAttr(key) + '" data-ci="' + ci + '" value="' + escAttr(hexC) + '">';
              html += '<input type="text" class="prop-color-text prop-arr-color-text" data-key="' + escAttr(key) + '" data-ci="' + ci + '" value="' + escAttr(c) + '">';
              html += '</div>';
            });
            html += '</div>';
          } else {
            // Editable JSON textarea
            html += '<textarea class="prop-input prop-json-input" data-key="' + escAttr(key) + '" rows="3">' + escHtml(JSON.stringify(val, null, 2)) + '</textarea>';
            html += '<div class="prop-json-error" data-key="' + escAttr(key) + '" style="display:none;"></div>';
          }

        } else if (typeof val === 'object' && val !== null) {
          // Object: editable JSON textarea
          html += '<textarea class="prop-input prop-json-input" data-key="' + escAttr(key) + '" rows="3">' + escHtml(JSON.stringify(val, null, 2)) + '</textarea>';
          html += '<div class="prop-json-error" data-key="' + escAttr(key) + '" style="display:none;"></div>';

        } else {
          html += '<input type="text" class="prop-input" data-key="' + escAttr(key) + '" value="' + escAttr(String(val)) + '">';
        }

        html += '</div>';
      });
    }

    html += '</div>';
    els.propEditor.innerHTML = html;

    // ── Wire up event handlers ──

    // Toggle switches (boolean)
    els.propEditor.querySelectorAll('.prop-toggle-input').forEach(function(input) {
      input.addEventListener('change', function() {
        comp.data[input.dataset.key] = input.checked;
        savePropDebounced();
      });
    });

    // Number inputs + linked range sliders
    els.propEditor.querySelectorAll('.prop-num-input').forEach(function(numInput) {
      var key = numInput.dataset.key;
      var rangeInput = els.propEditor.querySelector('.prop-range[data-key="' + key + '"]');
      numInput.addEventListener('input', function() {
        var v = parseFloat(numInput.value) || 0;
        comp.data[key] = v;
        if (rangeInput) rangeInput.value = v;
        savePropDebounced();
      });
      if (rangeInput) {
        rangeInput.addEventListener('input', function() {
          var v = parseFloat(rangeInput.value) || 0;
          comp.data[key] = v;
          numInput.value = v;
        });
      }
    });

    // Select dropdowns (enum)
    els.propEditor.querySelectorAll('.prop-select').forEach(function(sel) {
      sel.addEventListener('change', function() {
        comp.data[sel.dataset.key] = sel.value;
        savePropDebounced();
      });
    });

    // Color pickers (single value)
    els.propEditor.querySelectorAll('.prop-color-picker:not(.prop-arr-color)').forEach(function(picker) {
      var key = picker.dataset.key;
      var textInput = els.propEditor.querySelector('.prop-color-text[data-key="' + key + '"]');
      picker.addEventListener('input', function() {
        comp.data[key] = picker.value;
        if (textInput) textInput.value = picker.value;
        savePropDebounced();
      });
      if (textInput) {
        textInput.addEventListener('change', function() {
          comp.data[key] = textInput.value;
          if (isColorValue(textInput.value)) {
            picker.value = colorToHex(textInput.value);
          }
        });
      }
    });

    // Color array pickers
    els.propEditor.querySelectorAll('.prop-arr-color').forEach(function(picker) {
      var key = picker.dataset.key;
      var ci = parseInt(picker.dataset.ci, 10);
      var textInput = els.propEditor.querySelector('.prop-arr-color-text[data-key="' + key + '"][data-ci="' + ci + '"]');
      picker.addEventListener('input', function() {
        if (Array.isArray(comp.data[key])) {
          comp.data[key][ci] = picker.value;
        }
        if (textInput) textInput.value = picker.value;
        savePropDebounced();
      });
      if (textInput) {
        textInput.addEventListener('change', function() {
          if (Array.isArray(comp.data[key])) {
            comp.data[key][ci] = textInput.value;
          }
          if (isColorValue(textInput.value)) {
            picker.value = colorToHex(textInput.value);
          }
          savePropDebounced();
        });
      }
    });

    // URL inputs
    els.propEditor.querySelectorAll('.prop-url-input').forEach(function(input) {
      input.addEventListener('change', function() {
        comp.data[input.dataset.key] = input.value;
        // Update the link
        var link = input.parentElement.querySelector('.prop-url-link');
        if (link) { link.href = input.value; link.textContent = input.value; }
        savePropDebounced();
      });
    });

    // JSON textarea inputs (arrays/objects) with validation on blur
    els.propEditor.querySelectorAll('.prop-json-input').forEach(function(ta) {
      var key = ta.dataset.key;
      var errEl = els.propEditor.querySelector('.prop-json-error[data-key="' + key + '"]');
      ta.addEventListener('blur', function() {
        try {
          var parsed = JSON.parse(ta.value);
          comp.data[key] = parsed;
          if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
          ta.style.borderColor = '';
          savePropDebounced();
        } catch(e) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Invalid JSON: ' + e.message; }
          ta.style.borderColor = '#dc2626';
        }
      });
    });

    // Generic text/textarea inputs (short strings, long strings)
    els.propEditor.querySelectorAll('.prop-input:not(.prop-num-input):not(.prop-json-input):not(.prop-url-input)').forEach(function(input) {
      if (input.dataset.key && comp.data.hasOwnProperty(input.dataset.key) && typeof comp.data[input.dataset.key] === 'string') {
        var handler = function() { comp.data[input.dataset.key] = input.value; savePropDebounced(); };
        input.addEventListener('input', handler);
      }
    });

    // Script rows: retime an action or rewrite its text
    els.propEditor.querySelectorAll('.prop-script .ps-at').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var a = (comp.data.script || [])[parseInt(inp.dataset.ai, 10)];
        if (a) { a.at = parseFloat(inp.value) || 0; savePropDebounced(); }
      });
    });
    els.propEditor.querySelectorAll('.prop-script input.ps-text').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var a = (comp.data.script || [])[parseInt(inp.dataset.ai, 10)];
        if (a) { a.text = inp.value; savePropDebounced(); }
      });
    });
  }

  function clearProps() {
    // Obsolete data-driven prop editor (replaced by the Revise panel). No-op now.
    if (!els.propEditor) return;
    els.propEditor.innerHTML = '<div class="empty-state">Select a component</div>';
  }
  // ── Save prop to server and reload preview ──
  var _saveTimer = null;
  function savePropDebounced() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(savePropNow, 400);
  }

  // ── Inspector drawer (SPEC-studio-structure) ──
  // The scene's cast: one node per component; selecting one drives the
  // typed prop editor below. Hover outlines the element on canvas.
  function inspOpen() {
    var el = document.getElementById('inspector');
    return !!(el && el.classList.contains('open'));
  }
  function renderInspector() {
    var host = document.getElementById('insp-tree');
    if (!host) return;
    var project = state.currentProject;
    var scene = project && project.scenes && project.scenes[state.currentSceneIndex];
    var titleEl = document.getElementById('insp-title');
    var provEl = document.getElementById('insp-prov');
    if (!scene) {
      host.innerHTML = '<div class="empty-state">No scene selected</div>';
      if (titleEl) titleEl.textContent = 'Scene';
      if (provEl) { provEl.textContent = ''; provEl.title = ''; }
      clearProps();
      return;
    }
    var kind = sceneProvenance(scene);
    var prov = PROVENANCE[kind];
    if (titleEl) titleEl.textContent = scene.label || scene.id;
    if (provEl) { provEl.textContent = prov.glyph + ' ' + prov.label; provEl.title = prov.tip; provEl.className = 'insp-prov sp-' + kind; }
    var html = '';
    (scene.components || []).forEach(function(c, i) {
      var isCustom = /^scene_/.test(c.type || '');
      var scripts = (c.data && Array.isArray(c.data.script)) ? c.data.script.length : 0;
      var inAt = (c.enter && typeof c.enter.at === 'number') ? c.enter.at : null;
      var meta = [];
      if (scripts) meta.push(scripts + ' actions');
      if (inAt !== null) meta.push('in @' + inAt.toFixed(1) + 's');
      html += '<div class="insp-node' + (i === state.currentComponentIndex ? ' active' : '') + '" data-ci="' + i + '">'
        + '<span class="in-type">' + escHtml(isCustom ? 'Custom scene (generated)' : c.type) + '</span>'
        + '<span class="in-meta">' + escHtml(meta.join(' \\u00b7 ')) + '</span>'
        + '</div>';
    });
    host.innerHTML = html || '<div class="empty-state">No components</div>';
    host.querySelectorAll('.insp-node').forEach(function(node) {
      var ci = parseInt(node.dataset.ci, 10);
      node.addEventListener('click', function() {
        state.currentComponentIndex = ci;
        renderInspector();
        renderProps();
      });
      node.addEventListener('mouseenter', function() { outlineComp(ci, true); });
      node.addEventListener('mouseleave', function() { outlineComp(ci, false); });
    });
    renderProps();
  }
  function outlineComp(ci, on) {
    try {
      var scene = state.currentProject.scenes[state.currentSceneIndex];
      var comp = scene.components[ci];
      if (!comp) return;
      var doc = els.previewIframe.contentDocument;
      var el = doc.querySelector('[data-cid="' + scene.id + '__' + comp.id + '"]')
        || doc.querySelector('[data-cid="' + comp.id + '"]');
      if (el) el.style.outline = on ? '2px solid #6366f1' : '';
    } catch (e) {}
  }
  (function wireInspector() {
    var btn = document.getElementById('inspect-btn');
    var panel = document.getElementById('inspector');
    var close = document.getElementById('insp-close');
    if (btn && panel) btn.addEventListener('click', function() {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) renderInspector();
    });
    if (close && panel) close.addEventListener('click', function() { panel.classList.remove('open'); });
  })();

  // ── Scene focus mode: the scene's own clock ──
  // Double-click a scene chip: the timeline area becomes THAT scene's
  // component timeline -- bars (enter.at..exit.at), script diamonds, beat
  // gridlines, all draggable with snap. Every drag is an ordinary PATCH.
  var focusSceneIdx = -1;
  function refreshCompositeQuiet() {
    var p = state.currentProject;
    if (!p || !state.compositeLoaded) return;
    var saved = state.masterTime || 0;
    fetchHtml('/preview-composite/' + state.tenantId + '/' + p.project_id).then(function(h) {
      state._compositeHtml = h;
      writeSceneToIframe(h);
      setTimeout(function() {
        var tl = getCompositeMasterTimeline();
        if (tl) { tl.time(saved); tl.pause(); }
      }, 600);
    });
  }
  function exitFocus() {
    focusSceneIdx = -1;
    _fmScenePlayEnd = -1;
    if (_fmRaf) { cancelAnimationFrame(_fmRaf); _fmRaf = null; }
    var fl = document.getElementById('focus-lane');
    if (fl) { fl.style.display = 'none'; fl.innerHTML = ''; }
  }
  function enterFocus(idx) {
    focusSceneIdx = idx;
    renderFocusLane();
  }
  function focusBeatBounds(scene, dur) {
    var bounds = []; var acc = 0;
    (scene.beats || []).forEach(function(b) {
      acc += (b.duration_seconds || 0);
      if (acc < dur - 0.05) bounds.push(Math.round(acc * 100) / 100);
    });
    return bounds;
  }
  function renderFocusLane() {
    var fl = document.getElementById('focus-lane');
    if (!fl) return;
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[focusSceneIdx];
    if (!scene) { exitFocus(); return; }
    var dur = scene.duration_seconds || 5;
    var comps = scene.components || [];
    var bounds = focusBeatBounds(scene, dur);
    var html = '<div class="fm-head">'
      + '<button id="fm-exit" title="Back to the film timeline (Esc)">\\u2190 Back to film</button>'
      + '<button id="fm-play" title="Play just this scene (pauses at its end)">\\u25b6 Play scene</button>'
      + '<span class="fm-title">' + escHtml(scene.label || scene.id) + ' \\u00b7 ' + dur.toFixed(1) + 's on the scene clock'
      + (bounds.length ? ' \\u00b7 ' + (bounds.length + 1) + ' beats (drags snap)' : '') + '</span>'
      + '<span class="fm-hint">drag anywhere to scrub \\u00b7 Esc closes</span></div>';
    html += '<div class="fm-track" id="fm-track">';
    html += '<div class="fm-playhead" id="fm-playhead"></div>';
    for (var s = 1; s < dur; s++) html += '<div class="fm-grid fm-sec" style="left:' + ((s / dur) * 100).toFixed(2) + '%"></div>';
    bounds.forEach(function(b) { html += '<div class="fm-grid fm-beat" style="left:' + ((b / dur) * 100).toFixed(2) + '%"></div>'; });
    comps.forEach(function(c, i) {
      var isCustom = /^scene_/.test(c.type || '');
      var inAt = (c.enter && typeof c.enter.at === 'number') ? c.enter.at : 0;
      var outAt = (c.exit && typeof c.exit.at === 'number') ? c.exit.at : dur;
      html += '<div class="fm-row" style="top:' + (i * 22) + 'px" data-ci="' + i + '">'
        + '<span class="fm-name" title="' + escAttr(c.type) + '">' + escHtml(isCustom ? 'custom scene' : c.type) + '</span>'
        + '<div class="fm-bar' + (isCustom ? ' fm-custom' : '') + '" data-ci="' + i + '" style="left:' + ((inAt / dur) * 100).toFixed(2) + '%;width:' + (((outAt - inAt) / dur) * 100).toFixed(2) + '%"'
        + ' title="' + escAttr(c.type + ' \\u2014 on stage ' + inAt.toFixed(1) + 's\\u2013' + outAt.toFixed(1) + 's') + '">'
        + (isCustom ? '' :
            '<span class="fm-edge fm-edge-l" data-ci="' + i + '" title="Drag: entrance time"></span>'
          + '<span class="fm-edge fm-edge-r" data-ci="' + i + '" title="Drag: exit time"></span>')
        + '</div>';
      var script = (c.data && Array.isArray(c.data.script)) ? c.data.script : [];
      script.forEach(function(a, si) {
        if (!a || typeof a.at !== 'number') return;
        html += '<div class="fm-diamond" data-ci="' + i + '" data-si="' + si + '" style="left:' + ((Math.min(a.at, dur) / dur) * 100).toFixed(2) + '%"'
          + ' title="' + escAttr((a.action || 'action') + ' @ ' + a.at.toFixed(2) + 's \\u2014 drag to retime') + '"></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    fl.style.display = 'block';
    fl.style.height = (30 + comps.length * 22 + 8) + 'px';
    fl.innerHTML = html;
    var ex = document.getElementById('fm-exit');
    if (ex) ex.addEventListener('click', exitFocus);
    var fp = document.getElementById('fm-play');
    if (fp) fp.addEventListener('click', function() { fmPlayScene(scene, dur); });
    wireFocusDrags(scene, dur, bounds);
    fmStartPlayhead();
  }
  // ── Focus transport: playhead, scrub, scene-play, Esc ──
  function fmSceneStart() {
    try {
      var meta = els.previewIframe.contentWindow.__MP_SCENE_META;
      return meta && meta[focusSceneIdx] ? meta[focusSceneIdx].start : sceneOffset(focusSceneIdx);
    } catch (e) { return sceneOffset(focusSceneIdx); }
  }
  var _fmRaf = null;
  var _fmScenePlayEnd = -1;
  function fmStartPlayhead() {
    if (_fmRaf) cancelAnimationFrame(_fmRaf);
    (function tick() {
      if (focusSceneIdx < 0) { _fmRaf = null; return; }
      var ph = document.getElementById('fm-playhead');
      var scene = state.currentProject && state.currentProject.scenes[focusSceneIdx];
      if (ph && scene) {
        var dur = scene.duration_seconds || 5;
        var tl = getCompositeMasterTimeline();
        var t = tl ? tl.time() : (state.masterTime || 0);
        var local = Math.max(0, Math.min(dur, t - fmSceneStart()));
        ph.style.left = ((local / dur) * 100).toFixed(2) + '%';
        // Scene-play: stop the transport at the scene's end.
        if (_fmScenePlayEnd >= 0 && state.playing && t >= _fmScenePlayEnd - 0.03) {
          _fmScenePlayEnd = -1;
          var pb = document.getElementById('play-btn');
          if (pb) pb.click();
        }
      }
      _fmRaf = requestAnimationFrame(tick);
    })();
  }
  function fmSeekLocal(t, dur) {
    var start = fmSceneStart();
    var clamped = Math.max(0, Math.min(dur, t));
    try {
      var tl = getCompositeMasterTimeline();
      if (tl && !state.playing) { tl.time(start + clamped); tl.pause(); }
      state.masterTime = start + clamped;
      updateTimeDisplay(start + clamped);
    } catch (e) {}
  }
  function fmPlayScene(scene, dur) {
    var start = fmSceneStart();
    var tl = getCompositeMasterTimeline();
    if (state.playing) { _fmScenePlayEnd = -1; var pb0 = document.getElementById('play-btn'); if (pb0) pb0.click(); return; }
    if (tl) { tl.time(start); tl.pause(); }
    state.masterTime = start;
    _fmScenePlayEnd = start + dur;
    var pb = document.getElementById('play-btn');
    if (pb) pb.click();
  }
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && focusSceneIdx >= 0) { exitFocus(); ev.stopPropagation(); }
  });
  function fmSnap(t, dur, bounds) {
    var cands = bounds.slice();
    for (var s = 0; s <= Math.ceil(dur * 2); s++) cands.push(s / 2);
    var best = t, bd = 0.18;
    cands.forEach(function(c) { var d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } });
    return Math.max(0, Math.min(dur, Math.round(best * 100) / 100));
  }
  function wireFocusDrags(scene, dur, bounds) {
    var track = document.getElementById('fm-track');
    if (!track) return;
    function pxToT(clientX) {
      var r = track.getBoundingClientRect();
      return fmSnap(((clientX - r.left) / Math.max(1, r.width)) * dur, dur, bounds);
    }
    function patchComp(comp, body, done) {
      var p = state.currentProject;
      var path = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
      api('PATCH', path, body).then(function() {
        refreshCompositeQuiet();
        if (inspOpen()) renderInspector();
        if (done) done();
      }).catch(function() {});
    }
    track.querySelectorAll('.fm-diamond').forEach(function(d) {
      d.addEventListener('pointerdown', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        d.setPointerCapture(ev.pointerId);
        var comp = scene.components[parseInt(d.dataset.ci, 10)];
        var si = parseInt(d.dataset.si, 10);
        function mv(e2) { var t = pxToT(e2.clientX); d._t = t; d.style.left = ((t / dur) * 100).toFixed(2) + '%'; }
        function up() {
          d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up);
          if (typeof d._t === 'number' && comp && comp.data && comp.data.script && comp.data.script[si]) {
            comp.data.script[si].at = d._t;
            patchComp(comp, { data: { script: comp.data.script } });
          }
        }
        d.addEventListener('pointermove', mv);
        d.addEventListener('pointerup', up);
      });
    });
    track.querySelectorAll('.fm-edge').forEach(function(edge) {
      edge.addEventListener('pointerdown', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        edge.setPointerCapture(ev.pointerId);
        var comp = scene.components[parseInt(edge.dataset.ci, 10)];
        var isL = edge.classList.contains('fm-edge-l');
        var bar = edge.parentElement;
        function mv(e2) {
          var t = pxToT(e2.clientX);
          edge._t = t;
          var inAt = (comp.enter && typeof comp.enter.at === 'number') ? comp.enter.at : 0;
          var outAt = (comp.exit && typeof comp.exit.at === 'number') ? comp.exit.at : dur;
          if (isL) inAt = Math.min(t, outAt - 0.2); else outAt = Math.max(t, inAt + 0.2);
          bar.style.left = ((inAt / dur) * 100).toFixed(2) + '%';
          bar.style.width = (((outAt - inAt) / dur) * 100).toFixed(2) + '%';
        }
        function up() {
          edge.removeEventListener('pointermove', mv); edge.removeEventListener('pointerup', up);
          if (typeof edge._t !== 'number' || !comp) return;
          if (isL) {
            var enter = comp.enter || { effect: 'fade' };
            enter.at = Math.min(edge._t, ((comp.exit && comp.exit.at) || dur) - 0.2);
            comp.enter = enter;
            patchComp(comp, { enter: enter }, renderFocusLane);
          } else {
            // Dragging the right edge back to the scene end clears the exit.
            if (edge._t >= dur - 0.05) {
              delete comp.exit;
              patchComp(comp, { exit: null }, renderFocusLane);
            } else {
              var exitA = comp.exit || { effect: 'fade' };
              exitA.at = Math.max(edge._t, ((comp.enter && comp.enter.at) || 0) + 0.2);
              comp.exit = exitA;
              patchComp(comp, { exit: exitA }, renderFocusLane);
            }
          }
        }
        edge.addEventListener('pointermove', mv);
        edge.addEventListener('pointerup', up);
      });
    });
    // Scrub: press-and-drag anywhere that isn't a drag handle. The lane is a
    // timeline -- grabbing it should always move the playhead.
    track.addEventListener('pointerdown', function(ev) {
      if (ev.target.closest && (ev.target.closest('.fm-diamond') || ev.target.closest('.fm-edge'))) return;
      ev.preventDefault();
      try { track.setPointerCapture(ev.pointerId); } catch (e) {}
      function seekFrom(e2) {
        var r = track.getBoundingClientRect();
        fmSeekLocal(((e2.clientX - r.left) / Math.max(1, r.width)) * dur, dur);
      }
      seekFrom(ev);
      function mv(e2) { seekFrom(e2); }
      function up() { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); }
      track.addEventListener('pointermove', mv);
      track.addEventListener('pointerup', up);
    });
  }

  function savePropNow() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    var comp = scene && scene.components[state.currentComponentIndex];
    if (!project || !scene || !comp) return;

    // Remember current position before reload
    var savedMasterTime = state.masterTime || 0;
    var patchPath = '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    api('PATCH', patchPath, { data: comp.data }).then(function(result) {
      if (state.compositeLoaded) {
        // Composite mode: re-fetch the entire composite document
        var compositePath = '/preview-composite/' + state.tenantId + '/' + project.project_id;
        fetchHtml(compositePath).then(function(freshHtml) {
          state._compositeHtml = freshHtml;
          writeSceneToIframe(freshHtml);
          waitForCompositeReady(function(masterTl) {
            masterTl.time(savedMasterTime);
            masterTl.pause();
          });
        });
      }
    }).catch(function(e) {
      console.error('Save failed:', e);
    });
  }




  // Sync <video> elements inside the preview iframe to the scene local time.
  // For live preview: let video play naturally, only seek on large drift or scrub.
  // For capture mode the scene-worker handles frame-by-frame seeking.

  // Find which scene a global time falls in, returns { index, localTime }

  // ── Speaker track preview support ──
  function getSpeakerClipUrl() {
    var project = state.currentProject;
    if (!project || !project.speaker_track || !project.speaker_track.clips || !project.speaker_track.clips.length) return null;
    var source = project.speaker_track.clips[0].source;
    if (!source) return null;
    // Already an HTTP URL
    if (source.startsWith('http')) return source;
    // Filesystem path -> tenant-level asset URL
    if (source.startsWith('/data/media-producer/')) {
      var rel = source.replace('/data/media-producer/', '');
      return '/assets/' + rel;
    }
    if (source.startsWith('/assets/')) return source;
    return source;
  }

  // Robust "is this video the speaker?" check. The naive /speaker/ test only
  // catches the __mp_speaker_base underlay; a PiP bound to the speaker resolves
  // to the camera's real filename (e.g. camera.mp4), which has no "speaker" in
  // its src -- so also match the actual speaker clip by url/basename. Without
  // this the PiP camera shows as a SECOND editable video in the media lane.
  function isSpeakerVideoSrc(src) {
    if (!src) return false;
    if (/speaker/i.test(src)) return true;
    var spk = getSpeakerClipUrl();
    if (!spk) return false;
    var base = spk.split('/').pop();
    return src === spk || (!!base && src.indexOf(base) >= 0);
  }

  function isSpeakerScene(sceneIndex) {
    var project = state.currentProject;
    if (!project || !project.scenes || !project.speaker_track) return false;
    var scene = project.scenes[sceneIndex];
    if (!scene) return false;
    // Mirror the RENDER's rule: on a speaker project, every scene composites
    // over the live camera unless it explicitly opts out. (Requiring === true
    // hid the camera on every scene, since the pipeline leaves the field
    // unset -- the composite showed overlays floating on a blank background.)
    return scene.transparent_background !== false;
  }




  // ── Camera moves: direct manipulation (click a point at a time) ──
  // Deterministic data -> the assembler applies it as GSAP; no prompting.
  function currentSceneEntry() {
    var p = state.currentProject;
    if (!p || state.currentSceneIndex < 0) return null;
    return p.scenes[state.currentSceneIndex] || null;
  }

  // Scene start on the master clock: composite meta when available (includes
  // transition insertions), plain duration sum otherwise.
  function sceneStartFor(index) {
    try {
      var meta = els.previewIframe.contentWindow.__MP_SCENE_META;
      if (meta && meta[index]) return meta[index].start;
    } catch (e) {}
    return sceneOffset(index);
  }

  // The scene's "screencast": its largest non-speaker video. Mirrors how the
  // runtime rig resolves target:"screencast", so what the UI offers is what
  // the saved move will actually do.
  // All zoomable videos in a scene (anything but the shell's speaker
  // underlay). A scene can hold several -- side-by-side demos, a PiP -- and
  // each is an independent "zoom inside" target.
  function sceneVideos(doc, sceneId) {
    try {
      var root = (sceneId && doc.querySelector('.mp-scene[data-scene-id="' + sceneId + '"]')) || doc.body;
      var out = [];
      var vids = root.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        if (vids[i].id === '__mp_speaker_base') continue;
        // Derived mirrors (callout clones) are synced playback copies of a
        // base video -- one LOGICAL media, so editing surfaces skip them.
        if (vids[i].getAttribute('data-mp-derived')) continue;
        out.push(vids[i]);
      }
      return out;
    } catch (e) { return []; }
  }

  // A stable target for one specific video: a src-filename selector the
  // runtime rig can resolve ("video[src*=\\"demo.mp4\\"]"). Falls back to the
  // legacy "screencast" semantic (largest non-speaker video) for videos
  // without a usable src.
  function videoTargetFor(v) {
    var src = (v.getAttribute('src') || '').split('?')[0];
    var base = src.split('/').pop() || '';
    base = base.replace(/["'\\\\\\]]/g, '');
    if (base) return 'video[src*="' + base + '"]';
    return 'screencast';
  }

  function videoLabelFor(v) {
    var src = (v.getAttribute('src') || '').split('?')[0];
    return src.split('/').pop() || 'video';
  }

  // The video the selected element refers to: the element itself, a wrapper
  // around exactly that video, or something sitting on top of it.
  function videoForSelection(sel) {
    if (!sel || !sel._el || !sel._doc) return null;
    var vids = sceneVideos(sel._doc, sel.sceneId || (currentSceneEntry() || {}).id);
    if (!vids.length) return null;
    var el = sel._el;
    if (el.tagName === 'VIDEO') return el.id === '__mp_speaker_base' ? null : el;
    var contained = vids.filter(function(v) { return el.contains(v); });
    if (contained.length === 1) return contained[0];
    try {
      var er = el.getBoundingClientRect();
      var ecx = er.left + er.width / 2, ecy = er.top + er.height / 2;
      var best = null, bestA = Infinity;
      vids.forEach(function(v) {
        var r = v.getBoundingClientRect();
        if (ecx >= r.left && ecx <= r.right && ecy >= r.top && ecy <= r.bottom) {
          var a = r.width * r.height;
          if (a < bestA) { bestA = a; best = v; }
        }
      });
      return best;
    } catch (e) { return null; }
  }

  // The video a drawn box lands in (box center inside the video's rect;
  // smallest such video wins so a PiP over a screencast picks the PiP).
  function videoForBox(doc, sceneId, boxPx) {
    var vids = sceneVideos(doc, sceneId);
    var cx = boxPx.left + boxPx.width / 2, cy = boxPx.top + boxPx.height / 2;
    var best = null, bestA = Infinity, bestRect = null;
    vids.forEach(function(v) {
      try {
        var r = v.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          var a = r.width * r.height;
          if (a < bestA) { bestA = a; best = v; bestRect = r; }
        }
      } catch (e) {}
    });
    return best ? { video: best, rect: bestRect } : null;
  }

  function camMoveDesc(m) {
    return (m.target === 'screencast' ? 'screencast ' : (m.target ? 'in-video ' : '')) + (m.type || 'zoom')
      + (m.type === 'pan' ? ' (at current zoom)' : (m.w ? ' [box ' + m.w + '\u00d7' + m.h + '%]' : (m.scale ? ' ' + m.scale + '\u00d7' : '')))
      + ' @' + (m.at != null ? Number(m.at).toFixed(1) : '?') + 's'
      + ' \u2192 (' + Math.round(m.x || 50) + '%, ' + Math.round(m.y || 50) + '%)'
      + (m['return'] ? ' \u21a9' : '');
  }

  // Camera moves live on the scrubber: one pill per move, across ALL scenes.
  // Clicking a pill opens the editor popover (edit / preview / delete).
  // The EFFECTS LANE (name kept for its call sites): every zoom / pan /
  // rotate / callout as a DURATION block. A camera move holds until the
  // next move in its scene (or the scene end); a reset is a thin end-cap;
  // callouts carry their own dur. Clicking a block opens the same editor
  // the old pills did.
  function renderCamPills() {
    var wrap = document.getElementById('fx-lane');
    if (!wrap) return;
    wrap.innerHTML = '';
    var p = state.currentProject;
    var total = state.totalDuration || calcTotalDuration();
    if (!p || !p.scenes || !(total > 0)) return;
    var glyph = { zoom: '\u2922', pan: '\u2194', rotate: '\u21BB', reset: '\u21A9' };
    // Blocks are COLLECTED, then laid out: effects are peers that may run
    // at the same time, and overlapping blocks split the bar height (1/n
    // each) so two parallel effects read as two parallel bars in the lane.
    var segs = [];
    function block(from, to, cls, text, title, onClick) {
      segs.push({ from: from, to: to, cls: cls, text: text, title: title, onClick: onClick });
    }
    function placeSegs() {
      segs.sort(function(a, b) { return a.from - b.from || a.to - b.to; });
      var EPS = 0.05;
      var clusterEnd = -1, cluster = [];
      function flushCluster() {
        if (!cluster.length) return;
        var rowEnds = [];
        cluster.forEach(function(s) {
          var r = 0;
          while (r < rowEnds.length && rowEnds[r] > s.from + EPS) r++;
          s.row = r;
          rowEnds[r] = Math.max(rowEnds[r] || 0, s.to);
        });
        cluster.forEach(function(s) { s.rows = rowEnds.length; });
        cluster = [];
      }
      segs.forEach(function(s) {
        if (s.from > clusterEnd - EPS) flushCluster();
        cluster.push(s);
        clusterEnd = Math.max(clusterEnd, s.to);
      });
      flushCluster();
      segs.forEach(function(s) {
        var b = document.createElement('div');
        b.className = 'fx-seg ' + s.cls + (s.rows > 1 ? ' fx-thin' : '');
        b.textContent = s.text;
        b.style.left = ((s.from / total) * 100).toFixed(2) + '%';
        b.style.width = Math.max(0.4, (((s.to - s.from) / total) * 100)).toFixed(2) + '%';
        if (s.rows > 1) {
          var hh = 26 / s.rows;
          b.style.top = (3 + s.row * hh).toFixed(1) + 'px';
          b.style.height = (hh - 1).toFixed(1) + 'px';
          b.style.lineHeight = Math.max(8, hh - 3).toFixed(0) + 'px';
        }
        b.title = s.title;
        b.addEventListener('click', function(ev) { ev.stopPropagation(); s.onClick(b); });
        wrap.appendChild(b);
      });
    }
    p.scenes.forEach(function(scene, si) {
      var sceneStart = sceneStartFor(si);
      var dur = scene.duration_seconds || 5;
      var raw = scene.camera_moves || [];
      var moves = raw.slice().sort(function(a, b) { return (a.at || 0) - (b.at || 0); });
      moves.forEach(function(m) {
        var mi = raw.indexOf(m);
        var from = sceneStart + (m.at || 0);
        var to;
        var holdNote;
        var open = false;
        if (m.type === 'reset') {
          to = from + 0.001; // end-cap: rendered at minimum width
          holdNote = 'release the camera';
        } else if (m.return) {
          // A returning move has a real arc: ease in + hold + ease back.
          var easeS = (m.duration != null ? Number(m.duration) : 1);
          to = from + easeS + (m.hold != null ? Number(m.hold) : 0) + easeS;
          holdNote = 'eases in ' + easeS.toFixed(1) + 's, holds ' + (m.hold != null ? Number(m.hold).toFixed(1) : '0.0') + 's, returns';
        } else {
          // No return: the effect stays applied -- open-ended until the
          // next move takes over or the scene ends (drawn with a fade).
          var next = moves.filter(function(n) { return (n.at || 0) > (m.at || 0) + 0.01; })[0];
          to = sceneStart + (next ? (next.at || 0) : dur);
          open = true;
          holdNote = 'no return \u2014 stays applied until ' + (next ? ('the next move at ' + (next.at || 0).toFixed(1) + 's') : 'the scene ends');
        }
        to = Math.min(to, sceneStart + dur);
        block(from, to, 'fx-' + m.type + (open ? ' fx-open' : ''),
          (glyph[m.type] || '\u2922') + ' ' + (m.type || 'zoom'),
          'Scene ' + (si + 1) + ': ' + camMoveDesc(m) + ' \u2014 ' + holdNote + '. Click to edit.',
          function(el2) { camPopOpen(si, mi, el2); });
      });
      (scene.components || []).forEach(function(comp) {
        if (comp.type !== 'screencast-frame' || !comp.data || !Array.isArray(comp.data.callouts)) return;
        comp.data.callouts.forEach(function(c, ci) {
          var from = sceneStart + (c.at || 0);
          var to = from + (c.dur || 5);
          block(from, Math.min(sceneStart + dur, to), 'fx-callout',
            '\u2299 callout',
            'Scene ' + (si + 1) + ': callout [' + Math.round(c.w) + '\u00D7' + Math.round(c.h) + '%] @' + Number(c.at || 0).toFixed(1) + 's for ' + Number(c.dur || 5).toFixed(1) + 's. Click to edit.',
            function(el2) { coPopOpen(si, comp.id, ci, el2); });
        });
      });
      // Chapter cards: title overlays from the narration-track component.
      // The spine drafts them; these blocks are how the user OWNS them.
      (scene.components || []).forEach(function(comp) {
        if (comp.type !== 'narration-track' || !comp.data || !Array.isArray(comp.data.chapters)) return;
        comp.data.chapters.forEach(function(ch, ci) {
          if (!ch || typeof ch.at !== 'number') return;
          var from = sceneStart + ch.at;
          var hold = (typeof ch.dur === 'number' && ch.dur >= 0.5) ? ch.dur : 2.2;
          block(from, Math.min(sceneStart + dur, from + hold + 0.4), 'fx-chap',
            '⚑ ' + (ch.title || 'Chapter'),
            'Scene ' + (si + 1) + ': chapter card "' + (ch.title || '') + '" @' + Number(ch.at).toFixed(1) + 's, shows ' + hold.toFixed(1) + 's. Click to rename, retime, or delete.',
            function(el2) { chapPopOpen(si, comp.id, ci, el2); });
        });
      });
    });
    placeSegs();
  }

  // ── Callout editor popover (opens from a scrubber pill) ──
  function coPopOpen(si, compId, ci, pill) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    var comp = null;
    if (scene) (scene.components || []).forEach(function(c) { if (c.id === compId) comp = c; });
    var co = comp && comp.data && Array.isArray(comp.data.callouts) && comp.data.callouts[ci];
    var pop = document.getElementById('cam-pop');
    if (!co || !pop) return;
    camPopClose();
    pill.classList.add('active');
    var sdur = scene.duration_seconds || 5;
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>Callout</b> — scene ' + (si + 1) + '</span>' +
      '<button class="sp-x" id="co-x" title="Close (Esc)">✕</button></div>' +
      '<div class="sp-fields">' +
        '<label>at <input id="co-at" type="number" min="0" max="' + escAttr('' + Math.max(0, sdur - 2).toFixed(1)) + '" step="0.1" value="' + escAttr('' + (co.at != null ? co.at : 0)) + '">s</label>' +
        '<label>hold <input id="co-dur" type="number" min="1.5" max="20" step="0.5" value="' + escAttr('' + (co.dur != null ? co.dur : 5)) + '">s</label>' +
        '<label title="Flight speed out and back">ease <input id="co-travel" type="number" min="0.35" max="2" step="0.05" value="' + escAttr('' + (co.travel || 0.9)) + '">s</label>' +
      '</div>' +
      '<div class="sp-fields">' +
        '<label>x <input id="co-xf" type="number" min="0" max="96" step="0.5" value="' + escAttr('' + (co.x || 0)) + '">%</label>' +
        '<label>y <input id="co-yf" type="number" min="0" max="96" step="0.5" value="' + escAttr('' + (co.y || 0)) + '">%</label>' +
        '<label>w <input id="co-wf" type="number" min="2" max="100" step="0.5" value="' + escAttr('' + (co.w || 30)) + '">%</label>' +
        '<label>h <input id="co-hf" type="number" min="2" max="100" step="0.5" value="' + escAttr('' + (co.h || 30)) + '">%</label>' +
      '</div>' +
      '<div class="sp-row">' +
        '<button class="rv-go secondary" id="co-del" style="flex:0 0 auto;">Delete</button>' +
        '<button class="rv-go" id="co-save" style="flex:1;">Save</button>' +
      '</div>';
    pop.style.display = 'block';
    var pr = pill.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 180;
    var px = Math.max(8, Math.min(pr.left + pr.width / 2 - pw / 2, window.innerWidth - pw - 8));
    var py = pr.top - ph - 10;
    if (py < 8) py = pr.bottom + 10;
    pop.style.left = px + 'px';
    pop.style.top = py + 'px';
    document.getElementById('co-x').addEventListener('click', camPopClose);
    function num(id, fb) { var v = parseFloat(document.getElementById(id).value); return isNaN(v) ? fb : v; }
    document.getElementById('co-save').addEventListener('click', function() {
      var next = comp.data.callouts.slice();
      next[ci] = {
        at: Math.max(0, Math.min(sdur - 2, num('co-at', co.at || 0))),
        dur: Math.max(1.5, num('co-dur', co.dur || 5)),
        travel: Math.max(0.35, Math.min(2, num('co-travel', co.travel || 0.9))),
        x: num('co-xf', co.x || 0), y: num('co-yf', co.y || 0),
        w: num('co-wf', co.w || 30), h: num('co-hf', co.h || 30),
      };
      camPopClose();
      saveCalloutsData(si, comp, next);
    });
    document.getElementById('co-del').addEventListener('click', function() {
      var next = comp.data.callouts.slice();
      next.splice(ci, 1);
      camPopClose();
      saveCalloutsData(si, comp, next);
    });
  }

  // ── Chapter editor popover: the chapter card is a first-class edit --
  // rename / retime / resize / delete, saved to the narration-track
  // component's data. The spine only DRAFTS chapters; the chapters_edited
  // flag written here stops it from ever overwriting the user's list. ──
  function chapPopOpen(si, compId, ci, anchorEl) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    var comp = null;
    if (scene) (scene.components || []).forEach(function(c) { if (c.id === compId) comp = c; });
    var chs = comp && comp.data && Array.isArray(comp.data.chapters) ? comp.data.chapters : null;
    var isNew = ci < 0;
    var ch = isNew
      ? { title: '', at: Math.max(0.2, Math.round(((state.masterTime || 0) - sceneStartFor(si)) * 10) / 10), dur: 2.2 }
      : (chs && chs[ci]);
    var pop = document.getElementById('cam-pop');
    if (!comp || !ch || !pop) return;
    camPopClose();
    rvPopClose();
    if (anchorEl && anchorEl.classList) anchorEl.classList.add('active');
    var sdur = scene.duration_seconds || 5;
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>⚑ Chapter</b> — scene ' + (si + 1) + '</span>' +
      '<button class="sp-x" id="chp-x" title="Close (Esc)">✕</button></div>' +
      '<div class="sp-fields"><label style="flex:1;">title <input id="chp-title" type="text" value="' + escAttr(ch.title || '') + '" placeholder="e.g. The Build" style="width:100%;"></label></div>' +
      '<div class="sp-fields">' +
        '<label>at <input id="chp-at" type="number" min="0.2" max="' + escAttr('' + Math.max(0.2, sdur - 1).toFixed(1)) + '" step="0.1" value="' + escAttr('' + (ch.at != null ? ch.at : 1)) + '">s</label>' +
        '<label>shows <input id="chp-dur" type="number" min="0.5" max="10" step="0.1" value="' + escAttr('' + (ch.dur != null ? ch.dur : 2.2)) + '">s</label>' +
      '</div>' +
      '<div class="sp-row">' +
      (isNew ? '' : '<button class="rv-go secondary" id="chp-del" style="flex:0 0 auto;color:#dc2626;border-color:#fca5a5;">Delete</button>') +
      '<button class="rv-go" id="chp-save" style="flex:1;">' + (isNew ? 'Add chapter' : 'Save') + '</button></div>';
    pop.style.display = 'block';
    var pr = anchorEl && anchorEl.getBoundingClientRect
      ? anchorEl.getBoundingClientRect()
      : { left: window.innerWidth / 2 - 20, width: 40, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 170;
    var px = Math.max(8, Math.min(pr.left + pr.width / 2 - pw / 2, window.innerWidth - pw - 8));
    var py = pr.top - ph - 10;
    if (py < 8) py = pr.bottom + 10;
    pop.style.left = px + 'px';
    pop.style.top = py + 'px';
    document.getElementById('chp-x').addEventListener('click', camPopClose);
    function save(nextList, msg) {
      nextList.sort(function(a, b) { return a.at - b.at; });
      camPopClose();
      studioStatus(msg, '');
      comp.data = Object.assign({}, comp.data || {}, { chapters: nextList, chapters_edited: true });
      var patchPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
      api('PATCH', patchPath, { data: { chapters: nextList, chapters_edited: true } }).then(function() {
        studioStatus('Chapters saved ✓ reloading preview…', 'ok');
        renderCamPills();
        startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
      }).catch(function(e) { studioStatus('Chapter save failed: ' + e.message, 'err'); });
    }
    document.getElementById('chp-save').addEventListener('click', function() {
      var title = (document.getElementById('chp-title').value || '').trim();
      if (!title) { studioStatus('Give the chapter a name.', 'warn'); return; }
      var at = parseFloat(document.getElementById('chp-at').value);
      var dr = parseFloat(document.getElementById('chp-dur').value);
      var entry = {
        title: title,
        at: isNaN(at) ? (ch.at || 1) : Math.max(0.2, Math.min(sdur - 1, at)),
        dur: isNaN(dr) ? 2.2 : Math.max(0.5, Math.min(10, dr)),
      };
      var next = (chs || []).slice();
      if (isNew) next.push(entry); else next[ci] = entry;
      save(next, isNew ? 'Adding chapter…' : 'Saving chapter…');
    });
    var del = document.getElementById('chp-del');
    if (del) del.addEventListener('click', function() {
      var next = (chs || []).slice();
      next.splice(ci, 1);
      save(next, 'Deleting chapter…');
    });
    var ti = document.getElementById('chp-title');
    ti.focus();
    ti.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('chp-save').click(); });
  }

  // ── Timelapse popover: create (from a suggestion or auto), resize, remove ──
  // The beat OWNS its film time: apply splices a matching silent gap into
  // the talk track, remove refunds it -- so resizing never desyncs anything.
  function tlPopOpen(si, tkey, tl, isNew, anchorEl) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    var pop = document.getElementById('cam-pop');
    if (!scene || !pop) return;
    camPopClose();
    anchorEl.classList.add('active');
    var span = Math.max(0.1, tl.src_end - tl.src_start);
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>⏩ Timelapse</b> — scene ' + (si + 1) + '</span>' +
      '<button class="sp-x" id="tl-x" title="Close (Esc)">✕</button></div>' +
      '<div class="sp-region" style="margin-bottom:7px;">' + span.toFixed(0) + 's of footage plays as sampled frames with an elapsed-time clock — honest fast-forward, not a smear. The beat owns its film time: the talk track gets a matching silent gap.</div>' +
      '<div class="sp-fields"><label>plays in <input id="tl-out" type="number" min="1" max="60" step="0.5" value="' + escAttr('' + (tl.out_seconds || 5)) + '">s</label>' +
      '<span class="sp-title" id="tl-rate" style="opacity:0.7;"></span></div>' +
      '<div class="sp-row">' +
      (isNew ? '' : '<button class="rv-go secondary" id="tl-del" style="flex:0 0 auto;color:#dc2626;border-color:#fca5a5;">Remove</button>') +
      '<button class="rv-go" id="tl-save" style="flex:1;">' + (isNew ? 'Make it a timelapse' : 'Save') + '</button></div>';
    pop.style.display = 'block';
    var pr = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 180;
    var px = Math.max(8, Math.min(pr.left + pr.width / 2 - pw / 2, window.innerWidth - pw - 8));
    var py = pr.top - ph - 10;
    if (py < 8) py = pr.bottom + 10;
    pop.style.left = px + 'px';
    pop.style.top = py + 'px';
    function rateNote() {
      var o = parseFloat(document.getElementById('tl-out').value);
      if (!(o > 0)) o = tl.out_seconds || 5;
      document.getElementById('tl-rate').textContent = '≈ ' + fmtRate(span / o);
    }
    rateNote();
    document.getElementById('tl-out').addEventListener('input', rateNote);
    document.getElementById('tl-x').addEventListener('click', camPopClose);
    function post(body, msg) {
      camPopClose();
      studioStatus(msg, '');
      api('POST', '/timelapse/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id), body)
        .then(function(r) {
          if (!r || r.ok === false) { studioStatus('Timelapse failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
          var res = r.result || {};
          studioStatus('⏩ ' + (body.action === 'remove' ? 'Timelapse removed' : 'Timelapse set') +
            (res.added_seconds ? ' — film ' + (res.added_seconds > 0 ? '+' : '') + Number(res.added_seconds).toFixed(1) + 's' : '') + ' ✓ reloading…', 'ok');
          afterSpeakerEdit({ project: r.project, bake_seam: res.gap_bake_at, restored_seconds: res.added_seconds },
            Math.max(0, (res.film_at || 0) - 1));
        })
        .catch(function(e) { studioStatus('Timelapse failed: ' + e.message, 'err'); });
    }
    document.getElementById('tl-save').addEventListener('click', function() {
      var o = parseFloat(document.getElementById('tl-out').value);
      if (!(o >= 1)) { studioStatus('Give the timelapse at least 1 second.', 'warn'); return; }
      post({ action: 'apply', scene_id: scene.id, key: tkey, src_start: tl.src_start, src_end: tl.src_end, out_seconds: o },
        'Building timelapse…');
    });
    var del = document.getElementById('tl-del');
    if (del) del.addEventListener('click', function() {
      post({ action: 'remove', scene_id: scene.id, key: tkey, src_start: tl.src_start }, 'Removing timelapse…');
    });
  }

  // ── Media lane: each scene video's source-map as blocks on the timeline ──
  // Color = rate (indigo 1x, amber fast, red turbo); hatched tail = freeze;
  // dashed block = untouched video (click to start editing it).
  function editForVideo(scene, v, vids) {
    var edits = scene.media_edits || {};
    var tkey = videoTargetFor(v);
    if (edits[tkey]) return { key: tkey, edit: edits[tkey] };
    // Legacy/semantic key: 'screencast' belongs to the largest non-speaker video.
    if (edits['screencast']) {
      var best = null, bestA = 0;
      vids.forEach(function(x) {
        if (isSpeakerVideoSrc(x.getAttribute('src') || '')) return;
        var r = x.getBoundingClientRect();
        if (r.width * r.height > bestA) { bestA = r.width * r.height; best = x; }
      });
      if (best === v) return { key: 'screencast', edit: edits['screencast'] };
    }
    return { key: tkey, edit: null };
  }

  // Post-reboot sanity: every saved media edit must actually be stamped on
  // its video. If the lane shows a map the runtime never attached (selector
  // no longer matches the file, or a stale key claimed the element first),
  // say so loudly instead of silently playing the wrong thing at 1x.
  //
  // Retried before it accuses: a single check 6s after boot lands while a
  // large later-scene video is still booting into the composite (an intro
  // bookend is ~6s, so the timer hit exactly at that seam) and cried wolf on
  // every project with a big screencast. Only a mismatch that PERSISTS
  // across three checks is a real detachment.
  function auditEdlStamps(attempt) {
    var p = state.currentProject;
    if (!p || !p.scenes || !state.compositeLoaded) return;
    var doc;
    try { doc = els.previewIframe.contentDocument; } catch (e) { return; }
    if (!doc) return;
    var bad = [];
    p.scenes.forEach(function(scene) {
      if (!scene.media_edits || !Object.keys(scene.media_edits).length) return;
      var vids = sceneVideos(doc, scene.id).filter(function(v) {
        if (isSpeakerVideoSrc(v.getAttribute('src') || '')) return false;
        // Callout clones are frozen still-frame copies inside .scf-callout --
        // they intentionally carry no EDL stamp and must not trip the audit.
        if (v.closest && v.closest('.scf-callout')) return false;
        return true;
      });
      vids.forEach(function(v) {
        var found = editForVideo(scene, v, vids);
        if (!found.edit || !found.edit.segments || !found.edit.segments.length) return;
        var raw = v.getAttribute('data-mp-edl');
        if (raw !== JSON.stringify(found.edit.segments)) bad.push(videoLabelFor(v));
      });
    });
    if (bad.length) {
      if ((attempt || 0) < 2) {
        setTimeout(function() { auditEdlStamps((attempt || 0) + 1); }, 5000);
        return;
      }
      try { console.warn('[edl] stamp mismatch on:', bad.join(', ')); } catch (e2) {}
      studioStatus('⚠ Media edit didn’t attach to ' + bad.join(', ') + ' — playback may ignore it. Try re-saving the edit on that video.', 'err');
    }
  }

  // Display rounding for playback rates: one decimal, integers bare, and
  // anything within a hair of 1x shows no label (it IS normal speed).
  function fmtRate(r) {
    var v = Math.round(r * 10) / 10;
    return (v === Math.round(v) ? Math.round(v) : v) + '\u00D7';
  }

  function renderMediaLane() {
    var wrap = document.getElementById('media-lane');
    if (!wrap) return;
    wrap.innerHTML = '';
    var p = state.currentProject;
    var total = state.totalDuration || calcTotalDuration();
    if (!p || !p.scenes || !(total > 0) || !state.compositeLoaded) return;
    var doc;
    try { doc = els.previewIframe.contentDocument; } catch (e) { return; }
    if (!doc) return;
    // The speaker's video rendering (camera bubble) is a FOLLOWER of the
    // speaker lane, not independent footage -- keep it off the SCREEN rows.
    var spkSrcs = (((p.speaker || {}).clips) || []).map(function(c) { return (c.source || '').split('/').pop(); }).filter(Boolean);
    p.scenes.forEach(function(scene, si) {
      var vids = sceneVideos(doc, scene.id).filter(function(v) {
        var src = v.getAttribute('src') || '';
        if (isSpeakerVideoSrc(src)) return false;
        if (spkSrcs.some(function(n) { return src.indexOf(n) !== -1; })) return false;
        if (v.closest && v.closest('.scf-callout')) return false;
        return true;
      });
      var sceneStart = sceneStartFor(si);
      var dur = scene.duration_seconds || 5;
      // One row PER independent video (followers/callout clones are already
      // filtered; the effects lane owns everything overlay-shaped). Multi-row
      // scenes are the side-by-side case: each piece of footage gets its own
      // editable timing row so the two can be aligned against each other.
      vids.slice(0, 4).forEach(function(v, row) {
        var found = editForVideo(scene, v, vids);
        var rowEl = document.createElement('div');
        rowEl.className = 'ml-row';
        rowEl.style.top = (2 + row * 26) + 'px';
        if (vids.length > 1) {
          // Filename tag so the rows are tellable-apart while aligning.
          var tag = document.createElement('span');
          tag.className = 'ml-row-tag';
          tag.textContent = videoLabelFor(v);
          tag.style.left = ((sceneStart / total) * 100).toFixed(2) + '%';
          rowEl.appendChild(tag);
        }
        function block(fromLocal, toLocal, cls, title, onClick, text) {
          var b = document.createElement('div');
          b.className = 'ml-seg ' + cls;
          if (text) b.textContent = text;
          b.style.left = (((sceneStart + fromLocal) / total) * 100).toFixed(2) + '%';
          b.style.width = Math.max(0.3, (((toLocal - fromLocal) / total) * 100)).toFixed(2) + '%';
          b.title = title;
          if (onClick) b.addEventListener('click', function(ev) { ev.stopPropagation(); onClick(b); });
          rowEl.appendChild(b);
          return b;
        }
        var label = videoLabelFor(v);
        if (!found.edit) {
          block(0, dur, 'r-plain', label + ' — untouched. Click to edit its timing.', function(el2) {
            mediaPopOpen(si, found.key, v, null, -1, el2);
          });
        } else {
          var segs = found.edit.segments || [];
          var tlist = found.edit.timelapses || [];
          var acc = 0;
          segs.forEach(function(s, i2) {
            var holdS = (typeof s.hold === 'number' && s.hold > 0) ? s.hold : 0;
            // Timelapse segments are cap-exempt: sizing them at the 16x
            // clamp drew the block too wide and shoved everything after it
            // past the pins (the lane lied while the pins told the truth).
            var rate = s.tl ? Math.max(0.1, Math.min(2000, s.rate || 1)) : Math.min(16, Math.max(0.1, s.rate || 1));
            var outDur = holdS || ((s.src_end - s.src_start) / rate);
            var isHold = holdS > 0;
            var cls = isHold ? 'r-freeze' : (s.tl ? 'r-tl' : (rate >= 6 ? 'r-turbo' : (rate > 1.2 ? 'r-fast' : 'r-normal')));
            var from = acc, to = Math.min(dur, acc + outDur);
            var ttl = isHold
              ? (label + ' — HOLD ' + holdS.toFixed(1) + 's on frame ' + s.src_start.toFixed(1) + 's')
              : s.tl
              ? (label + ' — TIMELAPSE: ' + (s.src_end - s.src_start).toFixed(0) + 's of footage in ' + outDur.toFixed(1) + 's (' + fmtRate(rate) + '), sampled with an elapsed-time clock. Click to resize or remove.')
              : (label + ' — ' + fmtRate(rate) + '  src ' + s.src_start.toFixed(1) + '-' + s.src_end.toFixed(1) + 's');
            if (to > from) {
              var clickFn;
              if (s.tl) {
                // The segment IS the timelapse -- click edits the beat, not
                // the raw segment (its duration is a constraint, not a rate).
                var tlm = null;
                tlist.forEach(function(t2) { if (Math.abs(t2.src_start - s.src_start) < 0.6) tlm = t2; });
                if (!tlm) tlm = { src_start: s.src_start, src_end: s.src_end, out_seconds: Math.round(outDur * 10) / 10 };
                clickFn = (function(tt) { return function(el2) { tlPopOpen(si, found.key, tt, false, el2); }; })(tlm);
              } else {
                clickFn = (function(idx) {
                  return function(el2) { mediaPopOpen(si, found.key, v, found.edit, idx, el2); };
                })(i2);
              }
              var bEl = block(from, to, cls, ttl, clickFn,
                isHold ? 'HOLD' : (s.tl ? '⏩ ' + fmtRate(rate) : (Math.abs(rate - 1) >= 0.05 ? fmtRate(rate) : '')));
              // Footage already forced to 8x+ reads ugly as continuous video:
              // ride a small ⏩? tag on the segment offering the deliberate
              // version (sampled frames + elapsed clock).
              if (!isHold && !s.tl && rate >= 8) {
                var sug = document.createElement('span');
                sug.className = 'ml-tl-suggest';
                sug.textContent = '⏩?';
                sug.title = 'This stretch runs at ' + fmtRate(rate) + ' — continuous video reads ugly past 8×. Click to make it a deliberate timelapse (sampled frames + elapsed clock).';
                var prop = { src_start: s.src_start, src_end: s.src_end,
                  out_seconds: Math.max(3, Math.min(8, Math.round((s.src_end - s.src_start) / 30 * 10) / 10)) };
                sug.addEventListener('click', (function(pp, sEl) {
                  return function(ev) { ev.stopPropagation(); tlPopOpen(si, found.key, pp, true, sEl); };
                })(prop, sug));
                bEl.appendChild(sug);
              }
            }
            acc += outDur;
          });
          if (acc < dur - 0.05) {
            block(acc, dur, 'r-freeze', label + ' — frozen on last frame', function(el2) {
              mediaPopOpen(si, found.key, v, found.edit, -1, el2);
            });
          }
          // Cut markers: one chip per stored cut (leading cuts included --
          // gap-walking between segments missed a cut at the very start).
          function srcToOut(srcT) {
            var a2 = 0;
            for (var k2 = 0; k2 < segs.length; k2++) {
              var g2 = segs[k2];
              if (typeof g2.hold === 'number' && g2.hold > 0) {
                if (srcT <= g2.src_start) return a2;
                a2 += g2.hold;   // a freeze occupies output time but no source range
                continue;
              }
              var rr = g2.tl ? Math.max(0.1, Math.min(2000, g2.rate || 1)) : Math.min(16, Math.max(0.1, g2.rate || 1));
              if (srcT <= g2.src_start) return a2;
              if (srcT <= g2.src_end) return a2 + (srcT - g2.src_start) / rr;
              a2 += (g2.src_end - g2.src_start) / rr;
            }
            return a2;
          }
          var cutList = found.edit.cuts;
          if (!cutList) {
            cutList = [];
            if (segs.length && segs[0].src_start > 0.05) cutList.push({ src_start: 0, src_end: segs[0].src_start });
            for (var ci = 0; ci < segs.length - 1; ci++) {
              if (segs[ci + 1].src_start - segs[ci].src_end > 0.05) cutList.push({ src_start: segs[ci].src_end, src_end: segs[ci + 1].src_start });
            }
          }
          var chipSpots = [];
          // Collision is judged in PIXELS at the current zoom (percent-of-film
          // collided chips that sat seconds apart, dropping rows for no visual
          // reason). setTimelineZoom re-renders this lane so leveling tracks zoom.
          var trackElC = document.getElementById('timeline-track');
          var trackWC = (trackElC && trackElC.offsetWidth) || 1000;
          cutList.forEach(function(c2) {
            var glen = c2.src_end - c2.src_start;
            if (glen < 0.05) return;
            var chip = document.createElement('div');
            chip.className = 'ml-cut';
            chip.textContent = '✂';
            var pctC = ((sceneStart + Math.min(srcToOut(c2.src_start), dur)) / total) * 100;
            var pxC = (pctC / 100) * trackWC;
            var liftC = 0;
            for (var cs2 = 0; cs2 < chipSpots.length; cs2++) {
              if (Math.abs(chipSpots[cs2].px - pxC) < 20 && chipSpots[cs2].lift === liftC) { liftC++; cs2 = -1; }
            }
            chipSpots.push({ px: pxC, lift: liftC });
            // Crowded seams stay INSIDE the lane: second chip takes the lower
            // in-lane row, further collisions shove sideways. (Lifting up 20px
            // per collision walked chips off the layer when several cuts
            // landed in a row.)
            if (liftC) {
              chip.style.top = (liftC % 2 ? 15 : 2) + 'px';
              var shoveC = Math.floor(liftC / 2);
              if (shoveC) chip.style.marginLeft = (-8 + shoveC * 15) + 'px';
            }
            chip.style.left = pctC.toFixed(2) + '%';
            chip.title = glen.toFixed(1) + 's of footage cut (src ' + c2.src_start.toFixed(1) + 's–' + c2.src_end.toFixed(1) + 's). Click to restore.';
            chip.addEventListener('click', function(ev) {
              ev.stopPropagation();
              cutPopOpen(si, found.key, v, c2.src_start, glen, chip, c2.src_end);
            });
            rowEl.appendChild(chip);
          });
          // Pin diamonds: the constraints. Color = health. Click = inspect/remove.
          (found.edit.pins || []).forEach(function(pn) {
            var st = ((found.edit.pin_status || []).filter(function(x) { return Math.abs(x.out - pn.out) < 0.25; })[0] || {}).status || 'ok';
            var d = document.createElement('div');
            d.className = 'ml-pin ml-pin-' + st;
            
            d.style.left = (((sceneStart + Math.min(pn.out, dur)) / total) * 100).toFixed(2) + '%';
            d.title = 'Pin: at ' + pn.out.toFixed(1) + 's show source ' + pn.src.toFixed(1) + 's' + (st !== 'ok' ? ' — ' + st.toUpperCase() : '') + '. Click to inspect/remove.';
            d.addEventListener('click', function(ev) {
              ev.stopPropagation();
              pinPopOpen(si, found.key, v, pn, st, found.edit, d);
            });
            rowEl.appendChild(d);
          });
        }
        wrap.appendChild(rowEl);
      });
    });
    renderLaneLabels();
  }

  // ── Timeline v2 layout (Marc, 2026-07-18): the timeline reads as LAYERS
  // on lane beds -- SCREEN / SPEAKER / MUSIC top to bottom -- with the
  // ruler+scrubber on TOP as a visually separate, non-layer thing
  // (Descript-style), stationary lane icons in a fixed left gutter, and a
  // playhead line dropping through every lane. Lanes a film doesn't have
  // (no speaker, no music) don't render, and the whole strip shrinks. ──

  // Independent (non-speaker, non-follower) videos in the busiest scene --
  // the screen lane renders one row per video. DOM-derived (same filter as
  // renderMediaLane) so the count matches what actually plays; before the
  // composite loads it stays 1 and the next layout pass corrects it.
  function maxScreenRows() {
    try {
      var p = state.currentProject;
      if (!p || !p.scenes || !state.compositeLoaded) return 1;
      var doc = els.previewIframe.contentDocument;
      if (!doc) return 1;
      var spkSrcs = (((p.speaker || {}).clips) || []).map(function(c) { return (c.source || '').split('/').pop(); }).filter(Boolean);
      var max = 1;
      p.scenes.forEach(function(scene) {
        var n = sceneVideos(doc, scene.id).filter(function(v) {
          var src = v.getAttribute('src') || '';
          if (isSpeakerVideoSrc(src)) return false;
          if (spkSrcs.some(function(nm) { return src.indexOf(nm) !== -1; })) return false;
          if (v.closest && v.closest('.scf-callout')) return false;
          return true;
        }).length;
        if (n > max) max = n;
      });
      return Math.min(4, max);
    } catch (e) { return 1; }
  }

  function laneLayout() {
    var p = state.currentProject || {};
    var tracks = ((p.audio || {}).tracks) || [];
    var hasSpk = !!((p.speaker && p.speaker.clips && p.speaker.clips.length) ||
      (state._transcript && state._transcript.length) ||
      tracks.some(function(t) { return t.type === 'voiceover'; }));
    var hasMusic = tracks.some(function(t) { return t.type === 'music'; });
    // Roomy bands with real gaps between beds: squeezing speaker + music
    // against the bottom edge made them read as one smudge.
    var hasFx = ((p || {}).scenes || []).some(function(s2) {
      if ((s2.camera_moves || []).length) return true;
      return (s2.components || []).some(function(c2) {
        if (c2.type === 'screencast-frame' && c2.data && Array.isArray(c2.data.callouts) && c2.data.callouts.length) return true;
        return c2.type === 'narration-track' && c2.data && Array.isArray(c2.data.chapters) && c2.data.chapters.length;
      });
    });
    var y = { ruler: 0, rulerH: 18, fx: -1, fxH: 32, screenH: 32, screenRows: 1, speakerH: 32, musicH: 16, speaker: -1, music: -1 };
    // Side-by-side scenes: the screen band grows one row per independent
    // video (max across scenes), so every piece of footage gets a timeline
    // row it can be sped/cut/pinned on.
    y.screenRows = maxScreenRows();
    y.screenH = 32 + (y.screenRows - 1) * 26;
    var top = 22;
    if (hasFx) { y.fx = top; top += y.fxH + 8; }
    y.screen = top; top += y.screenH + 8;
    if (hasSpk) { y.speaker = top; top += y.speakerH + 8; }
    if (hasMusic) { y.music = top; top += y.musicH + 6; }
    y.total = Math.max(top + 2, 84);
    return y;
  }

  var LG_ICONS = {
    fx: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 2 L9.3 6.7 L14 8 L9.3 9.3 L8 14 L6.7 9.3 L2 8 L6.7 6.7 Z"/><path d="M12.8 2.2 L13.2 3.6 L14.6 4 L13.2 4.4 L12.8 5.8 L12.4 4.4 L11 4 L12.4 3.6 Z" stroke-width="0.9"/></svg>',
    screen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="1.7" y="3" width="12.6" height="8.2" rx="1.4"/><path d="M5.6 14h4.8"/></svg>',
    speaker: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="5.2" r="2.6"/><path d="M2.8 14c0.8-3 2.8-4.4 5.2-4.4S12.4 11 13.2 14"/></svg>',
    music: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="12.2" r="1.9"/><path d="M6.9 12.2V3.6l6-1.4v8.4"/><circle cx="11" cy="10.6" r="1.9"/></svg>',
  };

  function applyLaneLayout(y) {
    var sw = document.getElementById('slider-wrap');
    var track = document.getElementById('timeline-track');
    var gut = document.getElementById('lane-gutter');
    if (!sw || !track) return;
    sw.style.height = y.total + 'px';
    if (gut) gut.style.height = y.total + 'px';
    function setTop(id, top, show) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.top = top + 'px';
      if (show === false) el.style.display = 'none'; else el.style.display = '';
    }
    // Ruler band on top: scrubber + beat ticks live in it; the camera-move
    // pills sit at the seam between ruler and the screen lane.
    setTop('timeline-slider', 0); // 18px-tall input covers the whole ruler band
    setTop('beat-ticks', 7);
    // Camera pills are retired -- effects render as duration blocks in
    // their own lane above the screen.
    setTop('cam-pills', 0, false);
    setTop('fx-lane', y.fx, y.fx >= 0);
    setTop('media-lane', y.screen);
    var mlEl = document.getElementById('media-lane');
    if (mlEl) mlEl.style.height = y.screenH + 'px';
    setTop('wave-strip', y.speaker + 3, y.speaker >= 0);
    setTop('word-lane', y.speaker + 3, y.speaker >= 0);
    setTop('audio-lanes', y.music + 5, y.music >= 0);
    // Lane beds (recreated each pass; painted below all content).
    track.querySelectorAll('.lane-bed').forEach(function(n) { n.remove(); });
    function bed(cls, top, h) {
      var b = document.createElement('div');
      b.className = 'lane-bed ' + cls;
      b.style.top = top + 'px';
      b.style.height = h + 'px';
      track.insertBefore(b, track.firstChild);
    }
    bed('ruler', y.ruler, y.rulerH);
    if (y.fx >= 0) bed('fx', y.fx - 2, y.fxH + 4);
    bed('screen', y.screen - 2, y.screenH + 4);
    if (y.speaker >= 0) bed('speaker', y.speaker - 2, y.speakerH + 4);
    if (y.music >= 0) bed('music', y.music, y.musicH);
    // Fixed gutter icons: stationary no matter the scroll/zoom, each
    // vertically centered on its bed.
    if (gut) {
      var html = '';
      if (y.fx >= 0) html += '<span class="lg-ic" style="top:' + (y.fx + y.fxH / 2 - 7) + 'px" title="EFFECTS \u2014 zooms, pans, rotates and callouts. Click a block to edit it.">' + LG_ICONS.fx + '</span>';
      html += '<span class="lg-ic" style="top:' + (y.screen + y.screenH / 2 - 8) + 'px" title="SCREEN \u2014 your recording. Click a block to split, speed up or remove footage.">' + LG_ICONS.screen + '</span>';
      if (y.speaker >= 0) html += '<span class="lg-ic" style="top:' + (y.speaker + y.speakerH / 2 - 8) + 'px" title="SPEAKER \u2014 your voice (and camera). Click a piece to play, split or remove talk.">' + LG_ICONS.speaker + '</span>';
      if (y.music >= 0) html += '<span class="lg-ic" style="top:' + (y.music + y.musicH / 2 - 8) + 'px" title="MUSIC \u2014 the bed under the film, ducked while you speak.">' + LG_ICONS.music + '</span>';
      gut.innerHTML = html;
    }
    var ph = document.getElementById('playhead-line');
    if (ph) { ph.style.top = y.rulerH + 'px'; ph.style.display = ''; }
    movePlayhead();
  }

  function movePlayhead() {
    var ph = document.getElementById('playhead-line');
    var total = state.totalDuration || 0;
    if (!ph || !(total > 0)) return;
    ph.style.left = (((state.masterTime || 0) / total) * 100).toFixed(3) + '%';
  }

  // Words lane companion: the speaker clip block, its cut seams, and the
  // linked badge (ROADMAP #8 stage 3); layout applied here since this runs
  // on every project/lane change.
  function renderLaneLabels() {
    var track = document.getElementById('timeline-track');
    if (!track) return;
    track.querySelectorAll('.lane-label, #lane-link, .spk-clip, .spk-cut, .spk-split').forEach(function(n) { n.remove(); });
    var p = state.currentProject;
    if (!p) return;
    var total = state.totalDuration || calcTotalDuration();
    var y = laneLayout();
    applyLaneLayout(y);
    var hasSpeaker = !!(p.speaker && p.speaker.clips && p.speaker.clips.length);
    if (hasSpeaker && p.speaker.clips.length === 1 && total > 0) {
      var clip = p.speaker.clips[0];
      var spkCuts = (clip.edl && clip.edl.cuts) || [];
      // The clip renders as PIECES between split markers -- same interaction
      // as the media lane: click a piece for Play / Split / Remove.
      var clipAt = clip.at || 0;
      var narrEl = (state.audioElements || []).filter(function(a) { return a._trackType === 'voiceover'; })[0];
      var bakeDur = (narrEl && isFinite(narrEl.duration) && narrEl.duration > 0) ? narrEl.duration : (total - clipAt);
      var bounds = [0].concat(spkSplits().filter(function(s) { return s > 0.2 && s < bakeDur - 0.2; })).concat([bakeDur]);
      for (var bi2 = 0; bi2 < bounds.length - 1; bi2++) {
        (function(from2, to2) {
          var f = Math.min(total, clipAt + from2), t2 = Math.min(total, clipAt + to2);
          if (t2 - f < 0.05) return;
          var blk = document.createElement('div');
          blk.className = 'spk-clip';
          blk.style.top = (y.speaker + 3) + 'px';
          blk.style.left = ((f / total) * 100).toFixed(2) + '%';
          blk.style.width = (((t2 - f) / total) * 100).toFixed(2) + '%';
          blk.title = 'Speaker: ' + (to2 - from2).toFixed(1) + 's of talk. Click: play, split at playhead, or remove this piece (the screen keeps its footage and re-fits).';
          blk.addEventListener('click', function(ev) { ev.stopPropagation(); spkPopOpen(from2, to2, blk); });
          // Insert BELOW the waveform + words (positioned siblings stack in
          // DOM order), so the pieces read as the surface they sit on.
          track.insertBefore(blk, document.getElementById('wave-strip'));
        })(bounds[bi2], bounds[bi2 + 1]);
      }
      // The speaker EDL's own seams: one ✂ per cut, at the film position
      // where the removed speech used to be (source -> bake -> film).
      var removedSoFar = 0;
      spkCuts.slice().sort(function(a, b) { return a.src_start - b.src_start; }).forEach(function(c) {
        var seamFilm = clipAt + (c.src_start - removedSoFar);
        removedSoFar += (c.src_end - c.src_start);
        if (!(seamFilm >= 0 && seamFilm <= total)) return;
        var sc = document.createElement('div');
        sc.className = 'spk-cut';
        sc.textContent = '\\u2702';
        sc.style.top = (y.speaker + 7) + 'px';
        sc.style.left = ((seamFilm / total) * 100).toFixed(2) + '%';
        sc.title = (c.src_end - c.src_start).toFixed(1) + 's of talk removed here. Click to restore \\u2014 the film grows back and the screen relaxes.';
        sc.addEventListener('click', function(ev) { ev.stopPropagation(); spkRestoreOpen(c, seamFilm, sc); });
        track.appendChild(sc);
      });
      // No linked badge: camera and voice are ALWAYS one take (the follower
      // mirrors every cut by construction), so there is nothing to signal.
      var oldLk = document.getElementById('lg-link');
      if (oldLk) oldLk.remove();
    }
  }

  // Where the speaker's audio clock sits on the FILM clock: transcript and
  // waveform times are file-relative (0 = first sample), but the narration
  // is placed after the intro (speaker clip "at" / track start_time).
  function speakerFilmOffset() {
    var p = state.currentProject;
    if (!p) return 0;
    var clips = ((p.speaker || {}).clips) || [];
    if (clips.length === 1 && clips[0].at > 0) return clips[0].at;
    var narr = (((p.audio || {}).tracks) || []).filter(function(t) { return t.id === 'narration' || t.type === 'voiceover'; })[0];
    return (narr && narr.start_time) || 0;
  }

  // ── Speaker piece editing (re-fit model, 2026-07-19) ──
  // The speaker lane mirrors the media lane's interaction: click a piece
  // for Play / Split at playhead / Remove; click a ✂ seam to restore.
  // Removing talk removes TIME -- the film shortens and the screen re-fits
  // through its pins; no screen footage is deleted.

  function spkClipInfo() {
    var p = state.currentProject;
    var clips = (((p || {}).speaker) || {}).clips || [];
    if (clips.length !== 1) return null;
    var clip = clips[0];
    var narrEl = (state.audioElements || []).filter(function(a) { return a._trackType === 'voiceover'; })[0];
    var total = state.totalDuration || calcTotalDuration();
    var at = clip.at || 0;
    var bakeDur = (narrEl && isFinite(narrEl.duration) && narrEl.duration > 0) ? narrEl.duration : Math.max(1, total - at);
    return { clip: clip, at: at, bakeDur: bakeDur };
  }

  // Split markers are session-local sketch lines (bake clock): they become
  // real the moment a piece between them is removed. Cleared on any edit
  // (the bake clock changes underneath them) and per project.
  function spkSplits() {
    var p = state.currentProject;
    if (!p) return [];
    if (state._spkSplitsFor !== p.project_id) { state._spkSplitsFor = p.project_id; state._spkSplits = []; }
    if (!state._spkSplits) state._spkSplits = [];
    return state._spkSplits;
  }

  // One reload path for every speaker edit: swap in the returned project,
  // invalidate everything derived from the narration, reload.
  function afterSpeakerEdit(r, seekTo) {
    wordCutClear();
    camPopClose();
    state.currentProject = r.project;
    state._wavePeaksFor = null;
    state._spkSplits = [];
    // The words didn't change -- only their times. Shift the local
    // transcript in place (the server re-keys its cache the same way), so
    // the lane is correct IMMEDIATELY instead of stale-then-empty while
    // whisper re-runs.
    if (state._transcript && r.bake_from != null) {
      var dC = r.bake_to - r.bake_from;
      state._transcript = state._transcript
        .filter(function(w) { var m = (w.start + w.end) / 2; return !(m >= r.bake_from && m < r.bake_to); })
        .map(function(w) {
          var m2 = (w.start + w.end) / 2;
          if (m2 < r.bake_to) return w;
          var s2 = Math.max(r.bake_from, w.start - dC);
          return { start: s2, end: Math.max(s2 + 0.05, w.end - dC), text: w.text };
        });
      state._transcriptFor = r.project.project_id;
    } else if (state._transcript && r.bake_seam != null) {
      var dR = r.restored_seconds || 0;
      state._transcript = state._transcript
        .map(function(w) { return w.start >= r.bake_seam - 0.01 ? { start: w.start + dR, end: w.end + dR, text: w.text } : w; });
      state._transcriptFor = r.project.project_id;
      // The restored span's words are unknown locally; a page reload will
      // re-transcribe the full take (the server dropped its cache).
    } else {
      state._transcript = null;
      state._transcriptFor = null;
    }
    state.totalDuration = calcTotalDuration();
    state.masterTime = Math.max(0, Math.min(seekTo || 0, state.totalDuration - 0.1));
    initAudio();
    renderSceneList();
    renderWordLane();
    startCompositePreview(r.project, { time: state.masterTime });
  }

  function speakerCutRequest(fromFilm, toFilm, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Cutting\\u2026'; }
    api('POST', '/speaker-cut/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(state.currentProject.project_id), { from: Math.max(0, fromFilm), to: toFilm })
      .then(function(r) {
        studioStatus('\\u2702 Removed ' + r.removed_seconds + 's of talk \\u2014 the screen keeps its footage and re-fits. Reloading\\u2026', 'ok');
        afterSpeakerEdit(r, fromFilm - 1);
      })
      .catch(function(e) {
        if (btn) { btn.disabled = false; btn.textContent = '\\u2702 Cut failed'; }
        studioStatus('Cut failed: ' + e.message, 'err');
      });
  }

  function spkPopPlace(pop, anchorEl) {
    pop.style.display = 'block';
    var r = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 140;
    pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8)) + 'px';
    var py = r.top - ph - 10;
    if (py < 8) py = Math.min(window.innerHeight - ph - 8, r.bottom + 10);
    pop.style.top = py + 'px';
  }

  function spkPopOpen(fromBake, toBake, anchorEl) {
    var info = spkClipInfo();
    var pop = document.getElementById('cam-pop');
    if (!info || !pop) return;
    camPopClose();
    rvPopClose();
    wordCutClear();
    var filmFrom = info.at + fromBake;
    var filmTo = info.at + toBake;
    var len = toBake - fromBake;
    var html = '<div class="sp-head"><span class="sp-title"><b>Speaker take</b> \\u2014 ' + fmtTime(filmFrom) + ' \\u2192 ' + fmtTime(filmTo) + '</span><button class="sp-x" id="sp-x2">\\u2715</button></div>' +
      '<div class="sp-region" style="margin-bottom:7px;">Removing talk removes TIME: the film gets ' + len.toFixed(1) + 's shorter and the screen re-fits around its pins \\u2014 no screen footage is deleted.</div>' +
      '<div class="sp-row"><button class="rv-go secondary" id="sp-play" style="flex:1;">\\u25B6 Play this piece</button></div>' +
      '<div class="sp-row"><button class="rv-go secondary" id="sp-split" style="flex:1;" title="Drop a seam at the playhead \\u2014 then click a piece to remove or play just it">Split at playhead</button></div>' +
      '<div class="sp-row"><button class="rv-go secondary" id="sp-remove" style="flex:1;color:#dc2626;border-color:#fca5a5;">\\uD83D\\uDDD1 Remove this piece (' + len.toFixed(1) + 's)</button></div>' +
      (spkSplits().length ? '<div class="sp-row"><button class="rv-go secondary" id="sp-clear-splits" style="flex:1;color:#6b7280;">Clear split markers</button></div>' : '');
    pop.innerHTML = html;
    spkPopPlace(pop, anchorEl);
    document.getElementById('sp-x2').addEventListener('click', camPopClose);
    document.getElementById('sp-play').addEventListener('click', function() {
      camPopClose();
      var total = state.totalDuration || 1;
      scrub((filmFrom / total) * 1000);
      els.slider.value = (filmFrom / total) * 1000;
      if (!state.playing) togglePlay();
      state._stopAt = filmTo;
    });
    document.getElementById('sp-split').addEventListener('click', function() {
      var bake = (state.masterTime || 0) - info.at;
      if (bake <= 0.2 || bake >= info.bakeDur - 0.2) { studioStatus('Park the playhead inside the speaker clip first', 'err'); return; }
      var sp = spkSplits();
      if (!sp.some(function(s) { return Math.abs(s - bake) < 0.15; })) sp.push(bake);
      sp.sort(function(a, b) { return a - b; });
      camPopClose();
      renderLaneLabels();
      studioStatus('Seam dropped at ' + fmtTime(state.masterTime || 0) + ' \\u2014 click a piece to play or remove it', '');
    });
    document.getElementById('sp-remove').addEventListener('click', function() {
      speakerCutRequest(filmFrom, filmTo, this);
    });
    var cs = document.getElementById('sp-clear-splits');
    if (cs) cs.addEventListener('click', function() { state._spkSplits = []; camPopClose(); renderLaneLabels(); });
  }

  function spkRestoreOpen(cut, seamFilm, anchorEl) {
    var pop = document.getElementById('cam-pop');
    if (!pop) return;
    camPopClose();
    rvPopClose();
    var len = cut.src_end - cut.src_start;
    pop.innerHTML = '<div class="sp-head"><span class="sp-title"><b>Removed talk</b> \\u2014 ' + len.toFixed(1) + 's</span><button class="sp-x" id="sp-x3">\\u2715</button></div>' +
      '<div class="sp-region" style="margin-bottom:7px;">Restoring puts the time back: the film grows ' + len.toFixed(1) + 's at this seam and the screen relaxes toward its natural pace. (Captions inside the span were derived text \\u2014 they do not come back.)</div>' +
      '<div class="sp-row"><button class="rv-go" id="sp-restore" style="flex:1;">\\u21A9 Restore ' + len.toFixed(1) + 's</button></div>';
    spkPopPlace(pop, anchorEl);
    document.getElementById('sp-x3').addEventListener('click', camPopClose);
    document.getElementById('sp-restore').addEventListener('click', function() {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Restoring\\u2026';
      api('POST', '/speaker-restore/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(state.currentProject.project_id), { src_start: cut.src_start, src_end: cut.src_end })
        .then(function(r) {
          studioStatus('\\u21A9 Restored ' + r.restored_seconds + 's of talk. Reloading\\u2026', 'ok');
          afterSpeakerEdit(r, seamFilm - 1);
        })
        .catch(function(e) {
          btn.disabled = false;
          btn.textContent = 'Restore failed';
          studioStatus('Restore failed: ' + e.message, 'err');
        });
    });
  }

  // ── Word-cut selection (ROADMAP #8 stage 4): shift-click the first and
  // last word of a span, confirm, and the referee removes that film time
  // from speaker + screen + captions + audio in one pass. ──
  var wcut = { a: null, b: null };

  function wordCutClear() {
    document.querySelectorAll('.wl-word.wl-sel').forEach(function(n) { n.classList.remove('wl-sel'); });
    document.getElementById('word-cut-btn')?.remove();
    wcut.a = null; wcut.b = null;
  }

  function wordCutSelect(seg, el) {
    var p = state.currentProject;
    if (!p || !p.speaker || !p.speaker.clips || p.speaker.clips.length !== 1) {
      studioStatus('This film has no speaker lane to cut (older project?)', 'err');
      return;
    }
    if (!wcut.a) {
      wcut.a = { seg: seg, el: el };
      el.classList.add('wl-sel');
      studioStatus('First word marked — shift-click the LAST word of the span to cut', '');
      return;
    }
    wcut.b = { seg: seg, el: el };
    el.classList.add('wl-sel');
    var off = speakerFilmOffset() - (state.speakerTrimStart || 0);
    var from = Math.min(wcut.a.seg.start, wcut.b.seg.start) + off - 0.06;
    var to = Math.max(wcut.a.seg.end, wcut.b.seg.end) + off + 0.06;
    var btn = document.createElement('button');
    btn.id = 'word-cut-btn';
    btn.textContent = '\\u2702 Cut ' + (to - from).toFixed(1) + 's';
    btn.title = 'Remove this span of speech AND the matching screen time from the film';
    var track = document.getElementById('timeline-track');
    var total = state.totalDuration || 1;
    btn.style.left = Math.min(97, ((to / total) * 100)).toFixed(2) + '%';
    btn.style.top = (laneLayout().speaker + 40) + 'px';
    btn.addEventListener('click', function() {
      speakerCutRequest(Math.max(0, from), to, btn);
    });
    track.appendChild(btn);
  }

  function renderWordLane() {
    var wrap = document.getElementById('word-lane');
    if (!wrap) return;
    wrap.innerHTML = '';
    var p = state.currentProject;
    var total = state.totalDuration || calcTotalDuration();
    if (!p || !p.scenes || !(total > 0)) return;
    wordCutClear();
    renderLaneLabels();
    function addSpan(t0, dur2, text) {
      var span = document.createElement('div');
      span.className = 'wl-word';
      span.style.left = ((t0 / total) * 100).toFixed(2) + '%';
      span.style.width = Math.max(0.5, ((dur2 / total) * 100)).toFixed(2) + '%';
      span.textContent = '“' + text + '”';
      span.title = text + ' — ' + t0.toFixed(1) + 's';
      span.addEventListener('click', function(ev) {
        ev.stopPropagation();
        scrub(Math.round((t0 / total) * 1000));
        els.slider.value = Math.round((t0 / total) * 1000);
      });
      wrap.appendChild(span);
      return span;
    }
    // The REAL transcript (whisper on the speaker recording) wins; the
    // storyboard's planned beat script is the fallback approximation.
    if (state._transcript && state._transcript.length) {
      // Word-level: every word FULLY visible (no width clamp, no clipping),
      // staggered across two mini-rows so neighbors don't collide. Clicking
      // a word seeks there and opens the pin picker -- "pin the media to
      // this word".
      var wOff = speakerFilmOffset() - (state.speakerTrimStart || 0);
      state._transcript.forEach(function(seg2) {
        var t0 = Math.max(0, seg2.start + wOff);
        if (seg2.end + wOff <= 0 || t0 >= total) return;
        var sp = document.createElement('div');
        sp.className = 'wl-word';
        sp.style.left = ((t0 / total) * 100).toFixed(2) + '%';
        sp.textContent = seg2.text;
        sp.title = '“' + seg2.text + '” — ' + t0.toFixed(1) + 's. Click: jump here and pin the screencast to this word. Shift-click: mark it for a speaker cut.';
        sp.addEventListener('click', function(ev) {
          ev.stopPropagation();
          if (ev.shiftKey) { wordCutSelect(seg2, sp); return; }
          wordCutClear();
          scrub(Math.round((t0 / total) * 1000));
          els.slider.value = Math.round((t0 / total) * 1000);
          followPlayhead(true);
          pinAtPlayhead(sp);
        });
        wrap.appendChild(sp);
      });
      return;
    }
    p.scenes.forEach(function(scene, si) {
      var beats = scene.beats ||
        (p.storyboard && p.storyboard.scenes && p.storyboard.scenes[si] && p.storyboard.scenes[si].beats) || [];
      var sceneStart = sceneStartFor(si);
      var bt = 0;
      beats.forEach(function(b) {
        var bd = b.duration_seconds || 0;
        var text = (b.voiceover_text || b.voiceover || '').trim();
        if (bd > 0 && text) addSpan(sceneStart + bt, bd, text);
        bt += bd;
      });
    });
  }

  // Timeline zoom: the track grows to zoom x width inside the scroller;
  // every lane is percent-positioned, so words/blocks/pills spread together.
  // Manual ceiling 40x: pinning targets ONE word, so the lane must zoom
  // until every word is fully legible (at 8x a 2-minute narration still
  // renders as colliding fragments). The wave canvas caps its own internal
  // resolution, so a wide track costs nothing.
  function setTimelineZoom(z) {
    state.tlZoom = Math.max(1, Math.min(40, z));
    var track = document.getElementById('timeline-track');
    if (!track) return;
    track.style.width = (state.tlZoom * 100) + '%';
    renderWaveStrip();
    renderMediaLane(); // chip leveling is pixel-based; recompute at the new zoom
    followPlayhead(true);
  }

  // Default zoom = the level where transcript words are actually readable:
  // estimate each word's pixel width and pick the zoom (85th percentile of
  // word-density needs, capped 8x) where neighbors stop colliding. Runs
  // once per project; manual +/- wins after first touch.
  function autoFitTimelineZoom() {
    var sw = document.getElementById('slider-wrap');
    var total = state.totalDuration || calcTotalDuration();
    var tr = state._transcript;
    if (!sw || !tr || !tr.length || !(total > 0) || state._userZoomed) return;
    var base = sw.clientWidth || 1000;
    var needs = [];
    for (var i = 0; i < tr.length - 1; i++) {
      var gap = Math.max(0.05, tr[i + 1].start - tr[i].start);
      var px = tr[i].text.length * 6 + 10;
      needs.push(px / ((gap / total) * base));
    }
    if (!needs.length) return;
    needs.sort(function(a, b) { return a - b; });
    var need = needs[Math.floor(needs.length * 0.85)];
    // Auto-fit keeps its own modest ceiling: the default view should show
    // context, not open at maximum magnification -- deep zoom is a manual +.
    if (need > 1.05) setTimelineZoom(Math.min(8, need));
  }

  // Keep the playhead in view while playing (page-scroll like every NLE).
  function followPlayhead(force) {
    var sw = document.getElementById('slider-wrap');
    var track = document.getElementById('timeline-track');
    var total = state.totalDuration || calcTotalDuration();
    if (!sw || !track || !(total > 0) || track.offsetWidth <= sw.clientWidth + 2) return;
    var px = ((state.masterTime || 0) / total) * track.offsetWidth;
    var lo = sw.scrollLeft + sw.clientWidth * 0.1;
    var hi = sw.scrollLeft + sw.clientWidth * 0.9;
    if (force || px < lo || px > hi) sw.scrollLeft = Math.max(0, px - sw.clientWidth / 2);
  }

  // Fetch the real transcript once per project; re-render the lane on arrival.
  function loadTranscript() {
    var p = state.currentProject;
    if (!p || state._transcriptFor === p.project_id) return;
    state._transcriptFor = p.project_id;
    state._transcript = null;
    api('/speaker-transcript/' + state.tenantId + '/' + p.project_id).then(function(r) {
      if (r && r.available && r.segments && r.segments.length) {
        state._transcript = r.segments;
        state._userZoomed = false;
        renderWordLane();
        autoFitTimelineZoom();
      }
    }).catch(function() {});
  }

  // Waveform strip behind the words: the speaker's amplitude, so silences
  // and emphasis are visible while aligning edits.
  function renderWaveStrip() {
    var cv = document.getElementById('wave-strip');
    var p = state.currentProject;
    if (!cv || !p) return;
    // Peaks are fetched ONCE per project and drawn synchronously from the
    // cache. Fetch-in-the-draw raced: an early call (project/zoom state not
    // yet settled) could resolve LAST and leave a stale unshifted bitmap.
    if (state._wavePeaksFor === p.project_id && state._wavePeaks) {
      drawWaveStrip(cv, state._wavePeaks);
      return;
    }
    if (state._wavePeaksLoading === p.project_id) return;
    state._wavePeaksLoading = p.project_id;
    api('/speaker-waveform/' + state.tenantId + '/' + p.project_id).then(function(r) {
      state._wavePeaksLoading = null;
      if (!r || !r.peaks || !r.peaks.length) return;
      state._wavePeaks = r;
      state._wavePeaksFor = p.project_id;
      drawWaveStrip(cv, r);
    }).catch(function() { state._wavePeaksLoading = null; });
  }

  function drawWaveStrip(cv, r) {
    var total = state.totalDuration || calcTotalDuration();
    if (!(total > 0)) return;
    // Size from the TRACK, not the canvas: a canvas's width attribute
    // over-constrains left:0;right:0, so its own rect stays at the
    // unzoomed width and the wave squeezes into the film's head while
    // every other lane spreads with the zoom.
    var trackEl = document.getElementById('timeline-track');
    var w = (trackEl ? trackEl.getBoundingClientRect().width : cv.getBoundingClientRect().width) || 300;
    cv.style.width = Math.round(w) + 'px';
    cv.width = Math.max(300, Math.min(8000, Math.round(w)));
    cv.height = 15;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#818cf8';
    var bps = r.buckets_per_second || 6;
    var wvOff = speakerFilmOffset() - (state.speakerTrimStart || 0);
    var visible = Math.min(r.peaks.length, Math.ceil((total - wvOff) * bps));
    for (var i = 0; i < visible; i++) {
      var x = ((wvOff + i / bps) / total) * cv.width;
      if (x < 0) continue;
      var h = Math.max(1, r.peaks[i] * cv.height);
      ctx.fillRect(x, (cv.height - h) / 2, Math.max(1, cv.width / (total * bps) - 0.5), h);
    }
  }

  // Pins ("when I say X, show Y") compile into ordinary segments: an
  // implicit {out:0, src:0} anchor, then between consecutive pins the rate
  // is whatever makes the source arrive on time; after the last pin the
  // source plays at 1x until it runs out (then freezes).
  function compilePinsToSegments(pins, srcDur) {
    var ps = pins.slice().sort(function(a, b) { return a.out - b.out; });
    var anchors = [{ out: 0, src: 0 }];
    ps.forEach(function(pn) {
      var last = anchors[anchors.length - 1];
      if (pn.out > last.out + 0.05 && pn.src > last.src + 0.01) anchors.push(pn);
      else if (pn.out <= 0.05 && anchors.length === 1) anchors[0] = { out: 0, src: Math.max(0, pn.src) };
    });
    var segs = [];
    for (var i = 1; i < anchors.length; i++) {
      var a = anchors[i - 1], b = anchors[i];
      var rate = Math.min(16, Math.max(0.1, (b.src - a.src) / (b.out - a.out)));
      segs.push({ src_start: Math.round(a.src * 10) / 10, src_end: Math.round(b.src * 10) / 10, rate: Math.round(rate * 100) / 100 });
    }
    var lastA = anchors[anchors.length - 1];
    if (srcDur > lastA.src + 0.1) segs.push({ src_start: Math.round(lastA.src * 10) / 10, src_end: Math.round(srcDur * 10) / 10, rate: 1 });
    return segs;
  }

  // Where the current map sends an output time (slider prefill for pins).
  function mapForPin(segs2, t) {
    if (!segs2 || !segs2.length) return t;
    return edlMapClient(segs2, t).src;
  }

  // The pin picker: at the current playhead, scrub a live preview of the
  // SOURCE video to the frame that should be showing, and pin it. Speeds
  // between pins recompute automatically. Reached from a media block's
  // popover or directly by clicking a word in the transcript lane.
  function openPinPicker(si, target, v, edit, anchorRect) {
    var pop = document.getElementById('cam-pop');
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    if (!pop || !scene) return;
    camPopClose();
    rvPopClose();
    var label = videoLabelFor(v);
    var dur = scene.duration_seconds || 5;
    var segs = edit ? (edit.segments || []).slice()
      : [{ src_start: 0, src_end: (v.duration && isFinite(v.duration)) ? v.duration : dur, rate: 1 }];
    var outT = Math.max(0, Math.min(dur - 0.1, (state.masterTime || 0) - sceneStartFor(si)));
    var srcDur = (v.duration && isFinite(v.duration)) ? v.duration : Math.max(dur, 30);
    var vsrc = v.getAttribute('src') || '';
    // Frame-picking needs a real look at the frame: double the shell for
    // this popover only (camPopClose restores the default width).
    pop.style.width = Math.min(560, window.innerWidth - 24) + 'px';
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>📌 ' + escHtml(label) + '</b> — at film ' + outT.toFixed(1) + 's show…</span>' +
      '<button class="sp-x" id="mpp-x">✕</button></div>' +
      '<video id="mpp-prev" src="' + escAttr(vsrc) + '" muted preload="auto" style="width:100%;aspect-ratio:16/9;object-fit:contain;max-height:55vh;border-radius:8px;background:#111;display:block;margin-bottom:7px;"></video>' +
      '<div class="sp-row"><input id="mpp-slider" type="range" min="0" max="' + escAttr('' + Math.floor(srcDur * 10) / 10) + '" step="0.1" value="' + escAttr('' + Math.round(mapForPin(segs, outT) * 10) / 10) + '" style="flex:1;">' +
      '<span id="mpp-time" style="font-size:11px;min-width:44px;text-align:right;">0.0s</span></div>' +
      '<div class="sp-row"><button class="rv-go secondary" id="mpp-cancel" style="flex:0 0 auto;">Cancel</button>' +
      '<button class="rv-go" id="mpp-go" style="flex:1;">Pin this frame here</button></div>';
    pop.style.display = 'block';
    // The video reserves its 16:9 box via aspect-ratio, so the height
    // measured here is real; placePinPop re-clamps anyway once metadata
    // arrives (a portrait clip changes the height after load).
    function placePinPop() {
      var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 260;
      if (anchorRect) {
        pop.style.left = Math.max(8, Math.min(anchorRect.left + anchorRect.width / 2 - pw / 2, window.innerWidth - pw - 8)) + 'px';
        var py = anchorRect.top - ph - 10;
        if (py < 8) py = anchorRect.bottom + 10;
        pop.style.top = Math.max(8, Math.min(py, window.innerHeight - ph - 8)) + 'px';
      } else {
        pop.style.left = Math.max(8, (window.innerWidth - pw) / 2) + 'px';
        pop.style.top = Math.max(8, (window.innerHeight - ph) / 2) + 'px';
      }
    }
    placePinPop();
    var prev = document.getElementById('mpp-prev');
    var slider = document.getElementById('mpp-slider');
    var tlabel = document.getElementById('mpp-time');
    function syncPrev() {
      var t2 = parseFloat(slider.value) || 0;
      tlabel.textContent = t2.toFixed(1) + 's';
      try { prev.currentTime = t2; } catch (e) {}
    }
    slider.addEventListener('input', syncPrev);
    prev.addEventListener('loadedmetadata', function() {
      if (isFinite(prev.duration)) slider.max = '' + Math.floor(prev.duration * 10) / 10;
      syncPrev();
      placePinPop();
    });
    syncPrev();
    document.getElementById('mpp-x').addEventListener('click', camPopClose);
    document.getElementById('mpp-cancel').addEventListener('click', camPopClose);
    document.getElementById('mpp-go').addEventListener('click', function() {
      var srcT = parseFloat(slider.value) || 0;
      camPopClose();
      mediaOp(si, target, v, { op: 'add_pin', pin: { out: Math.round(outT * 10) / 10, src: Math.round(srcT * 10) / 10 } },
        'Pinned — this moment now always lands here');
    });
  }

  // Word-click entry: pin this scene's screencast to the word at the
  // playhead (the largest non-speaker video; other videos pin via their
  // blocks). No video in the scene -> the click just seeks.
  function pinAtPlayhead(anchorEl) {
    var p = state.currentProject;
    var t = state.masterTime || 0;
    if (!p) return;
    var info = compositeSceneForTime(t);
    var si = (info && info.index != null) ? info.index : state.currentSceneIndex;
    var scene = p.scenes && p.scenes[si];
    if (!scene) return;
    var doc;
    try { doc = els.previewIframe.contentDocument; } catch (e) { return; }
    var vids = sceneVideos(doc, scene.id).filter(function(x) {
      return !isSpeakerVideoSrc(x.getAttribute('src') || '');
    });
    if (!vids.length) return;
    var best = vids[0], bestA = 0;
    vids.forEach(function(x) {
      var r2 = x.getBoundingClientRect();
      if (r2.width * r2.height > bestA) { bestA = r2.width * r2.height; best = x; }
    });
    var found = editForVideo(scene, best, vids);
    openPinPicker(si, found.key, best, found.edit, anchorEl ? anchorEl.getBoundingClientRect() : null);
  }

  // Merge touching same-rate segments; a map that has collapsed back to one
  // full-length 1x segment is no edit at all (null -> the key is deleted and
  // the video reads "untouched" again instead of a 1x block + freeze tail).
  function tidySegments(segs, srcDur) {
    if (!segs || !segs.length) return segs;
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var prev = out[out.length - 1];
      if (prev && (prev.rate || 1) === (s.rate || 1) && Math.abs(prev.src_end - s.src_start) < 0.001) prev.src_end = s.src_end;
      else out.push({ src_start: s.src_start, src_end: s.src_end, rate: s.rate });
    }
    if (out.length === 1 && (out[0].rate || 1) === 1 && out[0].src_start <= 0.05
        && srcDur > 0 && out[0].src_end >= srcDur - 0.25) return null;
    return out;
  }

  // Op-based media edit: pins/cuts/rates are INTENTS; the server re-solves
  // the playback map around them, so editing one thing never silently breaks
  // another (a cut before a pin used to un-pin everything after it).
  function mediaOp(si, target, v, opBody, doneMsg) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    if (!scene || !p) return;
    var srcDur = (v && v.duration && isFinite(v.duration)) ? v.duration : 0;
    if (!(srcDur > 0)) { studioStatus('Video duration not loaded yet — try again in a second.', 'warn'); return; }
    opBody.scene_id = scene.id;
    opBody.target = target;
    opBody.src_duration = Math.round(srcDur * 100) / 100;
    studioStatus('Saving media edit…', '');
    api('POST', '/media-edits/' + state.tenantId + '/' + p.project_id, opBody).then(function(r) {
      if (!r || r.ok === false) { studioStatus('Save failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
      scene.media_edits = scene.media_edits || {};
      if (r.edit) scene.media_edits[target] = r.edit;
      else { delete scene.media_edits[target]; if (!Object.keys(scene.media_edits).length) delete scene.media_edits; }
      // Screen-owned films: the server contracted the scene to the edit's
      // natural length -- the whole film gets shorter (or grows back on
      // restore). Apply before the preview restarts so the ruler agrees.
      if (r.duration_seconds != null) {
        scene.duration_seconds = r.duration_seconds;
        state.totalDuration = calcTotalDuration();
      }
      // The pin needed more than 16x, so the server made the wait a
      // deliberate timelapse (loud, visible as a striped screen-lane segment, reversible).
      if (r.timelapse_auto && r.project) {
        var ta = r.timelapse_auto;
        studioStatus('⏩ ' + (r.note || 'That wait needed more than 16× — made it a timelapse (click the striped ⏩ segment in the screen lane to resize or remove).'), 'warn');
        afterSpeakerEdit({ project: r.project, bake_seam: ta.gap_bake_at, restored_seconds: ta.added_seconds },
          Math.max(0, (ta.film_at || 0) - 1));
        return;
      }
      var warn = '';
      (r.edit && r.edit.pin_status || []).forEach(function(ps) {
        if (ps.status !== 'ok') warn += ' ⚠ pin @' + Number(ps.out).toFixed(1) + 's: ' + (ps.detail || ps.status) + '.';
      });
      studioStatus((doneMsg || 'Saved') + ' ✓' + warn + ' reloading preview…', warn ? 'warn' : 'ok');
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) { studioStatus('Save failed: ' + e.message, 'err'); });
  }

  // keepBoundaries: a Split creates two ADJACENT same-rate segments on
  // purpose -- the cut point the user is about to edit. Skip the merge for
  // that save or the split is undone before it lands.
  function saveMediaEdits(sceneIndex, target, segments, pins, doneMsg, keepBoundaries) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[sceneIndex];
    if (!scene || !p) return;
    var deleteTargets;
    try {
      var doc = els.previewIframe.contentDocument;
      if (segments && segments.length && !keepBoundaries) {
        var vEl = (target !== 'screencast' && doc) ? doc.querySelector(target) : null;
        segments = tidySegments(segments, vEl && isFinite(vEl.duration) ? vEl.duration : 0);
      }
      // Saving under a file-specific key: drop a stale legacy 'screencast'
      // entry that belongs to this same video (both keys resolving to one
      // element means the lane shows one map while playback runs another).
      if (target !== 'screencast' && scene.media_edits && scene.media_edits['screencast'] && doc) {
        var vids0 = sceneVideos(doc, scene.id);
        var best0 = null, bestA0 = 0;
        vids0.forEach(function(x) {
          if (isSpeakerVideoSrc(x.getAttribute('src') || '')) return;
          var r0 = x.getBoundingClientRect();
          if (r0.width * r0.height > bestA0) { bestA0 = r0.width * r0.height; best0 = x; }
        });
        if (best0 && videoTargetFor(best0) === target) deleteTargets = ['screencast'];
      }
    } catch (eTidy) {}
    studioStatus('Saving media edit…', '');
    api('POST', '/media-edits/' + state.tenantId + '/' + p.project_id, {
      scene_id: scene.id,
      target: target,
      segments: segments && segments.length ? segments : null,
      pins: pins && pins.length ? pins : undefined,
      delete_targets: deleteTargets,
    }).then(function(r) {
      scene.media_edits = r.media_edits && Object.keys(r.media_edits).length ? r.media_edits : undefined;
      if (r.duration_seconds != null) {
        scene.duration_seconds = r.duration_seconds;
        state.totalDuration = calcTotalDuration();
      }
      studioStatus((doneMsg || 'Saved') + ' ✓ reloading preview…', 'ok');
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) {
      studioStatus('Save failed: ' + e.message, 'err');
    });
  }

  // Segment popover on the media lane (reuses the #cam-pop shell).
  function mediaPopOpen(si, target, v, edit, segIndex, anchorEl) {
    var pop = document.getElementById('cam-pop');
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    if (!pop || !scene) return;
    camPopClose();
    rvPopClose();
    var label = videoLabelFor(v);
    var dur = scene.duration_seconds || 5;
    // An untouched video is just an implicit single 1x segment -- clicking
    // it offers Split/speed directly; the map is created on the first action.
    var implicit = !edit;
    var segs, seg;
    if (edit) {
      segs = (edit.segments || []).slice();
      seg = segIndex >= 0 ? segs[segIndex] : null;
    } else {
      var srcDur0 = (v.duration && isFinite(v.duration)) ? v.duration : dur;
      segs = [{ src_start: 0, src_end: Math.round(srcDur0 * 10) / 10, rate: 1 }];
      segIndex = 0;
      seg = segs[0];
    }
    var html = '<div class="sp-head"><span class="sp-title"><b>' + escHtml(label) + '</b>' +
      (seg ? (implicit ? '' : ' — segment ' + (segIndex + 1) + ' of ' + segs.length) : ' — frozen tail') + '</span>' +
      '<button class="sp-x" id="mp-x">✕</button></div>';
    if (implicit) {
      html += '<div class="sp-region" style="margin-bottom:7px;">Park the playhead where a boring bit starts, then <b>Split</b>. Speed up or remove the pieces you don\\'t need — your narration never moves.</div>' +
        '<div class="sp-row" style="flex-wrap:wrap;">' +
          [1, 1.5, 2, 3, 8, 12].map(function(r2) {
            return '<button class="rv-go secondary mp-rate" data-rate="' + r2 + '" style="flex:1;padding:5px 6px;' + (r2 === 1 ? 'background:#6366f1;color:#fff;border-color:#6366f1;' : '') + '">' + r2 + '×</button>';
          }).join('') +
        '</div>' +
        '<div class="sp-row"><button class="rv-go" id="mp-split" style="flex:1;" title="Split this recording at the playhead">Split at playhead</button></div>' +
        '<div class="sp-row"><button class="rv-go secondary" id="mp-compress" style="flex:1;" title="Find stretches where the screen barely changes (spinners, loading) and timelapse them at 8x">⚡ Compress waiting</button></div>';
    } else if (seg) {
      html += '<div class="sp-region" style="margin-bottom:7px;">src ' + seg.src_start.toFixed(1) + 's → ' + seg.src_end.toFixed(1) + 's at <b>' + seg.rate + '×</b></div>' +
        '<div class="sp-row" style="flex-wrap:wrap;">' +
          [1, 1.5, 2, 3, 8, 12].map(function(r2) {
            return '<button class="rv-go secondary mp-rate" data-rate="' + r2 + '" style="flex:1;padding:5px 6px;' + (seg.rate === r2 ? 'background:#6366f1;color:#fff;border-color:#6366f1;' : '') + '">' + r2 + '×</button>';
          }).join('') +
        '</div>' +
        '<div class="sp-row" style="align-items:center;gap:6px;">' +
          '<input id="mp-rate-custom" type="number" min="0.1" max="16" step="0.1" placeholder="custom ×" style="flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;" />' +
          '<button class="rv-go secondary" id="mp-rate-apply" style="flex:0 0 auto;padding:5px 12px;">Set ×</button>' +
        '</div>' +
        '<div class="sp-row">' +
          '<button class="rv-go secondary" id="mp-split" style="flex:1;" title="Split this segment at the playhead">Split at playhead</button>' +
        '</div>' +
        '<div class="sp-row">' +
          '<button class="rv-go secondary" id="mp-merge" style="flex:1;" title="Dissolve this segment into its neighbor — the neighboring speed takes over this stretch">⇤ Merge into neighbor</button>' +
        '</div>' +
        '<div class="sp-row">' +
          '<button class="rv-go secondary" id="mp-cut" style="flex:1;color:#dc2626;border-color:#fca5a5;" title="Remove this footage from the film entirely (restorable via the ✂ chip). To slice the segment in two, use Split.">🗑 Remove this footage (' + (seg.src_end - seg.src_start).toFixed(0) + 's)</button>' +
        '</div>' +
        '<div class="sp-row"><button class="rv-go secondary" id="mp-compress" style="flex:1;" title="Scan JUST this segment for stretches where the screen barely changes and timelapse them at 8x">⚡ Compress waiting in this segment</button></div>' +
        '<div class="sp-row"><button class="rv-go secondary" id="mp-clear" style="flex:1;color:#6b7280;">Delete ALL edits on this video</button></div>';
    } else {
      html += '<div class="sp-region" style="margin-bottom:7px;">The source-map ends before the scene does; the last frame holds. Extend the final segment or add source.</div>' +
        '<div class="sp-row"><button class="rv-go secondary" id="mp-clear" style="flex:1;color:#6b7280;">Delete ALL edits on this video</button></div>';
    }
    pop.innerHTML = html;
    pop.style.display = 'block';
    var r = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 140;
    pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8)) + 'px';
    var py = r.top - ph - 10;
    if (py < 8) py = Math.min(window.innerHeight - ph - 8, r.bottom + 10);
    pop.style.top = py + 'px';
    document.getElementById('mp-x').addEventListener('click', camPopClose);
    var compressBtn = document.getElementById('mp-compress');
    if (compressBtn) compressBtn.addEventListener('click', function() {
      camPopClose();
      var body = { scene_id: scene.id, target: target, src: v.getAttribute('src') || '' };
      var scoped = !implicit && seg;
      if (scoped) { body.range_start = seg.src_start; body.range_end = seg.src_end; }
      studioStatus('Scanning ' + label + (scoped ? ' (this segment)' : '') + ' for idle stretches…', '');
      api('POST', '/compress-waiting/' + state.tenantId + '/' + p.project_id, body).then(function(r2) {
        if (!r2 || r2.ok === false) { studioStatus('Compress failed: ' + ((r2 && r2.error) || 'unknown'), 'err'); return; }
        if (!r2.idle_ranges) { studioStatus('No idle stretches found — the screen is always moving there.', 'warn'); return; }
        scene.media_edits = r2.media_edits;
        // Say exactly what was (and wasn't) found: a tiny saving with a bare
        // "✓" reads as "it turned my video 8x" when only a sliver was idle.
        var saved2 = r2.source_duration - r2.output_duration;
        var pct2 = r2.source_duration > 0 ? saved2 / r2.source_duration : 0;
        var msg2 = 'Compressed ' + r2.idle_ranges + ' idle stretch' + (r2.idle_ranges === 1 ? '' : 'es') + ': ' + r2.source_duration.toFixed(0) + 's → ' + r2.output_duration.toFixed(0) + 's (saved ' + saved2.toFixed(1) + 's) ✓';
        if (pct2 < 0.15) msg2 += ' The rest of the recording has continuous on-screen motion — to condense it further, Split it and set a speed on the busy stretches.';
        studioStatus(msg2, pct2 < 0.15 ? 'warn' : 'ok');
        startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
      }).catch(function(e2) { studioStatus('Compress failed: ' + e2.message, 'err'); });
    });
    Array.prototype.slice.call(pop.querySelectorAll('.mp-rate')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newRate = parseFloat(btn.dataset.rate);
        camPopClose();
        mediaOp(si, target, v, { op: 'set_rate', region: { src_start: seg.src_start, src_end: seg.src_end, rate: newRate } }, 'Set to ' + newRate + '×');
      });
    });
    var splitBtn = document.getElementById('mp-split');
    if (splitBtn) splitBtn.addEventListener('click', function() {
      // Playhead -> scene-local output time -> source time; split there.
      var outT = Math.max(0, (state.masterTime || 0) - sceneStartFor(si));
      var acc = 0, srcAt = null;
      for (var i3 = 0; i3 < segs.length; i3++) {
        var s3 = segs[i3];
        var od = (s3.src_end - s3.src_start) / (s3.rate || 1);
        if (i3 === segIndex) {
          if (outT <= acc + 0.05 || outT >= acc + od - 0.05) { studioStatus('Park the playhead inside this segment to split it.', 'warn'); return; }
          srcAt = s3.src_start + (outT - acc) * (s3.rate || 1);
          break;
        }
        acc += od;
      }
      if (srcAt == null) { studioStatus('Park the playhead inside this segment to split it.', 'warn'); return; }
      srcAt = Math.round(srcAt * 10) / 10;
      camPopClose();
      mediaOp(si, target, v, { op: 'split', src: srcAt }, 'Split at ' + srcAt.toFixed(1) + 's');
    });
    var rateApply = document.getElementById('mp-rate-apply');
    if (rateApply) rateApply.addEventListener('click', function() {
      var inp = document.getElementById('mp-rate-custom');
      var rv2 = parseFloat(inp && inp.value);
      if (!(rv2 >= 0.1 && rv2 <= 16)) { studioStatus('Enter a rate between 0.1 and 16.', 'warn'); return; }
      camPopClose();
      mediaOp(si, target, v, { op: 'set_rate', region: { src_start: seg.src_start, src_end: seg.src_end, rate: rv2 } }, 'Set to ' + rv2 + '×');
    });
    var mergeBtn = document.getElementById('mp-merge');
    if (mergeBtn) mergeBtn.addEventListener('click', function() {
      camPopClose();
      mediaOp(si, target, v, { op: 'merge_region', region: { src_start: seg.src_start, src_end: seg.src_end } }, 'Merged into neighbor');
    });
    var cutBtn = document.getElementById('mp-cut');
    if (cutBtn) cutBtn.addEventListener('click', function() {
      // Two-click confirm: removing footage is the most consequential edit in
      // the lane (measured: two accidental removals in one session). First
      // click arms; second click within the same popover fires.
      if (!cutBtn.dataset.armed) {
        cutBtn.dataset.armed = '1';
        cutBtn.textContent = 'Really remove ' + (seg.src_end - seg.src_start).toFixed(0) + 's? Click again';
        cutBtn.style.background = '#dc2626';
        cutBtn.style.color = '#fff';
        return;
      }
      camPopClose();
      mediaOp(si, target, v, { op: 'add_cut', cut: { src_start: seg.src_start, src_end: seg.src_end } },
        'Footage removed 🗑 (the ✂ chip on the lane restores it)');
    });
    var clearBtn = document.getElementById('mp-clear');
    if (clearBtn) clearBtn.addEventListener('click', function() {
      camPopClose();
      mediaOp(si, target, v, { op: 'clear' }, 'All edits removed');
    });
  }

  // Pin popover: status + remove. A pin is the user's constraint -- it gets
  // its own visual and its own delete, independent of every other edit.
  function pinPopOpen(si, target, v, pn, st, edit, anchorEl) {
    var pop = document.getElementById('cam-pop');
    if (!pop) return;
    camPopClose(); rvPopClose();
    var detail = ((edit.pin_status || []).filter(function(x) { return Math.abs(x.out - pn.out) < 0.25; })[0] || {}).detail;
    var stLine = st === 'ok' ? 'Holding: every other edit re-solves around this anchor.'
      : '<b style="color:' + (st === 'broken' ? '#dc2626' : '#d97706') + ';">' + st.toUpperCase() + '</b> — ' + escHtml(detail || '');
    pop.innerHTML = '<div class="sp-head"><span class="sp-title"><b>⧫ Pin</b> — film ' + pn.out.toFixed(1) + 's → source ' + pn.src.toFixed(1) + 's</span>' +
      '<button class="sp-x" id="pp-x">✕</button></div>' +
      '<div class="sp-region" style="margin-bottom:7px;">' + stLine + '</div>' +
      '<div class="sp-row"><button class="rv-go secondary" id="pp-remove" style="flex:1;color:#dc2626;border-color:#fca5a5;">Remove this pin</button></div>';
    pop.style.display = 'block';
    var r = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 120;
    pop.style.left = Math.max(8, Math.min(r.left - pw / 2, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = Math.max(8, r.top - ph - 10) + 'px';
    document.getElementById('pp-x').addEventListener('click', camPopClose);
    document.getElementById('pp-remove').addEventListener('click', function() {
      camPopClose();
      mediaOp(si, target, v, { op: 'remove_pin', out: pn.out }, 'Pin removed');
    });
  }

  // Cut popover: the footage isn't gone, just skipped -- offer restore.
  function cutPopOpen(si, target, v, gapSrcStart, gapLen, anchorEl, gapSrcEnd) {
    var pop = document.getElementById('cam-pop');
    if (!pop) return;
    camPopClose(); rvPopClose();
    pop.innerHTML = '<div class="sp-head"><span class="sp-title"><b>✂ Cut</b> — ' + gapLen.toFixed(1) + 's removed (source ' + gapSrcStart.toFixed(1) + 's–' + (gapSrcStart + gapLen).toFixed(1) + 's)</span>' +
      '<button class="sp-x" id="cp-x">✕</button></div>' +
      '<div class="sp-region" style="margin-bottom:7px;">The footage is skipped, not deleted. Restoring re-solves the timing around your pins.</div>' +
      '<div class="sp-row"><button class="rv-go" id="cp-restore" style="flex:1;">Restore this footage</button></div>';
    pop.style.display = 'block';
    var r = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 120;
    pop.style.left = Math.max(8, Math.min(r.left - pw / 2, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = Math.max(8, r.top - ph - 10) + 'px';
    var axSel = document.getElementById('cp-axis');
    if (axSel) axSel.addEventListener('change', function() {
      var agI = document.getElementById('cp-angle');
      var shI = document.getElementById('cp-shift');
      var scI = document.getElementById('cp-scale');
      if (axSel.value === 'y' || axSel.value === 'x') {
        if (agI && (!agI.value || Math.abs(parseFloat(agI.value)) <= 8)) agI.value = '-26';
        if (shI && (!shI.value || parseFloat(shI.value) === 0)) shI.value = '18';
        if (scI && (!scI.value || parseFloat(scI.value) === 1 || parseFloat(scI.value) === 1.4)) scI.value = '0.86';
      }
    });
    document.getElementById('cp-x').addEventListener('click', camPopClose);
    document.getElementById('cp-restore').addEventListener('click', function() {
      camPopClose();
      mediaOp(si, target, v, { op: 'remove_cut', src_start: gapSrcStart, src_end: (gapSrcEnd != null ? gapSrcEnd : gapSrcStart + gapLen) }, 'Footage restored');
    });
  }

  function saveCameraMovesForScene(sceneIndex, moves) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[sceneIndex];
    if (!scene || !p) return;
    studioStatus('Saving camera move\u2026', '');
    api('POST', '/camera-moves/' + state.tenantId + '/' + p.project_id, {
      scene_id: scene.id,
      camera_moves: moves.length ? moves : null,
    }).then(function(r) {
      scene.camera_moves = r.camera_moves && r.camera_moves.length ? r.camera_moves : undefined;
      studioStatus('Saved \u2713 reloading preview\u2026', 'ok');
      renderCamPills();
      // Full composite reboot (same path as project load) with the playhead
      // restored -- a bare re-init leaves the new iframe unseeked (scene
      // content hidden, camera showing through) and media clips stale.
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) {
      studioStatus('Save failed: ' + e.message, 'err');
    });
  }

  // \u2500\u2500 Camera-move popover (opens from a scrubber pill) \u2500\u2500
  var camPop = { si: -1, mi: -1 };

  function camPopClose() {
    var pop = document.getElementById('cam-pop');
    if (pop) { pop.style.display = 'none'; pop.style.width = '280px'; }
    camPop.si = camPop.mi = -1;
    document.querySelectorAll('.cam-pill.active, .fx-seg.active, .ml-seg.active').forEach(function(el) { el.classList.remove('active'); });
  }

  function camPopOpen(si, mi, pill) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[si];
    var m = scene && scene.camera_moves && scene.camera_moves[mi];
    var pop = document.getElementById('cam-pop');
    if (!m || !pop) return;
    camPopClose();
    camPop.si = si; camPop.mi = mi;
    pill.classList.add('active');
    var isBox = m.w != null && m.h != null;
    var dur = scene.duration_seconds || 5;
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>' + escHtml((m.target === 'screencast' ? 'Screencast ' : '') + (m.type || 'zoom')) + '</b> \u2014 scene ' + (si + 1) + '</span>' +
      '<button class="sp-x" id="cp-x" title="Close">\u2715</button></div>' +
      '<div class="sp-fields">' +
        '<label>at <input id="cp-at" type="number" min="0" max="' + escAttr('' + Math.max(0, dur - 0.2).toFixed(1)) + '" step="0.1" value="' + escAttr('' + (m.at != null ? Number(m.at).toFixed(1) : '0')) + '">s</label>' +
        (isBox
          ? '<label>hold <input id="cp-hold" type="number" min="0" max="10" step="0.5" value="' + escAttr('' + (m.hold != null ? m.hold : 0)) + '">s</label>' +
            '<div class="sp-region">Region ' + Math.round(m.w) + '\u00d7' + Math.round(m.h) + '% at (' + Math.round(m.x || 50) + '%, ' + Math.round(m.y || 50) + '%) \u2014 redraw the box to change it.</div>'
          : (m.type === 'rotate'
              ? '<label>angle <input id="cp-angle" type="number" min="-45" max="45" step="1" value="' + escAttr('' + (m.angle != null ? m.angle : 8)) + '">\u00b0</label>' +
                '<label title="z = flat spin; y = 3D book-page turn; x = 3D tilt toward/away">axis <select id="cp-axis">' +
                  ['z', 'y', 'x'].map(function(ax) { return '<option value="' + ax + '"' + ((m.axis || 'z') === ax ? ' selected' : '') + '>' + (ax === 'z' ? 'z (flat)' : ax === 'y' ? 'y (3D turn)' : 'x (3D tilt)') + '</option>'; }).join('') +
                '</select></label>' +
                '<label title="3D axes only: signed canvas-% shift to clear space beside the tilted frame (negative = left/up)">shift <input id="cp-shift" type="number" min="-40" max="40" step="1" value="' + escAttr('' + (m.shift != null ? m.shift : 0)) + '">%</label>'
              : '') +
            (m.type === 'pan'
              ? '' // a pan has no scale: pure translation at the camera's zoom
              : '<label>scale <input id="cp-scale" type="number" min="1" max="5" step="0.1" value="' + escAttr('' + (m.scale || (m.type === 'zoom' ? 1.8 : 1.4))) + '">\u00d7</label>') +
            '<label>hold <input id="cp-hold" type="number" min="0" max="10" step="0.5" value="' + escAttr('' + (m.hold != null ? m.hold : 0)) + '">s</label>') +
        '<label>ease <input id="cp-dur" type="number" min="0.2" max="3" step="0.1" value="' + escAttr('' + (m.duration || 0.8)) + '">s</label>' +
        '<label title="Ease back to wide afterwards">return <input id="cp-return" type="checkbox"' + (m['return'] ? ' checked' : '') + '></label>' +
      '</div>' +
      '<div class="sp-row">' +
        '<button class="rv-go secondary" id="cp-prev" style="flex:0 0 auto;" title="Jump the playhead just before this move and play">Preview</button>' +
        '<button class="rv-go secondary" id="cp-del" style="flex:0 0 auto;color:#dc2626;border-color:#fca5a5;" title="Remove this camera move">Delete</button>' +
        '<button class="rv-go" id="cp-save" style="flex:1;">Save</button>' +
      '</div>';
    pop.style.display = 'block';
    // Anchor above the pill, clamped to the viewport.
    var r = pill.getBoundingClientRect();
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 150;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8));
    var y = r.top - ph - 10;
    if (y < 8) y = Math.min(window.innerHeight - ph - 8, r.bottom + 10);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    var axSel = document.getElementById('cp-axis');
    if (axSel) axSel.addEventListener('change', function() {
      var agI = document.getElementById('cp-angle');
      var shI = document.getElementById('cp-shift');
      var scI = document.getElementById('cp-scale');
      if (axSel.value === 'y' || axSel.value === 'x') {
        if (agI && (!agI.value || Math.abs(parseFloat(agI.value)) <= 8)) agI.value = '-26';
        if (shI && (!shI.value || parseFloat(shI.value) === 0)) shI.value = '18';
        if (scI && (!scI.value || parseFloat(scI.value) === 1 || parseFloat(scI.value) === 1.4)) scI.value = '0.86';
      }
    });
    document.getElementById('cp-x').addEventListener('click', camPopClose);
    document.getElementById('cp-del').addEventListener('click', function() {
      var moves = (scene.camera_moves || []).slice();
      moves.splice(mi, 1);
      camPopClose();
      saveCameraMovesForScene(si, moves);
    });
    document.getElementById('cp-save').addEventListener('click', function() {
      var moves = (scene.camera_moves || []).slice();
      var next = {};
      for (var k in m) next[k] = m[k];
      var atEl = document.getElementById('cp-at');
      var at = parseFloat(atEl && atEl.value);
      if (!isNaN(at)) next.at = Math.max(0, Math.min(dur - 0.2, Math.round(at * 10) / 10));
      var scEl = document.getElementById('cp-scale');
      if (scEl) { var sc = parseFloat(scEl.value); if (!isNaN(sc)) next.scale = sc; }
      if (next.type === 'pan') delete next.scale; // pan never zooms

      var agEl = document.getElementById('cp-angle');
      if (agEl) { var ag = parseFloat(agEl.value); if (!isNaN(ag)) next.angle = Math.max(-45, Math.min(45, ag)); }
      var axEl = document.getElementById('cp-axis');
      if (axEl) next.axis = axEl.value === 'y' ? 'y' : axEl.value === 'x' ? 'x' : 'z';
      var shEl = document.getElementById('cp-shift');
      if (shEl) { var sh = parseFloat(shEl.value); if (!isNaN(sh)) next.shift = Math.max(-40, Math.min(40, sh)); }
      var hdEl = document.getElementById('cp-hold');
      if (hdEl) { var hd = parseFloat(hdEl.value); if (!isNaN(hd)) next.hold = hd; }
      var duEl = document.getElementById('cp-dur');
      if (duEl) { var du = parseFloat(duEl.value); if (!isNaN(du)) next.duration = du; }
      var rtEl = document.getElementById('cp-return');
      next['return'] = !!(rtEl && rtEl.checked);
      moves[mi] = next;
      camPopClose();
      saveCameraMovesForScene(si, moves);
    });
    document.getElementById('cp-prev').addEventListener('click', function() {
      var total = state.totalDuration || calcTotalDuration();
      if (!(total > 0)) return;
      var atEl = document.getElementById('cp-at');
      var at = parseFloat(atEl && atEl.value);
      var t = sceneStartFor(si) + Math.max(0, (isNaN(at) ? (m.at || 0) : at) - 1);
      camPopClose();
      scrub(Math.round((t / total) * 1000));
      els.slider.value = Math.round((t / total) * 1000);
      if (!state.playing) togglePlay();
    });
  }

  // Close the camera popover on any outside press (pills stop propagation).
  document.addEventListener('mousedown', function(e) {
    var pop = document.getElementById('cam-pop');
    if (pop && pop.style.display === 'block' && !pop.contains(e.target)) {
      camPopClose();
      if (studio.dragCancel) studio.dragCancel();
    }
  });

  // ── Draw-a-zoom confirm popover: a drag on the scene (captured inside the
  // iframe by studioAttach) draws a marquee; on release this opens anchored to
  // the box. Nothing is saved until "Add zoom" -- a stray drag costs one Esc. ──
  function zoomConfirmOpen(doc, boxPx) {
    var pop = document.getElementById('cam-pop');
    var si = state.currentSceneIndex;
    var scene = currentSceneEntry();
    if (!pop || !scene) { if (studio.dragCancel) studio.dragCancel(); return; }
    camPopClose();
    rvPopClose();
    var cw = parseInt(els.previewIframe.width, 10) || 1920;
    var ch = parseInt(els.previewIframe.height, 10) || 1080;
    var dur = scene.duration_seconds || 5;
    var at = Math.max(0, Math.min(dur - 0.2, (state.masterTime || 0) - sceneStartFor(si)));
    // Which video (if any) does this box target? An armed "Zoom inside"
    // (studio.pendingInside) wins; otherwise the video whose rect holds the
    // box center -- smallest wins, so a PiP over a screencast picks the PiP.
    var inside = null;
    var hitVideo = null;
    if (studio.pendingInside) {
      inside = studio.pendingInside;
      studio.pendingInside = null;
    } else {
      var hit = videoForBox(doc, scene.id, boxPx);
      if (hit) {
        hitVideo = hit.video;
        var fully = boxPx.left >= hit.rect.left && boxPx.top >= hit.rect.top &&
          boxPx.left + boxPx.width <= hit.rect.right && boxPx.top + boxPx.height <= hit.rect.bottom;
        inside = { target: videoTargetFor(hit.video), label: videoLabelFor(hit.video), checked: fully };
      }
    }
    // A box on a screencast-frame can also become a CALLOUT (the reverse
    // zoom: the region lifts OUT toward the camera in a glow shell instead
    // of the camera diving in). Same gesture, two treatments.
    var scf = null;
    try {
      var scfVid = hitVideo || (inside && inside.target && inside.target !== 'screencast' ? doc.querySelector(inside.target) : null);
      if (scfVid && !scfVid.hasAttribute('data-mp-derived')) {
        // The screencast-frame markup root is .scf-stage; the component
        // wrapper above it carries data-cid (scene assembler) or
        // data-comp-id (composite assembler).
        var stageEl = scfVid.closest('.scf-stage');
        if (stageEl) {
          var cidEl = stageEl.closest('[data-cid], [data-comp-id]');
          var vpEl = scfVid.closest('.scf-viewport') || scfVid;
          // Composite mode namespaces the id ("scene_003__tpl_video");
          // strip the scene prefix to get the component id.
          var rawCid = cidEl ? (cidEl.getAttribute('data-cid') || cidEl.getAttribute('data-comp-id')) : null;
          if (rawCid && rawCid.indexOf('__') !== -1) rawCid = rawCid.slice(rawCid.indexOf('__') + 2);
          scf = {
            compId: rawCid,
            vpRect: vpEl.getBoundingClientRect(),
            isFloat: stageEl.classList.contains('is-float'),
          };
        }
      }
    } catch (e) { scf = null; }
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title"><b>Zoom here</b> — scene ' + (si + 1) + '</span>' +
      '<button class="sp-x" id="zc-x" title="Cancel (Esc)">✕</button></div>' +
      '<div class="sp-fields">' +
        (scf ? '<label class="sp-region" title="Zoom in: the camera dives into the region. Call out: the region lifts OUT toward the camera in a glow shell (the reverse zoom -- the float-stage treatment)">treatment <select id="zc-mode">' +
          '<option value="zoom"' + (scf.isFloat ? '' : ' selected') + '>Zoom in (camera)</option>' +
          '<option value="callout"' + (scf.isFloat ? ' selected' : '') + '>Call out (lift)</option>' +
        '</select></label>' : '') +
        '<label>at <input id="zc-at" type="number" min="0" max="' + escAttr('' + Math.max(0, dur - 0.2).toFixed(1)) + '" step="0.1" value="' + escAttr('' + (Math.round(at * 10) / 10)) + '">s</label>' +
        '<label>hold <input id="zc-hold" type="number" min="0" max="10" step="0.5" value="1.5">s</label>' +
        '<label>ease <input id="zc-dur" type="number" min="0.2" max="3" step="0.1" value="0.8">s</label>' +
        '<label title="Ease back to wide afterwards">return <input id="zc-return" type="checkbox" checked></label>' +
        (inside ? '<label class="sp-region" id="zc-cast-row" title="The footage magnifies inside its own frame; everything around it stays put">inside ' + escHtml(inside.label) + ' only <input id="zc-cast" type="checkbox"' + (inside.checked !== false ? ' checked' : '') + '></label>' : '') +
      '</div>' +
      '<div class="sp-row">' +
        '<button class="rv-go secondary" id="zc-cancel" style="flex:0 0 auto;">Cancel</button>' +
        '<button class="rv-go" id="zc-add" style="flex:1;">Add zoom</button>' +
      '</div>';
    pop.style.display = 'block';
    // Anchor next to the drawn box (box is in canvas px; scale to the screen).
    var irect = els.previewIframe.getBoundingClientRect();
    var sx = irect.width / cw, sy = irect.height / ch;
    var pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 160;
    var px = irect.left + (boxPx.left + boxPx.width / 2) * sx - pw / 2;
    var py = irect.top + (boxPx.top + boxPx.height) * sy + 10;
    if (py + ph > window.innerHeight - 8) py = Math.max(8, irect.top + boxPx.top * sy - ph - 10);
    pop.style.left = Math.max(8, Math.min(px, window.innerWidth - pw - 8)) + 'px';
    pop.style.top = py + 'px';
    function closeCancel() { camPopClose(); if (studio.dragCancel) studio.dragCancel(); }
    document.getElementById('zc-x').addEventListener('click', closeCancel);
    document.getElementById('zc-cancel').addEventListener('click', closeCancel);
    // Treatment toggle: callout mode hides the camera-only fields and
    // relabels the confirm (the callout always returns by design).
    var modeSel = document.getElementById('zc-mode');
    function zcMode() { return modeSel && modeSel.value === 'callout' ? 'callout' : 'zoom'; }
    function zcSyncMode() {
      var isCo = zcMode() === 'callout';
      var castRow = document.getElementById('zc-cast-row');
      if (castRow) castRow.style.display = isCo ? 'none' : '';
      var retInput = document.getElementById('zc-return');
      if (retInput && retInput.parentElement) retInput.parentElement.style.display = isCo ? 'none' : '';
      document.getElementById('zc-add').textContent = isCo ? 'Add callout' : 'Add zoom';
      var head = pop.querySelector('.sp-title');
      if (head) head.innerHTML = '<b>' + (isCo ? 'Call out here' : 'Zoom here') + '</b> — scene ' + (si + 1);
    }
    if (modeSel) { modeSel.addEventListener('change', zcSyncMode); zcSyncMode(); }
    document.getElementById('zc-add').addEventListener('click', function() {
      var atV = parseFloat(document.getElementById('zc-at').value);
      var atClamped = isNaN(atV) ? Math.round(at * 10) / 10 : Math.max(0, Math.min(dur - 0.2, Math.round(atV * 10) / 10));
      if (zcMode() === 'callout' && scf && scf.compId) {
        // Region in % of the DISPLAYED footage (the viewport box), the
        // coordinate space the callout choreography uses. In float the
        // viewport rect is the 3D projection -- close enough to author
        // against; fine-tune numbers in the revise panel if needed.
        var vr = scf.vpRect;
        var co = {
          at: atClamped,
          dur: Math.max(1.5, parseFloat(document.getElementById('zc-hold').value) || 4),
          travel: Math.max(0.35, Math.min(2, parseFloat(document.getElementById('zc-dur').value) || 0.9)),
          x: Math.round(Math.max(0, Math.min(96, ((boxPx.left - vr.left) / vr.width) * 100)) * 10) / 10,
          y: Math.round(Math.max(0, Math.min(96, ((boxPx.top - vr.top) / vr.height) * 100)) * 10) / 10,
          w: Math.round(Math.max(2, Math.min(100, (boxPx.width / vr.width) * 100)) * 10) / 10,
          h: Math.round(Math.max(2, Math.min(100, (boxPx.height / vr.height) * 100)) * 10) / 10,
        };
        closeCancel();
        saveCalloutForComponent(si, scf.compId, co);
        return;
      }
      var move = {
        at: atClamped,
        type: 'zoom',
        x: Math.round(((boxPx.left + boxPx.width / 2) / cw) * 100),
        y: Math.round(((boxPx.top + boxPx.height / 2) / ch) * 100),
        w: Math.round((boxPx.width / cw) * 100),
        h: Math.round((boxPx.height / ch) * 100),
        duration: parseFloat(document.getElementById('zc-dur').value) || 0.8,
        hold: parseFloat(document.getElementById('zc-hold').value) || 0,
        'return': !!document.getElementById('zc-return').checked,
      };
      var castEl = document.getElementById('zc-cast');
      if (castEl && castEl.checked && inside) move.target = inside.target;
      var moves = (scene.camera_moves || []).slice();
      moves.push(move);
      closeCancel();
      saveCameraMovesForScene(si, moves);
    });
  }

  // Persist a component's full callout list (append, edit, or delete), mirror
  // it to an st-screencast shell sibling so the scene data stays coherent,
  // then reboot the composite with the playhead restored.
  function saveCalloutsData(sceneIndex, comp, callouts) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[sceneIndex];
    if (!p || !scene || !comp) return;
    comp.data = comp.data || {};
    comp.data.callouts = callouts;
    var shell = null;
    scene.components.forEach(function(c) { if (c.type === 'st-screencast') shell = c; });
    studioStatus('Saving callout…', '');
    var patchPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    var work = api('PATCH', patchPath, { data: comp.data });
    if (shell) {
      shell.data = shell.data || {};
      shell.data.callouts = callouts;
      var shellPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + shell.id;
      work = work.then(function() { return api('PATCH', shellPath, { data: shell.data }); });
    }
    work.then(function() {
      studioStatus('Callout saved ✓ reloading preview…', 'ok');
      renderCamPills();
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) {
      studioStatus('Callout save failed: ' + e.message, 'err');
    });
  }

  function saveCalloutForComponent(sceneIndex, compId, callout) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[sceneIndex];
    if (!p || !scene || !scene.components) return;
    var comp = null;
    scene.components.forEach(function(c) { if (c.id === compId) comp = c; });
    if (!comp) { scene.components.forEach(function(c) { if (!comp && c.type === 'screencast-frame') comp = c; }); }
    if (!comp) { studioStatus('No screencast component found for callout', 'err'); return; }
    saveCalloutsData(sceneIndex, comp, ((comp.data || {}).callouts || []).concat([callout]));
  }

  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') {
      if (studio.dragCancel) studio.dragCancel();
      camPopClose();
      rvPopClose();
    }
  });

  // One-line playback health snapshot -> console -> session log. Answers
  // "which element is silently dead" without asking the user for devtools:
  // per element: ready(0-4) / t=currentTime / p=paused / e=media-error code.
  function reportMediaHealth(tag) {
    try {
      var parts = [];
      (state.audioElements || []).forEach(function(a) {
        parts.push('a:' + (a._trackType || '?') + '/' + (a.src || '').split('/').pop().split('?')[0].slice(0, 24) +
          ' r' + a.readyState + ' t' + a.currentTime.toFixed(1) + (a.paused ? ' PAUSED' : '') +
          ' v' + a.volume.toFixed(2) + (a.muted ? ' MUTED' : '') + (a.error ? ' ERR' + a.error.code : ''));
      });
      (state.mediaClips || []).forEach(function(c) {
        if (c.kind !== 'scene-video' && c.kind !== 'speaker') return;
        var el2 = c.el;
        parts.push('v:' + ((el2.currentSrc || el2.src || el2.getAttribute('src') || '?').split('/').pop().split('?')[0].slice(0, 24)) +
          ' r' + el2.readyState + ' t' + el2.currentTime.toFixed(1) + (el2.paused ? ' PAUSED' : '') +
          (el2.error ? ' ERR' + el2.error.code : ''));
      });
      console.log('[media]', tag, 'film=' + (state.masterTime || 0).toFixed(1), parts.join(' | '));
    } catch (eH) {}
  }

  function togglePlay() {
    if (state.playing) {
      // PAUSE
      if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
      }
      state.playing = false;
      state.playAll = false;
      state._stopAt = null;
      updatePlayIcon();

      // Composite mode: master timeline is always paused, we just stop the clock
      // Videos will be paused by syncMedia on next tick
      pauseAudio();
      // syncMedia will handle speaker pause+mute on next tick
      state.forceSync = true;
      syncMedia(state.masterTime, false);
      state.forceSync = false;
    } else {
      // RESUME / PLAY
      state.playing = true;
      state.playAll = true;
      updatePlayIcon();

      var globalTime = state.masterTime || 0;

      if (state.compositeLoaded) {
        // Composite mode: just start the transport clock loop
        // Master timeline is always paused; we seek it on each tick
        // Re-prime buffering for here + the next cut: the browser throttles
        // preload on hidden videos, so ask again the moment play starts.
        if (!IS_MOBILE) { preloadSceneVideos(state.currentSceneIndex); preloadSceneVideos(state.currentSceneIndex + 1); }
        state.lastTickTime = performance.now();
        // Unified media sync handles speaker + audio
        state.forceSync = true;
        playAudio();
        syncMedia(globalTime, true);
        state.forceSync = false;
        setTimeout(function() { if (state.playing) reportMediaHealth('play+2.5s'); }, 2500);
        setTimeout(function() { if (state.playing) reportMediaHealth('play+10s'); }, 10000);
        animLoop();
        return;
      }
    }
  }

  function stopPlayback() {
    state.playing = false;
    state.playAll = false;
    updatePlayIcon();
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
  }

  function animLoop() {
    if (!state.playing) return;

    // Master clock: compute elapsed real time
    var now = performance.now();
    var elapsed = (now - state.lastTickTime) / 1000;
    state.lastTickTime = now;
    // One-stream clock: while the speaker (voice+camera) is rolling, IT is
    // the film clock -- masterTime reads from its playhead, so camera/voice
    // can never drift from the timeline by construction. Wall clock is the
    // fallback (no speaker track, ended, or mid-scrub repositioning).
    var spkEl = els.speakerBg;
    var spkT = (spkEl && !spkEl.paused && spkEl.readyState >= 3 && spkEl.currentTime > 0)
      ? spkEl.currentTime - (state.speakerTrimStart || 0)
      : null;
    if (spkT !== null && spkT > state.masterTime - 0.75 && spkT < state.masterTime + 2) {
      state.masterTime = spkT;
    } else {
      state.masterTime += elapsed;
    }

    var globalTime = state.masterTime;
    var totalDur = state.totalDuration;

    // ── Composite mode: transport clock drives master timeline ──
    if (state.compositeLoaded) {
      // Clamp
      if (globalTime >= totalDur) {
        state.masterTime = totalDur;
        globalTime = totalDur;
        stopPlayback();
        stopAudioFull();
        syncMedia(globalTime, false);
        updateTimeDisplay(globalTime);
        els.slider.value = 1000;
        return;
      }

      // Seek master timeline (GSAP is always paused, we drive it)
      var masterTl = getCompositeMasterTimeline();
      if (masterTl) {
        masterTl.time(globalTime);
      }

      // Update UI. Fractional value + step="any": at timeline zoom the
      // track is thousands of px wide, so 1000 integer steps made the
      // thumb hop ~9px at a time.
      els.slider.value = totalDur > 0 ? (globalTime / totalDur) * 1000 : 0;
      followPlayhead(false);
      updateTimeDisplay(globalTime);

      // Track which scene we're in for sidebar highlight
      var cInfo = compositeSceneForTime(globalTime);
      if (cInfo.index !== state.currentSceneIndex) {
        state.currentSceneIndex = cInfo.index;
        state.currentComponentIndex = -1;
        var project = state.currentProject;
        if (project && project.scenes) {
          state.duration = project.scenes[cInfo.index].duration_seconds || 0;
        }
        updateActiveScene(cInfo.index);
        renderLayers();
        clearProps();
        updateSceneIndicator();
        // Speaker track visibility handled by syncMedia
      }

      // Unified media sync (Phase 2)
      syncMedia(globalTime, true);
      state.forceSync = false;

      // Debug heartbeat: once a second, the active scene's videos in one
      // line -- shows exactly when a clock freezes or readyState collapses.
      if (window.__MP_SYNCDEBUG) {
        var nowHb = performance.now();
        if (!state._hbTs || nowHb - state._hbTs > 1000) {
          state._hbTs = nowHb;
          try {
            var sidH = state.currentProject.scenes[state.currentSceneIndex].id;
            var partsH = [];
            state.mediaClips.forEach(function(cH) {
              if (cH.kind !== 'scene-video' || cH.sceneId !== sidH) return;
              var eH = cH.el, bH = 'none';
              try { if (eH.buffered.length) bH = eH.buffered.end(eH.buffered.length - 1).toFixed(1); } catch (eB2) {}
              partsH.push((eH.currentSrc || '').split('/').pop().slice(0, 25) + ' ct=' + eH.currentTime.toFixed(2) + ' rs=' + eH.readyState + ' rate=' + eH.playbackRate + (eH.paused ? ' P' : ' >') + ' buf<=' + bH);
            });
            if (partsH.length) console.log('[hb] film ' + globalTime.toFixed(2) + ' | ' + partsH.join(' | '));
          } catch (eHb) {}
        }
      }

      state.animFrameId = requestAnimationFrame(animLoop);
      return;
    }

  }

  // Wrap animLoop with error recovery so the rAF chain never breaks
  var _rawAnimLoop = animLoop;
  animLoop = function() {
    try { _rawAnimLoop(); }
    catch(e) {
      console.error('[preview] animLoop error:', e);
      // Keep the loop alive
      state.animFrameId = requestAnimationFrame(animLoop);
    }
  };

  function scrub(sliderVal) {
    // The take is glued to the film clock and a browser recorder can only
    // APPEND: scrubbing back mid-take replays film the mic then records a
    // second time, so every later word plays late (live case: three
    // scrub-backs made a 116s take over a 107s film -- the elapsed readout
    // shows FILM time, so it even LOOKS like the recorder rewound; it
    // cannot). Lock scrubbing during a take; the booth's own start-at-zero
    // seek passes via _internalScrub.
    if ((booth.phase === 'recording' || booth.phase === 'countdown') && !booth._internalScrub) {
      studioStatus('⛔ Scrubbing is locked while recording — the take is glued to the film clock. Pause to catch your breath, or stop the take and retake.', 'warn');
      movePlayhead();
      return;
    }
    var totalDur = state.totalDuration;
    if (totalDur <= 0) return;
    state._stopAt = null;
    var targetGlobal = (sliderVal / 1000) * totalDur;

    var project = state.currentProject;
    if (!project || !project.scenes) return;

    // Update master clock
    state.masterTime = targetGlobal;

    updateTimeDisplay(targetGlobal);
    // ── Composite mode: just seek the master timeline ──
    if (state.compositeLoaded) {
      var masterTl = getCompositeMasterTimeline();
      if (masterTl) {
        masterTl.time(targetGlobal);
      }
      // Update scene highlight
      var cInfo = compositeSceneForTime(targetGlobal);
      if (cInfo.index !== state.currentSceneIndex) {
        state.currentSceneIndex = cInfo.index;
        state.currentComponentIndex = -1;
        state.duration = project.scenes[cInfo.index].duration_seconds || 0;
        updateActiveScene(cInfo.index);
        renderLayers();
        clearProps();
        updateSceneIndicator();
        // Speaker track visibility handled by syncMedia
      }
      state.forceSync = true;
      syncMedia(targetGlobal, false);
      state.forceSync = false;
      stopPlayback();
      // Paused scrub: scene visibility settles a frame after the timeline
      // seek, and no animLoop tick follows to refresh the rate badge --
      // re-read it once the new scene is actually visible.
      setTimeout(function() {
        state._rbTs = 0;
        try { updateRateBadge(state.masterTime || 0); } catch (eRB2) {}
      }, 250);
      return;
    }


  }

  function updateTimeDisplay(globalTime) {
    var total = state.totalDuration || 0;
    els.timeCur.textContent = fmtTime(globalTime || 0);
    els.timeTotal.textContent = fmtTime(total);
    try { updateRateBadge(globalTime || 0); } catch (eRB) {}
    try { movePlayhead(); } catch (ePh) {}
    // Piece audition: "Play this piece" arms a stop point.
    if (state._stopAt != null && state.playing && (globalTime || 0) >= state._stopAt - 0.05) {
      state._stopAt = null;
      togglePlay();
    }
  }

  function fmtTime(sec) {
    sec = sec || 0;
    if (sec < 60) return sec.toFixed(1) + 's';
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function updateSceneIndicator() {
    // The bar's "Scene N/M" pill is gone -- the scene list in the left nav
    // already shows which scene is active. Kept as a no-op so the six
    // scene-change call sites stay untouched.
  }

  function updatePlayIcon() {
    if (state.playing) {
      els.playIcon.innerHTML = '<rect x="3" y="2" width="3" height="10" rx="0.5"/><rect x="8" y="2" width="3" height="10" rx="0.5"/>';
    } else {
      els.playIcon.innerHTML = '<polygon points="3,1 12,7 3,13"/>';
    }
  }

  // Events
  els.projectSelect.addEventListener('change', function() {
    var val = els.projectSelect.value;
    if (val) loadProject(val);
  });
  els.playBtn.addEventListener('click', togglePlay);
  els.slider.addEventListener('input', function() { scrub(parseFloat(els.slider.value)); });
  if (els.volSlider) {
    els.volSlider.addEventListener('input', function() {
      var v = parseInt(els.volSlider.value, 10);
      if (isNaN(v)) v = 100;
      state.masterVolume = v / 100;
      // Live-apply: non-music directly; music too when the ducking loop isn't
      // running (when it is, it re-reads masterVolume every tick).
      state.audioElements.forEach(function(audio) {
        if (audio._trackType !== 'music' || !state.audioDuckingInterval) {
          audio.volume = effVolume(audio);
        }
      });
      if (els.volIcon) els.volIcon.className = state.masterVolume === 0 ? 'vol-icon muted' : 'vol-icon';
    });
  }
  // Click the ♪ icon = mute toggle (restores the pre-mute level). Reuses the
  // slider's input handler so there is exactly one volume code path.
  if (els.volIcon && els.volSlider) {
    els.volIcon.addEventListener('click', function() {
      var cur = parseInt(els.volSlider.value, 10);
      if (isNaN(cur)) cur = 100;
      if (cur > 0) { state._preMuteVol = cur; els.volSlider.value = '0'; }
      else { els.volSlider.value = String(state._preMuteVol || 100); }
      els.volSlider.dispatchEvent(new Event('input'));
    });
  }

  // ─────────────────────────────────────────────
  // Narration booth (Mode B, SPEC-recorder.md): play the locked cut from 0
  // while recording the mic; the take becomes the film's soundtrack with
  // captions + chapters attached server-side. Picture is never re-solved.
  // ─────────────────────────────────────────────
  var booth = { phase: 'closed', stream: null, rec: null, chunks: [], blob: null, url: null, startTs: 0, mon: null, script: null, wantCam: false };

  function boothCard(html) {
    document.getElementById('booth-overlay').style.display = 'flex';
    document.getElementById('booth-card').innerHTML = html;
  }

  function boothClose() {
    booth.phase = 'closed';
    if (state.currentProject) els.slider.disabled = false;
    if (booth.mon) { clearInterval(booth.mon); booth.mon = null; }
    if (booth.rec && booth.rec.state === 'recording') { try { booth.rec.stop(); } catch (e) {} }
    booth.rec = null;
    if (booth.stream) { booth.stream.getTracks().forEach(function(t) { t.stop(); }); booth.stream = null; }
    if (booth.url) { URL.revokeObjectURL(booth.url); booth.url = null; }
    boothMute(false);
    document.getElementById('booth-overlay').style.display = 'none';
    document.getElementById('prompter-bar').style.display = 'none';
  }

  // Program audio must not bleed into the take (or fight the narrator's
  // ears): everything the transport can sound goes silent while recording.
  function boothMute(m) {
    state.audioElements.forEach(function(a) { a.muted = !!m; });
    if (els.speakerBg) {
      if (m) { booth._spkWasMuted = els.speakerBg.muted; els.speakerBg.muted = true; }
      else if (booth._spkWasMuted !== undefined) { els.speakerBg.muted = booth._spkWasMuted; booth._spkWasMuted = undefined; }
    }
  }

  // ── Teleprompter script plumbing ──
  function boothScriptPath() {
    var p = state.currentProject;
    return '/booth-script/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id);
  }

  function fmtCue(t) {
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function cuesToText(cues) {
    return (cues || []).map(function(c) { return '[' + fmtCue(c.at) + '] ' + c.text; }).join('\\n');
  }

  function textToCues(text) {
    var cues = [];
    (text || '').split('\\n').forEach(function(line) {
      var m = line.match(/^\\s*\\[([0-9:.]+)\\]\\s*(.+)$/);
      if (!m) { if (line.trim() && cues.length) cues[cues.length - 1].text += ' ' + line.trim(); return; }
      var parts = m[1].split(':');
      var at = parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseFloat(parts[1]) : parseFloat(m[1]);
      if (!isNaN(at)) cues.push({ at: at, text: m[2].trim() });
    });
    return cues;
  }

  function boothIdleCard() {
    booth.phase = 'idle';
    var scriptLine = booth.script && booth.script.length
      ? 'Script ready: ' + booth.script.length + ' cue(s) &mdash; the teleprompter will scroll it in sync.'
      : 'No script yet &mdash; you can improvise, or draft one from the film.';
    boothCard(
      '<h3>&#127908; Narration booth</h3>' +
      '<p>The film plays from the start while your mic records. Watch and narrate &mdash; your take becomes the soundtrack, and captions + chapter cards are built from it automatically. The cut itself never changes.</p>' +
      '<p id="booth-script-line">' + scriptLine + '</p>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:4px;">' +
      '<input type="checkbox" id="booth-cam"' + (booth.wantCam ? ' checked' : '') + ' style="margin:0;"> &#128247; Include camera bubble (face + voice)</label>' +
      '<div class="booth-row"><button class="btn btn-primary" id="booth-start">&#9210; Start take</button>' +
      '<button class="btn btn-secondary" id="booth-script-btn">' + (booth.script && booth.script.length ? 'Edit script' : '&#128220; Draft script') + '</button>' +
      '<button class="btn btn-secondary" id="booth-cancel">Close</button></div>'
    );
    document.getElementById('booth-cam').addEventListener('change', function(e) {
      booth.wantCam = !!e.target.checked;
      // A camera-less stream can't grow a camera track -- re-request on next take.
      if (booth.stream) { booth.stream.getTracks().forEach(function(t) { t.stop(); }); booth.stream = null; }
    });
    document.getElementById('booth-start').addEventListener('click', boothBegin);
    document.getElementById('booth-cancel').addEventListener('click', boothClose);
    document.getElementById('booth-script-btn').addEventListener('click', function() {
      if (booth.script && booth.script.length) boothScriptCard();
      else boothDraftScript();
    });
    // Lazy-load a stored script the first time the booth opens on a project.
    if (booth.script === null) {
      api(boothScriptPath()).then(function(j) {
        booth.script = (j.script && j.script.cues) || [];
        if (booth.phase === 'idle') boothIdleCard();
      }).catch(function() { booth.script = []; });
    }
  }

  function boothDraftScript() {
    // Drafting is a real model run -- often 1-2 minutes. Show a live clock +
    // staged status so it never reads as a hang, and survive a gateway
    // cutting the long request: the server keeps writing and SAVES the
    // script, so on transport error we poll for it before declaring failure.
    booth.phase = 'drafting';
    var t0 = Date.now();
    boothCard(
      '<h3>&#128220; Drafting script&hellip; <span id="booth-draft-timer" style="font-variant-numeric:tabular-nums;color:#6366f1;">0:00</span></h3>' +
      '<p id="booth-draft-stage">Reading the cut &mdash; its real-time spans, timelapses, pages and clicks&hellip;</p>' +
      '<div class="booth-draft-bar"><div class="booth-draft-fill"></div></div>' +
      '<p style="font-size:10px;color:#9ca3af;margin-top:6px;">Usually 1&ndash;2 minutes &mdash; the director reads every span before writing a word.</p>'
    );
    var tick = setInterval(function() {
      if (booth.phase !== 'drafting') { clearInterval(tick); return; }
      var s = Math.floor((Date.now() - t0) / 1000);
      var timer = document.getElementById('booth-draft-timer');
      var stage = document.getElementById('booth-draft-stage');
      if (!timer) { clearInterval(tick); return; }
      timer.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      if (stage) stage.textContent =
        s < 25 ? 'Reading the cut — its real-time spans, timelapses, pages and clicks…'
        : s < 75 ? 'Writing cues timed to the film clock…'
        : s < 160 ? 'Still writing — longer films take a couple of minutes…'
        : 'Almost there…';
    }, 1000);
    function finish(cues) { clearInterval(tick); booth.script = cues || []; boothScriptCard(); }
    function fail(msg) { clearInterval(tick); studioStatus('Script drafting failed: ' + msg, 'err'); boothIdleCard(); }
    api('POST', boothScriptPath(), {}).then(function(j) {
      finish(j.script && j.script.cues);
    }).catch(function(e) {
      // Transport died (proxy/gateway timeout) but the server may still be
      // drafting -- it saves the script when done. Poll up to 3 more minutes.
      var polls = 0;
      var stage = document.getElementById('booth-draft-stage');
      if (stage) stage.textContent = 'Connection hiccup — still drafting on the server, checking for the result…';
      var poll = setInterval(function() {
        polls++;
        api(boothScriptPath()).then(function(j) {
          var cues = j.script && j.script.cues;
          if (cues && cues.length) { clearInterval(poll); finish(cues); }
          else if (polls >= 18) { clearInterval(poll); fail(e.message); }
        }).catch(function() { if (polls >= 18) { clearInterval(poll); fail(e.message); } });
      }, 10000);
    });
  }

  function boothScriptCard() {
    booth.phase = 'script';
    boothCard(
      '<h3>&#128220; Narration script</h3>' +
      '<p>One cue per line: [m:ss] what you\\'ll say. Edit freely &mdash; times are when each line should start on the film clock.</p>' +
      '<textarea id="booth-script-text"></textarea>' +
      '<div class="booth-row"><button class="btn btn-primary" id="booth-script-save">Save</button>' +
      '<button class="btn btn-secondary" id="booth-script-redraft">Re-draft</button>' +
      '<button class="btn btn-secondary" id="booth-script-back">Back</button></div>'
    );
    document.getElementById('booth-script-text').value = cuesToText(booth.script);
    document.getElementById('booth-script-save').addEventListener('click', function() {
      var cues = textToCues(document.getElementById('booth-script-text').value);
      if (!cues.length) { studioStatus('No usable cues -- lines look like [0:12] text', 'err'); return; }
      api('POST', boothScriptPath(), { cues: cues }).then(function(j) {
        booth.script = (j.script && j.script.cues) || cues;
        boothIdleCard();
      }).catch(function(e) { studioStatus('Script save failed: ' + e.message, 'err'); });
    });
    document.getElementById('booth-script-redraft').addEventListener('click', boothDraftScript);
    document.getElementById('booth-script-back').addEventListener('click', boothIdleCard);
  }

  // Prompter: current cue lands ~1.2s early so the eye leads the clock.
  function boothPrompterTick(t) {
    var bar = document.getElementById('prompter-bar');
    if (!booth.script || !booth.script.length) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var cur = null, next = null;
    for (var i = 0; i < booth.script.length; i++) {
      if (booth.script[i].at <= t + 1.2) cur = booth.script[i];
      else { next = booth.script[i]; break; }
    }
    document.getElementById('prompter-cur').textContent = cur ? cur.text : '\\u2014';
    document.getElementById('prompter-next').textContent = next ? ('[' + fmtCue(next.at) + '] ' + next.text) : '';
  }

  function boothBegin() {
    if (!state.compositeLoaded || !(state.totalDuration > 0)) {
      studioStatus('Load the preview first, then start the take', 'err');
      return;
    }
    // Mic access only exists in secure contexts (https / localhost). Studio
    // on a bare-IP http origin has NO navigator.mediaDevices at all -- guard
    // with instructions instead of a TypeError banner.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      boothCard(
        '<h3>&#127908; Narration booth</h3>' +
        '<p>The browser blocks microphone access on plain-HTTP pages. To record here, tell Chrome to treat this origin as secure:</p>' +
        '<p style="font-family:monospace;font-size:11px;user-select:all;background:#f3f4f6;border-radius:6px;padding:6px 8px;">chrome://flags/#unsafely-treat-insecure-origin-as-secure</p>' +
        '<p>Add <span style="font-family:monospace;font-size:11px;user-select:all;">' + escHtml(location.origin) + '</span>, set it to Enabled, relaunch Chrome, and start the take again. (Long-term fix: serve Studio over HTTPS.)</p>' +
        '<div class="booth-row"><button class="btn btn-secondary" id="booth-cancel">Close</button></div>'
      );
      document.getElementById('booth-cancel').addEventListener('click', boothClose);
      return;
    }
    var ready = booth.stream
      ? Promise.resolve(booth.stream)
      : navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: booth.wantCam ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
        });
    ready.then(function(stream) {
      booth.stream = stream;
      boothCountdown(3);
    }).catch(function(e) {
      boothCard('<h3>&#127908; Narration booth</h3><p>Microphone unavailable: ' + escHtml(e.message || String(e)) +
        '. Allow mic access for this site and try again.</p>' +
        '<div class="booth-row"><button class="btn btn-secondary" id="booth-cancel">Close</button></div>');
      document.getElementById('booth-cancel').addEventListener('click', boothClose);
    });
  }

  function boothCountdown(n) {
    booth.phase = 'countdown';
    if (n <= 0) { boothRecord(); return; }
    boothCard('<div class="booth-count">' + n + '</div>');
    setTimeout(function() { if (booth.phase === 'countdown') boothCountdown(n - 1); }, 900);
  }

  function boothRecord() {
    booth._internalScrub = true;
    try { scrub(0); } finally { booth._internalScrub = false; }
    boothMute(true);
    var hasCam = booth.stream && booth.stream.getVideoTracks().length > 0;
    var mime = hasCam
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm')
      : ((window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) ? 'audio/webm;codecs=opus' : 'audio/webm');
    try {
      booth.rec = new MediaRecorder(booth.stream, hasCam
        ? { mimeType: mime, audioBitsPerSecond: 128000, videoBitsPerSecond: 2500000 }
        : { mimeType: mime, audioBitsPerSecond: 128000 });
    } catch (e) {
      boothMute(false);
      studioStatus('Recording not supported in this browser: ' + e.message, 'err');
      boothClose();
      return;
    }
    booth.chunks = [];
    booth.rec.ondataavailable = function(e) { if (e.data && e.data.size) booth.chunks.push(e.data); };
    booth.rec.onstop = boothReview;
    booth.rec.start(500);
    booth.startTs = performance.now();
    booth.phase = 'recording';
    booth.desynced = false;
    booth.lastFilmT = 0;
    if (!state.playing) togglePlay();
    boothRecCard(false);
    // The recorder is glued to the FILM clock: pausing the transport pauses
    // the take (catch your breath, then press play to resume -- both pick up
    // together), and only reaching the end of the film ends it.
    els.slider.disabled = true; // visual affordance for the scrub lock
    booth._stallTicks = 0;
    booth.mon = setInterval(function() {
      if (booth.phase !== 'recording') return;
      boothMute(true); // idempotent guard: audio elements can be rebuilt under us
      if (state.masterTime >= state.totalDuration - 0.05) { boothStopTake(); return; }
      // The take is glued to the FILM CLOCK, not just the transport: a
      // buffering stall freezes masterTime while "playing" stays true, and
      // a mic that keeps rolling through it makes the take LONGER than the
      // film -- every later word then plays late (seen live: a 116s take
      // over a 107s film, narration drifting into the outro). Pause the
      // recorder whenever the clock stops advancing; resume when it moves.
      var advancing = (state.masterTime - booth.lastFilmT) > 0.03;
      if (state.playing && !advancing) booth._stallTicks++;
      else booth._stallTicks = 0;
      var buffering = state.playing && booth._stallTicks >= 2; // ~500ms frozen
      var paused = booth.rec.state === 'paused';
      if (!state.playing && !paused) {
        try { booth.rec.pause(); } catch (e) {}
        boothRecCard(true); // deliberate pause: show the paused card
      } else if (buffering && !paused) {
        try { booth.rec.pause(); } catch (e) {} // silent: stalls are sub-second noise
      } else if (state.playing && !buffering && paused) {
        try { booth.rec.resume(); } catch (e) {}
        boothRecCard(false);
      }
      // A scrub while paused breaks the film-clock == take-clock invariant;
      // flag it so the review card can suggest a retake.
      if (!state.playing && Math.abs(state.masterTime - booth.lastFilmT) > 0.6) booth.desynced = true;
      booth.lastFilmT = state.masterTime;
      boothPrompterTick(state.masterTime);
      var el = document.getElementById('booth-elapsed');
      if (el) el.textContent = fmtTime(state.masterTime) + ' / ' + fmtTime(state.totalDuration) + (buffering ? ' · buffering…' : '');
    }, 250);
    boothPrompterTick(0);
  }

  function boothRecCard(paused) {
    var hasCam = booth.stream && booth.stream.getVideoTracks().length > 0;
    boothCard(
      (paused
        ? '<h3>&#9208; Paused</h3><p class="booth-live" id="booth-elapsed"></p>' +
          '<p>Recording is paused with the film. Press play (or Resume) and both continue together. Don\\'t scrub the timeline &mdash; the take is glued to the film clock.</p>'
        : '<h3><span class="booth-dot"></span> Recording</h3><p class="booth-live" id="booth-elapsed"></p>' +
          '<p>Speak as you watch. Pause the film to catch your breath &mdash; the recording pauses with it. The take ends itself when the film does.</p>') +
      (hasCam ? '<video id="booth-selfview" muted autoplay playsinline style="width:100%;border-radius:10px;margin:4px 0 8px;transform:scaleX(-1);"></video>' : '') +
      (paused
        ? '<div class="booth-row"><button class="btn btn-primary" id="booth-resume">&#9205; Resume</button>' +
          '<button class="btn btn-secondary" id="booth-stop">&#9209; Finish take</button></div>'
        : '<div class="booth-row"><button class="btn btn-secondary" id="booth-stop">&#9209; Stop</button></div>')
    );
    var sv = document.getElementById('booth-selfview');
    if (sv) { try { sv.srcObject = booth.stream; } catch (eSV) {} }
    var rs = document.getElementById('booth-resume');
    if (rs) rs.addEventListener('click', function() { if (!state.playing) togglePlay(); });
    document.getElementById('booth-stop').addEventListener('click', boothStopTake);
    var el = document.getElementById('booth-elapsed');
    if (el) el.textContent = fmtTime(state.masterTime) + ' / ' + fmtTime(state.totalDuration);
  }

  function boothStopTake() {
    if (booth.phase !== 'recording') return;
    booth.phase = 'review';
    els.slider.disabled = false;
    if (booth.mon) { clearInterval(booth.mon); booth.mon = null; }
    document.getElementById('prompter-bar').style.display = 'none';
    if (state.playing) togglePlay();
    boothMute(false);
    try { booth.rec.stop(); } catch (e) { boothReview(); }
  }

  function boothReview() {
    if (booth.phase !== 'review') return;
    var camTake = booth.stream && booth.stream.getVideoTracks().length > 0;
    booth.blob = new Blob(booth.chunks, { type: camTake ? 'video/webm' : 'audio/webm' });
    if (booth.url) URL.revokeObjectURL(booth.url);
    booth.url = URL.createObjectURL(booth.blob);
    boothCard(
      '<h3>&#127908; Take recorded (' + fmtTime(state.masterTime) + ' of film covered)</h3>' +
      (booth.desynced ? '<p style="color:#b45309;">&#9888; The timeline was scrubbed mid-take, so voice and picture may be out of step &mdash; listen before using, or retake.</p>' : '') +
      (camTake
        ? '<video id="booth-take-el" controls playsinline src="' + booth.url + '" style="width:100%;border-radius:10px;margin:8px 0 2px;"></video>'
        : '<audio id="booth-take-el" controls src="' + booth.url + '"></audio>') +
      '<p id="booth-drift-warn" style="display:none;color:#b45309;font-size:11px;"></p>' +
      '<div class="booth-row"><button class="btn btn-primary" id="booth-use">Use this take</button>' +
      '<button class="btn btn-secondary" id="booth-retake">Retake</button>' +
      '<button class="btn btn-secondary" id="booth-discard">Discard</button></div>'
    );
    // Measure the take against the film clock it was recorded over: a take
    // materially LONGER than the film time covered means clock drift (e.g.
    // buffering the recorder didn't catch) and every later word will play
    // late. Warn before it gets attached.
    (function() {
      var el = document.getElementById('booth-take-el');
      var covered = state.masterTime || 0;
      if (!el || !(covered > 1)) return;
      el.addEventListener('loadedmetadata', function() {
        var drift = (isFinite(el.duration) ? el.duration : 0) - covered;
        if (drift > 1.5) {
          var w = document.getElementById('booth-drift-warn');
          if (w) {
            w.style.display = '';
            w.textContent = '⚠ This take is ' + drift.toFixed(1) + 's longer than the film it covered — playback stalled while the mic rolled, so later words will land late. A retake is recommended.';
          }
        }
      });
    })();
    document.getElementById('booth-use').addEventListener('click', boothUpload);
    document.getElementById('booth-retake').addEventListener('click', function() { boothCountdown(3); });
    document.getElementById('booth-discard').addEventListener('click', boothClose);
  }

  function boothUpload() {
    var p = state.currentProject;
    if (!p || !booth.blob) return;
    booth.phase = 'uploading';
    // Two legs with different truths: the UPLOAD has a real percentage (XHR
    // upload progress on a known blob size); the server work (whisper
    // transcription + captions + chapters) does not, so it gets the elapsed
    // clock + staged messages + sweep. A dropped connection mid-server-work
    // is survivable -- the attach completes and saves, so we poll the
    // project for the new voiceover before calling it failed.
    var t0 = Date.now();
    var t0iso = new Date().toISOString();
    var totalMB = booth.blob.size / 1048576;
    var uploaded = false;
    boothCard(
      '<h3>&#127908; Attaching narration&hellip; <span id="booth-att-timer" style="font-variant-numeric:tabular-nums;color:#6366f1;">0:00</span></h3>' +
      '<p id="booth-att-stage">Uploading the take&hellip; 0% of ' + totalMB.toFixed(1) + ' MB</p>' +
      '<div class="booth-draft-bar"><div class="booth-draft-fill" id="booth-att-fill"></div></div>' +
      '<p style="font-size:10px;color:#9ca3af;margin-top:6px;">Transcription runs on the server &mdash; long takes take a few minutes.</p>'
    );
    var tick = setInterval(function() {
      if (booth.phase !== 'uploading') { clearInterval(tick); return; }
      var timer = document.getElementById('booth-att-timer');
      if (!timer) { clearInterval(tick); return; }
      var s = Math.floor((Date.now() - t0) / 1000);
      timer.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      if (uploaded) {
        var stage = document.getElementById('booth-att-stage');
        if (stage) stage.textContent =
          s < 90 ? 'Transcribing the take and building captions + chapter cards…'
          : s < 210 ? 'Still transcribing — longer takes take longer…'
          : 'Almost there…';
      }
    }, 1000);
    function attachedCard(summary) {
      clearInterval(tick);
      booth.phase = 'done';
      boothCard(
        '<h3>&#10003; Narration attached</h3>' +
        '<p>' + escHtml(summary || 'Done.') + '</p>' +
        '<div class="booth-row"><button class="btn btn-primary" id="booth-done">Close</button></div>'
      );
      document.getElementById('booth-done').addEventListener('click', boothClose);
      // The pre-attach transcript fetch cached "nothing to transcribe" for
      // this project, and the once-per-project gate would block the refetch
      // -- the take just CREATED the transcript, so drop the gate or the
      // word lane stays empty until a hard reload.
      state._transcriptFor = null;
      state._transcript = null;
      // Reload so the captions overlay, audio lanes and spine show up.
      loadProject(p.project_id);
    }
    function failedCard(msg) {
      clearInterval(tick);
      booth.phase = 'review';
      boothCard(
        '<h3>Upload failed</h3><p>' + escHtml(msg) + '</p>' +
        '<div class="booth-row"><button class="btn btn-primary" id="booth-use">Retry</button>' +
        '<button class="btn btn-secondary" id="booth-discard">Discard</button></div>'
      );
      document.getElementById('booth-use').addEventListener('click', boothUpload);
      document.getElementById('booth-discard').addEventListener('click', boothClose);
    }
    function recover(errMsg) {
      // The server keeps attaching after a transport cut; look for its result.
      var stage0 = document.getElementById('booth-att-stage');
      if (stage0) stage0.textContent = 'Connection hiccup — the server may still be attaching, checking for the result…';
      var polls = 0;
      var poll = setInterval(function() {
        polls++;
        api('/projects/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id)).then(function(r) {
          var proj = r.project || r;
          var hasVo = ((proj.audio || {}).tracks || []).some(function(t) { return t.type === 'voiceover'; });
          if (hasVo && proj.updated_at > t0iso) { clearInterval(poll); attachedCard('Narration attached (recovered after a connection drop).'); }
          else if (polls >= 18) { clearInterval(poll); failedCard(errMsg); }
        }).catch(function() { if (polls >= 18) { clearInterval(poll); failedCard(errMsg); } });
      }, 10000);
    }
    var name = 'booth-take-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
    var url = withToken('/api/booth-narration/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id) + '?name=' + encodeURIComponent(name));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (_token) xhr.setRequestHeader('Authorization', 'Bearer ' + _token);
    xhr.upload.onprogress = function(e) {
      if (!e.lengthComputable || uploaded) return;
      var pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
      var stage = document.getElementById('booth-att-stage');
      if (stage) stage.textContent = 'Uploading the take… ' + pct + '% of ' + totalMB.toFixed(1) + ' MB';
      // Determinate bar while the percentage is real; sweep resumes after.
      var fill = document.getElementById('booth-att-fill');
      if (fill) { fill.style.animation = 'none'; fill.style.left = '0'; fill.style.width = pct + '%'; }
    };
    xhr.upload.onload = function() {
      uploaded = true;
      var fill = document.getElementById('booth-att-fill');
      if (fill) { fill.style.animation = ''; fill.style.left = ''; fill.style.width = ''; }
    };
    xhr.onload = function() {
      var j = null;
      try { j = JSON.parse(xhr.responseText); } catch (e2) {}
      if (xhr.status >= 200 && xhr.status < 300 && j && j.ok) attachedCard(j.summary);
      else if (xhr.status >= 500 || xhr.status === 0) recover((j && j.error) || ('HTTP ' + xhr.status));
      else failedCard((j && j.error) || ('HTTP ' + xhr.status));
    };
    xhr.onerror = function() { recover('network error during attach'); };
    xhr.send(booth.blob);
  }

  var boothBtn = document.getElementById('booth-btn');
  if (boothBtn) boothBtn.addEventListener('click', function() {
    if (booth.phase === 'closed') boothIdleCard();
    else if (booth.phase === 'idle' || booth.phase === 'done') boothClose();
  });

  // Global error handler - show errors visually
  window.addEventListener('error', function(e) {
    console.error('[preview] Uncaught error:', e.error || e.message);
    var banner = document.getElementById('error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'error-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 16px;font-size:13px;z-index:9999;font-family:monospace;cursor:pointer;';
      banner.onclick = function() { banner.remove(); };
      document.body.appendChild(banner);
    }
    banner.textContent = 'Error: ' + (e.message || 'Unknown') + ' (line ' + e.lineno + ')';
  });

  // ── Boot: who am I, and whose projects load? ──
  // Share links still carry ?tenant= (+ ?token=) and win when present.
  // A BARE /studio resolves the tenant from the login session (/auth/me,
  // cookie-authenticated); signed out -> bounce through Google and back.
  function showUserChip(me) {
    var chip = document.getElementById('user-chip');
    if (!chip || !me) return;
    document.getElementById('user-email').textContent = me.email || '';
    var pic = document.getElementById('user-pic');
    if (me.picture) { pic.src = me.picture; pic.style.display = 'inline-block'; }
    chip.style.display = 'inline-flex';
  }
  var params = new URLSearchParams(window.location.search);
  var tenantParam = params.get('tenant');
  if (tenantParam) {
    state.tenantId = tenantParam;
    loadProjects();
    fetch('/auth/me').then(function(r) { return r.ok ? r.json() : null; })
      .then(showUserChip).catch(function() {});
  } else {
    fetch('/auth/me').then(function(r) {
      if (!r.ok) throw new Error('signed out');
      return r.json();
    }).then(function(me) {
      state.tenantId = me.tenant_id;
      showUserChip(me);
      loadProjects();
    }).catch(function() {
      window.location.href = '/auth/google/login?return_to=' +
        encodeURIComponent(window.location.pathname + window.location.search);
    });
  }

  // ─────────────────────────────────────────────
  // Studio: element selection + direct-manipulation revise
  // ─────────────────────────────────────────────
  var studio = { sel: null, scope: 'element', busy: false, sb: { purpose: '', script: '', visual_notes: '', duration_seconds: '', broll_query: '', hero_image: '', components: [], beats: [], quality: null } };

  function studioCurrentSceneId() {
    var p = state.currentProject, i = state.currentSceneIndex;
    if (p && p.scenes && p.scenes[i]) return p.scenes[i].id;
    return null;
  }

  // Walk up from a clicked element to gather scene id + component context.
  function studioContextOf(el, doc) {
    var sceneId = null, compType = null, compId = null, node = el;
    while (node && node !== doc.body) {
      if (node.getAttribute) {
        if (!sceneId) { var s = node.getAttribute('data-scene-id'); if (s) sceneId = s; }
        if (!compType) { var t = node.getAttribute('data-comp-type'); if (t) compType = t; }
        if (!compId) { var c = node.getAttribute('data-comp-id'); if (c) compId = c; }
        // Assembled component wrappers carry data-cid, namespaced
        // "sceneId__compId" in the composite -- without reading it the
        // selection never knew WHICH component was clicked (the camera
        // bubble's placement controls never appeared; label read "div").
        if (!compId) { var c1 = node.getAttribute('data-cid'); if (c1) compId = c1; }
      }
      node = node.parentElement;
    }
    if (!sceneId) sceneId = studioCurrentSceneId();
    if (compId && sceneId && compId.indexOf(sceneId + '__') === 0) compId = compId.slice(sceneId.length + 2);
    if (compId && !compType) {
      // The wrapper has no type attr; recover it from project data so the
      // selection label names the component, not its inner div.
      var p0 = state.currentProject;
      (p0 && p0.scenes || []).forEach(function(s0) {
        if (s0.id !== sceneId) return;
        (s0.components || []).forEach(function(c0) { if (c0.id === compId) compType = c0.type; });
      });
    }
    var cls = (el.className && typeof el.className === 'string') ? el.className.split(/\\s+/).filter(Boolean) : [];
    return {
      sceneId: sceneId, compType: compType, compId: compId,
      tagName: (el.tagName || '').toLowerCase(), classList: cls,
      text: (el.textContent || '').trim().slice(0, 80),
      outerHTMLSnippet: (el.outerHTML || '').slice(0, 600),
      _el: el, _doc: doc
    };
  }

  // Geometric hit-test: find the smallest VISIBLE element under (x,y), ignoring
  // pointer-events (captions over b-roll set pointer-events:none, so native
  // hit-testing falls through to the full-bleed <video>). Strongly prefers an
  // element that directly holds text, so hovering a caption word selects the word.
  function studioHitTest(doc, x, y) {
    var win = doc.defaultView || window;
    var all = doc.querySelectorAll('body *');
    var best = null, bestScore = Infinity;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === '__studio_hi' || el.id === '__studio_busy') continue;
      if (el.getAttribute && el.getAttribute('data-scene-id') != null) continue; // scene root, too broad
      var cs;
      try { cs = win.getComputedStyle(el); } catch (e) { continue; }
      if (!cs || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      var hasOwnText = false;
      for (var n = 0; n < el.childNodes.length; n++) {
        if (el.childNodes[n].nodeType === 3 && (el.childNodes[n].textContent || '').trim()) { hasOwnText = true; break; }
      }
      var score = (r.width * r.height) - (hasOwnText ? 1e12 : 0); // text-bearing wins; else smallest area
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  // Attach hover/click/right-click selection to the (same-origin) iframe document.
  function studioAttach(doc) {
    if (!doc || !doc.body) return;
    // Idempotent: document.write reuses the SAME document object across reloads,
    // so a one-shot guard flag would persist while the body (and our overlay
    // boxes) get wiped -- leaving the scene unselectable after a revise/regen.
    // Tear down any prior wiring and rebuild against the fresh body every time.
    try {
      var prev = doc.__studioHandlers;
      if (prev) {
        doc.removeEventListener('mousemove', prev.move, true);
        doc.removeEventListener('mouseleave', prev.leave, true);
        doc.removeEventListener('click', prev.click, true);
        doc.removeEventListener('contextmenu', prev.ctx, true);
        if (prev.down) doc.removeEventListener('mousedown', prev.down, true);
        if (prev.dragmove) doc.removeEventListener('mousemove', prev.dragmove, true);
        if (prev.up) doc.removeEventListener('mouseup', prev.up, true);
        if (prev.dragstart) doc.removeEventListener('dragstart', prev.dragstart, true);
        if (prev.key) doc.removeEventListener('keydown', prev.key, true);
      }
    } catch (e) {}
    try { var oh = doc.getElementById('__studio_hi'); if (oh) oh.remove(); } catch (e) {}
    try { var os = doc.getElementById('__studio_sel'); if (os) os.remove(); } catch (e) {}
    try { var om = doc.getElementById('__studio_mq'); if (om) om.remove(); } catch (e) {}
    studio.dragBox = null;
    studio.panMode = false; // a fresh preview never inherits an armed pan-drag
    studio.panInside = null;

    // Make it obvious the scene is clickable for revising.
    try { doc.body.style.cursor = 'crosshair'; } catch(e) {}
    function boxRect(el) {
      var r = el.getBoundingClientRect();
      var sx = (doc.documentElement.scrollLeft || doc.body.scrollLeft || 0);
      var sy = (doc.documentElement.scrollTop || doc.body.scrollTop || 0);
      return { left: r.left + sx, top: r.top + sy, w: r.width, h: r.height };
    }
    // Hover box (dashed, light)
    var hi = doc.createElement('div');
    hi.id = '__studio_hi';
    hi.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483646;border:2px dashed #818cf8;border-radius:4px;background:rgba(99,102,241,0.07);display:none;box-sizing:border-box;';
    doc.body.appendChild(hi);
    // Persistent SELECTION box (solid + glow + label) -- stays on the clicked element
    var selb = doc.createElement('div');
    selb.id = '__studio_sel';
    selb.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483645;border:2px solid #6366f1;border-radius:4px;background:rgba(99,102,241,0.10);box-shadow:0 0 0 2px rgba(99,102,241,0.25),0 0 14px rgba(99,102,241,0.35);display:none;box-sizing:border-box;';
    var selLabel = doc.createElement('div');
    selLabel.style.cssText = 'position:absolute;top:-21px;left:-2px;max-width:320px;overflow:hidden;text-overflow:ellipsis;padding:1px 7px;font:600 11px sans-serif;color:#fff;background:#6366f1;border-radius:4px;white-space:nowrap;';
    selb.appendChild(selLabel);
    doc.body.appendChild(selb);
    studio.hoverBox = hi; studio.selBox = selb; studio.selLabel = selLabel; studio.boxRect = boxRect; studio.boxDoc = doc;

    function showHi(el) {
      var b = boxRect(el);
      hi.style.left = b.left + 'px'; hi.style.top = b.top + 'px';
      hi.style.width = b.w + 'px'; hi.style.height = b.h + 'px';
      hi.style.display = 'block';
    }
    var _lastMove = 0;
    function onMove(e) {
      if (studio.busy) return;
      var now = +new Date(); if (now - _lastMove < 30) return; _lastMove = now;
      var el = studioHitTest(doc, e.clientX, e.clientY);
      if (el) showHi(el); else hi.style.display = 'none';
      studioPositionSel();
    }
    function onLeave() { hi.style.display = 'none'; }
    // Drag = draw a zoom region (Figma convention: click selects, drag draws).
    // Captured here because mouse events over the preview land in the iframe's
    // document and never reach the parent page.
    var drag = null;
    function marqueeEl() {
      if (!studio.dragBox || !studio.dragBox.isConnected) {
        var mq = doc.createElement('div');
        mq.id = '__studio_mq';
        mq.style.cssText = 'position:absolute;z-index:2147483646;border:2px solid #6366f1;background:rgba(99,102,241,0.12);border-radius:4px;pointer-events:none;display:none;';
        doc.body.appendChild(mq);
        studio.dragBox = mq;
      }
      return studio.dragBox;
    }
    studio.dragCancel = function() {
      if (drag && drag.pan) { try { drag.pan.el.style.transform = drag.pan.o; } catch (eC) {} }
      if (studio.panMode || (drag && drag.pan)) {
        studio.panMode = false;
        studio.panInside = null;
        try { doc.body.style.cursor = 'crosshair'; } catch (eC2) {}
      }
      drag = null;
      studio.pendingInside = null;
      if (studio.dragBox) studio.dragBox.style.display = 'none';
    };
    // ── Pan-drag support: grab the picture, drag it where the camera should
    // look. Feedback rides the real camera rig when the scene has one;
    // otherwise the scene root stands in (close enough for feedback -- the
    // save reloads the preview through the true rig either way). ──
    function panTargetEl() {
      // The SCENE rig specifically -- an in-video content rig must not
      // stand in for the whole-scene camera.
      var rigEl = doc.querySelector('.__mp_camera_rig:not(.__mp_camera_rig--content)');
      if (rigEl) return rigEl;
      var sid = studioCurrentSceneId();
      var sc = sid ? doc.querySelector('.mp-scene[data-scene-id="' + sid + '"]') : null;
      return sc || doc.body;
    }
    // Pan-inside: the content rig wrapping the targeted video's footage.
    // Exists only once an inside-zoom has run in this scene -- which is
    // also the only state where panning inside means anything.
    function panInsideRig(target) {
      var v = null;
      if (target && target !== 'screencast') {
        try { v = doc.querySelector(target); } catch (eR) {}
      }
      if (!v) {
        var best = 0;
        Array.prototype.slice.call(doc.querySelectorAll('video')).forEach(function(vv) {
          if (vv.id === '__mp_speaker_base') return;
          var r = vv.getBoundingClientRect();
          if (r.width * r.height > best) { best = r.width * r.height; v = vv; }
        });
      }
      if (!v || !v.closest) return null;
      return v.closest('.__mp_camera_rig--content');
    }
    function readXf(el) {
      // Current translate/scale. GSAP's own reader first (it parses every
      // serialization, including the matrix3d form transforms take during
      // playback); computed-matrix parsing as the fallback.
      try {
        var g = doc.defaultView && doc.defaultView.gsap;
        if (g && g.getProperty) {
          return { s: parseFloat(g.getProperty(el, 'scaleX')) || 1,
            x: parseFloat(g.getProperty(el, 'x')) || 0,
            y: parseFloat(g.getProperty(el, 'y')) || 0 };
        }
      } catch (eG) {}
      var tr = '';
      try { tr = getComputedStyle(el).transform || ''; } catch (eX) {}
      var mm = /^matrix\(([^)]+)\)/.exec(tr);
      if (mm) {
        var v = mm[1].split(',').map(parseFloat);
        return { s: v[0] || 1, x: v[4] || 0, y: v[5] || 0 };
      }
      var m3 = /^matrix3d\(([^)]+)\)/.exec(tr);
      if (m3) {
        var v3 = m3[1].split(',').map(parseFloat);
        return { s: v3[0] || 1, x: v3[12] || 0, y: v3[13] || 0 };
      }
      return { s: 1, x: 0, y: 0 };
    }
    // The zoom IN FORCE at a scene-local time, read from the DATA -- the
    // DOM only shows the current instant, and a pan grabbed right where a
    // zoom block STARTS (Marc's case: playhead at the zoom's own at) finds
    // a still-wide rig even though the author's intent is "pan inside that
    // zoom". Window = ease-in ramp + hold (+ ease-out when returning, or
    // until the next move / scene end when open-ended).
    function zoomInForceAt(sceneD, t) {
      var best = null;
      var mvs = (sceneD && sceneD.camera_moves) || [];
      mvs.forEach(function(m) {
        if (m.type !== 'zoom') return;
        var ez = m.duration != null ? Number(m.duration) : 1;
        var end;
        if (m['return']) end = (m.at || 0) + ez + (m.hold != null ? Number(m.hold) : 0) + ez;
        else {
          var nxt = null;
          mvs.forEach(function(n) { if (n !== m && (n.at || 0) > (m.at || 0) + 0.01 && (!nxt || (n.at || 0) < (nxt.at || 0))) nxt = n; });
          end = nxt ? (nxt.at || 0) : (sceneD.duration_seconds || 5);
        }
        // A beat of pre-window: grabbing just before the block still means
        // "pan that zoom" (the saved pan is nudged to after it settles).
        if (t >= (m.at || 0) - 0.75 && t < end - 0.1) {
          if (!best || (m.at || 0) >= (best.at || 0)) best = m;
        }
      });
      return best;
    }
    function zoomSettledScale(zm, boxW, boxH) {
      if (zm.scale) return zm.scale;
      if (zm.w && zm.h) {
        var cwS = parseInt(els.previewIframe.width, 10) || 1920;
        var chS = parseInt(els.previewIframe.height, 10) || 1080;
        var bw = (zm.w / 100) * cwS, bh = (zm.h / 100) * chS;
        return Math.max(1.05, Math.min(5, Math.min((boxW || cwS) / bw, (boxH || chS) / bh)));
      }
      return 2;
    }
    function insideSpecFor(rigEl) {
      var v = rigEl && rigEl.querySelector && rigEl.querySelector('video');
      return v ? { target: videoTargetFor(v), label: videoLabelFor(v) } : null;
    }
    // The camera bubble is DIRECTLY draggable -- grabbing it moves the
    // bubble instead of drawing a zoom marquee.
    function bubbleWrapOf(t) {
      var el = t && t.closest ? t.closest('.mp-component') : null;
      var cid = el && (el.getAttribute('data-cid') || '');
      return (el && /(?:^|__)(?:camera|booth)_pip$/.test(cid)) ? el : null;
    }
    function onDown(e) {
      if (studio.busy || e.button !== 0) return;
      if (studio.panMode) {
        // What is pannable here? Resolved in priority order -- the lane's
        // DATA outranks the DOM's current instant, because a grab right at
        // a zoom block's start (Marc's case) finds a still-wide rig even
        // though the intent is plainly "pan inside that zoom":
        //   1. a zoom whose ease-in ramp covers the playhead -> ride it
        //      (preview jumps to its settled framing; the saved pan starts
        //      once the zoom settles, so the two run parallel)
        //   2. the rig the button asked for, magnified NOW
        //   3. the other rig, magnified now ("pan what I see")
        //   4. a settled zoom window from the data (DOM read misfired)
        //   5. nothing -> honest refusal.
        var wIn = studio.panInside || null;
        var sceneG = currentSceneEntry();
        var tG = (state.masterTime || 0) - sceneStartFor(state.currentSceneIndex);
        var cwG = parseInt(els.previewIframe.width, 10) || 1920;
        var chG = parseInt(els.previewIframe.height, 10) || 1080;
        var pick = null;
        var zm = sceneG ? zoomInForceAt(sceneG, tG) : null;
        var zmEase = zm ? (zm.duration != null ? Number(zm.duration) : 1) : 0;
        var zmRamp = !!(zm && tG < (zm.at || 0) + zmEase + 0.05);
        var rideZoom = function() {
          var el3 = null, box3 = null, in3 = null;
          if (zm.target) {
            el3 = panInsideRig(zm.target);
            if (!el3) return null;
            in3 = { target: zm.target, label: '' };
            try { box3 = el3.parentElement.getBoundingClientRect(); } catch (eZ0) {}
          } else {
            el3 = panTargetEl();
            if (!el3) return null;
          }
          var s3 = zoomSettledScale(zm, box3 && box3.width, box3 && box3.height);
          var fx3 = ((zm.x != null ? zm.x : 50) / 100) * cwG;
          var fy3 = ((zm.y != null ? zm.y : 50) / 100) * chG;
          var tx3, ty3;
          if (in3 && box3) {
            var px3 = Math.max(0, Math.min(1, (fx3 - box3.left) / (box3.width || 1)));
            var py3 = Math.max(0, Math.min(1, (fy3 - box3.top) / (box3.height || 1)));
            tx3 = (0.5 - px3) * box3.width * s3;
            ty3 = (0.5 - py3) * box3.height * s3;
          } else {
            tx3 = (0.5 - fx3 / cwG) * cwG * s3;
            ty3 = (0.5 - fy3 / chG) * chG * s3;
            var mx3 = (s3 - 1) * cwG / 2, my3 = (s3 - 1) * chG / 2;
            tx3 = Math.max(-mx3, Math.min(mx3, tx3));
            ty3 = Math.max(-my3, Math.min(my3, ty3));
          }
          return { el: el3, s: s3, x: tx3, y: ty3, inside: in3, box: box3, afterZoom: zm, jump: true,
            note: (in3 ? '⊕ Panning the footage inside the zoom at ' : '↔ Panning inside the zoom at ') + (zm.at || 0).toFixed(1) + 's — the pan starts once it settles.' };
        };
        if (zm && zmRamp) pick = rideZoom();
        if (!pick) {
          var aEl = wIn ? panInsideRig(wIn.target) : panTargetEl();
          var aXf = aEl ? readXf(aEl) : { s: 1, x: 0, y: 0 };
          if (aEl && aXf.s > 1.05) {
            var aBox = null;
            if (wIn) { try { aBox = aEl.parentElement.getBoundingClientRect(); } catch (eA0) {} }
            pick = { el: aEl, s: aXf.s, x: aXf.x, y: aXf.y, inside: wIn, box: aBox, note: '' };
          }
        }
        if (!pick) {
          var bEl = wIn ? panTargetEl() : doc.querySelector('.__mp_camera_rig--content');
          var bXf = bEl ? readXf(bEl) : { s: 1, x: 0, y: 0 };
          if (bEl && bXf.s > 1.05) {
            var bIn = wIn ? null : insideSpecFor(bEl);
            if (wIn || bIn) {
              var bBox = null;
              if (bIn) { try { bBox = bEl.parentElement.getBoundingClientRect(); } catch (eB0) {} }
              pick = { el: bEl, s: bXf.s, x: bXf.x, y: bXf.y, inside: bIn, box: bBox,
                note: wIn ? '↔ That zoom is a scene zoom — panning the scene camera instead.'
                  : '⊕ The scene camera is wide but the footage is magnified — panning inside the frame instead.' };
            }
          }
        }
        if (!pick && zm) pick = rideZoom();
        // Pan NEVER zooms: it slides the camera at its current zoom. With
        // nothing zoomed now and no zoom block here, there is nowhere to
        // pan -- say so honestly instead of faking it.
        if (!pick) {
          studio.panMode = false;
          studio.panInside = null;
          try { doc.body.style.cursor = 'crosshair'; } catch (eD0) {}
          studioStatus(wIn
            ? '⊕ Nothing is magnified here and no zoom covers the playhead — Zoom inside… first (or scrub onto a zoom block), then pan.'
            : '↔ The camera is wide — it already sees everything, so there is nothing to pan. Add a zoom (or scrub onto a zoom block), then drag.', 'warn');
          return;
        }
        studio.panInside = null;
        drag = { x0: e.clientX, y0: e.clientY, moved: false,
          pan: { el: pick.el, s: pick.s, x: pick.x, y: pick.y, cx: pick.x, cy: pick.y,
            o: pick.el.style.transform || '', inside: pick.inside, box: pick.box, afterZoom: pick.afterZoom || null } };
        if (pick.jump) {
          try { pick.el.style.transform = 'translate(' + pick.x.toFixed(1) + 'px, ' + pick.y.toFixed(1) + 'px) scale(' + pick.s + ')'; } catch (eJ) {}
        }
        if (pick.note) studioStatus(pick.note, '');
        e.preventDefault();
        try { doc.body.style.cursor = 'grabbing'; } catch (eD) {}
        return;
      }
      var bw = bubbleWrapOf(e.target);
      drag = { x0: e.clientX, y0: e.clientY, moved: false, bub: bw,
        bubLeft: bw ? bw.offsetLeft : 0, bubTop: bw ? bw.offsetTop : 0 };
    }
    function onDragMove(e) {
      if (!drag) return;
      if (drag.pan) {
        drag.moved = true;
        e.preventDefault();
        hi.style.display = 'none';
        var cwD = parseInt(els.previewIframe.width, 10) || 1920;
        var chD = parseInt(els.previewIframe.height, 10) || 1080;
        // Grab-the-world: the picture follows the cursor. Iframe-interior
        // pixels ARE canvas pixels (the iframe's viewport is the canvas).
        var nx = drag.pan.x + (e.clientX - drag.x0);
        var ny = drag.pan.y + (e.clientY - drag.y0);
        if (drag.pan.inside) {
          // Inside a frame the crop masks the motion; clamp to the
          // footage's own travel so the drag can't slide it out of view.
          var bW = (drag.pan.box && drag.pan.box.width) || cwD;
          var bH = (drag.pan.box && drag.pan.box.height) || chD;
          var mxI = (drag.pan.s - 1) * bW / 2, myI = (drag.pan.s - 1) * bH / 2;
          nx = Math.max(-mxI, Math.min(mxI, nx));
          ny = Math.max(-myI, Math.min(myI, ny));
        } else {
          // Live cover-clamp: the drag can't expose the canvas edge.
          var mxD = (drag.pan.s - 1) * cwD / 2, myD = (drag.pan.s - 1) * chD / 2;
          nx = Math.max(-mxD, Math.min(mxD, nx));
          ny = Math.max(-myD, Math.min(myD, ny));
        }
        drag.pan.cx = nx; drag.pan.cy = ny;
        drag.pan.el.style.transform = 'translate(' + nx.toFixed(1) + 'px, ' + ny.toFixed(1) + 'px) scale(' + drag.pan.s + ')';
        return;
      }
      var w = Math.abs(e.clientX - drag.x0), h = Math.abs(e.clientY - drag.y0);
      if (drag.bub) {
        if (!drag.moved && w + h < 6) return;
        if (!drag.moved) { rvPopClose(); try { drag.bub.style.right = 'auto'; drag.bub.style.bottom = 'auto'; } catch (e2) {} }
        drag.moved = true;
        e.preventDefault();
        hi.style.display = 'none';
        drag.bub.style.left = (drag.bubLeft + (e.clientX - drag.x0)) + 'px';
        drag.bub.style.top = (drag.bubTop + (e.clientY - drag.y0)) + 'px';
        return;
      }
      if (!drag.moved && w + h < 10) return;
      if (!drag.moved) rvPopClose(); // marquee takes over; don't stack popovers
      drag.moved = true;
      e.preventDefault();
      hi.style.display = 'none';
      var mq = marqueeEl();
      mq.style.display = 'block';
      mq.style.left = Math.min(drag.x0, e.clientX) + 'px';
      mq.style.top = Math.min(drag.y0, e.clientY) + 'px';
      mq.style.width = w + 'px';
      mq.style.height = h + 'px';
    }
    function onUp(e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.pan) {
        studio.panMode = false;
        studio.panInside = null;
        try { doc.body.style.cursor = 'crosshair'; } catch (eU) {}
        if (!d.moved) {
          // A click without a drag places nothing -- the gesture IS the drag.
          try { d.pan.el.style.transform = d.pan.o; } catch (eU2) {}
          studioStatus('Pan needs a DRAG — click Pan again, then grab the picture and pull it.', 'warn');
          return;
        }
        studio._justDragged = +new Date();
        var sceneU = currentSceneEntry();
        var siU = state.currentSceneIndex;
        if (!sceneU) { try { d.pan.el.style.transform = d.pan.o; } catch (eU3) {} return; }
        var cwU = parseInt(els.previewIframe.width, 10) || 1920;
        var chU = parseInt(els.previewIframe.height, 10) || 1080;
        // Final framing -> focal point: rig x = (0.5 - fx) * W * s, where W
        // is the rig's own box (the canvas for scene pans, the frame's clip
        // box for inside pans -- focal is stored as canvas % either way).
        var fxU, fyU;
        if (d.pan.inside && d.pan.box) {
          var bWU = d.pan.box.width || cwU, bHU = d.pan.box.height || chU;
          fxU = Math.round(((d.pan.box.left + (0.5 - (d.pan.cx || 0) / (bWU * d.pan.s)) * bWU) / cwU) * 100);
          fyU = Math.round(((d.pan.box.top + (0.5 - (d.pan.cy || 0) / (bHU * d.pan.s)) * bHU) / chU) * 100);
        } else {
          fxU = Math.round((0.5 - (d.pan.cx || 0) / (cwU * d.pan.s)) * 100);
          fyU = Math.round((0.5 - (d.pan.cy || 0) / (chU * d.pan.s)) * 100);
        }
        var sdU = sceneU.duration_seconds || 5;
        var atU = Math.round(Math.max(0, Math.min(sdU - 0.2, (state.masterTime || 0) - sceneStartFor(siU))) * 10) / 10;
        if (d.pan.afterZoom) {
          // Riding a zoom grabbed during its ramp: start the pan once the
          // zoom settles so the two run parallel instead of fighting.
          var zU = d.pan.afterZoom;
          var setU = (zU.at || 0) + (zU.duration != null ? Number(zU.duration) : 1) + 0.1;
          atU = Math.round(Math.max(atU, Math.min(sdU - 0.2, setU)) * 10) / 10;
        }
        // No scale on the saved move -- a pan is pure translation at the
        // camera's zoom when it fires; scale is never written.
        var mvU = { at: atU, type: 'pan', x: Math.max(0, Math.min(100, fxU)), y: Math.max(0, Math.min(100, fyU)), duration: 0.9, hold: 1.5, 'return': true };
        if (d.pan.inside) mvU.target = d.pan.inside.target;
        var mvsU = (sceneU.camera_moves || []).slice();
        mvsU.push(mvU);
        studio.panInside = null;
        saveCameraMovesForScene(siU, mvsU);
        studioStatus((d.pan.inside ? '⊕ Pan inside added at ' : '↔ Pan added at ') + atU.toFixed(1) + 's — it slides at the camera’s zoom at that moment. Click its block to retime.', 'ok');
        return;
      }
      if (!d.moved) return; // plain click: onClick handles selection
      studio._justDragged = +new Date();
      if (d.bub) {
        bubbleCommitMove(d.bub.getAttribute('data-cid') || '',
          d.bubLeft + (e.clientX - d.x0), d.bubTop + (e.clientY - d.y0));
        return;
      }
      var w = Math.abs(e.clientX - d.x0), h = Math.abs(e.clientY - d.y0);
      if (w < 24 || h < 24) { studio.dragCancel(); return; } // too small to mean a zoom
      zoomConfirmOpen(doc, { left: Math.min(d.x0, e.clientX), top: Math.min(d.y0, e.clientY), width: w, height: h });
    }
    function onDragStart(e) { e.preventDefault(); }
    // Esc must work while focus sits inside the iframe (it usually does after
    // clicking the scene) -- the parent document's keydown never fires then.
    function onKey(e) {
      if (e.key === 'Escape') {
        studio.dragCancel();
        camPopClose();
        rvPopClose();
      }
    }
    function onClick(e) {
      // Swallow the click that follows a drag-release.
      if (studio._justDragged && (+new Date() - studio._justDragged) < 400) {
        e.preventDefault(); e.stopPropagation();
        return;
      }
      var el = studioHitTest(doc, e.clientX, e.clientY);
      if (!el) {
        // Nothing under the pointer: select the SCENE itself.
        var sid = studioCurrentSceneId();
        if (sid) el = doc.querySelector('.mp-scene[data-scene-id="' + sid + '"]');
      }
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      studioSelect(el, doc);
    }
    function onCtx(e) {
      var el = studioHitTest(doc, e.clientX, e.clientY);
      if (!el) return;
      e.preventDefault();
      studioSelect(el, doc);
      var ifr = els.previewIframe, rect = ifr.getBoundingClientRect();
      var sxr = rect.width / (ifr.width || 1920), syr = rect.height / (ifr.height || 1080);
      studioShowCtx(rect.left + e.clientX * sxr, rect.top + e.clientY * syr);
    }
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('mouseleave', onLeave, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('contextmenu', onCtx, true);
    doc.addEventListener('mousedown', onDown, true);
    doc.addEventListener('mousemove', onDragMove, true);
    doc.addEventListener('mouseup', onUp, true);
    doc.addEventListener('dragstart', onDragStart, true);
    doc.addEventListener('keydown', onKey, true);
    doc.__studioHandlers = { move: onMove, leave: onLeave, click: onClick, ctx: onCtx, down: onDown, dragmove: onDragMove, up: onUp, dragstart: onDragStart, key: onKey };
  }

  function studioSelect(el, doc) {
    studio.pendingInside = null; // new selection = new intent
    studio.panInside = null;
    studio.sel = studioContextOf(el, doc);
    var isScene = !!(el.getAttribute && el.getAttribute('data-scene-id') != null);
    studio.sel._isScene = isScene;
    var label, txt = '';
    if (isScene) {
      var sIdx = state.currentSceneIndex;
      var sEnt = currentSceneEntry();
      label = 'Scene ' + (sIdx >= 0 ? (sIdx + 1) : '');
      if (sEnt && sEnt.label) txt = ' \\u2014 "' + escHtml(String(sEnt.label).slice(0, 40)) + '"';
    } else {
      label = studio.sel.compType || studio.sel.tagName || 'element';
      txt = studio.sel.text ? ' \\u2014 "' + escHtml(studio.sel.text.slice(0, 40)) + '"' : '';
    }
    studio.sel._label = label;
    studio.sel._fullBleed = false;
    if (studio.selLabel) studio.selLabel.textContent = label + (!isScene && studio.sel.text ? ' \\u2014 ' + studio.sel.text.slice(0, 32) : '');
    // A near-full-canvas element (a full-bleed background wrapper) almost
    // always means "the scene" to the person clicking -- default the scope
    // accordingly; the toggle is still there to narrow it back.
    var fullBleed = false;
    if (!isScene && studio.sel._el) {
      try {
        var r0 = studio.sel._el.getBoundingClientRect();
        var cw0 = parseInt(els.previewIframe.width, 10) || 1920;
        var ch0 = parseInt(els.previewIframe.height, 10) || 1080;
        fullBleed = (r0.width * r0.height) >= 0.95 * cw0 * ch0;
      } catch (e) {}
    }
    studio.sel._fullBleed = fullBleed;
    studioSetScope(isScene || fullBleed ? 'scene' : 'element');
    studioPositionSel();
    rvPopShow();
  }

  // Speaker-bubble placement: corner presets + S/M/L sizes as canvas
  // percentages (16:9 box on the 16:9 canvas -> h% == w%). Keeps a bottom
  // margin so the bubble never sits on the caption band.
  function bubblePlace(compId, corner, size) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[state.currentSceneIndex];
    if (!p || !scene) return;
    var comp = null;
    (scene.components || []).forEach(function(c) { if (c.id === compId) comp = c; });
    if (!comp) return;
    var pos = comp.position || { x: '74%', y: '58%', width: '23%', height: '30%' };
    var w = parseFloat(pos.width) || 23;
    if (size) w = size === 'S' ? 15 : size === 'L' ? 30 : 22;
    // A circle bubble needs a square box in PIXELS: on the 16:9 canvas
    // that's h% = w% * 16/9. Other shapes keep the 16:9-ish box (h% == w%).
    var circ = comp.data && comp.data.shape === 'circle';
    var h = circ ? Math.round(w * (16 / 9) * 10) / 10 : w;
    var x = parseFloat(pos.x) || 74;
    var y = parseFloat(pos.y) || 58;
    if (corner) {
      x = (corner === 'tl' || corner === 'bl') ? 3 : 97 - w;
      y = (corner === 'tl' || corner === 'tr') ? 5 : 88 - h;
    } else {
      // Size-only change: keep the current corner's anchor edges.
      x = x > 50 ? 97 - w : 3;
      y = y > 40 ? 88 - h : 5;
    }
    comp.position = { x: x + '%', y: y + '%', width: w + '%', height: h + '%' };
    studioStatus('Placing bubble…', '');
    var patchPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    api('PATCH', patchPath, { position: comp.position }).then(function() {
      studioStatus('Bubble placed ✓ reloading preview…', 'ok');
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) {
      studioStatus('Bubble placement failed: ' + e.message, 'err');
    });
  }

  // Bubble shape: rect / rounded / circle. Writes component data through the
  // PATCH route; circle also squares the position box (see bubblePlace).
  function bubbleShape(compId, shape) {
    var p = state.currentProject;
    var scene = p && p.scenes && p.scenes[state.currentSceneIndex];
    if (!p || !scene) return;
    var comp = null;
    (scene.components || []).forEach(function(c) { if (c.id === compId) comp = c; });
    if (!comp) return;
    var pos = comp.position || { x: '74%', y: '58%', width: '23%', height: '30%' };
    var w = parseFloat(pos.width) || 23;
    var h = shape === 'circle' ? Math.round(w * (16 / 9) * 10) / 10 : w;
    var x = Math.max(0, Math.min(100 - w, parseFloat(pos.x) || 74));
    var y = Math.max(0, Math.min(88 - h, parseFloat(pos.y) || 58));
    comp.position = { x: x + '%', y: y + '%', width: w + '%', height: h + '%' };
    var data = shape === 'circle' ? { shape: 'circle' }
      : shape === 'rect' ? { shape: null, corner_radius: 0 }
      : { shape: null, corner_radius: 18 };
    comp.data = Object.assign({}, comp.data || {}, data);
    studioStatus('Reshaping bubble…', '');
    var patchPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    api('PATCH', patchPath, { data: data, position: comp.position }).then(function() {
      studioStatus('Bubble reshaped ✓ reloading preview…', 'ok');
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
    }).catch(function(e) {
      studioStatus('Bubble reshape failed: ' + e.message, 'err');
    });
  }

  // Commit a drag-placed bubble: wrapper px (canvas coordinates) -> position
  // percentages. No preview reload -- the wrapper is already where it landed.
  function bubbleCommitMove(cid, leftPx, topPx) {
    var p = state.currentProject;
    if (!p) return;
    var m = cid.match(/^(?:(.*)__)?((?:camera|booth)_pip)$/);
    var sceneId = m && m[1], compId = m ? m[2] : cid;
    var scene = null;
    (p.scenes || []).forEach(function(s) { if (s.id === sceneId) scene = s; });
    if (!scene) scene = p.scenes && p.scenes[state.currentSceneIndex];
    if (!scene) return;
    var comp = null;
    (scene.components || []).forEach(function(c) { if (c.id === compId) comp = c; });
    if (!comp) return;
    var cw = parseInt(els.previewIframe.width, 10) || 1920;
    var ch = parseInt(els.previewIframe.height, 10) || 1080;
    var pos = comp.position || { width: '23%', height: '30%' };
    var w = parseFloat(pos.width) || 23, h = parseFloat(pos.height) || 30;
    var x = Math.max(0, Math.min(100 - w, (leftPx / cw) * 100));
    var y = Math.max(0, Math.min(100 - h, (topPx / ch) * 100));
    comp.position = { x: Math.round(x * 10) / 10 + '%', y: Math.round(y * 10) / 10 + '%', width: w + '%', height: h + '%' };
    studioStatus('Placing bubble…', '');
    var patchPath = '/projects/' + state.tenantId + '/' + p.project_id + '/scenes/' + scene.id + '/components/' + compId;
    api('PATCH', patchPath, { position: comp.position }).then(function() {
      studioStatus('Bubble moved ✓', 'ok');
    }).catch(function(e) {
      studioStatus('Bubble move failed: ' + e.message, 'err');
    });
  }

  // ── Floating revise popover: opens next to the clicked element so surgical
  // revisions happen where you're looking, not in the bottom panel. ──
  function rvPopClose() {
    var pop = document.getElementById('rv-pop');
    if (pop) pop.style.display = 'none';
  }

  // Rebuilt on every show: the contents are contextual (element vs scene vs
  // media). No scope toggle -- what you clicked IS the scope: an element
  // revises that element, the scene (or a full-bleed wrapper) revises the
  // whole scene.
  function rvPopBuild(pop) {
    var sel = studio.sel;
    var isScene = !!(sel && (sel._isScene || sel._fullBleed));
    var keepText = '';
    var prevTa = document.getElementById('rv-pop-input');
    if (prevTa) keepText = prevTa.value || '';
    // Media selection: the element is (or wraps, or sits over) one of the
    // scene's videos -- offer the inside-that-video zoom too. Works for any
    // video in the scene (side-by-side demos, the PiP), not just the largest.
    var selVideo = (!isScene && sel) ? videoForSelection(sel) : null;
    var camRow;
    if (isScene) {
      camRow = '<button class="rv-go secondary" id="rv-pop-draw" style="flex:1 1 45%;" title="Drag on the scene to outline the region the camera should push into">⤢ Draw zoom region…</button>' +
        '<button class="rv-go secondary" id="rv-pop-pan" style="flex:1 1 45%;" title="Grab the picture and drag it to where the camera should look — release places the pan at the playhead. Pan slides at the camera’s current zoom (zoom in first; a wide camera has nowhere to pan).">↔ Pan (drag)…</button>';
    } else {
      camRow = '<button class="rv-go secondary" id="rv-pop-zoom" style="flex:1 1 45%;" title="Push the camera toward this element so it fills the frame (at the playhead)">⤢ Zoom to this</button>' +
        (selVideo ? '<button class="rv-go secondary" id="rv-pop-zoom-inside" style="flex:1 1 45%;" title="Draw a box on ' + escAttr(videoLabelFor(selVideo)) + ' -- its footage magnifies inside its frame; everything around it stays put">⊕ Zoom inside…</button>' : '') +
        '<button class="rv-go secondary" id="rv-pop-pan" style="flex:1 1 45%;" title="Grab the picture and drag it to where the camera should look — release places the pan at the playhead. Pan slides at the camera’s current zoom (zoom in first; a wide camera has nowhere to pan).">↔ Pan (drag)…</button>' +
        (selVideo ? '<button class="rv-go secondary" id="rv-pop-pan-inside" style="flex:1 1 45%;" title="Grab ' + escAttr(videoLabelFor(selVideo)) + '’s footage and drag it within its frame — travel across a magnified recording without moving the frame. Needs a Zoom inside… first.">⊕ Pan inside…</button>' : '') +
        '<button class="rv-go secondary" id="rv-pop-rot" style="flex:1 1 45%;" title="Rotate the camera on this element at the playhead. The block edits angle, AXIS (flat spin / 3D book-turn / tilt) and a sideways shift to clear space.">↻ Rotate</button>' +
        '<button class="rv-go secondary" id="rv-pop-text" style="flex:1 1 45%;" title="Drop type-on brand text at the playhead where you clicked. Click the text afterwards to revise or remove it.">T Add text here</button>';
    }
    // Speaker bubble selected: direct placement beats prose. Corners + sizes
    // write the component position through the PATCH route -- no LLM, instant.
    var isBubble = !isScene && sel && (sel.compId === 'camera_pip' || sel.compId === 'booth_pip');
    var isText = !isScene && sel && sel.compType === 'kinetic-text';
    var textRow = isText
      ? '<div class="sp-row"><button class="rv-go secondary" id="rv-pop-remove" style="flex:1;color:#dc2626;border-color:#fca5a5;" title="Delete this text component">🗑 Remove this text</button></div>'
      : '';
    var bubbleRow = isBubble
      ? '<div class="sp-row" style="gap:4px;" title="Place the camera bubble">' +
          ['tl:&#8598;', 'tr:&#8599;', 'bl:&#8601;', 'br:&#8600;'].map(function(c) {
            var p = c.split(':');
            return '<button class="rv-go secondary rv-bub-corner" data-corner="' + p[0] + '" style="flex:1;">' + p[1] + '</button>';
          }).join('') +
          ['S', 'M', 'L'].map(function(s) {
            return '<button class="rv-go secondary rv-bub-size" data-size="' + s + '" style="flex:1;">' + s + '</button>';
          }).join('') +
        '</div>' +
        '<div class="sp-row" style="gap:4px;" title="Bubble shape">' +
          [['rect', '&#9645; Rect'], ['round', '&#9634; Round'], ['circle', '&#9711; Circle']].map(function(sh) {
            return '<button class="rv-go secondary rv-bub-shape" data-shape="' + sh[0] + '" style="flex:1;">' + sh[1] + '</button>';
          }).join('') +
        '</div>' +
        '<div class="sp-status">Or just drag the bubble to place it anywhere.</div>'
      : '';
    // Chapter card: an overlay on the film (an effect). Clicking the card
    // itself edits that chapter; clicking anywhere else offers "add here".
    var chapComp = null;
    var chapSceneEnt = currentSceneEntry();
    if (chapSceneEnt) (chapSceneEnt.components || []).forEach(function(c) { if (c.type === 'narration-track') chapComp = c; });
    var chapCard = !isScene && sel && sel._el && sel._el.closest && sel._el.closest('.ntrk-chapter');
    var chapRow = chapComp
      ? '<div class="sp-row"><button class="rv-go secondary" id="rv-pop-chap" style="flex:1;" title="' +
        (chapCard ? 'Rename, retime, or delete this chapter card'
          : 'Drop a chapter card at the playhead (a brief title over a dimmed frame)') + '">' +
        (chapCard ? '⚑ Edit this chapter…' : '⚑ Add chapter here…') + '</button></div>'
      : '';
    pop.innerHTML =
      '<div class="sp-head"><span class="sp-title" id="rv-pop-title"></span>' +
      '<button class="sp-x" id="rv-pop-x" title="Close (Esc)">✕</button></div>' +
      '<textarea id="rv-pop-input" placeholder="' + (isScene ? 'What should change in this scene?' : 'What should change? e.g. make this bigger, use the brand green') + '"></textarea>' +
      '<div class="sp-row">' +
        '<button class="rv-go secondary" id="rv-pop-undo" style="flex:0 0 auto;" title="Undo the last revise on this scene">Undo</button>' +
        '<button class="rv-go" id="rv-pop-go" style="flex:1;">' + (isScene ? 'Revise scene' : 'Revise') + '</button>' +
      '</div>' +
      bubbleRow +
      '<div class="sp-row" style="flex-wrap:wrap;">' + camRow + '</div>' +
      textRow +
      chapRow +
      '<div class="sp-status" id="rv-pop-status"></div>';
    document.getElementById('rv-pop-x').addEventListener('click', rvPopClose);
    document.getElementById('rv-pop-go').addEventListener('click', rvPopGo);
    document.getElementById('rv-pop-undo').addEventListener('click', studioUndo);
    var zb = document.getElementById('rv-pop-zoom');
    if (zb) zb.addEventListener('click', zoomToSelection);
    var zi = document.getElementById('rv-pop-zoom-inside');
    if (zi) zi.addEventListener('click', zoomInsideSelection);
    var pb = document.getElementById('rv-pop-pan');
    if (pb) pb.addEventListener('click', panDragStart);
    var pib = document.getElementById('rv-pop-pan-inside');
    if (pib) pib.addEventListener('click', panInsideSelection);
    var rb = document.getElementById('rv-pop-rot');
    if (rb) rb.addEventListener('click', rotateToSelection);
    var tb = document.getElementById('rv-pop-text');
    if (tb) tb.addEventListener('click', addTextAtPlayhead);
    var rmb = document.getElementById('rv-pop-remove');
    if (rmb) rmb.addEventListener('click', removeSelectedComponent);
    var db = document.getElementById('rv-pop-draw');
    if (db) db.addEventListener('click', function() {
      rvPopClose();
      studioStatus('Drag on the scene to draw the zoom region (Esc cancels).', '');
      if (els.camHint) els.camHint.textContent = 'Drag on the scene to draw the zoom region (Esc cancels).';
    });
    if (isBubble) {
      pop.querySelectorAll('.rv-bub-corner').forEach(function(b) {
        b.addEventListener('click', function() { bubblePlace(sel.compId, b.getAttribute('data-corner'), null); });
      });
      pop.querySelectorAll('.rv-bub-size').forEach(function(b) {
        b.addEventListener('click', function() { bubblePlace(sel.compId, null, b.getAttribute('data-size')); });
      });
      pop.querySelectorAll('.rv-bub-shape').forEach(function(b) {
        b.addEventListener('click', function() { bubbleShape(sel.compId, b.getAttribute('data-shape')); });
      });
    }
    var chapBtn = document.getElementById('rv-pop-chap');
    if (chapBtn && chapComp) chapBtn.addEventListener('click', function() {
      var si2 = state.currentSceneIndex;
      var idx = -1;
      if (chapCard) {
        // Which chapter is the card showing? The one whose window covers the
        // playhead; fall back to the nearest by start time.
        var tl0 = (state.masterTime || 0) - sceneStartFor(si2);
        var chsA = (chapComp.data && chapComp.data.chapters) || [];
        chsA.forEach(function(c3, i3) {
          var hold = (typeof c3.dur === 'number' && c3.dur >= 0.5) ? c3.dur : 2.2;
          if (tl0 >= c3.at - 0.3 && tl0 <= c3.at + hold + 0.6) idx = i3;
        });
        if (idx < 0 && chsA.length) {
          var bd = 1e9;
          chsA.forEach(function(c3, i3) { var d0 = Math.abs(c3.at - tl0); if (d0 < bd) { bd = d0; idx = i3; } });
        }
      }
      rvPopClose();
      chapPopOpen(si2, chapComp.id, idx, null);
    });
    var ta = document.getElementById('rv-pop-input');
    ta.value = keepText;
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); rvPopGo(); }
    });
  }

  // "Zoom to this": a whole-scene camera push whose box is auto-fitted to the
  // selected element's on-screen rect (with breathing room), at the playhead.
  function zoomToSelection() {
    var sel = studio.sel;
    var si = state.currentSceneIndex;
    var scene = currentSceneEntry();
    if (!sel || !sel._el || sel._isScene || !scene) return;
    var r;
    try { r = sel._el.getBoundingClientRect(); } catch (e) { return; }
    if (!r || r.width < 4 || r.height < 4) { studioStatus('That element has no visible box to zoom to.', 'warn'); return; }
    var cw = parseInt(els.previewIframe.width, 10) || 1920;
    var ch = parseInt(els.previewIframe.height, 10) || 1080;
    var w = Math.min(100, (r.width / cw) * 100 * 1.15);
    var h = Math.min(100, (r.height / ch) * 100 * 1.15);
    if (w >= 96 && h >= 96) { studioStatus('This element already fills the frame \\u2014 draw a smaller region instead.', 'warn'); return; }
    var dur = scene.duration_seconds || 5;
    var at = Math.max(0, Math.min(dur - 0.2, (state.masterTime || 0) - sceneStartFor(si)));
    var move = {
      at: Math.round(at * 10) / 10,
      type: 'zoom',
      x: Math.round(((r.left + r.width / 2) / cw) * 100),
      y: Math.round(((r.top + r.height / 2) / ch) * 100),
      w: Math.round(Math.max(6, w)),
      h: Math.round(Math.max(6, h)),
      duration: 0.8,
      hold: 1.5,
      'return': true,
    };
    var moves = (scene.camera_moves || []).slice();
    moves.push(move);
    rvPopClose();
    saveCameraMovesForScene(si, moves);
  }

  // Shared: the selected element's focal point + scene-local playhead time,
  // or null (with a status message) when there is nothing to aim at.
  function camMoveBasis() {
    var sel = studio.sel;
    var si = state.currentSceneIndex;
    var scene = currentSceneEntry();
    if (!sel || !sel._el || sel._isScene || !scene) return null;
    var r;
    try { r = sel._el.getBoundingClientRect(); } catch (e) { return null; }
    if (!r || r.width < 4 || r.height < 4) { studioStatus('That element has no visible box to aim the camera at.', 'warn'); return null; }
    var cw = parseInt(els.previewIframe.width, 10) || 1920;
    var ch = parseInt(els.previewIframe.height, 10) || 1080;
    var dur = scene.duration_seconds || 5;
    return {
      si: si, scene: scene,
      at: Math.round(Math.max(0, Math.min(dur - 0.2, (state.masterTime || 0) - sceneStartFor(si))) * 10) / 10,
      x: Math.round(((r.left + r.width / 2) / cw) * 100),
      y: Math.round(((r.top + r.height / 2) / ch) * 100),
    };
  }

  // "Pan": grab-the-picture drag. The button ARMS pan mode; the user then
  // drags the preview footage to where the camera should look (maps
  // convention: the picture follows the cursor) and releases to drop a pan
  // block at the playhead. A pan NEVER zooms -- it is pure translation at
  // whatever zoom the camera holds when it fires, so the saved move carries
  // no scale and a wide (1x) camera has nothing to pan (the grab says so).
  function panDragStart() {
    var scene = currentSceneEntry();
    if (!scene) return;
    if (state.playing) togglePlay(); // pan is placed on a paused frame
    studio.panMode = true;
    studio.panInside = null;
    rvPopClose();
    try {
      var docP = els.previewIframe.contentDocument;
      if (docP && docP.body) docP.body.style.cursor = 'grab';
    } catch (eP) {}
    studioStatus('↔ Grab the picture and drag it to where the camera should look — release places the pan (Esc cancels). Pan slides at the camera’s current zoom.', '');
    if (els.camHint) els.camHint.textContent = 'Drag the picture; release places the pan. Esc cancels.';
  }

  // "Pan inside": zoom-inside's sibling. Same grab-drag, aimed at the
  // FOOTAGE living inside the selected video's frame instead of the whole
  // stage -- travel across a magnified recording without moving its frame.
  // Meaningful only after a Zoom inside… has magnified the footage; the
  // grab says so otherwise.
  function panInsideSelection() {
    var sel = studio.sel;
    if (!sel) return;
    var vid = videoForSelection(sel);
    if (!vid) { studioStatus('No video under this selection to pan inside.', 'warn'); return; }
    if (state.playing) togglePlay();
    studio.panMode = true;
    studio.panInside = { target: videoTargetFor(vid), label: videoLabelFor(vid) };
    rvPopClose();
    try {
      var docP2 = els.previewIframe.contentDocument;
      if (docP2 && docP2.body) docP2.body.style.cursor = 'grab';
    } catch (eP2) {}
    var hintP = '⊕ Grab ' + videoLabelFor(vid) + '’s footage and drag it — release places the inside-pan (Esc cancels).';
    studioStatus(hintP, '');
    if (els.camHint) els.camHint.textContent = hintP;
  }

  // "Rotate": tilt the rig on the selected element. Angle is a taste knob --
  // 8 degrees reads as intent without seasickness; edit it on the block.
  function rotateToSelection() {
    var b = camMoveBasis();
    if (!b) return;
    var move = { at: b.at, type: 'rotate', x: b.x, y: b.y, angle: 8, duration: 0.8, hold: 1.5, 'return': true };
    var moves = (b.scene.camera_moves || []).slice();
    moves.push(move);
    rvPopClose();
    saveCameraMovesForScene(b.si, moves);
  }

  // "Add text here": text is a PRIMITIVE, not a camera trick -- a real
  // kinetic-text component dropped at the playhead where the user clicked.
  // Being a component, the existing tools take over from there: click it to
  // revise ("make it bigger", "change the words") or remove it; compose it
  // freely with a 3D rotate to build the aside-style beat.
  function addTextAtPlayhead() {
    var sel = studio.sel;
    var si = state.currentSceneIndex;
    var scene = currentSceneEntry();
    var p = state.currentProject;
    if (!scene || !p) return;
    var cw = parseInt(els.previewIframe.width, 10) || 1920;
    var cx = 25; var cy = 40; // default: left third, upper-middle
    try {
      if (sel && sel._el) {
        var r = sel._el.getBoundingClientRect();
        cx = Math.round(((r.left + r.width / 2) / cw) * 100);
        cy = Math.round(((r.top + r.height / 2) / (parseInt(els.previewIframe.height, 10) || 1080)) * 100);
      }
    } catch (e0) {}
    var dur = scene.duration_seconds || 5;
    var at = Math.round(Math.max(0, Math.min(dur - 0.5, (state.masterTime || 0) - sceneStartFor(si))) * 10) / 10;
    var comp = {
      id: 'text_' + Date.now().toString(36),
      type: 'kinetic-text',
      z_index: 60,
      position: { x: Math.max(2, Math.min(60, cx - 18)) + '%', y: Math.max(5, Math.min(70, cy - 12)) + '%', width: '36%', height: '30%' },
      data: { text: 'Your words here', entrance: 'type-on', at: at },
    };
    rvPopClose();
    api('POST', '/projects/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id) +
        '/scenes/' + encodeURIComponent(scene.id) + '/components', { component: comp })
      .then(function(r) {
        if (!r || r.ok === false) { studioStatus('Add text failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
        if (r.scene) { p.scenes[si] = r.scene; }
        studioStatus('T Text added at ' + at.toFixed(1) + 's — click it to revise the words, style or timing; the popover offers Remove.', 'ok');
        startCompositePreview(p, { time: state.masterTime, sceneIndex: si });
      })
      .catch(function(e) { studioStatus('Add text failed: ' + e.message, 'err'); });
  }

  // Selected text components get a direct Remove (revise handles the rest).
  function removeSelectedComponent() {
    var sel = studio.sel;
    var si = state.currentSceneIndex;
    var scene = currentSceneEntry();
    var p = state.currentProject;
    if (!sel || !sel.compId || !scene || !p) return;
    api('DELETE', '/projects/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id) +
        '/scenes/' + encodeURIComponent(scene.id) + '/components/' + encodeURIComponent(sel.compId), null)
      .then(function(r) {
        if (!r || r.ok === false) { studioStatus('Remove failed: ' + ((r && r.error) || 'unknown'), 'err'); return; }
        scene.components = (scene.components || []).filter(function(c) { return c.id !== sel.compId; });
        rvPopClose();
        studioStatus('Removed ✓ reloading preview…', 'ok');
        startCompositePreview(p, { time: state.masterTime, sceneIndex: si });
      })
      .catch(function(e) { studioStatus('Remove failed: ' + e.message, 'err'); });
  }

  // "Zoom inside": arm the draw gesture scoped to the selected video. The
  // user outlines the region; the confirm popover opens with "inside <video>"
  // pre-checked so the zoom targets that video's content, not the scene.
  function zoomInsideSelection() {
    var sel = studio.sel;
    if (!sel) return;
    var vid = videoForSelection(sel);
    if (!vid) { studioStatus('No video under this selection to zoom inside.', 'warn'); return; }
    studio.pendingInside = { target: videoTargetFor(vid), label: videoLabelFor(vid), checked: true };
    rvPopClose();
    var hint = 'Draw a box on ' + videoLabelFor(vid) + ' to zoom into (Esc cancels).';
    studioStatus(hint, '');
    if (els.camHint) els.camHint.textContent = hint;
  }

  function rvPopGo() {
    studioRevise();
  }

  function rvPopSetBusy(busy) {
    ['rv-pop-go', 'rv-pop-undo', 'rv-pop-input', 'rv-pop-zoom', 'rv-pop-draw'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.disabled = busy;
    });
  }

  function rvPopShow() {
    var pop = document.getElementById('rv-pop');
    var sel = studio.sel;
    if (!pop || !sel) return;
    rvPopBuild(pop);
    var label = sel._label || sel.compType || sel.tagName || 'element';
    document.getElementById('rv-pop-title').innerHTML = '<b>' + escHtml(label) + '</b>' +
      (!sel._isScene && sel.text ? ' \\u2014 \\u201c' + escHtml(sel.text.slice(0, 40)) + '\\u201d' : '');
    rvPopSetBusy(!!studio.busy);
    rvPopSyncScope();
    pop.style.display = 'block';
    rvPopPosition();
    var ta = document.getElementById('rv-pop-input');
    if (ta) ta.focus();
  }

  function rvPopSyncScope() {
    var e1 = document.getElementById('rv-pop-scope-el'), e2 = document.getElementById('rv-pop-scope-scene');
    if (e1) e1.classList.toggle('active', studio.scope === 'element');
    if (e2) e2.classList.toggle('active', studio.scope === 'scene');
  }

  // Anchor the popover next to the selected element: the element's rect is in
  // iframe content coordinates (1920x1080), scaled to the on-screen iframe box.
  function rvPopPosition() {
    var pop = document.getElementById('rv-pop');
    var sel = studio.sel;
    if (!pop || !sel || !sel._el) return;
    var ifr = els.previewIframe;
    var rect = ifr.getBoundingClientRect();
    var sxr = rect.width / (ifr.width || 1920), syr = rect.height / (ifr.height || 1080);
    var pw = pop.offsetWidth || 320, ph = pop.offsetHeight || 170;
    if (sel._isScene) {
      // Scene selection has no meaningful anchor rect -- center over the stage.
      pop.style.left = Math.max(8, rect.left + rect.width / 2 - pw / 2) + 'px';
      pop.style.top = Math.max(8, rect.top + rect.height / 2 - ph / 2) + 'px';
      return;
    }
    var r = null;
    try { r = sel._el.getBoundingClientRect(); } catch (e) {}
    var cx = rect.left + (r ? (r.left + r.width / 2) * sxr : rect.width / 2);
    var x = Math.max(8, Math.min(cx - pw / 2, window.innerWidth - pw - 8));
    var y = rect.top + (r ? r.bottom * syr : rect.height) + 10;
    if (y + ph > window.innerHeight - 8) {
      y = rect.top + (r ? r.top * syr : 0) - ph - 10;
      if (y < 8) y = Math.max(8, window.innerHeight - ph - 8);
    }
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  // Keep the persistent selection box on the selected element (if it's in the
  // currently attached doc and still on screen).
  function studioPositionSel() {
    var s = studio.selBox;
    if (!s) return;
    var sel = studio.sel;
    if (!sel || !sel._el || sel._doc !== studio.boxDoc || !sel._el.isConnected || !studio.boxRect) {
      s.style.display = 'none';
      return;
    }
    var b = studio.boxRect(sel._el);
    if (b.w < 1 || b.h < 1) { s.style.display = 'none'; return; }
    s.style.left = b.left + 'px'; s.style.top = b.top + 'px';
    s.style.width = b.w + 'px'; s.style.height = b.h + 'px';
    s.style.display = 'block';
  }

  function studioSetScope(scope) {
    // Scope is implied by the selection now (element vs scene); no toggles.
    studio.scope = scope;
  }

  function studioShowCtx(x, y) {
    var m = document.getElementById('studio-ctx');
    m.innerHTML = '';
    function item(label, fn) { var b = document.createElement('button'); b.textContent = label; b.onclick = function() { m.style.display = 'none'; fn(); }; m.appendChild(b); }
    item('Revise this element\\u2026', function() { studioSetScope('element'); rvPopShow(); });
    item('Revise whole scene\\u2026', function() { studioSetScope('scene'); rvPopShow(); });
    var sep = document.createElement('div'); sep.className = 'ctx-sep'; m.appendChild(sep);
    item('Cancel', function() {});
    m.style.left = Math.max(4, Math.min(x, window.innerWidth - 190)) + 'px';
    m.style.top = Math.max(4, Math.min(y, window.innerHeight - 130)) + 'px';
    m.style.display = 'block';
  }
  document.addEventListener('click', function() { var m = document.getElementById('studio-ctx'); if (m) m.style.display = 'none'; });

  function studioBusyOverlay(on, label) {
    var sel = studio.sel; if (!sel || !sel._doc) return;
    var doc = sel._doc, ov = doc.getElementById('__studio_busy');
    if (!on) { if (ov) ov.remove(); return; }
    if (!ov) { ov = doc.createElement('div'); ov.id = '__studio_busy'; doc.body.appendChild(ov); }
    var left = 0, top = 0, w = (doc.documentElement.clientWidth || 1920), h = (doc.documentElement.clientHeight || 1080);
    if (studio.scope === 'element' && sel._el) {
      var r = sel._el.getBoundingClientRect();
      var sx = (doc.documentElement.scrollLeft || 0), sy = (doc.documentElement.scrollTop || 0);
      left = r.left + sx; top = r.top + sy; w = r.width; h = r.height;
    }
    ov.style.cssText = 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(10,12,24,0.55);backdrop-filter:blur(2px);color:#fff;font:600 18px sans-serif;border-radius:6px;';
    ov.textContent = label || 'Revising\\u2026';
  }

  var _toastTimer = null;
  function studioStatus(msg, cls) {
    // Toast (the bottom status lines are gone) + mirror into the revise
    // popover when it's open.
    var t = document.getElementById('studio-toast');
    if (t) {
      t.className = (cls ? cls + ' ' : '') + (msg ? 'show' : '');
      t.textContent = msg;
      if (_toastTimer) clearTimeout(_toastTimer);
      if (msg) _toastTimer = setTimeout(function() { t.className = ''; }, cls === 'err' ? 8000 : 4500);
    }
    var ps = document.getElementById('rv-pop-status');
    if (ps) {
      ps.className = 'sp-status rv-status' + (cls ? ' ' + cls : '');
      ps.textContent = msg;
    }
  }

  // Re-fetch the composite and actually re-render it (hot-swap), preserving time.
  function studioReload() {
    var p = state.currentProject; if (!p) return;
    var idx = state.currentSceneIndex;
    // Remember where the playhead was so we can land back on a CONTENT-VISIBLE
    // frame after the swap (seeking to a scene's first frame shows blank because
    // the GSAP intro animations start everything at opacity:0 / off-screen).
    var keepTime = state.masterTime || 0;
    // Clear stale selection (the old element is gone after a re-render).
    studio.sel = null;
    if (studio.selBox) studio.selBox.style.display = 'none';
    rvPopClose();
    loadComposite(p).then(function() {
      // CRITICAL: document.write reuses the iframe window, so the PREVIOUS
      // document's __MP_READY/__MP_TIMELINE are still set when we rewrite.
      // Without clearing them, waitForCompositeReady can fire against the OLD
      // (now-detached) timeline; we then seek a dead timeline and the new
      // composite sits at master-time 0 (the blank intro frame). Clear first so
      // we wait for the genuinely-new document. (This is why loadProject — which
      // runs against a fresh iframe — works but a re-load went blank.)
      try {
        var w0 = els.previewIframe.contentWindow;
        if (w0) { w0.__MP_READY = false; w0.__MP_TIMELINE = null; w0.__MP_SCENE_META = null; }
      } catch (e) {}
      if (!initComposite()) { console.warn('[studio] reload: no composite html'); return; }
      waitForCompositeReady(function(masterTl) {
        console.log('[studio] reload ready; timeline=', !!masterTl);
        // Re-attach selection to the fresh document (defensive; the write hook
        // may have run before the body was ready).
        try { var d = els.previewIframe.contentDocument; if (d) studioAttach(d); } catch (e) {}
        // Mirror loadProject's reveal sequence so the swapped scene is actually
        // shown (without it the wrapper stays hidden / buffer overlay sticks and
        // the canvas reads as blank after a revise).
        var si = idx >= 0 ? idx : 0;
        state.currentSceneIndex = si;
        state.currentComponentIndex = -1;
        if (p.scenes && p.scenes[si]) state.duration = p.scenes[si].duration_seconds || 0;
        updateActiveScene(si);
        renderLayers();
        updateSceneIndicator();
        // Compute a settled, content-visible time inside the revised scene:
        // prefer the user's prior playhead, but never the blank intro frame.
        var meta = null;
        try { meta = els.previewIframe.contentWindow.__MP_SCENE_META; } catch (e) {}
        var sceneStart = (meta && meta[si]) ? meta[si].start : sceneOffset(si);
        var sceneDur = (p.scenes && p.scenes[si]) ? (p.scenes[si].duration_seconds || 0) : 0;
        var settled = sceneStart + Math.min(0.6, sceneDur > 0 ? sceneDur * 0.4 : 0.6);
        var target = Math.max(keepTime, settled);
        if (sceneDur > 0) target = Math.min(target, sceneStart + sceneDur - 0.05);
        console.log('[studio] reload seek: scene', si, 'start', sceneStart, 'target', target, 'keepTime', keepTime);
        if (masterTl) { masterTl.time(target); masterTl.pause(); }
        state.masterTime = target;
        els.slider.value = state.totalDuration > 0 ? Math.round((target / state.totalDuration) * 1000) : 0;
        updateTimeDisplay(target);
        els.previewPlaceholder.style.display = 'none';
        els.previewWrapper.style.display = '';
        els.bufferOverlay.style.display = 'flex';
        waitForMediaReady().then(function() {
          els.slider.disabled = false;
          els.playBtn.disabled = false;
          els.bufferOverlay.style.display = 'none';
          // Re-assert the settled frame after media is ready (a late-loading
          // video can reset the GSAP render; keep the content visible).
          if (masterTl) { masterTl.time(target); masterTl.pause(); }
        });
      });
    });
  }

  function studioRevise() {
    if (studio.busy) return;
    var ta = document.getElementById('rv-pop-input');
    var instruction = ((ta && ta.value) || '').trim();
    if (!instruction) { studioStatus('Type what to change first.', 'warn'); return; }
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { studioStatus('Select an element or load a scene first.', 'warn'); return; }
    var p = state.currentProject;
    if (!p) { studioStatus('Load a project first.', 'warn'); return; }
    var element = (studio.scope === 'element' && studio.sel) ? {
      tagName: studio.sel.tagName, classList: studio.sel.classList, text: studio.sel.text,
      outerHTMLSnippet: studio.sel.outerHTMLSnippet, compType: studio.sel.compType,
      // compId routes speaker-film revises to the clicked LIBRARY component's
      // data (those scenes have no codegen source; without it the server 400s).
      compId: studio.sel.compId
    } : undefined;

    studio.busy = true;
    rvPopSetBusy(true);
    studioToggleControls(true);
    studioStatus('Revising\\u2026 (' + (studio.scope === 'scene' ? 'whole scene' : 'element') + ')', '');
    studioBusyOverlay(true);

    function done() {
      studio.busy = false;
      rvPopSetBusy(false);
      studioToggleControls(false);
      studioBusyOverlay(false);
    }
    api('POST', '/revise/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id),
        { scene_id: sceneId, instruction: instruction, element: element })
      .then(function(res) {
        done();
        console.log('[studio] revise response:', res);
        if (!res || res.ok === false) { studioStatus('Failed: ' + ((res && res.error) || 'unknown'), 'err'); return; }
        var defs = res.defects || [];
        var geo = res.layout_warnings || [];
        var n = res.blocks_applied != null ? res.blocks_applied : (res.blocksApplied || 0);
        var full = res.full_rewrite != null ? res.full_rewrite : res.fullRewrite;
        // Always report how much actually changed at the source so a no-op
        // (0 edits) is visible rather than reading as "nothing happened".
        var edits = full ? 'rewrote scene' : (n + ' edit' + (n === 1 ? '' : 's'));
        if (n === 0 && !full) {
          studioStatus('No change applied \\u2014 the revise did not match anything. Try rephrasing, or use Regenerate scene.', 'warn');
        } else if (geo.length) {
          // The patch was applied but the browser refused part of it -- that
          // is the "revise said ok but nothing changed on screen" trap.
          studioStatus('Applied (' + edits + ') but part did NOT take effect: ' + geo.join(' | '), 'warn');
        } else if (defs.length) {
          studioStatus('Updated (' + edits + ') \\u26a0 ' + defs.length + ' issue(s): ' + defs.map(function(d) { return d.detail; }).join('; '), 'warn');
        } else {
          studioStatus('Updated \\u2713 (' + edits + ')', 'ok');
        }
        var pi = document.getElementById('rv-pop-input'); if (pi) pi.value = '';
        studioReload();
      })
      .catch(function(e) { done(); studioStatus('Error: ' + e.message, 'err'); });
  }

  function studioUndo() {
    if (studio.busy) return;
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { studioStatus('Select a scene first.', 'warn'); return; }
    var p = state.currentProject; if (!p) { studioStatus('Load a project first.', 'warn'); return; }
    studio.busy = true;
    rvPopSetBusy(true);
    studioToggleControls(true);
    studioStatus('Undoing\\u2026', '');
    function done() {
      studio.busy = false;
      rvPopSetBusy(false);
      studioToggleControls(false);
    }
    api('POST', '/revise/undo/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id), { scene_id: sceneId })
      .then(function(res) {
        done();
        if (!res || res.ok === false) { studioStatus('Undo failed: ' + ((res && res.error) || 'unknown'), 'err'); return; }
        if (!res.restored) { studioStatus('Nothing to undo.', 'warn'); return; }
        var rem = res.remaining || 0;
        studioStatus('Reverted \\u2713 (' + rem + ' earlier revision' + (rem === 1 ? '' : 's') + ' left)', 'ok');
        studioReload();
      })
      .catch(function(e) { done(); studioStatus('Error: ' + e.message, 'err'); });
  }

  // Storyboard statuses go to the same toast (its panel is gone).
  function sbStatus(msg, cls) {
    studioStatus(msg, cls);
  }

  // ── Studio modal (storyboard editor + regenerate progress) ──
  function studioModalOpen(html) {
    var card = document.getElementById('studio-modal-card');
    var back = document.getElementById('studio-modal');
    if (!card || !back) return;
    card.innerHTML = html;
    back.style.display = 'flex';
  }
  function studioModalClose() {
    var back = document.getElementById('studio-modal');
    if (back) back.style.display = 'none';
  }

  // Enable/disable every scene-mutating control at once (popover + modal).
  function studioToggleControls(disabled) {
    ['rv-pop-go', 'rv-pop-undo', 'rv-pop-input', 'sm-save', 'sm-regen'].forEach(function(id) {
      var b = document.getElementById(id); if (b) b.disabled = disabled;
    });
  }

  // Open the roomy storyboard editor dialog (the scene's full storyboard entry).
  function openStoryboardEditor() {
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { sbStatus('Select or load a scene first.', 'warn'); return; }
    var b = studio.sb || {};
    // Critique verdict lives here now (the bottom panel is gone): what
    // shipped and why, so defects can be targeted with Revise/Regenerate.
    var qualityHtml = '';
    if (b.quality) {
      var q = b.quality;
      var qcls = q.passed ? 'qb-pass' : 'qb-warn';
      var qhead = q.passed
        ? '\\u2713 Passed critique clean (score ' + q.score + ', ' + q.attempts + ' attempt' + (q.attempts === 1 ? '' : 's') + ')'
        : '\\u26a0 Shipped with ' + (q.unresolved_defects || []).length + ' unresolved defect' + ((q.unresolved_defects || []).length === 1 ? '' : 's') + ' (score ' + q.score + ', ' + q.attempts + ' attempt' + (q.attempts === 1 ? '' : 's') + ')';
      qualityHtml = '<div class="sb-quality-block ' + qcls + '"><div class="sb-quality-head ' + qcls + '">' + qhead + '</div>' +
        (q.unresolved_defects || []).map(function(d) { return '<div class="sb-quality-defect">\\u2022 ' + escHtml(d) + '</div>'; }).join('') +
        '</div>';
    }
    var html =
      '<h3 class="sm-title">Scene storyboard</h3>' +
      '<p class="sm-desc">Save keeps your edits; Regenerate rebuilds the scene from scratch (slow) to fulfill this storyboard.</p>' +
      qualityHtml +
      '<div class="sm-field"><label>Purpose</label><textarea id="sm-purpose" placeholder="What this scene communicates">' + escHtml(b.purpose || '') + '</textarea></div>' +
      '<div class="sm-field"><label>Script (voiceover / on-screen)</label><textarea id="sm-script" placeholder="The narration or on-screen copy">' + escHtml(b.script || '') + '</textarea></div>' +
      '<div class="sm-field"><label>Visual notes (the WORLD: setting, layers, what persists)</label><textarea id="sm-visual" style="min-height:130px;" placeholder="Layout, motion, imagery, hierarchy">' + escHtml(b.visual_notes || '') + '</textarea></div>' +
      '<div class="sm-field"><label>Beats (what HAPPENS, in order \\u2014 one thought per beat)</label>' +
        '<div class="sm-beat-head"><span>Label</span><span>Secs</span><span>Action</span><span>Voiceover</span><span></span></div>' +
        '<div id="sm-beat-rows"></div>' +
        '<div><button type="button" class="sm-btn" id="sm-beat-add">+ Add beat</button><span class="sm-beat-total" id="sm-beat-total"></span></div>' +
      '</div>' +
      '<div class="sm-row2">' +
        '<div class="sm-field"><label>Duration (seconds)</label><input id="sm-duration" type="number" min="1" step="0.5" value="' + escAttr('' + (b.duration_seconds || '')) + '"></div>' +
        '<div class="sm-field"><label>B-roll search</label><input id="sm-broll" type="text" placeholder="e.g. team collaborating in office" value="' + escAttr(b.broll_query || '') + '"></div>' +
      '</div>' +
      '<div class="sm-field"><label>Hero image prompt</label><input id="sm-hero" type="text" placeholder="AI background image (leave blank if using b-roll)" value="' + escAttr(b.hero_image || '') + '"></div>' +
      '<div class="sm-field"><label>Components (comma-separated)</label><input id="sm-components" type="text" placeholder="e.g. cta-card, stat-grid" value="' + escAttr((b.components || []).join(', ')) + '"></div>' +
      '<div class="sm-status" id="sm-edit-status"></div>' +
      '<div class="sm-actions">' +
        '<button class="sm-btn" id="sm-cancel">Cancel</button>' +
        '<button class="sm-btn" id="sm-regen" title="Rebuild this scene from scratch (storyboard builder + generate + critique). Slow.">Regenerate scene</button>' +
        '<button class="sm-btn primary" id="sm-save">Save storyboard</button>' +
      '</div>';
    studioModalOpen(html);
    wireBeatEditor(b.beats || []);
    document.getElementById('sm-cancel').addEventListener('click', studioModalClose);
    document.getElementById('sm-save').addEventListener('click', function() { saveStoryboardFromModal(sceneId); });
    document.getElementById('sm-regen').addEventListener('click', function() { studioRegenerate(); });
  }

  function modalVal(id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; }

  function saveStoryboardFromModal(sceneId) {
    var p = state.currentProject; if (!p) return;
    var durRaw = modalVal('sm-duration').trim();
    var bodyS = {
      scene_id: sceneId,
      purpose: modalVal('sm-purpose'),
      script: modalVal('sm-script'),
      visual_notes: modalVal('sm-visual'),
      broll_query: modalVal('sm-broll'),
      hero_image: modalVal('sm-hero'),
      components: modalVal('sm-components').split(',').map(function(c) { return c.trim(); }).filter(Boolean),
      beats: readBeatRowsForSave(),
    };
    if (durRaw && !isNaN(parseFloat(durRaw))) bodyS.duration_seconds = parseFloat(durRaw);
    var st = document.getElementById('sm-edit-status');
    var saveBtn = document.getElementById('sm-save'); if (saveBtn) saveBtn.disabled = true;
    if (st) { st.className = 'sm-status'; st.textContent = 'Saving\\u2026'; }
    api('POST', '/storyboard-scene/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id), bodyS)
      .then(function(res) {
        if (!res || res.ok === false) {
          if (st) { st.className = 'sm-status err'; st.textContent = 'Save failed: ' + ((res && res.error) || 'unknown'); }
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        // Keep the in-memory storyboard in sync so it survives scene switches without reload.
        var idx = p.scenes ? p.scenes.findIndex(function(s) { return s.id === sceneId; }) : -1;
        if (idx >= 0 && res.scene) {
          if (!p.storyboard) p.storyboard = { narrative: '', scenes: [], audio: {}, estimated_duration: 0 };
          if (!p.storyboard.scenes) p.storyboard.scenes = [];
          p.storyboard.scenes[idx] = res.scene;
        }
        var keptQuality = studio.sb && studio.sb.quality;
        studio.sb = storyboardSceneToFields(res.scene);
        studio.sb.quality = keptQuality || null;
        renderStoryboardPreview();
        studioModalClose();
        sbStatus('Storyboard saved \\u2713', 'ok');
      })
      .catch(function(e) {
        if (st) { st.className = 'sm-status err'; st.textContent = 'Error: ' + e.message; }
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  // Regenerate the whole scene from scratch (heavy storyboard builder+generate+critique
  // pipeline, run as an async job) to fulfill the storyboard, with a
  // prominent progress dialog. Unlike Revise (a surgical patch), this rebuilds
  // a broken or empty scene.
  function studioRegenerate() {
    if (studio.busy) return;
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { sbStatus('Select or load a scene first.', 'warn'); return; }
    var p = state.currentProject; if (!p) { sbStatus('Load a project first.', 'warn'); return; }
    if (!window.confirm('Rebuild this entire scene from scratch? This replaces the current scene and can take a minute or two.')) return;

    studio.busy = true;
    studioToggleControls(true);

    var startedAt = Date.now();
    studioModalOpen(
      '<h3 class="sm-title">Regenerating scene</h3>' +
      '<p class="sm-desc">Rebuilding from the storyboard: storyboard builder \\u2192 generate \\u2192 critique. You can hide this \\u2014 it keeps running in the background.</p>' +
      '<div class="sm-progress-bar"><div class="sm-progress-fill" id="sm-fill" style="width:5%"></div></div>' +
      '<div class="sm-phase" id="sm-phase">Starting\\u2026</div>' +
      '<div class="sm-sub" id="sm-elapsed">0s elapsed</div>' +
      '<div class="sm-status" id="sm-modal-status"></div>' +
      '<div class="sm-actions"><button class="sm-btn" id="sm-hide">Hide</button></div>'
    );
    var hideBtn = document.getElementById('sm-hide');
    if (hideBtn) hideBtn.addEventListener('click', studioModalClose);
    var elapsedTimer = setInterval(function() {
      var el = document.getElementById('sm-elapsed');
      if (el) el.textContent = Math.round((Date.now() - startedAt) / 1000) + 's elapsed';
    }, 1000);

    sbStatus('Regenerating scene\\u2026', '');

    function finish() {
      studio.busy = false;
      studioToggleControls(false);
      clearInterval(elapsedTimer);
    }

    // Regenerate rebuilds from the SAVED storyboard; edits are persisted via
    // the editor's Save, so we only need to identify the scene here.
    var body = { scene_id: sceneId };
    api('POST', '/regenerate/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id), body)
      .then(function(res) {
        if (!res || res.ok === false || !res.job_id) {
          finish();
          var msg = 'Failed to start: ' + ((res && res.error) || 'unknown');
          var ms = document.getElementById('sm-modal-status'); if (ms) { ms.className = 'sm-status err'; ms.textContent = msg; }
          sbStatus(msg, 'err');
          return;
        }
        pollRegenJob(res.job_id, finish);
      })
      .catch(function(e) {
        finish();
        var ms = document.getElementById('sm-modal-status'); if (ms) { ms.className = 'sm-status err'; ms.textContent = 'Error: ' + e.message; }
        sbStatus('Error: ' + e.message, 'err');
      });
  }

  // Poll a regenerate job to completion, streaming progress into the modal + status line.
  function pollRegenJob(jobId, finish) {
    var started = Date.now();
    var maxMs = 10 * 60 * 1000;
    function setProg(pct, phase) {
      var f = document.getElementById('sm-fill');
      if (f && pct != null) f.style.width = Math.max(5, Math.min(100, pct)) + '%';
      var ph = document.getElementById('sm-phase');
      if (ph && phase) ph.textContent = phase;
    }
    function tick() {
      api('/jobs/' + encodeURIComponent(jobId)).then(function(job) {
        if (!job) { finish(); sbStatus('Job not found.', 'err'); return; }
        if (job.status === 'completed') {
          setProg(100, 'Done \\u2713');
          finish();
          sbStatus('Scene regenerated \\u2713', 'ok');
          var ms = document.getElementById('sm-modal-status'); if (ms) { ms.className = 'sm-status ok'; ms.textContent = 'Scene regenerated \\u2713 \\u2014 updating preview\\u2026'; }
          // The scene changed on disk; refresh the in-memory project so the
          // storyboard panel + scene metadata match, then hot-swap the preview.
          setTimeout(function() {
            studioModalClose();
            var pp = state.currentProject;
            if (pp && pp.project_id) {
              api('/projects/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(pp.project_id))
                .then(function(fresh) { if (fresh && fresh.project_id) state.currentProject = fresh; })
                .catch(function() {})
                .then(function() { studioReload(); });
            } else {
              studioReload();
            }
          }, 700);
          return;
        }
        if (job.status === 'failed') {
          finish();
          var emsg = 'Regenerate failed: ' + (job.error || 'unknown');
          sbStatus(emsg, 'err');
          var ms2 = document.getElementById('sm-modal-status'); if (ms2) { ms2.className = 'sm-status err'; ms2.textContent = emsg; }
          var hb = document.getElementById('sm-hide'); if (hb) hb.textContent = 'Close';
          return;
        }
        var pr = job.progress || {};
        var phase = pr.detail || pr.step || 'Working\\u2026';
        setProg(pr.percent, phase);
        var pct = pr.percent != null ? (' ' + pr.percent + '%') : '';
        sbStatus('Regenerating scene\\u2026' + pct + ' \\u2014 ' + phase, '');
        if (Date.now() - started > maxMs) { finish(); sbStatus('Still working\\u2026 longer than expected; check back shortly.', 'warn'); return; }
        setTimeout(tick, 2000);
      }).catch(function(e) {
        if (Date.now() - started > maxMs) { finish(); sbStatus('Error polling job: ' + e.message, 'err'); return; }
        setTimeout(tick, 3000);
      });
    }
    tick();
  }

  // Revise + storyboard controls live in the selection popover and the
  // storyboard dialog (wired where they're built).
  document.getElementById('tl-zoom-in').addEventListener('click', function() { state._userZoomed = true; setTimelineZoom((state.tlZoom || 1) * 1.6); });
  document.getElementById('tl-zoom-out').addEventListener('click', function() { state._userZoomed = true; setTimelineZoom((state.tlZoom || 1) / 1.6); });
})();
</script>
</body>
</html>`;
}
