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
  type CardView,
  type CategoryId,
  type TemplateDef,
} from './primitives';

const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isZh = (v: CardView) => v.lang === 'zh';

// ── Original four ────────────────────────────────────────────────────────────

function drawQuote(ctx: CanvasRenderingContext2D, s: CardView) {
  const text = s.content || (isZh(s) ? '壹页之上，静读之间。' : 'A page of quiet, read at leisure.');
  const { size, lines } = fitText(ctx, text, W - 128, H - 320, 64, 1.35);
  ctx.fillStyle = INK;
  ctx.font = `120px ${SERIF}`;
  ctx.fillText('“', 44, 168);
  const lineH = size * 1.35;
  let y = (H - lines.length * lineH) / 2 + size * 0.8;
  ctx.font = `${size}px ${SERIF}`;
  for (const l of lines) {
    ctx.fillText(l, 64, y);
    y += lineH;
  }
  if (s.sub) {
    ctx.font = `italic 26px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText('— ' + s.sub, W - 64, H - 96);
    ctx.textAlign = 'left';
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, s: CardView) {
  const wd = s.weather || { place: s.sub || '—', temp: 21, code: 1, days: [] };
  const info = wxInfo(wd.code);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `30px ${SERIF}`;
  ctx.fillText(wd.place, W / 2, 92);
  ctx.textAlign = 'left';
  headerRule(ctx, 128);
  drawWeatherIcon(ctx, info.icon, 150, 250, 78);
  ctx.fillStyle = INK;
  ctx.font = `128px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(wd.temp)}°`, 248, 290);
  ctx.font = `30px ${SERIF}`;
  ctx.fillText(info.t, 64, 360);
  const days = wd.days.slice(0, 4);
  if (days.length) {
    headerRule(ctx, 420);
    const colW = (W - 96) / days.length;
    days.forEach((d, i) => {
      const cx = 48 + colW * i + colW / 2;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.font = `24px ${SERIF}`;
      ctx.fillText(d.label, cx, 470);
      drawWeatherIcon(ctx, wxInfo(d.code).icon, cx, 520, 26);
      ctx.font = `26px ${SERIF}`;
      ctx.fillText(`${Math.round(d.hi)}° / ${Math.round(d.lo)}°`, cx, 588);
    });
    ctx.textAlign = 'left';
  }
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
  ctx.fillStyle = INK;
  ctx.font = `44px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.content || (isZh(s) ? '待办' : 'To-do'), W / 2, 120);
  ctx.textAlign = 'left';
  if (s.sub) {
    ctx.font = `24px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.fillText(s.sub, W / 2, 158);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
  }
  headerRule(ctx, 192);
  const rows = s.items.filter(Boolean).slice(0, 10);
  let y = 250;
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
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  centeredText(ctx, 34, 150, v.content || (zh ? '距离' : 'Days until'));
  headerRule(ctx, 200);
  const target = Date.parse(v.sub);
  ctx.fillStyle = INK;
  if (Number.isNaN(target)) {
    ctx.textAlign = 'center';
    ctx.font = `48px ${SERIF}`;
    ctx.fillText('—', W / 2, 430);
    ctx.font = `26px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.6)';
    ctx.fillText(zh ? '在副标题填日期 2026-01-01' : 'Enter a date: 2026-01-01', W / 2, 500);
    ctx.textAlign = 'left';
    return;
  }
  const days = Math.ceil((target - Date.now()) / 86400000);
  const abs = Math.abs(days);
  let size = 300;
  ctx.textAlign = 'center';
  ctx.font = `${size}px ${SERIF}`;
  while (ctx.measureText(String(abs)).width > W - 120 && size > 80) {
    size -= 16;
    ctx.font = `${size}px ${SERIF}`;
  }
  ctx.fillText(String(abs), W / 2, 430 + size * 0.3);
  const unit = zh ? (days >= 0 ? '天后' : '天前') : `day${abs === 1 ? '' : 's'}`;
  ctx.font = `40px ${SERIF}`;
  ctx.fillText(unit, W / 2, 520);
  ctx.font = `28px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.fillText(new Date(target).toLocaleDateString(zh ? 'zh-CN' : 'en-US'), W / 2, 580);
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
  ctx.fillStyle = INK;
  ctx.font = `44px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText(v.content || (isZh(v) ? '清单' : 'Checklist'), W / 2, 120);
  ctx.textAlign = 'left';
  if (v.sub) {
    ctx.font = `24px ${SERIF}`;
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(v.sub, W / 2, 158);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
  }
  headerRule(ctx, 192);
  const rows = v.items.filter(Boolean).slice(0, 12);
  let y = 250;
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
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.font = `26px ${SERIF}`;
  ctx.fillText(zh ? '在读' : 'NOW READING', 56, 140);
  const book = v.content || (zh ? '《瓦尔登湖》' : 'Walden');
  const { size, lines } = fitText(ctx, book, W - 112, 300, 60, 1.2, 30);
  ctx.fillStyle = INK;
  ctx.font = `${size}px ${SERIF}`;
  let y = 240;
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
    const bx = 56, bw = W - 112, bh = 14;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, y, bw, bh);
    ctx.fillStyle = INK;
    ctx.fillRect(bx, y, (bw * pct) / 100, bh);
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
  const cx = W / 2, cy = 320, R = 130;
  // Base disc outline.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  // Fill the lit portion using a terminator ellipse.
  const waxing = phase < 0.5;
  const k = Math.cos(2 * Math.PI * phase); // -1 full .. 1 new
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI / 2, (3 * Math.PI) / 2, waxing);
  ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, (3 * Math.PI) / 2, Math.PI / 2, k > 0 === !waxing);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `44px ${SERIF}`;
  ctx.fillText(v.content || (zh ? names_zh[idx] : names_en[idx]), W / 2, 540);
  ctx.font = `28px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(`${Math.round(illum * 100)}%`, W / 2, 588);
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(today(zh ? 'zh' : 'en'), W / 2, 632);
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
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(v.image, (W - dw) / 2, (H - dh) / 2, dw, dh);
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
  const name = v.content || (zh ? '林墨' : 'LIN MO');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, 8);
  ctx.font = `22px ${SERIF}`;
  ctx.fillText('AIRPAGE STUDIO', 48, 96);
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.font = `18px ${SERIF}`;
  ctx.fillText(zh ? '/ 云页科技' : '/ Cloud Page', 214, 96);
  ctx.fillStyle = INK;
  ctx.fillRect(48, 118, 40, 40);
  const px = 110, py = 150, pw = W - 220, ph = 300;
  ctx.fillStyle = 'rgba(17,17,17,0.12)';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(17,17,17,0.5)';
  ctx.textAlign = 'center';
  ctx.font = `96px ${SERIF}`;
  ctx.fillText(name.trim().slice(0, 2), px + pw / 2, py + ph / 2 + 34);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `${fitSingleLine(ctx, name, W - 96, 52, 34)}px ${SERIF}`;
  ctx.fillText(name, 48, 522);
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.65)';
  ctx.fillText(v.sub || (zh ? '产品设计师 / PRODUCT DESIGNER' : 'Product Designer'), 48, 560);
  ctx.fillStyle = INK;
  ctx.fillRect(0, H - 96, W, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = `18px ${SERIF}`;
  ctx.fillText(zh ? '工号 / EMPLOYEE ID' : 'EMPLOYEE ID', 48, H - 62);
  ctx.font = `34px ${SERIF}`;
  ctx.fillText(v.items[0] || 'AP-0248', 48, H - 26);
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
  ctx.fillStyle = 'rgba(17,17,17,0.22)';
  ctx.beginPath();
  ctx.arc(W - 120, 150, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(17,17,17,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const bx = 110 + i * 24;
    const by = 118 + (i % 2) * 16;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.quadraticCurveTo(bx, by - 7, bx + 8, by);
    ctx.stroke();
  }
  const layers = [{ y: 380, a: 0.16 }, { y: 500, a: 0.4 }, { y: 630, a: 0.72 }];
  layers.forEach((L, li) => {
    ctx.fillStyle = `rgba(17,17,17,${L.a})`;
    ctx.beginPath();
    ctx.moveTo(0, L.y);
    const peaks = 3 + li;
    for (let p = 0; p <= peaks; p++) {
      const px = (W / peaks) * p;
      const py = L.y - 70 - Math.sin(p * 1.3 + li * 0.6) * 54;
      ctx.quadraticCurveTo(px - W / (peaks * 2), py, px, L.y - 16);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(17,17,17,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = 706 + i * 20;
    ctx.beginPath();
    ctx.moveTo(60 + i * 12, y);
    ctx.lineTo(W - 60 - i * 12, y);
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(150, 700);
  ctx.quadraticCurveTo(182, 718, 214, 700);
  ctx.lineTo(202, 710);
  ctx.quadraticCurveTo(182, 722, 162, 710);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  verticalRun(ctx, v.content || (zh ? '江山如画' : 'Ink'), W - 56, 250, 30, 8, 6);
}

function drawPoster(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  const cx = W;
  const cy = 0;
  for (let i = 11; i >= 1; i--) {
    ctx.strokeStyle = `rgba(17,17,17,${0.12 + (11 - i) * 0.075})`;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(cx, cy, i * 24, Math.PI * 0.5, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold ${fitSingleLine(ctx, v.content || 'musica viva', W - 96, 60, 34)}px ${SERIF}`;
  ctx.fillText(v.content || 'musica viva', 48, 520);
  ctx.strokeStyle = INK;
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
  ctx.fillStyle = 'rgba(17,17,17,0.7)';
  ctx.fillText(v.sub || (zh ? '苏黎世大厅' : 'Tonhalle Zürich'), 48, y + 8);
}

function drawStarmap(ctx: CanvasRenderingContext2D, v: CardView) {
  const zh = isZh(v);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const stars: number[][] = [];
  for (let i = 0; i < 72; i++) stars.push([40 + rnd() * (W - 80), 150 + rnd() * (H - 300), rnd() * 2 + 0.6]);
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of stars) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const pts = stars.slice(0, 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2 - 20, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `40px ${SERIF}`;
  ctx.fillText(v.content || (zh ? '星 图' : 'Star Chart'), W / 2, 96);
  ctx.font = `22px ${SERIF}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(v.sub || today(zh ? 'zh' : 'en'), W / 2, H - 56);
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
  ctx.font = `64px ${SERIF}`;
  ctx.fillText(String(v.content || year), W / 2, 122);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = 'rgba(17,17,17,0.6)';
  ctx.fillText(zh ? '年 度 进 度' : 'YEAR PROGRESS', W / 2, 158);
  ctx.textAlign = 'left';
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
  ctx.fillStyle = 'rgba(17,17,17,0.5)';
  ctx.font = `20px ${SERIF}`;
  ctx.fillText(zh ? '日拱一卒，功不唐捐' : 'One day at a time', 48, H - 68);
}

// ── Registry (grouped by category, in display order) ───────────────────────────

export const TEMPLATES: TemplateDef[] = [
  // photo
  { id: 'photo', category: 'photo', draw: drawPhoto },
  // time
  { id: 'clock', category: 'time', draw: drawClock, live: true },
  { id: 'date', category: 'time', draw: drawDateCard, live: true },
  { id: 'greet', category: 'time', draw: drawGreet, live: true },
  { id: 'week', category: 'time', draw: drawWeek, live: true },
  { id: 'yearprog', category: 'time', draw: drawYearProg, live: true },
  { id: 'countdown', category: 'count', draw: drawCountdown },
  { id: 'progress', category: 'count', draw: drawProgress, items: true },
  { id: 'habit', category: 'count', draw: drawHabit },
  { id: 'ring', category: 'count', draw: drawRing },
  { id: 'pomodoro', category: 'count', draw: drawPomodoro },
  // text
  { id: 'quote', category: 'text', draw: drawQuote },
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
  { id: 'moon', category: 'data', draw: drawMoon },
  { id: 'sun', category: 'data', draw: drawSun, items: true },
  { id: 'water', category: 'data', draw: drawWater },
  { id: 'battery', category: 'data', draw: drawBattery, items: true },
  { id: 'social', category: 'data', draw: drawSocial },
  // office
  { id: 'badge', category: 'office', draw: drawBadge, items: true },
  // plan
  { id: 'weekplan', category: 'plan', draw: drawWeekPlan, items: true },
  // ink
  { id: 'ink', category: 'ink', draw: drawInk },
  // poster
  { id: 'poster', category: 'poster', draw: drawPoster, items: true },
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
  'plan',
  'ink',
  'poster',
  'astro',
];

export function getTemplate(id: string): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

// Default sample content so switching a template shows something meaningful.
export const SEEDS: Record<'zh' | 'en', Record<string, { content?: string; sub?: string; items?: string[] }>> = {
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
    badge: { content: '林墨', sub: '产品设计师 / PRODUCT DESIGNER', items: ['AP-0248'] },
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
    badge: { content: 'LIN MO', sub: 'Product Designer', items: ['AP-0248'] },
  },
};
