/**
 * THE BOARD IS ENFORCED, NOT WARNED ABOUT. The writer is an LLM; what the
 * brief and the house style require is checked and FIXED in code after it
 * writes, the same fixes a person makes by hand on every board.
 *
 * Measured live (proj_2e79b8e2, Oct 8, the Six Tabs relay remake): the brief
 * gave six numbered lines in Marc's voice and asked for ~22 s. The board came
 * back with every voice line empty (the board only WARNED "the brief locks
 * this line"), 41 s long (7.5 s a scene), and fifteen sound cues -- a FAHHH,
 * a buzzer, a click per click. Each was then fixed by hand, deterministically:
 * the lines put back on their beats, each scene sized to its line with its
 * component times scaled to match, one quiet sound per handoff. Those fixes
 * are this module.
 */
import { NARRATION_MIN_S, NARRATION_TAIL_S } from "../core/narration-fit.js";
import { rescaleBeats } from "../core/beats.js";

/** Speaking pace the board sizes a line at before the voice exists (the
 *  build re-fits every scene to the measured line). */
export const BOARD_WORDS_PER_SECOND = 2.8;

/** The beats' lines a brief numbers: `1. "Still opening six tabs..." -- ...`.
 *  Index i is beat i+1's line. Empty when the brief does not number them. */
export function numberedBriefLines(brief: string | undefined | null): string[] {
  const out: string[] = [];
  for (const line of String(brief || "").split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,2})[.)]\s*[“"]([^”"\n]{2,300})[”"]/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n !== out.length + 1) return []; // not one clean 1..N list
    out.push(m[2].trim());
  }
  return out.length >= 2 ? out : [];
}

/** The film length a brief asks for ("~22 s", "a 30-second ad"), if any. */
export function briefTargetSeconds(brief: string | undefined | null): number | undefined {
  const m = String(brief || "").match(/(?:^|[\s~(])(\d{1,3}(?:\.\d+)?)\s*-?\s*(?:s|secs?|seconds?)\b/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 5 && n <= 180 ? n : undefined;
}

const spokenWords = (line: string) => line.replace(/\*/g, "").replace(/\(pause\)/gi, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** How long a scene runs for a line before the voice exists. */
export function boardLengthForLine(line: string): number {
  const words = spokenWords(line);
  const pauses = (line.match(/\(pause\)/gi) || []).length;
  return Math.round(Math.max(NARRATION_MIN_S, words / BOARD_WORDS_PER_SECOND + pauses + NARRATION_TAIL_S) * 100) / 100;
}

const contentWords = (t: string) => new Set(t.toLowerCase().replace(/\*/g, "").split(/[^\p{L}\p{N}'-]+/u).filter((w) => w.length >= 3));

/** How much of `line` the text `said` carries (0-1, by content words). */
function recall(line: string, said: string): number {
  const want = contentWords(line);
  if (!want.size) return 0;
  const have = contentWords(said);
  let n = 0;
  for (const w of want) if (have.has(w)) n++;
  return n / want.size;
}

/** The writer's line for scene i reads as beat i: empty (nothing to
 *  contradict), or carrying beat i's line and no other beat's. */
export function sceneReadsBeat(said: string, lines: string[], i: number): boolean {
  if (!said.trim()) return true;
  const r = lines.map((l) => recall(l, said));
  return r[i] >= 0.5 && r.every((x, j) => j === i || x < 0.5);
}

const TIME_KEY = /^(at|start|end|duration|delay|[a-z]+_at)$/;

/** Scale every timeline number a scene's cast carries (data `at`, `*_at`,
 *  `start`/`end`, `duration`, nested script/path/steps entries, enter/exit,
 *  sound cues, camera moves, beats) by `factor`. Word anchors ("@word",
 *  anchors maps) are left alone: they re-resolve against the line. */
export function scaleSceneTimes(scene: any, factor: number): void {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.01) return;
  const r = (v: number) => Math.round(v * factor * 100) / 100;
  const walk = (o: any) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "number" && TIME_KEY.test(k)) o[k] = r(v);
      else if (v && typeof v === "object" && k !== "anchors" && k !== "position" && k !== "region" && k !== "from_shape") walk(v);
    }
  };
  for (const c of Array.isArray(scene.components) ? scene.components : []) {
    if (!c || typeof c !== "object") continue;
    walk(c.data);
    for (const k of ["enter", "exit"]) if (c[k] && typeof c[k].at === "number") c[k].at = r(c[k].at);
  }
  for (const s of Array.isArray(scene.sfx) ? scene.sfx : []) if (s && typeof s.at === "number") s.at = r(s.at);
  for (const m of Array.isArray(scene.camera_moves) ? scene.camera_moves : []) if (m && typeof m.at === "number") m.at = r(m.at);
}

function setSceneLength(scene: any, to: number): void {
  const from = Number(scene.duration_seconds) || 0;
  if (from > 0) scaleSceneTimes(scene, to / from);
  scene.duration_seconds = to;
  if (Array.isArray(scene.beats) && scene.beats.length >= 2) rescaleBeats(scene.beats, to);
}

const MEME_ROLES = new Set(["attention", "comedy"]);
const MEME_IDS = /(^|-)(attention|monkey|boom)$/;
const ROLE_RANK: Record<string, number> = { payoff: 4, tension: 3, transition: 2, right: 1, wrong: 1 };

/** One sound cue a scene, at most, at a quiet level; no meme stings unless
 *  the brief asks for them. Returns how many cues were dropped. */
export function capSceneSounds(scenes: any[], opts: { memes?: boolean } = {}): number {
  let dropped = 0;
  for (const sc of scenes) {
    if (!Array.isArray(sc?.sfx) || !sc.sfx.length) continue;
    const before = sc.sfx.length;
    let cues = sc.sfx.filter((c: any) => c && (opts.memes || (!MEME_ROLES.has(String(c.role || "")) && !MEME_IDS.test(String(c.id || "")))));
    if (cues.length > 1) {
      let best = cues[0];
      for (const c of cues) if ((ROLE_RANK[c.role] || 0) > (ROLE_RANK[best.role] || 0)) best = c;
      cues = [best];
    }
    for (const c of cues) {
      const cap = c.role === "payoff" ? 0.35 : 0.3;
      c.volume = typeof c.volume === "number" ? Math.min(c.volume, cap) : cap;
    }
    sc.sfx = cues;
    dropped += before - cues.length;
  }
  // ONE PAYOFF A FILM: the hit belongs to the payoff itself -- the last
  // scene that has one (measured live: a bass hit on three scenes running).
  const payoffs = scenes.filter((sc) => Array.isArray(sc?.sfx) && sc.sfx.some((c: any) => c?.role === "payoff"));
  for (const sc of payoffs.slice(0, -1)) { const n = sc.sfx.length; sc.sfx = sc.sfx.filter((c: any) => c?.role !== "payoff"); dropped += n - sc.sfx.length; }
  return dropped;
}

/**
 * Enforce the board the writer returned. `voiced`: the film has a narrator
 * (TTS). `personCarries`: a person speaks the lines on camera (their take
 * sets the length later). `recipe`: the board fills a measured cut, whose
 * seconds are the edit. Returns one log line per fix.
 */
export function enforceBoard(scenes: any[], opts: { brief?: string; voiced?: boolean; personCarries?: boolean; recipe?: boolean }): { log: string[]; warnings: string[] } {
  const log: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(scenes) || !scenes.length) return { log, warnings };

  // 1. THE BRIEF'S LINES ARE THE LINES: a numbered line per beat goes on its
  //    scene, word for word -- but only on a board whose scenes ARE the
  //    beats. Measured live (proj_84048b0d): six beats came back as one oner
  //    holding beats 1-4 plus two invented scenes; stamped by number, every
  //    line landed on the wrong picture. The writer's own lines show which
  //    beat each scene is; a board that does not follow the beats is left
  //    as written and said so.
  if (opts.voiced || opts.personCarries) {
    const lines = numberedBriefLines(opts.brief);
    const follows = lines.length === scenes.length && scenes.every((sc, i) => sceneReadsBeat(String(sc.voiceover_text || ""), lines, i));
    if (follows) {
      const changed: number[] = [];
      lines.forEach((line, i) => {
        const had = String(scenes[i].voiceover_text || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
        if (had !== line) { scenes[i].voiceover_text = line; if (Array.isArray(scenes[i].beats)) for (const b of scenes[i].beats) if (b) b.voiceover_text = undefined; changed.push(i + 1); }
      });
      if (changed.length) log.push(`the brief's lines put on scene(s) ${changed.join(", ")}`);
    } else if (lines.length) {
      warnings.push(`The brief numbers ${lines.length} beats and the board's ${scenes.length} scenes do not follow them one to one -- redraft it ("one scene per numbered beat") before building.`);
    }
  }

  // 2. THE LENGTH: a voiced scene runs as long as its line; an unvoiced film
  //    is scaled to the length the brief asks for. A recipe's seconds are the
  //    edit, and a person's take re-times its own scenes.
  const total = () => scenes.reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);
  const was = total();
  if (opts.recipe || (opts.personCarries && !opts.voiced)) {
    // length left to the recipe / the take
  } else if (opts.voiced) {
    for (const sc of scenes) {
      const line = String(sc.voiceover_text || "").trim();
      if (line) setSceneLength(sc, boardLengthForLine(line));
    }
  } else {
    const target = briefTargetSeconds(opts.brief);
    if (target && was > target * 1.15) {
      const f = target / was;
      for (const sc of scenes) setSceneLength(sc, Math.max(0.5, Math.round((Number(sc.duration_seconds) || 0) * f * 100) / 100));
    }
  }
  const now = total();
  if (Math.abs(now - was) > 0.5) log.push(`length ${was.toFixed(1)}s -> ${now.toFixed(1)}s (${opts.voiced ? "each scene sized to its line" : "the brief's length"})`);

  // 3. THE SOUND: one quiet cue a scene, no meme stings.
  const dropped = capSceneSounds(scenes, { memes: /\b(meme|fahh+|sting|vine boom)\b/i.test(String(opts.brief || "")) });
  if (dropped) log.push(`${dropped} sound cue(s) dropped (one a scene, one payoff a film, no meme stings)`);
  return { log, warnings };
}
