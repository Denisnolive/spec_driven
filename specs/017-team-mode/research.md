# Research: Modo Equipe com Supervisor, Blackboard e Handoffs Observáveis

**Feature**: `017-team-mode`  
**Date**: 2026-09-11  
**Status**: Completed  

---

## 1. Contexto e Motivação Arquitetural

O OpsPilot atualmente opera com estratégias monolíticas ou sequenciais de agente (`ReAct`, `PlanAndExecute`, `Reflection`). Para incidentes de produção complexos (ex: degradação em cascata envolvendo múltiplos serviços e runbooks), um único prompt tende a perder fidelidade em passos avançados, confundir ferramentas ou tomar ações precipitadas.

O **Modo Equipe (`src/team/`)** resolve essa limitação introduzindo uma arquitetura multiagente hierárquica baseada no padrão **Blackboard** supervisionado por um **Supervisor Central**:
- O **Supervisor** funciona como maestro e árbitro do processo, decidindo qual especialista chamar e emitindo diretrizes concisas (`brief`) por meio de saída estruturada garantida (`withStructuredOutput`).
- O **Blackboard** mantém o estado consolidado da triagem (tarefa, evidências/achados, plano tático, ações executadas e contagem de iterações), desacoplando o raciocínio individual de cada agente.
- A **Segregação de Papéis** impede vazamento de responsabilidade:
  - Analista apenas lê e diagnostica (sem mutações nem proposições de planos).
  - Planejador apenas planeja com base nas evidências coletadas (sem ferramentas externas).
  - Executor apenas executa ações de incidentes aprovadas (sem bypass de validações).
- A **Observabilidade de Handoffs** garante que cada transferência de bastão fique registrada no trace persistido e seja visível graficamente na interface de War Room ("Ver Raciocínio").
- O **Teto de Segurança (8 iterações)** garante limite rígido contra loops de delegação e custos de tokens descontrolados.

---

## 2. Decisões de Design e Padrões Técnicos

### 2.1 Supervisor com `withStructuredOutput`
- **Contrato de Decisão**:
  ```ts
  export const supervisorDecisionSchema = z.object({
    next: z.enum(['analyst', 'planner', 'executor', 'FINISH']).describe(
      "Próximo agente a ser acionado ou 'FINISH' se o atendimento foi concluído"
    ),
    brief: z.string().min(1).describe(
      'Instrução concisa para o especialista ou resumo de conclusão para o operador'
    ),
  });
  export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;
  ```
- **Mecanismo**: Utiliza `model.withStructuredOutput(supervisorDecisionSchema)` com fallback em caso de modelo indisponível, garantindo que o supervisor nunca emita saídas textuais ambíguas que quebrem o grafo.

### 2.2 Padrão Blackboard no Estado do Grafo
O `TeamState` é modelado como um `Annotation.Root` do `@langchain/langgraph`:
```ts
export interface Blackboard {
  task: string;
  findings: string[];
  plan?: string;
  actions: string[];
  status: 'triaging' | 'planning' | 'executing' | 'completed' | 'exhausted';
}
```
Campos do estado do grafo:
- `task`: demanda original do usuário.
- `blackboard`: estado compartilhado evolutivo.
- `next`: destino do próximo passo decidido pelo supervisor.
- `brief`: diretriz emitida pelo supervisor.
- `iterationCount`: contador inteiro de invocações do supervisor (inicia em 0, teto 8).
- `trace`: acumulador de `TraceEvent` (incluindo os eventos `'handoff'`).
- `history`: histórico de mensagens para contextualização.
- `answer`: resposta final entregue ao usuário.

### 2.3 Segregação Rigorosa dos Especialistas
1. **Analista (`analystNode`)**:
   - **Tools permitidas (leitura estrita)**:
     - `listAlerts`
     - `listIncidents`
     - `getOpenIncidentsReport`
     - `consultarRunbook`
     - `checkProviderStatus`
   - **Tools proibidas**: `openIncident`, `resolveIncident`, ou qualquer ferramenta de mutação.
   - **Comportamento**: Executa inspeções, compila os fatos e anexa em `blackboard.findings`. Não gera planos nem chama mutações.
2. **Planejador (`plannerNode`)**:
   - **Tools permitidas**: NENHUMA (*zero tools*).
   - **Comportamento**: Recebe a `task` e os `findings` do blackboard. Usa chamada de raciocínio pura do LLM para estruturar o plano de ação passo a passo, salvando em `blackboard.plan`.
3. **Executor (`executorNode`)**:
   - **Tools permitidas**:
     - `openIncident`
     - `resolveIncident`
     - `listIncidents` (para verificação de IDs)
   - **Sem bypass**: Toda chamada passa pelo schema Zod das tools e pelo repositório oficial (`activeStore`). Registra as ações em `blackboard.actions`.

### 2.4 Handoffs no Trace de Observabilidade
- Adicionar `'handoff'` a `TraceEventKind` em `src/agents/types.ts`:
  ```ts
  export type TraceEventKind =
    | 'thought'
    | 'action'
    | 'observation'
    | 'plan'
    | 'critique'
    | 'answer'
    | 'route'
    | 'fallback'
    | 'handoff';
  ```
- Estrutura do evento no trace:
  ```ts
  {
    node: 'supervisor',
    kind: 'handoff',
    type: 'handoff',
    from: 'supervisor',
    to: state.next,
    brief: state.brief,
    iteration: state.iterationCount,
    content: `Handoff [${state.iterationCount}/8]: supervisor ➔ ${state.next} - "${state.brief}"`,
    timestampMs: Date.now()
  }
  ```

### 2.5 Renderização na UI "Ver Raciocínio"
No componente `web/src/components/TraceDrawer.tsx`:
- Detectar `evt.kind === 'handoff'` ou `evt.type === 'handoff'`.
- Renderizar card estilizado com:
  - Badge `HANDOFF` com gradiente roxo/índigo.
  - Indicador de direção: `<span className="handoff-direction">{evt.from || 'supervisor'} ➔ {evt.to}</span>`.
  - Box de instrução contendo o `{evt.brief || evt.content}` com ícone de transição.
- Estilos correspondentes adicionados em `web/src/index.css`.

### 2.6 Teto de Segurança (Max 8 Iterações)
- A cada avaliação do nó supervisor, `iterationCount` é incrementado (`iterationCount + 1`).
- Se `iterationCount >= 8`:
  - O supervisor não delega para nenhum especialista.
  - O nó supervisor força `next = "FINISH"`.
  - O status do blackboard é marcado como `"exhausted"`.
  - A resposta final sintetiza as ações realizadas até o momento e adiciona aviso transparente:
    `"⚠️ Limite operacional da equipe atingido (8/8 turnos). Ações parciais foram preservadas no blackboard."`
  - Um evento de trace com `kind: 'handoff'` ou alerta de encerramento é registrado.

### 2.7 Integração com o Roteador de Produção (`production-graph.ts`)
- `routeSchema`: `z.enum(['react', 'planExecute', 'reflect', 'team'])`.
- `normalizeRoute`: aceita `'team'`, `'equipe'`, `'modo-equipe'`.
- Nó `team`: executa o `runTeamGraph` ou instância `TeamStrategy`.
- Conditional edges: `'team': 'team'`.
- `POST /chat`: aceita `strategy: "team"` ou seleciona automaticamente em incidentes multifuncionais.

---

## 3. Matriz de Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Modelo gerar nome de agente inválido no `next` | Falha de transição no LangGraph | Schema Zod estrito em `withStructuredOutput`. Fallback para `'FINISH'` caso retorne valor inválido. |
| Analista tentar sugerir ações de resolução | Quebra de segregação de papel | Prompt de sistema rígido do analista instruindo foco estrito em sintomas e dados brutos. |
| Planejador tentar chamar ferramentas | Erro de execução de tool inexistente | Modelo do planejador é instanciado sem ferramentas acopladas (`bindTools` não é chamado). |
| Executor executar ações destrutivas sem validação | Risco de dados corrompidos | Sem bypass: todas as ações passam pelas tools Zod oficiais do repositório OpsStore. |
| Loop de delegações infinitas entre analista e planejador | Custo elevado e travamento | Teto estrito de 8 iterações controlado pelo estado do grafo com transição forçada para `FINISH`. |
