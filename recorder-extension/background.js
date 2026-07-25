// Quotient Recorder -- background orchestrator (SPEC-recorder.md).
// Owns the recording session: gets the tab stream id, spins up the offscreen
// document (MV3 can't run MediaRecorder here), injects the event-capture
// content script into the recorded tab, collects its events on the recording
// clock, and on stop hands the offscreen doc everything it needs to upload
// (video + events sidecar) and trigger generate.

// session.phase: 'armed' (waiting for the in-page roll click) -> 'recording'
// -> optionally 'paused' <-> 'recording'. startedMs is set at ROLL, not at
// arm, and pausedMs accumulates so event timestamps stay on the RECORDED
// clock (the film has no paused footage, so events must not either).
let session = null; // { tabId, phase, startedMs, pausedMs, pauseBegan, events, settings, prompterWin }

const DEFAULTS = { server: "", tenant: "", token: "", project: "library", mic: false, camera: false, destProject: "" };

// The one server this build talks to. Users never see or enter it -- the
// whole setup is "Sign in with Google". (Override via settings.server only
// for dev builds.)
const SERVER = "https://159-203-115-164.nip.io";

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

// ── Sign in with Google (server-brokered OAuth code + PKCE) ─────────────────
// The media-producer server already runs a full OAuth surface for MCP
// clients (RFC 7591 registration, /authorize backed by Google, /token with
// PKCE + rotating refresh tokens). The extension is just another registered
// client. After the flow we mirror {server, tenant, token} into the SAME
// sync settings the recording pipeline has always read -- so sign-in is the
// only new moving part.

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function ensureOAuthClient(server) {
  const { qrOAuthClient } = await chrome.storage.local.get("qrOAuthClient");
  const redirectUri = chrome.identity.getRedirectURL();
  if (qrOAuthClient?.client_id && qrOAuthClient.server === server && qrOAuthClient.redirect_uri === redirectUri) {
    return qrOAuthClient;
  }
  const res = await fetch(server + "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Quotient Recorder", redirect_uris: [redirectUri] }),
  });
  if (!res.ok) throw new Error("client registration failed (" + res.status + ")");
  const reg = await res.json();
  const client = { client_id: reg.client_id, server, redirect_uri: redirectUri };
  await chrome.storage.local.set({ qrOAuthClient: client });
  return client;
}

async function tokenExchange(server, body) {
  const res = await fetch(server + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = ""; try { detail = (await res.json()).error_description || ""; } catch (e) {}
    throw new Error("token exchange failed (" + res.status + (detail ? ": " + detail : "") + ")");
  }
  return res.json();
}

async function saveAuth(server, tok) {
  // Who am I? -> email + tenant for the signed-in display and upload routing.
  const meRes = await fetch(server + "/auth/me", { headers: { Authorization: "Bearer " + tok.access_token } });
  if (!meRes.ok) throw new Error("could not load profile (" + meRes.status + ")");
  const me = await meRes.json();
  const auth = {
    server,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || null,
    expires_at: Date.now() + (tok.expires_in || 86400) * 1000,
    email: me.email, name: me.name, picture: me.picture, tenant_id: me.tenant_id,
  };
  await chrome.storage.local.set({ qrAuth: auth });
  // Mirror into the sync settings every recording/upload path already reads.
  await chrome.storage.sync.set({ server, tenant: me.tenant_id, token: tok.access_token });
  return auth;
}

async function signIn() {
  const server = (await getSettings()).server || SERVER;
  const client = await ensureOAuthClient(server);
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(verifierBytes);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const authUrl = server + "/authorize?" + new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: client.redirect_uri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const got = new URL(redirect);
  if (got.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
  const code = got.searchParams.get("code");
  if (!code) throw new Error(got.searchParams.get("error_description") || "sign-in was cancelled");
  const tok = await tokenExchange(server, {
    grant_type: "authorization_code", code,
    redirect_uri: client.redirect_uri, code_verifier: verifier,
  });
  return saveAuth(server, tok);
}

/** Refresh the 24h access token when it is near expiry; silent no-op
 *  otherwise. Called before auth-status renders and before every recording
 *  starts, so a signed-in user never sees an expired-token failure. */
async function refreshIfNeeded() {
  const { qrAuth } = await chrome.storage.local.get("qrAuth");
  if (!qrAuth?.refresh_token) return qrAuth || null;
  if (qrAuth.expires_at - Date.now() > 10 * 60 * 1000) return qrAuth;
  try {
    const tok = await tokenExchange(qrAuth.server, { grant_type: "refresh_token", refresh_token: qrAuth.refresh_token });
    return await saveAuth(qrAuth.server, tok);
  } catch (e) {
    // Refresh token rotated away or revoked: back to signed-out.
    console.warn("qr: token refresh failed:", e.message);
    await signOut();
    return null;
  }
}

async function signOut() {
  await chrome.storage.local.remove("qrAuth");
  await chrome.storage.sync.set({ token: "", tenant: "" });
}

async function authStatus() {
  const auth = await refreshIfNeeded();
  if (auth) return { signedIn: true, email: auth.email, name: auth.name, picture: auth.picture, tenant: auth.tenant_id };
  return { signedIn: false };
}

// ── Toolbar badge: the take's live status at a glance ───────────────────────
// armed "•" -> recording "M:SS" (ticking, red) -> paused "⏸" -> upload "42%"
// -> assembling "⋯" -> ready "✓" / error "!". Chapter marks flash "⚑".
// The tooltip always carries the long-form version of the same state.
const BADGE_COLORS = { rec: "#dc2626", warn: "#f59e0b", up: "#3b82f6", gen: "#6366f1", ok: "#16a34a" };

function badge(text, color, title) {
  chrome.action?.setBadgeText?.({ text: text || "" });
  if (color) chrome.action?.setBadgeBackgroundColor?.({ color });
  chrome.action?.setBadgeTextColor?.({ color: "#ffffff" });
  chrome.action?.setTitle?.({ title: title || "Quotient Recorder" });
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 600) return Math.floor(s / 60) + "m"; // "12m" -- badge fits ~4 chars
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function recordingElapsedMs() {
  if (!session || !session.startedMs) return 0;
  const pausedTail = session.phase === "paused" ? Date.now() - session.pauseBegan : 0;
  return Date.now() - session.startedMs - session.pausedMs - pausedTail;
}

function badgeRecording() {
  const t = fmtElapsed(recordingElapsedMs());
  badge(t, BADGE_COLORS.rec, "Recording " + t + " — ⌘/Ctrl+Shift+N marks a chapter; stop from the popup.");
}

// A chapter mark flashes ⚑ so the keystroke visibly landed.
let chapterFlash = null;
function badgeChapterFlash() {
  if (chapterFlash) clearTimeout(chapterFlash);
  badge("⚑", BADGE_COLORS.gen, "Chapter marked");
  chapterFlash = setTimeout(() => {
    chapterFlash = null;
    if (session?.phase === "recording") badgeRecording();
  }, 1200);
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
      if (msg.type === "qr-auth-status") { sendResponse(await authStatus()); return; }
      if (msg.type === "qr-signin") {
        try { const a = await signIn(); sendResponse({ ok: true, email: a.email, name: a.name, picture: a.picture, tenant: a.tenant_id }); }
        catch (e) { sendResponse({ ok: false, error: e.message }); }
        return;
      }
      if (msg.type === "qr-signout") { await signOut(); sendResponse({ ok: true }); return; }

      if (msg.type === "qr-projects") {
        // Popup's Save-to picker: the tenant's projects, newest first. The
        // popup keeps its "New project" default silently on any failure.
        await refreshIfNeeded();
        const settings = await getSettings();
        const server = (settings.server || SERVER).replace(/\/+$/, "");
        if (!settings.tenant || !settings.token) { sendResponse({ ok: false, error: "signed out" }); return; }
        try {
          const res = await fetch(`${server}/api/projects/${encodeURIComponent(settings.tenant)}?token=${encodeURIComponent(settings.token)}`);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const list = await res.json();
          sendResponse({ ok: true, projects: Array.isArray(list) ? list : [] });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message || e) });
        }
        return;
      }

      if (msg.type === "qr-start") {
        await refreshIfNeeded(); // never start a take on a stale token
        const settings = await getSettings();
        if (!settings.server) { await chrome.storage.sync.set({ server: SERVER }); settings.server = SERVER; }
        if (!settings.tenant || !settings.token) {
          sendResponse({ ok: false, error: "Sign in first." });
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
        // Capture at EXACTLY the tab viewport's pixel size. Without size
        // constraints Chrome sizes the stream to the display and letterboxes
        // the tab into it -- black bars burned into every frame.
        let dims = null;
        try {
          const [r] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ w: Math.round(window.innerWidth * devicePixelRatio), h: Math.round(window.innerHeight * devicePixelRatio) }),
          });
          dims = r?.result || null;
        } catch (e) { /* capture still works, server cropdetect covers bars */ }
        await ensureOffscreen();
        session = { tabId: tab.id, phase: "armed", startedMs: 0, pausedMs: 0, pauseBegan: 0, events: freshEvents(tab, settings), settings };
        // Skeleton persisted so a suspended-and-restarted worker can still
        // finish the upload on Stop (see qr-ping handler).
        await chrome.storage.session?.set({ qrSession: { tabId: tab.id, phase: "armed", startedMs: 0, pausedMs: 0, settings } });
        badge("•", BADGE_COLORS.warn, "Armed — click the page to start recording.");

        // Instrument the tab. Injected (not declared) so only recorded tabs
        // ever run the capture script.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });

        // Prep media (getUserMedia + MediaRecorder objects) now; recording
        // starts on qr-roll after the in-page click-to-roll + countdown.
        await chrome.runtime.sendMessage({ type: "qr-offscreen-prep", streamId, mic: !!settings.mic, camera: !!settings.camera, dims });
        await chrome.tabs.sendMessage(tab.id, { type: "qr-arm" });

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

      if (msg.type === "qr-roll") {
        // Countdown finished in the page: recording truly begins NOW.
        if (!session || session.phase !== "armed") return;
        session.phase = "recording";
        session.startedMs = Date.now();
        session.events.recording.startedAt = new Date().toISOString();
        await chrome.storage.session?.set({ qrSession: { tabId: session.tabId, phase: "recording", startedMs: session.startedMs, pausedMs: 0, settings: session.settings } });
        chrome.runtime.sendMessage({ type: "qr-offscreen-begin" });
        badgeRecording();
        return;
      }

      if (msg.type === "qr-pause") {
        if (!session || session.phase !== "recording") return;
        session.phase = "paused";
        session.pauseBegan = Date.now();
        chrome.runtime.sendMessage({ type: "qr-offscreen-pause" });
        badge("⏸", BADGE_COLORS.warn, "Paused — resume from the on-page controls.");
        return;
      }

      if (msg.type === "qr-resume") {
        if (!session || session.phase !== "paused") return;
        session.pausedMs += Date.now() - session.pauseBegan;
        session.phase = "recording";
        chrome.runtime.sendMessage({ type: "qr-offscreen-resume" });
        badgeRecording();
        return;
      }

      if (msg.type === "qr-stop") {
        if (!session) { sendResponse({ ok: false, error: "Not recording." }); return; }
        const s = session;
        session = null;
        await chrome.storage.session?.remove("qrSession");
        badge("");
        try { await chrome.tabs.sendMessage(s.tabId, { type: "qr-content-stop" }); } catch (e) {}
        if (s.prompterWin) { try { await chrome.windows.remove(s.prompterWin); } catch (e) {} }
        if (s.phase === "armed" || !s.startedMs) {
          // Never rolled: nothing recorded, nothing to upload.
          chrome.runtime.sendMessage({ type: "qr-offscreen-abort" });
          sendResponse({ ok: true, aborted: true });
          return;
        }
        const pausedTail = s.phase === "paused" ? Date.now() - s.pauseBegan : 0;
        const durationMs = Date.now() - s.startedMs - s.pausedMs - pausedTail;
        s.events.recording.durationMs = durationMs;
        s.events.mutationsIdle = idleFromActivity(s.events._activity, durationMs);
        delete s.events._activity;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        // Offscreen owns the blobs; it uploads video (+camera) -> events -> generate.
        await chrome.runtime.sendMessage({
          type: "qr-offscreen-stop",
          upload: {
            server: s.settings.server.replace(/\/+$/, ""),
            tenant: s.settings.tenant,
            token: s.settings.token,
            project: s.settings.project || "library",
            name: `recording-${stamp}.webm`,
            cameraName: `camera-${stamp}.webm`,
            events: s.events,
            mic: !!s.settings.mic,
            camera: !!s.settings.camera,
            // Save-to picker: append the take to this project as a new scene
            // instead of assembling a fresh walkthrough project.
            destProjectId: s.settings.destProject || "",
          },
        });
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "qr-event") {
        // From the content script: stamp onto the RECORDED clock (armed and
        // paused moments produce no footage, so they get no events either).
        if (!session || sender.tab?.id !== session.tabId) return;
        if (session.phase !== "recording") return;
        const t = Date.now() - session.startedMs - session.pausedMs;
        const ev = session.events;
        if (msg.kind === "click") ev.clicks.push({ t, ...msg.data });
        else if (msg.kind === "input") ev.inputs.push({ t, ...msg.data });
        else if (msg.kind === "navigation") ev.navigations.push({ t, ...msg.data });
        else if (msg.kind === "chapter") { ev.chapters.push({ t, ...msg.data }); badgeChapterFlash(); }
        else if (msg.kind === "activity") ev._activity.push(t);
        return;
      }

      if (msg.type === "qr-offscreen-status") {
        // Progress + terminal states from the offscreen uploader -- mirror
        // every one onto the toolbar badge so the take's fate is readable
        // without opening anything.
        if (msg.state === "uploading") {
          const pct = msg.progress?.pct;
          badge(pct != null ? pct + "%" : "↑", BADGE_COLORS.up,
            pct != null ? "Uploading… " + pct + "%" : "Uploading…");
        } else if (msg.state === "done") {
          badge("⋯", BADGE_COLORS.gen, "Uploaded — assembling your walkthrough…");
        } else if (msg.state === "ready") {
          badge("✓", BADGE_COLORS.ok, "Walkthrough ready — open the popup to view it.");
        } else if (msg.state === "error") {
          badge("!", BADGE_COLORS.rec, "Upload failed — open the popup for details.");
        }
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
        chrome.storage.session?.set({ qrLastStatus: { state: msg.state, error: msg.error || null, projectUrl: msg.projectUrl || null, progress: msg.progress || null, note: msg.note || null, at: Date.now() } });
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

      if (msg.type === "qr-tick") {
        if (session?.phase === "recording" && !chapterFlash) badgeRecording();
        return;
      }

      if (msg.type === "qr-status") {
        sendResponse({ recording: !!session });
        // Opening the popup acknowledges a terminal ✓ / ! badge.
        if (!session) {
          const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
          if (qrLastStatus && (qrLastStatus.state === "ready" || qrLastStatus.state === "error")) badge("");
        }
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
