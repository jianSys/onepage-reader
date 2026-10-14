// Image → BMP tool runtime: load a photo, frame it on the 480×800 e-ink panel
// (cover-fit with drag-to-pan + wheel-to-zoom), tone-adjust, then render through
// the shared bitmap pipeline (1-bit dither or 4-level gray) and export a
// device-ready BMP — download to SD or push over Wi-Fi via POST /upload.

import {
  canvasToBitmap1Bit,
  canvasToBitmap4Gray,
  quantize4,
  floydSteinberg,
  bayerDither,
  hardThreshold,
  applyTone,
} from '../cards/bitmap';

const W = 480;
const H = 800;

export interface ImageToolStrings {
  pick: string;
  drop: string;
  replace: string;
  rendering: string;
  ready: string;
  pushed: string;
  pushFailed: string;
  noImage: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  specGray: string;
  specBmp: string;
  specPng: string;
  dlBmp: string;
  dlPng: string;
}

interface State {
  img: HTMLImageElement | null;
  zoom: number; // 1..4
  ox: number; // horizontal offset in canvas px
  oy: number; // vertical offset in canvas px
  brightness: number; // -100..100
  contrast: number; // -100..100
}

export function initImageTool(props: { strings: ImageToolStrings }) {
  const T = props.strings;
  const $ = (id: string) => document.getElementById(id);
  const canvasEl = $('imCanvas');
  if (!canvasEl) return;
  const canvas = canvasEl as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const fileEl = $('imFile') as HTMLInputElement | null;
  const dropEl = $('imDrop');
  const pickEl = $('imPick');
  const fileNameEl = $('imFileName');
  const zoomEl = $('imZoom') as HTMLInputElement | null;
  const xEl = $('imX') as HTMLInputElement | null;
  const yEl = $('imY') as HTMLInputElement | null;
  const zoomValEl = $('imZoomVal');
  const brightEl = $('imBright') as HTMLInputElement | null;
  const brightValEl = $('imBrightVal');
  const contrastEl = $('imContrast') as HTMLInputElement | null;
  const contrastValEl = $('imContrastVal');
  const ditherEl = $('imDither') as HTMLInputElement | null;
  const statusEl = $('imStatus');
  const specEl = $('imSpec');
  const deviceEl = $('imDevice') as HTMLInputElement | null;
  const destEl = $('imDest') as HTMLInputElement | null;
  const probeEl = $('imProbe');
  const devStatusEl = $('imDeviceStatus');

  const state: State = { img: null, zoom: 1, ox: 0, oy: 0, brightness: 0, contrast: 0 };

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDevStatus = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };
  const currentFormat = (): 'bmp' | 'png' | 'gray' => {
    const el = document.querySelector('input[name="imFormat"]:checked') as HTMLInputElement | null;
    return el?.value === 'png' ? 'png' : el?.value === 'gray' ? 'gray' : 'bmp';
  };
  const ditherMode = (): 'fs' | 'bayer' | 'none' => {
    const v = ditherEl?.value;
    return v === 'bayer' ? 'bayer' : v === 'none' ? 'none' : 'fs';
  };

  // Max pan offset (canvas px) for the current image + zoom; 0 when cover-fit
  // already fills the panel exactly (nothing to pan).
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

  // Cover-fit geometry, mirroring the Card Studio framing so both tools feel alike.
  function fit() {
    const img = state.img!;
    const base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const s = base * state.zoom;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    return { dw, dh, dx: (W - dw) / 2 + state.ox, dy: (H - dh) / 2 + state.oy };
  }

  function syncSliders() {
    clampOffsets();
    if (zoomEl) zoomEl.value = String(Math.round(state.zoom * 100));
    if (zoomValEl) zoomValEl.textContent = `${Math.round(state.zoom * 100)}%`;
    if (xEl) xEl.value = String(Math.round(state.ox));
    if (yEl) yEl.value = String(Math.round(state.oy));
    if (brightEl && brightValEl) brightValEl.textContent = String(state.brightness);
    if (contrastEl && contrastValEl) contrastValEl.textContent = String(state.contrast);
  }

  function draw() {
    ctx!.fillStyle = '#ffffff';
    ctx!.fillRect(0, 0, W, H);
    if (!state.img) {
      ctx!.fillStyle = 'rgba(17,17,17,0.35)';
      ctx!.font = `24px 'Lora', Georgia, serif`;
      ctx!.textAlign = 'center';
      ctx!.fillText(T.pick, W / 2, H / 2);
      ctx!.textAlign = 'left';
      if (specEl) specEl.textContent = '';
      return;
    }
    const f = fit();
    ctx!.drawImage(state.img, f.dx, f.dy, f.dw, f.dh);
    applyTone(ctx!, state.brightness, state.contrast);
    const fmt = currentFormat();
    if (fmt === 'gray') quantize4(ctx!);
    else if (fmt === 'bmp') {
      const m = ditherMode();
      if (m === 'fs') floydSteinberg(ctx!);
      else if (m === 'bayer') bayerDither(ctx!);
      else hardThreshold(ctx!);
    }
    if (specEl) specEl.textContent = fmt === 'png' ? T.specPng : fmt === 'gray' ? T.specGray : T.specBmp;
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

  // ── Framing controls: sliders + drag-to-pan + wheel-to-zoom on the canvas ─
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
    if (brightValEl) brightValEl.textContent = String(state.brightness);
    draw();
  });
  contrastEl?.addEventListener('input', () => {
    state.contrast = Number(contrastEl.value) || 0;
    if (contrastValEl) contrastValEl.textContent = String(state.contrast);
    draw();
  });
  ditherEl?.addEventListener('change', draw);
  // Format change drives the preview, the download-button label, and whether the
  // dither selector is relevant (it only affects 1-bit BMP).
  function updateFormatChrome() {
    const fmt = currentFormat();
    const dl = $('imDownload');
    if (dl) dl.textContent = fmt === 'png' ? T.dlPng : T.dlBmp;
    const ditherRow = $('imDitherRow');
    if (ditherRow) ditherRow.style.opacity = fmt === 'bmp' ? '1' : '0.4';
  }
  document.querySelectorAll('input[name="imFormat"]').forEach((el) =>
    el.addEventListener('change', () => {
      updateFormatChrome();
      draw();
    }),
  );

  $('imReset')?.addEventListener('click', () => {
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

  // Map a pointer delta (in displayed CSS px) to canvas-space px, then pan.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const toCanvasScale = () => (canvas!.clientWidth ? W / canvas!.clientWidth : 1);
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
    const k = toCanvasScale();
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
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!state.img) return;
      e.preventDefault();
      const before = state.zoom;
      state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 1, 4);
      // Keep the pan centered when zoom changes.
      state.ox *= state.zoom / before;
      state.oy *= state.zoom / before;
      syncSliders();
      draw();
    },
    { passive: false },
  );

  // ── Export / download / push ──────────────────────────────────────────────
  function pngBlob(): Promise<Blob | null> {
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  }
  function exportCurrent(): Promise<{ blob: Blob; name: string } | null> {
    const stamp = 'onepage-image';
    const fmt = currentFormat();
    if (fmt === 'png') return pngBlob().then((b) => (b ? { blob: b, name: `${stamp}.png` } : null));
    if (fmt === 'gray') return Promise.resolve({ blob: canvasToBitmap4Gray(canvas), name: `${stamp}-gray4.bmp` });
    return Promise.resolve({ blob: canvasToBitmap1Bit(canvas), name: `${stamp}.bmp` });
  }

  $('imDownload')?.addEventListener('click', async () => {
    if (!state.img) {
      setStatus(T.noImage);
      return;
    }
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
    if (deviceEl) localStorage.setItem('onepage.image.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.image.dest', destEl.value.trim());
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

  $('imPush')?.addEventListener('click', async () => {
    if (!state.img) {
      setStatus(T.noImage);
      return;
    }
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

  // Restore remembered device + destination.
  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.image.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.image.dest') || '/images';

  syncSliders();
  updateFormatChrome();
  draw();
}
