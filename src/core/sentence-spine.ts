/**
 * Sentence spine: the speaker-screencast grammar's structural beat.
 *
 * Tempo-cut's spine is the bar grid (music-first); the narrated walkthrough's
 * spine is the SENTENCE. Whisper gives word-level timestamps (transcribe.ts);
 * this module groups words into sentences and sentences into chapters --
 * pure, deterministic functions that captions, chapter cards, and (later)
 * social clipping all hang off.
 *
 * Times are NARRATION seconds. The narration owns the film clock in this
 * grammar (the screencast is compressed to fit it), so narration time IS
 * film time; callers offset into scene-local time where needed.
 */

import { getTranscript, whisperAvailable, snapLeadingWords, type TranscriptSegment } from "./transcribe.js";
import { getWaveformPeaks } from "./waveform.js";

export interface SpineSentence {
  text: string;
  start: number;
  end: number;
}

export interface SpineChapter {
  /** Short display title; empty until a titling pass fills it in. */
  title: string;
  start: number;
  end: number;
  /** Indices into the sentences array (inclusive range). */
  firstSentence: number;
  lastSentence: number;
}

export interface SentenceSpine {
  sentences: SpineSentence[];
  chapters: SpineChapter[];
}

/** A sentence ends on terminal punctuation, on a real pause, or (as a guard
 *  against run-on transcription) after enough words that a lower third would
 *  overflow anyway. */
export function buildSentences(words: TranscriptSegment[]): SpineSentence[] {
  const sentences: SpineSentence[] = [];
  let cur: TranscriptSegment[] = [];

  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text.trim()).filter(Boolean).join(" ")
      .replace(/\s+([,.?!;:])/g, "$1");
    if (text) sentences.push({ text, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.text.trim()) continue;
    cur.push(w);
    const endsSentence = /[.?!]["')\]]?$/.test(w.text.trim());
    const next = words[i + 1];
    const gap = next ? next.start - w.end : Infinity;
    if (endsSentence || gap > 0.9 || cur.length >= 24) flush();
  }
  flush();
  return sentences;
}

export interface ChapterOptions {
  /** Don't close a chapter before this many seconds (default 25). */
  minSeconds?: number;
  /** Force a boundary once a chapter would exceed this (default 75). */
  maxSeconds?: number;
  /** A silence this long between sentences is a section break (default 1.6). */
  breakGap?: number;
}

/** Chapters form at the narration's own seams: a long pause between
 *  sentences is a section break; otherwise chapters close at the sentence
 *  boundary nearest the target length so no chapter runs away. */
export function buildChapters(
  sentences: SpineSentence[],
  opts: ChapterOptions = {},
): SpineChapter[] {
  const minS = opts.minSeconds ?? 25;
  const maxS = opts.maxSeconds ?? 75;
  const breakGap = opts.breakGap ?? 1.6;
  if (!sentences.length) return [];

  const chapters: SpineChapter[] = [];
  let first = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const next = sentences[i + 1];
    const runLen = s.end - sentences[first].start;
    const gapAfter = next ? next.start - s.end : Infinity;
    const pauseBreak = gapAfter > breakGap && runLen >= minS;
    const lengthBreak = next ? next.end - sentences[first].start > maxS && runLen >= minS : false;
    if (!next || pauseBreak || lengthBreak) {
      chapters.push({
        title: "",
        start: sentences[first].start,
        end: s.end,
        firstSentence: first,
        lastSentence: i,
      });
      first = i + 1;
    }
  }
  return chapters;
}

/**
 * Transcribe the narration and build the full spine. Returns null when
 * whisper isn't installed (callers degrade to the caption-less assembly) or
 * when transcription yields nothing usable.
 */
export async function getSentenceSpine(
  audioPath: string,
  cacheDir: string,
): Promise<SentenceSpine | null> {
  if (!(await whisperAvailable())) return null;
  try {
    const { segments } = await getTranscript(audioPath, cacheDir);
    let words = segments;
    // Same leading-silence correction the Studio words lane applies: whisper
    // anchors the first words at t=0 even when the take opens with silence.
    try {
      const wf = await getWaveformPeaks(audioPath, cacheDir);
      const onsetIdx = wf.peaks.findIndex((pk) => pk > 0.08);
      if (onsetIdx > 0) words = snapLeadingWords(words, onsetIdx / wf.bucketsPerSecond);
    } catch { /* waveform optional */ }
    const sentences = buildSentences(words);
    if (!sentences.length) return null;
    return { sentences, chapters: buildChapters(sentences) };
  } catch (e: any) {
    console.warn(`  Spine: transcription failed (${e?.message || e}) -- continuing without captions`);
    return null;
  }
}
