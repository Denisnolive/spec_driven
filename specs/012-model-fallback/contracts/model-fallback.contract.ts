import { z } from 'zod';

// ─── Schema de Evento Fallback de Trace ───────────────────────────────────────

export const FallbackTraceEventSchema = z.object({
  kind: z.literal('fallback'),
  type: z.literal('fallback').optional(),
  content: z.string().min(1),
  timestampMs: z.number().int().positive(),
  node: z.string().min(1),
  fromModel: z.string().min(1),
  toModel: z.string().min(1),
  error: z.string().optional(),
});

export type FallbackTraceEvent = z.infer<typeof FallbackTraceEventSchema>;

// ─── Schema de Métricas com Modelo Utilizado ─────────────────────────────────

export const ModelResilienceMetricsSchema = z.object({
  modelUsed: z.string().min(1).optional(),
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
});

export type ModelResilienceMetrics = z.infer<typeof ModelResilienceMetricsSchema>;

// ─── Schema de Resposta de Erro 503 ──────────────────────────────────────────

export const ServiceUnavailableErrorResponseSchema = z.object({
  error: z.literal('Service Unavailable'),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ServiceUnavailableErrorResponse = z.infer<typeof ServiceUnavailableErrorResponseSchema>;

// ─── Classe Canônica de Erro de Indisponibilidade de Modelos ──────────────────

export class ModelUnavailableError extends Error {
  readonly statusCode = 503;
  readonly primaryModel?: string;
  readonly fallbackModel?: string;

  constructor(message: string, options?: { primaryModel?: string; fallbackModel?: string; cause?: unknown }) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.primaryModel = options?.primaryModel;
    this.fallbackModel = options?.fallbackModel;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
