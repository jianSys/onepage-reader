// Reading Stats Dashboard runtime. Pull the device's cumulative reading stats from
// GET /api/stats (the one endpoint that sends a permissive CORS header, so the
// browser can actually read the JSON), show the raw totals plus derived pace
// metrics, and — because the device only exposes running totals, not history —
// keep a local snapshot on every successful read so the reader can watch their own
// per-day reading trend build up across visits. No file input; this tool talks to
// the reader over the LAN / open AP, exactly like the card studio's live fetch.
//
// The number formatting and trend math (formatDuration / deriveMetrics /
// dailySeries / summaryText) are pure and unit-tested in Node; only initStatsBoard
// touches the page and canvas.

export interface DeviceStats {
  totalReadingSeconds: number;
  totalPagesTurns: number;
  readingSessions: number;
  uptime: number;
}

export interface Snapshot {
  t: number; // ms epoch when recorded
  sec: number; // totalReadingSeconds at that time
  pages: number; // totalPagesTurns
  sessions: number; // readingSessions
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function parseStats(j: any): DeviceStats {
  return {
    totalReadingSeconds: Math.floor(num(j?.totalReadingSeconds)),
    totalPagesTurns: Math.floor(num(j?.totalPagesTurns)),
    readingSessions: Math.floor(num(j?.readingSessions)),
    uptime: Math.floor(num(j?.uptime)),
  };
}

// Human duration: 3 天 5 小时 / 5 小时 12 分 / 12 分钟 / 45 秒 (zh) — same shape in
// en with d / h / m / s.
export function formatDuration(secs: number, zh: boolean): string {
  const s = Math.max(0, Math.floor(secs));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return zh ? `${d} 天 ${h} 小时` : `${d}d ${h}h`;
  if (h > 0) return zh ? `${h} 小时 ${m} 分` : `${h}h ${m}m`;
  if (m > 0) return zh ? `${m} 分钟` : `${m}m`;
  return zh ? `${sec} 秒` : `${sec}s`;
}

export interface DerivedMetrics {
  avgSessionSec: number; // reading time per session
  pagesPerSession: number;
  pagesPerHour: number; // reading pace
}

export function deriveMetrics(s: DeviceStats): DerivedMetrics {
  const hours = s.totalReadingSeconds / 3600;
  return {
    avgSessionSec: s.readingSessions > 0 ? s.totalReadingSeconds / s.readingSessions : 0,
    pagesPerSession: s.readingSessions > 0 ? s.totalPagesTurns / s.readingSessions : 0,
    pagesPerHour: hours > 0 ? s.totalPagesTurns / hours : 0,
  };
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// The device only reports cumulative totals, so a "trend" is derived from the
// local snapshots: the reading-time delta between consecutive snapshots is
// attributed to the day of the later one, then bucketed into the last `days`
// calendar days (ending today). Returns one bar per day, oldest first.
export function dailySeries(snaps: Snapshot[], days: number, now = Date.now()): { label: string; sec: number }[] {
  const chronological = [...snaps].sort((a, b) => a.t - b.t);
  const perDay = new Map<string, number>();
  for (let i = 1; i < chronological.length; i++) {
    const delta = Math.max(0, chronological[i].sec - chronological[i - 1].sec);
    if (delta === 0) continue;
    const key = dayKey(chronological[i].t);
    perDay.set(key, (perDay.get(key) || 0) + delta);
  }
  const out: { label: string; sec: number }[] = [];
  const dayMs = 86400000;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    out.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, sec: perDay.get(key) || 0 });
  }
  return out;
}

// A plain-text summary the reader can copy / paste elsewhere.
export function summaryText(s: DeviceStats, zh: boolean): string {
  const d = deriveMetrics(s);
  if (zh) {
    return [
      'OnePage 阅读统计',
      `累计阅读：${formatDuration(s.totalReadingSeconds, true)}（${s.readingSessions} 次会话）`,
      `累计翻页：${s.totalPagesTurns} 页`,
      `平均每会话：${formatDuration(d.avgSessionSec, true)} · ${Math.round(d.pagesPerSession)} 页`,
      `阅读速度：${Math.round(d.pagesPerHour)} 页/小时`,
    ].join('\n');
  }
  return [
    'OnePage reading stats',
    `Total reading: ${formatDuration(s.totalReadingSeconds, false)} (${s.readingSessions} sessions)`,
    `Page turns: ${s.totalPagesTurns}`,
    `Per session: ${formatDuration(d.avgSessionSec, false)} · ${Math.round(d.pagesPerSession)} pages`,
    `Pace: ${Math.round(d.pagesPerHour)} pages/hour`,
  ].join('\n');
}

// ── DOM wiring ────────────────────────────────────────────────────────────────

export interface SbStrings {
  checking: string;
  reading: string;
  online: string;
  offline: string;
  fetched: string;
  fetchFailed: string;
  noAddr: string;
  cleared: string;
  copied: string;
  copyFailed: string;
  trendEmpty: string; // shown until >=2 snapshots exist
  dash: string; // placeholder '—'
}

const HISTORY_KEY = 'onepage.statsboard.snapshots';
const TREND_DAYS = 14;

function loadSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x: any) => x && typeof x.t === 'number') : [];
  } catch {
    return [];
  }
}
function saveSnapshots(list: Snapshot[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-365)));
  } catch {
    /* storage optional */
  }
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function initStatsBoard(props: { strings: SbStrings; zh: boolean }) {
  const T = props.strings;
  const zh = props.zh;
  const $ = (id: string) => document.getElementById(id);
  const deviceEl = $('sbDevice') as HTMLInputElement | null;
  const statusEl = $('sbStatus');
  const devStatusEl = $('sbDeviceStatus');
  const canvas = $('sbTrend') as HTMLCanvasElement | null;
  const trendNoteEl = $('sbTrendNote');

  let last: DeviceStats | null = null;

  const setStatus = (m: string) => {
    if (statusEl) statusEl.textContent = m;
  };
  const setDev = (m: string) => {
    if (devStatusEl) devStatusEl.textContent = m;
  };
  const setStat = (id: string, v: string) => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  const deviceBase = () => (deviceEl?.value || '').trim().replace(/\/$/, '');

  function drawTrend() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const snaps = loadSnapshots();
    const series = dailySeries(snaps, TREND_DAYS);
    const max = Math.max(...series.map((d) => d.sec), 1);
    const pad = 6;
    const bw = (W - pad * 2) / series.length;
    // baseline
    ctx.strokeStyle = 'rgba(17,17,17,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, H - pad - 12);
    ctx.lineTo(W - pad, H - pad - 12);
    ctx.stroke();
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    series.forEach((d, i) => {
      const x = pad + i * bw;
      const usable = H - pad * 2 - 14;
      const h = d.sec > 0 ? Math.max(2, (d.sec / max) * usable) : 0;
      ctx.fillStyle = d.sec > 0 ? '#b0562a' : 'rgba(17,17,17,0.08)';
      const barH = d.sec > 0 ? h : 2;
      ctx.fillRect(x + bw * 0.22, H - pad - 14 - barH, bw * 0.56, barH);
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(17,17,17,0.45)';
        ctx.fillText(d.label, x + bw / 2, H - pad - 2);
      }
    });
    const total = series.reduce((n, d) => n + d.sec, 0);
    if (trendNoteEl) {
      trendNoteEl.textContent =
        snaps.length < 2 ? T.trendEmpty : `${zh ? '最近 14 天累计' : 'Last 14 days'} ${formatDuration(total, zh)} · ${snaps.length} ${zh ? '次快照' : 'snapshots'}`;
    }
  }

  function render(s: DeviceStats) {
    last = s;
    const d = deriveMetrics(s);
    setStat('sbTime', formatDuration(s.totalReadingSeconds, zh));
    setStat('sbSessions', fmt(s.readingSessions));
    setStat('sbPages', fmt(s.totalPagesTurns));
    setStat('sbUptime', formatDuration(s.uptime, zh));
    setStat('sbAvgSession', d.avgSessionSec ? formatDuration(d.avgSessionSec, zh) : T.dash);
    setStat('sbPagesSession', s.readingSessions ? Math.round(d.pagesPerSession).toLocaleString() : T.dash);
    setStat('sbPace', s.totalReadingSeconds ? `${Math.round(d.pagesPerHour).toLocaleString()} ${zh ? '页/时' : 'p/h'}` : T.dash);
    drawTrend();
  }

  function renderEmpty() {
    ['sbTime', 'sbSessions', 'sbPages', 'sbUptime', 'sbAvgSession', 'sbPagesSession', 'sbPace'].forEach((id) => setStat(id, T.dash));
    drawTrend();
  }

  async function probe() {
    const base = deviceBase();
    if (!base) {
      setDev(T.noAddr);
      return;
    }
    setDev(T.checking);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      await fetch(`${base}/api/status`, { mode: 'no-cors', signal: ctrl.signal });
      setDev(T.online);
    } catch {
      setDev(T.offline);
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh() {
    const base = deviceBase();
    if (!base) {
      setStatus(T.noAddr);
      setDev(T.offline);
      return;
    }
    setStatus(T.reading);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      let j: any;
      try {
        j = await (await fetch(`${base}/api/stats`, { signal: ctrl.signal })).json();
      } finally {
        clearTimeout(timer);
      }
      const s = parseStats(j);
      // Record a snapshot only when the totals moved (or first ever read).
      const snaps = loadSnapshots();
      const prev = snaps[snaps.length - 1];
      if (!prev || prev.sec !== s.totalReadingSeconds || prev.pages !== s.totalPagesTurns || prev.sessions !== s.readingSessions) {
        snaps.push({ t: Date.now(), sec: s.totalReadingSeconds, pages: s.totalPagesTurns, sessions: s.readingSessions });
        saveSnapshots(snaps);
      }
      render(s);
      setDev(T.online);
      setStatus(T.fetched);
    } catch {
      setDev(T.offline);
      setStatus(T.fetchFailed);
    }
  }

  $('sbProbe')?.addEventListener('click', () => {
    if (deviceEl) localStorage.setItem('onepage.sb.device', deviceEl.value.trim());
    probe();
  });
  $('sbRefresh')?.addEventListener('click', () => {
    if (deviceEl) localStorage.setItem('onepage.sb.device', deviceEl.value.trim());
    refresh();
  });
  $('sbClear')?.addEventListener('click', () => {
    saveSnapshots([]);
    drawTrend();
    setStatus(T.cleared);
  });
  $('sbCopy')?.addEventListener('click', async () => {
    if (!last) {
      setStatus(T.noAddr);
      return;
    }
    const text = summaryText(last, zh);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(T.copied);
    } catch {
      setStatus(T.copyFailed);
    }
  });

  if (deviceEl) deviceEl.value = localStorage.getItem('onepage.sb.device') || 'http://192.168.4.1';
  renderEmpty();
}
