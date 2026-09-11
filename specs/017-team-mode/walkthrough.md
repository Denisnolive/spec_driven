# Walkthrough: Modo Equipe Supervisionada (Team Mode)

**Feature**: `017-team-mode`  
**Status**: Concluído com sucesso e 100% testado  

---

## 1. Visão Geral das Mudanças Realizadas

A feature **017-team-mode** implementa uma arquitetura multiagente com o padrão **Blackboard** coordenada por um **Supervisor Central** no OpsPilot, garantindo especialização estrita de papéis, rastreabilidade transparente através de eventos de `handoff` e proteção orçamentária com teto de 8 turnos.

---

## 2. Componentes Implementados

### 2.1 Módulo da Equipe (`src/team/`)
- [`src/team/types.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/types.ts):
  - `nextSchema`: Schema Zod `{ next: z.enum(['analista', 'planejador', 'executor', 'done']), brief: z.string() }`.
  - `TeamState`: Annotation do LangGraph com estado do `Blackboard` (`task`, `findings`, `plan`, `actions`, `status`), contador `iterationCount` e acumulador de `trace`.
  - `blackboardAsText(state)`: Serializador formatado para injeção no prompt do supervisor.
- [`src/team/supervisor.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/supervisor.ts):
  - Nó supervisor utilizando `withStructuredOutput(nextSchema)`.
  - Controle inegociável do **Teto de 8 Iterações**: encerra compulsório para `done` com status `exhausted`.
  - Emissão automática de eventos de trace do tipo `handoff` contendo `from`, `to`, `brief` e `iteration`.
- [`src/team/analyst.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/analyst.ts):
  - Papel do **Analista**: estritamente somente leitura (`listAlerts`, `consultarRunbook`, `listIncidents`, `getOpenIncidentsReport`, `checkProviderStatus`).
  - Proibido de conter ferramentas de mutação (`openIncident`, `resolveIncident`) e proibido de propor planos. Grava fatos em `blackboard.findings`.
- [`src/team/planner.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/planner.ts):
  - Papel do **Planejador**: opera sem ferramentas externas (**zero-tools**), sintetizando o plano tático estruturado em `blackboard.plan`.
- [`src/team/executor.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/executor.ts):
  - Papel do **Executor**: restrito às ferramentas de incidentes (`openIncident`, `resolveIncident`, `listIncidents`) com validação Zod e **sem bypass**. Grava intervenções em `blackboard.actions`.
- [`src/team/team-graph.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/team/team-graph.ts):
  - `createTeamGraph`: Montagem do `StateGraph` com transições `START ➔ supervisor ➔ (condicional) ➔ [analista | planejador | executor | done] ➔ supervisor / END`.
  - `TeamStrategy`: Estratégia de raciocínio exportada para integração com o OpsPilot.

### 2.2 Observabilidade e Grafo de Produção
- [`src/agents/types.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/agents/types.ts):
  - Adicionado `'handoff'` a `TraceEventKind`.
  - Adicionados campos `from?`, `to?`, `brief?`, `iteration?` a `TraceEvent`.
- [`src/graph/production-graph.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/graph/production-graph.ts):
  - Inclusão da rota `"team"` no `SYSTEM_PROMPT` e no schema Zod `routeSchema`.
  - Adição do nó `team` no `ProductionGraph` e condicional de roteamento.
  - Suporte a override manual e seleção autônoma.
- [`src/agents/index.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/agents/index.ts):
  - Registro de `team: () => new TeamStrategy()` no `defaultStrategyRegistry`.
- [`src/http/server.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/http/server.ts):
  - Suporte a `strategy: "team"` com injeção automática de `teamStrategy`.

### 2.3 Interface Web ("Ver Raciocínio")
- [`web/src/types/chat.ts`](file:///c:/dev/Aulas_UNIPDS/note-project-03/web/src/types/chat.ts):
  - Extensão do `TraceEventRecord` com os metadados de handoff.
- [`web/src/components/TraceDrawer.tsx`](file:///c:/dev/Aulas_UNIPDS/note-project-03/web/src/components/TraceDrawer.tsx):
  - Renderização visual rica de eventos `handoff`, com badge roxo `HANDOFF`, direção da transição (`SUPERVISOR ➔ ANALISTA`) e card de diretriz do brief.
- [`web/src/index.css`](file:///c:/dev/Aulas_UNIPDS/note-project-03/web/src/index.css):
  - Estilização completa para `.trace-kind-badge.kind-handoff`, `.trace-handoff-card`, `.handoff-origin`, `.handoff-target` e `.handoff-turn-pill`.

---

## 3. Verificação e Testes

### 3.1 Testes Unitários e de Integração da Equipe
```bash
node --import tsx --test src/team/team-graph.test.ts
```
- ✅ Decisão estruturada `{ next, brief }` do supervisor e evento de handoff.
- ✅ Analista possui apenas ferramentas de leitura e não de mutação.
- ✅ Analista grava dados factuais sem propor plano.
- ✅ Planejador opera sem ferramentas externas (*zero-tools*) e preenche plano.
- ✅ Executor possui apenas ferramentas de incidentes sem bypass.
- ✅ Executor registra ações no blackboard.
- ✅ Teto de segurança de 8 iterações força `done` e status `exhausted`.
- ✅ Ciclo completo do grafo (`supervisor ➔ analista ➔ supervisor ➔ done`).

### 3.2 Suíte Completa de Testes
```bash
node --import tsx --test src/team/team-graph.test.ts src/graph/production-graph.test.ts src/http/server.test.ts
```
**Resultado**: 56 testes executados e 56 testes passando (100% de sucesso).

### 3.3 Checagem Estrita de Tipos
```bash
npm run typecheck
```
**Resultado**: 0 erros de compilação TypeScript (Node 22 LTS, ESM nativo, `strict: true`).

### 3.4 Build do Frontend
```bash
npm --prefix web run build
```
**Resultado**: Sucesso na compilação do bundle React com Vite.
