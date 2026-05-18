/**
 * Tests for PDF parsing utilities — pure functions only, no native modules.
 */

// ── Inline the functions under test ──────────────────────────────────────────
// (avoids importing expo-file-system which isn't available in Jest)

function extractJsonArray(text) {
  let s = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const arrayMatch = s.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      const arrayKey = Object.keys(obj).find(k => Array.isArray(obj[k]));
      if (arrayKey) return JSON.stringify(obj[arrayKey]);
    } catch {}
  }
  return null;
}

function inferMonthFromTransactions(transactions) {
  if (!transactions.length) return null;
  const dates = transactions.map(t => t.date.substring(0, 7)).sort();
  return dates[Math.floor(dates.length / 2)];
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── extractJsonArray ──────────────────────────────────────────────────────────

describe('extractJsonArray', () => {
  test('returns raw JSON array as-is', () => {
    const input = '[{"date":"2024-01-01","amount":10}]';
    expect(extractJsonArray(input)).toBe(input);
  });

  test('strips markdown code fences', () => {
    const input = '```json\n[{"amount":5}]\n```';
    expect(JSON.parse(extractJsonArray(input))).toEqual([{ amount: 5 }]);
  });

  test('strips code fences without language tag', () => {
    const input = '```\n[{"amount":5}]\n```';
    expect(JSON.parse(extractJsonArray(input))).toEqual([{ amount: 5 }]);
  });

  test('extracts array from wrapped object with transactions key', () => {
    const input = '{"transactions":[{"date":"2024-01-01","amount":10}]}';
    const result = JSON.parse(extractJsonArray(input));
    expect(result).toEqual([{ date: '2024-01-01', amount: 10 }]);
  });

  test('extracts array from wrapped object with data key', () => {
    const input = '{"data":[{"amount":99}]}';
    const result = JSON.parse(extractJsonArray(input));
    expect(result).toEqual([{ amount: 99 }]);
  });

  test('returns null when no JSON found', () => {
    expect(extractJsonArray('No transactions found in this document.')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractJsonArray('')).toBeNull();
  });

  test('handles explanation text before the array', () => {
    const input = 'Here are the transactions:\n[{"amount":5}]';
    expect(JSON.parse(extractJsonArray(input))).toEqual([{ amount: 5 }]);
  });
});

// ── inferMonthFromTransactions ────────────────────────────────────────────────

describe('inferMonthFromTransactions', () => {
  test('returns null for empty array', () => {
    expect(inferMonthFromTransactions([])).toBeNull();
  });

  test('returns month from single transaction', () => {
    expect(inferMonthFromTransactions([{ date: '2024-03-15' }])).toBe('2024-03');
  });

  test('returns median month for odd count', () => {
    const txns = [
      { date: '2024-01-01' },
      { date: '2024-02-15' },
      { date: '2024-03-20' },
    ];
    expect(inferMonthFromTransactions(txns)).toBe('2024-02');
  });

  test('returns median month for even count', () => {
    const txns = [
      { date: '2024-01-01' },
      { date: '2024-02-01' },
      { date: '2024-03-01' },
      { date: '2024-04-01' },
    ];
    // median index = floor(4/2) = 2 → '2024-03'
    expect(inferMonthFromTransactions(txns)).toBe('2024-03');
  });

  test('handles transactions spanning many months', () => {
    const txns = Array.from({ length: 31 }, (_, i) => ({
      date: `2024-${String(i % 12 + 1).padStart(2, '0')}-01`,
    }));
    expect(inferMonthFromTransactions(txns)).toBeTruthy();
  });
});

// ── uint8ToBase64 ─────────────────────────────────────────────────────────────

describe('uint8ToBase64', () => {
  test('encodes simple bytes correctly', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(atob(uint8ToBase64(bytes))).toBe('Hello');
  });

  test('round-trips back to original bytes', () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const encoded = uint8ToBase64(original);
    const decoded = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    expect(decoded).toEqual(original);
  });

  test('handles large byte arrays in chunks without stack overflow', () => {
    const large = new Uint8Array(50000).fill(65); // 50KB of 'A'
    expect(() => uint8ToBase64(large)).not.toThrow();
    expect(uint8ToBase64(large).length).toBeGreaterThan(0);
  });

  test('returns empty string for empty input', () => {
    expect(uint8ToBase64(new Uint8Array(0))).toBe('');
  });
});
