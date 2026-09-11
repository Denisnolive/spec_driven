# Implementation Plan: Conversa Persistente (ConversationStore + histório no prompt)

**Branch**: `005-conversation-persistence` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-conversation-persistence/spec.md`

## Summary

Implementar persistência de conversas no OpsPilot através de um `ConversationStore` (interface + implementação SQLite + implementação in-memory) que gerencia conversas e mensagens em duas tabelas novas (`conversations`, `messages`) no mesmo banco SQLite existente. O endpoint `POST /chat` é estendido com `conversationId` opcional no request (validado como UUID via Zod); quando ausente, cria nova conversa; quando presente, carrega as 12 últimas mensagens e as injeta no prompt como histórico serializado em texto. O `conversationId` é sempre devolvido na resposta junto com a nova métrica `historyMessages`. A composição de histórico acontece na camada HTTP (antes de `strategy.run()`) via serialização textual, preservando a interface `ReasoningStrategy` inalterada. Testes cobrem o store em `:memory:` e o endpoint com `InMemoryConversationStore` fake.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**: `express`, `zod`, `node:sqlite` (`DatabaseSync`), `node:crypto` (`randomUUID`)

**Storage**: SQLite nativo (`node:sqlite` / `DatabaseSync`) — mesmo banco do `SqliteOpsStore` (`OPSPILOT_DB`, padrão `./data/opspilot.db`); `:memory:` nos testes

**Testing**: `node:test` via `tsx` (`node --import tsx --test`), 100% determinístico — sem rede, sem LLM

**Target Platform**: Servidor HTTP Express (`POST /chat`), agentes ReAct e Plan-and-Execute

**Project Type**: Single project — extensão das camadas `src/store/` e `src/http/`

**Performance Goals**: Operações síncronas de SQLite (`DatabaseSync`) com latência desprezível; serialização de histórico < 1ms para 12 mensagens típicas

**Constraints**: `PRAGMA foreign_keys = ON` obrigatório para integridade referencial; prepared statements em toda query (sem SQL concatenado); UUID gerado via `crypto.randomUUID()`; composição de histórico não altera a interface `ReasoningStrategy`

**Scale/Scope**: 4 novos arquivos, 2 arquivos modificados:
- `src/store/conversation-store.ts` (~50 LOC) — interface + `InMemoryConversationStore`
- `src/store/sqlite-conversation-store.ts` (~80 LOC) — implementação SQLite
- `src/store/sqlite-conversation-store.test.ts` (~120 LOC) — testes `:memory:`
- `src/http/server.ts` (MODIFICADO) — schema Zod, composição de histórico, persistência
- `src/http/server.test.ts` (MODIFICADO) — novos cenários de `conversationId`
- `src/store/index.ts` (MODIFICADO) — re-export

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita, sem `any`, imports com extensão `.js`, ESM nativo.
- **II. Validação na Fronteira (Zod)** — PASS. O campo `conversationId` é validado com `z.string().uuid()` no schema Zod do `POST /chat`. Role das mensagens protegido por `CHECK` constraint.
- **III. Arquitetura em Camadas** — PASS. `ConversationStore` reside em `src/store/` (camada model/store); a composição de histórico e orquestração ficam em `src/http/server.ts` (camada controller). Nenhum IO direto fora da store.
- **IV. Test-First** — PASS. Testes em `:memory:` para o store SQLite e testes de integração HTTP com `InMemoryConversationStore` fake, ambos determinísticos e sem rede.
- **V. Funções Puras e Efeitos Isolados** — PASS. A serialização de histórico (`composeHistoryPrompt`) é função pura; efeitos de IO (SQLite) ficam isolados no store com interface injetável.
- **VI. Gestão de Secrets** — PASS. Nenhum secret novo; banco usa variável de ambiente existente `OPSPILOT_DB`.

**Resultado**: Nenhuma violação. Seção "Complexity Tracking" não aplicável.

## Project Structure

### Documentation (this feature)

```text
specs/005-conversation-persistence/
├── spec.md              # Especificação de requisitos
├── plan.md              # Este arquivo
└── tasks.md             # Lista de tarefas para execução
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-store.ts              # NOVO — interface ConversationStore + InMemoryConversationStore
│   ├── sqlite-conversation-store.ts       # NOVO — SqliteConversationStore (DDL, prepared statements, PRAGMA FK)
│   ├── sqlite-conversation-store.test.ts  # NOVO — testes :memory: (ciclo de vida, constraints, edge cases)
│   ├── ops-store.ts                       # inalterado
│   ├── sqlite-ops-store.ts               # inalterado
│   ├── sqlite-ops-store.test.ts           # inalterado
│   └── index.ts                           # MODIFICADO — re-export de conversation-store e sqlite-conversation-store
├── http/
│   ├── server.ts                          # MODIFICADO — ChatRequestSchema + conversationId, composição de histórico, persistência, métrica
│   └── server.test.ts                     # MODIFICADO — novos testes de conversationId (criar, continuar, 404, UUID inválido)
└── agents/
    └── types.ts                           # MODIFICADO — Metrics ganha historyMessages
```

**Structure Decision**: Mesma estrutura de camadas existente. O `ConversationStore` segue o padrão do `OpsStore` — interface em arquivo separado, implementação SQLite em arquivo próprio, implementação in-memory junto da interface. `ServerOptions` recebe o store por injeção.

## Complexity Tracking

*Nenhuma violação da Constitution Check — seção não aplicável.*
