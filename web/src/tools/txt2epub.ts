// TXT → EPUB packager runtime. Take a plain-text book, decode it with the right
// codepage, tidy it, split it into chapters, then write a standards-compliant
// EPUB 2 (mimetype + container.xml + OPF + NCX + per-chapter XHTML + an optional
// generated cover) — all in the browser. Download the .epub to the SD card or push
// it over Wi-Fi via POST /upload, the same endpoint the other tools use.
//
// The EPUB assembly (buildEpub / splitIntoChapters / escapeXml) is kept free of DOM
// and canvas so it can be unit-tested in Node; only initTxt2Epub() touches the page.

import * as JSZipNS from 'jszip';
type JSZipCtor = { new (): any; loadAsync: (d: any) => Promise<any> };
const JSZip = ((JSZipNS as any).default ?? JSZipNS) as JSZipCtor;

export interface EpubChapter {
  title: string;
  paragraphs: string[];
}

export interface EpubBuildInput {
  title: string;
  author: string;
  language: string; // BCP-47, e.g. 'zh' / 'en'
  chapters: EpubChapter[];
  coverPng?: Uint8Array | null;
}

const AD_PATTERNS: RegExp[] = [
  /上一章|下一章|返回目录|加入书签|本章未完|未完待[读续]|点击下一页|查看下一章节|更多章节/,
  /请?[收藏认准关注].{0,6}(网站|本站|小说)|首发|[本此]站地址|一秒记住|txt[^，。]*下载/,
  /(www\.|https?:\/\/|\.com\b|\.net\b|\.org\b)/i,
  /^[【\[(（]?\s*(更多|精品|最新更新|推荐).{0,14}[】\])）]?$/,
];
const SEPARATOR_LINE = /^\s*[-—_=*·•~～＃#＋+＄$]{3,}\s*$/;

export const CHAPTER_DEFAULT =
  '^\\s*(?:第\\s*[0-9一二三四五六七八九十百千万零〇两]+\\s*[章节回卷篇折]|序章|楔子|前言|引子|尾声|后记|番外|终章|Chapter\\s+\\d+|PROLOGUE|EPILOGUE)';

// ── Pure helpers (unit-testable) ──────────────────────────────────────────────

export function escapeXml(input: string): string {
  // Drop XML-illegal control chars, then escape the five predefined entities.
  const clean = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Tidy the raw text the same way the TXT Tidier does: unify line breaks, optionally
// trim, strip ad/separator lines, and collapse runs of blank lines.
export function cleanText(
  raw: string,
  opts: { stripAds: boolean; collapse: boolean; trim: boolean },
): string {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let lines = text.split('\n');
  if (opts.trim) lines = lines.map((l) => l.replace(/[ \t\u3000]+$/, ''));
  if (opts.stripAds) {
    lines = lines.filter((l) => {
      const t = l.trim();
      if (t && SEPARATOR_LINE.test(t)) return false;
      return !AD_PATTERNS.some((p) => p.test(l));
    });
  }
  if (opts.collapse) {
    const out: string[] = [];
    let blank = 0;
    for (const l of lines) {
      if (l.trim() === '') {
        blank++;
        if (blank <= 1) out.push('');
      } else {
        blank = 0;
        out.push(l);
      }
    }
    lines = out;
  }
  while (lines.length && lines[0].trim() === '') lines.shift();
  return lines.join('\n').replace(/\s+$/, '');
}

// Split tidied text into chapters. A line matching `re` (and short enough to be a
// heading) starts a new chapter; lines before the first heading become a preamble
// chapter. With `re` null, the whole text is a single chapter.
export function splitIntoChapters(text: string, re: RegExp | null): EpubChapter[] {
  const lines = text.split('\n');
  const chapters: EpubChapter[] = [];
  let cur: EpubChapter = { title: '', paragraphs: [] };
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (re && line.length <= 40 && re.test(line)) {
      if (started && (cur.title || cur.paragraphs.length)) chapters.push(cur);
      cur = { title: line, paragraphs: [] };
      started = true;
      continue;
    }
    if (!started) started = true;
    cur.paragraphs.push(line);
  }
  if (cur.title || cur.paragraphs.length) chapters.push(cur);
  if (!chapters.length) chapters.push({ title: '', paragraphs: [] });
  return chapters;
}

function bookId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return 'urn:uuid:' + c.randomUUID();
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    s += i === 8 || i === 13 || i === 18 || i === 23 ? '-' : i === 14 ? '4' : hex[Math.floor(Math.random() * 16)];
  }
  return 'urn:uuid:' + s;
}

function chapterXhtml(title: string, paras: string[], lang: string): string {
  const body = paras.map((p) => `<p>${escapeXml(p)}</p>`).join('\n      ');
  const heading = title ? `<h1 class="chapter">${escapeXml(title)}</h1>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
  <head>
    <title>${escapeXml(title || 'Section')}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body>
    ${heading}
    ${body}
  </body>
</html>`;
}

const STYLE_CSS = `@page { margin: 4%; }
body { font-family: serif; line-height: 1.75; color: #111; }
h1.chapter { font-size: 1.4em; font-weight: 600; text-align: center; margin: 1.2em 0 1.4em; page-break-before: always; }
p { margin: 0 0 0.35em; text-indent: 1.8em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }
`;

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function coverXhtml(alt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Cover</title><link rel="stylesheet" type="text/css" href="style.css" /></head>
  <body class="cover"><img src="cover.png" alt="${escapeXml(alt)}" /></body>
</html>`;
}

function opfXml(input: EpubBuildInput, id: string, hasCover: boolean): string {
  const meta = `    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:creator>${escapeXml(input.author)}</dc:creator>
    <dc:language>${escapeXml(input.language)}</dc:language>
    <dc:identifier id="bookid">${escapeXml(id)}</dc:identifier>
    <meta name="cover" content="cover-image" />`;
  const items: string[] = [
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />`,
    `    <item id="css" href="style.css" media-type="text/css" />`,
  ];
  if (hasCover) items.push(`    <item id="cover-image" href="cover.png" media-type="image/png" />`);
  if (hasCover) items.push(`    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" />`);
  input.chapters.forEach((_, i) => {
    items.push(`    <item id="c${i + 1}" href="chapter-${pad(i + 1)}.xhtml" media-type="application/xhtml+xml" />`);
  });
  const refs: string[] = [];
  if (hasCover) refs.push(`    <itemref idref="cover" linear="no" />`);
  input.chapters.forEach((_, i) => refs.push(`    <itemref idref="c${i + 1}" />`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${meta}
  </metadata>
  <manifest>
${items.join('\n')}
  </manifest>
  <spine toc="ncx">
${refs.join('\n')}
  </spine>
</package>`;
}

function ncxXml(input: EpubBuildInput, id: string, hasCover: boolean): string {
  const points: string[] = [];
  let order = 1;
  if (hasCover) {
    points.push(`      <navPoint id="np-cover" playOrder="${order++}"><navLabel><text>Cover</text></navLabel><content src="cover.xhtml" /></navPoint>`);
  }
  input.chapters.forEach((c, i) => {
    const label = c.title || input.title;
    points.push(
      `      <navPoint id="np${i + 1}" playOrder="${order++}"><navLabel><text>${escapeXml(label)}</text></navLabel><content src="chapter-${pad(i + 1)}.xhtml" /></navPoint>`,
    );
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(id)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(input.title)}</text></docTitle>
  <navMap>
${points.join('\n')}
  </navMap>
</ncx>`;
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

// Assemble the .epub bytes. Chapters must be non-empty; empty titles fall back to
// the book title (chapter 1) or a positional label.
export async function buildEpub(input: EpubBuildInput): Promise<Uint8Array> {
  const zip = new JSZip();
  // mimetype must be the first entry and stored (uncompressed).
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', containerXml());

  const id = bookId();
  const hasCover = !!input.coverPng && input.coverPng.length > 0;
  const oeb = zip.folder('OEBPS')!;
  oeb.file('content.opf', opfXml(input, id, hasCover));
  oeb.file('toc.ncx', ncxXml(input, id, hasCover));
  oeb.file('style.css', STYLE_CSS);
  if (hasCover) {
    oeb.file('cover.png', input.coverPng as Uint8Array, { compression: 'STORE' });
    oeb.file('cover.xhtml', coverXhtml(input.title));
  }
  input.chapters.forEach((c, i) => {
    const title = c.title || (i === 0 ? input.title : `Section ${i + 1}`);
    oeb.file(`chapter-${pad(i + 1)}.xhtml`, chapterXhtml(title, c.paragraphs, input.language));
  });

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

export interface T2EStrings {
  noFile: string;
  processing: string;
  ready: string;
  building: string;
  built: string; // template {chapters}
  pushed: string;
  pushFailed: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  previewEmpty: string;
  lblChapters: string;
  lblWords: string;
  loaded: string; // template {name} {enc}
}

interface T2EState {
  buffer: ArrayBuffer | null;
  rawText: string;
  usedEnc: string;
  baseName: string;
}

function decodeBuffer(buf: ArrayBuffer, choice: string): { text: string; enc: string } {
  const tryDecode = (label: string, fatal: boolean) => {
    try {
      return new TextDecoder(label, { fatal }).decode(buf);
    } catch {
      return null;
    }
  };
  if (choice !== 'auto') {
    return { text: tryDecode(choice, false) ?? tryDecode('utf-8', false) ?? '', enc: choice };
  }
  const utf8 = tryDecode('utf-8', true);
  if (utf8 !== null) return { text: utf8, enc: 'utf-8' };
  for (const label of ['gb18030', 'big5', 'shift_jis', 'euc-kr']) {
    const d = tryDecode(label, false);
    if (d) return { text: d, enc: label };
  }
  return { text: tryDecode('utf-8', false) ?? '', enc: 'utf-8' };
}

function currentChapterRe(): RegExp | null {
  const on = document.getElementById('t2eChapterOn') as HTMLInputElement | null;
  if (!on || !on.checked) return null;
  const val = (document.getElementById('t2eChapterRe') as HTMLInputElement | null)?.value || CHAPTER_DEFAULT;
  try {
    return new RegExp(val, 'i');
  } catch {
    return null;
  }
}

function readOpts() {
  const g = (id: string) => document.getElementById(id);
  return {
    title: (g('t2eTitle') as HTMLInputElement | null)?.value.trim() || 'Untitled',
    author: (g('t2eAuthor') as HTMLInputElement | null)?.value.trim() || 'Unknown',
    language: (g('t2eLang') as HTMLSelectElement | null)?.value || 'zh',
    stripAds: (g('t2eStripAds') as HTMLInputElement | null)?.checked ?? true,
    collapse: (g('t2eCollapse') as HTMLInputElement | null)?.checked ?? true,
    trim: (g('t2eTrim') as HTMLInputElement | null)?.checked ?? true,
    cover: (g('t2eCover') as HTMLInputElement | null)?.checked ?? true,
  };
}

function makeChapters(): EpubChapter[] {
  const state = windowState();
  const o = readOpts();
  const cleaned = cleanText(state.rawText, { stripAds: o.stripAds, collapse: o.collapse, trim: o.trim });
  return splitIntoChapters(cleaned, currentChapterRe());
}

let _state: T2EState | null = null;
function windowState(): T2EState {
  if (!_state) _state = { buffer: null, rawText: '', usedEnc: '', baseName: 'book' };
  return _state;
}

async function makeCoverPng(title: string, author: string): Promise<Uint8Array | null> {
  try {
    const W = 600;
    const H = 800;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.fillStyle = '#1b1b1b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Wrap the title across lines to fit the frame.
    ctx.font = '600 52px "Noto Serif SC", "Songti SC", Georgia, serif';
    const maxW = W - 140;
    const words = Array.from(title);
    const lines: string[] = [];
    let line = '';
    for (const ch of words) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 6);
    const startY = H * 0.4 - ((shown.length - 1) * 66) / 2;
    shown.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * 66));
    ctx.font = '28px "Noto Serif SC", Georgia, serif';
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText(author, W / 2, H * 0.72);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export function initTxt2Epub(props: { strings: T2EStrings }) {
  const T = props.strings;
  const $ = (id: string) => document.getElementById(id);
  const state = windowState();
  const statusEl = $('t2eStatus');
  const devStatusEl = $('t2eDeviceStatus');
  const fileEl = $('t2eFile') as HTMLInputElement | null;
  const dropEl = $('t2eDrop');
  const previewEl = $('t2ePreview');
  const statsEl = $('t2eStats');
  const deviceEl = $('t2eDevice') as HTMLInputElement | null;
  const destEl = $('t2eDest') as HTMLInputElement | null;

  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDev = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };

  function updateView() {
    if (!state.buffer) {
      if (previewEl) previewEl.textContent = T.previewEmpty;
      if (statsEl) statsEl.textContent = '';
      return;
    }
    const chapters = makeChapters();
    const words = state.rawText.replace(/\s+/g, '').length;
    if (statsEl) {
      statsEl.textContent = `${T.lblChapters}: ${chapters.length.toLocaleString()}  ·  ${T.lblWords}: ${words.toLocaleString()}  ·  ${state.usedEnc}`;
    }
    if (previewEl) {
      previewEl.textContent = chapters
        .slice(0, 60)
        .map((c, i) => `${i + 1}. ${c.title || '—'}`)
        .join('\n');
    }
    setStatus(T.ready);
  }

  function loadFile(file: File | undefined | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.buffer = reader.result as ArrayBuffer;
      state.baseName = file.name.replace(/\.[^.]+$/, '') || 'book';
      const { text, enc } = decodeBuffer(state.buffer, ($('t2eEncoding') as HTMLSelectElement | null)?.value || 'auto');
      state.rawText = text;
      state.usedEnc = enc;
      const fnEl = $('t2eFileName');
      if (fnEl) fnEl.textContent = file.name;
      const titleEl = $('t2eTitle') as HTMLInputElement | null;
      if (titleEl && !titleEl.value) titleEl.value = state.baseName;
      dropEl?.classList.add('has-file');
      updateView();
    };
    reader.readAsArrayBuffer(file);
  }

  fileEl?.addEventListener('change', () => loadFile(fileEl.files?.[0]));
  $('t2ePick')?.addEventListener('click', () => fileEl?.click());
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

  ['t2eEncoding'].forEach((id) =>
    $(id)?.addEventListener('change', () => {
      if (!state.buffer) return;
      const { text, enc } = decodeBuffer(state.buffer, (document.getElementById(id) as HTMLSelectElement).value || 'auto');
      state.rawText = text;
      state.usedEnc = enc;
      updateView();
    }),
  );
  ['t2eStripAds', 't2eCollapse', 't2eTrim', 't2eChapterOn'].forEach((id) => $(id)?.addEventListener('change', updateView));
  $('t2eChapterRe')?.addEventListener('input', updateView);
  ['t2eTitle', 't2eAuthor', 't2eLang'].forEach((id) => $(id)?.addEventListener('input', updateView));

  async function buildBlob(): Promise<{ blob: Blob; name: string } | null> {
    if (!state.buffer) {
      setStatus(T.noFile);
      return null;
    }
    setStatus(T.building);
    const o = readOpts();
    const chapters = makeChapters();
    const coverPng = o.cover ? await makeCoverPng(o.title, o.author) : null;
    const bytes = await buildEpub({ title: o.title, author: o.author, language: o.language, chapters, coverPng });
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/epub+zip' });
    const name = (state.baseName || 'book').replace(/[\\/:*?"<>|]+$/, '') + '.epub';
    setStatus(T.built.replace('{chapters}', String(chapters.length)));
    return { blob, name };
  }

  $('t2eDownload')?.addEventListener('click', async () => {
    const out = await buildBlob();
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
    if (deviceEl) localStorage.setItem('onepage.t2e.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.t2e.dest', destEl.value.trim());
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
  $('t2eProbe')?.addEventListener('click', () => {
    saveDevice();
    probeDevice();
  });

  $('t2ePush')?.addEventListener('click', async () => {
    saveDevice();
    const base = deviceBase();
    const dest = (destEl?.value || '/books').trim() || '/';
    const out = await buildBlob();
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

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.t2e.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.t2e.dest') || '/books';

  updateView();
}
