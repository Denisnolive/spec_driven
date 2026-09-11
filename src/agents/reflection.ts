import { z } from 'zod';
import type { ReasoningStrategy, StrategyResult, TraceEvent, StrategyInput } from './types.js';
import { normalizeInput } from './types.js';
import { createModel } from './model.js';

// ─── Schema de Saída Estruturada do Crítico ──────────────────────────────────

export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z
    .string()
    .describe('se aprovado; o que corrigir, em específico e acionável'),
});

export type CritiqueVerdict = z.infer<typeof verdictSchema>;

// ─── Interface Injetável para o Modelo do Crítico ────────────────────────────

export interface StructuredCriticModel {
  withStructuredOutput(schema: typeof verdictSchema): {
    invoke(input: unknown): Promise<unknown>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function observationsOf(trace: TraceEvent[]): string {
  const observations = trace
    .filter((e) => e.kind === 'observation')
    .map((e) => (typeof e.content === 'string' ? e.content : JSON.stringify(e.content)))
    .filter(Boolean);

  if (observations.length === 0) {
    return '(nenhuma observação registrada)';
  }

  return observations.join('\n---\n');
}

const CRITIC_PROMPT =
  'Você é um auditor rigoroso de confiabilidade e fidelidade factual de agentes de operações. ' +
  'Avalie se a resposta proposta pelo agente é estritamente suportada pelas observações do trace ' +
  'e responde adequadamente ao pedido original. ' +
  'Se a resposta estiver correta e justificada pelas observações, marque approved=true. ' +
  'Se contiver alucinações, inconsistências ou ignorar evidências, marque approved=false ' +
  'e forneça feedback específico e acionável sobre o que deve ser corrigido.';

export async function critique(
  input: string,
  result: StrategyResult,
  model?: StructuredCriticModel
): Promise<CritiqueVerdict> {
  const critic = (model ?? createModel()).withStructuredOutput(verdictSchema);

  const response = await critic.invoke([
    { role: 'system' as const, content: CRITIC_PROMPT },
    {
      role: 'user' as const,
      content:
        `Pedido: ${input}\n\n` +
        `Observações:\n${observationsOf(result.trace)}\n\n` +
        `Resposta: ${result.answer}`,
    },
  ]);

  return response as CritiqueVerdict;
}

// ─── Opções e Decorator ───────────────────────────────────────────────────────

export interface ReflectionOptions {
  /** Número máximo de reflexões corretivas. Padrão: 2. Normalizado para >= 1. */
  maxReflections?: number;
  /** Modelo customizado para o crítico (injetável em testes) */
  criticModel?: StructuredCriticModel;
}

export class ReflectionStrategy implements ReasoningStrategy {
  readonly name: string;
  private readonly maxReflections: number;
  private readonly criticModel?: StructuredCriticModel;

  constructor(
    private readonly baseStrategy: ReasoningStrategy,
    options: ReflectionOptions = {}
  ) {
    this.name = `reflect:${baseStrategy.name}`;
    this.maxReflections = Math.max(1, options.maxReflections ?? 2);
    this.criticModel = options.criticModel;
  }

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const started = Date.now();
    const normalized = normalizeInput(input);
    const originalMessage = normalized.message;
    let currentInput: string | StrategyInput = input;
    const accumulatedTrace: TraceEvent[] = [];
    let totalLlmCalls = 0;
    let lastAnswer = '';

    for (let attempt = 1; attempt <= this.maxReflections; attempt++) {
      const result = await this.baseStrategy.run(currentInput);
      lastAnswer = result.answer;
      totalLlmCalls += result.metrics.llmCalls;
      accumulatedTrace.push(...result.trace);

      // Avaliação crítica
      const verdict = await critique(originalMessage, result, this.criticModel);
      totalLlmCalls += 1; // 1 chamada ao modelo crítico

      accumulatedTrace.push({
        kind: 'critique',
        content: `[${verdict.approved ? 'APROVADO' : 'REPROVADO'}] ${verdict.feedback}`,
        timestampMs: Date.now(),
      });

      if (verdict.approved || attempt === this.maxReflections) {
        break;
      }

      // Prepara o prompt para a próxima iteração corretiva (perde histórico, foca na correção)
      currentInput =
        `Tarefa original: ${originalMessage}\n\n` +
        `Resposta anterior:\n${result.answer}\n\n` +
        `Feedback do crítico (corrija estes pontos):\n${verdict.feedback}`;
    }

    return {
      answer: lastAnswer,
      trace: accumulatedTrace,
      metrics: {
        llmCalls: totalLlmCalls,
        latencyMs: Date.now() - started,
      },
    };
  }
}

export function withReflection(
  strategy: ReasoningStrategy,
  opts?: ReflectionOptions
): ReasoningStrategy {
  return new ReflectionStrategy(strategy, opts);
}
