# Research: Relatório de Incidentes Abertos em Blocos de Texto

**Feature**: `016-open-incidents-report`  
**Date**: 2026-09-11  

---

## 1. Contexto e Problema

### O Problema das Tabelas Markdown em Chats de LLM
- Em interfaces conversacionais ou integrações de chat de terminal/web, modelos de linguagem frequentemente sofrem para emitir quebras de linha (`\n`) reais ou `<br>` dentro de células de tabela markdown (`| col1 | col2 |`).
- Isso faz com que tabelas com textos longos (títulos de incidentes, resumos de causa raiz e timestamps) quebrem a formatação visual, gerem rolagem horizontal excessiva ou agrupem dados indevidamente em uma única linha densa.
- A solução adotada pela especificação é abolir completamente tabelas markdown e utilizar **estrutura de blocos por incidente**, separados por linha em branco (`\n\n`), com emojis padronizados e tags de severidade.

---

## 2. Análise de Dados Existentes no OpsPilot

### Modelo de Dados no SQLite (`data/opspilot.db` e `src/store/sqlite-ops-store.ts`)
A tabela `incidents` possui o seguinte schema:
```sql
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  resolved_at TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tipagem em TypeScript (`src/store/ops-store.ts`)
```typescript
export interface IncidentData {
  id: number;
  title: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved';
  resolved_at?: string | null;
  summary?: string | null;
  created_at?: string;
}
```

---

## 3. Algoritmos e Regras de Negócio

### 3.1. Ordenação Hierárquica de Severidade e Timestamp
- Pesos de severidade:
  - `critical`: 4
  - `high`: 3
  - `medium`: 2
  - `low`: 1
- Critério de ordenação primário: `peso(b.severity) - peso(a.severity)` (decrescente).
- Critério de desempate: `new Date(b.created_at).getTime() - new Date(a.created_at).getTime()` (mais recente primeiro).

### 3.2. Mapeamento Visual de Severidade
- `critical` → `🔴 CRITICAL`
- `high` → `🟠 HIGH`
- `medium` → `🟡 MEDIUM`
- `low` → `⚪ LOW`

### 3.3. Template de Bloco
```text
{EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
{TÍTULO}
Criado em: {DATA/HORA}
```

### 3.4. Resumo Quantitativo no Topo
```text
## Incidentes abertos em produção
Total: {N} | Critical: {X} | High: {X} | Medium: {X} | Low: {X}
```
- A soma `Critical + High + Medium + Low` deve ser calculada e validada para ser idêntica a `Total`.

### 3.5. Deteção de Duplicidades por Similaridade de Sintomas
- Incidentes são agrupados pelo serviço (`service.toLowerCase()`).
- Para incidentes dentro do mesmo serviço, realiza-se uma comparação de similaridade de texto entre títulos/sintomas:
  - Normalização: remoção de pontuação, stop words comuns em português e inglês ("no", "do", "de", "em", "service", "para", "the", "in"), e conversão para tokens minúsculos.
  - Cálculo de Similaridade de Jaccard ($J(A, B) = \frac{|A \cap B|}{|A \cup B|}$) ou correspondência de palavras-chave críticas (ex: "checkout", "p99", "latência", "notificação", "fila").
  - Quando a similaridade for superior ao limiar (ex: $\ge 0.35$ com palavras-chave compartilhadas), os incidentes são sinalizados:
    ```text
    ⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.
    ```

### 3.6. Ação Imediata
- Identifica todos os incidentes com severidade `critical` ou `high`.
- Renderiza a seção final:
  ```text
  ### Ação imediata
  - #{ID} ({SERVIÇO}) — {motivo em uma linha}
  ```
  - O "motivo em uma linha" é extraído do `summary` (ou de uma síntese do `title` caso `summary` seja nulo).

---

## 4. Decisões Arquiteturais

1. **Camada de Serviço Pura**:
   - Criação de `src/services/incident-reporter.ts` contendo funções puras e determinísticas para formatação, cálculo de totais, ordenação e detecção de duplicidades.
   - 100% testável com `src/services/incident-reporter.test.ts`.
2. **Integração com Tools e Chat**:
   - Criação/exposição de uma tool ou helper para que os agentes (ReAct, Plan & Execute) utilizem o formatador ou emitam a resposta padronizada sempre que o usuário solicitar a listagem ou relatório de incidentes abertos.
3. **Conformidade com a Constituição**:
   - TypeScript ESM estrito, sem `any`.
   - Zod para validação de entrada de dados.
   - Test-First com `node --import tsx --test`.
