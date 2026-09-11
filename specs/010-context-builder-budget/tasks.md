# Tasks: ContextBuilder com Orçamento por Seção

**Feature**: `010-context-builder-budget`  
**Date**: 2026-09-09  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Infraestrutura de Tipos e Contratos)

**Purpose**: Estruturação inicial dos tipos, interfaces e schemas do orçamento de contexto

- [x] T001 Definir interfaces e schemas Zod de `ContextBudgetConfig`, `ContextMemoryItem`, `ContextMessageItem`, `ContextBuilderInput` e `BuiltContext` em `src/context/context-builder.ts`
- [x] T002 [P] Exportar os novos tipos e interfaces em `src/context/index.ts` (ou ponto de entrada de context)

---

## Phase 2: Foundational (Resolução de Configuração e Ambiente)

**Purpose**: Carregamento e validação de variáveis de ambiente `CONTEXT_BUDGET_*`

- [x] T003 Implementar função utilitária pura de resolução de orçamento `resolveBudgetConfig(env, overrides)` com fallbacks (`summary: 200`, `window/history: 1200`, `memories: 300`) em `src/context/context-builder.ts`
- [x] T004 [P] Criar testes unitários para resolução e fallbacks de `resolveBudgetConfig` em `src/context/context-builder.test.ts`

---

## Phase 3: User Story 1 - Montagem Unificada de Prompt com Orçamento por Seção (Priority: P1) 🎯 MVP

**Goal**: Criar o `ContextBuilder` capaz de estruturar prompt, histórico, memórias e resumo de acordo com limites orçamentários

**Independent Test**: Instanciar o `ContextBuilder` com entradas completas dentro dos limites normais e comprovar que todas as seções são montadas no formato padronizado com `breakdown` correto.

### Tests for User Story 1
- [x] T005 [P] [US1] Escrever teste unitário para montagem básica de contexto e breakdown de tokens em `src/context/context-builder.test.ts`
- [x] T006 [P] [US1] Escrever teste unitário para preservação dos valores padrão de orçamento em `src/context/context-builder.test.ts`

### Implementation for User Story 1
- [x] T007 [US1] Implementar a classe `ContextBuilder` e o método `build(input: ContextBuilderInput): BuiltContext` em `src/context/context-builder.ts`
- [x] T008 [US1] Implementar a formatação padronizada das mensagens para o modelo (`messages`) e do bloco de mensagem (`promptMessage`) em `src/context/context-builder.ts`
- [x] T009 [US1] Integrar o cálculo de `ContextBreakdown` reutilizando `estimateTokens` em `src/context/context-builder.ts`

---

## Phase 4: User Story 2 - Poda Determinística de Janela de Histórico e Memórias (Priority: P1)

**Goal**: Implementar a lógica de corte determinístico: FIFO para janela de histórico, score decrescente para memórias, truncamento para resumo e garantia de intocabilidade para system e userMessage.

**Independent Test**: Executar testes com tetos baixos configurados e verificar que as mensagens mais antigas são podadas primeiro, as memórias de menor score são eliminadas primeiro, e as seções intocáveis nunca sofrem corte.

### Tests for User Story 2
- [x] T010 [P] [US2] Escrever teste comprovando que teto baixo de histórico descarta as mensagens mais antigas primeiro (FIFO) em `src/context/context-builder.test.ts`
- [x] T011 [P] [US2] Escrever teste comprovando que teto baixo de memórias descarta as de menor score primeiro em `src/context/context-builder.test.ts`
- [x] T012 [P] [US2] Escrever teste comprovando que `systemPrompt` e `userMessage` são intocáveis sob tetos zerados em `src/context/context-builder.test.ts`
- [x] T013 [P] [US2] Escrever teste comprovando que resumos excedentes ao teto sofrem truncamento seguro em `src/context/context-builder.test.ts`

### Implementation for User Story 2
- [x] T014 [US2] Implementar algoritmo de poda FIFO de histórico (varredura reversa acumulando tokens e mantendo ordem cronológica) em `src/context/context-builder.ts`
- [x] T015 [US2] Implementar algoritmo de poda de memórias por score (ordenação decrescente por score e corte das excedentes) em `src/context/context-builder.ts`
- [x] T016 [US2] Implementar truncamento seguro de resumo com preservação do limite de caracteres/tokens em `src/context/context-builder.ts`
- [x] T017 [US2] Implementar geração das estatísticas de poda `ContextBudgetStats` (`prunedHistoryCount`, `prunedMemoriesCount`) em `src/context/context-builder.ts`

---

## Phase 5: User Story 3 - Adoção Universal em Todas as Estratégias e Endpoints (Priority: P2)

**Goal**: Conectar o `ContextBuilder` ao servidor HTTP (`/chat`) e às estratégias (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`).

**Independent Test**: Executar requisição ao endpoint `/chat` e chamadas diretas às estratégias verificando que todas consom o contexto gerado pelo `ContextBuilder`.

### Tests for User Story 3
- [x] T018 [P] [US3] Atualizar testes de integração do servidor HTTP em `src/http/server.test.ts` para verificar consumo do `ContextBuilder`
- [x] T019 [P] [US3] Adicionar teste unitário validando que as estratégias processam entradas com contexto orçado em `src/agents/types.test.ts`

### Implementation for User Story 3
- [x] T020 [US3] Atualizar `StrategyInput` em `src/agents/types.ts` para suportar `builtContext?: BuiltContext` ou compatibilidade de mensagens
- [x] T021 [US3] Refatorar montagem de prompt em `src/http/server.ts` para utilizar `ContextBuilder.build()` centralizado
- [x] T022 [US3] Refatorar `ReActStrategy.run()` em `src/agents/react.ts` para utilizar o contexto orçado
- [x] T023 [US3] Refatorar `PlanAndExecuteStrategy.run()` em `src/agents/plan-and-execute.ts` para utilizar o contexto orçado
- [x] T024 [US3] Refatorar `ReflectionStrategy.run()` em `src/agents/reflection.ts` para repassar o contexto orçado ao agente base

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificação de tipos, qualidade do código e validação completa contra regressões

- [x] T025 [P] Executar validação de tipos TypeScript com `npm run typecheck`
- [x] T026 Executar a suíte completa de testes com `npm test`
- [x] T027 [P] Executar os cenários de validação rápida documentados em `specs/010-context-builder-budget/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: Inicia imediatamente.
- **Phase 2 (Foundational)**: Depende da Phase 1.
- **Phase 3 (User Story 1)**: Depende da Phase 2. Constitui o MVP do ContextBuilder.
- **Phase 4 (User Story 2)**: Depende da Phase 3 (refina com poda e tetos baixos).
- **Phase 5 (User Story 3)**: Depende da Phase 4 (adota em todas as estratégias e HTTP).
- **Phase 6 (Polish)**: Depende da conclusão de todas as fases anteriores.

### Parallel Opportunities
- `T002` pode rodar em paralelo a `T001`.
- `T004` pode rodar em paralelo a `T003`.
- Testes `T005` e `T006` podem rodar em paralelo.
- Testes `T010`, `T011`, `T012`, `T013` podem ser escritos em paralelo.
- Testes `T018` e `T019` podem rodar em paralelo.
- `T025` e `T027` podem rodar em paralelo na fase de polimento.

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)
1. Concluir Setup e Foundational (`T001`-`T004`).
2. Implementar `ContextBuilder` básico (`T005`-`T009`).
3. Implementar algoritmos determinísticos de corte e testes de tetos baixos (`T010`-`T017`).
4. **Validar MVP**: Executar `node --import tsx --test src/context/context-builder.test.ts`.

### Incremental Delivery
1. Com o `ContextBuilder` e testes unitários 100% verdes, integrar ao `server.ts` e estratégias (`T018`-`T024`).
2. Rodar `npm run typecheck` e `npm test` para garantir zero regressões no sistema existente.
