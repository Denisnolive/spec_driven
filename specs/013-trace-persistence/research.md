# Research & Technical Decisions: Persistência de Trace e Logs Estruturados em JSON

**Feature**: `013-trace-persistence`  
**Date**: 2026-09-10  
**Status**: Completed  

---

## 1. Persistência Relacional com SQLite Nativo (`node:sqlite`)

### Decisão
Utilizar o módulo nativo `node:sqlite` (`DatabaseSync`) para persistir o histórico de requisições e seus respectivos eventos de trace, mantendo o padrão arquitetural estabelecido pela Constituição (Princípio III) e adotado em `SqliteOpsStore` e `SqliteConversationStore`.

### Racional
1. **Nenhum overhead de drivers ou dependências externas**: O Node.js 22 LTS já inclui `node:sqlite` integrado, permitindo prepared statements síncronos de altíssimo desempenho sem lock contention indesejado.
2. **Mesmo banco relacional**: As tabelas `requests` e `trace_events` residem no mesmo arquivo de banco (`data/opspilot.db` ou `:memory:` em testes), viabilizando integridade referencial com `PRAGMA foreign_keys = ON`.
3. **Prepared Statements e Batch Insert**: Inserir os eventos de trace de uma requisição em uma única transação rápida síncrona (`db.exec('BEGIN')` ... `db.exec('COMMIT')`) garante atomicidade e tempo de escrita inferior a 2ms.

### Alternativas Consideradas
- **Arquivo append-only JSONL**: Simples para logs, mas ineficiente para buscas por ID (`GET /requests/:id`) e consultas de métricas agregadas.
- **ORM (ex: Sequelize)**: Viola a Constituição v1.2.0 que removeu Sequelize em favor de SQLite nativo (`DatabaseSync`).

---

## 2. Modelagem das Tabelas `requests` e `trace_events`

### Decisão
Criar duas tabelas correlacionadas com índice de busca ordenado:

```sql
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT,
  message TEXT NOT NULL,
  answer TEXT,
  status_code INTEGER NOT NULL DEFAULT 200,
  latency_ms INTEGER,
  llm_calls INTEGER,
  model_used TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  node TEXT,
  payload TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trace_events_request_seq
  ON trace_events(request_id, seq ASC);
```

### Racional
- O campo `seq` garante ordenação determinística de cada evento no trace de uma execução de agente, mesmo quando múltiplos eventos ocorrem no mesmo milissegundo.
- O campo `payload` armazena `JSON.stringify(event.content)` (permitindo suportar tanto `string` quanto `ActionPayload`), além de metadados específicos de fallback ou roteamento quando presentes.
- `ON DELETE CASCADE` preserva a higiene do banco caso requisições sejam expurgadas no futuro.

---

## 3. Gestão e Propagação de `requestId` no Express

### Decisão
- Obter o identificador a partir do cabeçalho `req.headers['x-request-id']` (se fornecido como string não-vazia).
- Se ausente ou inválido, gerar um novo identificador com `randomUUID()` do módulo nativo `node:crypto`.
- Definir explicitamente o cabeçalho `res.setHeader('X-Request-Id', requestId)` na resposta.
- Incluir `requestId: string` no corpo JSON das respostas de sucesso e erro.

### Racional
- Padrão consolidado da indústria (RFC e convenção de microserviços) para tracing distribuído.
- Permite que o cliente forneça seu próprio ID de rastreamento para correlação ponta a ponta ou deixe o servidor gerar de forma segura.

---

## 4. Logger Estruturado JSON em Linha Única (`src/obs/logger.ts`)

### Decisão
Criar o módulo `src/obs/logger.ts` com funções dedicadas:
- `logEvent(entry: StructuredLogEntry): void`
- `logTraceEvent(requestId: string, event: TraceEvent, seq: number): void`
- `logRequestMetrics(requestId: string, meta: RequestMetricsLogMeta): void`

Cada invocação serializa o objeto via `JSON.stringify(...)` e escreve diretamente no `process.stdout` (ou stream parametrizável em testes) com terminação `\n`.

### Racional
- **Apenas metadados**: O log de evento de trace extrai `requestId`, `seq`, `kind`, `node`, `timestampMs`, e detalhes sintéticos como ferramenta chamada (no caso de `action`), sem despejar o texto do prompt completo ou dados de conversa.
- **NDJSON puro**: Cada entrada é exatamente uma linha física, facilitando ingestão em agregadores de logs sem quebrar parsers.
- **Isolamento de efeitos**: Permite passar um stream ou destino customizado para asserções precisas nos testes sem poluir o console do desenvolvedor.

---

## 5. Contrato do Endpoint `GET /requests/:id`

### Decisão
- Rota: `GET /requests/:id`
- Retorno 200:
  ```json
  {
    "request": {
      "id": "uuid",
      "conversationId": "uuid",
      "userId": "user-1",
      "message": "...",
      "answer": "...",
      "statusCode": 200,
      "metrics": {
        "latencyMs": 1250,
        "llmCalls": 2,
        "modelUsed": "openai/gpt-4o-mini",
        "promptTokens": 540,
        "completionTokens": 120,
        "totalTokens": 660
      },
      "createdAt": "2026-09-10 22:30:00"
    },
    "trace": [
      {
        "seq": 1,
        "kind": "thought",
        "node": "roteador",
        "content": "...",
        "timestampMs": 1726000000000
      },
      {
        "seq": 2,
        "kind": "action",
        "node": "react",
        "content": { "tool": "get_service_status", "args": { "service": "auth" } },
        "timestampMs": 1726000000200
      }
    ]
  }
  ```
- Retorno 404 se não encontrado:
  ```json
  {
    "error": "Request not found",
    "requestId": "inexistente"
  }
  ```

### Racional
- Mantém coerência semântica e facilidade de consumo tanto para humanos quanto para ferramentas automatizadas.
- O campo `trace` deserializa o conteúdo JSON da coluna `payload` de volta para seu formato nativo (`string` ou `ActionPayload`).
