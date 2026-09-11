# Implementation Plan: ContextBuilder com Orçamento por Seção

**Branch**: `010-context-builder-budget` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-context-builder-budget/spec.md`

## Summary

Implementar o componente `ContextBuilder` (`src/context/context-builder.ts`) para centralizar e unificar a montagem de prompts de todas as estratégias de raciocínio (`ReAct`, `Plan-and-Execute`, `Reflection`) e endpoints HTTP (`server.ts`). O `ContextBuilder` impõe orçamentos estritos de tokens por seção configuráveis via variáveis de ambiente `CONTEXT_BUDGET_*`:
- `system` e `message`: intocáveis (nunca sofrem descarte ou truncamento).
- `summary`: teto padrão de 200 tokens (`CONTEXT_BUDGET_SUMMARY`), truncando de forma segura se exceder.
- `window` / `history`: teto padrão de 1200 tokens (`CONTEXT_BUDGET_WINDOW` com fallback para `CONTEXT_BUDGET_HISTORY`), cortando as mensagens mais antigas primeiro (FIFO pruning).
- `memories`: teto padrão de 300 tokens (`CONTEXT_BUDGET_MEMORIES`), cortando as memórias com menor pontuação vetorial (`score`) primeiro (preservando as mais relevantes).

A suíte de testes `src/context/context-builder.test.ts` cobrirá cenários de tetos baixos para comprovar matematicamente que os cortes ocorrem na ordem exata definida.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true` no `tsconfig.json`)

**Primary Dependencies**:
- `@langchain/core`: tipos de mensagens (`BaseMessage`, `SystemMessage`, `HumanMessage`, `AIMessage`)
- `zod`: validação na fronteira de configuração e entradas do builder
- Heurística de tokens de `src/context/tokens.ts` (`estimateTokens`, `calculateContextBreakdown`)

**Storage**: N/A (componente em memória; integra com dados originários do `SqliteMemoryStore` e `SqliteConversationStore`).

**Testing**: `node:test` via `tsx`, determinístico e rápido, sem dependências de rede externa.

**Target Platform**: Node.js 22 LTS (Windows / Linux)

**Project Type**: Módulo de orquestração de contexto (Context Engine / AI Agent Layer)

**Performance Goals**:
- Montagem e poda de contexto em $< 2$ms para históricos típicos (até 100 turnos) e até 50 memórias.
- Complexidade de tempo $O(N \log N)$ para ordenação de memórias e $O(M)$ para varredura do histórico reverso.

**Constraints**:
- `system` e `mensagem atual` NUNCA são podadas (0% de descarte nessas seções).
- Poda de histórico: estritamente FIFO (as mensagens mais antigas são as primeiras a serem eliminadas).
- Poda de memórias: estritamente Score-First (as de menor score são as primeiras eliminadas).
- Suporte a overrides por chamada para possibilitar testes com tetos baixos.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita estrita, sem `any` implícito, imports ESM com extensão `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. Schemas Zod em `contracts/context-builder.contract.ts` validam entradas e configurações de orçamento.
- **III. Arquitetura em Camadas (MVC)** — PASS. `ContextBuilder` pertence à camada de contexto de negócio (`context/`), isolado de I/O de banco e controladores HTTP.
- **IV. Test-First** — PASS. Suíte unitária `context-builder.test.ts` e testes de integração com `node:test` verdes antes de finalizar.
- **V. Funções Puras e Efeitos Isolados** — PASS. O `ContextBuilder` é uma classe/módulo puro que recebe entradas e retorna o contexto construído sem efeitos colaterais mutáveis em banco ou variáveis globais.
- **VI. Gestão de Secrets** — PASS. Apenas variáveis de configuração de orçamento (`CONTEXT_BUDGET_*`) são lidas; nenhum secret envolvido.

## Project Structure

### Documentation (this feature)

```text
specs/010-context-builder-budget/
├── spec.md              # Requisitos funcionais e cenários de aceitação
├── plan.md              # Este plano de implementação
├── research.md          # Decisões de arquitetura e algoritmos de poda
├── data-model.md        # Entidades, interfaces e fluxo de transformação
├── quickstart.md        # Guia prático de validação e comandos de teste
└── contracts/
    └── context-builder.contract.ts # Schemas Zod e interfaces
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts                 # Heurística estimateTokens e breakdown
│   ├── tokens.test.ts            # Testes de tokens existentes
│   ├── summarizer.ts             # HistorySummarizer existente
│   ├── context-builder.ts        # NOVO — ContextBuilder com orçamentos e poda determinística
│   └── context-builder.test.ts   # NOVO — Testes com tetos baixos e ordem de corte
├── agents/
│   ├── types.ts                  # Atualizado com suporte a BuiltContext em StrategyInput
│   ├── react.ts                  # Integrado com ContextBuilder
│   ├── plan-and-execute.ts       # Integrado com ContextBuilder
│   └── reflection.ts             # Integrado com ContextBuilder
└── http/
    ├── server.ts                 # Integrado com ContextBuilder no endpoint /chat
    └── server.test.ts            # Testes de integração de contexto preservados e expandidos
```

## Implementation Phases

### Phase 0: Outline & Research (Concluída)
- Mapeadas as heurísticas de token em `tokens.ts`.
- Definido algoritmo de poda reversa (FIFO) para histórico.
- Definido algoritmo de corte por menor score para memórias.
- Consolidado em `research.md`.

### Phase 1: Design & Contratos (Concluída)
- Definido modelo de dados em `data-model.md`.
- Criado contrato Zod em `contracts/context-builder.contract.ts`.
- Criado guia de execução em `quickstart.md`.

### Phase 2: Implementação do `ContextBuilder` e Testes Unitários
1. Criar `src/context/context-builder.ts`:
   - Leitura de `process.env.CONTEXT_BUDGET_SUMMARY` (padrão 200), `CONTEXT_BUDGET_WINDOW` / `CONTEXT_BUDGET_HISTORY` (padrão 1200), `CONTEXT_BUDGET_MEMORIES` (padrão 300).
   - Método `build(input: ContextBuilderInput): BuiltContext`.
   - Lógica de poda de memórias ordenando por `score` desc.
   - Lógica de poda de histórico iterando do mais recente para o mais antigo.
   - Truncamento limpo de resumo caso ultrapasse `budget.summary`.
   - Montagem de `messages`, `promptMessage`, `breakdown` e `stats`.
2. Criar `src/context/context-builder.test.ts`:
   - Teste 1: Tetos padrão sem cortes quando o volume é pequeno.
   - Teste 2: Teto baixo de histórico descarta as mensagens mais antigas e preserva as mais recentes.
   - Teste 3: Teto baixo de memórias descarta as de menor score primeiro.
   - Teste 4: System prompt e mensagem do usuário permanecem 100% íntegros mesmo com tetos zerados.
   - Teste 5: Truncamento de resumo excedente.
   - Teste 6: Carregamento a partir de variáveis de ambiente `CONTEXT_BUDGET_*`.

### Phase 3: Integração nas Estratégias e no Servidor HTTP
1. Atualizar `src/http/server.ts`:
   - Usar `ContextBuilder` para consolidar o prompt e calcular breakdown antes de repassar à estratégia.
2. Atualizar estratégias (`src/agents/react.ts`, `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`):
   - Consumir o contexto gerado pelo `ContextBuilder`.
3. Validar regressões:
   - Executar `npm run typecheck` e `npm test`.

## Complexity Tracking

*Nenhuma violação constitucional detectada. O `ContextBuilder` é uma extensão natural e pura da camada `context/`, sem adição de dependências externas ou bancos adicionais.*
