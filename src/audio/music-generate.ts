/**
 * GENERATED MUSIC: ElevenLabs' music model, a bed from a sentence ("driving
 * electronic, 120 BPM, punchy drums, builds at 15 s, no vocals").
 *
 * The Jamendo search hands back the same few songs for every film (Marc,
 * Oct 8: "it's the same fucking song. Every time"). The ElevenLabs key is
 * already on the server (voices, sound effects) and generated music is
 * cleared for commercial use on a paid plan, so each film can get its own
 * track cut to its own length.
 *
 * A generated bed belongs to the film: it is written into the project's
 * audio folder (not a shared shelf) and placed as the film's music track.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const MUSIC_MIN_SECONDS = 3;
export const MUSIC_MAX_SECONDS = 600;

export interface GeneratedMusic {
  file: string;
  prompt: string;
  seconds: number;
  model: string;
  instrumental: boolean;
  song_id?: string;
}

/** The request body: the prompt, the length in ms (clamped to what the
 *  API takes), instrumental unless asked otherwise. */
export function musicRequestBody(opts: { prompt: string; seconds?: number; instrumental?: boolean; model?: string }): Record<string, unknown> {
  const prompt = String(opts.prompt || "").trim().slice(0, 2000);
  if (!prompt) throw new Error("Describe the music (prompt)");
  const body: Record<string, unknown> = {
    prompt,
    model_id: opts.model || process.env.MP_ELEVENLABS_MUSIC_MODEL || "music_v1",
    force_instrumental: opts.instrumental !== false,
  };
  const s = Number(opts.seconds);
  if (opts.seconds != null && Number.isFinite(s)) {
    body.music_length_ms = Math.round(Math.max(MUSIC_MIN_SECONDS, Math.min(MUSIC_MAX_SECONDS, s)) * 1000);
  }
  return body;
}

/** "music-driving-electronic-1a2b3c.mp3" */
export function musicFileName(name: string, prompt: string, salt = ""): string {
  const slug = String(name || prompt).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bed";
  const h = crypto.createHash("sha1").update(prompt + "|" + salt).digest("hex").slice(0, 6);
  return `music-${slug}-${h}.mp3`;
}

/** Make one track from a prompt into `outDir`. */
export async function generateMusic(opts: {
  prompt: string; seconds?: number; instrumental?: boolean; name?: string; model?: string; outDir: string;
  fetchImpl?: typeof fetch;
}): Promise<GeneratedMusic> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not set up on this server (ELEVENLABS_API_KEY)");
  const body = musicRequestBody(opts);
  const r = await (opts.fetchImpl || fetch)("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ElevenLabs music: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  await fs.mkdir(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, musicFileName(opts.name || "", String(body.prompt), new Date().toISOString()));
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
  const songId = r.headers.get("song-id") || undefined;
  return {
    file,
    prompt: String(body.prompt),
    seconds: body.music_length_ms ? Number(body.music_length_ms) / 1000 : 0,
    model: String(body.model_id),
    instrumental: body.force_instrumental === true,
    ...(songId ? { song_id: songId } : {}),
  };
}

/** The film's one music track id. Every writer replaces the film's music
 *  track by TYPE and names it this, so a film never carries two beds (the
 *  pipeline wrote "music_bed", its fallback "bgm" and generate_music
 *  "music" -- a generated bed on a built film sat on top of the old one). */
export const MUSIC_BED_ID = "music_bed";

type AudioHolder = { audio?: { tracks: any[]; ducking?: { duck_track?: string } & Record<string, unknown> } };

/** Put `track` in as the film's music bed: every music track goes, the bed
 *  takes MUSIC_BED_ID, and ducking follows it. */
export function placeMusicBed(project: AudioHolder, track: Record<string, unknown>): Record<string, unknown> {
  if (!project.audio) project.audio = { tracks: [] };
  const bed = { ...track, id: MUSIC_BED_ID, type: "music" };
  project.audio.tracks = [...project.audio.tracks.filter((t) => t?.type !== "music"), bed];
  if (project.audio.ducking) project.audio.ducking.duck_track = MUSIC_BED_ID;
  return bed;
}

const MOOD_MUSIC: Record<string, string> = {
  driving: "upbeat modern pop-electronic, light punchy drums, warm bass, forward momentum",
  jazzy: "light modern jazz, brushed drums, upright bass, warm keys",
  ambient: "airy ambient electronic, soft pads, gentle pulse",
  playful: "playful bouncy pop, plucked synths, claps, light and upbeat",
  cinematic: "cinematic hybrid score, pulsing strings, big drums building",
  warm: "warm acoustic pop, guitar and soft percussion, optimistic",
};

/** A prompt for a film's own bed: its mood, its tempo when the cut follows
 *  one, a build into the close, under a voice when there is one. */
export function filmMusicPrompt(o: { mood?: string; bpm?: number; seconds: number; voiced?: boolean }): string {
  const base = MOOD_MUSIC[String(o.mood || "")] || MOOD_MUSIC.driving;
  // UNDER A VOICE THE BED STAYS OUT OF THE WAY (Marc on the Six Tabs build:
  // "multiple audio tracks playing over the very techno music"): sparse,
  // no lead line, no four-on-the-floor kick.
  const parts = o.voiced ? [base, "kept sparse and low-key: soft pads and light percussion, no lead melody, no heavy techno kick, no busy arpeggios"] : [base];
  if (o.bpm && o.bpm > 40 && o.bpm < 220) parts.push(`${Math.round(o.bpm)} BPM`);
  parts.push(`a short ad bed, ${Math.round(o.seconds)} seconds, starts immediately with energy, builds into the last ${Math.max(3, Math.round(o.seconds * 0.2))} seconds and ends cleanly`);
  if (o.voiced) parts.push("mixed to sit under a voice");
  parts.push("instrumental, no vocals");
  return parts.join(", ");
}

/**
 * THE FILM'S OWN MUSIC: a bed the library picked is replaced by one made for
 * this film at its length (Marc, Oct 8: "it's the same fucking song"). Kept as
 * picked when the film has no music, when generation fails, or when the caller
 * says the bed is someone's choice. Returns the new bed, or null.
 */
export async function ownMusicBed(project: AudioHolder & { scenes?: any[]; name?: string }, o: {
  mood?: string; bpm?: number; voiced?: boolean; outDir: string;
  make?: typeof generateMusic;
}): Promise<Record<string, unknown> | null> {
  const old = (project.audio?.tracks || []).find((t) => t?.type === "music");
  if (!old) return null;
  const film = (project.scenes || []).reduce((a, s) => a + (Number(s?.duration_seconds) || 0), 0);
  if (!(film > 0)) return null;
  const seconds = Math.ceil(film + 1);
  const made = await (o.make || generateMusic)({ prompt: filmMusicPrompt({ mood: o.mood, bpm: o.bpm, seconds, voiced: o.voiced }), seconds, name: project.name || "film", outDir: o.outDir });
  return placeMusicBed(project, {
    source: made.file,
    volume: Number(old.volume) || (o.voiced ? 0.14 : 0.4),
    start_time: 0,
    duration: Math.round(film * 100) / 100,
    fade_in: 0.2,
    fade_out: 0.8,
  });
}

/** THE BED DIPS UNDER THE VOICE: a film with voice tracks and a music bed
 *  gets ducking pointed at the bed (the Six Tabs build had none -- the bed
 *  played flat at 0.18 under every line). Returns true when it set it. */
export function duckUnderVoice(project: AudioHolder): boolean {
  const tracks = project.audio?.tracks || [];
  const bed = tracks.find((t) => t?.type === "music");
  if (!bed || !tracks.some((t) => t?.type === "voiceover")) return false;
  if (project.audio!.ducking && (project.audio!.ducking as any).enabled !== false) { project.audio!.ducking!.duck_track = bed.id; return false; }
  (project.audio as any).ducking = { enabled: true, duck_track: bed.id, trigger_track: "voiceover", ducked_volume: 0.35, attack: 0.3, release: 1.4 };
  return true;
}
