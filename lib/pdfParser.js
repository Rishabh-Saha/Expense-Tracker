import { File } from 'expo-file-system/next';
import { getApiKey } from './apiKey';

const SYSTEM_PROMPT = `You are a financial data extractor. Your only job is to extract transactions from credit card statements.

CRITICAL: Respond with ONLY a raw JSON array. No explanation, no markdown, no code fences, no preamble. Start your response with [ and end with ].

Each transaction object must have exactly these fields:
{
  "date": "YYYY-MM-DD",
  "description": "full transaction description from statement",
  "merchant": "simplified merchant name",
  "amount": 25.50,
  "category": "Food & Dining"
}

Rules:
- amount: positive number for purchases/debits, negative for refunds/credits
- date: always YYYY-MM-DD. If year is missing, infer it from surrounding dates or statement period
- category: must be exactly one of: "Food & Dining", "Transport", "Shopping", "Entertainment", "Bills & Utilities", "Healthcare", "Travel", "Other"
- Exclude: payments TO the card, interest charges, annual fees, balance transfers
- If no transactions found, return an empty array: []
- Do NOT add any text before or after the JSON array`;

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function extractJsonArray(text) {
  // 1. Strip markdown code fences
  let s = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // 2. Direct array match
  const arrayMatch = s.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  // 3. Object with a transactions/data/items key containing an array
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

export async function extractTransactionsFromPDF(fileUri) {
  const apiKey = await getApiKey();
  if (!apiKey || apiKey === 'your-key-here') {
    throw new Error('Anthropic API key not set. Add it in Settings.');
  }

  const file = new File(fileUri);
  const bytes = await file.bytes();
  const base64 = uint8ToBase64(bytes);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Extract all transactions from this credit card statement. Return only the JSON array.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';

  const rawJson = extractJsonArray(text);
  if (!rawJson) {
    const preview = text.length > 400 ? text.substring(0, 400) + '…' : text || '(empty response)';
    throw new Error(`Claude did not return a JSON array.\n\nFull response:\n${preview}`);
  }

  let transactions;
  try {
    transactions = JSON.parse(rawJson);
  } catch (e) {
    const preview = rawJson.length > 400 ? rawJson.substring(0, 400) + '…' : rawJson;
    throw new Error(`JSON parse failed: ${e.message}\n\nRaw:\n${preview}`);
  }

  if (!Array.isArray(transactions)) {
    throw new Error('Parsed response is not an array. Please try again.');
  }

  if (transactions.length === 0) {
    throw new Error('No transactions found in this PDF. Make sure it is a credit card statement.');
  }

  return transactions.filter(t => t.date && t.amount != null && t.description);
}

export function inferMonthFromTransactions(transactions) {
  if (!transactions.length) return null;
  const dates = transactions.map(t => t.date.substring(0, 7)).sort();
  return dates[Math.floor(dates.length / 2)];
}
