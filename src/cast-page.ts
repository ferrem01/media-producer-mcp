/**
 * THE CAST and LOCATIONS pages: the tenant's libraries, beside Team and
 * Brand in the rail (SPEC-cast-scenes.md). A film never manages them -- it
 * picks from them, scene by scene, in the take panel and on the storyboard
 * (Marc, Oct 5: "actors and locations ... should be at the tenant level").
 *
 * Cast: the people who perform -- a generated person (portrait + model
 * sheet), a real person (consent, built from the foundation they record:
 * SPEC-real-person.md), a HeyGen look or presenter -- and the ElevenLabs
 * voice each speaks with. Locations: clean plates of the sets
 * Seedance performs in -- drawn from a description, or from a photo (the
 * people removed, or kept as it is).
 *
 * Both talk to the existing APIs (/api/cast, /api/locations, uploads into
 * the tenant's "library" pseudo-project) with the same token-or-cookie auth
 * as Team.
 */
import { SHELL_TOKENS, RAIL_CSS, RAIL_JS, railHtml } from "./preview-app/home-shell.js";
import { SUGGESTED_LOOKS } from "./core/actor-foundation.js";

const PAGE_CSS = `
  header.page-head {
    position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);
  }
  .head-in { max-width: 980px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: baseline; gap: 12px; }
  h1 { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  main { max-width: 980px; margin: 0 auto; padding: 20px 16px 80px; }
  .sub { color: var(--text-3); margin: 0 0 18px; font-size: 13px; }
  .box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 0 0 14px; }
  .lead { color: var(--text-3); font: 700 11px/16px Inter, sans-serif; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .card { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); display: flex; flex-direction: column; }
  .card .pic { position: relative; background: #111; aspect-ratio: 4 / 5; }
  .card.wide .pic { aspect-ratio: 4 / 3; }
  .card .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .look-row { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; flex-wrap: wrap; }
  .look-row button { padding: 0 6px; }
  .card .pic .nopic { height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: #bbb; font-size: 13px; }
  .card .pic .wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 13px; text-align: center; padding: 10px; }
  .card .body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .card .name { font-weight: 600; display: flex; justify-content: space-between; gap: 6px; align-items: center; }
  .card .meta { color: var(--text-3); font-size: 12px; }
  .badge { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 8px; background: var(--surface-2); color: var(--text-2); white-space: nowrap; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select, input[type=text], textarea {
    min-width: 0; border: 1px solid var(--border-2); background: var(--surface); color: var(--text);
    border-radius: var(--radius-sm); padding: 6px 9px; font: inherit; font-size: 13px; outline: none;
  }
  select { max-width: 100%; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; line-height: 1.45; }
  input[type=text] { flex: 1; }
  button.quiet { background: transparent; border-color: transparent; color: var(--text-3); padding: 2px 6px; }
  button.quiet:hover { background: var(--surface-2); color: var(--text); border-color: var(--border); }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .tabs button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; font-size: 13px; }
  .field > span { color: var(--text-3); font-size: 12px; }
  .status { color: var(--text-3); font-size: 13px; min-height: 20px; margin-top: 8px; }
  .status.err { color: var(--danger); }
  .status.ok { color: #15803d; }
  .empty { color: var(--text-3); font-size: 13px; padding: 8px 0; }
  .looks { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
  .looks .card { cursor: pointer; }
  .looks .card:hover { border-color: var(--accent); }
`;

function page(kind: "cast" | "locations", title: string, main: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${SHELL_TOKENS}
${RAIL_CSS}
${PAGE_CSS}
</style>
</head>
<body>
<div class="shell">
${railHtml(kind)}
<div class="work">
${main}
</div>
</div>
<script>
(function () {
${RAIL_JS}
  var $ = function (id) { return document.getElementById(id); };
  var tenant = '';
  function say(msg, cls) { var st = $('status'); if (!st) return; st.textContent = msg || ''; st.className = 'status' + (cls ? ' ' + cls : ''); }
  function enc(s) { return encodeURIComponent(s); }
  // A file into the tenant's library (the pseudo-project uploads already
  // accept): the cast and locations copy what they keep.
  function upload(file, prefix) {
    return new Promise(function (resolve, reject) {
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      var name = prefix + '-' + new Date().toISOString().split(':').join('-').split('.').join('-') + '.' + ext;
      var xhr = new XMLHttpRequest();
      xhr.open('POST', withToken('/api/upload-asset/' + enc(tenant) + '/library?name=' + enc(name)));
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      if (TOKEN) xhr.setRequestHeader('Authorization', 'Bearer ' + TOKEN);
      xhr.onerror = function () { reject(new Error('Upload failed (network).')); };
      xhr.onload = function () {
        var up; try { up = JSON.parse(xhr.responseText); } catch (e) { up = {}; }
        if (xhr.status < 200 || xhr.status >= 300 || !up.url) { reject(new Error('Upload failed: ' + (up.error || ('HTTP ' + xhr.status)))); return; }
        resolve(up.url.replace('/assets/' + tenant + '/', ''));
      };
      xhr.send(file);
    });
  }
${script}
  bootHome(function (t) { tenant = t; $('sub').textContent = 'Tenant ' + t; start(); });
})();
</script>
</body>
</html>`;
}

export function getCastHtml(): string {
  const main = `
  <header class="page-head"><div class="head-in"><h1>Cast</h1><span class="sub" id="sub" style="margin:0">Loading&#8230;</span></div></header>
  <main>
    <p class="sub">The people who perform in your films. Pick them per scene on the storyboard or a scene&#8217;s take: they recast your recording, or perform a scene with no recording at all.</p>
    <div class="box"><div class="lead">Actors</div><div class="grid" id="actors"><div class="empty">Loading&#8230;</div></div></div>
    <div class="box">
      <div class="lead">Add an actor</div>
      <div class="tabs" id="addTabs">
        <button class="btn small" data-tab="gen">A generated person</button>
        <button class="btn small" data-tab="real">A real person</button>
        <button class="btn small" data-tab="looks">My HeyGen looks</button>
        <button class="btn small" data-tab="pub">HeyGen presenters</button>
      </div>
      <div id="addBody"></div>
      <div class="status" id="status"></div>
    </div>
  </main>`;
  const script = `
  var SUGGESTED_LOOKS = ${JSON.stringify(SUGGESTED_LOOKS)};
  var actors = [], voices = { elevenlabs: [], heygen: [] }, tab = 'gen', looks = null, people = null, peopleToken = null, person = null, pubGender = '', audio = null;
  function start() {
    railApi('/api/cast/' + enc(tenant) + '/voices').then(function (v) { voices = v || voices; render(); }).catch(function () {});
    load();
    showTab('gen');
  }
  function load() {
    railApi('/api/cast/' + enc(tenant)).then(function (r) { actors = r.cast || []; render(); }).catch(function (e) { say(e.message || String(e), 'err'); });
  }
  function kindOf(a) { return a.heygen_look_id ? 'HeyGen look' : a.fictional ? 'Generated' : a.foundation ? 'Real person' : 'Photo'; }
  function render() {
    var box = $('actors');
    if (!actors.length) { box.innerHTML = '<div class="empty">No actors yet: add one below.</div>'; return; }
    box.innerHTML = '';
    actors.forEach(function (a) {
      var card = document.createElement('div'); card.className = 'card';
      var opts = '<option value="">' + (a.heygen_look_id ? 'The look&#8217;s own voice' : 'No voice') + '</option>' + (voices.elevenlabs || []).map(function (v) {
        return '<option value="' + railEsc(v.id) + '"' + (v.id === a.voice_id ? ' selected' : '') + '>' + railEsc(v.name) + (v.category === 'cloned' ? ' (clone)' : '') + '</option>';
      }).join('');
      if (a.voice_id && !(voices.elevenlabs || []).some(function (v) { return v.id === a.voice_id; })) opts += '<option value="' + railEsc(a.voice_id) + '" selected>' + railEsc(a.voice_name || a.voice_id) + '</option>';
      card.innerHTML = '<div class="pic"><img alt="" src="' + railEsc(withToken('/api/cast/' + enc(tenant) + '/' + enc(a.id) + '/portrait')) + '"></div>'
        + '<div class="body"><div class="name"><span class="nm"></span><span class="badge">' + kindOf(a) + '</span></div>'
        + '<div class="meta">' + metaOf(a) + '</div>'
        + '<div class="row"><select class="voice" title="The ElevenLabs voice this actor speaks with">' + opts + '</select><button class="quiet hear" title="Hear the voice">&#9654;</button></div>'
        + '<div class="row">' + (a.sheet ? '<button class="quiet sheet">Model sheet</button>' : '') + (a.foundation ? '<button class="quiet found">Foundation</button>' : '') + '<button class="quiet ren">Rename</button><button class="quiet del">Remove</button></div></div>';
      card.querySelector('.nm').textContent = a.name;
      card.querySelector('.voice').onchange = function (ev) {
        var id = ev.target.value, v = (voices.elevenlabs || []).filter(function (x) { return x.id === id; })[0];
        patch(a, { voice_id: id, voice_name: v ? v.name : '' }, id ? a.name + ' now speaks as ' + (v ? v.name : id) + '.' : a.name + ' has no ElevenLabs voice.');
      };
      card.querySelector('.hear').onclick = function () {
        var v = (voices.elevenlabs || []).filter(function (x) { return x.id === a.voice_id; })[0];
        if (!v || !v.preview) { say('No sample for this voice.'); return; }
        try { if (audio) audio.pause(); audio = new Audio(v.preview); audio.play(); } catch (e) {}
      };
      // The portrait opens large; the model sheet (a generated person) beside it.
      card.querySelector('.pic').style.cursor = 'zoom-in';
      card.querySelector('.pic').onclick = function () { viewActor(a, false); };
      if (a.sheet) card.querySelector('.sheet').onclick = function () { viewActor(a, true); };
      if (a.foundation) card.querySelector('.found').onclick = function () { foundationPanel(a.id); };
      // A real person with no foundation yet has no picture: say so, not a broken image.
      card.querySelector('.pic img').onerror = function () { this.parentNode.innerHTML = '<div class="nopic">Record the foundation</div>'; };
      card.querySelector('.ren').onclick = function () { var n = prompt('Rename ' + a.name, a.name); if (n && n.trim()) patch(a, { name: n.trim() }, 'Renamed.'); };
      card.querySelector('.del').onclick = function () {
        if (!confirm('Remove ' + a.name + ' from the cast? Takes already made with them stay on their films.')) return;
        railApi('/api/cast/' + enc(tenant) + '/' + enc(a.id), { method: 'DELETE' }).then(function () { say(a.name + ' removed.', 'ok'); load(); }).catch(function (e) { say(e.message || String(e), 'err'); });
      };
      box.appendChild(card);
    });
  }
  // What the card says about the pictures behind the person.
  function metaOf(a) {
    if (a.heygen_look_id) return 'HeyGen draws the person';
    if (a.foundation) {
      var got = (a.foundation.clips || []).length;
      return got >= 3 ? 'Foundation recorded ' + new Date(a.foundation.made_at || a.created_at).toLocaleDateString() : 'Foundation: ' + got + ' of 3 clips';
    }
    return a.sheet ? 'Portrait · model sheet' : 'Portrait';
  }
  // A REAL PERSON (SPEC-real-person.md): not a photo and a drawn sheet -- a
  // name, consent, then the foundation they record: three clips everything
  // the avatar looks like is made from.
  function realForm(body) {
    body.innerHTML = '<p class="sub" style="margin:0 0 10px">A real person is built from <b>three short clips you record once</b> on your phone: far, close and a head turn. They are the foundation of the avatar: your face, your hair and the way you move all come from them, so the next step coaches the light and the framing. About ten minutes.</p>'
      + '<div class="field"><span>Name</span><input type="text" id="aName" placeholder="Your name"></div>'
      + '<label class="field" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="aConsent"> This is me, or a person who agreed to be cast.</label>'
      + '<button class="btn primary" id="aAdd">Create and record the foundation</button>';
    $('aAdd').onclick = function () {
      var name = $('aName').value.trim();
      if (!name) { say('Give the person a name.', 'err'); return; }
      if (!$('aConsent').checked) { say('Confirm this is you, or a person who agreed to be cast.', 'err'); return; }
      say('Adding ' + name + '…');
      railApi('/api/cast/' + enc(tenant), { method: 'POST', body: JSON.stringify({ name: name, consent: true, real: true }) }).then(function (a) {
        say(a.name + ' is in the cast: record the foundation next.', 'ok');
        return railApi('/api/cast/' + enc(tenant)).then(function (r) { actors = r.cast || []; render(); foundationPanel(a.id); });
      }).catch(function (e) { say(e.message || String(e), 'err'); });
    };
  }
  // LOOKS: what a real person wears in a scene -- words, since Seedance
  // dresses them as described; the foundation is who they are.
  function looksHtml(a) {
    var looks = a.looks || [];
    var rows = looks.map(function (l, i) {
      return '<div class="look-row"><label><input type="radio" name="lkDef" data-lk-def="' + railEsc(l.id) + '"' + (l.id === a.default_look ? ' checked' : '') + '> <b>' + railEsc(l.name) + '</b></label> <span class="sub" style="margin:0">' + railEsc(l.wardrobe) + (l.glasses === true ? ' · glasses' : '') + '</span> <button class="quiet" data-lk-del="' + i + '" title="Remove this look">&times;</button></div>';
    }).join('');
    var sug = SUGGESTED_LOOKS.filter(function (g) { return !looks.some(function (l) { return l.name === g.name; }); }).map(function (g, i) {
      return '<button class="quiet" data-lk-sug="' + railEsc(g.name) + '" title="' + railEsc(g.wardrobe) + '">+ ' + railEsc(g.name) + '</button>';
    }).join(' ');
    return '<div style="margin-top:16px;border-top:1px solid #eee;padding-top:12px"><div class="lead" style="margin-bottom:4px">Looks</div>'
      + '<p class="sub" style="margin:0 0 8px">What ' + railEsc(a.name) + ' wears in a scene, in words: each scene can pick a look (the selected one is the default). The face, hair and build come from the foundation.</p>'
      + (rows || '<p class="sub" style="margin:0 0 6px">No looks yet: they wear what they wore in the recording.</p>')
      + (sug ? '<div style="margin:6px 0">' + sug + '</div>' : '')
      + '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px"><input type="text" id="lkName" placeholder="Name (e.g. Keynote)" style="width:140px"><input type="text" id="lkWear" placeholder="What they wear (e.g. a navy suit, white open-collar shirt)" style="flex:1;min-width:200px"><label class="sub" style="margin:0"><input type="checkbox" id="lkGlasses"> glasses</label><button class="btn small" id="lkAdd">Add look</button></div></div>';
  }
  function wireLooks(box, a, reload) {
    var base = '/api/cast/' + enc(tenant) + '/' + enc(a.id);
    var looks = (a.looks || []).slice();
    var save = function (list, def, msg) {
      return railApi(base, { method: 'PATCH', body: JSON.stringify({ looks: list, default_look: def }) }).then(function () { say(msg, 'ok'); return reload(); }).catch(function (e) { say(e.message || String(e), 'err'); });
    };
    Array.prototype.forEach.call(box.querySelectorAll('[data-lk-def]'), function (r) { r.onchange = function () { save(looks, r.getAttribute('data-lk-def'), 'Default look set.'); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-lk-del]'), function (b) { b.onclick = function () { var k = Number(b.getAttribute('data-lk-del')); var gone = looks.splice(k, 1)[0]; save(looks, a.default_look === (gone && gone.id) ? '' : a.default_look || '', 'Look removed.'); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-lk-sug]'), function (b) {
      b.onclick = function () { var g = SUGGESTED_LOOKS.filter(function (x) { return x.name === b.getAttribute('data-lk-sug'); })[0]; if (g) save(looks.concat([{ name: g.name, wardrobe: g.wardrobe }]), a.default_look || '', g.name + ' added.'); };
    });
    var add = box.querySelector('#lkAdd');
    if (add) add.onclick = function () {
      var n = box.querySelector('#lkName').value.trim(), w = box.querySelector('#lkWear').value.trim();
      if (!n || !w) { say('A look needs a name and what they wear.', 'err'); return; }
      save(looks.concat([{ name: n, wardrobe: w, glasses: box.querySelector('#lkGlasses').checked }]), a.default_look || '', n + ' added.');
    };
  }
  // THE FOUNDATION PANEL: where the three clips stand, and the way to record
  // them -- the phone (a QR code to /foundation) or this device's own link.
  function foundationPanel(id) {
    var old = document.getElementById('foundationPanel'); if (old) old.remove();
    var a = actors.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var base = '/api/cast/' + enc(tenant) + '/' + enc(a.id);
    var v = Date.now(), pic = function (u) { return withParam(withToken(u), 'v', v); };
    var clips = (a.foundation && a.foundation.clips) || [], stills = (a.foundation && a.foundation.stills) || [];
    var have = function (k) { return clips.filter(function (c) { return c.kind === k; })[0]; };
    var page = withToken('/foundation?tenant=' + enc(tenant) + '&actor=' + enc(a.id));
    var rows = [['far', 'Far', 'about three meters back, knees up, 60-90 s'], ['close', 'Close', 'about one meter, chest up, 30 s'], ['turn', 'Turn', 'a slow head turn, 10 s']].map(function (r) {
      var c = have(r[0]), w = ((a.foundation && a.foundation.work) || []).filter(function (x) { return x.kind === r[0]; })[0];
      var st = w && w.status === 'processing' ? '<span style="color:#888">making it…</span>'
        : w && w.status === 'failed' ? '<span style="color:#b42318">could not use it: ' + railEsc(w.error || '') + '</span>'
        : c ? '<span style="color:#13795b">recorded, ' + c.seconds + ' s</span>' : '<span style="color:#888">to record</span>';
      return '<li><b>' + r[1] + '</b> -- ' + r[2] + ': ' + st + '</li>';
    }).join('');
    var box = document.createElement('div'); box.id = 'foundationPanel';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:50;background:rgba(10,10,12,0.6);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;');
    box.innerHTML = '<div class="box" style="max-width:720px;width:100%;margin:0;background:#fff">'
      + '<div class="lead" style="display:flex;justify-content:space-between;align-items:center"><span></span><button class="quiet" id="fdClose">Close</button></div>'
      + '<p class="sub" style="margin:0 0 10px">These three clips are the foundation of the avatar: everything it will look like comes from them, and the light on the face in them is the light in every scene. Record them on a phone: scan the code, and the page walks through the setup and each clip.</p>'
      + '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">'
      + '<div style="text-align:center"><img alt="Scan to record on your phone" width="180" height="180" src="' + railEsc(withToken('/api/take-qr/' + enc(tenant) + '/-?actor=' + enc(a.id))) + '"><div class="sub" style="margin:4px 0 0">Scan with your phone</div></div>'
      + '<div style="flex:1;min-width:240px"><ol style="margin:0 0 10px;padding-left:18px;line-height:1.6">' + rows + '</ol>'
      + '<a class="btn small" target="_blank" rel="noopener" href="' + railEsc(page) + '">Open the recorder on this device</a>'
      + (stills.length ? '<div style="display:flex;gap:6px;margin-top:12px">' + stills.map(function (s) { return '<img alt="" style="width:30%;aspect-ratio:3/4;object-fit:cover;border-radius:6px;background:#f2f2f4" src="' + railEsc(pic(base + '/still/' + s.kind)) + '">'; }).join('') + '</div>' : '')
      + '</div></div>'
      + looksHtml(a)
      + '</div>';
    box.querySelector('.lead span').textContent = a.name + ': foundation';
    document.body.appendChild(box);
    wireLooks(box, a, function () { return railApi('/api/cast/' + enc(tenant)).then(function (r) { actors = r.cast || []; render(); clearInterval(timer); if (document.getElementById('foundationPanel')) foundationPanel(id); }); });
    var timer = setInterval(function () {
      // The phone records while this panel is open: follow it.
      railApi('/api/cast/' + enc(tenant)).then(function (r) {
        var now = (r.cast || []).filter(function (x) { return x.id === id; })[0];
        var n0 = clips.length, n1 = now && now.foundation ? (now.foundation.clips || []).length : 0;
        var sig = function (f) { return f ? (f.clips || []).map(function (c) { return c.recorded_at; }).join() + '|' + (f.work || []).map(function (w) { return w.kind + w.status; }).join() : ''; };
        var t0 = sig(a.foundation), t1 = sig(now && now.foundation);
        if (n1 !== n0 || t1 !== t0) { clearInterval(timer); actors = r.cast || []; render(); if (document.getElementById('foundationPanel')) foundationPanel(id); }
      }).catch(function () {});
    }, 5000);
    function close() { clearInterval(timer); box.remove(); }
    box.onclick = function (ev) { if (ev.target === box) close(); };
    box.querySelector('#fdClose').onclick = close;
  }
  // A look at an actor's pictures, full size: the portrait (the start frame)
  // and, for a generated person, the model sheet it was drawn from.
  function viewActor(a, sheetFirst) {
    var pics = [{ label: 'Portrait', url: withToken('/api/cast/' + enc(tenant) + '/' + enc(a.id) + '/portrait') }];
    if (a.sheet) pics.push({ label: 'Model sheet', url: withToken('/api/cast/' + enc(tenant) + '/' + enc(a.id) + '/sheet') });
    var at = sheetFirst && a.sheet ? 1 : 0;
    var box = document.createElement('div'); box.id = 'viewer';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:50;background:rgba(10,10,12,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;');
    var dark = 'background:#222;color:#ddd;border-color:#444';
    function draw() {
      box.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center">' + pics.map(function (p, i) {
          return '<button class="btn small" data-i="' + i + '" style="' + (i === at ? '' : dark) + '">' + p.label + '</button>';
        }).join('') + '<a class="btn small" target="_blank" rel="noopener" style="' + dark + '" href="' + railEsc(pics[at].url) + '">Open full size</a>'
        + '<button class="btn small" id="viewerX" style="' + dark + '">Close</button></div>'
        + '<img alt="" src="' + railEsc(pics[at].url) + '" style="max-width:min(1400px,96vw);max-height:82vh;object-fit:contain;border-radius:8px;background:#111">'
        + '<div style="color:#bbb;font-size:13px"></div>';
      box.lastChild.textContent = a.name + ' \u00b7 ' + pics[at].label;
      Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function (b) { b.onclick = function (ev) { ev.stopPropagation(); at = Number(b.getAttribute('data-i')); draw(); }; });
      box.querySelector('#viewerX').onclick = close;
      box.querySelector('img').onclick = function (ev) { ev.stopPropagation(); };
    }
    function close() { box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev) { if (ev.key === 'Escape') close(); }
    box.onclick = function (ev) { if (ev.target === box) close(); };
    document.addEventListener('keydown', onKey);
    draw();
    document.body.appendChild(box);
  }
  function patch(a, body, done) {
    railApi('/api/cast/' + enc(tenant) + '/' + enc(a.id), { method: 'PATCH', body: JSON.stringify(body) }).then(function () { say(done, 'ok'); load(); }).catch(function (e) { say(e.message || String(e), 'err'); });
  }
  function add(body, what) {
    say('Adding ' + what + '…');
    return railApi('/api/cast/' + enc(tenant), { method: 'POST', body: JSON.stringify(body) }).then(function (a) { say(a.name + ' is in the cast.', 'ok'); load(); });
  }
  function showTab(t) {
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('#addTabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    var body = $('addBody');
    if (t === 'real') { realForm(body); return; }
    if (t === 'gen') {
      body.innerHTML = '<div class="field"><span>Name</span><input type="text" id="aName" placeholder="Dana"></div>'
        + '<div class="field"><span>Portrait: the start frame (a generated image, the person facing the camera)</span><input type="file" id="aPhoto" accept="image/*"></div>'
        + '<div class="field"><span>Model sheet (optional, recommended): the same person from several angles</span><input type="file" id="aSheet" accept="image/*"></div>'
        + '<p class="sub" style="margin:0 0 10px">A generated person is nobody real: no consent needed. Give them a voice once added.</p>'
        + '<button class="btn primary" id="aAdd">Add</button>';
      $('aAdd').onclick = function () {
        var f = $('aPhoto').files[0], sheet = $('aSheet').files[0];
        var name = $('aName').value.trim() || (f ? f.name.replace(/[.][^.]+$/, '') : '');
        if (!f) { say('Choose the portrait.', 'err'); return; }
        say('Uploading…');
        (sheet ? upload(sheet, 'cast-sheet') : Promise.resolve(null)).then(function (sheetRel) {
          return upload(f, 'cast').then(function (rel) {
            var body = { name: name, image: rel, fictional: true };
            if (sheetRel) body.sheet = sheetRel;
            return add(body, name);
          });
        }).catch(function (e) { say(e.message || String(e), 'err'); });
      };
      return;
    }
    if (t === 'pub') { showPresenters(body); return; }
    if (!looks) {
      body.innerHTML = '<div class="empty">Loading&#8230;</div>';
      railApi('/api/heygen-avatars/' + enc(tenant) + '?looks=1').then(function (r) {
        looks = (r.looks || []).filter(function (l) { return !l.status || l.status === 'completed'; });
        if (tab === t) showTab(t);
      }).catch(function (e) { body.innerHTML = '<div class="empty"></div>'; body.firstChild.textContent = e.message || String(e); });
      return;
    }
    if (!looks.length) { body.innerHTML = '<div class="empty">No looks on your HeyGen account.</div>'; return; }
    body.innerHTML = '<p class="sub" style="margin:0 0 10px">Click one to add it. A look is its own setting: HeyGen draws the person and the place.</p><div class="looks" id="lookGrid"></div>';
    lookCards($('lookGrid'), looks);
  }
  // A grid of looks; a click adds that look as an actor.
  function lookCards(grid, list) {
    list.forEach(function (l) {
      var c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<div class="pic">' + (l.preview ? '<img alt="" loading="lazy" src="' + railEsc(l.preview) + '">' : '') + '</div><div class="body"><div class="meta"></div></div>';
      c.querySelector('.meta').textContent = l.name || l.id;
      c.onclick = function () { add({ heygen_look_id: l.id }, l.name || 'the look').catch(function (e) { say(e.message || String(e), 'err'); }); };
      grid.appendChild(c);
    });
  }
  // HEYGEN PRESENTERS, one card per PERSON (Marc, Oct 6: one person's ~20
  // looks filled the page, so finding someone meant scrolling past Dante
  // Office 1-15). Pick the person, then their look.
  function showPresenters(body) {
    var genders = '<div class="tabs" id="pubGender" style="margin:0 0 10px">'
      + [['', 'Everyone'], ['female', 'Women'], ['male', 'Men']].map(function (g) {
        return '<button class="btn small' + (pubGender === g[0] ? ' on' : '') + '" data-gender="' + g[0] + '">' + g[1] + '</button>';
      }).join('') + '</div>';
    if (person) {
      body.innerHTML = '<div class="tabs" style="margin:0 0 10px"><button class="btn small" id="pubBack">&#8592; All presenters</button></div>'
        + '<p class="sub" style="margin:0 0 10px"></p><div class="looks" id="lookGrid"></div>';
      body.querySelector('p.sub').textContent = person.name + ': click a look to add it. A look is its own setting: HeyGen draws the person and the place.';
      $('pubBack').onclick = function () { person = null; showPresenters(body); };
      if (!person.looks) {
        $('lookGrid').innerHTML = '<div class="empty">Loading&#8230;</div>';
        var who = person;
        railApi('/api/heygen-avatars/' + enc(tenant) + '?public=1&group=' + enc(who.id)).then(function (r) {
          who.looks = (r.looks || []).filter(function (l) { return !l.status || l.status === 'completed'; });
          if (person === who && tab === 'pub') showPresenters(body);
        }).catch(function (e) { say(e.message || String(e), 'err'); });
        return;
      }
      if (!person.looks.length) { $('lookGrid').innerHTML = '<div class="empty">No looks.</div>'; return; }
      lookCards($('lookGrid'), person.looks);
      return;
    }
    if (!people) {
      body.innerHTML = genders + '<div class="empty">Loading&#8230;</div>';
      bindGender(body);
      railApi('/api/heygen-avatars/' + enc(tenant) + peopleQuery('')).then(function (r) {
        people = r.people || []; peopleToken = r.next_token || null;
        if (tab === 'pub') showPresenters(body);
      }).catch(function (e) { body.innerHTML = '<div class="empty"></div>'; body.firstChild.textContent = e.message || String(e); });
      return;
    }
    if (!people.length) { body.innerHTML = genders + '<div class="empty">No presenters.</div>'; bindGender(body); return; }
    body.innerHTML = genders + '<p class="sub" style="margin:0 0 10px">Pick a person to see their looks.</p><div class="looks" id="peopleGrid"></div>'
      + (peopleToken ? '<button class="btn small" id="more" style="margin-top:10px">More</button>' : '');
    bindGender(body);
    var grid = $('peopleGrid');
    people.forEach(function (g) {
      var c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<div class="pic">' + (g.preview ? '<img alt="" loading="lazy" src="' + railEsc(g.preview) + '">' : '') + '</div><div class="body"><div class="name"></div><div class="meta"></div></div>';
      c.querySelector('.name').textContent = g.name;
      c.querySelector('.meta').textContent = g.looks_count ? g.looks_count + (g.looks_count === 1 ? ' look' : ' looks') : '';
      c.onclick = function () { person = g; showPresenters(body); };
      grid.appendChild(c);
    });
    if ($('more')) $('more').onclick = function () {
      $('more').disabled = true; $('more').textContent = 'Loading…';
      railApi('/api/heygen-avatars/' + enc(tenant) + peopleQuery(peopleToken)).then(function (r) {
        people = people.concat(r.people || []); peopleToken = r.next_token || null; showPresenters(body);
      }).catch(function (e) { say(e.message || String(e), 'err'); });
    };
  }
  function peopleQuery(page) {
    return '?people=1' + (pubGender ? '&gender=' + enc(pubGender) : '') + (page ? '&page=' + enc(page) : '');
  }
  function bindGender(body) {
    Array.prototype.forEach.call(document.querySelectorAll('#pubGender button'), function (b) {
      b.onclick = function () { pubGender = b.getAttribute('data-gender') || ''; people = null; peopleToken = null; person = null; showPresenters(body); };
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#addTabs button'), function (b) { b.onclick = function () { showTab(b.getAttribute('data-tab')); }; });
`;
  return page("cast", "Cast", main, script);
}

export function getLocationsHtml(): string {
  const main = `
  <header class="page-head"><div class="head-in"><h1>Locations</h1><span class="sub" id="sub" style="margin:0">Loading&#8230;</span></div></header>
  <main>
    <p class="sub">The rooms your cast performs in. Each is a clean plate, the set with nobody in it: a scene set there has its first frame drawn in that room, and Seedance keeps the room the same from scene to scene. (A HeyGen look brings its own setting.)</p>
    <div class="box"><div class="lead">Locations</div><div class="grid" id="locs"><div class="empty">Loading&#8230;</div></div></div>
    <div class="box">
      <div class="lead">Add a location</div>
      <div class="tabs" id="addTabs">
        <button class="btn small" data-tab="draw">Describe it</button>
        <button class="btn small" data-tab="photo">From a photo</button>
      </div>
      <div id="addBody"></div>
      <div class="status" id="status"></div>
    </div>
  </main>`;
  const script = `
  var locs = [], timer = null;
  function start() { load(); showTab('draw'); }
  function load() {
    railApi('/api/locations/' + enc(tenant)).then(function (r) {
      locs = r.locations || []; render();
      clearTimeout(timer);
      if (locs.some(function (l) { return l.status === 'drawing'; })) timer = setTimeout(load, 3000);
    }).catch(function (e) { say(e.message || String(e), 'err'); });
  }
  var FROM = { prompt: 'Drawn from a description', frame: 'Cleaned from a photo', upload: 'A photo, as it is' };
  function render() {
    var box = $('locs');
    if (!locs.length) { box.innerHTML = '<div class="empty">No locations yet: add one below.</div>'; return; }
    box.innerHTML = '';
    locs.forEach(function (l) {
      var card = document.createElement('div'); card.className = 'card wide';
      card.innerHTML = '<div class="pic">' + (l.image ? '<img alt="" src="' + railEsc(withToken('/api/locations/' + enc(tenant) + '/' + enc(l.id) + '/image')) + '">'
          : '<div class="wait"></div>') + '</div>'
        + '<div class="body"><div class="name"><span class="nm"></span></div><div class="meta"></div>'
        + '<div class="row"><button class="quiet ren">Rename</button><button class="quiet del">Remove</button></div></div>';
      card.querySelector('.nm').textContent = l.name;
      card.querySelector('.meta').textContent = FROM[l.made_from] || '';
      if (l.prompt) card.title = l.prompt;
      var w = card.querySelector('.wait'); if (w) w.textContent = l.status === 'failed' ? 'Failed: ' + (l.error || '') : 'Drawing…';
      card.querySelector('.ren').onclick = function () {
        var n = prompt('Rename ' + l.name, l.name); if (!n || !n.trim()) return;
        railApi('/api/locations/' + enc(tenant) + '/' + enc(l.id), { method: 'PATCH', body: JSON.stringify({ name: n.trim() }) }).then(function () { say('Renamed.', 'ok'); load(); }).catch(function (e) { say(e.message || String(e), 'err'); });
      };
      card.querySelector('.del').onclick = function () {
        if (!confirm('Remove ' + l.name + '? Takes already made there stay as they are.')) return;
        railApi('/api/locations/' + enc(tenant) + '/' + enc(l.id), { method: 'DELETE' }).then(function () { say(l.name + ' removed.', 'ok'); load(); }).catch(function (e) { say(e.message || String(e), 'err'); });
      };
      box.appendChild(card);
    });
  }
  function make(body, said) {
    say(said);
    return railApi('/api/locations/' + enc(tenant), { method: 'POST', body: JSON.stringify(body) }).then(function (l) {
      say(l.name + (l.status === 'drawing' ? ' is being drawn (under a minute).' : ' is added.'), 'ok'); load(); showTab('draw');
    }).catch(function (e) { say(e.message || String(e), 'err'); });
  }
  function showTab(t) {
    Array.prototype.forEach.call(document.querySelectorAll('#addTabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    var shapes = '<select id="lShape"><option value="tall">Tall (9:16 films)</option><option value="wide">Wide (16:9 films)</option><option value="square">Square</option></select>';
    var body = $('addBody');
    if (t === 'draw') {
      body.innerHTML = '<div class="field"><span>Name</span><input type="text" id="lName" placeholder="Loft lounge"></div>'
        + '<div class="field"><span>The room, in a sentence or two (nobody in it)</span><textarea id="lPrompt" rows="3" placeholder="A bright loft living room: a white sectional sofa, a high slanted white ceiling, big windows, a navy rug"></textarea></div>'
        + '<div class="field"><span>Shape</span>' + shapes + '</div><button class="btn primary" id="lGo">Draw it</button>';
      $('lGo').onclick = function () {
        var name = $('lName').value.trim(), p = $('lPrompt').value.trim();
        if (!name || !p) { say('Name it and describe the room.', 'err'); return; }
        make({ name: name, prompt: p, shape: $('lShape').value }, 'Drawing the location…');
      };
      return;
    }
    body.innerHTML = '<div class="field"><span>Name</span><input type="text" id="lName" placeholder="Our office"></div>'
      + '<div class="field"><span>A photo of the room</span><input type="file" id="lFile" accept="image/*"></div>'
      + '<label class="field" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="lClean" checked> Remove any people (a clean plate pins the room, not a pose)</label>'
      + '<button class="btn primary" id="lGo">Add</button>';
    $('lGo').onclick = function () {
      var f = $('lFile').files[0], name = $('lName').value.trim();
      if (!f || !name) { say('Name it and choose the photo.', 'err'); return; }
      say('Uploading…');
      upload(f, 'location').then(function (rel) {
        var clean = $('lClean').checked;
        return make({ name: name, image: rel, clean: clean }, clean ? 'Cleaning the photo (under a minute)…' : 'Adding…');
      }).catch(function (e) { say(e.message || String(e), 'err'); });
    };
  }
  Array.prototype.forEach.call(document.querySelectorAll('#addTabs button'), function (b) { b.onclick = function () { showTab(b.getAttribute('data-tab')); }; });
`;
  return page("locations", "Locations", main, script);
}
