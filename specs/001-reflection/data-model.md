# Phase 1 Data Model: Camada Reflection

Este módulo não introduz persistência (sem tabelas/entidades de banco). As
estruturas de dados e schemas Zod ficam em memória em `src/agents/reflection.ts`,
reaproveitando os tipos de `src/agents/types.ts`.

## ReflectionOptions

Configuração aceita por `withReflection(strategy, opts?)`.

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `maxReflections` | `number` | não | `2` | Máximo de ciclos de crítica. Normalizado para `Math.max(1, valor)` — ver research.md item 6. |
| `criticModel` | objeto com `withStructuredOutput(schema)` | não | `createModel()` | Modelo usado para o crítico; injeção de dependência para testes offline. |

## verdictSchema (schema Zod)

Saída estruturada do modelo crítico, validada por `verdictSchema` e usada via `.withStructuredOutput(verdictSchema)`.

```typescript
export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z
    .string()
    .describe('se aprovado; o que corrigir, em específico e acionável'),
});

export type CritiqueVerdict = z.infer<typeof verdictSchema>;
```

| Campo | Tipo Zod | Descrição |
|---|---|---|
| `approved` | `z.boolean()` | `true` se a resposta é fiel às observações do trace; `false` caso contrário. |
| `feedback` | `z.string()` | Sempre presente. Quando `approved: true`, comentário confirmatório; quando `false`, indicação da correção necessária (injetada na próxima tentativa). |

## ReflectionStrategy (implementa `ReasoningStrategy`)

Classe interna retornada por `withReflection`.

| Membro | Tipo | Descrição |
|---|---|---|
| `name` (readonly) | `string` | `` `reflect:${baseStrategy.name}` `` (FR-002, edge case "Preservação do nome"). |
| `run(input: string)` | `Promise<StrategyResult>` | Executa o loop: base → crítica → (regenera com feedback se reprovado e `reflectionCount < max`) → repete, até aprovar ou atingir `maxReflections`. |

**Fluxo de Estados**:

```text
[executar base] → [crítica com verdictSchema]
  approved=true              → FIM, retorna resultado consolidado
  approved=false E count<max → injeta feedback no prompt → [executar base] (novo ciclo)
  approved=false E count=max → FIM, retorna última resposta obtida
```

## Reaproveitamento de tipos existentes (`src/agents/types.ts`)

- `ReasoningStrategy`: Interface implementada por `ReflectionStrategy` e pela estratégia base decorada.
- `StrategyResult`: Objeto retornado por `run()`; `trace` contém todos os eventos das tentativas base intercalados com eventos `kind: 'critique'`; `metrics.llmCalls`/`metrics.latencyMs` acumulam todas as execuções da base e do crítico.
- `TraceEvent`: Eventos com `kind: 'critique'` contendo o texto formatado da avaliação e timestamp.
