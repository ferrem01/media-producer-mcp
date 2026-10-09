/**
 * A VOICE-ONLY FILM'S LINES are edited like a take: each scene's
 * `vo_scene_<i>` line can be re-read at another pace, re-read with new
 * words, or replaced by the person's own recording -- and the film re-fits
 * to it (scene lengths, word anchors, sound effects, the music's end).
 *
 * Studio's voice card drives it (POST /api/voice-line); the audio tool's
 * fit_voiceover shares the fit. Marc, Oct 8, proj_f5c104bb: "when you have a
 * speaker track that's voice only ... you can't change its pacing. And ...
 * there's no re-record. You can't select the layer like you can when the
 * speaker is a video."
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { Project, AudioTrack } from "./types.js";
import { measureNarration, fitScenesToNarration, narrationTrackScene } from "./narration-fit.js";
import { resolveVideoPath } from "./video-path.js";
import { measureLoudness } from "./take-sanitize.js";
import { speak, levelGain, levelFilter, voiceSpeed } from "../audio/tts.js";
import { activeTake } from "./take-needs.js";

const run = promisify(execFile);

export function lineTrack(project: Project, si: number): AudioTrack | undefined {
  return (project.audio?.tracks || []).find((t) => narrationTrackScene(t.id) === si);
}

/** The words scene `si` speaks: what the line was read from, else the
 *  scene's script, else the board's. */
export function lineText(project: Project, si: number): string {
  const tr = lineTrack(project, si);
  const sc: any = project.scenes[si];
  return String(tr?.text || sc?.audio_hints?.voiceover_text || (project as any).storyboard?.scenes?.[si]?.voiceover_text || "").trim();
}

/** Fit the whole film to its lines: each scene its line plus a breath, the
 *  words as its spine, everything anchored to a word re-timed, sound effects
 *  kept in their scenes, the lines at their scenes' starts. */
export async function fitFilmToVoice(project: Project, dataDir: string, cacheDir: string) {
  const lines = await Promise.all(project.scenes.map(async (_sc: any, i: number) => {
    const tr = lineTrack(project, i);
    if (!tr?.source) return undefined;
    return measureNarration(resolveVideoPath(tr.source, dataDir), lineText(project, i), cacheDir).catch(() => undefined);
  }));
  if (!lines.some(Boolean)) return null;
  return fitScenesToNarration(project, lines);
}

/** Re-read scene `si`'s line. Unset fields keep what the line was read with
 *  (its words, voice, pace). The file name is fresh so the player and the
 *  render never keep the old read. */
export async function revoiceLine(project: Project, si: number, opts: { text?: string; speed?: number; voice?: string }, ctx: {
  tenant: string; audioDir: string; speak?: typeof speak;
}): Promise<AudioTrack> {
  const sc: any = project.scenes[si];
  if (!sc) throw new Error(`No scene ${si}`);
  const text = String(opts.text ?? lineText(project, si)).trim();
  if (!text) throw new Error(`Scene ${si + 1} has no line to read`);
  let tr = lineTrack(project, si);
  const voice = opts.voice || tr?.voice || project.brand_kit?.voice;
  const speed = voiceSpeed(opts.speed ?? tr?.speed ?? 1);
  await fs.mkdir(ctx.audioDir, { recursive: true });
  const out = path.join(ctx.audioDir, `vo_scene_${si}-${Date.now().toString(36)}.mp3`);
  await (ctx.speak || speak)({ text, out, voice, speed, tenant: ctx.tenant });
  if (!project.audio) project.audio = { tracks: [] };
  if (!tr) {
    tr = { id: `vo_scene_${si}`, type: "voiceover", source: out, volume: 1 };
    project.audio.tracks.push(tr);
  }
  tr.source = out;
  tr.text = text;
  tr.speed = speed;
  if (voice) tr.voice = voice; else delete tr.voice;
  delete tr.take;
  sc.audio_hints = { ...(sc.audio_hints || {}), voiceover_text: text };
  return tr;
}

/** The person's own recording of scene `si`'s line replaces the read. The
 *  recording is kept as it came (`take`); what plays is an mp3 made from it,
 *  levelled like every line (tts.ts `levelFilter`) at the line's pace, its
 *  words still the script so anchors and captions read what was written. */
export async function attachRecordedLine(project: Project, si: number, file: string, ctx: { audioDir: string }): Promise<AudioTrack> {
  const sc: any = project.scenes[si];
  if (!sc) throw new Error(`No scene ${si}`);
  if (!project.audio) project.audio = { tracks: [] };
  let tr = lineTrack(project, si);
  if (!tr) {
    tr = { id: `vo_scene_${si}`, type: "voiceover", source: file, volume: 1 };
    project.audio.tracks.push(tr);
  }
  const text = lineText(project, si);
  if (text) tr.text = text;
  tr.take = file;
  delete tr.voice;
  await renderRecordedLine(tr, 1, ctx.audioDir);
  return tr;
}

/** A VOICE-ONLY RECORDING of scene `si` lands: kept on the board scene as
 *  its voice take (what a performance is made from), and played as the
 *  scene's line unless a take already plays there -- then the take keeps
 *  the scene, and the recording waits for a performance made from it (Marc,
 *  Oct 8: "I'll just record the voice ... then when I go through the options
 *  ... the appropriate visuals would be presented to me"). Returns whether
 *  it now plays (the film then re-fits to its lines). */
export async function recordSceneVoice(project: Project, si: number, file: string, ctx: { audioDir: string }): Promise<boolean> {
  if (!project.scenes[si]) throw new Error(`No scene ${si}`);
  const bs = (project as any).storyboard?.scenes?.[si];
  if (bs) bs.voice_take = { file, recorded_at: new Date().toISOString() };
  if (activeTake(project, si)) return false;
  await attachRecordedLine(project, si, file, ctx);
  return true;
}

/** Re-pace a recorded line from the recording itself (pitch kept). */
export async function paceRecordedLine(project: Project, si: number, speed: number, ctx: { audioDir: string }): Promise<AudioTrack> {
  const tr = lineTrack(project, si);
  if (!tr?.take) throw new Error(`Scene ${si + 1}'s line is not a recording`);
  await renderRecordedLine(tr, voiceSpeed(speed), ctx.audioDir);
  return tr;
}

async function renderRecordedLine(tr: AudioTrack, speed: number, audioDir: string): Promise<void> {
  const take = String(tr.take);
  await fs.mkdir(audioDir, { recursive: true });
  const out = path.join(audioDir, `${tr.id}-rec-${Date.now().toString(36)}.mp3`);
  const gain = levelGain(await measureLoudness(take));
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", take, "-vn", "-af", levelFilter(speed, gain),
    "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", out]);
  tr.source = out;
  if (speed !== 1) tr.speed = speed; else delete tr.speed;
}
