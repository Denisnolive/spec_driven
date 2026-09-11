import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ConversationStore,
  ConversationSummaryData,
  MessageData,
} from './conversation-store.js';
import { sqliteStore } from './sqlite-ops-store.js';

// ─── Implementação SQLite de ConversationStore ────────────────────────────────

/**
 * Persistência de conversas e mensagens em SQLite via node:sqlite (DatabaseSync).
 * Reutiliza a instância de DatabaseSync do SqliteOpsStore (mesmo banco).
 */
export class SqliteConversationStore implements ConversationStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec('PRAGMA foreign_keys = ON');
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, id);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
        summary TEXT NOT NULL,
        summarized_messages_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  create(): string {
    const id = randomUUID();
    const stmt = this.db.prepare(
      'INSERT INTO conversations (id) VALUES (?)'
    );
    stmt.run(id);
    return id;
  }

  append(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): MessageData {
    const insertStmt = this.db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    );
    const result = insertStmt.run(conversationId, role, content);
    const insertedId = Number(result.lastInsertRowid);

    const getStmt = this.db.prepare(
      'SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?'
    );
    return getStmt.get(insertedId) as unknown as MessageData;
  }

  lastMessages(conversationId: string, limit: number): MessageData[] {
    // Subquery para pegar as últimas N em DESC, depois reordenar em ASC
    const stmt = this.db.prepare(`
      SELECT id, conversation_id, role, content, created_at
      FROM (
        SELECT id, conversation_id, role, content, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
      ORDER BY id ASC
    `);
    return stmt.all(conversationId, limit) as unknown as MessageData[];
  }

  exists(conversationId: string): boolean {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM conversations WHERE id = ?'
    );
    const row = stmt.get(conversationId) as unknown as { cnt: number };
    return row.cnt > 0;
  }

  countMessages(conversationId: string): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'
    );
    const row = stmt.get(conversationId) as unknown as { cnt: number };
    return row.cnt;
  }

  getMessagesRange(
    conversationId: string,
    offset: number,
    limit: number
  ): MessageData[] {
    const stmt = this.db.prepare(`
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(conversationId, limit, offset) as unknown as MessageData[];
  }

  getSummary(conversationId: string): ConversationSummaryData | null {
    const stmt = this.db.prepare(`
      SELECT conversation_id, summary, summarized_messages_count, updated_at
      FROM conversation_summaries
      WHERE conversation_id = ?
    `);
    const row = stmt.get(conversationId) as unknown as
      | ConversationSummaryData
      | undefined;
    return row ?? null;
  }

  saveSummary(
    conversationId: string,
    summary: string,
    summarizedMessagesCount: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_summaries (conversation_id, summary, summarized_messages_count, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(conversation_id) DO UPDATE SET
        summary = excluded.summary,
        summarized_messages_count = excluded.summarized_messages_count,
        updated_at = datetime('now')
    `);
    stmt.run(conversationId, summary, summarizedMessagesCount);
  }
}

/** Instância padrão de persistência de conversas reutilizando o banco SQLite do OpsStore */
export const sqliteConversationStore = new SqliteConversationStore(sqliteStore.db);
