import { z } from 'zod';

// ─── Schema de Validação de Configuração de Orçamento ─────────────────────────

export const contextBudgetConfigSchema = z.object({
  summary: z
    .number()
    .int()
    .nonnegative()
    .default(200)
    .describe('Teto de tokens para o resumo consolidado'),
  history: z
    .number()
    .int()
    .nonnegative()
    .default(1200)
    .describe('Teto de tokens para a janela de mensagens de histórico'),
  memories: z
    .number()
    .int()
    .nonnegative()
    .default(300)
    .describe('Teto de tokens para o bloco de memórias semânticas'),
});

export type ContextBudgetConfig = z.infer<typeof contextBudgetConfigSchema>;

// ─── Schema de Item de Memória e Histórico ─────────────────────────────────────

export const contextMemoryItemSchema = z.object({
  fact: z.string().min(1),
  score: z.number().optional().default(0),
});

export type ContextMemoryItem = z.input<typeof contextMemoryItemSchema>;

export const contextMessageItemSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export type ContextMessageItem = z.infer<typeof contextMessageItemSchema>;

// ─── Schema de Discriminação de Tokens e Diagnóstico de Poda ───────────────────

export const contextBreakdownSchema = z.object({
  userMessage: z.number().int().nonnegative(),
  history: z.number().int().nonnegative(),
  memories: z.number().int().nonnegative(),
  summary: z.number().int().nonnegative(),
  totalEstimated: z.number().int().nonnegative(),
});

export type ContextBreakdown = z.infer<typeof contextBreakdownSchema>;

export const contextBudgetStatsSchema = z.object({
  originalHistoryCount: z.number().int().nonnegative(),
  includedHistoryCount: z.number().int().nonnegative(),
  prunedHistoryCount: z.number().int().nonnegative(),

  originalMemoriesCount: z.number().int().nonnegative(),
  includedMemoriesCount: z.number().int().nonnegative(),
  prunedMemoriesCount: z.number().int().nonnegative(),

  summaryTruncated: z.boolean(),
});

export type ContextBudgetStats = z.infer<typeof contextBudgetStatsSchema>;

// ─── Schema de Saída Consolidada do ContextBuilder ────────────────────────────

export const builtContextSchema = z.object({
  systemPrompt: z.string().optional(),
  userMessage: z.string(),
  summary: z.string().nullable(),
  history: z.array(contextMessageItemSchema),
  memories: z.array(contextMemoryItemSchema),
  messages: z.array(contextMessageItemSchema),
  promptMessage: z.string(),
  breakdown: contextBreakdownSchema,
  stats: contextBudgetStatsSchema,
});

export type BuiltContext = z.infer<typeof builtContextSchema>;

// ─── Schema de Entrada do ContextBuilder ──────────────────────────────────────

export const contextBuilderInputSchema = z.object({
  systemPrompt: z.string().optional(),
  message: z.string().min(1),
  history: z.array(contextMessageItemSchema).optional().default([]),
  memories: z.array(contextMemoryItemSchema).optional().default([]),
  summary: z.string().nullable().optional(),
  budget: contextBudgetConfigSchema.partial().optional(),
});

export type ContextBuilderInput = z.input<typeof contextBuilderInputSchema>;

// ─── Interface do Builder ─────────────────────────────────────────────────────

export interface IContextBuilder {
  /**
   * Constrói o contexto orçado a partir dos dados brutos fornecidos.
   * Aplica poda FIFO em histórico, corte por menor score em memórias e truncamento em resumo.
   */
  build(input: ContextBuilderInput): BuiltContext;

  /**
   * Retorna os limites de orçamento configurados no builder.
   */
  getBudget(): ContextBudgetConfig;
}
