/**
 * THE REMOTE BOOTH'S RELAY (SPEC-remote-booth.md) -- the phone is only the
 * camera, a big screen is the prompter and the remote control, and the two
 * talk through a room on the WebSocket server Studio already runs.
 *
 * A REMOTE SESSION belongs to the TENANT and the device pair, not to a film.
 * Marc: "Sometimes I have the rig set up and I want to move from one
 * recording to another between films. I have to remove the camera from the
 * stand and then scan the QR for each." So the session carries a TARGET
 * ({project, scene}) that the control screen can change at any time: pair
 * once, record many films, the phone never moves.
 *
 * This module is the pure half: sessions, membership, the tenant rule and
 * the routing table. src/ws.ts is the socket glue (it authenticates the
 * socket with the same tenant token as HTTP and hands each connection here
 * as a Peer). Nothing in here touches the network, so the rules are tested
 * directly (test/remote-booth-relay.test.ts).
 *
 * TENANT ISOLATION, the one rule: a session is stamped with a tenant when
 * it is minted, and a peer may join it only when its token may act on that
 * tenant (tenantAllowed -- the same decision core every HTTP route uses).
 * A target is resolved against the SESSION's tenant, never a tenant the
 * message names, so a retarget cannot reach another tenant's film.
 */

import { randomBytes } from "node:crypto";
import { tenantAllowed } from "../auth/auth.js";

export type RemoteRole = "control" | "camera";

/** What the phone records for, and what the laptop prompts. */
export interface RemoteTarget {
  project: string;
  /** 0-based scene, or "all" (one recording through every scene, cut by the server). */
  scene: number | "all";
  name?: string;
  /** The film's canvas: the camera records at this aspect (16x9 = the phone on its side). */
  canvas?: { width: number; height: number };
  frame?: string;
  grammar?: string;
  /** The scene's spoken lines (the phone shows what is being recorded). */
  lines?: string;
}

export interface RemotePeer {
  send(msg: Record<string, unknown>): void;
}

interface Member {
  peer: RemotePeer;
  role: RemoteRole;
  sessionId: string;
}

export interface RemoteSession {
  id: string;
  tenant: string;
  target: RemoteTarget | null;
  created: number;
  lastActive: number;
  peers: Partial<Record<RemoteRole, RemotePeer>>;
}

/** Every remote-booth message type starts with this (ws.ts routes on it). */
export const REMOTE_PREFIX = "remote-booth:";

/** A session nobody has used for this long is gone (a morning's shoot fits). */
export const REMOTE_IDLE_MS = 4 * 60 * 60 * 1000;

/** A preview frame is a ~320 px JPEG (~20 KB as base64); anything near this
 *  is not a preview and is dropped rather than relayed. */
export const REMOTE_MAX_MESSAGE_BYTES = 512 * 1024;

/**
 * THE ROUTING TABLE (the spec's message table, plus the few the build
 * needed). A message is relayed only from the role that may send it, and
 * only to the other role in the same session. Anything else is refused.
 */
export const REMOTE_FROM_CAMERA = new Set([
  "hello",      // {camera, width, height, fps, locks[], state} -- what the camera really does
  "preview",    // {jpeg, w, h} -- a ~320 px frame, 3-4 a second
  "recording",  // {t0} -- the recorder started; the laptop starts the prompter
  "stopped",    // {duration, size} -- the recorder stopped, the file is on the phone
  "uploading",  // {pct}
  "uploaded",   // {url, duration, width, height, mime, size}
  "attached",   // {scene_index, note} -- keep went through the attach route
  "attach-failed", // {error}
  "status",     // {text} -- free text for the laptop's status line
]);
export const REMOTE_FROM_CONTROL = new Set([
  "settings",   // {facing, lock}
  "start",      // {t} -- begin the count-in, then record
  "stop",
  "keep",       // {look, soft_strength, background} -- attach the take
  "retake",     // throw it away and reset
]);

export type TargetLoader = (tenant: string, project: string, scene: number | "all") => Promise<RemoteTarget | null>;

export interface RemoteHubOptions {
  now?: () => number;
  idleMs?: number;
  mintId?: () => string;
  /** Resolves {project, scene} in a tenant into a full target (canvas,
   *  name, lines); null when the project is not that tenant's. */
  loadTarget?: TargetLoader;
}

export type JoinResult = { ok: true; session: RemoteSession; created: boolean } | { ok: false; error: string; code: "forbidden" | "not-found" | "bad-request" };

/** A session id: 128 bits, URL-safe. It rides in the QR next to the token. */
export function mintRemoteId(): string {
  return "rb_" + randomBytes(16).toString("base64url");
}

export class RemoteBoothHub {
  private sessions = new Map<string, RemoteSession>();
  private members = new Map<RemotePeer, Member>();
  private now: () => number;
  private idleMs: number;
  private mintId: () => string;
  private loadTarget?: TargetLoader;

  constructor(opts: RemoteHubOptions = {}) {
    this.now = opts.now || Date.now;
    this.idleMs = opts.idleMs ?? REMOTE_IDLE_MS;
    this.mintId = opts.mintId || mintRemoteId;
    this.loadTarget = opts.loadTarget;
  }

  get(id: string): RemoteSession | undefined {
    const s = this.sessions.get(id);
    if (s && this.now() - s.lastActive > this.idleMs) { this.expire(s); return undefined; }
    return s;
  }

  size(): number { return this.sessions.size; }

  /** A new session for a tenant (the control screen opens the remote booth). */
  mint(tenant: string, id?: string): RemoteSession {
    const t = this.now();
    const s: RemoteSession = { id: id || this.mintId(), tenant, target: null, created: t, lastActive: t, peers: {} };
    this.sessions.set(s.id, s);
    return s;
  }

  /**
   * A socket joins a session as the control screen or the camera.
   * - `authed`: the tenant the socket's token resolved to (undefined = no
   *   valid token); `authEnabled` as the HTTP guard reads it.
   * - `claimedTenant`: the tenant the page says it is (its ?tenant=). It
   *   mints a session, and it is checked against the token like a URL.
   * - control with no id mints; control with an id the server no longer
   *   knows (a restart) re-registers it for its own tenant, so a reload of
   *   either page never costs a re-scan. A camera cannot create a session.
   */
  join(peer: RemotePeer, role: RemoteRole, sessionId: string | undefined, claimedTenant: string, authed: string | undefined, authEnabled: boolean): JoinResult {
    if (role !== "control" && role !== "camera") return { ok: false, code: "bad-request", error: "role must be control or camera" };
    this.sweep();
    let session = sessionId ? this.get(sessionId) : undefined;
    let created = false;
    if (!session) {
      if (role !== "control") return { ok: false, code: "not-found", error: "That pairing has ended. Scan the code on the laptop again." };
      // The tenant the session is stamped with: the token's own, or (admin
      // and dev mode) the page's claim. The claim is vetted like a URL.
      const tenant = authed && authed !== "*" ? authed : claimedTenant;
      if (!tenant) return { ok: false, code: "bad-request", error: "no tenant" };
      if (!tenantAllowed(authed, tenant, authEnabled)) return { ok: false, code: "forbidden", error: "this token cannot open a booth for that tenant" };
      if (sessionId && !/^rb_[A-Za-z0-9_-]{16,64}$/.test(sessionId)) sessionId = undefined;
      session = this.mint(tenant, sessionId);
      created = true;
    }
    if (!tenantAllowed(authed, session.tenant, authEnabled)) return { ok: false, code: "forbidden", error: "this token belongs to another workspace" };
    // The page's own tenant must be the session's too: a link for one
    // workspace never lands in another's room, whatever the token allows.
    if (claimedTenant && claimedTenant !== session.tenant) {
      return { ok: false, code: "forbidden", error: "this token belongs to another workspace" };
    }
    // A socket belongs to one session at a time; a second device in the same
    // role replaces the first (a reloaded phone is the same camera).
    this.leave(peer);
    const prev = session.peers[role];
    if (prev && prev !== peer) {
      this.members.delete(prev);
      try { prev.send({ type: REMOTE_PREFIX + "replaced", role }); } catch { /* gone */ }
    }
    session.peers[role] = peer;
    this.members.set(peer, { peer, role, sessionId: session.id });
    session.lastActive = this.now();
    const other = role === "control" ? "camera" : "control";
    const otherPeer = session.peers[other];
    if (otherPeer) otherPeer.send({ type: REMOTE_PREFIX + "peer", role, present: true });
    return { ok: true, session, created };
  }

  /** The socket closed (or joined elsewhere): out of its session. */
  leave(peer: RemotePeer): void {
    const m = this.members.get(peer);
    if (!m) return;
    this.members.delete(peer);
    const s = this.sessions.get(m.sessionId);
    if (!s || s.peers[m.role] !== peer) return;
    delete s.peers[m.role];
    const other = s.peers[m.role === "control" ? "camera" : "control"];
    if (other) other.send({ type: REMOTE_PREFIX + "peer", role: m.role, present: false });
  }

  membership(peer: RemotePeer): { session: RemoteSession; role: RemoteRole } | null {
    const m = this.members.get(peer);
    if (!m) return null;
    const s = this.get(m.sessionId);
    return s ? { session: s, role: m.role } : null;
  }

  /**
   * RETARGET: the control screen picks the next film and scene. The target
   * is resolved in the SESSION's tenant (the loader reads that tenant's
   * project), stored on the session, and sent to both devices.
   */
  async retarget(peer: RemotePeer, project: string, scene: unknown): Promise<{ ok: true; target: RemoteTarget } | { ok: false; error: string }> {
    const m = this.membership(peer);
    if (!m) return { ok: false, error: "not in a session" };
    if (m.role !== "control") return { ok: false, error: "only the control screen picks the film" };
    if (!project || typeof project !== "string" || /[\/\\]|\.\./.test(project)) return { ok: false, error: "project is required" };
    const sc: number | "all" | null = scene === "all" ? "all" : (Number.isInteger(Number(scene)) && Number(scene) >= 0 && scene !== null && scene !== "" ? Number(scene) : null);
    if (sc === null) return { ok: false, error: "scene must be a 0-based index or \"all\"" };
    let target: RemoteTarget | null = { project, scene: sc };
    if (this.loadTarget) target = await this.loadTarget(m.session.tenant, project, sc);
    if (!target) return { ok: false, error: "That film is not in this workspace." };
    // The session may have been left while the project loaded.
    const again = this.membership(peer);
    if (!again || again.session.id !== m.session.id) return { ok: false, error: "not in a session" };
    m.session.target = target;
    m.session.lastActive = this.now();
    const out = { type: REMOTE_PREFIX + "target", target };
    for (const r of ["control", "camera"] as const) m.session.peers[r]?.send(out);
    return { ok: true, target };
  }

  /**
   * Relay one message to the other device in the sender's session. Returns
   * why it was refused, or null when it went (or had nobody to go to --
   * the sender is told the other side is missing via the peer flag).
   */
  relay(peer: RemotePeer, msg: Record<string, unknown>): string | null {
    const m = this.membership(peer);
    if (!m) return "not in a session";
    const type = String(msg.type || "");
    if (!type.startsWith(REMOTE_PREFIX)) return "not a remote-booth message";
    const name = type.slice(REMOTE_PREFIX.length);
    const allowed = m.role === "camera" ? REMOTE_FROM_CAMERA : REMOTE_FROM_CONTROL;
    if (!allowed.has(name)) return `${m.role} cannot send ${name}`;
    m.session.lastActive = this.now();
    const to = m.session.peers[m.role === "camera" ? "control" : "camera"];
    if (!to) return null;
    // The server's stamp wins over anything the sender wrote.
    to.send({ ...msg, type, from: m.role, session: m.session.id });
    return null;
  }

  /** Drop sessions idle past the limit, telling anyone still in them. */
  sweep(): number {
    let n = 0;
    const t = this.now();
    for (const s of [...this.sessions.values()]) {
      if (t - s.lastActive > this.idleMs) { this.expire(s); n++; }
    }
    return n;
  }

  private expire(s: RemoteSession): void {
    this.sessions.delete(s.id);
    for (const r of ["control", "camera"] as const) {
      const p = s.peers[r];
      if (!p) continue;
      this.members.delete(p);
      try { p.send({ type: REMOTE_PREFIX + "expired" }); } catch { /* gone */ }
    }
  }
}
