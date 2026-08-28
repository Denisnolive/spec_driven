<!--
Sync Impact Report
- Version change: TEMPLATE → 1.0.0
- Modified principles: N/A (initial ratification)
- Added sections: Core Principles (I–VI), Stack & Padrões Técnicos, Fluxo de Desenvolvimento (Spec Kit), Governance
- Removed sections: none
- Templates requiring updates: .specify/templates/plan-template.md (⚠ pending manual check),
  .specify/templates/spec-template.md (⚠ pending manual check),
  .specify/templates/tasks-template.md (⚠ pending manual check)
- Follow-up TODOs: TODO(RATIFICATION_DATE) — data de adoção original desconhecida
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
schema Zod antes de entrar na camada de serviço. Nenhuma lógica de negócio confia em dados
não validados. **Racional**: centralizar validação na borda evita repetição de checagens e
torna os contratos de dados explícitos e testáveis.

### III. Arquitetura em Camadas (MVC)
O código MUST seguir a separação `model/`, `service/`, `controller/`. Controllers apenas
conectam Express + validação Zod de entrada e delegam para services; services concentram
lógica de negócio; models definem tipos/schemas e acesso a dados. **Racional**: separação
clara de responsabilidades facilita testes isolados e evolução independente das camadas.

### IV. Test-First
Lógica nova MUST nascer com teste (`*.test.ts` co-locado ou em `__tests__/`), executado via
`node --import tsx --test`. `npm run typecheck` e `npm test` MUST estar verdes antes de
qualquer commit. **Racional**: testes escritos junto com a lógica previnem regressões e
documentam o comportamento esperado.

### V. Funções Puras e Efeitos Isolados
Preferir funções puras e sem efeitos colaterais na camada de serviço; efeitos (I/O, chamadas
de rede, banco de dados) MUST ficar isolados em adaptadores. Erros de domínio usam classes
próprias (`AppError`, `NotFoundError`, etc.) e são traduzidos para HTTP apenas no middleware
de erro do Express, na borda. **Racional**: lógica pura é mais fácil de testar e raciocinar;
isolar efeitos limita o raio de impacto de mudanças externas.

### VI. Gestão de Secrets (NON-NEGOTIABLE)
`.env` MUST NUNCA ser commitado. Variáveis sensíveis MUST NUNCA ser lidas ou impressas
diretamente no terminal. Uso de variáveis de ambiente MUST passar por `--env-file=.env`
(mecanismo nativo do Node). **Racional**: vazamento de credenciais é um risco crítico e
irreversível; a disciplina de nunca expor secrets no terminal ou em commits é inegociável.

## Stack & Padrões Técnicos

- **Runtime**: Node.js 22 LTS.
- **Agente**: LangChain / LangGraph sobre OpenRouter.
- **HTTP**: Express.
- **Banco**: MySQL via Sequelize (`mysql2`).
- **Validação**: Zod em toda fronteira HTTP/CLI.
- **Testes**: `node:test` executado via `tsx`.
- Comandos padrão: `npm run dev`, `npm run arena`, `npm run bench`, `npm test`,
  `npm run typecheck`.

## Fluxo de Desenvolvimento (Spec Kit)

1. **Spec** — escrever `docs/specs/<feature>.md` versionado antes de codar.
2. **Tipos** — definir interfaces/schemas Zod no modelo.
3. **Serviço** — implementar lógica pura com testes.
4. **Controller** — conectar Express + validação Zod de entrada.
5. **Review** — `typecheck` + `test` verdes → commit com mensagem convencional.

Specs MUST ser versionadas em `docs/specs/` e referenciadas nos PRs.

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

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): data de adoção original não
registrada nos artefatos existentes do projeto | **Last Amended**: 2026-08-28
