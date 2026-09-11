# Tasks: Modo Equipe com Supervisor, Blackboard e Handoffs Observáveis

**Input**: Design documents from `specs/017-team-mode/` (`spec.md`, `plan.md`, `data-model.md`, `research.md`, `contracts/team.contract.ts`)  
**Status**: Complete  

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estrutura inicial de diretórios e contratos globais de observabilidade.

- [x] T001 Criar diretório `src/team/` e arquivo de barramento `src/team/index.ts`
- [x] T002 Estender `TraceEventKind` com `'handoff'` e adicionar campos `from?`, `to?`, `brief?`, `iteration?` em `TraceEvent` em `src/agents/types.ts`

---

## Phase 2: Foundational (Core Types & Contracts)

**Purpose**: Infraestrutura de contratos e tipagem do Blackboard e LangGraph.

- [x] T003 [P] Implementar schemas Zod (`supervisorDecisionSchema`, `blackboardSchema`) e `TeamAnnotation` com `Blackboard` em `src/team/types.ts`
- [x] T004 [P] Validar contratos Zod em `specs/017-team-mode/contracts/team.contract.ts` com os tipos de `src/team/types.ts`

**Checkpoint**: Fundação tipada pronta — implementação dos nós e agentes pode começar.

---

## Phase 3: User Story 1 - Orquestração Supervisionada via Blackboard (Priority: P1) 🎯 MVP

**Goal**: Permitir que o supervisor coordene o ciclo de atendimento usando `withStructuredOutput({ next, brief })` sobre o blackboard.

**Independent Test**: Executar o nó supervisor isoladamente e verificar se a decisão estruturada é gerada e se o blackboard mantém o estado inicial e tarefas.

### Tests for User Story 1
- [x] T005 [P] [US1] Criar testes unitários em `src/team/team-graph.test.ts` para a tomada de decisão estruturada do supervisor e manipulação do blackboard

### Implementation for User Story 1
- [x] T006 [US1] Implementar o nó do Supervisor em `src/team/supervisor.ts` com `model.withStructuredOutput(supervisorDecisionSchema)` e atualização do blackboard
- [x] T007 [US1] Implementar esqueleto inicial do `StateGraph(TeamAnnotation)` em `src/team/team-graph.ts` orquestrando o nó supervisor e finalização com `FINISH`

**Checkpoint**: Supervisor operando com saída estruturada `{ next, brief }` e manipulando o blackboard com sucesso.

---

## Phase 4: User Story 2 - Especialização Rígida de Papéis (Priority: P1)

**Goal**: Garantir restrições inquebráveis de capacidade: Analista só lê, Planejador sem tools, Executor focado em incidentes sem bypass.

**Independent Test**: Invocar cada especialista com cenários simulados e assegurar ausência de ferramentas proibidas e gravação estrita nas partições do blackboard.

### Tests for User Story 2
- [x] T008 [P] [US2] Criar testes unitários em `src/team/team-graph.test.ts` validando:
  - Analista possui apenas tools de leitura (`listAlerts`, `consultarRunbook`, `listIncidents`), grava em `findings` e não propõe planos
  - Planejador possui zero tools e grava plano em `blackboard.plan`
  - Executor possui apenas tools de incidentes (`openIncident`, `resolveIncident`) com validação Zod e sem bypass

### Implementation for User Story 2
- [x] T009 [P] [US2] Implementar nó do Analista em `src/team/analyst.ts` restrito a ferramentas de leitura, gravando dados brutos em `blackboard.findings`
- [x] T010 [P] [US2] Implementar nó do Planejador em `src/team/planner.ts` sem ferramentas vinculadas (*zero tools*), estruturando o plano em `blackboard.plan`
- [x] T011 [P] [US2] Implementar nó do Executor em `src/team/executor.ts` vinculado a ferramentas de incidentes sem bypass, gravando mutações em `blackboard.actions`
- [x] T012 [US2] Integrar nós dos especialistas (`analyst`, `planner`, `executor`) no grafo em `src/team/team-graph.ts` com retorno compulsório ao supervisor

**Checkpoint**: Os 3 especialistas operando estritamente dentro de seus limites de segurança e responsabilidade.

---

## Phase 5: User Story 3 - Rastreabilidade Granular via Evento "handoff" no Trace (Priority: P1)

**Goal**: Registrar formalmente no trace cada transição decidida pelo supervisor e devoluções dos especialistas com `kind: "handoff"`.

**Independent Test**: Executar uma sessão de equipe completa e verificar que todos os handoffs foram gerados e armazenados com `from`, `to`, `brief` e número do turno.

### Tests for User Story 3
- [x] T013 [P] [US3] Criar testes em `src/team/team-graph.test.ts` verificando a emissão cronológica e o formato dos eventos `handoff` no trace

### Implementation for User Story 3
- [x] T014 [US3] Implementar emissão de eventos `handoff` no nó supervisor (`from: 'supervisor'`, `to: next`, `brief`, `iteration`) em `src/team/supervisor.ts`
- [x] T015 [US3] Assegurar acumulação dos eventos de handoff no estado `trace` e compatibilidade com persistência SQLite (`TraceStore`) em `src/team/team-graph.ts`

**Checkpoint**: Observabilidade de transições 100% auditável no trace.

---

## Phase 6: User Story 5 - Teto de Segurança de 8 Iterações e Rota "team" (Priority: P1)

**Goal**: Impor o limite inviolável de 8 turnos do supervisor e disponibilizar a rota `"team"` no grafo de produção e na API HTTP.

**Independent Test**: Forçar um loop de delegação no teste e garantir encerramento compulsório no turno 8 com aviso de teto e preservação do blackboard.

### Tests for User Story 5
- [x] T016 [P] [US5] Criar testes unitários em `src/team/team-graph.test.ts` verificando interrupção compulsória ao atingir 8 iterações
- [x] T017 [P] [US5] Criar testes de integração em `src/graph/production-graph.test.ts` e `src/http/server.test.ts` validando rota `team` e override

### Implementation for User Story 5
- [x] T018 [US5] Implementar controle do contador de iterações (`iterationCount`) e interrupção forçada no 8º turno em `src/team/supervisor.ts`
- [x] T019 [US5] Atualizar `src/graph/production-graph.ts` integrando a rota `"team"`, schema `routeSchema`, normalização em `normalizeRoute` e nó `teamNode`
- [x] T020 [US5] Atualizar `src/http/server.ts` aceitando `strategy: "team"`, orquestrando a resposta via `productionGraph` e persistindo trace com handoffs

**Checkpoint**: Teto de 8 turnos ativo e endpoint `POST /chat` integrado com suporte a `strategy: "team"`.

---

## Phase 7: User Story 4 - Renderização Dedicada de Handoffs no "Ver Raciocínio" da UI Web (Priority: P2)

**Goal**: Exibir transições de handoff na interface gráfica com cartões destacados e badge visual próprio.

**Independent Test**: Abrir o War Room Web em um chamado respondido pela equipe e validar a visualização dos cards de handoff no drawer.

### Implementation for User Story 4
- [x] T021 [P] [US4] Atualizar tipagem de eventos de trace em `web/src/types/chat.ts` adicionando variante `'handoff'` e campos `from`, `to`, `brief`, `iteration`
- [x] T022 [US4] Atualizar componente `web/src/components/TraceDrawer.tsx` para renderizar card customizado de handoff com badge `HANDOFF`, direção `{from} ➔ {to}` e conteúdo do `brief`
- [x] T023 [US4] Implementar estilos CSS em `web/src/index.css` para `.trace-kind-badge.kind-handoff`, `.trace-handoff-route` e transições visuais

**Checkpoint**: Interface gráfica com suporte completo e visualmente elegante para handoffs.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verificação global, tipagem estrita e conformidade com a Constituição.

- [x] T024 [P] Atualizar re-exports em `src/team/index.ts` e `src/agents/index.ts`
- [x] T025 Executar checagem estrita de tipos com `npm run typecheck`
- [x] T026 Executar suíte completa de testes automatizados com `node --import tsx --test src/team/*.test.ts src/graph/*.test.ts src/http/*.test.ts`
- [x] T027 Validar cenários operacionais documentados no `specs/017-team-mode/quickstart.md`
