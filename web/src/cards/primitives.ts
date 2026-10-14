// Shared drawing primitives + types for card templates. No imports here, so both
// templates.ts (the draws) and studio.ts (the pipeline) can depend on it without
// a circular import. Everything is plain canvas 2D on the fixed 480×800 panel.

export const W = 480;
export const H = 800;
export const INK = '#111111';

// Card typefaces are rasterized into the exported BMP on the client — the device
// just shows pixels, so this is fully WYSIWYG and needs no device-side font.
// Every draw reads the `SERIF` binding at call time, so switching the font is
// just mutating this live ES-module export (zero changes to the templates).
// These stacks deliberately reuse the webfonts the site already loads (Lora,
// Noto Serif SC, JetBrains Mono) plus Playfair Display, so the cards get real
// editorial type instead of the old Georgia fallback.
export const FONT_OPTIONS: { id: string; stack: string; label: Localized }[] = [
  { id: 'serif', stack: "'Lora', 'Noto Serif SC', Georgia, 'Songti SC', serif", label: { en: 'Serif · Lora', zh: '衬线 · 宋体' } },
  { id: 'display', stack: "'Playfair Display', 'Noto Serif SC', Georgia, serif", label: { en: 'Display · Playfair', zh: '展示 · 高对比' } },
  { id: 'sans', stack: "'Helvetica Neue', Arial, 'PingFang SC', 'Noto Sans SC', sans-serif", label: { en: 'Sans', zh: '黑体 · 无衬线' } },
  { id: 'mono', stack: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace", label: { en: 'Mono', zh: '等宽' } },
  { id: 'kai', stack: "'Kaiti SC', STKaiti, KaiTi, 'Xingkai SC', 'Songti SC', cursive", label: { en: 'Kai · brush', zh: '楷体' } },
];

export let SERIF = FONT_OPTIONS[0].stack;

/** Switch the shared card font by option id; unknown ids fall back to serif. */
export function setCardFont(id: string) {
  const f = FONT_OPTIONS.find((o) => o.id === id);
  SERIF = f ? f.stack : FONT_OPTIONS[0].stack;
}

// Fixed stacks for the "designed" micro-typography (tracked uppercase labels,
// small captions). Independent of the user's body-font choice so every card
// keeps the same editorial chrome — this is what reads as "carefully set".
export const UI_MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace";
export const UI_SANS = "'Helvetica Neue', Arial, 'PingFang SC', 'Noto Sans SC', sans-serif";

// Draw `img` into the box (x,y,boxW,boxH) as a cover crop honoring an ImgFit.
// With no fit (or zoom=1, ox=oy=0.5) this is exactly the old centered cover.
export function drawImageFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  fit?: ImgFit,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const cover = Math.max(boxW / iw, boxH / ih);
  const scale = cover * (fit?.zoom ?? 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = fit?.ox ?? 0.5;
  const oy = fit?.oy ?? 0.5;
  const dx = x - (dw - boxW) * ox;
  const dy = y - (dh - boxH) * oy;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, boxW, boxH);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// The read-only view a draw function needs. studio.ts's State satisfies this shape.
export interface CardView {
  content: string;
  sub: string;
  items: string[];
  lang: string;
  weather?: WeatherData;
  /** Uploaded image for templates that declare an `image` field (null until picked). */
  image?: HTMLImageElement | null;
  /** Pan / zoom applied when fitting the uploaded image into its frame. */
  imgFit?: ImgFit;
  /** All form-field values keyed by field key (extra fields read from here). */
  values?: Record<string, string | boolean>;
}

// How an uploaded image sits in its frame: `zoom` >= 1 multiplies the cover-fit
// scale; `ox`/`oy` in [0,1] slide the image within the overflow the zoom creates
// (0.5 = centered). Default = classic centered cover crop, so templates that
// ignore it render exactly as before.
export interface ImgFit {
  zoom: number;
  ox: number;
  oy: number;
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
  | 'travel'
  | 'transit'
  | 'plan'
  | 'ink'
  | 'nature'
  | 'art'
  | 'poster'
  | 'music'
  | 'astro'
  | 'divination'
  | 'puzzle';

// A single editor control declared by a template. Bilingual labels live here so
// the form is fully data-driven — the editor renders any `fields` array generically.
export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'checkbox' | 'image';

export interface Localized {
  en: string;
  zh: string;
}

export interface CardField {
  key: string;
  type: FieldType;
  label: Localized;
  placeholder?: Localized;
  /** Mirror this field's value into the legacy CardView slot (content/sub/items). */
  role?: 'content' | 'sub' | 'items';
  /** For `select`: the dropdown options. */
  options?: { value: string; label: Localized }[];
  /** Only show this field when another field equals a given value. */
  showWhen?: { key: string; equals: string | boolean };
}

export interface TemplateDef {
  id: string;
  category: CategoryId;
  draw: (ctx: CanvasRenderingContext2D, v: CardView) => void;
  /** Whether the "Lines" (items) field applies to this template. */
  items?: boolean;
  /** Live templates (clock/date) re-render every second while selected. */
  live?: boolean;
  /** Custom editor fields. When omitted, the editor falls back to the legacy
   *  content / sub / (items) trio driven by `items`. */
  fields?: CardField[];
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

// Draw text with manual letter-spacing. Works on every browser (canvas has no
// reliable letterSpacing across engines), and measures per-glyph so CJK and
// Latin both track evenly. Returns the total advance width. `align` anchors the
// whole run at x.
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
  return total;
}

// A small tracked, uppercase editorial label — the "NOW READING · 正在读" chrome
// that gives the cards their designed feel. Mono by default; pass sans for a
// lighter caption. Color defaults to a muted ink so it sits behind the hero text.
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; tracking?: number; color?: string; align?: 'left' | 'center' | 'right'; sans?: boolean } = {},
): void {
  const size = opts.size ?? 17;
  const tracking = opts.tracking ?? size * 0.2;
  ctx.fillStyle = opts.color ?? 'rgba(17,17,17,0.6)';
  ctx.font = `500 ${size}px ${opts.sans ? UI_SANS : UI_MONO}`;
  drawTracked(ctx, text.toUpperCase(), x, y, tracking, opts.align ?? 'left');
  ctx.fillStyle = INK;
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
