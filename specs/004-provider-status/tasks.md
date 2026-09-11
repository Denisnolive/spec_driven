---
description: "Task list for provider status tool implementation"
---

# Tasks: Tool de Status de Provedores Externos (`check_provider_status`)

**Input**: Design documents from `/specs/004-provider-status/`

**Prerequisites**: [spec.md](./spec.md)

**Tests**: Testes são obrigatórios nesta feature — a Constitution (Princípio IV, Test-First) e a spec (SC-001) exigem cobertura unitária determinística antes de qualquer commit. Todos os testes usam `node:test` via `tsx`, sem rede (função `fetch` injetada com mock/fake).

**Organization**: Tarefas agrupadas por fases e user story (US1–US3, conforme prioridade em spec.md) para permitir implementação e validação incrementais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3
- Caminhos de arquivo exatos incluídos em cada descrição

---

## Phase 1: Setup & Contracts

**Purpose**: Definir schemas Zod, tipos de retorno e URLs dos provedores em `src/agents/tools.ts`.

- [x] T001 Definir URLs públicas dos provedores em constante `PROVIDER_STATUS_URLS = { github: 'https://www.githubstatus.com/api/v2/status.json', cloudflare: 'https://www.cloudflarestatus.com/api/v2/status.json' }` em `src/agents/tools.ts`
- [x] T002 Definir schema de resposta Zod `ProviderStatusResponseSchema = z.object({ status: z.object({ indicator: z.string(), description: z.string() }) })` em `src/agents/tools.ts`
- [x] T003 [P] Atualizar união `ToolName` em `src/agents/tools.ts` para incluir `'check_provider_status'`

**Checkpoint**: Schemas, contratos e mapeamento de URLs definidos sem quebrar o build.

---

## Phase 2: Core Resilience Logic & Fetch Injector

**Purpose**: Implementar a lógica de consulta resiliente com timeout de 5s, retry único em falhas de rede/5xx e injeção de fetch.

- [x] T004 Implementar mecanismo de injeção de fetch (`setFetchFn(fn)` e `getFetchFn()`) com fallback para `globalThis.fetch` em `src/agents/tools.ts`
- [x] T005 Implementar helper interno `queryProviderStatus(provider: 'github' | 'cloudflare', fetchFn: typeof fetch): Promise<string>` em `src/agents/tools.ts`:
  - Utiliza `AbortSignal.timeout(5000)` para controle de timeout.
  - Executa até 2 tentativas (1 tentativa + 1 retry em caso de erro de rede, timeout ou status HTTP >= 500).
  - Valida o payload JSON via `ProviderStatusResponseSchema`.
  - Em caso de sucesso, retorna string compacta de 1 linha: `[<provider>] status: <indicator> - <description>`.
  - Em caso de falha final, retorna observação de erro legível (ex: `Erro ao consultar status do provedor <provider>: <motivo>`), NUNCA lançando exceção.

**Checkpoint**: Lógica de consulta, resiliência e tratamento de erro isolada e pronta para integração com a ferramenta LangChain.

---

## Phase 3: Tool Implementation & Factory Integration (US1 & US3)

**Purpose**: Construir a tool `check_provider_status` seguindo as 6 regras de prompt engineering e integrá-la na fábrica `createOpsTools` e no array `opsTools`.

- [x] T006 [US1] Implementar a ferramenta `checkProviderStatusTool` com schema Zod `provider: z.enum(['github', 'cloudflare']).default('github').describe(...)` e descrição orientada a "quando usar" (suspeita de problemas externos / "é nosso ou do provedor?") dentro de `createOpsTools(store, options?: { fetchFn?: typeof fetch })` em `src/agents/tools.ts`
- [x] T007 [US1] Exportar `checkProviderStatus` conectado ao `activeFetch` no nível do módulo em `src/agents/tools.ts`
- [x] T008 [US1] Adicionar `checkProviderStatus` aos arrays `opsTools` e `tools` em `src/agents/tools.ts`

**Checkpoint**: A ferramenta está exposta e disponível para todos os agentes e consumidores.

---

## Phase 4: Test Suite (US1, US2, US3)

**Purpose**: Escrever testes determinísticos com fake fetch cobrindo todos os cenários de sucesso, erro, timeout e retry.

- [x] T009 [P] [US1] Escrever teste em `src/agents/tools.test.ts`: consulta de sucesso para `github` retornando formato compacto `[github] status: none - All Systems Operational`
- [x] T010 [P] [US1] Escrever teste em `src/agents/tools.test.ts`: consulta de sucesso para `cloudflare` retornando formato compacto `[cloudflare] status: none - All Systems Operational`
- [x] T011 [P] [US1] Escrever teste em `src/agents/tools.test.ts`: chamada sem parâmetro usa `github` por padrão
- [x] T012 [P] [US2] Escrever teste em `src/agents/tools.test.ts`: recuperação com sucesso no retry após falha inicial transitória (HTTP 500 ou erro de rede)
- [x] T013 [P] [US2] Escrever teste em `src/agents/tools.test.ts`: timeout de 5s simulado retorna observação de erro legível sem lançar exceção
- [x] T014 [P] [US2] Escrever teste em `src/agents/tools.test.ts`: resposta com JSON fora do schema Zod retorna observação de erro de validação sem lançar exceção
- [x] T015 [P] [US2] Escrever teste em `src/agents/tools.test.ts`: falha persistente (2 tentativas com erro) retorna mensagem de erro sem lançar exceção

**Checkpoint**: `npm test` executa 100% verde com cobertura completa de cenários sem acesso à rede.

---

## Phase 5: Verification & Review

**Purpose**: Validação final estática e execução completa dos testes de regressão.

- [x] T016 Executar `npm run typecheck` e garantir 0 erros de tipagem TypeScript
- [x] T017 Executar `npm test` e verificar todas as suites verdes (store, tools, server, reflection, types)
