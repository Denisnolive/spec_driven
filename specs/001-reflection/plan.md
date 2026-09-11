# Implementation Plan: Camada Reflection (withReflection)

**Branch**: `001-reflection` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-reflection/spec.md`

## Summary

Adicionar um decorator `withReflection(strategy, opts)` que envolve qualquer
`ReasoningStrategy` (`ReActStrategy`, `PlanAndExecuteStrategy`) com um loop
crítico-corretivo: executa a base, pede a um "crítico" (mesmo modelo, saída
estruturada Zod `{ approved, feedback }`) para avaliar a resposta contra as
observações do trace, e — se reprovada — reexecuta a base injetando o feedback
no prompt, até aprovação ou `maxReflections` (default 2). Cada avaliação
adiciona um evento `critique` ao trace e soma `llmCalls`/`latencyMs`. A Arena
(`src/arena.ts`) ganha duas novas entradas de registro: `reflect:react` e
`reflect:plan-and-execute`.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**: `@langchain/core` (tipos de mensagem), `@langchain/openai` (`ChatOpenAI` via `createModel()`), `zod` (schema do crítico)

**Storage**: N/A (módulo é puro em memória; não toca `ops-store`/Sequelize)

**Testing**: `node:test` via `tsx` (`node --import tsx --test`), 100% determinístico — estratégia base e `criticModel` mockados por injeção de dependência (sem chamadas de rede)

**Target Platform**: Node.js CLI (`src/arena.ts`) e uso programático de qualquer `ReasoningStrategy`

**Project Type**: single project — módulo adicionado a `src/agents/`

**Performance Goals**: overhead do crítico limitado a exatamente 1 chamada estruturada por ciclo avaliado (SC-004); no máximo `maxReflections` regenerações da base por execução

**Constraints**: sem I/O além do já existente na estratégia base e no `criticModel`; nenhuma chamada de rede em testes unitários (usar mocks injetados via `ReflectionOptions.criticModel` e uma estratégia base fake)

**Scale/Scope**: um novo módulo (~150–200 LOC) + testes co-locados; alteração pontual em `src/arena.ts` para registrar 2 novas estratégias

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. TypeScript Estrito e ESM** — PASS. Novo módulo em `src/agents/reflection.ts`, imports ESM com extensão `.js`, sem `any` implícito, tipos explícitos para `ReflectionOptions`, `CritiqueResult`, `ReflectionStrategy`.
- **II. Validação na Fronteira (Zod)** — PASS. A saída do crítico é a única "fronteira externa" deste módulo (resposta de LLM não confiável) e é validada por `z.object({ approved: z.boolean(), feedback: z.string() })` via `.withStructuredOutput(CritiqueResultSchema)`.
- **III. Arquitetura em Camadas (MVC)** — N/A para este módulo. `src/agents/` já é a camada de lógica de agentes/estratégias do projeto (fora do MVC HTTP `model/service/controller`), seguindo o padrão existente de `react.ts` e `plan-and-execute.ts`. Nenhuma lógica de reflection acessa HTTP/Express ou banco diretamente.
- **IV. Test-First** — PASS. `src/agents/reflection.test.ts` cobre: aprovação direta, reprovação + regeneração aprovada, limite de `maxReflections` atingido, soma estrita de métricas e preservação do nome (`reflect:<base>`) — todos com estratégia base e crítico mockados (sem rede).
- **V. Funções Puras e Efeitos Isolados** — PASS. O loop de decisão (quando parar, como montar o prompt de feedback, como agregar trace/métricas) é lógica pura; os únicos efeitos (chamada ao crítico, chamada à estratégia base) ficam isolados atrás das interfaces `ReasoningStrategy.run()` e `BaseChatModel.withStructuredOutput()`, ambas injetáveis.
- **VI. Gestão de Secrets** — N/A. Nenhuma nova variável de ambiente ou secret é introduzida; reaproveita `createModel()` existente.

**Resultado**: nenhuma violação. Não é necessária a seção "Complexity Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/001-reflection/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/
│   └── reflection-api.md # Fase 1 — contrato de `withReflection`
└── tasks.md              # Fase 2 (gerado por /speckit-tasks — não neste comando)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── types.ts               # (existente) ReasoningStrategy, StrategyResult, TraceEvent, Metrics
│   ├── model.ts                # (existente) createModel()
│   ├── react.ts                # (existente) ReActStrategy
│   ├── plan-and-execute.ts     # (existente) PlanAndExecuteStrategy
│   ├── reflection.ts           # NOVO — withReflection(), ReflectionStrategy, CritiqueResultSchema
│   └── reflection.test.ts      # NOVO — testes unitários determinísticos
└── arena.ts                    # MODIFICADO — registra 'reflect:react' e 'reflect:plan-and-execute'
```

**Structure Decision**: projeto único (Opção 1), sem separação frontend/backend. A
feature é inteiramente contida em `src/agents/` — mesmo padrão dos módulos de
estratégia existentes — mais uma alteração pontual no registro de estratégias
da Arena em `src/arena.ts`. Não há camada HTTP/Controller envolvida.

## Complexity Tracking

*Nenhuma violação da Constitution Check — seção não aplicável.*
