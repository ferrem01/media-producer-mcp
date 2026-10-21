import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { ensurePreviewSpeaker, joinableClips } from "../src/core/preview-speaker.js";
import { getPhoneStudioHtml } from "../src/studio-phone.js";

// The phone Preview plays a film's per-scene takes as ONE joined file: a
// phone does not load the next take ahead of a cut, so the swap at every cut
// waited and the sound stopped between scenes (Marc, Oct 21).

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
let root: string;
let prevDataDir: string;

async function tone(file: string, seconds: number, hz: number) {
  await run("ffmpeg", ["-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=gray:s=160x284:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
}
async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

function film(assets: string) {
  return {
    tenant_id: "t", project_id: "p",
    canvas: { width: 1080, height: 1920, fps: 30 },
    // A graphic opener with no take, two scenes with takes, an end card with none.
    scenes: [
      { id: "s1", duration_seconds: 2 },
      { id: "s2", duration_seconds: 2 },
      { id: "s3", duration_seconds: 1.5 },
      { id: "s4", duration_seconds: 1 },
    ],
    speaker_track: { clips: [
      { source: path.join(assets, "b.mp4"), scene_index: 2, start: 0 },
      { source: path.join(assets, "a.mp4"), scene_index: 1, start: 0, trim_start: 0.2, trim_end: 2.2 },
    ] },
  } as any;
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "pv-spk-"));
  prevDataDir = config.dataDir;
  (config as any).dataDir = root;
  const assets = path.join(root, "t", "projects", "p", "assets");
  await fs.mkdir(assets, { recursive: true });
  await tone(path.join(assets, "a.mp4"), 3, 440);
  await tone(path.join(assets, "b.mp4"), 2, 660);
}, 60000);

afterAll(async () => {
  (config as any).dataDir = prevDataDir;
  await fs.rm(root, { recursive: true, force: true });
});

describe("the phone Preview's joined take", () => {
  it("joins only a per-scene track of two or more takes, in scene order", () => {
    const p = film("/x");
    expect(joinableClips(p)!.map((c) => c.scene_index)).toEqual([1, 2]);
    expect(joinableClips({ ...p, speaker_track: { clips: [p.speaker_track.clips[0]] } })).toBeNull();
    expect(joinableClips({ ...p, speaker_track: { clips: [{ source: "/x/one.mp4" }] } })).toBeNull();
  });

  it("is one file on the film's clock, the length of the film, made once and reused", async () => {
    const p = film(path.join(root, "t", "projects", "p", "assets"));
    const name = await ensurePreviewSpeaker(p, root);
    expect(name).toMatch(/^preview-speaker-[0-9a-f]{16}\.mp4$/);
    const out = path.join(root, "t", "projects", "p", "output", name!);
    expect(Math.abs((await probeDuration(out)) - 6.5)).toBeLessThan(0.15);
    const { mtimeMs } = await fs.stat(out);
    expect(await ensurePreviewSpeaker(p, root)).toBe(name);
    expect((await fs.stat(out)).mtimeMs).toBe(mtimeMs);
  }, 120000);

  it("a changed take makes a new file and the old one goes", async () => {
    const p = film(path.join(root, "t", "projects", "p", "assets"));
    const first = await ensurePreviewSpeaker(p, root);
    p.speaker_track.clips[1].trim_start = 0.4;
    const second = await ensurePreviewSpeaker(p, root);
    expect(second).not.toBe(first);
    const files = await fs.readdir(path.join(root, "t", "projects", "p", "output"));
    expect(files.filter((f) => f.startsWith("preview-speaker-"))).toEqual([second]);
  }, 120000);

  it("watch mode swaps the per-scene takes for the joined file, and only watch mode", async () => {
    const src = await fs.readFile(path.join(here, "../src/preview-app/preview-app.ts"), "utf8");
    expect(src).toMatch(/api\('\/projects\/' \+ state\.tenantId \+ '\/' \+ projectId\)\.then\(watchJoinTakes\)/);
    expect(src).toMatch(/if \(!WATCH \|\| !perScene \|\| clips\.length < 2\) return project;/);
    expect(src).toMatch(/api\('\/preview-speaker\/' \+ state\.tenantId/);
    expect(src).toMatch(/clips: \[\{ source: withToken\(r\.url\), trim_start: 0 \}\]/);
    // A live reload would put the per-scene takes back.
    expect(src).toMatch(/function liveSyncReload\(\) \{[\s\S]{0,240}if \(WATCH\) return;/);
    // The phone Studio's Preview is watch mode.
    expect(getPhoneStudioHtml()).toMatch(/view=watch/);
  });
});

describe("the phone Preview's music level", () => {
  it("routes each track's level through a Web Audio gain on a phone, resumed inside the tap", async () => {
    const src = await fs.readFile(path.join(here, "../src/preview-app/preview-app.ts"), "utf8");
    // iOS ignores <audio>.volume: the element stays at 1, the gain carries the level.
    expect(src).toMatch(/if \(IS_MOBILE\) levelThroughGain\(audio\);/);
    expect(src).toMatch(/createMediaElementSource\(audio\)\.connect\(gain\)/);
    expect(src).toMatch(/getOwnPropertyDescriptor\(HTMLMediaElement\.prototype, 'volume'\)\.set\.call\(audio, 1\)/);
    expect(src).toMatch(/set: function\(v\) \{ level = [^}]*gain\.gain\.value = level; \}/);
    // A phone starts the context suspended: both taps resume it.
    expect(src).toMatch(/function playAudio\(\) \{\s*resumeAudioLevels\(\);/);
    expect(src).toMatch(/function watchPrimeMedia\(\) \{\s*resumeAudioLevels\(\);/);
  });
});
