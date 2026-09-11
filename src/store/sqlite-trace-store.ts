import type { DatabaseSync } from 'node:sqlite';
import type {
  TraceStore,
  RequestsStore,
  TraceEventsStore,
  RequestRecord,
  TraceEventRecord,
  SaveRequestInput,
  SaveTraceEventInput,
  RequestWithTrace,
  StatsResult,
  RouteStats,
  ModelStats,
} from './trace-store.js';
import type { TraceEvent } from '../agents/types.js';
import { sqliteStore } from './sqlite-ops-store.js';

export class SqliteRequestsStore implements RequestsStore {
  constructor(private readonly db: DatabaseSync) {}

  save(data: SaveRequestInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO requests (
        id, conversation_id, user_id, message, answer, route,
        status_code, status, latency_ms, llm_calls, model_used,
        prompt_tokens, completion_tokens, total_tokens
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        conversation_id = COALESCE(excluded.conversation_id, requests.conversation_id),
        user_id = COALESCE(excluded.user_id, requests.user_id),
        message = COALESCE(excluded.message, requests.message),
        answer = COALESCE(excluded.answer, requests.answer),
        route = COALESCE(excluded.route, requests.route),
        status_code = excluded.status_code,
        status = excluded.status,
        latency_ms = COALESCE(excluded.latency_ms, requests.latency_ms),
        llm_calls = COALESCE(excluded.llm_calls, requests.llm_calls),
        model_used = COALESCE(excluded.model_used, requests.model_used),
        prompt_tokens = COALESCE(excluded.prompt_tokens, requests.prompt_tokens),
        completion_tokens = COALESCE(excluded.completion_tokens, requests.completion_tokens),
        total_tokens = COALESCE(excluded.total_tokens, requests.total_tokens)
    `);

    const statusCode = data.statusCode ?? 200;
    const status = data.status ?? (statusCode >= 400 ? 'error' : 'ok');

    stmt.run(
      data.id,
      data.conversationId ?? null,
      data.userId ?? null,
      data.message ?? null,
      data.answer ?? null,
      data.route ?? null,
      statusCode,
      status,
      data.latencyMs ?? null,
      data.llmCalls ?? null,
      data.modelUsed ?? null,
      data.promptTokens ?? null,
      data.completionTokens ?? null,
      data.totalTokens ?? null
    );
  }

  getById(id: string): RequestRecord | null {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        conversation_id AS conversationId,
        user_id AS userId,
        message,
        answer,
        route,
        status_code AS statusCode,
        status,
        latency_ms AS latencyMs,
        llm_calls AS llmCalls,
        model_used AS modelUsed,
        prompt_tokens AS promptTokens,
        completion_tokens AS completionTokens,
        total_tokens AS totalTokens,
        created_at AS createdAt
      FROM requests
      WHERE id = ?
    `);

    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      conversationId: row.conversationId ? String(row.conversationId) : undefined,
      userId: row.userId ? String(row.userId) : undefined,
      message: row.message ? String(row.message) : undefined,
      answer: row.answer ? String(row.answer) : undefined,
      route: row.route ? String(row.route) : undefined,
      statusCode: Number(row.statusCode ?? 200),
      status: String(row.status ?? 'ok'),
      latencyMs: row.latencyMs !== null && row.latencyMs !== undefined ? Number(row.latencyMs) : undefined,
      llmCalls: row.llmCalls !== null && row.llmCalls !== undefined ? Number(row.llmCalls) : undefined,
      modelUsed: row.modelUsed ? String(row.modelUsed) : undefined,
      promptTokens: row.promptTokens !== null && row.promptTokens !== undefined ? Number(row.promptTokens) : undefined,
      completionTokens: row.completionTokens !== null && row.completionTokens !== undefined ? Number(row.completionTokens) : undefined,
      totalTokens: row.totalTokens !== null && row.totalTokens !== undefined ? Number(row.totalTokens) : undefined,
      createdAt: String(row.createdAt),
    };
  }
}

export class SqliteTraceEventsStore implements TraceEventsStore {
  constructor(private readonly db: DatabaseSync) {}

  save(data: SaveTraceEventInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO trace_events (
        request_id, seq, kind, type, node, payload, timestamp_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const kind = data.kind ?? data.type ?? 'thought';
    const type = data.type ?? data.kind ?? 'thought';
    const payloadStr =
      typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload);

    stmt.run(
      data.requestId,
      data.seq,
      kind,
      type,
      data.node ?? null,
      payloadStr,
      data.timestampMs ?? Date.now()
    );
  }

  listByRequestId(requestId: string): TraceEventRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        request_id AS requestId,
        seq,
        kind,
        type,
        node,
        payload,
        timestamp_ms AS timestampMs,
        created_at AS createdAt
      FROM trace_events
      WHERE request_id = ?
      ORDER BY seq ASC, id ASC
    `);

    const rows = stmt.all(requestId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      let parsedPayload: unknown = row.payload;
      if (typeof row.payload === 'string') {
        try {
          parsedPayload = JSON.parse(row.payload);
        } catch {
          parsedPayload = row.payload;
        }
      }

      return {
        id: Number(row.id),
        requestId: String(row.requestId),
        seq: Number(row.seq),
        kind: String(row.kind),
        type: row.type ? String(row.type) : undefined,
        node: row.node ? String(row.node) : undefined,
        payload: parsedPayload,
        timestampMs: Number(row.timestampMs),
        createdAt: String(row.createdAt),
      };
    });
  }
}

export class SqliteTraceStore implements TraceStore {
  private readonly _db: DatabaseSync;
  readonly requests: RequestsStore;
  readonly traceEvents: TraceEventsStore;

  constructor(db?: DatabaseSync) {
    this._db = db ?? sqliteStore.db;
    this._db.exec('PRAGMA foreign_keys = ON');
    this.createTables();
    this.requests = new SqliteRequestsStore(this._db);
    this.traceEvents = new SqliteTraceEventsStore(this._db);
  }

  get db(): DatabaseSync {
    return this._db;
  }

  private createTables(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        user_id TEXT,
        message TEXT,
        answer TEXT,
        route TEXT,
        status_code INTEGER NOT NULL DEFAULT 200,
        status TEXT NOT NULL DEFAULT 'ok',
        latency_ms INTEGER,
        llm_calls INTEGER,
        model_used TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trace_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        type TEXT,
        node TEXT,
        payload TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_trace_events_request_seq
        ON trace_events(request_id, seq ASC);
    `);
  }

  saveRequest(
    record: SaveRequestInput,
    trace?: TraceEvent[] | SaveTraceEventInput[]
  ): void {
    this.requests.save(record);

    if (trace && trace.length > 0) {
      for (let i = 0; i < trace.length; i++) {
        const item = trace[i];
        if ('requestId' in item && typeof item.requestId === 'string') {
          this.traceEvents.save(item as SaveTraceEventInput);
        } else {
          const te = item as TraceEvent;
          this.traceEvents.save({
            requestId: record.id,
            seq: i + 1,
            node: te.node,
            kind: te.kind,
            type: te.type ?? te.kind,
            payload: te.content,
            timestampMs: te.timestampMs,
          });
        }
      }
    }
  }

  getRequest(id: string): RequestWithTrace | null {
    const request = this.requests.getById(id);
    if (!request) {
      return null;
    }

    const trace = this.traceEvents.listByRequestId(id);
    return {
      request,
      trace,
    };
  }

  getStats(sinceISO: string): StatsResult {
    // ── Totais globais ──────────────────────────────────────────────────────
    const globalRow = this._db.prepare(`
      SELECT
        COUNT(*)                                        AS total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS totalTokens,
        COALESCE(CAST(AVG(latency_ms) AS INTEGER), 0)   AS avgLatencyMs
      FROM requests
      WHERE created_at >= ?
    `).get(sinceISO) as Record<string, unknown>;

    const total = Number(globalRow.total ?? 0);
    const errors = Number(globalRow.errors ?? 0);
    const totalTokens = Number(globalRow.totalTokens ?? 0);
    const avgLatencyMs = Number(globalRow.avgLatencyMs ?? 0);
    const errorRate = total > 0 ? Math.round((errors / total) * 10000) / 100 : 0;

    // ── Percentis globais (p50 / p95) ───────────────────────────────────────
    const latencies = (this._db.prepare(`
      SELECT latency_ms AS v
      FROM requests
      WHERE created_at >= ? AND latency_ms IS NOT NULL
      ORDER BY latency_ms ASC
    `).all(sinceISO) as Array<{ v: number }>).map(r => Number(r.v));

    const p50LatencyMs = percentile(latencies, 50);
    const p95LatencyMs = percentile(latencies, 95);

    // ── Custo estimado (modelos :free = $0) ─────────────────────────────────
    // Para modelos pagos usa estimativa genérica: $0.001 / 1k tokens
    const costRows = this._db.prepare(`
      SELECT
        model_used AS model,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS tokens
      FROM requests
      WHERE created_at >= ?
      GROUP BY model_used
    `).all(sinceISO) as Array<{ model: string | null; tokens: number }>;

    let estimatedCost = 0;
    for (const r of costRows) {
      const isFree = !r.model || r.model.includes(':free');
      if (!isFree) {
        estimatedCost += (Number(r.tokens) / 1000) * 0.001;
      }
    }
    estimatedCost = Math.round(estimatedCost * 1_000_000) / 1_000_000;

    // ── Breakdown por rota ──────────────────────────────────────────────────
    const routeRows = this._db.prepare(`
      SELECT
        COALESCE(route, 'unknown')                       AS route,
        COUNT(*)                                         AS total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS totalTokens,
        COALESCE(CAST(AVG(latency_ms) AS INTEGER), 0)    AS avgLatencyMs
      FROM requests
      WHERE created_at >= ?
      GROUP BY route
      ORDER BY total DESC
    `).all(sinceISO) as Array<Record<string, unknown>>;

    const byRoute: RouteStats[] = routeRows.map(row => {
      const routeName = String(row.route ?? 'unknown');
      const routeLatencies = (this._db.prepare(`
        SELECT latency_ms AS v
        FROM requests
        WHERE created_at >= ? AND COALESCE(route, 'unknown') = ? AND latency_ms IS NOT NULL
        ORDER BY latency_ms ASC
      `).all(sinceISO, routeName) as Array<{ v: number }>).map(r => Number(r.v));

      return {
        route: routeName,
        total: Number(row.total ?? 0),
        errors: Number(row.errors ?? 0),
        totalTokens: Number(row.totalTokens ?? 0),
        avgLatencyMs: Number(row.avgLatencyMs ?? 0),
        p50LatencyMs: percentile(routeLatencies, 50),
        p95LatencyMs: percentile(routeLatencies, 95),
      };
    });

    // ── Breakdown por modelo ────────────────────────────────────────────────
    const modelRows = this._db.prepare(`
      SELECT
        COALESCE(model_used, 'unknown')                  AS model,
        COUNT(*)                                         AS total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS totalTokens,
        COALESCE(CAST(AVG(latency_ms) AS INTEGER), 0)    AS avgLatencyMs
      FROM requests
      WHERE created_at >= ?
      GROUP BY model_used
      ORDER BY total DESC
    `).all(sinceISO) as Array<Record<string, unknown>>;

    const byModel: ModelStats[] = modelRows.map(row => ({
      model: String(row.model ?? 'unknown'),
      total: Number(row.total ?? 0),
      errors: Number(row.errors ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
      avgLatencyMs: Number(row.avgLatencyMs ?? 0),
    }));

    return {
      since: sinceISO,
      total,
      errors,
      errorRate,
      totalTokens,
      estimatedCost,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      byRoute,
      byModel,
    };
  }
}

/** Calcula percentil de um array já ordenado em ordem crescente. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export const sqliteTraceStore = new SqliteTraceStore();
