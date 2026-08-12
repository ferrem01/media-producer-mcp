// Replica stage: receives the serialized capture from the content script
// and renders it 1:1, painted smaller via transform (NEVER zoom -- zoom
// re-lays-out and text that fits its ellipsis box exactly at 1:1 tips over
// at fractional scale).
//
// The html comes from the page being captured, and this document runs in
// the extension origin -- inert it: no scripts, no inline handlers, no
// javascript: URLs.
addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type !== "qc-replica") return;
  let st = document.getElementById("qc-fonts");
  if (!st) {
    st = document.createElement("style");
    st.id = "qc-fonts";
    document.head.appendChild(st);
  }
  st.textContent = String(m.fontCss || "");
  const stage = document.getElementById("stage");
  stage.style.width = (Number(m.width) || 0) + "px";
  stage.style.transform = "scale(" + (Number(m.scale) || 1) + ")";
  stage.innerHTML = String(m.html || "");
  stage.querySelectorAll("script").forEach((s) => s.remove());
  for (const el of stage.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if ((a.name === "href" || a.name === "src") && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
});
