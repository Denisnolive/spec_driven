# Implementation Plan: Grafo Unificado de Produção (Production Graph)

**Branch**: `011-production-graph` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-production-graph/spec.md`

## Summary

Implementar o `ProductionGraph` (`src/agents/production-graph.ts`) para orquestrar o ciclo completo do agente autônomo do OpsPilot utilizando LangGraph (`StateGraph`). O grafo unifica:
1. **Nó `contexto`**: Montagem centralizada via `ContextBuilder` aplicando os orçamentos por seção (`CONTEXT_BUDGET_*`).
2. **Nó `roteador`**: Decisão autônoma com `withStructuredOutput` (`route`, `reason`) orientada por matriz comparativa no prompt do sistema.
3. **Nós de Estratégias (`react`, `plan-and-execute`, `reflection`)**: Execução da estratégia de raciocínio escolhida como nós especializados do grafo.
4. **Nó `resposta`**: Consolidação da resposta final e unificação de métricas.
5. **Observabilidade Granular**: Inclusão do tipo `'route'` em `TraceEventKind` e propagação do identificador do nó (`node`) em 100% dos eventos de trace.
6. **Integração com `POST /chat`**: O parâmetro `strategy` torna-se opcional; caso fornecido, atua como override manual, registrado no trace sem custo de LLM adicional.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true` no `tsconfig.json`)

**Primary Dependencies**:
- `@langchain/langgraph`: `StateGraph`, `Annotation`, `START`, `END`
- `@langchain/core`: tipos de mensagens e modelos
- `zod`: contratos de roteamento e validação de requisição HTTP
- `ContextBuilder`: componente de orçamento de contexto (`src/context/context-builder.ts`)

**Storage**: SQLite (`SqliteConversationStore`, `SqliteMemoryStore`) integrado nos nós de contexto e resposta.

**Testing**: `node:test` via `tsx`, com mocks de modelo para testes rápidos e determinísticos.

**Target Platform**: Node.js 22 LTS (Windows / Linux)

**Project Type**: Orquestrador de Agente de IA (State Graph / Multi-Strategy Agent)

**Performance Goals**:
- Roteamento com override manual: $< 5$ms de latência interna sem chamada ao LLM.
- Roteamento autônomo: 1 chamada única estruturada ao modelo.
- Propagação de trace e redução de estado imutável sem overhead perceptível ($< 2$ms).

**Constraints**:
- 100% dos eventos de trace gerados no grafo devem possuir o campo `node` preenchido.
- Se `strategy` for fornecido no `/chat`, o roteador deve respeitar o override sem chamar o LLM de classificação.
- O prompt do roteador deve conter obrigatoriamente a tabela Markdown de decisão operacional.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Tipagem estrita em todos os nós, sem `any`, imports `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. Schema `RouterOutputSchema` em `contracts/production-graph.contract.ts` e validação de rota HTTP em `server.ts`.
- **III. Arquitetura em Camadas (MVC)** — PASS. Grafo reside em `src/agents/production-graph.ts`, consumido pelo controller HTTP `server.ts`.
- **IV. Test-First** — PASS. Suíte `production-graph.test.ts` e novos testes em `server.test.ts`.
- **V. Funções Puras e Efeitos Isolados** — PASS. Nós do grafo recebem estado imutável e retornam deltas parciais de estado.
- **VI. Gestão de Secrets** — PASS. Uso estrito de variáveis de ambiente via `--env-file=.env`.

## Project Structure

### Documentation (this feature)

```text
specs/011-production-graph/
├── spec.md              # Requisitos funcionais, cenários e critérios de aceitação
├── plan.md              # Este plano de implementação
├── research.md          # Análise arquitetural e desenho dos nós do grafo
├── data-model.md        # StateAnnotation, esquemas Zod e diagramas de transição
├── quickstart.md        # Guia de teste e verificação rápida
└── contracts/
    └── production-graph.contract.ts # Schemas Zod de roteador e traces
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── types.ts                  # Atualizado com kind 'route' e campo 'node?: string' em TraceEvent
│   ├── production-graph.ts       # NOVO — StateGraph unificado (contexto, roteador, 3 estratégias, resposta)
│   ├── production-graph.test.ts  # NOVO — Testes do grafo, nós, roteador e tags 'node'
│   └── index.ts                  # Exportação do ProductionGraph e tipos
└── http/
    ├── server.ts                 # /chat: strategy opcional, delegação ao grafo e suporte a override
    └── server.test.ts            # Testes com strategy ausente (roteamento automático) e presente (override)
```

## Implementation Phases

### Phase 0: Research & Outline (Concluída)
- Mapeada a transição dos nós no LangGraph (`START → contexto → roteador → [react | plan-and-execute | reflection] → resposta → END`).
- Estruturada a tabela matricial de decisão para o prompt do roteador.
- Consolidado em `research.md`.

### Phase 1: Data Model & Contracts (Concluída)
- Especificado `ProductionGraphState` com `Annotation.Root`.
- Criado `production-graph.contract.ts` com schemas Zod.
- Documentado em `data-model.md`.

### Phase 2: Extensão de Tipos e Implementação do `ProductionGraph`
1. Atualizar `src/agents/types.ts`:
   - Adicionar `'route'` em `TraceEventKind`.
   - Adicionar `node?: string` em `TraceEvent`.
2. Implementar `src/agents/production-graph.ts`:
   - Construção do `StateGraph(ProductionGraphAnnotation)`.
   - Nó `contexto`: invoca `ContextBuilder` e normaliza histórico/memórias.
   - Nó `roteador`: verifica override; se ausente, executa `model.withStructuredOutput` com a tabela no prompt; emite evento `route` com `node: 'roteador'`.
   - Nós executores (`react`, `plan-and-execute`, `reflection`): rodam a estratégia específica e etiquetam todos os eventos do trace com o nome do nó.
   - Nó `resposta`: formata a resposta final, consolida `metrics` e emite evento `answer` com `node: 'resposta'`.
   - Compilação do grafo com bordas condicionais.
3. Exportar em `src/agents/index.ts`.
4. Criar `src/agents/production-graph.test.ts`:
   - Teste de roteamento para cada uma das 3 rotas.
   - Teste de override manual (sem chamada de LLM no roteador).
   - Teste de validação do campo `node` em 100% dos eventos de trace.
   - Teste de integração do nó contexto com orçamentos.

### Phase 3: Atualização do Servidor HTTP (`src/http/server.ts`)
1. Atualizar `ChatRequestSchema`:
   - `strategy: z.string().trim().optional()` (sem default forçado para `'react'`).
2. Adaptar o endpoint `POST /chat`:
   - Invocar o `ProductionGraph` repassando `strategy` como `strategyOverride`.
   - Devolver `trace` com o novo evento `route` e os identificadores `node`.
3. Atualizar e rodar `src/http/server.test.ts`:
   - Testar requisições sem campo `strategy`.
   - Testar requisições com override de estratégia.
4. Executar checagem estrita (`npm run typecheck`) e suíte completa (`npm test`).

## Complexity Tracking

*Nenhuma violação constitucional detectada. O LangGraph já integra a stack oficial do projeto.*
