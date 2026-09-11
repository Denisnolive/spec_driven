# Implementation Plan: Modo Equipe com Supervisor, Blackboard e Handoffs Observáveis

**Branch**: `017-team-mode` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-team-mode/spec.md`

## Summary

Implementar o **Modo Equipe (`src/team/`)** no OpsPilot, composto por uma arquitetura multiagente coordenada por um **Supervisor Central** com saída estruturada (`withStructuredOutput({ next, brief })`) sobre um **Blackboard** compartilhado no estado do LangGraph.
A solução estabelece:
1. **Segregação Estrita de Papéis**:
   - **Analista (`analyst`)**: restrito a ferramentas de leitura e inspeção (alertas, serviços, runbooks), sem mutações e sem propor planos.
   - **Planejador (`planner`)**: sintetizador puro sem nenhuma ferramenta externa (*zero-tools*), elaborando estratégias de mitigação no blackboard.
   - **Executor (`executor`)**: habilitado exclusivamente para operações sobre incidentes, com validação de domínio obrigatória e sem mecanismos de contorno (*no bypass*).
2. **Observabilidade de Handoffs**:
   - Cada transferência de bastão emite um evento de trace com `kind: "handoff"`, persistido no SQLite e renderizado de forma destacada na gaveta "Ver Raciocínio" do War Room Web.
3. **Mecanismo de Proteção (Teto 8)**:
   - Limite inegociável de 8 iterações de supervisão por requisição com encerramento gracioso e síntese do trabalho acumulado.
4. **Rota `team` e Integração HTTP**:
   - Disponibilização da rota `"team"` no grafo de produção e suporte a override manual via parâmetro `strategy: "team"` no endpoint `POST /chat`.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM nativo (`"type": "module"`, `strict: true` no `tsconfig.json`)

**Primary Dependencies**:
- `@langchain/langgraph`: `StateGraph`, `Annotation`, `START`, `END`
- `@langchain/core`: mensagens e modelo base com `withStructuredOutput`
- `zod`: validação na fronteira de todos os schemas e decisões
- React 19 + CSS Modules / Vanilla CSS (War Room Web)

**Storage**: SQLite nativo via `node:sqlite` (`DatabaseSync`) e repositórios existentes (`TraceStore`, `OpsStore`, `ConversationStore`).

**Testing**: `node:test` executado via `tsx`, com mocks de LLM determinísticos para validação isolada de cada agente e do grafo completo.

**Target Platform**: Node.js 22 LTS (Windows / Linux)

**Project Type**: Multi-Agent Team Orchestrator / Web Application

**Performance Goals**:
- Decisão do supervisor via `withStructuredOutput` em menos de 1 chamada LLM por passo.
- Limite de tempo total garantido pelo teto de 8 passos.
- Overhead de redução do estado do blackboard e injeção de handoffs $< 2$ms por passo.

**Constraints**:
- O Analista não pode ter acesso a nenhuma tool de escrita/mutação.
- O Planejador não pode ter nenhuma tool vinculada.
- O Executor deve validar todas as ações de incidentes via Zod sem nenhum bypass.
- O teto de 8 iterações deve ser respeitado incondicionalmente.

---

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Todos os módulos novos e modificados utilizarão TypeScript estrito com imports `.js`. Sem `any` implícito.
- **II. Validação na Fronteira (Zod)** — PASS. A decisão do supervisor (`next`, `brief`), o payload dos handoffs e os parâmetros de ferramentas são 100% validados por schemas Zod.
- **III. Arquitetura em Camadas (MVC)** — PASS. A orquestração reside em `src/team/`, os contratos em `src/team/types.ts`, o consumo em `src/graph/production-graph.ts` e a borda HTTP em `src/http/server.ts`.
- **IV. Test-First** — PASS. Suíte dedicada de testes `src/team/team-graph.test.ts` cobrindo o supervisor, os 3 papéis, as restrições de tools, o teto de 8 passos e os eventos de handoff.
- **V. Funções Puras e Efeitos Isolados** — PASS. Nós do grafo operam sobre cópias imutáveis do estado do blackboard, delegando efeitos externos estritamente aos adaptadores de tools autorizadas.
- **VI. Gestão de Secrets** — PASS. Não introduz novas credenciais ou variáveis não gerenciadas pelo `.env`.

---

## Project Structure

### Documentation (this feature)

```text
specs/017-team-mode/
├── spec.md              # Requisitos funcionais, cenários e critérios de aceitação
├── plan.md              # Este plano de implementação
├── research.md          # Análise arquitetural, decisões de design e mitigação de riscos
├── data-model.md        # StateAnnotation, esquemas Zod e diagrama de estados
├── quickstart.md        # Guia de teste e verificação rápida
├── contracts/
│   └── team.contract.ts # Contratos Zod para validação da equipe
└── checklists/
    └── requirements.md  # Checklist de qualidade validada da especificação
```

### Source Code (repository root)

```text
src/
├── agents/
│   └── types.ts                 # Atualizado: adição de 'handoff' em TraceEventKind e campos no TraceEvent
├── team/                        # NOVO MÓDULO
│   ├── types.ts                 # Schemas Zod, interfaces do Blackboard e TeamState
│   ├── supervisor.ts            # Nó do Supervisor com withStructuredOutput e teto 8
│   ├── analyst.ts               # Especialista de leitura/diagnóstico (só leitura, sem plano)
│   ├── planner.ts               # Especialista de planejamento (zero tools)
│   ├── executor.ts              # Especialista de incidentes (sem bypass)
│   ├── team-graph.ts            # StateGraph compilado da equipe e factory
│   └── team-graph.test.ts       # Testes unitários e de integração de todo o ciclo
├── graph/
│   ├── production-graph.ts      # Adição do nó 'team', rota 'team' e condicionais
│   └── production-graph.test.ts # Testes da rota team no grafo de produção
└── http/
    ├── server.ts                # Validação de strategy 'team' e delegação
    └── server.test.ts           # Testes de integração HTTP com a rota team

web/
└── src/
    ├── components/
    │   └── TraceDrawer.tsx      # Renderização visual dos cartões e badges de HANDOFF
    ├── index.css                # Estilos visuais do badge e cards de handoff
    └── types/
        └── chat.ts              # Tipagem do evento de handoff no frontend
```

---

## Implementation Phases

### Phase 0: Research & Foundation (Concluída)
- Especificação formal validada em `spec.md`.
- Pesquisa de arquitetura e mitigação de riscos em `research.md`.

### Phase 1: Design, Data Model & Contracts (Concluída)
- Modelagem de dados e máquina de estados em `data-model.md`.
- Contratos Zod estruturados em `contracts/team.contract.ts`.
- Guia de execução em `quickstart.md`.

### Phase 2: Implementação do Núcleo da Equipe (`src/team/`)
1. **Tipos e Contratos** (`src/agents/types.ts` e `src/team/types.ts`):
   - Adicionar `'handoff'` a `TraceEventKind`.
   - Adicionar campos `from?`, `to?`, `brief?`, `iteration?` a `TraceEvent`.
   - Definir `TeamState`, `Blackboard` e `supervisorDecisionSchema`.
2. **Especialistas Especializados**:
   - `src/team/analyst.ts`: monta o nó do analista com ferramentas restritas de leitura (`listAlerts`, `consultarRunbook`, etc.), alimentando `findings`.
   - `src/team/planner.ts`: monta o nó do planejador sem nenhuma ferramenta, sintetizando `plan`.
   - `src/team/executor.ts`: monta o nó do executor com ferramentas de incidentes (`openIncident`, `resolveIncident`), alimentando `actions`.
3. **Supervisor Central** (`src/team/supervisor.ts`):
   - Avaliação do `iterationCount`. Se $\ge 8$, força finalização e alerta de exaustão de turnos.
   - Emite decisão via `withStructuredOutput({ next, brief })`.
   - Dispara evento `handoff` no trace com `from: 'supervisor'`, `to: next`, `brief`, `iteration`.
4. **Grafo de Equipe** (`src/team/team-graph.ts`):
   - Constrói e compila o `StateGraph(TeamAnnotation)`.
   - Define os edges de retorno dos especialistas para o supervisor e a condicional do supervisor para os especialistas ou resposta final.
5. **Testes do Grafo** (`src/team/team-graph.test.ts`):
   - Teste do Analista: garante uso apenas de ferramentas de leitura e ausência de ferramentas de mutação.
   - Teste do Planejador: garante zero tools e formulação de plano.
   - Teste do Executor: garante execução de incidentes com validação Zod.
   - Teste do Teto 8: garante encerramento forçado quando `iterationCount >= 8`.
   - Teste de Handoff: garante presença de eventos `'handoff'` no trace.

### Phase 3: Integração no Grafo de Produção e Servidor HTTP
1. **Grafo de Produção** (`src/graph/production-graph.ts`):
   - Atualizar `routeSchema` para incluir `'team'`.
   - Atualizar `normalizeRoute` para reconhecer `'team'`.
   - Adicionar nó `'team'` e registrar conditional edge para `'team'`.
   - Propagar os eventos de trace emitidos pela equipe (incluindo handoffs) com a tag do nó.
2. **Servidor HTTP** (`src/http/server.ts`):
   - Validar aceitação de `strategy: "team"`.
   - Garantir persistência dos eventos de handoff no `TraceStore`.
3. **Testes de Integração**:
   - Atualizar `src/graph/production-graph.test.ts` e `src/http/server.test.ts`.

### Phase 4: Interface Web "Ver Raciocínio"
1. **Frontend** (`web/src/components/TraceDrawer.tsx` e `web/src/types/chat.ts`):
   - Reconhecer eventos com `kind: "handoff"` ou `type: "handoff"`.
   - Renderizar badge de destaque `HANDOFF`.
   - Renderizar card com indicador direcional `{from} ➔ {to}` e caixa de texto do `{brief}`.
2. **Estilos** (`web/src/index.css`):
   - Definir classes `.trace-node-badge.node-supervisor`, `.trace-kind-badge.kind-handoff`, `.trace-handoff-route`, `.trace-handoff-brief`.

### Phase 5: Verificação e Validação Final
- Executar `npm run typecheck`.
- Executar `npm test` em todo o projeto.
- Validar conformidade total com a Constituição.
- Gerar relatório final.
