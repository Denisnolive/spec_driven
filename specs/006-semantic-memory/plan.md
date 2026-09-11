# Implementation Plan: Memória Semântica (MemoryStore por userId com Embeddings Locais)

**Branch**: `006-semantic-memory` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-semantic-memory/spec.md`

## Summary

Implementar subsistema de memória semântica vetorial por usuário (`userId`) no OpsPilot através de um `MemoryStore` persistente em SQLite e embeddings locais com `@huggingface/transformers` (`all-MiniLM-L6-v2`). O subsistema oferece armazenamento inteligente com deduplicação semântica (`remember`, threshold > 0.92), busca aproximada por significado (`recall`, top-3 com similaridade mínima de 0.3 via produto escalar de vetores unitários) e remoção segura com isolamento de usuário (`forget`). O endpoint `POST /chat` recebe `userId` opcional, executa o recall semântico e injeta o bloco de memórias relevantes no prompt do agente, reportando a métrica `recalledMemories`.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**:
- `@huggingface/transformers`: Extração local de embeddings com pipeline ONNX `all-MiniLM-L6-v2` (`pooling: 'mean'`, `normalize: true`)
- `express`, `zod`: Validação e tratamento do endpoint HTTP `/chat`
- `node:sqlite` (`DatabaseSync`): Armazenamento relacional e vetorial nativo em BLOB
- `node:buffer`: Conversão entre `Float32Array` (384 floats = 1536 bytes) e `Buffer` binário

**Storage**: SQLite nativo (`node:sqlite` / `DatabaseSync`) — tabela `memories` adicionada ao mesmo banco `OPSPILOT_DB` (`./data/opspilot.db`); `:memory:` para testes unitários.

**Testing**: `node:test` via `tsx` (`node --env-file=.env --import tsx --test`), determinístico, testes em memória com modelo local sem requisições HTTP externas.

**Target Platform**: Servidor HTTP Express (`POST /chat`), estratégias de agente (ReAct, Plan-and-Execute, Reflection)

**Performance Goals**:
- Lazy singleton no pipeline de transformers: inicialização ONNX apenas na 1ª requisição, execuções subsequentes em milissegundos.
- Vetores pré-normalizados (`normalize: true`): similaridade de cosseno calculada estritamente como produto escalar (dot product $\sum a_i b_i$), sem necessidade de cálculo de normas euclidianas em tempo de busca.
- Consultas filtradas por `user_id` no SQLite antes do cálculo vetorial na memória do Node.js.

**Constraints**:
- Embeddings armazenados estritamente em formato binário BLOB (Float32Array $\leftrightarrow$ Buffer).
- Deduplicação semântica com corte em $\ge 0.92$.
- Recall padrão: top 3 com corte mínimo em $\ge 0.3$.
- Isolamento estrito por `user_id` em consultas e exclusões.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Arquivos com tipagem explícita estrita, sem `any`, imports ESM com `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. `userId` validado com `z.string().trim().min(1)` no `ChatRequestSchema`.
- **III. Arquitetura em Camadas** — PASS. Módulo de memória isolado em `src/memory/`, sem acoplamento indevido com HTTP ou estratégias; injeção via `ServerOptions`.
- **IV. Test-First** — PASS. Suíte cobrindo embeddings, ciclo de vida do `SqliteMemoryStore` em `:memory:` e teste semântico de recall sem palavras em comum.
- **V. Funções Puras e Efeitos Isolados** — PASS. Cálculo de `dotProduct` e serialização do contexto de memórias como funções puras; IO de SQLite e ONNX contidos no store e embeddings.
- **VI. Gestão de Secrets** — PASS. Nenhum secret necessário — o modelo roda 100% localmente via Transformers.js.

## Project Structure

### Documentation (this feature)

```text
specs/006-semantic-memory/
├── spec.md              # Especificação de requisitos e contratos
├── plan.md              # Este arquivo de arquitetura e plano
└── tasks.md             # Lista de tarefas detalhadas para execução
```

### Source Code (repository root)

```text
src/
├── memory/
│   ├── embeddings.ts          # NOVO — Lazy singleton do pipeline all-MiniLM-L6-v2 e dotProduct
│   ├── memory-store.ts        # NOVO — Interfaces, InMemoryMemoryStore e SqliteMemoryStore
│   ├── memory-store.test.ts   # NOVO — Testes unitários (:memory:, dedup >0.92, recall sem palavras em comum)
│   └── index.ts               # NOVO — Re-exports do subsistema de memória
├── http/
│   ├── server.ts              # MODIFICADO — userId no Zod schema, injeção de memoryStore, injeção de memórias no prompt, recalledMemories
│   └── server.test.ts         # MODIFICADO — Testes de integração cobrindo userId e recall no /chat
└── store/
    └── sqlite-ops-store.ts    # Compartilhamento do mesmo DatabaseSync
```

## Implementation Phases

### Phase 1: Dependências & Pipeline de Embeddings
- Adicionar `@huggingface/transformers` ao `package.json`.
- Implementar `src/memory/embeddings.ts`:
  - `getEmbedding(text: string): Promise<Float32Array>` com Lazy Singleton (`pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { pooling: 'mean', normalize: true })`).
  - `dotProduct(a: Float32Array, b: Float32Array): number`.

### Phase 2: Memory Store & Persistência Vetorial
- Implementar `src/memory/memory-store.ts`:
  - Interface `MemoryStore` (`remember`, `recall`, `forget`, `list`).
  - Conversão de vetores `Float32Array` $\leftrightarrow$ `Buffer` para BLOB no SQLite.
  - Implementação `SqliteMemoryStore` com DDL idempotente da tabela `memories`.
  - Lógica de deduplicação semântica em `remember` ($\ge 0.92$).
  - Lógica de busca semântica em `recall` (top 3, threshold $\ge 0.3$).
  - Implementação `InMemoryMemoryStore` para testes e cenários leves.
- Implementar `src/memory/index.ts`.

### Phase 3: Testes de Memória Semântica
- Criar `src/memory/memory-store.test.ts`:
  - Teste de `remember` com serialização e deserialização correta do BLOB.
  - Teste de deduplicação semântica ($\ge 0.92$).
  - Teste de isolamento por `userId` em inserções, buscas e `forget`.
  - **Teste essencial**: `recall` acha fato relevante sem nenhuma palavra em comum com a query.
- Atualizar script de testes no `package.json`.

### Phase 4: Integração no Servidor HTTP `/chat`
- Atualizar `src/http/server.ts`:
  - Adicionar `userId` no `ChatRequestSchema`.
  - Adicionar `memoryStore?: MemoryStore` em `ServerOptions`.
  - No handler `/chat`: se `userId` estiver presente, chamar `memoryStore.recall(userId, message, 3, 0.3)`.
  - Se houver memórias retornadas, injetar bloco estruturado `[Memórias do Usuário]` no prompt/mensagem passada à estratégia.
  - Adicionar `recalledMemories: number` em `metrics` do `ChatResponse`.
- Atualizar `src/http/server.test.ts` com testes de integração cobrindo `userId` e injeção do recall.

### Phase 5: Conexão em Produção & Validação Geral
- Instanciar `SqliteMemoryStore` em `src/index.ts` reutilizando `sqliteStore.db`.
- Validar `npm run typecheck` e suite completa de testes `npm test`.
