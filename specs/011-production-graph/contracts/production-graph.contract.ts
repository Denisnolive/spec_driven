import { z } from 'zod';
import type { ContextBreakdown } from '../../../src/context/tokens.js';
import type { BuiltContext, ContextBudgetStats } from '../../../src/context/context-builder.js';

// ─── Schema de Saída do Roteador ──────────────────────────────────────────────

export const routerStrategyEnum = z.enum(['react', 'plan-and-execute', 'reflection']);
export type RouterStrategy = z.infer<typeof routerStrategyEnum>;

export const routerOutputSchema = z.object({
  route: routerStrategyEnum.describe('A estratégia de raciocínio selecionada'),
  reason: z.string().min(1).describe('A justificativa operacional para a escolha da rota'),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

// ─── Schema de Evento de Trace Estendido ──────────────────────────────────────

export const traceEventKindSchema = z.enum([
  'thought',
  'action',
  'observation',
  'plan',
  'critique',
  'answer',
  'route', // Novo evento exigido para decisões de roteamento
]);

export type TraceEventKind = z.infer<typeof traceEventKindSchema>;

export const traceEventContractSchema = z.object({
  kind: traceEventKindSchema,
  content: z.union([z.string(), z.record(z.string(), z.unknown())]),
  timestampMs: z.number().int().nonnegative(),
  node: z.string().min(1).describe('Identificador canônico do nó que gerou o evento'),
});

export type TraceEventContract = z.infer<typeof traceEventContractSchema>;

// ─── Schema de Entrada do Grafo de Produção ───────────────────────────────────

export const productionGraphInputSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().uuid().optional(),
  userId: z.string().trim().min(1).optional(),
  strategyOverride: routerStrategyEnum.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional(),
  builtContext: z.custom<BuiltContext>().optional(),
});

export type ProductionGraphInput = z.infer<typeof productionGraphInputSchema>;

// ─── Schema do Contrato de Execução e Saída do Grafo ──────────────────────────

export const productionGraphResultSchema = z.object({
  answer: z.string(),
  route: routerStrategyEnum,
  routeReason: z.string(),
  isOverride: z.boolean(),
  trace: z.array(traceEventContractSchema),
  metrics: z.object({
    llmCalls: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    historyMessages: z.number().int().nonnegative().optional(),
    recalledMemories: z.number().int().nonnegative().optional(),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    contextBreakdown: z.custom<ContextBreakdown>().optional(),
    contextBudgetStats: z.custom<ContextBudgetStats>().optional(),
  }),
});

export type ProductionGraphResult = z.infer<typeof productionGraphResultSchema>;
