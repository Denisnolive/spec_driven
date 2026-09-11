# Implementation Tasks: Sumarização de Histórico e Poda de Contexto (Pruning)

**Branch**: `009-history-summarization` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Tasks

- [x] **1. Persistência de Resumos no Store**
  - [x] 1.1 Atualizar `src/store/conversation-store.ts` com o tipo `ConversationSummaryData` e métodos `getSummary`, `saveSummary`, `countMessages`, `getMessagesRange` na interface e na classe `InMemoryConversationStore`.
  - [x] 1.2 Atualizar `src/store/sqlite-conversation-store.ts` criando a tabela `conversation_summaries` e implementando as consultas/escritas SQLite.
  - [x] 1.3 Adicionar testes em `src/store/sqlite-conversation-store.test.ts` cobrindo persistência, leitura, contagem e paginação de mensagens.

- [x] **2. Extensão das Métricas de Contexto**
  - [x] 2.1 Atualizar `src/context/tokens.ts` incluindo o campo `summary: number` no `ContextBreakdown` e suporte a `summary` em `calculateContextBreakdown`.
  - [x] 2.2 Atualizar testes em `src/context/tokens.test.ts`.

- [x] **3. Módulo de Sumarização e Poda (`src/context/summarizer.ts`)**
  - [x] 3.1 Definir interface `SummarizerClient` e implementar `FakeSummarizer` determinístico para testes.
  - [x] 3.2 Implementar classe `HistorySummarizer` com limites (8 recentes, lote de 8 podadas), mesclagem de resumo preservando decisões/fatos/pendências em ~150 tokens e emissão do evento `"summarize"`.
  - [x] 3.3 Criar `src/context/summarizer.test.ts` com cenários: <=8 mensagens (sem ação), 15 mensagens (sem ação), 16 mensagens (1º resumo), 17-23 mensagens (sem nova ação), 24 mensagens (2º resumo mesclado).

- [x] **4. Integração no Servidor HTTP `/chat`**
  - [x] 4.1 Atualizar `src/http/server.ts` reduzindo histórico recente para 8 mensagens, injetando resumo no contexto do prompt, calculando `metrics.contextBreakdown.summary` e acionando `checkAndSummarize`.
  - [x] 4.2 Atualizar `src/http/server.test.ts` validando o fluxo de ponta a ponta com `FakeSummarizer`.
  - [x] 4.3 Atualizar `src/index.ts` instanciando o `HistorySummarizer` de produção.

- [x] **5. Verificação e Validação Geral**
  - [x] 5.1 Atualizar script de testes em `package.json` se necessário.
  - [x] 5.2 Executar `npm run typecheck` e `npm test`.
