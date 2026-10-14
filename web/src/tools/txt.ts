// TXT Tidier tool runtime — reduced scope: local *tidying* only, no index.bin.
// Read a .txt as bytes, decode with the right codepage (fix mojibake), then
// normalize whitespace, strip ad/watermark lines, detect chapters, and show
// live stats — all in the browser. Export a clean UTF-8 .txt (download to SD
// or push over Wi-Fi via POST /upload, same endpoint the image tools use).

export interface TxToolStrings {
  pick: string;
  noFile: string;
  processing: string;
  ready: string;
  pushed: string;
  pushFailed: string;
  deviceChecking: string;
  deviceOnline: string;
  deviceOffline: string;
  dlLabel: string;
  lblChars: string;
  lblLines: string;
  lblChapters: string;
  lblSize: string;
  lblEncoding: string;
  autoLabel: string;
  loaded: string; // template with {name} {enc}
  previewEmpty: string;
}

interface State {
  buffer: ArrayBuffer | null;
  rawText: string;
  usedEnc: string;
  name: string;
}

// Common web-novel watermark / ad line shapes. Applied per-line; a matching
// line is dropped when "strip ads" is on. Kept deliberately conservative so
// ordinary narrative lines survive.
const AD_PATTERNS: RegExp[] = [
  /上一章|下一章|返回目录|加入书签|本章未完|未完待[读续]|点击下一页|查看下一章节|更多章节/,
  /请?[收藏认准关注].{0,6}(网站|本站|小说)|首发|[本此]站地址|一秒记住|txt[^，。]*下载/,
  /(www\.|https?:\/\/|\.com\b|\.net\b|\.org\b)/i,
  /^[【\[(（]?\s*(更多|精品|最新更新|推荐).{0,14}[】\])）]?$/,
];

// A decorative separator line made purely of punctuation/space.
const SEPARATOR_LINE = /^\s*[-—_=*·•~～＃#＋+＄$]{3,}\s*$/;

const CHAPTER_DEFAULT =
  '^\\s*(?:第\\s*[0-9一二三四五六七八九十百千万零〇两]+\\s*[章节回卷篇折]|序章|楔子|前言|引子|尾声|后记|番外|终章|Chapter\\s+\\d+|PROLOGUE|EPILOGUE)';

export function initTxtTool(props: { strings: TxToolStrings }) {
  const T = props.strings;
  const $ = (id: string) => document.getElementById(id);

  const fileEl = $('txFile') as HTMLInputElement | null;
  const dropEl = $('txDrop');
  const pickEl = $('txPick');
  const fileNameEl = $('txFileName');
  const encEl = $('txEncoding') as HTMLSelectElement | null;
  const stripAdsEl = $('txStripAds') as HTMLInputElement | null;
  const collapseEl = $('txCollapse') as HTMLInputElement | null;
  const trimEl = $('txTrim') as HTMLInputElement | null;
  const adCustomEl = $('txAdCustom') as HTMLTextAreaElement | null;
  const chapterOnEl = $('txChapterOn') as HTMLInputElement | null;
  const chapterReEl = $('txChapterRe') as HTMLInputElement | null;
  const previewEl = $('txPreview');
  const tocEl = $('txToc');
  const statsEl = $('txStats');
  const statusEl = $('txStatus');
  const deviceEl = $('txDevice') as HTMLInputElement | null;
  const destEl = $('txDest') as HTMLInputElement | null;
  const probeEl = $('txProbe');
  const devStatusEl = $('txDeviceStatus');

  const state: State = { buffer: null, rawText: '', usedEnc: '', name: 'onepage-txt.txt' };

  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDevStatus = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };

  // ── Decoding ─────────────────────────────────────────────────────────────
  function decodeBuffer(buf: ArrayBuffer, choice: string): { text: string; enc: string } {
    const tryDecode = (label: string, fatal: boolean) => {
      try {
        return new TextDecoder(label, { fatal }).decode(buf);
      } catch {
        return null;
      }
    };
    if (choice !== 'auto') {
      const text = tryDecode(choice, false) ?? tryDecode('utf-8', false) ?? '';
      return { text, enc: choice };
    }
    // Auto: trust strict UTF-8, else fall back to the most common CJK codepages.
    const utf8 = tryDecode('utf-8', true);
    if (utf8 !== null) return { text: utf8, enc: 'utf-8' };
    for (const label of ['gb18030', 'big5', 'shift_jis', 'euc-kr']) {
      const d = tryDecode(label, false);
      if (d) return { text: d, enc: label };
    }
    return { text: tryDecode('utf-8', false) ?? '', enc: 'utf-8' };
  }

  // ── Processing ───────────────────────────────────────────────────────────
  function customPatterns(): RegExp[] {
    const raw = adCustomEl?.value || '';
    const out: RegExp[] = [];
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        out.push(new RegExp(s, 'i'));
      } catch {
        /* ignore invalid user regex */
      }
    }
    return out;
  }

  function chapterRe(): RegExp | null {
    if (!chapterOnEl?.checked) return null;
    try {
      return new RegExp(chapterReEl?.value || CHAPTER_DEFAULT, 'i');
    } catch {
      return null;
    }
  }

  function process(): { text: string; chapters: string[] } {
    let text = state.rawText.replace(/^\uFEFF/, '');
    // Unify line breaks to \n.
    text = text.replace(/\r\n?/g, '\n');

    let lines = text.split('\n');
    if (trimEl?.checked) lines = lines.map((l) => l.replace(/[ \t\u3000]+$/, ''));
    if (stripAdsEl?.checked) {
      const pats = AD_PATTERNS.concat(customPatterns());
      lines = lines.filter((l) => {
        const t = l.trim();
        if (t && SEPARATOR_LINE.test(t)) return false;
        return !pats.some((p) => p.test(l));
      });
    }

    // Collapse runs of blank lines (max one blank between blocks), array-based
    // to keep the source free of fragile multi-line regexes.
    if (collapseEl?.checked) {
      const collapsed: string[] = [];
      let blankRun = 0;
      for (const l of lines) {
        if (l.trim() === '') {
          blankRun++;
          if (blankRun <= 1) collapsed.push('');
        } else {
          blankRun = 0;
          collapsed.push(l);
        }
      }
      while (collapsed.length && collapsed[0] === '') collapsed.shift();
      lines = collapsed;
    } else {
      while (lines.length && lines[0].trim() === '') lines.shift();
    }
    const out = lines.join(String.fromCharCode(10)).replace(/\s+$/, '') + String.fromCharCode(10);

    const re = chapterRe();
    const chapters: string[] = [];
    if (re) {
      for (const l of out.split('\n')) {
        const t = l.trim();
        if (t && t.length <= 40 && re.test(t)) chapters.push(t);
      }
    }
    return { text: out, chapters };
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function updateView() {
    if (!state.buffer) {
      if (previewEl) previewEl.textContent = T.previewEmpty;
      if (tocEl) tocEl.innerHTML = '';
      if (statsEl) statsEl.textContent = '';
      return;
    }
    setStatus(T.processing);
    const { text, chapters } = process();
    const lines = text.split('\n');
    const nonSpace = text.replace(/\s+/g, '').length;
    const bytes = new Blob([text]).size;
    if (statsEl) {
      statsEl.textContent = [
        `${T.lblChars}: ${nonSpace.toLocaleString()}`,
        `${T.lblLines}: ${lines.length.toLocaleString()}`,
        `${T.lblChapters}: ${chapters.length.toLocaleString()}`,
        `${T.lblSize}: ${fmtBytes(bytes)}`,
        `${T.lblEncoding}: ${state.usedEnc}`,
      ].join('  ·  ');
    }
    if (previewEl) {
      const head = text.slice(0, 4000);
      previewEl.textContent = head + (text.length > head.length ? '\n…' : '');
    }
    if (tocEl) {
      tocEl.innerHTML = '';
      if (chapters.length) {
        const cap = chapters.slice(0, 300);
        for (const c of cap) {
          const li = document.createElement('li');
          li.className = 'tx-toc-item';
          li.textContent = c;
          tocEl.appendChild(li);
        }
        if (chapters.length > cap.length) {
          const li = document.createElement('li');
          li.className = 'tx-toc-more';
          li.textContent = '…';
          tocEl.appendChild(li);
        }
      }
    }
    setStatus(T.ready);
  }

  // ── File loading ───────────────────────────────────────────────────────────
  function loadFile(file: File | undefined | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      state.buffer = buf;
      state.name = file.name.replace(/\.[^.]+$/, '') + '.txt';
      const choice = encEl?.value || 'auto';
      const { text, enc } = decodeBuffer(buf, choice);
      state.rawText = text;
      state.usedEnc = enc;
      if (fileNameEl) fileNameEl.textContent = file.name;
      dropEl?.classList.add('has-file');
      updateView();
    };
    reader.readAsArrayBuffer(file);
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

  encEl?.addEventListener('change', () => {
    if (!state.buffer) return;
    const { text, enc } = decodeBuffer(state.buffer, encEl.value || 'auto');
    state.rawText = text;
    state.usedEnc = enc;
    updateView();
  });

  [stripAdsEl, collapseEl, trimEl, chapterOnEl].forEach((el) =>
    el?.addEventListener('change', updateView),
  );
  chapterReEl?.addEventListener('input', updateView);
  adCustomEl?.addEventListener('input', updateView);

  // ── Export / download / push ────────────────────────────────────────────────
  function cleanedBlob(): Blob | null {
    if (!state.buffer) return null;
    const { text } = process();
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  }

  $('txDownload')?.addEventListener('click', () => {
    if (!state.buffer) {
      setStatus(T.noFile);
      return;
    }
    const blob = cleanedBlob();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus(T.ready);
  });

  function deviceBase(): string {
    return (deviceEl?.value || '').trim().replace(/\/$/, '');
  }
  function saveDevice() {
    if (deviceEl) localStorage.setItem('onepage.txt.device', deviceEl.value.trim());
    if (destEl) localStorage.setItem('onepage.txt.dest', destEl.value.trim());
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

  $('txPush')?.addEventListener('click', async () => {
    if (!state.buffer) {
      setStatus(T.noFile);
      return;
    }
    saveDevice();
    const base = deviceBase();
    const dest = (destEl?.value || '/books').trim() || '/';
    const blob = cleanedBlob();
    if (!blob || !base) {
      setStatus(T.pushFailed);
      return;
    }
    setStatus(T.processing);
    try {
      const fd = new FormData();
      fd.append('file', blob, state.name);
      const r = await fetch(`${base}/upload?path=${encodeURIComponent(dest)}`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(String(r.status));
      setStatus(T.pushed);
      setDevStatus(T.deviceOnline);
    } catch {
      setStatus(T.pushFailed);
      probeDevice();
    }
  });

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.txt.device') || 'http://192.168.4.1';
  if (destEl) destEl.value = localStorage.getItem('onepage.txt.dest') || '/books';

  updateView();
}
