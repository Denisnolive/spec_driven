# Quickstart: War Room Web OpsPilot

**Feature**: `014-war-room-web`  
**Date**: 2026-09-11

---

## 1. Pré-requisitos

- Node.js 22 LTS instalado.
- Servidor backend do OpsPilot executando em `http://localhost:3000`.

---

## 2. Inicialização e Execução da War Room Web

### Passo 1: Instalar dependências da aplicação web
```bash
cd web
npm install
```

### Passo 2: Iniciar o servidor de desenvolvimento Vite
```bash
npm run dev
```

A aplicação estará disponível em:
**`http://localhost:5173/opspilot/`**

---

## 3. Comandos Úteis do Frontend

```bash
# Validar tipagem TypeScript
npm run typecheck

# Gerar build de produção otimizado
npm run build

# Pré-visualizar o build de produção localmente
npm run preview
```

---

## 4. Testes de Integração Backend + Frontend

1. **Verificação de CORS no Backend**:
   ```bash
   curl -i -X OPTIONS http://localhost:3000/chat \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type, X-Request-Id"
   ```
   Deve responder HTTP 204 com os cabeçalhos `Access-Control-Allow-Origin: *` e `Access-Control-Expose-Headers: X-Request-Id`.

2. **Envio de Mensagem de Teste na War Room**:
   - Acesse `http://localhost:5173/opspilot/`.
   - Digite: *"Existe algum alerta ativo agora?"*.
   - Clique em *"Ver raciocínio"* na resposta do assistente para abrir a gaveta de trace.
   - Pressione `Escape` para fechar a gaveta.
   - Clique na engrenagem no cabeçalho para validar a URL configurada (`http://localhost:3000`).
