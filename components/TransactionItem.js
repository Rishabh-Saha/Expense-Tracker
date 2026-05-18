import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';

export default function TransactionItem({ transaction }) {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  const { date, merchant, description, amount, category } = transaction;
  const color = getCategoryColor(category);
  const emoji = getCategoryEmoji(category);
  const isDebit = amount > 0;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>{merchant || description}</Text>
        <Text style={styles.meta}>{category} · {date}</Text>
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
  meta: { color: c.textSecondary, fontSize: FONTS.xs, marginTop: 2 },
  amount: { fontSize: FONTS.md, fontWeight: '700' },
});
