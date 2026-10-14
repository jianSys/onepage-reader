// Shared e-ink bitmap pipeline: canvas → 1-bit / 4-level(2bpp) BMP encoders plus
// the grayscale-quantize / dither / tone post-processing used by the Card Studio
// and the standalone Image→BMP / wallpaper tools. All ctx-based helpers derive
// their dimensions from the canvas itself, so they work for any size.
//
// The BMP layouts match the reader's Bitmap.cpp parser: 'BM' + 40-byte
// BITMAPINFOHEADER, BI_RGB, rows padded to 4 bytes, MSB-first, bottom-up.

// Encode an (already 1-bit) canvas into a monochrome BMP the reader accepts
// directly: bpp=1, 2-entry palette (black/white).
export function canvasToBitmap1Bit(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  const { data } = ctx.getImageData(0, 0, w, h);

  const rowBytes = Math.ceil(w / 8);
  const stride = Math.ceil(rowBytes / 4) * 4;
  const pixelArraySize = stride * h;
  const offBits = 14 + 40 + 8;
  const fileSize = offBits + pixelArraySize;

  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint8(0, 0x42);
  dv.setUint8(1, 0x4d);
  dv.setUint32(2, fileSize, true);
  dv.setUint32(6, 0, true);
  dv.setUint32(10, offBits, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 1, true);
  dv.setUint32(30, 0, true);
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 0, true);
  dv.setInt32(42, 0, true);
  dv.setUint32(46, 2, true);
  dv.setUint32(50, 2, true);
  dv.setUint32(54, 0x00000000, true);
  dv.setUint32(58, 0x00ffffff, true);

  for (let y = 0; y < h; y++) {
    const dst = offBits + (h - 1 - y) * stride;
    for (let xb = 0; xb < rowBytes; xb++) u8[dst + xb] = 0;
    const src = y * w;
    for (let x = 0; x < w; x++) {
      const i = (src + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 127) u8[dst + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

// Encode an (already 4-level-quantized) canvas as a 2bpp grayscale BMP the reader
// decodes natively: 4-entry gray palette (0=black,1=dark,2=light,3=white),
// 4 px/byte MSB-first, bottom-up.
export function canvasToBitmap4Gray(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  const { data } = ctx.getImageData(0, 0, w, h);

  const rowBytes = Math.ceil((w * 2) / 8);
  const stride = Math.ceil(rowBytes / 4) * 4;
  const pixelArraySize = stride * h;
  const offBits = 14 + 40 + 4 * 4;
  const fileSize = offBits + pixelArraySize;

  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint8(0, 0x42);
  dv.setUint8(1, 0x4d);
  dv.setUint32(2, fileSize, true);
  dv.setUint32(6, 0, true);
  dv.setUint32(10, offBits, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 2, true); // bpp = 2
  dv.setUint32(30, 0, true);
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 0, true);
  dv.setInt32(42, 0, true);
  dv.setUint32(46, 4, true);
  dv.setUint32(50, 4, true);

  const grays = [0, 85, 170, 255];
  for (let i = 0; i < 4; i++) {
    const o = 54 + i * 4;
    u8[o] = grays[i];
    u8[o + 1] = grays[i];
    u8[o + 2] = grays[i];
    u8[o + 3] = 0;
  }

  for (let y = 0; y < h; y++) {
    const dst = offBits + (h - 1 - y) * stride;
    for (let xb = 0; xb < rowBytes; xb++) u8[dst + xb] = 0;
    const srcRow = y * w;
    for (let x = 0; x < w; x++) {
      const i = (srcRow + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const idx = lum < 42.5 ? 0 : lum < 127.5 ? 1 : lum < 212.5 ? 2 : 3;
      u8[dst + (x >> 2)] |= idx << (6 - (x & 3) * 2);
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

// Snap the canvas to exactly 4 gray levels (0/85/170/255) so the preview matches
// the 2bpp BMP the encoder writes. Thresholds are midpoints between the levels.
export function quantize4(ctx: CanvasRenderingContext2D) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = lum < 42.5 ? 0 : lum < 127.5 ? 85 : lum < 212.5 ? 170 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Floyd–Steinberg error-diffusion dither to 1-bit.
export function floydSteinberg(ctx: CanvasRenderingContext2D) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const old = gray[i];
      const val = old < 128 ? 0 : 255;
      const err = old - val;
      gray[i] = val;
      const spread = (nx: number, ny: number, f: number) => {
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
        gray[ny * W + nx] += err * f;
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }
  for (let i = 0; i < W * H; i++) {
    const v = gray[i] < 128 ? 0 : 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Build an n×n (n = power of two) Bayer threshold matrix algorithmically.
function makeBayer(n: number): number[][] {
  let m = [[0]];
  let size = 1;
  while (size < n) {
    const next = Array.from({ length: size * 2 }, () => new Array(size * 2).fill(0));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const q = m[y][x];
        next[y][x] = 4 * q;
        next[y + size][x + size] = 4 * q + 1;
        next[y][x + size] = 4 * q + 2;
        next[y + size][x] = 4 * q + 3;
      }
    }
    m = next;
    size *= 2;
  }
  return m;
}
const BAYER8 = makeBayer(8);

// Ordered (Bayer) 1-bit dither.
export function bayerDither(ctx: CanvasRenderingContext2D) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const g = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const t = ((BAYER8[y & 7][x & 7] + 0.5) / 64) * 255;
      const v = g > t ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Plain threshold to 1-bit (no dithering).
export function hardThreshold(ctx: CanvasRenderingContext2D) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 > 127 ? 255 : 0;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Brightness (-100..100) + contrast (-100..100) tone adjustment.
export function applyTone(ctx: CanvasRenderingContext2D, br: number, co: number) {
  if (!br && !co) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cFac = 1 + co / 100;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      let v = d[i + k] + br * 2.55;
      v = (v - 128) * cFac + 128;
      d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(img, 0, 0);
}
