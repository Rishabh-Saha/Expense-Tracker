import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SectionList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { getAllTransactions, getAvailableMonths, getAllCards } from '../lib/database';
import { getCardColor } from '../constants/cardColors';
import TransactionItem from '../components/TransactionItem';

function groupByDate(txns) {
  const map = {};
  for (const t of txns) {
    if (!map[t.date]) map[t.date] = [];
    map[t.date].push(t);
  }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, data]) => ({ title: date, data }));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TransactionsScreen() {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  const [allTxns, setAllTxns] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [months, setMonths] = useState([]);
  const [cards, setCards] = useState([]);

  useFocusEffect(
    useCallback(() => {
      const available = getAvailableMonths();
      setMonths(available);
      setAllTxns(getAllTransactions());
      setCards(getAllCards());
    }, [])
  );

  const filtered = useMemo(() => {
    let txns = allTxns;
    if (selectedMonth) txns = txns.filter(t => t.date.startsWith(selectedMonth));
    if (selectedCard) txns = txns.filter(t => (t.card_name || 'Unknown Card') === selectedCard);
    if (search.trim()) {
      const q = search.toLowerCase();
      txns = txns.filter(t =>
        t.merchant?.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return txns;
  }, [allTxns, selectedMonth, selectedCard, search]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);
  const totalFiltered = useMemo(
    () => filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [filtered]
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={c.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search merchants, categories…"
          placeholderTextColor={c.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={c.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {months.length > 1 && (
        <View style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.chip, !selectedMonth && styles.chipActive]}
            onPress={() => setSelectedMonth(null)}
          >
            <Text style={[styles.chipText, !selectedMonth && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {months.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, selectedMonth === m && styles.chipActive]}
              onPress={() => setSelectedMonth(m === selectedMonth ? null : m)}
            >
              <Text style={[styles.chipText, selectedMonth === m && styles.chipTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Card filter */}
      {cards.length > 1 && (
        <View style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.chip, !selectedCard && styles.chipActive]}
            onPress={() => setSelectedCard(null)}
          >
            <Text style={[styles.chipText, !selectedCard && styles.chipTextActive]}>All cards</Text>
          </TouchableOpacity>
          {cards.map(card => {
            const color = getCardColor(card.name);
            const active = selectedCard === card.name;
            return (
              <TouchableOpacity
                key={card.name}
                style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
                onPress={() => setSelectedCard(active ? null : card.name)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{card.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {filtered.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>{filtered.length} transactions</Text>
          <Text style={[styles.summaryAmount, { color: c.primary }]}>${totalFiltered.toFixed(2)}</Text>
        </View>
      )}

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No transactions found</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TransactionItem transaction={item} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionDate}>{formatDate(section.title)}</Text>
              <Text style={styles.sectionTotal}>
                ${section.data.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0).toFixed(2)}
              </Text>
            </View>
          )}
          style={{ backgroundColor: c.surface }}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
        />
      )}
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface,
    margin: SPACING.md, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, borderWidth: 1, borderColor: c.border,
  },
  searchInput: { flex: 1, color: c.text, fontSize: FONTS.md },
  filterScroll: { flexDirection: 'row', paddingHorizontal: SPACING.md, marginBottom: SPACING.sm, flexWrap: 'wrap', gap: SPACING.sm },
  chip: { backgroundColor: c.surface, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderWidth: 1, borderColor: c.border },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.textSecondary, fontSize: FONTS.sm },
  chipTextActive: { color: c.text, fontWeight: '600' },
  summaryBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  summaryText: { color: c.textSecondary, fontSize: FONTS.sm },
  summaryAmount: { fontSize: FONTS.sm, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.background, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2 },
  sectionDate: { color: c.textSecondary, fontSize: FONTS.xs, fontWeight: '600' },
  sectionTotal: { color: c.textTertiary, fontSize: FONTS.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: c.textSecondary, fontSize: FONTS.md },
});
