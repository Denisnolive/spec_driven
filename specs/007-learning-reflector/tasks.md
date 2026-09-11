---
description: "Task list for learning reflector and forget_preference implementation"
---

# Tasks: Refletor de Aprendizado & Tool `forget_preference`

**Input**: Design documents from `/specs/007-learning-reflector/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001 a SC-005) exigem cobertura unitária determinística e testes do refletor, da tool e da orquestração assíncrona.

**Organization**: Tarefas agrupadas por fases e user story (US1–US3) para permitir implementação e validação incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3
- Caminhos de arquivo exatos incluídos em cada descrição

---

## Phase 1: Contracts & Learning Reflector (US1)

**Purpose**: Definir o schema Zod de aprendizado e implementar a função `reflectLearning` com `withStructuredOutput` e guardrails rigorosos.

- [x] T001 [US1] Criar `src/memory/reflector.ts` contendo `LearningSchema` (Zod: `hasLearning: boolean`, `fact?: string`)
- [x] T002 [US1] Implementar a função `reflectLearning(userMessage: string, model?)` em `src/memory/reflector.ts` com System Prompt detalhado (regras de fatos duráveis vs pedidos pontuais vs segredos)
- [x] T003 [P] Atualizar `src/memory/index.ts` re-exportando `reflector.ts`
- [x] T004 [US1] Criar `src/memory/reflector.test.ts` com testes determinísticos via mock model cobrindo:
  - Fato durável legítimo (preferência de rotina, responsabilidade) $\rightarrow$ `hasLearning: true`
  - Pedido pontual de operação ("abra incidente", "liste alertas") $\rightarrow$ `hasLearning: false`
  - Segredos e credenciais (chaves, senhas, tokens) $\rightarrow$ `hasLearning: false`

**Checkpoint**: ✅ `reflector.ts` e `reflector.test.ts` compilando; `npm run typecheck` verde.

---

## Phase 2: Agent Tool `forget_preference` (US3)

**Purpose**: Implementar a tool `forget_preference` para permitir a exclusão de memórias em linguagem natural ou por ID.

- [x] T005 [US3] Em `src/agents/tools.ts`, definir `forgetPreferenceSchema` com campos `query` e `memoryId` opcional
- [x] T006 [US3] Em `src/agents/tools.ts`, adicionar setters e estado ativo para `MemoryStore` (`setActiveMemoryStore`, `getActiveMemoryStore`) e `userId` (`setActiveUserId`, `getActiveUserId`)
- [x] T007 [US3] Em `src/agents/tools.ts`, implementar a tool `forgetPreference`:
  - Se `memoryId` estiver presente, remove diretamente via `memoryStore.forget`
  - Se `query` estiver presente, executa `memoryStore.recall(userId, query, 1, 0.3)` e remove a memória mais relevante
  - Retorna resultado estruturado amigável
- [x] T008 [US3] Adicionar `forgetPreference` ao array `opsTools` e atualizar a união `ToolName`
- [x] T009 [US3] Criar testes para `forgetPreference` em `src/agents/tools.test.ts` cobrindo exclusão por query, exclusão por ID e caso onde nenhuma memória é encontrada

**Checkpoint**: ✅ Tool integrada e validada em testes unitários; `npm run typecheck` verde.

---

## Phase 3: Asynchronous Integration in `/chat` (US2)

**Purpose**: Disparar o refletor de aprendizado em segundo plano no endpoint `/chat` sem bloquear a resposta HTTP.

- [x] T010 [US2] Atualizar `ServerOptions` em `src/http/server.ts` para incluir `reflectorModel?: any`
- [x] T011 [US2] No handler do `POST /chat` em `src/http/server.ts`, disparar `reflectLearning` assincronamente após gerar a resposta (fire-and-forget com proteção de erro `try/catch`), persistindo o fato via `memoryStore.remember(userId, fact)`
- [x] T012 [US2] Atualizar `src/http/server.test.ts` com teste de integração validando que o aprendizado em background grava o fato no `memoryStore` fornecido

**Checkpoint**: ✅ Testes do servidor passando; `npm run typecheck` verde.

---

## Phase 4: Full Validation & Polish

**Purpose**: Executar e validar toda a suíte com o novo arquivo de testes incluído no `package.json`.

- [x] T013 Atualizar `package.json` adicionando `src/memory/reflector.test.ts` ao script `test`
- [x] T014 Executar `npm run typecheck` e `npm test` em 100% dos testes
- [x] T015 Gerar relatório em `walkthrough.md` com os resultados
