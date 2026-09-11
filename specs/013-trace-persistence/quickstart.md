# Quickstart & Verification Guide: Persistência de Trace e Logs Estruturados em JSON

**Feature**: `013-trace-persistence`  
**Date**: 2026-09-10  
**Status**: Completed  

---

## 1. Visão Geral

Este guia descreve os cenários executáveis para validar a persistência relacional de requisições e eventos de trace em SQLite, a propagação de `requestId` no endpoint `POST /chat`, a consulta diagnóstica em `GET /requests/:id` e a formatação de logs JSON em linha única no `src/obs/logger.ts`.

---

## 2. Cenários de Teste e Validação

### Cenário 1: Rastreabilidade no `POST /chat` com `X-Request-Id`
Valida que o servidor adota o ID enviado ou gera um UUID v4, retornando tanto no header HTTP quanto no corpo JSON.

1. **Requisição com header customizado**:
   ```bash
   curl -i -X POST http://localhost:3000/chat \
     -H "Content-Type: application/json" \
     -H "X-Request-Id: req-custom-001" \
     -d '{"message": "Qual é o status do auth-service?"}'
   ```
   **Resultado Esperado**:
   - Header de resposta: `X-Request-Id: req-custom-001`
   - Corpo JSON: `{ "requestId": "req-custom-001", "answer": "...", ... }`

2. **Requisição sem header (geração automática)**:
   ```bash
   curl -i -X POST http://localhost:3000/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Listar serviços"}'
   ```
   **Resultado Esperado**:
   - Header de resposta: `X-Request-Id: <uuid-v4>`
   - Corpo JSON: `{ "requestId": "<uuid-v4>", ... }`

---

### Cenário 2: Consulta de Requisição e Trace via `GET /requests/:id`

1. **Consulta de requisição existente**:
   ```bash
   curl -i -X GET http://localhost:3000/requests/req-custom-001
   ```
   **Resultado Esperado**:
   - Código HTTP: `200 OK`
   - Corpo JSON com `request` (métricas, timestamps, status) e `trace` (lista ordenada com `seq`, `kind`, `node`, `content`, `timestampMs`).

2. **Consulta de requisição inexistente**:
   ```bash
   curl -i -X GET http://localhost:3000/requests/id-nao-existente
   ```
   **Resultado Esperado**:
   - Código HTTP: `404 Not Found`
   - Corpo JSON: `{ "error": "Request not found", "requestId": "id-nao-existente" }`

---

### Cenário 3: Validação de Logs JSON em Linha Única

1. Executar o servidor ou suíte de teste observando `stdout`:
   ```bash
   npm run dev
   ```
2. Ao disparar uma requisição, cada evento registrado deve imprimir exatamente 1 linha:
   ```json
   {"timestamp":"2026-09-10T22:35:10.000Z","level":"info","requestId":"req-custom-001","event":"trace_event","seq":1,"kind":"thought","node":"roteador"}
   {"timestamp":"2026-09-10T22:35:10.200Z","level":"info","requestId":"req-custom-001","event":"request_completed","durationMs":850,"model":"openai/gpt-4o-mini"}
   ```
   **Critério de Sucesso**: Toda linha pode ser analisada por `JSON.parse()` sem falhas e não há texto livre misturado.

---

## 3. Testes Automatizados

Executar a suíte de testes com cobertura da nova store e rotas HTTP:

```bash
# Executar todos os testes do projeto
npm test

# Executar checagem estrita de tipos
npm run typecheck
```
