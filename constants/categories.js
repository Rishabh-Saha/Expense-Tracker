export const CATEGORIES = {
  'Food & Dining': { color: '#FF6B6B', emoji: '🍔' },
  'Transport': { color: '#4ECDC4', emoji: '🚗' },
  'Shopping': { color: '#45B7D1', emoji: '🛍️' },
  'Entertainment': { color: '#FFEAA7', emoji: '🎬' },
  'Bills & Utilities': { color: '#A29BFE', emoji: '💡' },
  'Healthcare': { color: '#FD79A8', emoji: '💊' },
  'Travel': { color: '#55EFC4', emoji: '✈️' },
  'Other': { color: '#B0BEC5', emoji: '💳' },
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

export function getCategoryColor(name) {
  return CATEGORIES[name]?.color ?? CATEGORIES['Other'].color;
}

export function getCategoryEmoji(name) {
  return CATEGORIES[name]?.emoji ?? CATEGORIES['Other'].emoji;
}
