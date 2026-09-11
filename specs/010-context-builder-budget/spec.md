# Feature Specification: ContextBuilder com Orçamento por Seção (Context Budgeting)

**Feature Branch**: `010-context-builder-budget`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "ContextBuilder com orçamento por seção: src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*: system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memórias 300 (corta menor score). Teste: tetos baixos cortam na ordem certa"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montagem Unificada de Prompt com Orçamento por Seção (Priority: P1)

Como desenvolvedor ou operador do agente OpsPilot, quero que a montagem de contexto e prompts de todas as estratégias de raciocínio (ReAct, Plan-and-Execute, Reflection) seja centralizada em um `ContextBuilder` (`src/context/context-builder.ts`), aplicando limites estritos de tokens por seção configuráveis via variáveis de ambiente (`CONTEXT_BUDGET_*`), de modo que o modelo nunca estoure a janela de contexto nem consuma tokens desnecessários com dados irrelevantes.

**Why this priority**: É o núcleo da estabilidade do agente. Sem uma gestão centralizada de orçamento, cada estratégia ou endpoint lida com histórico, memórias e resumos de forma divergente ou desregulada, correndo o risco de estouro de tokens ou degradação da latência.

**Independent Test**: Testável unitariamente em `src/context/context-builder.test.ts`:
1. Instanciar o `ContextBuilder` com seções completas (system, mensagem do usuário, resumo prévio, histórico de 20 turnos e 5 memórias semânticas).
2. Verificar que as seções são formatadas de maneira padronizada e que as variáveis de ambiente `CONTEXT_BUDGET_*` definem os tetos máximos efetivos.
3. Obter as mensagens estruturadas para o modelo e verificar que todas as estratégias utilizam a mesma representação de contexto.

**Acceptance Scenarios**:
1. **Given** um conjunto completo de entradas de contexto (system prompt, mensagem do usuário, resumo, histórico e memórias) cujos tamanhos estão dentro dos tetos padrão,  
   **When** `ContextBuilder.build()` é invocado,  
   **Then** o prompt gerado contém todas as seções íntegras, sem nenhum item descartado, e o breakdown de tokens reflete a alocação de cada seção.

2. **Given** as variáveis de ambiente `CONTEXT_BUDGET_SUMMARY=200`, `CONTEXT_BUDGET_WINDOW=1200` e `CONTEXT_BUDGET_MEMORIES=300` (ou valores customizados),  
   **When** o `ContextBuilder` inicializa sem overrides explícitos,  
   **Then** esses valores são carregados como tetos de orçamento para cada seção correspondente.

---

### User Story 2 - Poda Determinística de Janela de Histórico e Memórias Semânticas (Priority: P1)

Como sistema de gestão de contexto, quero que, quando o volume de tokens de uma seção ultrapassar o teto configurado, a poda ocorra estritamente segundo as regras prioritárias de cada seção:
- `system` e `mensagem`: intocáveis (nunca sofrem corte).
- `janela de histórico` (`window`/`history`): corta as mensagens mais antigas primeiro (preservando o contexto mais recente, FIFO pruning).
- `memórias semânticas` (`memories`): corta as memórias com menor score de similaridade/relevância primeiro (preservando as mais relevantes).
- `resumo` (`summary`): compacta ou trunca no limite de 200 tokens caso exceda o orçamento.

**Why this priority**: A ordem correta de descarte é vital para o raciocínio do agente. O histórico recente mantém a continuidade da conversa, e as memórias com maior pontuação vetorial são as mais pertinentes à dúvida atual do usuário.

**Independent Test**: Testável com cenários de "tetos baixos" em `src/context/context-builder.test.ts`:
1. Configurar teto de histórico baixo (ex: 50 tokens) com uma sequência de mensagens com timestamps crescentes; validar que apenas as mensagens mais recentes permanecem no contexto final.
2. Configurar teto de memórias baixo (ex: 30 tokens) com lista de memórias com scores distintos (ex: 0.95, 0.72, 0.40); validar que as de menor score são eliminadas primeiro até caber no orçamento.
3. Forçar teto baixo de resumo e validar contenção a 200 tokens (ou valor da env).
4. Submeter `system` longo e `mensagem` longa e comprovar que nenhuma das duas sofre corte mesmo com tetos restritivos.

**Acceptance Scenarios**:
1. **Given** um histórico de 10 mensagens totalizando 500 tokens e um teto de histórico configurado para 150 tokens,  
   **When** o contexto é montado pelo `ContextBuilder`,  
   **Then** as mensagens mais antigas são descartadas em ordem cronológica até que a soma dos tokens das mensagens restantes seja menor ou igual a 150 tokens.

2. **Given** 4 memórias semânticas com scores [0.92, 0.85, 0.65, 0.41] e um teto de memórias configurado para permitir apenas 2 memórias,  
   **When** o contexto é montado,  
   **Then** as memórias de scores 0.41 e 0.65 são podadas primeiro, permanecendo as memórias de scores 0.92 e 0.85.

3. **Given** um system prompt e uma mensagem de usuário de qualquer extensão,  
   **When** o contexto é montado sob qualquer configuração de orçamento,  
   **Then** ambos são preservados de forma 100% integral no payload enviado ao modelo.

---

### User Story 3 - Adoção Universal do ContextBuilder em Todas as Estratégias e Endpoints (Priority: P2)

Como engenheiro mantendo a arquitetura do OpsPilot, quero que o `server.ts` e todas as estratégias de raciocínio (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`) deleguem a montagem e poda de prompt para o `ContextBuilder`, eliminando lógicas ad-hoc de concatenação e garantindo consistência em toda a aplicação.

**Why this priority**: Evita duplicação de código e impede discrepâncias onde uma estratégia respeita o teto de tokens mas outra estoura a janela do LLM.

**Independent Test**: Testável via testes de integração e unitários existentes das estratégias (`react.test.ts`, `plan-and-execute.test.ts`, `server.test.ts`):
1. Verificar que as chamadas a `strategy.run` recebem o contexto preparado pelo `ContextBuilder`.
2. Verificar que `metrics.contextBreakdown` e `metrics.totalTokens` no `/chat` batem com as medições orçamentárias produzidas pelo `ContextBuilder`.

**Acceptance Scenarios**:
1. **Given** uma requisição para `POST /chat`,  
   **When** o servidor prepara a execução da estratégia configurada,  
   **Then** o `ContextBuilder` é invocado para processar system prompt, memórias, resumo e histórico sob os limites de `CONTEXT_BUDGET_*`, repassando a estrutura podada para a estratégia.

2. **Given** a execução de qualquer estratégia (ReAct, Plan-and-Execute ou Reflection),  
   **When** o modelo é acionado,  
   **Then** as mensagens enviadas ao LLM respeitam integralmente os tetos de cada seção.

---

## Edge Cases

- **Teto configurado como zero ou negativo**: Se uma variável de ambiente `CONTEXT_BUDGET_*` for definida com `<= 0` ou valor inválido (não numérico), o sistema deve recorrer com segurança ao valor padrão documentado (resumo: 200, janela: 1200, memórias: 300) ou desativar a seção de forma elegante caso zero seja intencional.
- **Nenhuma mensagem de histórico cabe no teto**: Se até a mensagem mais recente do histórico exceder individualmente o teto de janela, o histórico fica vazio (0 mensagens), garantindo que `system` e a `mensagem atual` continuem funcionando sem falha.
- **Memórias com mesmo score**: Critério de desempate determinístico (ordem de inserção / preservação da memória mais recente ou de maior ID).
- **Resumo vazio ou ausente**: A seção de resumo é omitida do prompt sem consumir tokens e sem produzir cabeçalhos vazios.
- **Concorrência ou múltiplas requisições simultâneas**: `ContextBuilder` deve ser stateless ou operar como função/classe pura, não retendo estado mutável compartilhado entre requisições.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST fornecer o componente `ContextBuilder` em `src/context/context-builder.ts` com tipagem estrita TypeScript ESM.
- **FR-002**: O `ContextBuilder` MUST ler as configurações de orçamento padrão a partir de variáveis de ambiente do processo:
  - `CONTEXT_BUDGET_SUMMARY`: teto em tokens para o resumo (padrão: 200).
  - `CONTEXT_BUDGET_WINDOW` ou `CONTEXT_BUDGET_HISTORY`: teto em tokens para a janela de histórico (padrão: 1200).
  - `CONTEXT_BUDGET_MEMORIES`: teto em tokens para as memórias semânticas (padrão: 300).
- **FR-003**: O `ContextBuilder` MUST permitir a passagem de overrides opcionais de orçamento durante sua instanciação ou invocação, facilitando testes parametrizados com tetos baixos.
- **FR-004**: O `ContextBuilder` MUST garantir que o `system prompt` e a `mensagem atual do usuário` são intocáveis e nunca sofrem corte ou truncamento por política orçamentária.
- **FR-005**: Ao exceder o teto da janela de histórico, o sistema MUST podar as mensagens mais antigas primeiro (ordem cronológica crescente, FIFO pruning), mantendo as mensagens mais recentes que couberem no teto.
- **FR-006**: Ao exceder o teto de memórias semânticas, o sistema MUST podar primeiro as memórias com menor score de similaridade/relevância, mantendo as memórias de maior score que couberem no teto.
- **FR-007**: Ao exceder o teto de resumo, o sistema MUST garantir que o conteúdo do resumo seja ajustado/truncado de forma limpa para não ultrapassar o orçamento máximo de tokens estipulado.
- **FR-008**: O `ContextBuilder` MUST gerar como saída tanto a lista padronizada de mensagens (`BaseMessage[]` ou mensagens tipadas `{ role, content }`) quanto o detalhamento de tokens (`ContextBreakdown`), além de metadados com as contagens de itens podados (`prunedMessagesCount`, `prunedMemoriesCount`).
- **FR-009**: Todas as estratégias de raciocínio (`ReActStrategy`, `PlanAndExecuteStrategy`, `ReflectionStrategy`) e o endpoint HTTP (`src/http/server.ts`) MUST utilizar o `ContextBuilder` para a montagem de seus prompts.
- **FR-010**: A suíte de testes unitários em `src/context/context-builder.test.ts` MUST testar exaustivamente que tetos baixos cortam histórico e memórias na ordem especificada e mantêm system e mensagem intactos.

---

### Key Entities

- **ContextBudgetConfig**: Objeto de configuração contendo os limites de tokens para cada seção (`summary: number`, `history: number`, `memories: number`).
- **ContextBuilderInput**: Entradas recebidas pelo builder:
  - `systemPrompt?: string` (instruções do sistema, intocável)
  - `message: string` (mensagem atual do usuário, intocável)
  - `history?: Array<{ role: 'user' | 'assistant'; content: string }>` (mensagens anteriores)
  - `memories?: Array<{ fact: string; score?: number }>` (memórias semânticas com scores)
  - `summary?: string | null` (resumo anterior compactado)
  - `budget?: Partial<ContextBudgetConfig>` (overrides opcionais de teto)
- **BuiltContext**: Saída consolidada produzida pelo builder:
  - `messages`: Mensagens formatadas para o modelo LLM
  - `promptMessage`: Mensagem ou bloco consolidado de prompt (caso necessário para compatibilidade)
  - `breakdown`: `ContextBreakdown` contendo os tokens calculados por seção
  - `stats`: Estatísticas de poda (`originalHistoryCount`, `includedHistoryCount`, `prunedHistoryCount`, `originalMemoriesCount`, `includedMemoriesCount`, `prunedMemoriesCount`)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O `ContextBuilder` garante 100% de conformidade orçamentária: sob qualquer volume de histórico ou memórias fornecido, o número de tokens alocado para histórico nunca ultrapassa o teto configurado (1200 padrão) e para memórias nunca ultrapassa o teto configurado (300 padrão).
- **SC-002**: Em testes com tetos baixos (ex: teto para 1 mensagem ou 1 memória), a taxa de acerto na ordem de corte é de 100% (a mensagem descartada é invariavelmente a mais antiga e a memória descartada é invariavelmente a de menor score).
- **SC-003**: 100% das mensagens de sistema e mensagens atuais do usuário permanecem intactas (0% de perda ou corte em system e message).
- **SC-004**: 100% dos testes unitários e de integração (`npm test`) e checagem de tipos (`npm run typecheck`) executam com sucesso, sem regressões nas suítes existentes.

---

## Assumptions

- A estimativa de tokens continua baseada na heurística já validada pelo projeto em `src/context/tokens.ts` (`estimateTokens`, chars / 4) para cálculo ágil e previsível em memória.
- As variáveis de ambiente `CONTEXT_BUDGET_*` usam prefixo padronizado: `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW` (com fallback para `CONTEXT_BUDGET_HISTORY`), `CONTEXT_BUDGET_MEMORIES`.
- O cálculo de score de memórias semânticas provém do `SqliteMemoryStore.recall()`, que já calcula similaridade por produto escalar / cosseno retornando `score` numérico. Caso uma memória seja fornecida sem score explícito, adota-se um score neutro de fallback (ex: 0.0).
