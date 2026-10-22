// EPUB → TXT extractor runtime. Open an EPUB in the browser (jszip → container.xml
// → OPF → spine), read each XHTML document in reading order, turn its markup into
// clean plain text, then stitch the chapters into one .txt (optionally with a title
// header and per-chapter headings). Download the .txt to the SD card or push it over
// Wi-Fi via POST /upload — the same endpoint the other tools use.
//
// The text conversion (htmlToText / decodeEntities / extractHeading / buildTxt) is
// kept free of DOM and jszip so it can be unit-tested in Node; only parseEpub() and
// initEpub2Txt() touch the page.

import * as JSZipNS from 'jszip';
type JSZipCtor = { new (): any; loadAsync: (d: any) => Promise<any> };
const JSZip = ((JSZipNS as any).default ?? JSZipNS) as JSZipCtor;

export interface TxtChapter {
  title: string;
  body: string;
}

export interface TxtBuildInput {
  title: string;
  author: string;
  chapters: TxtChapter[];
  opts: { includeHeader: boolean; includeTitles: boolean };
}

// ── Pure helpers (unit-testable) ──────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  copy: '©',
  reg: '®',
  times: '×',
  middot: '·',
  ldquo: '\u201C',
  rdquo: '\u201D',
  lsquo: '\u2018',
  rsquo: '\u2019',
};

// Decode the common named entities plus any numeric (&#NN; / &#xHH;) reference.
// Unknown entities are left untouched so nothing is silently mangled.
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const key = ent.toLowerCase();
    return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : m;
  });
}

// Turn an XHTML/HTML document string into tidy plain text using only string ops
// (no DOMParser, so it runs under Node tests). Block boundaries become blank lines,
// <br> becomes a single newline, inline tags are dropped, entities are decoded, and
// runs of blank lines collapse to one.
export function htmlToText(html: string): string {
  let s = html;
  // Focus on the body when present; drop head (metadata/style) wholesale.
  const bodyAt = s.search(/<body[\s>]/i);
  if (bodyAt >= 0) s = s.slice(bodyAt);
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ');
  // Line breaks and block-level boundaries → newlines.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|tr|section|article|header|footer|figure|figcaption|dt|dd)>/gi, '\n\n');
  s = s.replace(/<(p|div|h[1-6]|li|blockquote|tr|section|article|figure)[^>]*>/gi, '\n');
  // Drop every remaining tag (spans, anchors, emphasis, images, …).
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  // Normalise whitespace per line, then collapse blank runs to a single blank line.
  const lines = s.split('\n').map((l) => l.replace(/[ \t\u3000]+/g, ' ').replace(/\s+$/, ''));
  const out: string[] = [];
  let blank = 0;
  for (const l of lines) {
    if (l.trim() === '') {
      blank++;
      if (blank <= 1) out.push('');
    } else {
      blank = 0;
      out.push(l.trim());
    }
  }
  return out.join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
}

// Best-effort chapter title: the first h1–h3, else the <title>, decoded and flattened.
export function extractHeading(html: string): string {
  const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// Assemble the final .txt. Optionally a title/author header block, and per-chapter
// heading lines interleaved before each body.
export function buildTxt(input: TxtBuildInput): string {
  const parts: string[] = [];
  if (input.opts.includeHeader) {
    const head = [input.title, input.author].map((x) => (x || '').trim()).filter(Boolean);
    if (head.length) parts.push(head.join('\n'));
  }
  for (const ch of input.chapters) {
    if (input.opts.includeTitles && ch.title) parts.push(ch.title);
    if (ch.body) parts.push(ch.body);
  }
  const body = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return body ? body + '\n' : '';
}

// ── EPUB parsing (needs jszip + DOMParser, runs in the browser) ────────────────

export interface EpubBook {
  title: string;
  author: string;
  chapters: TxtChapter[];
}

async function parseEpub(file: File): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(file);
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  let opfPath = '';
  if (containerXml) {
    const cdoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    opfPath = cdoc.querySelector('rootfile')?.getAttribute('full-path') || '';
  }
  if (!opfPath) opfPath = Object.keys(zip.files).find((p) => /\.opf$/i.test(p)) || '';
  if (!opfPath) throw new Error('no-opf');

  const opfXml = await zip.file(opfPath)!.async('text');
  const doc = new DOMParser().parseFromString(opfXml, 'application/xml');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const md = doc.querySelector('metadata');
  const pickMd = (tag: string): string => {
    if (!md) return '';
    for (const sel of [tag, `dc\\:${tag}`]) {
      try {
        const el = md.querySelector(sel);
        const v = (el?.textContent || '').trim();
        if (v) return v;
      } catch {
        /* ignore invalid selector */
      }
    }
    return '';
  };
  const title = pickMd('title');
  const author = pickMd('creator');

  const items = Array.from(doc.querySelectorAll('manifest > item'));
  const byId = new Map<string, { href: string; type: string }>();
  for (const it of items) {
    byId.set(it.getAttribute('id') || '', { href: it.getAttribute('href') || '', type: it.getAttribute('media-type') || '' });
  }

  const refs = Array.from(doc.querySelectorAll('spine > itemref'));
  const chapters: TxtChapter[] = [];
  for (const ref of refs) {
    const item = byId.get(ref.getAttribute('idref') || '');
    if (!item || !/xhtml|html/i.test(item.type)) continue;
    const path = opfDir + decodeURIComponent(item.href.split('#')[0]);
    const entry = zip.file(path) || zip.file(item.href);
    if (!entry) continue;
    const html = await entry.async('text');
    let body = htmlToText(html);
    if (!body.trim()) continue;
    const chTitle = extractHeading(html);
    // The heading usually also survives htmlToText as the body's first line; drop that
    // duplicate so buildTxt's includeTitles doesn't print it twice.
    if (chTitle) {
      const lines = body.split('\n');
      let i = 0;
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i < lines.length && lines[i].trim() === chTitle.trim()) {
        lines.splice(i, 1);
        body = lines.join('\n').replace(/^\n+/, '');
      }
    }
    chapters.push({ title: chTitle, body });
  }

  return { title: title || file.name.replace(/\.epub$/i, ''), author, chapters };
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

export interface E2TStrings {
  noFile: string;
  processing: string;
  ready: string;
  parsed: string; // template {chapters}
  empty: string;
  built: string; // template {chars}
  pushed: string;
  pushFailed: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  previewEmpty: string;
  lblChapters: string;
  lblWords: string;
}

interface E2TState {
  book: EpubBook | null;
  baseName: string;
}

let _state: E2TState | null = null;
function windowState(): E2TState {
  if (!_state) _state = { book: null, baseName: 'book' };
  return _state;
}

function readOpts() {
  const g = (id: string) => document.getElementById(id);
  return {
    title: (g('e2tTitle') as HTMLInputElement | null)?.value.trim() || '',
    author: (g('e2tAuthor') as HTMLInputElement | null)?.value.trim() || '',
    includeHeader: (g('e2tHeader') as HTMLInputElement | null)?.checked ?? true,
    includeTitles: (g('e2tTitles') as HTMLInputElement | null)?.checked ?? true,
  };
}

export function initEpub2Txt(props: { strings: E2TStrings }) {
  const T = props.strings;
  const $ = (id: string) => document.getElementById(id);
  const state = windowState();
  const statusEl = $('e2tStatus');
  const devStatusEl = $('e2tDeviceStatus');
  const fileEl = $('e2tFile') as HTMLInputElement | null;
  const dropEl = $('e2tDrop');
  const previewEl = $('e2tPreview');
  const statsEl = $('e2tStats');
  const deviceEl = $('e2tDevice') as HTMLInputElement | null;
  const destEl = $('e2tDest') as HTMLInputElement | null;

  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDev = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };

  function updateView() {
    if (!state.book) {
      if (previewEl) previewEl.textContent = T.previewEmpty;
      if (statsEl) statsEl.textContent = '';
      return;
    }
    const chapters = state.book.chapters;
    const words = chapters.reduce((n, c) => n + c.body.replace(/\s+/g, '').length, 0);
    if (statsEl) {
      statsEl.textContent = `${T.lblChapters}: ${chapters.length.toLocaleString()}  ·  ${T.lblWords}: ${words.toLocaleString()}`;
    }
    if (previewEl) {
      const o = readOpts();
      previewEl.textContent = chapters
        .slice(0, 60)
        .map((c, i) => `${i + 1}. ${c.title || o.title || '—'}`)
        .join('\n');
    }
    setStatus(T.ready);
  }

  function loadFile(file: File | undefined | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.epub') && file.type !== 'application/epub+zip') {
      setStatus(T.noFile);
      return;
    }
    setStatus(T.processing);
    parseEpub(file)
      .then((book) => {
        state.book = book;
        state.baseName = file.name.replace(/\.epub$/i, '') || 'book';
        const fnEl = $('e2tFileName');
        if (fnEl) fnEl.textContent = file.name;
        const titleEl = $('e2tTitle') as HTMLInputElement | null;
        if (titleEl) titleEl.value = book.title;
        const authorEl = $('e2tAuthor') as HTMLInputElement | null;
        if (authorEl) authorEl.value = book.author;
        dropEl?.classList.add('has-file');
        if (!book.chapters.length) setStatus(T.empty);
        else setStatus(T.parsed.replace('{chapters}', String(book.chapters.length)));
        updateView();
      })
      .catch(() => {
        state.book = null;
        setStatus(T.empty);
        updateView();
      });
  }

  fileEl?.addEventListener('change', () => loadFile(fileEl.files?.[0]));
  $('e2tPick')?.addEventListener('click', () => fileEl?.click());
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

  ['e2tHeader', 'e2tTitles'].forEach((id) => $(id)?.addEventListener('change', updateView));
  ['e2tTitle', 'e2tAuthor'].forEach((id) => $(id)?.addEventListener('input', updateView));

  function buildBlob(): { blob: Blob; name: string } | null {
    if (!state.book || !state.book.chapters.length) {
      setStatus(T.noFile);
      return null;
    }
    const o = readOpts();
    const text = buildTxt({ title: o.title || state.book.title, author: o.author || state.book.author, chapters: state.book.chapters, opts: { includeHeader: o.includeHeader, includeTitles: o.includeTitles } });
    const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
    const name = (state.baseName || 'book').replace(/[\\/:*?"<>|]+$/, '') + '.txt';
    setStatus(T.built.replace('{chars}', String(text.replace(/\s+/g, '').length)));
    return { blob, name };
  }

  $('e2tDownload')?.addEventListener('click', () => {
    const out = buildBlob();
    if (!out) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = out.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  function deviceBase() {
    return (deviceEl?.value || '').trim().replace(/\/$/, '');
  }
  function saveDevice() {
    if (deviceEl) localStorage.setItem('onepage.e2t.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.e2t.dest', destEl.value.trim());
  }
  async function probeDevice(): Promise<boolean> {
    const base = deviceBase();
    if (!base) {
      setDev(T.deviceOffline);
      return false;
    }
    setDev(T.deviceChecking);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      await fetch(`${base}/api/status`, { mode: 'no-cors', signal: ctrl.signal });
      setDev(T.deviceOnline);
      return true;
    } catch {
      setDev(T.deviceOffline);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  $('e2tProbe')?.addEventListener('click', () => {
    saveDevice();
    probeDevice();
  });

  $('e2tPush')?.addEventListener('click', async () => {
    saveDevice();
    const base = deviceBase();
    const dest = (destEl?.value || '/books').trim() || '/';
    const out = buildBlob();
    if (!out || !base) {
      setStatus(T.pushFailed);
      return;
    }
    setStatus(T.processing);
    try {
      const fd = new FormData();
      fd.append('file', out.blob, out.name);
      const r = await fetch(`${base}/upload?path=${encodeURIComponent(dest)}`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(String(r.status));
      setStatus(T.pushed);
      setDev(T.deviceOnline);
    } catch {
      setStatus(T.pushFailed);
      probeDevice();
    }
  });

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.e2t.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.e2t.dest') || '/books';

  updateView();
}
