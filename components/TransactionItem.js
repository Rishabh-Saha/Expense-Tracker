import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';
import { getCardColor } from '../constants/cardColors';

export default function TransactionItem({ transaction }) {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  const { date, merchant, description, amount, category, card_name } = transaction;
  const color = getCategoryColor(category);
  const emoji = getCategoryEmoji(category);
  const isDebit = amount > 0;
  const cardColor = getCardColor(card_name);
  const showCard = card_name && card_name !== 'Unknown Card';

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>{merchant || description}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{category} · {date}</Text>
          {showCard && (
            <View style={[styles.cardBadge, { backgroundColor: cardColor + '22', borderColor: cardColor + '55' }]}>
              <Text style={[styles.cardLabel, { color: cardColor }]} numberOfLines={1}>{card_name}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.amount, { color: isDebit ? c.error : c.success }]}>
        {isDebit ? '-' : '+'}${Math.abs(amount).toFixed(2)}
      </Text>
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  icon: {
    width: 42, height: 42, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
  },
  emoji: { fontSize: 20 },
  info: { flex: 1 },
  merchant: { color: c.text, fontSize: FONTS.md, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  meta: { color: c.textSecondary, fontSize: FONTS.xs },
  cardBadge: {
    borderWidth: 1, borderRadius: RADIUS.sm,
    paddingHorizontal: 5, paddingVertical: 1,
    maxWidth: 130,
  },
  cardLabel: { fontSize: 10, fontWeight: '600' },
  amount: { fontSize: FONTS.md, fontWeight: '700' },
});
