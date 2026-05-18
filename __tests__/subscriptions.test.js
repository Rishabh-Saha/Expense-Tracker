/**
 * Tests for subscription detection logic.
 */

const NON_SUB_CATEGORIES = new Set(['Food & Dining', 'Transport', 'Shopping', 'Travel']);
const KNOWN_SUB_KEYWORDS = [
  'netflix', 'spotify', 'apple', 'amazon', 'youtube', 'google', 'microsoft',
  'hulu', 'disney', 'hbo', 'paramount', 'peacock', 'crunchyroll', 'twitch',
  'expressvpn', 'nordvpn', 'surfshark', 'vpn', 'icloud', 'dropbox',
  'github', 'adobe', 'figma', 'notion', 'slack', 'canva', 'grammarly',
  'headspace', 'calm', 'duolingo', 'audible', 'kindle', 'patreon',
  'playstation', 'xbox', 'nintendo', 'chatgpt', 'openai',
  'gym', 'planet fitness', 'equinox',
];

function detectSubscriptions(allTxns) {
  const map = {};
  for (const t of allTxns) {
    if (t.amount <= 0 || NON_SUB_CATEGORIES.has(t.category)) continue;
    const key = (t.merchant || t.description).toLowerCase().trim().replace(/\s+/g, ' ');
    if (!map[key]) map[key] = [];
    map[key].push(t);
  }
  const results = [];
  for (const [key, txns] of Object.entries(map)) {
    const months = new Set(txns.map(t => t.date.substring(0, 7)));
    if (months.size < 2) continue;
    const amounts = txns.map(t => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (median > 200) continue;
    const allConsistent = amounts.every(a => Math.abs(a - median) / median < 0.10);
    if (!allConsistent) continue;
    const isKnownService = KNOWN_SUB_KEYWORDS.some(kw => key.includes(kw));
    const isSubCategory = txns[0].category === 'Bills & Utilities' || txns[0].category === 'Entertainment';
    if (!isKnownService && !isSubCategory) continue;
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    results.push({
      merchant: sorted[0].merchant || sorted[0].description,
      amount: median, months: months.size,
      category: sorted[0].category, lastDate: sorted[0].date,
    });
  }
  return results.sort((a, b) => b.amount - a.amount);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMonthly(merchant, amount, category, months) {
  return months.map((m, i) => ({
    merchant,
    description: merchant,
    amount,
    category,
    date: `${m}-15`,
  }));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('detectSubscriptions', () => {
  test('detects Netflix appearing in 3 months', () => {
    const txns = makeMonthly('Netflix', 15.99, 'Entertainment', ['2024-01', '2024-02', '2024-03']);
    const subs = detectSubscriptions(txns);
    expect(subs).toHaveLength(1);
    expect(subs[0].merchant).toBe('Netflix');
    expect(subs[0].amount).toBe(15.99);
  });

  test('does NOT flag DoorDash (Food & Dining)', () => {
    const txns = makeMonthly("DoorDash - Dave's Hot Chicken", 28.50, 'Food & Dining', ['2024-01', '2024-02', '2024-03']);
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('does NOT flag Uber (Transport)', () => {
    const txns = makeMonthly('Uber', 22.00, 'Transport', ['2024-01', '2024-02']);
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('does NOT flag Amazon shopping orders with varying amounts', () => {
    const txns = [
      { merchant: 'Amazon', description: 'Amazon', amount: 45.99, category: 'Shopping', date: '2024-01-10' },
      { merchant: 'Amazon', description: 'Amazon', amount: 120.00, category: 'Shopping', date: '2024-02-10' },
      { merchant: 'Amazon', description: 'Amazon', amount: 33.50, category: 'Shopping', date: '2024-03-10' },
    ];
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('detects Amazon Prime with consistent monthly charge', () => {
    const txns = makeMonthly('Amazon Prime', 14.99, 'Bills & Utilities', ['2024-01', '2024-02', '2024-03']);
    const subs = detectSubscriptions(txns);
    expect(subs).toHaveLength(1);
    expect(subs[0].amount).toBe(14.99);
  });

  test('returns empty array when no transactions', () => {
    expect(detectSubscriptions([])).toEqual([]);
  });

  test('does NOT flag a merchant seen only once', () => {
    const txns = [{ merchant: 'Spotify', description: 'Spotify', amount: 9.99, category: 'Entertainment', date: '2024-01-01' }];
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('does NOT flag large irregular charges over $200', () => {
    const txns = makeMonthly('GitHub', 250.00, 'Bills & Utilities', ['2024-01', '2024-02', '2024-03']);
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('allows up to 10% amount variation', () => {
    const txns = [
      { merchant: 'YouTube Premium', description: 'YouTube Premium', amount: 13.99, category: 'Entertainment', date: '2024-01-01' },
      { merchant: 'YouTube Premium', description: 'YouTube Premium', amount: 14.99, category: 'Entertainment', date: '2024-02-01' },
      { merchant: 'YouTube Premium', description: 'YouTube Premium', amount: 13.99, category: 'Entertainment', date: '2024-03-01' },
    ];
    // 14.99 vs 13.99 = ~7% difference — within 10% threshold
    expect(detectSubscriptions(txns)).toHaveLength(1);
  });

  test('rejects amounts varying more than 10%', () => {
    const txns = [
      { merchant: 'ExpressVPN', description: 'ExpressVPN', amount: 10.00, category: 'Bills & Utilities', date: '2024-01-01' },
      { merchant: 'ExpressVPN', description: 'ExpressVPN', amount: 15.00, category: 'Bills & Utilities', date: '2024-02-01' },
    ];
    // 50% difference — too inconsistent
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('does NOT flag unknown merchant in non-subscription category', () => {
    const txns = makeMonthly('Random Store', 50.00, 'Other', ['2024-01', '2024-02', '2024-03']);
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  test('sorts results by amount descending', () => {
    const txns = [
      ...makeMonthly('Spotify', 9.99, 'Entertainment', ['2024-01', '2024-02', '2024-03']),
      ...makeMonthly('Netflix', 15.99, 'Entertainment', ['2024-01', '2024-02', '2024-03']),
    ];
    const subs = detectSubscriptions(txns);
    expect(subs[0].amount).toBeGreaterThan(subs[1].amount);
  });

  test('skips credits (negative amounts)', () => {
    const txns = makeMonthly('Netflix', -15.99, 'Entertainment', ['2024-01', '2024-02', '2024-03']);
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });
});
