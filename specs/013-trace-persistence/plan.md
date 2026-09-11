# Implementation Plan: Persistência de Trace e Logs Estruturados em JSON

**Branch**: `013-trace-persistence` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-trace-persistence/spec.md`

## Summary

Implementar a camada de rastreabilidade de requisições, persistência de eventos de trace e observabilidade estruturada no OpsPilot:
1. **Rastreabilidade no `/chat`**: Propagar `requestId` (lido do header `X-Request-Id` ou gerado via `crypto.randomUUID()`), adicionando-o ao header de resposta e ao corpo JSON.
2. **Persistência Relacional em SQLite**:
   - Tabela `requests`: armazena dados e métricas consolidadas das requisições atendidas.
   - Tabela `trace_events`: armazena individualmente cada passo de execução do trace ordenado por sequência (`seq`).
   - Store tipada (`SqliteTraceStore`) utilizando SQLite nativo (`node:sqlite DatabaseSync`) com prepared statements.
3. **Logger Estruturado em Linha Única (`src/obs/logger.ts`)**:
   - Emissão de logs em formato NDJSON (1 linha física por evento) contendo exclusivamente metadados operacionais e identificadores de correlação.
4. **Endpoint de Consulta Diagnóstica**:
   - `GET /requests/:id`: recupera os dados consolidados da requisição e seu respectivo array de trace estritamente ordenado por sequência cronológica (ou HTTP 404 caso não encontrado).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true` no `tsconfig.json`)

**Primary Dependencies**:
- `node:sqlite`: `DatabaseSync` nativo para operações relacionais síncronas de alta performance
- `node:crypto`: `randomUUID` nativo para geração de IDs
- `express`: rotas HTTP (`POST /chat`, `GET /requests/:id`)
- `zod`: validação de requisições e contratos de dados

**Storage**: SQLite (`DatabaseSync`) reutilizando a mesma base (`data/opspilot.db` ou `:memory:` em testes).

**Testing**: `node:test` via `tsx` com testes unitários da store (`sqlite-trace-store.test.ts`) e testes de integração HTTP em `server.test.ts`.

**Target Platform**: Node.js 22 LTS (Windows / Linux)

**Project Type**: Camada de Observabilidade e Persistência de Telemetria (Trace Persistence & Structured Logging)

**Performance Goals**:
- Persistência em lote de trace events: $< 2$ms de tempo de execução síncrono.
- Formatação e emissão de log JSON: $< 0.1$ms por evento.
- Consulta `GET /requests/:id`: $< 5$ms com uso do índice `idx_trace_events_request_seq`.

**Constraints**:
- Não vazar payloads integrais ou textos desnecessários nos logs JSON de `src/obs/logger.ts` (apenas metadados).
- Garantir integridade referencial com chave estrangeira `requests(id)`.
- Suportar falhas de execução no `/chat` (como 500 ou 503) garantindo que a requisição seja persistida com o status HTTP correspondente.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Tipagem estrita mantida, sem `any`, imports `.js` mantidos.
- **II. Validação na Fronteira (Zod)** — PASS. Schemas em `contracts/trace-persistence.contract.ts` e validação Zod no endpoint `GET /requests/:id`.
- **III. Arquitetura em Camadas** — PASS. `SqliteTraceStore` isola a persistência SQLite nativa (`node:sqlite DatabaseSync`) e preparada. `src/obs/logger.ts` isola a saída de logs. Controllers apenas orquestram chamadas e tratam códigos HTTP.
- **IV. Test-First** — PASS. Novos testes unitários (`src/store/sqlite-trace-store.test.ts`, `src/obs/logger.test.ts`) e testes no servidor HTTP (`src/http/server.test.ts`).
- **V. Funções Puras e Efeitos Isolados** — PASS. Logger e Store recebem streams/bancos injetáveis para testes sem efeitos colaterais incontroláveis.
- **VI. Gestão de Secrets** — PASS. Nenhuma credencial ou secret impressa em logs ou código.

## Project Structure

### Documentation (this feature)

```text
specs/013-trace-persistence/
├── spec.md              # Requisitos funcionais, cenários e critérios de aceitação
├── plan.md              # Este plano de implementação
├── research.md          # Análise técnica e decisões arquiteturais
├── data-model.md        # Schemas DDL, tipos de entidades e diagramas ERD
├── quickstart.md        # Guia de validação rápida e comandos
├── contracts/
│   └── trace-persistence.contract.ts # Contratos Zod para validação e tipagem
├── checklists/
│   └── requirements.md  # Checklist de qualidade da especificação
└── tasks.md             # Tarefas de implementação (geradas no próximo passo /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── obs/
│   ├── logger.ts                # NOVO: Logger estruturado JSON em 1 linha (só metadados)
│   └── logger.test.ts           # NOVO: Testes unitários do logger JSON
├── store/
│   ├── trace-store.ts           # NOVO: Interfaces RequestRecord, TraceEventRecord, TraceStore
│   ├── sqlite-trace-store.ts    # NOVO: Implementação SQLite com DatabaseSync e índices
│   └── sqlite-trace-store.test.ts # NOVO: Testes unitários de persistência e ordenação
├── http/
│   ├── server.ts                # Atualização: suporte a X-Request-Id, GET /requests/:id e persistência
│   └── server.test.ts           # Atualização: testes de integração de requestId, persistência e GET /requests/:id
└── index.ts                     # Atualização: inicialização com SqliteTraceStore conectada
```

## Implementation Phases

### Phase 0: Research & Foundation (Concluída)
- Decisões de SQLite nativo com `node:sqlite DatabaseSync`, índices de ordenação determinística por `seq`.
- Especificação de formato NDJSON (linha única) para `src/obs/logger.ts`.
- Documentado em `research.md`.

### Phase 1: Data Model, Contracts & Quickstart (Concluída)
- Criado `trace-persistence.contract.ts` com schemas Zod.
- Documentado `data-model.md` com ERD e DDL.
- Documentado `quickstart.md` com cenários de teste curl.

### Phase 2: Implementação da Store e Logger
1. Criar `src/store/trace-store.ts` com as interfaces tipadas de persistência.
2. Criar `src/store/sqlite-trace-store.ts` com DDL das tabelas `requests` e `trace_events`, métodos `saveRequest` e `getRequest`.
3. Criar `src/store/sqlite-trace-store.test.ts` validando escrita e leitura ordenada.
4. Criar `src/obs/logger.ts` com formatação NDJSON e filtros de metadados.
5. Criar `src/obs/logger.test.ts` validando saída estrita de 1 linha.

### Phase 3: Integração HTTP e Endpoints
1. Atualizar `src/http/server.ts`:
   - Interceptar e propagar `X-Request-Id` no header e corpo do `POST /chat`.
   - Persistir a requisição e o trace via `TraceStore` ao finalizar o chat (sucesso ou erro).
   - Adicionar rota `GET /requests/:id` retornando a requisição e o trace ordenado (ou 404).
   - Acionar emissão de logs via `src/obs/logger.ts`.
2. Atualizar `src/http/server.test.ts` cobrindo todos os cenários.
3. Atualizar `src/index.ts` e verificar que `npm test` e `npm run typecheck` rodam com 100% de sucesso.
