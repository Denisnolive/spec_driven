---

description: "Task list template for feature implementation"
---

# Tasks: Camada Reflection (withReflection)

**Input**: Design documents from `/specs/001-reflection/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/reflection-api.md](./contracts/reflection-api.md), [quickstart.md](./quickstart.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001) exigem cobertura unitária determinística antes de qualquer commit. Todos os testes usam `node:test` via `tsx`, sem rede (estratégia base e `criticModel` mockados).

**Organization**: Tarefas agrupadas por user story (US1–US4, conforme prioridade em spec.md) para permitir implementação e teste incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2, US3 ou US4
- Caminhos de arquivo exatos incluídos em cada descrição

## Path Conventions

Projeto único (ver plan.md → Structure Decision): todo o código novo vive em
`src/agents/reflection.ts` (+ `reflection.test.ts` co-locado) e uma edição
pontual em `src/arena.ts`. Não há `tests/` separado — o padrão do projeto é
`*.test.ts` co-locado (ver `src/agents/types.test.ts`, `src/agents/tools.test.ts`).

---

## Phase 1: Setup

**Purpose**: Preparar os arquivos novos desta feature dentro da estrutura já existente do projeto.

- [ ] T001 Criar arquivo vazio `src/agents/reflection.ts` com os imports de `./types.js` (`ReasoningStrategy`, `StrategyResult`, `TraceEvent`), `./model.js` (`createModel`) e `zod`
- [ ] T002 [P] Criar arquivo vazio `src/agents/reflection.test.ts` com imports de `node:test`, `node:assert/strict` e um placeholder de `describe` (seguindo o padrão de `src/agents/types.test.ts`)
- [ ] T003 Adicionar `src/agents/reflection.test.ts` ao script `test` em `package.json` (lista de arquivos passada para `node --import tsx --test`)

**Checkpoint**: Estrutura de arquivos pronta; `npm test` já executa (sem falhar) incluindo o novo arquivo vazio.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, schema e helpers compartilhados por todas as user stories — nenhuma story pode ser implementada sem isso.

**⚠️ CRITICAL**: Nenhuma tarefa de US1–US4 pode começar antes desta fase estar completa.

- [ ] T004 [P] Definir `CritiqueResultSchema = z.object({ approved: z.boolean(), feedback: z.string() })` em `src/agents/reflection.ts` (ver data-model.md → CritiqueResult)
- [ ] T005 [P] Definir `export interface ReflectionOptions { maxReflections?: number; criticModel?: Pick<BaseChatModel, 'withStructuredOutput'> }` em `src/agents/reflection.ts` (ver contracts/reflection-api.md)
- [ ] T006 Implementar helper puro `extractObservations(trace: TraceEvent[]): string` em `src/agents/reflection.ts` — filtra `kind === 'observation'`, concatena `content` (string) numerado; retorna string vazia se não houver observações (research.md item 2, Edge Case "trace vazio")
- [ ] T007 Implementar helper puro `buildFeedbackPrompt(originalInput: string, previousAnswer: string, feedback: string): string` em `src/agents/reflection.ts` — monta o input enriquecido para a reexecução da base (research.md item 5)
- [ ] T008 Implementar helper `normalizeMaxReflections(value?: number): number` em `src/agents/reflection.ts` retornando `Math.max(1, value ?? 2)` (research.md item 6, Edge Case "maxReflections zero/negativo")
- [ ] T009 [P] Escrever teste unitário para `extractObservations` em `src/agents/reflection.test.ts`: retorna string vazia para trace sem eventos `observation`; concatena múltiplas observações em ordem (depende de T006)
- [ ] T010 [P] Escrever teste unitário para `normalizeMaxReflections` em `src/agents/reflection.test.ts`: `undefined→2`, `0→1`, `-5→1`, `5→5` (depende de T008)
- [ ] T011 Criar fixture reutilizável de teste em `src/agents/reflection.test.ts`: uma `class FakeStrategy implements ReasoningStrategy` cujo `run()` é controlável por closure (retorna respostas/traces pré-programados por chamada) e um `fakeCriticModel` cujo `withStructuredOutput().invoke()` retorna `CritiqueResult` pré-programado por chamada (research.md item 4)

**Checkpoint**: Tipos, schema e helpers prontos e testados isoladamente; fixtures de teste disponíveis para todas as stories seguintes.

---

## Phase 3: User Story 1 - Avaliação Crítica e Aprovação de Respostas (Priority: P1) 🎯 MVP

**Goal**: Uma estratégia base decorada por `withReflection` executa, é avaliada por um crítico estruturado e — quando aprovada de primeira — retorna o resultado com evento `critique` no trace e métricas somadas, sem regeneração extra.

**Independent Test**: Decorar `FakeStrategy` (T011) que sempre gera resposta "boa"; `fakeCriticModel` sempre aprova; verificar 1 execução da base + 1 crítica, sem segunda chamada a `strategy.run`.

### Tests for User Story 1

> **NOTA**: escrever estes testes primeiro; devem falhar até a implementação da tarefa correspondente.

- [ ] T012 [P] [US1] Teste em `src/agents/reflection.test.ts`: `withReflection(strategy).name === 'reflect:' + strategy.name` (FR-002, edge case "Preservação do nome")
- [ ] T013 [P] [US1] Teste em `src/agents/reflection.test.ts`: aprovação na 1ª crítica → `result.trace` contém exatamente 1 evento `kind: 'critique'`; `result.metrics.llmCalls === baseLlmCalls + 1` (US1 Acceptance Scenario 1)
- [ ] T014 [P] [US1] Teste em `src/agents/reflection.test.ts`: aprovação na 1ª crítica com `maxReflections: 2` → `FakeStrategy.run` é chamado exatamente 1 vez (nenhuma regeneração) (US1 Acceptance Scenario 2)

### Implementation for User Story 1

- [ ] T015 [US1] Implementar classe `ReflectionStrategy implements ReasoningStrategy` em `src/agents/reflection.ts` com `readonly name = 'reflect:' + strategy.name` (depende de T001)
- [ ] T016 [US1] Implementar `run(input)` — caminho feliz de aprovação direta: executar `strategy.run(input)`, montar prompt do crítico com `input`, `extractObservations(result.trace)` e `result.answer` (FR-004), invocar `criticModel.withStructuredOutput(CritiqueResultSchema)`, adicionar evento `{ kind: 'critique', content: feedback, timestampMs: Date.now() }` ao trace (FR-005), e se `approved === true` retornar `StrategyResult` consolidado com `metrics.llmCalls`/`latencyMs` somando base + 1 crítica (FR-008) — em `src/agents/reflection.ts` (depende de T004–T007, T015)
- [ ] T017 [US1] Implementar `export function withReflection(strategy: ReasoningStrategy, opts?: ReflectionOptions): ReasoningStrategy` em `src/agents/reflection.ts` retornando `new ReflectionStrategy(strategy, opts)`, usando `opts?.criticModel ?? createModel()` (FR-001, FR-003) (depende de T015, T016)

**Checkpoint**: User Story 1 completa e testável de forma independente — `npm test` passa para T012–T014.

---

## Phase 4: User Story 2 - Regeneração com Feedback Corretivo em Caso de Reprovação (Priority: P1)

**Goal**: Quando o crítico reprova, a estratégia base é reexecutada com o feedback incorporado ao input, até nova aprovação, acumulando trace e métricas de todas as tentativas.

**Independent Test**: `FakeStrategy` retorna resposta ruim na 1ª chamada e boa na 2ª; `fakeCriticModel` reprova a 1ª avaliação e aprova a 2ª; verificar 2 execuções da base, 2 eventos `critique`, trace cronológico completo, métricas somando as 2 execuções + 2 críticas.

### Tests for User Story 2

- [ ] T018 [P] [US2] Teste em `src/agents/reflection.test.ts`: reprovação na 1ª tentativa + aprovação na 2ª → `FakeStrategy.run` é chamado exatamente 2 vezes, e o 2º input recebido contém o `feedback` da 1ª crítica (US2 Acceptance Scenario 1)
- [ ] T019 [P] [US2] Teste em `src/agents/reflection.test.ts`: no cenário acima, `result.trace` contém os eventos de ambas as execuções da base intercalados com 2 eventos `critique`, em ordem cronológica (por `timestampMs` não-decrescente) (US2 Acceptance Scenario 2)
- [ ] T020 [P] [US2] Teste em `src/agents/reflection.test.ts`: no cenário acima, `result.metrics.llmCalls` é a soma exata das `llmCalls` das 2 execuções da base + 2 (uma por crítica) (FR-008)
- [ ] T021 [P] [US2] Teste em `src/agents/reflection.test.ts`: `result.answer` final é a resposta da 2ª (última aprovada) execução da base, não a 1ª

### Implementation for User Story 2

- [ ] T022 [US2] Estender `run(input)` em `src/agents/reflection.ts` para, quando `approved === false`, chamar `buildFeedbackPrompt(input, previousAnswer, feedback)` (T007) e reexecutar `strategy.run(promptComFeedback)`, repetindo a avaliação crítica sobre o novo resultado (FR-006) (depende de T016)
- [ ] T023 [US2] Implementar acumulação de trace e métricas entre tentativas em `src/agents/reflection.ts`: concatenar `trace` de cada tentativa + cada evento `critique` na ordem em que ocorrem; somar `llmCalls` de todas as tentativas + 1 por crítica; somar `latencyMs` do início ao fim do loop completo (FR-008, data-model.md → ReflectionStrategy) (depende de T022)

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e integrada — `npm test` passa para T012–T021.

---

## Phase 5: User Story 3 - Respeito ao Limite de Reflexões (`maxReflections`) (Priority: P2)

**Goal**: O loop de reflexão nunca ultrapassa `maxReflections` avaliações críticas, retornando a última resposta disponível sem lançar exceção quando o limite é atingido com reprovação persistente.

**Independent Test**: `fakeCriticModel` sempre reprova; `maxReflections: 2`; verificar que o loop para exatamente após 2 críticas (2 execuções da base), sem exceção, e retorna a última resposta gerada.

### Tests for User Story 3

- [ ] T024 [P] [US3] Teste em `src/agents/reflection.test.ts`: crítico sempre reprova com `maxReflections: 2` → exatamente 2 eventos `critique` no trace, exatamente 2 execuções de `FakeStrategy.run`, e a `Promise` de `run()` resolve normalmente (sem `throw`) (US3 Acceptance Scenario 1)
- [ ] T025 [P] [US3] Teste em `src/agents/reflection.test.ts`: `withReflection(strategy)` sem `opts` → comportamento idêntico a `maxReflections: 2` (crítico sempre reprova, para em 2 tentativas) (US3 Acceptance Scenario 2, default)
- [ ] T026 [P] [US3] Teste em `src/agents/reflection.test.ts`: `withReflection(strategy, { maxReflections: 0 })` com crítico sempre reprova → exatamente 1 avaliação crítica realizada, sem regeneração (Edge Case "maxReflections zero ou negativo", usa `normalizeMaxReflections` de T008)

### Implementation for User Story 3

- [ ] T027 [US3] Aplicar `normalizeMaxReflections(opts?.maxReflections)` (T008) ao inicializar o loop em `run()` e adicionar a condição de parada: interromper o loop e retornar o `StrategyResult` atual assim que `reflectionCount === max`, mesmo com `approved === false` (FR-007) — em `src/agents/reflection.ts` (depende de T022, T023)
- [ ] T028 [US3] Garantir que o contador de reflexões incrementa por crítica realizada (não por regeneração) e que nenhuma regeneração extra ocorre após atingir o limite, em `src/agents/reflection.ts` (depende de T027)

**Checkpoint**: User Stories 1–3 completas e testáveis independentemente — `npm test` passa para T012–T026.

---

## Phase 6: User Story 4 - Suporte na Arena Comparativa (`reflect:react` e `reflect:plan-and-execute`) (Priority: P3)

**Goal**: A CLI da Arena (`src/arena.ts`) reconhece `reflect:react` e `reflect:plan-and-execute` como estratégias registradas, exibindo eventos `CRITIQUE` no trace e o comparativo de métricas.

**Independent Test**: Rodar `npm run arena -- -s reflect:react` e `npm run arena -- -s reflect:plan-and-execute` (quickstart.md passos 3–5) e confirmar saída formatada sem erro de "Estratégia desconhecida".

### Implementation for User Story 4

> Sem testes unitários dedicados — validação é manual via `quickstart.md` (a Arena faz chamadas reais de LLM; não é adequada para o `npm test` determinístico).

- [ ] T029 [US4] Importar `withReflection` de `./agents/reflection.js` em `src/arena.ts` (depende de T017)
- [ ] T030 [US4] Adicionar ao `strategyRegistry` em `src/arena.ts`: `'reflect:react': () => withReflection(new ReActStrategy({ maxIterations }))` (FR-009, research.md item 7) (depende de T029)
- [ ] T031 [US4] Adicionar ao `strategyRegistry` em `src/arena.ts`: `'reflect:plan-and-execute': () => withReflection(new PlanAndExecuteStrategy({ maxSteps: maxIterations }))` (FR-009, research.md item 7) (depende de T029)
- [ ] T032 [US4] Validar manualmente com `npm run arena -- -s reflect:react` e `npm run arena -- -s react,reflect:react` (quickstart.md passos 3–4): confirmar que eventos `CRITIQUE` aparecem em azul (já mapeado em `KIND_COLORS`) e que a tabela comparativa exibe `llmCalls`/`latencyMs` corretamente (depende de T030, T031)
- [ ] T033 [US4] Validar manualmente com `npm run arena -- -s plan-and-execute,reflect:plan-and-execute` (quickstart.md passo 5) (depende de T030, T031)

**Checkpoint**: Todas as 4 user stories funcionais — Arena expõe as 2 novas estratégias registradas.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Robustez, conformidade com a Constitution e validação final de ponta a ponta.

- [ ] T034 [P] Teste de resiliência em `src/agents/reflection.test.ts`: `fakeCriticModel.withStructuredOutput().invoke()` rejeita (simula falha de rede/schema) → `run()` não lança exceção não tratada silenciosa; documentar/implementar o comportamento de degradação escolhido em `src/agents/reflection.ts` (Edge Case "Erro na chamada do modelo crítico", contracts/reflection-api.md → "Erros esperados")
- [ ] T035 [P] Teste em `src/agents/reflection.test.ts`: se `strategy.run()` (base) lança, o erro propaga inalterado através de `ReflectionStrategy.run()` (contracts/reflection-api.md → "Estratégia base lança")
- [ ] T036 Revisar `src/agents/reflection.ts` quanto a tipagem estrita — nenhum `any` implícito, todos os imports ESM com `.js` (Constitution Princípio I)
- [ ] T037 Rodar `npm run typecheck` e corrigir quaisquer erros (SC-002)
- [ ] T038 Rodar `npm test` completo e confirmar 100% de sucesso incluindo `reflection.test.ts` (SC-001)
- [ ] T039 Executar `quickstart.md` passos 1–5 de ponta a ponta e confirmar todos os resultados esperados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende de Foundational
- **US2 (Phase 4)**: depende de US1 (estende o mesmo `run()`; T022/T023 partem de T016)
- **US3 (Phase 5)**: depende de US2 (estende o mesmo loop; T027/T028 partem de T022/T023)
- **US4 (Phase 6)**: depende de US1 completa (precisa de `withReflection` exportado, T017); pode rodar em paralelo com US2/US3 se outro desenvolvedor cuidar da integração na Arena, mas validação manual (T032/T033) só faz sentido com o loop completo (US2/US3) implementado
- **Polish (Phase 7)**: depende de todas as stories desejadas estarem completas

> **Nota de independência**: diferente do template genérico, US1→US2→US3 aqui são
> incrementais sobre o **mesmo** método `run()` (não módulos paralelos), porque a
> spec define um único loop crítico-corretivo cuja complexidade cresce por
> prioridade (aprovar → regenerar → limitar). Cada fase ainda é **independentemente
> testável** (checkpoints acima), mas não é implementável em paralelo por
> desenvolvedores diferentes sem coordenação. US4 (integração na Arena) é o único
> incremento verdadeiramente independente/paralelo.

### Within Each User Story

- Testes escritos e falhando antes da implementação correspondente
- Helpers/tipos (Foundational) antes de qualquer story
- US1 (aprovação) antes de US2 (regeneração) antes de US3 (limite)
- Story completa e com testes verdes antes de avançar para a próxima

### Parallel Opportunities

- T002 (setup do arquivo de teste) em paralelo com T001
- T004, T005 (schema/tipos) em paralelo entre si; T006, T007, T008 (helpers) em paralelo entre si após T001
- T009, T010 em paralelo entre si (testam helpers diferentes)
- Todos os testes de uma mesma story marcados [P] (ex.: T012–T014, T018–T021, T024–T026) podem ser escritos em paralelo entre si, antes da implementação daquela story
- T034, T035 (Polish) em paralelo entre si

---

## Parallel Example: User Story 2

```bash
# Escrever todos os testes de US2 em paralelo (mesmo arquivo, blocos independentes):
Task: "Teste: 2 execuções da base com feedback no 2º input — src/agents/reflection.test.ts"
Task: "Teste: trace cronológico com 2 eventos critique — src/agents/reflection.test.ts"
Task: "Teste: soma de llmCalls das 2 tentativas + 2 críticas — src/agents/reflection.test.ts"
Task: "Teste: answer final é da 2ª tentativa — src/agents/reflection.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories)
3. Completar Phase 3: User Story 1 (aprovação direta + evento `critique` + métricas somadas)
4. **PARAR e VALIDAR**: `npm test` verde para T012–T014; `npm run typecheck` verde
5. Demonstrar via `npm run arena -- -s react` (estratégia base, sem reflection ainda) como baseline de comparação

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → testar independentemente → aprovação direta funcional (MVP do padrão Reflection)
3. US2 → testar independentemente → auto-correção com feedback funcional
4. US3 → testar independentemente → governança de custo/latência garantida
5. US4 → validar manualmente → Arena expõe `reflect:react` e `reflect:plan-and-execute`
6. Polish → resiliência a erros do crítico, typecheck, suíte completa, quickstart end-to-end

---

## Notes

- [P] tasks = arquivos/blocos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (Test-First, Constitution Princípio IV)
- Rodar `npm run typecheck` e `npm test` antes de qualquer commit (Constitution Princípio IV)
- Parar em qualquer checkpoint para validar a story isoladamente
- Evitar: tarefas vagas, conflitos no mesmo arquivo sem coordenação, dependências que quebrem a independência das stories além do encadeamento US1→US2→US3 já documentado acima
