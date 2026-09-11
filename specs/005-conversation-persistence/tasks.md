---
description: "Task list for conversation persistence implementation"
---

# Tasks: Conversa Persistente (ConversationStore + histório no prompt)

**Input**: Design documents from `/specs/005-conversation-persistence/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001 a SC-006) exigem cobertura unitária e de integração determinística antes de qualquer commit. Todos os testes usam `node:test` via `tsx`, sem rede, sem LLM, usando `:memory:` e `InMemoryConversationStore`.

**Organization**: Tarefas agrupadas por fases e user story (US1–US4, conforme prioridade em spec.md) para permitir implementação e validação incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (sem dependência de tarefa incompleta)
- **[Story]**: US1, US2, US3 ou US4
- Caminhos de arquivo exatos incluídos em cada descrição

---

## Phase 1: Contracts & Interfaces

**Purpose**: Definir os tipos de dados, interfaces e schemas Zod que compõem os contratos da feature.

- [x] T001 [US1] Criar `src/store/conversation-store.ts` com as interfaces `MessageData`, `ConversationData` e `ConversationStore` (métodos: `create(): string`, `append(conversationId, role, content): MessageData`, `lastMessages(conversationId, limit): MessageData[]`, `exists(conversationId): boolean`)
- [x] T002 [US1] [P] Implementar `InMemoryConversationStore` em `src/store/conversation-store.ts` implementando `ConversationStore` com arrays em memória e `crypto.randomUUID()` para IDs
- [x] T003 [P] Atualizar `src/store/index.ts` para re-exportar `src/store/conversation-store.ts`
- [x] T004 [US4] Adicionar `historyMessages?: number` à interface `Metrics` em `src/agents/types.ts` + `StrategyInput` e `normalizeInput()` para suportar passagem de histórico às strategies

**Checkpoint**: ✅ Interfaces, tipos e schemas definidos; `npm run typecheck` verde.

---

## Phase 2: SQLite Store Implementation (US1)

**Purpose**: Implementar a persistência SQLite de conversas e mensagens com DDL idempotente, prepared statements, FK e CHECK constraints.

- [x] T005 [US1] Criar `src/store/sqlite-conversation-store.ts` com a classe `SqliteConversationStore` (DDL, PRAGMA FK, índice composto)
- [x] T006 [US1] Implementar `create()`: gera UUID via `crypto.randomUUID()`, insere na tabela `conversations`
- [x] T007 [US1] Implementar `append(conversationId, role, content)`: insere via prepared statement, retorna `MessageData`
- [x] T008 [US1] Implementar `lastMessages(conversationId, limit)`: subquery DESC/ASC para ordem cronológica
- [x] T009 [US1] Implementar `exists(conversationId)`: SELECT count via prepared statement
- [x] T010 [P] Atualizar `src/store/index.ts` para re-exportar `src/store/sqlite-conversation-store.ts`

**Checkpoint**: ✅ `SqliteConversationStore` compilando e tipado; `npm run typecheck` verde.

---

## Phase 3: Store Tests (US1)

**Purpose**: Validar o ciclo de vida completo do `SqliteConversationStore` com `:memory:`.

- [x] T011 [US1] Criar `src/store/sqlite-conversation-store.test.ts` com setup `beforeEach` sobre `DatabaseSync(':memory:')`
- [x] T012 [US1] [P] Teste: `create()` retorna UUIDv4 válido e `exists()` confirma
- [x] T013 [US1] [P] Teste: `append()` persiste mensagem e retorna `MessageData` completo
- [x] T014 [US1] [P] Teste: `lastMessages()` retorna mensagens em ordem cronológica (ASC por `id`)
- [x] T015 [US1] [P] Teste: `lastMessages()` com limite 12 retorna apenas as 12 mais recentes quando há 15+ mensagens
- [x] T016 [US1] [P] Teste: `lastMessages()` retorna array vazio para conversa sem mensagens
- [x] T017 [US1] [P] Teste: `append()` com `conversationId` inexistente lança erro de FOREIGN KEY
- [x] T018 [US1] [P] Teste: `append()` com role inválido lança erro de CHECK constraint
- [x] T019 [US1] [P] Teste: `exists()` retorna `false` para UUID inexistente

**Checkpoint**: ✅ `npm test` verde para `sqlite-conversation-store.test.ts`; store 100% validado.

---

## Phase 4: Endpoint Extension & Strategy Adaptation (US2, US3, US4)

**Purpose**: Estender `POST /chat`, adaptar strategies para aceitar histórico e adicionar métrica.

- [x] T020 [US2] Estender `ChatRequestSchema` com `conversationId: z.string().uuid().optional()`
- [x] T021 [US2] Estender `ChatResponse` com `conversationId: string` e `historyMessages` na métrica
- [x] T022 [US2] Estender `ServerOptions` com `conversationStore?: ConversationStore`
- [x] T023 [US3] Adaptar `ReasoningStrategy.run()` para aceitar `string | StrategyInput` — strategies convertem histórico em mensagens LangChain
- [x] T024 [US2] [US3] [US4] Refatorar handler `POST /chat`: verificar conversa, carregar histórico, append user, strategy.run({ message, history }), append assistant, retornar conversationId + historyMessages
- [x] T025 [US4] Garantir `metrics.historyMessages` na resposta JSON

**Checkpoint**: ✅ Endpoint compilando e tipado; `npm run typecheck` verde.

---

## Phase 5: Integration Tests (US2, US3, US4)

**Purpose**: Validar o ciclo completo do endpoint com `InMemoryConversationStore`.

- [x] T026 [US2] Atualizar setup do `server.test.ts` para injetar `InMemoryConversationStore`
- [x] T027 [US2] [P] Teste: `POST /chat` sem `conversationId` retorna 200 com `conversationId` UUID válido
- [x] T028 [US2] [P] Teste: `POST /chat` com `conversationId` existente retorna 200 com o mesmo `conversationId`
- [x] T029 [US2] [P] Teste: `POST /chat` com `conversationId` UUID válido mas inexistente retorna 404
- [x] T030 [US2] [P] Teste: `POST /chat` com `conversationId` formato inválido retorna 400
- [x] T031 [US3] [P] Teste: continuação de conversa com `historyMessages` correto
- [x] T032 [US4] [P] Teste: `POST /chat` sem `conversationId` retorna `metrics.historyMessages === 0`
- [x] T033 Todos os testes existentes (200, 400, 422, 504, reflect) continuam verdes

**Checkpoint**: ✅ `npm test` verde para toda a suite `server.test.ts`.

---

## Phase 6: Verification & Review

**Purpose**: Validação final estática e execução completa dos testes de regressão.

- [x] T034 `npm run typecheck` — 0 erros
- [x] T035 `npm test` — 64 testes, 0 falhas, 23 suites
- [x] T036 `package.json` atualizado com `sqlite-conversation-store.test.ts`
