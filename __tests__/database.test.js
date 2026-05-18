/**
 * Tests for database utility logic — pure functions, no SQLite.
 */

// ── transactionFingerprint (inlined from database.js) ─────────────────────────

function transactionFingerprint(t) {
  const normalized = `${t.date}|${Number(t.amount).toFixed(2)}|${t.description.toLowerCase().trim().substring(0, 60)}`;
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash = hash >>> 0;
  }
  return `txn-${hash}-${normalized.length}`;
}

// ── getPeriodDates (inlined from AnalyticsScreen.js) ─────────────────────────

function getPeriodDates(periodId) {
  const today = new Date('2026-05-18'); // fixed date for deterministic tests
  const todayStr = today.toISOString().substring(0, 10);
  if (periodId === 'ytd') {
    return { start: `${today.getFullYear()}-01-01`, end: todayStr };
  }
  if (periodId === '1year') {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - 1);
    return { start: d.toISOString().substring(0, 10), end: todayStr };
  }
  if (periodId === 'all') {
    return { start: '2000-01-01', end: todayStr };
  }
  const [y, m] = periodId.split('-');
  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  return { start: `${periodId}-01`, end: `${periodId}-${lastDay}` };
}

// ── transactionFingerprint ────────────────────────────────────────────────────

describe('transactionFingerprint', () => {
  const base = { date: '2024-03-15', amount: 25.50, description: 'DoorDash order' };

  test('same transaction always produces the same ID', () => {
    expect(transactionFingerprint(base)).toBe(transactionFingerprint(base));
  });

  test('different dates produce different IDs', () => {
    const t2 = { ...base, date: '2024-03-16' };
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint(t2));
  });

  test('different amounts produce different IDs', () => {
    const t2 = { ...base, amount: 25.51 };
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint(t2));
  });

  test('different descriptions produce different IDs', () => {
    const t2 = { ...base, description: 'Uber eats order' };
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint(t2));
  });

  test('description comparison is case-insensitive', () => {
    const lower = { ...base, description: 'doordash order' };
    const upper = { ...base, description: 'DOORDASH ORDER' };
    expect(transactionFingerprint(lower)).toBe(transactionFingerprint(upper));
  });

  test('descriptions truncated to 60 chars match', () => {
    const long  = { ...base, description: 'A'.repeat(100) };
    const short = { ...base, description: 'A'.repeat(60) };
    expect(transactionFingerprint(long)).toBe(transactionFingerprint(short));
  });

  test('amount normalised to 2 decimal places', () => {
    const t1 = { ...base, amount: 25.5 };
    const t2 = { ...base, amount: 25.50 };
    expect(transactionFingerprint(t1)).toBe(transactionFingerprint(t2));
  });

  test('returns a string starting with "txn-"', () => {
    expect(transactionFingerprint(base)).toMatch(/^txn-\d+-\d+$/);
  });
});

// ── getPeriodDates ────────────────────────────────────────────────────────────

describe('getPeriodDates', () => {
  test('ytd starts on Jan 1 of current year', () => {
    const { start } = getPeriodDates('ytd');
    expect(start).toBe('2026-01-01');
  });

  test('ytd ends today', () => {
    const { end } = getPeriodDates('ytd');
    expect(end).toBe('2026-05-18');
  });

  test('1year starts exactly 1 year ago', () => {
    const { start } = getPeriodDates('1year');
    expect(start).toBe('2025-05-18');
  });

  test('all starts from year 2000', () => {
    const { start } = getPeriodDates('all');
    expect(start).toBe('2000-01-01');
  });

  test('individual month has correct start', () => {
    const { start } = getPeriodDates('2024-03');
    expect(start).toBe('2024-03-01');
  });

  test('individual month has correct end for 31-day month', () => {
    const { end } = getPeriodDates('2024-03');
    expect(end).toBe('2024-03-31');
  });

  test('individual month has correct end for 28-day February', () => {
    const { end } = getPeriodDates('2023-02');
    expect(end).toBe('2023-02-28');
  });

  test('individual month has correct end for leap year February', () => {
    const { end } = getPeriodDates('2024-02');
    expect(end).toBe('2024-02-29');
  });

  test('individual month has correct end for 30-day month', () => {
    const { end } = getPeriodDates('2024-04');
    expect(end).toBe('2024-04-30');
  });
});
