/**
 * The Team page (SPEC-team.md): who shares this tenant, invite an email,
 * remove a member. Opens from Studio on any screen with the same
 * token-in-the-link (or cookie session) auth as the take page. The token
 * IS the tenant, so a link with only a token works too.
 */
export function getTeamHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Team · Studio</title>
<style>
  :root { --bg:#0f0f12; --panel:#17171c; --line:#2a2a33; --ink:#f4f4f6; --muted:#9a9aa6; --accent:#6d5cff; --err:#ff6b6b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; padding:20px 16px 48px; max-width:640px; margin-inline:auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 18px; font-size:14px; }
  .box { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px 16px; margin:0 0 14px; }
  .lead { color:var(--muted); font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-top:1px solid var(--line); }
  .row:first-of-type { border-top:0; }
  .who { min-width:0; }
  .who .e { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .who .n { color:var(--muted); font-size:13px; }
  button, .btn { border:1px solid var(--line); background:#22222a; color:var(--ink); border-radius:10px; padding:8px 12px; font:inherit; font-size:14px; cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); }
  button.quiet { background:transparent; color:var(--muted); }
  form { display:flex; gap:8px; }
  input[type=email] { flex:1; min-width:0; border:1px solid var(--line); background:#0f0f12; color:var(--ink); border-radius:10px; padding:10px 12px; font:inherit; }
  .status { color:var(--muted); font-size:14px; min-height:20px; margin-top:8px; }
  .status.err { color:var(--err); }
  a.back { color:var(--muted); font-size:14px; text-decoration:none; }
</style>
</head>
<body>
<a class="back" id="back" href="/studio">&larr; Studio</a>
<h1>Team</h1>
<p class="sub" id="sub">Loading…</p>
<div class="box">
  <div class="lead">Invite</div>
  <form id="inviteForm"><input type="email" id="inviteEmail" placeholder="name@company.com" required autocomplete="off"><button class="primary" type="submit">Invite</button></form>
  <div class="status" id="status"></div>
  <p class="sub" style="margin:10px 0 0">Everyone at your company domain joins automatically when they sign in. Invite an address from outside it here. Members see every project and the brand kit.</p>
</div>
<div class="box"><div class="lead">Members</div><div id="members"></div></div>
<div class="box" id="invitesBox" style="display:none"><div class="lead">Invited, not signed in yet</div><div id="invites"></div></div>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qp = new URLSearchParams(location.search);
  var tenant = qp.get('tenant') || '';
  var token = qp.get('token') || '';
  if (!tenant && token) {
    try { var seg = token.split('.')[1] || ''; var pay = JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/'))); tenant = String(pay.tenant_id || pay.tenant || ''); } catch (e) {}
  }
  function withToken(url) { return token ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token) : url; }
  function say(msg, err) { var st = $('status'); st.textContent = msg || ''; st.className = 'status' + (err ? ' err' : ''); }
  $('back').href = '/studio' + (tenant ? '?tenant=' + encodeURIComponent(tenant) + (token ? '&token=' + encodeURIComponent(token) : '') : '');
  var me = '';
  function start() {
    if (!tenant) {
      fetch('/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
        if (!m || !m.tenant_id) { $('sub').textContent = 'Sign in to Studio first, then open Team from there.'; return; }
        tenant = m.tenant_id; me = m.email || ''; load();
      }).catch(function () { $('sub').textContent = 'Sign in to Studio first, then open Team from there.'; });
      return;
    }
    fetch('/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { me = (m && m.email) || ''; }).catch(function () {}).then(load);
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
