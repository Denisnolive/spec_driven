import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import { createModel, getModelContext } from '../agents/model.js';
import { ReActStrategy } from '../agents/react.js';
import { PlanAndExecuteStrategy } from '../agents/plan-and-execute.js';
import { ReflectionStrategy } from '../agents/reflection.js';
import type { ReasoningStrategy, StrategyResult, TraceEvent, Metrics, StrategyInput } from '../agents/types.js';
import { ContextBuilder, type BuiltContext } from '../context/context-builder.js';
import type { ConversationStore } from '../store/conversation-store.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { TraceStore } from '../store/trace-store.js';
import { log, type StructuredLogger } from '../obs/logger.js';

// ─── Tabela de Critérios e Prompt do Roteador ────────────────────────────────

export const SYSTEM_PROMPT = `Você é um roteador operacional do assistente OpsPilot.
Sua responsabilidade é avaliar a mensagem do usuário e selecionar a estratégia de raciocínio ideal.

Avalie o pedido estritamente com base na seguinte tabela de critérios:

| Estratégia | Quando Usar | Critérios e Exemplos |
|---|---|---|
| react | Tarefas diretas, perguntas simples, inspeção pontual de status de serviço ou listagem de alertas. Baixa latência e poucas ferramentas. | "Qual o status do auth?", "Liste os alertas ativos", "Quais serviços estão instáveis?" |
| planExecute | Tarefas complexas com múltiplos passos dependentes, triagem encadeada, consultas a runbooks seguidas de abertura de incidentes. | "Verifique o gateway, consulte seu runbook e abra incidente se instável", "Audite os serviços e planeje ações" |
| reflect | Análises críticas de causa raiz (RCA), auditorias de fidelidade factual, validação estrita de evidências operacionais contra alucinações. | "Faça uma análise crítica das causas da lentidão no banco", "Valide se a evidência sustenta essa conclusão" |

Retorne a rota selecionada ("react", "planExecute" ou "reflect") e uma frase justificando a escolha.`;

// ─── Schema de Roteamento ─────────────────────────────────────────────────────

export const routeSchema = z.object({
  route: z.enum(['react', 'planExecute', 'reflect']),
  reason: z.string().describe('uma frase justificando a escolha'),
});

export type RouteVerdict = z.infer<typeof routeSchema>;

export interface StructuredRouterModel {
  withStructuredOutput(schema: typeof routeSchema): {
    invoke(input: unknown): Promise<RouteVerdict>;
  };
}

// ─── Anotação de Estado do Grafo ──────────────────────────────────────────────

export const GraphState = Annotation.Root({
  /** Entrada textual original (suporta input ou message) */
  input: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  message: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  requestId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  userId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  conversationId: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  history: Annotation<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  strategy: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  strategyOverride: Annotation<string | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  builtContext: Annotation<BuiltContext | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  route: Annotation<'react' | 'planExecute' | 'reflect'>({
    reducer: (_, b) => b,
    default: () => 'react',
  }),
  reason: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  isOverride: Annotation<boolean>({
    reducer: (_, b) => b,
    default: () => false,
  }),
  answer: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  metrics: Annotation<Metrics>({
    reducer: (a, b) => ({
      ...a,
      ...b,
    }),
    default: () => ({ llmCalls: 0, latencyMs: 0 }),
  }),
});


export type ProductionGraphState = typeof GraphState.State;

// ─── Normalizador de Estratégia / Override ────────────────────────────────────

export function normalizeRoute(raw?: string): 'react' | 'planExecute' | 'reflect' | undefined {
  if (!raw) return undefined;
  const val = raw.trim().toLowerCase();
  if (val === 'react') return 'react';
  if (val === 'planexecute' || val === 'plan-and-execute') return 'planExecute';
  if (val === 'reflect' || val === 'reflection') return 'reflect';
  return undefined;
}

// ─── Opções de Configuração do Grafo ──────────────────────────────────────────

export interface ProductionGraphOptions {
  model?: StructuredRouterModel;
  contextBuilder?: ContextBuilder;
  conversationStore?: ConversationStore;
  memoryStore?: MemoryStore;
  traceStore?: TraceStore;
  logger?: StructuredLogger;
  reactStrategy?: ReasoningStrategy;
  planExecuteStrategy?: ReasoningStrategy;
  reflectStrategy?: ReasoningStrategy;
}

// ─── Factory do Grafo Unificado ───────────────────────────────────────────────

export function createProductionGraph(options: ProductionGraphOptions = {}) {
  const contextBuilder = options.contextBuilder ?? new ContextBuilder();
  const routerModel = options.model;
  const reactStrategy = options.reactStrategy ?? new ReActStrategy();
  const planExecuteStrategy = options.planExecuteStrategy ?? new PlanAndExecuteStrategy();
  const reflectStrategy =
    options.reflectStrategy ?? new ReflectionStrategy(new ReActStrategy());
  const traceStore = options.traceStore;
  const logger = options.logger ?? log;

  // ── Nó 1: Contexto ──────────────────────────────────────────────────────────
  async function contextNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const rawMessage = state.message || state.input;
    const history = state.history ?? [];

    let recalledMemoriesList: Array<{ fact: string; score?: number }> = [];
    if (state.userId && options.memoryStore) {
      try {
        const recalled = await options.memoryStore.recall(state.userId, rawMessage, 3);
        recalledMemoriesList = recalled;
      } catch (err) {
        console.error('Erro ao buscar memórias no nó contexto:', err);
      }
    }

    let summaryText: string | null = null;
    if (state.conversationId && options.conversationStore) {
      const summaryData = options.conversationStore.getSummary(state.conversationId);
      summaryText = summaryData?.summary ?? null;
    }

    const builtContext =
      state.builtContext ??
      contextBuilder.build({
        message: rawMessage,
        history: history.map((h) => ({
          role: h.role === 'system' ? 'user' : (h.role as 'user' | 'assistant'),
          content: h.content,
        })),
        memories: recalledMemoriesList,
        summary: summaryText,
      });

    return {
      builtContext,
      message: rawMessage,
      input: rawMessage,
      history: builtContext.history,
    };
  }

  // ── Nó 2: Roteador ──────────────────────────────────────────────────────────
  async function routerNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const overrideInput = state.strategyOverride ?? state.strategy;
    const normalizedOverride = normalizeRoute(overrideInput) ?? (overrideInput ? 'react' : undefined);

    if (normalizedOverride) {
      const reason = `Override manual via requisição: ${overrideInput}`;
      const routeEvent: TraceEvent = {
        node: 'roteador',
        kind: 'route',
        type: 'route',
        route: normalizedOverride,
        reason,
        content: `Roteamento (override manual): ${overrideInput} - ${reason}`,
        timestampMs: Date.now(),
      };

      return {
        route: normalizedOverride,
        reason,
        isOverride: true,
        trace: [routeEvent],
      };
    }

    // Sem override: chamada estruturada ao LLM com a tabela de critérios
    const modelCtx = getModelContext();
    if (modelCtx) modelCtx.currentNode = 'roteador';

    const inputMessage = state.builtContext?.promptMessage || state.message || state.input;
    let verdict: RouteVerdict;

    try {
      const model = routerModel ?? createModel();
      const rawVerdict = await model.withStructuredOutput(routeSchema).invoke([
        ['system', SYSTEM_PROMPT],
        ['user', inputMessage],
      ]);

      if (rawVerdict && typeof rawVerdict === 'object' && 'route' in rawVerdict) {
        const parsed = routeSchema.safeParse(rawVerdict);
        if (parsed.success) {
          verdict = parsed.data;
        } else {
          const norm = normalizeRoute((rawVerdict as any).route);
          verdict = {
            route: norm ?? 'react',
            reason: (rawVerdict as any).reason ?? 'Roteamento recuperado com sucesso',
          };
        }
      } else if (
        rawVerdict &&
        typeof rawVerdict === 'object' &&
        'content' in rawVerdict &&
        typeof (rawVerdict as any).content === 'string'
      ) {
        const text = (rawVerdict as any).content.toLowerCase();
        let detectedRoute: 'react' | 'planExecute' | 'reflect' = 'react';
        if (text.includes('planexecute') || text.includes('plan-and-execute')) {
          detectedRoute = 'planExecute';
        } else if (text.includes('reflect')) {
          detectedRoute = 'reflect';
        }
        verdict = {
          route: detectedRoute,
          reason: 'Extraído da resposta do roteador',
        };
      } else {
        verdict = { route: 'react', reason: 'Fallback para react após retorno inesperado' };
      }
    } catch (err) {
      if (err && typeof err === 'object' && ('statusCode' in err && (err as any).statusCode === 503)) {
        throw err;
      }
      console.error('Falha no roteamento estruturado, aplicando fallback para react:', err);
      verdict = { route: 'react', reason: 'Fallback para react após erro no roteador' };
    }

    const routeEvent: TraceEvent = {
      node: 'roteador',
      kind: 'route',
      type: 'route',
      route: verdict.route,
      reason: verdict.reason,
      content: `Roteado para ${verdict.route}: ${verdict.reason}`,
      timestampMs: Date.now(),
    };

    return {
      route: verdict.route,
      reason: verdict.reason,
      isOverride: false,
      trace: [routeEvent],
      metrics: {
        llmCalls: 1,
        latencyMs: 0,
        modelUsed: modelCtx?.modelUsed,
      },
    };
  }

  // Helper para etiquetar todo evento de trace de uma estratégia com seu nome de nó
  function tagTraceWithNode(trace: TraceEvent[], nodeName: string): TraceEvent[] {
    return trace.map((event) => ({
      ...event,
      node: event.node ?? nodeName,
    }));
  }

  // ── Nó 3: ReAct ─────────────────────────────────────────────────────────────
  async function reactNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const modelCtx = getModelContext();
    if (modelCtx) modelCtx.currentNode = 'react';

    const inputPayload: StrategyInput = {
      message: state.builtContext?.promptMessage || state.message || state.input,
      history: state.builtContext?.history ?? state.history,
      builtContext: state.builtContext,
    };

    const result = await reactStrategy.run(inputPayload);
    const mappedTrace = tagTraceWithNode(result.trace, 'react');

    return {
      answer: result.answer,
      trace: mappedTrace,
      metrics: {
        ...result.metrics,
        llmCalls: (state.metrics?.llmCalls ?? 0) + (result.metrics?.llmCalls ?? 0),
        latencyMs: (state.metrics?.latencyMs ?? 0) + (result.metrics?.latencyMs ?? 0),
        modelUsed: result.metrics?.modelUsed ?? modelCtx?.modelUsed,
      },
    };
  }

  // ── Nó 4: Plan-and-Execute ──────────────────────────────────────────────────
  async function planExecuteNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const modelCtx = getModelContext();
    if (modelCtx) modelCtx.currentNode = 'planExecute';

    const inputPayload: StrategyInput = {
      message: state.builtContext?.promptMessage || state.message || state.input,
      history: state.builtContext?.history ?? state.history,
      builtContext: state.builtContext,
    };

    const result = await planExecuteStrategy.run(inputPayload);
    const mappedTrace = tagTraceWithNode(result.trace, 'planExecute');

    return {
      answer: result.answer,
      trace: mappedTrace,
      metrics: {
        ...result.metrics,
        llmCalls: (state.metrics?.llmCalls ?? 0) + (result.metrics?.llmCalls ?? 0),
        latencyMs: (state.metrics?.latencyMs ?? 0) + (result.metrics?.latencyMs ?? 0),
        modelUsed: result.metrics?.modelUsed ?? modelCtx?.modelUsed,
      },
    };
  }

  // ── Nó 5: Reflection ────────────────────────────────────────────────────────
  async function reflectNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const modelCtx = getModelContext();
    if (modelCtx) modelCtx.currentNode = 'reflect';

    const inputPayload: StrategyInput = {
      message: state.builtContext?.promptMessage || state.message || state.input,
      history: state.builtContext?.history ?? state.history,
      builtContext: state.builtContext,
    };

    const result = await reflectStrategy.run(inputPayload);
    const mappedTrace = tagTraceWithNode(result.trace, 'reflect');

    return {
      answer: result.answer,
      trace: mappedTrace,
      metrics: {
        ...result.metrics,
        llmCalls: (state.metrics?.llmCalls ?? 0) + (result.metrics?.llmCalls ?? 0),
        latencyMs: (state.metrics?.latencyMs ?? 0) + (result.metrics?.latencyMs ?? 0),
        modelUsed: result.metrics?.modelUsed ?? modelCtx?.modelUsed,
      },
    };
  }

  // ── Nó 6: Resposta ──────────────────────────────────────────────────────────
  async function answerNode(state: ProductionGraphState): Promise<Partial<ProductionGraphState>> {
    const answer = state.answer;
    const modelCtx = getModelContext();
    const fallbackEvents = modelCtx?.events ?? [];

    const promptTokens =
      state.metrics.promptTokens && state.metrics.promptTokens > 0
        ? state.metrics.promptTokens
        : state.builtContext?.breakdown.totalEstimated ?? 0;

    // Mesclar eventos normais com quaisquer eventos de fallback gerados
    const mergedTrace = [...state.trace];
    for (const fb of fallbackEvents) {
      if (
        !mergedTrace.some(
          (e) => e.kind === 'fallback' && e.timestampMs === fb.timestampMs
        )
      ) {
        mergedTrace.push(fb);
      }
    }

    // Certifica-se de que todos os eventos acumulados possuam campo node
    const finalTrace = mergedTrace.map((e) => ({
      ...e,
      node: e.node ?? 'resposta',
    }));

    const hasAnswerEvent = finalTrace.some((e) => e.kind === 'answer');
    if (!hasAnswerEvent && answer) {
      finalTrace.push({
        node: 'resposta',
        kind: 'answer',
        content: answer,
        timestampMs: Date.now(),
      });
    }

    const modelUsed = state.metrics.modelUsed ?? modelCtx?.modelUsed;

    // Persistência em SQLite (requests e trace_events) e Log JSON Estruturado
    if (state.requestId && traceStore) {
      traceStore.requests.save({
        id: state.requestId,
        conversationId: state.conversationId,
        userId: state.userId,
        message: state.message || state.input,
        answer,
        route: state.route,
        modelUsed,
        promptTokens,
        completionTokens: state.metrics.completionTokens,
        totalTokens: state.metrics.totalTokens,
        latencyMs: state.metrics.latencyMs,
        llmCalls: state.metrics.llmCalls,
        statusCode: 200,
        status: 'ok',
      });

      finalTrace.forEach((e, seq) => {
        traceStore.traceEvents.save({
          requestId: state.requestId!,
          seq: seq + 1,
          node: e.node,
          type: e.type ?? e.kind,
          kind: e.kind,
          payload: e,
          timestampMs: e.timestampMs,
        });
      });
    }

    if (state.requestId) {
      logger.info({
        requestId: state.requestId,
        node: 'resposta',
        type: 'done',
        route: state.route,
        tokens: promptTokens,
      });
    }

    return {
      answer,
      trace: finalTrace,
      metrics: {
        ...state.metrics,
        modelUsed,
        promptTokens,
        contextBreakdown: state.builtContext?.breakdown,
        contextBudgetStats: state.builtContext?.stats,
      },
    };
  }

  // ── Montagem do Grafo ───────────────────────────────────────────────────────
  const graph = new StateGraph(GraphState)
    .addNode('contexto', contextNode)
    .addNode('roteador', routerNode)
    .addNode('react', reactNode)
    .addNode('planExecute', planExecuteNode)
    .addNode('reflect', reflectNode)
    .addNode('resposta', answerNode)
    .addEdge(START, 'contexto')
    .addEdge('contexto', 'roteador')
    .addConditionalEdges('roteador', (s) => s.route || 'react', {
      react: 'react',
      planExecute: 'planExecute',
      reflect: 'reflect',
    })
    .addEdge('react', 'resposta')
    .addEdge('planExecute', 'resposta')
    .addEdge('reflect', 'resposta')
    .addEdge('resposta', END)
    .compile();

  return graph;
}

// ─── Grafo Padrão Singleton ──────────────────────────────────────────────────

export const productionGraph = createProductionGraph();

export async function runProductionGraph(
  input: {
    message: string;
    requestId?: string;
    conversationId?: string;
    userId?: string;
    strategy?: string;
    strategyOverride?: string;
    history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    builtContext?: BuiltContext;
  },
  options: ProductionGraphOptions = {}
): Promise<{
  answer: string;
  route: 'react' | 'planExecute' | 'reflect';
  reason: string;
  isOverride: boolean;
  trace: TraceEvent[];
  metrics: Metrics;
  builtContext?: BuiltContext;
}> {
  const graphInstance = options && Object.keys(options).length > 0
    ? createProductionGraph(options)
    : productionGraph;

  const result = await graphInstance.invoke({
    input: input.message,
    message: input.message,
    requestId: input.requestId,
    conversationId: input.conversationId,
    userId: input.userId,
    strategy: input.strategy,
    strategyOverride: input.strategyOverride ?? input.strategy,
    history: input.history ?? [],
    builtContext: input.builtContext,
  });

  return {
    answer: result.answer,
    route: result.route,
    reason: result.reason,
    isOverride: result.isOverride,
    trace: result.trace,
    metrics: result.metrics,
    builtContext: result.builtContext,
  };
}
