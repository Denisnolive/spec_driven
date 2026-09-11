# Implementation Plan: Tool de Status de Provedores Externos (`check_provider_status`)

**Branch**: `004-provider-status` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-provider-status/spec.md`

## Summary

Adicionar a ferramenta operacional `check_provider_status` em `src/agents/tools.ts` que permite ao agente consultar o status operacional de provedores externos essenciais (GitHub e Cloudflare) através de suas StatusPages públicas (API `statuspage.io`). A ferramenta possui resiliência com timeout estrito de 5 segundos via `AbortSignal.timeout(5000)`, exatamente 1 nova tentativa em falhas de rede ou HTTP 5xx, validação do payload com Zod (`{ status: { indicator, description } }`), retorno compacto de uma única linha (`[<provider>] status: <indicator> - <description>`) e tratamento seguro de erros como observação para a LLM (nunca propagando exceções não tratadas). O mecanismo de `fetch` é injetável para garantir testes 100% determinísticos sem chamadas externas à internet.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, ESM (`"type": "module"`, `strict: true`)

**Primary Dependencies**: `@langchain/core` (`tool`), `zod` (validação de entrada e parsing da resposta da API StatusPage)

**Storage**: N/A (a ferramenta consulta status de rede e não persiste no SQLite)

**Testing**: `node:test` via `tsx` (`node --import tsx --test`), 100% determinístico — função `fetch` injetável via mocks nos testes unitários em `src/agents/tools.test.ts`

**Target Platform**: Agentes ReAct e Plan-and-Execute, servidor HTTP (`POST /chat`), CLI (`src/arena.ts`, `src/index.ts`)

**Project Type**: single project — atualização em `src/agents/tools.ts` e `src/agents/tools.test.ts`

**Performance Goals**: Latência máxima de 5s por tentativa (timeout estrito); retorno compacto de 1 linha para economia de tokens no contexto da LLM

**Constraints**: Sem dependência de API Keys (endpoints públicos); 0% de exceções escapando da tool (erros retornam strings legíveis como observação); testes sem rede real

**Scale/Scope**: ~60 LOC em `src/agents/tools.ts` + ~80 LOC de testes em `src/agents/tools.test.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. TypeScript Estrito e ESM** — PASS. Código com tipagem estrita, imports `.js`, sem `any`, tipos Zod inferidos.
- **II. Validação na Fronteira (Zod)** — PASS. Validação de entrada dos parâmetros da tool (`provider: 'github' | 'cloudflare'`) e validação da resposta externa da StatusPage via `ProviderStatusResponseSchema`.
- **III. Arquitetura em Camadas (MVC)** — PASS. A ferramenta reside na camada de agentes/ferramentas (`src/agents/tools.ts`), isolando o efeito de I/O de rede e formatando a saída para consumo pelo raciocínio da LLM.
- **IV. Test-First** — PASS. Testes em `src/agents/tools.test.ts` cobrindo cenários de sucesso, default, retry, timeout de 5s simulado e schema inválido via fake fetch injetado.
- **V. Funções Puras e Efeitos Isolados** — PASS. Chamada HTTP isolada com `fetch` injetável; tratamento seguro de erros como observação.
- **VI. Gestão de Secrets** — PASS. Não utiliza secrets nem API keys (endpoints públicos).

**Resultado**: Nenhuma violação. Seção "Complexity Tracking" não aplicável.

## Project Structure

### Documentation (this feature)

```text
specs/004-provider-status/
├── plan.md              # Este arquivo
├── spec.md              # Especificação de requisitos da feature
└── tasks.md             # Lista de tarefas para execução
```

### Source Code (repository root)

```text
src/
└── agents/
    ├── tools.ts         # MODIFICADO — adiciona check_provider_status, ProviderStatusResponseSchema, injeção de fetch e resiliência
    └── tools.test.ts    # MODIFICADO — novos testes cobrindo sucesso, timeout, retry e payload inválido
```

## Complexity Tracking

*Nenhuma violação da Constitution Check — seção não aplicável.*
