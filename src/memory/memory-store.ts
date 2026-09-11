import type { DatabaseSync } from 'node:sqlite';
import { embed, dot } from './embeddings.js';
import { sqliteStore } from '../store/sqlite-ops-store.js';

// ─── Interfaces e Tipos ───────────────────────────────────────────────────────

export interface Memory {
  id: number;
  user_id: string;
  fact: string;
  embedding: Float32Array;
  created_at: string;
}

export interface MemoryWithScore extends Memory {
  score: number;
}

export interface RememberResult {
  memory: Memory;
  isNew: boolean;
}

export interface MemoryStore {
  remember(userId: string, fact: string): Promise<RememberResult>;
  recall(userId: string, query: string, k?: number): Promise<MemoryWithScore[]>;
  forget(userId: string, memoryId: number): Promise<boolean>;
  list(userId: string): Promise<Memory[]>;
}

// ─── Funções Auxiliares para Conversão BLOB ───────────────────────────────────

/**
 * Converte Float32Array para Buffer binário para persistência em BLOB no SQLite.
 */
export function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Converte Buffer ou Uint8Array binário lido do SQLite de volta para Float32Array.
 */
export function bufferToFloat32(buf: Buffer | Uint8Array): Float32Array {
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
}

// ─── Implementação SQLite de MemoryStore ──────────────────────────────────────

export class SqliteMemoryStore implements MemoryStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user_id
        ON memories(user_id);
    `);
  }

  /**
   * Recupera todas as memórias de um usuário desserializando o embedding do BLOB.
   */
  _all(userId: string): Memory[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, fact, embedding, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY id ASC
    `);

    const rows = stmt.all(userId) as Array<{
      id: number;
      user_id: string;
      fact: string;
      embedding: Uint8Array | Buffer;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      fact: row.fact,
      embedding: bufferToFloat32(row.embedding),
      created_at: row.created_at,
    }));
  }

  /**
   * Armazena um fato para o usuário com deduplicação semântica (> 0.92).
   */
  async remember(userId: string, fact: string): Promise<RememberResult> {
    const q = await embed(fact);
    const existing = this._all(userId);

    // Verificação de deduplicação semântica (> 0.92)
    for (const mem of existing) {
      const similarity = dot(q, mem.embedding);
      if (similarity > 0.92) {
        return { memory: mem, isNew: false };
      }
    }

    const insertStmt = this.db.prepare(`
      INSERT INTO memories (user_id, fact, embedding)
      VALUES (?, ?, ?)
    `);

    const blob = float32ToBuffer(q);
    const result = insertStmt.run(userId, fact, blob);
    const insertedId = Number(result.lastInsertRowid);

    const getStmt = this.db.prepare(`
      SELECT id, user_id, fact, embedding, created_at
      FROM memories
      WHERE id = ?
    `);

    const row = getStmt.get(insertedId) as {
      id: number;
      user_id: string;
      fact: string;
      embedding: Uint8Array | Buffer;
      created_at: string;
    };

    const newMemory: Memory = {
      id: row.id,
      user_id: row.user_id,
      fact: row.fact,
      embedding: bufferToFloat32(row.embedding),
      created_at: row.created_at,
    };

    return { memory: newMemory, isNew: true };
  }

  /**
   * Recupera os fatos mais relevantes para a consulta via produto escalar dos embeddings.
   * Filtra relevância mínima > 0.3 e retorna até k itens ordenados por score decrescente.
   */
  async recall(userId: string, query: string, k = 3): Promise<MemoryWithScore[]> {
    const q = await embed(query);
    return this._all(userId)
      .map((mappedUser) => ({
        ...mappedUser,
        score: dot(q, mappedUser.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter((mappedUser) => mappedUser.score > 0.3);
  }

  /**
   * Remove uma memória pertencente ao usuário especificado.
   */
  async forget(userId: string, memoryId: number): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM memories
      WHERE id = ? AND user_id = ?
    `);
    const result = stmt.run(memoryId, userId);
    return Number(result.changes) > 0;
  }

  /**
   * Lista todas as memórias registradas para o usuário.
   */
  async list(userId: string): Promise<Memory[]> {
    return this._all(userId);
  }
}

// ─── Implementação In-Memory para Testes Isolados ──────────────────────────────

export class InMemoryMemoryStore implements MemoryStore {
  private memories: Memory[] = [];
  private nextId = 1;

  async remember(userId: string, fact: string): Promise<RememberResult> {
    const q = await embed(fact);
    const userMemories = this.memories.filter((m) => m.user_id === userId);

    for (const mem of userMemories) {
      const similarity = dot(q, mem.embedding);
      if (similarity > 0.92) {
        return { memory: mem, isNew: false };
      }
    }

    const memory: Memory = {
      id: this.nextId++,
      user_id: userId,
      fact,
      embedding: q,
      created_at: new Date().toISOString(),
    };

    this.memories.push(memory);
    return { memory, isNew: true };
  }

  async recall(userId: string, query: string, k = 3): Promise<MemoryWithScore[]> {
    const q = await embed(query);
    return this.memories
      .filter((m) => m.user_id === userId)
      .map((mappedUser) => ({
        ...mappedUser,
        score: dot(q, mappedUser.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter((mappedUser) => mappedUser.score > 0.3);
  }

  async forget(userId: string, memoryId: number): Promise<boolean> {
    const initialLen = this.memories.length;
    this.memories = this.memories.filter(
      (m) => !(m.id === memoryId && m.user_id === userId)
    );
    return this.memories.length < initialLen;
  }

  async list(userId: string): Promise<Memory[]> {
    return this.memories.filter((m) => m.user_id === userId);
  }
}

/** Instância padrão de persistência de memória semântica em SQLite */
export const sqliteMemoryStore = new SqliteMemoryStore(sqliteStore.db);
