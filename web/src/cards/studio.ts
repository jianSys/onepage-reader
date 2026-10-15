// Card Studio runtime: renders the gallery, drives the data-driven editor form
// (built from each template's declared `fields`), runs the shared render pipeline
// (draw → optional Floyd–Steinberg dither), and handles live re-ticking, data
// fetch, export (1-bit BMP / PNG) and AirPage push.

import {
  W,
  H,
  INK,
  setCardFont,
  type CardView,
  type CardField,
  type ImgFit,
  type TemplateDef,
  type WeatherData,
} from './primitives';
import { SEEDS, TEMPLATES, getTemplate } from './templates';
import {
  canvasToBitmap1Bit,
  canvasToBitmap4Gray,
  quantize4,
  floydSteinberg,
  bayerDither,
  hardThreshold,
  applyTone,
} from './bitmap';

export interface StudioStrings {
  ready: string;
  rendering: string;
  fetched: string;
  fetchFailed: string;
  pushed: string;
  pushFailed: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  library: LibraryStrings;
}

/** All runtime copy for the "My works" library section. */
export interface LibraryStrings {
  title: string;
  lede: string;
  saveBtn: string;
  savedStatus: string;
  empty: string;
  load: string;
  pushOne: string;
  duplicate: string;
  rename: string;
  renamePrompt: string;
  remove: string;
  deleteConfirm: string;
  pin: string;
  unpin: string;
  pinnedTag: string;
  importBtn: string;
  exportBtn: string;
  importFail: string;
  quotaFull: string;
  copySuffix: string;
}

/** Bilingual labels for the legacy (non-`fields`) content / sub / items trio. */
export interface FieldLabels {
  content: string;
  sub: string;
  items: string;
  itemsPlaceholder: string;
}

export interface StudioProps {
  strings: StudioStrings;
  /** Localized per-template guidance shown above the editor when a template is picked. */
  hints: Record<string, string>;
  /** Labels used for templates that don't declare custom `fields`. */
  fieldLabels: FieldLabels;
  /** Display name + category label per template, used by library tiles. */
  tplMeta: Record<string, { name: string; cat: string }>;
}

type FieldValues = Record<string, string | boolean>;

interface SeedBag {
  content?: string;
  sub?: string;
  items?: string[];
  data?: Record<string, string | boolean>;
}

interface State extends CardView {
  template: string;
  fit: boolean;
  ditherMode: 'fs' | 'bayer' | 'none';
  brightness: number;
  contrast: number;
  image: HTMLImageElement | null;
  imgFit: ImgFit;
  values: FieldValues;
}

// (BMP encoders + dither/quantize/tone helpers live in ./bitmap.ts so the
// Card Studio and the standalone image tools share one implementation.)

// ── Wiring ─────────────────────────────────────────────────────────────────

export function initCardStudio(props: StudioProps) {
  const T = props.strings;
  const hints = props.hints || {};
  const labels = props.fieldLabels;
  const tplMeta = props.tplMeta || {};
  const zh = document.documentElement.lang === 'zh';
  const lang = zh ? 'zh' : 'en';
  const L = (o: { en: string; zh: string }) => (zh ? o.zh : o.en);

  const $ = (id: string) => document.getElementById(id);
  const canvasEl = $('csCanvas');
  if (!canvasEl) return;
  const canvas: HTMLCanvasElement = canvasEl as HTMLCanvasElement;
  const maybeCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!maybeCtx) return;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const formWrap = $('csFields');
  const hintEl = $('csHint');
  const fitEl = $('csFit') as HTMLInputElement;
  const fontEl = $('csFont') as HTMLSelectElement | null;
  const modeEl = $('csDitherMode') as HTMLSelectElement | null;
  const brightEl = $('csBright') as HTMLInputElement | null;
  const contrastEl = $('csContrast') as HTMLInputElement | null;
  const brightVal = $('csBrightVal');
  const contrastVal = $('csContrastVal');
  const statusEl = $('csStatus');
  const deviceEl = $('csDevice') as HTMLInputElement | null;
  const probeEl = $('csProbe');
  const devStatusEl = $('csDeviceStatus');
  const tplButtons = Array.from(document.querySelectorAll('#csTemplates .cs-tile')) as HTMLButtonElement[];
  const tiles = tplButtons;
  const filterButtons = Array.from(document.querySelectorAll('#csFilters button')) as HTMLButtonElement[];
  const libEl = $('csLibrary');
  const libEmptyEl = $('csLibEmpty');
  const libCountEl = $('csLibCount');
  const libFileEl = $('csLibFile') as HTMLInputElement | null;
  const imgAdjustEl = $('csImgAdjust');
  const zoomEl = $('csImgZoom') as HTMLInputElement | null;
  const panXEl = $('csImgX') as HTMLInputElement | null;
  const panYEl = $('csImgY') as HTMLInputElement | null;
  const zoomVal = $('csImgZoomVal');

  const state: State = {
    template: 'quote',
    content: '',
    sub: '',
    items: [],
    fit: true,
    ditherMode: 'fs',
    brightness: 0,
    contrast: 0,
    lang,
    image: null,
    imgFit: { zoom: 1, ox: 0.5, oy: 0.5 },
    values: {},
  };

  // Resolve the editor fields for a template: its own `fields`, or the legacy
  // content / sub / (items) trio when it declares none.
  function fieldsFor(def: TemplateDef): CardField[] {
    if (def.fields) return def.fields;
    const out: CardField[] = [
      { key: 'content', type: 'textarea', role: 'content', label: { en: labels.content, zh: labels.content } },
      { key: 'sub', type: 'text', role: 'sub', label: { en: labels.sub, zh: labels.sub } },
    ];
    if (def.items) {
      out.push({
        key: 'items',
        type: 'textarea',
        role: 'items',
        label: { en: labels.items, zh: labels.items },
        placeholder: { en: labels.itemsPlaceholder, zh: labels.itemsPlaceholder },
      });
    }
    return out;
  }

  // Initial value for one field from the template's seed bag.
  function seedValueFor(f: CardField, bag: SeedBag): string | boolean {
    if (f.role === 'content') return bag.content ?? '';
    if (f.role === 'sub') return bag.sub ?? '';
    if (f.role === 'items') return (bag.items ?? []).join('\n');
    if (bag.data && f.key in bag.data) return bag.data[f.key] as string | boolean;
    if (f.type === 'checkbox') return false;
    return '';
  }

  // Build the read-only CardView the draw function consumes: role fields mirror
  // into content/sub/items, every field is available under v.values[key].
  function buildView(fields: CardField[], values: FieldValues): CardView {
    const view: CardView = { content: '', sub: '', items: [], lang, image: state.image, values };
    for (const f of fields) {
      const val = values[f.key];
      if (f.role === 'content') view.content = String(val ?? '');
      else if (f.role === 'sub') view.sub = String(val ?? '');
      else if (f.role === 'items') view.items = String(val ?? '').split('\n');
    }
    return view;
  }

  function seedBagFor(id: string): SeedBag {
    return (SEEDS[lang] as Record<string, SeedBag>)[id] || {};
  }

  // Render a template into a small canvas using its seed content, so the gallery
  // shows a real preview of every card. Half-res + ctx.scale keeps the 480×800
  // draw code coordinate-accurate without a second scaling pass.
  function renderThumb(cv: HTMLCanvasElement, id: string) {
    const tctx = cv.getContext('2d');
    if (!tctx) return;
    const scale = cv.width / W;
    tctx.setTransform(scale, 0, 0, scale, 0, 0);
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, W, H);
    tctx.fillStyle = INK;
    tctx.textBaseline = 'alphabetic';
    const fields = fieldsFor(getTemplate(id));
    const values: FieldValues = {};
    for (const f of fields) values[f.key] = seedValueFor(f, seedBagFor(id));
    const view = buildView(fields, values);
    view.image = null;
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

  function setStatus(msg: string) {
    if (statusEl) statusEl.textContent = msg;
  }

  function syncView() {
    const fields = fieldsFor(getTemplate(state.template));
    const view = buildView(fields, state.values);
    state.content = view.content;
    state.sub = view.sub;
    state.items = view.items;
  }

  // Image fit: read the three sliders into an ImgFit (defaults = centered cover).
  function readImgFit(): ImgFit {
    return {
      zoom: zoomEl ? (parseInt(zoomEl.value, 10) || 100) / 100 : 1,
      ox: panXEl ? (parseInt(panXEl.value, 10) || 50) / 100 : 0.5,
      oy: panYEl ? (parseInt(panYEl.value, 10) || 50) / 100 : 0.5,
    };
  }
  function setImgFitControls(fit: ImgFit) {
    if (zoomEl) zoomEl.value = String(Math.round(fit.zoom * 100));
    if (panXEl) panXEl.value = String(Math.round(fit.ox * 100));
    if (panYEl) panYEl.value = String(Math.round(fit.oy * 100));
    if (zoomVal) zoomVal.textContent = `${Math.round(fit.zoom * 100)}%`;
  }
  function resetImgFitControls() {
    setImgFitControls({ zoom: 1, ox: 0.5, oy: 0.5 });
  }
  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
  // Zoom stays within the slider's 100–300% range so drag/wheel and the slider agree.
  const clampZoom = (n: number) => Math.min(3, Math.max(1, n));
  // Mirror drawImageFitted's geometry so drag/wheel land exactly where the crop is.
  // Returns the scaled image size and the per-axis overflow the ox/oy slide across.
  function currentBoxOverflow(zoom: number): { dw: number; dh: number; oxW: number; oyH: number } | null {
    const img = state.image;
    if (!img) return null;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const scale = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    return { dw, dh, oxW: dw - W, oyH: dh - H };
  }
  // The adjust panel only makes sense while an image is actually on the card.
  function updateImgAdjustVisibility() {
    const has = !!state.image;
    if (imgAdjustEl) imgAdjustEl.style.display = has ? '' : 'none';
    canvas.classList.toggle('cs-grabbable', has);
  }

  function render() {
    state.ditherMode = (modeEl?.value as State['ditherMode']) || 'fs';
    state.brightness = brightEl ? parseInt(brightEl.value, 10) || 0 : 0;
    state.contrast = contrastEl ? parseInt(contrastEl.value, 10) || 0 : 0;
    if (brightVal) brightVal.textContent = String(state.brightness);
    if (contrastVal) contrastVal.textContent = String(state.contrast);
    setCardFont(fontEl?.value || 'serif');
    state.imgFit = readImgFit();
    updateImgAdjustVisibility();

    syncView();
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#111111';
    ctx.textBaseline = 'alphabetic';
    getTemplate(state.template).draw(ctx, state);
    ctx.restore();
    applyTone(ctx, state.brightness, state.contrast);
    if (currentFormat() === 'gray') {
      quantize4(ctx); // 4-level grayscale preview == the 2bpp BMP we export
    } else if (state.ditherMode === 'fs') floydSteinberg(ctx);
    else if (state.ditherMode === 'bayer') bayerDither(ctx);
    else hardThreshold(ctx);
    const specEl = document.getElementById('csSpec');
    if (specEl) {
      const f = currentFormat();
      specEl.textContent = f === 'png' ? '480 × 800 · PNG' : f === 'gray' ? '480 × 800 · 4级灰阶' : '480 × 800 · 1-bit';
    }
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

  // ── Dynamic form ──────────────────────────────────────────────────────────
  function fieldInputId(key: string) {
    return 'cs-field-' + key;
  }

  function makeFieldEl(f: CardField): HTMLElement {
    if (f.type === 'checkbox') {
      const row = document.createElement('div');
      row.className = 'cs-field cs-field-check';
      row.dataset.key = f.key;
      if (f.showWhen) {
        row.dataset.showKey = f.showWhen.key;
        row.dataset.showEquals = String(f.showWhen.equals);
      }
      const label = document.createElement('label');
      label.className = 'cs-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = fieldInputId(f.key);
      input.checked = state.values[f.key] === true;
      const span = document.createElement('span');
      span.textContent = L(f.label);
      label.appendChild(input);
      label.appendChild(span);
      row.appendChild(label);
      input.addEventListener('change', () => setFieldValue(f.key, input.checked));
      return row;
    }

    const wrap = document.createElement('div');
    wrap.className = 'cs-field';
    wrap.dataset.key = f.key;
    if (f.showWhen) {
      wrap.dataset.showKey = f.showWhen.key;
      wrap.dataset.showEquals = String(f.showWhen.equals);
    }

    if (f.type === 'image') {
      const cap = document.createElement('span');
      cap.className = 'cs-flabel';
      cap.textContent = L(f.label);
      wrap.appendChild(cap);
      const row = document.createElement('div');
      row.className = 'cs-imgrow';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-btn cs-btn-ghost';
      btn.textContent = zh ? '选择图片' : 'Choose image';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.className = 'cs-imgfile';
      file.hidden = true;
      const nameEl = document.createElement('span');
      nameEl.className = 'cs-imgname';
      nameEl.textContent = zh ? '未选择' : 'No file';
      row.appendChild(btn);
      row.appendChild(file);
      row.appendChild(nameEl);
      wrap.appendChild(row);
      if (f.placeholder) {
        const hint = document.createElement('p');
        hint.className = 'cs-fhint';
        hint.textContent = L(f.placeholder);
        wrap.appendChild(hint);
      }
      btn.addEventListener('click', () => file.click());
      file.addEventListener('change', () => {
        const fileObj = file.files && file.files[0];
        if (!fileObj) return;
        const url = URL.createObjectURL(fileObj);
        const img = new Image();
        img.onload = () => {
          state.image = img;
          nameEl.textContent = fileObj.name;
          resetImgFitControls();
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
      return wrap;
    }

    const cap = document.createElement('span');
    cap.className = 'cs-flabel';
    cap.textContent = L(f.label);
    wrap.appendChild(cap);

    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = fieldInputId(f.key);
      sel.className = 'cs-control';
      (f.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = L(opt.label);
        sel.appendChild(o);
      });
      sel.value = String(state.values[f.key] ?? (f.options && f.options[0] ? f.options[0].value : ''));
      sel.addEventListener('change', () => setFieldValue(f.key, sel.value));
      wrap.appendChild(sel);
      return wrap;
    }

    const isMulti = f.type === 'textarea';
    const input = document.createElement(isMulti ? 'textarea' : 'input');
    input.id = fieldInputId(f.key);
    input.className = 'cs-control';
    if (!isMulti) (input as HTMLInputElement).type = f.type === 'date' ? 'date' : 'text';
    if (isMulti && f.type === 'textarea') (input as HTMLTextAreaElement).rows = 5;
    if (f.placeholder) input.placeholder = L(f.placeholder);
    input.value = String(state.values[f.key] ?? '');
    input.addEventListener('input', () => setFieldValue(f.key, input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function setFieldValue(key: string, value: string | boolean) {
    state.values[key] = value;
    const el = document.getElementById(fieldInputId(key));
    if (el) {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
      else if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        (el as { value: string }).value = String(value);
      }
    }
    applyShowWhen();
    schedule();
  }

  // Show/hide fields gated by `showWhen`, based on current values.
  function applyShowWhen() {
    if (!formWrap) return;
    formWrap.querySelectorAll<HTMLElement>('.cs-field[data-show-key]').forEach((el) => {
      const gateKey = el.dataset.showKey as string;
      const want = el.dataset.showEquals as string;
      const actual = String(state.values[gateKey] ?? '');
      el.style.display = actual === want ? '' : 'none';
    });
  }

  function buildForm(def: TemplateDef, valuesOverride?: FieldValues) {
    const fields = fieldsFor(def);
    if (valuesOverride) {
      state.values = { ...valuesOverride };
    } else {
      const bag = seedBagFor(def.id);
      state.values = {};
      for (const f of fields) state.values[f.key] = seedValueFor(f, bag);
    }
    if (def.category === 'photo' || fields.some((f) => f.type === 'image')) state.image = null;
    if (formWrap) {
      formWrap.innerHTML = '';
      for (const f of fields) formWrap.appendChild(makeFieldEl(f));
    }
    applyShowWhen();
    syncView();
  }

  // Reflect template selection in the gallery + hint, without touching the form.
  function applyTemplateChrome(id: string) {
    state.template = id;
    tplButtons.forEach((b) => b.setAttribute('aria-current', String(b.dataset.tpl === id)));
    if (hintEl) hintEl.textContent = hints[id] || '';
  }

  function selectTemplate(id: string) {
    applyTemplateChrome(id);
    currentWorkId = null; // editing a fresh template is no longer "the loaded work"
    buildForm(getTemplate(id));
    resetImgFitControls();
    render();
    renderLibrary();
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
        if (j.hitokoto) setFieldValue('content', j.hitokoto);
        const from = j.from_who ? `${j.from_who}《${j.from}》` : j.from || '';
        if (from) setFieldValue('sub', from);
      } else if (state.template === 'weather') {
        let lat = 31.23, lon = 121.47, place = state.sub || 'Shanghai';
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
        setFieldValue('sub', place);
      } else if (state.template === 'dashboard') {
        // Pull cumulative reading stats from the device. /api/stats sends a
        // permissive CORS header (unlike /api/status), so we can read the body.
        const base = deviceBase();
        if (!base) throw new Error('no device address');
        const j = await (await fetch(`${base}/api/stats`)).json();
        const secs = Math.max(0, Math.floor(j.totalReadingSeconds || 0));
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const big = h > 0 ? (zh ? `${h} 小时 ${m} 分` : `${h}h ${m}m`) : zh ? `${m} 分钟` : `${m} min`;
        const sessions = Math.floor(j.readingSessions || 0);
        const turns = Math.floor(j.totalPagesTurns || 0);
        setFieldValue('content', big);
        setFieldValue('sub', zh ? '累计阅读时长' : 'Total reading time');
        setFieldValue(
          'items',
          zh ? `阅读会话 : ${sessions} 次\n累计翻页 : ${turns} 页` : `Sessions : ${sessions}\nPage turns : ${turns}`,
        );
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
  function currentFormat(): 'bmp' | 'png' | 'gray' {
    const el = document.querySelector('input[name="csFormat"]:checked') as HTMLInputElement | null;
    return el?.value === 'png' ? 'png' : el?.value === 'gray' ? 'gray' : 'bmp';
  }

  function pngBlob(): Promise<Blob | null> {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }

  function exportCurrent(): Promise<{ blob: Blob; name: string } | null> {
    if (currentFormat() === 'png') {
      return pngBlob().then((b) => (b ? { blob: b, name: `onepage-card-${state.template}.png` } : null));
    }
    if (currentFormat() === 'gray') {
      return Promise.resolve({ blob: canvasToBitmap4Gray(canvas), name: `onepage-card-${state.template}-gray4.bmp` });
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

  // ── Device address memory + reachability probe ─────────────────
  function deviceBase(): string {
    return (deviceEl?.value || '').trim().replace(/\/$/, '');
  }
  function saveDevice() {
    if (deviceEl) localStorage.setItem('onepage.card.device', deviceEl.value.trim());
  }
  function setDevStatus(msg: string) {
    if (devStatusEl) devStatusEl.textContent = msg;
  }
  // The device sends no CORS headers, so we probe with mode:'no-cors': we can't
  // read the body, but the fetch resolving means the device answered (reachable),
  // while a rejection / timeout means it is offline.
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

  async function push() {
    saveDevice();
    const base = deviceBase();
    const out = await exportCurrent();
    if (!out) return;
    setStatus(T.rendering);
    try {
      const fd = new FormData();
      fd.append('file', out.blob, out.name);
      const r = await fetch(`${base}/airpage`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(String(r.status));
      setStatus(T.pushed);
      setDevStatus(T.deviceOnline);
    } catch {
      setStatus(T.pushFailed);
      probeDevice(); // clarify whether the device is actually reachable
    }
  }

  // ── My works: a multi-card library persisted in localStorage ───────────
  // AirPage only keeps one draft per template; here we keep many named cards,
  // each a full snapshot of the editor (fields + typeface + advanced + format),
  // so a work reopens exactly as it was saved.
  interface WorkItem {
    id: string;
    name: string;
    template: string;
    values: FieldValues;
    font: string;
    ditherMode: State['ditherMode'];
    brightness: number;
    contrast: number;
    format: 'bmp' | 'png' | 'gray';
    imgFit: ImgFit; // uploaded-image pan/zoom at save time
    image: string | null; // photo template source, kept as a data URL
    thumb: string; // small JPEG snapshot of the rendered card
    createdAt: number;
    pinned: boolean;
  }
  const LIB_KEY = 'onepage.card.library';
  let library: WorkItem[] = loadLibrary();
  let currentWorkId: string | null = null;

  function templateExists(id: string): boolean {
    return TEMPLATES.some((t) => t.id === id);
  }
  function loadLibrary(): WorkItem[] {
    try {
      const raw = localStorage.getItem(LIB_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((w) => w && templateExists(w.template)) : [];
    } catch {
      return [];
    }
  }
  function persistLibrary(): boolean {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(library));
      return true;
    } catch {
      setStatus(T.library.quotaFull);
      return false;
    }
  }
  function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function setFormat(value: WorkItem['format']) {
    document
      .querySelectorAll<HTMLInputElement>('input[name="csFormat"]')
      .forEach((r) => (r.checked = r.value === value));
  }
  function snapshotSettings() {
    return {
      font: fontEl?.value || 'serif',
      ditherMode: (modeEl?.value as State['ditherMode']) || 'fs',
      brightness: brightEl ? parseInt(brightEl.value, 10) || 0 : 0,
      contrast: contrastEl ? parseInt(contrastEl.value, 10) || 0 : 0,
      format: currentFormat(),
      imgFit: readImgFit(),
    };
  }
  // Downscale the (already dithered / quantized) preview into a small JPEG so the
  // thumbnail matches what the user sees while staying cheap to store.
  function captureThumb(): string {
    const tw = 180;
    const th = Math.round((tw * H) / W);
    const off = document.createElement('canvas');
    off.width = tw;
    off.height = th;
    const octx = off.getContext('2d');
    if (!octx) return '';
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, tw, th);
    octx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, tw, th);
    return off.toDataURL('image/jpeg', 0.72);
  }
  // Keep photo cards reopenable: persist the current image as a downscaled data URL.
  function captureImageDataURL(): string | null {
    const img = state.image;
    if (!img) return null;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const scale = Math.min(1, W / iw);
    const off = document.createElement('canvas');
    off.width = Math.round(iw * scale);
    off.height = Math.round(ih * scale);
    const octx = off.getContext('2d');
    if (!octx) return null;
    octx.drawImage(img, 0, 0, off.width, off.height);
    return off.toDataURL('image/jpeg', 0.82);
  }
  function defaultWorkName(): string {
    const base = tplMeta[state.template]?.name || state.template;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${base} ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function saveCurrentWork() {
    const s = snapshotSettings();
    const work: WorkItem = {
      id: newId(),
      name: defaultWorkName(),
      template: state.template,
      values: { ...state.values },
      font: s.font,
      ditherMode: s.ditherMode,
      brightness: s.brightness,
      contrast: s.contrast,
      format: s.format,
      imgFit: s.imgFit,
      image: captureImageDataURL(),
      thumb: captureThumb(),
      createdAt: Date.now(),
      pinned: false,
    };
    library.unshift(work);
    if (!persistLibrary()) {
      library.shift();
      return;
    }
    currentWorkId = work.id;
    renderLibrary();
    setStatus(T.library.savedStatus);
  }

  function loadWork(id: string) {
    const work = library.find((w) => w.id === id);
    if (!work || !templateExists(work.template)) return;
    applyTemplateChrome(work.template);
    buildForm(getTemplate(work.template), work.values);
    if (fontEl) fontEl.value = work.font;
    if (modeEl) modeEl.value = work.ditherMode;
    if (brightEl) {
      brightEl.value = String(work.brightness);
      if (brightVal) brightVal.textContent = String(work.brightness);
    }
    if (contrastEl) {
      contrastEl.value = String(work.contrast);
      if (contrastVal) contrastVal.textContent = String(work.contrast);
    }
    setFormat(work.format);
    setImgFitControls(work.imgFit || { zoom: 1, ox: 0.5, oy: 0.5 });
    currentWorkId = id;
    state.image = null;
    render();
    if (work.image) {
      const img = new Image();
      img.onload = () => {
        state.image = img;
        render();
      };
      img.src = work.image;
    }
    renderLibrary();
    $('csFields')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function duplicateWork(id: string) {
    const work = library.find((w) => w.id === id);
    if (!work) return;
    const copy: WorkItem = {
      ...work,
      id: newId(),
      name: `${work.name} ${T.library.copySuffix}`,
      values: { ...work.values },
      createdAt: Date.now(),
      pinned: false,
    };
    library.unshift(copy);
    persistLibrary();
    renderLibrary();
  }

  function renameWork(id: string) {
    const work = library.find((w) => w.id === id);
    if (!work) return;
    const n = window.prompt(T.library.renamePrompt, work.name);
    if (n == null) return;
    const trimmed = n.trim();
    if (trimmed) {
      work.name = trimmed;
      persistLibrary();
      renderLibrary();
    }
  }

  function removeWork(id: string) {
    const work = library.find((w) => w.id === id);
    if (!work) return;
    if (!window.confirm(`${T.library.deleteConfirm}\n${work.name}`)) return;
    library = library.filter((w) => w.id !== id);
    if (currentWorkId === id) currentWorkId = null;
    persistLibrary();
    renderLibrary();
  }

  function togglePin(id: string) {
    const work = library.find((w) => w.id === id);
    if (!work) return;
    work.pinned = !work.pinned;
    persistLibrary();
    renderLibrary();
  }

  function exportLibrary() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'onepage-card-library.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function importLibrary(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      let arr: unknown;
      try {
        arr = JSON.parse(String(reader.result));
      } catch {
        setStatus(T.library.importFail);
        return;
      }
      if (!Array.isArray(arr)) {
        setStatus(T.library.importFail);
        return;
      }
      const clean: WorkItem[] = (arr as Partial<WorkItem>[])
        .filter((w) => w && typeof w.template === 'string' && templateExists(w.template))
        .map((w) => ({
          id: newId(),
          name: String(w.name || tplMeta[w.template as string]?.name || w.template),
          template: w.template as string,
          values: (w.values && typeof w.values === 'object' ? w.values : {}) as FieldValues,
          font: w.font || 'serif',
          ditherMode: (w.ditherMode as State['ditherMode']) || 'fs',
          brightness: Number(w.brightness) || 0,
          contrast: Number(w.contrast) || 0,
          format: w.format === 'png' || w.format === 'gray' ? w.format : 'bmp',
          imgFit:
            w.imgFit && typeof w.imgFit.zoom === 'number'
              ? w.imgFit
              : { zoom: 1, ox: 0.5, oy: 0.5 },
          image: typeof w.image === 'string' ? w.image : null,
          thumb: typeof w.thumb === 'string' ? w.thumb : '',
          createdAt: Number(w.createdAt) || Date.now(),
          pinned: !!w.pinned,
        }));
      if (!clean.length) {
        setStatus(T.library.importFail);
        return;
      }
      library = [...clean, ...library];
      persistLibrary();
      renderLibrary();
    };
    reader.readAsText(file);
  }

  function workTile(w: WorkItem): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cs-work';
    el.dataset.id = w.id;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-current', String(w.id === currentWorkId));

    if (w.pinned) {
      const tag = document.createElement('span');
      tag.className = 'cs-work-pin';
      tag.textContent = T.library.pinnedTag;
      el.appendChild(tag);
    }

    const screen = document.createElement('span');
    screen.className = 'cs-work-screen';
    if (w.thumb) {
      const img = document.createElement('img');
      img.src = w.thumb;
      img.alt = w.name;
      img.loading = 'lazy';
      screen.appendChild(img);
    }
    el.appendChild(screen);

    const meta = document.createElement('div');
    meta.className = 'cs-work-meta';
    const name = document.createElement('span');
    name.className = 'cs-work-name';
    name.textContent = w.name;
    const badge = document.createElement('span');
    badge.className = 'cs-work-badge';
    badge.textContent = tplMeta[w.template]?.cat || w.template;
    meta.append(name, badge);
    el.appendChild(meta);

    const acts = document.createElement('div');
    acts.className = 'cs-work-actions';
    const mk = (act: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-work-act';
      b.dataset.act = act;
      b.textContent = label;
      acts.appendChild(b);
    };
    mk('load', T.library.load);
    mk('push', T.library.pushOne);
    mk('duplicate', T.library.duplicate);
    mk('rename', T.library.rename);
    mk('pin', w.pinned ? T.library.unpin : T.library.pin);
    mk('remove', T.library.remove);
    el.appendChild(acts);

    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.cs-work-act');
      if (!btn) {
        loadWork(w.id);
        return;
      }
      e.stopPropagation();
      switch (btn.dataset.act) {
        case 'load':
          loadWork(w.id);
          break;
        case 'push':
          loadWork(w.id);
          push();
          break;
        case 'duplicate':
          duplicateWork(w.id);
          break;
        case 'rename':
          renameWork(w.id);
          break;
        case 'pin':
          togglePin(w.id);
          break;
        case 'remove':
          removeWork(w.id);
          break;
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadWork(w.id);
      }
    });
    return el;
  }

  function renderLibrary() {
    if (!libEl) return;
    const items = [...library].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
    );
    if (libCountEl) libCountEl.textContent = library.length ? `${library.length}` : '';
    const empty = items.length === 0;
    libEl.classList.toggle('cs-lib-none', empty);
    libEmptyEl?.classList.toggle('hidden', !empty);
    libEl.innerHTML = '';
    for (const w of items) libEl.appendChild(workTile(w));
  }

  // Events (static shared controls; form fields bind themselves in makeFieldEl).
  tplButtons.forEach((b) => b.addEventListener('click', () => selectTemplate((b.dataset.tpl as string) || 'quote')));
  filterButtons.forEach((b) => b.addEventListener('click', () => applyFilter((b.dataset.filter as string) || 'all')));
  fitEl.addEventListener('change', schedule);
  document
    .querySelectorAll<HTMLInputElement>('input[name="csFormat"]')
    .forEach((r) => r.addEventListener('change', schedule));
  if (fontEl) {
    const saved = localStorage.getItem('onepage.card.font');
    if (saved && Array.from(fontEl.options).some((o) => o.value === saved)) fontEl.value = saved;
    fontEl.addEventListener('change', () => {
      localStorage.setItem('onepage.card.font', fontEl.value);
      schedule();
    });
  }
  if (deviceEl) {
    const saved = localStorage.getItem('onepage.card.device');
    if (saved) deviceEl.value = saved;
    deviceEl.addEventListener('change', saveDevice);
    if (saved) probeDevice(); // auto-check the remembered device once
  }
  probeEl?.addEventListener('click', () => {
    saveDevice();
    probeDevice();
  });
  modeEl?.addEventListener('change', schedule);
  brightEl?.addEventListener('input', schedule);
  contrastEl?.addEventListener('input', schedule);
  zoomEl?.addEventListener('input', () => {
    if (zoomVal) zoomVal.textContent = `${parseInt(zoomEl.value, 10) || 100}%`;
    schedule();
  });
  panXEl?.addEventListener('input', schedule);
  panYEl?.addEventListener('input', schedule);

  // Grab-to-frame on the preview: drag pans, the wheel zooms about the cursor.
  // Both write through setImgFitControls so the sliders stay in sync, then
  // schedule() re-renders. No-ops (and never blocks page scroll) without an image.
  let framing = false;
  let frameLastX = 0;
  let frameLastY = 0;
  const logicalStep = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return rect.width ? W / rect.width : 1;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.image) return;
    framing = true;
    frameLastX = e.clientX;
    frameLastY = e.clientY;
    canvas.classList.add('cs-grabbing');
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!framing || !state.image) return;
    const k = logicalStep(e);
    const fit = readImgFit();
    const ov = currentBoxOverflow(fit.zoom);
    if (!ov) return;
    const dx = (e.clientX - frameLastX) * k;
    const dy = (e.clientY - frameLastY) * k;
    frameLastX = e.clientX;
    frameLastY = e.clientY;
    const ox = ov.oxW > 0 ? clamp01(fit.ox - dx / ov.oxW) : fit.ox;
    const oy = ov.oyH > 0 ? clamp01(fit.oy - dy / ov.oyH) : fit.oy;
    setImgFitControls({ zoom: fit.zoom, ox, oy });
    schedule();
  });
  const endFraming = (e: PointerEvent) => {
    if (!framing) return;
    framing = false;
    canvas.classList.remove('cs-grabbing');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', endFraming);
  canvas.addEventListener('pointercancel', endFraming);
  canvas.addEventListener('wheel', (e) => {
    if (!state.image) return;
    e.preventDefault();
    const fit = readImgFit();
    const before = currentBoxOverflow(fit.zoom);
    if (!before) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width ? W / rect.width : 1;
    const px = (e.clientX - rect.left) * k;
    const py = (e.clientY - rect.top) * (H / rect.height);
    const zoom = clampZoom(fit.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    const after = currentBoxOverflow(zoom);
    if (!after) { setImgFitControls({ zoom, ox: fit.ox, oy: fit.oy }); schedule(); return; }
    // Keep the image point under the cursor fixed across the scale change.
    const ratio = zoom / fit.zoom;
    const ox = after.oxW > 0 ? clamp01(((px + before.oxW * fit.ox) * ratio - px) / after.oxW) : fit.ox;
    const oy = after.oyH > 0 ? clamp01(((py + before.oyH * fit.oy) * ratio - py) / after.oyH) : fit.oy;
    setImgFitControls({ zoom, ox, oy });
    schedule();
  }, { passive: false });
  const advToggle = $('csAdvToggle');
  const advBody = $('csAdvBody');
  advToggle?.addEventListener('click', () => {
    const open = advToggle.getAttribute('aria-expanded') === 'true';
    advToggle.setAttribute('aria-expanded', String(!open));
    if (advBody) advBody.classList.toggle('hidden', open);
  });
  $('csAdvReset')?.addEventListener('click', () => {
    if (modeEl) modeEl.value = 'fs';
    if (brightEl) brightEl.value = '0';
    if (contrastEl) contrastEl.value = '0';
    schedule();
  });
  $('csFetch')?.addEventListener('click', fetchLive);
  $('csDownload')?.addEventListener('click', download);
  $('csPush')?.addEventListener('click', push);
  $('csSaveWork')?.addEventListener('click', saveCurrentWork);
  $('csLibExport')?.addEventListener('click', exportLibrary);
  $('csLibImport')?.addEventListener('click', () => libFileEl?.click());
  libFileEl?.addEventListener('change', () => {
    const f = libFileEl.files && libFileEl.files[0];
    if (f) importLibrary(f);
    libFileEl.value = ''; // allow re-importing the same file
  });

  // Init + live tick (clock/date re-render each second while selected).
  renderAllThumbs();
  applyFilter('all');
  selectTemplate('quote');
  // Cards rasterize webfonts into the canvas, so a card only looks right once the
  // faces are actually loaded. Warm the ones we draw with (Google Fonts won't
  // fetch fonts used only on a canvas), then repaint the preview + gallery.
  if (typeof document !== 'undefined' && document.fonts) {
    const faces = [
      '400 64px Lora', '500 64px Lora', '600 64px Lora', '700 64px Lora', 'italic 500 40px Lora',
      '400 64px "Playfair Display"', '700 64px "Playfair Display"', '900 64px "Playfair Display"',
      '500 20px "JetBrains Mono"', '700 64px "Noto Serif SC"', '900 64px "Noto Serif SC"',
    ];
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .then(() => {
        renderAllThumbs();
        render();
      });
  }
  setInterval(() => {
    if (getTemplate(state.template).live) render();
  }, 1000);
}
