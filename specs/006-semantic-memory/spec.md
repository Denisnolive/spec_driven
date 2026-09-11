# Feature Specification: Memória Semântica (MemoryStore por userId com Embeddings Locais)

**Feature Branch**: `006-semantic-memory`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "Memória semântica: MemoryStore por userId - remember (dedup > 0.92), recall top-3 por produto escalar (min 0.3), forget; tabela memories, embedding all-MiniLM-L6-v2 local em BLOB; /chat ganha userId e injeta o recall no prompt; teste: recall acha fato sem palavra em comum. user: @huggingface/transformers com pooling: mean + normalize: true e lazy singleton src/memory/embeddings.ts e src/memory/memory-store.ts. As colunas de memories (id, user_id, fact, embedding, created_at)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistência Semântica com Deduplicação e Esquecimento (Priority: P1)

Como operador ou agente autônomo, quero que fatos sobre o usuário ou preferências operacionais sejam armazenados com representação vetorial em SQLite (`remember`) evitando duplicatas semânticas (> 0.92), e que fatos obsoletos possam ser removidos (`forget`), para manter uma base de conhecimento concisa e relevante por usuário.

**Why this priority**: É a fundação do subsistema de memória vetorial. Sem a capacidade de gerar embeddings locais e persistir/deduplicar fatos em SQLite, nenhuma busca semântica é viável.

**Independent Test**: Testável chamando `remember(userId, fact)` com fatos idênticos ou parafraseados (similaridade > 0.92) e validando que apenas 1 registro é mantido no banco SQLite em memória; e chamando `forget(userId, memoryId)` verificando que a memória é excluída com sucesso.

**Acceptance Scenarios**:
1. **Given** um `userId` e um fato `"Thiago é especialista no serviço de autenticação"`,  
   **When** `remember(userId, fact)` é executado,  
   **Then** o embedding de 384 dimensões é gerado via `all-MiniLM-L6-v2`, armazenado como BLOB no SQLite na tabela `memories`, e retorna o `MemoryData` criado.

2. **Given** um fato já registrado para `user-1` com embedding $E_1$,  
   **When** `remember(user-1, novoFato)` é chamado com texto cujo embedding possui similaridade de cosseno / produto escalar $> 0.92$,  
   **Then** o sistema detecta duplicidade semântica e não insere novo registro redundante, retornando a memória existente.

3. **Given** um fato registrado com id `42` pertencente ao `user-1`,  
   **When** `forget('user-1', 42)` é executado,  
   **Then** o registro é removido do SQLite e retorna `true`.

4. **Given** uma memória existente pertencente ao `user-2`,  
   **When** `forget('user-1', idDoUser2)` é executado,  
   **Then** a memória NÃO é removida (isolamento estrito entre usuários) e retorna `false`.

---

### User Story 2 - Recuperação Semântica (Recall Top-3 com Similaridade Mínima) (Priority: P1)

Como agente inteligente, quero consultar a memória de um usuário com base no significado semântico da pergunta (`recall`), retornando os até 3 fatos mais relevantes com similaridade mínima de 0.3, mesmo quando a pergunta não possui palavras em comum com o fato gravado.

**Why this priority**: É o valor central da memória semântica — permitir ao agente conectar conceitos correlatos sem depender de busca exata por palavras-chave (lexical match).

**Independent Test**: Testável gravando `"O operador tem preferência por turnos durante a madrugada"` e realizando recall com `"qual o período de trabalho preferido do usuário?"`. Como não há palavras em comum, uma busca relacional por `LIKE` falharia, mas o `recall` vetorial recupera o fato com similaridade $> 0.3$.

**Acceptance Scenarios**:
1. **Given** fatos salvos para um usuário sobre rotinas,  
   **When** `recall(userId, query, topK = 3, minSimilarity = 0.3)` é executado com uma query semanticamente relacionada sem palavras em comum,  
   **Then** o fato é recuperado entre os resultados com pontuação de similaridade calculada via produto escalar.

2. **Given** 5 fatos salvos para o usuário, todos com similaridade $> 0.3$ com a query,  
   **When** `recall(userId, query, 3, 0.3)` é chamado,  
   **Then** são retornados no máximo os 3 primeiros fatos ordenados por similaridade decrescente.

3. **Given** fatos salvos no banco cujo produto escalar com a query é $< 0.3$ (tópicos completamente não relacionados),  
   **When** `recall(userId, query, 3, 0.3)` é chamado,  
   **Then** retorna um array vazio (nenhuma memória irrelevante é retornada).

4. **Given** fatos salvos para `user-A` e `user-B`,  
   **When** `recall('user-A', query)` é chamado,  
   **Then** apenas as memórias pertencentes a `user-A` são avaliadas e retornadas.

---

### User Story 3 - Injeção de Contexto Semântico no `/chat` por `userId` (Priority: P1)

Como cliente da API, quero informar opcionalmente `userId` no payload de `POST /chat` para que as memórias semânticas relevantes daquele usuário sejam injetadas dinamicamente no prompt do agente, enriquecendo suas respostas com fatos personalizados.

**Why this priority**: Conecta a infraestrutura de memória semântica ao canal de interação do usuário final do OpsPilot.

**Independent Test**: Testável enviando `POST /chat` com `userId` onde fatos prévios foram memorizados; verificar que o prompt repassado à estratégia contém a seção de memórias relevantes recuperadas e que a resposta reflete esse contexto.

**Acceptance Scenarios**:
1. **Given** uma requisição `POST /chat` com `{ "message": "como devo escalar o alerta?", "userId": "user-123" }`,  
   **When** o endpoint processa a requisição,  
   **Then** executa `recall("user-123", message, 3, 0.3)` e inclui o bloco de memórias relevantes recuperadas no contexto de entrada da estratégia.

2. **Given** uma requisição `POST /chat` sem o campo `userId`,  
   **When** o endpoint processa a requisição,  
   **Then** nenhuma consulta ao `MemoryStore` é realizada e o fluxo segue normalmente (retrocompatibilidade garantida).

3. **Given** uma requisição `POST /chat` com `userId`,  
   **When** o servidor retorna status 200 OK,  
   **Then** a resposta contém a métrica `recalledMemories: number` indicando a quantidade de memórias injetadas.

---

## Edge Cases

- **Primeira execução do modelo (Cold Start)**: O download/inicialização dos pesos ONNX do `all-MiniLM-L6-v2` via `@huggingface/transformers` pode levar alguns segundos na primeira chamada. O design DEVE usar **lazy singleton** para que o pipeline seja carregado uma única vez na inicialização sob demanda e reutilizado nas próximas chamadas sem re-carregamento.
- **Deduplicação com threshold 0.92**: Fatos com similaridade $\ge 0.92$ (ex: `"Adoro pizza de queijo"` vs `"Adoro pizza quatro queijos"`) são considerados duplicatas semânticas para aquele usuário e ignorados na inserção.
- **Vetor normalizado e produto escalar**: Com `normalize: true` na extração de features, a norma Euclidiana $\|v\| = 1$. Logo, o produto escalar $\mathbf{a} \cdot \mathbf{b} = \sum a_i b_i$ é identicamente a similaridade de cosseno, economizando computação (dispensa cálculo de raízes quadradas).
- **Serialização de BLOB no SQLite**: Embeddings são vetores `Float32Array` (384 elementos $\times$ 4 bytes = 1536 bytes). O armazenamento no SQLite deve ser feito convertendo `Float32Array` para `Buffer` nativo do Node.js, e a desserialização converte o `Buffer` lido de volta para `Float32Array`.
- **Validação de userId**: `userId` deve ser uma string não vazia (`z.string().trim().min(1)`).
- **Sem memórias para o usuário**: Se o usuário não possuir memórias ou nenhuma atingir o threshold de 0.3, a busca retorna `[]` sem falhas.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer o módulo `src/memory/embeddings.ts` utilizando `@huggingface/transformers` com a pipeline `feature-extraction` configurada para:
  - Modelo: `'Xenova/all-MiniLM-L6-v2'`
  - Pooling: `'mean'`
  - Normalize: `true`
  - Instanciação em **lazy singleton** (uma única instância global instanciada sob demanda).
  - Função pública: `getEmbedding(text: string): Promise<Float32Array>`
  - Função auxiliar para produto escalar: `dotProduct(a: Float32Array, b: Float32Array): number`

- **FR-002**: O sistema DEVE fornecer a interface e tipos em `src/memory/memory-store.ts`:
  ```typescript
  export interface MemoryData {
    id: number;
    user_id: string;
    fact: string;
    created_at: string;
  }

  export interface MemoryRecallItem extends MemoryData {
    similarity: number;
  }

  export interface MemoryStore {
    remember(userId: string, fact: string): Promise<{ memory: MemoryData; isNew: boolean }>;
    recall(userId: string, query: string, topK?: number, minSimilarity?: number): Promise<MemoryRecallItem[]>;
    forget(userId: string, memoryId: number): Promise<boolean>;
    list(userId: string): Promise<MemoryData[]>;
  }
  ```

- **FR-003**: O sistema DEVE fornecer `SqliteMemoryStore` em `src/memory/memory-store.ts` implementando `MemoryStore` e persistindo os registros na tabela SQLite `memories`:
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    embedding BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
  ```

- **FR-004**: No método `remember(userId, fact)`:
  - Gera o embedding vetorial do texto `fact`.
  - Carrega os embeddings de todas as memórias existentes do mesmo `userId`.
  - Se qualquer memória existente tiver produto escalar $\ge 0.92$, não realiza nova inserção e retorna a memória existente com `isNew: false`.
  - Caso contrário, insere na tabela `memories` via Prepared Statement armazenando o embedding como `Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)` e retorna o novo registro com `isNew: true`.

- **FR-005**: No método `recall(userId, query, topK = 3, minSimilarity = 0.3)`:
  - Gera o embedding vetorial da `query`.
  - Recupera todas as memórias do `userId` (`id`, `user_id`, `fact`, `embedding`, `created_at`).
  - Para cada memória, desserializa o BLOB para `Float32Array` e calcula `similarity = dotProduct(queryEmbedding, memoryEmbedding)`.
  - Filtra apenas registros com `similarity >= minSimilarity`.
  - Ordena de forma decrescente por `similarity`.
  - Retorna os primeiros `topK` elementos (padrão top 3).

- **FR-006**: No método `forget(userId, memoryId)`:
  - Executa exclusão via Prepared Statement: `DELETE FROM memories WHERE id = ? AND user_id = ?`.
  - Retorna `true` se `changes > 0`, caso contrário `false`.

- **FR-007**: O sistema DEVE atualizar `ChatRequestSchema` em `src/http/server.ts` adicionando o campo opcional:
  ```typescript
  userId: z.string().trim().min(1, 'userId não pode ser vazio').optional()
  ```

- **FR-008**: O sistema DEVE atualizar `ServerOptions` em `src/http/server.ts` para permitir a injeção opcional de `memoryStore: MemoryStore`.

- **FR-009**: Quando `userId` for informado no `POST /chat`:
  - O endpoint executa `memoryStore.recall(userId, message, 3, 0.3)`.
  - Se memórias forem encontradas, o texto de entrada enviado para a estratégia é enriquecido com um bloco contextual formatado:
    ```
    [Memórias do Usuário]
    - Fato memorizado 1
    - Fato memorizado 2
    ```
  - A resposta do chat deve incluir no objeto `metrics` o campo `recalledMemories: number`.

- **FR-010**: A suíte de testes DEVE incluir um teste comprovando explicitamente que o `recall` recupera um fato memorizado onde a query não compartilha nenhuma palavra com o fato (busca semântica por significado).

---

### Key Entities & Contracts

- **Tabela SQL `memories`**:
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    embedding BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
  ```

- **Pipeline de Embeddings**:
  - Biblioteca: `@huggingface/transformers`
  - Modelo: `Xenova/all-MiniLM-L6-v2`
  - Dimensão: 384 dimensões float32
  - Configurações: `pooling: 'mean'`, `normalize: true`
  - Padrão: Lazy Singleton exportado em `src/memory/embeddings.ts`

- **Contrato de Requisição e Resposta do `/chat`**:
  ```typescript
  export const ChatRequestSchema = z.object({
    message: z.string().trim().min(1, 'A mensagem não pode ser vazia'),
    strategy: z.string().trim().optional().default('react'),
    reflect: z.boolean().optional().default(false),
    conversationId: z.string().uuid('conversationId deve ser UUID válido').optional(),
    userId: z.string().trim().min(1, 'userId não pode ser vazio').optional(),
  });

  export interface ChatResponse {
    answer: string;
    trace: StrategyResult['trace'];
    metrics: StrategyResult['metrics'] & {
      historyMessages: number;
      recalledMemories?: number;
    };
    conversationId: string;
  }
  ```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O pipeline de embeddings extrai vetores unitários de 384 dimensões usando `all-MiniLM-L6-v2` sem dependência de serviços externos ou chaves de API.
- **SC-002**: A busca de `recall` recupera com sucesso fatos conceituais sem nenhuma palavra coincidente com a query (exemplo validado em teste unitário).
- **SC-003**: Inserções duplicadas semanticamente ($\text{similaridade} \ge 0.92$) são descartadas/deduplicadas automaticamente.
- **SC-004**: O isolamento de usuários é 100% garantido: consultas e remoções de `user-A` não afetam nem acessam dados de `user-B`.
- **SC-005**: `POST /chat` injeta os fatos pertinentes no prompt quando `userId` é fornecido e reporta a contagem na métrica `recalledMemories`.
- **SC-006**: Todos os testes da suíte (`npm test`) e checagem de tipos (`npm run typecheck`) executam com 100% de sucesso.

---

## Assumptions

- A dependência `@huggingface/transformers` é instalada via `npm install @huggingface/transformers`.
- O modelo `Xenova/all-MiniLM-L6-v2` é executado localmente via ONNX Runtime através do Transformers.js, sem custos de API por token.
- `DatabaseSync` do Node.js (`node:sqlite`) suporta colunas do tipo `BLOB` nativamente com `Buffer` / `Uint8Array`.
- Para testes unitários determinísticos rápidos e isolados, `DatabaseSync(':memory:')` é utilizado na suíte de testes.
- `dotProduct` é calculado de forma vetorial pura em memória sobre os `Float32Array` pré-normalizados.
