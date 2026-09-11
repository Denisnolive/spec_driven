# Implementation Plan: Refletor de Aprendizado & Tool `forget_preference`

**Branch**: `007-learning-reflector` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-learning-reflector/spec.md`

## Summary

Implementar o módulo de reflexão de aprendizado (`Learning Reflector`) no OpsPilot, permitindo que o sistema destile fatos duráveis e preferências do usuário a partir das mensagens recebidas no endpoint `/chat` utilizando `withStructuredOutput({ hasLearning, fact })`. A persistência semântica é realizada de forma assíncrona (*fire-and-forget*) via `memoryStore.remember(userId, fact)`, sem bloquear o envio da resposta HTTP 200 ao cliente. Guardrails estritos impedem a memorização de pedidos operacionais pontuais e segredos/credenciais. Adicionalmente, implementa a tool de agente `forget_preference` para permitir que o usuário solicite a exclusão de preferências por busca semântica ou ID.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**:
- `@langchain/core`: Construção de tools (`tool`) e schemas
- `@langchain/openai`: Instanciação do modelo ChatOpenAI com saída estruturada (`withStructuredOutput`)
- `zod`: Validação estrita do `LearningSchema` e `forgetPreferenceSchema`
- `@huggingface/transformers` e `node:sqlite`: Persistência e busca vetorial via `MemoryStore` já existente

**Storage**: SQLite (`node:sqlite` / `DatabaseSync`) — reutilização da tabela `memories` criada na feature `006-semantic-memory`.

**Testing**: `node:test` via `tsx`, determinístico em `:memory:`, com injeção de modelo simulado para validação rápida sem chamadas de rede externas.

**Target Platform**: Servidor HTTP Express (`POST /chat`), estratégias de agente (ReAct e Plan-and-Execute) com as tools disponíveis.

**Performance Goals**:
- Latência zero no `/chat` referente ao aprendizado: o refletor roda de forma desanexada após ou paralelamente ao término da resposta, com tratamento de exceções para proteção do processo.
- Tool `forget_preference`: recall top-1 rápido seguido de exclusão imediata por chave primária no SQLite.

**Constraints**:
- Guardrail: NUNCA armazenar senhas, tokens ou pedidos pontuais.
- `withStructuredOutput` usando schema Zod tipado.
- Compatibilidade total com testes determinísticos via injeção de modelo / fakes.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita estrita, sem `any`, imports `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. `LearningSchema` e `forgetPreferenceSchema` 100% validados por Zod.
- **III. Arquitetura em Camadas** — PASS. Refletor e tools isolados em `src/memory/` e `src/agents/`, orquestrados pelo controller em `src/http/server.ts`.
- **IV. Test-First** — PASS. Cobertura determinística cobrindo destilação de fatos, descarte de pedidos pontuais/segredos, assincronicidade no `/chat` e execução de `forget_preference`.
- **V. Funções Puras e Efeitos Isolados** — PASS. Schemas e regras puras; efeitos colaterais de persistência contidos no `MemoryStore`.
- **VI. Gestão de Secrets** — PASS. Nenhuma credencial armazenada em memória durável; detecção e descarte proativo de credenciais.

## Project Structure

### Documentation (this feature)

```text
specs/007-learning-reflector/
├── spec.md              # Especificação de requisitos e contratos
├── plan.md              # Este plano de arquitetura
└── tasks.md             # Lista de tarefas detalhadas para execução
```

### Source Code (repository root)

```text
src/
├── memory/
│   ├── reflector.ts           # NOVO — LearningSchema e função reflectLearning com withStructuredOutput
│   ├── reflector.test.ts      # NOVO — Testes do refletor (fatos duráveis vs pedidos pontuais vs segredos)
│   ├── memory-store.ts        # inalterado
│   ├── embeddings.ts          # inalterado
│   └── index.ts               # MODIFICADO — re-export de reflector.ts
├── agents/
│   ├── tools.ts               # MODIFICADO — nova tool forget_preference adicionada a opsTools e ToolName
│   └── tools.test.ts          # MODIFICADO — testes da tool forget_preference
└── http/
    ├── server.ts              # MODIFICADO — disparo assíncrono do reflectLearning com ServerOptions.reflectorModel
    └── server.test.ts         # MODIFICADO — testes validando aprendizado em segundo plano
```

## Implementation Phases

### Phase 1: Contratos & Refletor de Aprendizado
- Criar `src/memory/reflector.ts`:
  - `LearningSchema` (Zod): `hasLearning: boolean`, `fact?: string`.
  - Função `reflectLearning(userMessage: string, model?)` com System Prompt detalhando os guardrails (preferências duráveis vs pedidos pontuais vs segredos).
  - Re-exportar em `src/memory/index.ts`.

### Phase 2: Tool de Agente `forget_preference`
- Atualizar `src/agents/tools.ts`:
  - Definir `forgetPreferenceSchema`.
  - Configurar contexto ou setter para `MemoryStore` e `userId` ativo na execução da ferramenta.
  - Implementar `forgetPreference` com busca semântica (`recall`) ou ID direto e exclusão via `memoryStore.forget`.
  - Adicionar a `opsTools` e atualizar o tipo `ToolName`.

### Phase 3: Integração Assíncrona no `/chat`
- Atualizar `src/http/server.ts`:
  - Adicionar `reflectorModel?: any` em `ServerOptions`.
  - No handler do `POST /chat`, quando `userId` e `memoryStore` existirem, disparar `reflectLearning` assincronamente com captura de erros (`try/catch`).

### Phase 4: Testes Unitários e de Integração
- Criar `src/memory/reflector.test.ts` testando os cenários de extração (fatos válidos, descarte de comandos pontuais, descarte de segredos).
- Adicionar testes de `forget_preference` em `src/agents/tools.test.ts`.
- Adicionar testes de disparo em segundo plano no `src/http/server.test.ts`.
- Atualizar script de teste no `package.json`.

### Phase 5: Verificação Completa
- Executar `npm run typecheck`.
- Executar `npm test` em toda a suíte.
