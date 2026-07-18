// Quotient Recorder -- background orchestrator (SPEC-recorder.md).
// Owns the recording session: gets the tab stream id, spins up the offscreen
// document (MV3 can't run MediaRecorder here), injects the event-capture
// content script into the recorded tab, collects its events on the recording
// clock, and on stop hands the offscreen doc everything it needs to upload
// (video + events sidecar) and trigger generate.

let session = null; // { tabId, startedMs, events: {...}, settings }

const DEFAULTS = { server: "", tenant: "", token: "", project: "library", mic: false };

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "MediaRecorder for tab capture (MV3 service workers cannot record)",
  });
}

function freshEvents(tab, settings) {
  return {
    version: 1,
    recording: {
      width: 0, // offscreen fills from the actual track settings
      height: 0,
      url: tab.url || "",
      startedAt: new Date().toISOString(),
    },
    clicks: [],
    inputs: [],
    navigations: [],
    mutationsIdle: [],
    chapters: [],
    retakes: [],
    _activity: [], // internal: activity marks; converted to mutationsIdle on stop
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "qr-start") {
        const settings = await getSettings();
        if (!settings.server || !settings.tenant || !settings.token) {
          sendResponse({ ok: false, error: "Configure server, tenant and token first." });
          return;
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, error: "No active tab." }); return; }
        // Chrome forbids extensions on its own pages -- fail with directions,
        // not a cryptic "Cannot access a chrome:// URL".
        if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/.test(tab.url || "")) {
          sendResponse({ ok: false, error: "This page can't be recorded. Switch to the tab you want to demo (a normal website), then hit Record." });
          return;
        }

        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        await ensureOffscreen();
        session = { tabId: tab.id, startedMs: Date.now(), events: freshEvents(tab, settings), settings };
        // Skeleton persisted so a suspended-and-restarted worker can still
        // finish the upload on Stop (see qr-ping handler).
        await chrome.storage.session?.set({ qrSession: { tabId: tab.id, startedMs: session.startedMs, settings } });

        // Instrument the tab. Injected (not declared) so only recorded tabs
        // ever run the capture script.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });

        await chrome.runtime.sendMessage({ type: "qr-offscreen-start", streamId, mic: !!settings.mic });

        // Mode A gets a teleprompter in a SEPARATE window: tab capture films
        // the tab, so anything injected into the page would end up on film.
        if (settings.mic) {
          try {
            const win = await chrome.windows.create({
              url: "prompter.html", type: "popup", width: 480, height: 360, focused: false,
            });
            session.prompterWin = win.id;
          } catch (e) { /* prompter is a nicety, never a blocker */ }
        }
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "qr-stop") {
        if (!session) { sendResponse({ ok: false, error: "Not recording." }); return; }
        const s = session;
        session = null;
        await chrome.storage.session?.remove("qrSession");
        try { await chrome.tabs.sendMessage(s.tabId, { type: "qr-content-stop" }); } catch (e) {}
        if (s.prompterWin) { try { await chrome.windows.remove(s.prompterWin); } catch (e) {} }
        const durationMs = Date.now() - s.startedMs;
        s.events.recording.durationMs = durationMs;
        s.events.mutationsIdle = idleFromActivity(s.events._activity, durationMs);
        delete s.events._activity;
        // Offscreen owns the blob; it uploads video -> events -> generate.
        await chrome.runtime.sendMessage({
          type: "qr-offscreen-stop",
          upload: {
            server: s.settings.server.replace(/\/+$/, ""),
            tenant: s.settings.tenant,
            token: s.settings.token,
            project: s.settings.project || "library",
            name: `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
            events: s.events,
            mic: !!s.settings.mic,
          },
        });
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "qr-event") {
        // From the content script: stamp onto the recording clock.
        if (!session || sender.tab?.id !== session.tabId) return;
        const t = Date.now() - session.startedMs;
        const ev = session.events;
        if (msg.kind === "click") ev.clicks.push({ t, ...msg.data });
        else if (msg.kind === "input") ev.inputs.push({ t, ...msg.data });
        else if (msg.kind === "navigation") ev.navigations.push({ t, ...msg.data });
        else if (msg.kind === "chapter") ev.chapters.push({ t, ...msg.data });
        else if (msg.kind === "activity") ev._activity.push(t);
        return;
      }

      if (msg.type === "qr-offscreen-status") {
        // Progress + terminal states from the offscreen uploader.
        if (msg.state === "ready" && msg.projectUrl) {
          chrome.notifications?.create("qr-ready", {
            type: "basic",
            iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            title: "Quotient Recorder",
            message: "Your walkthrough is ready — click to open it in Studio.",
          });
        } else if (msg.state === "done") {
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            title: "Quotient Recorder",
            message: "Uploaded. Assembling your walkthrough -- it will appear in Studio shortly.",
          });
        } else if (msg.state === "error") {
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            title: "Quotient Recorder",
            message: "Upload failed: " + (msg.error || "unknown error"),
          });
        }
        chrome.storage.session?.set({ qrLastStatus: { state: msg.state, error: msg.error || null, projectUrl: msg.projectUrl || null, at: Date.now() } });
        return;
      }

      if (msg.type === "qr-ping") {
        // Keepalive from the recorded tab: receiving any message resets the
        // MV3 suspend timer. If the worker DID restart (session lost),
        // rebuild a skeleton from storage so Stop can still upload the
        // video; events captured during the dead window are gone, which
        // degrades idle detection but never the recording itself.
        if (!session) {
          const { qrSession } = (await chrome.storage.session?.get("qrSession")) || {};
          if (qrSession) {
            session = { ...qrSession, events: qrSession.events || freshEvents({ url: "" }, qrSession.settings) };
            console.warn("QuotientRecorder: service worker restarted mid-recording; session skeleton restored");
          }
        }
        return;
      }

      if (msg.type === "qr-status") {
        sendResponse({ recording: !!session });
        return;
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: String(e && e.message || e) }); } catch (e2) {}
    }
  })();
  return true; // async sendResponse
});

// Ready notification -> open the film in Studio.
chrome.notifications?.onClicked.addListener(async (id) => {
  if (id !== "qr-ready") return;
  const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
  if (qrLastStatus?.projectUrl) chrome.tabs.create({ url: qrLastStatus.projectUrl });
  chrome.notifications.clear(id);
});

// Activity marks (any input or DOM mutation ping) -> idle spans: a gap with
// no marks for >= 2s is idle. This is the sidecar's compress-the-waiting
// ground truth -- no pixel decoding anywhere.
function idleFromActivity(marks, durationMs) {
  const sorted = (marks || []).slice().sort((a, b) => a - b);
  const idle = [];
  let cursor = 0;
  const MIN = 2000;
  for (const m of sorted) {
    if (m - cursor >= MIN) idle.push({ from: cursor, to: m });
    cursor = Math.max(cursor, m);
  }
  if (durationMs - cursor >= MIN) idle.push({ from: cursor, to: durationMs });
  return idle;
}
