import { SHELL_TOKENS, RAIL_CSS, RAIL_JS, railHtml } from "./home-shell.js";

/**
 * THE BRAND PAGE. This was a tray that slid out of Studio, which meant the
 * tenant's colors, voice and assets were a thing you could only reach while
 * editing a film. It is a place, so it is a page, and it sits in home's rail
 * beside Films and Team.
 */
export function getBrandPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${SHELL_TOKENS}
${RAIL_CSS}
  header.page-head {
    position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);
  }
  .head-in { max-width: 920px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
  .page-title { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .grow { flex: 1; }
  main { max-width: 920px; margin: 0 auto; padding: 20px 16px 120px; }

  .bk-section { margin-bottom: 26px; }
  .bk-section h4 {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
    color: var(--text-3); margin: 0 0 10px;
  }
  .bk-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .bk-color-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .bk-color-row label { font-size: 13px; color: var(--text-2); width: 110px; }
  .bk-color-row input[type=color] {
    width: 38px; height: 28px; border: 1px solid var(--border-2); border-radius: 7px;
    padding: 1px; background: var(--surface); cursor: pointer;
  }
  .bk-color-row input[type=text] {
    width: 104px; font: 12px ui-monospace, SFMono-Regular, monospace; padding: 5px 8px;
    border: 1px solid var(--border-2); border-radius: 7px; background: var(--surface); color: var(--text);
  }
  .bk-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .bk-row label { font-size: 13px; color: var(--text-2); width: 110px; }
  .bk-row select, .bk-row input[type=text] {
    font: inherit; font-size: 13px; padding: 6px 9px; border: 1px solid var(--border-2);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--text);
  }
  #bk-guidelines {
    width: 100%; min-height: 96px; font: 13px/1.5 Inter, sans-serif; padding: 10px 12px;
    border: 1px solid var(--border-2); border-radius: var(--radius); background: var(--surface); color: var(--text);
  }
  .bk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 12px; }
  .bk-tile {
    border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; text-align: center;
    position: relative; background: var(--surface);
  }
  .bk-tile img, .bk-tile video {
    max-width: 100%; height: 60px; object-fit: contain; display: block; margin: 0 auto 5px;
    background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 0 0/14px 14px;
    border-radius: 4px;
  }
  .bk-tile .bk-name { font-size: 10px; color: var(--text-2); word-break: break-all; }
  .bk-tile .bk-type { font-size: 9px; color: var(--text-3); text-transform: uppercase; }
  .bk-tile .bk-del {
    position: absolute; top: 2px; right: 5px; border: none; background: none; color: var(--text-3);
    cursor: pointer; font-size: 13px; display: none;
  }
  .bk-tile:hover .bk-del { display: block; }
  #bk-drop {
    border: 2px dashed var(--border-2); border-radius: var(--radius); padding: 24px; text-align: center;
    font-size: 13px; color: var(--text-2); cursor: pointer; transition: all .15s;
  }
  #bk-drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--text); }
  .bk-fonts { font-size: 13px; color: var(--text-2); line-height: 1.7; }
  .muted { color: var(--text-3); }
  .toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: var(--text); color: var(--bg); font-size: 13px; font-weight: 500;
    padding: 9px 14px; border-radius: 999px; opacity: 0; pointer-events: none;
    transition: opacity .18s ease; z-index: 40; max-width: 80vw;
  }
  .toast.on { opacity: 1; }
  .toast.err { background: var(--danger); color: #fff; }
</style>
</head>
<body>
<div class="shell">
${railHtml("brand")}
<div class="work">
  <header class="page-head">
    <div class="head-in">
      <h1 class="page-title">Brand</h1>
      <span class="muted" id="sub" style="font-size:13px"></span>
      <span class="grow"></span>
      <button class="btn primary" id="bk-save">Save changes</button>
    </div>
  </header>
  <main id="panel"><p class="muted">Loading the brand kit…</p></main>
</div>
</div>
<div class="toast" id="toast"></div>
<script>
(function () {
${RAIL_JS}
  var TENANT = '';
  var brand = { kit: null };
  var BK_COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'text_muted'];

  var toastT;
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast on' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }
  var esc = railEsc;
  function escAttr(s) { return esc(s); }

  function bkAssetTile(a, kind) {
    var isImg = /\\.(png|jpe?g|gif|webp|svg)(\\?|$)/i.test(a.url || '');
    var isVid = /\\.(mp4|webm|mov)(\\?|$)/i.test(a.url || '');
    var media = isImg ? '<img src="' + escAttr(a.url) + '" loading="lazy">'
      : isVid ? '<video src="' + escAttr(a.url) + '" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>'
      : '<div style="height:60px;display:flex;align-items:center;justify-content:center;font-size:22px;">&#127925;</div>';
    return '<div class="bk-tile" data-kind="' + esc(kind) + '" data-name="' + escAttr(a.name || '') + '">' +
      '<button class="bk-del" title="Remove from the kit">&times;</button>' + media +
      '<div class="bk-name">' + esc(a.name || '') + '</div>' +
      '<div class="bk-type">' + esc(a.type || a.variant || kind) + '</div></div>';
  }

  function render() {
    var kit = brand.kit || {};
    var colors = kit.colors || {};
    var style = kit.style || {};
    var h = '<div class="bk-section"><h4>Colors</h4><div class="bk-card">';
    BK_COLOR_KEYS.forEach(function (k) {
      var v = colors[k] || '#000000';
      var safe = /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000';
      h += '<div class="bk-color-row"><label>' + esc(k) + '</label>' +
        '<input type="color" data-ck="' + k + '" value="' + escAttr(safe) + '">' +
        '<input type="text" data-ckt="' + k + '" value="' + escAttr(v) + '"></div>';
    });
    h += '</div></div>';

    h += '<div class="bk-section"><h4>Style &amp; voice</h4><div class="bk-card">' +
      '<div class="bk-row"><label>motion</label><select id="bk-motion">' +
      ['', 'minimal', 'punchy', 'cinematic'].map(function (m) {
        return '<option value="' + m + '"' + ((style.motion || '') === m ? ' selected' : '') + '>' + (m || '(unset)') + '</option>';
      }).join('') + '</select></div>' +
      '<div class="bk-row"><label>border radius</label><input type="text" id="bk-radius" value="' + escAttr(style.border_radius || '') + '" placeholder="e.g. 12px"></div>' +
      '<div class="bk-row"><label>TTS voice</label><select id="bk-voice">' +
      ['', 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map(function (v) {
        return '<option value="' + v + '"' + ((kit.voice || '') === v ? ' selected' : '') + '>' + (v || '(unset)') + '</option>';
      }).join('') + '</select></div></div></div>';

    h += '<div class="bk-section"><h4>Guidelines</h4>' +
      '<textarea id="bk-guidelines" placeholder="Free-form brand rules the storyboard and generator follow&#8230;">' +
      esc(kit.guidelines || '') + '</textarea></div>';

    var fonts = kit.fonts || [];
    h += '<div class="bk-section"><h4>Fonts</h4><div class="bk-card bk-fonts">' +
      (fonts.length ? fonts.map(function (f) {
        return esc(f.family + ' (' + f.source + (f.weights && f.weights.length ? ' \\u00b7 ' + f.weights.join('/') : '') + ')');
      }).join('<br>') : '<span class="muted">none</span>') + '</div></div>';

    var logos = kit.logos || [];
    h += '<div class="bk-section"><h4>Logos (' + logos.length + ')</h4>' +
      (logos.length ? '<div class="bk-grid">' + logos.map(function (l) { return bkAssetTile(l, 'logo'); }).join('') + '</div>'
                    : '<p class="muted">none yet</p>') + '</div>';

    var assets = kit.assets || [];
    h += '<div class="bk-section"><h4>Assets (' + assets.length + ')</h4>' +
      (assets.length ? '<div class="bk-grid">' + assets.map(function (a) { return bkAssetTile(a, 'asset'); }).join('') + '</div>'
                     : '<p class="muted">none yet</p>') + '</div>';

    h += '<div class="bk-section"><h4>Add files</h4><div class="bk-card">' +
      '<div class="bk-row"><label>upload as</label><select id="bk-up-type">' +
      ['logo', 'background', 'image', 'product', 'screenshot', 'intro', 'outro', 'watermark', 'music'].map(function (t) {
        return '<option value="' + t + '">' + t + '</option>';
      }).join('') + '</select>' +
      '<span id="bk-logo-opts" style="display:flex;gap:6px;">' +
      '<select id="bk-up-variant"><option>full</option><option>icon</option><option>wordmark</option></select>' +
      '<select id="bk-up-theme"><option>any</option><option>dark</option><option>light</option></select></span></div>' +
      '<div id="bk-drop">Drop images / videos / audio here, or click to choose files</div>' +
      '<input type="file" id="bk-file" multiple style="display:none;">' +
      '<div id="bk-up-status" style="font-size:12px;color:var(--text-2);margin-top:8px;"></div></div></div>';

    var panel = document.getElementById('panel');
    panel.innerHTML = h;
    wire();
  }

  function wire() {
    var panel = document.getElementById('panel');
    BK_COLOR_KEYS.forEach(function (k) {
      var pick = panel.querySelector('[data-ck="' + k + '"]');
      var text = panel.querySelector('[data-ckt="' + k + '"]');
      pick.addEventListener('input', function () { text.value = pick.value; });
      text.addEventListener('input', function () {
        if (/^#[0-9a-fA-F]{6}$/.test(text.value)) pick.value = text.value;
      });
    });
    var typeSel = document.getElementById('bk-up-type');
    var logoOpts = document.getElementById('bk-logo-opts');
    var syncLogoOpts = function () { logoOpts.style.display = typeSel.value === 'logo' ? 'flex' : 'none'; };
    typeSel.addEventListener('change', syncLogoOpts);
    syncLogoOpts();

    panel.querySelectorAll('.bk-del').forEach(function (del) {
      del.addEventListener('click', function () {
        var tile = del.closest('.bk-tile');
        var kind = tile.getAttribute('data-kind');
        var nm = tile.getAttribute('data-name');
        var patch = {};
        if (kind === 'logo') patch.logos = (brand.kit.logos || []).filter(function (l) { return l.name !== nm; });
        else patch.assets = (brand.kit.assets || []).filter(function (a) { return a.name !== nm; });
        railApi('/api/brand-kit/' + encodeURIComponent(TENANT), { method: 'PATCH', body: JSON.stringify(patch) })
          .then(function (kit) { brand.kit = kit; render(); toast('Removed from the kit'); })
          .catch(function (e) { toast('Remove failed: ' + e.message, 'err'); });
      });
    });

    var drop = document.getElementById('bk-drop');
    var file = document.getElementById('bk-file');
    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('over');
      upload(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
    file.addEventListener('change', function () { upload(Array.prototype.slice.call(file.files || [])); });
  }

  function upload(files) {
    if (!files.length) return;
    var type = document.getElementById('bk-up-type').value;
    var extra = '';
    if (type === 'logo') {
      extra = '&variant=' + encodeURIComponent(document.getElementById('bk-up-variant').value) +
        '&theme=' + encodeURIComponent(document.getElementById('bk-up-theme').value);
    }
    var status = document.getElementById('bk-up-status');
    var remaining = files.length;
    files.forEach(function (f) {
      status.textContent = 'Uploading ' + f.name + '\\u2026';
      var url = withToken('/api/brand-asset/' + encodeURIComponent(TENANT) +
        '?name=' + encodeURIComponent(f.name) + '&type=' + encodeURIComponent(type) + extra);
      var opts = { method: 'POST', body: f, headers: {} };
      if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
      fetch(url, opts).then(function (r) { return r.json(); }).then(function (j) {
        remaining--;
        if (!j.ok) { status.textContent = 'Upload failed: ' + (j.error || 'unknown'); return; }
        brand.kit = j.kit;
        if (remaining === 0) { status.textContent = ''; toast('Added to the brand kit'); render(); }
      }).catch(function (e) { remaining--; status.textContent = 'Upload failed: ' + e.message; });
    });
  }

  document.getElementById('bk-save').addEventListener('click', function () {
    var panel = document.getElementById('panel');
    var colors = {};
    BK_COLOR_KEYS.forEach(function (k) { colors[k] = panel.querySelector('[data-ckt="' + k + '"]').value.trim(); });
    var patch = {
      colors: colors,
      guidelines: document.getElementById('bk-guidelines').value,
      style: {
        motion: document.getElementById('bk-motion').value || undefined,
        border_radius: document.getElementById('bk-radius').value.trim() || undefined,
      },
    };
    var voice = document.getElementById('bk-voice').value;
    if (voice) patch.voice = voice;
    railApi('/api/brand-kit/' + encodeURIComponent(TENANT), { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function (kit) {
        brand.kit = kit;
        toast('Saved \\u2014 new generations pick it up immediately');
        render();
      })
      .catch(function (e) { toast('Save failed: ' + e.message, 'err'); });
  });

  bootHome(function (tenant) {
    TENANT = tenant;
    document.getElementById('sub').textContent = tenant;
    railApi('/api/brand-kit/' + encodeURIComponent(tenant)).then(function (kit) {
      brand.kit = kit || {};
      render();
    }).catch(function (e) {
      document.getElementById('panel').innerHTML = '<p class="muted">Could not load the brand kit: ' + railEsc(e.message) + '</p>';
    });
  });
})();
</script>
</body>
</html>`;
}
