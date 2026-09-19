/**
 * A small QR encoder (byte mode, error correction L, versions 1-20) that
 * renders to SVG: the phone code for a take link (SPEC-briefs.md, the
 * sources). No dependency: the link carries the tenant's token and must
 * never leave this server to be drawn.
 */

// Per version (index = version): total codewords, EC codewords per block,
// then the block groups as [count, dataCodewords] pairs. ECC level L.
const VERSIONS: Array<[number, number, Array<[number, number]>]> = [
  [0, 0, []],
  [26, 7, [[1, 19]]], [44, 10, [[1, 34]]], [70, 15, [[1, 55]]], [100, 20, [[1, 80]]], [134, 26, [[1, 108]]],
  [172, 18, [[2, 68]]], [196, 20, [[2, 78]]], [242, 24, [[2, 97]]], [292, 30, [[2, 116]]], [346, 18, [[2, 68], [2, 69]]],
  [404, 20, [[4, 81]]], [466, 24, [[2, 92], [2, 93]]], [532, 26, [[4, 107]]], [581, 30, [[3, 115], [1, 116]]], [655, 22, [[5, 87], [1, 88]]],
  [733, 24, [[5, 98], [1, 99]]], [815, 28, [[1, 107], [5, 108]]], [901, 30, [[5, 120], [1, 121]]], [991, 28, [[3, 113], [4, 114]]], [1085, 28, [[3, 107], [5, 108]]],
];
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];

// GF(256) with the QR polynomial 0x11d.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function rsEncode(data: number[], n: number): number[] {
  const g = rsGenerator(n);
  const out = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ out.shift()!;
    out.push(0);
    if (f) for (let j = 0; j < n; j++) out[j] ^= gmul(g[j + 1], f);
  }
  return out;
}
function bch(value: number, poly: number, bits: number, dataBits: number): number {
  let v = value << (bits - dataBits);
  for (let i = dataBits - 1; i >= 0; i--) if (v & (1 << (i + bits - dataBits))) v ^= poly << i;
  return (value << (bits - dataBits)) | v;
}

/** The module matrix (true = dark) for text encoded in byte mode, ECC L. */
export function qrMatrix(text: string, opts: { mask?: number } = {}): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  for (let v = 1; v < VERSIONS.length; v++) {
    const dataCw = VERSIONS[v][2].reduce((a, [c, d]) => a + c * d, 0);
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (bytes.length * 8 + headerBits <= dataCw * 8) { version = v; break; }
  }
  if (!version) throw new Error("QR: text too long for version 20 at ECC L");
  const [total, ecPerBlock, groups] = VERSIONS[version];
  const dataCw = groups.reduce((a, [c, d]) => a + c * d, 0);
  // Bit stream: mode 0100, count, bytes, terminator, pad to codewords.
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0; cw.length < dataCw; p++) cw.push(p % 2 ? 0x11 : 0xec);
  // Blocks + interleave.
  const blocks: number[][] = [], ecs: number[][] = [];
  let off = 0;
  for (const [count, len] of groups) for (let i = 0; i < count; i++) { const d = cw.slice(off, off + len); off += len; blocks.push(d); ecs.push(rsEncode(d, ecPerBlock)); }
  const seq: number[] = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) seq.push(b[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const e of ecs) seq.push(e[i]);
  if (seq.length !== total) throw new Error("QR: codeword count mismatch");
  // Matrix + function patterns.
  const N = 17 + 4 * version;
  const m: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false));
  const fn: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (r: number, c: number, v: boolean) => { m[r][c] = v; fn[r][c] = true; };
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      const dark = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(rr, cc, dark);
    }
  };
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  const al = ALIGN[version];
  for (const r of al) for (const c of al) {
    if (fn[r][c]) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  set(N - 8, 8, true); // dark module
  // Reserve format areas.
  for (let i = 0; i < 8; i++) { fn[8][i] = true; fn[i][8] = true; fn[8][N - 1 - i] = true; fn[N - 1 - i][8] = true; }
  fn[8][8] = true;
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fn[i][N - 11 + j] = true; fn[N - 11 + j][i] = true; }
  // Place data.
  const dataBits: number[] = [];
  for (const c of seq) for (let i = 7; i >= 0; i--) dataBits.push((c >> i) & 1);
  let bi = 0, up = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < N; k++) {
      const r = up ? N - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (fn[r][c]) continue;
        m[r][c] = bi < dataBits.length ? dataBits[bi] === 1 : false; bi++;
      }
    }
    up = !up;
  }
  // Mask: try all eight, keep the lowest penalty.
  const masks = [
    (r: number, c: number) => (r + c) % 2 === 0, (r: number) => r % 2 === 0, (_r: number, c: number) => c % 3 === 0, (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  let best: boolean[][] | null = null, bestPen = Infinity;
  for (let mi = 0; mi < 8; mi++) {
    if (opts.mask !== undefined && mi !== opts.mask) continue;
    const g = m.map((row) => row.slice());
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!fn[r][c] && masks[mi](r, c)) g[r][c] = !g[r][c];
    writeFormat(g, N, mi);
    if (version >= 7) writeVersion(g, N, version);
    const pen = penalty(g, N);
    if (pen < bestPen) { bestPen = pen; best = g; }
  }
  return best!;
}
function writeFormat(g: boolean[][], N: number, mask: number): void {
  const f = bch((0b01 << 3) | mask, 0x537, 15, 5) ^ 0x5412; // ECC L = 01
  const bit = (i: number) => ((f >> i) & 1) === 1;
  // g[row][col]. First copy: down column 8 beside the top-left finder, then
  // along row 8; second copy: along row 8 at the right, down column 8 at
  // the bottom.
  for (let i = 0; i < 6; i++) g[i][8] = bit(i);
  g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8);
  for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) g[8][N - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) g[N - 15 + i][8] = bit(i);
}
function writeVersion(g: boolean[][], N: number, version: number): void {
  const v = bch(version, 0x1f25, 18, 6);
  for (let i = 0; i < 18; i++) { const b = ((v >> i) & 1) === 1; g[Math.floor(i / 3)][N - 11 + (i % 3)] = b; g[N - 11 + (i % 3)][Math.floor(i / 3)] = b; }
}
function penalty(g: boolean[][], N: number): number {
  let p = 0;
  const run = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < N; i++) { let last = get(i, 0), n = 1; for (let j = 1; j < N; j++) { const v = get(i, j); if (v === last) { n++; if (n === 5) p += 3; else if (n > 5) p++; } else { last = v; n = 1; } } }
  };
  run((i, j) => g[i][j]); run((i, j) => g[j][i]);
  for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) { const v = g[r][c]; if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) p += 3; }
  let dark = 0; for (const row of g) for (const v of row) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5) * 10;
  return p;
}

/** The code as an SVG string, quiet zone included. */
export function qrSvg(text: string, opts: { size?: number; fg?: string; bg?: string } = {}): string {
  const m = qrMatrix(text);
  const N = m.length, q = 4, size = opts.size || 320;
  let d = "";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N + 2 * q} ${N + 2 * q}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${opts.bg || "#fff"}"/><path d="${d}" fill="${opts.fg || "#17171b"}"/></svg>`;
}
