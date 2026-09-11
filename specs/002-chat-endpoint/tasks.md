# Tasks: Endpoint HTTP POST /chat e Registry de Estratégias

**Branch**: `002-chat-endpoint` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup & Agentes Base

- [x] T001 Implementar módulo de reflexão `src/agents/reflection.ts` com `withReflection(strategy, opts)` e `verdictSchema`.

---

## Phase 2: Foundational (Registry Centralizado)

- [x] T002 Implementar `StrategyRegistry` e `getStrategy` em `src/agents/index.ts` registrando `react` e `plan-and-execute`, com suporte a injeção para testes e decorator `withReflection`.

---

## Phase 3: User Story 1 & 2 — Servidor Express e POST /chat (Priority: P1) 🎯 MVP

**Goal**: Permitir chamadas HTTP `POST /chat` com resposta 200 OK contendo `answer`, `trace` e `metrics`, suportando estratégia padrão `react` e decorator `withReflection` via `reflect: true`.

- [x] T003 [US1/US2] Implementar schema Zod `ChatRequestSchema` e factory `createServer(options?: ServerOptions)` em `src/http/server.ts`.
- [x] T004 [US1/US2] Implementar rota `POST /chat` com resolução no registry e execução da estratégia.

---

## Phase 4: User Story 3, 4 & 5 — Validação, Erros e Timeout (Priority: P2)

**Goal**: Garantir respostas padronizadas para erros de validação (400), estratégia desconhecida (422) e timeout de 180s (504).

- [x] T005 [US3] Adicionar tratamento de validação Zod no `POST /chat` retornando 400 com lista de `issues`.
- [x] T006 [US4] Adicionar verificação de estratégia inexistente retornando 422 com `availableStrategies`.
- [x] T007 [US5] Implementar controle de timeout de 180s (configurável via `ServerOptions.timeoutMs`) retornando 504 Gateway Timeout.

---

## Phase 5: Testes de Integração Determinísticos (Priority: P1/P2)

**Goal**: Validar todos os fluxos HTTP de ponta a ponta sem qualquer dependência de rede ou OpenAI.

- [x] T008 Implementar suite de testes de integração em `src/http/server.test.ts` usando `node:test` e estratégia determinística fake:
  - 200 OK com payload padrão (`react` fake)
  - 200 OK com `strategy` específica
  - 200 OK com `reflect: true` (verificando eventos de critique no trace)
  - 400 Bad Request para corpo inválido (sem message, tipos incorretos)
  - 422 Unprocessable Entity para estratégia desconhecida
  - 504 Gateway Timeout para execução lenta
- [x] T009 Atualizar script `"test"` no `package.json` para rodar `src/http/server.test.ts`.

---

## Phase 6: Verificação & Polish

- [x] T010 Executar `npm test` para validar todos os testes da aplicação (32/32 testes passando).
- [x] T011 Executar `npm run typecheck` para garantir conformidade estrita de tipagem TypeScript (zero erros).
