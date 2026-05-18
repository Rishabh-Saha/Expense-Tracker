import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, ActivityIndicator, Switch, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { THEMES, THEME_ORDER } from '../constants/themes';
import { getAllStatements, deleteStatement } from '../lib/database';
import { useFeatures, FEATURES } from '../lib/FeatureContext';
import { getApiKey, setApiKey, clearApiKeyOverride, getApiKeySource, maskKey } from '../lib/apiKey';
import { MODELS } from '../constants/models';
import { getSelectedModelId, setSelectedModelId, getOpenAIKey, setOpenAIKey } from '../lib/modelConfig';

async function checkApiKey(key) {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
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
  const [currentKey, setCurrentKey] = useState('');
  const [keySource, setKeySource] = useState('env');
  const [newKey, setNewKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showNewKey, setShowNewKey] = useState(false);

  const [selectedModelId, _setSelectedModelId] = useState('claude-sonnet');
  const [openAIKey, setOpenAIKeyState] = useState('');
  const [showOpenAIKeyInput, setShowOpenAIKeyInput] = useState(false);
  const [newOpenAIKey, setNewOpenAIKey] = useState('');
  const [showNewOpenAIKey, setShowNewOpenAIKey] = useState(false);
  const [openAIKeyStatus, setOpenAIKeyStatus] = useState(null);
  const [openAIKeyError, setOpenAIKeyError] = useState(null);

  useFocusEffect(useCallback(() => {
    setStatements(getAllStatements());
    getApiKey().then(k => setCurrentKey(k));
    getApiKeySource().then(s => setKeySource(s));
    getSelectedModelId().then(id => _setSelectedModelId(id));
    getOpenAIKey().then(k => setOpenAIKeyState(k));
  }, []));

  const selectModel = async (id) => {
    await setSelectedModelId(id);
    _setSelectedModelId(id);
  };

  const saveOpenAIKey = async () => {
    if (!newOpenAIKey.trim()) return;
    setOpenAIKeyStatus('checking'); setOpenAIKeyError(null);
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${newOpenAIKey.trim()}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `Error ${res.status}`);
      }
      await setOpenAIKey(newOpenAIKey.trim());
      setOpenAIKeyState(newOpenAIKey.trim());
      setNewOpenAIKey('');
      setShowOpenAIKeyInput(false);
      setOpenAIKeyStatus('valid');
      Alert.alert('Saved', 'OpenAI API key updated successfully.');
    } catch (e) {
      setOpenAIKeyError(e.message);
      setOpenAIKeyStatus('invalid');
    }
  };

  const verifyKey = async () => {
    setKeyStatus('checking'); setKeyError(null);
    try {
      const key = await getApiKey();
      const { orgId: id } = await checkApiKey(key);
      setOrgId(id); setKeyStatus('valid');
    } catch (e) {
      setKeyError(e.message); setKeyStatus('invalid');
    }
  };

  const saveNewKey = async () => {
    if (!newKey.trim()) return;
    setKeyStatus('checking'); setKeyError(null);
    try {
      await checkApiKey(newKey.trim());
      await setApiKey(newKey.trim());
      setCurrentKey(newKey.trim());
      setKeySource('manual');
      setNewKey('');
      setShowKeyInput(false);
      setKeyStatus('valid');
      Alert.alert('Saved', 'API key updated successfully.');
    } catch (e) {
      setKeyError(e.message);
      setKeyStatus('invalid');
    }
  };

  const revertToEnvKey = async () => {
    await clearApiKeyOverride();
    const k = await getApiKey();
    setCurrentKey(k);
    setKeySource('env');
    setShowKeyInput(false);
    setKeyStatus(null);
    Alert.alert('Reverted', 'Using the key baked into the app.');
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

      {/* ── AI Model ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Model</Text>
        <View style={styles.modelGrid}>
          {MODELS.map(m => {
            const active = selectedModelId === m.id;
            const isOpenAI = m.provider === 'openai';
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelCard, active && { borderColor: c.primary, backgroundColor: c.primary + '18' }]}
                onPress={() => selectModel(m.id)}
                activeOpacity={0.75}
              >
                <View style={styles.modelCardTop}>
                  <View style={[styles.modelProviderBadge, { backgroundColor: isOpenAI ? '#10a37f22' : c.primary + '22' }]}>
                    <Text style={[styles.modelProviderText, { color: isOpenAI ? '#10a37f' : c.primary }]}>
                      {isOpenAI ? 'GPT' : 'C'}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={16} color={c.primary} />}
                </View>
                <Text style={[styles.modelName, active && { color: c.primary }]}>{m.label}</Text>
                <Text style={styles.modelSublabel}>{m.sublabel}</Text>
                <Text style={[styles.modelCost, { color: c.success }]}>{m.costHint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Note about PDF parsing for OpenAI users */}
        {MODELS.find(m => m.id === selectedModelId)?.provider === 'openai' && (
          <Text style={styles.modelNote}>
            PDF extraction always uses Claude (Haiku) — OpenAI doesn't accept PDF files directly. Anthropic key still required for uploads.
          </Text>
        )}

        {/* OpenAI API key — shown when an OpenAI model is active */}
        {MODELS.find(m => m.id === selectedModelId)?.provider === 'openai' && (
          <View style={[styles.card, { marginTop: SPACING.sm }]}>
            <View style={styles.row}>
              <Ionicons name="key-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>OpenAI API Key</Text>
                <Text style={styles.keyPreview}>{openAIKey ? maskKey(openAIKey) : 'Not set'}</Text>
              </View>
              <TouchableOpacity style={styles.smallBtn} onPress={() => { setShowOpenAIKeyInput(v => !v); setOpenAIKeyStatus(null); }}>
                <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>{showOpenAIKeyInput ? 'Cancel' : 'Update'}</Text>
              </TouchableOpacity>
            </View>
            {showOpenAIKeyInput && (
              <View style={[styles.keyInputBlock, { borderTopColor: c.border }]}>
                <View style={styles.keyInputRow}>
                  <TextInput
                    style={styles.keyInput}
                    value={newOpenAIKey}
                    onChangeText={setNewOpenAIKey}
                    placeholder="sk-..."
                    placeholderTextColor={c.textTertiary}
                    secureTextEntry={!showNewOpenAIKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => setShowNewOpenAIKey(v => !v)} style={styles.eyeBtn}>
                    <Ionicons name={showNewOpenAIKey ? 'eye-off' : 'eye'} size={16} color={c.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.keyBtns}>
                  <TouchableOpacity
                    style={[styles.keyActionBtn, { backgroundColor: c.primary, opacity: !newOpenAIKey.trim() ? 0.5 : 1 }]}
                    onPress={saveOpenAIKey}
                    disabled={!newOpenAIKey.trim() || openAIKeyStatus === 'checking'}
                  >
                    {openAIKeyStatus === 'checking'
                      ? <ActivityIndicator size="small" color={c.text} />
                      : <Text style={[styles.smallBtnText, { color: c.text }]}>Save & Verify</Text>
                    }
                  </TouchableOpacity>
                </View>
                {openAIKeyStatus === 'valid' && <Text style={[styles.metaText, { color: c.success, marginTop: 4 }]}>✓ Valid</Text>}
                {openAIKeyStatus === 'invalid' && <Text style={[styles.metaText, { color: c.error, marginTop: 4 }]}>{openAIKeyError}</Text>}
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── API account ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Anthropic API Account</Text>
        <View style={styles.card}>

          {/* Current key + source */}
          <View style={styles.row}>
            <Ionicons name="key-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>API Key</Text>
              <Text style={styles.keyPreview}>{maskKey(currentKey)}</Text>
              <Text style={[styles.metaText, { color: keySource === 'manual' ? c.primary : c.textTertiary }]}>
                {keySource === 'manual' ? 'Manually set' : 'From app build'}
              </Text>
            </View>
            <TouchableOpacity style={styles.smallBtn} onPress={() => { setShowKeyInput(v => !v); setKeyStatus(null); }}>
              <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>{showKeyInput ? 'Cancel' : 'Update'}</Text>
            </TouchableOpacity>
          </View>

          {/* Inline key update form */}
          {showKeyInput && (
            <View style={[styles.keyInputBlock, { borderTopColor: c.border }]}>
              <View style={styles.keyInputRow}>
                <TextInput
                  style={styles.keyInput}
                  value={newKey}
                  onChangeText={setNewKey}
                  placeholder="sk-ant-..."
                  placeholderTextColor={c.textTertiary}
                  secureTextEntry={!showNewKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowNewKey(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showNewKey ? 'eye-off' : 'eye'} size={16} color={c.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.keyBtns}>
                <TouchableOpacity
                  style={[styles.keyActionBtn, { backgroundColor: c.primary, opacity: !newKey.trim() ? 0.5 : 1 }]}
                  onPress={saveNewKey}
                  disabled={!newKey.trim() || keyStatus === 'checking'}
                >
                  {keyStatus === 'checking'
                    ? <ActivityIndicator size="small" color={c.text} />
                    : <Text style={[styles.smallBtnText, { color: c.text }]}>Save & Verify</Text>
                  }
                </TouchableOpacity>
                {keySource === 'manual' && (
                  <TouchableOpacity style={[styles.keyActionBtn, { backgroundColor: c.surfaceLight, borderWidth: 1, borderColor: c.border }]} onPress={revertToEnvKey}>
                    <Text style={[styles.smallBtnText, { color: c.textSecondary }]}>Revert to built-in</Text>
                  </TouchableOpacity>
                )}
              </View>
              {keyStatus === 'valid' && <Text style={[styles.metaText, { color: c.success, marginTop: 4 }]}>✓ Valid{orgId ? `  ·  Org: ${orgId.substring(0, 8)}…` : ''}</Text>}
              {keyStatus === 'invalid' && <Text style={[styles.metaText, { color: c.error, marginTop: 4 }]}>{keyError}</Text>}
            </View>
          )}

          {/* Verify */}
          <View style={[styles.row, styles.borderTop]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={c.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Key Status</Text>
              {!showKeyInput && keyStatus === null && <Text style={styles.metaText}>Tap to verify current key</Text>}
              {!showKeyInput && keyStatus === 'checking' && <Text style={styles.metaText}>Verifying…</Text>}
              {!showKeyInput && keyStatus === 'valid' && <Text style={[styles.metaText, { color: c.success }]}>✓ Valid{orgId ? `  ·  Org: ${orgId.substring(0, 8)}…` : ''}</Text>}
              {!showKeyInput && keyStatus === 'invalid' && <Text style={[styles.metaText, { color: c.error }]}>{keyError}</Text>}
            </View>
            {!showKeyInput && (
              <TouchableOpacity style={styles.smallBtn} onPress={verifyKey} disabled={keyStatus === 'checking'}>
                {keyStatus === 'checking'
                  ? <ActivityIndicator size="small" color={c.text} />
                  : <Text style={[styles.smallBtnText, { color: c.primaryLight }]}>Verify</Text>
                }
              </TouchableOpacity>
            )}
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

      {/* ── Guide ── */}
      <GuideSection c={c} styles={styles} />

      {/* ── About ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          {[['App', 'Expense Tracker'], ['Storage', 'On-device (SQLite)'], ['AI Model', MODELS.find(m => m.id === selectedModelId)?.label ?? 'Claude Sonnet'], ['Data', 'Never leaves your device']].map(([label, value], i) => (
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

// ─── Guide content ────────────────────────────────────────────────────────────
// Add new items here — they auto-appear in the Guide section

const GUIDE_ITEMS = [
  {
    icon: 'rocket-outline',
    title: 'Getting started',
    content: `1. Go to Settings → Anthropic API Account and set your API key (get one free at console.anthropic.com).
2. Tap the Upload tab, select your credit card statement PDF(s), then tap "Extract with AI".
3. Review the extracted transactions and tap Save All.
4. Your Dashboard will now show your spending summary.`,
  },
  {
    icon: 'key-outline',
    title: 'How to get & set your API key',
    content: `1. Go to console.anthropic.com and sign up (free credits included for new accounts).
2. Navigate to Settings → API Keys → Create Key.
3. Copy the key (starts with sk-ant-...).
4. In this app, go to Settings → Anthropic API Account → tap Update, paste your key, and tap Save & Verify.

Your key is stored securely on your device and takes priority over any built-in key.`,
  },
  {
    icon: 'cloud-upload-outline',
    title: 'Uploading statements',
    content: `• You can select multiple PDF files at once — they process one by one.
• The app detects duplicate files by filename and skips them automatically.
• Even if two different statements overlap, individual duplicate transactions are filtered out using a fingerprint of date + amount + description.
• If a statement fails, tap the red row to see the full error message.`,
  },
  {
    icon: 'swap-horizontal-outline',
    title: 'Understanding amounts',
    content: `• Negative amount (−$25.00) = money debited from your account (a purchase or fee).
• Positive amount (+$22.59) = money credited back to your account (a refund or cashback).

This matches what you see on your bank statement.`,
  },
  {
    icon: 'bar-chart-outline',
    title: 'Using Analytics',
    content: `• Use the period selector at the top to switch between YTD, Last Year, All Time, or individual months.
• Tap any category row in Breakdown to expand and see every transaction inside it.
• Subscriptions Detected auto-finds merchants that charge you consistently each month.
• Merchant Trends: type any merchant name (or tap a chip) to see a monthly line chart of your spend with them.`,
  },
  {
    icon: 'bulb-outline',
    title: 'Using Insights & Chat',
    content: `• Tap "Generate insights from all expenses" to get 5 AI-powered saving tips based on your real data.
• Tips are cached — they only regenerate when you tap Regenerate.
• In the chat, ask anything about your spending: "How much on DoorDash?", "Which card do I use for ExpressVPN?", "What's my biggest category?".
• Tap History to revisit past conversations. Tap New Chat to start fresh.`,
  },
  {
    icon: 'color-palette-outline',
    title: 'Changing the theme',
    content: `Go to Settings → Theme and tap any of the 5 colour swatches:
• 🏜️ Dune — warm sandy tones
• 🌿 Sage — forest greens
• 🌅 Dusk — deep navy & sky blue
• 🔥 Ember — dark brown & coral
• 🔮 Cosmos — deep purple (default)

The theme applies instantly across the whole app.`,
  },
  {
    icon: 'toggle-outline',
    title: 'Feature flags (Config)',
    content: `Settings → Config lets you toggle optional features on or off:
• Chat History — save and browse past Insights conversations
• Quick Suggestions — question chips in the chat input area
• AI Savings Tips — the generate tips button in Insights
• Subscription Detection — the recurring charge detector in Analytics
• Merchant Trends — the merchant search chart in Analytics

Critical features like Upload and the transaction list cannot be disabled.`,
  },
];

function GuideItem({ item, c, styles }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={styles.guideRow}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.7}
      >
        <View style={[styles.guideIconBox, { backgroundColor: c.primary + '22' }]}>
          <Ionicons name={item.icon} size={16} color={c.primary} />
        </View>
        <Text style={styles.guideTitle}>{item.title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={c.textTertiary} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.guideBody, { borderTopColor: c.border }]}>
          <Text style={styles.guideContent}>{item.content}</Text>
        </View>
      )}
    </View>
  );
}

function GuideSection({ c, styles }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setOpen(o => !o)}>
        <Text style={styles.sectionTitle}>Guide & Help</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSecondary} />
      </TouchableOpacity>
      {open && (
        <View style={styles.card}>
          {GUIDE_ITEMS.map((item, i) => (
            <View key={i} style={i > 0 && styles.borderTop}>
              <GuideItem item={item} c={c} styles={styles} />
            </View>
          ))}
        </View>
      )}
    </View>
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
  keyInputBlock: { borderTopWidth: 1, paddingTop: SPACING.sm },
  keyInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceLight, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: c.border, marginBottom: SPACING.sm },
  keyInput: { flex: 1, color: c.text, fontSize: FONTS.sm, padding: SPACING.sm + 2 },
  eyeBtn: { padding: SPACING.sm },
  keyBtns: { flexDirection: 'row', gap: SPACING.sm },
  keyActionBtn: { flex: 1, borderRadius: RADIUS.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  smallBtnText: { fontSize: FONTS.xs, fontWeight: '600' },
  filename: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  deleteBtn: { padding: SPACING.xs },
  aboutLabel: { flex: 1, color: c.textSecondary, fontSize: FONTS.sm },
  aboutValue: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  noData: { color: c.textTertiary, fontSize: FONTS.sm },
  modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  modelCard: {
    width: '47.5%', backgroundColor: c.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1.5, borderColor: c.border,
  },
  modelCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  modelProviderBadge: { width: 28, height: 28, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  modelProviderText: { fontSize: FONTS.sm, fontWeight: '800' },
  modelName: { color: c.text, fontSize: FONTS.sm, fontWeight: '700', marginBottom: 2 },
  modelSublabel: { color: c.textSecondary, fontSize: FONTS.xs, marginBottom: 4 },
  modelCost: { fontSize: FONTS.xs, fontWeight: '600' },
  modelNote: { color: c.textTertiary, fontSize: FONTS.xs, marginTop: SPACING.sm, lineHeight: 16 },
  guideRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, gap: SPACING.sm },
  guideIconBox: { width: 30, height: 30, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { flex: 1, color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  guideBody: { borderTopWidth: 1, paddingTop: SPACING.sm, paddingBottom: SPACING.sm, paddingLeft: 42 },
  guideContent: { color: c.textSecondary, fontSize: FONTS.sm, lineHeight: 22 },
});
