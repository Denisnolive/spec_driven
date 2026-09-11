// ─── Trace Event Types ──────────────────────────────────────────────────────

export type TraceEventKind =
  | 'thought'
  | 'action'
  | 'observation'
  | 'plan'
  | 'critique'
  | 'answer'
  | 'route'
  | 'fallback'
  | 'handoff';

/** Payload exclusivo para eventos do kind 'action' */
export interface ActionPayload {
  tool: string;
  args: Record<string, unknown>;
}

/** Um evento tipado no trace de raciocínio */
export interface TraceEvent {
  kind: TraceEventKind;
  /** Alias opcional para compatibilidade (ex: type: 'route', type: 'handoff') */
  type?: string;
  /** String para thought/observation/plan/critique/answer/route/fallback/handoff; ActionPayload para action */
  content: string | ActionPayload;
  timestampMs: number;
  /** Identificador canônico do nó do grafo que emitiu o evento */
  node?: string;
  /** Estratégia de rota selecionada (para eventos de roteamento) */
  route?: string;
  /** Motivo da escolha da rota (para eventos de roteamento) */
  reason?: string;
  /** Modelo de origem que falhou (para eventos de fallback) */
  fromModel?: string;
  /** Modelo de destino acionado (para eventos de fallback) */
  toModel?: string;
  /** Detalhe do erro que disparou o fallback */
  error?: string;
  /** Origem do handoff (ex: 'supervisor', 'analista') */
  from?: string;
  /** Destino do handoff (ex: 'analista', 'planejador', 'executor', 'done') */
  to?: string;
  /** Instrução ou síntese do handoff */
  brief?: string;
  /** Contagem de turno/iteração da equipe */
  iteration?: number;
}


// ─── Entrada da Estratégia ───────────────────────────────────────────────────

import type { ContextBreakdown } from '../context/tokens.js';
import type { BuiltContext, ContextBudgetStats } from '../context/context-builder.js';

/** Entrada estruturada para strategy.run(), incluindo histórico de conversa opcional. */
export interface StrategyInput {
  message: string;
  history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  builtContext?: BuiltContext;
}

/** Normaliza string ou StrategyInput para o formato estruturado. */
export function normalizeInput(input: string | StrategyInput): StrategyInput {
  return typeof input === 'string' ? { message: input } : input;
}

export interface Metrics {
  llmCalls: number;
  latencyMs: number;
  /** Identificador do modelo de linguagem utilizado para atender a resposta. */
  modelUsed?: string;
  /** Quantidade de mensagens de histórico injetadas no prompt. */
  historyMessages?: number;
  /** Quantidade de memórias semânticas injetadas no prompt. */
  recalledMemories?: number;
  /** Quantidade real de tokens do prompt consumidos pelo LLM. */
  promptTokens?: number;
  /** Quantidade de tokens de saída gerados pelo LLM. */
  completionTokens?: number;
  /** Total consolidado de tokens consumidos. */
  totalTokens?: number;
  /** Detalhamento da contagem estimada de tokens por fonte. */
  contextBreakdown?: ContextBreakdown;
  /** Estatísticas de poda do ContextBuilder. */
  contextBudgetStats?: ContextBudgetStats;
}

// ─── Resultado de uma estratégia ─────────────────────────────────────────────

export interface StrategyResult {
  answer: string;
  trace: TraceEvent[];
  metrics: Metrics;
}

// ─── Interface comum de estratégia ───────────────────────────────────────────

export interface ReasoningStrategy {
  readonly name: string;
  run(input: string | StrategyInput): Promise<StrategyResult>;
}

