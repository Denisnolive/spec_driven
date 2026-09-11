# Implementation Plan: Endpoint HTTP POST /chat e Registry de Estratégias

**Branch**: `002-chat-endpoint` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-chat-endpoint/spec.md`

## Summary

Implementar a camada HTTP da aplicação através de um servidor Express (`src/http/server.ts`) expondo a rota `POST /chat`. O endpoint recebe payload validado com Zod `{ message, strategy?, reflect? }`, aplicando valores padrão `strategy = 'react'` e `reflect = false`. O servidor delega a execução para o registry centralizado em `src/agents/index.ts`, que instancia a estratégia solicitada (aplicando o decorator `withReflection` quando `reflect = true`). O endpoint trata cenários de sucesso (200), validação de body (400), estratégia desconhecida (422), timeout de 180s (504) e erros internos (500). Testes de integração automatizados validam todos os cenários com estratégias determinísticas fakes sem tráfego de rede ou chamadas a APIs externas.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**: `express`, `zod`, `@langchain/core`, `@langchain/openai`

**Storage**: N/A (módulo HTTP desacoplado da persistência direta)

**Testing**: `node:test` via `tsx` (`node --import tsx --test`), testes de integração HTTP determinísticos sem chamadas remotas de rede

**Target Platform**: Node.js HTTP Server (`src/http/server.ts`)

**Project Type**: Single project — camada HTTP (`src/http/`) integrada com a camada de agentes (`src/agents/`)

**Performance Goals**: Tempo de resposta do middleware HTTP imediato; controle estrito de timeout (default: 180s) com resposta 504 limpa e sem concorrência de headers (`ERR_HTTP_HEADERS_SENT`)

**Constraints**: Sem chamadas de rede em testes de integração (usar injeção de estratégias fake no `StrategyRegistry`); validação obrigatória via Zod com detalhamento de `issues` no erro 400

**Scale/Scope**: 3 novos arquivos (`src/agents/index.ts`, `src/http/server.ts`, `src/http/server.test.ts`), mais `src/agents/reflection.ts` e ajustes em `package.json`

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita, sem `any` implícito, imports com extensão `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. O payload do `POST /chat` é validado estritamente com `ChatRequestSchema` antes de qualquer processamento.
- **III. Arquitetura em Camadas** — PASS. A camada HTTP (`src/http/server.ts`) apenas valida, orquestra e formata respostas; a lógica de negócio dos agentes reside em `src/agents/`.
- **IV. Test-First / Testes Determinísticos** — PASS. `src/http/server.test.ts` cobre 200 (com/sem reflect), 400, 422 e 504 utilizando estratégias fake em memória sem chamadas externas.
- **V. Funções Puras e Efeitos Isolados** — PASS. O registry e o timeout utilizam interfaces puras com dependências injetáveis (`ServerOptions.registry`, `ServerOptions.timeoutMs`).

## Project Structure

### Documentation (this feature)

```text
specs/002-chat-endpoint/
├── spec.md              # Especificação de requisitos
├── plan.md              # Este arquivo
├── contracts/
│   └── chat-api.md      # Contrato HTTP da rota POST /chat
└── tasks.md             # Tarefas detalhadas de implementação
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── types.ts               # Tipos comuns (ReasoningStrategy, TraceEvent, Metrics, StrategyResult)
│   ├── react.ts               # ReActStrategy
│   ├── plan-and-execute.ts    # PlanAndExecuteStrategy
│   ├── reflection.ts          # withReflection decorator
│   └── index.ts               # NOVO — StrategyRegistry, getStrategy(), exports públicos de agentes
├── http/
│   ├── server.ts              # NOVO — Servidor Express, middleware Zod, rota POST /chat, timeout 180s
│   └── server.test.ts         # NOVO — Testes de integração HTTP determinísticos
└── arena.ts                   # CLI comparativo de estratégias
```

**Structure Decision**: Camada HTTP isolada em `src/http/`, consumindo a camada de agentes através da fachada pública e registry exportado por `src/agents/index.ts`.
