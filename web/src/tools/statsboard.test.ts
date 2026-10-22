import { describe, expect, it } from 'vitest';
import { dailySeries, deriveMetrics, formatDuration, parseStats, summaryText, type Snapshot } from './statsboard';

describe('parseStats', () => {
  it('floors values and clamps negatives / non-numbers to 0', () => {
    const s = parseStats({ totalReadingSeconds: 100.7, totalPagesTurns: -5, readingSessions: '12', uptime: null });
    expect(s).toEqual({ totalReadingSeconds: 100, totalPagesTurns: 0, readingSessions: 12, uptime: 0 });
  });

  it('tolerates a missing body', () => {
    expect(parseStats(undefined)).toEqual({ totalReadingSeconds: 0, totalPagesTurns: 0, readingSessions: 0, uptime: 0 });
  });
});

describe('formatDuration', () => {
  it('picks a unit that fits, in both languages', () => {
    expect(formatDuration(45, true)).toBe('45 秒');
    expect(formatDuration(120, true)).toBe('2 分钟');
    expect(formatDuration(3660, true)).toBe('1 小时 1 分');
    expect(formatDuration(90000, true)).toBe('1 天 1 小时');
    expect(formatDuration(3660, false)).toBe('1h 1m');
    expect(formatDuration(45, false)).toBe('45s');
  });
});

describe('deriveMetrics', () => {
  it('computes per-session and pace metrics', () => {
    const d = deriveMetrics({ totalReadingSeconds: 3600, totalPagesTurns: 60, readingSessions: 2, uptime: 0 });
    expect(d.avgSessionSec).toBe(1800);
    expect(d.pagesPerSession).toBe(30);
    expect(d.pagesPerHour).toBe(60);
  });

  it('guards against divide-by-zero', () => {
    const d = deriveMetrics({ totalReadingSeconds: 0, totalPagesTurns: 0, readingSessions: 0, uptime: 0 });
    expect(d).toEqual({ avgSessionSec: 0, pagesPerSession: 0, pagesPerHour: 0 });
  });
});

describe('dailySeries', () => {
  const day = (n: number) => new Date(2026, 9, n, 12).getTime(); // local noon

  it('attributes each snapshot delta to the later day and fills the window', () => {
    const snaps: Snapshot[] = [
      { t: day(18), sec: 0, pages: 0, sessions: 0 },
      { t: day(19), sec: 3600, pages: 10, sessions: 1 },
      { t: day(20), sec: 3600, pages: 25, sessions: 2 }, // no time delta on the 20th
    ];
    const series = dailySeries(snaps, 3, day(20));
    expect(series).toHaveLength(3);
    expect(series[0].sec).toBe(0); // 10/18
    expect(series[1].sec).toBe(3600); // 10/19 got the +1h
    expect(series[2].sec).toBe(0); // 10/20
    expect(series[1].label).toBe('10/19');
  });

  it('returns an all-zero window with fewer than two snapshots', () => {
    const series = dailySeries([{ t: day(20), sec: 100, pages: 1, sessions: 1 }], 2, day(20));
    expect(series.every((d) => d.sec === 0)).toBe(true);
  });
});

describe('summaryText', () => {
  it('includes totals and derived pace in Chinese', () => {
    const text = summaryText({ totalReadingSeconds: 3600, totalPagesTurns: 60, readingSessions: 2, uptime: 0 }, true);
    expect(text).toContain('累计阅读');
    expect(text).toContain('1 小时');
    expect(text).toContain('60 页/小时');
  });

  it('renders an English summary', () => {
    const text = summaryText({ totalReadingSeconds: 3600, totalPagesTurns: 60, readingSessions: 2, uptime: 0 }, false);
    expect(text).toContain('Total reading');
    expect(text).toContain('Pace');
  });
});
