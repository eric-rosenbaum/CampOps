/**
 * A self-contained QR Code encoder.
 *
 * We print these on stickers that go on cabin doors, so the encoder has to be here rather than
 * behind a CDN: the print sheet has to render identically offline, in a camp office with bad wifi,
 * a year from now. It is also the only place in the app that needs QR at all, which does not
 * justify a dependency.
 *
 * This is a byte-mode-only port of Project Nayuki's QR Code generator (MIT licensed), which is the
 * reference implementation nearly everything else is derived from. Byte mode only because our
 * payload is always a URL; alphanumeric mode would encode a shade smaller but only for
 * uppercase-and-digits strings, which ours are not.
 *
 * The output is a boolean matrix, `true` meaning a dark module. Rendering is the caller's problem
 * (see qrToSvgPath), because SVG is the right output for print and a canvas is the right one for
 * screen preview.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

/** Error-correction level as the 2-bit value the format information carries. */
const ECL_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
/** Index into the two tables below. */
const ECL_ORDINAL: Record<EcLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// Indexed [eclOrdinal][version]; index 0 of each row is unused padding so version numbers are
// their own index.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 5, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export interface QrMatrix {
  /** Width and height in modules, including the function patterns but excluding the quiet zone. */
  size: number;
  /** Row-major; `get(x, y)` is `modules[y][x]`, true meaning dark. */
  modules: boolean[][];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encode `text` as a QR matrix, choosing the smallest version that fits.
 *
 * Defaults to level Q (~25% recoverable) rather than the more common M, because these are printed
 * on things that get rained on, scuffed by a screen door and written on with a marker. The size
 * cost at our payload length is one version.
 */
export function encodeQr(text: string, ecl: EcLevel = 'Q'): QrMatrix {
  const data = utf8Bytes(text);
  const version = chooseVersion(data.length, ecl);
  const dataCodewords = buildDataCodewords(data, version, ecl);
  const allCodewords = addEccAndInterleave(dataCodewords, version, ecl);
  return renderMatrix(allCodewords, version, ecl);
}

/**
 * The matrix as a single SVG path `d` string, one `M…h…v…h…z` subpath per dark module, in a
 * coordinate space of `size + 2 * quietZone` units.
 *
 * One path rather than a grid of <rect>s keeps the printable sheet small enough that a browser
 * will lay out a page of forty of them without stalling.
 */
export function qrToSvgPath(qr: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`);
    }
  }
  return parts.join('');
}

/** Convenience: a complete standalone `<svg>` string, sized in user units. */
export function qrToSvg(text: string, opts: { ecl?: EcLevel; quietZone?: number; dark?: string } = {}): string {
  const quietZone = opts.quietZone ?? 4;
  const qr = encodeQr(text, opts.ecl ?? 'Q');
  const extent = qr.size + quietZone * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">` +
    `<rect width="${extent}" height="${extent}" fill="#fff"/>` +
    `<path d="${qrToSvgPath(qr, quietZone)}" fill="${opts.dark ?? '#000'}"/>` +
    `</svg>`
  );
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Byte mode's character-count field widens at version 10. */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function chooseVersion(byteLen: number, ecl: EcLevel): number {
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const capacityBits = getNumDataCodewords(v, ecl) * 8;
    const neededBits = 4 + charCountBits(v) + byteLen * 8;
    if (neededBits <= capacityBits) return v;
  }
  throw new Error(`Data of ${byteLen} bytes is too long for a QR code at level ${ecl}`);
}

function buildDataCodewords(data: number[], version: number, ecl: EcLevel): number[] {
  const bits: number[] = [];
  const append = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  append(0b0100, 4); // byte mode
  append(data.length, charCountBits(version));
  for (const b of data) append(b, 8);

  const capacityBits = getNumDataCodewords(version, ecl) * 8;
  // Terminator, then pad to a whole codeword, then the alternating pad bytes the spec names.
  append(0, Math.min(4, capacityBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

/** Total module count available for data and ECC, before the function patterns are subtracted. */
function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number, ecl: EcLevel): number {
  const o = ECL_ORDINAL[ecl];
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[o][version] * NUM_ERROR_CORRECTION_BLOCKS[o][version]
  );
}

// ─── Reed–Solomon ─────────────────────────────────────────────────────────────

/** Multiply in GF(256) modulo the QR primitive polynomial x^8 + x^4 + x^3 + x^2 + 1. */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Coefficients of the generator polynomial of the given degree, highest power omitted. */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

/**
 * Split the data into blocks, compute each block's ECC, then interleave.
 *
 * The interleave is two distinct phases, and conflating them is the classic way to produce a
 * symbol that looks perfectly well-formed and decodes as nothing: *every* block's data is
 * interleaved first, and only then is every block's ECC interleaved after it. Blocks come in two
 * lengths (the longer ones last), so the data phase simply skips blocks that have run out.
 */
function addEccAndInterleave(data: readonly number[], version: number, ecl: EcLevel): number[] {
  const o = ECL_ORDINAL[ecl];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[o][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[o][version];
  const numDataCodewords = getNumDataCodewords(version, ecl);
  const numLongBlocks = numDataCodewords % numBlocks;
  const shortDataLen = Math.floor(numDataCodewords / numBlocks);

  const divisor = rsDivisor(blockEccLen);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortDataLen + (i >= numBlocks - numLongBlocks ? 1 : 0);
    const dat = data.slice(k, k + len);
    k += len;
    dataBlocks.push(dat);
    eccBlocks.push(rsRemainder(dat, divisor));
  }

  const result: number[] = [];
  const maxDataLen = shortDataLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}

// ─── Matrix ───────────────────────────────────────────────────────────────────

function renderMatrix(codewords: readonly number[], version: number, ecl: EcLevel): QrMatrix {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  drawFunctionPatterns(size, version, setFn);
  drawCodewords(codewords, size, modules, isFunction);

  // Try all eight masks and keep the one the spec's penalty rules like least. Masking exists to
  // break up runs and large blocks that confuse a scanner's binarizer, so this is not cosmetic.
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask, modules, isFunction);
    drawFormatBits(ecl, mask, size, setFn);
    const penalty = getPenaltyScore(modules, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask, modules, isFunction); // XOR is its own inverse
  }
  applyMask(bestMask, modules, isFunction);
  drawFormatBits(ecl, bestMask, size, setFn);

  return { size, modules };
}

type SetFn = (x: number, y: number, dark: boolean) => void;

function drawFunctionPatterns(size: number, version: number, setFn: SetFn): void {
  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Finder patterns, with their separators, at three corners.
  drawFinder(3, 3, size, setFn);
  drawFinder(size - 4, 3, size, setFn);
  drawFinder(3, size - 4, size, setFn);

  // Alignment patterns everywhere they do not collide with a finder.
  const positions = alignmentPatternPositions(version);
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const skipCorner = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
      if (!skipCorner) drawAlignment(positions[i], positions[j], setFn);
    }
  }

  // Format information is drawn for real later, but its modules must be reserved now so the data
  // placement walk skips them. Mask 0 here is a placeholder.
  drawFormatBits('L', 0, size, setFn);
  drawVersionBits(version, size, setFn);
}

function drawFinder(cx: number, cy: number, size: number, setFn: SetFn): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance gives the rings
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(cx: number, cy: number, setFn: SetFn): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** 5 data bits + 10 BCH bits, XORed with 0x5412 so an all-zero format is never valid. */
function drawFormatBits(ecl: EcLevel, mask: number, size: number, setFn: SetFn): void {
  const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  // First copy, around the top-left finder.
  for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
  setFn(8, 7, bit(6));
  setFn(8, 8, bit(7));
  setFn(7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));

  // Second copy, split across the other two finders.
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
  setFn(8, size - 8, true); // the always-dark module
}

/** Versions 7 and up carry an 18-bit version block near two of the finders. */
function drawVersionBits(version: number, size: number, setFn: SetFn): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;

  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(a, b, dark);
    setFn(b, a, dark);
  }
}

/** Walk the two-module-wide zigzag from bottom-right, skipping function modules. */
function drawCodewords(
  codewords: readonly number[],
  size: number,
  modules: boolean[][],
  isFunction: readonly boolean[][],
): void {
  let i = 0; // bit index
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern column is not part of the walk
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
        // Any remaining modules stay light, which is what the spec's remainder bits amount to.
      }
    }
  }
}

function applyMask(mask: number, modules: boolean[][], isFunction: readonly boolean[][]): void {
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (isFunction[y][x]) continue;
      let invert: boolean;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: throw new Error('Unreachable mask');
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

// ─── Mask penalty scoring ─────────────────────────────────────────────────────

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function getPenaltyScore(modules: readonly boolean[][], size: number): number {
  let result = 0;

  // N1: runs of five or more same-coloured modules, in both directions.
  // N3: patterns that look like a finder pattern, counted by the same walk.
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        finderPenaltyAddHistory(runLen, history, size);
        if (!runColor) result += finderPenaltyCountPatterns(history, size) * PENALTY_N3;
        runColor = modules[y][x];
        runLen = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runLen, history, size) * PENALTY_N3;
  }
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        finderPenaltyAddHistory(runLen, history, size);
        if (!runColor) result += finderPenaltyCountPatterns(history, size) * PENALTY_N3;
        runColor = modules[y][x];
        runLen = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runLen, history, size) * PENALTY_N3;
  }

  // N2: solid 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // N4: how far the dark-module proportion strays from half.
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

function finderPenaltyAddHistory(currentRunLength: number, history: number[], size: number): void {
  if (history[0] === 0) currentRunLength += size; // the light margin beyond the edge counts
  history.pop();
  history.unshift(currentRunLength);
}

/** Count occurrences of the dark:light 1:1:3:1:1 ratio with a wide light margin on either side. */
function finderPenaltyCountPatterns(history: readonly number[], size: number): number {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (
    (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
    (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
  );
}

function finderPenaltyTerminateAndCount(
  currentRunColor: boolean,
  currentRunLength: number,
  history: number[],
  size: number,
): number {
  if (currentRunColor) {
    // Close out the dark run, then account for the light margin past the edge.
    finderPenaltyAddHistory(currentRunLength, history, size);
    currentRunLength = 0;
  }
  currentRunLength += size;
  finderPenaltyAddHistory(currentRunLength, history, size);
  return finderPenaltyCountPatterns(history, size);
}
