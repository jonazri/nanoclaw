import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isShabbatOrYomTov,
  getNextCandleLighting,
  _loadScheduleForTest,
} from './shabbat.js';

const TEST_SCHEDULE = {
  location: 'Test',
  coordinates: [40.669, -73.943],
  elevation: 25,
  tzeisBufferMinutes: 18,
  generatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2031-01-01T00:00:00.000Z',
  windowCount: 3,
  windows: [
    {
      start: '2026-02-20T17:20:00.000Z',
      end: '2026-02-21T23:45:00.000Z',
      type: 'shabbat' as const,
      label: 'Shabbat',
    },
    {
      start: '2026-02-27T17:28:00.000Z',
      end: '2026-02-28T23:50:00.000Z',
      type: 'shabbat' as const,
      label: 'Shabbat',
    },
    {
      start: '2026-03-20T17:40:00.000Z',
      end: '2026-03-22T23:55:00.000Z',
      type: 'shabbat+yomtov' as const,
      label: 'Shabbat / Pesach',
    },
  ],
};

describe('isShabbatOrYomTov', () => {
  beforeEach(() => {
    _loadScheduleForTest(TEST_SCHEDULE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true during a Shabbat window', () => {
    vi.setSystemTime(new Date('2026-02-20T20:00:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(true);
  });

  it('returns true at exact start of window (shkiya)', () => {
    vi.setSystemTime(new Date('2026-02-20T17:20:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(true);
  });

  it('returns false just before shkiya', () => {
    vi.setSystemTime(new Date('2026-02-20T17:19:59.999Z'));
    expect(isShabbatOrYomTov()).toBe(false);
  });

  it('returns true just before end of window', () => {
    vi.setSystemTime(new Date('2026-02-21T23:44:59.999Z'));
    expect(isShabbatOrYomTov()).toBe(true);
  });

  it('returns false at exact end of window (tzeis + 18)', () => {
    vi.setSystemTime(new Date('2026-02-21T23:45:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(false);
  });

  it('returns false on a weekday', () => {
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(false);
  });

  it('returns true during a merged shabbat+yomtov window', () => {
    vi.setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(true);
  });

  it('returns false before any windows', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(false);
  });

  it('returns false after all windows', () => {
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    expect(isShabbatOrYomTov()).toBe(false);
  });
});

describe('getNextCandleLighting', () => {
  beforeEach(() => {
    _loadScheduleForTest(TEST_SCHEDULE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns candle lighting 18 minutes before next shkiya', () => {
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));
    const result = getNextCandleLighting();
    expect(result).not.toBeNull();
    // shkiya is 17:20, candle lighting is 17:02
    expect(result!.time.toISOString()).toBe('2026-02-20T17:02:00.000Z');
    expect(result!.label).toBe('Shabbat');
  });

  it('returns next window when current candle lighting has passed', () => {
    vi.setSystemTime(new Date('2026-02-20T17:10:00.000Z'));
    const result = getNextCandleLighting();
    // First window candle lighting (17:02) already passed, returns second window
    expect(result!.time.toISOString()).toBe('2026-02-27T17:10:00.000Z');
  });

  it('returns null after all windows', () => {
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    expect(getNextCandleLighting()).toBeNull();
  });
});
