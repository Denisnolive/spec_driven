# Contract: HTTP `POST /chat`

Este documento define o contrato da API HTTP exposta pelo servidor Express para o endpoint `/chat`.

## Endpoint HTTP

- **Método**: `POST`
- **Rota**: `/chat`
- **Content-Type**: `application/json`

---

## Requisição

### Body (`application/json`)

```typescript
export interface ChatRequestBody {
  message: string;
  strategy?: string; // Padrão: 'react'
  reflect?: boolean;  // Padrão: false
}
```

### Exemplo de Requisição
```json
{
  "message": "Listar todos os alertas com status firing",
  "strategy": "react",
  "reflect": true
}
```

---

## Respostas

### 200 OK — Sucesso
Retornado quando a estratégia conclui o processamento com êxito.

```typescript
export interface ChatSuccessResponse {
  answer: string;
  trace: Array<{
    kind: 'thought' | 'action' | 'observation' | 'plan' | 'critique' | 'answer';
    content: string | { tool: string; args: Record<string, unknown> };
    timestampMs: number;
  }>;
  metrics: {
    llmCalls: number;
    latencyMs: number;
  };
}
```

**Exemplo:**
```json
{
  "answer": "Identificados 2 alertas ativos no cluster.",
  "trace": [
    {
      "kind": "thought",
      "content": "Vou consultar os alertas firing...",
      "timestampMs": 1725234567890
    },
    {
      "kind": "action",
      "content": {
        "tool": "list_alerts",
        "args": { "status": "firing" }
      },
      "timestampMs": 1725234567950
    },
    {
      "kind": "observation",
      "content": "[{\"id\":\"alert-1\",\"title\":\"High CPU\"}]",
      "timestampMs": 1725234568100
    },
    {
      "kind": "answer",
      "content": "Identificados 2 alertas ativos no cluster.",
      "timestampMs": 1725234568200
    }
  ],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 310
  }
}
```

---

### 400 Bad Request — Corpo Inválido (Zod)
Retornado quando o payload não atende às regras do schema de validação.

```json
{
  "error": "Invalid request body",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["message"],
      "message": "Required"
    }
  ]
}
```

---

### 422 Unprocessable Entity — Estratégia Desconhecida
Retornado quando a estratégia solicitada no campo `strategy` não está registrada.

```json
{
  "error": "Unknown strategy: custom-agent",
  "availableStrategies": [
    "react",
    "plan-and-execute"
  ]
}
```

---

### 504 Gateway Timeout — Limite de Tempo Excedido
Retornado quando a execução do agente ultrapassa o tempo limite configurado (padrão: 180 segundos).

```json
{
  "error": "Request timed out"
}
```

---

### 500 Internal Server Error — Erro Interno
Retornado em caso de exceções não tratadas durante o ciclo de execução.

```json
{
  "error": "Internal server error"
}
```
