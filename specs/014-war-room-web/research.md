# Research: War Room Web OpsPilot (Vite + React + TS)

**Feature**: `014-war-room-web`  
**Date**: 2026-09-11

---

## 1. Arquitetura Frontend: Por que Vite + React + Vanilla CSS?

### Decisão
Utilizar **Vite** com template **React** e **TypeScript**, sem frameworks utilitários externos (como TailwindCSS), utilizando **Vanilla CSS** com tokens em variáveis CSS nativas (`var(--...)`).

### Justificativa
1. **Atendimento estrito às diretrizes de design**: O documento `.github/instructions/designn.instrucions.md` prescreve um design system semântico próprio baseado em escala de 4px/8px e tokens CSS customizados. O Vanilla CSS garante controle total sobre o cascade, temas light/dark via data attributes (`[data-theme="dark"]`) e suporte a `prefers-reduced-motion` sem sobrecarga de bundlers ou classes utilitárias não semânticas.
2. **Performance e Leveza**: O Vite inicializa em milissegundos via ESM nativo em ambiente de desenvolvimento, permitindo iteração ágil para o operador de plantão.
3. **Subcaminho `/opspilot/`**: O Vite suporta de forma nativa a opção `base: '/opspilot/'` no `vite.config.ts`, permitindo que toda a rota e os assets estáticos sejam carregados com precisão tanto atrás de um reverse proxy quanto em subdomínio ou porta dedicada.

---

## 2. Decisão Técnica: CORS no Backend Express

### Contexto
O servidor Express roda habitualmente em `http://localhost:3000`, enquanto o Vite dev server roda em `http://localhost:5173`. Requisições do navegador disparam verificações de segurança CORS com requisições de preflight (`OPTIONS`) e validação de headers customizados (`X-Request-Id`).

### Decisão
Implementar um middleware de CORS nativo no Express dentro de `src/http/server.ts`:
```ts
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
```

### Vantagens
- Zero dependências adicionais no `package.json` do backend.
- Suporta todas as origens locais e de rede da War Room.
- Expõe explicitamente o header `X-Request-Id` para leitura no cliente JavaScript via `response.headers.get('x-request-id')`.
- Responde `204 No Content` para `OPTIONS` imediatamente sem passar pelas rotas do agente.

---

## 3. Decisão Técnica: Tratamento do Status HTTP 202 (Cartão de Aprovação)

### Contexto
No protocolo operacional da War Room, operações sensíveis (como mitigação destrutiva, restart de pods críticos, alteração de regras de roteamento) podem responder com HTTP 202 (Accepted) ou retornar payload solicitando aprovação humana (*Human-in-the-Loop*).

### Decisão
- Quando o fetch do `/chat` receber resposta HTTP 202 (ou JSON com `status: "awaiting_approval"` ou `requiresApproval: true`), o frontend intercepta e cria um `ChatMessage` especial com tipo `approval_request`.
- O componente `ApprovalCard` é renderizado no feed de mensagens, apresentando:
  - Título e severidade da ação solicitada.
  - Resumo dos parâmetros (ex: serviço alvo, justificativa).
  - Dois botões de ação com foco acessível: *"Aprovar"* e *"Negar"*.
- Ao clicar em *"Aprovar"*, o chat envia automaticamente uma mensagem ou chamada de confirmação (ex: `POST /chat` com `message: "CONFIRMAR ACAO <id>"` ou rota correspondente) e atualiza o estado visual do cartão para *"Aprovado pelo operador"*.
- Ao clicar em *"Negar"*, o cartão é atualizado para *"Ação rejeitada pelo operador"* e o fluxo é cancelado com segurança.

---

## 4. Decisão Técnica: Inspeção do Trace Tipado ("Ver Raciocínio")

### Contexto
O endpoint `/chat` retorna a lista de `trace: StrategyResult['trace']`, e o endpoint `GET /requests/:id` retorna `{ request, trace: TraceEventRecord[] }`.

### Decisão
- Toda mensagem originada do assistente inclui uma barra de rodapé com métricas (latência em ms, tokens totais) e o botão interativo *"Ver raciocínio"*.
- O clique abre o componente `TraceDrawer`:
  - Utiliza `<aside role="dialog" aria-modal="true" aria-label="Raciocínio e Trace da Requisição">`.
  - Captura foco inicial e responde à tecla `Escape`.
  - Exibe cada nó do grafo (ex: `router`, `tools`, `model`, `reflect`) em uma linha do tempo vertical com badge de status, timestamp relativo e payload JSON colapsável com realce visual.
  - Permite copiar o JSON completo do trace para a área de transferência.

---

## 5. Decisão Técnica: Configuração de URL via Engrenagem

### Decisão
- No cabeçalho da aplicação (`Header.tsx`), há um botão com ícone de engrenagem e `aria-label="Configurações da War Room"`.
- O clique abre o `SettingsModal` com:
  - Campo de texto para a URL da API (padrão: `http://localhost:3000`).
  - Botão *"Testar Conexão"* (executa `GET /stats` para checar conectividade).
  - Indicador de status (Online / Offline / Erro).
  - Persistência imediata no `localStorage` sob a chave `opspilot_api_url`.
