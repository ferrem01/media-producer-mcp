// Quotient Recorder -- in-page event capture (injected only into the
// recorded tab). Ships ground truth to the background on every meaningful
// act: clicks with the target element's box + accessible name, typing/scroll
// activity, SPA navigations, DOM-mutation activity pings, and chapter marks
// (Ctrl/Cmd+Shift+N). Nothing here touches pixels.
(() => {
  if (window.__qrRecording) return; // idempotent across re-injection
  window.__qrRecording = true;

  const send = (kind, data) => {
    try { chrome.runtime.sendMessage({ type: "qr-event", kind, data: data || {} }); } catch (e) {}
  };

  const labelFor = (el) => {
    if (!el) return "";
    return (
      el.getAttribute?.("aria-label") ||
      el.getAttribute?.("title") ||
      (el.labels && el.labels[0]?.innerText) ||
      (el.innerText || "").trim().slice(0, 60) ||
      el.getAttribute?.("placeholder") ||
      el.alt || ""
    ).slice(0, 60);
  };

  const boxFor = (el) => {
    const r = el?.getBoundingClientRect?.();
    if (!r || r.width < 1) return undefined;
    // CSS px -> recording px happens server-side via recording dims; we ship
    // viewport-relative CSS px + the viewport size so scale is recoverable.
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const onClick = (e) => {
    // Prefer the most meaningful ancestor: button/link/input over a bare span.
    let el = e.target;
    const interactive = el.closest?.("button, a, [role=button], [role=tab], input, select, textarea, [role=menuitem]");
    if (interactive) el = interactive;
    send("click", {
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      box: boxFor(el),
      label: labelFor(el),
      role: el.getAttribute?.("role") || el.tagName?.toLowerCase() || "",
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });
    send("activity");
  };

  let lastScroll = 0;
  const onScroll = () => {
    const now = Date.now();
    if (now - lastScroll < 400) return;
    lastScroll = now;
    send("input", { kind: "scroll" });
    send("activity");
  };

  let lastKey = 0;
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "N" || e.key === "n")) {
      send("chapter", { label: document.title.slice(0, 60) });
      return;
    }
    const now = Date.now();
    if (now - lastKey < 500) { send("activity"); return; }
    lastKey = now;
    const el = document.activeElement;
    send("input", { kind: "type", box: boxFor(el), label: labelFor(el) });
    send("activity");
  };

  const nav = () => send("navigation", { url: location.pathname + location.search, title: document.title.slice(0, 80) });
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...a) => { const r = origPush(...a); nav(); return r; };
  history.replaceState = (...a) => { const r = origReplace(...a); nav(); return r; };
  window.addEventListener("popstate", nav);

  // DOM mutations = "something is happening" (streamed agent output counts as
  // activity; a spinner's CSS animation does NOT mutate the DOM, so waiting
  // reads idle -- exactly the signal compress-the-waiting wants). Throttled.
  let lastMut = 0;
  const mo = new MutationObserver((muts) => {
    let meaningful = 0;
    for (const m of muts) {
      if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) meaningful++;
      else if (m.type === "characterData") meaningful++;
    }
    if (!meaningful) return;
    const now = Date.now();
    if (now - lastMut < 700) return;
    lastMut = now;
    send("activity");
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  nav(); // initial route

  const stop = () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("popstate", nav);
    history.pushState = origPush;
    history.replaceState = origReplace;
    mo.disconnect();
    window.__qrRecording = false;
  };
  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === "qr-content-stop") stop(); });
})();
