// Quotient Recorder -- component camera (SPEC-web-capture.md).
// Injected on demand: an element picker (DevTools-inspect style) that
// serializes the chosen subtree ENTIRELY IN-PAGE -- computed styles inlined,
// images baked to data URIs -- and shows a LOCAL verdict panel (replica vs
// screenshot). Nothing leaves the browser until "Create component".
(() => {
  if (window.__qcCaptureActive) return;
  window.__qcCaptureActive = true;

  const DPR = window.devicePixelRatio || 1;

  // Visual properties worth carrying; everything else falls back to the
  // replica's own cascade defaults. Diffed per-tag against a clean probe so
  // the serialized style attributes stay sane.
  const STYLE_PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "flex", "flex-direction",
    "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "align-self", "align-content",
    "justify-content", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows",
    "grid-column", "grid-row", "order", "float", "clear", "overflow", "overflow-x", "overflow-y",
    "width", "height", "min-width", "min-height", "max-width", "max-height", "box-sizing",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
    "background-color", "background-image", "background-size", "background-position", "background-repeat",
    "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-align", "text-decoration-line", "text-decoration-color", "text-transform", "white-space",
    "text-overflow", "vertical-align", "word-break", "opacity", "box-shadow", "text-shadow",
    "transform", "filter", "backdrop-filter", "object-fit", "object-position", "cursor",
    "visibility", "outline-width", "outline-style", "outline-color", "list-style-type",
  ];

  // ── Per-tag default probe (hidden iframe with a virgin document) ──
  let probeDoc = null;
  const probeCache = new Map();
  function probeDefaults(tag) {
    if (probeCache.has(tag)) return probeCache.get(tag);
    if (!probeDoc) {
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;width:10px;height:10px;left:-9999px;top:-9999px;visibility:hidden;";
      document.documentElement.appendChild(f);
      probeDoc = f.contentDocument;
      window.__qcProbeFrame = f;
    }
    let el;
    try { el = probeDoc.createElement(tag); } catch (e) { el = probeDoc.createElement("div"); }
    probeDoc.body.appendChild(el);
    const cs = probeDoc.defaultView.getComputedStyle(el);
    const out = {};
    for (const p of STYLE_PROPS) out[p] = cs.getPropertyValue(p);
    el.remove();
    probeCache.set(tag, out);
    return out;
  }

  // ── Asset inlining: fetch with the PAGE's credentials, return data URI ──
  const assetCache = new Map();
  const substitutions = [];
  async function toDataUri(url) {
    if (!url || url.startsWith("data:")) return url;
    if (assetCache.has(url)) return assetCache.get(url);
    const p = (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        if (blob.size > 3 * 1024 * 1024) throw new Error("asset too large");
        return await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      } catch (e) {
        substitutions.push("asset dropped: " + url.slice(0, 80) + " (" + (e.message || "blocked") + ")");
        return null;
      }
    })();
    assetCache.set(url, p);
    return p;
  }

  // ── Serialize: clone the subtree, inline computed styles, bake assets ──
  async function serialize(root) {
    substitutions.length = 0;
    const clone = root.cloneNode(true);
    const origWalk = [root, ...root.querySelectorAll("*")];
    const cloneWalk = [clone, ...clone.querySelectorAll("*")];
    const fontFamilies = new Set();

    for (let i = 0; i < origWalk.length; i++) {
      const o = origWalk[i], c = cloneWalk[i];
      if (!c || c.nodeType !== 1) continue;
      const tag = o.tagName.toLowerCase();
      if (tag === "script" || tag === "iframe" || tag === "object" || tag === "embed") continue; // server kills them anyway
      const cs = getComputedStyle(o);
      if (cs.display === "none" || cs.visibility === "hidden") { c.remove(); continue; }
      const defaults = probeDefaults(tag);
      const parts = [];
      for (const p of STYLE_PROPS) {
        const v = cs.getPropertyValue(p);
        if (!v || v === defaults[p]) continue;
        parts.push(p + ":" + v);
      }
      fontFamilies.add(cs.fontFamily);
      c.removeAttribute("class");
      c.removeAttribute("id");
      c.setAttribute("style", parts.join(";"));
      // Freeze live form state into attributes.
      if (tag === "input") { c.setAttribute("value", o.value || ""); if (o.checked) c.setAttribute("checked", ""); }
      if (tag === "textarea") c.textContent = o.value || "";
      if (tag === "select" && o.selectedIndex >= 0) {
        const opts = c.querySelectorAll("option");
        opts.forEach((op, j) => { if (j === o.selectedIndex) op.setAttribute("selected", ""); else op.removeAttribute("selected"); });
      }
    }

    // Bake images: <img> src (resolve currentSrc for srcset) + CSS backgrounds.
    const imgJobs = [];
    for (let i = 0; i < origWalk.length; i++) {
      const o = origWalk[i], c = cloneWalk[i];
      if (!c || c.nodeType !== 1) continue;
      if (o.tagName === "IMG") {
        const src = o.currentSrc || o.src;
        c.removeAttribute("srcset"); c.removeAttribute("sizes"); c.removeAttribute("loading");
        imgJobs.push(toDataUri(src).then((d) => { if (d) c.setAttribute("src", d); else c.removeAttribute("src"); }));
      }
      const bg = getComputedStyle(o).backgroundImage;
      const m = bg && bg !== "none" ? bg.match(/url\(["']?([^"')]+)["']?\)/) : null;
      if (m && !m[1].startsWith("data:")) {
        imgJobs.push(toDataUri(m[1]).then((d) => {
          const st = c.getAttribute("style") || "";
          c.setAttribute("style", d
            ? st.replace(bg.replace(/"/g, '"'), "") + ";background-image:url(" + d + ")"
            : st.replace(/background-image:[^;]*(;|$)/, ""));
        }));
      }
    }
    await Promise.all(imgJobs);

    // v1 fonts: families ride along as computed font stacks; binaries are not
    // embedded (licensed CDNs mostly block it) -- the panel says so.
    const families = [...fontFamilies].filter((f) => f && !/^(-apple-system|system-ui|Arial|Helvetica|Georgia|Times|Courier|monospace|sans-serif|serif)/i.test(f));
    if (families.length) substitutions.push("fonts fall back to system stacks: " + families.slice(0, 3).join(" · "));

    return clone.outerHTML;
  }

  // ── Picker overlay (shadow DOM so page CSS can't touch it) ──
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  const ui = host.attachShadow({ mode: "open" });
  ui.innerHTML = `
    <style>
      .box { position: fixed; pointer-events: none; border: 2px solid #393bf5; background: rgba(57,59,245,0.08); border-radius: 3px; display: none; }
      .chip { position: fixed; pointer-events: none; background: #17171c; color: #fff; font: 11px/1.6 -apple-system, sans-serif; padding: 1px 8px; border-radius: 4px; display: none; white-space: nowrap; }
      .hint { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); background: #17171c; color: #fff; font: 12.5px/1.5 -apple-system, sans-serif; padding: 8px 16px; border-radius: 999px; box-shadow: 0 4px 24px rgba(0,0,0,0.35); }
      .hint b { color: #a5b4fc; }
      .panel { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: none; align-items: center; justify-content: center; pointer-events: auto; }
      .card { background: #fff; border-radius: 14px; width: min(1060px, 94vw); max-height: 92vh; overflow: auto; padding: 20px 24px; font: 13px/1.5 -apple-system, sans-serif; color: #17171c; box-shadow: 0 24px 80px rgba(0,0,0,0.4); }
      .card h1 { font-size: 16px; margin: 0 0 4px; }
      .sub { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
      .ab { display: flex; gap: 12px; }
      .ab > div { flex: 1; min-width: 0; }
      .ab .lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; color: #6b7280; margin-bottom: 5px; }
      .ab iframe, .ab img { width: 100%; border: 1px solid #d8dbe4; border-radius: 8px; background: #f6f7fa; display: block; }
      .subs { margin: 10px 0 0; color: #92400e; background: #fef3c7; border-radius: 8px; padding: 8px 12px; font-size: 12px; display: none; }
      .row { display: flex; gap: 10px; margin-top: 14px; }
      .row input, .row textarea { flex: 1; border: 1px solid #d8dbe4; border-radius: 8px; padding: 8px 10px; font: inherit; }
      .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
      button { font: inherit; border-radius: 8px; padding: 9px 18px; cursor: pointer; border: 1px solid #d8dbe4; background: #fff; }
      .primary { background: #393bf5; border-color: #393bf5; color: #fff; font-weight: 600; }
      .status { color: #6b7280; align-self: center; margin-right: auto; }
    </style>
    <div class="box"></div><div class="chip"></div>
    <div class="hint">Hover a region · <b>scroll</b> widen/narrow · <b>C</b> capture · <b>Esc</b> exit</div>
    <div class="panel"><div class="card">
      <h1>Capture as component</h1>
      <div class="sub">Left: the replica that becomes the component. Right: the page as it looked. Nothing is created until you confirm.</div>
      <div class="ab">
        <div><div class="lbl">REPLICA (the component)</div><iframe sandbox="allow-same-origin"></iframe></div>
        <div><div class="lbl">REFERENCE (the page)</div><img alt=""></div>
      </div>
      <div class="subs"></div>
      <div class="row"><input class="name" placeholder="component-name" spellcheck="false"><button class="reselect">↩ Reselect</button></div>
      <div class="row"><textarea class="desc" rows="2" placeholder="One-line description (what the storyboard reads when casting this)"></textarea></div>
      <div class="actions"><span class="status"></span><button class="cancel">Cancel</button><button class="primary create">Create component</button></div>
    </div></div>`;
  document.documentElement.appendChild(host);
  const $box = ui.querySelector(".box"), $chip = ui.querySelector(".chip"), $hint = ui.querySelector(".hint");
  const $panel = ui.querySelector(".panel"), $frame = ui.querySelector("iframe"), $ref = ui.querySelector(".ab img");
  const $subs = ui.querySelector(".subs"), $name = ui.querySelector(".name"), $desc = ui.querySelector(".desc");
  const $status = ui.querySelector(".status");

  let hoverEl = null, pickedEl = null, ancestry = [], depth = 0, bundle = null;

  function outline(el) {
    if (!el) { $box.style.display = "none"; $chip.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    $box.style.display = "block";
    $box.style.left = r.left - 2 + "px"; $box.style.top = r.top - 2 + "px";
    $box.style.width = r.width + "px"; $box.style.height = r.height + "px";
    $chip.style.display = "block";
    $chip.textContent = el.tagName.toLowerCase() + " · " + Math.round(r.width) + "×" + Math.round(r.height);
    $chip.style.left = Math.max(6, r.left) + "px";
    $chip.style.top = Math.max(6, r.top - 24) + "px";
  }
  function current() { return ancestry[depth] || hoverEl; }

  function onMove(e) {
    if ($panel.style.display === "flex") return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverEl || host.contains(el)) return;
    hoverEl = el;
    ancestry = [el];
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) { ancestry.push(p); p = p.parentElement; }
    depth = 0;
    outline(current());
  }
  function onWheel(e) {
    if ($panel.style.display === "flex") return;
    e.preventDefault(); e.stopPropagation();
    depth = Math.max(0, Math.min(ancestry.length - 1, depth + (e.deltaY > 0 ? -1 : 1)));
    outline(current());
  }
  function suppress(e) { if (!host.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }

  async function capture() {
    pickedEl = current();
    if (!pickedEl) return;
    const r = pickedEl.getBoundingClientRect();
    // The picker chrome must not photobomb the reference screenshot.
    host.style.display = "none";
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    // Reference screenshot: background rasterizes the visible tab, we crop.
    let refUrl = null;
    try {
      const shot = await chrome.runtime.sendMessage({ type: "qc-shot" });
      if (shot && shot.ok) {
        refUrl = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
            cv.getContext("2d").drawImage(img, r.left * DPR, r.top * DPR, r.width * DPR, r.height * DPR, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL("image/png"));
          };
          img.onerror = () => resolve(null);
          img.src = shot.dataUrl;
        });
      }
    } catch (e) { /* screenshot is best-effort */ }

    const html = await serialize(pickedEl);
    host.style.display = "";
    outline(null);

    bundle = {
      name: suggestName(pickedEl),
      html, screenshot: refUrl,
      source_url: location.origin + location.pathname,
      width: Math.round(r.width), height: Math.round(r.height), dpr: DPR,
    };
    window.__qcLastBundle = bundle; // debugging + test hook; never read by the flow
    // Local verdict: replica rendered from the serialized bytes themselves.
    $frame.style.height = Math.min(420, Math.max(140, r.height * (($frame.clientWidth || 480) / r.width))) + "px";
    $frame.srcdoc = '<!doctype html><body style="margin:0;background:#fff;display:flex;align-items:flex-start;justify-content:center;overflow:auto;"><div style="zoom:' +
      Math.min(1, ($frame.clientWidth || 480) / r.width) + '">' + html + "</div></body>";
    if (refUrl) { $ref.src = refUrl; $ref.style.display = "block"; } else $ref.style.display = "none";
    $subs.style.display = substitutions.length ? "block" : "none";
    $subs.textContent = substitutions.slice(0, 4).join("  ·  ");
    $name.value = bundle.name;
    $panel.style.display = "flex";
    $hint.style.display = "none";
  }

  function suggestName(el) {
    const site = location.hostname.replace(/^www\./, "").split(".")[0];
    const role = (el.getAttribute("aria-label") || el.tagName.toLowerCase());
    return (site + "-" + role).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  function reselect() { $panel.style.display = "none"; $hint.style.display = "block"; $hint.textContent = ""; outline(current()); resetHint(); }
  function resetHint() { $hint.innerHTML = 'Hover a region · <b>scroll</b> widen/narrow · <b>C</b> capture · <b>Esc</b> exit'; }
  function exit() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("click", suppress, true);
    document.removeEventListener("keydown", onKey, true);
    if (window.__qcProbeFrame) { window.__qcProbeFrame.remove(); window.__qcProbeFrame = null; }
    host.remove();
    window.__qcCaptureActive = false;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); ($panel.style.display === "flex") ? reselect() : exit(); return; }
    if ($panel.style.display === "flex") return;
    if (e.key === "c" || e.key === "C") { e.preventDefault(); capture(); }
  }

  ui.querySelector(".cancel").addEventListener("click", exit);
  ui.querySelector(".reselect").addEventListener("click", reselect);
  ui.querySelector(".create").addEventListener("click", async () => {
    if (!bundle) return;
    bundle.name = $name.value.trim() || bundle.name;
    bundle.description = $desc.value.trim();
    $status.textContent = "Minting…";
    const res = await chrome.runtime.sendMessage({ type: "qc-mint", bundle });
    if (res && res.ok) {
      $status.textContent = "";
      $hint.style.display = "block";
      $hint.innerHTML = "✓ <b>" + res.type + "</b> minted — castable in storyboards now";
      $panel.style.display = "none";
      setTimeout(exit, 2400);
    } else {
      $status.textContent = "✗ " + ((res && res.error) || "failed — try again");
    }
  });

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("click", suppress, true);
  document.addEventListener("keydown", onKey, true);
})();
