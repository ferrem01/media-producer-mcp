/**
 * Component Playground SPA - LLM-driven component iteration tool.
 *
 * Workflow: prompt -> generate -> preview -> iterate -> save
 * Three-panel layout: Library | Preview | Source/Data/Chat
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.5;
}
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }

/* ── Layout ── */
#app { display: flex; flex-direction: column; height: 100vh; }
#topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; background: #1e293b;
  border-bottom: 1px solid #334155; flex-shrink: 0;
  min-height: 48px;
}
#topbar .logo { font-weight: 700; font-size: 14px; color: #818cf8; white-space: nowrap; }
#topbar input[type="text"] {
  background: #0f172a; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; padding: 5px 10px; font-size: 12px; width: 220px;
  font-family: 'JetBrains Mono', monospace;
}
#topbar input[type="text"]:focus { outline: none; border-color: #818cf8; }
#comp-name { font-size: 13px; font-weight: 600; color: #94a3b8; margin-left: auto; }
.topbar-btn {
  background: #4f46e5; color: #fff; border: none; border-radius: 6px;
  padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: background 0.15s;
}
.topbar-btn:hover { background: #4338ca; }
.topbar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.topbar-btn.secondary { background: #334155; }
.topbar-btn.secondary:hover { background: #475569; }

#panels { display: flex; flex: 1; min-height: 0; }

/* ── Left Panel ── */
#left-panel {
  width: 260px; min-width: 200px; flex-shrink: 0;
  background: #1e293b; border-right: 1px solid #334155;
  display: flex; flex-direction: column;
}
.panel-tabs {
  display: flex; border-bottom: 1px solid #334155; flex-shrink: 0;
}
.panel-tab {
  flex: 1; padding: 8px 0; text-align: center; font-size: 12px;
  font-weight: 600; cursor: pointer; color: #64748b;
  border-bottom: 2px solid transparent; transition: all 0.15s;
  background: none; border-top: none; border-left: none; border-right: none;
}
.panel-tab.active { color: #818cf8; border-bottom-color: #818cf8; }
.panel-tab:hover { color: #cbd5e1; }
.tab-content { display: none; flex: 1; overflow-y: auto; }
.tab-content.active { display: flex; flex-direction: column; }

#create-btn-wrap { padding: 10px; flex-shrink: 0; }
#create-btn {
  width: 100%; padding: 8px; background: #4f46e5; color: #fff;
  border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
#create-btn:hover { background: #4338ca; }

.comp-group-label {
  padding: 8px 12px 4px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;
}
.comp-item {
  padding: 6px 12px 6px 20px; cursor: pointer; font-size: 12px;
  color: #94a3b8; transition: all 0.1s; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.comp-item:hover { background: #334155; color: #e2e8f0; }
.comp-item.active { background: #4f46e520; color: #818cf8; }

.tenant-comp-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; cursor: pointer; font-size: 12px;
  color: #94a3b8; transition: all 0.1s;
}
.tenant-comp-item:hover { background: #334155; color: #e2e8f0; }
.tenant-comp-item.active { background: #4f46e520; color: #818cf8; }
.tenant-comp-item .delete-btn {
  background: none; border: none; color: #64748b; cursor: pointer;
  font-size: 14px; padding: 2px 4px; border-radius: 3px; display: none;
}
.tenant-comp-item:hover .delete-btn { display: block; }
.tenant-comp-item .delete-btn:hover { color: #ef4444; background: #ef444420; }

.empty-msg { padding: 20px 12px; color: #475569; font-size: 12px; text-align: center; }

/* ── Center Panel (Preview) ── */
#center-panel {
  flex: 1; min-width: 300px; display: flex; flex-direction: column;
  background: #0f172a;
}
#preview-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: #1e293b;
  border-bottom: 1px solid #334155; flex-shrink: 0;
}
#preview-toolbar select {
  background: #0f172a; border: 1px solid #334155; border-radius: 4px;
  color: #e2e8f0; padding: 3px 6px; font-size: 11px;
}
.preview-btn {
  background: #334155; border: none; color: #e2e8f0;
  border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px;
}
.preview-btn:hover { background: #475569; }
#preview-container {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 16px; overflow: hidden; position: relative;
}
#preview-iframe {
  border: none; background: #000; border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  transform-origin: center center;
}
#preview-placeholder {
  color: #475569; font-size: 14px; text-align: center;
}
.preview-loading {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; background: rgba(15,23,42,0.7); z-index: 10;
  backdrop-filter: blur(4px); border-radius: 6px;
}
.spinner {
  width: 24px; height: 24px; border: 2px solid #334155;
  border-top-color: #818cf8; border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Right Panel ── */
#right-panel {
  width: 400px; min-width: 280px; flex-shrink: 0;
  background: #1e293b; border-left: 1px solid #334155;
  display: flex; flex-direction: column;
}
#right-panel .tab-content { padding: 0; }
#source-editor, #data-editor {
  width: 100%; height: 100%; resize: none; border: none;
  background: #0f172a; color: #e2e8f0; padding: 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  line-height: 1.6; tab-size: 2;
}
#source-editor:focus, #data-editor:focus { outline: none; }

/* ── Chat ── */
#chat-container { display: flex; flex-direction: column; height: 100%; }
#chat-messages {
  flex: 1; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.chat-msg {
  padding: 8px 10px; border-radius: 8px; font-size: 12px;
  line-height: 1.5; max-width: 95%; word-wrap: break-word;
}
.chat-msg.user {
  background: #4f46e5; color: #fff; align-self: flex-end;
  border-bottom-right-radius: 2px;
}
.chat-msg.assistant {
  background: #334155; color: #e2e8f0; align-self: flex-start;
  border-bottom-left-radius: 2px;
}
.chat-msg.error { background: #7f1d1d; color: #fca5a5; }
.chat-msg.system { background: #1e293b; color: #64748b; font-style: italic; text-align: center; align-self: center; }
#chat-input-wrap {
  display: flex; gap: 6px; padding: 10px 12px;
  border-top: 1px solid #334155; flex-shrink: 0;
}
#chat-input {
  flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; padding: 8px 10px; font-size: 12px;
  font-family: 'Inter', sans-serif; resize: none;
}
#chat-input:focus { outline: none; border-color: #818cf8; }
#chat-send {
  background: #4f46e5; color: #fff; border: none; border-radius: 6px;
  padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
#chat-send:hover { background: #4338ca; }
#chat-send:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Generate Modal ── */
#generate-modal {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  align-items: center; justify-content: center;
}
#generate-modal.active { display: flex; }
.modal-content {
  background: #1e293b; border: 1px solid #334155; border-radius: 12px;
  padding: 24px; width: 500px; max-width: 90vw;
}
.modal-content h3 { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.modal-content textarea {
  width: 100%; height: 100px; background: #0f172a; border: 1px solid #334155;
  border-radius: 6px; color: #e2e8f0; padding: 10px; font-size: 13px;
  font-family: 'Inter', sans-serif; resize: vertical; margin-bottom: 12px;
}
.modal-content textarea:focus { outline: none; border-color: #818cf8; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
</head>
<body>
<div id="app">

  <div id="topbar">
    <span class="logo">Playground</span>
    <input type="text" id="tenant-input" placeholder="tenant-id" />
    <span id="comp-name">No component loaded</span>
    <button class="topbar-btn secondary" id="refresh-btn" title="Refresh preview">Refresh</button>
    <button class="topbar-btn" id="save-btn" disabled>Save to Library</button>
  </div>

  <div id="panels">

    <!-- Left: Component Library -->
    <div id="left-panel">
      <div id="create-btn-wrap">
        <button id="create-btn">+ Create Component</button>
      </div>
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="library">Library</button>
        <button class="panel-tab" data-tab="tenant">My Components</button>
      </div>
      <div class="tab-content active" id="tab-library">
        <div class="empty-msg">Loading catalog...</div>
      </div>
      <div class="tab-content" id="tab-tenant">
        <div class="empty-msg">Enter a tenant ID</div>
      </div>
    </div>

    <!-- Center: Preview -->
    <div id="center-panel">
      <div id="preview-toolbar">
        <button class="preview-btn" id="play-btn" title="Play/Restart animation">&#9654; Play</button>
        <select id="canvas-select">
          <option value="1920x1080">1920 x 1080</option>
          <option value="1080x1920">1080 x 1920</option>
          <option value="1080x1080">1080 x 1080</option>
        </select>
        <span id="preview-status" style="font-size:11px;color:#64748b;margin-left:auto;"></span>
      </div>
      <div id="preview-container">
        <div id="preview-placeholder">Select or create a component to preview</div>
        <iframe id="preview-iframe" style="display:none;"></iframe>
      </div>
    </div>

    <!-- Right: Source / Data / Chat -->
    <div id="right-panel">
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="source">Source</button>
        <button class="panel-tab" data-tab="data">Data</button>
        <button class="panel-tab" data-tab="chat">Chat</button>
      </div>
      <div class="tab-content active" id="tab-source">
        <textarea id="source-editor" spellcheck="false" placeholder="Component source will appear here..."></textarea>
      </div>
      <div class="tab-content" id="tab-data">
        <textarea id="data-editor" spellcheck="false" placeholder="{}">{}</textarea>
      </div>
      <div class="tab-content" id="tab-chat">
        <div id="chat-container">
          <div id="chat-messages">
            <div class="chat-msg system">Describe changes to the component and I'll update it.</div>
          </div>
          <div id="chat-input-wrap">
            <input type="text" id="chat-input" placeholder="e.g. Make the headline bigger..." />
            <button id="chat-send">Send</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- Generate Modal -->
<div id="generate-modal">
  <div class="modal-content">
    <h3>Create a Component</h3>
    <textarea id="generate-prompt" placeholder="Describe the component you want to create...&#10;&#10;e.g. A pricing card with three tiers, gradient background, and hover effects"></textarea>
    <div class="modal-actions">
      <button class="topbar-btn secondary" id="generate-cancel">Cancel</button>
      <button class="topbar-btn" id="generate-submit">Generate</button>
    </div>
  </div>
</div>

<script>
(function() {
  // ── State ──
  var state = {
    tenantId: '',
    currentSource: '',
    currentType: '',
    currentCategory: 'custom',
    catalog: [],
    tenantComponents: [],
    chatHistory: [],
    previewDebounce: null,
    generating: false
  };

  // ── DOM Refs ──
  var els = {
    tenantInput: document.getElementById('tenant-input'),
    compName: document.getElementById('comp-name'),
    saveBtn: document.getElementById('save-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    createBtn: document.getElementById('create-btn'),
    tabLibrary: document.getElementById('tab-library'),
    tabTenant: document.getElementById('tab-tenant'),
    previewIframe: document.getElementById('preview-iframe'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewContainer: document.getElementById('preview-container'),
    previewStatus: document.getElementById('preview-status'),
    canvasSelect: document.getElementById('canvas-select'),
    playBtn: document.getElementById('play-btn'),
    sourceEditor: document.getElementById('source-editor'),
    dataEditor: document.getElementById('data-editor'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    chatSend: document.getElementById('chat-send'),
    generateModal: document.getElementById('generate-modal'),
    generatePrompt: document.getElementById('generate-prompt'),
    generateSubmit: document.getElementById('generate-submit'),
    generateCancel: document.getElementById('generate-cancel')
  };

  // ── URL Params ──
  var params = new URLSearchParams(window.location.search);
  var urlTenant = params.get('tenant');
  if (urlTenant) {
    els.tenantInput.value = urlTenant;
    state.tenantId = urlTenant;
  }

  // ── Tab Switching ──
  document.querySelectorAll('.panel-tabs').forEach(function(tabBar) {
    tabBar.querySelectorAll('.panel-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var panel = tabBar.parentElement;
        panel.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
        panel.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = panel.querySelector('#tab-' + tab.getAttribute('data-tab'));
        if (target) target.classList.add('active');
      });
    });
  });

  // ── API Helpers ──
  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || r.statusText); });
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') >= 0) return r.json();
      return r.text();
    });
  }

  // ── Load Catalog ──
  function loadCatalog() {
    api('GET', '/playground/api/components/catalog').then(function(catalog) {
      state.catalog = catalog;
      renderCatalog(catalog);
    }).catch(function() {
      els.tabLibrary.innerHTML = '<div class="empty-msg">Failed to load catalog</div>';
    });
  }

  function renderCatalog(catalog) {
    var groups = {};
    catalog.forEach(function(c) {
      var cat = c.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    var html = '';
    Object.keys(groups).sort().forEach(function(cat) {
      html += '<div class="comp-group-label">' + cat + '</div>';
      groups[cat].sort(function(a,b) { return a.type.localeCompare(b.type); }).forEach(function(c) {
        html += '<div class="comp-item" data-category="' + cat + '" data-type="' + c.type + '">' +
          (c.label || c.type) + '</div>';
      });
    });
    els.tabLibrary.innerHTML = html || '<div class="empty-msg">No components found</div>';
    els.tabLibrary.querySelectorAll('.comp-item').forEach(function(item) {
      item.addEventListener('click', function() {
        loadGlobalComponent(item.getAttribute('data-category'), item.getAttribute('data-type'));
        // Highlight
        els.tabLibrary.querySelectorAll('.comp-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
      });
    });
  }

  // ── Load Tenant Components ──
  function loadTenantComponents() {
    if (!state.tenantId) {
      els.tabTenant.innerHTML = '<div class="empty-msg">Enter a tenant ID above</div>';
      return;
    }
    api('GET', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId)).then(function(comps) {
      state.tenantComponents = comps;
      renderTenantComponents(comps);
    }).catch(function() {
      els.tabTenant.innerHTML = '<div class="empty-msg">Failed to load</div>';
    });
  }

  function renderTenantComponents(comps) {
    if (!comps.length) {
      els.tabTenant.innerHTML = '<div class="empty-msg">No custom components yet</div>';
      return;
    }
    var html = '';
    comps.forEach(function(c) {
      html += '<div class="tenant-comp-item" data-type="' + c.type + '">' +
        '<span>' + (c.label || c.type) + '</span>' +
        '<button class="delete-btn" data-type="' + c.type + '" title="Delete">&times;</button>' +
        '</div>';
    });
    els.tabTenant.innerHTML = html;
    els.tabTenant.querySelectorAll('.tenant-comp-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) return;
        loadTenantComponent(item.getAttribute('data-type'));
        els.tabTenant.querySelectorAll('.tenant-comp-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
      });
    });
    els.tabTenant.querySelectorAll('.delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var type = btn.getAttribute('data-type');
        if (!confirm('Delete component "' + type + '"?')) return;
        api('DELETE', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(type)).then(function() {
          loadTenantComponents();
        });
      });
    });
  }

  // ── Load Component Source ──
  function loadGlobalComponent(category, type) {
    api('GET', '/playground/api/components/' + encodeURIComponent(category) + '/' + encodeURIComponent(type) + '/source').then(function(source) {
      setComponent(type, category, source);
    }).catch(function(err) {
      alert('Failed to load: ' + err.message);
    });
  }

  function loadTenantComponent(type) {
    api('GET', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(type) + '/source').then(function(source) {
      setComponent(type, 'custom', source);
    }).catch(function(err) {
      alert('Failed to load: ' + err.message);
    });
  }

  function setComponent(type, category, source) {
    state.currentType = type;
    state.currentCategory = category;
    state.currentSource = source;
    els.sourceEditor.value = source;
    els.compName.textContent = type;
    els.saveBtn.disabled = false;
    els.dataEditor.value = extractDefaultData(source);
    state.chatHistory = [];
    els.chatMessages.innerHTML = '<div class="chat-msg system">Editing: ' + type + '. Describe changes and I\\'ll update the source.</div>';
    schedulePreview();
  }

  // ── Extract default data from template data-bind attributes ──
  function extractDefaultData(source) {
    var data = {};
    var matches = source.match(/data-bind="([^"]+)"/g);
    if (matches) {
      matches.forEach(function(m) {
        var key = m.match(/data-bind="([^"]+)"/)[1];
        data[key] = '';
      });
    }
    return JSON.stringify(data, null, 2);
  }

  // ── Preview ──
  function schedulePreview() {
    if (state.previewDebounce) clearTimeout(state.previewDebounce);
    state.previewDebounce = setTimeout(updatePreview, 300);
  }

  function updatePreview() {
    var source = els.sourceEditor.value;
    if (!source.trim()) {
      els.previewIframe.style.display = 'none';
      els.previewPlaceholder.style.display = '';
      els.previewPlaceholder.textContent = 'Enter or generate component source';
      return;
    }

    var data = {};
    try { data = JSON.parse(els.dataEditor.value || '{}'); } catch(e) {}

    els.previewStatus.textContent = 'Loading...';

    api('POST', '/playground/api/components/preview', { source: source, data: data }).then(function(html) {
      els.previewPlaceholder.style.display = 'none';
      els.previewIframe.style.display = '';

      // Set canvas size
      var size = els.canvasSelect.value.split('x');
      var cw = parseInt(size[0]); var ch = parseInt(size[1]);
      els.previewIframe.setAttribute('width', cw);
      els.previewIframe.setAttribute('height', ch);

      // Scale to fit container
      scalePreview(cw, ch);

      // Write HTML to iframe
      els.previewIframe.srcdoc = html;
      els.previewStatus.textContent = '';
    }).catch(function(err) {
      els.previewStatus.textContent = 'Error: ' + err.message;
    });
  }

  function scalePreview(cw, ch) {
    var container = els.previewContainer;
    var rect = container.getBoundingClientRect();
    var pad = 32;
    var availW = rect.width - pad;
    var availH = rect.height - pad;
    var scale = Math.min(availW / cw, availH / ch, 1);
    els.previewIframe.style.transform = 'scale(' + scale + ')';
    els.previewIframe.style.width = cw + 'px';
    els.previewIframe.style.height = ch + 'px';
  }

  // ── Play Button ──
  els.playBtn.addEventListener('click', function() {
    try {
      var w = els.previewIframe.contentWindow;
      if (w && w.__MP_TIMELINE) {
        w.__MP_TIMELINE.restart();
      }
    } catch(e) {}
  });

  // ── Generate ──
  els.createBtn.addEventListener('click', function() {
    els.generateModal.classList.add('active');
    els.generatePrompt.value = '';
    els.generatePrompt.focus();
  });

  els.generateCancel.addEventListener('click', function() {
    els.generateModal.classList.remove('active');
  });

  els.generateModal.addEventListener('click', function(e) {
    if (e.target === els.generateModal) els.generateModal.classList.remove('active');
  });

  els.generateSubmit.addEventListener('click', doGenerate);
  els.generatePrompt.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doGenerate(); }
  });

  function doGenerate() {
    var prompt = els.generatePrompt.value.trim();
    if (!prompt || state.generating) return;

    state.generating = true;
    els.generateSubmit.disabled = true;
    els.generateSubmit.textContent = 'Generating...';

    api('POST', '/playground/api/generate', {
      prompt: prompt,
      tenant_id: state.tenantId || 'default',
      format: 'video'
    }).then(function(result) {
      els.generateModal.classList.remove('active');
      setComponent(result.type, 'custom', result.source);
      // Switch to chat tab
      var chatTab = document.querySelector('#right-panel .panel-tab[data-tab="chat"]');
      if (chatTab) chatTab.click();
      addChatMessage('system', 'Component "' + result.type + '" generated. Make changes below or save to library.');
    }).catch(function(err) {
      alert('Generation failed: ' + err.message);
    }).finally(function() {
      state.generating = false;
      els.generateSubmit.disabled = false;
      els.generateSubmit.textContent = 'Generate';
    });
  }

  // ── Chat / Iterate ──
  els.chatSend.addEventListener('click', doIterate);
  els.chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doIterate(); }
  });

  function doIterate() {
    var instruction = els.chatInput.value.trim();
    if (!instruction || state.generating) return;
    var source = els.sourceEditor.value;
    if (!source.trim()) {
      addChatMessage('error', 'No component source to iterate on. Generate or load one first.');
      return;
    }

    addChatMessage('user', instruction);
    els.chatInput.value = '';
    state.generating = true;
    els.chatSend.disabled = true;

    addChatMessage('system', 'Updating component...');

    api('POST', '/playground/api/iterate', {
      source: source,
      instruction: instruction,
      tenant_id: state.tenantId || 'default'
    }).then(function(result) {
      // Remove the "Updating..." message
      var msgs = els.chatMessages.querySelectorAll('.chat-msg.system');
      var last = msgs[msgs.length - 1];
      if (last && last.textContent === 'Updating component...') last.remove();

      state.currentSource = result.source;
      els.sourceEditor.value = result.source;
      addChatMessage('assistant', 'Updated! Preview refreshing.');
      schedulePreview();
    }).catch(function(err) {
      addChatMessage('error', 'Failed: ' + err.message);
    }).finally(function() {
      state.generating = false;
      els.chatSend.disabled = false;
    });
  }

  function addChatMessage(role, text) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.textContent = text;
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  // ── Save ──
  els.saveBtn.addEventListener('click', function() {
    if (!state.currentType || !els.sourceEditor.value.trim()) return;
    var tid = state.tenantId || els.tenantInput.value.trim();
    if (!tid) { alert('Enter a tenant ID first'); return; }

    api('POST', '/playground/api/components/save', {
      type: state.currentType,
      source: els.sourceEditor.value,
      tenant_id: tid,
      category: state.currentCategory || 'custom'
    }).then(function() {
      els.previewStatus.textContent = 'Saved!';
      setTimeout(function() { els.previewStatus.textContent = ''; }, 2000);
      loadTenantComponents();
    }).catch(function(err) {
      alert('Save failed: ' + err.message);
    });
  });

  // ── Refresh ──
  els.refreshBtn.addEventListener('click', function() {
    updatePreview();
  });

  // ── Source / Data change ──
  els.sourceEditor.addEventListener('input', function() {
    state.currentSource = els.sourceEditor.value;
    schedulePreview();
  });
  els.dataEditor.addEventListener('input', schedulePreview);

  // ── Canvas change ──
  els.canvasSelect.addEventListener('change', function() {
    if (els.previewIframe.style.display !== 'none') updatePreview();
  });

  // ── Tenant change ──
  els.tenantInput.addEventListener('change', function() {
    state.tenantId = els.tenantInput.value.trim();
    loadTenantComponents();
  });
  els.tenantInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      state.tenantId = els.tenantInput.value.trim();
      loadTenantComponents();
    }
  });

  // ── Resize observer for preview scaling ──
  if (window.ResizeObserver) {
    new ResizeObserver(function() {
      if (els.previewIframe.style.display !== 'none') {
        var size = els.canvasSelect.value.split('x');
        scalePreview(parseInt(size[0]), parseInt(size[1]));
      }
    }).observe(els.previewContainer);
  }

  // ── Init ──
  loadCatalog();
  if (state.tenantId) loadTenantComponents();
})();
</script>
</body>
</html>`;
}
