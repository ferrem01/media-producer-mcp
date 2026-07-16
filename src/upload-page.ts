/**
 * Studio upload page -- a browser drag-drop uploader served at /upload.
 *
 * The universal answer to "my video is bigger than the AI client's 30MB
 * attachment cap": the file goes browser -> server directly (raw bytes to
 * /api/upload-asset), never through Claude/Cowork/GPT, no curl, no droplet
 * access. Defaults to the tenant-level shared LIBRARY (projects/library) so a
 * camera clip / screencast / voiceover can be staged once and referenced from
 * any project; an explicit project id targets that project instead.
 *
 * Auth: the page reads ?tenant= and ?token= from its own URL (same token the
 * Studio SPA uses) and forwards the token on the upload request.
 */
export function getUploadHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload media · Media Studio</title>
<style>
  :root {
    --bg: #f7f7fb; --panel: #ffffff; --ink: #17171c; --muted: #6b6b7b;
    --line: #e6e6ef; --accent: #393bf5; --accent2: #1c82ff; --ok: #16a34a; --err: #dc2626;
    --drop: #f0f1fe; --shadow: 0 1px 2px rgba(20,20,50,.04), 0 8px 24px rgba(20,20,50,.06);
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e0e14; --panel:#17171f; --ink:#f4f4f8; --muted:#9a9aad;
      --line:#26262f; --drop:#1a1b2e; --shadow:0 1px 2px rgba(0,0,0,.3),0 10px 30px rgba(0,0,0,.4); }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:640px; margin:0 auto; padding:48px 20px 80px; }
  h1 { font-size:24px; font-weight:600; letter-spacing:-0.02em; margin:0 0 6px; }
  .sub { color:var(--muted); font-size:14px; margin:0 0 28px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px;
    box-shadow:var(--shadow); padding:22px; }
  label.field { display:block; font-size:12px; font-weight:600; letter-spacing:.04em;
    text-transform:uppercase; color:var(--muted); margin:0 0 8px; }
  .dest { display:flex; gap:8px; margin-bottom:16px; }
  .dest button { flex:1; padding:10px 12px; border-radius:10px; border:1px solid var(--line);
    background:transparent; color:var(--ink); font:inherit; font-size:14px; cursor:pointer;
    transition:.15s; }
  .dest button[aria-pressed="true"] { border-color:var(--accent);
    background:color-mix(in srgb, var(--accent) 10%, transparent); color:var(--accent); font-weight:600; }
  #projectId { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:10px;
    background:var(--bg); color:var(--ink); font:inherit; font-size:14px; margin-bottom:16px; }
  #projectId:disabled { opacity:.45; }
  .drop { border:2px dashed var(--line); border-radius:12px; padding:34px 18px; text-align:center;
    background:var(--drop); cursor:pointer; transition:.15s; }
  .drop.hover { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 8%,var(--drop)); }
  .drop .big { font-size:15px; font-weight:600; margin:0 0 4px; }
  .drop .small { font-size:13px; color:var(--muted); margin:0; }
  .drop svg { width:34px; height:34px; color:var(--accent); margin-bottom:10px; }
  input[type=file]{ display:none; }
  .row { display:flex; align-items:center; gap:12px; padding:12px 14px; border:1px solid var(--line);
    border-radius:10px; margin-top:12px; background:var(--panel); }
  .row .nm { flex:1; min-width:0; }
  .row .nm b { display:block; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .row .nm span { font-size:12px; color:var(--muted); }
  .bar { height:6px; border-radius:3px; background:var(--line); overflow:hidden; margin-top:6px; }
  .bar > i { display:block; height:100%; width:0; border-radius:3px;
    background:linear-gradient(90deg,var(--accent),var(--accent2)); transition:width .12s; }
  .st { font-size:12px; font-weight:600; white-space:nowrap; }
  .st.ok { color:var(--ok); } .st.err { color:var(--err); } .st.busy { color:var(--muted); }
  .assetUrl { margin-top:8px; font-size:12px; color:var(--muted); word-break:break-all; }
  .assetUrl code { color:var(--ink); background:var(--bg); padding:2px 6px; border-radius:5px;
    border:1px solid var(--line); font-family:ui-monospace,monospace; }
  .copy { margin-left:6px; cursor:pointer; color:var(--accent); font-weight:600; }
  .note { font-size:12.5px; color:var(--muted); margin-top:18px; }
  .banner { padding:12px 14px; border-radius:10px; font-size:13px; margin-bottom:20px;
    background:color-mix(in srgb,var(--err) 12%,transparent); color:var(--err);
    border:1px solid color-mix(in srgb,var(--err) 30%,transparent); }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Upload media</h1>
    <p class="sub">Drop a video, screen recording, voiceover, or image. It uploads straight to your library — no size limit, no copy-paste into chat.</p>
    <div id="authWarn" class="banner" style="display:none"></div>
    <div class="card">
      <label class="field">Destination</label>
      <div class="dest">
        <button id="destLib" aria-pressed="true">Shared library</button>
        <button id="destProj" aria-pressed="false">A specific project</button>
      </div>
      <input id="projectId" placeholder="project id (e.g. proj_57f8cf1f)" disabled>
      <div id="drop" class="drop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>
        <p class="big">Drop files here, or click to choose</p>
        <p class="small">Video, audio, or images · up to 512&nbsp;MB each</p>
      </div>
      <input type="file" id="file" multiple accept="video/*,audio/*,image/*">
      <div id="list"></div>
    </div>
    <p class="note" id="note"></p>
  </div>
<script>
(function(){
  var qp = new URLSearchParams(location.search);
  var tenant = qp.get('tenant') || '';
  var token = qp.get('token') || '';
  var dest = 'library';
  var destLib = document.getElementById('destLib');
  var destProj = document.getElementById('destProj');
  var projInput = document.getElementById('projectId');
  var drop = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var list = document.getElementById('list');
  var note = document.getElementById('note');

  if (!tenant) {
    var w = document.getElementById('authWarn');
    w.style.display = 'block';
    w.textContent = 'Missing ?tenant= (and ?token=) in the URL. Open this page from Studio or ask your agent for the upload link.';
  }
  note.innerHTML = 'Uploaded files land in <code>projects/library/assets</code> (or the project you pick). Reference the returned URL in any project — e.g. as a speaker-track source, a screencast video, or b-roll.';

  destLib.onclick = function(){ dest='library'; destLib.setAttribute('aria-pressed','true'); destProj.setAttribute('aria-pressed','false'); projInput.disabled=true; };
  destProj.onclick = function(){ dest='project'; destProj.setAttribute('aria-pressed','true'); destLib.setAttribute('aria-pressed','false'); projInput.disabled=false; projInput.focus(); };

  drop.onclick = function(){ fileInput.click(); };
  ['dragenter','dragover'].forEach(function(e){ drop.addEventListener(e,function(ev){ ev.preventDefault(); drop.classList.add('hover'); }); });
  ['dragleave','drop'].forEach(function(e){ drop.addEventListener(e,function(ev){ ev.preventDefault(); drop.classList.remove('hover'); }); });
  drop.addEventListener('drop', function(ev){ if(ev.dataTransfer && ev.dataTransfer.files) queue(ev.dataTransfer.files); });
  fileInput.addEventListener('change', function(){ queue(fileInput.files); fileInput.value=''; });

  function fmt(n){ if(n<1024)return n+' B'; if(n<1048576)return (n/1024).toFixed(0)+' KB'; if(n<1073741824)return (n/1048576).toFixed(1)+' MB'; return (n/1073741824).toFixed(2)+' GB'; }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var chain = Promise.resolve();
  function queue(files){
    Array.prototype.forEach.call(files, function(f){ chain = chain.then(function(){ return upload(f); }); });
  }

  function upload(file){
    return new Promise(function(resolve){
      var proj = dest==='library' ? 'library' : (projInput.value.trim() || 'library');
      if (!tenant) { resolve(); return; }
      var row = document.createElement('div'); row.className='row';
      row.innerHTML = '<div class="nm"><b>'+esc(file.name)+'</b><span>'+fmt(file.size)+' · '+esc(proj)+'</span><div class="bar"><i></i></div></div><div class="st busy">0%</div>';
      list.appendChild(row);
      var bar = row.querySelector('.bar > i'); var st = row.querySelector('.st');

      var url = '/api/upload-asset/'+encodeURIComponent(tenant)+'/'+encodeURIComponent(proj)
        + '?name='+encodeURIComponent(file.name) + (token ? '&token='+encodeURIComponent(token) : '');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = function(e){ if(e.lengthComputable){ var p=Math.round(e.loaded/e.total*100); bar.style.width=p+'%'; st.textContent=p+'%'; if(p>=100){ st.textContent='processing…'; } } };
      xhr.onload = function(){
        var res={}; try{ res=JSON.parse(xhr.responseText); }catch(e){}
        if (xhr.status===200 && res.url) {
          bar.style.width='100%'; st.className='st ok'; st.textContent='done';
          var a=document.createElement('div'); a.className='assetUrl';
          a.innerHTML='<code>'+esc(res.url)+'</code><span class="copy">copy</span>'+(res.normalized?' · re-encoded for web':'' );
          a.querySelector('.copy').onclick=function(){ navigator.clipboard.writeText(res.url); this.textContent='copied'; };
          row.querySelector('.nm').appendChild(a);
        } else {
          st.className='st err'; st.textContent='failed';
          var m=document.createElement('div'); m.className='assetUrl'; m.textContent=(res.error||('HTTP '+xhr.status)); row.querySelector('.nm').appendChild(m);
        }
        resolve();
      };
      xhr.onerror = function(){ st.className='st err'; st.textContent='network error'; resolve(); };
      xhr.send(file);
    });
  }
})();
</script>
</body>
</html>`;
}
