// Card templates. Each entry is { id, category, draw, items?, live? } and is the
// only place a new card type touches. The picker groups by category, the editor
// shows/hides the "Lines" field per `items`, and live cards re-tick per second.
// Adding a card = write one draw + add one line here + a name/hint in i18n.

import {
  W,
  H,
  INK,
  SERIF,
  fitText,
  fitSingleLine,
  headerRule,
  today,
  wxInfo,
  drawWeatherIcon,
  roundRect,
  centeredText,
  verticalRun,
  drawImageFitted,
  label,
  type CardView,
  type CategoryId,
  type TemplateDef,
} from './primitives';
import qrcode from 'qrcode-generator';

const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isZh = (v: CardView) => v.lang === 'zh';

// ── Original four ────────────────────────────────────────────────────────────

function drawQuote(ctx: CanvasRenderingContext2D, s: CardView) {
  const dark = s.values?.dark === true;
  const fg = dark ? '#ffffff' : INK;
  const mut = dark ? 'rgba(255,255,255,0.55)' : 'rgba(17,17,17,0.5)';
  if (dark) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
  }
  const M = 64;
  // Editorial chrome: a tracked kicker + a short heavy rule, then the hero line.
  label(ctx, isZh(s) ? '金句' : 'Quote', M, 138, { size: 18, color: mut });
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(M, 168);
  ctx.lineTo(M + 56, 168);
  ctx.stroke();
  const text = s.content || (isZh(s) ? '壹页之上，静读之间。' : 'Stay hungry, stay foolish.');
  const { size, lines } = fitText(ctx, text, W - M * 2, H - 380, 68, 1.26);
  ctx.fillStyle = fg;
  ctx.font = `${size}px ${SERIF}`;
  const lineH = size * 1.26;
  let y = (H - lines.length * lineH) / 2 + size * 0.82;
  for (const l of lines) {
    ctx.fillText(l, M, y);
    y += lineH;
  }
  if (s.sub) {
    label(ctx, '— ' + s.sub, M, H - 100, { size: 19, color: mut, sans: true });
  }
  ctx.fillStyle = fg;
}

function drawWeather(ctx: CanvasRenderingContext2D, s: CardView) {
  const zh = isZh(s);
  const wd = s.weather || { place: s.sub || '—', temp: 21, code: 1, days: [] };
  const info = wxInfo(wd.code);
  label(ctx, zh ? '今日天气 · Weather' : 'Weather', W / 2, 92, { size: 16, align: 'center' });
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `bold 42px ${SERIF}`;
  ctx.fillText(wd.place, W / 2, 150);
  ctx.textAlign = 'left';
  headerRule(ctx, 190);
  drawWeatherIcon(ctx, info.icon, 150, 300, 84);
  const tempStr = `${Math.round(wd.temp)}°`;
  let ts = 120;
  ctx.fillStyle = INK;
  ctx.font = `bold ${ts}px ${SERIF}`;
  while (ctx.measureText(tempStr).width > W - 248 - 40 && ts > 60) {
    ts -= 6;
    ctx.font = `bold ${ts}px ${SERIF}`;
  }
  ctx.fillText(tempStr, 248, 340);
  ctx.font = `30px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.8)';
  ctx.fillText(info.t, 64, 430);
  const days = wd.days.slice(0, 4);
  if (days.length) {
    label(ctx, zh ? '未来几日 · Days Ahead' : 'Days Ahead', W / 2, 500, { size: 15, align: 'center' });
    const colW = (W - 96) / days.length;
    days.forEach((d, i) => {
      const cx = 48 + colW * i + colW / 2;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.font = `24px ${SERIF}`;
      ctx.fillText(d.label, cx, 550);
      drawWeatherIcon(ctx, wxInfo(d.code).icon, cx, 604, 28);
      ctx.font = `26px ${SERIF}`;
      ctx.fillText(`${Math.round(d.hi)}° / ${Math.round(d.lo)}°`, cx, 672);
    });
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = INK;
}

function drawStatus(ctx: CanvasRenderingContext2D, s: CardView) {
  const big = s.content || '128';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `64px ${SERIF}`;
  if (s.sub) ctx.fillText(s.sub, W / 2, 120);
  let size = 260;
  ctx.font = `${size}px ${SERIF}`;
  while (ctx.measureText(big).width > W - 96 && size > 60) {
    size -= 12;
    ctx.font = `${size}px ${SERIF}`;
  }
  ctx.fillText(big, W / 2, 300 + size * 0.28);
  ctx.textAlign = 'left';
  headerRule(ctx, 470);
  const rows = s.items.filter(Boolean).slice(0, 8);
  let y = 528;
  for (const row of rows) {
    const [k, v] = row.split(/[:：]/, 2);
    ctx.fillStyle = INK;
    ctx.font = `26px ${SERIF}`;
    ctx.fillText((k || '').trim(), 56, y);
    if (v !== undefined) {
      ctx.textAlign = 'right';
      ctx.fillText(v.trim(), W - 56, y);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = 'rgba(17,17,17,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, y + 14);
    ctx.lineTo(W - 56, y + 14);
    ctx.stroke();
    y += 46;
  }
}

function drawTodo(ctx: CanvasRenderingContext2D, s: CardView) {
  const zh = isZh(s);
  label(ctx, zh ? '待办清单 · To-do' : 'To-do', W / 2, 96, { size: 15, align: 'center' });
  ctx.fillStyle = INK;
  ctx.font = `bold 46px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.content || (zh ? '待办' : 'To-do'), W / 2, 152);
  ctx.textAlign = 'left';
  const rows0 = s.items.filter(Boolean);
  const doneCount = rows0.filter((r) => /^[\[\s]*[xX✓]/.test(r) || r.startsWith('[x]') || r.startsWith('√')).length;
  const subTxt = s.sub ? String(s.sub) : `${doneCount}/${rows0.length} ${zh ? '已完成' : 'done'}`;
  label(ctx, subTxt, W / 2, 190, { size: 16, align: 'center', sans: true });
  headerRule(ctx, 214);
  const rows = rows0.slice(0, 6);
  let y = 272;
  const box = 26;
  for (const row of rows) {
    const done = /^[\[\s]*[xX✓]/.test(row) || row.startsWith('[x]') || row.startsWith('√');
    const label = row.replace(/^(\[[ xX]\]\s*|√\s*|[xX✓]\s*)/, '');
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(56, y - box, box, box);
    if (done) {
      ctx.beginPath();
      ctx.moveTo(60, y - box / 2);
      ctx.lineTo(56 + box * 0.4, y - 4);
      ctx.lineTo(56 + box, y - box + 4);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    const { size, lines } = fitText(ctx, label, W - 56 - box - 72, box * 3, 30, 1.2, 20);
    ctx.font = `${size}px ${SERIF}`;
    let ly = y - box + size;
    for (const l of lines) {
      ctx.fillText(l, 56 + box + 20, ly);
      ly += size * 1.2;
    }
    if (done) {
      ctx.strokeStyle = 'rgba(17,17,17,0.55)';
      ctx.beginPath();
      ctx.moveTo(56 + box + 20, y - box + size * 0.5);
      ctx.lineTo(56 + box + 20 + ctx.measureText(lines[0] || '').width, y - box + size * 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(17,17,17,0.16)';
    ctx.beginPath();
    ctx.moveTo(56, y + 24);
    ctx.lineTo(W - 56, y + 24);
    ctx.stroke();
    y += Math.max(box + 44, ly - (y - box) + 34);
  }
}

// ── New templates ──────────────────────────────────────────────────────────

function drawClock(ctx: CanvasRenderingContext2D, v: CardView) {
  const now = new Date();
  const zh = isZh(v);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  if (v.sub) centeredText(ctx, 30, 150, v.sub);
  const big = `${hh}:${mm}`;
  const size = fitSingleLine(ctx, big, W - 96, 220, 90);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `${size}px ${SERIF}`;
  ctx.fillText(big, W / 2 - 40, 400);
  ctx.font = `${size * 0.32}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText(ss, W / 2 - 40 + ctx.measureText(big).width / 2 - 10, 400);
  headerRule(ctx, 470);
  const wd = (zh ? WD_ZH : WD_EN)[now.getDay()];
  const dateStr = zh
    ? `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
    : `${MO_EN[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `34px ${SERIF}`;
  ctx.fillText(`${dateStr} · ${wd}`, W / 2, 540);
  ctx.textAlign = 'left';
}

function drawDateCard(ctx: CanvasRenderingContext2D, v: CardView) {
  const now = new Date();
  const zh = isZh(v);
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayNum = now.getDate();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  const title = zh ? `${year} 年 ${month + 1} 月` : `${MO_EN[month]} ${year}`;
  ctx.font = `52px ${SERIF}`;
  ctx.fillText(title, W / 2, 140);
  ctx.textAlign = 'left';
  headerRule(ctx, 180);
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const headers = zh ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const colW = (W - 96) / 7;
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  headers.forEach((h, i) => ctx.fillText(h, 48 + colW * i + colW / 2 - 10, 232));
  ctx.fillStyle = INK;
  ctx.font = `30px ${SERIF}`;
  const rowH = 74;
  const top = 288;
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = startDow + (d - 1);
    const col = cell % 7;
    const row = Math.floor(cell / 7);
    const cx = 48 + colW * col + colW / 2;
    const cy = top + row * rowH;
    if (d === todayNum) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = INK;
    }
    ctx.textAlign = 'center';
    ctx.fillText(String(d), cx, cy);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
}

function drawCountdown(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const cx = W / 2, cy = 396, R = 168;
  label(ctx, zh ? '倒计时 · Countdown' : 'Countdown', cx, 150, { size: 18, align: 'center' });
  const target = Date.parse(v.sub);
  const days = Number.isNaN(target) ? null : Math.ceil((target - Date.now()) / 86400000);
  const abs = days === null ? 0 : Math.abs(days);
  const frac = days === null ? 0 : Math.max(0, Math.min(1, abs / 365));
  // Dial: a light track ring + a dark progress arc sweeping from the top.
  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  // Tick marks around the inner edge (major every 5th).
  ctx.strokeStyle = 'rgba(17,17,17,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const r1 = R - 34;
    const r2 = i % 5 === 0 ? R - 48 : R - 42;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
  // Center number + unit.
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  let size = 150;
  const num = days === null ? '—' : String(abs);
  ctx.font = `bold ${size}px ${SERIF}`;
  while (ctx.measureText(num).width > R * 1.5 && size > 60) {
    size -= 10;
    ctx.font = `bold ${size}px ${SERIF}`;
  }
  ctx.fillText(num, cx, cy + size * 0.28);
  label(ctx, zh ? '天 · Days' : 'Days', cx, cy + 66, { size: 18, align: 'center' });
  // Event name + date + note under the dial.
  ctx.fillStyle = INK;
  ctx.font = `bold 42px ${SERIF}`;
  ctx.fillText(v.content || (zh ? '距离' : 'Until'), cx, 648);
  if (days !== null) {
    const d = new Date(target);
    const p = (n: number) => String(n).padStart(2, '0');
    const wd = (zh ? WD_ZH : WD_EN)[d.getDay()];
    label(ctx, `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} · ${wd}`, cx, 692, { size: 16, align: 'center', sans: true });
  } else {
    label(ctx, zh ? '在下方填目标日期' : 'Set a target date', cx, 692, { size: 15, align: 'center', sans: true });
  }
  const note = (v.values?.note as string) || '';
  if (note) {
    ctx.fillStyle = 'rgba(17,17,17,0.6)';
    ctx.font = `italic 24px ${SERIF}`;
    ctx.fillText(note, cx, 744);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
}

function drawProgress(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const pct = Math.max(0, Math.min(100, parseFloat(v.sub) || 0));
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `150px ${SERIF}`;
  ctx.fillText(`${Math.round(pct)}%`, W / 2, 300);
  ctx.textAlign = 'left';
  ctx.font = `40px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(v.content || (zh ? '进度' : 'Progress'), W / 2, 380);
  ctx.textAlign = 'left';
  const bx = 56, bw = W - 112, by = 470, bh = 40;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.stroke();
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.fillRect(bx, by, (bw * pct) / 100, bh);
  ctx.restore();
  const rows = v.items.filter(Boolean).slice(0, 5);
  let y = 580;
  ctx.fillStyle = INK;
  ctx.font = `26px ${SERIF}`;
  for (const row of rows) {
    ctx.textAlign = 'center';
    ctx.fillText(row, W / 2, y);
    y += 42;
  }
  ctx.textAlign = 'left';
}

function drawHabit(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 32, 150, v.content || (zh ? '连续打卡' : 'Streak'));
  const n = parseInt(v.sub, 10);
  const days = Number.isNaN(n) ? 0 : n;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `200px ${SERIF}`;
  ctx.fillText(String(days), W / 2, 400);
  ctx.font = `36px ${SERIF}`;
  ctx.fillText(zh ? '天' : 'days', W / 2, 460);
  headerRule(ctx, 510);
  const cells = 14;
  const filled = Math.min(cells, days);
  const gap = 8;
  const cw = (W - 96 - gap * (cells - 1)) / cells;
  const cy = 560;
  for (let i = 0; i < cells; i++) {
    const x = 48 + i * (cw + gap);
    if (i < filled) {
      ctx.fillStyle = INK;
      roundRect(ctx, x, cy, cw, cw, 6);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(17,17,17,0.4)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, cy, cw, cw, 6);
      ctx.stroke();
    }
  }
  ctx.fillStyle = INK;
}

function drawPoem(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const text = v.content || (zh ? '床前明月光，\n疑是地上霜。' : 'The moonlight before my bed,\nlike frost upon the ground.');
  ctx.fillStyle = INK;
  ctx.font = `44px ${SERIF}`;
  const lines = text.split('\n');
  const lineH = 78;
  let y = (H - lines.length * lineH) / 2 + 30;
  ctx.textAlign = 'center';
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lineH;
  }
  if (v.sub) {
    ctx.font = `italic 28px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.fillText('— ' + v.sub, W / 2, y + 20);
  }
  ctx.textAlign = 'left';
}

function drawBigtype(ctx: CanvasRenderingContext2D, v: CardView) {
  const text = v.content || (isZh(v) ? '专注' : 'FOCUS');
  const { size, lines } = fitText(ctx, text, W - 96, H - 240, 160, 1.1, 40);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `bold ${size}px ${SERIF}`;
  const lineH = size * 1.1;
  let y = (H - lines.length * lineH) / 2 + size * 0.82;
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lineH;
  }
  if (v.sub) {
    ctx.font = `26px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.6)';
    ctx.fillText(v.sub, W / 2, H - 80);
  }
  ctx.textAlign = 'left';
}

function drawWord(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const term = v.content || (zh ? '从容' : 'serendipity');
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  const size = fitSingleLine(ctx, term, W - 96, 96, 40);
  ctx.font = `${size}px ${SERIF}`;
  ctx.fillText(term, W / 2, 200);
  ctx.textAlign = 'left';
  if (v.sub) {
    ctx.font = `italic 30px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(v.sub, W / 2, 252);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
  }
  headerRule(ctx, 300);
  const rows = v.items.filter(Boolean).slice(0, 6);
  let y = 356;
  for (const row of rows) {
    const { size: s2, lines } = fitText(ctx, row, W - 160, 200, 30, 1.3, 20);
    ctx.fillStyle = INK;
    ctx.font = `${s2}px ${SERIF}`;
    let ly = y;
    for (const l of lines) {
      ctx.fillText(l, 80, ly);
      ly += s2 * 1.3;
    }
    ctx.fillStyle = 'rgba(17,17,17,0.4)';
    ctx.beginPath();
    ctx.arc(62, y - s2 * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();
    y = Math.max(ly, y + 46);
  }
}

function drawChecklist(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  label(ctx, zh ? '清单 · Checklist' : 'Checklist', W / 2, 96, { size: 15, align: 'center' });
  ctx.fillStyle = INK;
  ctx.font = `bold 46px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(v.content || (zh ? '清单' : 'Checklist'), W / 2, 152);
  ctx.textAlign = 'left';
  if (v.sub) label(ctx, String(v.sub), W / 2, 190, { size: 16, align: 'center', sans: true });
  headerRule(ctx, 214);
  const rows = v.items.filter(Boolean).slice(0, 8);
  let y = 262;
  ctx.font = `32px ${SERIF}`;
  rows.forEach((raw, i) => {
    const done = /^(\[[xX]\]|√|x)/.test(raw.trim());
    const label = raw.replace(/^(\[[ xX]\]\s*|√\s*|[xX]\s*)/, '');
    ctx.fillStyle = 'rgba(17,17,17,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}.`, 56, y);
    const { size, lines } = fitText(ctx, label, W - 56 - 60 - 56, 120, 30, 1.25, 20);
    ctx.fillStyle = INK;
    ctx.font = `${size}px ${SERIF}`;
    let ly = y;
    for (const l of lines) {
      if (done) {
        ctx.fillStyle = 'rgba(17,17,17,0.4)';
      }
      ctx.fillText(l, 96, ly);
      ly += size * 1.25;
    }
    if (done) {
      ctx.strokeStyle = 'rgba(17,17,17,0.4)';
      ctx.beginPath();
      ctx.moveTo(96, y - size * 0.3);
      ctx.lineTo(96 + ctx.measureText(lines[0] || '').width, y - size * 0.3);
      ctx.stroke();
      ctx.fillStyle = INK;
    }
    ctx.font = `32px ${SERIF}`;
    y = Math.max(ly + 30, y + 56);
  });
}

function drawReading(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  label(ctx, zh ? '正在读 · Now Reading' : 'Now Reading', 56, 112, { size: 16 });
  const book = v.content || (zh ? '《瓦尔登湖》' : 'Walden');
  const { size, lines } = fitText(ctx, book, W - 96, 260, 60, 1.2, 30);
  ctx.fillStyle = INK;
  ctx.font = `bold ${size}px ${SERIF}`;
  let y = 210;
  for (const l of lines) {
    ctx.fillText(l, 56, y);
    y += size * 1.2;
  }
  if (v.sub) {
    ctx.font = `italic 30px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.75)';
    ctx.fillText(v.sub, 56, y + 8);
    y += 60;
  }
  const rows = v.items.filter(Boolean).slice(0, 4);
  const barRow = rows.find((r) => /[:：]/.test(r) && /\d/.test(r));
  let pct: number | null = null;
  if (barRow) {
    const m = barRow.match(/(\d+)\s*%/);
    if (m) pct = Math.min(100, parseInt(m[1], 10));
  }
  y = Math.max(y + 40, 460);
  if (pct !== null) {
    const bx = 56, bw = W - 112, bh = 16;
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(bx, y, bw, bh);
    ctx.fillStyle = INK;
    ctx.fillRect(bx, y, (bw * pct) / 100, bh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, y, bw, bh);
    ctx.fillStyle = INK;
    y += 44;
  }
  ctx.font = `26px ${SERIF}`;
  for (const row of rows) {
    const [k, val] = row.split(/[:：]/, 2);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText((k || '').trim(), 56, y);
    if (val !== undefined) {
      ctx.textAlign = 'right';
      ctx.fillText(val.trim(), W - 56, y);
      ctx.textAlign = 'left';
    }
    y += 40;
  }
}

// ── Reading dashboard: cumulative reading stats pulled from the device ──────
// Sibling of `status`/`reading`, but its content/sub/items can be auto-filled
// from the device's /api/stats endpoint (see studio.ts fetchLive). `content` is
// the hero — total reading time; `items` are "key : value" stat rows.
function drawDashboard(ctx: CanvasRenderingContext2D, s: CardView) {
  const zh = isZh(s);
  label(ctx, zh ? '阅读报告 · Reading Report' : 'Reading Report', W / 2, 104, { size: 15, align: 'center' });
  const big = s.content || (zh ? '0 分钟' : '0 min');
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  let size = 188;
  ctx.font = `${size}px ${SERIF}`;
  while (ctx.measureText(big).width > W - 112 && size > 56) {
    size -= 10;
    ctx.font = `${size}px ${SERIF}`;
  }
  ctx.fillText(big, W / 2, 300 + size * 0.2);
  if (s.sub) {
    ctx.font = `24px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.6)';
    ctx.fillText(s.sub, W / 2, 376);
    ctx.fillStyle = INK;
  }
  ctx.textAlign = 'left';
  headerRule(ctx, 424);
  const rows = s.items.filter(Boolean).slice(0, 6);
  let y = 482;
  for (const row of rows) {
    const [k, v] = row.split(/[:：]/, 2);
    ctx.fillStyle = INK;
    ctx.font = `26px ${SERIF}`;
    ctx.fillText((k || '').trim(), 56, y);
    if (v !== undefined) {
      ctx.textAlign = 'right';
      ctx.fillText(v.trim(), W - 56, y);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = 'rgba(17,17,17,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, y + 14);
    ctx.lineTo(W - 56, y + 14);
    ctx.stroke();
    y += 46;
  }
}

// ── Bookshelf: standing spines on a plank (the visual sibling of `reading`) ──
// One book per item line. Spines cycle through a fixed gray-tone palette (so a
// grayscale export shows real depth, like the reference), widths & heights come
// from a position-keyed multiplier table so a saved card redraws identically.
// Titles run vertically: CJK top-to-bottom, Latin rotated bottom-to-top.
function drawShelf(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  label(ctx, 'Now Reading · 正在读', 48, 132, { size: 18 });
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `bold 44px ${SERIF}`;
  ctx.fillText(v.content || (zh ? '我的书房' : 'My Study'), W / 2, 196);
  if (v.sub) {
    ctx.font = `24px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.65)';
    ctx.fillText(v.sub, W / 2, 236);
  }
  ctx.textAlign = 'left';
  headerRule(ctx, 268);

  const books = v.items.filter(Boolean).slice(0, 8);
  ctx.fillStyle = INK;
  if (!books.length) {
    ctx.textAlign = 'center';
    ctx.font = `28px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.55)';
    ctx.fillText(zh ? '每行填一本书名' : 'One book title per line', W / 2, 480);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    return;
  }

  const left = 48, right = W - 48;
  const shelfTop = 300;
  const plankY = 654;                    // top edge of the plank; spines stand on it
  const usable = right - left;
  const n = books.length;
  const slot = usable / n;
  const wMul = [1, 0.72, 1.12, 0.82, 1.05, 0.7, 1.1, 0.9];
  const hMul = [0.9, 1, 0.82, 0.96, 0.86, 1.02, 0.8, 0.94];
  const maxH = plankY - shelfTop;
  // A gray-tone cycle: fills + a legible text color per tone (dark→white, light→ink).
  const tones = [
    { fill: INK, text: '#ffffff' },
    { fill: '#8c8c8c', text: '#ffffff' },
    { fill: '#dcdcdc', text: INK },
    { fill: '#4a4a4a', text: '#ffffff' },
    { fill: '#ffffff', text: INK },
    { fill: '#bcbcbc', text: INK },
    { fill: '#6b6b6b', text: '#ffffff' },
    { fill: '#ededed', text: INK },
  ];

  books.forEach((raw, i) => {
    const name = raw.trim();
    const w = Math.max(26, Math.min(slot - 8, slot * wMul[i % 8] - 6));
    const x = left + slot * i + (slot - w) / 2;
    const h = maxH * hMul[i % 8];
    const y = plankY - h;
    const tone = tones[i % tones.length];
    ctx.fillStyle = tone.fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    // two thin bands near the head of each spine — a classic binding detail.
    ctx.strokeStyle = tone.text;
    for (const off of [14, 19]) {
      ctx.beginPath();
      ctx.moveTo(x + 5, y + off);
      ctx.lineTo(x + w - 5, y + off);
      ctx.stroke();
    }
    drawSpineTitle(ctx, name, x, y, w, h, tone.text, zh);
  });

  // The plank: solid bar plus a faint shadow line, then a volume count footer.
  ctx.fillStyle = INK;
  ctx.fillRect(left - 8, plankY, usable + 16, 14);
  ctx.fillStyle = 'rgba(17,17,17,0.35)';
  ctx.fillRect(left - 8, plankY + 16, usable + 16, 5);
  label(ctx, zh ? `共 ${books.length} 册 · No.${books.length} this year` : `${books.length} volumes`, W / 2, plankY + 62, { size: 15, align: 'center', sans: true });
}

// Paint one spine's title down its face in `textColor` (chosen for contrast
// against the spine's gray tone). CJK stacks top-to-bottom; Latin runs rotated.
function drawSpineTitle(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  textColor: string,
  zh: boolean,
) {
  ctx.fillStyle = textColor;
  if (zh) {
    const size = Math.min(Math.max(14, w - 12), 26);
    ctx.font = `${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    const cx = x + w / 2;
    const bottom = y + h - 12;
    let ty = y + 34 + size;
    for (const ch of name) {
      if (ty > bottom) break;
      ctx.fillText(ch, cx, ty);
      ty += size + 3;
    }
    ctx.textAlign = 'left';
  } else {
    const size = Math.min(Math.max(12, w - 10), 24);
    ctx.save();
    ctx.translate(x + w / 2, y + h - 16);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `${size}px ${SERIF}`;
    ctx.textAlign = 'left';
    let t = name;
    while (t.length > 1 && ctx.measureText(t).width > h - 44) t = t.slice(0, -1);
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = INK;
}

function moonPhase(now: Date): { phase: number; illum: number } {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
  const days = (now.getTime() - ref) / 86400000;
  const phase = ((days % synodic) + synodic) % synodic / synodic; // 0..1
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { phase, illum };
}

function drawMoon(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const now = new Date();
  const { phase, illum } = moonPhase(now);
  const names_zh = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
  const names_en = ['New', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const idx = Math.round(phase * 8) % 8;
  // Dark night-sky background with a deterministic scattering of stars.
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);
  let s = 41;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H * 0.82, rnd() * 1.3 + 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = W / 2, cy = 300, R = 140;
  // Whole disc in dark gray (reads on the black sky), then the lit part bright.
  ctx.fillStyle = '#6a6a6a';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const waxing = phase < 0.5;
  const k = Math.cos(2 * Math.PI * phase);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI / 2, (3 * Math.PI) / 2, waxing);
  ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, (3 * Math.PI) / 2, Math.PI / 2, k > 0 === !waxing);
  ctx.closePath();
  ctx.fillStyle = '#ececec';
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f4f4';
  ctx.font = `bold 46px ${SERIF}`;
  ctx.fillText(v.content || (zh ? names_zh[idx] : names_en[idx]), W / 2, 522);
  label(ctx, zh ? `照度 ${Math.round(illum * 100)}% · Illumination` : `Illumination ${Math.round(illum * 100)}%`, W / 2, 566, { size: 17, color: 'rgba(255,255,255,0.72)', align: 'center' });
  label(ctx, today(zh ? 'zh' : 'en'), W / 2, 612, { size: 15, color: 'rgba(255,255,255,0.6)', align: 'center', sans: true });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `italic 28px ${SERIF}`;
  ctx.fillText(zh ? '晚安 · good night' : 'Good night', W / 2, 700);
  ctx.textAlign = 'left';
}

// ── Batch 2: more variety (28 total) ────────────────────────────────────────

function isoWeek(now: Date): number {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

function drawGreet(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const now = new Date();
  const h = now.getHours();
  let g = zh ? '夜深了' : 'Good night';
  if (h >= 5 && h < 11) g = zh ? '早上好' : 'Good morning';
  else if (h < 14) g = zh ? '中午好' : 'Good afternoon';
  else if (h < 18) g = zh ? '下午好' : 'Good afternoon';
  else if (h < 23) g = zh ? '晚上好' : 'Good evening';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  const size = fitSingleLine(ctx, v.content || g, W - 96, 92, 44);
  ctx.font = `${size}px ${SERIF}`;
  ctx.fillText(v.content || g, W / 2, 360);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  ctx.font = `76px ${SERIF}`;
  ctx.fillText(`${hh}:${mm}`, W / 2, 470);
  ctx.font = `30px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(v.sub || today(zh ? 'zh' : 'en'), W / 2, 540);
  ctx.textAlign = 'left';
}

function drawWeek(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const now = new Date();
  const week = isoWeek(now);
  const year = now.getFullYear();
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const pct = Math.max(0, Math.min(100, ((now.getTime() - start) / (end - start)) * 100));
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 32, 150, v.content || (zh ? `${year} 年` : `Year ${year}`));
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `200px ${SERIF}`;
  ctx.fillText(String(week), W / 2, 400);
  ctx.font = `34px ${SERIF}`;
  ctx.fillText(zh ? '本周' : 'Week', W / 2, 456);
  ctx.textAlign = 'left';
  headerRule(ctx, 500);
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(zh ? `今年已过 ${Math.round(pct)}%` : `Year ${Math.round(pct)}% elapsed`, 56, 552);
  const bx = 56, bw = W - 112, by = 582, bh = 30;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.stroke();
  ctx.save(); roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
  ctx.fillStyle = INK; ctx.fillRect(bx, by, (bw * pct) / 100, bh); ctx.restore();
  ctx.fillStyle = INK;
}

function drawHaiku(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const text = v.content || (zh ? '旧池\n蛙跃水面\n水声寂' : 'Old silent pond\nA frog jumps into the pond\nSplash! Silence again');
  const lines = text.split('\n');
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `42px ${SERIF}`;
  let y = (H - lines.length * 92) / 2 + 40;
  for (const l of lines) { ctx.fillText(l, W / 2, y); y += 92; }
  if (v.sub) { ctx.font = `italic 26px ${SERIF}`; ctx.fillStyle = 'rgba(17,17,17,0.7)'; ctx.fillText('— ' + v.sub, W / 2, y + 24); }
  ctx.textAlign = 'left';
}

function drawLyric(ctx: CanvasRenderingContext2D, v: CardView) {
  const text = v.content || (isZh(v) ? '把昨天都作废，现在你在我眼前。' : 'Turn the page, start again — you are right here with me.');
  const { size, lines } = fitText(ctx, text, W - 140, H - 360, 52, 1.5);
  ctx.fillStyle = INK;
  ctx.font = `76px ${SERIF}`;
  ctx.fillText('♪', 56, 168);
  ctx.font = `${size}px ${SERIF}`;
  let y = (H - lines.length * size * 1.5) / 2 + size;
  for (const l of lines) { ctx.fillText(l, 64, y); y += size * 1.5; }
  if (v.sub) { ctx.font = `italic 26px ${SERIF}`; ctx.textAlign = 'right'; ctx.fillText('— ' + v.sub, W - 56, H - 100); ctx.textAlign = 'left'; }
}

function drawNote(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const text = v.content || (zh ? '此刻的一个想法' : 'A thought, right now.');
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(ctx, 44, 80, W - 88, H - 220, 14); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `22px ${SERIF}`;
  ctx.fillText((zh ? '便签' : 'NOTE').toUpperCase(), 72, 140);
  ctx.strokeStyle = 'rgba(17,17,17,0.5)'; ctx.beginPath(); ctx.moveTo(72, 160); ctx.lineTo(W - 72, 160); ctx.stroke();
  const { size, lines } = fitText(ctx, text, W - 144, H - 440, 54, 1.45);
  ctx.fillStyle = INK; ctx.font = `${size}px ${SERIF}`;
  let y = 250;
  for (const l of lines) { ctx.fillText(l, 72, y); y += size * 1.45; }
  ctx.fillStyle = 'rgba(17,17,17,0.6)'; ctx.font = `24px ${SERIF}`;
  ctx.fillText(v.sub || today(zh ? 'zh' : 'en'), 44, H - 110);
}

function drawBlessing(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const word = v.content || (zh ? '顺' : 'Fortune');
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(W / 2, 250, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  const size = fitSingleLine(ctx, word, 168, 92, 40);
  ctx.font = `${size}px ${SERIF}`;
  ctx.fillText(word, W / 2, 250 + size * 0.35);
  ctx.font = `30px ${SERIF}`;
  ctx.fillText(v.sub || (zh ? '每日一签' : 'Daily fortune'), W / 2, 440);
  headerRule(ctx, 490);
  const rows = v.items.filter(Boolean).slice(0, 4);
  let y = 540; ctx.font = `28px ${SERIF}`;
  for (const r of rows) { ctx.fillText(r, W / 2, y); y += 44; }
  ctx.textAlign = 'left';
}

function drawRing(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const pct = Math.max(0, Math.min(100, parseFloat(v.sub) || 0));
  const cx = W / 2, cy = 340, R = 150;
  ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(17,17,17,0.22)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pct / 100)); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `84px ${SERIF}`;
  ctx.fillText(`${Math.round(pct)}%`, cx, cy + 12);
  ctx.font = `32px ${SERIF}`;
  ctx.fillText(v.content || (zh ? '今日目标' : "Today's goal"), W / 2, 560);
  ctx.textAlign = 'left';
}

function drawPomodoro(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const done = Math.max(0, parseInt(v.sub, 10) || 0);
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 32, 150, v.content || (zh ? '今日专注' : 'Focus sessions'));
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `180px ${SERIF}`;
  ctx.fillText(String(done), W / 2, 380);
  ctx.font = `30px ${SERIF}`; ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(zh ? '个番茄钟' : 'tomatoes', W / 2, 430);
  const cells = 8, filled = Math.min(cells, done), gap = 14;
  const cw = (W - 96 - gap * (cells - 1)) / cells, cy = 540;
  for (let i = 0; i < cells; i++) {
    const x = 48 + i * (cw + gap);
    ctx.beginPath(); ctx.arc(x + cw / 2, cy + cw / 2, cw / 2, 0, Math.PI * 2);
    if (i < filled) { ctx.fillStyle = INK; ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(17,17,17,0.4)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  ctx.textAlign = 'left';
}

function drawNumbered(ctx: CanvasRenderingContext2D, v: CardView) {
  ctx.fillStyle = INK; ctx.font = `44px ${SERIF}`; ctx.textAlign = 'center';
  ctx.fillText(v.content || (isZh(v) ? '优先级' : 'Priorities'), W / 2, 120); ctx.textAlign = 'left';
  if (v.sub) { ctx.font = `24px ${SERIF}`; ctx.fillStyle = 'rgba(17,17,17,0.7)'; ctx.textAlign = 'center'; ctx.fillText(v.sub, W / 2, 158); ctx.textAlign = 'left'; ctx.fillStyle = INK; }
  headerRule(ctx, 192);
  const rows = v.items.filter(Boolean).slice(0, 8);
  let y = 260;
  rows.forEach((raw, i) => {
    ctx.fillStyle = 'rgba(17,17,17,0.4)'; ctx.font = `40px ${SERIF}`; ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), 56, y + 12);
    const { size, lines } = fitText(ctx, raw, W - 56 - 60 - 56, 200, 32, 1.3, 22);
    ctx.fillStyle = INK; ctx.font = `${size}px ${SERIF}`;
    let ly = y; for (const l of lines) { ctx.fillText(l, 112, ly); ly += size * 1.3; }
    ctx.strokeStyle = 'rgba(17,17,17,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(56, ly + 4); ctx.lineTo(W - 56, ly + 4); ctx.stroke();
    y = Math.max(ly + 40, y + 72);
  });
}

function drawGroceries(ctx: CanvasRenderingContext2D, v: CardView) {
  ctx.fillStyle = INK; ctx.font = `44px ${SERIF}`; ctx.textAlign = 'center';
  ctx.fillText(v.content || (isZh(v) ? '购物清单' : 'Shopping'), W / 2, 120); ctx.textAlign = 'left';
  if (v.sub) { ctx.font = `24px ${SERIF}`; ctx.fillStyle = 'rgba(17,17,17,0.7)'; ctx.textAlign = 'center'; ctx.fillText(v.sub, W / 2, 158); ctx.textAlign = 'left'; ctx.fillStyle = INK; }
  headerRule(ctx, 192);
  const rows = v.items.filter(Boolean).slice(0, 14);
  const colW = (W - 96) / 2, top = 250, rowH = 56;
  const perCol = Math.ceil(rows.length / 2);
  rows.forEach((raw, i) => {
    const col = i < perCol ? 0 : 1;
    const row = i < perCol ? i : i - perCol;
    const x = 48 + col * colW, y = top + row * rowH;
    const done = /^(\[[xX]\]|√|x)/.test(raw.trim());
    const label = raw.replace(/^(\[[ xX]\]\s*|√\s*|[xX]\s*)/, '');
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x, y - 20, 22, 22);
    if (done) { ctx.beginPath(); ctx.moveTo(x + 3, y - 9); ctx.lineTo(x + 9, y - 2); ctx.lineTo(x + 20, y - 18); ctx.stroke(); }
    const size = fitSingleLine(ctx, label, colW - 46, 28, 18);
    ctx.fillStyle = done ? 'rgba(17,17,17,0.45)' : INK; ctx.font = `${size}px ${SERIF}`; ctx.textAlign = 'left';
    ctx.fillText(label, x + 32, y);
  });
}

function drawSun(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const rows = v.items.slice(0, 2).map((r) => r.replace(/[^0-9:：]/g, '').replace('：', ':'));
  const rise = rows[0] || '06:12';
  const set = rows[1] || '18:45';
  const title = v.content || (zh ? '日照' : 'Daylight');
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `${fitSingleLine(ctx, title, W - 96, 56, 30)}px ${SERIF}`;
  ctx.fillText(title, W / 2, 130); ctx.textAlign = 'left';
  const cx = W / 2, baseY = 470, R = 170;
  ctx.strokeStyle = 'rgba(17,17,17,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.arc(cx, baseY, R, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(cx - R, baseY); ctx.lineTo(cx + R, baseY); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, baseY - R, 22, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 30, baseY - R + Math.sin(a) * 30); ctx.lineTo(cx + Math.cos(a) * 42, baseY - R + Math.sin(a) * 42); ctx.stroke(); }
  ctx.font = `24px ${SERIF}`; ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(zh ? '日出' : 'Sunrise', cx - R, baseY + 44);
  ctx.textAlign = 'right'; ctx.fillText(zh ? '日落' : 'Sunset', cx + R, baseY + 44); ctx.textAlign = 'left';
  ctx.fillStyle = INK; ctx.font = `44px ${SERIF}`;
  ctx.fillText(rise, cx - R, baseY + 96);
  ctx.textAlign = 'right'; ctx.fillText(set, cx + R, baseY + 96); ctx.textAlign = 'left';
}

function drawWater(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const done = Math.max(0, parseInt(v.sub, 10) || 0);
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 32, 150, v.content || (zh ? '今日饮水' : 'Water intake'));
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `160px ${SERIF}`;
  ctx.fillText(String(done), W / 2, 360);
  const total = 8, filled = Math.min(total, done), gap = 10;
  const gw = (W - 96 - gap * (total - 1)) / total, gy = 470;
  for (let i = 0; i < total; i++) {
    const x = 48 + i * (gw + gap);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x, gy, gw, 92);
    if (i < filled) { ctx.fillStyle = INK; ctx.fillRect(x + 2, gy + 32, gw - 4, 58); }
  }
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = `30px ${SERIF}`;
  ctx.fillText(zh ? '杯' : 'glasses', W / 2, 632); ctx.textAlign = 'left';
}

function drawBattery(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const pct = Math.max(0, Math.min(100, parseFloat(v.sub) || 0));
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 32, 140, v.content || (zh ? '设备电量' : 'Device battery'));
  const bx = 110, by = 270, bw = 260, bh = 140;
  ctx.strokeStyle = INK; ctx.lineWidth = 4; roundRect(ctx, bx, by, bw, bh, 16); ctx.stroke();
  ctx.fillStyle = INK; ctx.fillRect(bx + bw, by + bh * 0.32, 18, bh * 0.36);
  const pad = 10;
  ctx.save(); roundRect(ctx, bx + pad, by + pad, bw - 2 * pad, bh - 2 * pad, 8); ctx.clip();
  ctx.fillRect(bx + pad, by + pad, ((bw - 2 * pad) * pct) / 100, bh - 2 * pad); ctx.restore();
  ctx.fillStyle = pct > 50 ? '#ffffff' : INK; ctx.textAlign = 'center'; ctx.font = `72px ${SERIF}`;
  ctx.fillText(`${Math.round(pct)}%`, bx + bw / 2, by + bh / 2 + 26); ctx.textAlign = 'left';
  headerRule(ctx, 500);
  const rows = v.items.filter(Boolean).slice(0, 4);
  let y = 548; ctx.font = `26px ${SERIF}`;
  for (const row of rows) {
    const [k, val] = row.split(/[:：]/, 2);
    ctx.fillStyle = INK; ctx.fillText((k || '').trim(), 56, y);
    if (val !== undefined) { ctx.textAlign = 'right'; ctx.fillText(val.trim(), W - 56, y); ctx.textAlign = 'left'; }
    ctx.strokeStyle = 'rgba(17,17,17,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(56, y + 16); ctx.lineTo(W - 56, y + 16); ctx.stroke();
    y += 48;
  }
}

// ── Batch 3: gallery-grade visual types (photo, office, ink, poster, astro…) ──

function drawPhoto(ctx: CanvasRenderingContext2D, v: CardView) {
  if (v.image) {
    const iw = v.image.naturalWidth || v.image.width;
    const ih = v.image.naturalHeight || v.image.height;
    if (iw && ih) {
      drawImageFitted(ctx, v.image, 0, 0, W, H, v.imgFit);
      return;
    }
  }
  const zh = isZh(v);
  ctx.strokeStyle = 'rgba(17,17,17,0.4)';
  ctx.lineWidth = 2;
  const fx = W / 2 - 62, fy = 330, fw = 124, fh = 104;
  roundRect(ctx, fx, fy, fw, fh, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fx + 34, fy + 32, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx + 10, fy + fh - 14);
  ctx.lineTo(fx + 44, fy + 48);
  ctx.lineTo(fx + 74, fy + 78);
  ctx.lineTo(fx + 98, fy + 56);
  ctx.lineTo(fx + fw - 10, fy + fh - 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx + fw - 4, fy - 16);
  ctx.lineTo(fx + fw - 4, fy + 8);
  ctx.moveTo(fx + fw - 16, fy - 4);
  ctx.lineTo(fx + fw + 8, fy - 4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.textAlign = 'center';
  ctx.font = `30px ${SERIF}`;
  ctx.fillText(zh ? '上传图片' : 'Choose a photo', W / 2, fy + fh + 58);
  ctx.textAlign = 'left';
}

function drawBadge(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const name = (val.name as string) || v.content || (zh ? '林墨' : 'LIN MO');
  const title = (val.title as string) || v.sub || (zh ? '产品设计师 / PRODUCT DESIGNER' : 'Product Designer');
  const company = (val.company as string) || (zh ? '云页科技 · CLOUD PAGE' : 'AIRPAGE STUDIO');
  const dept = (val.dept as string) || (zh ? '设计中心 / DESIGN' : 'DESIGN');
  const id = (val.id as string) || 'AP-0248';
  const M = 48;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, 10);
  // Logo mark + company (tracked micro-label).
  ctx.fillStyle = INK;
  ctx.fillRect(M, 64, 30, 30);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `bold 18px ${SERIF}`;
  ctx.fillText((company.trim()[0] || 'A').toUpperCase(), M + 15, 86);
  ctx.textAlign = 'left';
  label(ctx, company, M + 42, 86, { size: 17 });
  // IDENTITY label + dashed registration marks (top-right).
  label(ctx, 'Identity', W - M, 78, { size: 13, align: 'right' });
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  for (let i = 0; i < 4; i++) ctx.fillRect(W - M - 6, 96 + i * 12, 10, 5);
  // Photo block in mid-gray, with a monogram when no photo is set.
  const px = M, py = 120, pw = W - M * 2, ph = 300;
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(px, py, pw, ph);
  if (v.image) {
    const iw = v.image.naturalWidth || v.image.width;
    const ih = v.image.naturalHeight || v.image.height;
    if (iw && ih) drawImageFitted(ctx, v.image, px, py, pw, ph, v.imgFit);
  } else {
    const mono = zh
      ? name.trim().slice(0, 2)
      : name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.font = `bold 120px ${SERIF}`;
    ctx.fillText(mono, px + pw / 2, py + ph / 2 + 40);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);
  // VERIFIED / year, running up the photo's right edge.
  ctx.save();
  ctx.translate(px + pw - 16, py + ph - 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.font = `500 14px ${SERIF}`;
  ctx.fillText('VERIFIED / 2026', 0, 0);
  ctx.restore();
  // Name + title + dept.
  ctx.fillStyle = INK;
  ctx.font = `bold ${fitSingleLine(ctx, name, W - M * 2, 52, 34)}px ${SERIF}`;
  ctx.fillText(name, M, 486);
  ctx.fillStyle = 'rgba(17,17,17,0.75)';
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(title, M, 524);
  label(ctx, dept, M, 556, { size: 15, sans: true });
  // Dark footer band with the employee ID.
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 110, W, 110);
  label(ctx, zh ? '工号 / Employee ID' : 'Employee ID', M, H - 72, { size: 14, color: 'rgba(255,255,255,0.65)' });
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 36px ${SERIF}`;
  ctx.fillText(id, M, H - 32);
}

function drawLetter(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const text = (v.content || (zh ? '见字如面，展信安康。一切无恙，勿念。' : 'A letter, folded and sealed.')).replace(/[\n]/g, '');
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 60, W - 80, H - 120);
  ctx.strokeRect(48, 68, W - 96, H - 136);
  const colW = 44;
  const size = 25;
  const perCol = 22;
  const cols = Math.max(1, Math.ceil(text.length / perCol));
  let x = W - 96;
  for (let c = 0; c < cols && x > 78; c++) {
    ctx.fillStyle = INK;
    verticalRun(ctx, text.slice(c * perCol, (c + 1) * perCol), x, 96, size, 6, perCol);
    ctx.strokeStyle = 'rgba(17,17,17,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - colW / 2, 96);
    ctx.lineTo(x - colW / 2, H - 110);
    ctx.stroke();
    x -= colW;
  }
  ctx.fillStyle = INK;
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(v.sub || (zh ? '夫 木生' : ''), 72, H - 92);
}

function drawVerse(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const raw = v.content || (zh ? '空山不见人，但闻人语响。返景入深林，复照青苔上。' : 'Mountain, river, verse.');
  const cols = raw.split(/[，。、\n,\.!]/).map((s) => s.trim()).filter(Boolean);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `26px ${SERIF}`;
  ctx.fillText(v.sub || (zh ? '王 维' : 'Wang Wei'), W - 72, 110);
  ctx.textAlign = 'left';
  const colW = 54;
  const size = 40;
  let x = W - 110;
  for (let i = 0; i < cols.length && x > 90; i++) {
    verticalRun(ctx, cols[i], x, 160, size, 8, 8);
    x -= colW;
  }
  ctx.fillStyle = INK;
  roundRect(ctx, 72, H - 128, 46, 46, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(zh ? '印' : '✦', 82, H - 96);
}

function drawInk(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  // Sun + a small flock up top.
  ctx.fillStyle = '#c9c9c9';
  ctx.beginPath();
  ctx.arc(W - 120, 150, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(17,17,17,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const bx = 110 + i * 26;
    const by = 120 + (i % 2) * 14;
    ctx.beginPath();
    ctx.moveTo(bx - 9, by);
    ctx.quadraticCurveTo(bx, by - 8, bx + 9, by);
    ctx.stroke();
  }
  // Layered gray ridges, light (far) to dark (near), white gaps between bands.
  const bands = [
    { y: 300, h: 66, gray: '#d3d3d3', peaks: 3, amp: 52 },
    { y: 440, h: 66, gray: '#9c9c9c', peaks: 4, amp: 58 },
    { y: 580, h: 66, gray: '#5e5e5e', peaks: 3, amp: 64 },
    { y: 716, h: 60, gray: INK, peaks: 4, amp: 56 },
  ];
  bands.forEach((B, bi) => {
    ctx.fillStyle = B.gray;
    ctx.beginPath();
    ctx.moveTo(0, B.y + B.h);
    for (let x = 0; x <= W; x += 8) {
      const t = (x / W) * Math.PI * 2 * B.peaks + bi * 1.3;
      const hgt = B.amp * (0.5 + 0.5 * Math.abs(Math.sin(t)));
      ctx.lineTo(x, B.y - hgt);
    }
    ctx.lineTo(W, B.y + B.h);
    ctx.closePath();
    ctx.fill();
  });
  // Classical vertical title + seal, kept in the light upper-right sky.
  ctx.fillStyle = INK;
  const title = v.content || (zh ? '江山如画' : 'Ink');
  const titleY = 250;
  verticalRun(ctx, title, W - 56, titleY, 30, 8, 4);
  ctx.fillStyle = INK;
  roundRect(ctx, W - 72, titleY + 4 * 38 + 18, 40, 40, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `22px ${SERIF}`;
  ctx.fillText(zh ? '印' : '✦', W - 62, titleY + 4 * 38 + 46);
}

function drawPoster(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const dark = v.values?.dark === true;
  const base = dark ? '255,255,255' : '17,17,17';
  const fg = dark ? '#ffffff' : INK;
  if (dark) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
  }
  const cx = W;
  const cy = 0;
  for (let i = 11; i >= 1; i--) {
    ctx.strokeStyle = `rgba(${base},${0.12 + (11 - i) * 0.075})`;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(cx, cy, i * 24, Math.PI * 0.5, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.font = `bold ${fitSingleLine(ctx, v.content || 'musica viva', W - 96, 60, 34)}px ${SERIF}`;
  ctx.fillText(v.content || 'musica viva', 48, 520);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 542);
  ctx.lineTo(168, 542);
  ctx.stroke();
  const rows = v.items.filter(Boolean).slice(0, 4);
  ctx.font = `28px ${SERIF}`;
  let y = 592;
  for (const r of rows) {
    ctx.fillText(r, 48, y);
    y += 42;
  }
  ctx.font = `26px ${SERIF}`;
  ctx.fillStyle = `rgba(${base},0.7)`;
  ctx.fillText(v.sub || (zh ? '苏黎世大厅' : 'Tonhalle Zürich'), 48, y + 8);
}

function drawStarmap(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  // Deterministic star field (solid whites so they survive 4-level quantization).
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    ctx.beginPath();
    ctx.arc(30 + rnd() * (W - 60), 170 + rnd() * (H - 260), rnd() * 1.4 + 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = W / 2, cy = 430;
  // Ecliptic / orbital rings.
  ctx.strokeStyle = '#a8a8a8';
  ctx.lineWidth = 2.5;
  for (const rr of [90, 150, 210, 268]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.5);
  ctx.strokeStyle = '#9a9a9a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 268, 120, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Constellation: connect a handful of nodes and highlight the anchor star.
  const pts = [
    [cx - 150, cy - 60],
    [cx - 40, cy - 120],
    [cx + 70, cy - 40],
    [cx + 150, cy + 40],
    [cx + 10, cy + 90],
    [cx - 120, cy + 70],
  ];
  ctx.strokeStyle = '#e6e6e6';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], i === 1 ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(pts[1][0], pts[1][1], 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = `italic 22px ${SERIF}`;
  ctx.fillText((v.values?.name as string) || (zh ? '织女星 Vega' : 'Vega'), pts[1][0] + 14, pts[1][1] - 6);
  // Title + tracked captions.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 40px ${SERIF}`;
  ctx.fillText(v.content || (zh ? '星 盘' : 'Star Chart'), W / 2, 96);
  label(ctx, zh ? '星图 · Starmap' : 'Starmap', W / 2, 140, { size: 15, color: 'rgba(255,255,255,0.7)', align: 'center' });
  label(ctx, v.sub || 'RA 18h 36m · DEC +38° · Epoch J2000', W / 2, H - 56, { size: 14, color: 'rgba(255,255,255,0.6)', align: 'center' });
  ctx.textAlign = 'left';
}

function drawWeekPlan(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = `44px ${SERIF}`;
  ctx.fillText(zh ? '本 周' : 'THIS WEEK', 40, 80);
  ctx.font = `20px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillText(v.sub || (zh ? '第 42 周 · 10/12–18' : 'WEEK 42 · OCT 12–18'), W - 40, 80);
  ctx.textAlign = 'left';
  const rows = v.items.filter(Boolean).slice(0, 6);
  const dayLabels = zh ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  let y = 196;
  rows.forEach((raw, i) => {
    const parts = raw.split(/[:：·|]/).map((s) => s.trim()).filter(Boolean);
    const time = parts.find((p) => /\d{1,2}:\d{2}/.test(p)) || '';
    const act = parts.filter((p) => p !== time).join(' · ');
    ctx.fillStyle = 'rgba(17,17,17,0.5)';
    ctx.font = `26px ${SERIF}`;
    ctx.fillText(dayLabels[i % 7], 40, y);
    if (time) {
      ctx.textAlign = 'right';
      ctx.fillText(time, W - 40, y);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = INK;
    const { size, lines } = fitText(ctx, act || raw, W - 80, 90, 30, 1.25, 22);
    ctx.font = `${size}px ${SERIF}`;
    let ly = y + 40;
    for (const l of lines) {
      ctx.fillText(l, 40, ly);
      ly += size * 1.25;
    }
    ctx.strokeStyle = 'rgba(17,17,17,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, ly + 8);
    ctx.lineTo(W - 40, ly + 8);
    ctx.stroke();
    y = Math.max(ly + 40, y + 104);
  });
}

function drawSocial(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const pct = Math.max(0, Math.min(100, parseFloat(v.sub) || 0));
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 26, 122, zh ? '社 交 电 量' : 'SOCIAL BATTERY');
  const bx = 140, by = 188, bw = 200, bh = 460;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(bx + bw * 0.3, by - 16, bw * 0.4, 16);
  const segs = 6, gap = 10, pad = 12;
  const segH = (bh - 2 * pad - gap * (segs - 1)) / segs;
  const filled = Math.round((segs * pct) / 100);
  for (let i = 0; i < segs; i++) {
    const yy = by + pad + (segH + gap) * (segs - 1 - i);
    if (i < filled) {
      ctx.fillStyle = INK;
      roundRect(ctx, bx + pad, yy, bw - 2 * pad, segH, 6);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(17,17,17,0.28)';
      ctx.lineWidth = 2;
      roundRect(ctx, bx + pad, yy, bw - 2 * pad, segH, 6);
      ctx.stroke();
    }
  }
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `40px ${SERIF}`;
  ctx.fillText(`${Math.round(pct)}%`, W / 2, by + bh + 70);
  ctx.textAlign = 'left';
}

function drawYearProg(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 0).getTime();
  const end = new Date(year + 1, 0, 0).getTime();
  const day = Math.floor((now.getTime() - start) / 86400000);
  const total = Math.round((end - start) / 86400000);
  const pct = Math.round((day / total) * 100);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `bold 68px ${SERIF}`;
  ctx.fillText(String(v.content || year), W / 2, 126);
  ctx.textAlign = 'left';
  label(ctx, 'Year Progress · 年度进度', W / 2, 162, { size: 16, align: 'center' });
  const cols = 18;
  const rows = Math.ceil(total / cols);
  const gx = (W - 96) / cols;
  const gy = (H - 400) / rows;
  const r = Math.min(gx, gy) * 0.32;
  for (let i = 0; i < total; i++) {
    const c = i % cols;
    const rr = Math.floor(i / cols);
    const x = 48 + gx * c + gx / 2;
    const y = 200 + gy * rr + gy / 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (i < day) {
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.35 + 0.65 * (i / Math.max(1, day));
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(17,17,17,0.12)';
      ctx.fill();
    }
  }
  ctx.fillStyle = INK;
  ctx.font = `96px ${SERIF}`;
  ctx.fillText(`${pct}%`, 48, H - 120);
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(zh ? `第 ${day} / ${total} 天` : `Day ${day} / ${total}`, W - 48, H - 152);
  ctx.fillText(zh ? `还剩 ${total - day} 天` : `${total - day} days left`, W - 48, H - 120);
  ctx.textAlign = 'left';
  label(ctx, zh ? '日拱一卒 · One day at a time' : 'One day at a time', 48, H - 66, { size: 15, sans: true });
}

// ── Registry (grouped by category, in display order) ───────────────────────────

// ── Travel / music / transit (rich multi-field demos) ────────────────────────

function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number) {
  let s = 7;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) & 0x7fffffff;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  ctx.fillStyle = INK;
  let px = x;
  while (px < x + w) {
    const bw = 1 + Math.floor(rnd() * 4);
    if (rnd() > 0.42) ctx.fillRect(px, y, bw, h);
    px += bw + 1 + Math.floor(rnd() * 3);
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.5);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx - s, cy + s * 0.5);
  ctx.lineTo(cx - s * 0.4, cy);
  ctx.closePath();
  ctx.fill();
}

// A small locomotive silhouette (rail sibling of drawPlane) so the high-speed
// ticket never borrows the airplane glyph.
function drawTrain(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = INK;
  roundRect(ctx, cx - s, cy - s * 0.62, s * 2, s * 1.1, s * 0.42);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - s * 0.68, cy - s * 0.34, s * 0.5, s * 0.4);
  ctx.fillRect(cx + s * 0.18, cy - s * 0.34, s * 0.5, s * 0.4);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx + s, cy - s * 0.12);
  ctx.lineTo(cx + s * 1.35, cy);
  ctx.lineTo(cx + s, cy + s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - s * 0.5, cy + s * 0.62, s * 0.16, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.5, cy + s * 0.62, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawQrMatrix(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
  } catch {
    try {
      qr = qrcode(10, 'M');
      qr.addData(text);
      qr.make();
    } catch {
      return;
    }
  }
  const count = qr.getModuleCount();
  const cell = size / count;
  ctx.fillStyle = INK;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5);
    }
  }
}

function ticketDate(s: string, zh: boolean): string {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s || '');
  if (!m) return s || '';
  const y = +m[1], mo = +m[2], d = +m[3];
  if (zh) return `${y}年${mo}月${d}日`;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${String(d).padStart(2, '0')} ${MON[mo - 1]} ${y}`;
}

function durationText(a: string, b: string, zh: boolean): string {
  const pa = /^(\d{1,2}):(\d{2})/.exec(a || '');
  const pb = /^(\d{1,2}):(\d{2})/.exec(b || '');
  if (!pa || !pb) return '';
  let m = +pb[1] * 60 + +pb[2] - (+pa[1] * 60 + +pa[2]);
  if (m < 0) m += 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return zh ? `${h}时${mm}分` : `${h}h ${mm}m`;
}

function serialFor(seed: string): string {
  let s = 7;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return 'E' + String(100000000 + (s % 900000000));
}

function drawBoardingPass(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const from = (val.from as string) || 'PEK';
  const to = (val.to as string) || 'SHA';
  const fromCity = (val.fromCity as string) || (zh ? '北京 Beijing' : 'Beijing');
  const toCity = (val.toCity as string) || (zh ? '上海 Shanghai' : 'Shanghai');
  const passenger = (val.passenger as string) || (zh ? '张三 / ZHANG SAN' : 'ZHANG / SAN');
  const airlineSel = (val.airline as string) || 'HAINAN AIRLINES';
  const airline = airlineSel === 'CUSTOM' ? (val.airlineName as string) || 'CUSTOM' : airlineSel;
  const flight = (val.flight as string) || 'HU2092';
  const gate = (val.gate as string) || 'B10';
  const seat = (val.seat as string) || '9C';
  const date = (val.date as string) || today(zh ? 'zh' : 'en');
  const depart = (val.depart as string) || '08:45';
  const boarding = (val.boarding as string) || '08:15';
  const code = flight.replace(/[0-9]/g, '').slice(0, 3) || airlineSel.slice(0, 2);
  // Landscape 800×480 boarding pass, rotated into the portrait panel.
  ctx.save();
  ctx.translate(W, 0);
  ctx.rotate(Math.PI / 2);
  const LW = H, LH = W, PAD = 40;
  const stubX = 596;
  const bodyW = stubX - 24;
  // Perforation between the ticket body and the stub.
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = 'rgba(17,17,17,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(stubX, PAD);
  ctx.lineTo(stubX, LH - PAD);
  ctx.stroke();
  ctx.setLineDash([]);
  // Top strip: airline brand + type label.
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, airline.toUpperCase(), bodyW - 250, 26, 15)}px ${SERIF}`;
  ctx.fillText(airline.toUpperCase(), PAD, 62);
  label(ctx, zh ? '登机牌 · Boarding Pass' : 'Boarding Pass', bodyW, 62, { size: 14, align: 'right' });
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, 82);
  ctx.lineTo(bodyW, 82);
  ctx.stroke();
  // Big route: PEK → SHA with city names.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `700 ${fitSingleLine(ctx, from.toUpperCase(), 150, 74, 44)}px ${SERIF}`;
  ctx.fillText(from.toUpperCase(), PAD, 168);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(fromCity, PAD, 196);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, to.toUpperCase(), 150, 74, 44)}px ${SERIF}`;
  ctx.fillText(to.toUpperCase(), bodyW, 168);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(toCity, bodyW, 196);
  ctx.textAlign = 'left';
  const a0 = PAD + 158, a1 = bodyW - 158, ay = 150;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a0, ay);
  ctx.lineTo(a1 - 10, ay);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(a1, ay);
  ctx.lineTo(a1 - 12, ay - 7);
  ctx.lineTo(a1 - 12, ay + 7);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.font = `16px ${SERIF}`;
  ctx.fillText(`${zh ? '起飞' : 'DEP'} ${depart}`, (a0 + a1) / 2, ay + 28);
  ctx.textAlign = 'left';
  // Info grid (2 × 3).
  const colw = (bodyW - PAD) / 3;
  const cell = (cap: string, value: string, x: number, y: number) => {
    label(ctx, cap, x, y, { size: 12 });
    ctx.fillStyle = INK;
    ctx.font = `700 ${fitSingleLine(ctx, value, colw - 14, 24, 13)}px ${SERIF}`;
    ctx.fillText(value, x, y + 26);
  };
  cell(zh ? '乘客' : 'Passenger', passenger.toUpperCase(), PAD, 244);
  cell(zh ? '航班' : 'Flight', flight.toUpperCase(), PAD + colw, 244);
  cell(zh ? '日期' : 'Date', ticketDate(date, zh), PAD + colw * 2, 244);
  cell(zh ? '登机口' : 'Gate', gate.toUpperCase(), PAD, 312);
  cell(zh ? '座位' : 'Seat', seat.toUpperCase(), PAD + colw, 312);
  cell(zh ? '登机时间' : 'Boarding', boarding, PAD + colw * 2, 312);
  // Barcode + caption.
  barcode(ctx, flight + from + to + seat + passenger, PAD, 372, bodyW - PAD, 56);
  ctx.fillStyle = 'rgba(17,17,17,0.55)';
  ctx.font = `13px ${SERIF}`;
  ctx.fillText(`${flight} ${from.toUpperCase()}${to.toUpperCase()} ${ticketDate(date, zh)} ${seat.toUpperCase()}`, PAD, 444);
  // Stub (right).
  const sx = stubX + 20;
  const sw = LW - PAD - sx;
  const pair = (cap: string, value: string, y: number) => {
    label(ctx, cap, sx, y, { size: 11 });
    ctx.fillStyle = INK;
    ctx.font = `700 ${fitSingleLine(ctx, value, sw, 20, 13)}px ${SERIF}`;
    ctx.fillText(value, sx, y + 22);
  };
  pair(zh ? '姓名' : 'Name', passenger.toUpperCase(), 60);
  pair(zh ? '航班' : 'Flight', flight.toUpperCase(), 116);
  pair(zh ? '航程' : 'Route', `${from.toUpperCase()} → ${to.toUpperCase()}`, 172);
  pair(zh ? '座位' : 'Seat', seat.toUpperCase(), 228);
  pair(zh ? '登机' : 'Boarding', boarding, 284);
  barcode(ctx, flight + seat + date, sx, 344, sw * 0.62, 58);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.font = `700 24px ${SERIF}`;
  ctx.fillText(code, LW - PAD, LH - PAD);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawHsrTicket(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const from = (val.from as string) || (zh ? '杭州东' : 'Hangzhou East');
  const to = (val.to as string) || (zh ? '潮阳' : 'Chaoyang');
  const train = (val.train as string) || 'D3125';
  const date = (val.date as string) || today(zh ? 'zh' : 'en');
  const depart = (val.depart as string) || '11:31';
  const arrive = (val.arrive as string) || '19:50';
  const gate = (val.gate as string) || '8A';
  const seat = (val.seat as string) || (zh ? '二等座 05车12F号' : '2nd 05-12F');
  const price = (val.price as string) || '¥543.5';
  const serial = (val.serial as string) || serialFor(train + date + from + to);
  // Landscape 800×480 rail ticket, rotated into the portrait panel.
  ctx.save();
  ctx.translate(W, 0);
  ctx.rotate(Math.PI / 2);
  const LW = H, LH = W, PAD = 44;
  const rule = (y: number) => {
    ctx.strokeStyle = 'rgba(17,17,17,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(LW - PAD, y);
    ctx.stroke();
  };
  // Top strip: brand + serial.
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `700 26px ${SERIF}`;
  ctx.fillText(zh ? '中国铁路 CHINA RAILWAY' : 'CHINA RAILWAY', PAD, 64);
  label(ctx, serial, LW - PAD, 64, { size: 16, align: 'right' });
  rule(88);
  // Departure (left): big time + station.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `700 ${fitSingleLine(ctx, depart, 210, 104, 60)}px ${SERIF}`;
  ctx.fillText(depart, PAD, 214);
  ctx.fillStyle = 'rgba(17,17,17,0.8)';
  ctx.font = `${fitSingleLine(ctx, from, 210, 26, 16)}px ${SERIF}`;
  ctx.fillText(from, PAD, 256);
  // Arrival (right): big time + station.
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, arrive, 210, 104, 60)}px ${SERIF}`;
  ctx.fillText(arrive, LW - PAD, 214);
  ctx.fillStyle = 'rgba(17,17,17,0.8)';
  ctx.font = `${fitSingleLine(ctx, to, 210, 26, 16)}px ${SERIF}`;
  ctx.fillText(to, LW - PAD, 256);
  ctx.textAlign = 'left';
  // Center connector: train no. + arrow + duration.
  const midX = LW / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 28px ${SERIF}`;
  ctx.fillText(train.toUpperCase(), midX, 150);
  const ax0 = midX - 118, ax1 = midX + 104, ay = 192;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax0, ay);
  ctx.lineTo(ax1 - 10, ay);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(ax1, ay);
  ctx.lineTo(ax1 - 12, ay - 7);
  ctx.lineTo(ax1 - 12, ay + 7);
  ctx.closePath();
  ctx.fill();
  const dur = durationText(depart, arrive, zh);
  if (dur) {
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.font = `22px ${SERIF}`;
    ctx.fillText(dur, midX, ay + 34);
  }
  ctx.textAlign = 'left';
  // Bottom strip: date · gate / seat / fare, QR on the right.
  rule(300);
  ctx.fillStyle = INK;
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(`${ticketDate(date, zh)} · ${zh ? '检票口' : 'Gate'} ${gate}`, PAD, 344);
  ctx.fillText(seat, PAD, 384);
  ctx.font = `700 30px ${SERIF}`;
  ctx.fillText(price, PAD, 432);
  const pw = ctx.measureText(price).width;
  ctx.font = `16px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.55)';
  ctx.fillText(zh ? '仅供展示' : 'sample only', PAD + pw + 12, 432);
  drawQrMatrix(ctx, `${train}|${from}|${to}|${date}`, LW - PAD - 108, 316, 108);
  ctx.restore();
}

function drawVinyl(ctx: CanvasRenderingContext2D, v: CardView) {
  const val = v.values || {};
  const track = (val.track as string) || 'City Lights';
  const artist = (val.artist as string) || 'Night Voyager';
  const album = (val.album as string) || 'Midnight Radio';
  const side = (val.side as string) || 'A';
  const note = (val.note as string) || 'PAPER RECORDS · 2025';
  const cx = W / 2;
  const cy = 250;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let r = 192; r > 108; r -= 7) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `700 40px ${SERIF}`;
  ctx.fillText(side.toUpperCase(), 40, cy - 40);
  ctx.font = `22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(track, cx, cy - 4);
  ctx.font = `italic 18px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(album, cx, cy + 26);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, track, W - 96, 44, 26)}px ${SERIF}`;
  ctx.fillText(track, W / 2, 540);
  ctx.font = `28px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.75)';
  ctx.fillText(artist, W / 2, 584);
  headerRule(ctx, 632);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.fillText(note.toUpperCase(), W / 2, 676);
  ctx.textAlign = 'left';
}

function drawSubwaySign(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const station = (val.station as string) || (zh ? '人民广场' : 'People’s Square');
  const prev = (val.prev as string) || (zh ? '南京东路' : 'E. Nanjing Rd');
  const next = (val.next as string) || (zh ? '江苏路' : 'Jiangsu Rd');
  const dest = (val.dest as string) || (zh ? '徐泾东' : 'Xujing East');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.font = `18px ${SERIF}`;
  ctx.fillText(zh ? '地铁 · METRO' : 'METRO STATION', 48, 76);
  ctx.textAlign = 'right';
  ctx.fillText(`◀ ${prev}`, W - 48, 76);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 ${fitSingleLine(ctx, station, W - 80, 88, 40)}px ${SERIF}`;
  ctx.fillText(station, W / 2, 220);
  ctx.textAlign = 'left';
  const lineY = 300;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(72, lineY);
  ctx.lineTo(W - 72, lineY);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, lineY, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W / 2, lineY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(72, lineY, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W - 72, lineY, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.font = `20px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText(prev, 72, lineY + 40);
  ctx.textAlign = 'right';
  ctx.fillText(next, W - 72, lineY + 40);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = `20px ${SERIF}`;
  ctx.fillText(zh ? '开往' : 'TO', 48, H - 96);
  ctx.font = `700 ${fitSingleLine(ctx, dest, W - 120, 44, 28)}px ${SERIF}`;
  ctx.fillText(dest, 48, H - 46);
  ctx.textAlign = 'right';
  ctx.font = `44px ${SERIF}`;
  ctx.fillText('▶', W - 48, H - 54);
  ctx.textAlign = 'left';
}

// ── Shared deterministic RNG (seeded by a string) for generative art ─────────

function mkRng(seed: string): () => number {
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const r2 = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function genMaze(cols: number, rows: number, rng: () => number) {
  const cells = Array.from({ length: cols * rows }, () => ({ n: true, e: true, s: true, w: true, seen: false }));
  const id = (x: number, y: number) => y * cols + x;
  const stack: [number, number][] = [[0, 0]];
  cells[0].seen = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb: [number, number, string][] = [];
    const add = (nx: number, ny: number, d: string) => {
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !cells[id(nx, ny)].seen) nb.push([nx, ny, d]);
    };
    add(x, y - 1, 'n');
    add(x + 1, y, 'e');
    add(x, y + 1, 's');
    add(x - 1, y, 'w');
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, d] = nb[Math.floor(rng() * nb.length)];
    const c = cells[id(x, y)];
    const nn = cells[id(nx, ny)];
    if (d === 'n') {
      c.n = false;
      nn.s = false;
    } else if (d === 'e') {
      c.e = false;
      nn.w = false;
    } else if (d === 's') {
      c.s = false;
      nn.n = false;
    } else {
      c.w = false;
      nn.e = false;
    }
    nn.seen = true;
    stack.push([nx, ny]);
  }
  return cells;
}

function solveMaze(cells: { n: boolean; e: boolean; s: boolean; w: boolean }[], cols: number, rows: number): [number, number][] {
  const id = (x: number, y: number) => y * cols + x;
  const prev = new Array(cols * rows).fill(-1);
  const seen = new Array(cols * rows).fill(false);
  const q: [number, number][] = [[0, 0]];
  seen[0] = true;
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === cols - 1 && y === rows - 1) break;
    const c = cells[id(x, y)];
    const steps: [number, number, boolean][] = [[x, y - 1, c.n], [x + 1, y, c.e], [x, y + 1, c.s], [x - 1, y, c.w]];
    for (const [nx, ny, wall] of steps) {
      if (wall || nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[id(nx, ny)]) continue;
      seen[id(nx, ny)] = true;
      prev[id(nx, ny)] = id(x, y);
      q.push([nx, ny]);
    }
  }
  const path: [number, number][] = [];
  let cur = id(cols - 1, rows - 1);
  while (cur !== -1) {
    path.push([cur % cols, Math.floor(cur / cols)]);
    cur = prev[cur];
  }
  return path.reverse();
}

// ── Nature / art / divination / puzzle ──────────────────────────────────────

function drawPostageStamp(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const country = (val.country as string) || (zh ? '中国邮政' : 'CHINA POST');
  const value = (val.value as string) || (zh ? '¥1.20' : '1.20');
  const subject = (val.subject as string) || (zh ? '山水之间' : 'Among Hills & Water');
  const year = (val.year as string) || today(zh ? 'zh' : 'en').slice(0, 4);
  const bx = 58, by = 96, bw = W - 116, bh = H - 232;
  ctx.fillStyle = INK;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffffff';
  const step = 24, rad = 6.5;
  const hole = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let x = bx; x <= bx + bw + 1; x += step) {
    hole(x, by);
    hole(x, by + bh);
  }
  for (let y = by; y <= by + bh + 1; y += step) {
    hole(bx, y);
    hole(bx + bw, y);
  }
  const ix = bx + 34, iy = by + 60, iw = bw - 68, ih = bh - 168;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ix, iy, iw, ih);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ix + iw * 0.72, iy + ih * 0.3, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ix + 10, iy + ih * 0.72);
  ctx.lineTo(ix + iw * 0.34, iy + ih * 0.44);
  ctx.lineTo(ix + iw * 0.58, iy + ih * 0.72);
  ctx.lineTo(ix + iw * 0.8, iy + ih * 0.5);
  ctx.lineTo(ix + iw - 10, iy + ih * 0.72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ix + 10, iy + ih * 0.72);
  ctx.lineTo(ix + iw - 10, iy + ih * 0.72);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `700 ${fitSingleLine(ctx, country.toUpperCase(), bw - 60, 30, 18)}px ${SERIF}`;
  ctx.fillText(country.toUpperCase(), W / 2, by + 42);
  ctx.font = `700 40px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillText(value, bx + bw - 40, by + bh - 42);
  ctx.textAlign = 'left';
  ctx.font = `22px ${SERIF}`;
  ctx.fillText(year, bx + 40, by + bh - 44);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `italic ${fitSingleLine(ctx, subject, iw - 16, 26, 16)}px ${SERIF}`;
  ctx.fillText(subject, W / 2, iy + ih - 18);
  ctx.textAlign = 'left';
}

function drawHerbarium(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const common = (val.common as string) || (zh ? '梅花' : 'Plum Blossom');
  const species = (val.species as string) || 'Prunus mume';
  const place = (val.place as string) || (zh ? '杭州 · 孤山' : 'Hangzhou');
  const date = (val.date as string) || today(zh ? 'zh' : 'en').slice(0, 10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 60, W - 80, H - 120);
  const sx = W / 2, top = 176, bot = 540;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, bot);
  ctx.bezierCurveTo(sx - 30, bot - 150, sx + 30, top + 120, sx, top);
  ctx.stroke();
  const leaf = (y: number, dir: number) => {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.quadraticCurveTo(sx + dir * 46, y - 16, sx + dir * 78, y + 8);
    ctx.quadraticCurveTo(sx + dir * 42, y + 28, sx, y);
    ctx.stroke();
  };
  for (const [y, d] of [[bot - 90, -1], [bot - 90, 1], [bot - 180, -1], [bot - 180, 1], [top + 100, -1], [top + 100, 1]] as [number, number][]) leaf(y, d);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 22, bot - 30);
  ctx.lineTo(sx + 22, bot - 52);
  ctx.stroke();
  ctx.fillStyle = INK;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(sx + Math.cos(a) * 22, top - 6 + Math.sin(a) * 22, 15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, top - 6, 8, 0, Math.PI * 2);
  ctx.fill();
  const lx = 64, ly = 606, lw = W - 128, lh = 132;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(lx, ly, lw, lh);
  ctx.beginPath();
  ctx.moveTo(lx, ly + 42);
  ctx.lineTo(lx + lw, ly + 42);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `700 ${fitSingleLine(ctx, common, lw - 24, 26, 16)}px ${SERIF}`;
  ctx.fillText(common, lx + 14, ly + 28);
  ctx.font = `italic 20px ${SERIF}`;
  ctx.fillText(species, lx + 14, ly + 70);
  ctx.font = `18px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.8)';
  ctx.fillText(`${zh ? '产地 · ' : 'Collected · '}${place}`, lx + 14, ly + 98);
  ctx.fillText(`${zh ? '日期 · ' : 'Date · '}${date}`, lx + 14, ly + 120);
}

function drawContourAtlas(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const title = (val.title as string) || (zh ? '云岭秘境' : 'Misty Ridge');
  const elev = (val.elev as string) || '1280 m';
  const note = (val.note as string) || (zh ? '等高距 50 m' : 'Contour interval 50 m');
  const rng = mkRng(title);
  const p1 = rng() * 6.28;
  const p2 = rng() * 6.28;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 ${fitSingleLine(ctx, title, W - 96, 32, 22)}px ${SERIF}`;
  ctx.fillText(title, W / 2, 92);
  ctx.textAlign = 'left';
  headerRule(ctx, 120);
  const cx = W / 2, cy = 410;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  for (let k = 9; k >= 1; k--) {
    const base = k * 24;
    ctx.beginPath();
    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const rr = base * (1 + 0.16 * Math.sin(3 * th + p1) + 0.1 * Math.cos(5 * th + p2));
      const x = cx + Math.cos(th) * rr * 1.1;
      const y = cy + Math.sin(th) * rr * 0.82;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx - 10, cy + 6);
  ctx.lineTo(cx + 10, cy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `700 22px ${SERIF}`;
  ctx.fillText(elev, cx, cy + 32);
  ctx.textAlign = 'left';
  ctx.font = `16px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.75)';
  ctx.fillText(note, 48, 726);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 748);
  ctx.lineTo(128, 748);
  ctx.stroke();
  const nx = W - 70, ny = 736;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(nx, ny - 22);
  ctx.lineTo(nx - 8, ny + 8);
  ctx.lineTo(nx, ny);
  ctx.lineTo(nx + 8, ny + 8);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `16px ${SERIF}`;
  ctx.fillText('N', nx, ny + 24);
  ctx.textAlign = 'left';
}

function drawMuseumWall(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const title = v.content || (zh ? '静默之物' : 'Silent Objects');
  const venue = v.sub || (zh ? '壹页美术馆' : 'OnePage Museum');
  const dates = (val.dates as string) || (zh ? '2026 · 春秋' : '2026');
  const items = v.items && v.items.length ? v.items : zh ? ['一、陶与火', '二、纸的旅行', '三、光的标本'] : ['I. Clay & Fire', 'II. Paper Journeys', 'III. Specimens of Light'];
  const rng = mkRng(title);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, 70, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(W / 2, 70);
  ctx.lineTo(150, 150);
  ctx.moveTo(W / 2, 70);
  ctx.lineTo(W - 150, 150);
  ctx.stroke();
  const fx = 110, fy = 150, fw = W - 220, fh = 290;
  ctx.lineWidth = 8;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(fx + 14, fy + 14, fw - 28, fh - 28);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fx + fw * 0.4, fy + fh * 0.5, 34 + rng() * 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx + fw * 0.6, fy + fh * 0.3);
  ctx.lineTo(fx + fw * 0.82, fy + fh * 0.72);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 ${fitSingleLine(ctx, title, W - 80, 40, 22)}px ${SERIF}`;
  ctx.fillText(title, W / 2, 500);
  ctx.font = `italic 24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.8)';
  ctx.fillText(`${venue} · ${dates}`, W / 2, 540);
  ctx.textAlign = 'left';
  const lx = 64, ly = 584, lw = W - 128;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(lx, ly, lw, 160);
  ctx.fillStyle = INK;
  ctx.font = `16px ${SERIF}`;
  ctx.fillText(zh ? '本厅展出 · ON VIEW' : 'ON VIEW', lx + 16, ly + 28);
  ctx.strokeStyle = 'rgba(17,17,17,0.4)';
  ctx.beginPath();
  ctx.moveTo(lx + 16, ly + 38);
  ctx.lineTo(lx + lw - 16, ly + 38);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `22px ${SERIF}`;
  let y = ly + 66;
  for (let i = 0; i < Math.min(3, items.length); i++) {
    ctx.fillText(items[i], lx + 16, y);
    y += 30;
  }
}

function drawPixelNight(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const caption = (val.caption as string) || (zh ? '不眠城市' : 'Sleepless City');
  const date = (val.date as string) || today(zh ? 'zh' : 'en').slice(0, 10);
  const rng = mkRng(caption);
  const cell = 16;
  const cols = Math.floor(W / cell);
  ctx.fillStyle = INK;
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * cols) * cell;
    const y = Math.floor(rng() * 18) * cell;
    if (y > 250) continue;
    ctx.fillRect(x, y, cell * 0.5, cell * 0.5);
  }
  const mcx = W - 96, mcy = 110, mr = 42;
  for (let gy = -mr; gy < mr; gy += cell) {
    for (let gx = -mr; gx < mr; gx += cell) {
      const d = Math.hypot(gx, gy);
      const d2 = Math.hypot(gx - 18, gy);
      if (d < mr && d2 > mr) ctx.fillRect(Math.floor((mcx + gx) / cell) * cell, Math.floor((mcy + gy) / cell) * cell, cell, cell);
    }
  }
  const baseY = 548;
  let x = 0;
  while (x < cols) {
    const wB = 2 + Math.floor(rng() * 4);
    const hB = 5 + Math.floor(rng() * 15);
    for (let bx = 0; bx < wB && x + bx < cols; bx++) {
      const px = (x + bx) * cell;
      for (let py = 0; py < hB; py++) ctx.fillRect(px, baseY - py * cell, cell, cell);
      for (let py = 1; py < hB - 1; py++) {
        if (rng() > 0.5) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + cell * 0.25, baseY - py * cell + cell * 0.25, cell * 0.5, cell * 0.5);
          ctx.fillStyle = INK;
        }
      }
    }
    x += wB + 1;
  }
  ctx.fillStyle = INK;
  ctx.fillRect(0, baseY + cell, W, H - baseY - cell);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `700 ${fitSingleLine(ctx, caption, W - 80, 40, 22)}px ${SERIF}`;
  ctx.fillText(caption, W / 2, baseY + cell + 52);
  ctx.font = `20px ${SERIF}`;
  ctx.fillText(date, W / 2, baseY + cell + 88);
  ctx.textAlign = 'left';
}

function drawInkPlum(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const poem = v.content || (zh ? '墙角数枝梅，凌寒独自开。' : 'Plum blossoms by the wall, blooming alone in the cold.');
  const author = v.sub || (zh ? '王安石' : 'Wang Anshi');
  const seal = (val.seal as string) || '墨';
  const rng = mkRng(poem + author);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(20, 620);
  ctx.bezierCurveTo(150, 540, 220, 380, 360, 250);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(200, 420);
  ctx.bezierCurveTo(260, 380, 300, 350, 340, 350);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(140, 540);
  ctx.bezierCurveTo(170, 490, 200, 470, 240, 460);
  ctx.stroke();
  const spots = [[140, 540], [200, 420], [300, 350], [340, 350], [360, 250], [240, 460], [100, 590], [320, 280]];
  for (const [x, y] of spots) {
    if (rng() < 0.85) {
      ctx.fillStyle = INK;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const chars = poem.replace(/[，,。.\s]/g, '');
  const half = Math.ceil(chars.length / 2);
  ctx.fillStyle = INK;
  const yEnd = verticalRun(ctx, chars.slice(0, half), W - 96, 60, 30, 6, 12);
  verticalRun(ctx, chars.slice(half), W - 150, 60, 30, 6, 12);
  ctx.fillStyle = 'rgba(17,17,17,0.85)';
  verticalRun(ctx, author.replace(/\s/g, ''), W - 204, Math.max(60, yEnd - 120), 22, 5, 6);
  const ssx = W - 232, ssy = 60;
  ctx.fillStyle = INK;
  ctx.fillRect(ssx, ssy, 32, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = `22px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(seal.slice(0, 1), ssx + 16, ssy + 23);
  ctx.textAlign = 'left';
}

function drawDailyFortune(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const level = (val.level as string) || 'good';
  const keyword = v.content || (zh ? '厚积薄发' : 'Steady Effort');
  const date = (val.date as string) || today(zh ? 'zh' : 'en');
  const advice = (val.advice as string) || (zh ? '耐心耕耘，静待花开。' : 'Sow patiently; harvest in time.');
  const charMap: Record<string, string> = { great: '大吉', good: '吉', medium: '平', poor: '凶' };
  const enMap: Record<string, string> = { great: 'GREAT', good: 'GOOD', medium: 'EVEN', poor: 'PAUSE' };
  const bigChar = zh ? charMap[level] || '吉' : enMap[level] || 'GOOD';
  const starsMap: Record<string, number> = { great: 5, good: 4, medium: 3, poor: 1 };
  const stars = starsMap[level] ?? 3;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  for (const [cx, cy] of [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx, cy + 9);
    ctx.lineTo(cx - 9, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 28px ${SERIF}`;
  ctx.fillText(zh ? '今 日 运 势' : 'DAILY FORTUNE', W / 2, 132);
  ctx.font = `18px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(date, W / 2, 162);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(W / 2, 340, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, 340, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, bigChar, 150, zh ? 84 : 56, 30)}px ${SERIF}`;
  ctx.fillText(bigChar, W / 2, 364);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? INK : 'rgba(17,17,17,0.25)';
    starPath(ctx, W / 2 + (i - 2) * 28, 476, 11);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.font = `700 ${fitSingleLine(ctx, keyword, W - 120, 40, 24)}px ${SERIF}`;
  ctx.fillText(keyword, W / 2, 548);
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.85)';
  const { size, lines } = fitText(ctx, advice, W - 160, 120, 24, 1.4);
  ctx.font = `${size}px ${SERIF}`;
  let y = 606;
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += size * 1.4;
  }
  ctx.textAlign = 'left';
}

function drawMaze(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const seed = (val.seed as string) || (zh ? '壹页 ONEPAGE' : 'ONEPAGE');
  const size = (val.size as string) || 'M';
  const showSolve = val.showSolution === true;
  const cols = size === 'S' ? 8 : size === 'L' ? 14 : 11;
  const rows = size === 'S' ? 12 : size === 'L' ? 20 : 16;
  const grid = genMaze(cols, rows, mkRng(seed));
  const top = 116, availW = W - 96, availH = H - top - 120;
  const cell = Math.floor(Math.min(availW / cols, availH / rows));
  const ox = (W - cell * cols) / 2;
  const oy = top;
  if (showSolve) {
    const solution = solveMaze(grid, cols, rows);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, cell * 0.38);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    solution.forEach(([mx, my], i) => {
      const cx = ox + mx * cell + cell / 2;
      const cy = oy + my * cell + cell / 2;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = grid[y * cols + x];
      const px = ox + x * cell, py = oy + y * cell;
      if (c.n) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + cell, py);
        ctx.stroke();
      }
      if (c.w) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + cell);
        ctx.stroke();
      }
      if (x === cols - 1 && c.e) {
        ctx.beginPath();
        ctx.moveTo(px + cell, py);
        ctx.lineTo(px + cell, py + cell);
        ctx.stroke();
      }
      if (y === rows - 1 && c.s) {
        ctx.beginPath();
        ctx.moveTo(px, py + cell);
        ctx.lineTo(px + cell, py + cell);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox, oy - 4, cell, 6);
  ctx.fillRect(ox + (cols - 1) * cell, oy + rows * cell - 2, cell, 6);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 30px ${SERIF}`;
  ctx.fillText(zh ? '迷宫 · 走出这一局' : 'THE MAZE', W / 2, 78);
  ctx.font = `16px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.fillText(showSolve ? (zh ? '答案已显示' : 'Solution shown') : zh ? '从左上到右下' : 'Top-left → bottom-right', W / 2, H - 46);
  ctx.textAlign = 'left';
}

// Encode a link / text as a real QR matrix, drawn as crisp ink squares with a
// quiet zone + frame, so it scans straight off the e-ink panel.
function drawQrcode(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const val = v.values || {};
  const text = String(v.content || '').trim() || 'https://example.com';
  const caption = (val.caption as string) || (zh ? '扫码查看' : 'Scan to open');
  const ec = (((val.ec as string) || 'M').toUpperCase()) as 'L' | 'M' | 'Q' | 'H';

  // Header
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `700 30px ${SERIF}`;
  ctx.fillText(zh ? '二 维 码' : 'Q R   C O D E', W / 2, 150);
  headerRule(ctx, 184);

  // Build the matrix (type 0 = smallest that fits; fall back to a fixed size).
  let qr: ReturnType<typeof qrcode>;
  try {
    qr = qrcode(0, ec);
  } catch {
    qr = qrcode(12, 'M');
  }
  try {
    qr.addData(String(text));
    qr.make();
  } catch {
    /* over-long payload for the auto version — still draw whatever got encoded */
  }
  const count = qr.getModuleCount();
  const cell = Math.max(3, Math.floor(384 / (count + 8))); // +8 modules ≈ quiet zone
  const grid = cell * count;
  const ox = Math.round((W - grid) / 2);
  const oy = Math.max(210, Math.round(210 + (410 - grid) / 2));

  // Thin frame around the quiet zone.
  const pad = cell * 4;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - pad - 8, oy - pad - 8, grid + pad * 2 + 16, grid + pad * 2 + 16);

  // Modules (+0.6px bleed to avoid hairline gaps once thresholded).
  ctx.fillStyle = INK;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.6, cell + 0.6);
    }
  }

  // Caption + the encoded payload on one auto-shrunk line.
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `34px ${SERIF}`;
  ctx.fillText(caption, W / 2, oy + grid + pad + 56);
  const dsize = fitSingleLine(ctx, text, W - 96, 20, 12);
  ctx.font = `${dsize}px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.fillText(text, W / 2, H - 60);
  ctx.textAlign = 'left';
}

export const TEMPLATES: TemplateDef[] = [
  // photo
  {
    id: 'photo',
    category: 'photo',
    draw: drawPhoto,
    fields: [
      {
        key: 'photo',
        type: 'image',
        label: { en: 'Photo', zh: '照片' },
        placeholder: { en: 'Pick any image — it is cropped & dithered to 1-bit', zh: '任意图片，会被裁切并抖动成黑白' },
      },
    ],
  },
  // time
  { id: 'clock', category: 'time', draw: drawClock, live: true },
  { id: 'date', category: 'time', draw: drawDateCard, live: true },
  { id: 'greet', category: 'time', draw: drawGreet, live: true },
  { id: 'week', category: 'time', draw: drawWeek, live: true },
  { id: 'yearprog', category: 'time', draw: drawYearProg, live: true },
  {
    id: 'countdown',
    category: 'count',
    draw: drawCountdown,
    fields: [
      { key: 'content', type: 'text', role: 'content', label: { en: 'Event', zh: '事件名称' } },
      { key: 'sub', type: 'date', role: 'sub', label: { en: 'Target date', zh: '目标日期' } },
      { key: 'showNote', type: 'checkbox', label: { en: 'Show a note', zh: '显示备注' } },
      {
        key: 'note',
        type: 'text',
        label: { en: 'Note', zh: '备注' },
        placeholder: { en: 'Optional line under the date', zh: '日期下方的一行小字（可选）' },
        showWhen: { key: 'showNote', equals: true },
      },
    ],
  },
  { id: 'progress', category: 'count', draw: drawProgress, items: true },
  { id: 'habit', category: 'count', draw: drawHabit },
  { id: 'ring', category: 'count', draw: drawRing },
  { id: 'pomodoro', category: 'count', draw: drawPomodoro },
  // text
  {
    id: 'quote',
    category: 'text',
    draw: drawQuote,
    fields: [
      {
        key: 'content',
        type: 'textarea',
        role: 'content',
        label: { en: 'Quote', zh: '金句' },
        placeholder: { en: 'One sentence worth keeping', zh: '一句值得留下的话' },
      },
      { key: 'sub', type: 'text', role: 'sub', label: { en: 'Author / source', zh: '作者 / 出处' } },
      { key: 'dark', type: 'checkbox', label: { en: 'Dark background', zh: '深色背景' } },
    ],
  },
  { id: 'poem', category: 'text', draw: drawPoem },
  { id: 'bigtype', category: 'text', draw: drawBigtype },
  { id: 'word', category: 'text', draw: drawWord, items: true },
  { id: 'haiku', category: 'text', draw: drawHaiku },
  { id: 'lyric', category: 'text', draw: drawLyric },
  { id: 'note', category: 'text', draw: drawNote },
  { id: 'blessing', category: 'text', draw: drawBlessing, items: true },
  { id: 'letter', category: 'text', draw: drawLetter },
  { id: 'verse', category: 'text', draw: drawVerse },
  // list
  { id: 'todo', category: 'list', draw: drawTodo, items: true },
  { id: 'checklist', category: 'list', draw: drawChecklist, items: true },
  { id: 'numbered', category: 'list', draw: drawNumbered, items: true },
  { id: 'groceries', category: 'list', draw: drawGroceries, items: true },
  // data
  { id: 'weather', category: 'data', draw: drawWeather },
  { id: 'status', category: 'data', draw: drawStatus, items: true },
  { id: 'reading', category: 'data', draw: drawReading, items: true },
  { id: 'dashboard', category: 'data', draw: drawDashboard, items: true },
  { id: 'shelf', category: 'data', draw: drawShelf, items: true },
  { id: 'moon', category: 'data', draw: drawMoon },
  { id: 'sun', category: 'data', draw: drawSun, items: true },
  { id: 'water', category: 'data', draw: drawWater },
  { id: 'battery', category: 'data', draw: drawBattery, items: true },
  { id: 'social', category: 'data', draw: drawSocial },
  // office
  {
    id: 'badge',
    category: 'office',
    draw: drawBadge,
    fields: [
      { key: 'photo', type: 'image', label: { en: 'Photo', zh: '照片' } },
      { key: 'company', type: 'text', label: { en: 'Company', zh: '公司' } },
      { key: 'name', type: 'text', role: 'content', label: { en: 'Name', zh: '姓名' } },
      { key: 'title', type: 'text', role: 'sub', label: { en: 'Title', zh: '职位' } },
      { key: 'dept', type: 'text', label: { en: 'Department', zh: '部门' } },
      { key: 'id', type: 'text', label: { en: 'Employee ID', zh: '工号' } },
    ],
  },
  {
    id: 'qrcode',
    category: 'office',
    draw: drawQrcode,
    fields: [
      {
        key: 'content',
        type: 'textarea',
        role: 'content',
        label: { en: 'Data (URL / text)', zh: '内容（网址 / 文本）' },
        placeholder: { en: 'Anything to encode — a link scans best', zh: '要编码的内容，网址最易扫' },
      },
      {
        key: 'caption',
        type: 'text',
        label: { en: 'Caption', zh: '下方标题' },
        placeholder: { en: 'e.g. Scan to open', zh: '例如：扫码打开' },
      },
      {
        key: 'ec',
        type: 'select',
        label: { en: 'Error correction', zh: '纠错等级' },
        options: [
          { value: 'L', label: { en: 'L · Low (7%)', zh: 'L · 低 (7%)' } },
          { value: 'M', label: { en: 'M · Medium (15%)', zh: 'M · 中 (15%)' } },
          { value: 'Q', label: { en: 'Q · Quartile (25%)', zh: 'Q · 较高 (25%)' } },
          { value: 'H', label: { en: 'H · High (30%)', zh: 'H · 高 (30%)' } },
        ],
      },
    ],
  },
  // plan
  { id: 'weekplan', category: 'plan', draw: drawWeekPlan, items: true },
  // ink
  { id: 'ink', category: 'ink', draw: drawInk },
  // poster
  {
    id: 'poster',
    category: 'poster',
    draw: drawPoster,
    fields: [
      { key: 'content', type: 'text', role: 'content', label: { en: 'Title', zh: '标题' } },
      { key: 'sub', type: 'text', role: 'sub', label: { en: 'Venue', zh: '场地' } },
      {
        key: 'items',
        type: 'textarea',
        role: 'items',
        label: { en: 'Lines (one per line)', zh: '明细（每行一条）' },
      },
      { key: 'dark', type: 'checkbox', label: { en: 'Dark background', zh: '深色背景' } },
    ],
  },
  // travel
  {
    id: 'boarding',
    category: 'travel',
    draw: drawBoardingPass,
    fields: [
      { key: 'from', type: 'text', label: { en: 'From (code)', zh: '出发 (代码)' } },
      { key: 'fromCity', type: 'text', label: { en: 'From city', zh: '出发城市' } },
      { key: 'to', type: 'text', label: { en: 'To (code)', zh: '到达 (代码)' } },
      { key: 'toCity', type: 'text', label: { en: 'To city', zh: '到达城市' } },
      { key: 'passenger', type: 'text', label: { en: 'Passenger', zh: '乘客' } },
      {
        key: 'airline',
        type: 'select',
        label: { en: 'Airline', zh: '航空公司' },
        options: [
          { value: 'AIR CHINA', label: { en: 'Air China', zh: '中国国际航空' } },
          { value: 'CHINA SOUTHERN', label: { en: 'China Southern', zh: '中国南方航空' } },
          { value: 'HAINAN AIRLINES', label: { en: 'Hainan Airlines', zh: '海南航空' } },
          { value: 'XIAMENAIR', label: { en: 'Xiamen Air', zh: '厦门航空' } },
          { value: 'CUSTOM', label: { en: 'Custom…', zh: '自定义…' } },
        ],
      },
      {
        key: 'airlineName',
        type: 'text',
        label: { en: 'Airline name', zh: '航司名称' },
        showWhen: { key: 'airline', equals: 'CUSTOM' },
      },
      { key: 'flight', type: 'text', label: { en: 'Flight no.', zh: '航班号' } },
      { key: 'gate', type: 'text', label: { en: 'Gate', zh: '登机口' } },
      { key: 'seat', type: 'text', label: { en: 'Seat', zh: '座位号' } },
      { key: 'date', type: 'date', label: { en: 'Date', zh: '日期' } },
      { key: 'depart', type: 'text', label: { en: 'Departure time', zh: '起飞时间' } },
      { key: 'boarding', type: 'text', label: { en: 'Boarding time', zh: '登机时间' } },
    ],
  },
  {
    id: 'hsr',
    category: 'travel',
    draw: drawHsrTicket,
    fields: [
      { key: 'from', type: 'text', label: { en: 'From station', zh: '出发站' } },
      { key: 'to', type: 'text', label: { en: 'To station', zh: '到达站' } },
      { key: 'train', type: 'text', label: { en: 'Train no.', zh: '车次' } },
      { key: 'date', type: 'date', label: { en: 'Date', zh: '日期' } },
      { key: 'depart', type: 'text', label: { en: 'Departure time', zh: '出发时间' } },
      { key: 'arrive', type: 'text', label: { en: 'Arrival time', zh: '到达时间' } },
      { key: 'gate', type: 'text', label: { en: 'Gate', zh: '检票口' } },
      { key: 'seat', type: 'text', label: { en: 'Seat', zh: '席位' } },
      { key: 'price', type: 'text', label: { en: 'Fare', zh: '票价' } },
    ],
  },
  // transit
  {
    id: 'subway',
    category: 'transit',
    draw: drawSubwaySign,
    fields: [
      { key: 'station', type: 'text', label: { en: 'This station', zh: '本站' } },
      { key: 'prev', type: 'text', label: { en: 'Previous', zh: '上一站' } },
      { key: 'next', type: 'text', label: { en: 'Next', zh: '下一站' } },
      { key: 'dest', type: 'text', label: { en: 'Trains towards', zh: '开往' } },
    ],
  },
  // music
  {
    id: 'vinyl',
    category: 'music',
    draw: drawVinyl,
    fields: [
      { key: 'track', type: 'text', label: { en: 'Track', zh: '曲目' } },
      { key: 'artist', type: 'text', label: { en: 'Artist', zh: '艺人' } },
      { key: 'album', type: 'text', label: { en: 'Album', zh: '专辑' } },
      {
        key: 'side',
        type: 'select',
        label: { en: 'Side', zh: '面' },
        options: [
          { value: 'A', label: { en: 'Side A', zh: 'A 面' } },
          { value: 'B', label: { en: 'Side B', zh: 'B 面' } },
        ],
      },
      { key: 'note', type: 'text', label: { en: 'Label · year', zh: '厂牌 · 年份' } },
    ],
  },
  // nature / art / divination / puzzle / ink (extended)
  {
    id: 'stamp',
    category: 'office',
    draw: drawPostageStamp,
    fields: [
      { key: 'country', type: 'text', label: { en: 'Country / post', zh: '国家 / 邮政' } },
      { key: 'value', type: 'text', label: { en: 'Denomination', zh: '面值' } },
      { key: 'subject', type: 'text', label: { en: 'Subject', zh: '主题' } },
      { key: 'year', type: 'text', label: { en: 'Year', zh: '年份' } },
    ],
  },
  {
    id: 'herbarium',
    category: 'nature',
    draw: drawHerbarium,
    fields: [
      { key: 'common', type: 'text', label: { en: 'Common name', zh: '中文名' } },
      { key: 'species', type: 'text', label: { en: 'Species (latin)', zh: '学名' } },
      { key: 'place', type: 'text', label: { en: 'Collected place', zh: '采集地' } },
      { key: 'date', type: 'date', label: { en: 'Date', zh: '日期' } },
    ],
  },
  {
    id: 'contour',
    category: 'nature',
    draw: drawContourAtlas,
    fields: [
      { key: 'title', type: 'text', label: { en: 'Region name', zh: '区域名' } },
      { key: 'elev', type: 'text', label: { en: 'Peak elevation', zh: '主峰海拔' } },
      { key: 'note', type: 'text', label: { en: 'Legend note', zh: '图例备注' } },
    ],
  },
  {
    id: 'museum',
    category: 'art',
    draw: drawMuseumWall,
    fields: [
      { key: 'content', type: 'textarea', role: 'content', label: { en: 'Exhibition title', zh: '展览标题' } },
      { key: 'sub', type: 'text', role: 'sub', label: { en: 'Museum', zh: '美术馆' } },
      { key: 'dates', type: 'text', label: { en: 'Run dates', zh: '展期' } },
      { key: 'items', type: 'textarea', role: 'items', label: { en: 'Featured works', zh: '展出作品' }, placeholder: { en: 'One per line', zh: '每行一件' } },
    ],
  },
  {
    id: 'pixelnight',
    category: 'art',
    draw: drawPixelNight,
    fields: [
      { key: 'caption', type: 'text', label: { en: 'City / caption', zh: '城市 / 标题' } },
      { key: 'date', type: 'date', label: { en: 'Date', zh: '日期' } },
    ],
  },
  {
    id: 'plum',
    category: 'ink',
    draw: drawInkPlum,
    fields: [
      { key: 'content', type: 'textarea', role: 'content', label: { en: 'Inscription (poem)', zh: '题画诗' } },
      { key: 'sub', type: 'text', role: 'sub', label: { en: 'Author', zh: '题款' } },
      { key: 'seal', type: 'text', label: { en: 'Seal character', zh: '印章字' } },
    ],
  },
  {
    id: 'fortune',
    category: 'divination',
    draw: drawDailyFortune,
    fields: [
      {
        key: 'level',
        type: 'select',
        label: { en: 'Fortune', zh: '运势' },
        options: [
          { value: 'great', label: { en: 'Great fortune', zh: '大吉' } },
          { value: 'good', label: { en: 'Good fortune', zh: '吉' } },
          { value: 'medium', label: { en: 'Neutral', zh: '平' } },
          { value: 'poor', label: { en: 'Caution', zh: '凶' } },
        ],
      },
      { key: 'content', type: 'text', role: 'content', label: { en: 'Keyword', zh: '签文关键词' } },
      { key: 'date', type: 'date', label: { en: 'Date', zh: '日期' } },
      { key: 'advice', type: 'textarea', label: { en: 'Advice', zh: '建议' } },
    ],
  },
  {
    id: 'maze',
    category: 'puzzle',
    draw: drawMaze,
    fields: [
      { key: 'seed', type: 'text', label: { en: 'Seed', zh: '随机种子' }, placeholder: { en: 'Same seed = same maze', zh: '同种子 = 同迷宫' } },
      {
        key: 'size',
        type: 'select',
        label: { en: 'Size', zh: '难度' },
        options: [
          { value: 'S', label: { en: 'Small', zh: '小' } },
          { value: 'M', label: { en: 'Medium', zh: '中' } },
          { value: 'L', label: { en: 'Large', zh: '大' } },
        ],
      },
      { key: 'showSolution', type: 'checkbox', label: { en: 'Show solution', zh: '显示解答' } },
    ],
  },
  // astro
  { id: 'starmap', category: 'astro', draw: drawStarmap },
];

export const CATEGORY_ORDER: CategoryId[] = [
  'photo',
  'time',
  'count',
  'text',
  'list',
  'data',
  'office',
  'travel',
  'transit',
  'plan',
  'ink',
  'nature',
  'art',
  'poster',
  'music',
  'astro',
  'divination',
  'puzzle',
];

export function getTemplate(id: string): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

// Default sample content so switching a template shows something meaningful.
export const SEEDS: Record<'zh' | 'en', Record<string, { content?: string; sub?: string; items?: string[]; data?: Record<string, string | boolean> }>> = {
  zh: {
    quote: { content: '把书读薄，把人读厚。', sub: '木心' },
    poem: { content: '床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。', sub: '李白 · 静夜思' },
    bigtype: { content: '专注', sub: '一次只做一件事' },
    word: { content: '从容', sub: 'cóng róng · 形容词', items: ['不慌不忙，镇定自如。', '例：他神色从容。'] },
    clock: { content: '', sub: '' },
    date: { content: '', sub: '' },
    countdown: { content: '距离新年', sub: '2027-01-01' },
    progress: { content: '本周阅读目标', sub: '62', items: ['已读 180 / 290 页'] },
    habit: { content: '连续晨读', sub: '12' },
    todo: { content: '今日待办', sub: '', items: ['[x] 晨读 20 页', '[ ] 整理笔记', '[ ] 还书', '[ ] 买咖啡豆'] },
    checklist: { content: '出门清单', sub: '', items: ['护照', '充电器', '洗漱包', '雨伞', '钥匙'] },
    weather: { content: '', sub: '上海' },
    status: { content: '82%', sub: '本周目标', items: ['连续天数 : 12', '今日页数 : 48', '剩余 : 7 页'] },
    reading: { content: '《瓦尔登湖》', sub: '梭罗', items: ['进度 : 62%', '已读 : 180 页', '剩余 : 110 页'] },
    dashboard: { content: '12 小时 40 分', sub: '累计阅读 · 填设备地址后点 Fetch 拉取', items: ['阅读会话 : 37 次', '累计翻页 : 1280 页', '最近书名 : 《瓦尔登湖》'] },
    shelf: { content: '我的书房', sub: '2026 秋 · 常备与在读', items: ['瓦尔登湖', '百年孤独', '人类简史', '活着', '三体', '局外人', '月亮与六便士', '刀锋'] },
    moon: { content: '', sub: '' },
    greet: { content: '', sub: '' },
    week: { content: '', sub: '' },
    haiku: { content: '旧池\n蛙跃水面\n水声寂', sub: '蕪村' },
    lyric: { content: '把昨天都作废，现在你在我眼前。', sub: '《勇气》' },
    note: { content: '先完成，再完美。', sub: '' },
    blessing: { content: '顺', sub: '每日一签', items: ['所求皆如愿', '所行化坦途'] },
    ring: { content: '今日目标', sub: '75' },
    pomodoro: { content: '今日专注', sub: '5' },
    numbered: { content: '优先级', sub: '', items: ['改完第三章', '回复编辑邮件', '读 20 页书', '遛狗'] },
    groceries: { content: '购物清单', sub: '', items: ['[x] 牛奶', '[ ] 鸡蛋', '面包', '咖啡豆', '[ ] 卫生纸', '苹果'] },
    sun: { content: '日照', sub: '', items: ['06:12', '18:45'] },
    water: { content: '今日饮水', sub: '5' },
    battery: { content: '设备电量', sub: '68', items: ['状态 : 阅读中', '续航 : 约 3 天'] },
    photo: { content: '', sub: '' },
    yearprog: { content: '', sub: '' },
    letter: { content: '见字如面，展信安康。一切无恙，勿念。', sub: '夫 木生' },
    verse: { content: '空山不见人，但闻人语响。返景入深林，复照青苔上。', sub: '王维' },
    ink: { content: '江山如画', sub: '' },
    poster: { content: 'musica viva', sub: '苏黎世大厅', items: ['beethoven · brahms', 'tonhalle grosser saal', '12. Juni — 20:15'] },
    starmap: { content: '星 图', sub: '' },
    weekplan: { content: '', sub: '第 42 周 · 10/12–18', items: ['周一 · 10:12 · 晨跑 5km', '周二 · 10:13 · 阅读《三体》两章', '周三 · 10:14 · 健身房 push day', '周四 · 10:15 · 读书俱乐部'] },
    social: { content: '', sub: '35' },
    badge: { content: '林墨', sub: '产品设计师 / PRODUCT DESIGNER', data: { company: '云页科技 · CLOUD PAGE', dept: '设计中心 / DESIGN', id: 'AP-0248' } },
    qrcode: { content: 'https://github.com/', data: { caption: '扫码打开', ec: 'M' } },
    boarding: { data: { from: 'PEK', fromCity: '北京 Beijing', to: 'SHA', toCity: '上海 Shanghai', passenger: '张三 / ZHANG SAN', airline: 'HAINAN AIRLINES', flight: 'HU2092', gate: 'B10', seat: '9C', date: '2026-10-13', depart: '08:45', boarding: '08:15' } },
    hsr: { data: { from: '杭州东', to: '潮阳', train: 'D3125', date: '2026-10-13', depart: '11:31', arrive: '19:50', gate: '8A', seat: '二等座 05车12F号', price: '¥543.5' } },
    subway: { data: { station: '人民广场', prev: '南京东路', next: '江苏路', dest: '徐泾东' } },
    vinyl: { data: { track: '城市之光', artist: '夜航星', album: '午夜电台', side: 'A', note: '纸片唱片 · 2025' } },
    stamp: { data: { country: '中国邮政', value: '¥1.20', subject: '山水之间', year: '2026' } },
    herbarium: { data: { common: '梅花', species: 'Prunus mume', place: '杭州 · 孤山', date: '2026-03-18' } },
    contour: { data: { title: '云岭秘境', elev: '1280 m', note: '等高距 50 m' } },
    museum: { content: '静默之物', sub: '壹页美术馆', items: ['一、陶与火', '二、纸的旅行', '三、光的标本'], data: { dates: '2026 · 春秋' } },
    pixelnight: { data: { caption: '不眠城市', date: '2026-10-14' } },
    plum: { content: '墙角数枝梅，凌寒独自开。', sub: '王安石', data: { seal: '墨' } },
    fortune: { content: '厚积薄发', data: { level: 'good', advice: '耐心耕耘，静待花开。' } },
    maze: { data: { seed: '壹页 ONEPAGE', size: 'M', showSolution: false } },
  },
  en: {
    quote: { content: 'A reader lives a thousand lives before he dies.', sub: 'George R. R. Martin' },
    poem: { content: 'The moonlight before my bed,\nI wonder if it is frost on the ground.', sub: 'Li Bai · Quiet Night Thought' },
    bigtype: { content: 'FOCUS', sub: 'one thing at a time' },
    word: { content: 'serendipity', sub: '/ˌserənˈdipədē/ · noun', items: ['Finding something good without looking for it.', '例: a happy serendipity'] },
    clock: { content: '', sub: '' },
    date: { content: '', sub: '' },
    countdown: { content: 'Days until New Year', sub: '2027-01-01' },
    progress: { content: 'Weekly goal', sub: '62', items: ['180 / 290 pages read'] },
    habit: { content: 'Morning reading streak', sub: '12' },
    todo: { content: 'Today', sub: '', items: ['[x] Read 20 pages', '[ ] Notes for book club', '[ ] Return library books', 'Buy coffee beans'] },
    checklist: { content: 'Packing list', sub: '', items: ['Passport', 'Charger', 'Toiletries', 'Umbrella', 'Keys'] },
    weather: { content: '', sub: 'Shanghai' },
    status: { content: '82%', sub: 'This week', items: ['Streak : 12 days', 'Pages today : 48', 'Remaining : 7'] },
    reading: { content: 'Walden', sub: 'Henry David Thoreau', items: ['Progress : 62%', 'Read : 180 pages', 'Left : 110 pages'] },
    dashboard: { content: '12h 40m', sub: 'Total reading · enter a device URL, then Fetch', items: ['Sessions : 37', 'Page turns : 1280', 'Last book : Walden'] },
    shelf: { content: 'My Study', sub: 'Autumn 2026 · on the shelf', items: ['Walden', 'One Hundred Years of Solitude', 'Sapiens', 'To Live', 'The Three-Body Problem', 'The Stranger', 'The Moon and Sixpence', 'The Razor\'s Edge'] },
    moon: { content: '', sub: '' },
    greet: { content: '', sub: '' },
    week: { content: '', sub: '' },
    haiku: { content: 'Old silent pond\nA frog jumps into the pond\nSplash! Silence again', sub: 'Buson' },
    lyric: { content: 'Turn the page, start again — you are right here with me.', sub: 'A song' },
    note: { content: 'Done is better than perfect.', sub: '' },
    blessing: { content: 'Fortune', sub: 'Daily draw', items: ['Clear skies ahead', 'Steady steps'] },
    ring: { content: "Today's goal", sub: '75' },
    pomodoro: { content: 'Focus sessions', sub: '5' },
    numbered: { content: 'Priorities', sub: '', items: ['Finish chapter 3', 'Reply to editor', 'Read 20 pages', 'Walk the dog'] },
    groceries: { content: 'Shopping', sub: '', items: ['[x] Milk', '[ ] Eggs', 'Bread', 'Coffee beans', '[ ] Paper towels', 'Apples'] },
    sun: { content: 'Daylight', sub: '', items: ['06:12', '18:45'] },
    water: { content: 'Water intake', sub: '5' },
    battery: { content: 'Device battery', sub: '68', items: ['Status : Reading', 'Est. life : ~3 days'] },
    photo: { content: '', sub: '' },
    yearprog: { content: '', sub: '' },
    letter: { content: 'Seeing these words is like meeting me. Rest easy, all is well here.', sub: 'Your 木生' },
    verse: { content: 'Empty mountain, no one seen. Only the sound of voices heard.', sub: 'Wang Wei' },
    ink: { content: 'Ink', sub: '' },
    poster: { content: 'musica viva', sub: 'Tonhalle Zürich', items: ['beethoven · brahms', 'webern · zurich', 'freitag, 12. juni — 20:15'] },
    starmap: { content: 'Star Chart', sub: '' },
    weekplan: { content: '', sub: 'WEEK 42 · OCT 12–18', items: ['Mon · 10:12 · Morning run 5km', 'Tue · 10:13 · Reading night', 'Wed · 10:14 · Gym, push day', 'Thu · 10:15 · Book club'] },
    social: { content: '', sub: '35' },
    badge: { content: 'LIN MO', sub: 'Product Designer', data: { company: 'AIRPAGE STUDIO', dept: 'DESIGN', id: 'AP-0248' } },
    qrcode: { content: 'https://github.com/', data: { caption: 'Scan to open', ec: 'M' } },
    boarding: { data: { from: 'PEK', fromCity: 'Beijing', to: 'SHA', toCity: 'Shanghai', passenger: 'ZHANG / SAN', airline: 'HAINAN AIRLINES', flight: 'HU2092', gate: 'B10', seat: '9C', date: '2026-10-13', depart: '08:45', boarding: '08:15' } },
    hsr: { data: { from: 'Hangzhou East', to: 'Chaoyang', train: 'D3125', date: '2026-10-13', depart: '11:31', arrive: '19:50', gate: '8A', seat: '2nd 05-12F', price: '¥543.5' } },
    subway: { data: { station: "People's Square", prev: 'E. Nanjing Rd', next: 'Jiangsu Rd', dest: 'Xujing East' } },
    vinyl: { data: { track: 'City Lights', artist: 'Night Voyager', album: 'Midnight Radio', side: 'A', note: 'PAPER RECORDS · 2025' } },
    stamp: { data: { country: 'CHINA POST', value: '1.20', subject: 'Among Hills & Water', year: '2026' } },
    herbarium: { data: { common: 'Plum Blossom', species: 'Prunus mume', place: 'Hangzhou', date: '2026-03-18' } },
    contour: { data: { title: 'Misty Ridge', elev: '1280 m', note: 'Contour interval 50 m' } },
    museum: { content: 'Silent Objects', sub: 'OnePage Museum', items: ['I. Clay & Fire', 'II. Paper Journeys', 'III. Specimens of Light'], data: { dates: '2026' } },
    pixelnight: { data: { caption: 'Sleepless City', date: '2026-10-14' } },
    plum: { content: 'Plum blossoms by the wall, blooming alone in the cold.', sub: 'Wang Anshi', data: { seal: '墨' } },
    fortune: { content: 'Steady Effort', data: { level: 'good', advice: 'Sow patiently; harvest in time.' } },
    maze: { data: { seed: 'ONEPAGE', size: 'M', showSolution: false } },
  },
};
