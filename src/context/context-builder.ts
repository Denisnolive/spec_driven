import { z } from 'zod';
import { estimateTokens, calculateContextBreakdown, type ContextBreakdown } from './tokens.js';

// ─── Schemas Zod de Validação de Fronteira ────────────────────────────────────

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

export const builtContextSchema = z.object({
  systemPrompt: z.string().optional(),
  userMessage: z.string(),
  summary: z.string().nullable(),
  history: z.array(contextMessageItemSchema),
  memories: z.array(contextMemoryItemSchema),
  messages: z.array(contextMessageItemSchema),
  promptMessage: z.string(),
  breakdown: z.object({
    userMessage: z.number(),
    history: z.number(),
    memories: z.number(),
    summary: z.number(),
    totalEstimated: z.number(),
  }),
  stats: contextBudgetStatsSchema,
});

export type BuiltContext = {
  systemPrompt?: string;
  userMessage: string;
  summary: string | null;
  history: ContextMessageItem[];
  memories: ContextMemoryItem[];
  messages: ContextMessageItem[];
  promptMessage: string;
  breakdown: ContextBreakdown;
  stats: ContextBudgetStats;
};

export const contextBuilderInputSchema = z.object({
  systemPrompt: z.string().optional(),
  message: z.string().min(1),
  history: z.array(contextMessageItemSchema).optional().default([]),
  memories: z.array(contextMemoryItemSchema).optional().default([]),
  summary: z.string().nullable().optional(),
  budget: contextBudgetConfigSchema.partial().optional(),
});

export type ContextBuilderInput = z.input<typeof contextBuilderInputSchema>;

// ─── Resolução de Configuração de Orçamento ───────────────────────────────────

const DEFAULT_BUDGET: ContextBudgetConfig = {
  summary: 200,
  history: 1200,
  memories: 300,
};

/**
 * Resolve a configuração de orçamento lendo variáveis de ambiente e mesclando overrides.
 * Variáveis suportadas:
 * - CONTEXT_BUDGET_SUMMARY (padrão: 200)
 * - CONTEXT_BUDGET_WINDOW ou CONTEXT_BUDGET_HISTORY (padrão: 1200)
 * - CONTEXT_BUDGET_MEMORIES (padrão: 300)
 */
export function resolveBudgetConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<ContextBudgetConfig>
): ContextBudgetConfig {
  const envSummaryStr = env.CONTEXT_BUDGET_SUMMARY ?? env.CONTEXT_BUDGET_SUMARY;
  const envSummary = envSummaryStr
    ? parseInt(envSummaryStr, 10)
    : undefined;

  const envWindow = env.CONTEXT_BUDGET_WINDOW ?? env.CONTEXT_BUDGET_HISTORY;
  const envHistory = envWindow ? parseInt(envWindow, 10) : undefined;

  const envMemories = env.CONTEXT_BUDGET_MEMORIES
    ? parseInt(env.CONTEXT_BUDGET_MEMORIES, 10)
    : undefined;

  const resolved: ContextBudgetConfig = {
    summary:
      overrides?.summary ??
      (envSummary !== undefined && !Number.isNaN(envSummary) && envSummary >= 0
        ? envSummary
        : DEFAULT_BUDGET.summary),
    history:
      overrides?.history ??
      (envHistory !== undefined && !Number.isNaN(envHistory) && envHistory >= 0
        ? envHistory
        : DEFAULT_BUDGET.history),
    memories:
      overrides?.memories ??
      (envMemories !== undefined && !Number.isNaN(envMemories) && envMemories >= 0
        ? envMemories
        : DEFAULT_BUDGET.memories),
  };

  return resolved;
}

// ─── Modelo Funcional Orientado a Seções ──────────────────────────────────────

export type SectionCutPolicy = 'never' | 'oldest-first' | 'lowest-score-first' | 'truncate';

export interface ContextSection<T = unknown> {
  name: 'system' | 'summary' | 'history' | 'memories' | 'message';
  data: T;
  options: {
    budget?: number;
    cut: SectionCutPolicy;
  };
}

export interface FittedSection<T = unknown> {
  name: ContextSection['name'];
  data: T;
  originalCount?: number;
  includedCount?: number;
  prunedCount?: number;
  truncated?: boolean;
}

/**
 * Cria uma seção declarativa de contexto com orçamento e política de corte.
 */
export function section<T>(
  name: ContextSection['name'],
  data: T,
  options: { budget?: number; cut: SectionCutPolicy }
): ContextSection<T> {
  return { name, data, options };
}

/**
 * Ajusta uma seção ao seu orçamento de tokens de acordo com sua política de poda.
 */
export function fitToBudget(sec: ContextSection): FittedSection {
  const { name, data, options } = sec;
  const budget = options.budget ?? Infinity;

  switch (options.cut) {
    case 'never':
      return {
        name,
        data,
        originalCount: Array.isArray(data) ? data.length : 1,
        includedCount: Array.isArray(data) ? data.length : 1,
        prunedCount: 0,
        truncated: false,
      };

    case 'truncate': {
      // Política para resumo textual
      const text = typeof data === 'string' ? data.trim() : null;
      if (!text) {
        return { name, data: null, truncated: false };
      }

      const currentTokens = estimateTokens(text);
      if (currentTokens <= budget) {
        return { name, data: text, truncated: false };
      }

      // Truncamento seguro: cada token equivale a aprox 4 caracteres
      const maxChars = Math.max(0, budget * 4);
      if (maxChars <= 3) {
        return { name, data: '', truncated: true };
      }

      const truncatedText = text.slice(0, maxChars - 3).trimEnd() + '...';
      return { name, data: truncatedText, truncated: true };
    }

    case 'oldest-first': {
      // Poda FIFO de histórico de mensagens: mais recentes preservadas
      const history = (Array.isArray(data) ? data : []) as ContextMessageItem[];
      const originalCount = history.length;

      let accumulatedTokens = 0;
      const kept: ContextMessageItem[] = [];

      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const tokens = estimateTokens(`${item.role}: ${item.content}`);
        if (accumulatedTokens + tokens <= budget) {
          accumulatedTokens += tokens;
          kept.unshift(item); // Preserva a ordem cronológica original
        } else {
          // Descarte das mais antigas
          break;
        }
      }

      return {
        name,
        data: kept,
        originalCount,
        includedCount: kept.length,
        prunedCount: originalCount - kept.length,
      };
    }

    case 'lowest-score-first': {
      // Poda de memórias por menor relevância
      const memories = (Array.isArray(data) ? data : []) as ContextMemoryItem[];
      const originalCount = memories.length;

      if (memories.length === 0 || budget <= 0) {
        return {
          name,
          data: [],
          originalCount,
          includedCount: 0,
          prunedCount: originalCount,
        };
      }

      // Ordena por score decrescente (maior score primeiro)
      const sorted = [...memories].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      const headerTokens = estimateTokens('[Memórias do Usuário]\n');
      let accumulatedTokens = headerTokens;
      const kept: ContextMemoryItem[] = [];

      for (const mem of sorted) {
        const itemTokens = estimateTokens(`- ${mem.fact}`);
        if (accumulatedTokens + itemTokens <= budget) {
          accumulatedTokens += itemTokens;
          kept.push(mem);
        } else {
          // Excedeu orçamento de memórias
          break;
        }
      }

      return {
        name,
        data: kept,
        originalCount,
        includedCount: kept.length,
        prunedCount: originalCount - kept.length,
      };
    }
  }
}

/**
 * Monta o BuiltContext consolidando as seções já ajustadas ao orçamento.
 */
export function assemble(
  fittedSections: FittedSection[],
  userMessage: string,
  systemPrompt?: string
): BuiltContext {
  let summary: string | null = null;
  let summaryTruncated = false;
  let history: ContextMessageItem[] = [];
  let memories: ContextMemoryItem[] = [];

  let originalHistoryCount = 0;
  let includedHistoryCount = 0;
  let prunedHistoryCount = 0;

  let originalMemoriesCount = 0;
  let includedMemoriesCount = 0;
  let prunedMemoriesCount = 0;

  for (const s of fittedSections) {
    if (s.name === 'summary') {
      summary = (s.data as string) ?? null;
      summaryTruncated = Boolean(s.truncated);
    } else if (s.name === 'history') {
      history = (s.data as ContextMessageItem[]) ?? [];
      originalHistoryCount = s.originalCount ?? history.length;
      includedHistoryCount = s.includedCount ?? history.length;
      prunedHistoryCount = s.prunedCount ?? 0;
    } else if (s.name === 'memories') {
      memories = (s.data as ContextMemoryItem[]) ?? [];
      originalMemoriesCount = s.originalCount ?? memories.length;
      includedMemoriesCount = s.includedCount ?? memories.length;
      prunedMemoriesCount = s.prunedCount ?? 0;
    }
  }

  // 1. Montagem dos blocos textuais para compatibilidade (promptMessage)
  const contextBlocks: string[] = [];
  if (summary) {
    contextBlocks.push(`[Resumo da Conversa Anterior]\n${summary}`);
  }
  if (memories.length > 0) {
    const memoryContext = memories.map((m) => `- ${m.fact}`).join('\n');
    contextBlocks.push(`[Memórias do Usuário]\n${memoryContext}`);
  }

  const promptMessage =
    contextBlocks.length > 0
      ? `${contextBlocks.join('\n\n')}\n\n${userMessage}`
      : userMessage;

  // 2. Montagem da lista de mensagens estruturadas para provedores LLM
  const messages: ContextMessageItem[] = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const h of history) {
    messages.push(h);
  }
  messages.push({ role: 'user', content: userMessage });

  // 3. Discriminação de tokens (breakdown)
  const breakdown = calculateContextBreakdown({
    userMessage,
    history,
    memories,
    summary,
  });

  // 4. Estatísticas de poda
  const stats: ContextBudgetStats = {
    originalHistoryCount,
    includedHistoryCount,
    prunedHistoryCount,
    originalMemoriesCount,
    includedMemoriesCount,
    prunedMemoriesCount,
    summaryTruncated,
  };

  return {
    systemPrompt: systemPrompt && systemPrompt.trim().length > 0 ? systemPrompt : undefined,
    userMessage,
    summary,
    history,
    memories,
    messages,
    promptMessage,
    breakdown,
    stats,
  };
}

// ─── Interface e Implementação da Classe ContextBuilder ───────────────────────

export interface IContextBuilder {
  build(input: ContextBuilderInput): BuiltContext;
  getBudget(): ContextBudgetConfig;
}

export interface ContextBuilderOptions {
  env?: NodeJS.ProcessEnv;
  budget?: Partial<ContextBudgetConfig>;
}

export class ContextBuilder implements IContextBuilder {
  private readonly budget: ContextBudgetConfig;

  constructor(options: ContextBuilderOptions = {}) {
    this.budget = resolveBudgetConfig(options.env ?? process.env, options.budget);
  }

  getBudget(): ContextBudgetConfig {
    return { ...this.budget };
  }

  build(input: ContextBuilderInput): BuiltContext {
    const validated = contextBuilderInputSchema.parse(input);

    const activeBudget: ContextBudgetConfig = {
      summary: validated.budget?.summary ?? this.budget.summary,
      history: validated.budget?.history ?? this.budget.history,
      memories: validated.budget?.memories ?? this.budget.memories,
    };

    const sections: ContextSection[] = [
      section('system', validated.systemPrompt, {
        cut: 'never',
      }),
      section('summary', validated.summary, {
        budget: activeBudget.summary,
        cut: 'truncate',
      }),
      section('history', validated.history, {
        budget: activeBudget.history,
        cut: 'oldest-first',
      }),
      section('memories', validated.memories, {
        budget: activeBudget.memories,
        cut: 'lowest-score-first',
      }),
      section('message', validated.message, {
        cut: 'never',
      }),
    ];

    const fitted = sections.map(fitToBudget);
    return assemble(fitted, validated.message, validated.systemPrompt);
  }
}

/**
 * Função de conveniência para montagem rápida de contexto orçado sem gerenciar instância.
 */
export function buildContext(
  input: ContextBuilderInput,
  options: ContextBuilderOptions = {}
): BuiltContext {
  const builder = new ContextBuilder(options);
  return builder.build(input);
}
