/**
 * THE LIBRARY — the tenant's films, in front of Studio.
 *
 * 251 films in one tenant and the only way in was a project id. This is the
 * page that answers "where is the one about the sales call": a still per film,
 * search over the words a person actually remembers (title, prompt, and the
 * text ON SCREEN), and a way to put films down that is not `rm`.
 */
export function getLibraryHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Films</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #faf9f7; --surface: #ffffff; --surface-2: #f4f2ee;
    --border: #e6e3dd; --border-2: #d8d4cc;
    --text: #17171c; --text-2: #5f5c56; --text-3: #8d8980;
    --accent: #393bf5; --danger: #c2410c;
    --radius: 12px; --shadow: 0 1px 2px rgba(20,20,40,.05), 0 8px 24px rgba(20,20,40,.06);
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #121214; --surface: #1b1b1f; --surface-2: #232328;
      --border: #2e2e34; --border-2: #3a3a42;
      --text: #f4f3f1; --text-2: #a8a49c; --text-3: #7b776f;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
    }
  }
  :root[data-theme="dark"] {
    --bg: #121214; --surface: #1b1b1f; --surface-2: #232328;
    --border: #2e2e34; --border-2: #3a3a42;
    --text: #f4f3f1; --text-2: #a8a49c; --text-3: #7b776f;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 400 15px/1.5 Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }

  header.lib-head {
    position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);
  }
  .head-in { max-width: 1400px; margin: 0 auto; padding: 14px 16px 12px; }
  .head-top { display: flex; align-items: center; gap: 12px; }
  .lib-title { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .lib-count { color: var(--text-3); font-size: 13px; font-weight: 500; }
  .grow { flex: 1; }
  .search-wrap { position: relative; flex: 1; max-width: 520px; }
  .search-wrap svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
  #q {
    width: 100%; height: 38px; padding: 0 34px 0 34px; font: inherit; font-size: 14px;
    color: var(--text); background: var(--surface); border: 1px solid var(--border-2);
    border-radius: 999px; outline: none;
  }
  #q:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
  .q-clear {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    width: 22px; height: 22px; border: none; background: var(--surface-2); color: var(--text-2);
    border-radius: 50%; cursor: pointer; display: none; line-height: 1; font-size: 14px;
  }
  .toolbar { display: flex; align-items: center; gap: 8px; margin-top: 11px; flex-wrap: wrap; }
  .chip {
    height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 500; color: var(--text-2); cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    font-family: inherit;
  }
  .chip:hover { border-color: var(--border-2); color: var(--text); }
  .chip.on { background: var(--text); border-color: var(--text); color: var(--bg); }
  .chip .n { opacity: .6; font-variant-numeric: tabular-nums; }
  select.chip { padding-right: 8px; }

  main { max-width: 1400px; margin: 0 auto; padding: 18px 16px 120px; }
  /* start, not stretch: a 9x16 card in the row must not pull every 16x9 card
     beside it into a tall box with a white void under the title. */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(258px, 1fr)); gap: 18px; align-items: start; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; cursor: pointer; position: relative;
    transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  }
  .card:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--border-2); }
  .card.sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
  /* ONE box for every film, whatever its frame: a shelf of ragged rows reads
     as broken, not as informative. A tall film is shown WHOLE inside it
     (letterboxed on the card surface) rather than cropped to a band, and the
     frame is named in the meta line. */
  .thumb { position: relative; background: var(--surface-2); aspect-ratio: 16/9; overflow: hidden; }
  .thumb.tall img { object-fit: contain; background: var(--surface-2); }
  /* The poster sits ON TOP of the initials: a positioned placeholder paints
     over an in-flow image, so every loaded still was hidden behind its own
     fallback. */
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .25s ease; z-index: 1; }
  .thumb img.in { opacity: 1; }
  .thumb .initials {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 30px; font-weight: 700; color: var(--text-3); letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--surface-2), color-mix(in srgb, var(--accent) 8%, var(--surface-2)));
  }
  .badges { position: absolute; left: 8px; bottom: 8px; display: flex; gap: 5px; z-index: 2; }
  .badge {
    font-size: 11px; font-weight: 600; letter-spacing: .01em; padding: 2px 7px; border-radius: 5px;
    background: rgba(12,12,18,.72); color: #fff; backdrop-filter: blur(4px);
  }
  .badge.state-rendered { background: rgba(22,101,52,.86); }
  .badge.state-built    { background: rgba(30,58,138,.82); }
  .badge.state-board    { background: rgba(120,53,15,.82); }
  .copies {
    position: absolute; right: 8px; bottom: 8px; font-size: 11px; font-weight: 600;
    padding: 2px 8px; border-radius: 5px; background: rgba(12,12,18,.72); color: #fff; z-index: 2;
  }
  .copies:hover { background: var(--accent); }
  .meta { padding: 10px 12px 12px; }
  .cname {
    font-size: 14px; font-weight: 600; line-height: 1.35; margin: 0 0 5px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .cmeta { font-size: 12px; color: var(--text-3); display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
  .cmeta b { font-weight: 500; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-3); opacity: .6; }
  .pick {
    position: absolute; top: 8px; left: 8px; z-index: 3; width: 22px; height: 22px; border-radius: 6px;
    border: 2px solid #fff; background: rgba(12,12,18,.45); display: none;
    align-items: center; justify-content: center; color: #fff; font-size: 14px; line-height: 1;
  }
  body.picking .pick { display: flex; }
  .card.sel .pick { background: var(--accent); border-color: var(--accent); }

  .empty { padding: 72px 20px; text-align: center; color: var(--text-3); }
  .empty h2 { color: var(--text-2); font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  .skeleton { background: var(--surface-2); border-radius: var(--radius); height: 214px; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }

  .actionbar {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%) translateY(140%);
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: var(--surface); border: 1px solid var(--border-2); border-radius: 999px;
    box-shadow: var(--shadow); transition: transform .2s cubic-bezier(.4,0,.2,1); z-index: 30;
  }
  .actionbar.up { transform: translateX(-50%) translateY(0); }
  .actionbar .n { font-size: 13px; font-weight: 600; padding-left: 6px; }
  .btn {
    height: 32px; padding: 0 13px; font: 500 13px/1 Inter, sans-serif; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; cursor: pointer;
  }
  .btn:hover { border-color: var(--border-2); }
  .btn.primary { background: var(--text); color: var(--bg); border-color: var(--text); }
  .btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
  .toast {
    position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
    background: var(--text); color: var(--bg); font-size: 13px; font-weight: 500;
    padding: 9px 14px; border-radius: 999px; opacity: 0; pointer-events: none;
    transition: opacity .18s ease; z-index: 40;
  }
  .toast.on { opacity: 1; }
  @media (max-width: 640px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .head-top { flex-wrap: wrap; }
    .search-wrap { max-width: none; order: 3; width: 100%; }
  }
</style>
</head>
<body>
<header class="lib-head">
  <div class="head-in">
    <div class="head-top">
      <h1 class="lib-title">Films</h1>
      <span class="lib-count" id="count"></span>
      <div class="search-wrap">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
        <input id="q" type="text" autocomplete="off" placeholder="Search a title, a prompt, or words on screen…">
        <button class="q-clear" id="qclear" title="Clear">&times;</button>
      </div>
      <span class="grow"></span>
      <button class="chip" id="pickbtn">Select</button>
    </div>
    <div class="toolbar" id="filters"></div>
  </div>
</header>
<main>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none"></div>
</main>
<div class="actionbar" id="actionbar">
  <span class="n" id="selcount">0 selected</span>
  <button class="btn" id="selall">All</button>
  <button class="btn" id="selnone">None</button>
  <span id="actions"></span>
  <button class="btn" id="pickdone">Done</button>
</div>
<div class="toast" id="toast"></div>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('token') || '';
  var state = {
    tenant: params.get('tenant') || '',
    q: params.get('q') || '',
    filter: params.get('filter') || 'all',
    sort: params.get('sort') || 'recent',
    archived: params.get('archived') === '1',
    cards: [], counts: null, total: 0,
    picking: false, selected: Object.create(null), expanded: Object.create(null)
  };

  // Append a query param to a path that may or may not already have a query.
  // Doing this by hand is how the poster url became ".../poster&v=..." for
  // anyone signed in by COOKIE (no token in the link): a path that does not
  // exist, a 404, and a shelf of placeholder letters where every still should
  // have been.
  function withParam(p, k, v) {
    if (v === undefined || v === null || v === '') return p;
    return p + (p.indexOf('?') === -1 ? '?' : '&') + k + '=' + encodeURIComponent(v);
  }
  function withToken(p) { return withParam(p, 'token', TOKEN); }
  function api(path, opts) {
    opts = opts || {}; opts.headers = opts.headers || {};
    if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(withToken(path), opts).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return null; }).then(function (b) {
        throw new Error((b && b.error) || ('Error ' + r.status));
      });
      return r.json();
    });
  }
  var toastT;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2600);
  }

  function fmtDur(s) {
    if (!s) return '—';
    var m = Math.floor(s / 60), r = Math.round(s % 60);
    return m ? m + ':' + (r < 10 ? '0' : '') + r : Math.round(s) + 's';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function stateOf(c) {
    if (c.rendered) return { k: 'rendered', label: c.render_stale ? 'Rendered · stale' : 'Rendered' };
    if (c.status === 'generated' || c.status === 'rendering') return { k: 'built', label: c.status === 'rendering' ? 'Rendering' : 'Built' };
    return { k: 'board', label: 'Board' };
  }
  function initials(name) {
    return (name || '?').split(/\\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ── Posters load only when a card is actually on screen: 251 films must not
  //    ask the server for 251 stills to show you the first twelve. ──
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target;
      io.unobserve(img);
      img.src = img.getAttribute('data-src');
      img.onload = function () { img.classList.add('in'); };
      img.onerror = function () { img.remove(); };
    });
  }, { rootMargin: '400px 0px' });

  function studioHref(id) {
    return withToken('/studio?tenant=' + encodeURIComponent(state.tenant) + '&project=' + encodeURIComponent(id));
  }

  function cardHtml(c) {
    var st = stateOf(c);
    var poster = withToken(withParam(
      '/api/projects/' + encodeURIComponent(state.tenant) + '/' + encodeURIComponent(c.project_id) + '/poster',
      'v', c.touched_at || ''));
    var frameCls = c.frame && c.frame !== '16x9' ? ' tall' : '';
    return '<div class="card' + (state.selected[c.project_id] ? ' sel' : '') + '" data-id="' + esc(c.project_id) + '">' +
      '<div class="pick">' + (state.selected[c.project_id] ? '&#10003;' : '') + '</div>' +
      '<div class="thumb' + frameCls + '">' +
        '<div class="initials">' + esc(initials(c.name)) + '</div>' +
        '<img data-src="' + esc(poster) + '" alt="">' +
        '<div class="badges"><span class="badge state-' + st.k + '">' + esc(st.label) + '</span></div>' +
        (c.copies && c.copies.length ? '<span class="copies" data-copies="' + esc(c.project_id) + '">+' + c.copies.length + ' ' + (c.copies.length === 1 ? 'copy' : 'copies') + '</span>' : '') +
      '</div>' +
      '<div class="meta">' +
        '<p class="cname">' + esc(c.name) + '</p>' +
        '<div class="cmeta">' +
          '<b>' + fmtDur(c.duration_seconds) + '</b><span class="dot"></span>' +
          '<span>' + c.scene_count + ' scene' + (c.scene_count === 1 ? '' : 's') + '</span>' +
          (c.frame && c.frame !== '16x9' ? '<span class="dot"></span><span>' + esc(c.frame) + '</span>' : '') +
          (fmtDate(c.touched_at) ? '<span class="dot"></span><span>' + esc(fmtDate(c.touched_at)) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var grid = document.getElementById('grid');
    var empty = document.getElementById('empty');
    var out = [];
    state.cards.forEach(function (c) {
      out.push(cardHtml(c));
      if (state.expanded[c.project_id] && c.copies) c.copies.forEach(function (k) { out.push(cardHtml(k)); });
    });
    grid.innerHTML = out.join('');
    grid.querySelectorAll('img[data-src]').forEach(function (img) { io.observe(img); });

    empty.style.display = state.cards.length ? 'none' : '';
    if (!state.cards.length) {
      empty.innerHTML = state.q
        ? '<h2>Nothing matches “' + esc(state.q) + '”</h2><p>Search covers the title, the prompt, and the words on screen.</p>'
        : state.archived ? '<h2>The archive is empty</h2><p>Films you put down land here.</p>'
        : '<h2>No films yet</h2>';
    }
    var c = state.counts || {};
    document.getElementById('count').textContent =
      state.total + (state.q ? ' match' + (state.total === 1 ? '' : 'es') : ' film' + (state.total === 1 ? '' : 's'));
    renderFilters(c);
    renderActionbar();
  }

  function renderFilters(counts) {
    var defs = state.archived
      ? [['all', 'Archived', counts.archived]]
      : [['all', 'All', counts.all], ['rendered', 'Rendered', counts.rendered],
         ['built', 'Built', counts.built], ['board', 'Boards', counts.board]];
    var html = defs.map(function (d) {
      return '<button class="chip' + (state.filter === d[0] ? ' on' : '') + '" data-filter="' + d[0] + '">' +
        d[1] + ' <span class="n">' + (d[2] == null ? '' : d[2]) + '</span></button>';
    }).join('');
    html += '<span class="grow"></span>';
    if (!state.q) {
      html += '<select class="chip" id="sort">' +
        ['recent:Newest', 'name:Name', 'longest:Longest'].map(function (o) {
          var v = o.split(':');
          return '<option value="' + v[0] + '"' + (state.sort === v[0] ? ' selected' : '') + '>' + v[1] + '</option>';
        }).join('') + '</select>';
    }
    html += '<button class="chip' + (state.archived ? ' on' : '') + '" id="archbtn">' +
      (state.archived ? 'Back to films' : 'Archive <span class="n">' + (counts.archived || 0) + '</span>') + '</button>';
    document.getElementById('filters').innerHTML = html;
  }

  function selectedIds() { return Object.keys(state.selected).filter(function (k) { return state.selected[k]; }); }

  function renderActionbar() {
    var bar = document.getElementById('actionbar');
    var ids = selectedIds();
    bar.classList.toggle('up', state.picking);
    document.getElementById('selcount').textContent = ids.length + ' selected';
    document.getElementById('actions').innerHTML = state.archived
      ? '<button class="btn" data-act="restore">Restore</button> <button class="btn danger" data-act="delete">Delete permanently</button>'
      : '<button class="btn primary" data-act="archive">Archive</button>';
  }

  var loadSeq = 0;
  function load() {
    var seq = ++loadSeq;
    var grid = document.getElementById('grid');
    if (!state.cards.length) {
      grid.innerHTML = new Array(8).fill('<div class="skeleton"></div>').join('');
    }
    var qs = '?filter=' + encodeURIComponent(state.filter) + '&sort=' + encodeURIComponent(state.sort) +
      (state.q ? '&q=' + encodeURIComponent(state.q) : '') + (state.archived ? '&archived=1' : '') + '&limit=200';
    api('/api/library/' + encodeURIComponent(state.tenant) + qs).then(function (r) {
      if (seq !== loadSeq) return;              // a later keystroke already won
      state.cards = r.cards; state.total = r.total; state.counts = r.counts;
      render();
      syncUrl();
    }).catch(function (e) {
      if (seq !== loadSeq) return;
      document.getElementById('grid').innerHTML = '';
      document.getElementById('empty').style.display = '';
      document.getElementById('empty').innerHTML = '<h2>Could not load the library</h2><p>' + esc(e.message) + '</p>';
    });
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.tenant) p.set('tenant', state.tenant);
    if (state.q) p.set('q', state.q);
    if (state.filter !== 'all') p.set('filter', state.filter);
    if (state.sort !== 'recent') p.set('sort', state.sort);
    if (state.archived) p.set('archived', '1');
    if (TOKEN) p.set('token', TOKEN);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
    // Studio's back arrow returns to exactly this view.
    try { sessionStorage.setItem('mp.library.last', location.pathname + '?' + p.toString()); } catch (e) {}
  }

  // ── Wiring ──
  var qEl = document.getElementById('q');
  qEl.value = state.q;
  var qT;
  qEl.addEventListener('input', function () {
    state.q = qEl.value.trim();
    document.getElementById('qclear').style.display = state.q ? 'block' : 'none';
    clearTimeout(qT); qT = setTimeout(load, 180);
  });
  document.getElementById('qclear').addEventListener('click', function () {
    qEl.value = ''; state.q = ''; this.style.display = 'none'; load(); qEl.focus();
  });
  document.getElementById('qclear').style.display = state.q ? 'block' : 'none';

  document.getElementById('filters').addEventListener('click', function (e) {
    var f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.getAttribute('data-filter'); load(); return; }
    if (e.target.closest('#archbtn')) {
      state.archived = !state.archived; state.filter = 'all';
      state.selected = Object.create(null); state.cards = [];
      load(); return;
    }
  });
  document.getElementById('filters').addEventListener('change', function (e) {
    if (e.target.id === 'sort') { state.sort = e.target.value; load(); }
  });

  document.getElementById('pickbtn').addEventListener('click', function () {
    state.picking = !state.picking;
    document.body.classList.toggle('picking', state.picking);
    this.classList.toggle('on', state.picking);
    if (!state.picking) state.selected = Object.create(null);
    render();
  });
  document.getElementById('pickdone').addEventListener('click', function () {
    document.getElementById('pickbtn').click();
  });
  document.getElementById('selall').addEventListener('click', function () {
    state.cards.forEach(function (c) { state.selected[c.project_id] = true; });
    render();
  });
  document.getElementById('selnone').addEventListener('click', function () {
    state.selected = Object.create(null); render();
  });

  document.getElementById('grid').addEventListener('click', function (e) {
    var copies = e.target.closest('[data-copies]');
    if (copies) {
      e.stopPropagation();
      var cid = copies.getAttribute('data-copies');
      state.expanded[cid] = !state.expanded[cid];
      render();
      return;
    }
    var card = e.target.closest('.card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    if (state.picking) {
      state.selected[id] = !state.selected[id];
      render();
      return;
    }
    location.href = studioHref(id);
  });

  document.getElementById('actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var ids = selectedIds();
    if (!ids.length) { toast('Nothing selected'); return; }
    if (act === 'delete' && !confirm('Delete ' + ids.length + ' film' + (ids.length === 1 ? '' : 's') + ' permanently? This cannot be undone.')) return;
    api('/api/library/' + encodeURIComponent(state.tenant) + '/bulk', {
      method: 'POST', body: JSON.stringify({ action: act, project_ids: ids })
    }).then(function (r) {
      toast((act === 'archive' ? 'Archived ' : act === 'restore' ? 'Restored ' : 'Deleted ') + r.done);
      state.selected = Object.create(null);
      load();
    }).catch(function (err) { toast(err.message); });
  });

  // Tenant: from the link, or from who is signed in.
  if (state.tenant) { load(); }
  else {
    fetch('/auth/me').then(function (r) { if (!r.ok) throw new Error('signed out'); return r.json(); })
      .then(function (me) { state.tenant = me.tenant_id; load(); })
      .catch(function () {
        location.href = '/auth/google/login?return_to=' + encodeURIComponent(location.pathname + location.search);
      });
  }
})();
</script>
</body>
</html>`;
}
