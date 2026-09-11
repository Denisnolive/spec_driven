# Implementation Plan: Relatório de Incidentes Abertos em Blocos de Texto

**Branch**: `016-open-incidents-report` | **Date**: 2026-09-11 | **Status**: Implemented | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-open-incidents-report/spec.md`

---

## Summary

Implementar a geração e formatação determinística do **Relatório de Incidentes Abertos em Blocos de Texto**, substituindo qualquer dependência de tabelas markdown por blocos visuais separados por quebras de linha reais. O relatório consolida métricas no topo (`Total`, `Critical`, `High`, `Medium`, `Low`), ordena estritamente por severidade decrescente e timestamp mais recente, alerta para sintomas duplicados dentro do mesmo serviço e destaca as ações imediatas para incidentes `Critical` e `High`.

A implementação será encapsulada na camada de serviço pura (`src/services/incident-reporter.ts`), garantindo separação de responsabilidades (MVC / Constituição), validação Zod, testes unitários abrangentes (`src/services/incident-reporter.test.ts`) e integração com ferramentas e prompts operacionais dos agentes.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS (ESM nativo)  
**Primary Dependencies**: Zod (validação de tipos), LangChain/LangGraph (integração de agentes)  
**Storage**: SQLite (`data/opspilot.db` via `node:sqlite` / `DatabaseSync`)  
**Testing**: `node --import tsx --test`  
**Target Environment**: Terminal, Web Chat (War Room) e Respostas do Modelo LLM  
**Constraints**:
- Proibição estrita de tabelas markdown (`| --- | --- |`).
- Preservação de quebras de linha duplas (`\n\n`) entre blocos de incidentes.
- Ordenação rigorosa por severidade (`critical > high > medium > low`) e data (`created_at DESC`).
- Funções de formatação puras sem efeitos colaterais de I/O na camada de serviço.

---

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Código 100% ESM (`import`/`export`), `strict: true`, sem `any`.
- **II. Validação na Fronteira (Zod)** — PASS. Validação de dados de incidentes e schemas tipados via Zod.
- **III. Arquitetura em Camadas (MVC)** — PASS. Lógica pura de formatação e detecção de duplicidades em `services/`, consumindo dados da `store/` e sendo acionada por `agents/tools`.
- **IV. Test-First** — PASS. Criação de testes unitários abrangentes em `src/services/incident-reporter.test.ts` cobrindo todos os cenários e casos de borda antes de concluir.
- **V. Funções Puras e Efeitos Isolados** — PASS. O formatador de relatório é puramente funcional: recebe dados e retorna a estrutura e o markdown.
- **VI. Gestão de Secrets** — PASS. Nenhuma leitura direta de segredos; utilização do `.env` nativo do Node 22.

---

## Project Structure

### Documentation (this feature)

```text
specs/016-open-incidents-report/
├── spec.md                  # Especificação funcional e critérios de aceite
├── plan.md                  # Este plano de implementação
├── research.md              # Pesquisa técnica sobre blocos vs tabelas e duplicidades
├── data-model.md            # Modelagem de dados, tipos Zod e contratos
└── quickstart.md            # Guia de testes e validação rápida
```

### Source Code

```text
src/
├── services/
│   ├── incident-reporter.ts        # Serviço puro de formatação e análise de duplicidades [NEW]
│   └── incident-reporter.test.ts   # Testes unitários com casos reais e bordas [NEW]
├── agents/
│   ├── tools.ts                    # Adicionar/ajustar tool do agente para usar o formatador [MODIFY]
│   └── tools.test.ts               # Testes das ferramentas com o novo formato [MODIFY]
```

---

## Implementation Phases

### Phase 1: Tipagem e Serviço Puro de Formatação (`src/services/incident-reporter.ts`)
1. Definir schemas Zod e tipos para incidentes e relatórios estruturados.
2. Implementar a ordenação hierárquica por severidade e timestamp:
   - Pesos: `critical: 4`, `high: 3`, `medium: 2`, `low: 1`.
   - Desempate por `created_at` decrescente.
3. Implementar a formatação de cada incidente em bloco:
   - Template:
     ```text
     {EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
     {TÍTULO}
     Criado em: {DATA/HORA}
     ```
4. Implementar o resumo no topo:
   ```text
   ## Incidentes abertos em produção
   Total: {N} | Critical: {X} | High: {X} | Medium: {X} | Low: {X}
   ```
5. Implementar algoritmo de detecção de duplicidades:
   - Agrupamento por serviço.
   - Cálculo de similaridade de sintomas/palavras-chave em títulos.
   - Emissão de `⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.`
6. Implementar a seção de `Ação imediata` para incidentes `Critical` e `High`.

### Phase 2: Testes Unitários Test-First (`src/services/incident-reporter.test.ts`)
1. Teste: Formatação em blocos visuais e ausência absoluta de tabelas markdown (`| --- |`).
2. Teste: Ordenação correta por severidade e data.
3. Teste: Cálculo exato do cabeçalho com contagem total e por severidade.
4. Teste: Detecção de duplicidades em incidentes com títulos similares no mesmo serviço (ex: checkout, notification-service, auth).
5. Teste: Casos de borda (zero incidentes, nenhum crítico/alto, strings nulas ou campos ausentes).

### Phase 3: Integração no OpsPilot
1. Expor ferramenta ou utilitário em `src/agents/tools.ts` (`list_open_incidents_report` ou aprimoramento da saída de `list_incidents`).
2. Validar a execução completa com `npm run typecheck` e `npm test`.
