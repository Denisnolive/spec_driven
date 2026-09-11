# Contract: `withReflection` (API interna de `src/agents`)

Este projeto não expõe HTTP para esta feature; o contrato relevante é a
assinatura pública TypeScript consumida por `src/arena.ts` e por qualquer
outro código que decore uma estratégia.

## Tipos e Assinaturas (`src/agents/reflection.ts`)

```ts
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ReasoningStrategy, StrategyResult, TraceEvent } from './types.js';

// ─── Schema de Saída Estruturada do Crítico ──────────────────────────────────

export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z
    .string()
    .describe('se aprovado; o que corrigir, em específico e acionável'),
});

export type CritiqueVerdict = z.infer<typeof verdictSchema>;

// ─── Helpers e Função de Crítica ──────────────────────────────────────────────

export declare function observationsOf(trace: TraceEvent[]): string;

export declare function critique(
  input: string,
  result: StrategyResult,
  model?: Pick<BaseChatModel, 'withStructuredOutput'>
): Promise<CritiqueVerdict>;

// ─── Opções e Decorator ───────────────────────────────────────────────────────

export interface ReflectionOptions {
  /** Máximo de ciclos de reflexão corretiva. Normalizado para >= 1. Default: 2. */
  maxReflections?: number;
  /** Modelo usado pelo crítico. Default: createModel(). Injetável para testes. */
  criticModel?: Pick<BaseChatModel, 'withStructuredOutput'>;
}

export declare function withReflection(
  strategy: ReasoningStrategy,
  opts?: ReflectionOptions
): ReasoningStrategy;
```

## Pré-condições

- `strategy` implementa `ReasoningStrategy` (possui `name: string` e `run(input: string): Promise<StrategyResult>`).
- `opts.maxReflections`, se fornecido, é um `number` (pode ser `<= 0`; será normalizado para `1`, não rejeitado).
- `opts.criticModel`, se fornecido, expõe `withStructuredOutput(verdictSchema)` retornando objeto com `.invoke(...)`.

## Pós-condições / Garantias

1. `resultado.name === 'reflect:' + strategy.name` (FR-002).
2. `resultado.run(input)` não lança exceção não tratada por falhas controladas no loop de reflexão.
3. `resultado.run(input)` retorna um `StrategyResult` cujo `trace` contém, em ordem cronológica, todos os eventos de todas as tentativas da estratégia base intercalados com exatamente um evento `{ kind: 'critique' }` por avaliação realizada (FR-005, FR-008).
4. `resultado.run(input).metrics.llmCalls` é a soma de:
   - `llmCalls` de cada execução da estratégia base, mais
   - 1 por cada chamada ao crítico (SC-004).
5. `resultado.run(input).metrics.latencyMs` é o tempo total decorrido desde o início da primeira execução da base até a decisão final do loop.
6. O número de avaliações do crítico realizadas em uma única chamada a `run()` nunca excede `max(1, opts.maxReflections ?? 2)` (FR-006, FR-007, US3).
7. Se o crítico aprovar na primeira avaliação, nenhuma regeneração adicional da estratégia base ocorre (US1 Acceptance Scenario 2).

## Consumidores deste contrato

- `src/arena.ts` — registra `reflect:react` e `reflect:plan-and-execute` no `strategyRegistry`.
- `src/agents/reflection.test.ts` — testes unitários usando estratégia fake e crítico mockado.
