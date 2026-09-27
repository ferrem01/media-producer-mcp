/**
 * THE PROMPTER, written once for every booth (SPEC-remote-booth.md).
 *
 * The arm's-length booth (src/take-page.ts) and the remote booth's control
 * screen (src/remote-booth-page.ts) read the same script the same way: the
 * storyboard's voiceover_text, one cue per sentence, each word lit at the
 * target pace (karaoke), emphasis held, punctuation beating after the word.
 * Two copies would drift -- a pacing fix Marc asks for on the phone must
 * land on the laptop too -- so the code lives here as plain ES5 strings the
 * pages inline verbatim (the LIGHT_CHECK_JS pattern, src/core/light-check.ts).
 *
 * PROMPTER_TIMING_JS is pure (script in, cues out) and is evaluated for Node
 * below so tests exercise exactly what the browser runs.
 * PROMPTER_VIEW_JS paints the cues: it expects the page to define `$` (by
 * id), `cues`, and the elements #cue, #next and #next2.
 *
 * Both strings sit inside template literals: a regex backslash is written
 * doubled here, exactly as it was inside the take page's own literal, and
 * no backtick or dollar-brace may appear in them.
 */

export interface PrompterToken { t: string; emph: boolean; dash: boolean; start: number; end: number }
export interface PrompterCue { text: string; toks: PrompterToken[]; dur: number; gap: number; beat: number }

export const PROMPTER_TIMING_JS = `
  var WORDS_PER_SEC = 2.4;

  // Cues follow the script's own notation: one sentence per line (a line
  // break is a breath, ~0.3s) and a line that says only (pause) is a held
  // beat (~1s) the prompter shows as "•••". Silences come out of the
  // scene's duration first; the words share what is left.
  var BREATH_S = 0.3, PAUSE_S = 1.0, PAUSE_GLYPH = '\u2022\u2022\u2022';
  var PAUSE_LINE = /^\\(\\s*pause\\s*\\)[.,!?]*$/i;
  // Per-word timing: a word's time is its share of the pace by length;
  // an EMPHASIZED word (the board's emphasis list, or *word* in the line)
  // is held EMPH_K longer; punctuation carries its beat AFTER the word --
  // a comma a small one, a dash or an ellipsis a longer one (Marc: "will it
  // understand that I emphasize certain words, that I pause on certain
  // words?"). A scene change adds NOTHING: the talk track is continuous.
  var EMPH_K = 1.4, COMMA_S = 0.2, DASH_S = 0.4;
  function wordBeat(w) {
    var last = w.charAt(w.length - 1);
    if (w === '-' || w === '–' || w === '—' || last === '—' || last === '–' || last === '…' || w.slice(-3) === '...') return DASH_S;
    if (last === ',' || last === ';' || last === ':') return COMMA_S;
    return 0;
  }
  function bare(w) { return String(w).toLowerCase().split('').filter(function (ch) { return ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9') || ch === "'"; }).join(''); }
  function timeLine(text, emph) {
    // Split on spaces; lift *stars* (the writer's emphasis) off each word.
    var raw = String(text).split(' ').filter(function (w) { return w.length; });
    var toks = [];
    var starOpen = false;
    raw.forEach(function (w) {
      var open = w.charAt(0) === '*', close = w.length > 1 && (w.charAt(w.length - 1) === '*' || /\\*[.,!?;:…]+$/.test(w));
      var clean = w.split('*').join('');
      var marked = open || starOpen || close;
      if (open && !close) starOpen = true;
      if (close) starOpen = false;
      if (!clean) return;
      var isDash = clean === '-' || clean === '–' || clean === '—';
      toks.push({ t: clean, emph: !isDash && (marked || emph.indexOf(bare(clean)) >= 0), dash: isDash });
    });
    var perWord = 1 / WORDS_PER_SEC;
    var lens = toks.filter(function (k) { return !k.dash; }).map(function (k) { return Math.max(2, bare(k.t).length || k.t.length); });
    var avg = lens.length ? lens.reduce(function (a, b) { return a + b; }, 0) / lens.length : 4;
    var at = 0;
    toks.forEach(function (k) {
      k.start = at;
      if (k.dash) { k.end = at; at += DASH_S; return; }
      var len = Math.max(2, bare(k.t).length || k.t.length);
      var t = perWord * (0.55 + 0.45 * len / avg) * (k.emph ? EMPH_K : 1);
      at += t; k.end = at;
      at += wordBeat(k.t);
    });
    return { toks: toks, spoken: at };
  }
  function buildCues(scenes) {
    var out = [];
    (scenes || []).forEach(function (s, i) {
      var text = String(s.voiceover_text || '').trim();
      if (!text) return;
      var emph = (Array.isArray(s.emphasis) ? s.emphasis : []).map(bare).filter(Boolean);
      var lines = text.split(/\\r?\\n/).reduce(function (a, l) { return a.concat(l.split(/(\\(\\s*pause\\s*\\)[.,!?]*)/i)); }, []).map(function (l) { return l.trim(); }).filter(Boolean);
      lines.forEach(function (ln) {
        if (PAUSE_LINE.test(ln)) { out.push({ text: PAUSE_GLYPH, toks: [], dur: PAUSE_S, gap: PAUSE_S, beat: i }); return; }
        var parts = ln.match(/[^.!?…]+[.!?…]+["')\\]]*|[^.!?…]+$/g) || [ln];
        parts.forEach(function (p0, k) {
          var t = p0.trim(); if (!t) return;
          var tl = timeLine(t, emph);
          // Every sentence ends on the same short breath -- inside a scene
          // or at its end alike (no scene-boundary pause).
          var gap = k === parts.length - 1 ? BREATH_S : 0;
          out.push({ text: tl.toks.map(function (x) { return x.t; }).join(' '), toks: tl.toks, dur: Math.max(0.6, tl.spoken + gap), gap: gap, beat: i });
        });
      });
    });
    if (out.length) out[out.length - 1].gap = 0;
    return out;
  }
`;

export const PROMPTER_VIEW_JS = `
  // One cue at a time, each on its own clock; a TAP on the stage jumps to
  // the next line and the clock restarts from there, so the prompter can
  // never run ahead of the person reading it.
  var cueIdx = -1, cueTimer = null;
  var kRaf = 0;
  function stopKaraoke() { if (kRaf) cancelAnimationFrame(kRaf); kRaf = 0; }
  function showCue(i) {
    if (cueTimer) clearTimeout(cueTimer); cueTimer = null;
    stopKaraoke();
    cueIdx = i;
    if (i >= cues.length) { $('cue').textContent = ''; $('next').textContent = 'That’s the script. Stop when you’re done.'; $('next2').textContent = ''; return; }
    var c = cues[i];
    // The line's words, each lit when its own precomputed turn begins
    // (timeLine: length share, emphasis hold, punctuation beats).
    var cueEl = $('cue'); cueEl.textContent = '';
    var toks = c.toks || [];
    var spans = toks.map(function (k, j) {
      var sp = document.createElement('span'); sp.className = 'w' + (k.emph ? ' em' : '') + (k.dash ? ' dash' : ''); sp.textContent = k.t;
      cueEl.appendChild(sp); if (j < toks.length - 1) cueEl.appendChild(document.createTextNode(' '));
      return sp;
    });
    if (!toks.length) cueEl.textContent = c.text;
    var start = performance.now();
    var lastStart = toks.length ? toks[toks.length - 1].start : 0;
    (function paint() {
      var el = (performance.now() - start) / 1000;
      for (var k = 0; k < spans.length; k++) { if (el >= toks[k].start) spans[k].classList.add('on'); }
      if (el < lastStart) kRaf = requestAnimationFrame(paint);
    })();
    $('next').textContent = cues[i + 1] ? cues[i + 1].text : '';
    $('next2').textContent = cues[i + 2] ? cues[i + 2].text : '';
    cueTimer = setTimeout(function () { showCue(i + 1); }, c.dur * 1000);
  }
  function clearPrompter() { if (cueTimer) clearTimeout(cueTimer); cueTimer = null; stopKaraoke(); cueIdx = -1; $('cue').textContent = ''; $('next').textContent = ''; $('next2').textContent = ''; }
`;

interface PrompterApi {
  WORDS_PER_SEC: number;
  buildCues(scenes: Array<{ voiceover_text?: string; emphasis?: string[] }>): PrompterCue[];
}

const api = new Function(`${PROMPTER_TIMING_JS}\nreturn { WORDS_PER_SEC: WORDS_PER_SEC, buildCues: buildCues };`)() as PrompterApi;

export const WORDS_PER_SEC = api.WORDS_PER_SEC;
export const buildCues = api.buildCues;
