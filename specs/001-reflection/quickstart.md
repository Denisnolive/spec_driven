# Quickstart: Validar a Camada Reflection

Pré-requisitos: dependências instaladas (`npm install`), `.env` com
`OPENROUTER_API_KEY`/`OPENROUTER_MODEL` válidos apenas para os cenários que
tocam rede real (passos 3–4). Os testes unitários (passo 1) não fazem I/O.

## 1. Testes unitários (determinísticos, sem rede)

```bash
npm test
```

Deve incluir (após a implementação) `src/agents/reflection.test.ts`, cobrindo
os cenários de aceitação da spec — ver `contracts/reflection-api.md` para as
garantias exatas verificadas:

- aprovação direta → 1 execução da base + 1 crítica, sem regeneração (US1).
- reprovação na 1ª tentativa + aprovação na 2ª → 2 execuções da base + 2
  críticas, trace/métricas somados (US2).
- crítico sempre reprova com `maxReflections: 2` → loop para exatamente após 2
  críticas, sem exceção (US3).
- `maxReflections` omitido → default 2 (US3 Acceptance Scenario 2).
- nome preservado: `reflect:<nome-base>` (edge case da spec).

## 2. Checagem de tipos

```bash
npm run typecheck
```

Deve passar com zero erros (SC-002) — `strict: true` cobre `reflection.ts`.

## 3. Execução manual via Arena — estratégia única

```bash
npm run arena -- -s reflect:react -i "Liste todos os alertas ativos (firing) e abra um incidente para o mais crítico."
```

**Resultado esperado**: trace impresso no terminal contendo eventos
`CRITIQUE` em azul (mesma paleta de `KIND_COLORS` já existente em
`src/arena.ts`), resposta final e métricas (`llmCalls`, `latencyMs`) somando
base + crítico(s) (SC-003).

## 4. Execução manual via Arena — comparativo

```bash
npm run arena -- -s react,reflect:react
```

**Resultado esperado**: tabela comparativa final com `react` e `reflect:react`
lado a lado — permite observar o custo adicional (mais `llmCalls`/`latencyMs`)
da camada de reflexão em troca de potencial correção de qualidade (US4).

## 5. Repetir para plan-and-execute

```bash
npm run arena -- -s plan-and-execute,reflect:plan-and-execute
```
