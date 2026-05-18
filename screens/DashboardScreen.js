import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';
import { getAvailableMonths, getMonthStats, getTransactionsByMonth } from '../lib/database';
import StatCard from '../components/StatCard';
import TransactionItem from '../components/TransactionItem';

function formatMonth(m) {
  if (!m) return '';
  const [year, month] = m.split('-');
  return new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function DashboardScreen({ navigation }) {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentTxns, setRecentTxns] = useState([]);

  useFocusEffect(
    useCallback(() => {
      const available = getAvailableMonths();
      setMonths(available);
      const month = available[0] ?? null;
      setSelectedMonth(month);
      if (month) {
        setStats(getMonthStats(month));
        setRecentTxns(getTransactionsByMonth(month).slice(0, 8));
      }
    }, [])
  );

  const changeMonth = (dir) => {
    const idx = months.indexOf(selectedMonth);
    const next = months[idx + dir];
    if (next) {
      setSelectedMonth(next);
      setStats(getMonthStats(next));
      setRecentTxns(getTransactionsByMonth(next).slice(0, 8));
    }
  };

  const totalSpent = stats?.summary?.spent ?? 0;
  const txnCount = stats?.summary?.txn_count ?? 0;
  const dailyAvg = stats?.dailyRows?.length ? totalSpent / stats.dailyRows.length : 0;
  const topCategory = stats?.totals?.[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => changeMonth(1)} disabled={months.indexOf(selectedMonth) >= months.length - 1}>
          <Ionicons name="chevron-back" size={22} color={c.primaryLight} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{formatMonth(selectedMonth)}</Text>
        <TouchableOpacity onPress={() => changeMonth(-1)} disabled={months.indexOf(selectedMonth) <= 0}>
          <Ionicons name="chevron-forward" size={22} color={c.primaryLight} />
        </TouchableOpacity>
      </View>

      {!selectedMonth ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>No statements yet</Text>
          <Text style={styles.emptyText}>Go to Upload to add your first credit card statement</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Upload')}>
            <Text style={styles.emptyBtnText}>Upload Statement</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.statRow}>
            <StatCard label="Total Spent" value={`$${totalSpent.toFixed(0)}`} sub={`${txnCount} transactions`} accent={c.primary} />
            <StatCard label="Daily Avg" value={`$${dailyAvg.toFixed(0)}`} sub="per active day" accent={c.secondary} />
          </View>

          {topCategory && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Category</Text>
              <View style={styles.topCatCard}>
                <View style={[styles.catIcon, { backgroundColor: getCategoryColor(topCategory.category) + '33' }]}>
                  <Text style={{ fontSize: 24 }}>{getCategoryEmoji(topCategory.category)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catName}>{topCategory.category}</Text>
                  <Text style={styles.catCount}>{topCategory.count} transactions</Text>
                </View>
                <Text style={[styles.catAmount, { color: getCategoryColor(topCategory.category) }]}>
                  ${topCategory.total.toFixed(0)}
                </Text>
              </View>
            </View>
          )}

          {stats?.totals?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <View style={styles.card}>
                {stats.totals.map((cat) => {
                  const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                  const color = getCategoryColor(cat.category);
                  return (
                    <View key={cat.category} style={styles.catRow}>
                      <Text style={styles.catEmoji}>{getCategoryEmoji(cat.category)}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={styles.catLabelRow}>
                          <Text style={styles.catLabel}>{cat.category}</Text>
                          <Text style={styles.catPct}>${cat.total.toFixed(0)}</Text>
                        </View>
                        <View style={styles.barBg}>
                          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
                <Text style={[styles.seeAll, { color: c.primary }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {recentTxns.length === 0
                ? <Text style={styles.noTxn}>No transactions this month</Text>
                : recentTxns.map(t => <TransactionItem key={t.id} transaction={t} />)
              }
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  monthTitle: { color: c.text, fontSize: FONTS.lg, fontWeight: '700' },
  statRow: { flexDirection: 'row', marginBottom: SPACING.md, marginHorizontal: -SPACING.xs },
  section: { marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionTitle: { color: c.textSecondary, fontSize: FONTS.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },
  card: { backgroundColor: c.surface, borderRadius: RADIUS.md, overflow: 'hidden' },
  topCatCard: { backgroundColor: c.surface, borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: 'row', alignItems: 'center' },
  catIcon: { width: 52, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  catName: { color: c.text, fontSize: FONTS.md, fontWeight: '600' },
  catCount: { color: c.textSecondary, fontSize: FONTS.xs },
  catAmount: { fontSize: FONTS.xl, fontWeight: '800' },
  catRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.sm, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: c.border },
  catEmoji: { fontSize: 18, marginRight: SPACING.sm, width: 28 },
  catLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catLabel: { color: c.text, fontSize: FONTS.sm },
  catPct: { color: c.textSecondary, fontSize: FONTS.sm },
  barBg: { height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  empty: { alignItems: 'center', paddingTop: SPACING.xl * 2 },
  emptyIcon: { fontSize: 56, marginBottom: SPACING.md },
  emptyTitle: { color: c.text, fontSize: FONTS.xl, fontWeight: '700', marginBottom: SPACING.sm },
  emptyText: { color: c.textSecondary, fontSize: FONTS.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
  emptyBtn: { marginTop: SPACING.lg, backgroundColor: c.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 4, borderRadius: RADIUS.xl },
  emptyBtnText: { color: c.text, fontWeight: '700', fontSize: FONTS.md },
  noTxn: { color: c.textTertiary, padding: SPACING.md, textAlign: 'center' },
  seeAll: { fontSize: FONTS.sm },
});
