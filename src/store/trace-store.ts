import type { TraceEvent, Metrics } from '../agents/types.js';

// ─── Interfaces de Registro de Requisições e Trace ─────────────────────────────

export interface RequestRecord {
  id: string;
  conversationId?: string;
  userId?: string;
  message?: string;
  answer?: string;
  route?: string;
  statusCode: number;
  status: string;
  latencyMs?: number;
  llmCalls?: number;
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt?: string;
}

export interface TraceEventRecord {
  id?: number;
  requestId: string;
  seq: number;
  kind: string;
  type?: string;
  node?: string;
  payload: unknown;
  timestampMs: number;
  createdAt?: string;
}

export interface RequestWithTrace {
  request: RequestRecord;
  trace: TraceEventRecord[];
}

export interface SaveRequestInput {
  id: string;
  conversationId?: string;
  userId?: string;
  message?: string;
  answer?: string;
  route?: string;
  statusCode?: number;
  status?: string;
  latencyMs?: number;
  llmCalls?: number;
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface SaveTraceEventInput {
  requestId: string;
  seq: number;
  node?: string;
  type?: string;
  kind?: string;
  payload: unknown;
  timestampMs?: number;
}

export interface RequestsStore {
  save(data: SaveRequestInput): void;
  getById(id: string): RequestRecord | null;
}

export interface TraceEventsStore {
  save(data: SaveTraceEventInput): void;
  listByRequestId(requestId: string): TraceEventRecord[];
}

// ─── Tipos de Estatísticas ──────────────────────────────────────────────────

export interface RouteStats {
  route: string;
  total: number;
  errors: number;
  totalTokens: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
}

export interface ModelStats {
  model: string;
  total: number;
  errors: number;
  totalTokens: number;
  avgLatencyMs: number;
}

export interface StatsResult {
  since: string;
  total: number;
  errors: number;
  errorRate: number;
  totalTokens: number;
  estimatedCost: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  byRoute: RouteStats[];
  byModel: ModelStats[];
}

export interface TraceStore {
  readonly requests: RequestsStore;
  readonly traceEvents: TraceEventsStore;
  saveRequest(record: SaveRequestInput, trace?: TraceEvent[] | SaveTraceEventInput[]): void;
  getRequest(id: string): RequestWithTrace | null;
  getStats(sinceISO: string): StatsResult;
}
