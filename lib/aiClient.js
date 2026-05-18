import { getApiKey } from './apiKey';
import { getOpenAIKey, getSelectedModel } from './modelConfig';

export async function callAI(systemPrompt, messages) {
  const model = await getSelectedModel();
  if (model.provider === 'openai') {
    return callOpenAI(model.modelId, systemPrompt, messages);
  }
  return callAnthropic(model.modelId, systemPrompt, messages);
}

async function callAnthropic(modelId, systemPrompt, messages) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Anthropic API key not set. Go to Settings → API Account.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelId, max_tokens: 1024, system: systemPrompt, messages }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callOpenAI(modelId, systemPrompt, messages) {
  const apiKey = await getOpenAIKey();
  if (!apiKey) throw new Error('OpenAI API key not set. Go to Settings → AI Model.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message ?? `OpenAI error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
