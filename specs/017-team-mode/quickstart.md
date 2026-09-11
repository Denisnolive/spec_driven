# Quickstart: Modo Equipe Supervisionada (Team Mode)

Guia rápido para desenvolvimento, execução de testes e validação da feature **017-team-mode**.

---

## 1. Executando os Testes Automatizados

Para executar os testes do modo equipe:

```bash
# Executa testes unitários da equipe
node --import tsx --test src/team/*.test.ts

# Executa testes do grafo de produção com a rota team
node --import tsx --test src/graph/production-graph.test.ts

# Validação estrita de tipos
npm run typecheck
```

---

## 2. Testando Manualmente via API HTTP (`POST /chat`)

### 2.1 Requisição com Override Explícito para a Rota Team

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "O serviço checkout está apresentando alta latência e erros 500. Investigue os alertas e runbooks, trace um plano de mitigação e abra um incidente se necessário.",
    "strategy": "team"
  }'
```

### 2.2 Verificando o Trace de Raciocínio com Handoffs

```bash
# Consultar o trace gerado pela requisição
curl http://localhost:3000/trace/REQUEST_ID
```

Na resposta, filtre os eventos com `kind: "handoff"`:
```json
{
  "node": "supervisor",
  "kind": "handoff",
  "from": "supervisor",
  "to": "analyst",
  "brief": "Inspecione alertas e o status de checkout",
  "iteration": 1
}
```

---

## 3. Testando na Interface Web (War Room)

1. Inicie a API e a interface Web:
   ```bash
   npm run dev
   ```
2. Acesse a aplicação no navegador em `http://localhost:5173`.
3. Envie um chamado operacional solicitando triagem e intervenção de equipe (ex: `"Equipe: investigue e mitigue a falha no gateway"`).
4. Ao receber a resposta, clique no botão **"Ver Raciocínio"**.
5. Observe na timeline os blocos destacados com o badge `HANDOFF`, as setas indicativas de transferência de bastão (ex: `SUPERVISOR ➔ ANALYST`) e as instruções emitidas.
