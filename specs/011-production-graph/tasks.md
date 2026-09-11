# Tasks: Grafo Unificado de Produção (Production Graph)

**Feature**: `011-production-graph`  
**Date**: 2026-09-09  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup (Infraestrutura de Tipos e Observabilidade de Trace)

**Purpose**: Estender a tipagem de eventos de trace para suportar o evento `route` e a identificação do nó emissor `node`.

- [x] T001 Estender `TraceEventKind` com a união `'route'` e adicionar o campo `node?: string` à interface `TraceEvent` em `src/agents/types.ts`
- [x] T002 [P] Atualizar a suíte de testes de tipos em `src/agents/types.test.ts` para validar o evento de trace com `kind: 'route'` e a presença do campo `node`

---

## Phase 2: Foundational (Definição de Estado e Contratos do Grafo)

**Purpose**: Definir o estado do LangGraph com `Annotation.Root` e schemas Zod do roteador.

- [x] T003 Definir o schema Zod `routeSchema` com `{ route: z.enum(['react', 'planExecute', 'reflect']), reason: z.string().min(1) }` em `src/graph/production-graph.ts`
- [x] T004 [P] Definir o estado anotado `GraphState` com reducers imutáveis para mensagens, histórico, contexto, rota, trace (`(a, b) => [...a, ...b]`) e métricas em `src/graph/production-graph.ts`

---

## Phase 3: User Story 1 - Roteamento Inteligente e Grafo Unificado de Produção (Priority: P1) 🎯 MVP

**Goal**: Construir e compilar o `StateGraph` contendo os nós `contexto`, `roteador`, as três estratégias (`react`, `planExecute`, `reflect`) e o nó `resposta`, rotulando todo o trace com o campo `node`.

**Independent Test**: Invocar o grafo com uma requisição de consulta simples e validar o fluxo completo `START` → `contexto` → `roteador` → `react` → `resposta` → `END`, comprovando que 100% dos eventos possuem `node` e que o evento `route` está presente no trace.

### Tests for User Story 1
- [x] T005 [P] [US1] Criar arquivo de teste `src/graph/production-graph.test.ts` com teste unitário validando o fluxo completo de execução do grafo
- [x] T006 [P] [US1] Escrever teste em `src/graph/production-graph.test.ts` garantindo que 100% dos eventos do trace final trazem o campo `node` preenchido com o nó responsável

### Implementation for User Story 1
- [x] T007 [US1] Implementar o nó `contexto` em `src/graph/production-graph.ts`, integrando com `ContextBuilder` e emitindo trace com `node: 'contexto'`
- [x] T008 [US1] Implementar os nós executores de estratégias (`react`, `planExecute`, `reflect`) em `src/graph/production-graph.ts`, delegando para as estratégias correspondentes e etiquetando todo evento com o respectivo `node`
- [x] T009 [US1] Implementar o nó `resposta` em `src/graph/production-graph.ts`, consolidando a resposta textual final, unificando métricas totais e garantindo `node: 'resposta'`
- [x] T010 [US1] Configurar as bordas (`START` → `contexto` → `roteador`, bordas condicionais para as estratégias e transição para `resposta` → `END`) e compilar o grafo com `compile()` em `src/graph/production-graph.ts`
- [x] T011 [US1] Exportar o `productionGraph`, factories e tipos auxiliares em `src/agents/index.ts` e `src/agents/production-graph.ts`

---

## Phase 4: User Story 2 - Roteamento com Tabela de Decisão no Prompt e Saída Estruturada (Priority: P1)

**Goal**: Implementar o nó `roteador` utilizando `model.withStructuredOutput(routeSchema)` com prompt de sistema orientado por tabela comparativa de critérios operacionais.

**Independent Test**: Executar o nó `roteador` com entradas distintas (consultas simples, tarefas complexas em passos e análises críticas) e comprovar a seleção da rota adequada e o evento `route` emitido no trace.

### Tests for User Story 2
- [x] T012 [P] [US2] Escrever testes unitários em `src/graph/production-graph.test.ts` validando a decisão de roteamento para `'react'`, `'planExecute'` e `'reflect'` via mock do modelo estruturado
- [x] T013 [P] [US2] Escrever teste comprovando a emissão do evento `kind: 'route'` contendo `node: 'roteador'`, rota escolhida e justificativa

### Implementation for User Story 2
- [x] T014 [US2] Escrever o prompt de sistema do nó `roteador` contendo a tabela Markdown de decisão operacional comparando `react`, `planExecute` e `reflect` com critérios de uso, compensações e exemplos
- [x] T015 [US2] Implementar a lógica do nó `roteador` em `src/graph/production-graph.ts` utilizando `model.withStructuredOutput(routeSchema)` e adicionando ao trace o evento `kind: 'route'` com `node: 'roteador'`
- [x] T016 [US2] Implementar fallback de contingência para a rota `'react'` caso o modelo estruturado retorne falha inesperada em runtime

---

## Phase 5: User Story 3 - Override Manual de Estratégia via `/chat` e Registro Transparente no Trace (Priority: P2)

**Goal**: Atualizar o schema e handler do endpoint `POST /chat` em `src/http/server.ts` para tornar `strategy` opcional (decisão do roteador) ou, se fornecido, aplicar override manual direto no grafo registrando no trace.

**Independent Test**: Fazer requisição a `POST /chat` sem `strategy` (verificar evento `route` automático) e com `strategy: "plan-and-execute"` (verificar respeito ao override e marcação explícita no trace com `node: 'roteador'`).

### Tests for User Story 3
- [x] T017 [P] [US3] Escrever teste em `src/graph/production-graph.test.ts` validando que quando `strategyOverride` é passado, o nó `roteador` não invoca a LLM e emite evento `route` de override
- [x] T018 [P] [US3] Atualizar `src/http/server.test.ts` com testes para requisição sem o campo `strategy` (acionando roteador autônomo)
- [x] T019 [P] [US3] Atualizar `src/http/server.test.ts` com testes para requisição com `strategy` explícita atuando como override no trace

### Implementation for User Story 3
- [x] T020 [US3] Atualizar a lógica do nó `roteador` em `src/graph/production-graph.ts` para verificar `state.strategyOverride` antes de chamar o modelo estruturado
- [x] T021 [US3] Atualizar `ChatRequestSchema` em `src/http/server.ts` para tornar `strategy` opcional (`z.string().trim().optional()`) sem valor default forçado
- [x] T022 [US3] Conectar o endpoint `POST /chat` ao `ProductionGraph`, repassando `strategy` como `strategyOverride` e retornando a resposta e traces enriquecidos com `node` e `route`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação de regressão, execução da suíte completa de testes e checagem estrita de tipos.

- [x] T023 [P] Executar checagem estrita de tipos TypeScript com `npm run typecheck`
- [x] T024 Executar toda a suíte de testes com `npm test`
- [x] T025 [P] Executar os cenários de validação descritos em `specs/011-production-graph/quickstart.md`
