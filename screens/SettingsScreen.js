import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, ActivityIndicator, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { THEMES, THEME_ORDER } from '../constants/themes';
import { getAllStatements, deleteStatement } from '../lib/database';
import { useFeatures, FEATURES } from '../lib/FeatureContext';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const KEY_PREVIEW = API_KEY
  ? `${API_KEY.substring(0, 16)}${'•'.repeat(10)}${API_KEY.slice(-4)}`
  : 'Not set';

async function checkApiKey() {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
  });
  const orgId = response.headers.get('anthropic-organization-id');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Error ${response.status}`);
  }
  return { orgId };
}

export default function SettingsScreen() {
  const { colors: c, themeId, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);
  const { flags, toggle } = useFeatures();
  const [configOpen, setConfigOpen] = useState(false);

  const [statements, setStatements] = useState([]);
  const [keyStatus, setKeyStatus] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [keyError, setKeyError] = useState(null);

  useFocusEffect(useCallback(() => { setStatements(getAllStatements()); }, []));

  const verifyKey = async () => {
    setKeyStatus('checking'); setKeyError(null);
    try {
      const { orgId: id } = await checkApiKey();
      setOrgId(id); setKeyStatus('valid');
    } catch (e) {
      setKeyError(e.message); setKeyStatus('invalid');
    }
  };

  const handleDelete = (id, filename) => {
    Alert.alert('Delete Statement', `Remove "${filename}" and all its transactions?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteStatement(id); setStatements(getAllStatements()); } },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Theme picker ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Theme</Text>
        <View style={styles.card}>
          <View style={styles.swatchRow}>
            {THEME_ORDER.map(id => {
              const t = THEMES[id];
              const active = themeId === id;
              return (
                <TouchableOpacity key={id} style={styles.swatchItem} onPress={() => setTheme(id)}>
                  <View style={[styles.swatch, { backgroundColor: t.primary }, active && styles.swatchActive]}>
                    {active && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </View>
                  <Text style={[styles.swatchLabel, active && { color: c.primary }]}>{t.emoji}</Text>
                  <Text style={[styles.swatchName, active && { color: c.text, fontWeight: '700' }]}>{t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── Config ── */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setConfigOpen(o => !o)}>
          <Text style={styles.sectionTitle}>Config</Text>
          <Ionicons name={configOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSecondary} />
        </TouchableOpacity>
        {configOpen && (
          <View style={styles.card}>
            {Object.entries(FEATURES).map(([key, meta], i) => (
              <View key={key} style={[styles.row, i > 0 && styles.borderTop]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{meta.label}</Text>
                  <Text style={styles.metaText}>{meta.desc}</Text>
                </View>
                <Switch
                  value={flags[key]}
                  onValueChange={() => toggle(key)}
                  trackColor={{ false: c.border, true: c.primary + 'AA' }}
                  thumbColor={flags[key] ? c.primary : c.surfaceLight}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── API account ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Anthropic API Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="key-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>API Key</Text>
              <Text style={styles.keyPreview}>{KEY_PREVIEW}</Text>
            </View>
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Key Status</Text>
              {keyStatus === null && <Text style={styles.metaText}>Tap verify to check</Text>}
              {keyStatus === 'checking' && <Text style={styles.metaText}>Verifying…</Text>}
              {keyStatus === 'valid' && <Text style={[styles.metaText, { color: c.success }]}>✓ Valid{orgId ? `  ·  Org: ${orgId.substring(0, 8)}…` : ''}</Text>}
              {keyStatus === 'invalid' && <Text style={[styles.metaText, { color: c.error }]}>{keyError}</Text>}
            </View>
            <TouchableOpacity style={styles.smallBtn} onPress={verifyKey} disabled={keyStatus === 'checking'}>
              {keyStatus === 'checking'
                ? <ActivityIndicator size="small" color={c.text} />
                : <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>Verify</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <Ionicons name="wallet-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Credit Balance</Text>
              <Text style={styles.metaText}>Console only — no API endpoint</Text>
            </View>
            <TouchableOpacity style={styles.smallBtn} onPress={() => Linking.openURL('https://console.anthropic.com/settings/billing')}>
              <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>View ↗</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.row, styles.borderTop]}>
            <Ionicons name="stats-chart-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Token Usage</Text>
              <Text style={styles.metaText}>Full breakdown in console</Text>
            </View>
            <TouchableOpacity style={styles.smallBtn} onPress={() => Linking.openURL('https://console.anthropic.com/settings/usage')}>
              <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>View ↗</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Statements ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Uploaded Statements</Text>
        {statements.length === 0 ? (
          <Text style={styles.noData}>No statements uploaded yet</Text>
        ) : (
          <View style={styles.card}>
            {statements.map((s, i) => (
              <View key={s.id} style={[styles.row, i > 0 && styles.borderTop]}>
                <Ionicons name="document-text-outline" size={16} color={c.textSecondary} style={styles.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.filename} numberOfLines={1}>{s.filename}</Text>
                  <Text style={styles.metaText}>{s.month}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(s.id, s.filename)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={17} color={c.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── About ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          {[['App', 'Expense Tracker'], ['Storage', 'On-device (SQLite)'], ['AI Model', 'Claude Opus 4'], ['Data', 'Never leaves your device']].map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.borderTop]}>
              <Text style={styles.aboutLabel}>{label}</Text>
              <Text style={styles.aboutValue}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  section: { marginBottom: SPACING.lg },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionTitle: { color: c.textSecondary, fontSize: FONTS.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },
  card: { backgroundColor: c.surface, borderRadius: RADIUS.md, overflow: 'hidden', paddingHorizontal: SPACING.md },
  swatchRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACING.md },
  swatchItem: { alignItems: 'center', gap: 4 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#ffffff55' },
  swatchLabel: { fontSize: 16, color: c.textSecondary },
  swatchName: { color: c.textSecondary, fontSize: FONTS.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, minHeight: 52 },
  borderTop: { borderTopWidth: 1, borderTopColor: c.border },
  rowIcon: { marginRight: SPACING.sm },
  rowLabel: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  keyPreview: { color: c.textSecondary, fontSize: FONTS.xs, fontFamily: 'monospace', marginTop: 2 },
  metaText: { color: c.textSecondary, fontSize: FONTS.xs, marginTop: 2 },
  smallBtn: { backgroundColor: c.surfaceLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs + 1, borderWidth: 1, borderColor: c.border, minWidth: 60, alignItems: 'center' },
  smallBtnText: { fontSize: FONTS.xs, fontWeight: '600' },
  filename: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  deleteBtn: { padding: SPACING.xs },
  aboutLabel: { flex: 1, color: c.textSecondary, fontSize: FONTS.sm },
  aboutValue: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  noData: { color: c.textTertiary, fontSize: FONTS.sm },
});
