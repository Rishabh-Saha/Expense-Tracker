import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, RADIUS } from '../constants/theme';
import { useTheme } from '../lib/ThemeContext';
import { getCategoryColor, getCategoryEmoji } from '../constants/categories';
import { extractTransactionsFromPDF, inferMonthFromTransactions } from '../lib/pdfParser';
import { saveStatement, saveTransactions, isStatementDuplicate } from '../lib/database';

const STATUS = { PENDING: 'pending', PROCESSING: 'processing', DONE: 'done', ERROR: 'error', DUPLICATE: 'duplicate' };

function FileRow({ file, onPressError, c }) {
  const icon = {
    [STATUS.PENDING]: { name: 'time-outline', color: c.textSecondary },
    [STATUS.PROCESSING]: null,
    [STATUS.DONE]: { name: 'checkmark-circle', color: c.success },
    [STATUS.ERROR]: { name: 'alert-circle', color: c.error },
    [STATUS.DUPLICATE]: { name: 'copy-outline', color: c.warning },
  }[file.status];

  return (
    <TouchableOpacity
      style={[styles_static.fileRow, { borderBottomColor: c.border }]}
      onPress={file.status === STATUS.ERROR ? onPressError : undefined}
      activeOpacity={file.status === STATUS.ERROR ? 0.6 : 1}
    >
      <Ionicons name="document-text-outline" size={20} color={c.primary} style={{ marginRight: SPACING.sm }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles_static.fileName, { color: c.text }]} numberOfLines={1}>{file.name}</Text>
        {file.status === STATUS.DONE && (
          <Text style={[styles_static.fileMeta, { color: c.textSecondary }]}>
            {file.cardName ? `${file.cardName} · ` : ''}{file.txnCount} saved{file.skipped > 0 ? ` · ${file.skipped} dupes skipped` : ''} · {file.month}
          </Text>
        )}
        {file.status === STATUS.DUPLICATE && (
          <Text style={[styles_static.fileMeta, { color: c.warning }]}>Already uploaded — skipped</Text>
        )}
        {file.status === STATUS.ERROR && (
          <Text style={[styles_static.fileMeta, { color: c.error }]}>
            {file.error?.split('\n')[0]} · <Text style={{ textDecorationLine: 'underline' }}>tap for details</Text>
          </Text>
        )}
      </View>
      {file.status === STATUS.PROCESSING
        ? <ActivityIndicator size="small" color={c.primary} />
        : icon && <Ionicons name={icon.name} size={20} color={icon.color} />
      }
    </TouchableOpacity>
  );
}

export default function UploadScreen({ navigation }) {
  const { colors: c, themeId } = useTheme();
  const styles = useMemo(() => createStyles(c), [themeId]);

  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [errorDetail, setErrorDetail] = useState(null);

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return;
      setFiles(result.assets.map(a => ({ ...a, status: STATUS.PENDING, txnCount: 0, skipped: 0, month: null, error: null })));
      setAllDone(false);
    } catch { Alert.alert('Error', 'Could not open file picker'); }
  };

  const processAll = async () => {
    setProcessing(true);
    const updated = [...files];
    for (let i = 0; i < updated.length; i++) {
      if ([STATUS.DONE, STATUS.DUPLICATE].includes(updated[i].status)) continue;
      if (isStatementDuplicate(updated[i].name)) {
        updated[i] = { ...updated[i], status: STATUS.DUPLICATE };
        setFiles([...updated]); continue;
      }
      updated[i] = { ...updated[i], status: STATUS.PROCESSING };
      setFiles([...updated]);
      try {
        const { cardName, transactions } = await extractTransactionsFromPDF(updated[i].uri);
        const month = inferMonthFromTransactions(transactions) ?? new Date().toISOString().substring(0, 7);
        const statementId = saveStatement({ filename: updated[i].name, month, cardName });
        const { saved, skipped } = saveTransactions(statementId, transactions);
        updated[i] = { ...updated[i], status: STATUS.DONE, txnCount: saved, skipped, month, cardName };
      } catch (e) {
        updated[i] = { ...updated[i], status: STATUS.ERROR, error: e.message };
      }
      setFiles([...updated]);
    }
    setProcessing(false);
    setAllDone(true);
  };

  const doneCount = files.filter(f => f.status === STATUS.DONE).length;
  const errorCount = files.filter(f => f.status === STATUS.ERROR).length;
  const dupCount = files.filter(f => f.status === STATUS.DUPLICATE).length;
  const hasFiles = files.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Modal visible={!!errorDetail} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setErrorDetail(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Error Details</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={styles.modalBody} selectable>{errorDetail}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setErrorDetail(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <TouchableOpacity style={styles.dropZone} onPress={pickFiles} disabled={processing}>
        <Ionicons name="cloud-upload-outline" size={44} color={c.primary} />
        <Text style={styles.dropTitle}>
          {hasFiles ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Tap to choose PDFs'}
        </Text>
        <Text style={styles.dropSub}>Select multiple statements at once</Text>
      </TouchableOpacity>

      {hasFiles && (
        <View style={styles.card}>
          {files.map((f, i) => <FileRow key={i} file={f} c={c} onPressError={() => setErrorDetail(f.error)} />)}
        </View>
      )}

      {hasFiles && !allDone && (
        <TouchableOpacity style={[styles.primaryBtn, processing && { opacity: 0.6 }]} onPress={processAll} disabled={processing}>
          {processing
            ? <><ActivityIndicator color={c.text} style={{ marginRight: 8 }} /><Text style={styles.primaryBtnText}>Processing…</Text></>
            : <><Ionicons name="sparkles-outline" size={18} color={c.text} style={{ marginRight: 8 }} /><Text style={styles.primaryBtnText}>Extract {files.length > 1 ? `all ${files.length} statements` : 'statement'} with AI</Text></>
          }
        </TouchableOpacity>
      )}

      {allDone && (
        <View style={styles.summaryCard}>
          {doneCount > 0 && (
            <View style={styles.summaryRow}>
              <Ionicons name="checkmark-circle" size={20} color={c.success} />
              <Text style={[styles.summaryText, { color: c.success }]}>{doneCount} statement{doneCount > 1 ? 's' : ''} saved</Text>
            </View>
          )}
          {dupCount > 0 && (
            <View style={styles.summaryRow}>
              <Ionicons name="copy-outline" size={20} color={c.warning} />
              <Text style={[styles.summaryText, { color: c.warning }]}>{dupCount} already uploaded — skipped</Text>
            </View>
          )}
          {errorCount > 0 && (
            <View style={styles.summaryRow}>
              <Ionicons name="alert-circle" size={20} color={c.error} />
              <Text style={[styles.summaryText, { color: c.error }]}>{errorCount} failed — tap for details</Text>
            </View>
          )}
          <View style={styles.summaryBtns}>
            {doneCount > 0 && (
              <TouchableOpacity style={styles.dashBtn} onPress={() => navigation.navigate('Dashboard')}>
                <Text style={styles.dashBtnText}>View Dashboard</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.newBtn} onPress={pickFiles}>
              <Text style={[styles.newBtnText, { color: c.textSecondary }]}>Upload More</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// Static styles that don't depend on theme (used in FileRow which receives c as prop)
const styles_static = StyleSheet.create({
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1 },
  fileName: { fontSize: FONTS.sm, fontWeight: '500' },
  fileMeta: { fontSize: FONTS.xs, marginTop: 2 },
});

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  dropZone: {
    backgroundColor: c.surface, borderRadius: RADIUS.lg, borderWidth: 2,
    borderColor: c.primary + '66', borderStyle: 'dashed',
    alignItems: 'center', padding: SPACING.xl, marginBottom: SPACING.md,
  },
  dropTitle: { color: c.text, fontSize: FONTS.md, fontWeight: '600', marginTop: SPACING.sm, textAlign: 'center' },
  dropSub: { color: c.textSecondary, fontSize: FONTS.sm, marginTop: 4 },
  card: { backgroundColor: c.surface, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACING.md },
  primaryBtn: {
    backgroundColor: c.primary, borderRadius: RADIUS.xl, paddingVertical: SPACING.md,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.md,
  },
  primaryBtnText: { color: c.text, fontWeight: '700', fontSize: FONTS.md },
  summaryCard: { backgroundColor: c.surface, borderRadius: RADIUS.md, padding: SPACING.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  summaryText: { fontSize: FONTS.md, fontWeight: '600' },
  summaryBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  dashBtn: { flex: 1, backgroundColor: c.primary, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm + 2, alignItems: 'center' },
  dashBtnText: { color: c.text, fontWeight: '700', fontSize: FONTS.sm },
  newBtn: { flex: 1, backgroundColor: c.surfaceLight, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: c.border },
  newBtnText: { fontWeight: '600', fontSize: FONTS.sm },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: c.surface, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: '70%' },
  modalTitle: { color: c.text, fontSize: FONTS.md, fontWeight: '700', marginBottom: SPACING.sm },
  modalBody: { color: c.textSecondary, fontSize: FONTS.sm, lineHeight: 20, fontFamily: 'monospace' },
  modalClose: { marginTop: SPACING.md, backgroundColor: c.primary, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm, alignItems: 'center' },
  modalCloseText: { color: c.text, fontWeight: '700' },
});
