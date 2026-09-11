# Tasks: Resiliência de Modelo com Fallback e Retries

**Feature**: `012-model-fallback`  
**Date**: 2026-09-10  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup & Ambiente

**Purpose**: Configuração das variáveis de ambiente e extensão dos tipos e métricas de trace.

- [x] T001 Atualizar `.env` adicionando a variável de ambiente `OPENROUTER_MODEL_FALLBACK=meta-llama/llama-3-8b-instruct:free`
- [x] T002 Estender `TraceEventKind` com a união `'fallback'`, adicionar campos `fromModel?: string`, `toModel?: string`, `error?: string` à interface `TraceEvent` e adicionar `modelUsed?: string` à interface `Metrics` em `src/agents/types.ts`
- [x] T003 [P] Atualizar a suíte de testes em `src/agents/types.test.ts` validando o evento de trace com `kind: 'fallback'` e o campo `modelUsed` em `Metrics`

---

## Phase 2: User Story 1 - Execução Resiliente com Modelo Primário e Retries Automáticos (Priority: P1)

**Goal**: Configurar o modelo primário com `withRetry` na fábrica de modelo, assegurando que falhas transitórias sejam superadas e que `metrics.modelUsed` aponte para o primário sem emissão indevida de evento `fallback`.

**Independent Test**: Executar teste unitário com falha simulada na primeira tentativa do primário e sucesso na segunda; verificar retorno com sucesso e `metrics.modelUsed` apontando para o primário sem evento de fallback.

### Tests for User Story 1
- [x] T004 [P] [US1] Criar arquivo de teste `src/agents/model.test.ts` com casos de teste validando execução bem-sucedida direta no modelo primário e recuperação após falha transitória via retentativa (`withRetry`)

### Implementation for User Story 1
- [x] T005 [US1] Implementar na fábrica `createModel()` em `src/agents/model.ts` a instanciação do modelo primário via `OPENROUTER_MODEL` com política de retentativas `.withRetry({ stopAfterAttempt: 2 })`
- [x] T006 [US1] Garantir que em execuções atendidas pelo modelo primário, `metrics.modelUsed` registre o identificador do primário e nenhum evento `fallback` conste no trace

---

## Phase 3: User Story 2 - Acionamento Transparente do Modelo Reserva com Registro no Trace (Priority: P1) 🎯 MVP

**Goal**: Conectar o modelo reserva via `.withFallbacks([fallbackModel])` de modo que, se o primário esgotar os retries, a execução migre de forma transparente para o reserva, emitindo o evento `fallback` no trace e atualizando `metrics.modelUsed`.

**Independent Test**: Forçar erro persistente no primário, executar chamada ao modelo e verificar resposta válida gerada pelo reserva, presença do evento `kind: 'fallback'` no trace com informações de `fromModel`, `toModel` e `error`, e `metrics.modelUsed` igual ao modelo reserva.

### Tests for User Story 2
- [x] T007 [P] [US2] Escrever testes unitários em `src/agents/model.test.ts` simulando falha contínua do primário e transição automática para o modelo de contingência via `withFallbacks`
- [x] T008 [P] [US2] Escrever testes unitários em `src/agents/model.test.ts` validando que a transição gera evento `kind: 'fallback'` no trace e preenche `metrics.modelUsed` com o nome do modelo de contingência

### Implementation for User Story 2
- [x] T009 [US2] Instanciar o modelo reserva a partir de `OPENROUTER_MODEL_FALLBACK` e conectar como fallback do primário via `.withFallbacks([fallbackModel])` em `src/agents/model.ts`
- [x] T010 [US2] Implementar wrapper inteligente na fábrica `createModel()` que preserva a cadeia resiliente de retries e fallbacks em `.invoke()`, `.bindTools()` e `.withStructuredOutput()`
- [x] T011 [US2] Implementar a interceptação do evento de transição para emitir o `TraceEvent` com `kind: 'fallback'`, `fromModel`, `toModel`, `error` e registrar o `modelUsed`

---

## Phase 4: User Story 3 - Degradação Graciosa com Retorno HTTP 503 quando Ambos os Modelos Falharem (Priority: P1)

**Goal**: Quando todos os modelos (primário com retries e reserva) falharem, lançar erro específico e responder com status HTTP 503 (Service Unavailable) e corpo JSON explicativo no endpoint `POST /chat`.

**Independent Test**: Fazer requisição a `POST /chat` com ambos os modelos simulando falha irrecuperável e verificar resposta com status HTTP 503 e payload contendo `{ "error": "Service Unavailable", "message": "..." }`.

### Tests for User Story 3
- [x] T012 [P] [US3] Escrever teste unitário em `src/agents/model.test.ts` validando que a falha de ambos os modelos lança `ModelUnavailableError`
- [x] T013 [P] [US3] Escrever testes de integração em `src/http/server.test.ts` simulando falha total de modelos e comprovando resposta HTTP 503 com payload de erro estruturado

### Implementation for User Story 3
- [x] T014 [US3] Implementar classe de erro `ModelUnavailableError` e tratador no endpoint `POST /chat` em `src/http/server.ts` para retornar código de status HTTP 503 quando todos os modelos falharem

---

## Phase 5: User Story 4 - Fábrica Unificada e Retrocompatibilidade Completa de `createModel` (Priority: P2)

**Goal**: Garantir que todos os componentes existentes (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`, `ProductionGraph`, `LearningReflector`) funcionem sem modificações, e propagar `metrics.modelUsed` até a resposta da API.

**Independent Test**: Executar `ProductionGraph` e testar `POST /chat` com sucesso em cada estratégia, validando a presença de `modelUsed` dentro do objeto de métricas na resposta 200 OK.

### Tests for User Story 4
- [x] T015 [P] [US4] Escrever testes unitários em `src/agents/model.test.ts` validando chamadas usando `.bindTools()` e `.withStructuredOutput()` sob a fábrica resiliente
- [x] T016 [P] [US4] Atualizar testes em `src/http/server.test.ts` validando a inclusão de `metrics.modelUsed` na resposta de `POST /chat`

### Implementation for User Story 4
- [x] T017 [US4] Atualizar `src/graph/production-graph.ts` para propagar `metrics.modelUsed` e integrar eventos de trace `fallback` nos nós executores e no nó `resposta`
- [x] T018 [US4] Atualizar a interface `ChatResponse` e o handler de `POST /chat` em `src/http/server.ts` para expor `modelUsed` em `metrics`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Garantir integridade de tipos, regressão zero e validação das diretrizes do projeto.

- [x] T019 [P] Atualizar o script `test` em `package.json` para incluir `src/agents/model.test.ts`
- [x] T020 [P] Executar checagem estrita de tipos TypeScript com `npm run typecheck`
- [x] T021 Executar toda a suíte de testes com `npm test` garantindo 100% de aprovação
- [x] T022 [P] Executar os cenários de teste manuais descritos em `specs/012-model-fallback/quickstart.md`
