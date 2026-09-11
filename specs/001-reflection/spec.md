# Feature Specification: Camada Reflection (withReflection)

**Feature Branch**: `001-reflection`  
**Created**: 2026-08-31  
**Status**: Draft  
**Input**: User description: "Camada Reflection: withReflection(strategy, opts) decora qualquer ReasoningStrategy: executa a base; um crítico (mesmo modelo, saída estruturada { approved, feedback }) avalia a resposta contra as observações do trace; se reprovar, regenera com o feedback no contexto; para em approved ou maxReflections (default 2). Evento "critique" no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Avaliação Crítica e Aprovação de Respostas (Priority: P1)

Como operador ou desenvolvedor do OpsPilot, quero que qualquer estratégia de raciocínio (`ReasoningStrategy`) possa ser envolvida por uma camada de reflexão (`withReflection`) para que uma resposta gerada seja criticada e validada contra as observações reais obtidas no trace antes de ser entregue.

**Why this priority**: É o núcleo do padrão Reflection — garantir fidelidade factual e auto-correção automática sobre as saídas dos agentes.

**Independent Test**: Pode ser testado decorando uma estratégia determinística (ou mock) que retorne trace e resposta; o crítico avalia e, ao aprovar, retorna o resultado enriquecido com o evento de `critique` e métricas consolidadas.

**Acceptance Scenarios**:
1. **Given** uma estratégia base que gera uma resposta válida e consistente com suas observações,  
   **When** executada via `withReflection(strategy)`,  
   **Then** o crítico emite `{ approved: true, feedback: "..." }`, registra um evento `kind: 'critique'` no trace e retorna a resposta aprovada com `metrics.llmCalls` somando a execução base + 1 chamada de crítica.

2. **Given** a execução de `withReflection(strategy, { maxReflections: 2 })`,  
   **When** o crítico aprova na primeira iteração,  
   **Then** nenhuma chamada de regeneração adicional à estratégia base é realizada.

---

### User Story 2 - Regeneração com Feedback Corretivo em Caso de Reprovação (Priority: P1)

Como usuário do OpsPilot, quero que quando o crítico reprovar uma resposta por incoerência ou omissão em relação às observações do trace, o agente regenere a resposta recebendo o feedback no contexto até ser aprovado ou atingir o limite `maxReflections`.

**Why this priority**: A autorrecuperação através de feedback é o principal valor de inteligência reflexiva da arquitetura.

**Independent Test**: Testável simulando uma estratégia que falha na primeira tentativa e gera resposta correta na segunda ao receber o feedback; o fluxo deve passar por 2 execuções base e 2 críticas, retornando trace concatenado e métricas somadas.

**Acceptance Scenarios**:
1. **Given** uma resposta inicial inconsistente com as observações do trace,  
   **When** o crítico avalia e retorna `{ approved: false, feedback: "Falta detalhar o alerta #123" }`,  
   **Then** o decorator injeta o feedback no contexto e aciona a estratégia base novamente.

2. **Given** que a segunda tentativa atende aos critérios do crítico (`approved: true`),  
   **When** a reflexão é concluída,  
   **Then** o resultado final contém a resposta corrigida, todos os eventos de trace acumulados em ordem cronológica (incluindo ambos os eventos `critique`) e a soma de todas as chamadas de LLM.

---

### User Story 3 - Respeito ao Limite de Reflexões (`maxReflections`) (Priority: P2)

Como engenheiro de operações, quero limitar a quantidade máxima de ciclos de reflexão (`maxReflections`, padrão 2) para evitar loops infinitos, contenção de latência e estouro de custos de API.

**Why this priority**: Essencial para governança de custos e previsibilidade do sistema em produção.

**Independent Test**: Testável configurando `maxReflections: 2` com um crítico que sempre reprova (`approved: false`); o sistema deve parar exatamente após 2 reprovações e retornar a melhor resposta disponível.

**Acceptance Scenarios**:
1. **Given** uma estratégia cuja resposta continue sendo reprovada pelo crítico e `maxReflections: 2`,  
   **When** o número de reflexões atinge 2,  
   **Then** o loop é interrompido imediatamente e a última resposta gerada é retornada sem lançar exceção não tratada.

2. **Given** a configuração padrão sem informar opções adicionais,  
   **When** instanciado `withReflection(strategy)`,  
   **Then** `maxReflections` assume o valor padrão de 2.

---

### User Story 4 - Suporte na Arena Comparativa (`reflect:react` e `reflect:plan-and-execute`) (Priority: P3)

Como pesquisador ou avaliador de agentes, quero poder comparar diretamente as estratégias puras contra suas versões reflexivas na Arena de benchmark (`reflect:react` e `reflect:plan-and-execute`).

**Why this priority**: Permite comparar diretamente o ganho de qualidade versus o custo adicional de latência e chamadas de LLM.

**Independent Test**: Pode ser testado executando a CLI `src/arena.ts` passando `-s reflect:react,reflect:plan-and-execute`.

**Acceptance Scenarios**:
1. **Given** a execução da CLI `npm run arena -- -s reflect:react`,  
   **When** a estratégia é resolvida,  
   **Then** executa o agente ReAct decorado com reflexão e exibe eventos `CRITIQUE` coloridos no trace e o total de métricas.

2. **Given** a execução da CLI `npm run arena -- -s reflect:plan-and-execute`,  
   **When** a estratégia é resolvida,  
   **Then** executa o grafo Plan-and-Execute decorado com reflexão e exibe o comparativo final.

---

## Edge Cases

- **Trace vazio ou sem observações**: A função helper `observationsOf(trace)` deve retornar string indicativa (ex.: `"(nenhuma observação registrada)"`) sem quebrar a concatenação de prompt.
- **Erro na chamada do modelo crítico**: Se a chamada estruturada do crítico falhar por erro de rede ou validação de schema, deve haver tratamento resiliente ou propagação clara do erro sem mascarar falhas fatais.
- **`maxReflections` configurado como zero ou valor negativo**: `withReflection` deve normalizar `maxReflections` para no mínimo 1 reflexão máxima.
- **Preservação do nome da estratégia**: A estratégia decorada deve expor `readonly name = 'reflect:' + baseStrategy.name`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer a função decoradora `withReflection(strategy: ReasoningStrategy, opts?: ReflectionOptions): ReasoningStrategy`.
- **FR-002**: A estratégia decorada DEVE ter a propriedade `name` com o padrão `reflect:<nome_da_base>` (ex.: `reflect:react`, `reflect:plan-and-execute`).
- **FR-003**: O crítico DEVE utilizar o schema Zod estruturado `verdictSchema`:
  ```typescript
  export const verdictSchema = z.object({
    approved: z.boolean(),
    feedback: z
      .string()
      .describe("se aprovado; o que corrigir, em específico e acionável"),
  });
  export type CritiqueVerdict = z.infer<typeof verdictSchema>;
  ```
- **FR-004**: O sistema DEVE implementar o helper `observationsOf(trace: TraceEvent[]): string` que extrai apenas os eventos onde `kind === 'observation'`, concatenando seu conteúdo textual.
- **FR-005**: A função de crítica `critique` DEVE avaliar a resposta APENAS contra as observações coletadas no trace e o pedido original:
  ```typescript
  async function critique(input: string, result: StrategyResult, model = createModel()) {
    return model
      .withStructuredOutput(verdictSchema)
      .invoke([
        ["system", CRITIC_PROMPT], // avalie APENAS contra as observações do trace e o pedido
        [
          "user",
          `Pedido: ${input}\nObservações: ${observationsOf(result.trace)}\nResposta: ${result.answer}`,
        ],
      ]);
  }
  ```
- **FR-006**: A cada avaliação realizada pelo crítico, o sistema DEVE registrar no trace um evento `kind: 'critique'` contendo a decisão e o feedback.
- **FR-007**: Se `approved` for `false` e a contagem de reflexões executadas for menor que `maxReflections` (default: 2), o sistema DEVE reexecutar a estratégia base injetando no contexto de entrada o feedback do crítico e a resposta anterior a ser corrigida.
- **FR-008**: Se `approved` for `true` ou a contagem de reflexões atingir `maxReflections`, o sistema DEVE retornar o `StrategyResult` consolidado.
- **FR-009**: O `StrategyResult` retornado DEVE conter:
  - `answer`: a última resposta gerada pela estratégia base;
  - `trace`: sequência de eventos de trace acumulados em ordem cronológica contendo todas as ações, observações, pensamentos e críticas;
  - `metrics.llmCalls`: soma cumulativa das chamadas feitas pela estratégia base + 1 chamada por crítica;
  - `metrics.latencyMs`: tempo total decorrido do ciclo de reflexão.
- **FR-010**: O arquivo `src/arena.ts` DEVE registrar no `strategyRegistry` as variantes `reflect:react` e `reflect:plan-and-execute`.

### Key Entities & Contracts

- **`ReflectionOptions`**:
  ```typescript
  export interface ReflectionOptions {
    /** Número máximo de tentativas/reflexões corretivas. Padrão: 2 */
    maxReflections?: number;
    /** Modelo customizado ou fábrica de modelo para o crítico (opcional) */
    model?: ChatOpenAI;
  }
  ```
- **`ReflectionStrategy`**: Classe que implementa `ReasoningStrategy` decorando a estratégia base e coordenando o loop de reflexão.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos testes unitários novos e existentes (`npm test`) passam com sucesso, incluindo testes determinísticos de `observationsOf`, `verdictSchema`, aprovação direta, reprovação com feedback e limite de `maxReflections`.
- **SC-002**: A checagem estática de tipos (`npm run typecheck`) conclui com zero erros.
- **SC-003**: Execução da Arena com `npm run arena -- -s reflect:react,reflect:plan-and-execute` exibe no console os traces formatados com os eventos `CRITIQUE` e tabela comparativa de métricas.
- **SC-004**: Fidelidade estrita ao padrão de chamada do crítico: `createModel().withStructuredOutput(verdictSchema).invoke(...)` recebendo `Pedido`, `Observações` e `Resposta`.

---

## Assumptions

- O prompt do crítico (`CRITIC_PROMPT`) instrui o modelo a atuar como um auditor rigoroso de confiabilidade factual, verificando se a resposta do agente se apoia unicamente nas observações de ferramentas obtidas no trace e atende ao pedido original.
- Para estratégias de base que já possuam ciclos internos de planejamento (como ReAct ou Plan-and-Execute), `withReflection` opera como uma camada externa ("outer loop") de governança e controle de qualidade.
