# SPEC: the remote booth — record from across the room

Status: SHIPPED v1 (2026-09-27): phases 1 and 2, the film picker, the phone booth's Films sheet, and Studio's "Across the room". What was built, and where it differs from the text below, is in **As built (v1)** at the end. Still open: Marc's real wide take by the French doors.

APPROVED by Marc 2026-09-26 ("lets build the remote booth"), with two additions from him: pair ONCE per session (not per film), and move between films from the phone without re-scanning.

## Why

The booth assumes arm's length. The phone's front camera films you, and the
prompter sits on that same screen, next to the lens. That fits the vertical
Instagram take, and today it produces a professional result: a light check
before the take, the automatic correction on arrival, and word-timed
graphics.

A wide 16:9 film (LinkedIn, a launch film, "Hi, I'm Marc Ferrentino…"
standing or seated 6–10 ft back) breaks all three assumptions:

- **You can't read a phone from 8 ft away**, and with the rear camera the
  screen faces away from you.
- **The front camera is the wrong camera for it.** In a wide shot the face is
  a small part of the frame, so resolution matters: for sharpness, and for
  punch-ins to a close-up. The rear camera is much better.
- **Nobody can reach Record** once you're standing in position.

## The idea in one line

The **phone is only the camera**. A **big screen** (laptop, iPad or TV
browser) is the **prompter and the remote control**. The two pair with a QR
code and stay in sync over the server connection Studio already has. The
take lands in Studio exactly like a booth take.

## The flow Marc sees

1. **On the laptop:** in Studio, a scene that needs a take gets a new button,
   **Record from across the room**. It opens the remote booth on the laptop,
   with a QR code.
2. **On the phone:** scan the QR code. The phone opens the camera page (rear
   camera by default, with a front toggle). Put the phone on the tripod.
3. **On the laptop** (now the control screen):
   - A live preview from the phone (a few frames a second) so you can frame
     yourself from where you stand.
   - The light check on that preview. Its oval is sized for the shot: close,
     medium (waist up) or wide (standing).
   - Your script as a large prompter. Pacing comes from your voice, with an
     advance on click or space. A remote clicker works too, since those send
     arrow keys.
   - A mirror toggle, for when a glass teleprompter is added later.
4. **Record:** press Start on the laptop, or on a clicker. The phone starts
   recording, and both show the same 3-2-1. The prompter scrolls. Stop from
   the laptop.
5. **Review on the laptop:** the phone uploads the full-quality file, and the
   laptop plays it back. Keep or retake.
6. **Keep:** the take attaches through the normal path. It gets the
   correction, the scene split, word-timed stickers and captions, and the
   Room/Blur choice. Nothing downstream changes.

## Moving between films without touching the rig (Marc's addition)

Marc: "Sometimes I have the rig set up and I want to move from one recording
to another between films. I have to remove the camera from the stand and then
scan the QR for each."

- **Pair once.** A remote session belongs to the TENANT and the device pair,
  not to one film or scene. The phone stays paired as the camera until the
  session ends. The laptop's control screen has a **film and scene picker**
  (films that still need a take are listed first). Picking the next film
  retargets the session, and the phone never moves.
- **Switch from the phone too.** The regular booth (arm's-length, front
  camera) gets a **Films** button on its ready screen and its review screen.
  It opens a list of the tenant's person-carried films (speaker and
  creator-cut) with their scenes and what each still needs. Tapping a scene
  opens that recording with no QR code and no Studio round trip. The booth's
  tenant token already scopes this list.

## How it works

### Pairing
- A **remote session** is a short-lived id tied to project, scene and token,
  created when the laptop opens the remote booth.
- The QR code encodes the phone page URL plus the session id. This reuses
  `/api/take-qr`, which already draws QR codes that carry the token.
- Both pages join the same **room on the existing WebSocket server**
  (`src/ws.ts`), as two new message families under a `remote-booth:` prefix.
  No new infrastructure.

### Messages (relayed by the server, per session)

| From → to | Message | Meaning |
|---|---|---|
| phone → laptop | `hello {camera, width, height, fps, locks[]}` | what the phone's camera can really do |
| phone → laptop | `preview {jpeg}` | a ~320 px frame, 3–4 per second, for framing and the light check |
| laptop → phone | `settings {facing, lock}` | rear/front, lock exposure/white balance where supported |
| laptop → phone | `start {t}` | begin recording now, and start the count-in |
| phone → laptop | `recording {t0}` | recording started (the laptop starts the prompter from this) |
| laptop → phone | `stop` | stop recording |
| phone → laptop | `uploading {pct}` / `uploaded {url}` | progress, then the file is on the server |
| laptop → phone | `keep` / `retake` | attach the take, or throw it away and reset |

- **Sync precision doesn't matter much.** Once the take lands, Studio already
  re-times each scene to the words actually spoken (the measured spine). A
  100–300 ms relay delay between Start and the first prompter line is
  invisible in the film.

### The phone (camera page)
- **Camera:** `getUserMedia`, rear camera, asking for the best size the
  browser allows (ideal 3840×2160, then 1920×1080) at 30 fps. It records
  what it actually gets and reports that to the laptop. It records at the
  film's frame (16:9 for a wide film); the phone lies on its side.
- **Recording:** `MediaRecorder` locally, 20–25 Mbps at 4K or 12 at 1080p.
  Recording never depends on the network. If the connection drops, the take
  finishes and uploads when it's back.
- **Stays awake:** Wake Lock API, which the booth already uses. The page also
  warns on low battery.
- **Locks:** exposure and white balance lock where the browser offers it
  (Android Chrome). iOS Safari doesn't, so the correction on arrival covers
  it, as it does today.
- **Honest limit:** iPhone Safari may cap the camera at 1080p. If so, the
  camera page says so, and the fallback below gives true 4K.

### The laptop (control screen)
- **Prompter:** the booth's script and karaoke pacing, as full-screen large
  type. Size is adjustable, readable at 8–10 ft.
- **Controls:** keyboard, mouse and presentation clickers.
- **Light check:** runs on the preview frames with the booth's own
  measurement code, `src/core/light-check.ts`. The oval's size follows the
  chosen shot size.
- **Review:** plays the uploaded take.

### Fallback: any camera, same prompter
The same control screen runs with **no phone paired**: prompter and timer
only. You record on anything (the iPhone Camera app in 4K, Blackmagic, a real
camera) and upload the file to the scene. It still gets the correction and
the scene split. This covers the true-4K case, whatever the browser allows.

## What else changes for wide films

- **Film side:** speaker films already support 16:9, with components confined
  to one side (`content_region`). The classic LinkedIn and launch layout,
  person on one side and graphics on the other, works today.
- **Punch-ins:** at 4K a punch-in to a close-up stays sharp. At 1080p, keep
  punch-ins at 1.2x or less.
- **Light check:** the oval's size and the "wall too bright" logic adapt to
  shot size. In a wide shot the background is a larger share of the frame,
  on purpose.
- **Sound:** a lav mic is required at distance. That's a note in the booth,
  not code.

## Out of scope for v1

- Streaming full-quality video live to the laptop. The preview is
  low-frame-rate stills, and the full file uploads after the take.
- Multi-camera. One phone per take.
- Controlling the phone's zoom from the laptop (pick 1x or 2x on the phone
  before pairing).

## Build plan

- **Phase 1** (~1 day): pairing, the camera page (rear camera, best
  resolution, local recording, upload), control screen with prompter,
  start/stop and review. Attach through the existing path.
- **Phase 2** (~½ day): the live preview, the light check with shot size, and
  mirror mode. The same control screen with no phone is the fallback.
- **Tests:** unit tests on the session and message relay; a two-page browser
  test (fake camera on the phone page) that checks start/stop sync, upload
  and attach; and a resolution report on the phone page.
- **Proving it:** Marc does one real wide take by the French doors, and I
  review it the way I reviewed today's takes.

## Questions for Marc (defaults used until answered)

1. **The big screen:** laptop, iPad, or a TV? Default: laptop, with type size adjustable.
2. **Standing or seated** for the first wide film? Default: both, via a shot-size selector (close, medium, wide).
3. **A clicker:** do you have a presentation remote? Default: the space bar and arrow keys (clickers send those).

## As built (v1)

### Pages and routes
- `/remote-booth?tenant&project&scene&token`: the control screen
  (`src/remote-booth-page.ts`, `getRemoteBoothHtml`). Studio opens it in a
  new tab from the **Across the room** source on a camera take
  (`src/preview-app/preview-app.ts`, desktop only; the phone Studio is
  unchanged).
- `/remote-camera?tenant&session&token`: the camera page
  (`getRemoteCameraHtml`), opened by the control screen's QR code.
- `GET /api/take-qr/{tenant}/{project}?session=rb_…` draws the camera link.
  It is the existing QR route with one new parameter, and it refuses a
  malformed session id.
- `GET /api/booth-films/{tenant}` returns the tenant's speaker and
  creator-cut films. Each film carries its canvas, frame and scenes (label,
  lines, `need: needed | provided | none`). Films still owed a take come
  first, then the most recently updated (`src/core/booth-films.ts`). The
  route is registered at the tenant choke point.
- Both pages sit behind the auth middleware with the token in the link,
  like `/take`.

### The relay (`src/core/remote-booth.ts`, glued in `src/ws.ts`)
- The socket is `/ws?token=…`. The token is read once, at the upgrade,
  with the HTTP rule (`validateToken`, or the session cookie).
- **Session**: `rb_` plus 128 random bits. The control screen's first
  `join` (without an id) mints it, stamped with the token's tenant. The id
  lives in `localStorage` per tenant, so a reload rejoins it, and so does a
  second **Across the room** tab (that tab takes over as the control
  screen and the earlier one steps aside). A session idle for 4 h is
  dropped, and both pages are told. Sessions live in memory. After a server
  restart the control screen re-registers its own id when it reconnects,
  and the phone keeps asking until it can rejoin, so nothing is re-scanned.
  A camera cannot create a session.
- **Tenant rule**: a peer joins only if `tenantAllowed(token's tenant,
  session tenant)` holds (the HTTP decision core, so `*` admin passes) AND
  the page's own `?tenant=` equals the session's. A retarget resolves the
  project in the session's tenant (`loadRemoteTarget`), never in a tenant
  the message names.
- **Messages** (`remote-booth:` prefix). The server relays only from the
  role that may send a message, and only to the other device in the same
  session. It stamps `from` and `session` on everything it relays.

| From → to | Message | As built |
|---|---|---|
| control → server | `join {role, session?, tenant}` | the reply is `joined {session, tenant, target, peers}` or `error {code}` |
| control → server | `target {project, scene}` | resolved in the session's tenant, then `target {project, scene, name, canvas, frame, grammar, lines}` to both devices |
| server → both | `peer {role, present}`, `replaced`, `expired`, `error`, `pong` | membership, and the answer to `ping` (every 20 s, so proxies keep a quiet socket open during an upload) |
| phone → laptop | `hello {camera, width, height, fps, locks[], label, max, battery, state, pending}` | re-sent whenever the laptop (re)appears, so a rejoin mid-take reconciles |
| phone → laptop | `preview {jpeg, w, h}` | a 320 px long side at the film's aspect, cropped exactly like the recording, about 3.5 a second; skipped while the socket is backed up. A message over 512 KB is dropped |
| laptop → phone | `settings {facing, lock}` | `lock` only acts where `getCapabilities` lists the modes |
| laptop → phone | `start {t}` / `stop` | both devices count 3-2-1 from `start`; the phone records after its count |
| phone → laptop | `recording {t0, width, height, mode, bitrate, mime}` | the laptop starts the prompter and the timer from this |
| phone → laptop | `stopped {duration, size}` / `uploading {pct}` / `uploaded {url, …}` | added `stopped` so the laptop knows the file is safe on the phone |
| laptop → phone | `keep {look, soft_strength, background}` / `retake` | |
| phone → laptop | `attached {project, scene_index, open_needs}` / `attach-failed {error}` / `status {text, error}` | added, so the laptop reports the attach and upload retries |

### Deviations from the text above
- **Recording**: the phone records the RAW camera track when its aspect
  already matches the film (full resolution, no canvas). Otherwise it draws
  the centre crop into a canvas at the track's own resolution, with the
  long side capped at 3840. The bitrate is 24 Mbps when the short side is
  2160 or more, 12 below that.
- **Keep**: the phone attaches, as specified, through `POST /api/take` with
  `capture: 'remote'` and the take's `scene_index`. If the phone has left
  by then, the laptop attaches the uploaded file itself through the same
  route. A file uploaded on the laptop (the fallback) attaches with
  `capture: 'upload'`.
- **Keys**: before the take, Space, PageDown, → and ↓ all start it. During
  the take the same keys advance a line; PageUp, ← and ↑ go back one; Esc,
  `b` and `.` (a clicker's blank key) stop. One "next" past the last line
  also stops, so a clicker alone runs the whole take. A click on the
  prompter advances.
- **Light check with shot size**: `guideOval(w, h, shot)` and
  `lightStats(px, w, h, shot)`. `close` is the booth's oval unchanged.
  `medium` scales the face 0.62 with the eyes at 0.30 h, and `wide` scales
  it 0.36 with the eyes at 0.25 h. The wall rule has no threshold of its
  own. The background band is the top of the frame outside the head's
  column, so a smaller head leaves more of the frame counted as
  background. That is the "larger share of the frame, on purpose".
- **Prompter**: the booth's timing and karaoke code moved into
  `src/core/prompter.ts`. Both pages inline it verbatim, as they already do
  with `LIGHT_CHECK_JS`. Type size (A−/A+) and mirror are remembered on
  the control screen.
- **After Keep**: the control screen offers **Next: Scene N**, the next
  scene of the same film that is still owed a take.
- **Phone booth Films sheet**: it also appears on the done screen, and it
  is hidden inside Studio's dialog (`embed=1`), which is one scene's.
- **Resolution report**: the camera's `hello` is the report. Under test,
  Chromium's fake camera delivered **3840×2160 at 20 fps** to the ideal
  3840×2160 / 30 fps request and recorded at 24 Mbps. A real phone may
  deliver less (see below).

### What real phones may deliver (honest)
- **Android Chrome** usually honours 3840×2160 on the rear camera, often at
  30 fps. Recent Chrome versions also list `exposureMode` and
  `whiteBalanceMode`, so Lock works there.
- **iPhone Safari** has capped getUserMedia at 1920×1080 on many iOS
  versions, and newer ones may allow more; the page records what it gets
  and says so. It offers no exposure or white-balance lock, and no battery
  API. The correction on arrival covers the lock. For true 4K, use the
  fallback: record in the Camera app, then **Upload a file** on the control
  screen.
- A phone held upright for a wide film delivers a portrait track, which
  the crop would shrink badly. Both screens say "Turn the phone on its
  side".
