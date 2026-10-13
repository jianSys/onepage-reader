// Card Studio runtime: wires the DOM to the template registry, runs the shared
// render pipeline (draw → optional Floyd–Steinberg dither), and handles live
// re-ticking, data fetch, export (1-bit BMP / PNG) and AirPage push.

import { W, H, INK, type CardView, type WeatherData } from './primitives';
import { SEEDS, getTemplate } from './templates';

export interface StudioStrings {
  ready: string;
  rendering: string;
  fetched: string;
  fetchFailed: string;
  pushed: string;
  pushFailed: string;
}

export interface StudioProps {
  strings: StudioStrings;
  /** Localized per-template guidance shown above the editor when a template is picked. */
  hints: Record<string, string>;
}

interface State extends CardView {
  template: string;
  fit: boolean;
  dither: boolean;
  image: HTMLImageElement | null;
}

// Encode the (already 1-bit-dithered) canvas into a monochrome BMP that the
// reader's Bitmap parser accepts: 'BM' + 40-byte BITMAPINFOHEADER, bpp=1, BI_RGB,
// a 2-entry palette, rows padded to 4 bytes, MSB-first, bottom-up. Drop-in usable
// on the SD card — no device-side decode.
function canvasToBitmap1Bit(canvas: HTMLCanvasElement): Blob {
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

// ── Dither (Floyd–Steinberg, 1-bit) ──────────────────────────────────────────

function floydSteinberg(ctx: CanvasRenderingContext2D) {
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

// ── Wiring ─────────────────────────────────────────────────────────────────

export function initCardStudio(props: StudioProps) {
  const T = props.strings;
  const hints = props.hints || {};
  const $ = (id: string) => document.getElementById(id);
  const canvas = $('csCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const contentEl = $('csContent') as HTMLTextAreaElement;
  const subEl = $('csSub') as HTMLInputElement;
  const itemsEl = $('csItems') as HTMLTextAreaElement;
  const itemsWrap = $('csItemsWrap');
  const hintEl = $('csHint');
  const fitEl = $('csFit') as HTMLInputElement;
  const ditherEl = $('csDither') as HTMLInputElement;
  const statusEl = $('csStatus');
  const tplButtons = Array.from(document.querySelectorAll('#csTemplates .cs-tile')) as HTMLButtonElement[];
  const tiles = tplButtons;
  const filterButtons = Array.from(document.querySelectorAll('#csFilters button')) as HTMLButtonElement[];
  const photoWrap = $('csPhotoWrap');
  const photoFile = $('csPhotoFile') as HTMLInputElement | null;
  const photoBtn = $('csPhotoBtn');

  const zh = document.documentElement.lang === 'zh';
  const state: State = {
    template: 'quote',
    content: '',
    sub: '',
    items: [],
    fit: true,
    dither: true,
    lang: zh ? 'zh' : 'en',
    image: null,
  };

  // Render a template into a small canvas using its seed content, so the gallery
  // shows a real preview of every card. Half-res + ctx.scale keeps the 480×800
  // draw code coordinate-accurate without a second scaling pass.
  function renderThumb(canvas: HTMLCanvasElement, id: string) {
    const tctx = canvas.getContext('2d');
    if (!tctx) return;
    const scale = canvas.width / W;
    tctx.setTransform(scale, 0, 0, scale, 0, 0);
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, W, H);
    tctx.fillStyle = INK;
    tctx.textBaseline = 'alphabetic';
    const sd = (SEEDS[zh ? 'zh' : 'en'] as Record<string, { content?: string; sub?: string; items?: string[] }>)[id] || {};
    const view: CardView = { content: sd.content ?? '', sub: sd.sub ?? '', items: sd.items ?? [], lang: zh ? 'zh' : 'en', image: null };
    try {
      getTemplate(id).draw(tctx, view);
    } catch {
      /* a bad seed shouldn't blank the whole gallery */
    }
    tctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function renderAllThumbs() {
    document.querySelectorAll<HTMLCanvasElement>('#csTemplates canvas[data-thumb]').forEach((cv) => {
      const id = cv.dataset.thumb;
      if (id) renderThumb(cv, id);
    });
  }

  function applySeed() {
    const sd = (SEEDS[zh ? 'zh' : 'en'] as Record<string, { content?: string; sub?: string; items?: string[] }>)[state.template] || {};
    state.content = sd.content ?? '';
    state.sub = sd.sub ?? '';
    state.items = sd.items ?? [];
    contentEl.value = state.content;
    subEl.value = state.sub;
    itemsEl.value = state.items.join('\n');
  }

  function setStatus(msg: string) {
    if (statusEl) statusEl.textContent = msg;
  }

  function render() {
    state.content = contentEl.value;
    state.sub = subEl.value;
    state.items = itemsEl.value.split('\n');
    state.fit = fitEl.checked;
    state.dither = ditherEl.checked;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#111111';
    ctx.textBaseline = 'alphabetic';
    getTemplate(state.template).draw(ctx, state);
    ctx.restore();
    if (state.dither) floydSteinberg(ctx);
  }

  let raf = 0;
  function schedule() {
    setStatus(T.rendering);
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      render();
      setStatus(T.ready);
    });
  }

  function selectTemplate(id: string) {
    state.template = id;
    tplButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.tpl === id)));
    const def = getTemplate(id);
    if (hintEl) hintEl.textContent = hints[id] || '';
    if (itemsWrap) itemsWrap.style.display = def.items ? '' : 'none';
    if (photoWrap) photoWrap.style.display = id === 'photo' ? '' : 'none';
    applySeed();
    render();
  }

  function applyFilter(cat: string) {
    filterButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.filter === cat)));
    tiles.forEach((t) => {
      t.style.display = cat === 'all' || t.dataset.cat === cat ? '' : 'none';
    });
  }

  // ── Live data (quote/weather; graceful on failure/offline) ────────────
  async function fetchLive() {
    try {
      if (state.template === 'quote') {
        const j = await (await fetch('https://v1.hitokoto.cn/')).json();
        contentEl.value = j.hitokoto || contentEl.value;
        subEl.value = j.from_who ? `${j.from_who}《${j.from}》` : j.from || subEl.value;
      } else if (state.template === 'weather') {
        let lat = 31.23, lon = 121.47, place = subEl.value || 'Shanghai';
        try {
          const geo = await (await fetch('https://ipapi.co/json/')).json();
          if (geo.latitude && geo.longitude) {
            lat = geo.latitude;
            lon = geo.longitude;
            place = geo.city || place;
          }
        } catch {
          /* geolocation optional */
        }
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code` +
          `&timezone=auto&forecast_days=4`;
        const j = await (await fetch(url)).json();
        const days = (j.daily?.time || []).map((t: string, i: number) => ({
          label: t.slice(5).replace('-', '/'),
          hi: j.daily.temperature_2m_max[i],
          lo: j.daily.temperature_2m_min[i],
          code: j.daily.weather_code[i],
        }));
        state.weather = { place, temp: j.current.temperature_2m, code: j.current.weather_code, days } as WeatherData;
        subEl.value = place;
      } else {
        setStatus(T.ready);
        return;
      }
      render();
      setStatus(T.fetched);
    } catch {
      setStatus(T.fetchFailed);
    }
  }

  // ── Export / push ──────────────────────────────────────────────────────
  function currentFormat(): 'bmp' | 'png' {
    const el = document.querySelector('input[name="csFormat"]:checked') as HTMLInputElement | null;
    return el?.value === 'png' ? 'png' : 'bmp';
  }

  function pngBlob(): Promise<Blob | null> {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }

  function exportCurrent(): Promise<{ blob: Blob; name: string } | null> {
    if (currentFormat() === 'png') {
      return pngBlob().then((b) => (b ? { blob: b, name: `onepage-card-${state.template}.png` } : null));
    }
    return Promise.resolve({ blob: canvasToBitmap1Bit(canvas), name: `onepage-card-${state.template}.bmp` });
  }

  async function download() {
    const out = await exportCurrent();
    if (!out) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = out.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function push() {
    const base = ($('csDevice') as HTMLInputElement).value.replace(/\/$/, '');
    const out = await exportCurrent();
    if (!out) return;
    setStatus(T.rendering);
    try {
      const fd = new FormData();
      fd.append('file', out.blob, out.name);
      const r = await fetch(`${base}/airpage`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(String(r.status));
      setStatus(T.pushed);
    } catch {
      setStatus(T.pushFailed);
    }
  }

  // Events
  tplButtons.forEach((b) => b.addEventListener('click', () => selectTemplate((b.dataset.tpl as string) || 'quote')));
  filterButtons.forEach((b) => b.addEventListener('click', () => applyFilter((b.dataset.filter as string) || 'all')));
  [contentEl, subEl, itemsEl].forEach((el) => el.addEventListener('input', schedule));
  fitEl.addEventListener('change', schedule);
  ditherEl.addEventListener('change', schedule);
  $('csFetch')?.addEventListener('click', fetchLive);
  $('csDownload')?.addEventListener('click', download);
  $('csPush')?.addEventListener('click', push);

  // Photo upload: load locally into an Image, then draw. Nothing leaves the page.
  photoBtn?.addEventListener('click', () => photoFile?.click());
  photoFile?.addEventListener('change', () => {
    const file = photoFile.files && photoFile.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      render();
      setStatus(T.ready);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setStatus(T.fetchFailed);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  // Init + live tick (clock/date re-render each second while selected).
  renderAllThumbs();
  applyFilter('all');
  selectTemplate('quote');
  setInterval(() => {
    if (getTemplate(state.template).live) render();
  }, 1000);
}
