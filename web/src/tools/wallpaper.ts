// Wallpaper / boot-screen maker: frame a photo (or use a plain tone) on the
// 480×800 panel, then overlay a lock-screen treatment — a big static clock +
// date, a wrapped quote with a tracked attribution, or a minimal corner label —
// using the same editorial typography helpers the Card Studio ships. Exports a
// device-ready BMP (1-bit / 4-level gray) or PNG, download or push over Wi-Fi.
//
// The exported wallpaper is a *static image*: the firmware sleep screen paints
// the BMP verbatim and does NOT overlay a live clock, and the OnePage C61 has no
// RTC (halClock is skipped under ONEPAGE_C61). So the time/date here are baked-in
// design elements the user can set — they will not advance on the device.

import {
  canvasToBitmap1Bit,
  canvasToBitmap4Gray,
  quantize4,
  floydSteinberg,
  bayerDither,
  hardThreshold,
  applyTone,
} from '../cards/bitmap';
import {
  W,
  H,
  INK,
  SERIF,
  setCardFont,
  label,
  drawTracked,
  fitText,
  fitSingleLine,
} from '../cards/primitives';

export interface WallpaperStrings {
  pickHint: string;
  rendering: string;
  ready: string;
  pushed: string;
  pushFailed: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  specGray: string;
  specBmp: string;
  specPng: string;
  dlBmp: string;
  dlPng: string;
  zh: boolean;
}

type Style = 'clock' | 'quote' | 'minimal' | 'none';

interface State {
  img: HTMLImageElement | null;
  zoom: number;
  ox: number;
  oy: number;
  brightness: number;
  contrast: number;
  style: Style;
  title: string;
  sub: string;
  align: 'left' | 'center' | 'right';
  vPos: number; // 0..1 vertical anchor of the text block
  scrim: boolean;
  showTime: boolean;
  time: string; // static big-clock time text (baked in, not live)
  date: string; // static date/weekday text (baked in, not live)
}

const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function initWallpaper(props: { strings: WallpaperStrings }) {
  const T = props.strings;
  const zh = T.zh;
  const $ = (id: string) => document.getElementById(id);
  const canvasEl = $('wpCanvas');
  if (!canvasEl) return;
  const canvas = canvasEl as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const fileEl = $('wpFile') as HTMLInputElement | null;
  const dropEl = $('wpDrop');
  const fileNameEl = $('wpFileName');
  const zoomEl = $('wpZoom') as HTMLInputElement | null;
  const xEl = $('wpX') as HTMLInputElement | null;
  const yEl = $('wpY') as HTMLInputElement | null;
  const zoomValEl = $('wpZoomVal');
  const brightEl = $('wpBright') as HTMLInputElement | null;
  const brightValEl = $('wpBrightVal');
  const contrastEl = $('wpContrast') as HTMLInputElement | null;
  const contrastValEl = $('wpContrastVal');
  const styleEl = $('wpStyle') as HTMLSelectElement | null;
  const titleEl = $('wpTitle') as HTMLInputElement | null;
  const subEl = $('wpSub') as HTMLInputElement | null;
  const alignEl = $('wpAlign') as HTMLSelectElement | null;
  const vposEl = $('wpVPos') as HTMLInputElement | null;
  const scrimEl = $('wpScrim') as HTMLInputElement | null;
  const showTimeEl = $('wpShowTime') as HTMLInputElement | null;
  const timeEl = $('wpTime') as HTMLInputElement | null;
  const dateEl = $('wpDate') as HTMLInputElement | null;
  const fontEl = $('wpFont') as HTMLSelectElement | null;
  const textFieldsEl = $('wpTextFields');
  const statusEl = $('wpStatus');
  const specEl = $('wpSpec');
  const deviceEl = $('wpDevice') as HTMLInputElement | null;
  const destEl = $('wpDest') as HTMLInputElement | null;
  const probeEl = $('wpProbe');
  const devStatusEl = $('wpDeviceStatus');

  const state: State = {
    img: null,
    zoom: 1,
    ox: 0,
    oy: 0,
    brightness: 0,
    contrast: 0,
    style: 'clock',
    title: '',
    sub: '',
    align: 'center',
    vPos: 0.28,
    scrim: true,
    showTime: true,
    time: '',
    date: '',
  };

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDevStatus = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };
  const currentFormat = (): 'bmp' | 'png' | 'gray' => {
    const el = document.querySelector('input[name="wpFormat"]:checked') as HTMLInputElement | null;
    return el?.value === 'png' ? 'png' : el?.value === 'gray' ? 'gray' : 'bmp';
  };

  function maxOffsets() {
    if (!state.img) return { mx: 0, my: 0 };
    const base = Math.max(W / state.img.naturalWidth, H / state.img.naturalHeight);
    const s = base * state.zoom;
    return {
      mx: Math.max(0, (state.img.naturalWidth * s - W) / 2),
      my: Math.max(0, (state.img.naturalHeight * s - H) / 2),
    };
  }
  function clampOffsets() {
    const { mx, my } = maxOffsets();
    state.ox = clamp(state.ox, -mx, mx);
    state.oy = clamp(state.oy, -my, my);
  }
  function syncSliders() {
    clampOffsets();
    if (zoomEl) zoomEl.value = String(Math.round(state.zoom * 100));
    if (zoomValEl) zoomValEl.textContent = `${Math.round(state.zoom * 100)}%`;
    if (xEl) xEl.value = String(Math.round(state.ox));
    if (yEl) yEl.value = String(Math.round(state.oy));
    if (brightValEl) brightValEl.textContent = String(state.brightness);
    if (contrastValEl) contrastValEl.textContent = String(state.contrast);
  }

  function two(n: number) {
    return String(n).padStart(2, '0');
  }
  // Snapshot of the *viewer's* clock — only used to prefill the static fields and
  // the "fill now" button. Once baked into the BMP the values are frozen.
  function localTime() {
    const d = new Date();
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  }
  function localDate() {
    const d = new Date();
    return zh
      ? `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_ZH[d.getDay()]}`
      : `${WEEKDAY_EN[d.getDay()]} · ${two(d.getDate())} ${MONTH_EN[d.getMonth()]}`;
  }

  // Draw one line of overlay text at the given baseline, honoring align + scrim.
  function overlayLine(text: string, cx: number, baseline: number, font: string, color: string, tracked: number) {
    ctx!.font = font;
    ctx!.fillStyle = color;
    const w = tracked > 0 ? measureTracked(text, tracked) : ctx!.measureText(text).width;
    let x = cx;
    if (state.align === 'center') x = cx - w / 2;
    else if (state.align === 'right') x = cx - w;
    const prev = ctx!.textAlign;
    ctx!.textAlign = 'left';
    if (tracked > 0) drawTracked(ctx!, text, x, baseline, tracked, 'left');
    else ctx!.fillText(text, x, baseline);
    ctx!.textAlign = prev;
  }
  function measureTracked(text: string, spacing: number) {
    const chars = Array.from(text);
    return chars.reduce((a, c) => a + ctx!.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
  }

  function draw() {
    // Background: framed photo or plain paper.
    ctx!.fillStyle = '#ffffff';
    ctx!.fillRect(0, 0, W, H);
    if (state.img) {
      const base = Math.max(W / state.img.naturalWidth, H / state.img.naturalHeight);
      const s = base * state.zoom;
      const dw = state.img.naturalWidth * s;
      const dh = state.img.naturalHeight * s;
      ctx!.drawImage(state.img, (W - dw) / 2 + state.ox, (H - dh) / 2 + state.oy, dw, dh);
      applyTone(ctx!, state.brightness, state.contrast);
    }

    const hasText = state.style !== 'none';
    if (hasText) drawOverlay();

    const fmt = currentFormat();
    if (fmt === 'gray') quantize4(ctx!);
    else if (fmt === 'bmp') {
      const el = $('wpDither') as HTMLSelectElement | null;
      const m = el?.value;
      if (m === 'bayer') bayerDither(ctx!);
      else if (m === 'none') hardThreshold(ctx!);
      else floydSteinberg(ctx!);
    }
    if (specEl) specEl.textContent = fmt === 'png' ? T.specPng : fmt === 'gray' ? T.specGray : T.specBmp;
  }

  function drawOverlay() {
    const cx = state.align === 'left' ? 56 : state.align === 'right' ? W - 56 : W / 2;
    const anchorY = H * state.vPos;
    const textColor = state.scrim && state.img ? '#ffffff' : INK;

    // Measure the block height so the scrim can sit behind it.
    const lines = planLines();
    const blockH = lines.reduce((a, l) => a + l.h, 0) + (lines.length - 1) * 8;
    if (state.scrim) {
      const pad = 40;
      const top = anchorY - blockH / 2 - pad;
      ctx!.fillStyle = state.img ? 'rgba(17,17,17,0.42)' : 'rgba(17,17,17,0.06)';
      const bandW = state.align === 'center' ? W - 48 : W - 56;
      const bandX = state.align === 'right' ? W - 24 - bandW : 24;
      ctx!.fillRect(bandX, top, bandW, blockH + pad * 2);
    }

    let y = anchorY - blockH / 2;
    for (const l of lines) {
      y += l.h;
      if (l.kind === 'time') overlayLine(l.text, cx, y, `700 ${l.size}px ${SERIF}`, textColor, 0);
      else if (l.kind === 'title') overlayLine(l.text, cx, y, `700 ${l.size}px ${SERIF}`, textColor, 0);
      else if (l.kind === 'body') overlayLine(l.text, cx, y, `${l.size}px ${SERIF}`, textColor, 0);
      else overlayLine(l.text.toUpperCase(), cx, y, `500 ${l.size}px ${SERIF}`, textColor, l.size * 0.22);
    }
  }

  interface Planned {
    text: string;
    size: number;
    h: number;
    kind: 'time' | 'date' | 'title' | 'body' | 'label';
  }
  function planLines(): Planned[] {
    const out: Planned[] = [];
    const maxW = W - 112;
    if (state.style === 'clock') {
      if (state.showTime) {
        const t = state.time;
        ctx!.font = `700 150px ${SERIF}`;
        const size = fitSingleLine(ctx!, t, maxW, 150, 80);
        out.push({ text: t, size, h: size * 1.02, kind: 'time' });
      }
      out.push({ text: state.date, size: 20, h: 30, kind: 'label' });
      if (state.title) out.push({ text: state.title, size: 22, h: 34, kind: 'body' });
    } else if (state.style === 'quote') {
      const title = state.title || (zh ? '生活不如你一句话温柔' : 'Less is more');
      const { size, lines } = fitText(ctx!, title, maxW, 360, 56, 1.24, 30);
      for (const ln of lines) out.push({ text: ln, size, h: size * 1.24, kind: 'title' });
      if (state.sub) out.push({ text: state.sub, size: 18, h: 30, kind: 'label' });
    } else if (state.style === 'minimal') {
      out.push({ text: state.title || (zh ? '壹頁' : 'OnePage'), size: 18, h: 28, kind: 'label' });
      if (state.showTime && state.time) out.push({ text: `${state.time} · ${state.date}`, size: 15, h: 24, kind: 'label' });
    }
    return out;
  }

  // ── Image loading ────────────────────────────────────────────────────────
  function loadFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.zoom = 1;
      state.ox = 0;
      state.oy = 0;
      syncSliders();
      draw();
      if (fileNameEl) fileNameEl.textContent = file.name;
      dropEl?.classList.add('has-image');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  fileEl?.addEventListener('change', () => loadFile(fileEl.files?.[0]));
  $('wpPick')?.addEventListener('click', () => fileEl?.click());
  dropEl?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('dragover');
  });
  dropEl?.addEventListener('dragleave', () => dropEl.classList.remove('dragover'));
  dropEl?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('dragover');
    loadFile((e as DragEvent).dataTransfer?.files?.[0]);
  });
  $('wpClear')?.addEventListener('click', () => {
    state.img = null;
    if (fileNameEl) fileNameEl.textContent = '';
    dropEl?.classList.remove('has-image');
    draw();
  });

  // ── Controls ───────────────────────────────────────────────────────────────
  zoomEl?.addEventListener('input', () => {
    state.zoom = clamp((Number(zoomEl.value) || 100) / 100, 1, 4);
    syncSliders();
    draw();
  });
  xEl?.addEventListener('input', () => {
    state.ox = Number(xEl.value) || 0;
    syncSliders();
    draw();
  });
  yEl?.addEventListener('input', () => {
    state.oy = Number(yEl.value) || 0;
    syncSliders();
    draw();
  });
  brightEl?.addEventListener('input', () => {
    state.brightness = Number(brightEl.value) || 0;
    syncSliders();
    draw();
  });
  contrastEl?.addEventListener('input', () => {
    state.contrast = Number(contrastEl.value) || 0;
    syncSliders();
    draw();
  });
  vposEl?.addEventListener('input', () => {
    state.vPos = clamp((Number(vposEl.value) || 0) / 100, 0.08, 0.92);
    draw();
  });
  styleEl?.addEventListener('change', () => {
    state.style = (styleEl.value as Style) || 'clock';
    if (textFieldsEl) textFieldsEl.style.display = state.style === 'none' ? 'none' : '';
    draw();
  });
  alignEl?.addEventListener('change', () => {
    state.align = (alignEl.value as State['align']) || 'center';
    draw();
  });
  scrimEl?.addEventListener('change', () => {
    state.scrim = !!scrimEl.checked;
    draw();
  });
  showTimeEl?.addEventListener('change', () => {
    state.showTime = !!showTimeEl.checked;
    draw();
  });
  timeEl?.addEventListener('input', () => {
    state.time = timeEl.value;
    draw();
  });
  dateEl?.addEventListener('input', () => {
    state.date = dateEl.value;
    draw();
  });
  $('wpNow')?.addEventListener('click', () => {
    state.time = localTime();
    state.date = localDate();
    if (timeEl) timeEl.value = state.time;
    if (dateEl) dateEl.value = state.date;
    draw();
  });
  titleEl?.addEventListener('input', () => {
    state.title = titleEl.value;
    draw();
  });
  subEl?.addEventListener('input', () => {
    state.sub = subEl.value;
    draw();
  });
  fontEl?.addEventListener('change', () => {
    setCardFont(fontEl.value);
    draw();
  });
  $('wpDither')?.addEventListener('change', draw);
  document.querySelectorAll('input[name="wpFormat"]').forEach((el) =>
    el.addEventListener('change', () => {
      const fmt = currentFormat();
      const dl = $('wpDownload');
      if (dl) dl.textContent = fmt === 'png' ? T.dlPng : T.dlBmp;
      draw();
    }),
  );
  $('wpReset')?.addEventListener('click', () => {
    state.zoom = 1;
    state.ox = 0;
    state.oy = 0;
    state.brightness = 0;
    state.contrast = 0;
    if (brightEl) brightEl.value = '0';
    if (contrastEl) contrastEl.value = '0';
    syncSliders();
    draw();
  });

  // Drag-to-pan on the canvas.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const scale = () => (canvas.clientWidth ? W / canvas.clientWidth : 1);
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.classList.add('grabbing');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !state.img) return;
    const k = scale();
    state.ox += (e.clientX - lastX) * k;
    state.oy += (e.clientY - lastY) * k;
    lastX = e.clientX;
    lastY = e.clientY;
    syncSliders();
    draw();
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('grabbing');
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ── Export / download / push ──────────────────────────────────────────────
  function pngBlob(): Promise<Blob | null> {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }
  function exportCurrent(): Promise<{ blob: Blob; name: string } | null> {
    const fmt = currentFormat();
    if (fmt === 'png') return pngBlob().then((b) => (b ? { blob: b, name: 'onepage-wallpaper.png' } : null));
    if (fmt === 'gray') return Promise.resolve({ blob: canvasToBitmap4Gray(canvas), name: 'onepage-wallpaper-gray4.bmp' });
    return Promise.resolve({ blob: canvasToBitmap1Bit(canvas), name: 'onepage-wallpaper.bmp' });
  }
  $('wpDownload')?.addEventListener('click', async () => {
    setStatus(T.rendering);
    const out = await exportCurrent();
    if (!out) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = out.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus(T.ready);
  });

  function deviceBase(): string {
    return (deviceEl?.value || '').trim().replace(/\/$/, '');
  }
  function saveDevice() {
    if (deviceEl) localStorage.setItem('onepage.wallpaper.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.wallpaper.dest', destEl.value.trim());
  }
  async function probeDevice(): Promise<boolean> {
    const base = deviceBase();
    if (!base) {
      setDevStatus(T.deviceOffline);
      return false;
    }
    setDevStatus(T.deviceChecking);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      await fetch(`${base}/api/status`, { mode: 'no-cors', signal: ctrl.signal });
      setDevStatus(T.deviceOnline);
      return true;
    } catch {
      setDevStatus(T.deviceOffline);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  probeEl?.addEventListener('click', () => {
    saveDevice();
    probeDevice();
  });
  $('wpPush')?.addEventListener('click', async () => {
    saveDevice();
    const base = deviceBase();
    const dest = (destEl?.value || '/images').trim() || '/';
    setStatus(T.rendering);
    try {
      const out = await exportCurrent();
      if (!out) throw new Error('encode');
      const fd = new FormData();
      fd.append('file', out.blob, out.name);
      const r = await fetch(`${base}/upload?path=${encodeURIComponent(dest)}`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(String(r.status));
      setStatus(T.pushed);
      setDevStatus(T.deviceOnline);
    } catch {
      setStatus(T.pushFailed);
      probeDevice();
    }
  });

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.wallpaper.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.wallpaper.dest') || '/images';
  if (fontEl) setCardFont(fontEl.value);

  // Prefill the static clock with the viewer's current time so a freshly opened
  // tool already looks right — but it is a fixed snapshot, not a live clock.
  state.time = localTime();
  state.date = localDate();
  if (timeEl) timeEl.value = state.time;
  if (dateEl) dateEl.value = state.date;

  syncSliders();
  draw();
  // Repaint the clock once webfonts settle so the first frame isn't a fallback face.
  if (typeof document !== 'undefined' && document.fonts) {
    Promise.all([
      document.fonts.load(`700 150px ${SERIF}`),
      document.fonts.load(`700 56px ${SERIF}`),
    ])
      .catch(() => {})
      .then(() => draw());
  }
}
