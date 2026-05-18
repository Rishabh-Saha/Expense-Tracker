import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Keyboard, Animated, Modal, Pressable, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import MarkdownText from '../components/MarkdownText';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';
import {
  getAllTransactions, saveInsights, getCachedInsights,
  createChatSession, saveChatMessage, getChatSessions, getChatMessages, deleteChatSession,
} from '../lib/database';
import { useFeatures } from '../lib/FeatureContext';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

async function callClaude(system, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 1024, system, messages }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message ?? `API error ${res.status}`); }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function generateTips(prompt) {
  const system = `You are a personal finance advisor. Give exactly 5 specific, actionable spending-reduction tips.
Return ONLY a raw JSON array (no markdown):
[{"category":"Food & Dining","title":"Short actionable title","detail":"2-3 sentences with specific numbers","estimatedSaving":80}]`;
  const text = await callClaude(system, [{ role: 'user', content: prompt }]);
  const stripped = text.replace(/\`\`\`(?:json)?\s*/gi, '').replace(/\`\`\`/g, '').trim();
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse tips');
  return JSON.parse(match[0]);
}

function buildTxnContext(transactions) {
  const lines = transactions.slice(0, 600).map(t => {
    // Match the sign convention the user sees in the UI:
    // amount > 0 = debit/purchase → show as -$X
    // amount < 0 = credit/refund  → show as +$X
    const display = t.amount > 0
      ? `-$${t.amount.toFixed(2)}`
      : `+$${Math.abs(t.amount).toFixed(2)}`;
    return `${t.date} | ${t.merchant || t.description} | ${t.category} | ${display}`;
  });
  return `User's credit card transactions (date | merchant | category | amount):\n${lines.join('\n')}`;
}

function formatMonth(m) {
  if (!m) return '';
  const [year, month] = m.split('-');
  return new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Add instructions here — they are injected into Claude's system prompt automatically
const CHAT_INSTRUCTIONS = [
  'Positive amounts mean the charge was credited back to the account (refund, cashback, reversal).',
  'Negative amounts mean the charge was debited from the account (purchase, fee, subscription).',
];

function TipCard({ tip, c }) {
  const [expanded, setExpanded] = useState(false);
  const color = getCategoryColor(tip.category);
  return (
    <TouchableOpacity
      style={[styles_static.tipCard, { backgroundColor: c.surface, borderLeftColor: color }]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View style={styles_static.tipHeader}>
        <View style={[styles_static.tipIcon, { backgroundColor: color + '22' }]}>
          <Text style={{ fontSize: 16 }}>{getCategoryEmoji(tip.category)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles_static.tipTitle, { color: c.text }]}>{tip.title}</Text>
          <Text style={[styles_static.tipCat, { color: c.textSecondary }]}>{tip.category}</Text>
        </View>
        <View style={[styles_static.savingBadge, { backgroundColor: c.success + '22' }]}>
          <Text style={[styles_static.savingText, { color: c.success }]}>-${tip.estimatedSaving}/mo</Text>
        </View>
      </View>
      {expanded && <Text style={[styles_static.tipDetail, { color: c.textSecondary, borderTopColor: c.border }]}>{tip.detail}</Text>}
      <View style={styles_static.tipFooter}>
        <Text style={[styles_static.tapHint, { color: c.textTertiary }]}>{expanded ? 'Collapse' : 'Read more'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={c.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}

function ChatBubble({ message, c }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles_static.bubbleRow, isUser && styles_static.bubbleRowUser]}>
      {!isUser && (
        <View style={[styles_static.avatarDot, { backgroundColor: c.primary + '33' }]}>
          <Text style={{ fontSize: 12 }}>✨</Text>
        </View>
      )}
      <View style={[
        styles_static.bubble,
        { backgroundColor: isUser ? c.primary : c.surface },
        isUser && styles_static.bubbleUserShape,
      ]}>
        {isUser ? (
          <Text style={[styles_static.bubbleText, { color: c.text }]}>{message.content}</Text>
        ) : (
          <MarkdownText
            text={message.content}
            style={[styles_static.bubbleText, { color: c.text }]}
          />
        )}
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);
  const { flags } = useFeatures();
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      Animated.timing(keyboardAnim, {
        toValue: e.endCoordinates.height,
        duration: 250,
        useNativeDriver: false,
      }).start();
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 300);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const [tips, setTips] = useState(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState(null);
  const [allTxns, setAllTxns] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const chatRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      const txns = getAllTransactions();
      setAllTxns(txns);
      setTips(getCachedInsights('all'));
      setTipsError(null);
    }, [])
  );

  const generate = async () => {
    setTipsLoading(true); setTipsError(null);
    try {
      const txns = getAllTransactions();
      if (!txns.length) throw new Error('No transactions found. Upload a statement first.');
      // Aggregate by category across all time
      const totals = {};
      let grandTotal = 0;
      for (const t of txns) {
        if (t.amount <= 0) continue;
        totals[t.category] = (totals[t.category] ?? 0) + t.amount;
        grandTotal += t.amount;
      }
      const lines = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)} (${((amt / grandTotal) * 100).toFixed(0)}%)`)
        .join('\n');
      const result = await generateTips(`All-time spending across ${txns.length} transactions:\nTotal: $${grandTotal.toFixed(2)}\n${lines}`);
      setTips(result);
      saveInsights('all', result);
    } catch (e) { setTipsError(e.message); }
    finally { setTipsLoading(false); }
  };

  const CHAT_SYSTEM = (txnContext) =>
    `You are a personal finance assistant. Answer questions about the user's spending using their transaction data below.

Data interpretation rules:
${CHAT_INSTRUCTIONS.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Formatting rules:
- For simple answers, respond in 1-3 plain sentences
- For lists of items, use "- item" bullet format
- Never use headers or ##
- Only use **bold** for a single key number or merchant name per response
- Never use em dashes (—), use commas or periods instead
- Be specific: always cite exact dollar amounts and merchant names
- Keep responses short and conversational

${txnContext}`;

  const sendChat = async () => {
    const q = input.trim();
    if (!q || chatLoading) return;
    setInput('');

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = createChatSession(q);
      setCurrentSessionId(sessionId);
      setSessions(getChatSessions());
    }
    saveChatMessage(sessionId, 'user', q);

    const newHistory = [...chatHistory, { role: 'user', content: q }];
    setChatHistory(newHistory);
    setChatLoading(true);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const reply = await callClaude(
        CHAT_SYSTEM(buildTxnContext(allTxns)),
        newHistory.map(m => ({ role: m.role, content: m.content }))
      );
      saveChatMessage(sessionId, 'assistant', reply);
      setChatHistory(h => [...h, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatHistory(h => [...h, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const startNewChat = () => {
    setSessions(getChatSessions());
    setChatHistory([]);
    setCurrentSessionId(null);
  };

  const loadSession = (session) => {
    setChatHistory(getChatMessages(session.id));
    setCurrentSessionId(session.id);
    setShowHistory(false);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: false }), 150);
  };

  const handleDeleteSession = (id) => {
    Alert.alert('Delete chat?', 'This conversation will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          deleteChatSession(id);
          if (currentSessionId === id) startNewChat();
          else setSessions(getChatSessions());
        },
      },
    ]);
  };

  const totalSaving = tips?.reduce((s, t) => s + (t.estimatedSaving ?? 0), 0) ?? 0;

  if (!allTxns.length && !tipsLoading) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 48, marginBottom: SPACING.md }}>💡</Text>
        <Text style={styles.emptyTitle}>No data yet</Text>
        <Text style={styles.emptyText}>Upload a statement first</Text>
      </View>
    );
  }

  return (
    <Animated.View style={{ flex: 1, backgroundColor: c.background, paddingBottom: keyboardAnim }}>
      <ScrollView ref={chatRef} style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {flags.aiTips && !tips && !tipsLoading && (
          <TouchableOpacity style={styles.generateBtn} onPress={generate}>
            <Ionicons name="sparkles" size={18} color={c.text} style={{ marginRight: 8 }} />
            <Text style={styles.generateBtnText}>Generate insights from all expenses</Text>
          </TouchableOpacity>
        )}

        {tipsLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={c.primary} size="large" />
            <Text style={styles.loadingText}>Analysing your spending…</Text>
          </View>
        )}

        {tipsError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{tipsError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={generate}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {flags.aiTips && tips && (
          <>
            <View style={styles.savingsBanner}>
              <View>
                <Text style={styles.savingsLabel}>Potential monthly savings</Text>
                <Text style={styles.savingsAmount}>${totalSaving}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 32 }}>💰</Text>
                <TouchableOpacity onPress={generate} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="refresh" size={12} color={c.primaryLight} />
                  <Text style={{ color: c.primaryLight, fontSize: FONTS.xs }}>Regenerate</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.sectionLabel}>TIPS · ALL TIME</Text>
            {tips.map((tip, i) => <TipCard key={i} tip={tip} c={c} />)}
          </>
        )}

        {/* History modal */}
        <Modal visible={showHistory} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setShowHistory(false)}>
            <Pressable style={styles.historySheet} onPress={() => {}}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Chat History</Text>
                <TouchableOpacity onPress={() => setShowHistory(false)}>
                  <Ionicons name="close" size={22} color={c.textSecondary} />
                </TouchableOpacity>
              </View>
              {sessions.length === 0 ? (
                <Text style={styles.historyEmpty}>No saved chats yet</Text>
              ) : (
                <ScrollView>
                  {sessions.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.sessionRow, currentSessionId === s.id && { backgroundColor: c.primary + '22' }]}
                      onPress={() => loadSession(s)}
                    >
                      <Ionicons name="chatbubble-outline" size={16} color={c.textSecondary} style={{ marginRight: SPACING.sm }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>{s.title}</Text>
                        <Text style={styles.sessionMeta}>
                          {s.message_count} messages · {new Date(s.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteSession(s.id)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={16} color={c.error} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <View style={styles.chatDivider}>
          {flags.chatHistory && (
            <TouchableOpacity style={styles.newChatBtn} onPress={() => { setSessions(getChatSessions()); setShowHistory(true); }}>
              <Ionicons name="time-outline" size={14} color={c.primary} />
              <Text style={styles.newChatText}>History</Text>
            </TouchableOpacity>
          )}
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>Ask anything</Text>
          <View style={styles.dividerLine} />
          {chatHistory.length > 0 ? (
            <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}>
              <Ionicons name="add-circle-outline" size={14} color={c.primary} />
              <Text style={styles.newChatText}>New chat</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.newChatBtn} />
          )}
        </View>

        {chatHistory.length === 0 && (
          <View style={styles.chatEmpty}>
            <Text style={styles.chatEmptyText}>Ask me about your spending</Text>
            {flags.chatSuggestions && (
              <View style={styles.suggestionsRow}>
                {['How much on DoorDash?', 'Top 3 merchants?', 'Biggest expense?'].map(s => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => setInput(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {chatHistory.map((m, i) => <ChatBubble key={i} message={m} c={c} />)}
        {chatLoading && (
          <View style={styles_static.bubbleRow}>
            <View style={[styles_static.avatarDot, { backgroundColor: c.primary + '33' }]}><Text style={{ fontSize: 12 }}>✨</Text></View>
            <View style={[styles_static.bubble, { backgroundColor: c.surface, paddingVertical: SPACING.sm }]}>
              <ActivityIndicator size="small" color={c.textSecondary} />
            </View>
          </View>
        )}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <TextInput
          style={[styles.textInput, { backgroundColor: c.surfaceLight, color: c.text, borderColor: c.border }]}
          value={input} onChangeText={setInput}
          placeholder="How much did I spend on Netflix?" placeholderTextColor={c.textTertiary}
          multiline maxLength={300} onSubmitEditing={sendChat} returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: c.primary }, (!input.trim() || chatLoading) && { opacity: 0.4 }]}
          onPress={sendChat} disabled={!input.trim() || chatLoading}
        >
          <Ionicons name="send" size={18} color={c.text} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles_static = StyleSheet.create({
  tipCard: { borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderLeftWidth: 3 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tipIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { fontSize: FONTS.sm, fontWeight: '600' },
  tipCat: { fontSize: FONTS.xs, marginTop: 1 },
  savingBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  savingText: { fontSize: FONTS.xs, fontWeight: '700' },
  tipDetail: { fontSize: FONTS.sm, lineHeight: 20, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1 },
  tipFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, gap: 3 },
  tapHint: { fontSize: FONTS.xs },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: SPACING.sm, gap: SPACING.xs },
  bubbleRowUser: { flexDirection: 'row-reverse' },
  avatarDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '82%', borderRadius: RADIUS.md, padding: SPACING.sm + 4 },
  bubbleUserShape: { borderBottomRightRadius: 4 },
  bubbleText: { fontSize: FONTS.sm, lineHeight: 20 },
});

const createStyles = (c) => StyleSheet.create({
  content: { padding: SPACING.md, paddingBottom: SPACING.sm },
  tabs: { marginBottom: SPACING.md, marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md },
  tab: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.xl, backgroundColor: c.surface, marginRight: SPACING.sm, borderWidth: 1, borderColor: c.border },
  tabText: { color: c.textSecondary, fontSize: FONTS.sm },
  generateBtn: { backgroundColor: c.primary, borderRadius: RADIUS.xl, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  generateBtnText: { color: c.text, fontWeight: '700', fontSize: FONTS.md },
  loadingCard: { backgroundColor: c.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  loadingText: { color: c.text, fontSize: FONTS.md, fontWeight: '600' },
  errorCard: { backgroundColor: c.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  errorText: { color: c.error, fontSize: FONTS.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: c.surfaceLight, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs + 2 },
  retryText: { color: c.textSecondary, fontWeight: '600', fontSize: FONTS.sm },
  savingsBanner: { backgroundColor: c.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  savingsLabel: { color: c.primaryLight, fontSize: FONTS.sm },
  savingsAmount: { color: c.text, fontSize: FONTS.xxxl, fontWeight: '800' },
  sectionLabel: { color: c.textSecondary, fontSize: FONTS.xs, fontWeight: '600', letterSpacing: 0.8, marginBottom: SPACING.sm },
  chatDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.lg, gap: SPACING.sm, flexWrap: 'wrap' },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: c.primary + '66' },
  newChatText: { color: c.primary, fontSize: FONTS.xs, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: '#00000077', justifyContent: 'flex-end' },
  historySheet: {
    backgroundColor: c.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl, maxHeight: '70%',
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.md },
  historyTitle: { color: c.text, fontSize: FONTS.lg, fontWeight: '700' },
  historyEmpty: { color: c.textTertiary, textAlign: 'center', padding: SPACING.xl, fontSize: FONTS.md },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm + 2, borderTopWidth: 1, borderTopColor: c.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.xs },
  sessionTitle: { color: c.text, fontSize: FONTS.sm, fontWeight: '500' },
  sessionMeta: { color: c.textSecondary, fontSize: FONTS.xs, marginTop: 2 },
  deleteBtn: { padding: SPACING.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dividerLabel: { color: c.textTertiary, fontSize: FONTS.xs, fontWeight: '600', letterSpacing: 0.8 },
  chatEmpty: { alignItems: 'center', marginBottom: SPACING.md },
  chatEmptyText: { color: c.textSecondary, fontSize: FONTS.sm, marginBottom: SPACING.sm },
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, justifyContent: 'center' },
  suggestion: { backgroundColor: c.surface, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs + 1, borderWidth: 1, borderColor: c.border },
  suggestionText: { color: c.primaryLight, fontSize: FONTS.xs },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm, paddingHorizontal: SPACING.md, borderTopWidth: 1, gap: SPACING.sm },
  textInput: { flex: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONTS.md, maxHeight: 100, borderWidth: 1 },
  sendBtn: { borderRadius: RADIUS.md, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { color: c.text, fontSize: FONTS.xl, fontWeight: '700', marginBottom: SPACING.xs },
  emptyText: { color: c.textSecondary, fontSize: FONTS.md },
});
