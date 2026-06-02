/**
 * Preview SPA - single HTML string export.
 *
 * Dark-themed video player style preview for media-producer-mcp.
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
    background: #111;
    color: #eee;
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
    background: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
  }
  header h1 { font-size: 14px; font-weight: 600; color: #eee; white-space: nowrap; }
  .header-controls {
    display: flex; align-items: center; gap: 8px; margin-left: auto;
  }
  .header-controls label { font-size: 12px; color: #888; }
  .header-controls input, .header-controls select {
    background: #111; border: 1px solid #2a2a2a; color: #eee;
    padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: inherit;
    outline: none;
  }
  .header-controls input:focus, .header-controls select:focus { border-color: #A78BFA; }
  .header-controls select { min-width: 180px; }
  .btn {
    padding: 5px 12px; border: none; border-radius: 4px;
    font-size: 12px; font-weight: 500; font-family: inherit;
    cursor: pointer; transition: background 0.15s;
  }
  .btn-primary { background: #A78BFA; color: #111; }
  .btn-primary:hover { background: #c4b5fd; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Sidebar - spans rows 2 and 3 */
  #sidebar {
    grid-row: 2 / 4;
    background: #1a1a1a;
    border-right: 1px solid #2a2a2a;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #888;
    padding: 12px 12px 8px;
  }
  .scene-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 12px;
    border-left: 3px solid transparent;
    transition: background 0.1s;
  }
  .scene-item:hover { background: #222; }
  .scene-item.active {
    background: #222;
    border-left-color: #A78BFA;
    color: #fff;
  }
  .scene-thumb {
    width: 64px; height: 36px;
    border-radius: 3px; background: #111;
    border: 1px solid #2a2a2a;
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
    font-size: 10px; color: #888;
    background: #222; padding: 1px 5px; border-radius: 3px;
    margin-top: 2px; display: inline-block;
  }
  .empty-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #555; font-size: 12px; text-align: center; padding: 16px;
  }

  /* Main */
  #main {
    display: flex; flex-direction: column; overflow: hidden; background: #000;
  }
  #preview-container {
    flex: 1; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .preview-wrapper { position: relative; }
  #preview-iframe {
    background: #000; border: none;
    box-shadow: 0 2px 20px rgba(0,0,0,0.6);
    transform-origin: top left;
  }
  .no-scene { color: #555; font-size: 13px; text-align: center; }

  /* Playback controls */
  #playback-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
  }
  .play-btn {
    width: 32px; height: 32px; background: #A78BFA;
    border: none; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  .play-btn:hover { background: #c4b5fd; }
  .play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .play-btn svg { fill: #111; }
  #timeline-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 4px; background: #2a2a2a; border-radius: 2px;
    outline: none; cursor: pointer;
  }
  #timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px;
    border-radius: 50%; background: #A78BFA; cursor: pointer;
  }
  #timeline-slider::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 50%;
    background: #A78BFA; cursor: pointer; border: none;
  }
  .time-display {
    font-size: 11px; font-variant-numeric: tabular-nums;
    color: #888; min-width: 100px; text-align: right; flex-shrink: 0;
  }

  /* Scene indicator in playback bar */
  .scene-indicator {
    font-size: 11px; color: #888; white-space: nowrap; flex-shrink: 0;
  }

  /* Audio indicator */
  .audio-indicator {
    font-size: 11px; color: #888; white-space: nowrap; flex-shrink: 0;
    display: flex; align-items: center; gap: 4px;
  }
  .audio-indicator .audio-icon {
    font-size: 13px;
  }
  .audio-indicator.has-audio { color: #A78BFA; }

  /* Bottom panels */
  #bottom-panels {
    grid-column: 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 200px;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
  }

  /* Component Layers */
  #layers-panel {
    border-right: 1px solid #2a2a2a;
    overflow-y: auto;
  }
  #layers-panel .panel-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #888;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  .layer-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 12px;
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }
  .layer-item:hover { background: #222; }
  .layer-item.active {
    background: #222;
    border-left-color: #A78BFA;
    color: #A78BFA;
  }
  .layer-icon {
    width: 12px; height: 12px;
    background: #555;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .layer-item.active .layer-icon { background: #A78BFA; }
  .layer-type { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer-z {
    font-size: 10px; color: #888;
    background: #222; padding: 1px 5px; border-radius: 3px;
    flex-shrink: 0;
  }

  /* Prop Editor */
  #props-panel {
    overflow-y: auto;
  }
  #props-panel .panel-header {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: #888;
    padding: 10px 12px 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  .props-content { padding: 8px 12px; }
  .prop-component-type {
    font-size: 13px; font-weight: 600; color: #A78BFA;
    margin-bottom: 8px;
  }
  .prop-row {
    display: flex; flex-direction: column; gap: 3px;
    margin-bottom: 8px;
  }
  .prop-label {
    font-size: 11px; font-weight: 500; color: #888;
  }
  .prop-input {
    width: 100%; padding: 4px 8px;
    font-size: 12px; font-family: inherit;
    background: #111; color: #eee;
    border: 1px solid #2a2a2a; border-radius: 4px;
    outline: none; transition: border-color 0.15s;
  }
  .prop-input:focus { border-color: #A78BFA; }
  textarea.prop-input {
    resize: vertical; min-height: 40px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
  }
  .prop-check {
    width: 14px; height: 14px;
    accent-color: #A78BFA;
  }
  .prop-readonly-json {
    font-size: 11px; color: #888;
    background: #111; padding: 6px 8px;
    border-radius: 4px; border: 1px solid #2a2a2a;
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: pre-wrap; word-break: break-all;
    max-height: 80px; overflow-y: auto;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #444; }
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
    audioDuckingInterval: null
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
    // Convert local file path to asset URL
    // e.g. /data/media-producer/quotient/projects/proj_xxx/assets/audio/vo.mp3
    // becomes /assets/quotient/projects/proj_xxx/assets/audio/vo.mp3
    var prefix = '/data/media-producer/';
    if (source.indexOf(prefix) === 0) {
      return '/assets/' + source.substring(prefix.length);
    }
    return source;
  }

  function initAudio() {
    destroyAudio();
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
      els.audioIndicator.innerHTML = '<span class="audio-icon">♪</span>' + count + ' track' + (count > 1 ? 's' : '');
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
    if (state.audioDuckingInterval) {
      clearInterval(state.audioDuckingInterval);
      state.audioDuckingInterval = null;
    }
  }

  function playAudio() {
    state.audioElements.forEach(function(audio) {
      // Apply fade-in: start at 0 volume, ramp up
      if (audio._fadeIn > 0) {
        audio.volume = 0;
        var targetVol = audio._baseVolume;
        var fadeSteps = Math.ceil(audio._fadeIn * 20); // 50ms steps
        var step = 0;
        var fadeInterval = setInterval(function() {
          step++;
          audio.volume = Math.min(targetVol, (step / fadeSteps) * targetVol);
          if (step >= fadeSteps) clearInterval(fadeInterval);
        }, 50);
      }
      audio.play().catch(function() {});
    });
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
    // Restore music volumes
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

      // Auto-select from URL param
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

      // Initialize audio tracks
      initAudio();

      // Auto-select first scene
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

    // Click handlers
    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectScene(parseInt(el.dataset.index, 10));
      });
    });

    // Load thumbnail iframes via srcdoc (auth)
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
    state.currentSceneIndex = index;
    state.currentComponentIndex = -1;
    stopPlayback();
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

      // Write HTML into iframe
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

      // Wait for scene ready then pause at 0
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

    // Sort by z_index descending (highest on top)
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

  // ── Prop Editor ──

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
          html += '<input type="checkbox" class="prop-check" data-key="' + escAttr(key) + '"' + (val ? ' checked' : '') + '>';
        } else if (typeof val === 'number') {
          html += '<input type="number" class="prop-input" data-key="' + escAttr(key) + '" value="' + val + '" step="any">';
        } else if (typeof val === 'string') {
          html += '<input type="text" class="prop-input" data-key="' + escAttr(key) + '" value="' + escAttr(val) + '">';
        } else {
          // Object or array: read-only JSON display
          html += '<div class="prop-readonly-json" data-key="' + escAttr(key) + '">' + escHtml(JSON.stringify(val, null, 2)) + '</div>';
        }

        html += '</div>';
      });
    }

    html += '</div>';
    els.propEditor.innerHTML = html;

    // Listen for changes on editable fields
    els.propEditor.querySelectorAll('.prop-input, .prop-check').forEach(function(input) {
      var handler = function() {
        var key = input.dataset.key;
        if (!key || !comp.data) return;
        if (input.type === 'checkbox') {
          comp.data[key] = input.checked;
        } else if (typeof comp.data[key] === 'number') {
          comp.data[key] = parseFloat(input.value) || 0;
        } else {
          comp.data[key] = input.value;
        }
      };
      input.addEventListener('change', handler);
      if (input.type !== 'checkbox') input.addEventListener('input', handler);
    });
  }

  function clearProps() {
    els.propEditor.innerHTML = '<div class="empty-state">Select a component</div>';
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
        // If at end of current scene, start from beginning
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

      // Update slider based on total video position
      var globalTime = sceneOffset(state.currentSceneIndex) + t;
      var totalDur = state.totalDuration;
      els.slider.value = totalDur > 0 ? Math.round((globalTime / totalDur) * 1000) : 0;
      updateTimeDisplay(globalTime);

      // Scene finished - advance to next if playing all
      if (t >= d - 0.02 && state.playAll) {
        var project = state.currentProject;
        if (project && state.currentSceneIndex < project.scenes.length - 1) {
          // Advance to next scene
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

          // On scene change: keep music playing, restart voiceover
          state.audioElements.forEach(function(audio) {
            if (audio._trackType === 'voiceover') {
              audio.pause();
              audio.currentTime = 0;
              audio.play().catch(function() {});
            }
            // Music continues playing (loop should handle it)
          });

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
          }).catch(function() { stopPlayback(); pauseAudio(); });
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

    // Find which scene this falls into
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
      // Need to load different scene
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
      pauseAudio();

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
      // Same scene, just seek
      var tl = getTimeline();
      if (tl) {
        tl.time(localTime);
        tl.pause();
        stopPlayback();
        pauseAudio();
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
