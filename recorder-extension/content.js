// Quotient Recorder -- in-page event capture + recording HUD (injected only
// into the recorded tab). Ships ground truth to the background on every
// meaningful act: clicks with the target element's box + accessible name,
// typing/scroll activity, SPA navigations, DOM-mutation activity pings, and
// chapter marks (Ctrl/Cmd+Shift+N).
//
// The HUD lives in a Document Picture-in-Picture window: always-on-top,
// draggable by the OS, and -- the point -- NOT part of the tab, so tab
// capture never films it. The "click to roll" prompt and the 3-2-1 countdown
// ARE in-page, but they run before the recorder starts, so they are never on
// film either.
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

  // Keepalive: MV3 service workers suspend after ~30s without events, and
  // the core use case (waiting for agents) is exactly a long stretch with
  // none. A 20s ping resets the idle timer so the session survives. Pings
  // are NOT activity marks -- idle detection ignores them.
  const heartbeat = setInterval(() => {
    try { chrome.runtime.sendMessage({ type: "qr-ping" }); } catch (e) {}
  }, 20000);

  // ── Recording HUD + roll flow ──
  let hudWin = null;
  const hudState = { rolling: false, paused: false, rollT: 0, pausedTotal: 0, pauseBegan: 0, timer: null };

  function fmtHud(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  async function openHud() {
    if (!("documentPictureInPicture" in window)) return null;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 224, height: 56 });
      const d = pip.document;
      d.body.style.cssText = "margin:0;font:600 13px -apple-system,'Segoe UI',sans-serif;background:#12141f;color:#fff;display:flex;align-items:center;gap:10px;padding:0 12px;height:100vh;user-select:none;overflow:hidden;";
      const dot = d.createElement("span");
      dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:#ef4444;flex:none;";
      d.body.appendChild(dot);
      pip.setInterval(() => { dot.style.opacity = dot.style.opacity === "0.3" ? "1" : "0.3"; }, 700);
      const time = d.createElement("span");
      time.textContent = "0:00";
      time.style.cssText = "font-variant-numeric:tabular-nums;flex:1;font-size:15px;";
      d.body.appendChild(time);
      const mkBtn = (label, title) => {
        const b = d.createElement("button");
        b.textContent = label;
        b.title = title;
        b.style.cssText = "background:#262a3d;color:#fff;border:0;border-radius:6px;width:32px;height:32px;font-size:13px;cursor:pointer;flex:none;";
        d.body.appendChild(b);
        return b;
      };
      const pauseBtn = mkBtn("⏸", "Pause recording");
      const stopBtn = mkBtn("⏹", "Stop & upload");
      stopBtn.style.background = "#7f1d1d";
      pauseBtn.addEventListener("click", () => {
        if (!hudState.rolling) return;
        if (hudState.paused) {
          hudState.pausedTotal += Date.now() - hudState.pauseBegan;
          hudState.paused = false;
          pauseBtn.textContent = "⏸";
          dot.style.background = "#ef4444";
          try { chrome.runtime.sendMessage({ type: "qr-resume" }); } catch (e) {}
        } else {
          hudState.paused = true;
          hudState.pauseBegan = Date.now();
          pauseBtn.textContent = "▶";
          dot.style.background = "#f59e0b";
          try { chrome.runtime.sendMessage({ type: "qr-pause" }); } catch (e) {}
        }
      });
      stopBtn.addEventListener("click", () => {
        try { chrome.runtime.sendMessage({ type: "qr-stop" }); } catch (e) {}
      });
      hudState.timer = pip.setInterval(() => {
        const now = Date.now();
        const paused = hudState.paused ? now - hudState.pauseBegan : 0;
        time.textContent = fmtHud(now - hudState.rollT - hudState.pausedTotal - paused);
      }, 250);
      pip.addEventListener("pagehide", () => { hudWin = null; }); // user closed it; popup still stops
      return pip;
    } catch (e) {
      return null;
    }
  }

  function overlayEl(html) {
    const o = document.createElement("div");
    o.id = "__qr_overlay";
    o.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(10,12,24,0.55);backdrop-filter:blur(2px);cursor:pointer;font:600 22px -apple-system,'Segoe UI',sans-serif;color:#fff;text-align:center;";
    o.innerHTML = html;
    document.documentElement.appendChild(o);
    return o;
  }

  function arm() {
    if (hudState.rolling || document.getElementById("__qr_overlay")) return;
    const o = overlayEl(
      '<div><div style="font-size:56px;margin-bottom:10px;color:#ef4444;">●</div>' +
      "<div>Click anywhere to roll</div>" +
      '<div style="font-size:13px;font-weight:400;opacity:0.75;margin-top:8px;">3-2-1 countdown, then recording starts. ⌘/Ctrl+Shift+N marks a chapter.</div></div>'
    );
    o.addEventListener("click", async (e) => {
      // This is a staging click, not demo content -- keep it out of the
      // event stream and use it as the user gesture the PiP HUD needs.
      e.stopPropagation();
      e.preventDefault();
      hudWin = await openHud();
      let n = 3;
      const digit = o.firstElementChild;
      const tick = () => {
        if (n === 0) {
          o.remove();
          // A beat of settle time so the last countdown frame can never
          // leak into the first captured frame.
          setTimeout(() => {
            hudState.rolling = true;
            hudState.rollT = Date.now();
            hudState.pausedTotal = 0;
            try { chrome.runtime.sendMessage({ type: "qr-roll" }); } catch (e2) {}
          }, 180);
          return;
        }
        digit.innerHTML = '<div style="font-size:120px;font-variant-numeric:tabular-nums;">' + n + "</div>";
        n--;
        setTimeout(tick, 800);
      };
      tick();
    }, { once: true, capture: true });
  }

  const stop = () => {
    clearInterval(heartbeat);
    if (hudWin) { try { hudWin.close(); } catch (e) {} hudWin = null; }
    document.getElementById("__qr_overlay")?.remove();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("popstate", nav);
    history.pushState = origPush;
    history.replaceState = origReplace;
    mo.disconnect();
    window.__qrRecording = false;
  };
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "qr-content-stop") stop();
    else if (msg?.type === "qr-arm") arm();
  });
})();
