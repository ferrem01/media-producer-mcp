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
  #slider-wrap { position: relative; flex: 1; display: flex; align-items: center; height: 30px; }
  /* Audio lanes under the scrubber: music coverage + voiceover clip windows. */
  #audio-lanes { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; pointer-events: none; }
  .audio-lane-seg { position: absolute; height: 4px; border-radius: 2px; pointer-events: auto; }
  .audio-lane-seg.music { top: 0; background: linear-gradient(90deg, rgba(99,102,241,0.15), rgba(99,102,241,0.55) 12%, rgba(99,102,241,0.55)); }
  .audio-lane-seg.voiceover { top: 5px; background: #f59e0b; opacity: 0.75; }
  .audio-lane-seg.sfx { top: 5px; background: #10b981; opacity: 0.6; }
  #timeline-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 3px; background: #e5e7eb; border-radius: 3px;
    outline: none; cursor: pointer;
  }
  /* Beat/scene markers over the timeline: scene cuts are strong ticks, beats are soft ticks. */
  #beat-ticks { position: absolute; inset: 0; pointer-events: none; }
  .beat-tick { position: absolute; top: 50%; width: 1px; height: 9px; transform: translateY(-50%); background: #a5b4fc; opacity: 0.75; border-radius: 1px; }
  .beat-tick.scene-cut { width: 2px; height: 13px; background: #6366f1; opacity: 0.9; }
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
  .time-display {
    font-size: 11px; font-variant-numeric: tabular-nums;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    color: #6b7280; min-width: 100px; text-align: right; flex-shrink: 0;
  }

  /* Scene indicator in playback bar */
  .scene-indicator {
    font-size: 11px; color: #6b7280; white-space: nowrap; flex-shrink: 0;
    background: #f3f4f6; padding: 2px 8px; border-radius: 10px;
  }

  /* Audio indicator */
  .audio-indicator {
    font-size: 11px; color: #6b7280; white-space: nowrap; flex-shrink: 0;
    display: flex; align-items: center; gap: 4px;
  }
  .audio-indicator .audio-icon {
    font-size: 13px;
  }
  .audio-indicator.has-audio { color: #6366f1; }

  .vol-control {
    display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  }
  .vol-control .vol-icon { font-size: 13px; color: #6b7280; }
  .vol-control .vol-icon.muted { color: #cbd5e1; }
  #vol-slider { width: 70px; cursor: pointer; accent-color: #6366f1; }

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
        <iframe id="preview-iframe"></iframe>
        <div id="buffer-overlay" class="buffer-overlay"><div class="loading-state">Buffering media<div class="loading-dots"><span></span><span></span><span></span></div></div></div>
      </div>
    </div>

    <div id="playback-bar">
      <button class="play-btn" id="play-btn" disabled>
        <svg id="play-icon" width="14" height="14" viewBox="0 0 14 14">
          <polygon points="3,1 12,7 3,13"/>
        </svg>
      </button>
      <span id="slider-wrap">
        <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="1" disabled>
        <div id="beat-ticks"></div>
        <div id="audio-lanes"></div>
      </span>
      <span class="time-display" id="time-display">0.0s / 0.0s</span>
      <span class="audio-indicator" id="audio-indicator"></span>
      <span class="vol-control" title="Volume">
        <span class="vol-icon" id="vol-icon">&#9834;</span>
        <input type="range" id="vol-slider" min="0" max="100" value="100" step="1">
      </span>
      <span class="scene-indicator" id="scene-indicator"></span>
    </div>
  </div>

  <div id="bottom-panels">
    <div id="storyboard-panel">
      <div class="panel-header">Storyboard &mdash; this scene</div>
      <div id="storyboard-body">
        <div id="sb-preview" class="sb-preview"><div class="sb-prev-text empty">No scene selected</div></div>
        <div class="sb-actions">
          <button class="rv-go secondary" id="sb-edit" style="flex:0 0 auto;" title="Open the storyboard in a larger editor">Edit storyboard</button>
          <button class="rv-go" id="sb-regen" style="flex:1;" title="Rebuild this scene from scratch (storyboard builder + generate + critique) to fulfill the storyboard. Slow.">Regenerate from this storyboard</button>
        </div>
        <div class="sb-hint">Regenerate rebuilds this scene from scratch (slow) to fulfill the storyboard. Edit the storyboard for more room to read and write.</div>
        <div class="rv-status" id="sb-status"></div>
      </div>
    </div>
    <div id="props-panel">
      <div class="panel-header">Revise &mdash; tweak what's there</div>
      <div id="revise-panel">
        <div class="rv-sel" id="rv-sel">Click an element in the scene, or revise the whole scene.</div>
        <div class="rv-scope-row">
          <span class="rv-scope-label">Apply to</span>
          <div class="rv-scope">
            <button id="rv-scope-el" class="active">This element</button>
            <button id="rv-scope-scene">Whole scene</button>
          </div>
        </div>
        <textarea id="rv-input" placeholder="What should change? e.g. make this bigger, use the brand green, move it off her face"></textarea>
        <div style="display:flex;gap:6px;">
          <button class="rv-go" id="rv-go" style="flex:1;">Revise</button>
          <button class="rv-go secondary" id="rv-undo" style="flex:0 0 auto;" title="Undo the last revise on this scene">Undo</button>
        </div>
        <div id="cam-section" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:2px;">
          <div class="rv-scope-label" style="margin-bottom:6px;">Camera &mdash; click to direct</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px;">
            <button class="rv-go" id="cam-add-zoom" style="flex:0 0 auto;padding:6px 10px;" title="Then click the point in the preview to zoom into (at the current playhead time)">&#127909; Zoom at playhead</button>
            <label>into <select id="cam-target" style="font-size:11px;">
              <option value="">whole scene</option>
              <option value="screencast">screencast only</option>
            </select></label>
            <label>scale <input id="cam-scale" type="number" min="1.1" max="4" step="0.1" value="1.8" style="width:48px;"></label>
            <label>ease <input id="cam-dur" type="number" min="0.2" max="3" step="0.1" value="0.8" style="width:44px;">s</label>
            <label>hold <input id="cam-hold" type="number" min="0" max="10" step="0.5" value="1.5" style="width:44px;">s</label>
            <label title="Ease back to wide afterwards"><input id="cam-return" type="checkbox" checked> return</label>
          </div>
          <div id="cam-hint" style="font-size:10px;color:#9ca3af;margin-top:4px;"></div>
          <div id="cam-list" style="display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:11px;color:#374151;"></div>
        <div style="display:none;">
        </div>
        <div class="rv-hint" style="font-size:10px;color:#64748b;margin-top:4px;">Revise makes a surgical edit and keeps the rest of the scene. To rebuild a broken or empty scene, use Regenerate on the left.</div>
        <div class="rv-status" id="rv-status"></div>
      </div>
    </div>
  </div>
</div>

<div id="studio-ctx"></div>

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
    camAddZoom: document.getElementById('cam-add-zoom'),
    camTarget: document.getElementById('cam-target'),
    camScale: document.getElementById('cam-scale'),
    camDur: document.getElementById('cam-dur'),
    camHold: document.getElementById('cam-hold'),
    camReturn: document.getElementById('cam-return'),
    camHint: document.getElementById('cam-hint'),
    camList: document.getElementById('cam-list'),
    previewIframe: document.getElementById('preview-iframe'),
    speakerBg: document.getElementById('speaker-bg'),
    previewContainer: document.getElementById('preview-container'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    slider: document.getElementById('timeline-slider'),
    timeDisplay: document.getElementById('time-display'),
    sceneIndicator: document.getElementById('scene-indicator'),
    bufferOverlay: document.getElementById('buffer-overlay'),
    audioIndicator: document.getElementById('audio-indicator'),
    volSlider: document.getElementById('vol-slider'),
    volIcon: document.getElementById('vol-icon'),
    sbPreview: document.getElementById('sb-preview'),
    propEditor: document.getElementById('prop-editor')
  };

  // Auth token from URL
  var _token = new URLSearchParams(window.location.search).get('token');
  var _urlTenant = new URLSearchParams(window.location.search).get('tenant');

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
          lastOffset: null,
          driftSamples: 0
        });
      }
    } catch(e) {}
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
        syncElement(clip, el, target, playing, false);
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
        var target;
        if (clip.isSpeaker) {
          // Speaker-sourced video: sync to speaker track timeline
          // Uses same trim values as the speaker bg -- single source of truth
          target = time + state.speakerTrimStart;
          if (target > state.speakerTrimEnd) target = state.speakerTrimEnd;
        } else {
          // Regular video asset: start_at is source offset
          target = clip.offset + localTime;
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
    var seekAllowed = !clip._lastSeekTs || (now - clip._lastSeekTs) > 1250;
    var starved = isPlayingMedia && el.readyState < 3;
    function doSeek(t) {
      el.currentTime = t;
      clip._lastSeekTs = now;
      clip.driftSamples = 0;
      clip._wasStarved = false;
    }

    // A starved clip is NEVER seeked -- seeking restarts its buffering, which
    // is the storm's fuel. A frozen frame that catches up beats a shuddering
    // one. The moment it recovers (readyState >= 3), one hard sync realigns it.
    if (starved) { clip._wasStarved = true; }
    var justRecovered = !starved && clip._wasStarved === true;

    // Tier 1: Hard sync (>500ms drift)
    var firstTick = prevOffset === null;
    var offsetJumped = !firstTick && Math.abs(offset - prevOffset) > 0.5;
    if (drift > HARD_SYNC_THRESHOLD && (firstTick || offsetJumped || justRecovered || drift > 3)) {
      if (seekAllowed && !starved) doSeek(target);
      else if (justRecovered && !starved) doSeek(target);
    }
    // Tier 2: Strict sync (>40ms, 2 consecutive -- skip for playing media to avoid stutter)
    else if (!isPlayingMedia && drift > STRICT_SYNC_THRESHOLD) {
      clip.driftSamples = (clip.driftSamples || 0) + 1;
      if (clip.driftSamples >= STRICT_REQUIRED_SAMPLES && seekAllowed) {
        doSeek(target);
      }
    }
    // Tier 3: Force sync (>20ms, on seek/play/pause transitions only)
    else if (!isPlayingMedia && state.forceSync && drift > FORCE_SYNC_THRESHOLD) {
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
      el.play().catch(function(){});
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
      els.audioIndicator.innerHTML = '<span class="audio-icon">\\u266A</span>' + count + ' track' + (count > 1 ? 's' : '');
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
          audio.volume = (voActive ? duckedVolume : audio._baseVolume) * curMv;
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
            renderCamList();
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
        + badgeHtml
        + '</div>'
        + '</div>'
        + '</div>';
    });
    els.sceneList.innerHTML = html;
    renderBeatTicks();
    renderAudioLanes();

    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectScene(parseInt(el.dataset.index, 10));
      });
    });

    els.sceneList.querySelectorAll('.scene-thumb').forEach(function(thumb) {
      if (IS_MOBILE) return; // static tiles -- no live scene runtime per thumbnail
      var sceneId = thumb.dataset.sceneId;
      var path = '/scene-thumbnail/' + state.tenantId + '/' + project.project_id + '/' + sceneId;
      fetchHtml(path).then(function(html) {
        var iframe = document.createElement('iframe');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('tabindex', '-1');
        iframe.srcdoc = html;
        thumb.appendChild(iframe);
      }).catch(function() {});
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
    renderCamList();

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

  // Update scene list active highlight without re-rendering
  function updateActiveScene(index) {
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
    if (!els.sbPreview) return;
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
  var camArm = false;

  function currentSceneEntry() {
    var p = state.currentProject;
    if (!p || state.currentSceneIndex < 0) return null;
    return p.scenes[state.currentSceneIndex] || null;
  }

  function renderCamList() {
    if (!els.camList) return;
    var scene = currentSceneEntry();
    var moves = (scene && scene.camera_moves) || [];
    els.camList.innerHTML = moves.length ? '' : '<span style="color:#9ca3af;">No camera moves on this scene.</span>';
    moves.forEach(function(m, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      var desc = (m.target === 'screencast' ? 'screencast ' : '') + m.type + (m.w ? ' [box ' + m.w + '\u00d7' + m.h + '%]' : (m.scale ? ' ' + m.scale + '\u00d7' : '')) + ' @' + (m.at != null ? m.at.toFixed(1) : '?') + 's \u2192 (' + Math.round(m.x || 50) + '%, ' + Math.round(m.y || 50) + '%)' + (m['return'] ? ' \u21a9' : '');
      var span = document.createElement('span');
      span.textContent = desc;
      span.style.flex = '1';
      var del = document.createElement('button');
      del.textContent = '\u2715';
      del.style.cssText = 'border:0;background:none;color:#9ca3af;cursor:pointer;font-size:11px;';
      del.addEventListener('click', function() {
        var next = moves.slice(); next.splice(i, 1);
        saveCameraMoves(next);
      });
      row.appendChild(span); row.appendChild(del);
      els.camList.appendChild(row);
    });
  }

  function saveCameraMoves(moves) {
    var scene = currentSceneEntry();
    var p = state.currentProject;
    if (!scene || !p) return;
    els.camHint.textContent = 'Saving\u2026';
    api('POST', '/camera-moves/' + state.tenantId + '/' + p.project_id, {
      scene_id: scene.id,
      camera_moves: moves.length ? moves : null,
    }).then(function(r) {
      scene.camera_moves = r.camera_moves && r.camera_moves.length ? r.camera_moves : undefined;
      els.camHint.textContent = 'Saved. Reloading preview\u2026';
      renderCamList();
      // Full composite reboot (same path as project load) with the playhead
      // restored -- a bare re-init leaves the new iframe unseeked (scene
      // content hidden, camera showing through) and media clips stale.
      startCompositePreview(p, { time: state.masterTime, sceneIndex: state.currentSceneIndex });
      els.camHint.textContent = '';
    }).catch(function(e) {
      els.camHint.textContent = 'Save failed: ' + e.message;
    });
  }

  var camOverlay = null;
  var camMarquee = null;
  var camDrag = null;

  function armCameraZoom() {
    var scene = currentSceneEntry();
    if (!scene) { els.camHint.textContent = 'Select a scene first.'; return; }
    if (camOverlay) return;
    camArm = true;
    // Transparent capture overlay: mouse events over the preview land in the
    // IFRAME's document and never reach the wrapper -- an overlay above the
    // iframe is the only way to capture the gesture.
    camOverlay = document.createElement('div');
    camOverlay.style.cssText = 'position:absolute;inset:0;z-index:40;cursor:crosshair;background:rgba(99,102,241,0.04);';
    camMarquee = document.createElement('div');
    camMarquee.style.cssText = 'position:absolute;border:2px solid #6366f1;background:rgba(99,102,241,0.12);border-radius:4px;display:none;pointer-events:none;';
    camOverlay.appendChild(camMarquee);
    camOverlay.addEventListener('mousedown', camOnDown);
    camOverlay.addEventListener('mousemove', camOnMove);
    camOverlay.addEventListener('mouseup', camOnUp);
    els.previewWrapper.appendChild(camOverlay);
    els.camHint.textContent = 'Click a point, or drag a box around the region to fill the frame (Esc cancels).';
  }

  function disarmCameraZoom() {
    camArm = false;
    camDrag = null;
    if (camOverlay) { camOverlay.remove(); camOverlay = null; camMarquee = null; }
    if (els.camHint.textContent.indexOf('Click a point') === 0) els.camHint.textContent = '';
  }

  function camOnDown(ev) {
    ev.preventDefault();
    var box = camOverlay.getBoundingClientRect();
    camDrag = { x0: ev.clientX - box.left, y0: ev.clientY - box.top, box: box, moved: false };
  }

  function camOnMove(ev) {
    if (!camDrag) return;
    var x1 = ev.clientX - camDrag.box.left, y1 = ev.clientY - camDrag.box.top;
    if (Math.abs(x1 - camDrag.x0) + Math.abs(y1 - camDrag.y0) > 8) camDrag.moved = true;
    if (!camDrag.moved) return;
    camMarquee.style.display = 'block';
    camMarquee.style.left = Math.min(camDrag.x0, x1) + 'px';
    camMarquee.style.top = Math.min(camDrag.y0, y1) + 'px';
    camMarquee.style.width = Math.abs(x1 - camDrag.x0) + 'px';
    camMarquee.style.height = Math.abs(y1 - camDrag.y0) + 'px';
  }

  function camOnUp(ev) {
    if (!camDrag) return;
    var d = camDrag; camDrag = null;
    var scene = currentSceneEntry();
    if (!scene) { disarmCameraZoom(); return; }
    var bw = d.box.width, bh = d.box.height;
    var x1 = ev.clientX - d.box.left, y1 = ev.clientY - d.box.top;
    var sceneStart = sceneOffset(state.currentSceneIndex);
    var at = Math.max(0, Math.min((scene.duration_seconds || 5) - 0.2, state.masterTime - sceneStart));
    var move = {
      at: Math.round(at * 10) / 10,
      type: 'zoom',
      duration: parseFloat(els.camDur.value) || 0.8,
      hold: parseFloat(els.camHold.value) || 0,
      'return': !!els.camReturn.checked,
    };
    if (d.moved && Math.abs(x1 - d.x0) > 12 && Math.abs(y1 - d.y0) > 12) {
      // Box gesture: center + dims as canvas %; scale computed at apply time
      // so the outlined region just fills the frame.
      move.x = Math.round(((d.x0 + x1) / 2 / bw) * 100);
      move.y = Math.round(((d.y0 + y1) / 2 / bh) * 100);
      move.w = Math.round((Math.abs(x1 - d.x0) / bw) * 100);
      move.h = Math.round((Math.abs(y1 - d.y0) / bh) * 100);
    } else {
      // Point click: center at the click, scale from the field.
      move.x = Math.round((x1 / bw) * 100);
      move.y = Math.round((y1 / bh) * 100);
      move.scale = parseFloat(els.camScale.value) || 1.8;
    }
    if (els.camTarget && els.camTarget.value) move.target = els.camTarget.value;
    var moves = ((scene.camera_moves) || []).slice();
    moves.push(move);
    disarmCameraZoom();
    saveCameraMoves(moves);
  }

  if (els.camAddZoom) {
    els.camAddZoom.addEventListener('click', armCameraZoom);
    document.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') disarmCameraZoom(); });
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
    state.masterTime += elapsed;

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
      return;
    }


  }

  function updateTimeDisplay(globalTime) {
    var total = state.totalDuration || 0;
    els.timeDisplay.textContent = fmtTime(globalTime || 0) + ' / ' + fmtTime(total);
  }

  function fmtTime(sec) {
    sec = sec || 0;
    if (sec < 60) return sec.toFixed(1) + 's';
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function updateSceneIndicator() {
    var project = state.currentProject;
    if (!project || !project.scenes || state.currentSceneIndex < 0) {
      els.sceneIndicator.textContent = '';
      return;
    }
    els.sceneIndicator.textContent = 'Scene ' + (state.currentSceneIndex + 1) + '/' + project.scenes.length;
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
      }
    } catch (e) {}
    try { var oh = doc.getElementById('__studio_hi'); if (oh) oh.remove(); } catch (e) {}
    try { var os = doc.getElementById('__studio_sel'); if (os) os.remove(); } catch (e) {}

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
    function onClick(e) {
      var el = studioHitTest(doc, e.clientX, e.clientY);
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
    doc.__studioHandlers = { move: onMove, leave: onLeave, click: onClick, ctx: onCtx };
  }

  function studioSelect(el, doc) {
    studio.sel = studioContextOf(el, doc);
    var label = studio.sel.compType || studio.sel.tagName || 'element';
    var txt = studio.sel.text ? ' \\u2014 "' + escHtml(studio.sel.text.slice(0, 40)) + '"' : '';
    document.getElementById('rv-sel').innerHTML = 'Selected: <b>' + escHtml(label) + '</b>' + txt;
    if (studio.selLabel) studio.selLabel.textContent = label + (studio.sel.text ? ' \\u2014 ' + studio.sel.text.slice(0, 32) : '');
    studioSetScope('element');
    studioPositionSel();
    var inp = document.getElementById('rv-input'); if (inp) inp.focus();
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
    studio.scope = scope;
    document.getElementById('rv-scope-el').classList.toggle('active', scope === 'element');
    document.getElementById('rv-scope-scene').classList.toggle('active', scope === 'scene');
  }

  function studioShowCtx(x, y) {
    var m = document.getElementById('studio-ctx');
    m.innerHTML = '';
    function item(label, fn) { var b = document.createElement('button'); b.textContent = label; b.onclick = function() { m.style.display = 'none'; fn(); }; m.appendChild(b); }
    item('Revise this element\\u2026', function() { studioSetScope('element'); document.getElementById('rv-input').focus(); });
    item('Revise whole scene\\u2026', function() { studioSetScope('scene'); document.getElementById('rv-input').focus(); });
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

  function studioStatus(msg, cls) {
    var s = document.getElementById('rv-status');
    s.className = 'rv-status' + (cls ? ' ' + cls : '');
    s.textContent = msg;
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
    var instruction = (document.getElementById('rv-input').value || '').trim();
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
    document.getElementById('rv-go').disabled = true;
    document.getElementById('rv-input').disabled = true;
    var sbRegenR = document.getElementById('sb-regen'); if (sbRegenR) sbRegenR.disabled = true;
    var sbEditR = document.getElementById('sb-edit'); if (sbEditR) sbEditR.disabled = true;
    studioStatus('Revising\\u2026 (' + (studio.scope === 'scene' ? 'whole scene' : 'element') + ')', '');
    studioBusyOverlay(true);

    function done() {
      studio.busy = false;
      document.getElementById('rv-go').disabled = false;
      document.getElementById('rv-input').disabled = false;
      var sr = document.getElementById('sb-regen'); if (sr) sr.disabled = false;
      var ss = document.getElementById('sb-edit'); if (ss) ss.disabled = false;
      studioBusyOverlay(false);
    }
    api('POST', '/revise/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(p.project_id),
        { scene_id: sceneId, instruction: instruction, element: element })
      .then(function(res) {
        done();
        console.log('[studio] revise response:', res);
        if (!res || res.ok === false) { studioStatus('Failed: ' + ((res && res.error) || 'unknown'), 'err'); return; }
        var defs = res.defects || [];
        var n = res.blocks_applied != null ? res.blocks_applied : (res.blocksApplied || 0);
        var full = res.full_rewrite != null ? res.full_rewrite : res.fullRewrite;
        // Always report how much actually changed at the source so a no-op
        // (0 edits) is visible rather than reading as "nothing happened".
        var edits = full ? 'rewrote scene' : (n + ' edit' + (n === 1 ? '' : 's'));
        if (n === 0 && !full) {
          studioStatus('No change applied \\u2014 the revise did not match anything. Try rephrasing, or use Regenerate scene.', 'warn');
        } else if (defs.length) {
          studioStatus('Updated (' + edits + ') \\u26a0 ' + defs.length + ' issue(s): ' + defs.map(function(d) { return d.detail; }).join('; '), 'warn');
        } else {
          studioStatus('Updated \\u2713 (' + edits + ')', 'ok');
        }
        document.getElementById('rv-input').value = '';
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
    document.getElementById('rv-undo').disabled = true;
    document.getElementById('rv-go').disabled = true;
    studioStatus('Undoing\\u2026', '');
    function done() {
      studio.busy = false;
      document.getElementById('rv-undo').disabled = false;
      document.getElementById('rv-go').disabled = false;
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

  function studioUndo() {
    if (studio.busy) return;
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { studioStatus('Select a scene first.', 'warn'); return; }
    var p = state.currentProject; if (!p) { studioStatus('Load a project first.', 'warn'); return; }
    studio.busy = true;
    document.getElementById('rv-undo').disabled = true;
    document.getElementById('rv-go').disabled = true;
    var sbRegenU = document.getElementById('sb-regen'); if (sbRegenU) sbRegenU.disabled = true;
    var sbEditU = document.getElementById('sb-edit'); if (sbEditU) sbEditU.disabled = true;
    studioStatus('Undoing\\u2026', '');
    function done() {
      studio.busy = false;
      document.getElementById('rv-undo').disabled = false;
      document.getElementById('rv-go').disabled = false;
      var sr = document.getElementById('sb-regen'); if (sr) sr.disabled = false;
      var ss = document.getElementById('sb-edit'); if (ss) ss.disabled = false;
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

  // Status line for the Storyboard panel (mirrors studioStatus, separate element).
  function sbStatus(msg, cls) {
    var s = document.getElementById('sb-status');
    if (!s) return;
    s.className = 'rv-status' + (cls ? ' ' + cls : '');
    s.textContent = msg;
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

  // Enable/disable every scene-mutating control at once (revise + storyboard).
  function studioToggleControls(disabled) {
    ['sb-edit', 'sb-regen', 'rv-go', 'rv-undo'].forEach(function(id) {
      var b = document.getElementById(id); if (b) b.disabled = disabled;
    });
  }

  // Open the roomy storyboard editor dialog (the scene's full storyboard entry).
  function openStoryboardEditor() {
    var sceneId = (studio.sel && studio.sel.sceneId) || studioCurrentSceneId();
    if (!sceneId) { sbStatus('Select or load a scene first.', 'warn'); return; }
    var b = studio.sb || {};
    var html =
      '<h3 class="sm-title">Edit scene storyboard</h3>' +
      '<p class="sm-desc">This is the storyboard for this scene. Save to keep it; Regenerate rebuilds the scene to fulfill it.</p>' +
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
        '<button class="sm-btn primary" id="sm-save">Save storyboard</button>' +
      '</div>';
    studioModalOpen(html);
    wireBeatEditor(b.beats || []);
    document.getElementById('sm-cancel').addEventListener('click', studioModalClose);
    document.getElementById('sm-save').addEventListener('click', function() { saveStoryboardFromModal(sceneId); });
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
        studio.sb = storyboardSceneToFields(res.scene);
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

  // Wire the Revise + Storyboard panel controls
  document.getElementById('rv-scope-el').addEventListener('click', function() { studioSetScope('element'); });
  document.getElementById('rv-scope-scene').addEventListener('click', function() { studioSetScope('scene'); });
  document.getElementById('rv-go').addEventListener('click', studioRevise);
  document.getElementById('rv-undo').addEventListener('click', studioUndo);
  document.getElementById('sb-edit').addEventListener('click', openStoryboardEditor);
  document.getElementById('sb-regen').addEventListener('click', studioRegenerate);
  document.getElementById('rv-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); studioRevise(); }
  });
})();
</script>
</body>
</html>`;
}
