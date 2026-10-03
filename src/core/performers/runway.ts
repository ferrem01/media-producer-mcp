/**
 * RUNWAY, two ways:
 *   recast   -- Act-Two: the recording's performance (face and body) on the
 *               actor's portrait. Keeps the gestures; the look is glossier,
 *               and a call takes a short clip, so a take is cut at its pauses.
 *   generate -- Avatars (gwm1_avatars): a custom avatar made once from the
 *               actor's portrait (kept beside it in the cast), then driven by
 *               a voice (a script voiced by ElevenLabs or HeyGen).
 */
import { reportVendor } from "../vendor-status.js";
import fs from "node:fs/promises";
import path from "node:path";
import { runRunway, download, dataUri, ffmpeg, okJson } from "../actor-test.js";
import { portraitPath } from "../cast.js";
import type { Performer, PerformContext } from "./types.js";

const API = "https://api.dev.runwayml.com/v1";
const POLL_MS = Number(process.env.MP_ACTOR_POLL_MS) || 5000;
const DEADLINE_MS = 25 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function headers(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json" };
}

async function portraitJpg(ctx: PerformContext): Promise<string> {
  const img = path.join(ctx.workDir, "portrait.jpg");
  if (!(await fs.stat(img).then(() => true, () => false))) {
    await ffmpeg(["-i", ctx.portraitAbs, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", img]);
  }
  return img;
}

/** The actor's Runway avatar: made once from the portrait and remembered
 *  beside it (cast/<id>.runway.json), so every film reuses it. */
async function avatarFor(ctx: PerformContext): Promise<string> {
  const memo = portraitPath(ctx.tenant, ctx.actor).replace(/\.[^./]+$/, ".runway.json");
  const known = await fs.readFile(memo, "utf8").then((t) => JSON.parse(t)?.avatar_id as string, () => undefined);
  if (known) {
    const a = await fetch(`${API}/avatars/${encodeURIComponent(known)}`, { headers: headers() }).then((r) => (r.ok ? r.json() : null), () => null);
    if (a && a.status !== "FAILED") return a.status === "READY" ? known : await ready(known);
  }
  const made = await okJson(await fetch(`${API}/avatars`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      name: ctx.actor.name.slice(0, 50),
      referenceImage: await dataUri(await portraitJpg(ctx), "image/jpeg"),
      personality: "A presenter speaking to camera.",
      // Required, but unused: the avatar speaks with the voice it is given.
      voice: { type: "runway-live-preset", presetId: "vincent" },
    }),
  }), "runway avatar");
  if (!made?.id) throw new Error("runway avatar: no id in the reply");
  await fs.mkdir(path.dirname(memo), { recursive: true });
  await fs.writeFile(memo, JSON.stringify({ avatar_id: made.id }));
  return made.status === "READY" ? made.id : await ready(made.id);
}

async function ready(id: string): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("runway avatar: timed out");
    await sleep(POLL_MS);
    const a = await okJson(await fetch(`${API}/avatars/${encodeURIComponent(id)}`, { headers: headers() }), "runway avatar status");
    reportVendor({ vendor: "runway", job: id, status: `avatar ${a.status}`, message: a.failure });
    if (a.status === "READY") return id;
    if (a.status === "FAILED") throw new Error(`runway avatar: ${a.failure || a.failureCode || "failed"}`);
  }
}

export const runway: Performer = {
  id: "runway",
  label: "Runway",
  drivenBy: "video",
  keeps: "Recast: your gestures and expressions. From a script: Runway animates the portrait from the voice",
  limits: "Short clips (seams on longer takes); a glossier look",
  key: "RUNWAYML_API_SECRET",
  minutesPer30s: 4,
  maxSeconds: 15,

  async fromVideo(video: string, tag: string, ctx: PerformContext): Promise<string> {
    const out = path.join(ctx.workDir, `runway-${tag}.mp4`);
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const img = await portraitJpg(ctx);
    const { width: W, height: H } = ctx;
    const ratio = H > W * 1.1 ? "720:1280" : W > H * 1.1 ? "1280:720" : "960:960";
    await download(await runRunway(await dataUri(video, "video/mp4"), await dataUri(img, "image/jpeg"), ratio), out);
    return out;
  },

  async fromAudio(audio: string, ctx: PerformContext): Promise<string> {
    const w = (n: string) => path.join(ctx.workDir, n);
    const out = w("runway-avatar.mp4");
    if (await fs.stat(out).then((x) => x.size > 0, () => false)) return out;
    const avatarId = await avatarFor(ctx);
    const task = await okJson(await fetch(`${API}/avatar_videos`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ model: "gwm1_avatars", avatar: { type: "custom", avatarId }, speech: { type: "audio", audio: await dataUri(audio, "audio/mpeg") } }),
    }), "runway avatar video");
    if (!task?.id) throw new Error("runway avatar video: no task id");
    const t0 = Date.now();
    for (;;) {
      if (Date.now() - t0 > DEADLINE_MS) throw new Error("runway avatar video: timed out");
      await sleep(POLL_MS);
      const t = await okJson(await fetch(`${API}/tasks/${task.id}`, { headers: headers() }), "runway task");
      reportVendor({ vendor: "runway", job: task.id, status: t.status, progress: typeof t.progress === "number" ? t.progress : undefined, message: t.failure });
      if (t.status === "SUCCEEDED") {
        const url = Array.isArray(t.output) ? t.output[0] : null;
        if (!url) throw new Error("runway avatar video: no output url");
        await download(url, out);
        return out;
      }
      if (t.status === "FAILED" || t.status === "CANCELLED") throw new Error(`runway avatar video: ${t.failure || t.failureCode || t.status}`);
    }
  },
};
