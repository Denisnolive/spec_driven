# Quickstart: Validação do ContextBuilder com Orçamento por Seção

**Feature**: `010-context-builder-budget`  
**Date**: 2026-09-09  

---

## 1. Visão Geral

O `ContextBuilder` (`src/context/context-builder.ts`) é o motor de consolidação e controle orçamentário de prompts do OpsPilot. Este guia demonstra como executar e validar cenários práticos de poda determinística com tetos baixos e conformidade com as variáveis de ambiente `CONTEXT_BUDGET_*`.

---

## 2. Cenários de Validação

### Cenário 1: Verificação de Tetos Padrão e Leitura de Ambiente

Configurar as variáveis de ambiente antes de instanciar o builder:

```bash
# Definir tetos customizados no terminal ou arquivo .env
export CONTEXT_BUDGET_SUMMARY=150
export CONTEXT_BUDGET_WINDOW=800
export CONTEXT_BUDGET_MEMORIES=250
```

Validação esperada:
- `ContextBuilder.getBudget()` reflete `{ summary: 150, history: 800, memories: 250 }`.
- Quando omitidas, o builder assume os valores padrão `{ summary: 200, history: 1200, memories: 300 }`.

---

### Cenário 2: Poda de Histórico com Teto Baixo (FIFO Pruning)

**Entrada**:
- Histórico contendo 5 mensagens (Turnos 1 a 5) com aproximadamente 25 tokens cada (total: ~125 tokens).
- Teto de histórico forçado via override: `history: 60` tokens (capacidade máxima para ~2 mensagens).

**Comportamento Esperado**:
- O `ContextBuilder` descarta as mensagens mais antigas (Turnos 1, 2 e 3).
- O contexto final preserva as mensagens mais recentes (Turnos 4 e 5).
- `stats.originalHistoryCount` = 5, `stats.includedHistoryCount` = 2, `stats.prunedHistoryCount` = 3.

---

### Cenário 3: Poda de Memórias Semânticas com Teto Baixo (Score-First Pruning)

**Entrada**:
- 4 memórias semânticas:
  1. `Score 0.95`: "Servidor redis roda na porta 6379" (~10 tokens)
  2. `Score 0.88`: "Ambiente de produção utiliza us-east-1" (~10 tokens)
  3. `Score 0.70`: "Deploy é acionado via GitHub Actions" (~10 tokens)
  4. `Score 0.40`: "Time utiliza Slack para alertas" (~10 tokens)
- Teto de memórias forçado via override: `memories: 25` tokens (capacidade para caber cabeçalho + 2 fatos).

**Comportamento Esperado**:
- As memórias de menor score (0.40 e 0.70) são podadas primeiro.
- As memórias de maior score (0.95 e 0.88) são mantidas no bloco `[Memórias do Usuário]`.
- `stats.originalMemoriesCount` = 4, `stats.includedMemoriesCount` = 2, `stats.prunedMemoriesCount` = 2.

---

### Cenário 4: Preservação Inviolável de System Prompt e Mensagem Atual

**Entrada**:
- `systemPrompt`: Instruções de sistema de 500 tokens.
- `message`: Solicitação do operador de 400 tokens.
- Tetos de histórico e memórias configurados para zero (`history: 0, memories: 0`).

**Comportamento Esperado**:
- `history` resultante: vazio (`[]`).
- `memories` resultante: vazio (`[]`).
- `systemPrompt` e `userMessage` no prompt final: **100% idênticos ao texto original, sem nenhum caractere descartado**.

---

## 3. Comandos de Teste e Validação

Para rodar a suíte de testes unitários do ContextBuilder:

```bash
# Executar suíte de testes unitários do context-builder
node --import tsx --test src/context/context-builder.test.ts

# Executar todas as suítes e validação de tipos do projeto
npm run typecheck
npm test
```
