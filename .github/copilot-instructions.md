# OpsPilot — Copilot Instructions

OpsPilot é um copiloto de plantão que gerencia alertas e incidentes de produção.
O núcleo é um agente LangChain/LangGraph que roda sobre OpenRouter.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 LTS |
| Linguagem | TypeScript ESM (`"type": "module"`, `strict: true`) |
| Agente | LangChain / LangGraph / OpenRouter |
| Validação | Zod — toda fronteira HTTP/CLI |
| HTTP | Express |
| Banco | MySQL via Sequelize (mysql2) |
| Testes | `node:test` executado via `tsx` |

---

## Comandos

```bash
npm run dev        # tsx src/index.ts
npm run arena      # tsx src/arena.ts
npm run bench      # tsx src/bench.ts
npm test           # node --import tsx --test "src/**/*.test.ts"
npm run typecheck  # tsc --noEmit
```

---

## Convenções

- **Camadas:** MVC — `model/`, `service/`, `controller/`.
- **Validação:** toda entrada externa passa por um schema Zod antes de entrar na camada de serviço.
- **Erros de domínio:** classes próprias (`AppError`, `NotFoundError`, …) traduzidas para HTTP na borda (middleware de erro do Express).
- **Testes:** lógica nova nasce com teste (`*.test.ts` co-locado ou em `__tests__/`).
- **Funções puras:** preferir funções puras e sem efeitos colaterais; efeitos ficam nos adaptadores.
- **Qualidade:** `npm run typecheck` e `npm test` sempre verdes antes de qualquer commit.
- **Secrets:** nunca commitar `.env`; nunca ler variáveis sensíveis no terminal; usar `--env-file=.env` (Node nativo).

---

## Fluxo de desenvolvimento (Spec Kit)

1. **Spec** — escrever `docs/specs/<feature>.md` versionado antes de codar.
2. **Tipos** — definir interfaces/schemas Zod no modelo.
3. **Serviço** — implementar lógica pura com testes.
4. **Controller** — conectar Express + validação Zod de entrada.
5. **Review** — `typecheck` + `test` verdes → commit com mensagem convencional.

Specs devem ser versionadas em `docs/specs/` e referenciadas nos PRs.
