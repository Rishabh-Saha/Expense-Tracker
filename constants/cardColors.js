// Cycles through these for each unique card name
const CARD_PALETTE = [
  '#7C6FF7', '#00B4D8', '#FF6B35', '#52B788',
  '#E63B7A', '#FFB547', '#6DC0D5', '#9067C6',
];

const cache = {};

export function getCardColor(cardName) {
  if (!cardName || cardName === 'Unknown Card') return '#555580';
  if (!cache[cardName]) {
    let hash = 0;
    for (let i = 0; i < cardName.length; i++) {
      hash = (hash * 31 + cardName.charCodeAt(i)) >>> 0;
    }
    cache[cardName] = CARD_PALETTE[hash % CARD_PALETTE.length];
  }
  return cache[cardName];
}
