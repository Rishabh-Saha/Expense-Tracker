import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';

export default function StatCard({ label, value, sub, accent }) {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  return (
    <View style={[styles.card, accent && { borderLeftColor: accent, borderLeftWidth: 3 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent && { color: accent }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginHorizontal: SPACING.xs,
  },
  label: {
    color: c.textSecondary,
    fontSize: FONTS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  value: { color: c.text, fontSize: FONTS.xl, fontWeight: '700' },
  sub: { color: c.textTertiary, fontSize: FONTS.xs, marginTop: 2 },
});
