# Feature Specification: Resiliência de Modelo com Fallback e Retries

**Feature Branch**: `012-model-fallback`  
**Created**: 2026-09-10  
**Status**: Draft  
**Input**: User description: "Resiliência de modelo: - .env: OPENROUTER_MODEL_FALLBACK; - fábrica model.ts: withRetry no primário; withFallbacks([reserva]); - Trace: evento \"fallback\"; metrics.modelUsed; - Caso nada funcione, 503"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execução Resiliente com Modelo Primário e Retries Automáticos (Priority: P1)

Como operador do OpsPilot, quero que as requisições ao modelo primário de linguagem (`OPENROUTER_MODEL`) executem tentativas de repetição automáticas (`withRetry`) em caso de erros transitórios (como falhas de conexão de rede, timeouts transitórios ou rate limit momentâneo), para que pequenas instabilidades do provedor sejam superadas sem necessidade de acionar o modelo reserva e sem interrupção para o usuário final.

**Why this priority**: É a primeira linha de defesa contra instabilidades comuns de provedores LLM (como limites de requisições por minuto na OpenRouter). Evita transições desnecessárias de modelo quando uma simples retentativa imediata ou com backoff resolve o problema.

**Independent Test**:
1. Configurar o modelo primário com `withRetry({ stopAfterAttempt: 3 })`.
2. Simular uma falha transitória na primeira chamada do modelo primário seguida de sucesso na segunda tentativa.
3. Verificar que a resposta é processada normalmente com HTTP 200.
4. Validar que `metrics.modelUsed` contém o identificador do modelo primário.
5. Comprovar que **não** foi gerado nenhum evento de `fallback` no trace, pois o primário se recuperou no retry.

**Acceptance Scenarios**:
1. **Given** uma chamada ao modelo primário configurado no ambiente,  
   **When** a chamada obtém sucesso imediato,  
   **Then** a resposta é retornada, `metrics.modelUsed` é preenchido com o nome do modelo primário e nenhum evento `fallback` é incluído no trace.

2. **Given** o modelo primário sofrendo um erro recuperável transitório (ex: falha de socket ou rate limit),  
   **When** o mecanismo `withRetry` reexecuta a tentativa,  
   **Then** a requisição é concluída com sucesso no primário e o trace reflete apenas a execução normal, mantendo `metrics.modelUsed` como o primário.

---

### User Story 2 - Acionamento Transparente do Modelo Reserva com Registro no Trace (Priority: P1)

Como engenheiro de operações, quero que quando o modelo primário falhar definitivamente após todas as suas tentativas de retry, o sistema faça o failover transparente para o modelo reserva (`OPENROUTER_MODEL_FALLBACK`) via `withFallbacks([reserva])`, emitindo um evento formal `fallback` no trace e atualizando a métrica `metrics.modelUsed` com o modelo que de fato atendeu a requisição.

**Why this priority**: Garante alta disponibilidade (HA) cognitiva. Se um provedor ou modelo sofrer indisponibilidade prolongada, esgotamento de cota ou erro fatal 5xx no endpoint, o assistente continua operando sem interrupção do serviço, fornecendo observabilidade clara de quando o fallback foi acionado.

**Independent Test**:
1. Forçar erro persistente no modelo primário (ex: 429/500 contínuo).
2. Configurar modelo reserva funcional via `OPENROUTER_MODEL_FALLBACK`.
3. Disparar uma requisição pelo `POST /chat` ou diretamente pelo `ProductionGraph`.
4. Verificar que a requisição conclui com sucesso (status 200 OK).
5. Validar que o trace gerado contém um evento com:
   - `kind: 'fallback'`
   - `node`: identificando o nó onde ocorreu o failover (ex: `'roteador'`, `'react'`, etc.)
   - Descrição no conteúdo informando a falha do modelo primário e o acionamento do reserva
   - Dados de `fromModel`, `toModel` e o erro ocorrido
6. Validar que o objeto de resposta inclui `metrics.modelUsed` apontando para o modelo reserva.

**Acceptance Scenarios**:
1. **Given** o modelo primário falhando após o limite configurado de retries,  
   **When** o `withFallbacks` redireciona a execução para o modelo reserva,  
   **Then** a requisição é completada com o modelo reserva com sucesso.

2. **Given** a ativação do modelo reserva durante o processamento,  
   **When** o evento de rastreamento é construído,  
   **Then** um evento com `kind: 'fallback'` é inserido no array de trace, contendo `fromModel` (modelo primário), `toModel` (modelo reserva) e a mensagem de erro que causou a transição.

3. **Given** a finalização da requisição atendida pelo modelo de contingência,  
   **When** as métricas consolidadas são retornadas,  
   **Then** `metrics.modelUsed` registra exatamente o identificador de `OPENROUTER_MODEL_FALLBACK`.

---

### User Story 3 - Degradação Graciosa com Retorno HTTP 503 quando Ambos os Modelos Falharem (Priority: P1)

Como cliente da API OpsPilot, quero que quando tanto o modelo primário (após retries) quanto o modelo reserva falharem, o servidor retorne status HTTP 503 (Service Unavailable) com payload de erro explicativo, em vez de um erro genérico 500 ou quebra inesperada de processo.

**Why this priority**: Sinaliza com precisão aos sistemas clientes e balanceadores de carga que a indisponibilidade é de serviço externo dependente (LLM providers esgotados/indisponíveis), permitindo que políticas de retry de clientes HTTP, alertas de monitoramento e circuit-breakers externos atuem adequadamente com semântica REST padrão.

**Independent Test**:
1. Simular falha em ambos os modelos (primário e reserva lançam exceção).
2. Enviar requisição `POST /chat`.
3. Verificar que a resposta tem código de status HTTP `503 Service Unavailable`.
4. Validar que o corpo da resposta JSON contém `{ "error": "Service Unavailable", "message": "..." }`.

**Acceptance Scenarios**:
1. **Given** o modelo primário e o modelo de fallback ambos inacessíveis ou rejeitando requisições,  
   **When** a rota `POST /chat` captura a exceção de exaustão de modelos,  
   **Then** o servidor responde com código HTTP `503` e corpo estruturado de erro.

2. **Given** outros erros que não são de esgotamento de LLM (ex: validação de dados ou lógica interna),  
   **When** interceptados pelo middleware de erro,  
   **Then** continuam respeitando os respectivos status HTTP adequados (400, 404, 422, 500, etc.).

---

### User Story 4 - Fábrica Unificada e Retrocompatibilidade Completa de `createModel` (Priority: P2)

Como desenvolvedor do OpsPilot, quero que a função de fábrica `createModel()` em `src/agents/model.ts` retorne uma instância resiliente transparente que suporte `.invoke()`, `.bindTools()` e `.withStructuredOutput()`, de modo que todos os agentes e nós existentes (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`, `ProductionGraph`, `LearningReflector`) funcionem sem modificações destrutivas em seus contratos.

**Why this priority**: Evita refatorações em massa ou duplicações em cada componente que utiliza modelos no projeto. A fábrica atua como ponto único de controle da política de resiliência e configuração de modelos.

**Independent Test**:
1. Invocar `createModel()` e testar chamadas com:
   - `model.invoke(...)`
   - `model.bindTools([...])`
   - `model.withStructuredOutput(schema)`
2. Testar que tanto a chamada de ferramentas quanto a saída estruturada herdam a mesma cadeia resiliente (`withRetry` no primário e `withFallbacks` no reserva).
3. Executar toda a suíte de testes existente (`npm test`) e confirmar 100% de aprovação.

**Acceptance Scenarios**:
1. **Given** qualquer agente chamando `createModel().bindTools(tools)`,  
   **When** o modelo primário com ferramentas falha,  
   **Then** a chamada é transferida para o modelo reserva com ferramentas vinculadas.

2. **Given** o nó roteador ou o refletor chamando `createModel().withStructuredOutput(schema)`,  
   **When** o modelo primário estruturado falha,  
   **Then** a chamada é transferida para o modelo reserva estruturado e o resultado adere ao schema Zod fornecido.

---

## Edge Cases

- **Ausência de `OPENROUTER_MODEL_FALLBACK` no ambiente**: Se a variável não estiver definida no `.env` nem nas variáveis de processo, o sistema deve adotar um valor de fallback seguro por padrão (ex: `google/gemini-2.0-flash-exp:free` ou `meta-llama/llama-3-8b-instruct:free`) ou logar aviso e operar em modo somente-retry.
- **Modelos com nomes idênticos no primário e no fallback**: Se `OPENROUTER_MODEL_FALLBACK === OPENROUTER_MODEL`, o sistema deve alertar na inicialização ou aplicar o fallback com o mesmo modelo para garantir retries estendidos.
- **Diferenças de suporte a ferramentas ou saída estruturada entre primário e reserva**: O modelo de fallback deve ser um modelo compatível com function calling / tool binding e structured outputs (ex: modelos modernos da OpenRouter).
- **Timeout global do servidor (180s) vs Tempo de Retries do Modelo**: As configurações de retry do modelo primário (tentativas e intervalos) devem ser calibradas (ex: 2 a 3 tentativas com backoff razoável) para não exceder o timeout de requisição do servidor (180s) nem causar bloqueios desnecessários.
- **Erro de validação de schema após fallback**: Se o modelo de fallback responder com saída que não atende ao schema do Zod, o erro deve ser tratado no nível do nó com a política segura correspondente (como o fallback seguro de rota para `react` no roteador).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST suportar a variável de ambiente `OPENROUTER_MODEL_FALLBACK` no arquivo `.env` e no `process.env`.
- **FR-002**: A fábrica `createModel()` em `src/agents/model.ts` MUST instanciar o modelo primário configurado por `OPENROUTER_MODEL` aplicando política de retentativas via `.withRetry(...)`.
- **FR-003**: A fábrica `createModel()` MUST instanciar o modelo reserva configurado por `OPENROUTER_MODEL_FALLBACK` e configurar o failover via `.withFallbacks([fallbackModel])`.
- **FR-004**: O objeto ou wrapper retornado por `createModel()` MUST oferecer suporte a:
  - `invoke(input, options?)`
  - `bindTools(tools, options?)`
  - `withStructuredOutput(schema, options?)`
  Garantindo que a política de retry e fallback permaneça ativa em todas essas modalidades de uso.
- **FR-005**: O tipo `TraceEventKind` em `src/agents/types.ts` MUST ser estendido para incluir `'fallback'`.
- **FR-006**: A interface `TraceEvent` em `src/agents/types.ts` MUST suportar metadados associados ao failover de modelo, incluindo:
  - `fromModel?: string`: nome do modelo primário que falhou
  - `toModel?: string`: nome do modelo reserva acionado
  - `error?: string`: motivo ou mensagem de erro que disparou o fallback
- **FR-007**: Quando uma chamada ao modelo primário falhar e a execução migrar para o modelo de contingência, o sistema MUST emitir um evento no trace com:
  - `kind: 'fallback'`
  - `node`: nome do nó de execução corrente
  - `content`: mensagem descritiva do failover
  - `timestampMs`: timestamp da ocorrência
- **FR-008**: A interface `Metrics` em `src/agents/types.ts` MUST incluir a propriedade opcional `modelUsed?: string`.
- **FR-009**: Ao concluir uma chamada LLM (seja direta, via agente ou pelo grafo), a métrica `metrics.modelUsed` MUST ser preenchida com o nome do modelo que gerou a resposta com sucesso (o primário ou o reserva).
- **FR-010**: O endpoint `POST /chat` em `src/http/server.ts` MUST incluir `modelUsed` dentro do objeto de métricas retornado na resposta HTTP 200.
- **FR-011**: Caso todas as tentativas do modelo primário e a tentativa do modelo de fallback falhem, o endpoint `POST /chat` MUST capturar a exceção e responder com o código de status HTTP **503 (Service Unavailable)** e corpo explicativo em JSON.
- **FR-012**: O sistema MUST fornecer testes unitários e de integração validando:
  - Retentativas no primário
  - Disparo de fallback e emissão do evento `fallback`
  - Preenchimento correto de `metrics.modelUsed`
  - Retorno HTTP 503 em exaustão de todos os modelos

---

### Key Entities

- **ModelResilienceConfig**: Configuração de resiliência de modelos:
  - `primaryModel: string` (definido por `OPENROUTER_MODEL`)
  - `fallbackModel: string` (definido por `OPENROUTER_MODEL_FALLBACK`)
  - `stopAfterAttempt?: number` (número máximo de tentativas no primário)
- **TraceEvent (`kind: 'fallback'`)**:
  - `kind: 'fallback'`
  - `node: string`
  - `content: string`
  - `fromModel?: string`
  - `toModel?: string`
  - `error?: string`
  - `timestampMs: number`
- **Metrics**:
  - `modelUsed?: string`
  - `llmCalls: number`
  - `latencyMs: number`
  - Demais métricas de tokens e orçamentos existentes
- **ServiceUnavailableError**:
  - Representação de falha irrecuperável por esgotamento de modelos LLM, mapeada para status HTTP 503.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em caso de falha persistente do modelo primário, 100% das requisições com modelo reserva funcional realizam o failover com sucesso, completando a requisição com HTTP 200.
- **SC-002**: 100% dos eventos de failover geram um `TraceEvent` com `kind: 'fallback'` contendo identificação de nó, modelo de origem, modelo de destino e causa da falha.
- **SC-003**: 100% das respostas de sucesso da API incluem `metrics.modelUsed` correspondendo com fidelidade ao modelo que de fato atendeu a chamada.
- **SC-004**: Em caso de falha irrecuperável de todos os modelos configurados, 100% das requisições HTTP retornam status `503 Service Unavailable` em conformidade com as boas práticas REST.
- **SC-005**: 100% dos testes da suíte (`npm test`) e verificação estrita de tipagem TypeScript (`npm run typecheck`) executam com sucesso sem regressões.

---

## Assumptions

- O provedor OpenRouter ou provedor configurado aceita tanto o modelo primário quanto o modelo reserva sob a mesma chave de API (`OPENROUTER_API_KEY`) ou base URL configurada.
- O modelo reserva possui capacidade funcional equivalente para interpretar prompts, responder chamadas com ferramentas (`tools`) e saídas estruturadas com Zod.
- A quantidade de retries padrão no modelo primário será de 2 a 3 tentativas antes de direcionar a chamada para a reserva.
- Para testes automatizados determinísticos, a fábrica de modelo permitirá a injeção ou parametrização de modelos simulados (fakes/mocks) para reproduzir cenários de falha do primário, fallback bem-sucedido e falha total (503).
