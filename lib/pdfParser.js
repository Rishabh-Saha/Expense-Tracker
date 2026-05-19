import { File } from 'expo-file-system/next';
import { getApiKey } from './apiKey';
import { getSelectedModel, getOpenAIKey } from './modelConfig';

const SYSTEM_PROMPT = `You are a financial data extractor. Your only job is to extract transactions from credit card statements.

CRITICAL: Respond with ONLY a raw JSON object. No explanation, no markdown, no code fences. Start with { and end with }.

Return this exact structure:
{
  "cardName": "Bank Card Name (••••XXXX)",
  "creditLimit": 15000.00,
  "statementBalance": 723.86,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "full transaction description from statement",
      "merchant": "simplified merchant name",
      "amount": 25.50,
      "category": "Food & Dining"
    }
  ]
}

Rules:
- cardName: identify the bank and card type, then find the last 4 digits of the account/card number on the statement. Format as "Bank Card Name (••••XXXX)". Examples: "CIBC Aventura Gold Visa (••••3725)", "PC Financial Mastercard (••••7795)". If no card number is visible, omit the suffix. "President's Choice" and "PC Financial" refer to the same bank — always use "PC Financial".
- amount: positive number for purchases/debits, negative for refunds/credits
- date: always YYYY-MM-DD. If year is missing, infer it from surrounding dates or statement period
- category: must be exactly one of: "Food & Dining", "Transport", "Shopping", "Entertainment", "Bills & Utilities", "Healthcare", "Travel", "Other"
- creditLimit: the credit limit shown on the statement (number, no $ sign). null if not shown.
- statementBalance: the total balance / amount owed on the statement date (number, no $ sign). null if not shown.
- Exclude: payments TO the card, interest charges, annual fees, balance transfers
- If no transactions found, return an empty transactions array
- Do NOT add any text before or after the JSON object`;

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

async function extractWithAnthropic(modelId, base64) {
  const apiKey = await getApiKey();
  if (!apiKey || apiKey === 'your-key-here') {
    throw new Error('Anthropic API key not set. Add it in Settings.');
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract all transactions from this credit card statement. Return only the JSON.' },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Anthropic error ${response.status}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

async function extractWithOpenAI(modelId, base64) {
  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    throw new Error('OpenAI API key not set. Add it in Settings → AI Model.');
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: { filename: 'statement.pdf', file_data: `data:application/pdf;base64,${base64}` },
            },
            { type: 'text', text: SYSTEM_PROMPT + '\n\nExtract all transactions from this credit card statement. Return only the JSON.' },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `OpenAI error ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function extractTransactionsFromPDF(fileUri) {
  const selectedModel = await getSelectedModel();

  const file = new File(fileUri);
  const bytes = await file.bytes();
  const base64 = uint8ToBase64(bytes);

  const text = selectedModel.provider === 'openai'
    ? await extractWithOpenAI(selectedModel.modelId, base64)
    : await extractWithAnthropic(selectedModel.modelId, base64);

  // Try object format first {cardName, transactions}, fall back to plain array
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  const rawJson = objMatch?.[0] ?? arrMatch?.[0];

  if (!rawJson) {
    const preview = text.length > 400 ? text.substring(0, 400) + '…' : text || '(empty response)';
    throw new Error(`AI did not return JSON.\n\nFull response:\n${preview}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    const preview = rawJson.length > 400 ? rawJson.substring(0, 400) + '…' : rawJson;
    throw new Error(`JSON parse failed: ${e.message}\n\nRaw:\n${preview}`);
  }

  let cardName = 'Unknown Card';
  let creditLimit = null;
  let statementBalance = null;
  let transactions;

  if (Array.isArray(parsed)) {
    transactions = parsed;
  } else if (parsed?.transactions) {
    cardName = parsed.cardName?.trim() || 'Unknown Card';
    creditLimit = typeof parsed.creditLimit === 'number' ? parsed.creditLimit : null;
    statementBalance = typeof parsed.statementBalance === 'number' ? parsed.statementBalance : null;
    transactions = parsed.transactions;
  } else {
    throw new Error('Unexpected response format. Please try again.');
  }

  if (!transactions.length) {
    throw new Error('No transactions found in this PDF. Make sure it is a credit card statement.');
  }

  return {
    cardName,
    creditLimit,
    statementBalance,
    transactions: transactions.filter(t => t.date && t.amount != null && t.description),
  };
}

export function inferMonthFromTransactions(transactions) {
  if (!transactions.length) return null;
  const dates = transactions.map(t => t.date.substring(0, 7)).sort();
  return dates[Math.floor(dates.length / 2)];
}
