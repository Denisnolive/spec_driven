# Feature Specification: Modo Equipe com Supervisor, Blackboard e Handoffs Observáveis

**Feature Branch**: `017-team-mode`  
**Created**: 2026-09-11  
**Status**: Complete  
**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({ next, brief}) sobre um blackboard no estado. Papéis: analista (só leitura, não propõe), planejador (sem tools), executor (incidentes, sem bypass). Evento 'handoff' no trace, renderizado no 'ver racíoconio'. Rota 'team', teto 8"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Orquestração Supervisionada de Especialistas via Blackboard (Priority: P1)

Como operador de produção ou engenheiro de confiabilidade (SRE) gerenciando uma crise ou instabilidade complexa, quero acionar um time coordenado de agentes especializados onde um supervisor central toma decisões de delegação usando saída estruturada com `{ next, brief }` sobre um quadro compartilhado de trabalho (*blackboard*), para que tarefas de triagem, planejamento e intervenção em incidentes sejam conduzidas com rigor, separação clara de responsabilidades e sem contaminação de contexto.

**Why this priority**: É o núcleo funcional da feature. Sistemas monolíticos de agente único sofrem de perda de foco e alucinação de ações em incidentes complexos. A separação por papéis especializados orquestrados centralmente eleva drasticamente a assertividade operacional.

**Independent Test**:
1. Submeter uma solicitação de incidente complexo para o modo equipe via rota `team`.
2. Verificar no estado consolidado se as informações coletadas pelo analista foram inseridas no blackboard, se o plano foi desenhado pelo planejador sem uso de ferramentas e se as modificações foram realizadas unicamente pelo executor.
3. Confirmar que as decisões de próximo agente e resumo de instrução foram geradas no formato estruturado `{ next, brief }`.

**Acceptance Scenarios**:
1. **Given** uma solicitação operacional recebida no modo equipe,  
   **When** o supervisor for acionado no ciclo inicial,  
   **Then** ele deve analisar o estado inicial do blackboard e emitir uma decisão estruturada contendo `next` (indicando o próximo especialista ou término) e `brief` (instruções concisas para a etapa).
2. **Given** uma transição decidida pelo supervisor,  
   **When** o agente de destino for ativado,  
   **Then** ele deve ler o conteúdo consolidado do blackboard e limitar sua atuação estritamente ao seu contrato de papel.
3. **Given** a finalização de todas as etapas necessárias da triagem e tratamento do incidente,  
   **When** o supervisor avaliar que o objetivo do usuário foi cumprido,  
   **Then** ele deve selecionar `next: "FINISH"` com um `brief` de síntese final que será entregue como resposta ao operador.

---

### User Story 2 - Especialização Rígida de Papéis sem Desvio de Função (Priority: P1)

Como arquiteto de confiabilidade da plataforma OpsPilot, quero garantir que cada agente do time possua restrições inquebráveis de capacidade operacional:
- **Analista (`analyst`)**: restrito a ferramentas de somente leitura (inspeção de métricas, runbooks, alertas, histórico e status de serviços), proibido de emitir planos de ação ou executar mutações;
- **Planejador (`planner`)**: puramente reflexivo e sintetizador, sem nenhuma ferramenta externa (*zero-tools*), encarregado de estruturar planos táticos com base nos fatos coletados pelo analista;
- **Executor (`executor`)**: habilitado exclusivamente para ferramentas de incidentes (abertura, atualização, mitigação oficial), operando estritamente através das validações de domínio e sem nenhum desvio (*no bypass*).

**Why this priority**: Segurança e governança operacional. Evita que o analista altere produção inadvertidamente, que o planejador gaste tokens com invocações desnecessárias ou que o executor aja sem validação de domínio.

**Independent Test**:
1. Invocar o analista diante de um cenário com problemas e verificar que nenhuma ferramenta de criação/atualização/escrita é disponibilizada ou acionada.
2. Invocar o planejador e inspecionar a ausência de definições de tools no seu modelo, garantindo geração pura de raciocínio.
3. Invocar o executor tentando parâmetros inválidos de incidentes e assegurar que as validações Zod e regras de domínio barrem qualquer tentativa de bypass.

**Acceptance Scenarios**:
1. **Given** o agente Analista em execução,  
   **When** inspecionando o ambiente,  
   **Then** ele deve ter acesso somente a ferramentas de leitura (`list_services`, `get_service_status`, `list_alerts`, `read_runbook`, `search_incidents`) e gravar apenas fatos objetivos no blackboard, sem prescrever recomendações ou planos de intervenção.
2. **Given** o agente Planejador em execução,  
   **When** construindo a estratégia de mitigação,  
   **Then** ele não deve possuir nenhuma ferramenta atrelada ao seu modelo, gerando o plano de ação passo a passo com base estrita nas evidências contidas no blackboard.
3. **Given** o agente Executor em execução,  
   **When** operando sobre incidentes,  
   **Then** ele deve possuir apenas ferramentas de gestão de incidentes e suas chamadas devem ser submetidas obrigatoriamente às validações de schema e domínio, sem mecanismos de contorno ou execução direta de ações não catalogadas.

---

### User Story 3 - Rastreabilidade Granular via Evento "handoff" no Trace (Priority: P1)

Como engenheiro de operações investigando um atendimento, quero que cada passagem de bastão decidida pelo supervisor gere imediatamente um evento persistido do tipo `handoff` na linha do tempo da requisição, contendo o agente emissor, o agente receptor, a instrução (`brief`) e o número da iteração, para auditoria completa e análise pós-incidente.

**Why this priority**: Auditabilidade e conformidade com o Princípio V da constituição (efeitos isolados e rastreáveis) e a especificação de tracing existente (`013-trace-persistence`).

**Independent Test**:
1. Executar um fluxo de equipe que passe por Supervisor → Analista → Supervisor → Planejador → Supervisor → Executor → Supervisor.
2. Consultar o endpoint de trace ou inspecionar os eventos gerados da requisição.
3. Verificar a presença dos eventos com `kind: "handoff"`, checando `from`, `to`, `brief` e a consistência cronológica dos timestamps.

**Acceptance Scenarios**:
1. **Given** a tomada de decisão do supervisor delegando para um especialista,  
   **When** o nó de supervisão concluir seu passo,  
   **Then** um evento com `kind: "handoff"` deve ser adicionado ao trace com o payload contendo `from: "supervisor"`, `to: "[especialista]"`, `brief: "[conteúdo do brief]"` e o número da iteração atual.
2. **Given** o especialista concluindo sua atribuição e devolvendo o controle ao supervisor,  
   **When** o controle retornar ao fluxo central,  
   **Then** deve ser registrado o handoff de retorno documentando a devolução das conclusões para o blackboard.
3. **Given** a persistência de traces em SQLite,  
   **When** os eventos forem gravados no banco,  
   **Then** o evento de `handoff` deve ser serializado e indexado permitindo recuperação via API de histórico.

---

### User Story 4 - Renderização Dedicada de Handoffs no "Ver Raciocínio" da UI Web (Priority: P2)

Como operador utilizando o War Room Web, quero abrir a gaveta "Ver Raciocínio" e visualizar claramente as transições de equipe com um cartão visual destacado de `HANDOFF`, evidenciando a passagem de bastão (ex: `SUPERVISOR → ANALYST`), o objetivo do handoff e o momento da transição, para que a colaboração entre os agentes seja visualmente intuitiva e compreensível em tempo real.

**Why this priority**: Experiência do usuário (UX). Permite aos operadores acompanharem visualmente o trabalho colaborativo sem precisar inspecionar JSON bruto.

**Independent Test**:
1. Abrir o War Room Web em um chamado respondido pela equipe.
2. Clicar no botão "Ver Raciocínio" da mensagem.
3. Inspecionar os nós da timeline e garantir que eventos de `handoff` exibam o badge roxo/azul de handoff, a indicação de direção e o card formatado do brief.

**Acceptance Scenarios**:
1. **Given** a gaveta de raciocínio aberta exibindo os eventos da requisição,  
   **When** a lista percorrer um evento cujo `kind` ou `type` seja `"handoff"`,  
   **Then** o marcador visual deve exibir um badge distintivo `HANDOFF` com estilização diferenciada em relação a `thought` ou `action`.
2. **Given** o payload de um evento de `handoff`,  
   **When** renderizado no corpo do passo,  
   **Then** deve exibir o fluxo direcional `{from} ➔ {to}` e o texto do `{brief}` em destaque legível.

---

### User Story 5 - Teto de Segurança de 8 Iterações e Rota "team" (Priority: P1)

Como responsável pela infraestrutura e custos operacionais, quero que a rota `team` aplique um teto rígido e inviolável de no máximo 8 iterações de supervisão por requisição, garantindo que loops de delegação sejam interrompidos preventivamente e que o sistema entregue uma resposta conclusiva com as informações consolidadas até aquele ponto.

**Why this priority**: Prevenção de loop infinito, estouro de orçamento de tokens e exaustão de contexto do modelo. Proteção essencial de confiabilidade para sistemas multiagente.

**Independent Test**:
1. Simular ou disparar uma solicitação ambígua ou cíclica na rota `team`.
2. Contar as iterações executadas pelo grafo de equipe.
3. Assegurar que ao atingir a 8ª iteração o grafo seja finalizado obrigatoriamente (`END`), sem efetuar a 9ª chamada ao supervisor, e que uma mensagem explicativa do encerramento por teto seja incluída na resposta.

**Acceptance Scenarios**:
1. **Given** uma requisição encaminhada para a rota `team`,  
   **When** o contador de iterações do supervisor atingir 8 sem ter emitido `FINISH`,  
   **Then** o grafo deve encerrar a execução imediatamente e compor a resposta com base no último estado do blackboard.
2. **Given** a finalização por atingimento do teto de 8 passos,  
   **When** o trace for registrado,  
   **Then** deve constar uma advertência explícita indicando encerramento por limite de segurança de turnos da equipe.
3. **Given** a seleção de estratégias no roteador operacional ou na requisição HTTP (`strategyOverride: "team"` ou rota automática para pedidos de incidentes multifuncionais),  
   **When** a rota for selecionada,  
   **Then** o grafo de equipe em `src/team/` deve ser o executor exclusivo da requisição.

---

## Edge Cases

- **Supervisor emitir especialista inexistente**: O schema Zod de `withStructuredOutput` deve rejeitar nomes fora de `["analyst", "planner", "executor", "FINISH"]` e realizar retry ou fallback seguro para encerramento.
- **Especialista falhar durante a chamada de modelo ou ferramenta**: A falha deve ser gravada no blackboard como erro operacional e devolvida ao supervisor, permitindo que ele replaneje ou encerre graciosamente.
- **Blackboard vazio ao chamar o planejador**: Se o supervisor chamar o planejador antes de haver achados no blackboard, o planejador deve sinalizar no blackboard a ausência de evidências para que o supervisor convoque o analista.
- **Tentativa de mutação de incidente sem parâmetros válidos**: As tools do executor devem validar via Zod; se inválidos, o erro é registrado no blackboard para correção, sem propagar exceptions não tratadas.
- **Supervisor selecionar `FINISH` na primeira iteração**: Permitido caso a pergunta do usuário seja resolúvel diretamente ou fora do escopo de incidentes, gerando o trace com apenas 1 handoff de conclusão.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST implementar o módulo de equipe em `src/team/` utilizando `StateGraph` do LangGraph com um estado compartilhado que contenha um objeto `blackboard`.
- **FR-002**: O `blackboard` no estado MUST conter os campos essenciais para coordenação: contexto inicial da requisição, achados da análise (`findings`), plano de ação (`plan`), ações executadas (`actions`), histórico de briefs e contador de iterações.
- **FR-003**: O nó Supervisor MUST utilizar `model.withStructuredOutput` com schema Zod rigoroso exigindo:
  - `next`: enum de opções estritas `["analyst", "planner", "executor", "FINISH"]`;
  - `brief`: string descritiva com a instrução clara para o próximo agente ou síntese de conclusão.
- **FR-004**: O agente Analista (`analyst`) MUST possuir acesso exclusivamente a ferramentas de leitura e consulta, sendo expressamente proibido de conter ferramentas que realizem escrita, mutação ou encerramento de dados.
- **FR-005**: O agente Analista MUST gravar suas descobertas no `blackboard` e abster-se de gerar planos de mitigação ou propor ações corretivas.
- **FR-006**: O agente Planejador (`planner`) MUST ser instanciado sem nenhuma ferramenta vinculada (*zero tools*), operando puramente sobre os dados presentes no `blackboard` para formular a estratégia passo a passo.
- **FR-007**: O agente Executor (`executor`) MUST ter acesso apenas a ferramentas relativas ao ciclo de vida de incidentes operacionais (`create_incident`, `update_incident`, etc.), com todas as chamadas submetidas a validação por schemas Zod na fronteira, proibindo qualquer modo bypass.
- **FR-008**: O sistema MUST emitir e registrar um evento de trace com `kind: "handoff"` a cada transição decidida pelo supervisor, contendo:
  - `from`: agente de origem (ex: `"supervisor"`);
  - `to`: agente de destino (ex: `"analyst"`, `"planner"`, `"executor"`, `"user"` / `"FINISH"`);
  - `brief`: texto da diretriz ou resumo da transição;
  - `iteration`: contador do turno atual da equipe (1 a 8).
- **FR-009**: O tipo `TraceEventKind` em `src/agents/types.ts` e contratos correlatos MUST incluir a variante `'handoff'`.
- **FR-010**: A gaveta de raciocínio da interface Web (`TraceDrawer.tsx`) e o arquivo de estilos MUST renderizar os eventos de `handoff` com destaque visual específico, incluindo badge indicativo, direção de transferência e conteúdo legível do brief.
- **FR-011**: O orquestrador da equipe MUST impor um teto de segurança inegociável de 8 iterações do supervisor. Caso o teto seja atingido sem a emissão de `FINISH`, o grafo MUST transicionar para finalização forçada e compor uma resposta com o que foi apurado até o momento.
- **FR-012**: O sistema MUST disponibilizar a rota `"team"` no grafo de produção e na API HTTP de chat, permitindo execução sob demanda ou via `strategyOverride: "team"`.

---

### Key Entities

- **TeamState**: Estado do grafo de equipe mantendo as mensagens de conversa, o objeto `blackboard`, o identificador do próximo nó (`next`), o último `brief`, a contagem de turnos (`iterationCount`) e a lista acumulada de eventos de trace.
- **Blackboard**: Estrutura compartilhada que centraliza:
  - `task`: descrição da demanda original do usuário;
  - `findings`: fatos, logs e status de serviços observados pelo Analista;
  - `plan`: etapas de resolução propostas pelo Planejador;
  - `executionResults`: registros das mutações de incidentes efetivadas pelo Executor;
  - `status`: estado geral do fluxo (`"triaging"`, `"planning"`, `"executing"`, `"completed"`, `"exhausted"`).
- **SupervisorDecision**: Saída estruturada do supervisor validada por Zod `{ next: "analyst" | "planner" | "executor" | "FINISH", brief: string }`.
- **HandoffTraceEvent**: Evento especializado de rastreabilidade registrando a passagem de contexto entre dois nós do sistema.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das transições entre o supervisor e os agentes especializados geram eventos de trace com `kind: "handoff"` contendo origem, destino e brief legível.
- **SC-002**: 100% das requisições executadas no modo equipe encerram em no máximo 8 iterações do supervisor, sem ocorrência de loops infinitos sob qualquer teste de estresse.
- **SC-003**: 0% de ocorrência de chamadas a ferramentas de mutação pelo Analista e 0 chamadas de ferramentas pelo Planejador.
- **SC-004**: O painel "Ver Raciocínio" da interface exibe o badge visual de `HANDOFF` e permite a inspeção rápida de todas as transições com latência de renderização imperceptível para o usuário.
- **SC-005**: Cobertura de testes unitários e de integração cobrindo os 3 papéis, as validações de fronteira, o teto de iterações e a emissão do trace de handoff.

---

## Assumptions

- O ambiente possui suporte nativo ao `withStructuredOutput` fornecido pelo wrapper de modelos do LangChain/OpenRouter já configurado no projeto.
- As ferramentas de leitura de serviços, alertas e incidentes já consolidadas em `src/agents/tools.ts` podem ser segregadas e reutilizadas pelos agentes especializados sem necessidade de novos adaptadores externos.
- O limite de 8 iterações é suficiente para fluxos típicos de incidentes (ex: 1 supervisor + 1 analista + 1 supervisor + 1 planejador + 1 supervisor + 1 executor + 1 supervisor = 7 passos).
- A persistência dos eventos de `handoff` segue a mesma infraestrutura SQLite (`TraceStore`) existente, compatível com o payload flexível já suportado.
