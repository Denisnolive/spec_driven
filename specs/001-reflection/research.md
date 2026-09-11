# Phase 0 Research: Camada Reflection

Nenhum item da spec ficou marcado `NEEDS CLARIFICATION` (o `/speckit-clarify` já
havia sido rodado sobre `spec.md`). As decisões abaixo cobrem escolhas de
implementação deixadas em aberto pela spec e pela stack existente.

## 1. Como estruturar o decorator (função vs. classe)

- **Decision**: `withReflection(strategy, opts?)` é uma função fábrica que
  retorna uma instância de `ReflectionStrategy implements ReasoningStrategy`.
- **Rationale**: FR-001 permite ambas as formas ("função decoradora... ou
  classe"); uma função fábrica dá a ergonomia de decorator (`withReflection(x)`)
  usada no registro da Arena, enquanto a classe por trás mantém o mesmo padrão
  OO de `ReActStrategy`/`PlanAndExecuteStrategy` (estado privado, método
  `run()`), facilitando testes e leitura.
- **Alternatives considered**: classe exportada diretamente
  (`new ReflectionStrategy(strategy, opts)`) — rejeitada como API pública
  porque a spec e os nomes de estratégia na Arena (`reflect:react`) sugerem uso
  funcional/decorator; a classe continua exportada internamente para permitir
  `instanceof` em testes se necessário.

## 2. Como extrair "observações" do trace para o crítico

- **Decision**: filtrar `result.trace` por `kind === 'observation'` e
  concatenar o `content` (sempre `string` nesse kind) em um bloco de texto
  numerado, passado ao crítico junto da tarefa original e da resposta.
- **Rationale**: FR-004 exige que o crítico receba "as observações
  acumuladas no trace"; `TraceEvent.content` para `kind: 'observation'` é
  tipado como `string` (ver `src/agents/types.ts`), então não há necessidade de
  parsing extra. Edge case da spec ("trace vazio ou sem observações") é
  resolvido naturalmente: lista vazia → o crítico recebe apenas tarefa +
  resposta, sem lançar exceção.
- **Alternatives considered**: usar o trace completo (incluindo thought/action)
  — rejeitado por poluir o prompt do crítico com ruído irrelevante à
  fidelidade factual, que é o critério pedido (FR-004 menciona
  especificamente "observações").

## 3. Saída estruturada do crítico

- **Decision**: reaproveitar `createModel().withStructuredOutput(CritiqueResultSchema)`,
  o mesmo padrão já usado em `PlanAndExecuteStrategy` (`PlanSchema` via
  `model.withStructuredOutput`). `CritiqueResultSchema = z.object({ approved:
  z.boolean(), feedback: z.string() })`.
- **Rationale**: consistência com o restante da base de código (Assumption da
  spec confirma que o modelo já suporta `withStructuredOutput`); satisfaz
  FR-003 diretamente.
- **Alternatives considered**: parsing manual de JSON da resposta livre do
  modelo — rejeitado; reintroduziria exatamente o tipo de falha de parsing já
  visto em produção com `plan-and-execute` (ver observação de memória:
  "LLM returning empty output in plan-and-execute strategy") e violaria o
  Princípio II (validação Zod na fronteira).

## 4. Injeção do crítico para testes determinísticos (Princípio IV)

- **Decision**: `ReflectionOptions.criticModel` aceita qualquer objeto com o
  formato mínimo `{ withStructuredOutput(schema): { invoke(messages): Promise<CritiqueResult> } }`
  — compatível estruturalmente com `BaseChatModel` do LangChain sem precisar
  importar a classe abstrata inteira nos testes.
- **Rationale**: permite testes 100% offline (mock retorna `{approved: true,
  feedback: '...'}` ou `{approved: false, ...}` conforme o cenário) sem tocar
  rede, atendendo Test-First e "sem efeitos colaterais fora dos adaptadores"
  (Princípio V). Quando `criticModel` não é passado, usa `createModel()` (mesmo
  modelo de produção), atendendo FR-003.
- **Alternatives considered**: mockar `fetch`/HTTP global — mais frágil e
  acoplado a detalhes de transporte do LangChain/OpenRouter; rejeitado.

## 5. Como injetar o feedback corretivo na reexecução da estratégia base

- **Decision**: reexecutar `strategy.run(promptWithFeedback)`, onde
  `promptWithFeedback` é a tarefa original prefixada com um bloco de contexto
  estruturado contendo: tarefa original, resposta anterior e feedback do
  crítico, formatado como texto simples (sem exigir que `ReasoningStrategy.run`
  ganhe uma nova assinatura).
- **Rationale**: `ReasoningStrategy.run(input: string)` é a única interface
  pública comum a todas as estratégias (`src/agents/types.ts`); alterar essa
  assinatura quebraria `ReActStrategy`/`PlanAndExecuteStrategy` e violaria o
  princípio de menor superfície de mudança. Concatenar o feedback ao input é o
  mecanismo descrito no Assumption da spec ("formato do prompt de regeneração
  fornece... de forma clara e estruturada").
  Cada rodada roda a estratégia base do zero (novo agente/grafo), então o
  trace de cada tentativa é independente e concatenado depois — sem estado
  compartilhado entre chamadas de `strategy.run()`.
- **Alternatives considered**: adicionar um segundo parâmetro opcional
  `run(input, context?)` a `ReasoningStrategy` — rejeitado por exigir tocar
  `react.ts` e `plan-and-execute.ts` sem necessidade (FR-006 só exige
  "enriquecendo o prompt/contexto de entrada", que o input concatenado já
  cumpre).

## 6. Normalização de `maxReflections` (edge case da spec)

- **Decision**: `const max = Math.max(1, opts?.maxReflections ?? 2)`. Ou seja,
  `0` ou negativo é normalizado para `1` (uma única crítica é sempre
  executada; não há regeneração corretiva se `max === 1` e a primeira
  reprovar).
- **Rationale**: segue literalmente a segunda alternativa oferecida pelo
  próprio edge case da spec ("tratar 0 como desativação de feedback
  corretivo, parando na 1ª crítica"), evitando o caso degenerado de "zero
  críticas" que contradiria FR-005 (todo ciclo avaliado gera um evento
  `critique`).
- **Alternatives considered**: lançar erro de validação para valores ≤ 0 —
  rejeitado; a spec pede tratamento resiliente, não exceção.

## 7. Registro na Arena

- **Decision**: em `src/arena.ts`, `strategyRegistry` ganha:
  ```ts
  'reflect:react': () => withReflection(new ReActStrategy({ maxIterations })),
  'reflect:plan-and-execute': () => withReflection(new PlanAndExecuteStrategy({ maxSteps: maxIterations })),
  ```
- **Rationale**: satisfaz FR-009 e US4 diretamente; reaproveita as opções de
  CLI já existentes (`--max-iterations`). `KIND_COLORS` em `arena.ts` já
  mapeia `critique` para azul — nenhuma mudança de formatação necessária
  (SC-003).
- **Alternatives considered**: nenhuma — mapeamento 1:1 direto pedido pela
  spec.

**Output**: todas as questões de design resolvidas; nenhum `NEEDS
CLARIFICATION` remanescente.
