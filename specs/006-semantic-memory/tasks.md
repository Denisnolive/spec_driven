---
description: "Task list for semantic memory implementation"
---

# Tasks: Memória Semântica (MemoryStore por userId com Embeddings Locais)

**Input**: Design documents from `/specs/006-semantic-memory/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001 a SC-006) exigem cobertura unitária determinística e teste de busca semântica sem palavras em comum em `:memory:`. Todos os testes usam `node:test` via `tsx`, sem serviços externos de rede ou chamadas de API pagas.

**Organization**: Tarefas agrupadas por fases e user story (US1–US3, conforme prioridade em spec.md) para permitir implementação e validação incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3
- Caminhos de arquivo exatos incluídos em cada descrição

---

## Phase 1: Dependencies & Contracts

**Purpose**: Instalar `@huggingface/transformers` e definir os contratos, tipos e interfaces da memória semântica.

- [x] T001 Instalar dependência `@huggingface/transformers` no `package.json`
- [x] T002 [US1] Criar `src/memory/embeddings.ts` com as funções `dotProduct` e `getEmbedding` utilizando Lazy Singleton com `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { pooling: 'mean', normalize: true })`
- [x] T003 [US1] [P] Criar `src/memory/memory-store.ts` com as interfaces `MemoryData`, `MemoryRecallItem` e `MemoryStore` (`remember`, `recall`, `forget`, `list`)
- [x] T004 [P] Criar `src/memory/index.ts` re-exportando `embeddings.ts` e `memory-store.ts`

**Checkpoint**: ✅ Dependências instaladas, tipos e módulo de embedding tipados; `npm run typecheck` verde.

---

## Phase 2: Memory Store Implementation (US1 & US2)

**Purpose**: Implementar a persistência SQLite de memórias com DDL idempotente, conversão de BLOB e algoritmos de deduplicação e recall vetorial.

- [x] T005 [US1] Implementar `InMemoryMemoryStore` em `src/memory/memory-store.ts` para suporte a testes determinísticos sem I/O de disco
- [x] T006 [US1] Implementar `SqliteMemoryStore` em `src/memory/memory-store.ts` com DDL idempotente da tabela `memories` e índice em `user_id`
- [x] T007 [US1] Implementar conversão de vetores entre `Float32Array` e `Buffer` binário para armazenamento e leitura de BLOB no SQLite
- [x] T008 [US1] Implementar método `remember(userId, fact)` em `SqliteMemoryStore` com verificação de deduplicação semântica ($\ge 0.92$) antes da inserção
- [x] T009 [US2] Implementar método `recall(userId, query, topK = 3, minSimilarity = 0.3)` em `SqliteMemoryStore` calculando produto escalar em memória e ordenando decrescente
- [x] T010 [US1] Implementar método `forget(userId, memoryId)` em `SqliteMemoryStore` com exclusão condicionada ao `user_id`
- [x] T011 [US1] Implementar método `list(userId)` em `SqliteMemoryStore` listando memórias do usuário

**Checkpoint**: ✅ `SqliteMemoryStore` completo e tipado; `npm run typecheck` verde.

---

## Phase 3: Unit & Semantic Tests (US1 & US2)

**Purpose**: Validar o ciclo de vida completo de `SqliteMemoryStore` em `:memory:` e comprovar busca semântica pura.

- [x] T012 [US1] Criar `src/memory/memory-store.test.ts` com setup `beforeEach` sobre `DatabaseSync(':memory:')`
- [x] T013 [US1] [P] Teste: `remember` persiste fato e embedding em BLOB corretamente
- [x] T014 [US1] [P] Teste: deduplicação semântica impede inserção de fatos quase idênticos ($\ge 0.92$) e retorna `isNew: false`
- [x] T015 [US1] [P] Teste: `forget` remove fato do usuário correto e retorna `false` ao tentar apagar memória de outro usuário
- [x] T016 [US2] [P] Teste: `recall` respeita o filtro de similaridade mínima ($0.3$) e limite `topK` ordenado decrescente
- [x] T017 [US2] [P] **Teste semântico essencial**: `recall acha fato sem palavra em comum` (ex: query sobre animal de estimação recuperando fato com "felino" ou query sobre horário de trabalho recuperando fato com "madrugada")
- [x] T018 Atualizar o script de `test` no `package.json` para incluir `src/memory/memory-store.test.ts`

**Checkpoint**: ✅ `npm test` executando e 100% verde incluindo os novos testes de memória.

---

## Phase 4: Chat Endpoint Integration (US3)

**Purpose**: Estender o endpoint `POST /chat` para receber `userId`, injetar o contexto recuperado no prompt e reportar `recalledMemories`.

- [x] T019 [US3] Atualizar `ChatRequestSchema` em `src/http/server.ts` adicionando `userId: z.string().trim().min(1).optional()`
- [x] T020 [US3] Adicionar `memoryStore?: MemoryStore` a `ServerOptions` em `src/http/server.ts`
- [x] T021 [US3] No handler do `POST /chat`, executar `memoryStore.recall(userId, message, 3, 0.3)` quando `userId` estiver presente
- [x] T022 [US3] Formatar e injetar o bloco `[Memórias do Usuário]` na entrada enviada à estratégia quando memórias forem encontradas
- [x] T023 [US3] Incluir a métrica `recalledMemories` em `metrics` no payload de `ChatResponse`
- [x] T024 [US3] Atualizar `src/http/server.test.ts` com testes cobrindo requisições com `userId`, injeção do bloco de memórias e métrica `recalledMemories`

**Checkpoint**: ✅ Testes do servidor passando; `npm run typecheck` verde.

---

## Phase 5: Production Setup & Final Polish

**Purpose**: Conectar a instância SQLite padrão em produção e validar todo o pipeline integrado.

- [x] T025 Exportar instância padrão `sqliteMemoryStore` em `src/memory/memory-store.ts` compartilhando `sqliteStore.db`
- [x] T026 Conectar `sqliteMemoryStore` no `src/index.ts` em `createServer({ conversationStore, memoryStore: sqliteMemoryStore })`
- [x] T027 Executar suíte completa de testes (`npm test`) e checagem de tipos (`npm run typecheck`)
