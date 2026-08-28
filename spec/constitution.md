# Constitution - OpsPilot

Princípios não-negociáveis que toda spec, plano, tarefa e código seguem.

1. **Camadas explícitas.** Dependências fluem `http/cli → controller → service → model → store`. Domínio não faz IO.
2. **Validação na fronteira.** Toda entrada externa é validada com Zod antes de virar domínio. Saídas expostas também são tipadas com Zod.
3. **Erros são de domínio.** Falhas previsíveis viram classes de erro (`AppError`, `NotFoundError`, …), traduzidas em status HTTP na borda (middleware Express).
4. **Funções puras.** Lógica de negócio é implementada com funções puras e sem efeitos colaterais; efeitos colaterais ficam nos adaptadores.
5. **Teste é parte da tarefa.** Nenhuma lógica nova entra sem teste. `npm run typecheck` e `npm test` sempre verdes antes de qualquer commit.
6. **Segurança por padrão.** Sem segredos no repo. Variáveis de ambiente via `--env-file=.env` (Node nativo). Ações destrutivas passam por guardrails (deny list + aprovação manual).
7. **Spec antes de código.** Mudanças relevantes passam por `spec → plan → task → implement`, com revisão humana entre as fases. Specs versionadas em `docs/specs/`.
8. **Pequeno e reversível.** Cada tarefa cabe em um commit com mensagem convencional.

## Stack obrigatória

Node.js 22 LTS, TypeScript ESM (`"type": "module"`, `strict: true`), Zod, Express, Sequelize + mysql2, LangChain / LangGraph / OpenRouter, `node:test` via `tsx`.

## Comandos canônicos

```bash
npm run dev        # tsx src/index.ts
npm run arena      # tsx src/arena.ts
npm run bench      # tsx src/bench.ts
npm test           # node --import tsx --test "src/**/*.test.ts"
npm run typecheck  # tsc --noEmit
```
