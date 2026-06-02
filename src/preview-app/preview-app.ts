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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    font-family: 'Inter', -apple-system, sans-serif;
    background: #f8fafc;
    color: #1e293b;
    overflow: hidden;
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
    border-bottom: 1px solid #e2e8f0;
  }
  header h1 { font-size: 14px; font-weight: 600; color: #1e293b; white-space: nowrap; }
  .header-controls {
    display: flex; align-items: center; gap: 8px; margin-left: auto;
  }
  .header-controls label { font-size: 12px; color: #64748b; }
  .header-controls input, .header-controls select {
    background: #f8fafc; border: 1px solid #e2e8f0; color: #1e293b;
    padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: inherit;
    outline: none;
  }
  .header-controls input:focus, .header-controls select:focus { border-color: #7c3aed; }
  .header-controls select { min-width: 180px; }
  .btn {
    padding: 5px 12px; border: none; border-radius: 4px;
    font-size: 12px; font-weight: 500; font-family: inherit;
    cursor: pointer; transition: background 0.15s;
  }
  .btn-primary { background: #7c3aed; color: #fff; }
  .btn-primary:hover { background: #6d28d9; }
  .btn-secondary { background: #e2e8f0; color: #1e293b; }
  .btn-secondary:hover { background: #cbd5e1; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Sidebar - spans rows 2 and 3 */
  #sidebar {
    grid-row: 2 / 4;
    background: #ffffff;
    border-right: 1px solid #e2e8f0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #64748b;
    padding: 12px 12px 8px;
  }
  .scene-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 12px;
    border-left: 3px solid transparent;
    transition: background 0.1s;
    background: #ffffff;
  }
  .scene-item:hover { background: #f1f5f9; }
  .scene-item.active {
    background: #f1f5f9;
    border-left-color: #7c3aed;
    color: #1e293b;
  }
  .scene-thumb {
    width: 64px; height: 36px;
    border-radius: 3px; background: #f1f5f9;
    border: 1px solid #e2e8f0;
    flex-shrink: 0; overflow: hidden;
    position: relative;
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
    font-size: 12px;
  }
  .scene-dur {
    font-size: 10px; color: #64748b;
    background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
    margin-top: 2px; display: inline-block;
  }
  .empty-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #94a3b8; font-size: 12px; text-align: center; padding: 16px;
  }

  /* Main */
  #main {
    display: flex; flex-direction: column; overflow: hidden; background: #f1f5f9;
  }
  #preview-container {
    flex: 1; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .preview-wrapper { position: relative; }
  #preview-iframe {
    background: #000; border: none;
    box-shadow: 0 2px 16px rgba(0,0,0,0.12);
    border-radius: 4px;
    transform-origin: top left;
  }
  .no-scene { color: #94a3b8; font-size: 13px; text-align: center; }

  /* Playback controls */
  #playback-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
  }
  .play-btn {
    width: 32px; height: 32px; background: #7c3aed;
    border: none; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  .play-btn:hover { background: #6d28d9; }
  .play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .play-btn svg { fill: #fff; }
  #timeline-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 4px; background: #e2e8f0; border-radius: 2px;
    outline: none; cursor: pointer;
  }
  #timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #7c3aed; cursor: pointer;
  }
  #timeline-slider::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 50%;
    background: #7c3aed; cursor: pointer; border: none;
  }
  .time-display {
    font-size: 11px; font-variant-numeric: tabular-nums;
    color: #64748b; min-width: 100px; text-align: right; flex-shrink: 0;
  }

  /* Scene indicator in playback bar */
  .scene-indicator {
    font-size: 11px; color: #64748b; white-space: nowrap; flex-shrink: 0;
  }

  /* Audio indicator */
  .audio-indicator {
    font-size: 11px; color: #64748b; white-space: nowrap; flex-shrink: 0;
    display: flex; align-items: center; gap: 4px;
  }
  .audio-indicator .audio-icon {
    font-size: 13px;
  }
  .audio-indicator.has-audio { color: #7c3aed; }

  /* Bottom panels */
  #bottom-panels {
    grid-column: 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 200px;
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
  }

  /* Component Layers */
  #layers-panel {
    border-right: 1px solid #e2e8f0;
    overflow-y: auto;
  }
  #layers-panel .panel-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #64748b;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  .layer-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 12px;
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }
  .layer-item:hover { background: #f1f5f9; }
  .layer-item.active {
    background: #f1f5f9;
    border-left-color: #7c3aed;
    color: #7c3aed;
  }
  .layer-icon {
    width: 12px; height: 12px;
    background: #94a3b8;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .layer-item.active .layer-icon { background: #7c3aed; }
  .layer-type { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer-z {
    font-size: 10px; color: #64748b;
    background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
    flex-shrink: 0;
  }

  /* Prop Editor */
  #props-panel {
    overflow-y: auto;
  }
  #props-panel .panel-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #64748b;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  .props-content { padding: 8px 12px; }
  .prop-component-type {
    font-size: 13px; font-weight: 600; color: #7c3aed;
    margin-bottom: 8px;
  }
  .prop-row {
    display: flex; flex-direction: column; gap: 3px;
    margin-bottom: 8px;
  }
  .prop-label {
    font-size: 11px; font-weight: 500; color: #64748b;
  }
  .prop-input {
    width: 100%; padding: 4px 8px;
    font-size: 12px; font-family: inherit;
    background: #f8fafc; color: #1e293b;
    border: 1px solid #e2e8f0; border-radius: 4px;
    outline: none; transition: border-color 0.15s;
  }
  .prop-input:focus { border-color: #7c3aed; }
  textarea.prop-input {
    resize: vertical; min-height: 40px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
  }
  .prop-check {
    width: 14px; height: 14px;
    accent-color: #7c3aed;
  }
  .prop-readonly-json {
    font-size: 11px; color: #64748b;
    background: #f8fafc; padding: 6px 8px;
    border-radius: 4px; border: 1px solid #e2e8f0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: pre-wrap; word-break: break-all;
    max-height: 80px; overflow-y: auto;
  }

  /* Smart prop editor styles */
  .prop-color-row {
    display: flex; align-items: center; gap: 6px;
  }
  .prop-color-picker {
    width: 32px; height: 28px; padding: 1px 2px;
    border: 1px solid #e2e8f0; border-radius: 4px;
    background: #f8fafc; cursor: pointer; flex-shrink: 0;
  }
  .prop-color-picker:focus { border-color: #7c3aed; }
  .prop-color-text {
    flex: 1; padding: 4px 8px; font-size: 12px; font-family: inherit;
    background: #f8fafc; color: #1e293b;
    border: 1px solid #e2e8f0; border-radius: 4px;
    outline: none; transition: border-color 0.15s;
  }
  .prop-color-text:focus { border-color: #7c3aed; }

  .prop-number-row {
    display: flex; flex-direction: column; gap: 2px;
  }
  .prop-range {
    width: 100%; -webkit-appearance: none; appearance: none;
    height: 3px; background: #e2e8f0; border-radius: 2px;
    outline: none; cursor: pointer;
  }
  .prop-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    border-radius: 50%; background: #7c3aed; cursor: pointer;
  }
  .prop-range::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #7c3aed; cursor: pointer; border: none;
  }

  .prop-toggle {
    position: relative; display: inline-block; width: 34px; height: 18px;
  }
  .prop-toggle input { opacity: 0; width: 0; height: 0; }
  .prop-toggle-slider {
    position: absolute; cursor: pointer; inset: 0;
    background: #cbd5e1; border-radius: 18px; transition: 0.2s;
  }
  .prop-toggle-slider::before {
    content: ''; position: absolute; width: 14px; height: 14px;
    left: 2px; bottom: 2px;
    background: #fff; border-radius: 50%; transition: 0.2s;
  }
  .prop-toggle input:checked + .prop-toggle-slider { background: #7c3aed; }
  .prop-toggle input:checked + .prop-toggle-slider::before { transform: translateX(16px); }

  .prop-url-row {
    display: flex; flex-direction: column; gap: 3px;
  }
  .prop-url-link {
    font-size: 11px; color: #7c3aed; text-decoration: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 100%; display: block;
  }
  .prop-url-link:hover { text-decoration: underline; }

  .prop-select {
    width: 100%; padding: 4px 8px;
    font-size: 12px; font-family: inherit;
    background: #f8fafc; color: #1e293b;
    border: 1px solid #e2e8f0; border-radius: 4px;
    outline: none; transition: border-color 0.15s;
  }
  .prop-select:focus { border-color: #7c3aed; }

  .prop-json-error {
    font-size: 10px; color: #dc2626; margin-top: 2px;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
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
    musicStarted: false
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

  // API helper
  function api(path) {
    var opts = { headers: {} };
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
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

  // Start or resume audio. Music only fades in on first play.
  function playAudio() {
    state.audioElements.forEach(function(audio) {
      if (audio._trackType === 'music') {
        if (!state.musicStarted) {
          // First time: apply fade-in if configured
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
          audio.currentTime = 0;
          audio.play().catch(function() {});
        } else {
          // Resume from where it was
          audio.play().catch(function() {});
        }
      } else {
        // Non-music tracks (voiceover, sfx): on first play start from beginning, on resume continue
        if (!state.musicStarted) {
          audio.currentTime = 0;
          if (audio._fadeIn > 0) {
            audio.volume = 0;
            var targetVol2 = audio._baseVolume;
            var fadeSteps2 = Math.ceil(audio._fadeIn * 20);
            var step2 = 0;
            var fadeInterval2 = setInterval(function() {
              step2++;
              audio.volume = Math.min(targetVol2, (step2 / fadeSteps2) * targetVol2);
              if (step2 >= fadeSteps2) clearInterval(fadeInterval2);
            }, 50);
          }
        }
        audio.play().catch(function() {});
      }
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

  // Load a specific project
  function loadProject(projectId) {
    if (!projectId || !state.tenantId) return;
    api('/projects/' + state.tenantId + '/' + projectId).then(function(project) {
      state.currentProject = project;
      state.currentSceneIndex = -1;
      state.currentComponentIndex = -1;
      state.totalDuration = calcTotalDuration();
      stopPlayback();
      renderSceneList();
      clearPreview();
      clearLayers();
      clearProps();

      // Initialize audio tracks once for the project
      initAudio();

      if (project.scenes && project.scenes.length > 0) {
        selectScene(0);
      }
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

    // Don't touch music audio on manual scene click. Only pause voiceover/sfx.
    pauseMusicKeepPlaying();

    renderSceneList();
    loadPreview();
    renderLayers();
    clearProps();
  }

  // Preview loading
  function loadPreview() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene) { clearPreview(); return; }

    var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
    fetchHtml(path).then(function(html) {
      var iframe = els.previewIframe;
      iframe.width = (project.canvas && project.canvas.width) || 1920;
      iframe.height = (project.canvas && project.canvas.height) || 1080;

      els.previewWrapper.style.display = 'block';
      els.previewPlaceholder.style.display = 'none';

      try {
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
      } catch(e) {
        iframe.srcdoc = html;
      }

      state.duration = scene.duration_seconds || 0;
      state.totalDuration = calcTotalDuration();
      els.slider.disabled = false;
      els.playBtn.disabled = false;
      els.slider.value = 0;
      updateTimeDisplay(0);
      updateSceneIndicator();
      updatePreviewScale();

      waitForReady(function(tl) {
        tl.pause();
        tl.time(0);
      });
    }).catch(function() {
      clearPreview();
    });
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
        + '<span class="layer-icon"></span>'
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

    var path = '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + scene.id + '/components/' + comp.id;
    api('PATCH', path, { data: comp.data }).then(function(result) {
      // Reload the scene preview iframe
      loadPreview();
    }).catch(function(e) {
      console.error('Save failed:', e);
    });
  }



  // Timeline / Playback
  function getTimeline() {
    try { return els.previewIframe.contentWindow && els.previewIframe.contentWindow.__MP_TIMELINE; }
    catch(e) { return null; }
  }

  function togglePlay() {
    if (state.playing) {
      stopPlayback();
      var tl = getTimeline();
      if (tl) tl.pause();
      pauseAudio();
    } else {
      state.playing = true;
      state.playAll = true;
      updatePlayIcon();
      var tl = getTimeline();
      if (tl) {
        if (tl.time() >= state.duration - 0.05) {
          tl.time(0);
        }
        tl.play();
      }
      playAudio();
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
    var tl = getTimeline();
    if (tl) {
      var t = tl.time();
      var d = state.duration;

      var globalTime = sceneOffset(state.currentSceneIndex) + t;
      var totalDur = state.totalDuration;
      els.slider.value = totalDur > 0 ? Math.round((globalTime / totalDur) * 1000) : 0;
      updateTimeDisplay(globalTime);

      // Scene finished - advance to next if playing all
      if (t >= d - 0.02 && state.playAll) {
        var project = state.currentProject;
        if (project && state.currentSceneIndex < project.scenes.length - 1) {
          var nextIndex = state.currentSceneIndex + 1;
          state.currentSceneIndex = nextIndex;
          state.currentComponentIndex = -1;
          renderSceneList();
          renderLayers();
          clearProps();
          updateSceneIndicator();

          var scene = project.scenes[nextIndex];
          state.duration = scene.duration_seconds || 0;
          var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;

          // On scene transition: all audio continues uninterrupted.
          // Voiceover plays through the whole video, not per-scene.

          fetchHtml(path).then(function(html) {
            var iframe = els.previewIframe;
            try {
              iframe.contentDocument.open();
              iframe.contentDocument.write(html);
              iframe.contentDocument.close();
            } catch(e) {
              iframe.srcdoc = html;
            }
            updatePreviewScale();
            waitForReady(function(newTl) {
              newTl.time(0);
              newTl.play();
              animLoop();
            });
          }).catch(function() { stopPlayback(); stopAudioFull(); });
          return;
        } else {
          // Last scene done
          stopPlayback();
          tl.pause();
          stopAudioFull();
          return;
        }
      }
    }
    state.animFrameId = requestAnimationFrame(animLoop);
  }

  function scrub(sliderVal) {
    var totalDur = state.totalDuration;
    if (totalDur <= 0) return;
    var targetGlobal = (sliderVal / 1000) * totalDur;

    var project = state.currentProject;
    if (!project || !project.scenes) return;

    var cumulative = 0;
    var targetScene = 0;
    var localTime = 0;
    for (var i = 0; i < project.scenes.length; i++) {
      var sd = project.scenes[i].duration_seconds || 0;
      if (targetGlobal < cumulative + sd) {
        targetScene = i;
        localTime = targetGlobal - cumulative;
        break;
      }
      cumulative += sd;
      if (i === project.scenes.length - 1) {
        targetScene = i;
        localTime = sd;
      }
    }

    updateTimeDisplay(targetGlobal);

    if (targetScene !== state.currentSceneIndex) {
      state.currentSceneIndex = targetScene;
      state.currentComponentIndex = -1;
      state.duration = project.scenes[targetScene].duration_seconds || 0;
      renderSceneList();
      renderLayers();
      clearProps();
      updateSceneIndicator();

      var scene = project.scenes[targetScene];
      var path = '/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
      var wasPlaying = state.playing;
      stopPlayback();
      // Don't stop music on scrub, only pause non-music
      pauseMusicKeepPlaying();

      fetchHtml(path).then(function(html) {
        var iframe = els.previewIframe;
        try {
          iframe.contentDocument.open();
          iframe.contentDocument.write(html);
          iframe.contentDocument.close();
        } catch(e) { iframe.srcdoc = html; }
        updatePreviewScale();
        waitForReady(function(tl) {
          tl.time(localTime);
          tl.pause();
        });
      });
    } else {
      var tl = getTimeline();
      if (tl) {
        tl.time(localTime);
        tl.pause();
        stopPlayback();
        // Keep music playing during same-scene scrub
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
