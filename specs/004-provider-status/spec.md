# Feature Specification: Tool de Status de Provedores Externos (check_provider_status)

**Feature Branch**: `004-provider-status`  
**Created**: 2026-09-04  
**Status**: Draft  
**Input**: User description: "Tool de status de provedores externos: Tool check_provider_status em src/agents/tools.ts: consulta a statuspage pública do provedor via API statuspage.io (sem chave): github -> https://www.githubstatus.com/api/v2/status.json, cloudflare -> https://www.cloudflarestatus.com/api/v2/status.json; Parâmetro provider (enum: github | cloudflare, default 'github', .describe explicando); Descrição orientada a quando usar: suspeita de problema externo, 'é o nosso ou do provedor?', dependência fora do ar; Resiliência: timeout de 5s via AbortSignal.timeout; falha de rede ou 5xx, UMA nova tentativa; resposta validada com zod ({ status: { indicator, description } }); qualquer falha final retorna string de erro legível como resultado da tool (erro é observação - nunca lançar exceção para fora da tool); Retorno compacto (indicator + descrição, uma linha), para não inflar o contexto; Teste: a função de fetch é injetável; testes cobrem sucesso, timeout e resposta inválida sem uso de rede (fake fetch)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagnóstico de Falhas Externas via StatusPage Pública (Priority: P1)

Como agente autônomo de operações (OpsPilot), quero consultar rapidamente o status operacional de provedores externos essenciais (GitHub e Cloudflare) através da ferramenta `check_provider_status`, para determinar se uma instabilidade ou lentidão reportada é decorrente de indisponibilidade externa ou de problemas internos na nossa infraestrutura ("é nosso ou do provedor?").

**Why this priority**: É essencial para o diagnóstico de causa raiz do agente, evitando investigações redundantes e direcionando as ações corretivas para fallbacks quando o serviço terceiro estiver fora do ar.

**Independent Test**: Pode ser testado invocando a tool com `provider: 'github'` e `provider: 'cloudflare'` utilizando um fetch fake injetado e verificando a saída compacta de uma linha com o indicador e a descrição oficial do provedor.

**Acceptance Scenarios**:
1. **Given** um alerta de lentidão ou falha de build/deploy,  
   **When** o agente executa `check_provider_status({ provider: 'github' })`,  
   **Then** a tool consulta o endpoint `https://www.githubstatus.com/api/v2/status.json`, valida a resposta com schema Zod e retorna `[github] status: none - All Systems Operational`.

2. **Given** uma requisição sem parâmetro explícito de provider,  
   **When** a tool é executada com `{}` (default),  
   **Then** a consulta é direcionada para o provedor padrão `github`.

---

### User Story 2 - Resiliência com Timeout de 5s, Retry Único e Erro como Observação (Priority: P1)

Como engenheiro de confiabilidade, quero que a ferramenta `check_provider_status` possua timeout estrito de 5 segundos via `AbortSignal.timeout(5000)`, realize exatamente 1 nova tentativa em falhas transitórias (erros de rede ou respostas HTTP 5xx), valide o payload com Zod e NUNCA lance exceções não tratadas para fora da tool, retornando sempre uma mensagem de observação textual clara em caso de falha.

**Why this priority**: Erros lançados fora de ferramentas interrompem abruptamente o loop de raciocínio ReAct da LLM. Erros tratados como observação permitem que o agente compreenda a falha de comunicação e tome decisões alternativas.

**Independent Test**: Testável simulando via fake fetch: (1) timeout/abort, (2) falha 500 no primeiro request seguida de 200 no segundo (retry bem-sucedido), (3) erro 503 persistente resultando em mensagem de erro sem lançar exceção, e (4) payload JSON com formato inesperado.

**Acceptance Scenarios**:
1. **Given** uma chamada ao endpoint que excede 5 segundos,  
   **When** o `AbortSignal.timeout(5000)` é disparado,  
   **Then** a tool tenta 1 retry; se persistir o timeout, retorna string informativa de erro como observação legível (`Erro ao consultar status de <provider>: timeout de 5000ms excedido`).

2. **Given** uma falha de rede ou HTTP 500/502/503 no primeiro request,  
   **When** a tool executa o retry automático,  
   **Then** obtém sucesso na segunda tentativa e retorna o status normalmente.

3. **Given** uma resposta 200 OK cujo JSON não possua o schema `{ status: { indicator, description } }`,  
   **When** validado pelo schema Zod,  
   **Then** o parse falha e a tool retorna string de erro de schema (`Erro ao validar resposta do provedor <provider>: formato de dados inválido`).

---

### User Story 3 - Injeção de Dependência de Fetch para Testes Determinísticos (Priority: P2)

Como desenvolvedor, quero que a função `fetch` utilizada pela tool seja injetável (via `createOpsTools` e setters), para que 100% dos testes unitários e de integração rodem sem conexões reais de rede de forma rápida e determinística.

**Why this priority**: Garante conformidade com o princípio de isolamento de efeitos da Constituição do OpsPilot e evita flaky tests decorrentes de instabilidades reais na internet.

**Independent Test**: Testável passando um `fakeFetch` customizado para `createOpsTools(store, { fetchFn: fakeFetch })` e `setFetchFn(fakeFetch)`.

**Acceptance Scenarios**:
1. **Given** um ambiente de teste sem acesso à internet,  
   **When** os testes da tool são executados com `fakeFetch`,  
   **Then** todos os cenários de sucesso, erro HTTP, timeout e payload inválido são validados sem realizar chamadas de rede reais.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O módulo `src/agents/tools.ts` DEVE exportar a ferramenta `check_provider_status` (e disponibilizá-la no bundle `opsTools` / `tools` e na fábrica `createOpsTools`).
- **FR-002**: A ferramenta DEVE aceitar o schema Zod com o campo `provider`:
  ```typescript
  z.object({
    provider: z
      .enum(['github', 'cloudflare'])
      .default('github')
      .describe(
        "Nome do provedor externo para verificação de status: 'github' ou 'cloudflare' (default: 'github')"
      ),
  })
  ```
- **FR-003**: A descrição da ferramenta DEVE seguir rigorosamente as 6 regras de engenharia de prompt do projeto:
  - **Objetivo**: Consultar a statuspage pública do provedor externo.
  - **Quando usar**: Suspeita de problemas externos, dúvidas se a falha é interna ou de dependência externa ("é o nosso ou do provedor?"), APIs de terceiros indisponíveis ou degradadas.
  - **Quando não usar**: Para consultar alertas e serviços internos da aplicação (use `list_alerts` e `list_incidents`).
  - **Retorno**: String compacta de uma linha com o indicador e a descrição do provedor ou mensagem de erro explicativa.
- **FR-004**: Os endpoints públicos mapeados DEVEM ser:
  - `github`: `https://www.githubstatus.com/api/v2/status.json`
  - `cloudflare`: `https://www.cloudflarestatus.com/api/v2/status.json`
- **FR-005**: A requisição DEVE utilizar `AbortSignal.timeout(5000)` (timeout de 5 segundos).
- **FR-006**: Em caso de falha de rede (exceção no fetch / timeout) ou status HTTP 5xx (`status >= 500`), a ferramenta DEVE realizar EXATAMENTE 1 nova tentativa (retry) antes de desistir.
- **FR-007**: O payload retornado DEVE ser validado com Zod utilizando o schema:
  ```typescript
  const ProviderStatusResponseSchema = z.object({
    status: z.object({
      indicator: z.string(),
      description: z.string(),
    }),
  });
  ```
- **FR-008**: Em caso de sucesso, o retorno DEVE ser compacto em uma única linha no formato:
  `[<provider>] status: <indicator> - <description>`
  Exemplo: `[github] status: none - All Systems Operational`
- **FR-009**: Em caso de falha final (após retry, timeout, erro 4xx/5xx ou erro de schema), a tool DEVE retornar uma string de erro legível (ex: `Erro ao consultar status do provedor github: <motivo>`), NUNCA lançando exceção para fora do manipulador da tool.
- **FR-010**: A função `fetch` DEVE ser injetável através de `setFetchFn(customFetch)` e parâmetros em `createOpsTools`, com fallback padrão para o `globalThis.fetch` nativo.
- **FR-011**: O tipo `ToolName` em `src/agents/tools.ts` DEVE ser atualizado para incluir `'check_provider_status'`.
- **FR-012**: Deve ser criada suíte de testes em `src/agents/tools.test.ts` cobrindo:
  1. Consulta de sucesso para `github` e `cloudflare`.
  2. Uso do default `github` quando nenhum provider for fornecido.
  3. Recuperação com sucesso após 1 falha transitória (retry).
  4. Falha de timeout de 5s retornando observação de erro sem exceção.
  5. Resposta com JSON fora do schema Zod retornando mensagem de erro sem exceção.

---

## Success Criteria *(mandatory)*

- **SC-001**: `npm test` executa 100% verde incluindo os novos testes unitários da tool `check_provider_status`.
- **SC-002**: `npm run typecheck` conclui sem nenhum erro de tipagem no TypeScript.
- **SC-003**: 0% de exceções não tratadas escapando da tool `check_provider_status` durante falhas de rede, timeouts ou payloads corrompidos.
- **SC-004**: Saída compacta de 1 linha garantindo eficiência no consumo de tokens de contexto da LLM.
