# Feature Specification: Endpoint HTTP POST /chat e Registry de Estratégias

**Feature Branch**: `002-chat-endpoint`  
**Created**: 2026-09-01  
**Status**: Draft  
**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express): body { message, strategy?, reflect? } validado com zod; default react. 200 { answer, trace, metrics }; 400 body inválido (issues do zod); 422 estratégia desconhecida; timeout 180s -> 504. Registry em src/agents/index.ts (nome -> estratégia; reflect aplica withReflection). Teste de integração com estratégia fake determinística, sem rede"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execução de Consulta de Chat com Estratégia Padrão ou Específica (Priority: P1)

Como cliente HTTP ou interface frontend do OpsPilot, quero enviar uma requisição `POST /chat` com uma mensagem para que o agente processe a solicitação utilizando a estratégia especificada (ou o padrão `react`) e retorne a resposta final, o trace de execução e as métricas de desempenho.

**Why this priority**: É a funcionalidade principal da API — expor as capacidades dos agentes de raciocínio via interface HTTP padronizada.

**Independent Test**: Pode ser testado enviando uma requisição HTTP `POST /chat` com `{ "message": "Listar alertas" }` para o servidor Express com uma estratégia mock/fake determinística registrada, validando se o status retornado é 200 OK e se o corpo contém `answer`, `trace` e `metrics`.

**Acceptance Scenarios**:
1. **Given** um servidor Express em execução com a rota `POST /chat`,  
   **When** uma requisição POST é enviada com o corpo `{ "message": "Verificar status do cluster" }` (sem especificar `strategy`),  
   **Then** o servidor utiliza a estratégia padrão `react`, processa a requisição e retorna status HTTP 200 com JSON `{ "answer": "...", "trace": [...], "metrics": { "llmCalls": ..., "latencyMs": ... } }`.

2. **Given** uma requisição `POST /chat` com `{ "message": "Analisar logs", "strategy": "plan-and-execute" }`,  
   **When** a estratégia existe no registry,  
   **Then** o servidor executa a estratégia `plan-and-execute` e retorna status 200 com os dados correspondentes.

---

### User Story 2 - Execução com Camada de Reflexão Habilitada (`reflect: true`) (Priority: P1)

Como operador do sistema, quero poder solicitar que a resposta seja avaliada e auto-corrigida via reflexão (`reflect: true`) no `POST /chat`, para que a estratégia selecionada seja decorada com `withReflection`.

**Why this priority**: Permite que clientes da API ativem sob demanda a garantia de qualidade e correção factual antes de receberem o resultado.

**Independent Test**: Testável enviando `{ "message": "...", "strategy": "react", "reflect": true }` para um servidor onde a estratégia decorada retorne eventos de `critique` no trace e métricas consolidadas.

**Acceptance Scenarios**:
1. **Given** uma requisição `POST /chat` contendo `{ "message": "Investigar incidente", "reflect": true }`,  
   **When** o registry resolve a estratégia,  
   **Then** a estratégia base é envolvida com `withReflection(strategy)`, o trace da resposta inclui os eventos de crítica e o status retornado é 200 OK.

2. **Given** uma requisição com `{ "message": "Investigar incidente", "reflect": false }` ou `reflect` omitido,  
   **When** a estratégia é executada,  
   **Then** a estratégia base é executada diretamente sem o wrapper de reflexão.

---

### User Story 3 - Validação Estrita do Payload de Entrada (400 Bad Request) (Priority: P2)

Como desenvolvedor da API, quero que todas as requisições `POST /chat` tenham seu corpo validado com Zod para garantir que dados ausentes, tipos incorretos ou payloads vazios sejam rejeitados com detalhes acionáveis.

**Why this priority**: Garante a robustez da API e impede que requisições inválidas causem erros inesperados ou desperdicem recursos de LLM.

**Independent Test**: Testável enviando payloads com campos ausentes, tipos inválidos ou `message` vazia e verificando se a resposta é 400 Bad Request contendo a lista de `issues` do Zod.

**Acceptance Scenarios**:
1. **Given** uma requisição com corpo vazio `{}` ou `{ "message": "" }`,  
   **When** validado pelo middleware/schema Zod,  
   **Then** o servidor responde com status HTTP 400 Bad Request e corpo `{ "error": "Invalid request body", "issues": [...] }`.

2. **Given** uma requisição com `{ "message": "teste", "reflect": "sim" }` (tipo inválido para booleano),  
   **When** validado pelo schema Zod,  
   **Then** o servidor responde com status HTTP 400 e issues indicando o erro de tipo no campo `reflect`.

---

### User Story 4 - Tratamento de Estratégia Desconhecida (422 Unprocessable Entity) (Priority: P2)

Como cliente da API, quero receber uma mensagem de erro clara e a lista de estratégias disponíveis quando solicitar uma estratégia não suportada.

**Why this priority**: Facilita a descoberta e o auto-diagnóstico de integrações clientes ao utilizar nomes incorretos de estratégia.

**Independent Test**: Testável enviando `{ "message": "Olá", "strategy": "invalid-strategy" }` e verificando se o retorno é status HTTP 422 com as opções válidas listadas.

**Acceptance Scenarios**:
1. **Given** uma requisição com `{ "message": "Olá", "strategy": "estrategia-inexistente" }`,  
   **When** o registry busca a estratégia solicitada,  
   **Then** o servidor retorna status HTTP 422 Unprocessable Entity com `{ "error": "Unknown strategy: estrategia-inexistente", "availableStrategies": ["react", "plan-and-execute", ...] }`.

---

### User Story 5 - Controle e Tratamento de Timeout (504 Gateway Timeout) (Priority: P2)

Como mantenedor do sistema, quero que qualquer execução que ultrapasse o tempo limite de 180 segundos (180s / 180.000 ms) seja interrompida e retorne status 504 Gateway Timeout, evitando conexões pendentes indefinidamente.

**Why this priority**: Protege o servidor contra esgotamento de conexões, travamentos de agentes em loops externos e timeouts descontrolados.

**Independent Test**: Testável configurando um timeout customizado (ou injetando uma estratégia lenta que demore mais que o limite estabelecido) e verificando se o servidor responde com status 504 sem quebrar o processo.

**Acceptance Scenarios**:
1. **Given** uma execução de agente que ultrapassa 180 segundos (ou o timeout configurado para o servidor),  
   **When** o timer limite expira antes do término da estratégia,  
   **Then** o servidor aborta a espera e retorna status HTTP 504 Gateway Timeout com `{ "error": "Request timed out" }`.

---

### User Story 6 - Registry Centralizado de Estratégias em `src/agents/index.ts` (Priority: P3)

Como arquiteto do sistema, quero um ponto único de registro e resolução de estratégias (`src/agents/index.ts`) que suporte mapeamento de nomes, aplicação de decorators e injeção de estratégias customizadas/fakes para testes.

**Why this priority**: Desacopla a camada HTTP do Express da implementação interna dos agentes e simplifica a extensão de novas estratégias.

**Independent Test**: Testável invocando `getStrategy(name, { reflect })` e registrando estratégias customizadas via API do registry.

**Acceptance Scenarios**:
1. **Given** o módulo `src/agents/index.ts`,  
   **When** `getStrategy('react', { reflect: true })` é chamado,  
   **Then** retorna uma instância de `ReasoningStrategy` decorada com `withReflection`.

2. **Given** o registro de uma estratégia fake de teste,  
   **When** resolvida pelo registry,  
   **Then** a estratégia fake é instanciada e executada corretamente.

---

## Edge Cases

- **JSON Malformado no Corpo da Requisição**: Se o cliente enviar corpo inválido que falhe no parse do Express (`express.json()`), o middleware deve capturar e responder com 400 Bad Request em vez de 500.
- **Cancelamento/Desconexão do Cliente**: Se o cliente fechar a conexão HTTP durante o processamento longo, o servidor não deve lançar exceções não tratadas ao tentar enviar a resposta.
- **Timeout seguido de conclusão assíncrona da estratégia**: Se a estratégia completar após o envio da resposta 504, o servidor não deve tentar responder novamente (prevenindo erro `ERR_HTTP_HEADERS_SENT`).
- **Erro interno não tratado lançado pela estratégia**: Se a estratégia lançar uma exceção inesperada durante a execução, o endpoint deve capturar e responder com status 500 Internal Server Error contendo `{ "error": "Internal server error" }` sem vazar stack traces sensíveis.
- **Espaços em branco no nome da estratégia ou mensagem**: O schema Zod deve sanitizar strings com `.trim()`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer um servidor Express configurado em `src/http/server.ts` exportando a função de fábrica `createServer(opts?: ServerOptions)` ou aplicação Express configurada.
- **FR-002**: O servidor DEVE expor a rota `POST /chat` com middleware para parsing de JSON (`express.json()`).
- **FR-003**: O corpo da requisição DEVE ser validado através de schema Zod `ChatRequestSchema`:
  ```typescript
  export const ChatRequestSchema = z.object({
    message: z.string().trim().min(1, 'A mensagem não pode ser vazia'),
    strategy: z.string().trim().optional().default('react'),
    reflect: z.boolean().optional().default(false),
  });
  export type ChatRequest = z.infer<typeof ChatRequestSchema>;
  ```
- **FR-004**: Se o corpo da requisição for inválido, o endpoint DEVE responder com status HTTP 400 Bad Request contendo:
  ```json
  {
    "error": "Invalid request body",
    "issues": [ ... ]
  }
  ```
- **FR-005**: O sistema DEVE manter um registry de estratégias em `src/agents/index.ts` que mapeia nomes de estratégias (`react`, `plan-and-execute`, etc.) para suas respectivas fábricas ou instâncias.
- **FR-006**: Se a estratégia informada no campo `strategy` não for encontrada no registry, o endpoint DEVE responder com status HTTP 422 Unprocessable Entity contendo:
  ```json
  {
    "error": "Unknown strategy: <nome>",
    "availableStrategies": ["react", "plan-and-execute"]
  }
  ```
- **FR-007**: Se o campo `reflect` for `true`, o registry/servidor DEVE envolver a estratégia encontrada utilizando a função `withReflection(strategy)`.
- **FR-008**: Em caso de sucesso, o endpoint DEVE responder com status HTTP 200 OK e JSON contendo:
  ```typescript
  export interface ChatResponse {
    answer: string;
    trace: TraceEvent[];
    metrics: Metrics;
  }
  ```
- **FR-009**: O endpoint DEVE implementar um limite de tempo (timeout) de 180 segundos (180.000 ms) por padrão, configurável via opções do servidor (`ServerOptions.timeoutMs`). Se o tempo limite for atingido, a resposta DEVE ser status HTTP 504 Gateway Timeout com `{ "error": "Request timed out" }`.
- **FR-010**: O servidor DEVE suportar injeção de dependência de registry ou estratégias para permitir testes de integração 100% determinísticos sem chamadas externas de rede ou dependência de chaves de API da OpenAI.
- **FR-011**: O projeto DEVE incluir suíte de testes de integração cobrindo os cenários 200 (com e sem reflexão), 400 (validação Zod), 422 (estratégia desconhecida) e 504 (timeout).

---

### Key Entities & Contracts

- **`ChatRequest`**:
  ```typescript
  export interface ChatRequest {
    message: string;
    strategy?: string;
    reflect?: boolean;
  }
  ```

- **`ChatResponse`**:
  ```typescript
  export interface ChatResponse {
    answer: string;
    trace: TraceEvent[];
    metrics: {
      llmCalls: number;
      latencyMs: number;
    };
  }
  ```

- **`ServerOptions`**:
  ```typescript
  export interface ServerOptions {
    /** Timeout em milissegundos para a execução do agente. Padrão: 180000 (180s) */
    timeoutMs?: number;
    /** Registry customizado de estratégias para injeção em testes */
    registry?: StrategyRegistry;
  }
  ```

- **`StrategyRegistry` (`src/agents/index.ts`)**:
  ```typescript
  export type StrategyFactory = () => ReasoningStrategy;

  export class StrategyRegistry {
    register(name: string, factory: StrategyFactory): void;
    get(name: string, opts?: { reflect?: boolean }): ReasoningStrategy | undefined;
    list(): string[];
  }
  ```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Todos os testes de integração (`npm test`) passam com sucesso, executando cenários completos de 200, 400, 422 e 504.
- **SC-002**: A validação estática de tipos (`npm run typecheck`) conclui sem nenhum erro.
- **SC-003**: 0% de chamadas de rede externas ou dependência de serviços remotos durante a execução dos testes de integração (uso estrito de estratégias fake determinísticas).
- **SC-004**: O timeout de 180s responde confiavelmente com HTTP 504 e não deixa processos orfãos ou vazamentos de memória.
- **SC-005**: Tratamento correto de cabeçalhos sem disparar avisos de `ERR_HTTP_HEADERS_SENT` sob condições de concorrência ou timeout.

---

## Assumptions

- O framework HTTP utilizado é o **Express** (versão 4.x/5.x já inclusa no `package.json`).
- As estratégias base `react` e `plan-and-execute` e a camada `withReflection` são resolvidas através de `src/agents/index.ts`.
- O servidor pode ser instanciado e exportado como um app Express pronto para ser iniciado via `app.listen()` ou consumido programaticamente por testes via `supertest` ou servidor HTTP em porta efêmera.
- O padrão de nomenclatura de arquivos e imports segue ECMAScript Modules (`.js` em imports relativos).
