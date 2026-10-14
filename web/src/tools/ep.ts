// Book Info & Cover tool runtime. Parse an EPUB in the browser (jszip → container.xml
// → OPF), read its Dublin-Core metadata and locate the cover image, then frame that
// cover on the 480×800 e-ink panel and export a device-ready BMP through the shared
// bitmap pipeline — download to SD or push over Wi-Fi via POST /upload. A plain .txt
// is also accepted: we report basic file info and use its name as the title.

import * as JSZip from 'jszip';
import { canvasToBitmap1Bit, canvasToBitmap4Gray, quantize4, floydSteinberg, applyTone } from '../cards/bitmap';

const W = 480;
const H = 800;

export interface EpToolStrings {
  pickEpub: string;
  parsing: string;
  ready: string;
  noCover: string;
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
  notFound: string;
  txtNote: string; // shown when a .txt is dropped
}

interface Meta {
  title: string;
  author: string;
  language: string;
  publisher: string;
  date: string;
  identifier: string;
  description: string;
  chapters: number;
  files: number;
}

interface State {
  img: HTMLImageElement | null;
  frame: 'contain' | 'fill';
  brightness: number;
  contrast: number;
  coverName: string;
  bookBase: string; // suggested output base name
}

const emptyMeta: Meta = {
  title: '',
  author: '',
  language: '',
  publisher: '',
  date: '',
  identifier: '',
  description: '',
  chapters: 0,
  files: 0,
};

export function initEpTool(props: { strings: EpToolStrings }) {
  const T = props.strings;
  const $ = (id: string) => document.getElementById(id);

  const canvasEl = $('epCanvas');
  if (!canvasEl) return;
  const canvas = canvasEl as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const fileEl = $('epFile') as HTMLInputElement | null;
  const dropEl = $('epDrop');
  const pickEl = $('epPick');
  const fileNameEl = $('epFileName');
  const brightEl = $('epBright') as HTMLInputElement | null;
  const brightValEl = $('epBrightVal');
  const contrastEl = $('epContrast') as HTMLInputElement | null;
  const contrastValEl = $('epContrastVal');
  const frameEl = $('epFrame') as HTMLSelectElement | null;
  const statusEl = $('epStatus');
  const specEl = $('epSpec');
  const deviceEl = $('epDevice') as HTMLInputElement | null;
  const destEl = $('epDest') as HTMLInputElement | null;
  const probeEl = $('epProbe');
  const devStatusEl = $('epDeviceStatus');

  const meta: Meta = { ...emptyMeta };
  const state: State = { img: null, frame: 'contain', brightness: 0, contrast: 0, coverName: '', bookBase: 'onepage-book' };

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDevStatus = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };
  const currentFormat = (): 'bmp' | 'png' | 'gray' => {
    const el = document.querySelector('input[name="epFormat"]:checked') as HTMLInputElement | null;
    return el?.value === 'png' ? 'png' : el?.value === 'gray' ? 'gray' : 'bmp';
  };

  function setMetaField(id: string, value: string) {
    const el = $(id);
    if (el) el.textContent = value && value.trim() ? value : T.notFound;
  }
  function renderMeta() {
    setMetaField('epTitle', meta.title);
    setMetaField('epAuthor', meta.author);
    setMetaField('epLang', meta.language);
    setMetaField('epPublisher', meta.publisher);
    setMetaField('epDate', meta.date);
    setMetaField('epId', meta.identifier);
    setMetaField('epDesc', meta.description);
    setMetaField('epChapters', meta.chapters ? String(meta.chapters) : T.notFound);
    setMetaField('epFiles', meta.files ? String(meta.files) : T.notFound);
  }

  function draw() {
    ctx!.fillStyle = '#ffffff';
    ctx!.fillRect(0, 0, W, H);
    if (!state.img) {
      ctx!.fillStyle = 'rgba(17,17,17,0.32)';
      ctx!.font = `22px 'Lora', Georgia, serif`;
      ctx!.textAlign = 'center';
      ctx!.fillText(T.noCover, W / 2, H / 2);
      ctx!.textAlign = 'left';
      if (specEl) specEl.textContent = '';
      return;
    }
    const img = state.img;
    const base = state.frame === 'fill' ? Math.max(W / img.naturalWidth, H / img.naturalHeight) : Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * base;
    const dh = img.naturalHeight * base;
    ctx!.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    applyTone(ctx!, state.brightness, state.contrast);
    const fmt = currentFormat();
    if (fmt === 'gray') quantize4(ctx!);
    else if (fmt === 'bmp') floydSteinberg(ctx!);
    if (specEl) specEl.textContent = fmt === 'png' ? T.specPng : fmt === 'gray' ? T.specGray : T.specBmp;
  }

  function updateFormatChrome() {
    const fmt = currentFormat();
    const dl = $('epDownload');
    if (dl) dl.textContent = fmt === 'png' ? T.dlPng : T.dlBmp;
  }

  // ── EPUB parsing ───────────────────────────────────────────────────────────
  function text(el: Element | null): string {
    return (el?.textContent || '').trim();
  }
  async function loadEpub(file: File) {
    const zip = await JSZip.loadAsync(file);
    // container.xml → OPF path.
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    let opfPath = '';
    if (containerXml) {
      const cdoc = new DOMParser().parseFromString(containerXml, 'application/xml');
      opfPath = cdoc.querySelector('rootfile')?.getAttribute('full-path') || '';
    }
    if (!opfPath) {
      const guess = Object.keys(zip.files).find((p) => /\.opf$/i.test(p));
      opfPath = guess || '';
    }
    if (!opfPath) throw new Error('no-opf');

    const opfXml = await zip.file(opfPath)!.async('text');
    const doc = new DOMParser().parseFromString(opfXml, 'application/xml');
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    const q = (sel: string) => {
      try {
        return doc.querySelector(sel);
      } catch {
        return null;
      }
    };
    const md = q('metadata');
    const pick = (tags: string[]): string => {
      if (!md) return '';
      for (const tag of tags) {
        const els = Array.from(md.querySelectorAll(tag));
        for (const e of els) {
          const v = text(e);
          if (v) return v;
        }
      }
      return '';
    };
    // namespace-local tag names are case-sensitive; try both cased forms.
    meta.title = pick(['title', 'dc\\:title']);
    meta.author = pick(['creator', 'dc\\:creator']);
    meta.language = pick(['language', 'dc\\:language']);
    meta.publisher = pick(['publisher', 'dc\\:publisher']);
    meta.date = pick(['date', 'dc\\:date']);
    meta.identifier = pick(['identifier', 'dc\\:identifier']);
    meta.description = pick(['description', 'dc\\:description']);

    // Spine / manifest counts.
    const items = Array.from(doc.querySelectorAll('manifest > item'));
    meta.files = items.length;
    meta.chapters = doc.querySelectorAll('spine > itemref').length;

    // Locate the cover image href.
    let coverHref = '';
    const coverMeta = Array.from(doc.querySelectorAll('meta')).find((m) => (m.getAttribute('name') || '').toLowerCase() === 'cover');
    const idMap = new Map<string, string>();
    for (const it of items) {
      const id = it.getAttribute('id') || '';
      const href = it.getAttribute('href') || '';
      if (id) idMap.set(id, href);
      const props = (it.getAttribute('properties') || '').split(/\s+/);
      if (props.includes('cover-image')) coverHref = href;
    }
    if (!coverHref && coverMeta) coverHref = idMap.get(coverMeta.getAttribute('content') || '') || '';
    if (!coverHref) {
      const imgItem = items.find((it) => (it.getAttribute('media-type') || '').startsWith('image/') && /cover/i.test(it.getAttribute('href') || ''));
      coverHref = imgItem?.getAttribute('href') || '';
    }

    const titleText = meta.title || file.name.replace(/\.[^.]+$/, '');
    state.bookBase = titleText.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40) || 'onepage-book';

    if (coverHref) {
      const coverPath = opfDir + decodeURIComponent(coverHref);
      const entry = zip.file(coverPath) || zip.file(coverHref) || Object.values(zip.files).find((f) => f.name.endsWith(coverHref));
      if (entry) {
        const blob = await entry.async('blob');
        state.coverName = coverPath.split('/').pop() || 'cover';
        await loadImageBlob(blob);
      } else {
        await clearCover();
      }
    } else {
      await clearCover();
    }
    renderMeta();
  }

  function loadImageBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        state.img = img;
        URL.revokeObjectURL(url);
        draw();
        dropEl?.classList.add('has-file');
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        state.img = null;
        draw();
        resolve();
      };
      img.src = url;
    });
  }
  async function clearCover() {
    state.img = null;
    state.coverName = '';
    draw();
  }

  async function loadFile(file: File | undefined | null) {
    if (!file) return;
    if (fileNameEl) fileNameEl.textContent = file.name;
    dropEl?.classList.add('has-file');
    setStatus(T.parsing);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.epub') || file.type === 'application/epub+zip') {
        await loadEpub(file);
      } else if (lower.endsWith('.txt') || file.type.startsWith('text/')) {
        const bytes = await file.arrayBuffer();
        Object.assign(meta, emptyMeta);
        meta.title = file.name.replace(/\.[^.]+$/, '');
        meta.files = 1;
        meta.description = T.txtNote;
        state.bookBase = meta.title.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40) || 'onepage-book';
        void bytes;
        await clearCover();
        renderMeta();
      } else {
        setStatus(T.pickEpub);
        return;
      }
      setStatus(T.ready);
    } catch {
      Object.assign(meta, emptyMeta);
      renderMeta();
      setStatus(T.noCover);
    }
  }

  fileEl?.addEventListener('change', () => loadFile(fileEl.files?.[0]));
  pickEl?.addEventListener('click', () => fileEl?.click());
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

  brightEl?.addEventListener('input', () => {
    state.brightness = Number(brightEl.value) || 0;
    if (brightValEl) brightValEl.textContent = String(state.brightness);
    draw();
  });
  contrastEl?.addEventListener('input', () => {
    state.contrast = Number(contrastEl.value) || 0;
    if (contrastValEl) contrastValEl.textContent = String(state.contrast);
    draw();
  });
  frameEl?.addEventListener('change', () => {
    state.frame = frameEl.value === 'fill' ? 'fill' : 'contain';
    draw();
  });
  document.querySelectorAll('input[name="epFormat"]').forEach((el) =>
    el.addEventListener('change', () => {
      updateFormatChrome();
      draw();
    }),
  );

  // ── Export / download / push ────────────────────────────────────────────────
  function pngBlob(): Promise<Blob | null> {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }
  function exportCurrent(): Promise<{ blob: Blob; name: string } | null> {
    const fmt = currentFormat();
    if (fmt === 'png') return pngBlob().then((b) => (b ? { blob: b, name: `${state.bookBase}-cover.png` } : null));
    if (fmt === 'gray') return Promise.resolve({ blob: canvasToBitmap4Gray(canvas), name: `${state.bookBase}-cover-gray4.bmp` });
    return Promise.resolve({ blob: canvasToBitmap1Bit(canvas), name: `${state.bookBase}-cover.bmp` });
  }

  $('epDownload')?.addEventListener('click', async () => {
    if (!state.img) {
      setStatus(T.noCover);
      return;
    }
    setStatus(T.parsing);
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
    if (deviceEl) localStorage.setItem('onepage.epub.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.epub.dest', destEl.value.trim());
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

  $('epPush')?.addEventListener('click', async () => {
    if (!state.img) {
      setStatus(T.noCover);
      return;
    }
    saveDevice();
    const base = deviceBase();
    const dest = (destEl?.value || '/books').trim() || '/';
    setStatus(T.parsing);
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

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.epub.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.epub.dest') || '/books';

  renderMeta();
  updateFormatChrome();
  draw();
}
