export const MODELS = [
  {
    id: 'claude-haiku',
    label: 'Claude Haiku',
    sublabel: 'Cheapest · fastest',
    costHint: 'Lowest cost',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    sublabel: 'Balanced · recommended',
    costHint: 'Medium cost',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    isDefault: true,
  },
  {
    id: 'gpt4o-mini',
    label: 'GPT-4o mini',
    sublabel: 'OpenAI · cheapest',
    costHint: 'Lowest cost',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
  },
  {
    id: 'gpt4o',
    label: 'GPT-4o',
    sublabel: 'OpenAI · standard',
    costHint: 'Medium cost',
    provider: 'openai',
    modelId: 'gpt-4o',
  },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet';
