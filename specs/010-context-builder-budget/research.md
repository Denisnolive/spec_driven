# Research: ContextBuilder com Orçamento por Seção

**Feature**: `010-context-builder-budget`  
**Date**: 2026-09-09  

---

## 1. Contexto e Motivação

No OpsPilot, a montagem do contexto para os modelos de linguagem opera com múltiplos fluxos informacionais:
- Instruções de sistema (persona e guardrails de auditoria/planejamento).
- Mensagem atual do usuário recebida via HTTP `/chat`.
- Resumo consolidado de histórico persistido no SQLite (`conversation_summaries`).
- Mensagens recentes da conversa ativa mantidas no `ConversationStore`.
- Memórias semânticas recuperadas via busca vetorial no `SqliteMemoryStore` (`recall` com embeddings).

Antes desta feature, cada componente e estratégia (`server.ts`, `ReActStrategy`, `PlanAndExecuteStrategy`) concatenava ou anexava histórico e blocos de texto por conta própria, sem uma política centralizada de teto por seção. Em conversas com muitas mensagens ou recuperações semânticas com múltiplos fatos, isso trazia risco de estouro da janela de contexto do LLM e aumento de custos.

---

## 2. Decisões de Arquitetura e Algoritmos

### Decisão 1: Heurística e Cálculo de Tokens
- **Decisão**: Reutilizar a função pura `estimateTokens(text)` existente em `src/context/tokens.ts` (baseada em `Math.ceil(length / 4)`).
- **Racional**: A heurística `chars / 4` já está integrada na Constituição do projeto, no `ContextBreakdown` e nos testes de `tokens.test.ts`. Ela é extremamente rápida, determinística, $O(N)$ em relação ao tamanho dos caracteres e não requer dependências pesadas de tokenizadores nativos C++/WASM em runtime.
- **Alternativas consideradas**:
  - `tiktoken`: Adicionaria dependência pesada de WASM, incompatibilidade potencial em alguns ambientes Node 22 e overhead de carregamento de vocabulário para cálculos em milissegundos. Rejeitado.

---

### Decisão 2: Algoritmo de Poda de Histórico (FIFO Pruning / Janela Recente)
- **Decisão**: Percorrer o histórico de mensagens da mais **recente** para a mais **antiga** (ordem reversa), acumulando os tokens consumidos por cada turno (`${role}: ${content}`).
  - As mensagens cujo acumulado de tokens couber no orçamento `CONTEXT_BUDGET_WINDOW` (ou `CONTEXT_BUDGET_HISTORY`, padrão 1200) são mantidas.
  - No momento em que uma mensagem fizer a soma ultrapassar o teto, ela e todas as mensagens anteriores (mais antigas) são descartadas.
  - As mensagens mantidas são então restauradas à sua ordem cronológica natural.
- **Racional**: Preserva a continuidade imediata da conversa. Os turnos recentes são os mais relevantes para o LLM resolver o pedido atual; o contexto mais antigo que foi podado já se encontra sintetizado pelo `HistorySummarizer` na seção de resumo.
- **Alternativas consideradas**:
  - Poda por contagem de mensagens fixa (ex: sempre 8 mensagens): Não protege contra mensagens muito longas (ex: logs de erro de 2000 tokens em uma única mensagem). O orçamento por tokens é estritamente superior.

---

### Decisão 3: Algoritmo de Poda de Memórias por Score (Relevance-First Pruning)
- **Decisão**: Ordenar as memórias semânticas por pontuação de similaridade (`score`) em ordem **decrescente**.
  - Iterar do maior score para o menor.
  - Calcular o custo de tokens de cada memória incluindo sua formatação no bloco (`- ${fact}\n`) e o cabeçalho fixo (`[Memórias do Usuário]\n`).
  - Adicionar as memórias ao contexto enquanto a soma de tokens não ultrapassar `CONTEXT_BUDGET_MEMORIES` (padrão 300).
  - Memórias de menor score são descartadas deterministricamente.
- **Racional**: Garante que o modelo receba apenas as memórias mais estritamente pertinentes à consulta atual do usuário, cortando ruído e preservando espaço valioso de raciocínio.
- **Alternativas consideradas**:
  - Descarte por antiguidade (criação): O score vetorial mede a similaridade semântica direta com a mensagem atual; podar por score é a forma mais assertiva de reter relevância factual.

---

### Decisão 4: Tratamento de Resumo de Histórico
- **Decisão**: A seção de resumo recebe o teto `CONTEXT_BUDGET_SUMMARY` (padrão 200 tokens).
  - Se o resumo fornecido couber no teto, é inserido integralmente.
  - Se ultrapassar o teto (por exemplo, um resumo gerado externamente muito prolixo), ele é truncado de forma segura no limite de caracteres correspondente ao orçamento (`budget * 4` caracteres), finalizado com elipse (`...`).
- **Racional**: Evita que anomalias em resumos anteriores quebrem o orçamento global do prompt.

---

### Decisão 5: Seções Intocáveis (System e Mensagem do Usuário)
- **Decisão**: A mensagem de sistema (`systemPrompt`) e a mensagem atual do usuário (`message`) são marcadas como **intocáveis** (invioláveis).
- **Racional**: A mensagem do usuário é a ação imediata que o agente deve atender; truncá-la geraria respostas incoerentes ou incompletas. O `systemPrompt` define a persona e os guardrails de segurança e auditoria, cuja remoção violaria os princípios de integridade operacional do OpsPilot.

---

### Decisão 6: Resolução de Variáveis de Ambiente e Overrides
- **Decisão**: As configurações padrão são lidas de `process.env`:
  - `CONTEXT_BUDGET_SUMMARY`: inteiro positivo, padrão `200`.
  - `CONTEXT_BUDGET_WINDOW` (fallback: `CONTEXT_BUDGET_HISTORY`): inteiro positivo, padrão `1200`.
  - `CONTEXT_BUDGET_MEMORIES`: inteiro positivo, padrão `300`.
  - Aceita overrides via objeto de opções passado ao `ContextBuilder` (`{ budget: { summary, history, memories } }`).
- **Racional**: Permite customização operacional em produção via arquivo `.env` e facilita injeção de tetos baixos para testes unitários isolados sem alterar o ambiente global.
