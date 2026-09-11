# Implementation Plan: Instrumentação de Medição de Contexto e Tokens

**Branch**: `008-context-token-measurement` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-context-token-measurement/spec.md`

## Summary

Implementar a infraestrutura de observabilidade e medição de contexto no OpsPilot. O módulo `src/context/tokens.ts` fornecerá funções para estimativa heurística de tokens (`Math.ceil(chars / 4)`), extração de consumo real de tokens a partir dos metadados das mensagens do LangChain (`usage_metadata` / `response_metadata`) e cálculo detalhado do `contextBreakdown` discriminado por fonte (mensagem atual, histórico da conversa e memórias semânticas). As métricas de resposta do `POST /chat` serão estendidas com `promptTokens` e `contextBreakdown`. Por fim, os scripts `conversa-longa.sh` e `conversa-longa.ps1` permitirão demonstrar o inchaço e a retenção de contexto ao longo de múltiplos turnos interativos.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**:
- `@langchain/core`: Manipulação e leitura de metadados em mensagens (`BaseMessage`, `AIMessage`)
- `express`, `zod`: Orquestração e validação HTTP
- Scripts: Bash (`curl`, `jq`) e PowerShell (`Invoke-RestMethod`)

**Storage**: SQLite inalterado (`conversations`, `messages`, `memories`).

**Testing**: `node:test` via `tsx`, determinístico, sem chamadas externas.

**Target Platform**: Servidor HTTP Express (`POST /chat`), estratégias ReAct e Plan-and-Execute, scripts CLI para operadores.

**Performance Goals**:
- Cálculo de estimativa de tokens em $O(1)$ sobre o comprimento das strings.
- Extração de usage em $O(N)$ onde $N$ é o número de mensagens retornadas pelo agente (típico $N < 20$).
- Sobrecarga de latência na resposta imperceptível ($< 1$ms).

**Constraints**:
- Heurística padrão exigida: `chars / 4` arredondado para cima (`Math.ceil`).
- Fallback seguro para `promptTokens` quando a estratégia rodar em modo mock/teste sem metadados do LLM.
- Scripts de demonstração compatíveis com ambientes Unix e Windows.

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem explícita estrita, sem `any`, imports ESM com extensão `.js`.
- **II. Validação na Fronteira (Zod)** — PASS. Schemas e contratos mantidos e estendidos.
- **III. Arquitetura em Camadas** — PASS. Novo módulo utilitário em `src/context/`, desacoplado do controller e consumido pelas estratégias e pelo endpoint HTTP.
- **IV. Test-First** — PASS. Suíte cobrindo funções de contagem de tokens, extração de usage e integração HTTP.
- **V. Funções Puras e Efeitos Isolados** — PASS. `estimateTokens`, `extractTokenUsage` e `calculateContextBreakdown` são funções 100% puras e determinísticas.
- **VI. Gestão de Secrets** — PASS. Nenhuma credencial manipulada na medição de tokens.

## Project Structure

### Documentation (this feature)

```text
specs/008-context-token-measurement/
├── spec.md              # Especificação de requisitos e contratos
├── plan.md              # Este plano de implementação
└── tasks.md             # Lista de tarefas detalhadas
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts              # NOVO — estimateTokens, extractTokenUsage, calculateContextBreakdown
│   └── tokens.test.ts         # NOVO — Testes unitários de estimativa, extração de usage e breakdown
├── agents/
│   ├── types.ts               # MODIFICADO — Metrics ganha promptTokens, completionTokens, totalTokens, contextBreakdown
│   └── react.ts               # MODIFICADO — extração de usage real a partir de resultMessages
├── http/
│   ├── server.ts              # MODIFICADO — cálculo de contextBreakdown e injeção de promptTokens em ChatResponse
│   └── server.test.ts         # MODIFICADO — testes de integração validando promptTokens e contextBreakdown
conversa-longa.sh              # NOVO — Script Bash executável de múltiplos turnos com relatório por turno
conversa-longa.ps1             # NOVO — Script PowerShell complementar para ambiente Windows
```

## Implementation Phases

### Phase 1: Módulo de Medição de Tokens (`src/context/tokens.ts`)
- Criar `src/context/tokens.ts` com:
  - `estimateTokens(text: string): number`
  - `extractTokenUsage(messages: unknown[]): TokenUsage`
  - `calculateContextBreakdown(params): ContextBreakdown`
- Criar `src/context/tokens.test.ts` com testes cobrindo todas as funções e casos de borda.

### Phase 2: Integração nas Estratégias de Agentes
- Atualizar `src/agents/types.ts` com os novos campos da interface `Metrics`.
- Atualizar `src/agents/react.ts` para extrair os tokens reais das mensagens retornadas pelo agente (`resultMessages`) e preenchê-los nas métricas.

### Phase 3: Integração no Servidor HTTP `/chat`
- Atualizar `src/http/server.ts`:
  - Calcular `contextBreakdown` antes ou durante a resolução do prompt.
  - Injetar `promptTokens` e `contextBreakdown` em `metrics` do `ChatResponse`.
- Atualizar `src/http/server.test.ts` com testes validando a presença de `promptTokens` e o crescimento de `contextBreakdown.history`.

### Phase 4: Scripts de Demonstração de Conversa Longa
- Criar `conversa-longa.sh` com permissão de execução, executando múltiplos turnos e imprimindo métricas.
- Criar `conversa-longa.ps1` com paridade funcional para PowerShell.

### Phase 5: Verificação e Validação Geral
- Atualizar script de testes no `package.json`.
- Executar `npm run typecheck` e `npm test`.
- Gerar relatório no `walkthrough.md`.
