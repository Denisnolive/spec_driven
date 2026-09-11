# Implementation Plan: Resiliência de Modelo com Fallback e Retries

**Branch**: `012-model-fallback` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-model-fallback/spec.md`

## Summary

Implementar resiliência e alta disponibilidade cognitiva no OpsPilot através de:
1. **Configuração de Ambiente**: Inclusão de `OPENROUTER_MODEL_FALLBACK` no `.env`.
2. **Fábrica `model.ts` Resiliente**: Configurar o modelo primário com `.withRetry(...)` e failover transparente para o modelo de contingência via `.withFallbacks([fallbackModel])`. Garantir que os métodos `.invoke()`, `.bindTools()` e `.withStructuredOutput()` suportem a cadeia resiliente de ponta a ponta.
3. **Observabilidade Granular**:
   - Inclusão do tipo `'fallback'` em `TraceEventKind` e metadados (`fromModel`, `toModel`, `error`) em `TraceEvent`.
   - Inclusão do campo `modelUsed?: string` em `Metrics`, registrando com precisão qual modelo atendeu a chamada com sucesso.
4. **Tratamento de Exaustão Total (HTTP 503)**:
   - Se o modelo primário (após esgotar retries) e o modelo reserva falharem, o endpoint `POST /chat` em `src/http/server.ts` responderá com código de status HTTP **503 (Service Unavailable)**.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true` no `tsconfig.json`)

**Primary Dependencies**:
- `@langchain/openai`: `ChatOpenAI`
- `@langchain/core`: `Runnable`, `RunnableWithFallbacks`, `RunnableRetry`
- `zod`: contratos de eventos e validação de requisições HTTP

**Storage**: SQLite (`SqliteConversationStore`, `SqliteMemoryStore`) inalterado.

**Testing**: `node:test` via `tsx`, suítes unitárias com FakeListChatModel / mocks de fallback e testes de integração HTTP via supertest/express.

**Target Platform**: Node.js 22 LTS (Windows / Linux)

**Project Type**: Camada de Resiliência de IA (LLM Fault Tolerance & Observability)

**Performance Goals**:
- Retries no primário: máximo de 2 tentativas (`stopAfterAttempt: 2`) com backoff para não ultrapassar o timeout de 180s.
- Failover para o modelo reserva: acionamento imediato após a última tentativa do primário falhar.
- Inclusão de evento `fallback` e `modelUsed`: overhead de processamento $< 1$ms.

**Constraints**:
- Retrocompatibilidade total: nenhum nó existente do LangGraph ou agente (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`, `LearningReflector`) deve precisar de reescrita manual de chamadas a modelo.
- Se o primário responder com sucesso (mesmo após retry), `metrics.modelUsed` deve apontar para o primário e nenhum evento `fallback` deve constar no trace.
- Se ambos os modelos falharem, o endpoint `/chat` deve obrigatoriamente retornar HTTP 503.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Tipagem estrita, sem uso de `any`, imports `.js` mantidos.
- **II. Validação na Fronteira (Zod)** — PASS. Schemas em `contracts/model-fallback.contract.ts` e validação nos endpoints HTTP.
- **III. Arquitetura em Camadas** — PASS. Fábrica encapsulada em `src/agents/model.ts`, consumida pelos agentes e nós do grafo, capturada no controller em `src/http/server.ts`.
- **IV. Test-First** — PASS. Testes dedicados em `src/agents/model.test.ts` e novos casos em `src/http/server.test.ts`.
- **V. Gestão de Secrets** — PASS. Leitura de variáveis através de `process.env` e `--env-file=.env`.

## Project Structure

### Documentation (this feature)

```text
specs/012-model-fallback/
├── spec.md              # Requisitos funcionais, cenários e critérios de aceitação
├── plan.md              # Este plano de implementação
├── research.md          # Análise técnica e compatibilidade do LangChain
├── data-model.md        # Schemas Zod, tipos de eventos e diagramas de resiliência
├── quickstart.md        # Guia de teste e verificação rápida
├── contracts/
│   └── model-fallback.contract.ts # Contratos de fallback, métricas e erro 503
├── checklists/
│   └── requirements.md  # Checklist de qualidade da especificação
└── tasks.md             # Tarefas de implementação (geradas no próximo passo /speckit.tasks)
```

### Source Code (repository root)

```text
.env                             # Adição de OPENROUTER_MODEL_FALLBACK
src/
├── agents/
│   ├── types.ts                 # Adição de kind 'fallback' e campos em TraceEvent e Metrics (modelUsed)
│   ├── model.ts                 # Fábrica createModel com withRetry e withFallbacks
│   ├── model.test.ts            # NOVO: Testes unitários de resiliência, fallback e métricas
│   └── ...                      # Agentes existentes consumindo createModel normalmente
├── graph/
│   └── production-graph.ts      # Propagação de metrics.modelUsed e eventos fallback no trace
└── http/
    ├── server.ts                # Mapeamento de falha de modelo para HTTP 503 e exposição de modelUsed
    └── server.test.ts           # Testes de integração HTTP cobrindo fallback e erro 503
```

## Implementation Phases

### Phase 0: Research & Foundation (Concluída)
- Validado comportamento do LangChain com `withRetry` e `withFallbacks`.
- Verificada necessidade de encapsular `bindTools` e `withStructuredOutput` no retorno da fábrica para manter retrocompatibilidade.
- Documentado em `research.md`.

### Phase 1: Data Model, Contracts & Quickstart (Concluída)
- Criado `model-fallback.contract.ts` com schemas Zod.
- Documentado `data-model.md` e `quickstart.md`.

### Phase 2: Tipos e Fábrica Resiliente de Modelos
1. Atualizar `src/agents/types.ts`:
   - Adicionar `'fallback'` em `TraceEventKind`.
   - Adicionar `fromModel?: string`, `toModel?: string`, `error?: string` em `TraceEvent`.
   - Adicionar `modelUsed?: string` em `Metrics`.
2. Atualizar `.env` com `OPENROUTER_MODEL_FALLBACK`.
3. Atualizar `src/agents/model.ts`:
   - Instanciar modelo primário com `withRetry({ stopAfterAttempt: 2 })`.
   - Instanciar modelo reserva com fallback.
   - Fornecer wrapper transparente para `invoke`, `bindTools` e `withStructuredOutput` que propaga callbacks e rastreia o modelo ativo.
4. Criar `src/agents/model.test.ts`:
   - Testar sucesso no primário (sem fallback, `modelUsed` = primário).
   - Testar retry no primário com sucesso.
   - Testar failover para o reserva e emissão do evento `fallback`.
   - Testar erro quando ambos falham.

### Phase 3: Integração no Grafo e Servidor HTTP
1. Atualizar `src/graph/production-graph.ts`:
   - Consolidar `metrics.modelUsed` na resposta final do grafo.
   - Garantir que eventos de fallback sejam integrados ao trace acumulado com a identificação do nó em execução.
2. Atualizar `src/http/server.ts`:
   - Incluir `modelUsed` na interface `ChatResponse`.
   - Capturar falha de esgotamento de modelos e responder com HTTP 503 (`Service Unavailable`).
3. Atualizar `src/http/server.test.ts`:
   - Testar requisição com sucesso no fallback.
   - Testar requisição com falha total retornando 503.

### Phase 4: Validação e Testes
1. Executar `npm run typecheck` para garantir zero erros de tipagem estrita.
2. Executar `npm test` para assegurar que todos os 134 testes existentes e novos continuem 100% verdes.
