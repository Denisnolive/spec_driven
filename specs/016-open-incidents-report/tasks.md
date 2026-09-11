# Tasks: Relatório de Incidentes Abertos em Blocos de Texto

**Input**: Design documents from `/specs/016-open-incidents-report/`  
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)  
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup & Estrutura Base

**Purpose**: Criação do diretório de serviços e contratos iniciais

- [x] T001 Criar diretório [src/services/](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services) caso não exista

---

## Phase 2: User Story 1 - Apresentação em Blocos Visuais Independentes sem Tabelas (Priority: P1) 🎯 MVP

**Goal**: Permitir a visualização de cada incidente em um bloco de texto markdown individual separado por linhas em branco, com tags de severidade e emojis padronizados, sem depender de tabelas markdown (`| --- | --- |`).

**Independent Test**:
1. Invocar a função com uma lista de incidentes.
2. Validar que a saída string não contém pipes de tabela (`| --- |`).
3. Confirmar que cada incidente está em seu próprio bloco com duas quebras de linha (`\n\n`) de separação.
4. Confirmar que o emoji e texto da severidade seguem estritamente `🔴 CRITICAL`, `🟠 HIGH`, `🟡 MEDIUM` e `⚪ LOW`.

### Implementation for User Story 1

- [x] T002 [US1] Definir schemas Zod (`incidentItemSchema`, `incidentSeveritySchema`) e tipagens em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T003 [US1] Implementar formatador de bloco por incidente aplicando o template padronizado `{EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}` seguido de título e data de criação em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T004 [US1] Criar suíte de testes unitários em [src/services/incident-reporter.test.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.test.ts) validando a renderização em blocos, template de texto e ausência de tabelas markdown

**Checkpoint**: MVP funcional gerando blocos visuais de incidentes sem tabelas.

---

## Phase 3: User Story 2 - Resumo Quantitativo no Topo e Ordenação Rigorosa (Priority: P1)

**Goal**: Adicionar cabeçalho de contagens consolidadas e garantir a ordenação hierárquica por severidade (Critical > High > Medium > Low) e timestamp decrescente.

**Independent Test**:
1. Passar incidentes desordenados e com datas variadas.
2. Verificar que o resumo inicial exibe `## Incidentes abertos em produção` com `Total: N | Critical: X | High: X | Medium: X | Low: X`.
3. Validar matematicamente que `Total === Critical + High + Medium + Low`.
4. Verificar que a lista segue estritamente a hierarquia de severidade e que desempates colocam os mais recentes no topo.

### Implementation for User Story 2

- [x] T005 [US2] Implementar cálculo das métricas de resumo e renderização do cabeçalho quantitativo em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T006 [US2] Implementar função pura de ordenação por peso de severidade (`critical: 4`, `high: 3`, `medium: 2`, `low: 1`) e desempate por data `created_at` decrescente em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T007 [US2] Adicionar testes unitários em [src/services/incident-reporter.test.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.test.ts) verificando ordenação hierárquica, integridade matemática do cabeçalho e desempate temporal

**Checkpoint**: Resumo do topo e ordenação hierárquica validados por testes.

---

## Phase 4: User Story 3 - Destaque de Ação Imediata e Detecção de Sintomas Duplicados (Priority: P2)

**Goal**: Sinalizar no relatório suspeitas de duplicidade entre incidentes do mesmo serviço e listar ao final a seção de ação imediata para incidentes `Critical` e `High`.

**Independent Test**:
1. Fornecer incidentes com títulos similares no mesmo serviço (ex: "Alta latência no checkout" e "P99 latency do checkout").
2. Verificar a presença da linha `⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.`.
3. Verificar a presença da seção `### Ação imediata` contendo exclusivamente os incidentes Critical e High.

### Implementation for User Story 3

- [x] T008 [US3] Implementar algoritmo de detecção de similaridade de sintomas/palavras-chave em títulos para incidentes do mesmo serviço em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T009 [US3] Implementar renderização da seção `### Ação imediata` contendo apenas incidentes `Critical` e `High` no formato `- #{ID} ({SERVIÇO}) — {motivo em uma linha}` em [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts)
- [x] T010 [US3] Adicionar testes unitários em [src/services/incident-reporter.test.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.test.ts) validando identificação de duplicidades e formatação da seção de ação imediata

**Checkpoint**: Detecção de duplicidades e ações imediatas implementadas e cobertas por testes.

---

## Phase 5: Integração com Tools do Agente e Validação Final

**Purpose**: Integrar a formatação às ferramentas operacionais do OpsPilot e certificar qualidade total

- [x] T011 [P] Integrar o formatador [src/services/incident-reporter.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/services/incident-reporter.ts) na tool de listagem ou exportar nova tool `formatOpenIncidentsReport` em [src/agents/tools.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/agents/tools.ts)
- [x] T012 [P] Atualizar testes de ferramentas em [src/agents/tools.test.ts](file:///c:/dev/Aulas_UNIPDS/note-project-03/src/agents/tools.test.ts) validando a geração do relatório
- [x] T013 Executar verificação estrita de tipagem TypeScript com `npm run typecheck`
- [x] T014 Executar a suíte completa de testes automatizados com `npm test`
