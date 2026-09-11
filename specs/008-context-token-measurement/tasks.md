---
description: "Task list for context and token measurement instrumentation"
---

# Tasks: Instrumentação de Medição de Contexto e Tokens

**Input**: Design documents from `/specs/008-context-token-measurement/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001 a SC-005) exigem cobertura unitária determinística das funções de cálculo de tokens e validação no endpoint HTTP.

**Organization**: Tarefas agrupadas por fases e user story (US1–US3) para permitir implementação e validação incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3
- Caminhos de arquivo exatos incluídos em cada descrição

---

## Phase 1: Token Measurement Module (US1)

**Purpose**: Implementar o módulo `src/context/tokens.ts` e sua suíte de testes unitários determinísticos.

- [x] T001 [US1] Criar `src/context/tokens.ts` contendo as interfaces `TokenUsage`, `ContextBreakdown` e a função pura `estimateTokens(text: string): number` usando `Math.ceil(chars / 4)`
- [x] T002 [US1] Implementar `extractTokenUsage(messages: unknown[]): TokenUsage` em `src/context/tokens.ts` inspecionando `usage_metadata` e `response_metadata.token_usage`
- [x] T003 [US1] Implementar `calculateContextBreakdown(params): ContextBreakdown` em `src/context/tokens.ts` discriminando `userMessage`, `history`, `memories` e `totalEstimated`
- [x] T004 [US1] Criar `src/context/tokens.test.ts` cobrindo `estimateTokens`, `extractTokenUsage` com objetos simulados de `AIMessage` e `calculateContextBreakdown`

**Checkpoint**: ✅ `tokens.ts` e `tokens.test.ts` passando; `npm run typecheck` verde.

---

## Phase 2: Agent Strategies & Types Extension (US1)

**Purpose**: Estender a interface de métricas e extrair consumo de tokens no agente ReAct.

- [x] T005 [US1] Atualizar `Metrics` em `src/agents/types.ts` adicionando `promptTokens?: number`, `completionTokens?: number`, `totalTokens?: number` e `contextBreakdown?: ContextBreakdown`
- [x] T006 [US1] Atualizar `src/agents/react.ts` para extrair o usage real a partir de `resultMessages` usando `extractTokenUsage` e preencher as métricas retornadas

**Checkpoint**: ✅ Estratégias compilando com tipagem atualizada; `npm run typecheck` verde.

---

## Phase 3: HTTP Endpoint `/chat` Integration (US2)

**Purpose**: Incorporar `contextBreakdown` e `promptTokens` no `ChatResponse.metrics`.

- [x] T007 [US2] Atualizar a interface `ChatResponse` em `src/http/server.ts` para incluir `promptTokens` e `contextBreakdown` em `metrics`
- [x] T008 [US2] No handler do `POST /chat` em `src/http/server.ts`, calcular `contextBreakdown` e preencher `promptTokens` (real da estratégia com fallback para `contextBreakdown.totalEstimated`)
- [x] T009 [US2] Atualizar `src/http/server.test.ts` com testes validando que `metrics.promptTokens` e `metrics.contextBreakdown` são retornados e que `contextBreakdown.history` cresce ao longo dos turnos

**Checkpoint**: ✅ Testes do servidor passando; `npm run typecheck` verde.

---

## Phase 4: Long Conversation Demo Scripts (US3)

**Purpose**: Fornecer scripts automatizados de demonstração de conversa longa com relatório por turno.

- [x] T010 [US3] Criar `conversa-longa.sh` com permissão de execução, executando ao menos 4 turnos contínuos via `curl` e exibindo `promptTokens` e `contextBreakdown` por turno
- [x] T011 [US3] [P] Criar `conversa-longa.ps1` com paridade funcional para PowerShell no ambiente Windows

**Checkpoint**: ✅ Scripts criados e funcionais.

---

## Phase 5: Final Validation & Polish

**Purpose**: Validar toda a suíte de testes com os novos arquivos incluídos no `package.json`.

- [x] T012 Atualizar `package.json` incluindo `src/context/tokens.test.ts` no comando `test`
- [x] T013 Executar `npm run typecheck` e `npm test` em 100% da suíte
- [x] T014 Atualizar o relatório em `walkthrough.md`
