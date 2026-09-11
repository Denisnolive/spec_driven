import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StrategyRegistry, defaultStrategyRegistry, OPS_PILOT_SYSTEM_PROMPT } from '../agents/index.js';
import type { StrategyResult } from '../agents/types.js';
import type { ConversationStore, MessageData } from '../store/conversation-store.js';
import { InMemoryConversationStore } from '../store/conversation-store.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { TraceStore } from '../store/trace-store.js';
import { sqliteTraceStore } from '../store/sqlite-trace-store.js';
import { log, type StructuredLogger } from '../obs/logger.js';
import { reflectLearning, type StructuredModel } from '../memory/reflector.js';
import { setActiveUserId, setMemoryStore } from '../agents/tools.js';
import { calculateContextBreakdown, type ContextBreakdown } from '../context/tokens.js';
import { HistorySummarizer } from '../context/summarizer.js';
import { ContextBuilder } from '../context/context-builder.js';
import { createProductionGraph, normalizeRoute, type StructuredRouterModel } from '../graph/production-graph.js';
import { runWithModelContext, isModelUnavailableError } from '../agents/model.js';

// ─── Schema de Validação Zod ──────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'A mensagem não pode ser vazia'),
  strategy: z.string().trim().optional(),
  reflect: z.boolean().optional().default(false),
  conversationId: z
    .string()
    .uuid('conversationId deve ser UUID válido')
    .nullish()
    .transform((v) => v ?? undefined),
  userId: z
    .string()
    .trim()
    .min(1, 'userId não pode ser vazio')
    .nullish()
    .transform((v) => v ?? undefined),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ─── Tipos e Interfaces do Servidor ───────────────────────────────────────────

export interface ServerOptions {
  /** Timeout em milissegundos para a execução do agente. Padrão: 180000 (180s) */
  timeoutMs?: number;
  /** Registry de estratégias (injetável para testes) */
  registry?: StrategyRegistry;
  /** Store de conversas (injetável para testes). Padrão: InMemoryConversationStore */
  conversationStore?: ConversationStore;
  /** Store de memória semântica (injetável para testes) */
  memoryStore?: MemoryStore;
  /** Store de persistência de trace e requests (injetável para testes) */
  traceStore?: TraceStore;
  /** Logger estruturado JSON (injetável para testes) */
  logger?: StructuredLogger;
  /** Modelo customizado para o refletor de aprendizado (injetável para testes determinísticos) */
  reflectorModel?: StructuredModel;
  /** Gerenciador de sumarização e poda de histórico (injetável para testes) */
  summarizer?: HistorySummarizer;
  /** Construtor e gerenciador de orçamento de contexto (injetável para testes) */
  contextBuilder?: ContextBuilder;
  /** Modelo customizado para o roteador do grafo (injetável para testes) */
  routerModel?: StructuredRouterModel;
}


export interface ChatResponse {
  requestId: string;
  answer: string;
  trace: StrategyResult['trace'];
  metrics: StrategyResult['metrics'] & {
    historyMessages: number;
    recalledMemories?: number;
    promptTokens: number;
    contextBreakdown: ContextBreakdown;
    modelUsed?: string;
  };
  conversationId: string;
}

// ─── Parser de Intervalo de Tempo ─────────────────────────────────────────────

const DURATION_RE = /^(\d+)(h|d|m|s)$/i;

/**
 * Converte um parâmetro `since` em data ISO-8601 UTC.
 * Aceita durações relativas (1h, 24h, 7d, 30d) ou strings ISO válidas.
 * Retorna `null` se o formato for inválido.
 */
function parseSinceToISO(input: string): string | null {
  const match = input.trim().match(DURATION_RE);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const now = Date.now();
    let ms = 0;

    switch (unit) {
      case 's': ms = amount * 1000; break;
      case 'm': ms = amount * 60_000; break;
      case 'h': ms = amount * 3_600_000; break;
      case 'd': ms = amount * 86_400_000; break;
    }

    return new Date(now - ms).toISOString().replace('T', ' ').replace('Z', '');
  }

  // Tenta interpretar como data ISO-8601
  const parsed = new Date(input.trim());
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().replace('T', ' ').replace('Z', '');
  }

  return null;
}

// ─── Factory do Servidor Express ──────────────────────────────────────────────

export function createServer(options: ServerOptions = {}) {
  const app = express();
  const timeoutMs = options.timeoutMs ?? 180000;
  const registry = options.registry ?? defaultStrategyRegistry;
  const conversations = options.conversationStore ?? new InMemoryConversationStore();
  const memoryStore = options.memoryStore;
  const traceStore = options.traceStore ?? sqliteTraceStore;
  const logger = options.logger ?? log;
  const reflectorModel = options.reflectorModel;
  const summarizer = options.summarizer;
  const contextBuilder = options.contextBuilder ?? new ContextBuilder();

  // Middleware CORS para front-end (Vite dev server, War Room e ferramentas locais)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Middleware para JSON body
  app.use(express.json());

  // Tratamento de erro para JSON malformado
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'Invalid JSON payload',
        message: err.message,
      });
      return;
    }
    next(err);
  });

  // ── Rota POST /chat ─────────────────────────────────────────────────────────

  app.post('/chat', async (req: Request, res: Response): Promise<void> => {
    // 0. Capturar ou gerar requestId único
    const rawRequestId = req.headers['x-request-id'];
    const requestId =
      typeof rawRequestId === 'string' && rawRequestId.trim().length > 0
        ? rawRequestId.trim()
        : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    // 1. Validação com Zod
    const parseResult = ChatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        issues: parseResult.error.issues,
      });
      return;
    }

    const {
      message,
      strategy: strategyName,
      reflect,
      conversationId: inputConversationId,
      userId,
    } = parseResult.data;

    // 2. Validação da estratégia (se fornecida explicitamente como override)
    if (strategyName && !registry.has(strategyName) && !normalizeRoute(strategyName)) {
      res.status(422).json({
        error: `Unknown strategy: ${strategyName}`,
        availableStrategies: registry.list(),
      });
      return;
    }

    // 3. Resolução de conversa
    let conversationId: string;
    let history: MessageData[] = [];

    if (inputConversationId) {
      // Conversa existente — verificar se existe
      if (!conversations.exists(inputConversationId)) {
        res.status(404).json({
          error: 'Conversation not found',
          conversationId: inputConversationId,
        });
        return;
      }
      conversationId = inputConversationId;
      // Janela de histórico recente: 8 mensagens
      history = conversations.lastMessages(conversationId, 8);
    } else {
      // Nova conversa
      conversationId = conversations.create();
    }

    // 4. Persistir mensagem do usuário na conversa
    conversations.append(conversationId, 'user', message);

    // 5. Configurar contexto de usuário e store nas tools
    if (userId) {
      setActiveUserId(userId);
    }
    if (memoryStore) {
      setMemoryStore(memoryStore);
    }

    // 6. Consulta e injeção de memórias semânticas (se userId presente)
    let recalledMemoriesCount = 0;
    let recalledMemoriesList: Array<{ fact: string; score?: number }> = [];

    if (userId && memoryStore) {
      const recalled = await memoryStore.recall(userId, message, 3);
      recalledMemoriesCount = recalled.length;
      recalledMemoriesList = recalled;
    }

    // 7. Consulta de resumo prévio da conversa
    const summaryData = conversations.getSummary(conversationId);
    const summaryText = summaryData?.summary ?? null;

    // 8. Construção unificada do contexto com imposição de orçamentos via ContextBuilder
    const builtContext = contextBuilder.build({
      systemPrompt: OPS_PILOT_SYSTEM_PROMPT,
      message,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      memories: recalledMemoriesList,
      summary: summaryText,
    });

    const promptMessage = builtContext.promptMessage;
    const contextBreakdown = builtContext.breakdown;

    // 9. Execução do Grafo Unificado de Produção com proteção de timeout
    let isTimedOut = false;
    let timer: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        isTimedOut = true;
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    const selectedStrategy =
      strategyName && registry.has(strategyName)
        ? registry.get(strategyName, { reflect })
        : undefined;

    const graph = createProductionGraph({
      model: options.routerModel,
      contextBuilder,
      conversationStore: conversations,
      memoryStore,
      traceStore,
      logger,
      reactStrategy:
        selectedStrategy ??
        (reflect
          ? registry.get('react', { reflect: true })
          : registry.get('react')),
      planExecuteStrategy: registry.get('plan-and-execute', { reflect }),
      reflectStrategy: registry.get('react', { reflect: true }) ?? registry.get('reflection'),
    });

    try {
      const modelExec = await runWithModelContext(async () => {
        return await Promise.race([
          graph.invoke({
            input: promptMessage,
            message,
            requestId,
            conversationId,
            userId,
            strategy: strategyName,
            strategyOverride: strategyName,
            history: builtContext.history,
            builtContext,
          }),
          timeoutPromise,
        ]);
      });

      const result = modelExec.result;

      if (timer) {
        clearTimeout(timer);
      }

      // 10. Persistir resposta do agente
      conversations.append(conversationId, 'assistant', result.answer);

      // 11. Sumarização incremental de histórico
      if (summarizer) {
        try {
          await summarizer.checkAndSummarize(conversationId);
        } catch (err) {
          console.error('Erro na verificação de sumarização:', err);
        }
      }

      const promptTokens =
        result.metrics.promptTokens && result.metrics.promptTokens > 0
          ? result.metrics.promptTokens
          : contextBreakdown.totalEstimated;

      const modelUsed = result.metrics?.modelUsed ?? modelExec.modelUsed;

      if (!res.headersSent) {
        res.status(200).json({
          requestId,
          answer: result.answer,
          trace: result.trace,
          metrics: {
            ...result.metrics,
            modelUsed,
            historyMessages: builtContext.history.length,
            ...(userId !== undefined ? { recalledMemories: recalledMemoriesCount } : {}),
            promptTokens,
            contextBreakdown,
            contextBudgetStats: builtContext.stats,
          },
          conversationId,
        });
      }

      // 12. Refletor de aprendizado em background (fire-and-forget)
      if (userId && memoryStore) {
        void (async () => {
          try {
            const learning = await reflectLearning(message, reflectorModel);
            if (learning.hasLearning && learning.fact) {
              await memoryStore.remember(userId, learning.fact);
            }
          } catch (err) {
            console.error('Erro no refletor de aprendizado em background:', err);
          }
        })();
      }
    } catch (err: unknown) {
      if (timer) {
        clearTimeout(timer);
      }

      const statusCode =
        isTimedOut || (err instanceof Error && err.message === 'TIMEOUT')
          ? 504
          : isModelUnavailableError(err)
            ? 503
            : 500;

      try {
        traceStore.requests.save({
          id: requestId,
          conversationId,
          userId,
          message,
          statusCode,
          status: 'error',
        });
      } catch (saveErr) {
        console.error('Erro ao persistir requisição com erro:', saveErr);
      }

      logger.error({
        requestId,
        node: 'chat',
        error: err instanceof Error ? err.message : String(err),
        statusCode,
      });

      if (res.headersSent) {
        return;
      }

      if (statusCode === 504) {
        res.status(504).json({ error: 'Request timed out', requestId });
        return;
      }

      if (statusCode === 503) {
        res.status(503).json({
          error: 'Service Unavailable',
          message:
            err instanceof Error
              ? err.message
              : 'Todos os modelos (primário e fallback) falharam ao processar a requisição',
          requestId,
        });
        return;
      }

      console.error('Erro na execução da estratégia:', err);
      res.status(500).json({ error: 'Internal server error', requestId });
    }
  });

  // ── Rota GET /stats ─────────────────────────────────────────────────────────

  app.get('/stats', (req: Request, res: Response): void => {
    const sinceParam = (req.query.since as string) ?? '24h';
    const sinceISO = parseSinceToISO(sinceParam);

    if (!sinceISO) {
      res.status(400).json({
        error: 'Invalid "since" parameter',
        message: 'Use duração relativa (1h, 24h, 7d, 30d) ou data ISO-8601',
        examples: ['1h', '24h', '7d', '30d', '2026-09-01T00:00:00Z'],
      });
      return;
    }

    try {
      const stats = traceStore.getStats(sinceISO);
      res.status(200).json(stats);
    } catch (err) {
      console.error('Erro ao calcular estatísticas:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Rota GET /requests (sem ID) ─────────────────────────────────────────────
  app.get('/requests', (_req: Request, res: Response): void => {
    res.status(400).json({
      error: 'Missing requestId parameter',
      message: 'Uso correto: GET /requests/:id',
    });
  });


  // ── Rota GET /requests/:id ──────────────────────────────────────────────────

  app.get('/requests/:id', (req: Request, res: Response): void => {
    const id = req.params.id;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }

    const data = traceStore.getRequest(id.trim());
    if (!data) {
      res.status(404).json({
        error: 'Request not found',
        requestId: id.trim(),
      });
      return;
    }

    res.status(200).json(data);
  });

  return app;
}


