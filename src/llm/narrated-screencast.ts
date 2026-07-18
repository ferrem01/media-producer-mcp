/**
 * Deterministic "narrated screencast" assembly -- the runtime branch behind
 * film_grammar: "speaker-screencast" when the speaker is a recorded NARRATION
 * (audio, no camera) driving a SCREEN RECORDING.
 *
 * This is the fast path: NO LLM storyboard, NO codegen. It stamps out the
 * known-good recipe proven by hand --
 *   [brand intro] -> [screen recording, dead-air time-lapsed & fit to the
 *   narration length] -> [brand outro], with the narration as the soundtrack.
 * The screen recording's boring "agent thinking" stretches are compressed via
 * the same auto-compress the manual `add` path uses; the whole film lands on
 * the narration length so audio and picture stay together with no frozen tail.
 */

import path from "node:path";
import { proposeSceneCompression, probeMediaDuration, proposeChapterPins } from "../core/auto-compress.js";
import { getSentenceSpine, type SentenceSpine } from "../core/sentence-spine.js";
import { resolveVideoPath } from "../core/video-path.js";
import { callLLM, type LLMConfig } from "./client.js";
import { parseLlmJson } from "./json-repair.js";
import type { Project, Scene, BrandAsset } from "../core/types.js";

/** A full-frame video scene (screen recording or a brand bookend clip). */
function videoScene(id: string, label: string, url: string, durationSeconds: number): Scene {
  return {
    id,
    label,
    duration_seconds: Math.max(0.5, Math.round(durationSeconds * 10) / 10),
    components: [{
      id: `${id}_v`,
      type: "screencast-frame",
      z_index: 10,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
      data: { video_url: url, frame_style: "none", corner_radius: 0 },
    }],
  } as unknown as Scene;
}

export interface NarratedScreencastResult {
  project: Project;
  summary: string;
  scene_duration: number;
  narration_duration: number;
}

/** One short title per chapter via a single small LLM call. Returns titles
 *  aligned to `spine.chapters`; empty strings on failure (callers then skip
 *  the chapter cards -- a walkthrough without section titles beats one with
 *  "Part 3" filler). */
export async function titleChapters(
  spine: SentenceSpine,
  llmConfig: LLMConfig,
): Promise<string[]> {
  const blocks = spine.chapters.map((ch, i) => {
    const text = spine.sentences
      .slice(ch.firstSentence, ch.lastSentence + 1)
      .map((s) => s.text)
      .join(" ")
      .slice(0, 700);
    return `Chapter ${i + 1} (${Math.round(ch.start)}s-${Math.round(ch.end)}s): ${text}`;
  });
  try {
    const raw = await callLLM(
      llmConfig,
      [{
        role: "user",
        content:
          `These are the chapters of a narrated product walkthrough video. ` +
          `Give each a short section title: 2-4 words, Title Case, no punctuation, ` +
          `concrete (name the thing being done, not "Introduction"/"Overview" filler).\n\n` +
          blocks.join("\n\n") +
          `\n\nReply with ONLY a JSON array of ${spine.chapters.length} strings, in order.`,
      }],
      { maxTokens: 400, temperature: 0.4 },
    );
    const arr = parseLlmJson(raw, "chapter-titles");
    if (Array.isArray(arr)) {
      return spine.chapters.map((_, i) =>
        typeof arr[i] === "string" ? arr[i].trim().slice(0, 48) : "",
      );
    }
  } catch (e: any) {
    console.warn(`  Spine: chapter titling failed (${e?.message || e}) -- skipping chapter cards`);
  }
  return spine.chapters.map(() => "");
}

export interface BoothAttachResult {
  summary: string;
  captions: number;
  chapters: number;
  narration_duration: number;
}

/**
 * Mode A (SPEC-recorder.md): the demo was narrated LIVE -- voice and video
 * share the recording clock inside ONE file. Compression must never touch
 * speech, so the cut list is idle (sidecar) ∩ silent (silencedetect), applied
 * as HARD CUTS to both streams: the video gets EDL cuts, the audio is
 * concatenated from the kept spans into a standalone narration track, and the
 * two stay in sync by construction. Spine/captions/bed then ride on the cut
 * narration via the same attach used by the booth.
 */
export async function assembleLiveNarration(opts: {
  project: Project;
  /** The recording carrying BOTH streams (extension Mode A webm). */
  source: string;
  dataDir?: string;
  llmConfig?: LLMConfig;
  music?: boolean;
}): Promise<NarratedScreencastResult> {
  const { project, source } = opts;
  const videoPath = resolveVideoPath(source, opts.dataDir);
  let srcDur = await probeMediaDuration(source, opts.dataDir);
  if (!(srcDur > 1)) {
    // Assets uploaded before ingest-time repair existed: MediaRecorder webm
    // with no duration header. Fix in place and retry once.
    const { remuxMediaRecorderFile } = await import("../core/video-normalize.js");
    if (await remuxMediaRecorderFile(videoPath)) {
      srcDur = await probeMediaDuration(source, opts.dataDir);
      console.log(`  Mode A: recording had no duration header -- remuxed (${Math.round(srcDur)}s)`);
    }
  }
  if (!(srcDur > 1)) throw new Error("recording is empty or unreadable");

  const { intersectRanges, complementRanges, shrinkRanges, detectSilence, cutAudioTo } =
    await import("../core/idle-silence.js");
  const { ensureMotionIntel } = await import("../core/asset-intel.js");
  const { solveMediaEdits } = await import("../core/media-edl.js");

  // idle ∩ silent, with breathing room. Either signal missing -> no cuts
  // (a long honest film beats a clipped word).
  const intel = await ensureMotionIntel(videoPath).catch(() => null);
  const idle = (intel?.idle?.ranges || []).map((r: any) => ({ from: r.from, to: r.to }));
  const silence = (await detectSilence(videoPath)).map((r) => ({ from: r.from, to: Math.min(r.to, srcDur) }));
  const cuts = shrinkRanges(intersectRanges(idle, silence), 0.35, 2.5);
  const kept = complementRanges(cuts, srcDur);
  const keptDur = kept.reduce((s, r) => s + (r.to - r.from), 0);
  console.log(
    `  Mode A: ${Math.round(srcDur)}s recording, ${cuts.length} idle+silent cut(s) -> ${Math.round(keptDur)}s ` +
    `(idle ${idle.length} span(s), silence ${silence.length} span(s))`,
  );

  // Video: EDL hard cuts.
  const scene = videoScene("screencast", "Walkthrough", source, keptDur);
  if (cuts.length) {
    const solved = solveMediaEdits(
      { cuts: cuts.map((c) => ({ src_start: c.from, src_end: c.to })), rate_regions: [], pins: [] },
      srcDur,
    );
    (scene as any).media_edits = {
      screencast: {
        segments: solved.segments,
        cuts: cuts.map((c) => ({ src_start: c.from, src_end: c.to })),
        pins: [], rate_regions: [], pin_status: solved.pin_status, proposed: true,
      },
    };
  }

  // Audio: the same cuts, as a standalone narration file the mixer owns.
  const assetsDir = path.join(
    opts.dataDir || process.env.MP_DATA_DIR || "/data/media-producer",
    project.tenant_id, "projects", project.project_id, "assets",
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir(assetsDir, { recursive: true });
  const narrationName = `narration-live-${Date.now()}.m4a`;
  await cutAudioTo(videoPath, kept, path.join(assetsDir, narrationName));
  const narrationUrl = `/assets/${project.tenant_id}/projects/${project.project_id}/assets/${narrationName}`;

  // Bookends + scene list, then the booth attach lays sound + spine on top.
  const assets: BrandAsset[] = (project.brand_kit?.assets || []) as BrandAsset[];
  const intro = assets.find((a) => a.type === "intro" && a.url);
  const outro = assets.find((a) => a.type === "outro" && a.url);
  const scenes: Scene[] = [];
  if (intro) scenes.push(videoScene("intro", "Branded Intro", intro.url, intro.duration || 6));
  scenes.push(scene);
  if (outro) scenes.push(videoScene("outro", "Branded Outro", outro.url, outro.duration || 5));
  project.scenes = scenes;

  // Live narration starts WITH the demo scene, not the intro.
  const attach = await attachBoothNarration({
    project,
    narrationSource: narrationUrl,
    dataDir: opts.dataDir,
    llmConfig: opts.llmConfig,
    music: opts.music,
    narrationStartsAt: intro ? scenes[0].duration_seconds : 0,
  });

  const summary =
    `Live-narrated screencast assembled: ${Math.round(srcDur)}s -> ${Math.round(keptDur)}s ` +
    `(${cuts.length} idle+silent cut(s)) | ${attach.summary}`;
  return {
    project,
    summary,
    scene_duration: scene.duration_seconds,
    narration_duration: attach.narration_duration,
  };
}

/**
 * Mode B (SPEC-recorder.md): attach a voiceover that was PERFORMED AGAINST the
 * already-assembled cut (the Studio narration booth plays the film from 0
 * while recording the mic). The picture is locked -- scenes, durations and
 * media edits are not touched, and no fit-solving happens, because the
 * narration clock IS the film clock by construction. This only lays sound and
 * spine artifacts on top: narration track, captions + chapter cards from the
 * whisper spine, and the grammar's ducked instrumental bed.
 */
export async function attachBoothNarration(opts: {
  project: Project;
  /** Asset URL/path of the recorded take (audio webm/opus from MediaRecorder). */
  narrationSource: string;
  dataDir?: string;
  /** Enables chapter titling (one small call); captions are deterministic. */
  llmConfig?: LLMConfig;
  /** Ducked music bed (default ON, matching the assemble path). */
  music?: boolean;
  /** Film-clock second the take begins at. Booth takes start at 0 (the take
   *  rolls over the intro); Mode A live narration starts WITH the demo scene
   *  (pass the intro duration). Audio-track offset + caption shifting follow. */
  narrationStartsAt?: number;
}): Promise<BoothAttachResult> {
  const { project, narrationSource } = opts;
  const narrationDur = await probeMediaDuration(narrationSource, opts.dataDir);
  if (!(narrationDur > 0.5)) throw new Error("narration take is empty or unreadable");

  // The scene the VO narrates over: the one carrying media edits (the
  // compressed walkthrough), else the longest screencast-frame scene.
  const scenes: Scene[] = project.scenes || [];
  const target =
    scenes.find((s) => (s as any).media_edits) ||
    scenes
      .filter((s) => (s.components || []).some((c: any) => c.type === "screencast-frame"))
      .sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0))[0];
  if (!target) throw new Error("project has no screencast scene to narrate");
  const startsAt = opts.narrationStartsAt || 0;
  // Narration-file second n == film second n + startsAt; scene-local caption
  // times shift by (scene offset - startsAt).
  const offset = scenes
    .slice(0, scenes.indexOf(target))
    .reduce((sum, s) => sum + (s.duration_seconds || 0), 0) - startsAt;
  const sceneDur = target.duration_seconds || 0;
  const filmDur = scenes.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  if (Math.abs(narrationDur - (filmDur - startsAt)) > 3) {
    console.log(
      `  Booth: take is ${Math.round(narrationDur)}s vs film ${Math.round(filmDur - startsAt)}s -- picture stays locked, audio just ends ${narrationDur < filmDur - startsAt ? "early" : "late"}`,
    );
  }

  // Spine: captions + chapter cards. Booth takes start at film time 0, so
  // spine times are film times; the walkthrough overlay gets scene-local
  // times. Degrades to bare narration when whisper is unavailable.
  const cacheDir = path.join(
    opts.dataDir || process.env.MP_DATA_DIR || "/data/media-producer",
    project.tenant_id, "projects", project.project_id, "thumbs",
  );
  const spine = await getSentenceSpine(resolveVideoPath(narrationSource, opts.dataDir), cacheDir);
  let captionCount = 0;
  let chapterCount = 0;
  if (spine) {
    const captions = spine.sentences
      .map((s) => ({
        text: s.text,
        start: Math.max(0, Math.round((s.start - offset) * 100) / 100),
        end: Math.round((s.end - offset) * 100) / 100,
      }))
      .filter((c) => c.end > 0.3 && c.start < sceneDur - 0.5);

    let titles: string[] = spine.chapters.map(() => "");
    if (opts.llmConfig && spine.chapters.length > 1) {
      titles = await titleChapters(spine, opts.llmConfig);
    }
    const chapterMoments = spine.chapters
      .map((ch, i) => ({ title: titles[i], at: Math.max(1.0, Math.round((ch.start - offset) * 100) / 100) }))
      .filter((c) => c.title && c.at < sceneDur - 4);

    const overlay = {
      id: "narration_overlay",
      type: "narration-track",
      z_index: 50,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
      data: { captions, chapters: chapterMoments },
    } as any;
    const existing = (target.components as any[]).findIndex((c) => c.id === "narration_overlay");
    if (existing >= 0) (target.components as any[])[existing] = overlay;
    else (target.components as any[]).push(overlay);

    project.spine = {
      sentences: spine.sentences,
      chapters: spine.chapters.map((ch, i) => ({ ...ch, title: titles[i] || ch.title })),
    };
    captionCount = captions.length;
    chapterCount = chapterMoments.length;
  }

  // Sound: narration replaces any prior take; the bed is added once and kept
  // across retakes.
  const audio: any = (project.audio as any) || { tracks: [] };
  audio.tracks = (audio.tracks || []).filter((t: any) => t.id !== "narration");
  audio.tracks.unshift({
    id: "narration", type: "voiceover", source: narrationSource, volume: 1,
    ...(startsAt > 0 ? { start_time: startsAt } : {}),
  });
  let musicTitle: string | null = null;
  const hasBed = audio.tracks.some((t: any) => t.id === "music_bed");
  if (opts.music !== false && !hasBed) {
    try {
      const { selectMusic } = await import("../audio/music.js");
      const bed = await selectMusic({
        mood: "calm",
        brandKit: project.brand_kit,
        tenantId: project.tenant_id,
        minDuration: Math.min(narrationDur, 180),
        instrumental: true,
      });
      if (bed) {
        audio.tracks.push({
          id: "music_bed", type: "music", source: bed.path,
          volume: 0.18, loop: true, fade_in: 0.8, fade_out: 2.5,
        });
        musicTitle = bed.title;
        console.log(`  Booth: music bed "${bed.title}" by ${bed.artist} (${bed.source})`);
      }
    } catch (e: any) {
      console.warn(`  Booth: music selection failed (${e?.message || e}) -- continuing without`);
    }
  }
  audio.ducking = {
    enabled: true, duck_track: "music_bed", trigger_track: "narration",
    ducked_volume: 0.35, attack: 0.4, release: 0.9,
  };
  project.audio = audio;
  project.status = "generated";
  project.updated_at = new Date().toISOString();

  const parts = [
    `narration ${Math.round(narrationDur)}s attached (picture locked)`,
    spine
      ? `spine ${captionCount} captions / ${chapterCount} chapter card(s)`
      : `no spine (whisper unavailable)`,
    musicTitle ? `music bed "${musicTitle}" ducked under narration` : hasBed ? `existing music bed kept` : null,
  ].filter(Boolean);
  return {
    summary: `Booth narration attached: ${parts.join(" | ")}.`,
    captions: captionCount,
    chapters: chapterCount,
    narration_duration: Math.round(narrationDur * 10) / 10,
  };
}

/**
 * Assemble the narrated-screencast film in place on `project`. Sets
 * project.scenes, project.audio (narration), and status='generated'. The
 * caller persists it.
 */
export async function assembleNarratedScreencast(opts: {
  project: Project;
  screencastSource: string;
  /** The narration that owns the clock (audio, or a camera+voice recording). */
  narrationSource?: string;
  dataDir?: string;
  /** Enables the one small chapter-titling call. Captions themselves are
   *  deterministic (whisper on the box) and don't need this. */
  llmConfig?: LLMConfig;
  /** Soft ducked music bed under the narration (default ON for this grammar;
   *  pass false to opt out). */
  music?: boolean;
}): Promise<NarratedScreencastResult> {
  const { project, screencastSource } = opts;
  const narrationSource = opts.narrationSource;
  const narrationDur = narrationSource ? await probeMediaDuration(narrationSource, opts.dataDir) : 0;

  // Brand bookends -- only when the tenant kit actually ships intro/outro clips.
  const assets: BrandAsset[] = (project.brand_kit?.assets || []) as BrandAsset[];
  const intro = assets.find((a) => a.type === "intro" && a.url);
  const outro = assets.find((a) => a.type === "outro" && a.url);
  const introDur = intro?.duration || 0;
  const outroDur = outro?.duration || 0;

  const scenes: Scene[] = [];
  if (intro) scenes.push(videoScene("intro", "Branded Intro", intro.url, introDur || 6));

  // The screen recording, compressed and fit to the narration MINUS the
  // bookends so the whole film equals the narration length exactly.
  const screencastScene = videoScene("screencast", "Walkthrough", screencastSource, narrationDur > 0.5 ? narrationDur : 573);
  const fitTarget = narrationDur > 0.5 ? Math.max(5, narrationDur - introDur - outroDur) : undefined;
  const compress = await proposeSceneCompression(screencastScene, { dataDir: opts.dataDir, targetDuration: fitTarget });
  scenes.push(screencastScene);

  if (outro) scenes.push(videoScene("outro", "Branded Outro", outro.url, outroDur || 5));

  // ── Sentence spine: captions + chapter cards timed to the narration ──
  // The narration owns the film clock, so spine times ARE film times; the
  // walkthrough scene starts after the intro, so its overlay gets scene-local
  // times (film minus introDur). Degrades to the caption-less assembly when
  // whisper isn't installed or the take transcribes to nothing.
  let spine: SentenceSpine | null = null;
  let pinResult: { pinned: number; dropped: number } | null = null;
  let calloutCount = 0;
  let chapterPinCount = 0;
  if (narrationSource && narrationDur > 0.5) {
    const cacheDir = path.join(
      opts.dataDir || process.env.MP_DATA_DIR || "/data/media-producer",
      project.tenant_id, "projects", project.project_id, "thumbs",
    );
    spine = await getSentenceSpine(resolveVideoPath(narrationSource, opts.dataDir), cacheDir);
  }
  if (spine) {
    const offset = intro ? introDur : 0;
    const sceneDur = screencastScene.duration_seconds;
    const captions = spine.sentences
      .map((s) => ({
        text: s.text,
        start: Math.max(0, Math.round((s.start - offset) * 100) / 100),
        end: Math.round((s.end - offset) * 100) / 100,
      }))
      .filter((c) => c.end > 0.3 && c.start < sceneDur - 0.5);

    let titles: string[] = spine.chapters.map(() => "");
    if (opts.llmConfig && spine.chapters.length > 1) {
      titles = await titleChapters(spine, opts.llmConfig);
    }
    const chapterMoments = spine.chapters
      .map((ch, i) => ({ title: titles[i], at: Math.max(1.0, Math.round((ch.start - offset) * 100) / 100) }))
      .filter((c) => c.title && c.at < sceneDur - 4);

    screencastScene.components.push({
      id: "narration_overlay",
      type: "narration-track",
      z_index: 50,
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
      data: { captions, chapters: chapterMoments },
    } as any);

    // Chapter pins: snap the footage to the narration's chapter boundaries
    // wherever the screencast has a hard visual transition nearby, so the
    // sync is semantic (right screen while it's being talked about), not just
    // durational. Pins land in the media lane -- visible, draggable, human-
    // owned. Conservative: boundaries with no confident visual seam stay
    // unpinned, and strained pins are dropped.
    pinResult = await proposeChapterPins(
      screencastScene,
      spine.chapters.map((ch, i) => ({
        out: ch.start - offset,
        label: titles[i] || `Chapter ${i + 1}`,
      })),
      { dataDir: opts.dataDir },
    );

    const videoPath = resolveVideoPath(screencastSource, opts.dataDir);
    const edit = (screencastScene as any).media_edits?.screencast;

    // Vision pass over the UNPINNED boundaries: motion snapping only trusts
    // seams within ~6s of the blind guess; with a model verifying "is this
    // the screen the narration starts describing?", the search widens to
    // +/-30s safely. Confident matches become ordinary pins; "none" is a
    // valid answer and everything degrades to the motion result.
    if (opts.llmConfig && edit?.segments?.length) {
      try {
        const { groundChapterPins } = await import("./vision-grounding.js");
        const { ensureMotionIntel } = await import("../core/asset-intel.js");
        const { solveMediaEdits } = await import("../core/media-edl.js");
        const intel = await ensureMotionIntel(videoPath);
        const pinnedOuts = new Set(((edit.pins || []) as Array<{ out: number }>).map((p) => p.out));
        const unpinned = spine.chapters
          .map((ch, i) => ({
            out: Math.round((ch.start - offset) * 100) / 100,
            label: titles[i] || `Chapter ${i + 1}`,
            openingText: spine.sentences
              .slice(ch.firstSentence, Math.min(ch.firstSentence + 3, ch.lastSentence + 1))
              .map((s) => s.text)
              .join(" "),
          }))
          .filter((b) => b.out >= 3 && b.out <= sceneDur - 5 && !pinnedOuts.has(b.out));
        if (unpinned.length && intel.transitions.length) {
          const vpins = await groundChapterPins({
            videoPath,
            boundaries: unpinned,
            segments: edit.segments,
            transitions: intel.transitions,
            srcDur: intel.duration,
            llmConfig: opts.llmConfig,
          });
          if (vpins.length) {
            // Merge with the motion pins, keep monotonic, re-solve; if the
            // merged solve strains, fall back to the pre-vision map.
            const merged = [...(edit.pins || []), ...vpins].sort((a: any, b: any) => a.out - b.out);
            const monotonic: any[] = [];
            for (const p of merged) {
              const prev = monotonic[monotonic.length - 1];
              if (!prev || (p.out > prev.out + 2 && p.src > prev.src + 2)) monotonic.push(p);
            }
            const solved = solveMediaEdits(
              { cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins: monotonic },
              intel.duration,
            );
            if (solved.pin_status.every((s) => s.status === "ok")) {
              edit.pins = monotonic;
              edit.segments = solved.segments;
              edit.pin_status = solved.pin_status;
              edit.proposed = true;
            } else {
              console.log(`  Vision pins: merged solve strained -- keeping motion-only pins`);
            }
          }
        }
      } catch (e: any) {
        console.warn(`  Vision pins: pass failed (${e?.message || e}) -- keeping motion pins`);
      }
    }
    chapterPinCount = Math.max(0, ((edit?.pins || []) as Array<{ word?: string }>).filter((p) => p.word !== "end").length);

    // Auto-callouts -- PARKED (2026-07-17, see AMENDMENTS). Six iterations of
    // vision grounding (pixel dialect, draw-and-verify, window sampling,
    // stability checks) still shipped boxes that miss on real footage; a
    // wrong callout damages a walkthrough more than no callout. The full
    // machinery stays (vision-grounding.ts, callout-plan.ts, tests) behind
    // MP_AUTO_CALLOUTS=1 for future work.
    if (process.env.MP_AUTO_CALLOUTS === "1") try {
      const { planCallouts, isActionCue } = await import("../core/callout-plan.js");
      const { ensureMotionIntel } = await import("../core/asset-intel.js");
      if (edit?.segments?.length) {
        let callouts;
        if (opts.llmConfig) {
          const { groundCallouts } = await import("./vision-grounding.js");
          callouts = await groundCallouts({
            videoPath,
            cues: captions.filter((c) => isActionCue(c.text)).slice(0, 10),
            chapterMoments,
            segments: edit.segments,
            sceneDur,
            llmConfig: opts.llmConfig,
          });
        } else {
          const intel = await ensureMotionIntel(videoPath);
          callouts = planCallouts(captions, chapterMoments, edit.segments, intel.focus, sceneDur);
        }
        if (callouts.length) {
          const scfComp = (screencastScene.components as any[]).find((c) => c.type === "screencast-frame");
          if (scfComp) {
            scfComp.data = { ...(scfComp.data || {}), callouts };
            calloutCount = callouts.length;
            console.log(
              `  Callouts: ${callouts.length} proposed at ${callouts.map((c) => `${c.at.toFixed(0)}s`).join(", ")}`,
            );
          }
        } else {
          console.log(`  Callouts: nothing confidently referenced -- none proposed`);
        }
      }
    } catch (e: any) {
      console.warn(`  Callouts: proposal failed (${e?.message || e}) -- skipping`);
    }

    project.spine = {
      sentences: spine.sentences,
      chapters: spine.chapters.map((ch, i) => ({ ...ch, title: titles[i] || ch.title })),
    };
  }

  project.scenes = scenes;
  let musicTitle: string | null = null;
  if (narrationSource) {
    project.audio = { tracks: [{ id: "narration", type: "voiceover", source: narrationSource, volume: 1 }] } as any;

    // Soft music bed under the narration, ducked while the narrator speaks
    // and swelling in the gaps + bookends. Part of the grammar's known-good
    // recipe (opt out with music:false); the film still ships if selection
    // comes up empty.
    if (opts.music !== false) {
      try {
        const { selectMusic } = await import("../audio/music.js");
        const bed = await selectMusic({
          mood: "calm",
          brandKit: project.brand_kit,
          tenantId: project.tenant_id,
          minDuration: Math.min(narrationDur, 180),
          instrumental: true, // lyrics fight the narrator
        });
        if (bed) {
          (project.audio as any).tracks.push({
            id: "music_bed", type: "music", source: bed.path,
            volume: 0.18, loop: true, fade_in: 0.8, fade_out: 2.5,
          });
          (project.audio as any).ducking = {
            enabled: true, duck_track: "music_bed", trigger_track: "narration",
            ducked_volume: 0.35, attack: 0.4, release: 0.9,
          };
          musicTitle = bed.title;
          console.log(`  Music bed: "${bed.title}" by ${bed.artist} (${bed.source}) -- ducked under narration`);
        }
      } catch (e: any) {
        console.warn(`  Music bed: selection failed (${e?.message || e}) -- continuing without`);
      }
    }
  }
  project.status = "generated";
  project.updated_at = new Date().toISOString();

  const applied = compress.applied[0];
  const parts = [
    intro ? `intro ${Math.round(introDur)}s` : null,
    applied
      ? `screencast ${applied.source_duration}s->${applied.output_duration}s @${applied.idle_rate}x (${applied.idle_ranges} idle stretches)`
      : `screencast (no compressible idle found)`,
    outro ? `outro ${Math.round(outroDur)}s` : null,
    spine ? `spine ${spine.sentences.length} sentences / ${spine.chapters.length} chapters` : `no spine (whisper unavailable)`,
    pinResult
      ? chapterPinCount
        ? `${chapterPinCount} chapter boundary pin(s) (motion + vision grounded)`
        : `no chapter pins (no confident visual seams)`
      : null,
    calloutCount ? `${calloutCount} auto-callout(s)` : null,
    musicTitle ? `music bed "${musicTitle}" ducked under narration` : null,
  ].filter(Boolean);
  const summary = `Narrated screencast assembled: ${parts.join(" | ")}${narrationDur > 0.5 ? ` | narration ${Math.round(narrationDur)}s` : " | no narration track"}.`;

  return {
    project,
    summary,
    scene_duration: screencastScene.duration_seconds,
    narration_duration: Math.round(narrationDur * 10) / 10,
  };
}
