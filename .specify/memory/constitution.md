<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Modified principles: III (Arquitetura em Camadas) e Stack & Padrões Técnicos (substituição de MySQL/Sequelize por SQLite nativo via node:sqlite DatabaseSync)
- Added sections: none
- Removed sections: none
- Templates requiring updates: none
- Follow-up TODOs: none
-->

# OpsPilot Constitution

## Core Principles

### I. TypeScript Estrito e ESM
Todo código roda em Node.js 22 LTS com TypeScript ESM (`"type": "module"`, `strict: true`
no `tsconfig.json`). MUST não introduzir `any` implícito nem desabilitar `strict`. Módulos
usam sintaxe `import`/`export` nativa — CommonJS (`require`) não é permitido no código-fonte.
**Racional**: tipagem estrita e ESM nativo evitam classes inteiras de erros em runtime e
mantêm o projeto alinhado com o ecossistema Node moderno.

### II. Validação na Fronteira (Zod)
Toda entrada externa — HTTP (Express), CLI, ou payload de agente — MUST ser validada por um
schema Zod antes de entrar na camada de serviço. Saídas expostas ao cliente também são
tipadas com Zod. Nenhuma lógica de negócio confia em dados não validados.
**Racional**: centralizar validação na borda evita repetição de checagens e torna os
contratos de dados explícitos e testáveis.

### III. Arquitetura em Camadas (MVC)
O código MUST seguir a separação `model/`, `service/`, `controller/` ou `store/`, `service/`, `controller/`.
Dependências fluem `http/cli → controller → service → model → store`. Controllers apenas conectam
Express + validação Zod de entrada e delegam para services; services concentram lógica de negócio pura;
stores implementam interfaces de persistência tipadas (`OpsStore`) utilizando SQLite nativo (`node:sqlite` / `DatabaseSync`)
com prepared statements sem SQL concatenado. Domínio não faz IO direto sem passar por contratos da store.
**Racional**: separação clara de responsabilidades facilita testes isolados, permite alternar entre store em
arquivo ou em memória (`:memory:`) e simplifica a evolução independente das camadas sem dependência de serviços externos de banco.

### IV. Test-First
Lógica nova MUST nascer com teste (`*.test.ts` co-locado ou em `__tests__/`), executado via
`node --import tsx --test`. `npm run typecheck` e `npm test` MUST estar verdes antes de
qualquer commit. **Racional**: testes escritos junto com a lógica previnem regressões e
documentam o comportamento esperado.

### V. Funções Puras e Efeitos Isolados
Preferir funções puras e sem efeitos colaterais na camada de serviço; efeitos (I/O, chamadas
de rede, banco de dados) MUST ficar isolados em adaptadores e stores. Erros de domínio usam classes
próprias (`AppError`, `NotFoundError`, etc.) e são traduzidos para HTTP apenas no middleware
de erro do Express, na borda. **Racional**: lógica pura é mais fácil de testar e raciocinar;
isolar efeitos limita o raio de impacto de mudanças externas.

### VI. Gestão de Secrets (NON-NEGOTIABLE)
`.env` MUST NUNCA ser commitado. Variáveis sensíveis MUST NUNCA ser lidas ou impressas
diretamente no terminal. Uso de variáveis de ambiente MUST passar por `--env-file=.env`
(mecanismo nativo do Node 22). `git push` exige aprovação manual — não está na allow list
do agente. **Racional**: vazamento de credenciais é um risco crítico e irreversível; a
disciplina de nunca expor secrets no terminal ou em commits é inegociável.

## Stack & Padrões Técnicos

- **Runtime**: Node.js 22 LTS.
- **Agente**: LangChain / LangGraph sobre OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`).
- **HTTP**: Express.
- **Banco / Persistência**: SQLite nativo via `node:sqlite` (`DatabaseSync`) com persistência em arquivo (`OPSPILOT_DB`, padrão `./data/opspilot.db`) ou `:memory:` em testes e benchmarks.
- **Validação**: Zod em toda fronteira HTTP/CLI e schemas de ferramentas (tools).
- **Testes**: `node:test` executado via `tsx`.
- Comandos padrão: `npm run dev`, `npm run arena`, `npm run bench`, `npm test`,
  `npm run typecheck`, `npm run seed`.

## Fluxo de Desenvolvimento (Spec Kit)

1. **Spec** — escrever `specs/<feature>/spec.md` versionado antes de codar.
2. **Tipos** — definir interfaces/schemas Zod no modelo ou store.
3. **Serviço/Store** — implementar lógica pura e adaptadores com testes.
4. **Controller / Tools** — conectar Express / ferramentas do agente + validação Zod de entrada.
5. **Review** — `typecheck` + `test` verdes → commit com mensagem convencional.

Specs MUST ser versionadas em `specs/` e referenciadas nos PRs.

## Governance

Esta constituição prevalece sobre qualquer outra prática ou convenção documentada em
`.github/copilot-instructions.md` ou em qualquer outro guia do repositório; em caso de
conflito, a constituição vence e o outro documento MUST ser atualizado para refletir a
mudança.

Emendas exigem: (1) registro da mudança proposta e racional, (2) atualização deste arquivo
com bump de versão conforme semver — MAJOR para remoção/redefinição incompatível de
princípio, MINOR para novo princípio ou seção, PATCH para clarificações e correções de
texto —, e (3) revisão de templates dependentes (`plan-template.md`, `spec-template.md`,
`tasks-template.md`) para consistência.

Todo PR/review MUST verificar conformidade com os princípios acima. Complexidade adicional
(camadas extras, dependências novas, exceções às regras de teste) MUST ser justificada
explicitamente na descrição do PR.

**Version**: 1.2.0 | **Ratified**: 2026-08-28 | **Last Amended**: 2026-09-02
