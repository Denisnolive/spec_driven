# Quickstart: Grafo Unificado de Produção (Production Graph)

**Feature Branch**: `011-production-graph`  
**Date**: 2026-09-09  

---

## 1. Executando os Testes do Grafo Unificado

Para rodar os testes unitários do `ProductionGraph`:

```powershell
node --env-file=.env --import tsx --test src/agents/production-graph.test.ts
```

Para rodar os testes de integração do servidor HTTP (`/chat`):

```powershell
node --env-file=.env --import tsx --test src/http/server.test.ts
```

Para validar a integridade estrita de tipos TypeScript:

```powershell
npm run typecheck
```

Para rodar toda a suíte de testes do repositório:

```powershell
npm test
```

---

## 2. Testando o Roteamento Autônomo via HTTP

Inicie o servidor em modo de desenvolvimento (se não estiver rodando):

```powershell
npm run dev
```

### Exemplo 1: Requisição sem `strategy` (Roteamento Automático pelo Grafo)

```powershell
$resp = Invoke-RestMethod -Uri "http://localhost:3000/chat" -Method POST -ContentType "application/json" -Body '{"message":"Qual o status atual do serviço auth?"}'
$resp.trace | Where-Object { $_.kind -eq "route" }
```

**Saída esperada no trace**:
- Um evento com `kind: "route"`
- Campo `node: "roteador"`
- Mensagem indicando seleção da estratégia (ex: `react`) e a justificativa técnica.

### Exemplo 2: Requisição com `strategy` como Override Manual

```powershell
$body = @{
    message = "Analise criticamente o histórico de alertas recentes"
    strategy = "reflection"
} | ConvertTo-Json

$resp = Invoke-RestMethod -Uri "http://localhost:3000/chat" -Method POST -ContentType "application/json" -Body $body
$resp.trace | Select-Object kind, node, content
```

**Saída esperada**:
- Evento `route` registrando override manual:
  ```json
  {
    "kind": "route",
    "node": "roteador",
    "content": "Roteamento (override manual): reflection - Parâmetro 'strategy' fornecido na requisição"
  }
  ```
- Todos os eventos subsequentes contêm `node: "reflection"`.

---

## 3. Verificando o Campo `node` em Todo o Trace

Para inspecionar que todos os eventos trazem a identificação do nó emissor:

```powershell
$resp.trace | Group-Object node | Select-Object Name, Count
```

Exemplo de agrupamento esperado:
```text
Name              Count
----              -----
roteador              1
react                 3
resposta              1
```
