/**
 * HAND MOTIFS -- the hand-drawn print motifs, as pure functions any component
 * can draw from: a seeded random, the math-symbol field (+ - x / = and the
 * plus-minus, laid out from ASCII art), the cursive squiggle, and the worn
 * paper edge. Ported from the Quotient rebrand's brand components
 * (components/brand/symbol-field, squiggle, worn-edge, seeded-random) so a
 * film draws the same shapes the website does, from the same seeds.
 *
 * Everything here returns geometry or markup; nothing animates. Components
 * animate it from their own clock, so a seek anywhere draws the same frame.
 */

/** mulberry32 seeded from an FNV-1a hash of the string: the same seed always
 *  gives the same sequence in [0, 1). */
function mpHandRandom(seed) {
  var state = 2166136261;
  var s = String(seed);
  for (var i = 0; i < s.length; i++) state = Math.imul(state ^ s.charCodeAt(i), 16777619);
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    var v = Math.imul(state ^ (state >>> 15), 1 | state);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** Named symbol-field shapes, traced from the rebrand mockups. `#` is always
 *  a symbol, `:` is one about half the time, anything else is empty. */
var MP_SYMBOL_SHAPES = {
  'home-left': [
    '##', '##', '###', ':##', ' ##', ' ###', ' ##:', ' ####     :#', '  ##:##   :##',
    '   ######:####', '    ##   :###   ::', '           #######:#', '            ##  #####', '                  :##'
  ].join('\n'),
  'home-right': [
    '          ::# :#', ' ##::  ####:######', '######:::##   ###:', ' ##:            ###', '            :   ###:#',
    '             :######:#', '                 ######', '                    :##', '                    ###',
    '                     ##', '                    :##', '                     ###'
  ].join('\n'),
  cluster: ['   ::#', ' ######', ':##:####', '  ##  ###', '       :##'].join('\n'),
  'frame-top-right': ['##########', '     ######   ##', '     #######: ##', '          ::####', '           :###', '            :##'].join('\n'),
  'frame-bottom-left': ['####', '####', '####:', '  ::#####', '     ####'].join('\n'),
  // "Quotient" in symbols, generated from the real logotype (the rebrand's
  // `wordmark` preset: 82 cells wide, 16 tall).
  wordmark: [
    '        #######:                               :      ###                           ::',
    '      :####:#####                             ###     ###                          ###',
    '     :###     ###:                           :###     ###                          ###',
    '     ###       ###                  ::       :###              ::          ::      ###',
    '    :###       ####  ###   ###    ######    ########  ###    ######   ########   #######',
    '    ####       ####  ###   ###   ###::###   :#######  ###   ### ####  #########  :#####:',
    '    ###:       :###  ###   ###  ###:   ###   :###     ###  ###   ###  ###:  ###    ###',
    '    ###:       :###  ###   ###  ###    ###   :###     ###  ###:::###  ###   ###    ###',
    '    ####       ####  ###   ###  ###    ###   :###     ###  #########  ###   ###    ###',
    '    ####       ####  ###   ###  ###    ###   :###     ###  ###        ###   ###    ###',
    '     ###       ###   ###   ###  ###    ###   :###     ###  ###        ###   ###    ###',
    '     :###     ####   ###  :###  ###:   ###   :###     ###  ####   #:  ###   ###    ###',
    '      ####: :####    #########   ###::###     #####   ###   ########  ###   ###    #####',
    '       :#######:      ########    ######      #####   ###   :######   ###   ###    :####',
    '          :######      ::           ::          :             :::                    :',
    '              ###:'
  ].join('\n')
};

// Plus and times show up most in the artwork; plain minus least.
var MP_GLYPH_WEIGHTS = [['plus', 24], ['times', 20], ['equals', 16], ['divide', 15], ['plusminus', 15], ['minus', 10]];
/** Each symbol's partner: + turns into x, - grows dots into /, = grows a stroke into the plus-minus. */
var MP_SYMBOL_PARTNERS = { plus: 'times', times: 'plus', minus: 'divide', divide: 'minus', equals: 'plusminus', plusminus: 'equals' };

function mpPickGlyph(v) {
  var total = 0, i;
  for (i = 0; i < MP_GLYPH_WEIGHTS.length; i++) total += MP_GLYPH_WEIGHTS[i][1];
  var r = v * total;
  for (i = 0; i < MP_GLYPH_WEIGHTS.length; i++) { r -= MP_GLYPH_WEIGHTS[i][1]; if (r < 0) return MP_GLYPH_WEIGHTS[i][0]; }
  return 'plus';
}

/**
 * Lay a shape out as a grid of symbols. `shape` is a preset name or ASCII
 * art; shared indentation and blank edge lines are trimmed. Every cell draws
 * both numbers, filled or not, so editing one part of a shape never
 * reshuffles the rest.
 * @returns {{columns: number, rows: number, cells: Array<{column: number, row: number, glyph: string}>}}
 */
function mpSymbolLayout(shape, seed) {
  var src = MP_SYMBOL_SHAPES[shape] !== undefined ? MP_SYMBOL_SHAPES[shape] : String(shape || '');
  var lines = src.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  var indent = Infinity;
  lines.forEach(function (l) { if (l.trim()) indent = Math.min(indent, l.length - l.replace(/^\s+/, '').length); });
  if (!isFinite(indent)) indent = 0;
  lines = lines.map(function (l) { return l.slice(indent).replace(/\s+$/, ''); });
  var rnd = mpHandRandom(seed === undefined ? (MP_SYMBOL_SHAPES[shape] !== undefined ? shape : src) : seed);
  var cells = [], columns = 0;
  lines.forEach(function (line, row) {
    columns = Math.max(columns, line.length);
    for (var c = 0; c < line.length; c++) {
      var keep = rnd(), pick = rnd(), ch = line[c];
      if (ch === '#' || (ch === ':' && keep < 0.5)) cells.push({ column: c, row: row, glyph: mpPickGlyph(pick) });
    }
  });
  return { columns: columns, rows: lines.length, cells: cells };
}

/**
 * One symbol as SVG markup inside a 16 x 16 box, `progress` of the way to
 * its partner (0 = itself, 1 = the partner). Stroke and fill come from the
 * enclosing <svg>. + and x turn 135 degrees, so the flip has a swing to it.
 */
function mpSymbolGlyphSvg(glyph, progress) {
  var p = progress > 0 ? Math.min(1, progress) : 0;
  var H = '<line x1="3.5" y1="8" x2="12.5" y2="8"/>', V = '<line x1="8" y1="3.5" x2="8" y2="12.5"/>';
  var U = '<line x1="3.5" y1="6.5" x2="12.5" y2="6.5"/>', L = '<line x1="3.5" y1="11.5" x2="12.5" y2="11.5"/>';
  if (glyph === 'plus' || glyph === 'times') {
    return '<g transform="rotate(' + ((glyph === 'plus' ? 0 : 45) + 135 * p).toFixed(1) + ' 8 8)">' + H + V + '</g>';
  }
  if (glyph === 'minus' || glyph === 'divide') {
    var r = Math.max(0, 1.2 * (glyph === 'minus' ? p : 1 - p));
    return '<g>' + H + (r > 0.01 ? '<circle cx="8" cy="4.2" r="' + r.toFixed(2) + '" stroke="none"/><circle cx="8" cy="11.8" r="' + r.toFixed(2) + '" stroke="none"/>' : '') + '</g>';
  }
  var a = glyph === 'equals' ? p : 1 - p;
  return '<g>' + U + L + (a > 0.03 ? '<line x1="8" y1="2.5" x2="8" y2="' + (2.5 + 7 * a).toFixed(2) + '"/>' : '') + '</g>';
}

/**
 * The cursive squiggle: a run of slanted "e" loops like a signature, as a
 * smooth path in its own units (about 18 tall), with a padded box.
 * @returns {{d: string, box: {x: number, y: number, w: number, h: number}, stroke: number}}
 */
function mpSquigglePath(loops, seed) {
  var count = Math.max(1, Math.round(loops || 3));
  var rnd = mpHandRandom(String(seed || 'squiggle'));
  var wob = function (a) { return (rnd() * 2 - 1) * a; };
  var ADV = 31.6 / (2 * Math.PI), HW = 13.65, HH = 9.4, SLANT = 0.14, STEPS = 8, STROKE = 3.45;
  var shapes = [];
  for (var i = 0; i < count; i++) shapes.push({ hw: HW * (1 + wob(0.08)), hh: HH * (1 + wob(0.1)), lift: wob(0.9) });
  var blend = function (t) {
    var pos = Math.min(Math.max((t - Math.PI) / (2 * Math.PI), 0), shapes.length - 1);
    var k = Math.floor(pos), n = Math.min(k + 1, shapes.length - 1), m = (1 - Math.cos((pos - k) * Math.PI)) / 2;
    var a = shapes[k], b = shapes[n];
    return { hw: a.hw + (b.hw - a.hw) * m, hh: a.hh + (b.hh - a.hh) * m, lift: a.lift + (b.lift - a.lift) * m };
  };
  var pts = [];
  for (var s = 0; s <= count * STEPS; s++) {
    var t = (s / STEPS) * 2 * Math.PI, sh = blend(t);
    var x = ADV * t + sh.hw * Math.sin(t), y = sh.hh * Math.cos(t) + sh.lift;
    pts.push([x - SLANT * y, y]);
  }
  var f = pts[0], l = pts[pts.length - 1];
  pts.unshift([f[0] - 9 + wob(1.5), f[1] + 2.4 + wob(0.6)]);
  pts.push([l[0] + 7 + wob(1.5), l[1] - 1.6 + wob(0.6)]);
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var d = 'M' + r2(pts[0][0]) + ' ' + r2(pts[0][1]);
  for (var j = 0; j < pts.length - 1; j++) {
    var b0 = pts[Math.max(j - 1, 0)], p0 = pts[j], p1 = pts[j + 1], a1 = pts[Math.min(j + 2, pts.length - 1)];
    d += 'C' + r2(p0[0] + (p1[0] - b0[0]) / 6) + ' ' + r2(p0[1] + (p1[1] - b0[1]) / 6) + ' ' +
      r2(p1[0] - (a1[0] - p0[0]) / 6) + ' ' + r2(p1[1] - (a1[1] - p0[1]) / 6) + ' ' + r2(p1[0]) + ' ' + r2(p1[1]);
  }
  var pad = STROKE * 1.5, xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
  var x0 = Math.min.apply(null, xs) - pad, y0 = Math.min.apply(null, ys) - pad;
  return { d: d, box: { x: x0, y: y0, w: Math.max.apply(null, xs) + pad - x0, h: Math.max.apply(null, ys) + pad - y0 }, stroke: STROKE };
}

/**
 * The worn paper edge: an SVG filter that bites a panel's edges a pixel or
 * two, like handled construction paper. Put it on the colored layer only,
 * never on the content, so text stays crisp.
 * @returns {string} an <svg> holding <filter id="{id}">.
 */
function mpWornEdgeFilterSvg(id, seed, scale) {
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="' + id + '" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="2" seed="' + (Number(seed) || 7) + '"/>' +
    '<feDisplacementMap in="SourceGraphic" scale="' + (Number(scale) || 4) + '" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
}

/**
 * Build a symbol field into `container` as one <svg>: a cell per symbol,
 * `cell` px square, drawn in `color` with the rebrand's stroke (1.7 in the
 * 16-unit box, round caps). Returns the cells so a component can show,
 * hide and flip them from its own clock.
 * @returns {{svg: SVGSVGElement, width: number, height: number, columns: number, rows: number,
 *   cells: Array<{g: SVGGElement, glyph: string, column: number, row: number, flip: function(number)}>}}
 */
function mpBuildSymbolField(container, opts) {
  var o = opts || {};
  var lay = mpSymbolLayout(o.shape || 'cluster', o.seed);
  var cell = o.cell > 0 ? o.cell : 14;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + lay.columns * 16 + ' ' + lay.rows * 16);
  svg.setAttribute('width', String(lay.columns * cell));
  svg.setAttribute('height', String(lay.rows * cell));
  svg.setAttribute('fill', o.color || 'currentColor');
  svg.setAttribute('stroke', o.color || 'currentColor');
  svg.setAttribute('stroke-width', String(o.stroke || 1.7));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.overflow = 'visible';
  var cells = lay.cells.map(function (c) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(' + c.column * 16 + ' ' + c.row * 16 + ')');
    g.innerHTML = mpSymbolGlyphSvg(c.glyph, 0);
    svg.appendChild(g);
    var last = 0;
    return { g: g, glyph: c.glyph, column: c.column, row: c.row,
      flip: function (p) { if (p !== last) { last = p; g.innerHTML = mpSymbolGlyphSvg(c.glyph, p); } } };
  });
  container.appendChild(svg);
  return { svg: svg, width: lay.columns * cell, height: lay.rows * cell, columns: lay.columns, rows: lay.rows, cells: cells };
}

/**
 * The symbol flips, as a pure function of time: every `every` seconds a few
 * symbols (about `share` of them) turn into their partners in three poses on
 * twos, and turn back the next time they are picked. Call it from a clock
 * with the time; any seek draws the same frame.
 */
function mpSymbolFlips(cells, t, opts) {
  var o = opts || {};
  var every = o.every > 0 ? o.every : 0.8, share = o.share > 0 ? o.share : 0.14, from = o.from || 0, seed = o.seed || 'flip';
  var POSE = 1 / 15, POSES = 3;
  var c = t < from ? -1 : Math.floor((t - from) / every);
  for (var i = 0; i < cells.length; i++) {
    var on = 0, p = 0;
    for (var k = 0; k <= c; k++) {
      if (mpHandRandom(seed + ':' + i + ':' + k)() < share) {
        var into = t - (from + k * every);
        var pose = Math.min(POSES, Math.floor(into / POSE) + 1);
        if (k === c && pose < POSES) { p = on ? 1 - pose / POSES : pose / POSES; on = -1; break; }
        on = 1 - on;
      }
    }
    cells[i].flip(on === -1 ? p : on);
  }
}

/**
 * The logo mark drawn in symbols (the rebrand's markFormation): a cell is a
 * symbol when its centre falls inside the half-circle (minus the hole, cut a
 * little small since a symbol only fills the middle of its box) or the dot.
 * Centred on `cx`, `cy`, `height` px tall, `cell` px per symbol.
 * @returns {{points: Array<{x: number, y: number, size: number, glyph: string, across: number, down: number}>, dot: {x: number, y: number}}}
 */
function mpMarkFormation(cx, cy, height, cell, seed) {
  var MW = 147.24, MH = 166.32, EDGE = 86.98, CY = 83.16, R = 83.16;
  var HOLE = { x: 44.74, y: 83.16, r: 19.46 }, DOT = { x: 126.48, y: 83.16, r: 20.76 };
  var k = height / MH, left = cx - MW * k / 2, top = cy - height / 2;
  var cols = Math.ceil(MW * k / cell), rows = Math.ceil(height / cell), c = cell / k;
  var lines = [];
  for (var r = 0; r < rows; r++) {
    var line = '';
    for (var q = 0; q < cols; q++) {
      var x = (q + 0.5) * c, y = (r + 0.5) * c;
      var inHalf = x <= EDGE && (x - EDGE) * (x - EDGE) + (y - CY) * (y - CY) <= R * R;
      var hr = HOLE.r - 0.4 * c;
      var inHole = (x - HOLE.x) * (x - HOLE.x) + (y - HOLE.y) * (y - HOLE.y) <= hr * hr;
      var inDot = (x - DOT.x) * (x - DOT.x) + (y - DOT.y) * (y - DOT.y) <= DOT.r * DOT.r;
      line += (inHalf && !inHole) || inDot ? '#' : '.';
    }
    lines.push(line);
  }
  var lay = mpSymbolLayout(lines.join('\n'), seed);
  return {
    points: lay.cells.map(function (p) {
      return { x: left + (p.column + 0.5) * cell, y: top + (p.row + 0.5) * cell, size: cell, glyph: p.glyph, across: p.column / cols, down: p.row / rows };
    }),
    dot: { x: left + DOT.x * k, y: top + DOT.y * k }
  };
}
