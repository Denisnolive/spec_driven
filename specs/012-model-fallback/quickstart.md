# Quickstart: Resiliência de Modelo com Fallback e Retries

**Feature**: `012-model-fallback`  
**Date**: 2026-09-10  

---

## 1. Configuração do Ambiente

Certifique-se de que o arquivo `.env` contenha as variáveis do modelo primário e de contingência:

```dotenv
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/free
OPENROUTER_MODEL_FALLBACK=meta-llama/llama-3-8b-instruct:free
```

---

## 2. Executando os Testes Automatizados

Para executar os testes unitários e de integração de resiliência:

```powershell
# Executar a nova suíte de testes de resiliência de modelos
node --env-file=.env --import tsx --test src/agents/model.test.ts

# Executar os testes de integração do servidor HTTP cobrindo o fallback e 503
node --env-file=.env --import tsx --test src/http/server.test.ts

# Executar a suíte completa de testes do OpsPilot
npm test

# Checar conformidade estrita de tipagem TypeScript
npm run typecheck
```

---

## 3. Teste Manual com Simulação de Falha

### Cenário A: Operação Normal (Primário Responde)
Faça uma requisição normal:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/chat -Method Post -ContentType "application/json" -Body '{"message": "Qual o status do auth?"}'
```
- **Resultado Esperado**:
  - Resposta HTTP 200.
  - `metrics.modelUsed` é igual a `openrouter/free`.
  - Trace **não** contém evento `fallback`.

### Cenário B: Failover para Reserva (Primário Falha)
Configure temporariamente `OPENROUTER_MODEL=modelo-invalido` ou injete mock com falha no primário:
- **Resultado Esperado**:
  - Resposta HTTP 200.
  - Trace contém evento com `kind: "fallback"`, identificando a transição do primário para o reserva.
  - `metrics.modelUsed` é igual ao modelo reserva configurado em `OPENROUTER_MODEL_FALLBACK`.

### Cenário C: Exaustão Total (Primário e Reserva Falham)
Com ambos os modelos inacessíveis:
- **Resultado Esperado**:
  - Resposta HTTP **503 Service Unavailable**.
  - Payload JSON com mensagem amigável informando a indisponibilidade dos provedores de modelo.
