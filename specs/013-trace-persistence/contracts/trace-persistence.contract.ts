import { z } from 'zod';

// ─── Contratos de Validação Zod para Trace e Requests ─────────────────────────

export const TraceEventKindSchema = z.enum([
  'thought',
  'action',
  'observation',
  'plan',
  'critique',
  'answer',
  'route',
  'fallback',
]);

export const ActionPayloadSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.unknown()),
});

export const TraceEventSchema = z.object({
  seq: z.number().int().positive().optional(),
  kind: TraceEventKindSchema,
  node: z.string().optional(),
  content: z.union([z.string(), ActionPayloadSchema]),
  timestampMs: z.number().int(),
  route: z.string().optional(),
  reason: z.string().optional(),
  fromModel: z.string().optional(),
  toModel: z.string().optional(),
  error: z.string().optional(),
});

export const RequestMetricsSchema = z.object({
  latencyMs: z.number().nonnegative().optional(),
  llmCalls: z.number().int().nonnegative().optional(),
  modelUsed: z.string().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export const RequestRecordSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  userId: z.string().optional(),
  message: z.string(),
  answer: z.string().optional(),
  statusCode: z.number().int(),
  metrics: RequestMetricsSchema,
  createdAt: z.string(),
});

export const GetRequestResponseSchema = z.object({
  request: RequestRecordSchema,
  trace: z.array(TraceEventSchema),
});

export const NotFoundErrorResponseSchema = z.object({
  error: z.literal('Request not found'),
  requestId: z.string(),
});

export const StructuredLogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  requestId: z.string().min(1),
  event: z.string().min(1),
  node: z.string().optional(),
  kind: z.string().optional(),
  seq: z.number().int().positive().optional(),
  durationMs: z.number().nonnegative().optional(),
  model: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
