# Feature Specification: Sumarização de Histórico e Poda de Contexto (Pruning)

**Feature Branch**: `009-history-summarization`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendências, MESCLADO ao resumo anterior e persistido - refeito só quando 8 novas saem da janela, nunca a cada request. Resumo entra no contexto; evento "summarize". Com teste fake"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistência e Recuperação de Resumos (`conversation_summaries`) (Priority: P1)

Como sistema de orquestração de contexto, quero persistir e consultar resumos consolidados de conversas na tabela `conversation_summaries` do SQLite (e `InMemoryConversationStore`), registrando o texto sumarizado e o contador de mensagens já processadas, para que o histórico antigo não se perca e possa ser recuperado rapidamente sem reprocessamento.

**Why this priority**: É a fundação do armazenamento de resumos. Sem uma tabela e métodos dedicados no `ConversationStore`, não há onde persistir nem controlar quais mensagens já foram processadas.

**Independent Test**: Testável em `src/store/sqlite-conversation-store.test.ts`:
1. Gravar um resumo inicial para uma conversa existente via `saveSummary(conversationId, summary, count)`.
2. Recuperar via `getSummary(conversationId)` e verificar integridade do texto e do contador.
3. Atualizar o resumo com novo texto mesclado e verificar que `updated_at` e `summarized_messages_count` são atualizados corretamente.

**Acceptance Scenarios**:
1. **Given** uma conversa válida `c-1`,  
   **When** `saveSummary("c-1", "Resumo das decisões...", 8)` é executado,  
   **Then** o registro é salvo na tabela `conversation_summaries` e `getSummary("c-1")` retorna os dados persistidos.

2. **Given** uma conversa sem resumo prévio,  
   **When** `getSummary("c-sem-resumo")` é consultado,  
   **Then** retorna `null` sem erros.

3. **Given** um resumo existente,  
   **When** um novo resumo mesclado é salvo para a mesma conversa,  
   **Then** o registro existente é atualizado (upsert).

---

### User Story 2 - Motor de Poda e Sumarização Incremental em Lote (Priority: P1)

Como agente de operações, quero que as mensagens que saem da janela recente de 8 mensagens sejam compactadas em um resumo de ~150 tokens (preservando decisões, fatos e pendências) MESCLADO ao resumo anterior, de forma que esse reprocessamento ocorra ESTRITAMENTE quando 8 novas mensagens saírem da janela (nunca a cada requisição individual), disparando o evento `"summarize"`.

**Why this priority**: Garante estabilidade e contenção de custo do contexto sem degradar a memória de longo prazo da conversa. Evita chamadas redundantes a cada turno e protege o modelo contra perda de fatos e decisões operacionais tomadas no início da conversa.

**Independent Test**: Testável unitariamente com um modelo simulado (`FakeSummarizer`):
1. Conversa com até 8 mensagens: `checkAndSummarize()` não dispara resumo nem emite evento.
2. Conversa atinge 16 mensagens (8 saíram da janela de 8 recentes): `checkAndSummarize()` aciona o sumarizador, mescla com resumo prévio (se houver), emite evento `"summarize"` e atualiza o store.
3. Conversa com 17 a 23 mensagens (menos de 8 novas saíram da janela): `checkAndSummarize()` não dispara nova sumarização.
4. Conversa atinge 24 mensagens (mais 8 saíram da janela): dispara a segunda rodada de sumarização mesclando com o resumo anterior.

**Acceptance Scenarios**:
1. **Given** uma conversa com 8 mensagens no total,  
   **When** a verificação de poda é realizada,  
   **Then** nenhuma sumarização ocorre, `summarize` não é disparado e `summarized_messages_count` permanece 0.

2. **Given** uma conversa que atinge 16 mensagens (8 recentes + 8 que saíram da janela),  
   **When** a verificação de poda é executada,  
   **Then** as 8 primeiras mensagens são compactadas em ~150 tokens, o evento `"summarize"` é emitido com os dados do resumo, e o resumo é salvo com `summarized_messages_count = 8`.

3. **Given** um resumo existente cobrindo 8 mensagens, e a conversa atinge 24 mensagens (mais 8 saíram da janela),  
   **When** a poda é acionada,  
   **Then** o sumarizador recebe o resumo anterior + as novas 8 mensagens excedentes, gera um novo resumo mesclado preservando decisões, fatos e pendências, emite `"summarize"` e salva com `summarized_messages_count = 16`.

---

### User Story 3 - Injeção do Resumo no Contexto e Observabilidade das Métricas (Priority: P1)

Como usuário e operador interagindo via `POST /chat`, quero que o resumo persistido da conversa seja automaticamente injetado no contexto fornecido ao modelo e discriminado em `metrics.contextBreakdown.summary`, mantendo no histórico direto apenas as 8 mensagens recentes.

**Why this priority**: Fecha o ciclo de ponta a ponta: o LLM enxerga o resumo anterior + as 8 mensagens recentes + memórias semânticas + mensagem atual, enquanto as métricas reportam explicitamente o impacto de tokens do resumo.

**Independent Test**: Testável em `src/http/server.test.ts`:
1. Conversa longa (>16 mensagens) com resumo gravado.
2. Ao chamar `/chat`, o contexto passado à estratégia inclui o resumo prévio e exatamente 8 mensagens de histórico.
3. `metrics.contextBreakdown.summary` é maior que 0 e reflete os tokens estimados do resumo.

**Acceptance Scenarios**:
1. **Given** uma conversa com resumo salvo em `conversation_summaries`,  
   **When** uma nova requisição é recebida no `/chat`,  
   **Then** o resumo é injetado no contexto (ex: prefixado ou como instrução de contexto da conversa anterior) e o histórico passado ao modelo contém no máximo as 8 mensagens mais recentes.

2. **Given** uma resposta do `/chat` em uma conversa sumarizada,  
   **When** a resposta 200 OK é retornada,  
   **Then** `metrics.contextBreakdown` contém o campo `summary` com a contagem de tokens estimados do resumo, compondo o `totalEstimated`.

---

## Edge Cases

- **Primeiras 8 mensagens da conversa**: Nenhum resumo gerado, `summary` no breakdown é 0.
- **Conversa com exatamente 15 mensagens**: 7 mensagens saíram da janela. Como não atingiu o lote mínimo de 8 novas mensagens podadas, NENHUM resumo é acionado.
- **Resumo vazio ou inexistente**: O sistema continua funcionando normalmente sem injetar bloco de resumo.
- **Falha no LLM de sumarização**: O erro deve ser tratado sem derrubar a requisição principal do usuário; a conversa continua com as 8 mensagens recentes e tenta novamente no próximo turno elegível.
- **Conteúdo do resumo contendo decisões operacionais críticas**: O prompt de sumarização deve explicitamente instruir o LLM a reter incidentes abertos/fechados, decisões de severidade, fatos dos serviços e pendências abertas, mantendo o limite alvo de ~150 tokens.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O banco SQLite DEVE criar a tabela `conversation_summaries`:
  ```sql
  CREATE TABLE IF NOT EXISTS conversation_summaries (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
    summary TEXT NOT NULL,
    summarized_messages_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- **FR-002**: A interface `ConversationStore` DEVE incluir métodos para obter e persistir resumos:
  ```typescript
  export interface ConversationSummaryData {
    conversation_id: string;
    summary: string;
    summarized_messages_count: number;
    updated_at: string;
  }

  // Métodos no ConversationStore:
  getSummary(conversationId: string): ConversationSummaryData | null;
  saveSummary(conversationId: string, summary: string, summarizedMessagesCount: number): void;
  countMessages(conversationId: string): number;
  getMessagesRange(conversationId: string, offset: number, limit: number): MessageData[];
  ```
- **FR-003**: O sistema DEVE fornecer `src/context/summarizer.ts` responsável pela lógica de poda e sumarização:
  - Janela recente fixa: 8 mensagens.
  - Limite de ativação de novo resumo: a cada 8 mensagens que saem da janela recente (`pending = (totalMessages - 8) - summarizedMessagesCount >= 8`).
  - Nunca executar sumarização a cada request se o lote de 8 novas saídas não tiver sido atingido.
  - Mesclar o resumo anterior com as 8 novas mensagens podadas em um texto de ~150 tokens preservando decisões, fatos e pendências.
  - Emitir evento `"summarize"` (via EventEmitter ou callback tipado) contendo `{ conversationId, oldSummary, newSummary, messagesSummarized }`.
- **FR-004**: O endpoint `POST /chat` DEVE:
  - Limitar o histórico de mensagens recentes passado ao modelo em 8 mensagens (em vez das 12 anteriores).
  - Consultar `getSummary(conversationId)` e, se existente, injetar o resumo no contexto.
  - Executar a verificação de sumarização (`checkAndSummarize`) sem bloquear a resposta do usuário caso executado em background, ou logo após a persistência da mensagem.
  - Incluir `summary` no `metrics.contextBreakdown` discriminando a estimativa de tokens do resumo.
- **FR-005**: DEVE ser fornecido um módulo ou classe `FakeSummarizer` para testes unitários e de integração sem dependência de API externa.

### Key Technical Decisions & Invariants

1. **Janela de 8 mensagens recentes**: As últimas 8 mensagens ficam no histórico direto da conversa.
2. **Lote de 8 mensagens podadas**: Uma sumarização ocorre apenas quando pelo menos 8 mensagens adicionais tiverem saído da janela recente desde a última sumarização.
3. **Resumo cumulativo e mesclado**: O novo resumo é sempre o resultado da mesclagem do resumo anterior com as novas mensagens podadas, mantendo o tamanho estável em torno de ~150 tokens.
4. **Evento "summarize"**: Observabilidade através de emissão do evento `"summarize"` com metadados do lote sumarizado.

---

## Verification Plan

### Automated Tests
1. `src/store/sqlite-conversation-store.test.ts`:
   - Criação da tabela `conversation_summaries`.
   - `saveSummary`, `getSummary`, `countMessages` e `getMessagesRange`.
2. `src/context/summarizer.test.ts`:
   - Teste com FakeSummarizer validando a regra dos 8 turnos.
   - Validação de que não roda a cada request.
   - Validação da emissão do evento `"summarize"`.
   - Validação da mesclagem com resumo anterior.
3. `src/http/server.test.ts`:
   - Validação de `metrics.contextBreakdown.summary`.
   - Injeção do resumo no contexto e preservação das 8 mensagens recentes.
4. Execução de `npm run typecheck` e `npm test`.
