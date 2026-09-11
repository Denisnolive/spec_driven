# Tasks: Persistência de Trace e Logs Estruturados em JSON

**Feature**: `013-trace-persistence`  
**Date**: 2026-09-10  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup & Infraestrutura Compartilhada

**Purpose**: Definição de contratos, interfaces de domínio e preparação da infraestrutura de testes.

- [x] T001 [P] Criar interface tipada `TraceStore`, `RequestRecord` e `TraceEventRecord` em `src/store/trace-store.ts`
- [x] T002 [P] Atualizar o script de `test` em `package.json` para incluir os novos testes `src/store/sqlite-trace-store.test.ts` e `src/obs/logger.test.ts`

---

## Phase 2: Foundational (Persistência SQLite e Modelagem)

**Purpose**: Infraestrutura de banco de dados relacional SQLite (`requests` e `trace_events`) que desbloqueia todas as histórias de usuário.

- [x] T003 Criar implementação `SqliteTraceStore` em `src/store/sqlite-trace-store.ts` com DDL das tabelas `requests` e `trace_events`, índice `idx_trace_events_request_seq` e suporte a `node:sqlite` (`DatabaseSync`)
- [x] T004 Implementar métodos `saveRequest(record, trace)` e `getRequest(id)` com transação e prepared statements em `src/store/sqlite-trace-store.ts`
- [x] T005 [P] Criar testes unitários em `src/store/sqlite-trace-store.test.ts` validando integridade relacional, inserção em lote, serialização de payload e leitura estritamente ordenada por `seq`

**Checkpoint**: Camada de banco de dados SQLite pronta e testada com banco em memória.

---

## Phase 3: User Story 1 - Rastreabilidade de Requisições com Request ID no `/chat` (Priority: P1) 🎯 MVP

**Goal**: Assegurar que cada requisição em `POST /chat` possua um identificador único de correlação (`requestId`), propagado no cabeçalho de resposta `X-Request-Id` e retornado no corpo da resposta JSON.

**Independent Test**: Enviar requisições a `POST /chat` com e sem cabeçalho `X-Request-Id`, verificando se o header de resposta e o corpo JSON contêm o mesmo identificador (gerado ou propagado).

### Tests for User Story 1
- [x] T006 [P] [US1] Escrever testes de integração em `src/http/server.test.ts` validando geração automática de UUID v4 para `X-Request-Id` e retorno de `requestId` no corpo JSON
- [x] T007 [P] [US1] Escrever testes de integração em `src/http/server.test.ts` validando a preservação de cabeçalho `X-Request-Id` customizado fornecido pelo cliente

### Implementation for User Story 1
- [x] T008 [US1] Atualizar `ChatResponse` em `src/http/server.ts` para incluir a propriedade `requestId: string`
- [x] T009 [US1] Atualizar a rota `POST /chat` em `src/http/server.ts` para capturar `X-Request-Id` do cabeçalho da requisição ou gerar com `crypto.randomUUID()`, definindo o cabeçalho de resposta e incluindo no corpo JSON

**Checkpoint**: Rastreabilidade com `requestId` funcionando e testada no endpoint `/chat`.

---

## Phase 4: User Story 2 - Persistência Relacional de Requisições e Eventos de Trace no SQLite (Priority: P1)

**Goal**: Gravar todas as requisições atendidas pelo `/chat` e todos os eventos intermediários do trace na base SQLite (`requests` e `trace_events`), tanto em cenários de sucesso quanto em erros tratados.

**Independent Test**: Realizar uma chamada ao `/chat` e consultar o `SqliteTraceStore` para verificar se a requisição e a totalidade dos eventos de trace foram persistidos com métricas e payloads íntegros.

### Tests for User Story 2
- [x] T010 [P] [US2] Escrever testes em `src/http/server.test.ts` validando que requisições concluídas com 200 OK são persistidas na `traceStore` com métricas consolidadas e eventos de trace completos
- [x] T011 [P] [US2] Escrever testes em `src/http/server.test.ts` validando que falhas (ex: timeout 504 ou indisponibilidade 503) gravam a requisição com o respectivo `statusCode` e eventos parciais

### Implementation for User Story 2
- [x] T012 [US2] Atualizar `ServerOptions` em `src/http/server.ts` para permitir injeção de `traceStore?: TraceStore` (com fallback padrão)
- [x] T013 [US2] Conectar a persistência via `traceStore.saveRequest(...)` no fluxo de sucesso e nos blocos de tratamento de erro do endpoint `POST /chat` em `src/http/server.ts`

**Checkpoint**: Todas as requisições do `/chat` e seus traces são persistidos no SQLite.

---

## Phase 5: User Story 3 - Consulta Diagnóstica de Requisição e Trace Ordenado via `GET /requests/:id` (Priority: P1)

**Goal**: Expor o endpoint HTTP `GET /requests/:id` para recuperar os detalhes consolidados de uma requisição e a lista cronologicamente ordenada de seus eventos de trace, retornando 404 para identificadores inexistentes.

**Independent Test**: Consultar `GET /requests/:id` para um ID persistido (esperando 200 OK com trace ordenado) e para um ID inexistente (esperando 404 Not Found com payload estruturado).

### Tests for User Story 3
- [x] T014 [P] [US3] Escrever testes de integração em `src/http/server.test.ts` para `GET /requests/:id` retornando 200 OK com dados da requisição e eventos ordenados por `seq`
- [x] T015 [P] [US3] Escrever testes de integração em `src/http/server.test.ts` para `GET /requests/:id` retornando 404 Not Found quando a requisição não existir

### Implementation for User Story 3
- [x] T016 [US3] Implementar o endpoint `GET /requests/:id` em `src/http/server.ts` com validação de parâmetros, busca na `traceStore` e tratamento de status 200 e 404

**Checkpoint**: Endpoint de auditoria diagnóstica `GET /requests/:id` operacional e validado.

---

## Phase 6: User Story 4 - Emissão de Logs Estruturados em JSON em Linha Única com Metadados (`src/obs/logger.ts`) (Priority: P2)

**Goal**: Criar o módulo `src/obs/logger.ts` para emitir logs estritamente em formato NDJSON (1 linha física por evento) contendo exclusivamente metadados operacionais e identificadores de correlação, sem vazamento de payloads pesados.

**Independent Test**: Disparar chamadas ao logger com destino em stream mock e verificar se cada saída é uma linha física única, serializável em JSON, contendo apenas metadados.

### Tests for User Story 4
- [x] T017 [P] [US4] Criar testes unitários em `src/obs/logger.test.ts` validando que cada saída do logger ocupa exatamente 1 linha, é um JSON válido e não quebra com caracteres especiais
- [x] T018 [P] [US4] Escrever testes em `src/obs/logger.test.ts` validando que os logs contêm apenas metadados (`requestId`, `seq`, `kind`, `node`, `latencyMs`, `modelUsed`) sem despejar corpos integrais de mensagens

### Implementation for User Story 4
- [x] T019 [US4] Implementar o módulo `src/obs/logger.ts` com funções `createLogger`, `logTraceEvent` e `logRequestMetrics`, formatando saídas em NDJSON com destino parametrizável (padrão `process.stdout`)
- [x] T020 [US4] Conectar a emissão de logs via `src/obs/logger.ts` no ciclo de vida das requisições em `src/http/server.ts`

**Checkpoint**: Telemetria com logs JSON estruturados em linha única ativa.

---

## Phase 7: Polish & Validação Integrada

**Purpose**: Integração geral no entrypoint do sistema, verificação estrita de tipagem e execução completa de testes.

- [x] T021 [P] Atualizar a inicialização do servidor em `src/index.ts` integrando a instância singleton de `SqliteTraceStore`
- [x] T022 [P] Atualizar as exportações do módulo de store em `src/store/index.ts` incluindo `TraceStore` e `SqliteTraceStore`
- [x] T023 Executar checagem estrita de tipos via `npm run typecheck` e corrigir eventuais inconsistências
- [x] T024 Executar a suíte de testes completa via `npm test` garantindo 100% de sucesso
- [x] T025 Executar validação manual dos cenários descritos em `specs/013-trace-persistence/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: Sem dependências externas — inicia imediatamente.
- **Phase 2 (Foundational)**: Depende de Phase 1 — BLOQUEIA a persistência e as consultas das histórias de usuário.
- **Phase 3 (User Story 1 - Request ID)**: Depende de Phase 1. Pode ser executada em paralelo com a Phase 2.
- **Phase 4 (User Story 2 - Persistência SQLite)**: Depende de Phase 2 (Foundational) e Phase 3 (US1 Request ID).
- **Phase 5 (User Story 3 - GET /requests/:id)**: Depende de Phase 2 e Phase 4 (para recuperar dados persistidos).
- **Phase 6 (User Story 4 - Logger JSON)**: Depende de Phase 1. Pode rodar em paralelo com as demais histórias.
- **Phase 7 (Polish)**: Depende da conclusão de todas as histórias de usuário.

### Parallel Opportunities
- Tarefas marcadas com `[P]` (como T001/T002, T005, T006/T007, T010/T011, T014/T015, T017/T018, T021/T022) atuam em arquivos distintos e podem ser desenvolvidas em paralelo.

---

## Implementation Strategy: MVP First

1. **MVP (Phase 1 + Phase 2 + Phase 3)**:
   - Definição dos tipos (`trace-store.ts`).
   - Implementação de `SqliteTraceStore` para `requests` e `trace_events`.
   - Propagação de `X-Request-Id` no header e `requestId` no corpo de `POST /chat`.
   - **Resultado do MVP**: O cliente já recebe identificadores únicos correlacionados e a base de dados já está pronta.
2. **Incremento 2 (Phase 4 + Phase 5)**:
   - Persistência efetiva no fluxo HTTP e exposição do endpoint `GET /requests/:id`.
3. **Incremento 3 (Phase 6 + Phase 7)**:
   - Logger estruturado JSON em linha única (`src/obs/logger.ts`), integração no `src/index.ts` e validação de ponta a ponta.
