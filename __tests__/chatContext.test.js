/**
 * Tests for chat context builder and markdown parser logic.
 */

// ── buildTxnContext (inlined) ─────────────────────────────────────────────────

function buildTxnContext(transactions) {
  const lines = transactions.slice(0, 600).map(t => {
    const display = t.amount > 0
      ? `-$${t.amount.toFixed(2)}`
      : `+$${Math.abs(t.amount).toFixed(2)}`;
    return `${t.date} | ${t.merchant || t.description} | ${t.category} | ${display}`;
  });
  return `User's credit card transactions (date | merchant | category | amount):\n${lines.join('\n')}`;
}

// ── Markdown inline parser (inlined from MarkdownText.js) ─────────────────────

function parseInlineText(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map(part =>
    part.startsWith('**') && part.endsWith('**')
      ? { bold: true, text: part.slice(2, -2) }
      : { bold: false, text: part }
  );
}

// ── buildTxnContext ───────────────────────────────────────────────────────────

describe('buildTxnContext', () => {
  const debit  = { date: '2024-03-01', merchant: 'DoorDash', description: 'DoorDash order', amount: 25.50, category: 'Food & Dining' };
  const credit = { date: '2024-03-02', merchant: 'Amazon', description: 'Amazon refund', amount: -22.59, category: 'Shopping' };

  test('starts with the header line', () => {
    const ctx = buildTxnContext([debit]);
    expect(ctx.startsWith("User's credit card transactions")).toBe(true);
  });

  test('formats debit (positive amount) with minus sign', () => {
    const ctx = buildTxnContext([debit]);
    expect(ctx).toContain('-$25.50');
  });

  test('formats credit (negative amount) with plus sign', () => {
    const ctx = buildTxnContext([credit]);
    expect(ctx).toContain('+$22.59');
  });

  test('uses merchant name when available', () => {
    const ctx = buildTxnContext([debit]);
    expect(ctx).toContain('DoorDash');
    expect(ctx).not.toContain('DoorDash order');
  });

  test('falls back to description when merchant is missing', () => {
    const t = { ...debit, merchant: null };
    const ctx = buildTxnContext([t]);
    expect(ctx).toContain('DoorDash order');
  });

  test('caps at 600 transactions', () => {
    const many = Array.from({ length: 700 }, (_, i) => ({ ...debit, date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` }));
    const ctx = buildTxnContext(many);
    const lines = ctx.split('\n').slice(1); // skip header
    expect(lines).toHaveLength(600);
  });

  test('includes date, merchant, category and amount in each line', () => {
    const ctx = buildTxnContext([debit]);
    const line = ctx.split('\n')[1];
    expect(line).toContain('2024-03-01');
    expect(line).toContain('DoorDash');
    expect(line).toContain('Food & Dining');
    expect(line).toContain('-$25.50');
  });

  test('returns only header for empty transactions', () => {
    const ctx = buildTxnContext([]);
    const nonEmptyLines = ctx.split('\n').filter(l => l.trim());
    expect(nonEmptyLines).toHaveLength(1);
  });
});

// ── parseInlineText ───────────────────────────────────────────────────────────

describe('parseInlineText', () => {
  test('plain text returns single non-bold part', () => {
    const parts = parseInlineText('Hello world');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ bold: false, text: 'Hello world' });
  });

  test('bold text is extracted correctly', () => {
    const parts = parseInlineText('**$25.50**').filter(p => p.text);
    const boldPart = parts.find(p => p.bold);
    expect(boldPart).toEqual({ bold: true, text: '$25.50' });
  });

  test('mixed text splits correctly', () => {
    const parts = parseInlineText('You spent **$150** on DoorDash');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ bold: false, text: 'You spent ' });
    expect(parts[1]).toEqual({ bold: true, text: '$150' });
    expect(parts[2]).toEqual({ bold: false, text: ' on DoorDash' });
  });

  test('multiple bold segments', () => {
    const parts = parseInlineText('**Netflix**: **$15.99**/mo');
    const boldParts = parts.filter(p => p.bold);
    expect(boldParts).toHaveLength(2);
    expect(boldParts[0].text).toBe('Netflix');
    expect(boldParts[1].text).toBe('$15.99');
  });

  test('empty string returns one empty part', () => {
    const parts = parseInlineText('');
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe('');
  });

  test('unclosed bold markers treated as plain text', () => {
    const parts = parseInlineText('**unclosed');
    expect(parts.every(p => !p.bold)).toBe(true);
  });
});
