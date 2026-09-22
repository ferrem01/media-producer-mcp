/**
 * The Team page (SPEC-team.md): who shares this tenant, invite an email,
 * remove a member. Opens from Studio on any screen with the same
 * token-in-the-link (or cookie session) auth as the take page. The token
 * IS the tenant, so a link with only a token works too.
 */
import { SHELL_TOKENS, RAIL_CSS, RAIL_JS, railHtml } from "./preview-app/home-shell.js";

export function getTeamHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Team · Studio</title>
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
  .head-in { max-width: 680px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: baseline; gap: 12px; }
  h1 { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  main { max-width: 680px; margin: 0 auto; padding: 20px 16px 80px; }
  .sub { color: var(--text-3); margin: 0 0 18px; font-size: 13px; }
  .box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 0 0 14px; }
  .lead { color: var(--text-3); font: 700 11px/16px Inter, sans-serif; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
  .row:first-of-type { border-top: 0; }
  .who { min-width: 0; }
  .who .e { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who .n { color: var(--text-3); font-size: 13px; }
  button.quiet { background: transparent; border-color: transparent; color: var(--text-3); }
  button.quiet:hover { background: var(--surface-2); color: var(--text); border-color: var(--border); }
  form { display: flex; gap: 8px; }
  input[type=email] {
    flex: 1; min-width: 0; height: 32px; border: 1px solid var(--border-2); background: var(--surface);
    color: var(--text); border-radius: var(--radius-sm); padding: 6px 11px; font: inherit; font-size: 14px; outline: none;
  }
  input[type=email]:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  .status { color: var(--text-3); font-size: 13px; min-height: 20px; margin-top: 8px; }
  .status.err { color: var(--danger); }
</style>
</head>
<body>
<div class="shell">
${railHtml("team")}
<div class="work">
  <header class="page-head"><div class="head-in"><h1>Team</h1><span class="sub" id="sub" style="margin:0">Loading&#8230;</span></div></header>
  <main>
    <div class="box">
      <div class="lead">Invite</div>
      <form id="inviteForm"><input type="email" id="inviteEmail" placeholder="name@company.com" required autocomplete="off"><button class="btn primary" type="submit">Invite</button></form>
      <div class="status" id="status"></div>
      <p class="sub" style="margin:10px 0 0">Everyone at your company domain joins automatically when they sign in. Invite an address from outside it here. Members see every project and the brand kit.</p>
    </div>
    <div class="box"><div class="lead">Members</div><div id="members"></div></div>
    <div class="box" id="invitesBox" style="display:none"><div class="lead">Invited, not signed in yet</div><div id="invites"></div></div>
  </main>
</div>
</div>
<script>
(function () {
${RAIL_JS}
  var $ = function (id) { return document.getElementById(id); };
  var tenant = '';
  var me = '';
  function say(msg, err) { var st = $('status'); st.textContent = msg || ''; st.className = 'status' + (err ? ' err' : ''); }
  function start() {
    // The rail signs the page in the way Studio does and hands back the tenant.
    bootHome(function (t) {
      tenant = t;
      fetch(withToken('/auth/me')).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (m) { me = (m && m.email) || ''; }).catch(function () {}).then(load);
    });
  }
  function render(t) {
    $('sub').textContent = 'Tenant ' + t.tenant_id + (t.domains && t.domains.length ? ' · everyone @' + t.domains.join(', @') : '');
    var mb = $('members'); mb.innerHTML = '';
    (t.members || []).forEach(function (m) {
      var row = document.createElement('div'); row.className = 'row';
      var who = document.createElement('div'); who.className = 'who';
      who.innerHTML = '<div class="e"></div><div class="n"></div>';
      who.querySelector('.e').textContent = m.email + (m.email === me ? ' (you)' : '');
      who.querySelector('.n').textContent = (m.name ? m.name + ' · ' : '') + ({ founder: 'founded the tenant', domain: 'joined by company domain', invite: 'invited' + (m.invited_by ? ' by ' + m.invited_by : '') }[m.via] || m.via);
      row.appendChild(who);
      if (m.email !== me) {
        var b = document.createElement('button'); b.className = 'quiet'; b.textContent = 'Remove';
        b.onclick = function () { if (confirm('Remove ' + m.email + ' from this tenant? They keep nothing here; their next sign-in lands in a tenant of their own.')) act('DELETE', m.email); };
        row.appendChild(b);
      }
      mb.appendChild(row);
    });
    var inv = t.invites || [];
    $('invitesBox').style.display = inv.length ? '' : 'none';
    var ib = $('invites'); ib.innerHTML = '';
    inv.forEach(function (i) {
      var row = document.createElement('div'); row.className = 'row';
      var who = document.createElement('div'); who.className = 'who';
      who.innerHTML = '<div class="e"></div><div class="n"></div>';
      who.querySelector('.e').textContent = i.email;
      who.querySelector('.n').textContent = 'invited by ' + i.invited_by;
      row.appendChild(who);
      var b = document.createElement('button'); b.className = 'quiet'; b.textContent = 'Withdraw';
      b.onclick = function () { act('DELETE', i.email); };
      row.appendChild(b);
      ib.appendChild(row);
    });
  }
  function load() {
    fetch(withToken('/api/team/' + encodeURIComponent(tenant))).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(render).catch(function (e) { $('sub').textContent = ''; say(e.message || String(e), true); });
  }
  function act(method, email) {
    say(method === 'POST' ? 'Inviting…' : 'Removing…');
    fetch(withToken('/api/team/' + encodeURIComponent(tenant)), { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        say({ invited: email + ' can sign in with Google and will land here.', already_member: email + ' is already a member.', already_invited: email + ' is already invited.', removed: email + ' removed.', invite_withdrawn: 'Invite withdrawn.', not_a_member: email + ' is not a member.' }[j.status] || 'Done.');
        if (j.team) render(j.team);
      })
      .catch(function (e) { say(e.message || String(e), true); });
  }
  $('inviteForm').addEventListener('submit', function (ev) { ev.preventDefault(); var e = $('inviteEmail').value.trim(); if (!e) return; act('POST', e); $('inviteEmail').value = ''; });
  start();
})();
</script>
</body>
</html>`;
}
