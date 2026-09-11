import { AsyncLocalStorage } from 'node:async_hooks';
import { ChatOpenAI } from '@langchain/openai';
import type { Runnable } from '@langchain/core/runnables';
import type { TraceEvent } from './types.js';

// ─── Contexto de Execução e Observabilidade de Modelos ───────────────────────

export interface ModelContext {
  /** Eventos acumulados durante a execução dos modelos */
  events: TraceEvent[];
  /** Nome do modelo de linguagem que respondeu com sucesso */
  modelUsed?: string;
  /** Identificador do nó atualmente em execução no grafo/pipeline */
  currentNode?: string;
}

export const modelContextStorage = new AsyncLocalStorage<ModelContext>();

/** Recupera o contexto de execução de modelos ativo, se houver. */
export function getModelContext(): ModelContext | undefined {
  return modelContextStorage.getStore();
}

/** Executa uma operação assíncrona dentro de um contexto isolado de observabilidade de modelo. */
export async function runWithModelContext<T>(
  callback: () => Promise<T>,
  initial?: Partial<ModelContext>
): Promise<{ result: T; events: TraceEvent[]; modelUsed?: string }> {
  const context: ModelContext = {
    events: initial?.events ?? [],
    modelUsed: initial?.modelUsed,
    currentNode: initial?.currentNode,
  };

  const result = await modelContextStorage.run(context, callback);
  return {
    result,
    events: context.events,
    modelUsed: context.modelUsed,
  };
}

// ─── Erro Específico de Indisponibilidade de Modelos (HTTP 503) ──────────────

export class ModelUnavailableError extends Error {
  readonly statusCode = 503;
  readonly isModelUnavailable = true;
  readonly primaryModel?: string;
  readonly fallbackModel?: string;

  constructor(
    message: string,
    options?: { primaryModel?: string; fallbackModel?: string; cause?: unknown }
  ) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.primaryModel = options?.primaryModel;
    this.fallbackModel = options?.fallbackModel;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/** Verifica se um erro é decorrente da falha irrecuperável de modelos LLM. */
export function isModelUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof ModelUnavailableError) return true;
  const anyErr = err as Record<string, unknown>;
  return (
    anyErr.statusCode === 503 ||
    anyErr.isModelUnavailable === true ||
    anyErr.name === 'ModelUnavailableError' ||
    (typeof anyErr.message === 'string' &&
      anyErr.message.includes('Todos os modelos configurados'))
  );
}

// ─── Fábrica Base ─────────────────────────────────────────────────────────────

/** Cria uma instância padrão de ChatOpenAI configurada para OpenRouter. */
export function baseModel(modelName: string) {
  return new ChatOpenAI({
    modelName,
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    temperature: 0,
  });
}

// ─── Interface do Modelo Resiliente ──────────────────────────────────────────

export interface ResilientModel<RunInput = any, RunOutput = any>
  extends Runnable<RunInput, RunOutput> {
  primaryModelName: string;
  fallbackModelName: string;
  bindTools(tools: any[], options?: Record<string, unknown>): any;
  withStructuredOutput<T = any>(
    schema: any,
    options?: Record<string, unknown>
  ): Runnable<any, T>;
  withRetry(options?: any): any;
  withFallbacks(fallbacks: any, options?: any): any;
  invoke(input: RunInput, options?: any): Promise<RunOutput>;
}

export interface CreateModelOptions {
  primary?: any;
  fallback?: any;
  primaryName?: string;
  fallbackName?: string;
  stopAfterAttempt?: number;
}

// ─── Wrapper de Observabilidade e Resiliência ─────────────────────────────────

function wrapResilientRunnable<RunInput, RunOutput>(
  primaryRunnable: any,
  backupRunnable: any,
  primaryName: string,
  backupName: string,
  stopAfterAttempt = 2
): ResilientModel<RunInput, RunOutput> {
  const resilientFallback = primaryRunnable.withFallbacks
    ? primaryRunnable.withFallbacks([backupRunnable])
    : primaryRunnable;

  const wrapper: any = Object.create(primaryRunnable);
  wrapper.primaryModelName = primaryName;
  wrapper.fallbackModelName = backupName;
  wrapper._modelType = () => 'base_chat_model';

  wrapper.invoke = async function (input: RunInput, options?: any): Promise<RunOutput> {
      const ctx = modelContextStorage.getStore();

      let primaryErr: any;
      // Retentativas manuais no primário (em vez de pré-envolver com .withRetry(),
      // o que produziria um RunnableRetry sem .bindTools()/.withStructuredOutput()).
      for (let attempt = 1; attempt <= Math.max(1, stopAfterAttempt); attempt++) {
        try {
          const result = await primaryRunnable.invoke(input, options);
          if (ctx) {
            ctx.modelUsed = primaryName;
          }
          return result as RunOutput;
        } catch (err: any) {
          primaryErr = err;
        }
      }

      const errorMsg = primaryErr?.message || String(primaryErr);

      if (ctx) {
        ctx.modelUsed = backupName;
        ctx.events.push({
          kind: 'fallback',
          node: ctx.currentNode || 'llm',
          fromModel: primaryName,
          toModel: backupName,
          error: errorMsg,
          content: `Falha no modelo primário (${primaryName}): ${errorMsg}. Acionado fallback para ${backupName}.`,
          timestampMs: Date.now(),
        });
      }

      try {
        const fallbackResult = await backupRunnable.invoke(input, options);
        return fallbackResult as RunOutput;
      } catch (backupErr: any) {
        throw new ModelUnavailableError(
          `Todos os modelos configurados (primário: ${primaryName}, fallback: ${backupName}) falharam ao processar a requisição.`,
          {
            primaryModel: primaryName,
            fallbackModel: backupName,
            cause: backupErr,
          }
        );
      }
    };

  wrapper.bindTools = function (tools: unknown[], options?: Record<string, unknown>) {
    const pBound = primaryRunnable.bindTools
      ? primaryRunnable.bindTools(tools, options)
      : primaryRunnable;
    const bBound = backupRunnable.bindTools
      ? backupRunnable.bindTools(tools, options)
      : backupRunnable;

    return wrapResilientRunnable(pBound, bBound, primaryName, backupName, stopAfterAttempt);
  };

  wrapper.withStructuredOutput = function (schema: unknown, options?: Record<string, unknown>) {
    const pStructured = primaryRunnable.withStructuredOutput
      ? primaryRunnable.withStructuredOutput(schema, options)
      : primaryRunnable;
    const bStructured = backupRunnable.withStructuredOutput
      ? backupRunnable.withStructuredOutput(schema, options)
      : backupRunnable;

    return wrapResilientRunnable(pStructured, bStructured, primaryName, backupName, stopAfterAttempt);
  };

  wrapper.withRetry = function (retryOptions: any) {
    return resilientFallback.withRetry(retryOptions);
  };

  wrapper.withFallbacks = function (fallbacks: any) {
    return resilientFallback.withFallbacks(fallbacks);
  };

  return wrapper as ResilientModel<RunInput, RunOutput>;
}

// ─── Fábrica Principal createModel() ──────────────────────────────────────────

export function createModel(options?: CreateModelOptions): ResilientModel {
  const primaryName =
    options?.primaryName ?? process.env.OPENROUTER_MODEL ?? 'openrouter/free';
  const fallbackName =
    options?.fallbackName ??
    process.env.OPENROUTER_MODEL_FALLBACK ??
    'openrouter/deepseek-r1:free';
  const stopAfterAttempt = options?.stopAfterAttempt ?? 2;

  const rawPrimary = options?.primary ?? baseModel(primaryName);
  const rawBackup = options?.fallback ?? baseModel(fallbackName);

  // Nota: as retentativas do primário são feitas manualmente dentro do wrapper
  // (ver wrapResilientRunnable). Não aplicamos .withRetry() aqui porque o
  // RunnableRetry resultante não expõe .bindTools()/.withStructuredOutput(),
  // o que faria o wrapper.bindTools() silenciosamente descartar as ferramentas.
  return wrapResilientRunnable(rawPrimary, rawBackup, primaryName, fallbackName, stopAfterAttempt);
}
