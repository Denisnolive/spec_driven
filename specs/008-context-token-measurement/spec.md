# Feature Specification: Instrumentação de Medição de Contexto e Tokens

**Feature Branch**: `008-context-token-measurement`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "Instrumente a medição de contexto: src/context/tokens.ts com estimateTokens (chars/4) e o usage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fontes; conversa-longa.sh imprime o promptTokens por turno. Com testes"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estimativa e Extração de Tokens do LangChain (Priority: P1)

Como engenheiro de operações e inteligência artificial, quero ter um módulo utilitário (`src/context/tokens.ts`) capaz de estimar a quantidade de tokens a partir do comprimento do texto (`chars / 4`) e extrair o consumo real de tokens a partir dos metadados das mensagens do LangChain (`usage_metadata` / `response_metadata`), para medir o consumo de contexto com precisão.

**Why this priority**: É a camada base da observabilidade de contexto. Sem funções puras e testáveis de contagem de tokens, o servidor não tem como reportar métricas precisas nem discriminar as fontes de contexto.

**Independent Test**: Testável de forma puramente unitária em `src/context/tokens.test.ts`:
1. `estimateTokens("abcd")` retorna `1`.
2. `estimateTokens("")` retorna `0`.
3. `extractTokenUsage(messages)` soma corretamente `input_tokens` / `prompt_tokens` a partir de instâncias ou objetos simulados de `AIMessage` do LangChain.

**Acceptance Scenarios**:
1. **Given** um texto com 100 caracteres,  
   **When** `estimateTokens(text)` é chamado,  
   **Then** retorna `25` tokens (`Math.ceil(100 / 4)`).

2. **Given** uma string vazia `""`,  
   **When** `estimateTokens("")` é chamado,  
   **Then** retorna `0`.

3. **Given** uma lista de mensagens do LangChain onde 2 `AIMessage` possuem metadados de uso (`input_tokens: 150` e `input_tokens: 220`),  
   **When** `extractTokenUsage(messages)` é executado,  
   **Then** retorna `{ promptTokens: 370, ... }`.

---

### User Story 2 - Métricas de Contexto no `/chat` com `contextBreakdown` (Priority: P1)

Como consumidor da API HTTP do OpsPilot, quero que cada resposta do `POST /chat` retorne o valor real de `promptTokens` e o detalhamento discriminado `contextBreakdown` por fonte (mensagem do usuário, histórico de conversa e memórias semânticas), para entender exatamente onde o orçamento de contexto do LLM está sendo gasto.

**Why this priority**: Conecta a medição ao produto final, permitindo auditoria de custos, detecção de inchaço de contexto e ajuste de limites de histórico/memória.

**Independent Test**: Testável enviando requisições `POST /chat` no `src/http/server.test.ts`:
1. Em requisição inicial sem histórico nem memórias, `contextBreakdown.history` é `0`, `contextBreakdown.memories` é `0` e `userMessage` reflete a estimativa da mensagem.
2. Em requisições subsequentes com `conversationId`, `contextBreakdown.history` reflete a soma dos tokens das mensagens anteriores da conversa.
3. Se `userId` for informado e memórias forem injetadas, `contextBreakdown.memories` reflete os tokens dessas memórias.

**Acceptance Scenarios**:
1. **Given** uma requisição `POST /chat` com mensagem de 40 caracteres,  
   **When** o servidor responde 200 OK,  
   **Then** `metrics.promptTokens` é um número positivo e `metrics.contextBreakdown` contém `{ userMessage, history, memories, totalEstimated }`.

2. **Given** uma conversa existente com 4 mensagens no histórico,  
   **When** o próximo turno é executado,  
   **Then** `metrics.contextBreakdown.history` é $> 0$ proporcional ao tamanho do histórico serializado.

3. **Given** uma requisição com `userId` onde 2 memórias semânticas foram injetadas,  
   **When** a resposta é retornada,  
   **Then** `metrics.contextBreakdown.memories` reflete a contagem estimada de tokens das memórias injetadas.

---

### User Story 3 - Script de Demonstração de Conversa Longa (`conversa-longa.sh`) (Priority: P2)

Como testador ou desenvolvedor, quero um script executável (`conversa-longa.sh`) que execute múltiplos turnos de conversa sequenciais em um mesmo `conversationId`, imprimindo o `promptTokens` e a evolução do `contextBreakdown` a cada turno, para validar visualmente o comportamento da janela de contexto.

**Why this priority**: Fornece validação end-to-end automatizada e reproduzível para demonstração prática e benchmarking da retenção de contexto.

**Independent Test**: Executar `./conversa-longa.sh` (ou via bash/PowerShell) contra o servidor local rodando em `localhost:3000` e verificar a saída formatada de cada turno com `promptTokens` crescente.

**Acceptance Scenarios**:
1. **Given** o servidor OpsPilot rodando em `http://localhost:3000`,  
   **When** `./conversa-longa.sh` é executado,  
   **Then** cria uma conversa no turno 1 e exibe o `promptTokens` inicial.

2. **Given** os turnos subsequentes (2, 3, 4, ...),  
   **When** as mensagens são enviadas utilizando o mesmo `conversationId`,  
   **Then** o script imprime o `promptTokens` por turno demonstrando o acúmulo do histórico de contexto.

---

## Edge Cases

- **Mensagem vazia ou sem texto**: `estimateTokens` retorna 0 sem lançar exceção.
- **Respostas simuladas sem `usage_metadata` (ex: FakeReActStrategy em testes)**: `extractTokenUsage` deve fazer fallback seguro para a estimativa de tokens da entrada em vez de retornar `NaN` ou quebrar.
- **Histórico vazio**: `contextBreakdown.history` retorna `0`.
- **Nenhuma memória recuperada**: `contextBreakdown.memories` retorna `0`.
- **Compatibilidade multiplataforma do script**: Fornecer `conversa-longa.sh` (POSIX bash com `curl` e `jq`) e `conversa-longa.ps1` (PowerShell nativo para Windows) para garantir execução em qualquer ambiente.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer `src/context/tokens.ts` exportando:
  ```typescript
  export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }

  export interface ContextBreakdown {
    userMessage: number;
    history: number;
    memories: number;
    totalEstimated: number;
  }

  export function estimateTokens(text: string): number;

  export function extractTokenUsage(messages: unknown[]): TokenUsage;

  export function calculateContextBreakdown(params: {
    userMessage: string;
    history?: Array<{ role: string; content: string }>;
    memories?: Array<{ fact: string } | string>;
  }): ContextBreakdown;
  ```

- **FR-002**: A função `estimateTokens(text)` DEVE calcular a estimativa com `Math.ceil((text || '').length / 4)`.

- **FR-003**: A função `extractTokenUsage(messages)` DEVE inspecionar as mensagens recebidas do LangChain:
  - Verificar `msg.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`).
  - Caso ausente, verificar `msg.response_metadata?.token_usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`).
  - Acumular o total de todas as chamadas presentes no array.

- **FR-004**: As estratégias (`react.ts`, `plan-and-execute.ts`, etc.) e a interface `Metrics` em `src/agents/types.ts` DEVEM ser estendidas para incluir:
  ```typescript
  export interface Metrics {
    llmCalls: number;
    latencyMs: number;
    historyMessages?: number;
    recalledMemories?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    contextBreakdown?: ContextBreakdown;
  }
  ```

- **FR-005**: O endpoint `POST /chat` em `src/http/server.ts` DEVE:
  - Calcular o `contextBreakdown` a partir da mensagem do usuário, histórico e memórias semânticas recuperadas.
  - Resolver `promptTokens` real extraído da execução da estratégia (ou fallback para `contextBreakdown.totalEstimated`).
  - Incluir `promptTokens` e `contextBreakdown` no objeto `metrics` do `ChatResponse`.

- **FR-006**: O repositório DEVE incluir o script `conversa-longa.sh` executável (e script complementar `conversa-longa.ps1`) que:
  - Executa ao menos 4 turnos contínuos de conversa via `POST http://localhost:3000/chat`.
  - Captura o `conversationId` no primeiro turno e reutiliza nos turnos seguintes.
  - Extrai e imprime no terminal a cada turno: número do turno, mensagem enviada, `promptTokens` real e o breakdown de contexto.

- **FR-007**: A suíte de testes DEVE incluir `src/context/tokens.test.ts` com 100% de cobertura determinística das funções de contagem, extração de usage e breakdown.

---

### Key Entities & Contracts

- **Contrato de Métricas de Resposta (`ChatResponse.metrics`)**:
  ```typescript
  export interface ChatResponse {
    answer: string;
    trace: TraceEvent[];
    metrics: {
      llmCalls: number;
      latencyMs: number;
      historyMessages: number;
      recalledMemories?: number;
      promptTokens: number;
      completionTokens?: number;
      totalTokens?: number;
      contextBreakdown: {
        userMessage: number;
        history: number;
        memories: number;
        totalEstimated: number;
      };
    };
    conversationId: string;
  }
  ```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `src/context/tokens.test.ts` valida a estimativa por `chars / 4` e a extração dos metadados de tokens do LangChain com 100% de aprovação.
- **SC-002**: Cada requisição de sucesso do `POST /chat` retorna `promptTokens` numérico e o objeto discriminado `contextBreakdown`.
- **SC-003**: O valor de `contextBreakdown.history` cresce estritamente conforme novos turnos são adicionados a uma mesma conversa.
- **SC-004**: O script `conversa-longa.sh` executa com sucesso contra o servidor local e imprime o relatório formatado de `promptTokens` por turno.
- **SC-005**: Todos os testes da suíte (`npm test`) e checagem de tipos (`npm run typecheck`) executam com 100% de sucesso sem regressões.
