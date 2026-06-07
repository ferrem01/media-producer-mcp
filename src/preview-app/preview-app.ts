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
<title>Media Producer</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
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
    margin-top: 2px; display: inline-block;
  }
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
  #timeline-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 3px; background: #e5e7eb; border-radius: 3px;
    outline: none; cursor: pointer;
  }
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
  #layers-panel {
    border-right: 1px solid #e5e7eb;
    overflow-y: auto;
  }
  #layers-panel .panel-header {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #9ca3af;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #f3f4f6;
  }
  .layer-item {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 12px; cursor: pointer; font-size: 12px;
    transition: all 0.15s ease;
    border-left: 3px solid transparent;
  }
  .layer-item:hover { background: #f9fafb; }
  .layer-item.active {
    background: #eef2ff;
    border-left-color: #6366f1;
    color: #6366f1;
  }
  

  .layer-type {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 11px;
  }
  .layer-z {
    font-size: 10px; color: #9ca3af;
    background: #f3f4f6; padding: 1px 6px; border-radius: 10px;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
  }

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
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>Media Producer</h1>
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
        <video id="speaker-bg" muted playsinline preload="auto" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none;border-radius:8px;"></video>
        <iframe id="preview-iframe"></iframe>
      </div>
    </div>

    <div id="playback-bar">
      <button class="play-btn" id="play-btn" disabled>
        <svg id="play-icon" width="14" height="14" viewBox="0 0 14 14">
          <polygon points="3,1 12,7 3,13"/>
        </svg>
      </button>
      <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="1" disabled>
      <span class="time-display" id="time-display">0.0s / 0.0s</span>
      <span class="audio-indicator" id="audio-indicator"></span>
      <span class="scene-indicator" id="scene-indicator"></span>
    </div>
  </div>

  <div id="bottom-panels">
    <div id="layers-panel">
      <div class="panel-header">Component Layers</div>
      <div id="layer-list"><div class="empty-state">No scene selected</div></div>
    </div>
    <div id="props-panel">
      <div class="panel-header">Prop Editor</div>
      <div id="prop-editor"><div class="empty-state">Select a component</div></div>
    </div>
  </div>
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
    // Master clock
    masterTime: 0,
    lastTickTime: 0,
    // Scene HTML cache (keyed by scene id)
    sceneHtmlCache: {}
  };

  // DOM refs
  var els = {
    tenantInput: document.getElementById('tenant-input'),
    projectSelect: document.getElementById('project-select'),
    loadBtn: document.getElementById('load-btn'),
    sceneList: document.getElementById('scene-list'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewWrapper: document.getElementById('preview-wrapper'),
    previewIframe: document.getElementById('preview-iframe'),
    speakerBg: document.getElementById('speaker-bg'),
    previewContainer: document.getElementById('preview-container'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    slider: document.getElementById('timeline-slider'),
    timeDisplay: document.getElementById('time-display'),
    sceneIndicator: document.getElementById('scene-indicator'),
    audioIndicator: document.getElementById('audio-indicator'),
    layerList: document.getElementById('layer-list'),
    propEditor: document.getElementById('prop-editor')
  };

  // Auth token from URL
  var _token = new URLSearchParams(window.location.search).get('token');
  var _urlTenant = new URLSearchParams(window.location.search).get('tenant');

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
    return fetch('/api' + path, opts).then(function(r) {
      if (!r.ok) throw new Error('API error ' + r.status);
      return r.json();
    });
  }

  // Fetch HTML with auth (for srcdoc approach)
  function fetchHtml(path) {
    var opts = { headers: {} };
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
    return fetch('/api' + path, opts).then(function(r) {
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

  // Start or resume audio. Never resets currentTime on resume.
  function playAudio() {
    if (state.musicStarted) {
      // RESUME: just call play() on all paused tracks. No currentTime reset.
      state.audioElements.forEach(function(audio) {
        if (audio.paused) audio.play().catch(function() {});
      });
      startDucking();
      return;
    }

    // FIRST PLAY: start everything from the beginning
    state.audioElements.forEach(function(audio) {
      audio.currentTime = 0;
      audio.volume = audio._baseVolume;

      // Apply fade-in if configured
      if (audio._fadeIn > 0) {
        audio.volume = 0;
        var targetVol = audio._baseVolume;
        var fadeSteps = Math.ceil(audio._fadeIn * 20);
        var step = 0;
        var fadeInterval = setInterval(function() {
          step++;
          audio.volume = Math.min(targetVol, (step / fadeSteps) * targetVol);
          if (step >= fadeSteps) clearInterval(fadeInterval);
        }, 50);
      }

      audio.play().catch(function() {});
    });
    state.musicStarted = true;
    startDucking();
  }

  // Pause only non-music audio. Music keeps playing.
  function pauseMusicKeepPlaying() {
    state.audioElements.forEach(function(audio) {
      if (audio._trackType !== 'music') {
        audio.pause();
      }
    });
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

    state.audioDuckingInterval = setInterval(function() {
      var voActive = false;
      state.audioElements.forEach(function(audio) {
        if (audio._trackType === 'voiceover' && !audio.paused && audio.currentTime > 0) {
          voActive = true;
        }
      });

      state.audioElements.forEach(function(audio) {
        if (audio._trackType === 'music') {
          audio.volume = voActive ? duckedVolume : audio._baseVolume;
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
        audio.volume = audio._baseVolume;
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

  function preloadScenes(project) {
    state.sceneHtmlCache = {};
    // Preload the speaker video alongside scenes
    preloadSpeakerVideo();
    if (!project || !project.scenes || !project.scenes.length) return Promise.resolve();
    var promises = project.scenes.map(function(scene) {
      var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
      return fetchHtml(path).then(function(html) {
        state.sceneHtmlCache[scene.id] = html;
      }).catch(function() {
        state.sceneHtmlCache[scene.id] = null;
      });
    });
    return Promise.all(promises);
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

      // Show loading state while preloading scenes
      els.previewPlaceholder.innerHTML = '<div class="loading-state">Preloading scenes<div class="loading-dots"><span></span><span></span><span></span></div></div>';
      els.previewPlaceholder.style.display = '';

      preloadScenes(project).then(function() {
        els.previewPlaceholder.textContent = 'Select a scene to preview';
        if (project.scenes && project.scenes.length > 0) {
          selectScene(0);
        }
      });
    }).catch(function() {
      els.sceneList.innerHTML = '<div class="empty-state">Failed to load project</div>';
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
      html += '<div class="scene-item' + (active ? ' active' : '') + '" data-index="' + i + '">'
        + '<div class="scene-thumb" data-scene-id="' + escHtml(scene.id) + '"></div>'
        + '<div class="scene-info">'
        + '<div class="scene-label">' + (i + 1) + '. ' + escHtml(label) + '</div>'
        + '<span class="scene-dur">' + (scene.duration_seconds || 0).toFixed(1) + 's</span>'
        + '</div>'
        + '</div>';
    });
    els.sceneList.innerHTML = html;

    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectScene(parseInt(el.dataset.index, 10));
      });
    });

    els.sceneList.querySelectorAll('.scene-thumb').forEach(function(thumb) {
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

    // Update master time to match this scene's start
    state.masterTime = sceneOffset(index);

    // Don't touch music audio on manual scene click. Only pause voiceover/sfx.
    pauseMusicKeepPlaying();

    updateActiveScene(index);
    // Speaker track: show/hide background video
    if (isSpeakerScene(index)) {
      showSpeakerBg(state.masterTime);
    } else {
      hideSpeakerBg();
    }
    loadPreview();
    renderLayers();
    clearProps();
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

  // ── Scene Transition Support ──
  // Get the GSAP script for a transition type (matches render pipeline transitions.ts)
  function getTransitionGsap(type, dur) {
    switch (type) {
      case 'crossfade':
        return 'gsap.set(imgB, { autoAlpha: 0 }); tl.to(imgA, { autoAlpha: 0, duration: dur }, 0); tl.to(imgB, { autoAlpha: 1, duration: dur }, 0);';
      case 'blur-crossfade':
        return 'gsap.set(imgB, { autoAlpha: 0, filter: "blur(20px)" }); tl.to(imgA, { autoAlpha: 0, filter: "blur(20px)", duration: dur }, 0); tl.to(imgB, { autoAlpha: 1, filter: "blur(0px)", duration: dur }, 0);';
      case 'zoom-through':
        return 'var halfDur = dur * 0.5; tl.to(imgA, { scale: 1.5, autoAlpha: 0, duration: halfDur, ease: "power2.in" }, 0); gsap.set(imgB, { scale: 1.5, autoAlpha: 0 }); tl.to(imgB, { scale: 1, autoAlpha: 1, duration: halfDur, ease: "power2.out" }, halfDur);';
      case 'slide-up':
        return 'gsap.set(imgB, { yPercent: 100 }); imgB.style.zIndex = "2"; tl.to(imgB, { yPercent: 0, duration: dur, ease: "power2.inOut" }, 0);';
      case 'slide-down':
        return 'gsap.set(imgB, { yPercent: -100 }); imgB.style.zIndex = "2"; tl.to(imgB, { yPercent: 0, duration: dur, ease: "power2.inOut" }, 0);';
      case 'slide-left':
      case 'slide-reveal':
        return 'gsap.set(imgB, { xPercent: 100 }); imgB.style.zIndex = "2"; tl.to(imgB, { xPercent: 0, duration: dur, ease: "power2.inOut" }, 0);';
      case 'morph-wipe':
      case 'iris':
        return 'gsap.set(imgB, { clipPath: "circle(0% at 50% 50%)" }); imgB.style.zIndex = "2"; tl.to(imgB, { clipPath: "circle(150% at 50% 50%)", duration: dur, ease: "power2.inOut" }, 0);';
      case 'push':
        return 'gsap.set(imgB, { xPercent: 100 }); tl.to(imgA, { xPercent: -100, duration: dur, ease: "power2.inOut" }, 0); tl.to(imgB, { xPercent: 0, duration: dur, ease: "power2.inOut" }, 0);';
      case 'glitch-cut':
        return 'var glitchDur = Math.min(dur * 0.6, 0.3); gsap.set(imgB, { autoAlpha: 0 }); tl.to(imgA, { x: "+=8", filter: "hue-rotate(90deg) saturate(3)", duration: glitchDur * 0.15, yoyo: true, repeat: 5, ease: "steps(1)" }, 0); tl.set(imgA, { autoAlpha: 0 }, dur - 0.05); tl.set(imgB, { autoAlpha: 1 }, dur - 0.05);';
      default:
        return 'gsap.set(imgB, { autoAlpha: 0 }); tl.to(imgA, { autoAlpha: 0, duration: dur }, 0); tl.to(imgB, { autoAlpha: 1, duration: dur }, 0);';
    }
  }

  // Build transition HTML from two data URI frames
  function buildTransitionHtml(frameADataUri, frameBDataUri, type, duration, width, height, gsapSrc) {
    var animScript = getTransitionGsap(type, duration);
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'html, body { width: ' + width + 'px; height: ' + height + 'px; overflow: hidden; background: #000; }' +
      '#frameA, #frameB { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }' +
      "</style><scr" + "ipt>" + gsapSrc + "</scr" + "ipt></head><body>" +
      '<img id="frameA" src="' + frameADataUri + '">' +
      '<img id="frameB" src="' + frameBDataUri + '">' +
      "<scr" + "ipt>(function() {" +
      'var imgA = document.getElementById("frameA"); var imgB = document.getElementById("frameB");' +
      'var dur = ' + duration + '; var tl = gsap.timeline({ paused: true });' +
      animScript +
      'window.__MP_TIMELINE = tl; window.__MP_DURATION = dur; window.__MP_READY = true;' +
      "})();</scr" + "ipt></body></html>";
  }

  // Capture the current iframe content as a data URI using html2canvas
  function captureIframeAsDataUri(callback) {
    try {
      var doc = els.previewIframe.contentDocument || els.previewIframe.contentWindow.document;
      var body = doc.body || doc.documentElement;
      html2canvas(body, {
        width: els.previewIframe.width,
        height: els.previewIframe.height,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#000',
      }).then(function(canvas) {
        callback(canvas.toDataURL('image/jpeg', 0.85));
      }).catch(function() {
        callback(null);
      });
    } catch(e) {
      callback(null);
    }
  }

  // GSAP source cache for transition HTML
  var _gsapSrcCache = null;
  function getGsapSource(callback) {
    if (_gsapSrcCache) { callback(_gsapSrcCache); return; }
    // Fetch GSAP from one of the scene HTML pages (it's embedded)
    var project = state.currentProject;
    if (project && project.scenes && project.scenes.length > 0) {
      var sceneHtml = state.sceneHtmlCache[project.scenes[0].id];
      if (sceneHtml) {
        // Extract GSAP source from between the first <script> tags
        var match = sceneHtml.match(new RegExp('<' + 'script>([\\s\\S]*?gsap[\\s\\S]*?)</' + 'script>'));
        if (match) { _gsapSrcCache = match[1]; callback(_gsapSrcCache); return; }
      }
    }
    // Fallback: fetch from CDN
    fetch('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')
      .then(function(r) { return r.text(); })
      .then(function(src) { _gsapSrcCache = src; callback(src); })
      .catch(function() { callback(''); });
  }

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

  // Preview loading - uses cache, falls back to fetch
  function loadPreview() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene) { clearPreview(); return; }

    var cachedHtml = state.sceneHtmlCache[scene.id];

    function applyHtml(html) {
      writeSceneToIframe(html);

      state.duration = scene.duration_seconds || 0;
      state.totalDuration = calcTotalDuration();
      els.slider.disabled = false;
      els.playBtn.disabled = false;
      var globalTime = sceneOffset(state.currentSceneIndex);
      els.slider.value = state.totalDuration > 0 ? Math.round((globalTime / state.totalDuration) * 1000) : 0;
      updateTimeDisplay(globalTime);
      updateSceneIndicator();

      waitForReady(function(tl) {
        tl.pause();
        tl.time(0);
      });
    }

    if (cachedHtml != null) {
      applyHtml(cachedHtml);
    } else {
      // Fallback: fetch if not in cache
      var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
      fetchHtml(path).then(function(html) {
        state.sceneHtmlCache[scene.id] = html;
        applyHtml(html);
      }).catch(function() {
        clearPreview();
      });
    }
  }

  function waitForReady(cb) {
    var attempts = 0;
    var check = setInterval(function() {
      attempts++;
      try {
        var w = els.previewIframe.contentWindow;
        if (w && w.__MP_READY && w.__MP_TIMELINE) {
          clearInterval(check);
          cb(w.__MP_TIMELINE);
        }
      } catch(e) { clearInterval(check); }
      if (attempts > 100) clearInterval(check);
    }, 50);
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

  function renderLayers() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene || !scene.components || !scene.components.length) {
      els.layerList.innerHTML = '<div class="empty-state">No components</div>';
      return;
    }

    var comps = scene.components.map(function(c, i) { return { comp: c, originalIndex: i }; });
    comps.sort(function(a, b) { return (b.comp.z_index || 0) - (a.comp.z_index || 0); });

    var html = '';
    comps.forEach(function(item) {
      var c = item.comp;
      var active = item.originalIndex === state.currentComponentIndex;
      html += '<div class="layer-item' + (active ? ' active' : '') + '" data-index="' + item.originalIndex + '">'
        + '<span class="layer-type">' + escHtml(c.type) + '</span>'
        + '<span class="layer-z">z:' + (c.z_index || 0) + '</span>'
        + '</div>';
    });
    els.layerList.innerHTML = html;

    els.layerList.querySelectorAll('.layer-item').forEach(function(el) {
      el.addEventListener('click', function() {
        state.currentComponentIndex = parseInt(el.dataset.index, 10);
        renderLayers();
        renderProps();
      });
    });
  }

  function clearLayers() {
    state.currentComponentIndex = -1;
    els.layerList.innerHTML = '<div class="empty-state">No scene selected</div>';
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
    var info = sceneForGlobalTime(savedMasterTime);
    var savedLocalTime = info ? info.localTime : 0;

    var patchPath = '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    api('PATCH', patchPath, { data: comp.data }).then(function(result) {
      // Invalidate the cached scene HTML and re-fetch fresh
      var scenePath = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
      fetchHtml(scenePath).then(function(freshHtml) {
        state.sceneHtmlCache[scene.id] = freshHtml;
        // Write to iframe immediately
        writeSceneToIframe(freshHtml);
        // Re-init the timeline at the same position it was at
        waitForReady(function(tl) {
          tl.time(Math.min(savedLocalTime, tl.duration() || savedLocalTime));
          tl.pause();
        });
      });
    }).catch(function(e) {
      console.error('Save failed:', e);
    });
  }



  // Timeline / Playback
  function getTimeline() {
    try { return els.previewIframe.contentWindow && els.previewIframe.contentWindow.__MP_TIMELINE; }
    catch(e) { return null; }
  }

  // Sync <video> elements inside the preview iframe to the scene local time.
  // For live preview: let video play naturally, only seek on large drift or scrub.
  // For capture mode the scene-worker handles frame-by-frame seeking.
  function syncIframeVideos(localTime, forceSeek) {
    try {
      var iframeDoc = els.previewIframe.contentWindow && els.previewIframe.contentWindow.document;
      if (!iframeDoc) return;
      var videos = iframeDoc.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        var startAt = parseFloat(v.getAttribute('data-start-at') || '0');
        var target = Math.max(0, localTime - startAt);
        if (forceSeek || !v._synced) {
          v.currentTime = target;
          v._synced = true;
        } else {
          // Tight drift correction (0.15s) keeps multi-video grids in sync
          if (Math.abs(v.currentTime - target) > 0.15) v.currentTime = target;
        }
        // Ensure video is playing during playback
        if (state.playing && v.paused && target < v.duration) {
          v.play().catch(function(){});
        }
      }
    } catch(e) {}
  }

  // Find which scene a global time falls in, returns { index, localTime }
  function sceneForGlobalTime(globalTime) {
    var project = state.currentProject;
    if (!project || !project.scenes || !project.scenes.length) return { index: 0, localTime: 0 };
    var cumulative = 0;
    for (var i = 0; i < project.scenes.length; i++) {
      var sd = project.scenes[i].duration_seconds || 0;
      if (globalTime < cumulative + sd) {
        return { index: i, localTime: globalTime - cumulative };
      }
      cumulative += sd;
    }
    // Past the end - clamp to last scene's end
    var lastIdx = project.scenes.length - 1;
    return { index: lastIdx, localTime: project.scenes[lastIdx].duration_seconds || 0 };
  }

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
    // Speaker scenes have transparent_background=true and a speaker_track defined
    return scene.transparent_background === true;
  }

  function showSpeakerBg(globalTime) {
    var video = els.speakerBg;
    if (!video) return;
    var clipUrl = getSpeakerClipUrl();
    if (!clipUrl) { video.style.display = 'none'; return; }
    // Set src if needed
    if (!video.src || video.src === '' || video.src === window.location.href) {
      video.src = clipUrl;
      video.load();
    }
    // Make iframe transparent so speaker shows through
    els.previewIframe.style.background = 'transparent';
    // Always show the video element -- let it buffer visually
    video.style.display = 'block';
    // Sync time
    var target = globalTime || 0;
    video.currentTime = target;
    if (video.paused) video.play().catch(function(){});
  }

  function hideSpeakerBg() {
    var video = els.speakerBg;
    if (!video) return;
    video.style.display = 'none';
    video.pause();
    els.previewIframe.style.background = '#000';
  }

  function syncSpeakerBg(globalTime) {
    if (!isSpeakerScene(state.currentSceneIndex)) return;
    var video = els.speakerBg;
    if (!video || video.style.display === 'none') return;
    var target = globalTime || 0;
    if (Math.abs(video.currentTime - target) > 0.5) {
      video.currentTime = target;
    }
    if (state.playing && video.paused) {
      video.play().catch(function(){});
    } else if (!state.playing && !video.paused) {
      video.pause();
    }
  }

  function togglePlay() {
    if (state.playing) {
      // PAUSE - just save masterTime and stop the loop
      if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
      }
      state.playing = false;
      state.playAll = false;
      updatePlayIcon();
      var tl = getTimeline();
      if (tl) tl.pause();
      pauseAudio();
      // Pause speaker background video
      if (els.speakerBg && !els.speakerBg.paused) els.speakerBg.pause();
    } else {
      // RESUME / PLAY
      state.playing = true;
      state.playAll = true;
      updatePlayIcon();

      var globalTime = state.masterTime || 0;
      var info = sceneForGlobalTime(globalTime);
      var project = state.currentProject;

      if (info.index !== state.currentSceneIndex && project && project.scenes) {
        // Need to switch scene
        state.currentSceneIndex = info.index;
        state.currentComponentIndex = -1;
        state.duration = project.scenes[info.index].duration_seconds || 0;
        updateActiveScene(info.index);
        renderLayers();
        clearProps();
        updateSceneIndicator();

        var scene = project.scenes[info.index];
        var html = state.sceneHtmlCache[scene.id];
        if (html != null) {
          writeSceneToIframe(html);
          waitForReady(function(newTl) {
            newTl.time(Math.min(info.localTime, newTl.duration()));
            newTl.play();
            state.lastTickTime = performance.now();
            playAudio();
            syncAudioToGlobalTime(globalTime);
            animLoop();
          });
        }
        return;
      }

      // Same scene - seek GSAP timeline and play
      var tl = getTimeline();
      if (tl) {
        tl.time(Math.min(info.localTime, tl.duration()));
        tl.play();
      }

      state.lastTickTime = performance.now();
      playAudio();
      syncAudioToGlobalTime(globalTime);
      animLoop();
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

    // Clamp to total duration
    if (globalTime >= totalDur) {
      state.masterTime = totalDur;
      globalTime = totalDur;
      // Playback complete
      stopPlayback();
      var tl = getTimeline();
      if (tl) tl.pause();
      stopAudioFull();
      updateTimeDisplay(globalTime);
      els.slider.value = 1000;
      return;
    }

    // Update UI
    els.slider.value = totalDur > 0 ? Math.round((globalTime / totalDur) * 1000) : 0;
    updateTimeDisplay(globalTime);

    // Keep audio in sync (correct drift > 0.3s)
    state.audioElements.forEach(function(audio) {
      if (audio.paused) return;
      var dur = audio.duration;
      if (!dur || !isFinite(dur)) return;

      if (audio._trackType === 'music' && audio.loop) {
        // Looping music: sync to globalTime modulo duration
        var expectedTime = globalTime % dur;
        if (Math.abs(audio.currentTime - expectedTime) > 0.5) {
          audio.currentTime = expectedTime;
        }
      } else {
        // Non-looping tracks (voiceover, sfx): if track has ended, leave it alone
        if (globalTime >= dur) return;
        if (Math.abs(audio.currentTime - globalTime) > 0.5) {
          audio.currentTime = Math.min(globalTime, dur);
        }
      }
    });

    // Determine which scene we should be on based on master clock
    var info = sceneForGlobalTime(globalTime);

    if (info.index !== state.currentSceneIndex && state.playAll) {
      // Scene transition - use cached HTML, no network fetch
      var project = state.currentProject;
      state.currentSceneIndex = info.index;
      state.currentComponentIndex = -1;
      updateActiveScene(info.index);
      renderLayers();
      clearProps();
      updateSceneIndicator();

      var scene = project.scenes[info.index];
      state.duration = scene.duration_seconds || 0;
      var html = state.sceneHtmlCache[scene.id];

      if (html != null) {
        // Check if we need to play a transition
        var transIn = project.scenes[info.index] && project.scenes[info.index].transition_in;
        if (false && transIn && transIn.type && transIn.duration_seconds > 0 && !state._inTransition) {
          state._inTransition = true;
          var transDuration = transIn.duration_seconds;

          // Capture outgoing scene
          captureIframeAsDataUri(function(frameAUri) {
            if (!frameAUri) {
              // Capture failed, just do a hard cut
              state._inTransition = false;
              if (isSpeakerScene(info.index)) { showSpeakerBg(state.masterTime); } else { hideSpeakerBg(); }
              writeSceneToIframe(html);
              waitForReady(function(newTl) {
                var seekTime = Math.min(info.localTime, newTl.duration());
                newTl.time(seekTime); newTl.play();
                syncIframeVideos(seekTime);
                try { var vids = els.previewIframe.contentWindow.document.querySelectorAll('video'); for (var vi = 0; vi < vids.length; vi++) vids[vi].play().catch(function(){}); } catch(e) {}
              });
              return;
            }

            // Render incoming scene in a hidden iframe to capture its first frame
            // First write the incoming scene to get frame B
            if (isSpeakerScene(info.index)) { showSpeakerBg(state.masterTime); } else { hideSpeakerBg(); }
            writeSceneToIframe(html);
            waitForReady(function(newTl) {
              newTl.time(0);
              // Small delay to let the first frame render
              setTimeout(function() {
                captureIframeAsDataUri(function(frameBUri) {
                  if (!frameBUri) {
                    // Just play scene B normally
                    var seekTime = Math.min(info.localTime, newTl.duration());
                    newTl.time(seekTime); newTl.play();
                    syncIframeVideos(seekTime);
                    state._inTransition = false;
                    return;
                  }

                  // Build and play the transition
                  var w = (project.canvas && project.canvas.width) || 1920;
                  var h = (project.canvas && project.canvas.height) || 1080;
                  getGsapSource(function(gsapSrc) {
                    var transHtml = buildTransitionHtml(frameAUri, frameBUri, transIn.type, transDuration, w, h, gsapSrc);
                    writeSceneToIframe(transHtml);
                    waitForReady(function(transTl) {
                      transTl.play();

                      // After transition completes, swap to scene B
                      setTimeout(function() {
                        state._inTransition = false;
                        if (isSpeakerScene(info.index)) { showSpeakerBg(state.masterTime); } else { hideSpeakerBg(); }
                        writeSceneToIframe(html);
                        waitForReady(function(sceneTl) {
                          // Seek past the transition duration into the scene
                          var seekTime = Math.min(transDuration + info.localTime, sceneTl.duration());
                          sceneTl.time(seekTime); sceneTl.play();
                          syncIframeVideos(seekTime);
                          try { var vids = els.previewIframe.contentWindow.document.querySelectorAll('video'); for (var vi = 0; vi < vids.length; vi++) vids[vi].play().catch(function(){}); } catch(e) {}
                        });
                      }, transDuration * 1000 + 50);
                    });
                  });
                });
              }, 100);
            });
          });
          return;
        }

        // No transition -- standard scene change
        state._inTransition = false;
        // Speaker track: show/hide background video on scene transition
        if (isSpeakerScene(info.index)) {
          showSpeakerBg(state.masterTime);
        } else {
          hideSpeakerBg();
        }
        writeSceneToIframe(html);
        waitForReady(function(newTl) {
          // Seek GSAP to match master clock's local time
          var seekTime = Math.min(info.localTime, newTl.duration());
          newTl.time(seekTime);
          newTl.play();
          // Start video playback and sync to scene time
          syncIframeVideos(seekTime);
          try {
            var vids = els.previewIframe.contentWindow.document.querySelectorAll('video');
            for (var vi = 0; vi < vids.length; vi++) vids[vi].play().catch(function(){});
          } catch(e) {}
          // Continue the loop (don't restart - just keep going)
        });
      }
    } else {
      // Same scene - seek GSAP timeline to stay in sync
      var tl = getTimeline();
      if (tl) {
        var localTime = info.localTime;
        // Only seek if GSAP is behind/ahead (GSAP animation may be shorter than scene duration)
        if (localTime <= tl.duration()) {
          // Let GSAP play naturally, but correct if drifted
          var drift = Math.abs(tl.time() - localTime);
          if (drift > 0.1) {
            tl.time(localTime);
          }
        }
        // If localTime > tl.duration(), GSAP stays at its end frame (visual holds)
      }
      // Keep video elements in sync with scene time
      syncIframeVideos(info.localTime);
      syncSpeakerBg(state.masterTime);
    }

    state.animFrameId = requestAnimationFrame(animLoop);
  }

  function scrub(sliderVal) {
    var totalDur = state.totalDuration;
    if (totalDur <= 0) return;
    var targetGlobal = (sliderVal / 1000) * totalDur;

    var project = state.currentProject;
    if (!project || !project.scenes) return;

    // Update master clock
    state.masterTime = targetGlobal;

    var info = sceneForGlobalTime(targetGlobal);

    updateTimeDisplay(targetGlobal);
    syncAudioToGlobalTime(targetGlobal);

    if (info.index !== state.currentSceneIndex) {
      state.currentSceneIndex = info.index;
      state.currentComponentIndex = -1;
      state.duration = project.scenes[info.index].duration_seconds || 0;
      updateActiveScene(info.index);
      renderLayers();
      clearProps();
      updateSceneIndicator();

      var scene = project.scenes[info.index];
      var wasPlaying = state.playing;
      stopPlayback();
      pauseMusicKeepPlaying();

      var html = state.sceneHtmlCache[scene.id];
      if (html != null) {
        writeSceneToIframe(html);
        waitForReady(function(tl) {
          tl.time(Math.min(info.localTime, tl.duration()));
          tl.pause();
        });
      } else {
        // Fallback fetch
        var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
        fetchHtml(path).then(function(fetchedHtml) {
          state.sceneHtmlCache[scene.id] = fetchedHtml;
          writeSceneToIframe(fetchedHtml);
          waitForReady(function(tl) {
            tl.time(Math.min(info.localTime, tl.duration()));
            tl.pause();
          });
        });
      }
    } else {
      var tl = getTimeline();
      if (tl) {
        tl.time(Math.min(info.localTime, tl.duration()));
        syncIframeVideos(info.localTime, true);
        tl.pause();
        stopPlayback();
        pauseMusicKeepPlaying();
      }
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

  // Init from URL params
  var params = new URLSearchParams(window.location.search);
  var tenantParam = params.get('tenant');
  if (tenantParam) {
    els.tenantInput.value = tenantParam;
    loadProjects();
  }
})();
</script>
</body>
</html>`;
}
