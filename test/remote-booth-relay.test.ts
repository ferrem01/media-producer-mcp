import { describe, it, expect, afterAll } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";
import { RemoteBoothHub, REMOTE_PREFIX, REMOTE_IDLE_MS, type RemotePeer, type RemoteTarget } from "../src/core/remote-booth.js";
import { setupWebSocket } from "../src/ws.js";

// The remote booth's relay (SPEC-remote-booth.md): a session is the
// tenant's and the device pair's, not a film's (Marc: "I have to remove the
// camera from the stand and then scan the QR for each"), so the control
// screen can RETARGET it, and nothing may ever cross into another tenant's
// session.

function peer(): RemotePeer & { got: Array<Record<string, any>>; last(type: string): Record<string, any> | undefined } {
  const got: Array<Record<string, any>> = [];
  return { got, send: (m) => { got.push(m); }, last: (t) => [...got].reverse().find((m) => m.type === REMOTE_PREFIX + t) };
}
const films: Record<string, Record<string, RemoteTarget>> = {
  acme: { proj_a: { project: "proj_a", scene: 0, name: "Launch", canvas: { width: 1920, height: 1080 } }, proj_b: { project: "proj_b", scene: 0, name: "Reel", canvas: { width: 1080, height: 1920 } } },
  other: { proj_x: { project: "proj_x", scene: 0, name: "Theirs", canvas: { width: 1920, height: 1080 } } },
};
const loadTarget = async (tenant: string, project: string, scene: number | "all") => {
  const t = films[tenant]?.[project];
  return t ? { ...t, scene } : null;
};

describe("remote sessions: mint, join, retarget", () => {
  it("the control screen mints a session for its token's tenant; the camera joins it; each hears of the other", () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const control = peer(), camera = peer();
    const c = hub.join(control, "control", undefined, "acme", "acme", true);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.created).toBe(true);
    expect(c.session.tenant).toBe("acme");
    expect(c.session.id).toMatch(/^rb_[A-Za-z0-9_-]{16,}$/);
    const j = hub.join(camera, "camera", c.session.id, "acme", "acme", true);
    expect(j.ok && j.session.id).toBe(c.session.id);
    expect(control.last("peer")).toMatchObject({ role: "camera", present: true });
    hub.leave(camera);
    expect(control.last("peer")).toMatchObject({ role: "camera", present: false });
  });

  it("a camera cannot create a session; a control screen re-registers its own id after a restart (no re-scan)", () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const cam = hub.join(peer(), "camera", "rb_AAAAAAAAAAAAAAAAAAAAAA", "acme", "acme", true);
    expect(cam.ok).toBe(false);
    if (!cam.ok) expect(cam.code).toBe("not-found");
    const ctl = hub.join(peer(), "control", "rb_AAAAAAAAAAAAAAAAAAAAAA", "acme", "acme", true);
    expect(ctl.ok && ctl.session.id).toBe("rb_AAAAAAAAAAAAAAAAAAAAAA");
    expect(hub.join(peer(), "camera", "rb_AAAAAAAAAAAAAAAAAAAAAA", "acme", "acme", true).ok).toBe(true);
    // A malformed id is never adopted: a fresh one is minted instead.
    const bad = hub.join(peer(), "control", "../../etc", "acme", "acme", true);
    expect(bad.ok && bad.session.id).toMatch(/^rb_/);
    expect(bad.ok && bad.session.id).not.toBe("../../etc");
  });

  it("RETARGET: pair once, record many films -- both devices get the new film and its frame", async () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const control = peer(), camera = peer();
    const c = hub.join(control, "control", undefined, "acme", "acme", true);
    if (!c.ok) throw new Error("join");
    hub.join(camera, "camera", c.session.id, "acme", "acme", true);
    const r1 = await hub.retarget(control, "proj_a", 2);
    expect(r1.ok).toBe(true);
    expect(camera.last("target")?.target).toMatchObject({ project: "proj_a", scene: 2, canvas: { width: 1920, height: 1080 } });
    const r2 = await hub.retarget(control, "proj_b", "all");
    expect(r2.ok).toBe(true);
    expect(camera.last("target")?.target).toMatchObject({ project: "proj_b", scene: "all", canvas: { width: 1080, height: 1920 } });
    expect(control.last("target")?.target.project).toBe("proj_b");
    expect(hub.get(c.session.id)?.target?.project).toBe("proj_b");
    // Only the control screen picks; a bad scene is refused.
    expect((await hub.retarget(camera, "proj_a", 0)).ok).toBe(false);
    expect((await hub.retarget(control, "proj_a", -1)).ok).toBe(false);
    expect((await hub.retarget(control, "proj_a", "x")).ok).toBe(false);
  });

  it("idle sessions expire after 4 hours and tell whoever is still in them", () => {
    let t = 1_000_000;
    const hub = new RemoteBoothHub({ loadTarget, now: () => t });
    const control = peer();
    const c = hub.join(control, "control", undefined, "acme", "acme", true);
    if (!c.ok) throw new Error("join");
    t += REMOTE_IDLE_MS - 1000;
    expect(hub.get(c.session.id)).toBeDefined();
    t += 2000;
    expect(hub.sweep()).toBe(1);
    expect(hub.get(c.session.id)).toBeUndefined();
    expect(control.last("expired")).toBeDefined();
  });
});

describe("tenant isolation", () => {
  it("a token of another tenant cannot join, and a page claiming another tenant cannot either", () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const c = hub.join(peer(), "control", undefined, "acme", "acme", true);
    if (!c.ok) throw new Error("join");
    const intruder = hub.join(peer(), "camera", c.session.id, "other", "other", true);
    expect(intruder.ok).toBe(false);
    if (!intruder.ok) expect(intruder.code).toBe("forbidden");
    // The right session id and a claim of acme, with other's token: still no.
    expect(hub.join(peer(), "camera", c.session.id, "acme", "other", true).ok).toBe(false);
    // No token at all while auth is on: no.
    expect(hub.join(peer(), "camera", c.session.id, "acme", undefined, true).ok).toBe(false);
    // Minting for a tenant the token does not hold: no.
    expect(hub.join(peer(), "control", undefined, "acme", undefined, true).ok).toBe(false);
    // An admin token ("*") may, as on every HTTP route.
    expect(hub.join(peer(), "camera", c.session.id, "acme", "*", true).ok).toBe(true);
  });

  it("a retarget resolves the film in the SESSION's tenant: another tenant's project is not found", async () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const control = peer();
    hub.join(control, "control", undefined, "acme", "acme", true);
    const r = await hub.retarget(control, "proj_x", 0);
    expect(r.ok).toBe(false);
    expect((await hub.retarget(control, "../other/projects/proj_x", 0)).ok).toBe(false);
  });
});

describe("message routing", () => {
  it("relays each family only from the role that may send it, only to the other device, stamped by the server", () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const control = peer(), camera = peer(), bystander = peer();
    const c = hub.join(control, "control", undefined, "acme", "acme", true);
    if (!c.ok) throw new Error("join");
    hub.join(camera, "camera", c.session.id, "acme", "acme", true);
    const other = hub.join(bystander, "control", undefined, "acme", "acme", true); // a second, separate session
    expect(other.ok && other.session.id).not.toBe(c.session.id);

    for (const t of ["hello", "preview", "recording", "stopped", "uploading", "uploaded", "attached", "attach-failed", "status"]) {
      expect(hub.relay(camera, { type: REMOTE_PREFIX + t, from: "control", session: "forged" })).toBeNull();
      expect(control.last(t)).toMatchObject({ from: "camera", session: c.session.id });
    }
    for (const t of ["settings", "start", "stop", "keep", "retake"]) {
      expect(hub.relay(control, { type: REMOTE_PREFIX + t })).toBeNull();
      expect(camera.last(t)).toMatchObject({ from: "control" });
    }
    // Wrong direction: refused, and nothing reaches the other side.
    const before = control.got.length;
    expect(hub.relay(camera, { type: REMOTE_PREFIX + "start" })).toMatch(/camera cannot send start/);
    expect(hub.relay(control, { type: REMOTE_PREFIX + "uploaded", url: "/x" })).toMatch(/control cannot send uploaded/);
    expect(hub.relay(camera, { type: REMOTE_PREFIX + "join" })).toMatch(/cannot send/);
    expect(control.got.length).toBe(before);
    // The other session heard none of it.
    expect(bystander.got.filter((m) => m.type !== REMOTE_PREFIX + "peer")).toEqual([]);
    // A socket in no session relays nothing.
    expect(hub.relay(peer(), { type: REMOTE_PREFIX + "hello" })).toBe("not in a session");
  });

  it("a second phone replaces the first as the camera (a reloaded phone is the same camera)", () => {
    const hub = new RemoteBoothHub({ loadTarget });
    const control = peer(), cam1 = peer(), cam2 = peer();
    const c = hub.join(control, "control", undefined, "acme", "acme", true);
    if (!c.ok) throw new Error("join");
    hub.join(cam1, "camera", c.session.id, "acme", "acme", true);
    hub.join(cam2, "camera", c.session.id, "acme", "acme", true);
    expect(cam1.last("replaced")).toBeDefined();
    hub.relay(control, { type: REMOTE_PREFIX + "start" });
    expect(cam2.last("start")).toBeDefined();
    expect(cam1.last("start")).toBeUndefined();
    expect(hub.relay(cam1, { type: REMOTE_PREFIX + "hello" })).toBe("not in a session");
  });
});

describe("over a real socket (src/ws.ts)", () => {
  const closers: Array<() => Promise<void>> = [];
  afterAll(async () => { for (const c of closers.reverse()) await c(); });

  it("authenticates the socket with the HTTP token: another tenant's socket is refused, the right one relays", async () => {
    const server = http.createServer((_q, r) => { r.writeHead(404); r.end(); });
    const hub = new RemoteBoothHub({ loadTarget });
    setupWebSocket(server, { hub, validate: (t) => ({ tokA: "acme", tokB: "other" } as Record<string, string>)[t] || null, authEnabled: () => true });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    closers.push(() => new Promise<void>((r) => server.close(() => r())));
    const port = (server.address() as any).port;
    const open = (token: string) => new Promise<{ ws: WebSocket; next: (type: string) => Promise<any> }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
      const inbox: any[] = []; const waiters: Array<[string, (m: any) => void]> = [];
      ws.on("message", (raw) => {
        const m = JSON.parse(String(raw));
        const i = waiters.findIndex(([t]) => m.type === REMOTE_PREFIX + t);
        if (i >= 0) { const [, fn] = waiters.splice(i, 1)[0]; fn(m); } else inbox.push(m);
      });
      ws.on("open", () => resolve({ ws, next: (t) => {
        const i = inbox.findIndex((m) => m.type === REMOTE_PREFIX + t);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res) => waiters.push([t, res]));
      } }));
      ws.on("error", reject);
      closers.push(async () => { try { ws.close(); } catch { /* closed */ } });
    });
    const control = await open("tokA");
    control.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "join", role: "control", tenant: "acme" }));
    const joined = await control.next("joined");
    expect(joined.tenant).toBe("acme");
    control.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "target", project: "proj_a", scene: 1 }));
    expect((await control.next("target")).target).toMatchObject({ project: "proj_a", scene: 1 });

    // Tenant B's token, A's session id: refused.
    const intruder = await open("tokB");
    intruder.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "join", role: "camera", session: joined.session, tenant: "acme" }));
    expect((await intruder.next("error")).code).toBe("forbidden");
    intruder.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "hello", width: 1 }));
    expect((await intruder.next("error")).error).toBe("not in a session");

    // No token: refused.
    const anon = await open("nope");
    anon.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "join", role: "camera", session: joined.session, tenant: "acme" }));
    expect((await anon.next("error")).code).toBe("forbidden");

    // The right token joins, gets the current target, and relays.
    const camera = await open("tokA");
    camera.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "join", role: "camera", session: joined.session, tenant: "acme" }));
    const cj = await camera.next("joined");
    expect(cj.target).toMatchObject({ project: "proj_a", scene: 1 });
    expect(cj.peers).toEqual({ control: true, camera: true });
    camera.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "hello", width: 3840, height: 2160, fps: 30 }));
    expect(await control.next("hello")).toMatchObject({ width: 3840, height: 2160, from: "camera" });
    control.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "start", t: 1 }));
    expect(await camera.next("start")).toMatchObject({ t: 1, from: "control" });
    // A message too large to be a preview is dropped.
    camera.ws.send(JSON.stringify({ type: REMOTE_PREFIX + "preview", jpeg: "x".repeat(600 * 1024) }));
    expect((await camera.next("error")).code).toBe("too-big");
    // The non-remote families still answer as before.
    camera.ws.send(JSON.stringify({ type: "nonsense" }));
  });
});
