# Implementation Plan: Sumarização de Histórico e Poda de Contexto (Pruning)

**Branch**: `009-history-summarization` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-history-summarization/spec.md`

## Summary

Implementar a estratégia de poda de contexto (pruning) com sumarização incremental para conversas longas no OpsPilot. A tabela `conversation_summaries` armazenará resumos persistidos vinculados a cada conversa. O histórico direto de mensagens ativas é reduzido para as 8 mensagens mais recentes. Quando 8 novas mensagens saem da janela recente (ou seja, acumulam 8 mensagens não sumarizadas fora das 8 recentes), o sistema compacta esse lote em um resumo de aproximadamente ~150 tokens preservando decisões, fatos e pendências, **MESCLADO** ao resumo anterior e persistido no SQLite. Essa operação é executada exclusivamente quando o lote de 8 atinge o limiar, nunca a cada requisição individual, emitindo o evento `"summarize"`. O resumo é injetado no contexto do `/chat` e contabilizado em `metrics.contextBreakdown.summary`.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**:
- `@langchain/core`, `@langchain/openai`: LLM para sintetizar os resumos com prompt especializado
- `node:sqlite` (`DatabaseSync`), `node:events` (`EventEmitter`)
- `express`, `zod`: API HTTP e validações

**Storage**:
- Nova tabela SQLite: `conversation_summaries` vinculada a `conversations(id)`.
- Suporte em memória (`InMemoryConversationStore`) para testes isolados.

**Testing**: `node:test` via `tsx`, determinístico, utilizando `FakeSummarizer` / mocks sem chamadas de rede externas.

**Performance Goals**:
- Verificação de poda em $O(1)$ a partir da contagem de mensagens da conversa.
- Nenhuma chamada ao LLM de sumarização enquanto o lote de 8 mensagens podadas não for completado.
- Injeção de resumo no contexto sem overhead mensurável ($< 1$ms para consulta SQLite por chave primária).

**Constraints**:
- Janela recente fixada estritamente em **8 mensagens**.
- Resumo alvo em **~150 tokens**.
- Sumarização em lote: acionada estritamente quando `(totalMensagens - 8) - mensagensJáSumarizadas >= 8`.
- Mesclagem cumulativa (resumo anterior + novo lote podado).
- Evento `"summarize"` emitido para fins de observabilidade e testes.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita estrita, sem `any`, imports ESM com extensão `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. Schemas preservados e validados no `/chat`.
- **III. Arquitetura em Camadas** — PASS. Separação clara entre persistência (`store/`), lógica de sumarização (`context/summarizer.ts`), medição de tokens (`context/tokens.ts`) e orquestração HTTP (`http/server.ts`).
- **IV. Test-First** — PASS. Suíte unitária com `FakeSummarizer` e testes de integração cobrindo os cenários de corte e limites de janela.
- **V. Funções Puras e Efeitos Isolados** — PASS. Regras de contagem e verificação de limiar isoladas e testáveis de forma pura.
- **VI. Gestão de Secrets** — PASS. Configuração do modelo de sumarização reutiliza as variáveis de ambiente já gerenciadas (`OPENAI_API_KEY`).

## Project Structure

### Documentation (this feature)

```text
specs/009-history-summarization/
├── spec.md              # Requisitos funcionais e cenários de teste
├── plan.md              # Este plano de implementação
└── tasks.md             # Tarefas atômicas de implementação
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-store.ts         # MODIFICADO — ConversationSummaryData e métodos getSummary/saveSummary/countMessages/getMessagesRange
│   ├── sqlite-conversation-store.ts  # MODIFICADO — Tabela conversation_summaries e implementação SQLite
│   └── sqlite-conversation-store.test.ts # MODIFICADO — Testes da persistência de resumos
├── context/
│   ├── tokens.ts                     # MODIFICADO — ContextBreakdown ganha campo `summary`
│   ├── tokens.test.ts                # MODIFICADO — Teste de estimativa com summary
│   ├── summarizer.ts                 # NOVO — HistorySummarizer, FakeSummarizer, eventos e prompts de mesclagem
│   └── summarizer.test.ts            # NOVO — Testes unitários de poda, lote de 8, mesclagem e evento "summarize"
├── http/
│   ├── server.ts                     # MODIFICADO — Janela de 8 mensagens, injeção de resumo, checkAndSummarize e métrica summary
│   └── server.test.ts                # MODIFICADO — Teste de integração do /chat com poda e resumo
└── index.ts                          # MODIFICADO — Instanciação e wiring do HistorySummarizer com o servidor
```

## Implementation Phases

### Phase 1: Persistência de Resumos no `ConversationStore`
1. Atualizar `src/store/conversation-store.ts`:
   - Definir `ConversationSummaryData`: `{ conversation_id: string; summary: string; summarized_messages_count: number; updated_at: string }`.
   - Adicionar métodos à interface: `getSummary`, `saveSummary`, `countMessages`, `getMessagesRange`.
   - Implementar métodos em `InMemoryConversationStore`.
2. Atualizar `src/store/sqlite-conversation-store.ts`:
   - Adicionar `CREATE TABLE IF NOT EXISTS conversation_summaries (...)` na inicialização do banco.
   - Implementar `getSummary`, `saveSummary`, `countMessages` e `getMessagesRange`.
3. Adicionar testes unitários em `src/store/sqlite-conversation-store.test.ts`.

### Phase 2: Atualização da Métrica de Contexto (`src/context/tokens.ts`)
1. Atualizar `ContextBreakdown` para incluir `summary: number`.
2. Atualizar `calculateContextBreakdown` para receber `summary?: string | null` opcional e calcular seus tokens.
3. Ajustar `src/context/tokens.test.ts`.

### Phase 3: Módulo de Poda e Sumarização (`src/context/summarizer.ts`)
1. Criar interface `SummarizerClient` e classe `FakeSummarizer` para simular resumos com comportamento determinístico.
2. Criar `HistorySummarizer` herdando de `EventEmitter` (ou expondo eventos):
   - Constantes: `RECENT_WINDOW = 8`, `SUMMARY_BATCH_SIZE = 8`, `TARGET_TOKENS = 150`.
   - Método `checkAndSummarize(conversationId: string): Promise<ConversationSummaryData | null>`.
   - Lógica:
     - `total = store.countMessages(conversationId)`.
     - `currentSummary = store.getSummary(conversationId)`.
     - `summarizedCount = currentSummary?.summarized_messages_count ?? 0`.
     - `pending = (total - RECENT_WINDOW) - summarizedCount`.
     - Se `pending < SUMMARY_BATCH_SIZE`: retorna `currentSummary` sem chamar o modelo e sem emitir evento.
     - Se `pending >= SUMMARY_BATCH_SIZE`:
       - Busca mensagens no intervalo `[summarizedCount, summarizedCount + pending]`.
       - Monta prompt de mesclagem (resumo existente + novas mensagens podadas + foco em decisões, fatos e pendências).
       - Invoca cliente de sumarização.
       - Salva via `store.saveSummary(conversationId, newSummaryText, summarizedCount + pending)`.
       - Emite evento `'summarize'` com `{ conversationId, oldSummary: currentSummary?.summary, newSummary: newSummaryText, messagesSummarized: pending }`.
3. Criar `src/context/summarizer.test.ts` testando rigorosamente os limiares (<=8, 15, 16, 17-23, 24 mensagens), emissão do evento e mesclagem.

### Phase 4: Integração no Servidor HTTP `/chat`
1. Atualizar `src/http/server.ts`:
   - Reduzir a janela de mensagens recentes de 12 para 8: `conversations.lastMessages(conversationId, 8)`.
   - Buscar resumo existente: `conversations.getSummary(conversationId)`.
   - Se houver resumo, formatar contexto no prompt (`[Resumo da conversa anterior: ...]`).
   - Passar `summary` para `calculateContextBreakdown`.
   - Após persistir a resposta do assistente no store, disparar a verificação de sumarização `summarizer.checkAndSummarize(conversationId)`.
   - Aceitar opcionalmente instância de `summarizer` nas opções do `createApp`.
2. Atualizar `src/http/server.test.ts` com testes cobrindo o fluxo de ponta a ponta.
3. Atualizar `src/index.ts` para conectar o `HistorySummarizer` real no servidor de produção.

### Phase 5: Verificação e Validação Geral
1. Executar `npm run typecheck`.
2. Executar `npm test`.
3. Garantir 100% dos testes passando sem nenhuma quebra de regressão.
