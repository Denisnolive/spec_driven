/**
 * Shim que adapta better-sqlite3 (síncrono) para a interface de callbacks
 * esperada pelo dialeto sqlite do Sequelize v6.
 *
 * Suporta sobrecarga flexível de parâmetros e normalização de chaves nomeadas ($1 -> 1).
 */

import BsDatabase from 'better-sqlite3';
import type { Database as BsDb } from 'better-sqlite3';

type ErrCallback = (err: Error | null) => void;
type RowCallback = (err: Error | null, row?: unknown) => void;
type RowsCallback = (err: Error | null, rows?: unknown[]) => void;

// Mapa global de conexões in-memory (para compartilhar estado entre conexões)
const inMemoryDbs = new Map<string, BsDb>();

function getOrCreateDb(storage: string): BsDb {
  if (storage === ':memory:') {
    const existing = inMemoryDbs.get(':memory:');
    if (existing) return existing;
    const db = new BsDatabase(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    inMemoryDbs.set(':memory:', db);
    return db;
  }
  const db = new BsDatabase(storage);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function sanitizeParams(params: unknown): unknown {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(params)) {
      sanitized[key] = val;
      if (key.startsWith('$') || key.startsWith(':') || key.startsWith('@')) {
        sanitized[key.slice(1)] = val;
      }
    }
    return sanitized;
  }
  return params;
}

function normalizeArgs<T extends Function>(
  paramsOrCallback?: unknown,
  callback?: T
): { params: unknown; cb: T | undefined } {
  if (typeof paramsOrCallback === 'function') {
    return { params: [], cb: paramsOrCallback as T };
  }
  const rawParams = Array.isArray(paramsOrCallback)
    ? paramsOrCallback
    : paramsOrCallback !== undefined && paramsOrCallback !== null && typeof paramsOrCallback === 'object'
    ? sanitizeParams(paramsOrCallback)
    : [];
  return { params: rawParams, cb: callback };
}

class DatabaseShim {
  private db!: BsDb;

  constructor(storage: string, modeOrCallback?: unknown, callback?: ErrCallback) {
    const cb: ErrCallback | undefined =
      typeof modeOrCallback === 'function'
        ? (modeOrCallback as ErrCallback)
        : callback;

    try {
      this.db = getOrCreateDb(storage);
      if (cb) setImmediate(() => cb(null));
    } catch (err) {
      if (cb) setImmediate(() => cb(err as Error));
      else throw err;
    }
  }

  run(sql: string, paramsOrCallback?: unknown, callback?: ErrCallback): this {
    const { params, cb } = normalizeArgs<ErrCallback>(paramsOrCallback, callback);
    const callbackFn = cb ?? ((_err: Error | null) => { /* noop */ });

    setImmediate(() => {
      try {
        const stmt = this.db.prepare(sql);
        const result = Array.isArray(params) && params.length === 0
          ? stmt.run()
          : stmt.run(params as any);

        const ctx = { lastID: result.lastInsertRowid as number, changes: result.changes };
        (callbackFn as (this: { lastID: number; changes: number }, err: Error | null) => void)
          .call(ctx, null);
      } catch (err) {
        callbackFn(err as Error);
      }
    });
    return this;
  }

  get(sql: string, paramsOrCallback?: unknown, callback?: RowCallback): this {
    const { params, cb } = normalizeArgs<RowCallback>(paramsOrCallback, callback);
    const callbackFn = cb ?? ((_err: Error | null, _row?: unknown) => { /* noop */ });

    setImmediate(() => {
      try {
        const stmt = this.db.prepare(sql);
        if (!stmt.reader) {
          const result = Array.isArray(params) && params.length === 0
            ? stmt.run()
            : stmt.run(params as any);
          const ctx = { lastID: result.lastInsertRowid as number, changes: result.changes };
          (callbackFn as (this: { lastID: number; changes: number }, err: Error | null, row?: unknown) => void)
            .call(ctx, null, undefined);
        } else {
          const row = Array.isArray(params) && params.length === 0
            ? stmt.get()
            : stmt.get(params as any);
          callbackFn(null, row);
        }
      } catch (err) {
        callbackFn(err as Error);
      }
    });
    return this;
  }

  all(sql: string, paramsOrCallback?: unknown, callback?: RowsCallback): this {
    const { params, cb } = normalizeArgs<RowsCallback>(paramsOrCallback, callback);
    const callbackFn = cb ?? ((_err: Error | null, _rows?: unknown[]) => { /* noop */ });

    setImmediate(() => {
      try {
        const stmt = this.db.prepare(sql);
        if (!stmt.reader) {
          const result = Array.isArray(params) && params.length === 0
            ? stmt.run()
            : stmt.run(params as any);
          const ctx = { lastID: result.lastInsertRowid as number, changes: result.changes };
          (callbackFn as (this: { lastID: number; changes: number }, err: Error | null, rows?: unknown[]) => void)
            .call(ctx, null, []);
        } else {
          const rows = Array.isArray(params) && params.length === 0
            ? stmt.all()
            : stmt.all(params as any);
          callbackFn(null, rows);
        }
      } catch (err) {
        callbackFn(err as Error);
      }
    });
    return this;
  }

  serialize(callback: () => void): void {
    callback();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_key: string, _value: unknown): void {
    // Ignorado
  }

  close(callback?: ErrCallback): void {
    setImmediate(() => {
      try {
        callback?.(null);
      } catch (err) {
        callback?.(err as Error);
      }
    });
  }
}

/** Módulo substituto passado como dialectModule ao Sequelize. */
export const BetterSqliteShim = {
  Database: DatabaseShim,
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4,
  OPEN_FULLMUTEX: 0x10000,
  verbose: () => DatabaseShim,
};

/** Limpa cache de conexões in-memory (útil em testes). */
export function clearInMemoryCache(): void {
  inMemoryDbs.clear();
}
