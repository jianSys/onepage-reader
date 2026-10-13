// Shared drawing primitives + types for card templates. No imports here, so both
// templates.ts (the draws) and studio.ts (the pipeline) can depend on it without
// a circular import. Everything is plain canvas 2D on the fixed 480×800 panel.

export const W = 480;
export const H = 800;
export const INK = '#111111';
export const SERIF = "Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', serif";

// The read-only view a draw function needs. studio.ts's State satisfies this shape.
export interface CardView {
  content: string;
  sub: string;
  items: string[];
  lang: string;
  weather?: WeatherData;
  /** Uploaded image for the photo template (null until the user picks one). */
  image?: HTMLImageElement | null;
}

export interface WeatherData {
  place: string;
  temp: number;
  code: number;
  days: { label: string; hi: number; lo: number; code: number }[];
}

export type CategoryId =
  | 'time'
  | 'count'
  | 'text'
  | 'list'
  | 'data'
  | 'photo'
  | 'office'
  | 'plan'
  | 'ink'
  | 'poster'
  | 'astro';

export interface TemplateDef {
  id: string;
  category: CategoryId;
  draw: (ctx: CanvasRenderingContext2D, v: CardView) => void;
  /** Whether the "Lines" (items) field applies to this template. */
  items?: boolean;
  /** Live templates (clock/date) re-render every second while selected. */
  live?: boolean;
}

// ── Text helpers ────────────────────────────────────────────────────────────

export function isCJK(ch: string): boolean {
  const cp = ch.codePointAt(0) || 0;
  return (
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0x20000 && cp <= 0x2ebef)
  );
}

// Tokenize into unbreakable units: whole Latin words vs. single CJK glyphs.
export function tokenize(text: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const ch of text) {
    if (ch === '\n') {
      if (word) out.push(word), (word = '');
      out.push('\n');
    } else if (ch === ' ') {
      if (word) out.push(word), (word = '');
      out.push(' ');
    } else if (isCJK(ch)) {
      if (word) out.push(word), (word = '');
      out.push(ch);
    } else {
      word += ch;
    }
  }
  if (word) out.push(word);
  return out;
}

// Greedy line-break within maxWidth; honors explicit newlines.
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let line = '';
  for (const tk of tokens) {
    if (tk === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const trial = line + tk;
    if (ctx.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line.replace(/ +$/, ''));
      line = tk === ' ' ? '' : tk;
    } else {
      line = trial;
    }
  }
  lines.push(line.replace(/ +$/, ''));
  return lines.filter((l, i) => l !== '' || i === 0 || lines.length === 1);
}

// Pick the largest font size (down to min) whose wrapped text fits boxH.
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  boxH: number,
  basePx: number,
  lineGap: number,
  minPx = 18
): { size: number; lines: string[] } {
  let size = basePx;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    ctx.font = `${size}px ${SERIF}`;
    const lines = wrapLines(ctx, text, maxWidth);
    const height = lines.length * size * lineGap;
    if (height <= boxH || size <= minPx) return { size, lines };
    size = Math.max(minPx, Math.floor(size * 0.9));
  }
}

// Auto-shrink a single line to fit maxWidth.
export function fitSingleLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, basePx: number, minPx = 20): number {
  let size = basePx;
  ctx.font = `${size}px ${SERIF}`;
  while (ctx.measureText(text).width > maxWidth && size > minPx) {
    size -= Math.max(1, Math.floor(size * 0.05));
    ctx.font = `${size}px ${SERIF}`;
  }
  return size;
}

// ── Structural helpers ────────────────────────────────────────────────────────

export function headerRule(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, y);
  ctx.lineTo(W - 48, y);
  ctx.stroke();
}

export function footerDate(ctx: CanvasRenderingContext2D, sub: string) {
  ctx.fillStyle = INK;
  ctx.font = `22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(sub || today(), W / 2, H - 40);
  ctx.textAlign = 'left';
}

const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function today(lang = 'en'): string {
  const d = new Date();
  const wd = lang === 'zh' ? WD_ZH : WD_EN;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} · ${wd[d.getDay()]}`;
}

// ── Weather icon ────────────────────────────────────────────────────────────

export function wxInfo(code: number): { t: string; icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm' } {
  if (code === 0) return { t: 'Clear', icon: 'sun' };
  if (code <= 3) return { t: 'Partly cloudy', icon: 'cloud' };
  if (code <= 48) return { t: 'Fog', icon: 'fog' };
  if (code <= 67) return { t: 'Rain', icon: 'rain' };
  if (code <= 77) return { t: 'Snow', icon: 'snow' };
  if (code <= 82) return { t: 'Showers', icon: 'rain' };
  if (code <= 86) return { t: 'Snow', icon: 'snow' };
  return { t: 'Thunder', icon: 'storm' };
}

export function drawWeatherIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  if (kind === 'sun') {
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  } else if (kind === 'cloud') {
    cloudPath(ctx, cx, cy, r);
    ctx.stroke();
  } else if (kind === 'rain' || kind === 'storm') {
    cloudPath(ctx, cx, cy - r * 0.15, r * 0.9);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * r * 0.45;
      ctx.beginPath();
      ctx.moveTo(x, cy + r * 0.4);
      ctx.lineTo(x - r * 0.12, cy + r * 0.8);
      ctx.stroke();
    }
  } else if (kind === 'snow') {
    cloudPath(ctx, cx, cy - r * 0.15, r * 0.9);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * r * 0.45;
      ctx.beginPath();
      ctx.arc(x, cy + r * 0.6, r * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.2 + i * r * 0.35);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.2 + i * r * 0.35);
      ctx.stroke();
    }
  }
}

function cloudPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.moveTo(cx - r * 0.6, cy + r * 0.3);
  ctx.arc(cx - r * 0.4, cy, r * 0.4, Math.PI, 0);
  ctx.arc(cx + r * 0.05, cy - r * 0.2, r * 0.5, Math.PI, 0);
  ctx.arc(cx + r * 0.5, cy + r * 0.05, r * 0.35, Math.PI * 1.6, Math.PI * 0.1);
  ctx.closePath();
}

// ── Small shape helpers (used by new templates) ───────────────────────────────

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function centeredText(ctx: CanvasRenderingContext2D, sizePx: number, y: number, text: string, italic = false) {
  ctx.fillStyle = INK;
  ctx.font = `${italic ? 'italic ' : ''}${sizePx}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, y);
  ctx.textAlign = 'left';
}

// Draw a run of CJK glyphs top-to-bottom in one column (classical vertical
// writing). Returns the y after the last glyph so callers can stack columns.
export function verticalRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  sizePx: number,
  gapPx = 6,
  maxChars = 40
): number {
  ctx.font = `${sizePx}px ${SERIF}`;
  let y = startY + sizePx;
  let n = 0;
  for (const ch of text) {
    if (n >= maxChars) break;
    if (ch === '\n' || ch === ' ') {
      y += sizePx * 0.4;
      continue;
    }
    ctx.fillText(ch, x, y);
    y += sizePx + gapPx;
    n++;
  }
  return y;
}
