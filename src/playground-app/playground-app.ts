/**
 * Component Playground SPA
 *
 * A self-contained HTML playground for browsing, previewing, and creating
 * media-producer components. No build step -- vanilla JS served as a single HTML string.
 */

export function getPlaygroundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Component Playground</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
/* ── Reset & Base ── */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.5;
}
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }

/* ── Layout ── */
.app { display: flex; flex-direction: column; height: 100vh; }
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  background: #1e293b; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.header h1 { font-size: 16px; font-weight: 600; color: #f8fafc; }
.header h1 span { color: #A78BFA; }
.main { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 260px; min-width: 260px;
  background: #1e293b; border-right: 1px solid #334155;
  display: flex; flex-direction: column; overflow: hidden;
}
.search-box {
  padding: 12px;
  border-bottom: 1px solid #334155;
}
.search-box input {
  width: 100%; padding: 8px 12px;
  background: #0f172a; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; font-size: 13px; outline: none;
  transition: border-color 0.15s;
}
.search-box input:focus { border-color: #A78BFA; }
.search-box input::placeholder { color: #64748b; }
.component-list { flex: 1; overflow-y: auto; padding: 8px 0; }
.category-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; cursor: pointer;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: #94a3b8;
  user-select: none;
}
.category-header:hover { color: #cbd5e1; }
.category-header .arrow { font-size: 10px; transition: transform 0.15s; }
.category-header.collapsed .arrow { transform: rotate(-90deg); }
.category-items { }
.category-header.collapsed + .category-items { display: none; }
.component-item {
  padding: 6px 16px 6px 32px; cursor: pointer;
  font-size: 13px; color: #94a3b8;
  transition: all 0.1s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.component-item:hover { color: #e2e8f0; background: rgba(167, 139, 250, 0.06); }
.component-item.active {
  color: #A78BFA; background: rgba(167, 139, 250, 0.1);
  font-weight: 500;
}

/* ── Content Area ── */
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.preview-area { flex: 1; position: relative; background: #0a0f1a; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.preview-area iframe {
  border: none; background: #000;
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
  transform-origin: center center;
}

/* ── Timeline ── */
.timeline-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: #1e293b; border-top: 1px solid #334155; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.timeline-bar button {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  font-size: 16px; padding: 4px; display: flex; align-items: center;
}
.timeline-bar button:hover { color: #e2e8f0; }
.timeline-bar .scrubber { flex: 1; }
.timeline-bar input[type="range"] {
  width: 100%; height: 4px;
  -webkit-appearance: none; appearance: none;
  background: #334155; border-radius: 2px; outline: none;
}
.timeline-bar input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  background: #A78BFA; border-radius: 50%; cursor: pointer;
}
.time-display { font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; min-width: 80px; text-align: right; }

/* ── Bottom Panels ── */
.bottom-panels {
  display: flex; height: 280px; min-height: 200px;
  border-top: 1px solid #334155; flex-shrink: 0;
}
.panel {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
}
.panel + .panel { border-left: 1px solid #334155; }
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  background: #1e293b; border-bottom: 1px solid #334155;
  font-size: 12px; font-weight: 600; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.06em;
  flex-shrink: 0;
}
.panel-body {
  flex: 1; overflow-y: auto; padding: 14px;
  background: #0f172a;
}

/* ── Data Editor ── */
.field-group { margin-bottom: 14px; }
.field-label {
  display: block; font-size: 12px; font-weight: 500; color: #94a3b8;
  margin-bottom: 4px;
}
.field-label .req { color: #f87171; margin-left: 2px; }
.field-input {
  width: 100%; padding: 7px 10px;
  background: #1e293b; border: 1px solid #334155; border-radius: 5px;
  color: #e2e8f0; font-size: 13px; font-family: inherit; outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: #A78BFA; }
textarea.field-input { resize: vertical; min-height: 60px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.field-input[type="checkbox"] { width: auto; margin-right: 8px; }
.checkbox-row { display: flex; align-items: center; }
.editor-actions {
  display: flex; gap: 8px; margin-top: 12px; padding-top: 12px;
  border-top: 1px solid #1e293b;
}
.btn {
  padding: 7px 16px; border-radius: 6px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
}
.btn-primary { background: #A78BFA; color: #0f172a; border-color: #A78BFA; }
.btn-primary:hover { background: #c4b5fd; border-color: #c4b5fd; }
.btn-secondary { background: transparent; color: #94a3b8; border-color: #334155; }
.btn-secondary:hover { color: #e2e8f0; border-color: #64748b; }

/* ── Source View ── */
.source-view {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all;
  color: #94a3b8;
  tab-size: 2;
}
.source-view .s-template { color: #7dd3fc; }
.source-view .s-style { color: #a5f3fc; }
.source-view .s-script { color: #c4b5fd; }
.source-view .s-tag { color: #A78BFA; }

/* ── Empty / New States ── */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 12px; color: #475569;
}
.empty-state svg { width: 48px; height: 48px; opacity: 0.3; }
.empty-state p { font-size: 14px; }

/* ── New Component Modal ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-overlay.hidden { display: none; }
.modal {
  background: #1e293b; border: 1px solid #334155; border-radius: 12px;
  width: 700px; max-width: 90vw; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #334155;
}
.modal-header h2 { font-size: 16px; font-weight: 600; }
.modal-close {
  background: none; border: none; color: #64748b; cursor: pointer;
  font-size: 20px; padding: 4px; line-height: 1;
}
.modal-close:hover { color: #e2e8f0; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px; border-top: 1px solid #334155;
}
.modal-body label { display: block; font-size: 13px; font-weight: 500; color: #94a3b8; margin-bottom: 6px; }
.modal-body textarea {
  width: 100%; min-height: 280px; padding: 12px;
  background: #0f172a; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 12px;
  resize: vertical; outline: none;
}
.modal-body textarea:focus { border-color: #A78BFA; }
.modal-body .type-row { display: flex; gap: 12px; margin-bottom: 16px; }
.modal-body .type-row .field-group { flex: 1; }
</style>
</head>
<body>
<div class="app">
  <!-- Header -->
  <div class="header">
    <h1><span>&#9654;</span> Component Playground</h1>
    <button class="btn btn-primary" id="btn-new" title="Create a new component">+ New</button>
  </div>

  <div class="main">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="search-box">
        <input type="text" id="search" placeholder="Search components..." autocomplete="off">
      </div>
      <div class="component-list" id="component-list"></div>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Preview -->
      <div class="preview-area" id="preview-area">
        <div class="empty-state" id="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <p>Select a component to preview</p>
        </div>
        <iframe id="preview-iframe" style="display:none" sandbox="allow-scripts"></iframe>
      </div>

      <!-- Timeline -->
      <div class="timeline-bar">
        <button id="btn-play" title="Play/Pause">&#9654;</button>
        <div class="scrubber">
          <input type="range" id="scrubber" min="0" max="1000" value="0" step="1">
        </div>
        <div class="time-display" id="time-display">0.00s / 0.00s</div>
      </div>

      <!-- Bottom Panels -->
      <div class="bottom-panels">
        <!-- Data Editor -->
        <div class="panel">
          <div class="panel-header">Data Editor</div>
          <div class="panel-body" id="data-editor">
            <div class="empty-state" style="padding:20px 0">
              <p style="font-size:13px;color:#475569">No component selected</p>
            </div>
          </div>
        </div>

        <!-- Source View -->
        <div class="panel">
          <div class="panel-header">
            <span>Source</span>
            <button class="btn btn-secondary" id="btn-copy" style="padding:3px 10px;font-size:11px">Copy</button>
          </div>
          <div class="panel-body">
            <div class="source-view" id="source-view"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- New Component Modal -->
<div class="modal-overlay hidden" id="modal-new">
  <div class="modal">
    <div class="modal-header">
      <h2>New Component</h2>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="type-row">
        <div class="field-group">
          <label>Component Type</label>
          <input class="field-input" id="new-type" placeholder="e.g. hero-banner">
        </div>
        <div class="field-group">
          <label>Category</label>
          <input class="field-input" id="new-category" placeholder="e.g. titles">
        </div>
      </div>
      <label>Component Source (.component.html)</label>
      <textarea id="new-source" placeholder="<template>\\n  <div class=&quot;my-component&quot;>\\n    <h1 class=&quot;title&quot;></h1>\\n  </div>\\n</template>\\n\\n<style scoped>\\n  .my-component { ... }\\n</style>\\n\\n<script>\\nfunction createTimeline(el, data, ctx) {\\n  var tl = gsap.timeline();\\n  // ...\\n  return tl;\\n}\\n</script>"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">Save Component</button>
    </div>
  </div>
</div>

<script>
(function() {
  // ── State ──
  var catalog = [];
  var activeComponent = null;
  var currentSource = '';
  var currentSchema = null;
  var playing = false;
  var animFrame = null;

  // ── DOM refs ──
  var $list = document.getElementById('component-list');
  var $search = document.getElementById('search');
  var $preview = document.getElementById('preview-iframe');
  var $previewArea = document.getElementById('preview-area');
  var $empty = document.getElementById('empty-state');
  var $editor = document.getElementById('data-editor');
  var $source = document.getElementById('source-view');
  var $scrubber = document.getElementById('scrubber');
  var $timeDisplay = document.getElementById('time-display');
  var $btnPlay = document.getElementById('btn-play');
  var $btnCopy = document.getElementById('btn-copy');
  var $btnNew = document.getElementById('btn-new');
  var $modal = document.getElementById('modal-new');

  // ── Load catalog ──
  fetch('/playground/api/components/catalog')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      catalog = data;
      renderList('');
    })
    .catch(function(err) { console.error('Failed to load catalog:', err); });

  // ── Render sidebar ──
  function renderList(filter) {
    var grouped = {};
    var lf = filter.toLowerCase();
    catalog.forEach(function(c) {
      if (lf && c.type.indexOf(lf) === -1 && (c.label || '').toLowerCase().indexOf(lf) === -1 && c.category.indexOf(lf) === -1) return;
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push(c);
    });
    var html = '';
    Object.keys(grouped).sort().forEach(function(cat) {
      html += '<div class="category-header" data-cat="' + cat + '"><span class="arrow">&#9660;</span> ' + cat + ' (' + grouped[cat].length + ')</div>';
      html += '<div class="category-items">';
      grouped[cat].forEach(function(c) {
        var active = activeComponent && activeComponent.type === c.type && activeComponent.category === c.category;
        html += '<div class="component-item' + (active ? ' active' : '') + '" data-type="' + c.type + '" data-category="' + c.category + '">' + (c.label || c.type) + '</div>';
      });
      html += '</div>';
    });
    $list.innerHTML = html || '<div class="empty-state" style="padding:20px"><p style="font-size:13px">No components found</p></div>';
  }

  // ── Sidebar interactions ──
  $list.addEventListener('click', function(e) {
    var el = e.target;
    if (el.classList.contains('category-header')) {
      el.classList.toggle('collapsed');
      return;
    }
    if (el.classList.contains('component-item')) {
      loadComponent(el.dataset.category, el.dataset.type);
    }
  });

  $search.addEventListener('input', function() { renderList(this.value); });

  // ── Load a component ──
  function loadComponent(category, type) {
    activeComponent = { category: category, type: type };
    renderList($search.value);

    // Fetch source and schema in parallel
    Promise.all([
      fetch('/playground/api/components/' + category + '/' + type + '/source').then(function(r) { return r.text(); }),
      fetch('/playground/api/components/' + category + '/' + type + '/schema').then(function(r) { return r.json(); }).catch(function() { return null; })
    ]).then(function(results) {
      currentSource = results[0];
      currentSchema = results[1];
      renderSourceView(currentSource);
      renderDataEditor(currentSchema);
      refreshPreview();
    });
  }

  // ── Source View ──
  function renderSourceView(src) {
    // Basic syntax highlighting by section
    var escaped = escapeHtml(src);
    escaped = escaped.replace(/(&lt;template[^]*?&lt;\\/template&gt;)/gi, '<span class="s-template">$1</span>');
    escaped = escaped.replace(/(&lt;style[^]*?&lt;\\/style&gt;)/gi, '<span class="s-style">$1</span>');
    escaped = escaped.replace(/(&lt;script[^]*?&lt;\\/script&gt;)/gi, '<span class="s-script">$1</span>');
    $source.innerHTML = escaped;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Data Editor ──
  function renderDataEditor(schema) {
    if (!schema || !schema.data || Object.keys(schema.data).length === 0) {
      $editor.innerHTML = '<div class="empty-state" style="padding:20px 0"><p style="font-size:13px;color:#475569">No data fields</p></div>';
      return;
    }
    var html = '';
    var data = schema.data;
    Object.keys(data).forEach(function(key) {
      var field = data[key];
      var reqMark = field.required ? '<span class="req">*</span>' : '';
      var label = field.label || key;

      html += '<div class="field-group">';
      html += '<label class="field-label">' + escapeHtml(label) + reqMark + '</label>';

      if (field.type === 'boolean') {
        html += '<div class="checkbox-row"><input type="checkbox" class="field-input" data-key="' + key + '" data-type="boolean"></div>';
      } else if (field.type === 'number') {
        html += '<input type="number" class="field-input" data-key="' + key + '" data-type="number" placeholder="' + (field.placeholder || '') + '">';
      } else if (field.type === 'array') {
        html += '<textarea class="field-input" data-key="' + key + '" data-type="array" placeholder="JSON array, e.g. [&quot;item1&quot;, &quot;item2&quot;]"></textarea>';
      } else {
        // string
        html += '<input type="text" class="field-input" data-key="' + key + '" data-type="string" placeholder="' + escapeHtml(field.placeholder || '') + '">';
      }
      html += '</div>';
    });

    html += '<div class="editor-actions">';
    html += '<button class="btn btn-primary" id="btn-preview">Preview</button>';
    html += '</div>';
    $editor.innerHTML = html;

    // Fill defaults from schema placeholders
    document.querySelectorAll('#data-editor .field-input').forEach(function(inp) {
      if (inp.placeholder && inp.dataset.type === 'string') {
        inp.value = inp.placeholder;
      }
    });

    // Preview button
    var previewBtn = document.getElementById('btn-preview');
    if (previewBtn) previewBtn.addEventListener('click', refreshPreview);
  }

  function collectData() {
    var data = {};
    document.querySelectorAll('#data-editor .field-input').forEach(function(inp) {
      var key = inp.dataset.key;
      if (!key) return;
      if (inp.dataset.type === 'boolean') {
        data[key] = inp.checked;
      } else if (inp.dataset.type === 'number') {
        data[key] = parseFloat(inp.value) || 0;
      } else if (inp.dataset.type === 'array') {
        try { data[key] = JSON.parse(inp.value || '[]'); } catch(e) { data[key] = []; }
      } else {
        data[key] = inp.value;
      }
    });
    return data;
  }

  // ── Preview ──
  function refreshPreview() {
    if (!currentSource) return;
    stopPlayback();

    var data = collectData();

    fetch('/playground/api/components/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: currentSource, data: data })
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      $empty.style.display = 'none';
      $preview.style.display = 'block';

      // Size the iframe to fit within the preview area
      fitPreview();

      $preview.srcdoc = html;
      $scrubber.value = 0;
      updateTimeDisplay(0, 0);
    })
    .catch(function(err) { console.error('Preview error:', err); });
  }

  function fitPreview() {
    var area = $previewArea.getBoundingClientRect();
    var sceneW = 1920, sceneH = 1080;
    var pad = 40;
    var availW = area.width - pad * 2;
    var availH = area.height - pad * 2;
    var scale = Math.min(availW / sceneW, availH / sceneH, 1);
    $preview.style.width = sceneW + 'px';
    $preview.style.height = sceneH + 'px';
    $preview.style.transform = 'scale(' + scale + ')';
  }

  window.addEventListener('resize', fitPreview);

  // ── Timeline Control ──
  $btnPlay.addEventListener('click', function() {
    if (playing) { stopPlayback(); return; }
    startPlayback();
  });

  $scrubber.addEventListener('input', function() {
    try {
      var iframeWin = $preview.contentWindow;
      if (!iframeWin || !iframeWin.__MP_TIMELINE) return;
      var tl = iframeWin.__MP_TIMELINE;
      var dur = tl.duration();
      var t = (parseFloat($scrubber.value) / 1000) * dur;
      tl.pause();
      tl.time(t);
      playing = false;
      $btnPlay.innerHTML = '&#9654;';
      updateTimeDisplay(t, dur);
    } catch(e) {}
  });

  function startPlayback() {
    try {
      var iframeWin = $preview.contentWindow;
      if (!iframeWin || !iframeWin.__MP_TIMELINE) return;
      var tl = iframeWin.__MP_TIMELINE;
      tl.play(0);
      playing = true;
      $btnPlay.innerHTML = '&#9646;&#9646;';
      tick();
    } catch(e) {}
  }

  function stopPlayback() {
    playing = false;
    $btnPlay.innerHTML = '&#9654;';
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  }

  function tick() {
    if (!playing) return;
    try {
      var iframeWin = $preview.contentWindow;
      if (!iframeWin || !iframeWin.__MP_TIMELINE) { stopPlayback(); return; }
      var tl = iframeWin.__MP_TIMELINE;
      var dur = tl.duration();
      var t = tl.time();
      $scrubber.value = dur > 0 ? Math.round((t / dur) * 1000) : 0;
      updateTimeDisplay(t, dur);
      if (t >= dur) { stopPlayback(); return; }
    } catch(e) { stopPlayback(); return; }
    animFrame = requestAnimationFrame(tick);
  }

  function updateTimeDisplay(current, total) {
    $timeDisplay.textContent = current.toFixed(2) + 's / ' + total.toFixed(2) + 's';
  }

  // ── Copy source ──
  $btnCopy.addEventListener('click', function() {
    if (!currentSource) return;
    navigator.clipboard.writeText(currentSource).then(function() {
      $btnCopy.textContent = 'Copied!';
      setTimeout(function() { $btnCopy.textContent = 'Copy'; }, 1500);
    });
  });

  // ── New Component Modal ──
  $btnNew.addEventListener('click', function() { $modal.classList.remove('hidden'); });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  function closeModal() { $modal.classList.add('hidden'); }

  $modal.addEventListener('click', function(e) {
    if (e.target === $modal) closeModal();
  });

  document.getElementById('modal-save').addEventListener('click', function() {
    var type = document.getElementById('new-type').value.trim();
    var category = document.getElementById('new-category').value.trim() || 'custom';
    var source = document.getElementById('new-source').value;
    if (!type || !source) { alert('Type and source are required'); return; }

    fetch('/playground/api/components/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, category: category, source: source })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (result.ok) {
        closeModal();
        // Reload catalog
        fetch('/playground/api/components/catalog')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            catalog = data;
            renderList($search.value);
            loadComponent(category, type);
          });
      } else {
        alert('Save failed: ' + (result.error || 'Unknown error'));
      }
    })
    .catch(function(err) { alert('Save failed: ' + err.message); });
  });
})();
</script>
</body>
</html>`;
}
