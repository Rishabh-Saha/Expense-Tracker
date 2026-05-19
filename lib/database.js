import * as SQLite from 'expo-sqlite';

let db = null;

function getDb() {
  if (!db) {
    db = SQLite.openDatabaseSync('expense-tracker.db');
    db.execSync(`PRAGMA journal_mode = WAL;`);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS statements (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        month TEXT NOT NULL,
        card_name TEXT,
        uploaded_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        statement_id TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        merchant TEXT,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS insights (
        month TEXT PRIMARY KEY,
        tips TEXT NOT NULL,
        generated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
    `);
  }
  return db;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Deterministic ID from the transaction's key fields — same transaction always gets the same ID
function transactionFingerprint(t) {
  const normalized = `${t.date}|${Number(t.amount).toFixed(2)}|${t.description.toLowerCase().trim().substring(0, 60)}`;
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return `txn-${hash}-${normalized.length}`;
}

export function isStatementDuplicate(filename) {
  const row = getDb().getFirstSync(
    'SELECT id FROM statements WHERE filename = ?',
    [filename]
  );
  return !!row;
}

export function saveStatement({ filename, month, cardName }) {
  const database = getDb();
  const id = generateId();
  database.runSync(
    'INSERT INTO statements (id, filename, month, card_name, uploaded_at) VALUES (?, ?, ?, ?, ?)',
    [id, filename, month, cardName ?? null, Date.now()]
  );
  return id;
}

// Returns { saved, skipped } counts
export function saveTransactions(statementId, transactions) {
  const database = getDb();
  let saved = 0;
  let skipped = 0;
  for (const t of transactions) {
    const id = transactionFingerprint(t);
    const result = database.runSync(
      'INSERT OR IGNORE INTO transactions (id, statement_id, date, description, merchant, amount, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, statementId, t.date, t.description, t.merchant ?? null, t.amount, t.category]
    );
    if (result.changes > 0) saved++;
    else skipped++;
  }
  return { saved, skipped };
}

const TXN_SELECT = `
  SELECT t.*, COALESCE(s.card_name, 'Unknown Card') as card_name
  FROM transactions t
  LEFT JOIN statements s ON s.id = t.statement_id`;

export function getTransactionsByMonth(month) {
  return getDb().getAllSync(
    `${TXN_SELECT} WHERE t.date LIKE ? ORDER BY t.date DESC`,
    [`${month}%`]
  );
}

export function getAllTransactions() {
  return getDb().getAllSync(`${TXN_SELECT} ORDER BY t.date DESC`);
}

export function getAllCards() {
  return getDb().getAllSync(
    `SELECT DISTINCT COALESCE(card_name, 'Unknown Card') as name
     FROM statements ORDER BY name ASC`
  );
}

export function getCardStats(startDate, endDate) {
  if (startDate && endDate) {
    return getDb().getAllSync(
      `SELECT COALESCE(s.card_name, 'Unknown Card') as card,
              SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total,
              COUNT(CASE WHEN t.amount > 0 THEN 1 END) as count
       FROM transactions t
       LEFT JOIN statements s ON s.id = t.statement_id
       WHERE t.date >= ? AND t.date <= ?
       GROUP BY card ORDER BY total DESC`,
      [startDate, endDate]
    );
  }
  return getDb().getAllSync(
    `SELECT COALESCE(s.card_name, 'Unknown Card') as card,
            SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total,
            COUNT(CASE WHEN t.amount > 0 THEN 1 END) as count
     FROM transactions t
     LEFT JOIN statements s ON s.id = t.statement_id
     GROUP BY card ORDER BY total DESC`
  );
}

export function getAllStatements() {
  return getDb().getAllSync('SELECT * FROM statements ORDER BY uploaded_at DESC');
}

export function deleteStatement(id) {
  getDb().runSync('DELETE FROM statements WHERE id = ?', [id]);
}

export function getAvailableMonths() {
  const rows = getDb().getAllSync(
    "SELECT DISTINCT substr(date, 1, 7) as month FROM transactions ORDER BY month DESC"
  );
  return rows.map(r => r.month);
}

export function getMonthStats(month) {
  const database = getDb();
  const totals = database.getAllSync(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM transactions WHERE date LIKE ? AND amount > 0
     GROUP BY category ORDER BY total DESC`,
    [`${month}%`]
  );
  const summary = database.getFirstSync(
    `SELECT SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spent,
            COUNT(CASE WHEN amount > 0 THEN 1 END) as txn_count
     FROM transactions WHERE date LIKE ?`,
    [`${month}%`]
  );
  const dailyRows = database.getAllSync(
    `SELECT date, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions WHERE date LIKE ? GROUP BY date ORDER BY date`,
    [`${month}%`]
  );
  return { totals, summary, dailyRows };
}

export function createChatSession(firstMessage) {
  const id = generateId();
  const title = firstMessage.length > 45 ? firstMessage.substring(0, 45) + '…' : firstMessage;
  getDb().runSync(
    'INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)',
    [id, title, Date.now()]
  );
  return id;
}

export function saveChatMessage(sessionId, role, content) {
  getDb().runSync(
    'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [generateId(), sessionId, role, content, Date.now()]
  );
}

export function getChatSessions() {
  return getDb().getAllSync(
    `SELECT s.*, COUNT(m.id) as message_count
     FROM chat_sessions s
     LEFT JOIN chat_messages m ON m.session_id = s.id
     GROUP BY s.id ORDER BY s.created_at DESC`
  );
}

export function getChatMessages(sessionId) {
  return getDb().getAllSync(
    'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );
}

export function deleteChatSession(id) {
  getDb().runSync('DELETE FROM chat_sessions WHERE id = ?', [id]);
}

export function saveInsights(month, tips) {
  getDb().runSync(
    'INSERT OR REPLACE INTO insights (month, tips, generated_at) VALUES (?, ?, ?)',
    [month, JSON.stringify(tips), Date.now()]
  );
}

export function getCachedInsights(month) {
  const row = getDb().getFirstSync('SELECT tips FROM insights WHERE month = ?', [month]);
  if (!row) return null;
  try { return JSON.parse(row.tips); } catch { return null; }
}

export function getMerchantMonthlyTotals(query) {
  const q = `%${query.toLowerCase()}%`;
  return getDb().getAllSync(
    `SELECT substr(date,1,7) as month, SUM(amount) as total, COUNT(*) as count
     FROM transactions
     WHERE (LOWER(COALESCE(merchant,'')) LIKE ? OR LOWER(description) LIKE ?) AND amount > 0
     GROUP BY month ORDER BY month`,
    [q, q]
  );
}

export function getTopMerchants(limit = 12) {
  return getDb().getAllSync(
    `SELECT COALESCE(merchant, description) as name, SUM(amount) as total, COUNT(*) as count
     FROM transactions WHERE amount > 0
     GROUP BY LOWER(COALESCE(merchant, description))
     ORDER BY total DESC LIMIT ?`,
    [limit]
  );
}

export function getStatsForPeriod(startDate, endDate) {
  const database = getDb();
  const totals = database.getAllSync(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM transactions WHERE date >= ? AND date <= ? AND amount > 0
     GROUP BY category ORDER BY total DESC`,
    [startDate, endDate]
  );
  const summary = database.getFirstSync(
    `SELECT SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spent,
            COUNT(CASE WHEN amount > 0 THEN 1 END) as txn_count
     FROM transactions WHERE date >= ? AND date <= ?`,
    [startDate, endDate]
  );
  const dailyRows = database.getAllSync(
    `SELECT date, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`,
    [startDate, endDate]
  );
  const monthlyRows = database.getAllSync(
    `SELECT substr(date,1,7) as month, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions WHERE date >= ? AND date <= ? GROUP BY month ORDER BY month`,
    [startDate, endDate]
  );
  return { totals, summary, dailyRows, monthlyRows };
}

export function getTransactionsForPeriod(startDate, endDate) {
  return getDb().getAllSync(
    `${TXN_SELECT} WHERE t.date >= ? AND t.date <= ? ORDER BY t.date DESC`,
    [startDate, endDate]
  );
}

export function clearAllData() {
  const database = getDb();
  database.runSync('DELETE FROM chat_messages');
  database.runSync('DELETE FROM chat_sessions');
  database.runSync('DELETE FROM insights');
  database.runSync('DELETE FROM transactions');
  database.runSync('DELETE FROM statements');
}

export function getLastSixMonthsTotals() {
  return getDb().getAllSync(
    `SELECT substr(date, 1, 7) as month, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions GROUP BY month ORDER BY month DESC LIMIT 6`
  );
}
