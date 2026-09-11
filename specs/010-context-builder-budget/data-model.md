# Data Model: ContextBuilder com Orçamento por Seção

**Feature**: `010-context-builder-budget`  
**Date**: 2026-09-09  

---

## 1. Entidades Principais

### `ContextBudgetConfig`
Representa os limites de tokens atribuídos a cada seção gerenciada do contexto.

```typescript
export interface ContextBudgetConfig {
  /** Teto de tokens para o resumo da conversa anterior. Padrão: 200 */
  summary: number;
  /** Teto de tokens para a janela de mensagens de histórico. Padrão: 1200 */
  history: number;
  /** Teto de tokens para o bloco de memórias semânticas. Padrão: 300 */
  memories: number;
}
```

---

### `ContextMemoryItem`
Representa uma memória candidata a ser injetada no contexto, acompanhada de seu respectivo score de similaridade/relevância.

```typescript
export interface ContextMemoryItem {
  /** Fato ou conteúdo textual da memória */
  fact: string;
  /** Pontuação de similaridade semântica (geralmente [0.0, 1.0]). Padrão: 0.0 */
  score?: number;
}
```

---

### `ContextMessageItem`
Representa um turno de mensagem no histórico ou nas instruções do modelo.

```typescript
export interface ContextMessageItem {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

---

### `ContextBuilderInput`
Payload de entrada submetido ao `ContextBuilder` para a montagem de um contexto pronto para execução.

```typescript
export interface ContextBuilderInput {
  /** Instrução de sistema ou persona do agente (intocável) */
  systemPrompt?: string;
  /** Mensagem atual enviada pelo usuário (intocável) */
  message: string;
  /** Histórico completo ou parcial de mensagens anteriores da conversa */
  history?: ContextMessageItem[];
  /** Lista de memórias semânticas recuperadas para a interação atual */
  memories?: ContextMemoryItem[];
  /** Texto do resumo persistido da conversa anterior (se houver) */
  summary?: string | null;
  /** Limites orçamentários customizados para esta execução (opcional) */
  budget?: Partial<ContextBudgetConfig>;
}
```

---

### `ContextBudgetStats`
Métricas de observabilidade sobre a eficácia da poda e descarte de itens por seção.

```typescript
export interface ContextBudgetStats {
  originalHistoryCount: number;
  includedHistoryCount: number;
  prunedHistoryCount: number;

  originalMemoriesCount: number;
  includedMemoriesCount: number;
  prunedMemoriesCount: number;

  summaryTruncated: boolean;
}
```

---

### `BuiltContext`
Resultado final consolidado retornado pelo `ContextBuilder.build()`, pronto para uso direto em qualquer estratégia de raciocínio.

```typescript
import type { ContextBreakdown } from './tokens.js';

export interface BuiltContext {
  /** Prompt de sistema preservado integralmente (se fornecido) */
  systemPrompt?: string;
  /** Mensagem do usuário preservada integralmente */
  userMessage: string;
  /** Resumo ajustado ao orçamento de resumo */
  summary: string | null;
  /** Mensagens de histórico selecionadas dentro do teto de janela */
  history: ContextMessageItem[];
  /** Memórias selecionadas dentro do teto de memórias (ordenadas por relevância) */
  memories: ContextMemoryItem[];
  /** Lista completa de mensagens estruturadas para provedores LLM / LangChain */
  messages: ContextMessageItem[];
  /** Mensagem de usuário com blocos de resumo e memórias prefixados (compatibilidade) */
  promptMessage: string;
  /** Discriminação quantitativa de tokens por fonte */
  breakdown: ContextBreakdown;
  /** Contadores de poda e diagnóstico */
  stats: ContextBudgetStats;
}
```

---

## 2. Relações e Fluxo de Transformação

```text
[Input: Raw Data]
  ├── systemPrompt (intocável)
  ├── message (intocável)
  ├── summary ─────────> [Trunca se tokens > budget.summary] ────────> summary
  ├── history ─────────> [FIFO: mais recentes mantidas] ─────────────> history podado
  └── memories ────────> [Score-First: maiores scores mantidos] ─────> memories podadas
                              │
                              ▼
                       [BuiltContext]
                         ├── messages: [system?, ...history, user]
                         ├── promptMessage: "[Resumo]\n[Memórias]\n\n{message}"
                         ├── breakdown: ContextBreakdown
                         └── stats: ContextBudgetStats
```
