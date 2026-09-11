# Feature Specification: Grafo Unificado de Produção (Production Graph)

**Feature Branch**: `011-production-graph`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "Grafo unificado: production-graph.ts: nós contexto, roteador, as 3 estratégias como nós e resposta. Roteador: withStructuredOutput (route, reason); tabela no prompt; evento "route" e campo node em todo evento de trace. /chat: strategy opcional (se vier, é override no trace)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Roteamento Inteligente e Grafo Unificado de Produção (Priority: P1)

Como operador ou engenheiro do OpsPilot, quero enviar uma mensagem ao assistente sem precisar especificar manualmente qual estratégia de raciocínio usar, de modo que um Grafo Unificado (`src/agents/production-graph.ts`) execute os nós `contexto`, `roteador`, selecione dinamicamente a melhor estratégia (`react`, `plan-and-execute` ou `reflection`) e consolide o nó `resposta`, rotulando cada passo do trace com o nome do nó responsável (`node`) e registrando a decisão no evento `route`.

**Why this priority**: É a espinha dorsal da arquitetura do agente autônomo em produção. Em vez de acoplamento estático no controller HTTP, um grafo de estados orquestra ponta a ponta desde a injeção de contexto orçado até a entrega da resposta final com rastreabilidade total.

**Independent Test**: Testável de ponta a ponta com `src/agents/production-graph.test.ts`:
1. Submeter uma pergunta simples de inspeção operacional (ex: "Qual o status do serviço auth?") sem parâmetro `strategy`.
2. O nó `contexto` monta o contexto com `ContextBuilder`.
3. O nó `roteador` avalia a mensagem com saída estruturada (`route`, `reason`) baseando-se na tabela de critérios do prompt e decide pela rota `react`.
4. O nó `react` executa as ferramentas e gera resposta.
5. O nó `resposta` consolida métricas e trace.
6. O trace final contém o evento `kind: 'route'` e todos os eventos possuem o campo `node: 'contexto' | 'roteador' | 'react' | 'resposta'`.

**Acceptance Scenarios**:
1. **Given** uma requisição de consulta pontual de monitoramento sem estratégia definida,  
   **When** o `ProductionGraph` é invocado,  
   **Then** o nó `roteador` classifica a intenção como `react`, grava o evento `kind: 'route'` no trace com a justificativa (`reason`) e `node: 'roteador'`, e encaminha o fluxo para o nó `react`.

2. **Given** uma requisição complexa de múltiplos passos interdependentes (ex: "Verifique o status do gateway, consulte seu runbook e abra um incidente se estiver instável"),  
   **When** o `ProductionGraph` é invocado,  
   **Then** o nó `roteador` classifica a intenção como `plan-and-execute` com `node: 'roteador'`, e direciona para o nó `plan-and-execute`.

3. **Given** uma requisição de auditoria crítica de causa raiz ou revisão factual (ex: "Analise criticamente por que as requisições falharam e audite se as evidências sustentam essa conclusão"),  
   **When** o `ProductionGraph` é invocado,  
   **Then** o nó `roteador` classifica a intenção como `reflection` com `node: 'roteador'`, e direciona para o nó `reflection`.

4. **Given** a execução de qualquer um dos nós do grafo (`contexto`, `roteador`, `react`, `plan-and-execute`, `reflection`, `resposta`),  
   **When** novos eventos são adicionados ao trace acumulado,  
   **Then** 100% dos eventos de trace contêm a propriedade `node` preenchida com o identificador canônico do nó emissor.

---

### User Story 2 - Roteamento com Tabela de Decisão no Prompt e Saída Estruturada (Priority: P1)

Como desenvolvedor do agente, quero que o nó `roteador` utilize `model.withStructuredOutput` com schema Zod rigoroso contendo `route` e `reason`, orientado por uma tabela explícita de diretrizes e exemplos de roteamento em seu prompt de sistema, garantindo previsibilidade e decisões fundamentadas.

**Why this priority**: Evita ambiguidades e alucinações no roteamento. A saída estruturada garante tipagem forte em runtime e a tabela matricial orienta o modelo sobre os trade-offs de custo, latência e profundidade de cada estratégia.

**Independent Test**: Testável unitariamente no roteador:
1. Injetar um mock ou invocar o modelo do roteador com entradas características de cada categoria.
2. Comprovar que o payload retornado segue estritamente `{ route, reason }` onde `route` pertence ao enum `['react', 'plan-and-execute', 'reflection']`.
3. Comprovar que o prompt do sistema contém a tabela comparativa de critérios operacionais.

**Acceptance Scenarios**:
1. **Given** o prompt de instruções do nó roteador,  
   **When** inspecionado,  
   **Then** contém uma tabela Markdown definindo as 3 estratégias, quando usar, custo relativo e exemplos representativos.

2. **Given** a invocação do nó roteador com modelo estruturado,  
   **When** a LLM processa o pedido,  
   **Then** o retorno é validado pelo schema Zod `{ route: z.enum(['react', 'plan-and-execute', 'reflection']), reason: z.string().min(1) }`.

3. **Given** a decisão de roteamento gerada,  
   **When** adicionada ao estado do grafo,  
   **Then** gera um `TraceEvent` com `kind: 'route'`, `node: 'roteador'`, `content: `Roteado para ${route}: ${reason}`` e timestamp atual.

---

### User Story 3 - Override Manual de Estratégia via `/chat` e Registro Transparente no Trace (Priority: P2)

Como usuário ou integrador da API HTTP `POST /chat`, quero poder tanto omitir o campo `strategy` (para que o roteador inteligente assuma o controle) quanto passar explicitamente `strategy: "react" | "plan-and-execute" | "reflection"`, atuando como override manual com registro explícito desse override no trace.

**Why this priority**: Dá flexibilidade aos clientes da API. Em produção cotidiana, o roteador automático otimiza recursos; em testes, benchmarks (Arena/Bench) ou requisitos específicos, o chamador tem a prerrogativa de forçar a estratégia desejada.

**Independent Test**: Testável via `src/http/server.test.ts`:
1. Fazer requisição `POST /chat` omitindo `strategy`: verificar que a resposta tem status 200, trace com evento `route` contendo decisão automática do roteador e o campo `node` em todos os eventos.
2. Fazer requisição `POST /chat` com `{ strategy: "plan-and-execute" }`: verificar que a estratégia executada é obrigatoriamente `plan-and-execute`, e o trace registra explicitamente que houve override manual (`kind: 'route'`, indicando override e `node: 'roteador'`).

**Acceptance Scenarios**:
1. **Given** um payload HTTP em `POST /chat` sem o campo `strategy`,  
   **When** a rota é processada,  
   **Then** o `ChatRequestSchema` valida o corpo com sucesso, trata `strategy` como opcional e delega o roteamento autônomo ao nó `roteador` do grafo.

2. **Given** um payload HTTP em `POST /chat` com `strategy: "reflection"`,  
   **When** a rota é processada,  
   **Then** o grafo unificado adota a estratégia especificada sem invocar chamada redundante de classificação LLM, e registra no trace um evento `kind: 'route'` com conteúdo indicando override manual e `node: 'roteador'`.

3. **Given** um payload com `strategy` desconhecida ou inválida (ex: `strategy: "invalida"`),  
   **When** a rota é processada,  
   **Then** a API retorna status `400` ou `422` com mensagem de erro descritiva e lista das estratégias aceitas.

---

## Edge Cases

- **Timeout durante a execução do grafo**: Se qualquer nó demorar além do `timeoutMs` configurado no servidor, a Promise de timeout aborta a requisição retornando status `504 Gateway Timeout`.
- **Falha no nó roteador**: Se a chamada estruturada do roteador falhar ou retornar rota inválida, o sistema deve adotar uma rota de fallback segura (`react`), registrando a falha e a decisão de contingência no trace com `node: 'roteador'`.
- **Mensagem com override de estratégia via `/chat`**: Quando `strategy` é enviado explicitamente, o nó roteador NÃO faz chamada externa ao LLM de roteamento, economizando tokens e latência, e grava diretamente o evento `route` informando override manual.
- **Histórico longo e orçamentos do ContextBuilder**: O nó `contexto` utiliza o `ContextBuilder` já validado, garantindo que o prompt entregue às estratégias respeite integralmente os tetos de tokens por seção configurados em `CONTEXT_BUDGET_*`.
- **Estratégia falha ao executar**: Caso um nó de estratégia lance erro irrecuperável, o nó `resposta` ou o tratador de erro do grafo captura e formata um retorno de erro limpo, preservando o trace até o ponto da falha.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST implementar o grafo de estados unificado em `src/agents/production-graph.ts` utilizando a biblioteca `@langchain/langgraph` (`StateGraph`, `Annotation`, `START`, `END`).
- **FR-002**: O grafo unificado MUST possuir os seguintes nós principais:
  - `contexto`: responsável pela busca de histórico, memórias semânticas, resumo prévio e compilação do contexto via `ContextBuilder`.
  - `roteador`: responsável por avaliar a mensagem e decidir a estratégia adequada ou aplicar o override fornecido.
  - `react`: nó executor que roda a estratégia ReAct.
  - `plan-and-execute`: nó executor que roda a estratégia Plan-and-Execute.
  - `reflection`: nó executor que roda a estratégia com reflexão crítica.
  - `resposta`: nó finalizador que consolida a resposta, compila métricas acumuladas e formata o resultado final.
- **FR-003**: O nó `roteador` MUST utilizar `model.withStructuredOutput` com schema Zod contendo:
  - `route`: enum restrito aos valores `'react' | 'plan-and-execute' | 'reflection'`.
  - `reason`: string não-vazia com a justificativa técnica da escolha.
- **FR-004**: O prompt do sistema do nó `roteador` MUST conter uma tabela estruturada comparando as três estratégias (`react`, `plan-and-execute`, `reflection`), detalhando quando utilizar cada uma, vantagens, compensações operacionais e exemplos concretos de requisições.
- **FR-005**: O tipo `TraceEventKind` em `src/agents/types.ts` MUST ser estendido para incluir `'route'`.
- **FR-006**: A interface `TraceEvent` em `src/agents/types.ts` MUST incluir o campo `node?: string` (ou `node: string`), e todos os eventos emitidos pelos nós do grafo unificado MUST preencher obrigatoriamente a propriedade `node` com o nome do nó emissor (`contexto`, `roteador`, `react`, `plan-and-execute`, `reflection`, `resposta`).
- **FR-007**: O nó `roteador` MUST emitir no trace um evento com `kind: 'route'`, `node: 'roteador'` e conteúdo descrevendo a rota selecionada e seu motivo (ou menção a override manual).
- **FR-008**: O schema de validação `ChatRequestSchema` em `src/http/server.ts` MUST definir o campo `strategy` como opcional (sem valor default forçado para 'react').
- **FR-009**: Quando o campo `strategy` for enviado na requisição HTTP `POST /chat`, o `ProductionGraph` MUST adotar a estratégia solicitada como override manual, sem invocar o LLM de roteamento, registrando o override no evento de trace `route` com `node: 'roteador'`.
- **FR-010**: O endpoint `POST /chat` em `src/http/server.ts` MUST delegar a execução ao `ProductionGraph`, mantendo compatibilidade com as métricas retornadas (`llmCalls`, `latencyMs`, `promptTokens`, `contextBreakdown`, `contextBudgetStats`, `historyMessages`, `recalledMemories`).
- **FR-011**: O sistema MUST fornecer suíte completa de testes unitários e de integração para o `ProductionGraph` e para a nova dinâmica do `/chat`.

---

### Key Entities

- **ProductionGraphState**: Estado central do grafo LangGraph anotado:
  - `message: string` (mensagem de entrada)
  - `userId?: string` (identificador do usuário)
  - `conversationId?: string` (identificador da conversa)
  - `strategyOverride?: string` (estratégia forçada pelo cliente HTTP, se houver)
  - `builtContext?: BuiltContext` (contexto montado com orçamentos e mensagens podadas)
  - `route?: 'react' | 'plan-and-execute' | 'reflection'` (rota selecionada)
  - `routeReason?: string` (motivo do roteamento)
  - `isOverride?: boolean` (indica se a rota foi forçada por override)
  - `answer?: string` (resposta gerada)
  - `trace: TraceEvent[]` (eventos de rastreamento com reducer de concatenação)
  - `metrics: Metrics` (métricas consolidadas de execução)
- **RouterOutput**: Saída estruturada do nó roteador (`route`, `reason`).
- **TraceEvent**: Evento tipado do trace contendo `kind`, `content`, `timestampMs` e `node`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O `ProductionGraph` executa com sucesso o fluxo completo `contexto` → `roteador` → `[estratégia]` → `resposta` em 100% dos testes ponta a ponta.
- **SC-002**: Em 100% dos eventos do trace retornado na resposta do grafo, o campo `node` está devidamente preenchido com o nome do nó responsável.
- **SC-003**: 100% das decisões de roteamento emitem um evento com `kind: 'route'` no trace, identificando se a rota foi decidida pela LLM com justificativa ou acionada por override manual.
- **SC-004**: Quando `strategy` é enviado em `POST /chat`, a taxa de respeito ao override é de 100%, sem realização de chamada redundante de classificação LLM.
- **SC-005**: 100% dos testes da suíte (`npm test`) e checagem de tipos estrita (`npm run typecheck`) executam com sucesso, sem quebra das funcionalidades e testes legados.

---

## Assumptions

- As 3 estratégias fundamentais do sistema são `react` (`ReActStrategy`), `plan-and-execute` (`PlanAndExecuteStrategy`) e `reflection` (`ReflectionStrategy`).
- O nó `roteador` reutiliza o modelo configurado no ambiente (`OPENROUTER_MODEL` / `OPENROUTER_API_KEY`) via `createModel()` com suporte a `.withStructuredOutput`.
- Para fins de testes determinísticos rápidos, o grafo permite a injeção de dependências (modelo customizado de roteamento, estratégias mockáveis e stores).
