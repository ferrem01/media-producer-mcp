/**
 * HOME'S SHELL — the left rail, the tokens, and the signed-in chip.
 *
 * Home is Films, Team and Brand. They used to be three different things in
 * three different places (a page, a page, and a tray inside Studio), which is
 * why Studio's header kept growing. One rail, shared, so every one of them is
 * the same room with a different panel open.
 */

/** Design tokens + base chrome. Light and dark, explicit body background. */
export const SHELL_TOKENS = `
  :root {
    --bg: #faf9f7; --surface: #ffffff; --surface-2: #f4f2ee;
    --border: #e6e3dd; --border-2: #d8d4cc;
    --text: #17171c; --text-2: #5f5c56; --text-3: #8d8980;
    --accent: #393bf5; --danger: #c2410c; --ok: #166534;
    --radius: 12px; --radius-sm: 8px;
    --shadow: 0 1px 2px rgba(20,20,40,.05), 0 8px 24px rgba(20,20,40,.06);
  }
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
  .btn {
    height: 32px; padding: 0 13px; font: 500 13px/1 Inter, sans-serif; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; cursor: pointer;
  }
  .btn:hover { border-color: var(--border-2); }
  .btn.primary { background: var(--text); color: var(--bg); border-color: var(--text); }
  .btn.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
`;

export const RAIL_CSS = `
  .shell { display: flex; align-items: flex-start; }
  nav.rail {
    position: sticky; top: 0; flex: none; width: 188px; height: 100vh;
    padding: 16px 10px; border-right: 1px solid var(--border); background: var(--surface);
    display: flex; flex-direction: column;
  }
  .rail-brand { font-size: 15px; font-weight: 700; padding: 6px 10px 14px; letter-spacing: -0.01em; }
  .rail a.rail-item {
    display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; margin-bottom: 2px;
    border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--text-2);
  }
  .rail a.rail-item:hover { background: var(--surface-2); color: var(--text); }
  .rail a.rail-item.on { background: var(--surface-2); color: var(--text); font-weight: 600; }
  /* Quotient's own icon family (Lucide, 24-viewBox strokes) drawn the way the
     app shell draws it -- see quotient-app-shell.component.html:170. */
  .rail a.rail-item .ico { width: 17px; height: 17px; display: inline-flex; flex: none; opacity: .75; }
  .rail a.rail-item.on .ico { opacity: 1; }
  .rail a.rail-item .ico svg {
    width: 17px; height: 17px;
    fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  }
  .rail-spacer { flex: 1; }
  /* The workshop is not tenant data -- the component library is one library
     for every film in the building -- so it sits under a rule of its own. */
  .rail-group {
    margin: 10px 10px 4px; padding-top: 10px; border-top: 1px solid var(--border);
    font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--text-3);
  }
  /* Who you are signed in as, the way Studio shows it. */
  .rail-me { display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; min-width: 0; }
  .rail-me img, .rail-me .av {
    width: 24px; height: 24px; border-radius: 50%; flex: none; object-fit: cover;
    background: var(--surface-2); color: var(--text-2);
    display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
  }
  .rail-me .who { min-width: 0; font-size: 12px; line-height: 1.25; }
  .rail-me .who b { display: block; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail-me .who span { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
  .rail-out { display: block; padding: 4px 10px 2px; font-size: 11px; color: var(--text-3); }
  .rail-out:hover { color: var(--text-2); text-decoration: underline; }
  .work { flex: 1; min-width: 0; }
  @media (max-width: 720px) {
    .shell { display: block; }
    nav.rail {
      position: static; width: auto; height: auto; flex-direction: row; align-items: center;
      gap: 4px; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 8px;
    }
    .rail-brand, .rail-spacer, .rail-me, .rail-out, .rail-group { display: none; }
  }
`;

export type RailPage = "films" | "team" | "brand" | "components";

/** The rail's icons, in Quotient's family: Lucide, 24-viewBox, stroked. `users`
 *  is lifted verbatim from the app shell's own nav so Team looks the same in
 *  both places. */
const ICONS: Record<RailPage, string> = {
  films: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/></svg>',
  team: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  brand: '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 011.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.96 6.01 17.46 2 12 2z"/><circle cx="6.5" cy="12.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/></svg>',
  components: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
};

export function railHtml(active: RailPage): string {
  const item = (id: RailPage, label: string) =>
    `<a class="rail-item${id === active ? " on" : ""}" id="nav-${id}" href="#"><span class="ico">${ICONS[id]}</span> ${label}</a>`;
  return `<nav class="rail">
  <div class="rail-brand">Quotient Studio</div>
  ${item("films", "Films")}
  ${item("team", "Team")}
  ${item("brand", "Brand")}
  <div class="rail-group">Workshop</div>
  ${item("components", "Components")}
  <div class="rail-spacer"></div>
  <div class="rail-me" id="rail-me" style="display:none"></div>
  <a class="rail-out" id="rail-out" href="/auth/logout" style="display:none">Sign out</a>
</nav>`;
}

/**
 * The rail's behaviour, as a script body. Resolves the tenant the way Studio
 * does -- from the link, else from /auth/me, else sign in -- points the three
 * items at their pages carrying whatever auth this page was opened with, and
 * shows who is signed in. Calls back with the tenant id once it is known.
 */
export const RAIL_JS = `
  var TOKEN = new URLSearchParams(location.search).get('token') || '';
  function withParam(p, k, v) {
    if (v === undefined || v === null || v === '') return p;
    return p + (p.indexOf('?') === -1 ? '?' : '&') + k + '=' + encodeURIComponent(v);
  }
  function withToken(p) { return withParam(p, 'token', TOKEN); }
  function railApi(path, opts) {
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
  function railEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function wireRail(tenant) {
    var q = tenant ? '?tenant=' + encodeURIComponent(tenant) : '';
    var films = document.getElementById('nav-films');
    var team = document.getElementById('nav-team');
    var brandN = document.getElementById('nav-brand');
    if (films) films.href = withToken('/library' + q);
    if (team) team.href = withToken('/team' + q);
    if (brandN) brandN.href = withToken('/brand' + q);
    // The playground already has a My Components tab and reads ?tenant= off
    // its own url; without the tenant it just says "enter a tenant id". The
    // house library is global, but WHOSE components to show beside it is not.
    var comps = document.getElementById('nav-components');
    if (comps) comps.href = withToken('/playground' + q);
  }
  function showMe(me) {
    var box = document.getElementById('rail-me');
    var out = document.getElementById('rail-out');
    if (!box || !me) return;
    var initial = (me.name || me.email || '?').trim().charAt(0).toUpperCase();
    box.innerHTML = (me.picture
        ? '<img src="' + railEsc(me.picture) + '" alt="">'
        : '<span class="av">' + railEsc(initial) + '</span>') +
      '<span class="who"><b>' + railEsc(me.name || me.email) + '</b><span>' + railEsc(me.tenant_id || '') + '</span></span>';
    box.style.display = 'flex';
    if (out) out.style.display = 'block';
  }
  /**
   * Resolve the tenant exactly the way Studio does, then hand it back.
   */
  function bootHome(onTenant) {
    var tenantParam = new URLSearchParams(location.search).get('tenant');
    fetch(withToken('/auth/me')).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (me) showMe(me);
        var tenant = tenantParam || (me && me.tenant_id);
        if (!tenant) {
          location.href = '/auth/google/login?return_to=' + encodeURIComponent(location.pathname + location.search);
          return;
        }
        wireRail(tenant);
        onTenant(tenant);
      })
      .catch(function () {
        if (tenantParam) { wireRail(tenantParam); onTenant(tenantParam); return; }
        location.href = '/auth/google/login?return_to=' + encodeURIComponent(location.pathname + location.search);
      });
  }
`;
