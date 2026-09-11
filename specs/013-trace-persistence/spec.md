# Feature Specification: Persistência de Trace e Logs Estruturados em JSON

**Feature Branch**: `013-trace-persistence`  
**Created**: 2026-09-10  
**Status**: Draft  
**Input**: User description: "Trace persistido + logs JSON: - /chat: requestId no corpo e no header X-Request-Id. - SQLite: requests (métricas) e trace_events (node, payloads). - src/obs/logger.ts: 1 linha JSON por evento, só metadados. - GET /requests/:id registro + trace ordenado."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rastreabilidade de Requisições com Request ID no `/chat` (Priority: P1)

Como consumidor ou operador da API OpsPilot, quero que cada requisição processada pelo endpoint `/chat` possua um identificador único de correlação (`requestId`), propagado no cabeçalho HTTP de resposta `X-Request-Id` e retornado no corpo da resposta JSON, para que seja possível correlacionar chamadas entre cliente, servidor, logs e auditoria com rastreabilidade ponta a ponta.

**Why this priority**: É a espinha dorsal de rastreabilidade do sistema. Sem um identificador único propagado na borda HTTP, torna-se inviável relacionar os logs da aplicação com o trace de execução interno e as consultas posteriores do cliente.

**Independent Test**:
1. Enviar requisição `POST /chat` sem cabeçalho `X-Request-Id`.
2. Verificar que a resposta HTTP 200 contém o cabeçalho `X-Request-Id` com um UUID v4 gerado.
3. Validar que o corpo JSON da resposta inclui a chave `"requestId"` correspondente exatamente ao valor do cabeçalho.
4. Enviar nova requisição `POST /chat` informando um cabeçalho customizado `X-Request-Id: meu-request-123`.
5. Comprovar que o mesmo valor (`meu-request-123`) é refletido no cabeçalho de resposta e no corpo da resposta.

**Acceptance Scenarios**:
1. **Given** uma requisição enviada a `POST /chat` sem o cabeçalho `X-Request-Id`,  
   **When** a rota processa a requisição,  
   **Then** o servidor gera um identificador único, injeta o cabeçalho `X-Request-Id` na resposta e inclui o campo `requestId` no corpo JSON retornado.

2. **Given** uma requisição enviada a `POST /chat` com cabeçalho `X-Request-Id` pré-existente,  
   **When** a rota processa a mensagem,  
   **Then** o servidor preserva e adota esse mesmo identificador, retornando-o no cabeçalho de resposta e no corpo JSON.

---

### User Story 2 - Persistência Relacional de Requisições e Eventos de Trace no SQLite (Priority: P1)

Como engenheiro de observabilidade e confiabilidade, quero que todas as requisições atendidas pelo `/chat` e todos os eventos intermediários de raciocínio (passos do grafo, pensamentos, execuções de ferramentas, rotas e fallbacks) sejam salvos de forma relacional no banco SQLite (`requests` e `trace_events`), para possibilitar análises retroativas, métricas de latência/tokens e auditoria detalhada de comportamento dos agentes.

**Why this priority**: Permite retenção histórica permanente e reprodutibilidade do comportamento dos modelos e ferramentas, além de subsidiar o endpoint de consulta diagnóstica de forma desacoplada da memória volátil da instância.

**Independent Test**:
1. Executar um fluxo de chat via `POST /chat`.
2. Consultar diretamente o banco de dados nas tabelas `requests` e `trace_events`.
3. Verificar a presença de um registro na tabela `requests` contendo `id`, `conversation_id`, métricas consolidadas (`latencyMs`, `promptTokens`, `completionTokens`, `totalTokens`, `modelUsed`, `llmCalls`) e timestamps.
4. Verificar a presença dos eventos correspondentes na tabela `trace_events` associados ao `request_id`, contendo o nó emissor (`node`), o tipo de evento (`kind`), a sequência de execução (`seq`), o payload completo do conteúdo e o timestamp de cada evento.

**Acceptance Scenarios**:
1. **Given** uma requisição concluída com sucesso no `/chat`,  
   **When** a resposta é finalizada,  
   **Then** os dados agregados da requisição e suas métricas são persistidos na tabela `requests`.

2. **Given** os múltiplos passos do agente emitidos durante a execução (pensamentos, chamadas de tools, observações, rotas, etc.),  
   **When** o trace é consolidado,  
   **Then** cada item é persistido individualmente na tabela `trace_events` com chave estrangeira apontando para a requisição correspondente, mantendo sua ordem cronológica e seu payload serializado.

3. **Given** uma requisição que falhe com erro HTTP (como 500 ou 503),  
   **When** a exceção for capturada e respondida,  
   **Then** o registro em `requests` é mantido/atualizado refletindo o código de status e erro ocorrido, junto aos eventos parciais de trace capturados até a falha.

---

### User Story 3 - Consulta Diagnóstica de Requisição e Trace Ordenado via `GET /requests/:id` (Priority: P1)

Como operador de suporte ou desenvolvedor de agentes, quero consultar o endpoint `GET /requests/:id` para recuperar os detalhes consolidados de uma requisição e a lista cronologicamente ordenada de seus eventos de trace, para depurar comportamentos anômalos, avaliar o consumo de tokens e inspecionar os argumentos passados para cada ferramenta.

**Why this priority**: Fornece a interface HTTP pública necessária para inspecionar qualquer execução previamente gravada, permitindo a integração com painéis operacionais, dashboards e ferramentas de depuração sem exigir acesso direto ao arquivo do banco de dados.

**Independent Test**:
1. Emitir uma requisição `POST /chat` e coletar o `requestId` retornado.
2. Executar `GET /requests/:id` passando o identificador obtido.
3. Validar retorno com código HTTP 200 contendo:
   - Os dados e métricas da requisição (`id`, `conversationId`, `metrics`, `createdAt`, etc.)
   - Um array `trace` com todos os eventos ordenados de forma crescente por ordem de emissão/sequência.
4. Enviar `GET /requests/inexistente-uuid`.
5. Verificar retorno com código HTTP 404 e payload estruturado `{ "error": "Request not found", "requestId": "..." }`.

**Acceptance Scenarios**:
1. **Given** um `requestId` existente no banco de dados,  
   **When** uma requisição HTTP `GET /requests/:id` é disparada,  
   **Then** o servidor responde com código 200, trazendo os dados da requisição e o array de eventos de trace estritamente ordenado pela sequência de execução.

2. **Given** um `requestId` que não consta no banco de dados,  
   **When** a rota `GET /requests/:id` é chamada,  
   **Then** o servidor responde com status HTTP 404 e mensagem de erro explicativa.

---

### User Story 4 - Emissão de Logs Estruturados em JSON em Linha Única com Metadados (`src/obs/logger.ts`) (Priority: P2)

Como engenheiro de plataforma (SRE), quero um mecanismo centralizado de logging (`src/obs/logger.ts`) que emita cada evento em uma única linha JSON (NDJSON / JSON lines) contendo exclusivamente metadados operacionais e identificadores de correlação, para permitir ingestão eficiente e sem ruído por ferramentas de observabilidade (como Fluentd, Datadog, CloudWatch ou Grafana Loki).

**Why this priority**: Logs de texto livre ou despejos descontrolados de payloads volumosos em múltiplas linhas dificultam a indexação, geram custos excessivos de armazenamento e aumentam o risco de vazamento de dados sensíveis. O log em linha única com metadados padroniza a telemetria do sistema.

**Independent Test**:
1. Instanciar e disparar emissão de logs de trace e requisições através do módulo `src/obs/logger.ts`.
2. Inspecionar a saída gerada no stream padrão (`stdout`).
3. Comprovar que cada entrada é uma string estritamente válida de JSON ocupando exatamente 1 linha (sem quebras internas de linha).
4. Verificar que a linha de log contém metadados operacionais essenciais (`timestamp`, `level`, `requestId`, `event`, `kind`, `node`, `latencyMs`, `modelUsed`, etc.) sem vazar corpos de mensagens desnecessários ou prompts completos.

**Acceptance Scenarios**:
1. **Given** um evento operacional ou passo de execução do agente,  
   **When** o logger registra o evento,  
   **Then** uma linha de JSON estrito é emitida no console com campos estruturados padronizados.

2. **Given** uma requisição completa com eventos de trace,  
   **When** os logs de eventos são disparados,  
   **Then** eles contêm apenas os metadados descritivos (ex: tipo de nó, ação, contagem de tokens, duração, requestId), preservando o desempenho de I/O.

---

## Edge Cases

- **Ausência de Cabeçalho `X-Request-Id` do Cliente**: Quando o cliente não envia o cabeçalho, o sistema deve gerar automaticamente um identificador único com formato UUID v4.
- **Identificador com Caracteres Especiais ou Inválidos**: O valor de `X-Request-Id` recebido do cliente deve ser sanitizado ou aceito como string alfanumérica razoável (evitando SQL injection ou problemas de armazenamento).
- **Consultas a Requisições Inexistentes (`GET /requests/:id`)**: Deve retornar HTTP 404 com resposta JSON consistente `{ "error": "Request not found", "requestId": "..." }`.
- **Payloads Heterogêneos de Trace**: Eventos do tipo `action` contêm um objeto estruturado (`ActionPayload`), enquanto outros contêm strings (`thought`, `observation`, `fallback`, etc.). A coluna de payload/conteúdo em `trace_events` deve serializar em JSON preservando a fidelidade dos dados para desserialização no `GET /requests/:id`.
- **Falha Durante a Execução do Grafo (Timeout ou Exceção 500/503)**: A requisição deve ser persistida mesmo em caso de erro, registrando o status HTTP final correspondente e os eventos parciais gerados até o momento da falha.
- **Concorrência e Transacionalidade no SQLite**: A inserção de múltiplos eventos de trace de uma mesma requisição deve utilizar operações preparadas em lote ou transação rápida para assegurar integridade referencial sem travar o banco.
- **Formatação de Log com Caracteres de Quebra de Linha**: Metadados que possam conter caracteres de escape ou newlines acidentais devem ser devidamente escapados pelo serializador JSON para garantir que cada registro ocupe rigorosamente uma linha física.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O endpoint `POST /chat` MUST suportar o cabeçalho HTTP `X-Request-Id`, adotando seu valor como o `requestId` da operação caso fornecido, ou gerando um UUID v4 caso ausente.
- **FR-002**: O endpoint `POST /chat` MUST definir o cabeçalho HTTP `X-Request-Id` em sua resposta com o identificador da requisição.
- **FR-003**: O corpo da resposta JSON do endpoint `POST /chat` MUST incluir o campo `requestId: string`.
- **FR-004**: O banco de dados SQLite MUST possuir a tabela `requests` para persistir dados cadastrais e métricas das requisições atendidas pelo sistema.
- **FR-005**: A tabela `requests` MUST armazenar no mínimo: `id` (chave primária, TEXT), `conversation_id` (TEXT), `user_id` (TEXT nulo/opcional), `message` (TEXT), `answer` (TEXT nulo/opcional), `status_code` (INTEGER), métricas consolidadas (`latency_ms`, `llm_calls`, `model_used`, `prompt_tokens`, `completion_tokens`, `total_tokens`), e `created_at` (TEXT / datetime).
- **FR-006**: O banco de dados SQLite MUST possuir a tabela `trace_events` para persistir individualmente cada evento de raciocínio e execução associado a uma requisição.
- **FR-007**: A tabela `trace_events` MUST armazenar: `id` (INTEGER autoincremento ou UUID), `request_id` (TEXT, chave estrangeira para `requests(id)`), `seq` (INTEGER indicando a ordem cronológica do evento na requisição), `kind` (TEXT), `node` (TEXT opcional), `payload` (TEXT com conteúdo JSON serializado), `timestamp_ms` (INTEGER), e `created_at` (TEXT / datetime).
- **FR-008**: O sistema MUST fornecer um módulo ou serviço de persistência de trace e requisições (`TraceStore` ou métodos estendidos na store SQLite) aderente à Constituição e ao uso nativo de `DatabaseSync` (`node:sqlite`).
- **FR-009**: O sistema MUST criar o módulo `src/obs/logger.ts` com funções utilitárias para registrar logs operacionais e eventos de trace.
- **FR-010**: O logger em `src/obs/logger.ts` MUST formatar cada saída como uma única linha de JSON (NDJSON) direcionada ao `stdout` ou stream configurado, contendo somente metadados e identificadores (sem dumping desnecessário de payloads integrais ou textos desestruturados).
- **FR-011**: O servidor Express MUST expor o endpoint `GET /requests/:id`.
- **FR-012**: O endpoint `GET /requests/:id` MUST retornar status HTTP 200 com os dados consolidados da requisição e a lista completa de eventos de trace ordenados crescentemente pelo campo de sequência (`seq`) ou timestamp.
- **FR-013**: O endpoint `GET /requests/:id` MUST retornar status HTTP 404 com corpo JSON `{ "error": "Request not found", "requestId": "<id>" }` quando o identificador não for encontrado.
- **FR-014**: O sistema MUST conter testes automatizados com `node:test` validando:
  - Geração e propagação de `X-Request-Id` no corpo e cabeçalho do `/chat`.
  - Persistência e integridade das tabelas `requests` e `trace_events`.
  - Emissão de logs em JSON de linha única via `src/obs/logger.ts`.
  - Recuperação correta e ordenada via `GET /requests/:id`, incluindo caso de 404.

---

### Key Entities

- **RequestRecord**: Representa uma requisição processada pelo assistente:
  - `id`: string (UUID ou identificador único da requisição)
  - `conversationId`: string
  - `userId`?: string
  - `message`: string
  - `answer`?: string
  - `statusCode`: number
  - `latencyMs`: number
  - `llmCalls`: number
  - `modelUsed`?: string
  - `promptTokens`?: number
  - `completionTokens`?: number
  - `totalTokens`?: number
  - `createdAt`: string
- **TraceEventRecord**: Representa um evento individual pertencente ao ciclo de vida de uma requisição:
  - `id`?: number
  - `requestId`: string
  - `seq`: number
  - `kind`: string (`'thought' | 'action' | 'observation' | 'plan' | 'critique' | 'answer' | 'route' | 'fallback'`)
  - `node`?: string
  - `payload`: string ou objeto deserializado
  - `timestampMs`: number
  - `createdAt`: string
- **StructuredLogEntry**: Objeto estruturado serializado em uma linha única de JSON:
  - `timestamp`: string (ISO 8601)
  - `level`: `'info' | 'warn' | 'error' | 'debug'`
  - `requestId`: string
  - `event`: string (nome do evento, ex: `'request_started'`, `'node_executed'`, `'request_completed'`)
  - `node`?: string
  - `kind`?: string
  - `durationMs`?: number
  - `model`?: string
  - `metadata`?: Record<string, unknown>

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das respostas HTTP do endpoint `/chat` contêm o cabeçalho `X-Request-Id` e a chave `"requestId"` correspondente no corpo JSON da resposta.
- **SC-002**: 100% das requisições processadas geram registros correlacionados nas tabelas `requests` e `trace_events` do SQLite sem perda de eventos intermediários.
- **SC-003**: 100% das chamadas a `GET /requests/:id` para IDs existentes retornam o registro com a coleção de eventos do trace estritamente ordenada por ordem de execução cronológica.
- **SC-004**: 100% das chamadas a `GET /requests/:id` para IDs inexistentes retornam status HTTP 404 de forma previsível e segura.
- **SC-005**: 100% das linhas emitidas pelo módulo `src/obs/logger.ts` são JSONs estritamente válidos, ocupam exatamente 1 linha física e contêm apenas metadados de execução.
- **SC-006**: 100% dos testes da suíte (`npm test`) e verificação de tipagem TypeScript estrita (`npm run typecheck`) passam sem erros.

---

## Assumptions

- O banco de dados SQLite já existente em `./data/opspilot.db` (ou `:memory:` em testes) receberá as novas tabelas `requests` e `trace_events` via comandos `CREATE TABLE IF NOT EXISTS`, mantendo compatibilidade com as tabelas já existentes de conversas, serviços e incidentes.
- A persistência do trace e requisição em banco ocorrerá de forma síncrona ou imediatamente antes do término da requisição HTTP para assegurar que chamadas imediatas a `GET /requests/:id` encontrem os dados disponíveis.
- O logger `src/obs/logger.ts` enviará logs para `process.stdout` (ou stream parametrizável em testes), mantendo o formato NDJSON limpo para facilitar a análise automatizada.
- Para testes unitários e de integração, uma instância de SQLite `:memory:` será usada para garantir isolamento e velocidade de execução.
