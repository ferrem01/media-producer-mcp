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
  /* Audio lanes under the scrubber: music coverage + voiceover clip windows. */
  #audio-lanes { position: absolute; left: 0; right: 0; top: 86px; height: 10px; pointer-events: none; }
  .audio-lane-seg { position: absolute; height: 4px; border-radius: 2px; pointer-events: auto; }
  .audio-lane-seg.music { top: 0; background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(99,102,241,0.55) 12%, rgba(99,102,241,0.55)); }
  .audio-lane-seg.voiceover { top: 5px; background: #f59e0b; opacity: 0.75; }
  .audio-lane-seg.sfx { top: 5px; background: #10b981; opacity: 0.6; }
  #timeline-slider {
    position: absolute; left: 0; top: 66px; width: 100%; -webkit-appearance: none; appearance: none;
    height: 3px; background: #e5e7eb; border-radius: 3px;
    outline: none; cursor: pointer;
  }
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
    transition: transform 0.1s ease; z-index: 3;
  }
  .cam-pill:hover { transform: translateX(-50%) scale(1.3); }
  .cam-pill.active { background: #312e81; transform: translateX(-50%) scale(1.3); }
  /* Media lane: each video's source-map as blocks (color = rate). */
  #media-lane { position: absolute; left: 0; right: 0; top: 0; height: 52px; pointer-events: none; }
  .ml-row { position: absolute; left: 0; right: 0; height: 24px; }
  .ml-seg { position: absolute; height: 100%; border-radius: 4px; pointer-events: auto; cursor: pointer; opacity: 0.92; box-sizing: border-box;
    border: 1px solid #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.10);
    font-size: 12px; line-height: 22px; font-weight: 600; color: rgba(255,255,255,0.97); text-align: center; overflow: hidden; white-space: nowrap; }
  .ml-seg.r-plain, .ml-seg.r-freeze { color: #6b7280; }
  .ml-seg:hover { opacity: 1; box-shadow: 0 0 0 1.5px #4f46e5; z-index: 2; }
  .ml-seg.r-normal { background: #a5b4fc; }
  .ml-seg.r-fast { background: #fbbf24; }
  .ml-seg.r-turbo { background: #f87171; }
  .ml-seg.r-freeze { background: repeating-linear-gradient(45deg, #d1d5db, #d1d5db 3px, #f3f4f6 3px, #f3f4f6 6px); }
  .ml-seg.r-plain { background: #eef2ff; border: 1px dashed #a5b4fc; }
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
  #wave-strip { position: absolute; left: 0; right: 0; top: 94px; height: 26px; pointer-events: none; opacity: 0.16; }

  /* Lane gutter labels: the timeline reads as tracks, not implementation.
     (ROADMAP #8 stage 3 -- SCREEN / SPEAKER / MUSIC + the linked badge.) */
  .lane-label { position: absolute; left: 2px; z-index: 6; font-size: 8px; font-weight: 700; letter-spacing: 0.08em; color: #9ca3af; background: rgba(255,255,255,0.82); border-radius: 3px; padding: 0 4px; pointer-events: none; text-transform: uppercase; }
  #lane-link { position: absolute; left: 2px; z-index: 6; font-size: 8px; font-weight: 600; color: #4f46e5; background: rgba(238,239,255,0.92); border-radius: 3px; padding: 0 4px; pointer-events: auto; cursor: help; }

  /* Word-cut selection (stage 4): shift-click two words to mark a span. */
  .wl-word.wl-sel { background: #fde68a; border-color: #f59e0b; color: #78350f; }
  #word-cut-btn { position: absolute; z-index: 40; font: 600 10px Inter, sans-serif; background: #b91c1c; color: #fff; border: 0; border-radius: 6px; padding: 3px 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  #timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #6366f1; cursor: pointer;
    box-shadow: 0 1px 3px rgba(99,102,241,0.3);
    transition: transform 0.1s ease;
  }
  #timeline-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
  #timeline-slider::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 50%;
    background: #6366f1; cursor: pointer; border: none;
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
  .vol-flyout {
    position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 20;
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
      <label>Tenant</label>
      <input id="tenant-input" type="text" placeholder="tenant-id" style="width:120px;">
      <label>Project</label>
      <select id="project-select" disabled><option value="">-- load tenant first --</option></select>
      <button class="btn btn-primary" id="load-btn">Load</button>
      <button class="btn btn-secondary" id="booth-btn" style="display:none;" title="Record a voiceover while the cut plays (narration booth)">&#127908; Narrate</button>
    </div>
  </header>

  <div id="sidebar">
    <div class="sidebar-header">Scenes</div>
    <div id="scene-list"><div class="empty-state">Load a project</div></div>
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
        <button class="play-btn" id="play-btn" disabled>
          <svg id="play-icon" width="14" height="14" viewBox="0 0 14 14">
            <polygon points="3,1 12,7 3,13"/>
          </svg>
        </button>
        <span id="time-stack"><span id="rate-badge" title="Live media rate: the active segment's mapped speed, and the measured actual advance of the video's clock"></span><span class="time-display" id="time-display"><span id="time-cur">0.0s</span><span id="time-total">0.0s</span></span></span>
      </span>
      <span id="slider-wrap">
        <div id="timeline-track">
        <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="1" disabled>
        <div id="beat-ticks"></div>
        <div id="audio-lanes"></div>
        <div id="cam-pills"></div>
        <div id="media-lane"></div>
        <canvas id="wave-strip"></canvas>
        <div id="word-lane"></div>
        </div>
      </span>
      <span style="display:flex;flex-direction:column;gap:3px;">
        <button id="tl-zoom-in" class="scene-sb-btn" title="Zoom timeline in">+</button>
        <button id="tl-zoom-out" class="scene-sb-btn" title="Zoom timeline out">&minus;</button>
      </span>
      <span class="vol-control" id="vol-control">
        <span class="vol-icon" id="vol-icon" title="Mute / unmute" tabindex="0">&#9834;</span>
        <span class="audio-indicator" id="audio-indicator"></span>
        <span class="vol-flyout"><input type="range" id="vol-slider" min="0" max="100" value="100" step="1"></span>
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
    tenantInput: document.getElementById('tenant-input'),
    projectSelect: document.getElementById('project-select'),
    loadBtn: document.getElementById('load-btn'),
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
      if (!r.ok) throw new Error('API error ' + r.status);
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
      var rate = Math.min(16, Math.max(0.1, s.rate || 1));
      if (s.src_end <= s.src_start) continue;
      var outDur = (s.src_end - s.src_start) / rate;
      if (t < acc + outDur) return { src: s.src_start + (t - acc) * rate, rate: rate, frozen: false };
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
        if (playing && el.paused) { try { el.play().catch(function() {}); } catch (eS) {} }
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
      label = '▶ ' + rate + '×' + meas;
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
        if (window.__MP_SYNCDEBUG && !clip._playFailLogged) {
          clip._playFailLogged = true;
          try { console.log('[play-fail]', (el.currentSrc || el.src || '?').split('/').pop().slice(0, 40), err && err.name, String((err && err.message) || '').slice(0, 100)); } catch (eF) {}
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
    state.audioElements.forEach(function(audio) {
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
      if (audio.paused) audio.play().catch(function() {});
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
    state.tenantId = els.tenantInput.value.trim();
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
      if (attempts > 200) {
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
      html += '<div class="scene-item' + (active ? ' active' : '') + '" data-index="' + i + '">'
        + '<div class="scene-thumb" data-scene-id="' + escHtml(scene.id) + '"></div>'
        + '<div class="scene-info">'
        + '<div class="scene-label">' + (i + 1) + '. ' + escHtml(label) + '</div>'
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
      + (m.w ? ' [box ' + m.w + '\u00d7' + m.h + '%]' : (m.scale ? ' ' + m.scale + '\u00d7' : ''))
      + ' @' + (m.at != null ? Number(m.at).toFixed(1) : '?') + 's'
      + ' \u2192 (' + Math.round(m.x || 50) + '%, ' + Math.round(m.y || 50) + '%)'
      + (m['return'] ? ' \u21a9' : '');
  }

  // Camera moves live on the scrubber: one pill per move, across ALL scenes.
  // Clicking a pill opens the editor popover (edit / preview / delete).
  function renderCamPills() {
    var wrap = document.getElementById('cam-pills');
    if (!wrap) return;
    wrap.innerHTML = '';
    var p = state.currentProject;
    var total = state.totalDuration || calcTotalDuration();
    if (!p || !p.scenes || !(total > 0)) return;
    var placed = [];
    p.scenes.forEach(function(scene, si) {
      (scene.camera_moves || []).forEach(function(m, mi) {
        var t = sceneStartFor(si) + (m.at || 0);
        var pct = Math.max(0, Math.min(100, (t / total) * 100));
        // Moves at (nearly) the same time stack upward instead of hiding
        // each other -- every pill must stay clickable.
        var lift = 0;
        for (var pi = 0; pi < placed.length; pi++) {
          if (Math.abs(placed[pi].pct - pct) < 1.1 && placed[pi].lift === lift) { lift++; pi = -1; }
        }
        placed.push({ pct: pct, lift: lift });
        var pill = document.createElement('div');
        pill.className = 'cam-pill';
        pill.textContent = '\u2922';
        pill.style.left = pct.toFixed(2) + '%';
        if (lift) pill.style.top = (-3 - lift * 16) + 'px';
        pill.title = 'Scene ' + (si + 1) + ': ' + camMoveDesc(m);
        pill.addEventListener('click', function(ev) {
          ev.stopPropagation();
          camPopOpen(si, mi, pill);
        });
        wrap.appendChild(pill);
      });
      // Callout pills: one per screencast-frame callout, same scrubber, a
      // distinct glyph. Click opens the callout editor popover.
      (scene.components || []).forEach(function(comp) {
        if (comp.type !== 'screencast-frame' || !comp.data || !Array.isArray(comp.data.callouts)) return;
        comp.data.callouts.forEach(function(c, ci) {
          var t = sceneStartFor(si) + (c.at || 0);
          var pct = Math.max(0, Math.min(100, (t / total) * 100));
          var lift = 0;
          for (var pi = 0; pi < placed.length; pi++) {
            if (Math.abs(placed[pi].pct - pct) < 1.1 && placed[pi].lift === lift) { lift++; pi = -1; }
          }
          placed.push({ pct: pct, lift: lift });
          var pill = document.createElement('div');
          pill.className = 'cam-pill';
          pill.textContent = '⊙';
          pill.style.left = pct.toFixed(2) + '%';
          pill.style.borderColor = 'rgba(124, 92, 255, 0.8)';
          if (lift) pill.style.top = (-3 - lift * 16) + 'px';
          pill.title = 'Scene ' + (si + 1) + ': callout [' + Math.round(c.w) + '×' + Math.round(c.h) + '%] @' + Number(c.at || 0).toFixed(1) + 's, hold ' + Number(c.dur || 5).toFixed(1) + 's';
          pill.addEventListener('click', function(ev) {
            ev.stopPropagation();
            coPopOpen(si, comp.id, ci, pill);
          });
          wrap.appendChild(pill);
        });
      });
    });
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
      vids.slice(0, 2).forEach(function(v, row) {
        var found = editForVideo(scene, v, vids);
        var rowEl = document.createElement('div');
        rowEl.className = 'ml-row';
        rowEl.style.top = (row * 26) + 'px';
        function block(fromLocal, toLocal, cls, title, onClick, text) {
          var b = document.createElement('div');
          b.className = 'ml-seg ' + cls;
          if (text) b.textContent = text;
          b.style.left = (((sceneStart + fromLocal) / total) * 100).toFixed(2) + '%';
          b.style.width = Math.max(0.3, (((toLocal - fromLocal) / total) * 100)).toFixed(2) + '%';
          b.title = title;
          if (onClick) b.addEventListener('click', function(ev) { ev.stopPropagation(); onClick(b); });
          rowEl.appendChild(b);
        }
        var label = videoLabelFor(v);
        if (!found.edit) {
          block(0, dur, 'r-plain', label + ' — untouched. Click to edit its timing.', function(el2) {
            mediaPopOpen(si, found.key, v, null, -1, el2);
          });
        } else {
          var segs = found.edit.segments || [];
          var acc = 0;
          segs.forEach(function(s, i2) {
            var holdS = (typeof s.hold === 'number' && s.hold > 0) ? s.hold : 0;
            var rate = Math.min(16, Math.max(0.1, s.rate || 1));
            var outDur = holdS || ((s.src_end - s.src_start) / rate);
            var isHold = holdS > 0;
            var cls = isHold ? 'r-freeze' : (rate >= 6 ? 'r-turbo' : (rate > 1.2 ? 'r-fast' : 'r-normal'));
            var from = acc, to = Math.min(dur, acc + outDur);
            var ttl = isHold
              ? (label + ' — HOLD ' + holdS.toFixed(1) + 's on frame ' + s.src_start.toFixed(1) + 's')
              : (label + ' — ' + rate + 'x  src ' + s.src_start.toFixed(1) + '-' + s.src_end.toFixed(1) + 's');
            if (to > from) block(from, to, cls, ttl, (function(idx) {
              return function(el2) { mediaPopOpen(si, found.key, v, found.edit, idx, el2); };
            })(i2), isHold ? 'HOLD' : (rate !== 1 ? (rate + '×') : ''));
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
              var rr = Math.min(16, Math.max(0.1, g2.rate || 1));
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
          cutList.forEach(function(c2) {
            var glen = c2.src_end - c2.src_start;
            if (glen < 0.05) return;
            var chip = document.createElement('div');
            chip.className = 'ml-cut';
            chip.textContent = '✂';
            var pctC = ((sceneStart + Math.min(srcToOut(c2.src_start), dur)) / total) * 100;
            var liftC = 0;
            for (var cs2 = 0; cs2 < chipSpots.length; cs2++) {
              if (Math.abs(chipSpots[cs2].pct - pctC) < 1.2 && chipSpots[cs2].lift === liftC) { liftC++; cs2 = -1; }
            }
            chipSpots.push({ pct: pctC, lift: liftC });
            if (liftC) chip.style.top = (2 - liftC * 20) + 'px';
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

  // Words lane: each beat's voiceover text at its film position. Click a
  // phrase to jump the playhead there -- the alignment anchor for edits.
  // Lane gutter labels + linked badge (ROADMAP #8 stage 3): the timeline
  // reads as SCREEN / SPEAKER / MUSIC tracks, and the recorder's shared cut
  // list shows as an explicit 🔗 instead of an invisible convention.
  function renderLaneLabels() {
    var track = document.getElementById('timeline-track');
    if (!track) return;
    track.querySelectorAll('.lane-label, #lane-link').forEach(function(n) { n.remove(); });
    var p = state.currentProject;
    if (!p) return;
    function lab(text, top) {
      var el = document.createElement('div');
      el.className = 'lane-label';
      el.textContent = text;
      el.style.top = top + 'px';
      track.appendChild(el);
    }
    lab('screen', 2);
    var hasSpeaker = !!(p.speaker && p.speaker.clips && p.speaker.clips.length);
    if (hasSpeaker || (state._transcript && state._transcript.length)) lab('speaker', 96);
    if (((p.audio || {}).tracks || []).some(function(t) { return t.type === 'music'; })) lab('music', 78);
    if (hasSpeaker && p.speaker.clips.length === 1) {
      var spkCuts = (p.speaker.clips[0].edl && p.speaker.clips[0].edl.cuts) || [];
      var scCuts = null;
      (p.scenes || []).forEach(function(s) {
        var m = (s.media_edits || {}).screencast;
        if (m && scCuts === null) scCuts = m.cuts || [];
      });
      if (scCuts !== null && JSON.stringify(spkCuts) === JSON.stringify(scCuts)) {
        var lk = document.createElement('div');
        lk.id = 'lane-link';
        lk.textContent = '\\uD83D\\uDD17 linked';
        lk.style.top = '96px';
        lk.style.left = '58px';
        lk.title = 'Screen and speaker share one cut list: a cut on either removes the same film time from both. Shift-click two words below to cut the span between them.';
        track.appendChild(lk);
      }
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
    btn.style.top = '122px';
    btn.addEventListener('click', function() {
      btn.disabled = true;
      btn.textContent = 'Cutting\\u2026';
      api('POST', '/speaker-cut/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id), { from: Math.max(0, from), to: to })
        .then(function(r) {
          wordCutClear();
          state.currentProject = r.project;
          state.totalDuration = calcTotalDuration();
          state.masterTime = Math.min(state.masterTime, Math.max(0, from - 1));
          studioStatus('\\u2702 Cut ' + r.removed_seconds + 's \\u2014 voice, screen and captions all rippled. Reloading\\u2026', 'ok');
          initAudio();
          renderSceneList();
          startCompositePreview(r.project, { time: state.masterTime });
        })
        .catch(function(e) {
          btn.disabled = false;
          btn.textContent = '\\u2702 Cut failed';
          studioStatus('Cut failed: ' + e.message, 'err');
        });
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
    api('/speaker-waveform/' + state.tenantId + '/' + p.project_id).then(function(r) {
      if (!r || !r.peaks || !r.peaks.length) return;
      var total = state.totalDuration || calcTotalDuration();
      if (!(total > 0)) return;
      var rect = cv.getBoundingClientRect();
      cv.width = Math.max(300, Math.min(8000, Math.round(rect.width)));
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
    }).catch(function() {});
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
    document.querySelectorAll('.cam-pill.active').forEach(function(el) { el.classList.remove('active'); });
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
          : '<label>scale <input id="cp-scale" type="number" min="1.1" max="5" step="0.1" value="' + escAttr('' + (m.scale || 1.8)) + '">\u00d7</label>' +
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

  function togglePlay() {
    if (state.playing) {
      // PAUSE
      if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
      }
      state.playing = false;
      state.playAll = false;
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

      // Update UI
      els.slider.value = totalDur > 0 ? Math.round((globalTime / totalDur) * 1000) : 0;
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
    var totalDur = state.totalDuration;
    if (totalDur <= 0) return;
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
  els.loadBtn.addEventListener('click', function() {
    var selected = els.projectSelect.value;
    if (selected) {
      loadProject(selected);
    } else {
      loadProjects();
    }
  });
  els.tenantInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') loadProjects(); });
  els.projectSelect.addEventListener('change', function() {
    var val = els.projectSelect.value;
    if (val) loadProject(val);
  });
  els.playBtn.addEventListener('click', togglePlay);
  els.slider.addEventListener('input', function() { scrub(parseInt(els.slider.value, 10)); });
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
    boothCard('<h3>&#128220; Drafting script&hellip;</h3><p>Reading the cut &mdash; its real-time spans, timelapses, pages and clicks &mdash; and writing narration timed to the clock. ~15s.</p>');
    api('POST', boothScriptPath(), {}).then(function(j) {
      booth.script = (j.script && j.script.cues) || [];
      boothScriptCard();
    }).catch(function(e) {
      studioStatus('Script drafting failed: ' + e.message, 'err');
      boothIdleCard();
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
    scrub(0);
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
    booth.mon = setInterval(function() {
      if (booth.phase !== 'recording') return;
      boothMute(true); // idempotent guard: audio elements can be rebuilt under us
      if (state.masterTime >= state.totalDuration - 0.05) { boothStopTake(); return; }
      var paused = booth.rec.state === 'paused';
      if (!state.playing && !paused) {
        try { booth.rec.pause(); } catch (e) {}
        boothRecCard(true);
      } else if (state.playing && paused) {
        try { booth.rec.resume(); } catch (e) {}
        boothRecCard(false);
      }
      // A scrub while paused breaks the film-clock == take-clock invariant;
      // flag it so the review card can suggest a retake.
      if (!state.playing && Math.abs(state.masterTime - booth.lastFilmT) > 0.6) booth.desynced = true;
      booth.lastFilmT = state.masterTime;
      boothPrompterTick(state.masterTime);
      var el = document.getElementById('booth-elapsed');
      if (el) el.textContent = fmtTime(state.masterTime) + ' / ' + fmtTime(state.totalDuration);
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
        ? '<video controls playsinline src="' + booth.url + '" style="width:100%;border-radius:10px;margin:8px 0 2px;"></video>'
        : '<audio controls src="' + booth.url + '"></audio>') +
      '<div class="booth-row"><button class="btn btn-primary" id="booth-use">Use this take</button>' +
      '<button class="btn btn-secondary" id="booth-retake">Retake</button>' +
      '<button class="btn btn-secondary" id="booth-discard">Discard</button></div>'
    );
    document.getElementById('booth-use').addEventListener('click', boothUpload);
    document.getElementById('booth-retake').addEventListener('click', function() { boothCountdown(3); });
    document.getElementById('booth-discard').addEventListener('click', boothClose);
  }

  function boothUpload() {
    var p = state.currentProject;
    if (!p || !booth.blob) return;
    booth.phase = 'uploading';
    boothCard('<h3>&#127908; Attaching narration&hellip;</h3><p>Uploading the take, transcribing it, and building captions + chapter cards. This takes a moment.</p>');
    var name = 'booth-take-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
    var url = withToken('/api/booth-narration/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id) + '?name=' + encodeURIComponent(name));
    var opts = { method: 'POST', body: booth.blob, headers: { 'Content-Type': 'application/octet-stream' } };
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
    fetch(url, opts).then(function(r) {
      return r.json().then(function(j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    }).then(function(j) {
      booth.phase = 'done';
      boothCard(
        '<h3>&#10003; Narration attached</h3>' +
        '<p>' + escHtml(j.summary || 'Done.') + '</p>' +
        '<div class="booth-row"><button class="btn btn-primary" id="booth-done">Close</button></div>'
      );
      document.getElementById('booth-done').addEventListener('click', boothClose);
      // Reload so the captions overlay, audio lanes and spine show up.
      loadProject(p.project_id);
    }).catch(function(e) {
      booth.phase = 'review';
      boothCard(
        '<h3>Upload failed</h3><p>' + escHtml(e.message || String(e)) + '</p>' +
        '<div class="booth-row"><button class="btn btn-primary" id="booth-use">Retry</button>' +
        '<button class="btn btn-secondary" id="booth-discard">Discard</button></div>'
      );
      document.getElementById('booth-use').addEventListener('click', boothUpload);
      document.getElementById('booth-discard').addEventListener('click', boothClose);
    });
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

  // Init from URL params
  var params = new URLSearchParams(window.location.search);
  var tenantParam = params.get('tenant');
  if (tenantParam) {
    els.tenantInput.value = tenantParam;
    loadProjects();
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
      }
      node = node.parentElement;
    }
    if (!sceneId) sceneId = studioCurrentSceneId();
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
      drag = null;
      studio.pendingInside = null;
      if (studio.dragBox) studio.dragBox.style.display = 'none';
    };
    function onDown(e) {
      if (studio.busy || e.button !== 0) return;
      drag = { x0: e.clientX, y0: e.clientY, moved: false };
    }
    function onDragMove(e) {
      if (!drag) return;
      var w = Math.abs(e.clientX - drag.x0), h = Math.abs(e.clientY - drag.y0);
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
      if (!d.moved) return; // plain click: onClick handles selection
      studio._justDragged = +new Date();
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
    var h = w; // 16:9 box on a 16:9 canvas
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
      camRow = '<button class="rv-go secondary" id="rv-pop-draw" style="flex:1;" title="Drag on the scene to outline the region the camera should push into">⤢ Draw zoom region…</button>';
    } else {
      camRow = '<button class="rv-go secondary" id="rv-pop-zoom" style="flex:1;" title="Push the camera toward this element so it fills the frame (at the playhead)">⤢ Zoom to this</button>' +
        (selVideo ? '<button class="rv-go secondary" id="rv-pop-zoom-inside" style="flex:1;" title="Draw a box on ' + escAttr(videoLabelFor(selVideo)) + ' -- its footage magnifies inside its frame; everything around it stays put">⊕ Zoom inside…</button>' : '');
    }
    // Speaker bubble selected: direct placement beats prose. Corners + sizes
    // write the component position through the PATCH route -- no LLM, instant.
    var isBubble = !isScene && sel && (sel.compId === 'camera_pip' || sel.compId === 'booth_pip');
    var bubbleRow = isBubble
      ? '<div class="sp-row" style="gap:4px;" title="Place the camera bubble">' +
          ['tl:&#8598;', 'tr:&#8599;', 'bl:&#8601;', 'br:&#8600;'].map(function(c) {
            var p = c.split(':');
            return '<button class="rv-go secondary rv-bub-corner" data-corner="' + p[0] + '" style="flex:1;">' + p[1] + '</button>';
          }).join('') +
          ['S', 'M', 'L'].map(function(s) {
            return '<button class="rv-go secondary rv-bub-size" data-size="' + s + '" style="flex:1;">' + s + '</button>';
          }).join('') +
        '</div>'
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
      '<div class="sp-row">' + camRow + '</div>' +
      '<div class="sp-status" id="rv-pop-status"></div>';
    document.getElementById('rv-pop-x').addEventListener('click', rvPopClose);
    document.getElementById('rv-pop-go').addEventListener('click', rvPopGo);
    document.getElementById('rv-pop-undo').addEventListener('click', studioUndo);
    var zb = document.getElementById('rv-pop-zoom');
    if (zb) zb.addEventListener('click', zoomToSelection);
    var zi = document.getElementById('rv-pop-zoom-inside');
    if (zi) zi.addEventListener('click', zoomInsideSelection);
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
    }
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
      outerHTMLSnippet: studio.sel.outerHTMLSnippet, compType: studio.sel.compType
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
