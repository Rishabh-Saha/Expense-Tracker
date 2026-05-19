import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { useFeatures } from '../lib/FeatureContext';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';
import {
  getAvailableMonths, getStatsForPeriod, getTransactionsForPeriod,
  getLastSixMonthsTotals, getAllTransactions,
  getMerchantMonthlyTotals, getTopMerchants, getCardStats, getUtilizationData,
} from '../lib/database';
import { getCardColor } from '../constants/cardColors';

const W = Dimensions.get('window').width;

// ─── Period helpers ───────────────────────────────────────────────────────────

function getPeriodDates(periodId) {
  const today = new Date();
  const todayStr = today.toISOString().substring(0, 10);
  if (periodId === 'ytd') {
    return { start: `${today.getFullYear()}-01-01`, end: todayStr };
  }
  if (periodId === '1year') {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - 1);
    return { start: d.toISOString().substring(0, 10), end: todayStr };
  }
  if (periodId === 'all') {
    return { start: '2000-01-01', end: todayStr };
  }
  // individual month e.g. "2024-11"
  const [y, m] = periodId.split('-');
  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  return { start: `${periodId}-01`, end: `${periodId}-${lastDay}` };
}

function isMultiMonth(periodId) {
  return ['ytd', '1year', 'all'].includes(periodId);
}

function formatMonthShort(m) {
  if (!m) return '';
  const [year, month] = m.split('-');
  return new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

// ─── Subscription detection ───────────────────────────────────────────────────

const NON_SUB_CATEGORIES = new Set(['Food & Dining', 'Transport', 'Shopping', 'Travel']);
const KNOWN_SUB_KEYWORDS = [
  'netflix', 'spotify', 'apple', 'amazon', 'youtube', 'google', 'microsoft',
  'hulu', 'disney', 'hbo', 'paramount', 'peacock', 'crunchyroll', 'twitch',
  'expressvpn', 'nordvpn', 'surfshark', 'vpn', 'icloud', 'dropbox',
  'github', 'adobe', 'figma', 'notion', 'slack', 'canva', 'grammarly',
  'headspace', 'calm', 'duolingo', 'audible', 'kindle', 'patreon',
  'playstation', 'xbox', 'nintendo', 'chatgpt', 'openai',
  'gym', 'planet fitness', 'equinox',
];

function detectSubscriptions(allTxns) {
  const map = {};
  for (const t of allTxns) {
    if (t.amount <= 0 || NON_SUB_CATEGORIES.has(t.category)) continue;
    const key = (t.merchant || t.description).toLowerCase().trim().replace(/\s+/g, ' ');
    if (!map[key]) map[key] = [];
    map[key].push(t);
  }
  const results = [];
  for (const [key, txns] of Object.entries(map)) {
    const months = new Set(txns.map(t => t.date.substring(0, 7)));
    if (months.size < 2) continue;
    const amounts = txns.map(t => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (median > 200) continue;
    const allConsistent = amounts.every(a => Math.abs(a - median) / median < 0.10);
    if (!allConsistent) continue;
    const isKnownService = KNOWN_SUB_KEYWORDS.some(kw => key.includes(kw));
    const isSubCategory = txns[0].category === 'Bills & Utilities' || txns[0].category === 'Entertainment';
    if (!isKnownService && !isSubCategory) continue;
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    results.push({
      merchant: sorted[0].merchant || sorted[0].description,
      amount: median, months: months.size,
      category: sorted[0].category, lastDate: sorted[0].date,
    });
  }
  return results.sort((a, b) => b.amount - a.amount);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BreakdownRow({ cat, txns, c, styles }) {
  const [expanded, setExpanded] = useState(false);
  const color = getCategoryColor(cat.category);
  const catTxns = txns.filter(t => t.category === cat.category && t.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return (
    <View>
      <TouchableOpacity style={styles.breakdownRow} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <Text style={{ fontSize: 20, marginRight: SPACING.sm }}>{getCategoryEmoji(cat.category)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.breakdownName}>{cat.category}</Text>
          <Text style={styles.breakdownCount}>{cat.count} transactions</Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginRight: SPACING.sm }}>
          <Text style={[styles.breakdownAmt, { color }]}>${cat.total.toFixed(2)}</Text>
          <Text style={styles.breakdownAvg}>avg ${(cat.total / cat.count).toFixed(0)}/txn</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textTertiary} />
      </TouchableOpacity>
      {expanded && catTxns.map(t => (
        <View key={t.id} style={[styles.txnRow, { borderLeftColor: color }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.txnMerchant} numberOfLines={1}>{t.merchant || t.description}</Text>
            <Text style={styles.txnDate}>{t.date}</Text>
          </View>
          <Text style={[styles.txnAmt, { color }]}>${t.amount.toFixed(2)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { id: 'ytd',    label: 'YTD' },
  { id: '1year',  label: 'Last Year' },
  { id: 'all',    label: 'All Time' },
];

export default function AnalyticsScreen() {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);
  const { flags } = useFeatures();
  const CHART_W = W - SPACING.md * 4;

  const [months, setMonths] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [stats, setStats] = useState(null);
  const [txns, setTxns] = useState([]);
  const [trend, setTrend] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [cardStats, setCardStats] = useState([]);

  const [utilization, setUtilization] = useState([]);

  const [merchantQuery, setMerchantQuery] = useState('');
  const [merchantData, setMerchantData] = useState(null);
  const [topMerchants, setTopMerchants] = useState([]);

  useFocusEffect(
    useCallback(() => {
      const available = getAvailableMonths();
      setMonths(available);
      const initial = available[0] ?? null;
      if (initial) loadPeriod(initial);
      setTrend(getLastSixMonthsTotals().reverse());
      const allTxns = getAllTransactions();
      setSubscriptions(detectSubscriptions(allTxns));
      setTopMerchants(getTopMerchants(12));
      setUtilization(getUtilizationData());
    }, [])
  );

  const searchMerchant = (name) => {
    setMerchantQuery(name);
    if (!name.trim()) { setMerchantData(null); return; }
    const rows = getMerchantMonthlyTotals(name.trim());
    setMerchantData(rows.length ? rows : []);
  };

  const loadPeriod = (periodId) => {
    setSelectedPeriod(periodId);
    const { start, end } = getPeriodDates(periodId);
    setStats(getStatsForPeriod(start, end));
    setTxns(getTransactionsForPeriod(start, end));
    setCardStats(getCardStats(start, end));
  };

  if (!selectedPeriod || !stats) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 56, marginBottom: SPACING.md }}>📊</Text>
        <Text style={styles.emptyText}>Upload a statement to see analytics</Text>
      </View>
    );
  }

  const totalSpent = stats.summary?.spent ?? 0;
  const multiMonth = isMultiMonth(selectedPeriod);

  const pieData = (stats.totals ?? []).map(cat => ({
    value: parseFloat(cat.total.toFixed(2)),
    color: getCategoryColor(cat.category),
    text: `${((cat.total / totalSpent) * 100).toFixed(0)}%`,
    label: cat.category,
  }));

  // Use monthly bars for YTD/Last Year/All, daily bars for single month
  const barData = multiMonth
    ? (stats.monthlyRows ?? []).map(r => ({
        value: parseFloat(r.total.toFixed(2)),
        label: formatMonthShort(r.month),
        frontColor: c.primary,
      }))
    : (stats.dailyRows ?? []).map(r => ({
        value: parseFloat(r.total.toFixed(2)),
        label: r.date.substring(8),
        frontColor: c.primary,
      }));

  const lineData = trend.map(r => ({
    value: parseFloat(r.total.toFixed(2)),
    label: formatMonthShort(r.month),
    dataPointColor: c.primary,
  }));

  const selectedLabel = PERIOD_OPTIONS.find(p => p.id === selectedPeriod)?.label
    ?? formatMonthShort(selectedPeriod);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {/* Preset periods */}
        {PERIOD_OPTIONS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.tab, styles.tabPeriod, selectedPeriod === p.id && { backgroundColor: c.primary, borderColor: c.primary }]}
            onPress={() => loadPeriod(p.id)}
          >
            <Text style={[styles.tabText, selectedPeriod === p.id && styles.tabTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={styles.tabDivider} />

        {/* Individual months */}
        {months.map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, selectedPeriod === m && { backgroundColor: c.primary, borderColor: c.primary }]}
            onPress={() => loadPeriod(m)}
          >
            <Text style={[styles.tabText, selectedPeriod === m && styles.tabTextActive]}>{formatMonthShort(m)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Pie chart ── */}
      {pieData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Category · {selectedLabel}</Text>
          <View style={styles.card}>
            <View style={styles.pieContainer}>
              <PieChart
                data={pieData} donut radius={90} innerRadius={55}
                innerCircleColor={c.surface}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.pieCenter, { color: c.text }]}>${totalSpent.toFixed(0)}</Text>
                    <Text style={[styles.pieCenterLabel, { color: c.textSecondary }]}>total</Text>
                  </View>
                )}
              />
            </View>
            {pieData.map(item => (
              <View key={item.label} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
                <Text style={styles.legendPct}>{item.text}</Text>
                <Text style={styles.legendAmt}>${item.value.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Bar chart ── */}
      {barData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{multiMonth ? 'Monthly Spending' : 'Daily Spending'}</Text>
          <View style={styles.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={barData}
                width={Math.max(CHART_W, barData.length * 36)}
                height={160} barWidth={multiMonth ? 28 : 22} barBorderRadius={4} spacing={10} noOfSections={4}
                yAxisColor={c.border} xAxisColor={c.border}
                yAxisTextStyle={{ color: c.textTertiary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: c.textTertiary, fontSize: 9 }}
                rulesColor={c.border} isAnimated
              />
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Trend line (only for individual months view) ── */}
      {!multiMonth && lineData.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Trend</Text>
          <View style={styles.card}>
            <LineChart
              data={lineData} width={CHART_W} height={160}
              color={c.primary} thickness={2.5}
              dataPointsColor={c.primaryLight} dataPointsRadius={5}
              startFillColor={c.primary} startOpacity={0.3} endOpacity={0}
              areaChart noOfSections={4}
              yAxisColor={c.border} xAxisColor={c.border}
              yAxisTextStyle={{ color: c.textTertiary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: c.textTertiary, fontSize: 9 }}
              rulesColor={c.border} isAnimated
            />
          </View>
        </View>
      )}

      {/* ── Merchant Trends ── */}
      {flags.merchantTrends && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Merchant Trends</Text>
        <View style={[styles.card, { paddingBottom: SPACING.sm }]}>
          {/* Search input */}
          <View style={styles.merchantSearch}>
            <Ionicons name="search" size={16} color={c.textSecondary} style={{ marginRight: SPACING.sm }} />
            <TextInput
              style={styles.merchantInput}
              placeholder="Search merchant e.g. DoorDash, AWS…"
              placeholderTextColor={c.textTertiary}
              value={merchantQuery}
              onChangeText={searchMerchant}
              returnKeyType="search"
            />
            {merchantQuery ? (
              <TouchableOpacity onPress={() => { setMerchantQuery(''); setMerchantData(null); }}>
                <Ionicons name="close-circle" size={16} color={c.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Top merchant chips */}
          {!merchantQuery && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.merchantChips}>
              {topMerchants.map((m, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.merchantChip}
                  onPress={() => searchMerchant(m.name)}
                >
                  <Text style={styles.merchantChipText} numberOfLines={1}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Results */}
          {merchantData !== null && merchantData.length === 0 && (
            <Text style={styles.merchantNoData}>No transactions found for "{merchantQuery}"</Text>
          )}

          {merchantData?.length > 0 && (() => {
            const totalSpend = merchantData.reduce((s, r) => s + r.total, 0);
            const avgMonthly = totalSpend / merchantData.length;
            const lineChartData = merchantData.map(r => ({
              value: parseFloat(r.total.toFixed(2)),
              label: formatMonthShort(r.month),
              dataPointColor: c.primary,
            }));
            return (
              <View>
                {/* Summary stats */}
                <View style={styles.merchantStats}>
                  <View style={styles.merchantStat}>
                    <Text style={styles.merchantStatVal}>${totalSpend.toFixed(0)}</Text>
                    <Text style={styles.merchantStatLabel}>Total spent</Text>
                  </View>
                  <View style={styles.merchantStat}>
                    <Text style={styles.merchantStatVal}>${avgMonthly.toFixed(0)}</Text>
                    <Text style={styles.merchantStatLabel}>Monthly avg</Text>
                  </View>
                  <View style={styles.merchantStat}>
                    <Text style={styles.merchantStatVal}>{merchantData.reduce((s, r) => s + r.count, 0)}</Text>
                    <Text style={styles.merchantStatLabel}>Transactions</Text>
                  </View>
                </View>

                {/* Line chart */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <LineChart
                    data={lineChartData}
                    width={Math.max(CHART_W, lineChartData.length * 60)}
                    height={140}
                    color={c.primary} thickness={2.5}
                    dataPointsColor={c.primaryLight} dataPointsRadius={5}
                    startFillColor={c.primary} startOpacity={0.25} endOpacity={0}
                    areaChart noOfSections={3}
                    yAxisColor={c.border} xAxisColor={c.border}
                    yAxisTextStyle={{ color: c.textTertiary, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: c.textTertiary, fontSize: 9 }}
                    rulesColor={c.border} isAnimated
                  />
                </ScrollView>

                {/* Monthly breakdown */}
                {merchantData.map((r, i) => (
                  <View key={i} style={styles.merchantRow}>
                    <Text style={styles.merchantRowMonth}>{formatMonthShort(r.month)}</Text>
                    <View style={styles.merchantRowBar}>
                      <View style={[styles.merchantBarFill, {
                        width: `${(r.total / Math.max(...merchantData.map(x => x.total))) * 100}%`,
                        backgroundColor: c.primary,
                      }]} />
                    </View>
                    <Text style={styles.merchantRowAmt}>${r.total.toFixed(0)}</Text>
                    <Text style={styles.merchantRowCount}>{r.count}x</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
      </View>}

      {/* ── Subscriptions ── */}
      {flags.subscriptionDetection && subscriptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscriptions Detected</Text>
          <View style={styles.card}>
            <View style={styles.subBanner}>
              <View>
                <Text style={styles.subBannerLabel}>Est. monthly cost</Text>
                <Text style={[styles.subBannerAmt, { color: c.primary }]}>
                  ${subscriptions.reduce((s, r) => s + r.amount, 0).toFixed(2)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.subBannerLabel}>Per year</Text>
                <Text style={[styles.subBannerAmt, { color: c.secondary }]}>
                  ${(subscriptions.reduce((s, r) => s + r.amount, 0) * 12).toFixed(0)}
                </Text>
              </View>
            </View>
            {subscriptions.map((sub, i) => (
              <View key={i} style={styles.subRow}>
                <View style={[styles.subDot, { backgroundColor: getCategoryColor(sub.category) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.subMerchant}>{sub.merchant}</Text>
                  <Text style={styles.subMeta}>{sub.category} · {sub.months} month{sub.months > 1 ? 's' : ''}</Text>
                </View>
                <Text style={[styles.subAmt, { color: getCategoryColor(sub.category) }]}>${sub.amount.toFixed(2)}/mo</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── By Card ── */}
      {cardStats.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Card</Text>
          <View style={styles.card}>
            <View style={styles.cardBanner}>
              <View>
                <Text style={styles.cardBannerLabel}>Cards tracked</Text>
                <Text style={[styles.cardBannerVal, { color: c.primary }]}>{cardStats.length}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardBannerLabel}>Total across cards</Text>
                <Text style={[styles.cardBannerVal, { color: c.secondary }]}>
                  ${cardStats.reduce((s, r) => s + r.total, 0).toFixed(0)}
                </Text>
              </View>
            </View>
            {(() => {
              const maxTotal = Math.max(...cardStats.map(r => r.total), 1);
              return cardStats.map((cs, i) => {
                const color = getCardColor(cs.card);
                const pct = (cs.total / cardStats.reduce((s, r) => s + r.total, 0)) * 100;
                return (
                  <View key={i} style={[styles.cardRow, i === 0 && styles.cardRowFirst]}>
                    <View style={[styles.cardDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardRowHeader}>
                        <Text style={styles.cardRowName} numberOfLines={1}>{cs.card}</Text>
                        <Text style={[styles.cardRowAmt, { color }]}>${cs.total.toFixed(0)}</Text>
                      </View>
                      <View style={styles.cardBarTrack}>
                        <View style={[styles.cardBarFill, { width: `${(cs.total / maxTotal) * 100}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={styles.cardRowMeta}>{cs.count} transactions · {pct.toFixed(1)}% of total</Text>
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        </View>
      )}

      {/* ── Credit Utilization ── */}
      {utilization.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Utilization</Text>
          <View style={styles.card}>
            {utilization.map((u, i) => {
              const pct = Math.min((u.statement_balance / u.credit_limit) * 100, 100);
              const color = pct < 30 ? c.success : pct < 70 ? c.warning : c.error;
              return (
                <View key={i} style={[styles.utilRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={styles.utilHeader}>
                    <Text style={styles.utilCard} numberOfLines={1}>{u.card_name ?? 'Unknown Card'}</Text>
                    <Text style={[styles.utilPct, { color }]}>{pct.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.utilTrack}>
                    <View style={[styles.utilFill, { width: `${pct}%`, backgroundColor: color }]} />
                    {pct < 95 && (
                      <View style={[styles.utilThreshold, { left: '30%', backgroundColor: c.border }]} />
                    )}
                  </View>
                  <View style={styles.utilMeta}>
                    <Text style={styles.utilMetaText}>${u.statement_balance?.toFixed(0)} of ${u.credit_limit?.toLocaleString()} · {u.month}</Text>
                    <Text style={[styles.utilMetaText, { color }]}>
                      {pct < 30 ? 'Healthy' : pct < 70 ? 'Moderate' : 'High'}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.utilLegend}>
              <View style={styles.utilLegendItem}><View style={[styles.utilLegendDot, { backgroundColor: c.success }]} /><Text style={styles.utilLegendText}>{'<30% Healthy'}</Text></View>
              <View style={styles.utilLegendItem}><View style={[styles.utilLegendDot, { backgroundColor: c.warning }]} /><Text style={styles.utilLegendText}>30–70% Moderate</Text></View>
              <View style={styles.utilLegendItem}><View style={[styles.utilLegendDot, { backgroundColor: c.error }]} /><Text style={styles.utilLegendText}>{'>70% High'}</Text></View>
            </View>
          </View>
        </View>
      )}

      {/* ── Breakdown ── */}
      {stats.totals?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Breakdown · {selectedLabel}</Text>
          <View style={styles.card}>
            {stats.totals.map(cat => (
              <BreakdownRow key={cat.category} cat={cat} txns={txns} c={c} styles={styles} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { paddingBottom: SPACING.xl },
  tabs: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  tab: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.xl, backgroundColor: c.surface, marginRight: SPACING.sm, borderWidth: 1, borderColor: c.border },
  tabPeriod: { borderColor: c.primary + '88' },
  tabDivider: { width: 1, backgroundColor: c.border, marginRight: SPACING.sm, marginVertical: 4 },
  tabText: { color: c.textSecondary, fontSize: FONTS.sm },
  tabTextActive: { color: c.text, fontWeight: '700' },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionTitle: { color: c.textSecondary, fontSize: FONTS.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },
  card: { backgroundColor: c.surface, borderRadius: RADIUS.md, overflow: 'hidden', padding: SPACING.md },
  pieContainer: { alignItems: 'center', paddingVertical: SPACING.md },
  pieCenter: { fontSize: FONTS.xl, fontWeight: '800' },
  pieCenterLabel: { fontSize: FONTS.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, borderTopWidth: 1, borderTopColor: c.border },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm },
  legendLabel: { flex: 1, color: c.text, fontSize: FONTS.sm },
  legendPct: { color: c.textSecondary, fontSize: FONTS.sm, marginRight: SPACING.sm, width: 36 },
  legendAmt: { color: c.text, fontSize: FONTS.sm, fontWeight: '600', width: 56, textAlign: 'right' },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, borderTopWidth: 1, borderTopColor: c.border },
  breakdownName: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  breakdownCount: { color: c.textSecondary, fontSize: FONTS.xs },
  breakdownAmt: { fontSize: FONTS.md, fontWeight: '700' },
  breakdownAvg: { color: c.textSecondary, fontSize: FONTS.xs },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingLeft: SPACING.lg, paddingRight: SPACING.xs, borderLeftWidth: 2, marginLeft: SPACING.sm, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surfaceLight },
  txnMerchant: { color: c.text, fontSize: FONTS.sm },
  txnDate: { color: c.textTertiary, fontSize: FONTS.xs, marginTop: 2 },
  txnAmt: { fontSize: FONTS.sm, fontWeight: '600' },
  subBanner: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, marginBottom: SPACING.xs, backgroundColor: c.surfaceLight, borderRadius: RADIUS.sm },
  subBannerLabel: { color: c.textSecondary, fontSize: FONTS.xs, marginBottom: 2 },
  subBannerAmt: { fontSize: FONTS.xl, fontWeight: '800' },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, borderTopWidth: 1, borderTopColor: c.border },
  subDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm },
  subMerchant: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  subMeta: { color: c.textSecondary, fontSize: FONTS.xs, marginTop: 2 },
  subAmt: { fontSize: FONTS.sm, fontWeight: '700' },
  merchantSearch: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceLight, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: c.border, marginBottom: SPACING.sm,
  },
  merchantInput: { flex: 1, color: c.text, fontSize: FONTS.md },
  merchantChips: { marginBottom: SPACING.sm },
  merchantChip: {
    backgroundColor: c.surfaceLight, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 1,
    marginRight: SPACING.sm, borderWidth: 1, borderColor: c.border,
    maxWidth: 150,
  },
  merchantChipText: { color: c.textSecondary, fontSize: FONTS.xs },
  merchantNoData: { color: c.textTertiary, fontSize: FONTS.sm, textAlign: 'center', paddingVertical: SPACING.md },
  merchantStats: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: c.surfaceLight, borderRadius: RADIUS.sm,
  },
  merchantStat: { alignItems: 'center' },
  merchantStatVal: { color: c.primary, fontSize: FONTS.xl, fontWeight: '800' },
  merchantStatLabel: { color: c.textSecondary, fontSize: FONTS.xs, marginTop: 2 },
  merchantRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.xs + 2,
    borderTopWidth: 1, borderTopColor: c.border,
    gap: SPACING.sm,
  },
  merchantRowMonth: { color: c.textSecondary, fontSize: FONTS.xs, width: 44 },
  merchantRowBar: {
    flex: 1, height: 6, backgroundColor: c.border,
    borderRadius: 3, overflow: 'hidden',
  },
  merchantBarFill: { height: 6, borderRadius: 3 },
  merchantRowAmt: { color: c.text, fontSize: FONTS.sm, fontWeight: '600', width: 48, textAlign: 'right' },
  merchantRowCount: { color: c.textTertiary, fontSize: FONTS.xs, width: 24, textAlign: 'right' },
  cardBanner: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, marginBottom: SPACING.xs, backgroundColor: c.surfaceLight, borderRadius: RADIUS.sm },
  cardBannerLabel: { color: c.textSecondary, fontSize: FONTS.xs, marginBottom: 2 },
  cardBannerVal: { fontSize: FONTS.xl, fontWeight: '800' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: SPACING.sm + 2, borderTopWidth: 1, borderTopColor: c.border, gap: SPACING.sm },
  cardRowFirst: { borderTopWidth: 0 },
  cardDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  cardRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardRowName: { color: c.text, fontSize: FONTS.sm, fontWeight: '600', flex: 1, marginRight: SPACING.sm },
  cardRowAmt: { fontSize: FONTS.md, fontWeight: '700' },
  cardBarTrack: { height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  cardBarFill: { height: 6, borderRadius: 3 },
  cardRowMeta: { color: c.textSecondary, fontSize: FONTS.xs },
  utilRow: { paddingVertical: SPACING.md },
  utilHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  utilCard: { color: c.text, fontSize: FONTS.sm, fontWeight: '600', flex: 1, marginRight: SPACING.sm },
  utilPct: { fontSize: FONTS.md, fontWeight: '800' },
  utilTrack: { height: 8, backgroundColor: c.border, borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.xs, position: 'relative' },
  utilFill: { height: 8, borderRadius: 4 },
  utilThreshold: { position: 'absolute', top: 0, width: 1.5, height: 8 },
  utilMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  utilMetaText: { color: c.textSecondary, fontSize: FONTS.xs },
  utilLegend: { flexDirection: 'row', justifyContent: 'space-around', marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: c.border },
  utilLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  utilLegendDot: { width: 8, height: 8, borderRadius: 4 },
  utilLegendText: { color: c.textTertiary, fontSize: FONTS.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },
  emptyText: { color: c.textSecondary, fontSize: FONTS.md },
});
