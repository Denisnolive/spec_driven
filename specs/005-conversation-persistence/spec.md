# Feature Specification: Conversa Persistente (ConversationStore + histório no prompt)

**Feature Branch**: `005-conversation-persistence`  
**Created**: 2026-09-08  
**Status**: Draft  
**Input**: User description: "Conversa persistente: ConversationStore (append/lastMessages/create) + tabela messages como no SqliteOpsStore; /chat: conversationId opcional, devolvido na resposta; 12 últimas mensagens no prompt via composição; métrica historyMessages; testes ':memory:' + fake"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistência de Mensagens em Conversa (Priority: P1)

Como operador ou agente autônomo do OpsPilot, quero que cada interação no `/chat` seja armazenada em uma conversa persistente (banco SQLite) para que o histórico de perguntas e respostas sobreviva a reinicializações do servidor e possa ser retomado a qualquer momento.

**Why this priority**: É a espinha dorsal da feature — sem persistência das mensagens, não há como injetar contexto de histórico e toda conversa começa do zero. É o alicerce das stories subsequentes.

**Independent Test**: Testável instanciando `SqliteConversationStore` com `:memory:`, criando uma conversa via `create()`, inserindo mensagens via `append()` e verificando que `lastMessages(conversationId, 12)` retorna exatamente as mensagens inseridas em ordem cronológica.

**Acceptance Scenarios**:
1. **Given** uma instância de `ConversationStore` em `:memory:`,  
   **When** `create()` é chamado,  
   **Then** retorna um `conversationId` (UUIDv4) e registra a conversa na tabela `conversations`.

2. **Given** uma conversa existente com `conversationId`,  
   **When** `append(conversationId, { role: 'user', content: 'Olá' })` é chamado,  
   **Then** persiste a mensagem na tabela `messages` com referência ao `conversationId`, `role`, `content` e `created_at` automático.

3. **Given** 15 mensagens inseridas numa conversa,  
   **When** `lastMessages(conversationId, 12)` é chamado,  
   **Then** retorna exatamente as 12 mensagens mais recentes em ordem cronológica (ASC por `id`).

4. **Given** um `conversationId` inexistente,  
   **When** `append()` é chamado,  
   **Then** a constraint `FOREIGN KEY` lança erro, impedindo mensagens órfãs.

---

### User Story 2 - Endpoint `/chat` com `conversationId` Opcional (Priority: P1)

Como cliente HTTP ou frontend do OpsPilot, quero poder enviar `conversationId` no body do `POST /chat` para continuar uma conversa existente, ou omiti-lo para que o servidor crie uma nova conversa automaticamente. Em ambos os casos o `conversationId` é devolvido na resposta.

**Why this priority**: É a interface de acesso à feature — sem esta story, a persistência interna não é acessível via API.

**Independent Test**: Testável enviando `POST /chat` sem `conversationId` e verificando que a resposta 200 contém um `conversationId` válido; em seguida reenviando com o mesmo `conversationId` e verificando que a conversa é continuada.

**Acceptance Scenarios**:
1. **Given** uma requisição `POST /chat` com `{ "message": "Listar alertas" }` (sem `conversationId`),  
   **When** o servidor processa,  
   **Then** cria uma nova conversa, persiste a mensagem do usuário e a resposta do agente, e retorna `{ answer, trace, metrics, conversationId }` com status 200.

2. **Given** uma requisição `POST /chat` com `{ "message": "E o billing?", "conversationId": "<uuid-existente>" }`,  
   **When** o servidor processa,  
   **Then** carrega as últimas 12 mensagens da conversa, injeta no prompt como histórico, persiste a nova interação e retorna o mesmo `conversationId` na resposta.

3. **Given** uma requisição com `conversationId` em formato inválido (não UUID),  
   **When** validado pelo schema Zod,  
   **Then** o servidor responde 400 Bad Request com issues indicando formato inválido.

4. **Given** uma requisição com `conversationId` UUID válido mas que não existe na base,  
   **When** o endpoint tenta carregar o histórico,  
   **Then** o servidor responde 404 Not Found com `{ "error": "Conversation not found", "conversationId": "<uuid>" }`.

---

### User Story 3 - Injeção de Histórico no Prompt do Agente (Priority: P1)

Como engenheiro de prompt/LLM, quero que as 12 últimas mensagens da conversa sejam injetadas no prompt como contexto de histórico para que o agente possa responder com continuidade, entendendo referências a perguntas e respostas anteriores.

**Why this priority**: É o que dá utilidade funcional à persistência — sem injeção, guardar mensagens é inútil para o agente.

**Independent Test**: Testável criando uma conversa com mensagens prévias, invocando a strategy com a composição de histórico e verificando que as mensagens passadas estão presentes no array de messages enviado ao agente.

**Acceptance Scenarios**:
1. **Given** uma conversa com 5 mensagens anteriores (alternando `user`/`assistant`),  
   **When** uma nova requisição `POST /chat` chega com esse `conversationId`,  
   **Then** o array de messages enviado ao agente contém as 5 mensagens de histórico + a mensagem atual do usuário, totalizando 6 mensagens.

2. **Given** uma conversa com 20 mensagens anteriores,  
   **When** uma nova requisição chega,  
   **Then** apenas as 12 mais recentes são carregadas e injetadas antes da mensagem atual (janela deslizante fixa).

3. **Given** uma nova conversa (sem histórico),  
   **When** o agente é invocado,  
   **Then** o prompt contém apenas a mensagem atual do usuário, sem mensagens de histórico (comportamento idêntico ao atual).

---

### User Story 4 - Métrica `historyMessages` na Resposta (Priority: P2)

Como consumidor da API, quero saber quantas mensagens de histórico foram injetadas no prompt de cada requisição para monitorar o uso de contexto e diagnosticar o comportamento do agente.

**Why this priority**: Observabilidade complementar; não bloqueia funcionalidade core mas é essencial para debugging e tuning.

**Independent Test**: Testável verificando que o campo `metrics.historyMessages` na resposta reflete o número real de mensagens de histórico carregadas.

**Acceptance Scenarios**:
1. **Given** uma conversa nova sem histórico,  
   **When** `POST /chat` retorna,  
   **Then** `metrics.historyMessages` é `0`.

2. **Given** uma conversa com 8 mensagens anteriores,  
   **When** `POST /chat` retorna,  
   **Then** `metrics.historyMessages` é `8`.

3. **Given** uma conversa com 20 mensagens anteriores,  
   **When** `POST /chat` retorna,  
   **Then** `metrics.historyMessages` é `12` (limite da janela).

---

## Edge Cases

- **`conversationId` presente mas vazio (`""`)**: O schema Zod com `.uuid()` deve rejeitar com 400 Bad Request.
- **Mensagem com conteúdo muito longo**: Sem limite explícito na spec atual; assume-se que o SQLite suporta TEXT sem restrição prática de tamanho. A limitação de contexto é do modelo LLM, não do store.
- **Concorrência de escrita na mesma conversa**: `DatabaseSync` do `node:sqlite` é single-threaded síncrono, eliminando condições de corrida no processo Node.
- **Conversa sem mensagens**: `lastMessages()` deve retornar array vazio, não erro.
- **Role inválido**: A constraint `CHECK(role IN ('user', 'assistant'))` na tabela `messages` impede inserção de roles arbitrários.
- **Ordem de persistência**: O `append` do user e o `append` do assistant devem ocorrer em sequência garantida (user → strategy.run → assistant), nunca em paralelo, para preservar a ordem cronológica.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer a interface `ConversationStore` em `src/store/conversation-store.ts`:
  ```typescript
  export interface MessageData {
    id: number;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }

  export interface ConversationData {
    id: string;           // UUIDv4
    created_at: string;
  }

  export interface ConversationStore {
    create(): string;  // retorna conversationId (UUIDv4)
    append(conversationId: string, message: { role: 'user' | 'assistant'; content: string }): MessageData;
    lastMessages(conversationId: string, limit: number): MessageData[];
    exists(conversationId: string): boolean;
  }
  ```

- **FR-002**: O sistema DEVE fornecer `SqliteConversationStore` em `src/store/sqlite-conversation-store.ts` implementando `ConversationStore` com `node:sqlite` (`DatabaseSync`), reutilizando a instância de `DatabaseSync` do `SqliteOpsStore` existente (mesmo banco, mesmo arquivo).

- **FR-003**: O banco DEVE conter 2 tabelas adicionais com DDL idempotente:
  - `conversations`: `id` (TEXT PRIMARY KEY — UUIDv4), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
  - `messages`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `conversation_id` (TEXT NOT NULL REFERENCES conversations(id)), `role` (TEXT NOT NULL CHECK(role IN ('user', 'assistant'))), `content` (TEXT NOT NULL), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
  - Índice: `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id)`

- **FR-004**: TODAS as operações DEVEM utilizar Prepared Statements — SQL concatenado é PROIBIDO (mesmo padrão do `SqliteOpsStore`).

- **FR-005**: O UUIDv4 DEVE ser gerado via `crypto.randomUUID()` (nativo do Node.js ≥ 19).

- **FR-006**: O `ChatRequestSchema` em `src/http/server.ts` DEVE ser estendido com o campo opcional:
  ```typescript
  conversationId: z.string().uuid('conversationId deve ser UUID válido').optional()
  ```

- **FR-007**: O `ChatResponse` DEVE incluir o campo `conversationId: string` em todas as respostas 200 OK.

- **FR-008**: Quando `conversationId` não é fornecido, o endpoint DEVE:
  1. Criar uma nova conversa via `conversationStore.create()`
  2. Persistir a mensagem do usuário via `append(conversationId, { role: 'user', content: message })`
  3. Executar a strategy
  4. Persistir a resposta via `append(conversationId, { role: 'assistant', content: answer })`
  5. Retornar o `conversationId` na resposta

- **FR-009**: Quando `conversationId` é fornecido, o endpoint DEVE:
  1. Verificar existência via `conversationStore.exists(conversationId)` — se não existir, retornar 404
  2. Carregar `conversationStore.lastMessages(conversationId, 12)`
  3. Compor o array de mensagens de entrada como `[...historyMessages, { role: 'user', content: message }]`
  4. Persistir a mensagem do usuário, executar a strategy, persistir a resposta
  5. Retornar o mesmo `conversationId` na resposta

- **FR-010**: A composição de histórico no prompt DEVE ser feita na camada do endpoint (antes de chamar `strategy.run()`), transformando a chamada de `strategy.run(message)` para uma input string que inclui o histórico serializado, como:
  ```
  [Histórico da conversa]
  user: mensagem anterior 1
  assistant: resposta anterior 1
  ...
  [Mensagem atual]
  user: mensagem atual
  ```
  Isso mantém a assinatura `run(input: string)` da interface `ReasoningStrategy` inalterada.

- **FR-011**: O campo `metrics` DEVE incluir `historyMessages: number` indicando quantas mensagens de histórico foram injetadas no prompt (0 para conversas novas, até 12 para conversas existentes).

- **FR-012**: O sistema DEVE fornecer `InMemoryConversationStore` implementando `ConversationStore` para uso em testes e benchmarks (mesmo padrão do `InMemoryOpsStore`).

- **FR-013**: A instância padrão de `ConversationStore` DEVE ser injetável no `createServer()` via `ServerOptions` para permitir testes determinísticos.

---

### Key Entities & Contracts

- **`MessageData`**:
  ```typescript
  export interface MessageData {
    id: number;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }
  ```

- **`ConversationData`**:
  ```typescript
  export interface ConversationData {
    id: string;          // UUIDv4
    created_at: string;
  }
  ```

- **`ChatRequestSchema` (atualizado)**:
  ```typescript
  export const ChatRequestSchema = z.object({
    message: z.string().trim().min(1, 'A mensagem não pode ser vazia'),
    strategy: z.string().trim().optional().default('react'),
    reflect: z.boolean().optional().default(false),
    conversationId: z.string().uuid('conversationId deve ser UUID válido').optional(),
  });
  ```

- **`ChatResponse` (atualizado)**:
  ```typescript
  export interface ChatResponse {
    answer: string;
    trace: TraceEvent[];
    metrics: Metrics & { historyMessages: number };
    conversationId: string;
  }
  ```

- **`ServerOptions` (atualizado)**:
  ```typescript
  export interface ServerOptions {
    timeoutMs?: number;
    registry?: StrategyRegistry;
    conversationStore?: ConversationStore;
  }
  ```

- **Tabelas SQL**:
  ```sql
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
  ```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npm test` executa 100% verde incluindo todos os testes novos de `ConversationStore` (`:memory:`) e testes atualizados do endpoint `/chat` com `conversationId`.
- **SC-002**: `npm run typecheck` conclui sem erros de tipo.
- **SC-003**: 100% das queries de `ConversationStore` utilizam Prepared Statements.
- **SC-004**: Violação de constraints (`FOREIGN KEY`, `CHECK(role)`) dispara erro previsível nos testes.
- **SC-005**: Testes de integração do `/chat` verificam o ciclo completo: criar conversa → enviar mensagens → continuar com `conversationId` → validar injeção de histórico e métrica `historyMessages`.
- **SC-006**: Testes existentes (store, tools, server) continuam passando sem regressão.

---

## Assumptions

- O `node:sqlite` (`DatabaseSync`) já disponível no projeto suporta `FOREIGN KEY` habilitado via `PRAGMA foreign_keys = ON` (será executado na inicialização do `SqliteConversationStore`).
- O UUID é gerado via `crypto.randomUUID()` (Node.js ≥ 19, disponível no ambiente do projeto).
- A janela de histórico é fixa em 12 mensagens, sem configuração dinâmica na v1. Pode ser parametrizada em iteração futura.
- A composição de histórico usa serialização textual no input string (não altera a assinatura `run(input: string)` da interface `ReasoningStrategy`), mantendo compatibilidade com todas as strategies existentes (ReAct, Plan-and-Execute, Reflection).
- O `SqliteConversationStore` compartilha a mesma instância `DatabaseSync` e o mesmo arquivo de banco (`.db`) do `SqliteOpsStore`, evitando múltiplas conexões e problemas de lock.
- A implementação `InMemoryConversationStore` armazena dados em arrays simples no heap, sem persistência entre instâncias (mesmo padrão do `InMemoryOpsStore`).
